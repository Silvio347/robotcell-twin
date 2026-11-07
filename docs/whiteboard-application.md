# Whiteboard application

Status: **implemented** in the PLC program, the HMI and the twin. The PLC
code and the HMI page have not been compiled yet (first build on the lab
PC). The robot programs still have to be written following the table below.

## The application

On the Jaka side: a plate with 3 holes; two parts stand in holes 1 and 3,
the middle hole stays free. On the Stäubli table: a stand for the plate, a
whiteboard and the marker in its holder.

1. The Jaka picks the plate and puts it on the Jaka → Stäubli conveyor.
2. The conveyor brings the plate to the Stäubli (the only use of the conveyor).
3. The Stäubli puts the plate on its stand, then takes each part out of the
   plate and stands it on the board.
4. The Stäubli picks the marker, draws a square around each part and puts
   the marker back in its holder.

The parts are "big-head" parts: a body that fits the plate hole and a
slightly wider head that rests on the plate. They stay upright the whole
time (the Stäubli gripper is vertical) and are gripped by the head.

For the next run the operator puts the plate with the two parts back at the
Jaka, takes the parts off the board and wipes it, then presses **Ligar**.

How it fits the assignment:

| Requirement | Fit | Check |
|---|---|---|
| Three or more pieces moved in coordination, both robots | Plate + 2 parts + marker; the plate goes from one robot to the other | Confirm with the professor that the plate and the marker count as pieces |
| Controlled by the PLC/HMI, 7 min maximum | One run is well under a minute | Cycle time on the HMI |
| Layout cannot change, external peripherals allowed | Plate, plate stand, whiteboard and marker holder are peripherals | |
| Repeatability and precision | Parts taken from holes and squares drawn around them show precision visually | |

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
| `Jaka_DI3` | DO 1 | **CMD**: put the plate on the conveyor |
| `Jaka_DO7` | DI 1 | **DONE**: plate on the conveyor |
| `Jaka_DO5` | DI 3 | Pulse: plate gripped (twin only, optional) |
| `Staubli_DI13` | DO 6 | **Enable** |
| `Staubli_DI12` | DO 5 | **CMD**: take the plate, put it on the stand, put both parts on the board |
| `Staubli_DO4` | DI 5 | **DONE**: parts on the board |
| `Staubli_DI14` | DO 7 | **CMD**: pick the marker, draw the squares, put the marker back |
| `Staubli_DO5` | DI 6 | **DONE**: squares drawn, marker stored |
| `Staubli_DO6` | DI 7 | Pulse: one part placed on the board (HMI counter, twin) |
| `Staubli_DO7` | DI 8 | Pulse: one square drawn (HMI counter, twin) |
| `Sensor_Jaka` | DI 10 | Plate on the conveyor at the Jaka end |
| `Sensor_Staubli` | DI 9 | Plate arrived at the Stäubli end |
| `Esteira_JakaStaubli` | DO 12 | Carries the plate |
| `Jaka_DI1`, `Jaka_DO6`, `Staubli_DI15`, `Esteira_StaubliJaka` | | Spare |

## Robot programs

| Robot | Program |
|---|---|
| Jaka | Wait for `DI3` → pick the plate (pulse `DO5`) → place it at the conveyor start → set `DO7` → wait for `DI3` FALSE → clear `DO7` → home |
| Stäubli, command 1 | Wait for `DI12` → pick the plate at the conveyor end → put it on the stand → part 1: hole → board, pulse `DO6` → part 2: hole → board, pulse `DO6` → home → set `DO4` → wait for `DI12` FALSE → clear `DO4` |
| Stäubli, command 2 | Wait for `DI14` → pick the marker → square 1 (`movel` at fixed Z), pulse `DO7` → square 2, pulse `DO7` → put the marker back → home → set `DO5` → wait for `DI14` FALSE → clear `DO5` |

Pulses: about 200 ms, so the PLC (10 ms cycle) and the twin (200 ms packets)
both see them. Both robots stop when their enable input (`DI2` / `DI13`) goes
FALSE.

Practical points:

- **Gripping the plate.** The Jaka gripper (SMC MHZ2-20D) opens about 10 mm
  in total, so it cannot close around a 60 mm plate. The twin assumes both
  robots take the plate by the free middle hole with the fingers opening
  inside it (internal grip). Other options: a small handle or tab on the
  plate. Whatever is chosen, the same grip has to work for the Stäubli.
- **Plate stand.** The stand on the Stäubli table must be high enough for
  the J3 stroke (the twin uses 30 mm) and should locate the plate (pins or a
  pocket), so the parts are always in the same place for the pick.
- **Parts.** Hole diameter a little larger than the body, so the parts drop
  in and come out without jamming; the head keeps them at a fixed height.
- **Drawing.** A SCARA is a good fit: straight lines at a fixed height. A
  spring-loaded marker holder on the gripper keeps the pressure even if the
  board is not perfectly flat.
- The Stäubli must hold the plate, the parts and the marker. Check its gripper.

## PLC and HMI

Sequence, HMI page and variables: [plc-program.md](plc-program.md#sequence).

## In the twin

See [robot-estimation.md](robot-estimation.md). In short: the website
follows the same tasks from the PLC signals, shows the plate and its parts
on the conveyor and in the grippers, the parts standing on the board, and
draws the ink of the squares while the Stäubli draws. The ink follows the
taught square corners, not what is really on the board: the twin knows when
a square starts and ends, not whether the pen touched.
