# Publishing plan: live cell data on the website

Goal: the website shows the real PLC signals while the cell runs.

```
Robots/sensors ──I/O──► PLC 192.168.0.70 ──UDP :5005──► Bridge PC ──MQTT/TLS :8883──► HiveMQ ──WSS :8884──► Website
                        (cell LAN, 192.168.0.x)        (2 network links)          (cloud)              (Netlify/Firebase)
```

## Why it works on the Inatel network

Every connection is opened from inside the lab towards the outside. The PLC
sends to a PC on the same LAN, and that PC opens a connection to HiveMQ.
Nothing needs a public IP, and nobody on the internet can reach the PLC.
Private addresses (`10.x`, `192.168.x`) are fine.

The real risk is the campus firewall blocking outbound port 8883. Step 1
checks that before anything changes in the PLC.

## Steps

| # | Step | Touches the PLC? | Status | Done when |
|---|---|---|---|---|
| 1 | [Network and broker check](01-network-and-broker.md) | No | To do in the lab | The simulator publishes from the lab and the website shows it |
| 2 | [PLC UDP sender](02-plc-udp-sender.md) | Yes (new code, cycle unchanged) | Code ready, needs AsUDP added and a build in Automation Studio | The bridge sees 28-byte packets every 200 ms |
| 3 | [Bridge PC](03-bridge.md) | No | Done (`bridge/bridge.py`), tested with a fake PLC | The website shows the real I/O while the cell runs |
| 4 | [Website deploy](04-website-deploy.md) | No | Ready | Public URL works from a phone |
| 5 | [Optional: MQTT straight from the PLC](05-direct-mqtt-from-plc.md) | Yes (library + network config) | Not started | Bridge PC no longer needed |

The PLC program implements the whiteboard application
([plc-program.md](../plc-program.md#sequence)); the sender in step 2 does not
depend on the sequence.

## Who does what

Changing the lab PLC (steps 2 and 5) needs the professor/monitor OK.
The bridge (step 3) runs on the PC that is already connected to the PLC.
