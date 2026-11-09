"""UDP -> MQTT bridge for the robot cell digital twin.

Listens for the 28-byte packets sent by the PLC (TwinSender.st in
plc/ProjetoFinalRobotica) and publishes them to the broker:

  <prefix>/plc/io          JSON snapshot, one message per packet (about 5 per second)
  <prefix>/source/status   "online" / "offline", retained, also the MQTT Last Will

Packet layout and topics: docs/publishing-plan/02-plc-udp-sender.md and
docs/mqtt-contract.md.

Standard library only (no pip install), so it runs from a portable Python on
a locked-down lab PC. It speaks the small part of MQTT 3.1.1 it needs:
CONNECT with Last Will, QoS 0 PUBLISH, PINGREQ and DISCONNECT, over TLS.

  python bridge.py --selftest     check the broker connection and credentials
  python bridge.py                run the bridge

Settings come from the command line or environment variables (see --help).
The password is read from MQTT_PASSWORD or asked for, never from the command
line, so it does not end up in the shell history.
"""

from __future__ import annotations

import argparse
import getpass
import json
import logging
import os
import socket
import ssl
import struct
import sys
import time
import uuid

PACKET_LEN = 28
CHANNELS = 12
# The PLC sends from this local port (TwinLocalPort in NewProgram.var).
PLC_LOCAL_PORT = 5006

log = logging.getLogger("bridge")


# ---------------------------------------------------------------- PLC packet


def parse_packet(data: bytes) -> dict | None:
    """Returns the decoded packet, or None if it does not match the layout."""
    if len(data) != PACKET_LEN:
        return None
    bits = data[0 : 2 * CHANNELS]
    if any(b > 1 for b in bits) or data[26] > 1:
        return None
    return {
        "di": [b == 1 for b in data[0:CHANNELS]],
        "do": [b == 1 for b in data[CHANNELS : 2 * CHANNELS]],
        "step": data[24],
        "count": data[25],
        "running": data[26] == 1,
        "seq": data[27],
    }


# ---------------------------------------------------------------- MQTT 3.1.1

CONNACK_ERRORS = {
    1: "unacceptable protocol version",
    2: "client id rejected",
    3: "server unavailable",
    4: "bad user name or password",
    5: "not authorized",
}


class MqttError(Exception):
    pass


def _varint(n: int) -> bytes:
    out = bytearray()
    while True:
        byte = n % 128
        n //= 128
        out.append(byte | (0x80 if n else 0))
        if not n:
            return bytes(out)


def _str(s: str | bytes) -> bytes:
    b = s.encode("utf-8") if isinstance(s, str) else s
    return struct.pack("!H", len(b)) + b


def _packet(first_byte: int, body: bytes) -> bytes:
    return bytes([first_byte]) + _varint(len(body)) + body


class MqttClient:
    """Minimal MQTT 3.1.1 publisher. Not thread safe; call poll() often."""

    def __init__(self, host: str, port: int, *, tls: bool, ca_file: str | None,
                 username: str, password: str, client_id: str, keepalive: int = 30,
                 will: tuple[str, str] | None = None) -> None:
        self.host, self.port, self.tls, self.ca_file = host, port, tls, ca_file
        self.username, self.password = username, password
        self.client_id, self.keepalive, self.will = client_id, keepalive, will
        self.sock: socket.socket | None = None
        self.buf = b""
        self.last_sent = 0.0
        self.last_recv = 0.0
        self.ping_pending = False

    @property
    def connected(self) -> bool:
        return self.sock is not None

    def connect(self, timeout: float = 10.0) -> None:
        raw = socket.create_connection((self.host, self.port), timeout=timeout)
        try:
            if self.tls:
                ctx = ssl.create_default_context(cafile=self.ca_file)
                sock = ctx.wrap_socket(raw, server_hostname=self.host)
            else:
                sock = raw
            flags = 0x02  # clean session
            payload = _str(self.client_id)
            if self.will:
                flags |= 0x04 | 0x08 | 0x20  # will, will QoS 1, will retain
                payload += _str(self.will[0]) + _str(self.will[1])
            if self.username:
                flags |= 0x80
                payload += _str(self.username)
                if self.password:
                    flags |= 0x40
                    payload += _str(self.password)
            body = _str("MQTT") + bytes([4, flags]) + struct.pack("!H", self.keepalive) + payload
            sock.sendall(_packet(0x10, body))
            head = self._read_exact(sock, 4)
            if head[0] != 0x20 or head[1] != 2:
                raise MqttError(f"unexpected reply to CONNECT: {head.hex()}")
            if head[3] != 0:
                raise MqttError(f"broker refused the connection: {CONNACK_ERRORS.get(head[3], head[3])}")
        except BaseException:
            raw.close()
            raise
        sock.settimeout(0)
        self.sock, self.buf = sock, b""
        self.last_sent = self.last_recv = time.monotonic()
        self.ping_pending = False

    @staticmethod
    def _read_exact(sock: socket.socket, n: int) -> bytes:
        data = b""
        while len(data) < n:
            chunk = sock.recv(n - len(data))
            if not chunk:
                raise MqttError("connection closed by the broker")
            data += chunk
        return data

    def _send(self, data: bytes) -> None:
        if not self.sock:
            raise MqttError("not connected")
        self.sock.settimeout(10)
        try:
            self.sock.sendall(data)
        finally:
            self.sock.settimeout(0)
        self.last_sent = time.monotonic()

    def publish(self, topic: str, payload: str | bytes, retain: bool = False) -> None:
        data = payload.encode("utf-8") if isinstance(payload, str) else payload
        self._send(_packet(0x30 | (0x01 if retain else 0), _str(topic) + data))

    def poll(self) -> None:
        """Reads pending replies and keeps the connection alive. Raises on a lost connection."""
        if not self.sock:
            return
        while True:
            try:
                chunk = self.sock.recv(4096)
            except (ssl.SSLWantReadError, BlockingIOError, socket.timeout):
                break
            if not chunk:
                raise MqttError("connection closed by the broker")
            self.buf += chunk
            self.last_recv = time.monotonic()
        # Only PINGRESP (0xD0 0x00) is expected; drop any complete packet.
        while len(self.buf) >= 2:
            length, used, mult = 0, 1, 1
            while used < len(self.buf):
                b = self.buf[used]
                length += (b & 0x7F) * mult
                mult *= 128
                used += 1
                if not b & 0x80:
                    break
            else:
                break
            if len(self.buf) < used + length:
                break
            if self.buf[0] == 0xD0:
                self.ping_pending = False
            self.buf = self.buf[used + length :]
        now = time.monotonic()
        if self.ping_pending and now - self.last_recv > self.keepalive:
            raise MqttError("no reply from the broker")
        if not self.ping_pending and now - self.last_sent > self.keepalive / 2:
            self._send(b"\xc0\x00")
            self.ping_pending = True

    def disconnect(self) -> None:
        if self.sock:
            try:
                self._send(b"\xe0\x00")
            except (OSError, MqttError):
                pass
            self.close()

    def close(self) -> None:
        if self.sock:
            try:
                self.sock.close()
            except OSError:
                pass
        self.sock = None


# ---------------------------------------------------------------- bridge


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Robot cell digital twin: PLC UDP -> MQTT bridge.")
    p.add_argument("--mqtt-host", default=env("MQTT_HOST"), help="broker host (env MQTT_HOST)")
    p.add_argument("--mqtt-port", type=int, default=int(env("MQTT_PORT", "8883")), help="broker port (env MQTT_PORT, default 8883)")
    p.add_argument("--mqtt-username", default=env("MQTT_USERNAME"), help="broker user (env MQTT_USERNAME; asked for if empty)")
    p.add_argument("--no-tls", action="store_true", default=env("MQTT_TLS", "1") == "0", help="plain TCP, only for a local test broker (env MQTT_TLS=0)")
    p.add_argument("--ca-file", default=env("MQTT_CA_FILE") or None, help="CA certificate file, if the system store does not trust the broker (env MQTT_CA_FILE)")
    p.add_argument("--topic-prefix", default=env("TOPIC_PREFIX", "robotcell"), help="topic prefix (env TOPIC_PREFIX)")
    p.add_argument("--udp-port", type=int, default=int(env("UDP_PORT", "5005")), help="UDP port to listen on (env UDP_PORT, default 5005)")
    p.add_argument("--plc-ip", default=env("PLC_IP"), help="accept packets only from this IP (env PLC_IP, e.g. 192.168.0.70)")
    p.add_argument("--punch", action="store_true", default=env("PUNCH") == "1",
                   help="send a 1-byte datagram to the PLC every 5 s so the Windows firewall treats its packets as replies (needs --plc-ip; env PUNCH=1)")
    p.add_argument("--stale-after", type=float, default=2.0, help="seconds without new packets before reporting offline")
    p.add_argument("--selftest", action="store_true", help="connect to the broker, publish one test message and exit")
    p.add_argument("-v", "--verbose", action="store_true", help="log every packet")
    args = p.parse_args(argv)
    if not args.mqtt_host:
        p.error("set MQTT_HOST (or --mqtt-host)")
    if args.punch and not args.plc_ip:
        p.error("--punch needs PLC_IP (or --plc-ip)")
    return args


def ask_credentials(args: argparse.Namespace) -> tuple[str, str]:
    username = args.mqtt_username
    password = env("MQTT_PASSWORD")
    try:
        if not username and sys.stdin.isatty():
            username = input("MQTT user (Enter = none): ").strip()
        if username and not password and sys.stdin.isatty():
            password = getpass.getpass("MQTT password (not shown): ")
    except EOFError:
        print()  # no console input available: continue without credentials
    return username, password


def make_client(args: argparse.Namespace, username: str, password: str, status_topic: str) -> MqttClient:
    return MqttClient(
        args.mqtt_host, args.mqtt_port, tls=not args.no_tls, ca_file=args.ca_file,
        username=username, password=password, client_id=f"twin-bridge-{uuid.uuid4().hex[:8]}",
        will=(status_topic, "offline"),
    )


def selftest(args: argparse.Namespace, username: str, password: str) -> int:
    topic = f"{args.topic_prefix}/bridge/selftest"
    client = make_client(args, username, password, f"{args.topic_prefix}/source/status")
    client.will = None  # a test must not change the source status
    print(f"Connecting to {args.mqtt_host}:{args.mqtt_port} ({'TLS' if not args.no_tls else 'plain TCP'})...")
    try:
        client.connect()
        client.publish(topic, json.dumps({"ts": int(time.time() * 1000), "host": socket.gethostname()}))
        client.disconnect()
    except ssl.SSLCertVerificationError as e:
        print(f"FAILED: the broker certificate is not trusted ({e.verify_message}). Try --ca-file.")
        return 1
    except (OSError, MqttError) as e:
        print(f"FAILED: {e}")
        return 1
    print(f"OK: connected, authenticated and published to {topic}.")
    return 0


class Bridge:
    def __init__(self, args: argparse.Namespace, username: str, password: str) -> None:
        self.args = args
        self.topic_io = f"{args.topic_prefix}/plc/io"
        self.topic_status = f"{args.topic_prefix}/source/status"
        self.client = make_client(args, username, password, self.topic_status)
        self.status = "offline"
        self.announced: str | None = None
        self.last_seq: int | None = None
        self.last_fresh = 0.0
        self.next_connect = 0.0
        self.backoff = 1.0
        self.stats = {"received": 0, "published": 0, "dropped": 0, "repeated": 0, "lost": 0}

    def ensure_connected(self) -> None:
        if self.client.connected or time.monotonic() < self.next_connect:
            return
        try:
            self.client.connect()
        except ssl.SSLCertVerificationError as e:
            log.error("Broker certificate not trusted (%s); try --ca-file", e.verify_message)
            self.schedule_retry()
            return
        except (OSError, MqttError) as e:
            log.error("Cannot connect to %s:%s: %s", self.args.mqtt_host, self.args.mqtt_port, e)
            self.schedule_retry()
            return
        log.info("Connected to %s:%s", self.args.mqtt_host, self.args.mqtt_port)
        self.backoff = 1.0
        self.announced = None  # re-announce: the broker may hold the Last Will

    def schedule_retry(self) -> None:
        self.next_connect = time.monotonic() + self.backoff
        log.info("Retrying in %.0f s", self.backoff)
        self.backoff = min(self.backoff * 2, 30.0)

    def safe(self, action) -> None:
        if not self.client.connected:
            return
        try:
            action()
        except (OSError, MqttError) as e:
            log.warning("Broker connection lost: %s", e)
            self.client.close()
            self.schedule_retry()

    def set_status(self, status: str) -> None:
        if status != self.status:
            log.info("Source status: %s", status)
        self.status = status
        if self.client.connected and self.announced != status:
            self.safe(lambda: self.client.publish(self.topic_status, status, retain=True))
            if self.client.connected:
                self.announced = status

    def handle(self, data: bytes, sender: str) -> None:
        self.stats["received"] += 1
        if self.args.plc_ip and sender != self.args.plc_ip:
            self.stats["dropped"] += 1
            log.debug("Ignoring packet from %s", sender)
            return
        packet = parse_packet(data)
        if packet is None:
            self.stats["dropped"] += 1
            log.warning("Ignoring malformed packet (%d bytes) from %s", len(data), sender)
            return
        seq = packet.pop("seq")
        if seq == self.last_seq:
            # Same counter twice: duplicate or PLC no longer counting.
            self.stats["repeated"] += 1
            return
        if self.last_seq is not None:
            self.stats["lost"] += (seq - self.last_seq - 1) % 256
        self.last_seq = seq
        self.last_fresh = time.monotonic()
        payload = json.dumps({"ts": int(time.time() * 1000), **packet}, separators=(",", ":"))
        if self.client.connected:
            self.safe(lambda: self.client.publish(self.topic_io, payload))
            if self.client.connected:
                self.stats["published"] += 1
        self.set_status("online")
        log.debug("seq=%d %s", seq, payload)

    def run(self) -> None:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.bind(("0.0.0.0", self.args.udp_port))
        sock.settimeout(0.2)
        log.info("Listening for PLC packets on UDP %d%s", self.args.udp_port,
                 f" from {self.args.plc_ip}" if self.args.plc_ip else "")
        next_stats = time.monotonic() + 30
        next_punch = 0.0
        try:
            while True:
                self.ensure_connected()
                if self.client.connected and self.announced != self.status:
                    self.set_status(self.status)
                try:
                    data, (host, _port) = sock.recvfrom(256)
                    self.handle(data, host)
                except socket.timeout:
                    pass
                except (ConnectionResetError, ConnectionRefusedError):
                    pass  # ICMP "port unreachable" after a punch is reported here (Windows: reset, Linux: refused)
                self.safe(self.client.poll)
                now = time.monotonic()
                if self.status == "online" and now - self.last_fresh > self.args.stale_after:
                    log.warning("No new PLC packet for %.1f s", self.args.stale_after)
                    self.set_status("offline")
                if self.args.punch and now >= next_punch:
                    try:
                        sock.sendto(b"\x00", (self.args.plc_ip, PLC_LOCAL_PORT))
                    except OSError as e:
                        log.debug("Punch failed: %s", e)
                    next_punch = now + 5
                if now >= next_stats:
                    log.info("Stats: %s", self.stats)
                    next_stats = now + 30
        except KeyboardInterrupt:
            log.info("Stopping")
        finally:
            if self.client.connected:
                self.safe(lambda: self.client.publish(self.topic_status, "offline", retain=True))
            self.client.disconnect()  # clean disconnect: the broker drops the Last Will
            sock.close()


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    username, password = ask_credentials(args)
    if args.selftest:
        return selftest(args, username, password)
    Bridge(args, username, password).run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
