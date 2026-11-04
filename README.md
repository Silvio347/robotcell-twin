# Robot Cell Digital Twin

Web digital twin of the Inatel robot cell: Stäubli + Jaka Minicobo, two
conveyors, B&R Power Panel PLC. The PLC signals are published over MQTT and
the website draws the cell live. This repository also holds the cell's
Automation Studio project (`plc/`).

Project overview: [docs/README.md](docs/README.md). Plan to get live data
online: [docs/publishing-plan/](docs/publishing-plan/README.md).

## What is real and what is simulated

The website has no live connection to the cell yet. **Run demo without
broker** generates every value in the browser. The table shows which values
already match the real cell and which ones are placeholders.

| Data | Source | Status today | Real when |
|---|---|---|---|
| I/O map (which signal is on which channel) | `IoMap.iom` in the PLC project + Table I of the handout | **Confirmed**, matches both | Already real |
| Handshake and sequence signals: `Jaka_DI2/DI3/DO7`, `Staubli_DI12/DI13`, `Sensor_Jaka`, `Sensor_Staubli`, `Esteira_JakaStaubli` | PLC | **Simulated**, follows the real `NewProgram` sequence with made-up timing | The PLC sends its I/O ([steps 2–3](docs/publishing-plan/README.md)) |
| `Emergencia` | PLC | **Simulated**, always safe (TRUE). Polarity confirmed in the PLC code | Same as above |
| Unused signals: `Jaka_DO5/DO6/DI1`, `Staubli_DO4–DO7`, `Staubli_DI14/DI15`, `Esteira_StaubliJaka` | PLC | **Simulated**, always off (the program never uses them) | Same as above |
| `Etapa`, `iContador`, `Ligar` | PLC (program variables) | **Not shown yet** | Bridge sends them, then the website shows them ([step 3](docs/publishing-plan/03-bridge.md)) |
| Robot joint angles J1–J6 (Stäubli and Jaka) | Robot controllers | **Random**, sine waves with no relation to the real robots | Joints are read from the robot controllers ([architecture](docs/architecture.md)) |
| Cell layout in the 2D view | Drawing | **Approximate**, positions are placeholders | Adjusted from photos/measurements of the cell |

The PLC only exchanges digital I/O with the robots. It never knows where the
arms are, so joint angles cannot come from the PLC.

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

**Run demo without broker** plays the PLC cycle from `NewProgram` inside the
browser (`src/sim/demo.ts`): Jaka places a part, the conveyor carries it to
the Stäubli, the Stäubli picks it. No MQTT is involved.

## MQTT simulator

Publishes the same cycle to a real broker, to test the full MQTT path. It
uses the native MQTT port (8883), not WebSockets:

```bash
MQTT_URL=mqtts://<cluster-id>.s1.eu.hivemq.cloud:8883 \
MQTT_USERNAME=<user> MQTT_PASSWORD=<pass> npm run simulate
```

The website shows **Source: SIMULATED** while it runs. Do not run it while
the real PLC/bridge publishes on the same prefix.

## Build and deploy

```bash
npm run build      # type-check + production build into dist/
```

Deploy steps for Netlify and Firebase Hosting:
[docs/publishing-plan/04-website-deploy.md](docs/publishing-plan/04-website-deploy.md).

## Repository layout

```
plc/ProjetoFinalRobotica/   Automation Studio 4.1 project (PLC + HMI)
src/                        Website (React + TypeScript + Vite)
scripts/simulate.mjs        MQTT simulator
docs/                       Project docs, MQTT contract, publishing plan
```

The PLC project in git is missing some files on purpose (B&R Runtime
binaries, build output, per-user settings). See
[docs/plc-program.md](docs/plc-program.md#files-kept-out-of-git).
