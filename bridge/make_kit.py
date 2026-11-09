"""Builds bridge/dist/robotcell-bridge-kit.zip, a folder to copy to the lab PC.

The kit holds the bridge, the fake PLC, the demo timeline, the numbered .bat
test scripts, AI-CONTEXT.md and (by default) the Windows embeddable Python,
so nothing has to be installed on the lab PC.

  python3 bridge/make_kit.py                    broker host from .env.local
  python3 bridge/make_kit.py --mqtt-host <h>    explicit broker host
  python3 bridge/make_kit.py --no-python        without the portable Python

The broker host and the optional user name go into config.bat. The password
never does. bridge/dist/ is ignored by git: the kit contains the broker host.
"""

from __future__ import annotations

import argparse
import io
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DIST = HERE / "dist"
KIT_NAME = "robotcell-bridge-kit"
DEFAULT_PYTHON = "3.13.14"


def host_from_env_local() -> str | None:
    env = ROOT / ".env.local"
    if not env.is_file():
        return None
    m = re.search(r"^VITE_MQTT_URL=\w+://([^:/\s]+)", env.read_text(encoding="utf-8"), re.M)
    return m.group(1) if m else None


def crlf(text: str) -> bytes:
    return text.replace("\r\n", "\n").replace("\n", "\r\n").encode("utf-8")


def config_bat(args: argparse.Namespace) -> str:
    return f"""@echo off
rem Kit settings. Edit with Notepad. The password is asked for at runtime, never stored.
set "MQTT_HOST={args.mqtt_host}"
set "MQTT_PORT=8883"
set "MQTT_USERNAME={args.mqtt_username}"
set "TOPIC_PREFIX=robotcell"
rem Only accept packets from the PLC.
set "PLC_IP={args.plc_ip}"
rem 1 = send 1 byte to the PLC every 5 s so the Windows firewall lets its packets in (no admin needed).
set "PUNCH=1"
rem CA certificate file (.pem) only if the broker certificate is not trusted; leave empty otherwise.
set "MQTT_CA_FILE="
"""


def python_zip(version: str) -> bytes:
    cache = DIST / ".cache" / f"python-{version}-embed-amd64.zip"
    if not cache.is_file():
        url = f"https://www.python.org/ftp/python/{version}/python-{version}-embed-amd64.zip"
        print(f"Downloading {url}")
        cache.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=60) as r:
            cache.write_bytes(r.read())
    data = cache.read_bytes()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        if z.testzip() is not None or "python.exe" not in z.namelist():
            cache.unlink()
            raise SystemExit("Downloaded Python archive is damaged; run again.")
    return data


def main() -> None:
    p = argparse.ArgumentParser(description="Build the bridge kit zip for the lab PC.")
    p.add_argument("--mqtt-host", default=host_from_env_local(), help="broker host (default: from .env.local)")
    p.add_argument("--mqtt-username", default="", help="broker user to prefill (optional)")
    p.add_argument("--plc-ip", default="192.168.0.70", help="PLC address (default 192.168.0.70)")
    p.add_argument("--python-version", default=DEFAULT_PYTHON, help=f"embeddable Python version (default {DEFAULT_PYTHON})")
    p.add_argument("--no-python", action="store_true", help="do not include the portable Python")
    args = p.parse_args()
    if not args.mqtt_host:
        sys.exit("No broker host: set VITE_MQTT_URL in .env.local or pass --mqtt-host.")

    DIST.mkdir(exist_ok=True)
    out = DIST / f"{KIT_NAME}.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        put = lambda name, data: z.writestr(f"{KIT_NAME}/{name}", data)
        put("bridge.py", (HERE / "bridge.py").read_bytes())
        put("fake_plc.py", (HERE / "fake_plc.py").read_bytes())
        put("timeline.json", (ROOT / "src" / "sim" / "timeline.json").read_bytes())
        for f in sorted((HERE / "kit").iterdir()):
            text = f.read_text(encoding="utf-8")
            put(f.name, crlf(text) if f.suffix in (".bat", ".txt") else text.encode("utf-8"))
        put("config.bat", crlf(config_bat(args)))
        if not args.no_python:
            with zipfile.ZipFile(io.BytesIO(python_zip(args.python_version))) as py:
                for info in py.infolist():
                    put(f"python/{info.filename}", py.read(info))
    print(f"Kit: {out} ({out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
