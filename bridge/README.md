# Bridge

Receives the PLC UDP packets (`TwinSender.st`) and publishes them to the
MQTT broker. Runs on the PC connected to the PLC. Standard library only.

| File | Role |
|---|---|
| `bridge.py` | The bridge (`--selftest` checks the broker only) |
| `fake_plc.py` | Sends the demo run as PLC packets, to test without the PLC |
| `make_kit.py` | Builds `dist/robotcell-bridge-kit.zip` for the lab PC (portable Python + `.bat` tests) |
| `kit/` | Files copied into the kit, including `AI-CONTEXT.md` |

```bash
python3 bridge/make_kit.py        # kit for the lab PC
MQTT_HOST=<cluster-id>.s1.eu.hivemq.cloud PLC_IP=192.168.0.70 python3 bridge/bridge.py
```

Details: [docs/publishing-plan/03-bridge.md](../docs/publishing-plan/03-bridge.md).
