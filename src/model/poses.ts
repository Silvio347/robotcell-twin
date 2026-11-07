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

import { jakaIkDown, SCARA, scaraIk } from './kinematics';
import { LAYOUT, PART_HEIGHT, plateHole, toRobotFrame, type Point2, type Point3 } from './layout';

export type Pose = readonly number[];

export const POSES_ARE_PLACEHOLDERS = true;

const { approach, part, plate, marker, board } = LAYOUT;
const beltTop = LAYOUT.conveyors.jakaToStaubli.height;
const top = SCARA.zTop;
const at = (p: Point2, z: number): Point3 => ({ x: p.x, y: p.y, z });

const staubli = (p: Point3) => scaraIk(toRobotFrame('staubli', p));
const jaka = (p: Point3) => jakaIkDown(toRobotFrame('jaka', p));

/** Gripper tip height with the fingers inside the plate's grip hole, plate lying on `surface`. */
const plateGrip = (surface: number) => surface + plate.thickness / 2;
/** Gripper tip height that grips a part by the middle of its head; the part stands on `surface`. */
const partGrip = (surface: number) => surface + PART_HEIGHT - part.headHeight / 2;
/** Gripper tip height that grips the upright marker standing on `surface`. */
const markerGrip = (surface: number) => surface + marker.standOffset + marker.tipReach;
/** Gripper tip height while the marker tip touches the board. */
export const DRAW_Z = board.z + marker.tipReach;

const plateStart = LAYOUT.jakaPlateStart;
const beltStart = LAYOUT.conveyors.jakaToStaubli.from;
const beltEnd = LAYOUT.conveyors.jakaToStaubli.to;
const spot = LAYOUT.staubliPlateSpot;
const holder = LAYOUT.staubliMarkerHolder;
/** A part in the plate stands on the plate's bottom surface. */
const holeA = plateHole(spot, plate.partHoles[0]!);
const holeB = plateHole(spot, plate.partHoles[1]!);
const [slot1, slot2] = LAYOUT.boardSlots as [Point2, Point2];

/** Jaka Minicobo, [J1..J6] in degrees. */
export const JAKA_POSES = {
  home: jaka(LAYOUT.jakaHome),
  abovePlate: jaka(at(plateStart, plateGrip(plateStart.z) + approach)),
  pickPlate: jaka(at(plateStart, plateGrip(plateStart.z))),
  aboveConveyor: jaka(at(beltStart, plateGrip(beltTop) + approach)),
  placeConveyor: jaka(at(beltStart, plateGrip(beltTop))),
} satisfies Record<string, Pose>;

/** Stäubli SCARA, [J1 deg, J2 deg, J3 mm, J4 deg]. J3 = 0 is fully up. */
export const STAUBLI_POSES = {
  home: staubli(at(LAYOUT.staubliHome, top)),
  abovePickPlate: staubli(at(beltEnd, top)),
  pickPlate: staubli(at(beltEnd, plateGrip(beltTop))),
  abovePlateSpot: staubli(at(spot, top)),
  placePlate: staubli(at(spot, plateGrip(spot.z))),
  aboveHole1: staubli(at(holeA, top)),
  pickHole1: staubli(at(holeA, partGrip(spot.z))),
  aboveHole2: staubli(at(holeB, top)),
  pickHole2: staubli(at(holeB, partGrip(spot.z))),
  aboveSlot1: staubli(at(slot1, top)),
  placeSlot1: staubli(at(slot1, partGrip(board.z))),
  aboveSlot2: staubli(at(slot2, top)),
  placeSlot2: staubli(at(slot2, partGrip(board.z))),
  aboveHolder: staubli(at(holder, top)),
  pickHolder: staubli(at(holder, markerGrip(holder.z))),
} satisfies Record<string, Pose>;

const EDGE_STEPS = 4;

/**
 * Path that draws a square around `centre`: approach above the first corner,
 * pen down, the four edges (several points per edge so the joint
 * interpolation stays close to a straight line), pen up.
 */
function squarePath(centre: Point2): Pose[] {
  const h = LAYOUT.squareHalf;
  const corners: Point2[] = [
    { x: centre.x - h, y: centre.y - h },
    { x: centre.x + h, y: centre.y - h },
    { x: centre.x + h, y: centre.y + h },
    { x: centre.x - h, y: centre.y + h },
  ];
  const first = corners[0]!;
  const path: Pose[] = [staubli(at(first, DRAW_Z + 40)), staubli(at(first, DRAW_Z))];
  for (let c = 0; c < 4; c++) {
    const a = corners[c]!;
    const b = corners[(c + 1) % 4]!;
    for (let k = 1; k <= EDGE_STEPS; k++) {
      const t = k / EDGE_STEPS;
      path.push(staubli(at({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, DRAW_Z)));
    }
  }
  path.push(staubli(at(first, DRAW_Z + 40)));
  return path;
}

/** Drawing paths for the squares around part 1 and part 2. */
export const STAUBLI_SQUARES: readonly [Pose[], Pose[]] = [squarePath(slot1), squarePath(slot2)];
