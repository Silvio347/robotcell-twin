# Robot motion estimated from the PLC

The robots and the PLC only exchange digital handshake signals, so the PLC
never knows where an arm is. It does know which part of its task each robot
is doing. The website uses that to animate the robots between taught poses,
with no runtime connection to the robot controllers.

Code: `src/estimator/` (engine and task definitions) and `src/model/poses.ts`.

## How it works

1. Each robot task is a loop of **segments**. A segment moves the robot along
   a list of poses and ends on a PLC signal event.
2. When the event arrives, the next segment starts from wherever the robot is
   drawn, so the animation never jumps.
3. If the robot reaches the end of a segment before the event, it holds the
   pose and the UI shows "waiting for <signal>".
4. Segment durations start from defaults and are **learned** from the
   observed time between events (moving average). After 2–3 cycles the
   animation follows the real cell speed.
5. E-stop, cell stopped (`Jaka DI2` low) or stale data freeze the robots
   where they are. When the cell runs again, each robot restarts from its
   first segment.

`Jaka DI2` is used as the "cell running" flag because the PLC holds it TRUE
during the sequence and clears it in the stop branch. `Stäubli DI13` cannot
be used: the stop branch sets it TRUE as well (known issue 3 in
[plc-program.md](plc-program.md)).

## Tasks

### Jaka Minicobo (6-axis cobot)

| Segment | Poses | Ends on |
|---|---|---|
| Home, waiting for the PLC | home | `Jaka DI3` high (PLC step 0) |
| Picking part | abovePart → pickPart → abovePart | `Jaka DO5` rises *(optional)* |
| Placing part on conveyor | aboveConveyor → placeConveyor | `Sensor Jaka` rises |
| Releasing part | placeConveyor | `Jaka DO7` rises |
| Returning home | aboveConveyor → home | `Jaka DO6` rises *(optional)* |

### Stäubli (4-axis SCARA)

| Segment | Poses | Ends on |
|---|---|---|
| Home, waiting for a part | home | `Stäubli DI12` high while `Sensor Stäubli` is on (PLC step 2) |
| Picking part from conveyor | abovePick → pick → abovePick | `Sensor Stäubli` falls, or `Stäubli DO4` rises *(optional)* |
| Placing part | abovePlace → place → abovePlace | `Stäubli DO5` rises *(optional)* |
| Returning home | home | `Stäubli DO6` rises *(optional)* |

## What is exact and what is approximate

| Item | Quality today |
|---|---|
| Which segment each robot is in | Exact at every PLC event; between events it is an estimate |
| Jaka timing up to "part on the conveyor" and release | Learned from the real cell |
| Stäubli pick timing | Learned from the real cell |
| Stäubli place and return, Jaka pick vs. place split | Fixed default durations (no PLC event) |
| Poses | **Placeholders** until real values are copied into `src/model/poses.ts` |
| Path between poses | Smooth joint interpolation, not the real trajectory |

If the PLC never sets `Stäubli DI12` (known issue 1 in
[plc-program.md](plc-program.md)), the twin shows the Stäubli waiting at
home. That matches what the real robot is being told.

## Making it more precise without robot communication

Several robot outputs are already wired to the PLC and unused by the
current robot programs. Setting them in the robot programs adds exact events
with no new hardware or network:

| Robot output | Set it when |
|---|---|
| Jaka DO5 | The gripper closes on the part |
| Jaka DO6 | The Jaka is back at home |
| Stäubli DO4 | The gripper closes on the part |
| Stäubli DO5 | The part is released at its destination |
| Stäubli DO6 | The Stäubli is back at home |

Pulse each bit (for example 200 ms) so the next cycle produces a new rising
edge. The estimator detects them automatically: once a bit has been seen, the
segment waits for it instead of advancing on time. They also need to reach
the bridge, which they do, since the UDP packet carries every input channel.

## Recording the real poses

Do this once with the cell in manual mode:

1. Move each robot to every pose listed above (or open the taught points in
   its program).
2. Jaka: copy J1–J6 in degrees from the Jaka app on the cell tablet.
3. Stäubli: on the SP2 pendant in joint mode, copy J1, J2, J4 in degrees and
   J3 in mm.
4. Write them in `src/model/poses.ts` and set `POSES_ARE_PLACEHOLDERS = false`.

The 2D view draws the Stäubli as a SCARA from J1/J2 (J3 shown as the tool
size) and the Jaka as its J1 direction. Its convention (J1 = 0 points to the
conveyor) may differ from the robot's own zero, so adjust `heading` in
`src/components/CellView2D.tsx` after entering real values.
