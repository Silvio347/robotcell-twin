# Step 3: bridge PC

`bridge/bridge.py` listens for the PLC packets and publishes them to HiveMQ.
It runs on the PC that is connected to the PLC (the one with Automation
Studio), so no extra machine is needed.

It uses only the Python standard library (no `pip install`) and ships in a
kit with a portable Python, because the lab PCs are locked down.

Status: tested with a fake PLC against a local Mosquitto (reconnection
included) and over TLS against a public HiveMQ broker; the Windows portable
Python and the `.bat` scripts were checked under Wine. Not yet tested on the
lab PC, on HiveMQ Cloud or with the real PLC.

## Build the kit

On your own machine:

```bash
python3 bridge/make_kit.py
```

This writes `bridge/dist/robotcell-bridge-kit.zip` (about 11 MB). The broker
host comes from `.env.local`; the password is never stored. The zip is
ignored by git because it contains the broker host.

Copy the zip to the lab PC (WhatsApp Web, e-mail, USB drive), unzip it
anywhere and run the numbered scripts:

| Script | Checks |
|---|---|
| `1-network-test.bat` | This PC's IPs, broker reachable on 8883, PLC reachable |
| `2-python-test.bat` | The portable Python runs |
| `3-broker-test.bat` | TLS connection, login and one publish (`--selftest`) |
| `4-test-with-fake-plc.bat` | Whole path with `fake_plc.py` instead of the PLC |
| `5-run-bridge.bat` | The bridge for the real PLC |

`AI-CONTEXT.md` in the kit explains the project, the tests and the common
errors, to give to an AI assistant when something fails.

## Network

The PC needs two links at the same time:

- Ethernet on the cell network, `192.168.0.x`. It already has this if
  Automation Studio talks to the PLC. Its IP goes into `TwinHost` on the PLC
  ([step 2.2](02-plc-udp-sender.md#22-set-the-bridge-pc-address)).
- Internet to reach HiveMQ on port 8883. If `1-network-test.bat` shows the
  port is blocked, connect the PC's Wi-Fi to a phone hotspot.

Windows firewall: incoming UDP 5005 needs a rule, and adding one needs admin
rights:

```powershell
New-NetFirewallRule -DisplayName "Robot cell twin bridge" -Direction Inbound -Protocol UDP -LocalPort 5005 -Action Allow
```

Without admin rights, keep `PUNCH=1` in the kit's `config.bat` (default):
every 5 s the bridge sends 1 byte from port 5005 to the PLC's port 5006, so
the firewall treats the PLC packets as replies and lets them in. This
depends on the firewall's UDP state tracking and still has to be confirmed
on the lab PC.

## Run without the kit

Python 3.9 or newer, no packages:

```bash
MQTT_HOST=<cluster-id>.s1.eu.hivemq.cloud MQTT_USERNAME=robotcell-bridge PLC_IP=192.168.0.70 python3 bridge/bridge.py
```

The password is read from `MQTT_PASSWORD` or asked for. Add `-v` to log
every packet, `--selftest` to only check the broker. Stop with Ctrl+C: the
bridge publishes `offline` and disconnects cleanly.

| Setting | Env var | Default |
|---|---|---|
| Broker host | `MQTT_HOST` | required |
| Broker port | `MQTT_PORT` | 8883 (TLS) |
| User / password | `MQTT_USERNAME` / `MQTT_PASSWORD` | asked for |
| Plain TCP, local test broker only | `MQTT_TLS=0` | TLS on |
| CA file, if the system store does not trust the broker | `MQTT_CA_FILE` | system store |
| Topic prefix | `TOPIC_PREFIX` | `robotcell` |
| UDP port | `UDP_PORT` | 5005 |
| Accept packets only from | `PLC_IP` | any sender |
| Firewall workaround | `PUNCH=1` | off (on in the kit) |

`bridge/fake_plc.py` sends the demo run (`src/sim/timeline.json`) as PLC
packets to `127.0.0.1:5005`, to test without the PLC.

## Behaviour

1. Connects with TLS (MQTT 3.1.1); Last Will `robotcell/source/status` =
   `offline`, retained. Reconnects with backoff (1 s up to 30 s) if the
   connection drops, and re-announces the status.
2. Listens on UDP 5005.
3. For each packet:
   - Drops it if it is not 28 bytes, has a channel value other than 0/1, or
     (with `PLC_IP`) comes from another address.
   - Drops it if the sequence byte did not change (duplicate or frozen PLC).
   - Publishes `robotcell/plc/io` with `ts`, `di`, `do`, `step`, `count`,
     `running` ([mqtt-contract.md](../mqtt-contract.md)).
4. Publishes `online` (retained) when packets arrive, and `offline` after
   2 s without a new packet.
5. Logs counters every 30 s: received, published, dropped, repeated, lost.
