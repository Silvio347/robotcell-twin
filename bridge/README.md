# Bridge

Receives the PLC UDP packets (`TwinSender.st`) and publishes them to the
MQTT broker. Runs on the PC connected to the PLC.

```bash
python -m pip install -r requirements.txt
MQTT_HOST=<cluster-id>.s1.eu.hivemq.cloud MQTT_USERNAME=... MQTT_PASSWORD=... PLC_IP=192.168.0.70 python bridge.py
```

Network, firewall, Windows commands and settings:
[docs/publishing-plan/03-bridge.md](../docs/publishing-plan/03-bridge.md).
