# MQTT contract

All topics live under a configurable prefix (default `robotcell`), separate
from Fluxio's `device/<id>/...` topics on the same HiveMQ broker.

The website only **subscribes** (`robotcell/#`). Nothing in this project
publishes commands to the cell.

| Topic | Publisher | Retained | Rate |
|---|---|---|---|
| `robotcell/plc/io` | PLC or OPC UA bridge | no | on change + heartbeat ≤ 1 s |
| `robotcell/source/status` | PLC or bridge (also its Last Will) | yes | on connect / disconnect |
| `robotcell/jaka/state` | robot bridge (future) | no | 5–20 Hz |
| `robotcell/staubli/state` | robot bridge (future) | no | 5–20 Hz |

The website marks data older than 5 s as stale, so the publisher must send
`plc/io` at least once per second even when nothing changes.

## `robotcell/plc/io`

```json
{ "ts": 1793790000000, "di": [false, false, true, false, false, false, false, false, false, true, false, true], "do": [false, false, false, false, true, false, false, false, false, false, true, false] }
```

- `di`: exactly 12 values, X20DI9371 channels 1..12 (index 0 = channel 1).
- `do`: exactly 12 values, X20DO9322 channels 1..12.
- Values may be `true`/`false` or `1`/`0`.
- `ts` (optional): milliseconds since epoch at the publisher.
- `step`, `count`, `running` (optional, planned): the PLC's `Etapa`,
  `iContador` and `Ligar`. Sent by the bridge
  ([step 3](publishing-plan/03-bridge.md)); the website does not show them yet
  and ignores them.

Channel meaning (Table I of the cell handout):

| Ch | X20DI9371 (input) | X20DO9322 (output) |
|---|---|---|
| 1 | Jaka DO7 | Jaka DI3 |
| 2 | Jaka DO6 | Jaka DI2 |
| 3 | Jaka DO5 | Jaka DI1 |
| 4 | spare | spare |
| 5 | Stäubli DO4 | Stäubli DI12 |
| 6 | Stäubli DO5 | Stäubli DI13 |
| 7 | Stäubli DO6 | Stäubli DI14 |
| 8 | Stäubli DO7 | Stäubli DI15 |
| 9 | Sensor Stäubli | spare |
| 10 | Sensor Jaka | spare |
| 11 | spare | Conveyor Stäubli → Jaka |
| 12 | Emergency stop | Conveyor Jaka → Stäubli |

The emergency input is `true` when the cell is safe. The PLC program only runs
the cycle when `Ligar AND Emergencia` (see `EMERGENCY_ACTIVE_LOW` in
`src/model/cell.ts`).

## `robotcell/source/status`

Plain text: `online`, `offline` or `simulated`. The publisher sets its MQTT
Last Will to `offline` (retained) so the website knows when the source drops.

## `robotcell/<robot>/state`

```json
{ "ts": 1793790000000, "joints": [0.0, 90.0, -45.0, 0.0, 30.0, 0.0], "mode": "auto" }
```

- `joints`: joint positions base to flange. The count must match the robot,
  otherwise the message is dropped:
  - `jaka`: 6 values, degrees.
  - `staubli` (4-axis SCARA): 4 values, `[J1 °, J2 °, J3 mm, J4 °]`.
- `mode` (optional): free text.

Nothing publishes these topics yet. Until something does, the website
estimates the joints from the PLC I/O ([robot-estimation.md](robot-estimation.md)).
Fresh live joints always take priority over the estimate.
