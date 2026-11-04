# Project overview

Digital twin of the Inatel robot cell used in the "Desafio de Robótica
Industrial" (Projeto Célula Robótica). The cell is controlled by a B&R PLC/HMI
and has two robots and two conveyors. This repository contains both the PLC
program and a website that mirrors the cell state live over MQTT.

## The cell

| Component | Model / detail |
|---|---|
| PLC + HMI | B&R Power Panel 4PP481.1043-B5 (PP400), Automation Runtime E3.10 |
| I/O | X20BR9300 bus controller, X20DI9371 (12 DI), X20DO9322 (12 DO), X20AI4622, X20AO4622 |
| Robot 1 | Stäubli 4-axis SCARA (exact model: check the nameplate), programmed in VAL3 on the lab PCs, program loaded by USB drive |
| Robot 2 | Jaka Minicobo, 6-axis cobot, programmed from a PC or the cell tablet |
| Conveyors | Stäubli → Jaka (DO11) and Jaka → Stäubli (DO12) |
| Sensors | One part sensor at each robot (DI9, DI10), E-stop (DI12) |

The robots and the PLC talk only through digital I/O (handshake bits). The
full channel map is in [mqtt-contract.md](mqtt-contract.md).

## Components in this repository

```
robotcell-twin/
├── plc/ProjetoFinalRobotica/   Automation Studio 4.1 project for the cell PLC + HMI
├── src/                        Website (React + TypeScript + Vite)
├── scripts/simulate.mjs        Fake data publisher for development
└── docs/
    ├── README.md               This file
    ├── plc-program.md          How the PLC program works + known issues
    ├── robot-estimation.md     How robot motion is estimated from PLC signals
    ├── architecture.md         Website design decisions (2D/3D, stack, hosting)
    ├── mqtt-contract.md        Topics and payloads
    └── publishing-plan/        Step-by-step plan to get live cell data online
```

## How data will flow

```
Robots/sensors ──digital I/O──► PLC ──UDP (cell LAN)──► Bridge PC ──MQTT/TLS──► HiveMQ Cloud ──WSS──► Website
```

- The PLC already knows every signal. It only needs to send a small UDP packet
  to a PC on the cell network.
- The bridge PC converts it to MQTT and is the only machine that talks to the
  internet. All connections go outbound, so no public IP is needed.
- The website subscribes to the broker and draws the cell. It is read-only and
  cannot send anything to the cell.

Details and the order of work are in [publishing-plan/](publishing-plan/README.md).

## Current status

| Part | Status |
|---|---|
| PLC sequence (Jaka places → conveyor → Stäubli picks) | Exists, has known issues, see [plc-program.md](plc-program.md) |
| Website 2D view, I/O table, robot panel | Done, tested with the simulator on a local broker |
| Robot phase and joints estimated from PLC signals | Done, poses are placeholders ([robot-estimation.md](robot-estimation.md)) |
| PLC → UDP sender | Planned ([step 2](publishing-plan/02-plc-udp-sender.md)) |
| Bridge PC | Planned ([step 3](publishing-plan/03-bridge.md)) |
| Website deploy | Ready to deploy ([step 4](publishing-plan/04-website-deploy.md)) |
| 3D view with live robot joints | Future, see [architecture.md](architecture.md) |
