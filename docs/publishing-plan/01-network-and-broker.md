# Step 1: network and broker check

Nothing in the cell changes in this step.

## 1.1 Broker credentials

On the HiveMQ Cloud console (same cluster as Fluxio), under access management,
create two credentials instead of reusing Fluxio's:

| Credential | Used by | Permission (if your plan supports per-credential permissions) |
|---|---|---|
| `robotcell-bridge` | Bridge PC (and the simulator) | Publish on `robotcell/#` |
| `robotcell-web` | Website | Subscribe on `robotcell/#` |

The website credential is typed into a public page, so treat it as
low-privilege. If someone gets it, they can only read cell signals.

## 1.2 Test outbound MQTT from the lab

Connect a laptop to the same network the bridge PC will use for internet,
then run:

```bash
MQTT_URL=mqtts://<cluster-id>.s1.eu.hivemq.cloud:8883 \
MQTT_USERNAME=robotcell-bridge MQTT_PASSWORD=... npm run simulate
```

Open the website (local or deployed) with the `robotcell-web` credential.
The status bar should show **Broker: connected** and **Source: SIMULATED**.

| Result | Meaning | Next |
|---|---|---|
| Works | Port 8883 is open | Go to step 2 |
| Simulator hangs on connect | Port 8883 is blocked | Try the website from the lab: if WSS on 8884 also fails, use a phone hotspot for the bridge PC's internet link |
| `Not authorized` | Credential or permission wrong | Check 1.1 |

## 1.3 Network layout for the bridge PC

The cell LAN (`192.168.0.x`) is probably not the campus network that has
internet. The bridge PC then needs two links:

- Ethernet cable on the cell switch, static IP on `192.168.0.x` (for example
  `192.168.0.100`), **no gateway** on this interface.
- Wi-Fi (campus or phone hotspot) for internet.

Before choosing the IP, check which addresses are taken. The PLC project uses
`192.168.0.70`, and the handout gives the same IP to the Jaka (see
[plc-program.md](../plc-program.md)).
