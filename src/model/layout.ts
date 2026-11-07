// Cell layout seen from above, in millimetres.
// Every Stäubli point is kept between -90° and +135° around its base so the
// joint interpolation never wraps through ±180°.
// Origin at the Stäubli base, +x towards the Jaka, z up from the table top.
//
// PLACEHOLDER VALUES: chosen so both robots can reach their points, not
// measured on the cell. Measure the real positions and set
// LAYOUT_IS_PLACEHOLDER to false.

import type { RobotId } from './cell';

export interface Point2 {
  x: number;
  y: number;
}

export interface Point3 extends Point2 {
  z: number;
}

export interface RobotMount extends Point2 {
  /** Rotation of the robot base frame around z, degrees counter-clockwise. */
  yaw: number;
}

export interface ConveyorLayout {
  /** Belt centre line, in the direction the belt moves. */
  from: Point2;
  to: Point2;
  width: number;
  /** Belt surface height above the table. */
  height: number;
}

export const LAYOUT_IS_PLACEHOLDER = true;

export const LAYOUT = {
  /** Area drawn in the 2D view. */
  bounds: { minX: -650, maxX: 2050, minY: -650, maxY: 650 },
  robots: {
    staubli: { x: 0, y: 0, yaw: 0 },
    jaka: { x: 1500, y: 0, yaw: 0 },
  } satisfies Record<RobotId, RobotMount>,
  conveyors: {
    jakaToStaubli: { from: { x: 1150, y: -150 }, to: { x: 450, y: -150 }, width: 100, height: 100 },
    staubliToJaka: { from: { x: 450, y: 150 }, to: { x: 1150, y: 150 }, width: 100, height: 100 },
  } satisfies Record<string, ConveyorLayout>,
  /**
   * "Big-head" part: a body that fits a plate hole and a slightly wider head
   * that rests on the plate. It always stands upright (the SCARA gripper is
   * vertical) and is gripped by the head.
   */
  part: { headDiameter: 30, headHeight: 12, bodyDiameter: 24, bodyHeight: 20 },
  /**
   * Plate with 3 holes in a row (along x) that carries the parts from the
   * Jaka to the Stäubli. partHoles: holes of part 1 and part 2. gripHole: the
   * free hole where both grippers take the plate, fingers opening inside it
   * (internal grip), which suits the short stroke of the Jaka gripper.
   */
  plate: { length: 150, width: 60, thickness: 20, holePitch: 45, partHoles: [0, 2], gripHole: 1 },
  /** Marker standing tip down in its holder; tipReach = tip below the gripper tip. */
  marker: { length: 130, diameter: 18, tipReach: 60, standOffset: 5 },
  /** Whiteboard on the Stäubli table (centre, size, top surface height). */
  board: { x: -200, y: 300, width: 300, depth: 200, z: 5 },
  /** Part centres on the board; a square is drawn around each one. */
  boardSlots: [
    { x: -270, y: 300 },
    { x: -130, y: 300 },
  ],
  /** Half side of the drawn squares. */
  squareHalf: 45,
  /** Plate centre at the start (Jaka table) and on the Stäubli stand (z = stand top). */
  jakaPlateStart: { x: 1500, y: -380, z: 0 },
  staubliPlateSpot: { x: 280, y: 330, z: 30 },
  /** Marker holder on the Stäubli table (start and end of every run). */
  staubliMarkerHolder: { x: 150, y: -380, z: 40 },
  /** Approach height above pick and place points. */
  approach: 80,
  /** Tool positions at home. */
  staubliHome: { x: 350, y: 100 },
  jakaHome: { x: 1300, y: 200, z: 300 },
};

const rad = (deg: number) => (deg * Math.PI) / 180;

export function toCellFrame(robot: RobotId, p: Point3): Point3 {
  const m: RobotMount = LAYOUT.robots[robot];
  const c = Math.cos(rad(m.yaw));
  const s = Math.sin(rad(m.yaw));
  return { x: m.x + c * p.x - s * p.y, y: m.y + s * p.x + c * p.y, z: p.z };
}

export function toRobotFrame(robot: RobotId, p: Point3): Point3 {
  const m: RobotMount = LAYOUT.robots[robot];
  const c = Math.cos(rad(m.yaw));
  const s = Math.sin(rad(m.yaw));
  const dx = p.x - m.x;
  const dy = p.y - m.y;
  return { x: c * dx + s * dy, y: -s * dx + c * dy, z: p.z };
}

/** Centre of hole `hole` (0..2) of a plate whose centre is at `centre`. */
export function plateHole(centre: Point2, hole: number): Point2 {
  return { x: centre.x + (hole - 1) * LAYOUT.plate.holePitch, y: centre.y };
}

/** Total height of a standing part. */
export const PART_HEIGHT = LAYOUT.part.bodyHeight + LAYOUT.part.headHeight;
