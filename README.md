# Robot Cell Digital Twin

Web digital twin of the Inatel robot cell (Stäubli + Jaka Minicobo, two
conveyors, B&R Power Panel PLC). Live data arrives over MQTT from the same
HiveMQ Cloud broker used by Fluxio.

Current scope: a read-only 2D view of the PLC I/O, plus robot joint values
when a publisher sends them. A 3D view is planned; see
[docs/architecture.md](docs/architecture.md) for the decisions and
[docs/mqtt-contract.md](docs/mqtt-contract.md) for topics and payloads.

## Requirements

- Node.js 18.18+ (20 LTS recommended)

## Setup

```bash
npm install
cp .env.example .env.local   # broker URL and topic prefix (no secrets)
npm run dev
```

Open the printed URL, then enter a broker username and password, or click
**Run demo without broker**.

## Demo mode (no broker)

**Run demo without broker** on the start screen plays the PLC cycle from
`NewProgram` inside the browser (`src/sim/demo.ts`): Jaka places a part, the
conveyor carries it to the Stäubli, the Stäubli picks it. No MQTT is involved.

## MQTT simulator

Publishes the same cycle to a real broker, to test the full MQTT path. It
uses the native MQTT port (8883), not WebSockets:

```bash
MQTT_URL=mqtts://<cluster>.s1.eu.hivemq.cloud:8883 \
MQTT_USERNAME=<user> MQTT_PASSWORD=<pass> npm run simulate
```

The website shows **Source: SIMULATED** while it runs. Do not run it while
the real PLC/bridge publishes on the same prefix.

For a fully local setup, run Mosquitto with a WebSocket listener and connect
the site to `ws://localhost:<port>`.

## Build and deploy

```bash
npm run build      # type-check + production build into dist/
```

- **Netlify:** link the repo; `netlify.toml` sets the build command and `dist`.
  Set `VITE_MQTT_URL` and `VITE_TOPIC_PREFIX` in the site environment.
- **Firebase Hosting:** `firebase use <project>` then `firebase deploy --only hosting`.

## Project structure

- `src/model/cell.ts`: cell I/O map (Table I of the handout).
- `src/model/messages.ts`: MQTT payload parsing and validation.
- `src/mqtt/`: topics and the single broker connection (subscribe only).
- `src/state/store.ts`: app state (zustand).
- `src/components/`: 2D cell view, I/O table, robot joints, connect form.
- `scripts/simulate.mjs`: fake data publisher.
