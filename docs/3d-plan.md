# Plan: 3D view

Status: plan only, nothing implemented yet.

## What already exists and is reused

The 3D view only replaces the drawing. Everything it needs is already
computed for the 2D view:

| Need | Source today |
|---|---|
| Joint values per robot (live or estimated) | `useRobotView` (`src/hooks/useRobotView.ts`) |
| Gripper state, phase, progress | `RobotEstimate` from `src/estimator/engine.ts` |
| Marker, parts, ink of the squares | `ItemsEstimate` from `src/estimator/items.ts` |
| Cell geometry in mm | `src/model/layout.ts` |
| Link lengths, forward kinematics | `src/model/kinematics.ts` |
| Conveyor, sensor, E-stop state | PLC snapshot in the store |

The 2D view stays as a second tab ("Top view"). It is useful for reading
signals and does not need WebGL.

## Stack

- `three` + `@react-three/fiber` (React renderer for Three.js) +
  `@react-three/drei` (camera controls, labels, loaders).
- Current versions (`@react-three/fiber` 9, `drei` 10) require **React 19**.
  The project is on React 18. Two options:

  | Option | Pros | Cons |
  |---|---|---|
  | Upgrade to React 19, use R3F 9 / drei 10 | Current, maintained versions | One extra PR; check every dependency (zustand 5 already supports React 19) |
  | Stay on React 18, use R3F 8 / drei 9 | No upgrade | Older major versions, upgrade later anyway |

  **Recommendation:** upgrade React first in its own small PR. The app has
  very few dependencies, so the risk is low.
- Load the 3D view with `React.lazy` so the 2D view and the connect screen
  stay light. Three.js adds roughly 600 kB to a bundle that is already 510 kB.
- `urdf-loader` only if a usable URDF exists (see "Robot models").

## Coordinate frames

`layout.ts` uses millimetres, z up, origin at the Stäubli base. Three.js uses
y up and the scene works best in metres. One wrapper group converts both
(scale 0.001, rotate -90° around x). Every other 3D component keeps using the
layout coordinates in mm, so the 2D and 3D views always agree.

## Robot models

Three levels of fidelity. Every level uses the same joint values, so moving
between them replaces only the mesh.

| Level | What | Assets | When |
|---|---|---|---|
| 0. Primitives | Cylinders and boxes built from the link lengths in `kinematics.ts` | None | Now: works with placeholder geometry |
| 1. Vendor CAD | Real shapes from the manufacturers' CAD (STEP), split per link and converted to GLB | Download from Stäubli / JAKA, convert in FreeCAD or Blender | After the exact models are confirmed |
| 2. URDF | Load a robot description with `urdf-loader` | A URDF with meshes we may publish | Only if a licensed one exists |

Models in the cell (from the nameplates):

| Item | Model | What it means for 3D |
|---|---|---|
| Stäubli | **TS60** SCARA, the generation before the TS2-60 (8.4 kg, 620 mm reach) | Simple shape: base column, two horizontal arms, vertical quill. Level 0 primitives already look close to the real robot. The current placeholder reach (320 + 300 mm) matches 620 mm; the split and the J3 stroke still need the TS60 manual or nameplate |
| Jaka | JAKA MiniCobo (from the photo) | Six links; primitives look like a generic cobot, CAD makes the biggest visual difference here |
| Jaka gripper | `RMHZ2-20D-...` matches the SMC **MHZ2-20D** pneumatic parallel gripper (20 mm bore, double acting, about 10 mm total jaw stroke) | Jaws can open and close with the estimated gripper state. SMC publishes CAD for this series |

`RMHZ2-20D-091N` is not a robot model: it is the gripper's part number.
Confirm it was read on the Jaka's tool and whether the Stäubli has its own
gripper (it must hold the parts and the marker, see
[whiteboard-application.md](whiteboard-application.md)).

What is available publicly:

- **Stäubli TS60 (SCARA):** the ROS-Industrial `staubli` repository
  (Apache-2.0) only covers 6-axis models (RX160, TX90). No SCARA URDF was
  found. Stäubli offers CAD files on its website; the TS60 is an older model,
  so it may only be available on request. Check the download terms before
  publishing converted meshes in a public repository.
- **JAKA MiniCobo:** community ROS repositories on GitHub have MiniCobo URDFs
  and meshes, but the ones found have **no license**. They can be read to
  check joint offsets, but their meshes cannot be copied into this public
  repository. JAKA's official download area may have CAD files.
- **SMC MHZ2-20D:** CAD from SMC's online catalogue.

**Recommendation:** level 0 first, level 1 once the models and CAD terms are
confirmed.

### Joint zero and direction

A robot's joint zero and positive direction may not match the model. With
real poses from the pendants, the 3D arm will only look right if each joint
is mapped. Add a per-robot table to `src/model/robots.ts`:

```ts
// model angle = sign * controller angle + offset
jointMap: [{ sign: 1, offset: 0 }, ...]
```

Fill it in by putting the real robot at a known pose (for example all joints
at 0) and comparing with the model.

### Stäubli mount

The cell photo shows the Stäubli on a raised C-shaped stand, not on the table
top. The base height must be measured and added to the layout (`z` of the
mount), otherwise J3 heights will be wrong in 3D.

## Scene contents

For the whiteboard application the scene changes as described in
[whiteboard-application.md](whiteboard-application.md#in-the-twin): marker
instead of a part on the belt, two parts lying on the board, and the ink of
the squares drawn on the board as the Stäubli moves.

| Element | Driven by |
|---|---|
| Table, robot stand, part source, destination fixture | `layout.ts` (static) |
| Two conveyors, belt texture scrolls while the output is on | `Conveyor Jaka → Stäubli`, `Conveyor Stäubli → Jaka` |
| Belt sensors, emitter glows when on | `Sensor Jaka`, `Sensor Stäubli` |
| Robots | Joint values (live or estimated) |
| Part in a gripper, attached to the tool frame | `RobotEstimate.holding` |
| Marker on the conveyor, in a gripper or in a holder | `ItemsEstimate.marker`, `.belt` |
| Parts at the source, in the Stäubli gripper or on the board | `ItemsEstimate.parts` |
| Ink of the squares on the board | `ItemsEstimate.ink` |
| Phase labels above each robot | `RobotEstimate.phase` (drei `Html`) |
| E-stop: red frame and tint | Emergency input |
| No data: greyed scene and message | Staleness, as in 2D |
| Camera presets: overview, Stäubli, Jaka; orbit controls | UI |

## Smooth motion

The estimator runner updates the store every 100 ms. That is fine for SVG
but looks choppy at 60 fps in 3D. Plan:

- Keep the engine pure.
- Expose the estimator state (not only the computed joints) to the 3D view.
- In each frame (`useFrame`), call `jointsAt(task, state, now)` and write
  the joint rotations straight to the Three.js objects through refs, without
  React re-renders.

Live joints from the robot controllers (if ever published) are interpolated
the same way between messages.

## Checks

- The tool tip from forward kinematics must be in the same place in 2D and
  3D for every pose.
- Compare a screenshot with a cell photo from the same angle (match the
  camera to the photo).
- Frame rate on a laptop and on a phone. Limit pixel ratio and turn off
  shadows on small screens if needed.

## Steps (one PR each)

1. `chore`: upgrade to React 19 (or decide to stay on R3F 8).
2. `feat(estimator)`: expose estimator state for per-frame joints.
3. `feat(3d)`: lazy-loaded 3D tab with frames, table, conveyors, sensors and camera presets.
4. `feat(3d)`: level 0 robots from the kinematics, joint map table.
5. `feat(3d)`: parts, gripper attachment, E-stop and stale states.
6. `feat(3d)`: level 1 GLB models, once the models are confirmed.
7. `docs`: README table and robot-estimation.md updates at each step.

Steps 1–5 do not depend on the robot models. If the whiteboard application
is adopted, adapt the twin to it in 2D first (it reuses everything and shows
the ink in the top view), then build the 3D view on top.

## Needed from the cell

| Item | Used for |
|---|---|
| Stäubli TS60 arm lengths and J3 stroke (manual or nameplate), JAKA MiniCobo version | Link lengths, CAD download |
| Whether the vendor CAD files may be published | Level 1 in a public repository |
| Photos from 2–3 angles and a few measurements (bases, stand height, conveyor ends, table) | Layout and camera matching |
| Gripper on the Stäubli (the Jaka has the SMC MHZ2-20D) | Tool model and grip point |
| One real pose per robot with all joint values | Joint map table |
