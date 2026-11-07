# Robot motion estimated from the PLC

The robots and the PLC only exchange digital handshake signals, so the PLC
never knows where an arm is. It does know which part of its task each robot
is doing. The website uses that to animate the robots between taught poses,
with no runtime connection to the robot controllers.

Code: `src/estimator/` (engine, task definitions, objects) and `src/model/poses.ts`.
The tasks follow the whiteboard application ([whiteboard-application.md](whiteboard-application.md)).

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
5. E-stop, cell not running (`Jaka DI2` low) or stale data freeze the
   robots where they are (a gripped object stays in the gripper). When the cell runs
   again, each robot restarts from its first segment.

## Motion inside a segment

- **Timing by motion size.** Each move gets a share of the segment time
  proportional to how long it takes at the robot's nominal joint speeds
  (`jointSpeeds` in `src/estimator/tasks.ts`). A 120 mm descent of the
  Stäubli J3 is short; a 100° swing of J1 is long.
- **Lift before travel (Stäubli).** If the SCARA has J3 down and needs to
  move J1/J2/J4, it first raises J3 to the top, then travels, then descends
  at the target. This is what the approach points of a VAL3 pick-and-place
  program do.
- **Gripper.** Each pick segment closes the gripper when it reaches the pick
  pose; the release/place segment opens it at the release pose.

- **Pen down (Stäubli drawing).** Drawing segments keep J3 where it is
  between points (`noLift`), so the pen stays on the board. Each edge of a
  square is split into several points so the joint interpolation stays
  close to the straight `movel` line of the real program.

`Jaka DI2` is the "cell running" flag: the PLC holds it TRUE only while a
cycle runs. When it drops (cycle finished or stop) the robots show **Idle**.

## Objects and ink

`src/estimator/items.ts` tracks the marker, the two parts and the ink:

| Object | Moves when |
|---|---|
| Marker: Jaka holder → Jaka gripper | Jaka gripper closes in "Picking the marker" |
| Marker: → conveyor | Jaka gripper opens on the conveyor (`Sensor Jaka` already sees it) |
| Marker: along the conveyor | Conveyor output on; speed learned from "conveyor on" → `Sensor Stäubli` |
| Marker: → Stäubli gripper → Stäubli holder | Stäubli gripper closes at the conveyor end / opens at the holder |
| Part n: source → gripper → board | Stäubli gripper closes at the source / opens at slot n |
| Ink of square n | Recorded while the Stäubli holds the marker in "Drawing square n" and its tool is at drawing height |

A new run (rising `Jaka DI3`) puts the marker back at the Jaka, the parts at
the source and clears the ink, as the operator does on the real cell.

## Tasks

### Jaka Minicobo (6-axis cobot)

| Segment | Poses | Ends on |
|---|---|---|
| Home, waiting for the PLC | home | `Jaka DI3` high (PLC step 0) |
| Picking the marker | aboveMarker → pickMarker → aboveMarker | `Jaka DO5` rises *(optional)* |
| Putting the marker on the conveyor | aboveConveyor → placeConveyor | `Sensor Jaka` rises |
| Releasing the marker | placeConveyor | `Jaka DO7` rises |
| Returning home | aboveConveyor → home | time |

### Stäubli TS60 (4-axis SCARA)

| Segment | Poses | Ends on |
|---|---|---|
| Home, waiting for the PLC | home | `Stäubli DI12` high (PLC step 0) |
| Picking part 1 | above / pick at source 1 | time |
| Placing part 1 on the board | above / place at slot 1 | `Stäubli DO6` rises *(optional)* |
| Picking part 2 | above / pick at source 2 | time |
| Placing part 2 on the board | above / place at slot 2 → home | `Stäubli DO4` rises |
| Home, waiting for the marker | home | `Stäubli DI14` high (PLC step 2) |
| Picking the marker | above / pick at the conveyor end | `Sensor Stäubli` falls |
| Drawing square 1 | square path around slot 1 | `Stäubli DO7` rises *(optional)* |
| Drawing square 2 | square path around slot 2 | `Stäubli DO7` rises *(optional)* |
| Storing the marker | above / place at the holder → home | `Stäubli DO5` rises |

## What is exact and what is approximate

| Item | Quality today |
|---|---|
| Which segment each robot is in | Exact at every PLC event; between events it is an estimate |
| Jaka marker hand-off, Stäubli "parts done", marker pick, "drawing done" | Exact (handshake signals and sensors) |
| Part 1 vs part 2, square 1 vs square 2 | Exact if the robot programs pulse `Stäubli DO6` / `DO7`, otherwise timed |
| Poses and square paths | **Placeholders** computed from the placeholder layout |
| Robot geometry | **Placeholder** link lengths, see `src/model/kinematics.ts` |
| Cell layout | **Placeholder** positions, see `src/model/layout.ts` |
| Path between poses | Joint interpolation with the SCARA lift rule, not the real trajectory |
| Ink | Follows the taught square corners, not what the pen really drew |

## Optional pulses

The pulses come from robot outputs that are already wired. Setting them in
the robot programs makes the twin exact for every part and square:

| Robot output | Pulse when |
|---|---|
| Jaka DO5 | The gripper closes on the marker |
| Stäubli DO6 | A part is released on the board |
| Stäubli DO7 | A square is finished |

Pulse each bit for about 200 ms. The estimator detects them automatically:
once a bit has been seen, its segment waits for it instead of advancing on
time. The PLC uses `Stäubli DO6` / `DO7` for the HMI counters too.

## Recording the real poses

Do this once with the cell in manual mode:

1. Move each robot to every pose listed above (or open the taught points in
   its program).
2. Jaka: copy J1–J6 in degrees from the Jaka app on the cell tablet.
3. Stäubli: on the SP2 pendant in joint mode, copy J1, J2, J4 in degrees and
   J3 in mm.
4. Write them in `src/model/poses.ts` and set `POSES_ARE_PLACEHOLDERS = false`.

## Drawing to scale

The 2D view is a top view drawn in millimetres from `src/model/layout.ts`.
Arms come from forward kinematics (`src/model/kinematics.ts`): the Stäubli
from J1/J2 (L1, L2) with the gripper rotated by J4, the Jaka from its six
joints (standard DH, UR-style). The tool height, which a top view cannot
show, is on the Z gauge next to each robot.

The placeholder poses are computed from the layout with inverse kinematics,
so the tools land on the conveyor, part source, board slots, square
corners and marker holders. With real
values the order is:

1. Measure the layout (robot bases, conveyor ends, part source, board,
   marker holders, heights) and update `src/model/layout.ts`.
2. Confirm the robot models and update the link lengths in
   `src/model/kinematics.ts` (Stäubli L1/L2/stroke, Jaka DH).
3. Copy the real poses into `src/model/poses.ts` as plain numbers.
4. If a tool does not land on its point in the drawing, the base `yaw` or a
   joint zero differs between the robot and the model: adjust `yaw` in the
   layout first.
