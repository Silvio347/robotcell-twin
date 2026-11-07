# Whiteboard application

Status: **implemented** in the PLC program, the HMI and the twin. The PLC
code and the HMI page have not been compiled yet (first build on the lab
PC). The robot programs still have to be written following the table below.

## The application

On the Stäubli table: a whiteboard, two parts and a marker holder. On the
Jaka side: the marker.

1. The Jaka picks the marker and puts it on the Jaka → Stäubli conveyor.
2. **At the same time**, the Stäubli places the two parts lying on the board.
3. The conveyor brings the marker to the Stäubli (the only use of the conveyor).
4. The Stäubli picks the marker, draws a square around each part and stores
   the marker in its holder.

For the next run the operator puts the marker back at the Jaka, takes the
parts off the board (and wipes it), then presses **Ligar**.

How it fits the assignment:

| Requirement | Fit | Check |
|---|---|---|
| Three or more pieces moved in coordination, both robots | 2 parts + marker; the Jaka and the Stäubli work in parallel in steps 1–2 | Confirm with the professor that the marker counts as a piece |
| Controlled by the PLC/HMI, 7 min maximum | One run is well under a minute | Cycle time on the HMI |
| Layout cannot change, external peripherals allowed | Whiteboard and marker holder are peripherals | |
| Repeatability and precision | Squares around the parts show precision visually | |

## Handshake rule

Every robot task uses a four-phase handshake, without timers:

1. PLC sets the command bit.
2. Robot does the task and sets its done bit.
3. PLC sees done and clears the command.
4. Robot sees the command cleared and clears done.

This gives the twin an exact event at every phase boundary.

## Signal allocation

Only signals that are already wired (Table I) are used. The PLC side is in
[plc-program.md](plc-program.md#io-mapping).

| Signal | Channel | Meaning |
|---|---|---|
| `Jaka_DI2` | DO 2 | **Enable**: TRUE while the cycle runs, FALSE on stop or E-stop |
| `Jaka_DI3` | DO 1 | **CMD**: put the marker on the conveyor |
| `Jaka_DO7` | DI 1 | **DONE**: marker on the conveyor |
| `Jaka_DO5` | DI 3 | Pulse: marker gripped (twin only, optional) |
| `Staubli_DI13` | DO 6 | **Enable** |
| `Staubli_DI12` | DO 5 | **CMD**: place the two parts on the board |
| `Staubli_DO4` | DI 5 | **DONE**: parts on the board |
| `Staubli_DI14` | DO 7 | **CMD**: pick the marker, draw the squares, store the marker |
| `Staubli_DO5` | DI 6 | **DONE**: squares drawn, marker stored |
| `Staubli_DO6` | DI 7 | Pulse: one part placed (HMI counter, twin) |
| `Staubli_DO7` | DI 8 | Pulse: one square drawn (HMI counter, twin) |
| `Sensor_Jaka` | DI 10 | Marker on the conveyor at the Jaka end |
| `Sensor_Staubli` | DI 9 | Marker arrived at the Stäubli end |
| `Esteira_JakaStaubli` | DO 12 | Carries the marker |
| `Jaka_DI1`, `Jaka_DO6`, `Staubli_DI15`, `Esteira_StaubliJaka` | | Spare |

## Robot programs

| Robot | Program |
|---|---|
| Jaka | Wait for `DI3` → pick the marker (pulse `DO5`) → place it at the conveyor start → set `DO7` → wait for `DI3` FALSE → clear `DO7` → home |
| Stäubli, command 1 | Wait for `DI12` → place part 1, pulse `DO6` → place part 2, pulse `DO6` → home → set `DO4` → wait for `DI12` FALSE → clear `DO4` |
| Stäubli, command 2 | Wait for `DI14` → pick the marker at the conveyor end → square 1 (`movel` at fixed Z), pulse `DO7` → square 2, pulse `DO7` → put the marker in its holder → home → set `DO5` → wait for `DI14` FALSE → clear `DO5` |

Pulses: about 200 ms, so the PLC (10 ms cycle) and the twin (200 ms packets)
both see them. Both robots stop when their enable input (`DI2` / `DI13`) goes
FALSE.

Practical points:

- The SCARA gripper is vertical, so the marker must stay upright: let it
  travel standing in a small carrier on the conveyor (and stand in its
  holders), tip down. The twin models it this way.
- A SCARA is a good fit for drawing: straight lines at a fixed height.
  A spring-loaded marker holder keeps the pressure even if the board is not
  perfectly flat.
- The Jaka gripper (SMC MHZ2-20D) opens about 10 mm in total, so the
  fingers must be shaped for the marker diameter.
- The Stäubli must hold both the parts and the marker. Check its gripper.

## PLC and HMI

Sequence, HMI page and variables: [plc-program.md](plc-program.md#sequence).

## In the twin

See [robot-estimation.md](robot-estimation.md). In short: the website
follows the same tasks from the PLC signals, shows the marker on the
conveyor and in the grippers, the parts on the board, and draws the ink of
the squares while the Stäubli draws. The ink follows the taught square
corners, not what is really on the board: the twin knows when a square
starts and ends, not whether the pen touched.
