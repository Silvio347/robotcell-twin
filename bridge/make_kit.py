"""Builds bridge/dist/robotcell-bridge-kit.zip, a folder to copy to the lab PC.

The kit holds the bridge, the fake PLC, the demo timeline, the numbered .bat
test scripts, AI-CONTEXT.md and (by default) the Windows embeddable Python,
so nothing has to be installed on the lab PC.

  python3 bridge/make_kit.py                    settings from .env.local
  python3 bridge/make_kit.py --mqtt-host <h>    explicit broker host
  python3 bridge/make_kit.py --no-python        without the portable Python

Settings read from .env.local (ignored by git), all optional except the host:
  VITE_MQTT_URL          broker host (the website setting)
  BRIDGE_MQTT_USERNAME   user written into config.bat
  BRIDGE_MQTT_PASSWORD   password written into config.bat; without it the kit
                         asks for the password every time

bridge/dist/ is ignored by git: the kit holds the broker host and, if set,
the credentials. Do not share the zip.
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


def env_local() -> dict[str, str]:
    env = ROOT / ".env.local"
    if not env.is_file():
        return {}
    pairs = re.findall(r"^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$", env.read_text(encoding="utf-8"), re.M)
    return {k: v.strip('"').strip("'") for k, v in pairs}


def host_from_url(url: str | None) -> str | None:
    m = re.match(r"\w+://([^:/\s]+)", url or "")
    return m.group(1) if m else None


def bat_value(value: str, what: str) -> str:
    """Escapes a value for `set "NAME=value"` in a .bat file."""
    if '"' in value or "\n" in value:
        sys.exit(f"The {what} cannot contain quotes or line breaks.")
    return value.replace("%", "%%")


def crlf(text: str) -> bytes:
    return text.replace("\r\n", "\n").replace("\n", "\r\n").encode("utf-8")


def config_bat(args: argparse.Namespace) -> str:
    password_line = (
        f'set "MQTT_PASSWORD={bat_value(args.mqtt_password, "password")}"'
        if args.mqtt_password
        else 'rem MQTT_PASSWORD not set: the scripts ask for it. To store it: set "MQTT_PASSWORD=..."'
    )
    return f"""@echo off
rem Kit settings. Edit with Notepad. Do not share this file: it may hold the broker password.
set "MQTT_HOST={bat_value(args.mqtt_host, "host")}"
set "MQTT_PORT=8883"
rem The website connects on 8884 (MQTT over WebSockets); checked by 1-network-test.bat.
set "MQTT_WS_PORT=8884"
set "MQTT_USERNAME={bat_value(args.mqtt_username, "user")}"
{password_line}
set "TOPIC_PREFIX=robotcell"
rem Only accept packets from the PLC.
set "PLC_IP={args.plc_ip}"
rem 1 = send 1 byte to the PLC every 5 s so the Windows firewall lets its packets in (no admin needed).
set "PUNCH=1"
rem Root certificate of the broker (ISRG Root X1, Let's Encrypt), shipped with the kit so the
rem PC's own certificate store does not matter. Empty = use the Windows store.
set "MQTT_CA_FILE=%~dp0isrg-root-x1.pem"
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
    local = env_local()
    p = argparse.ArgumentParser(description="Build the bridge kit zip for the lab PC.")
    p.add_argument("--mqtt-host", default=host_from_url(local.get("VITE_MQTT_URL")), help="broker host (default: from .env.local)")
    p.add_argument("--mqtt-username", default=local.get("BRIDGE_MQTT_USERNAME", ""), help="broker user (default: BRIDGE_MQTT_USERNAME in .env.local)")
    p.add_argument("--no-password", action="store_true", help="do not store the password even if BRIDGE_MQTT_PASSWORD is set")
    p.add_argument("--plc-ip", default="192.168.0.70", help="PLC address (default 192.168.0.70)")
    p.add_argument("--python-version", default=DEFAULT_PYTHON, help=f"embeddable Python version (default {DEFAULT_PYTHON})")
    p.add_argument("--no-python", action="store_true", help="do not include the portable Python")
    args = p.parse_args()
    args.mqtt_password = "" if args.no_password else local.get("BRIDGE_MQTT_PASSWORD", "")
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
            data = f.read_bytes()
            put(f.name, crlf(data.decode("utf-8")) if f.suffix in (".bat", ".txt") else data)
        put("config.bat", crlf(config_bat(args)))
        if not args.no_python:
            with zipfile.ZipFile(io.BytesIO(python_zip(args.python_version))) as py:
                for info in py.infolist():
                    put(f"python/{info.filename}", py.read(info))
    print(f"Kit: {out} ({out.stat().st_size / 1e6:.1f} MB)")
    print(f"  broker {args.mqtt_host}, user {args.mqtt_username or '(asked)'}, password {'stored' if args.mqtt_password else '(asked)'}")


if __name__ == "__main__":
    main()
