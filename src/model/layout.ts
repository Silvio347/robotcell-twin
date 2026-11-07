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
  /** Parts lie flat; the gripper holds them by the top face. */
  part: { size: 40, height: 20 },
  /**
   * The marker always stands upright, tip down, in a small carrier (on the
   * conveyor) or holder, so the vertical SCARA gripper can take it and draw.
   * tipReach: how far the tip sticks out below the gripper tip.
   * standOffset: tip height above the surface while it stands in a carrier.
   */
  marker: { length: 130, diameter: 18, tipReach: 60, standOffset: 5, carrier: 40 },
  /** Whiteboard on the Stäubli table (centre, size, top surface height). */
  board: { x: -200, y: 300, width: 300, depth: 200, z: 5 },
  /** Part centres on the board; a square is drawn around each one. */
  boardSlots: [
    { x: -270, y: 300 },
    { x: -130, y: 300 },
  ],
  /** Half side of the drawn squares. */
  squareHalf: 45,
  /** Where the Stäubli picks the two parts. */
  partSource: [
    { x: 250, y: 330 },
    { x: 360, y: 290 },
  ],
  /** Marker holder on the Jaka side (start) and on the Stäubli side (end). */
  jakaMarkerHolder: { x: 1500, y: -380, z: 0 },
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
