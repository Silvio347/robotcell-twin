// Taught poses of each robot, in joint space. The estimator moves the robots
// between these poses following the PLC signals (see src/estimator/tasks.ts).
//
// PLACEHOLDER VALUES, computed from the placeholder layout (src/model/layout.ts)
// with the inverse kinematics in src/model/kinematics.ts. Replace each entry
// with the real joint values written as plain numbers:
//   - Jaka: jog to each point (or open the taught point) in the Jaka app on the
//     cell tablet and copy J1..J6 in degrees.
//   - Stäubli: on the SP2 pendant, jog in joint mode to each point (or check the
//     VAL3 point) and copy J1, J2, J4 in degrees and J3 in mm.
// Then set POSES_ARE_PLACEHOLDERS to false.

import { jakaIkDown, scaraIk } from './kinematics';
import { LAYOUT, toRobotFrame, type Point2, type Point3 } from './layout';

export type Pose = readonly number[];

export const POSES_ARE_PLACEHOLDERS = true;

const { approach, part } = LAYOUT;
const beltTop = LAYOUT.conveyors.jakaToStaubli.height;
/** Tool flange height when holding a part whose bottom sits at `surface`. */
const grip = (surface: number) => surface + part.height;
const at = (p: Point2, z: number): Point3 => ({ x: p.x, y: p.y, z });

const staubli = (p: Point3) => scaraIk(toRobotFrame('staubli', p));
const jaka = (p: Point3) => jakaIkDown(toRobotFrame('jaka', p));

const staubliPick = LAYOUT.conveyors.jakaToStaubli.to;
const staubliPlace = LAYOUT.staubliDestination;
const jakaPick = LAYOUT.jakaSource;
const jakaPlace = LAYOUT.conveyors.jakaToStaubli.from;

/** Jaka Minicobo, [J1..J6] in degrees. */
export const JAKA_POSES = {
  home: jaka(LAYOUT.jakaHome),
  abovePart: jaka(at(jakaPick, grip(jakaPick.z) + approach)),
  pickPart: jaka(at(jakaPick, grip(jakaPick.z))),
  aboveConveyor: jaka(at(jakaPlace, grip(beltTop) + approach)),
  placeConveyor: jaka(at(jakaPlace, grip(beltTop))),
} satisfies Record<string, Pose>;

/** Stäubli SCARA, [J1 deg, J2 deg, J3 mm, J4 deg]. J3 = 0 is fully up. */
export const STAUBLI_POSES = {
  home: staubli(at(LAYOUT.staubliHome, 250)),
  abovePick: staubli(at(staubliPick, 250)),
  pick: staubli(at(staubliPick, grip(beltTop))),
  abovePlace: staubli(at(staubliPlace, 250)),
  place: staubli(at(staubliPlace, grip(staubliPlace.z))),
} satisfies Record<string, Pose>;
