# Step 3: bridge PC

`bridge/bridge.py` listens for the PLC packets and publishes them to HiveMQ.
It runs on the same PC that is connected to the PLC (the one with Automation
Studio), so no extra machine is needed.

Status: **done**, tested with a fake PLC sender and a local broker. Not yet
tested against HiveMQ or the real PLC.

## Network

The PC needs two links at the same time:

- Ethernet to the cell switch, on `192.168.0.x`. It already has this if
  Automation Studio talks to the PLC. Its IP goes into `TwinHost` on the PLC
  ([step 2.2](02-plc-udp-sender.md#22-set-the-bridge-pc-address)).
- Internet (campus Wi-Fi or a phone hotspot) to reach HiveMQ on port 8883.
  Check it first with [step 1](01-network-and-broker.md).

Windows firewall: allow inbound UDP 5005 for Python. Windows usually asks
the first time the bridge starts; choose the network type of the cell
adapter. Otherwise:

```powershell
New-NetFirewallRule -DisplayName "Robot cell twin bridge" -Direction Inbound -Protocol UDP -LocalPort 5005 -Action Allow
```

## Install

Python 3.9 or newer.

```powershell
cd robotcell-twin\bridge
python -m pip install -r requirements.txt
```

## Run

PowerShell:

```powershell
$env:MQTT_HOST = "<cluster-id>.s1.eu.hivemq.cloud"
$env:MQTT_USERNAME = "robotcell-bridge"
$env:MQTT_PASSWORD = "<password>"
$env:PLC_IP = "192.168.0.70"
python bridge.py
```

Linux/macOS:

```bash
MQTT_HOST=<cluster-id>.s1.eu.hivemq.cloud MQTT_USERNAME=robotcell-bridge \
MQTT_PASSWORD=<password> PLC_IP=192.168.0.70 python3 bridge.py
```

Add `-v` to log every packet. Stop with Ctrl+C: the bridge publishes
`offline` before leaving.

| Setting | Env var | Default |
|---|---|---|
| Broker host | `MQTT_HOST` | required |
| Broker port | `MQTT_PORT` | 8883 (TLS) |
| User / password | `MQTT_USERNAME` / `MQTT_PASSWORD` | none |
| Plain TCP, local test broker only | `MQTT_TLS=0` | TLS on |
| Topic prefix | `TOPIC_PREFIX` | `robotcell` |
| UDP port | `UDP_PORT` | 5005 |
| Accept packets only from | `PLC_IP` | any sender |

The password is only read from the environment, so it does not end up in
the shell history or in the repository.

## Behaviour

1. Connects with TLS; Last Will `robotcell/source/status` = `offline`, retained.
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

## Website follow-up

The website ignores `step`, `count` and `running` for now. Showing them
(sequence step, piece counter, start state) is a separate change.
