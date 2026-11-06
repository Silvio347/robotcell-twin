"""UDP -> MQTT bridge for the robot cell digital twin.

Listens for the 28-byte packets sent by the PLC (TwinSender.st in
plc/ProjetoFinalRobotica) and publishes them to the broker:

  <prefix>/plc/io          JSON snapshot, one message per packet (about 5 per second)
  <prefix>/source/status   "online" / "offline", retained, also the MQTT Last Will

Packet layout and topics: docs/publishing-plan/02-plc-udp-sender.md and
docs/mqtt-contract.md.

Run it on the PC that is connected to the PLC (see bridge/README.md):

  MQTT_HOST=<cluster-id>.s1.eu.hivemq.cloud MQTT_USERNAME=... MQTT_PASSWORD=... python bridge.py

The password is read only from the MQTT_PASSWORD environment variable so it
does not end up in the shell history.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import socket
import sys
import time
import uuid

import paho.mqtt.client as mqtt

PACKET_LEN = 28
CHANNELS = 12

log = logging.getLogger("bridge")


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


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Robot cell digital twin: PLC UDP -> MQTT bridge.")
    p.add_argument("--mqtt-host", default=env("MQTT_HOST"), help="broker host (env MQTT_HOST)")
    p.add_argument("--mqtt-port", type=int, default=int(env("MQTT_PORT", "8883")), help="broker port (env MQTT_PORT, default 8883)")
    p.add_argument("--mqtt-username", default=env("MQTT_USERNAME"), help="broker user (env MQTT_USERNAME)")
    p.add_argument("--no-tls", action="store_true", default=env("MQTT_TLS", "1") == "0", help="plain TCP, only for a local test broker (env MQTT_TLS=0)")
    p.add_argument("--topic-prefix", default=env("TOPIC_PREFIX", "robotcell"), help="topic prefix (env TOPIC_PREFIX)")
    p.add_argument("--udp-port", type=int, default=int(env("UDP_PORT", "5005")), help="UDP port to listen on (env UDP_PORT, default 5005)")
    p.add_argument("--plc-ip", default=env("PLC_IP"), help="accept packets only from this IP (env PLC_IP, e.g. 192.168.0.70)")
    p.add_argument("--stale-after", type=float, default=2.0, help="seconds without new packets before reporting offline")
    p.add_argument("-v", "--verbose", action="store_true", help="log every packet")
    args = p.parse_args(argv)
    if not args.mqtt_host:
        p.error("set MQTT_HOST (or --mqtt-host)")
    return args


class Bridge:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.topic_io = f"{args.topic_prefix}/plc/io"
        self.topic_status = f"{args.topic_prefix}/source/status"
        self.status: str | None = None
        self.stopping = False
        self.last_seq: int | None = None
        self.last_fresh = 0.0
        self.stats = {"received": 0, "published": 0, "dropped": 0, "repeated": 0, "lost": 0}

        self.client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"twin-bridge-{uuid.uuid4().hex[:8]}",
            clean_session=True,
        )
        if args.mqtt_username:
            self.client.username_pw_set(args.mqtt_username, env("MQTT_PASSWORD"))
        if not args.no_tls:
            self.client.tls_set()
        self.client.will_set(self.topic_status, "offline", qos=1, retain=True)
        self.client.reconnect_delay_set(min_delay=1, max_delay=30)
        self.client.on_connect = self.on_connect
        self.client.on_disconnect = self.on_disconnect

    # MQTT -----------------------------------------------------------------

    def on_connect(self, client, userdata, flags, reason_code, properties) -> None:
        if reason_code.is_failure:
            log.error("Broker refused the connection: %s", reason_code)
            return
        log.info("Connected to %s:%s", self.args.mqtt_host, self.args.mqtt_port)
        # Re-announce the current state: the broker may hold the Last Will.
        self.publish_status(self.status or "offline", force=True)

    def on_disconnect(self, client, userdata, flags, reason_code, properties) -> None:
        if self.stopping:
            return
        log.warning("Disconnected from broker (%s), reconnecting...", reason_code)

    def publish_status(self, status: str, force: bool = False) -> None:
        if status == self.status and not force:
            return
        self.status = status
        log.info("Source status: %s", status)
        self.client.publish(self.topic_status, status, qos=1, retain=True)

    # UDP ------------------------------------------------------------------

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

        payload = {"ts": int(time.time() * 1000), **packet}
        self.client.publish(self.topic_io, json.dumps(payload, separators=(",", ":")), qos=0)
        self.stats["published"] += 1
        self.publish_status("online")
        if self.args.verbose:
            log.debug("seq=%d %s", seq, payload)

    def run(self) -> None:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.bind(("0.0.0.0", self.args.udp_port))
        sock.settimeout(0.5)
        log.info("Listening for PLC packets on UDP %d%s", self.args.udp_port,
                 f" from {self.args.plc_ip}" if self.args.plc_ip else "")

        self.client.connect_async(self.args.mqtt_host, self.args.mqtt_port, keepalive=30)
        self.client.loop_start()
        next_stats = time.monotonic() + 30
        try:
            while True:
                try:
                    data, (host, _port) = sock.recvfrom(256)
                    self.handle(data, host)
                except socket.timeout:
                    pass
                now = time.monotonic()
                if self.status == "online" and now - self.last_fresh > self.args.stale_after:
                    log.warning("No new PLC packet for %.1f s", self.args.stale_after)
                    self.publish_status("offline")
                if now >= next_stats:
                    log.info("Stats: %s", self.stats)
                    next_stats = now + 30
        except KeyboardInterrupt:
            log.info("Stopping")
        finally:
            self.stopping = True
            info = self.client.publish(self.topic_status, "offline", qos=1, retain=True)
            try:
                info.wait_for_publish(timeout=2)
            except (RuntimeError, ValueError):
                pass  # not connected: the broker publishes the Last Will instead
            self.client.disconnect()
            self.client.loop_stop()
            sock.close()


def main(argv: list[str] | None = None) -> None:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    Bridge(args).run()


if __name__ == "__main__":
    main()
