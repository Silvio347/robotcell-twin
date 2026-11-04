# Website architecture and decisions

How data reaches the broker is covered in [publishing-plan/](publishing-plan/README.md).
This document covers the website itself.

## Decision: 2D first, 3D second (same stack)

The first data source is the PLC, and the PLC only sees 24 digital signals
(handshake bits, two sensors, two conveyors, E-stop). It has no joint angles,
so a 3D arm would have nothing real to move.

- **Now (2D):** an SVG schematic driven by the PLC I/O. It is useful as soon
  as the PLC publishes, and it stays useful later as the "signals" view.
- **Later (3D):** add a Three.js scene (React Three Fiber). Two ways to move the arms:
  1. **Taught points + PLC steps (approximate):** implemented in
     `src/estimator/`, see [robot-estimation.md](robot-estimation.md). It
     already drives the 2D arms; the 3D view can reuse the same joints.
  2. **Live joints (exact):** read the joint positions from the robot
     controllers and publish `robotcell/<robot>/state`. The Jaka controller
     has a TCP/IP interface that reports joint positions, and a VAL3 program
     can stream the Stäubli joints over a TCP socket. The bridge PC forwards
     both to MQTT.

  Robot models: public URDF/mesh packages exist for Jaka and Stäubli arms
  (ROS). Pick the exact model from the photos. `urdf-loader` loads URDF into
  Three.js directly.

The state model and MQTT contract already include joint data, so adding 3D is
a new view, not a rewrite.

## Decision: TypeScript + React + Vite

- Three.js and React Three Fiber are the most mature options for 3D in a browser.
  Flutter Web (used in Fluxio) has no comparable 3D ecosystem.
- `mqtt.js` connects to HiveMQ over secure WebSockets from the browser.
- The output is a static site, so it deploys unchanged to Netlify or Firebase Hosting.

## Decision: hosting

Both work with no code change (`netlify.toml` and `firebase.json` are included).
Firebase Hosting fits slightly better if you later want a Cloud Function that
hands out MQTT credentials after login, the way Fluxio's backend does.

## Credentials in the browser

A static site cannot keep a secret: anything in `VITE_*` ends up in the
public bundle. The broker URL is a build-time default. The username and
password are typed into the page at runtime, and the password is never stored.
The website uses its own subscribe-only credential (see
[publishing-plan/01-network-and-broker.md](publishing-plan/01-network-and-broker.md)).

## Code layout

| Path | Role |
|---|---|
| `src/model/cell.ts` | Cell I/O map (Table I) |
| `src/model/messages.ts` | Payload parsing and validation. Malformed messages are dropped |
| `src/mqtt/` | Topic names and the single broker connection (subscribe only) |
| `src/model/robots.ts`, `src/model/poses.ts` | Robot axes/units and taught poses |
| `src/model/layout.ts`, `src/model/kinematics.ts` | Cell layout in mm and robot forward/inverse kinematics |
| `src/estimator/` | Robot phase, joints, gripper and part position estimated from PLC I/O |
| `src/sim/demo.ts` | In-browser demo cycle (no broker) |
| `src/state/store.ts` | App state (zustand) |
| `src/components/` | 2D cell view, I/O table, joint panel, connect form, status bar |

Data older than 5 s is shown as stale, so a frozen publisher is visible
instead of showing old values as if they were live.

## Safety

The twin is read-only by design. If commands from the web are ever added,
they must go through the PLC with interlocks and confirmation, never straight
to the robots.
