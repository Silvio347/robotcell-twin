"""Fake PLC: sends the demo run (src/sim/timeline.json) as TwinSender packets.

Tests the whole bridge -> broker -> website path without the real PLC:

  python fake_plc.py                      send to 127.0.0.1:5005 forever
  python fake_plc.py --host 192.168.0.5   send to another PC

Standard library only. The packet layout matches TwinSender.st
(docs/publishing-plan/02-plc-udp-sender.md).
"""

from __future__ import annotations

import argparse
import json
import socket
import time
from pathlib import Path

CHANNELS = 12


def find_timeline(explicit: str | None) -> Path:
    here = Path(__file__).resolve().parent
    for p in ([Path(explicit)] if explicit else []) + [here / "timeline.json", here.parent / "src" / "sim" / "timeline.json"]:
        if p.is_file():
            return p
    raise SystemExit("timeline.json not found (use --timeline)")


def state_at(events: list[dict], ms: float) -> tuple[list[bool], list[bool], int, bool, int]:
    """Same rules as src/sim/timeline.ts."""
    di, do = [False] * CHANNELS, [False] * CHANNELS
    di[11] = True  # E-stop input TRUE = safe
    step, running, count_ups = 0, False, 0
    for e in events:
        if e["t"] * 1000 > ms:
            break
        for name, value in e.get("set", {}).items():
            if name == "DI12":
                continue
            ch = int(name[2:]) - 1
            (di if name.startswith("DI") else do)[ch] = bool(value)
        step = e.get("step", step)
        running = e.get("running", running)
        count_ups += 1 if e.get("countUp") else 0
    return di, do, step, running, count_ups


def main() -> None:
    p = argparse.ArgumentParser(description="Send the demo run as PLC UDP packets.")
    p.add_argument("--host", default="127.0.0.1", help="bridge address (default 127.0.0.1)")
    p.add_argument("--port", type=int, default=5005, help="bridge UDP port (default 5005)")
    p.add_argument("--timeline", help="path to timeline.json")
    args = p.parse_args()

    timeline = json.loads(find_timeline(args.timeline).read_text(encoding="utf-8"))
    run_ms = timeline["durationS"] * 1000
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    start, seq = time.monotonic(), 0
    print(f"Sending the demo run to {args.host}:{args.port} every 200 ms. Ctrl+C to stop.")
    try:
        while True:
            elapsed = (time.monotonic() - start) * 1000
            run = int(elapsed // run_ms)
            di, do, step, running, count_ups = state_at(timeline["events"], elapsed % run_ms)
            seq = (seq + 1) % 256
            packet = bytes(int(b) for b in di + do) + bytes([step, (run + count_ups) % 256, int(running), seq])
            sock.sendto(packet, (args.host, args.port))
            time.sleep(0.2)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
