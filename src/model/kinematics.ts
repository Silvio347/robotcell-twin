// Forward kinematics for drawing, and inverse kinematics used only to
// compute the placeholder poses from the layout (src/model/poses.ts).
// All positions in mm in the robot base frame, joints as in src/model/robots.ts.
//
// PLACEHOLDER GEOMETRY until the exact models are confirmed:
//   - Stäubli TS60 SCARA: 620 mm reach from the datasheet. The split between
//     arm 1 and arm 2, the 200 mm stroke and the tool height are guesses.
//   - Jaka MiniCobo: 580 mm reach from jaka.com. Link lengths are a guess with
//     the UR-style layout JAKA arms use (standard DH).

import type { Point3 } from './layout';

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

// ---------------------------------------------------------------- Stäubli

export const SCARA = {
  l1: 320,
  l2: 300,
  /** Gripper tip height above the table with J3 fully up (robot on its stand). */
  zTop: 220,
  stroke: 200,
  /** Elbow side used by the IK: +1 = J2 positive. */
  elbow: 1 as 1 | -1,
};

export interface ScaraFk {
  elbow: Point3;
  tool: Point3;
  /** Tool rotation seen from above, degrees. */
  toolYaw: number;
}

export function scaraFk(q: readonly number[]): ScaraFk {
  const [q1 = 0, q2 = 0, q3 = 0, q4 = 0] = q;
  const a = rad(q1);
  const b = rad(q1 + q2);
  const elbow = { x: SCARA.l1 * Math.cos(a), y: SCARA.l1 * Math.sin(a), z: SCARA.zTop };
  return {
    elbow,
    tool: { x: elbow.x + SCARA.l2 * Math.cos(b), y: elbow.y + SCARA.l2 * Math.sin(b), z: SCARA.zTop - q3 },
    toolYaw: q1 + q2 + q4,
  };
}

/** Joints that put the tool at `p` (base frame) with the given tool yaw. */
export function scaraIk(p: Point3, toolYaw = 0): number[] {
  const { l1, l2 } = SCARA;
  const r2 = p.x * p.x + p.y * p.y;
  const c2 = (r2 - l1 * l1 - l2 * l2) / (2 * l1 * l2);
  if (c2 < -1 || c2 > 1) throw new Error(`Stäubli cannot reach (${p.x}, ${p.y})`);
  const q2 = SCARA.elbow * Math.acos(c2);
  const q1 = Math.atan2(p.y, p.x) - Math.atan2(l2 * Math.sin(q2), l1 + l2 * Math.cos(q2));
  const q3 = SCARA.zTop - p.z;
  if (q3 < 0 || q3 > SCARA.stroke) throw new Error(`Stäubli J3 out of stroke for z=${p.z}`);
  return [deg(q1), deg(q2), q3, toolYaw - deg(q1) - deg(q2)];
}

// ---------------------------------------------------------------- Jaka

/** Standard DH, UR-style (negative a2/a3). */
export const JAKA_DH = {
  d: [150, 0, 0, 90, 90, 80],
  a: [0, -240, -200, 0, 0, 0],
  alpha: [Math.PI / 2, 0, 0, Math.PI / 2, -Math.PI / 2, 0],
};

type Mat4 = number[]; // row-major 4x4

function mul(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) out[r * 4 + c]! += a[r * 4 + k]! * b[k * 4 + c]!;
  return out;
}

function dh(theta: number, d: number, a: number, alpha: number): Mat4 {
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  return [ct, -st * ca, st * sa, a * ct, st, ct * ca, -ct * sa, a * st, 0, sa, ca, d, 0, 0, 0, 1];
}

export interface JakaFk {
  /** Origins of the base and of frames 1..6 (6 = tool flange). */
  points: Point3[];
  /** Tool z axis (approach direction). */
  toolZ: Point3;
}

export function jakaFk(q: readonly number[]): JakaFk {
  let t: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const points: Point3[] = [{ x: 0, y: 0, z: 0 }];
  for (let i = 0; i < 6; i++) {
    t = mul(t, dh(rad(q[i] ?? 0), JAKA_DH.d[i]!, JAKA_DH.a[i]!, JAKA_DH.alpha[i]!));
    points.push({ x: t[3]!, y: t[7]!, z: t[11]! });
  }
  return { points, toolZ: { x: t[2]!, y: t[6]!, z: t[10]! } };
}

/** Solves A x = b (n x n) by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[p]![c]!)) p = r;
    [m[c], m[p]] = [m[p]!, m[c]!];
    for (let r = c + 1; r < n; r++) {
      const f = m[r]![c]! / m[c]![c]!;
      for (let k = c; k <= n; k++) m[r]![k]! -= f * m[c]![k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r]![n]!;
    for (let k = r + 1; k < n; k++) s -= m[r]![k]! * x[k]!;
    x[r] = s / m[r]![r]!;
  }
  return x;
}

function jakaResidual(q: number[], p: Point3): number[] {
  const fk = jakaFk(q);
  const tool = fk.points[6]!;
  const w = 200; // weight of the orientation error against mm
  return [tool.x - p.x, tool.y - p.y, tool.z - p.z, w * fk.toolZ.x, w * fk.toolZ.y, w * (fk.toolZ.z + 1)];
}

/**
 * Joints that put the Jaka tool flange at `p` (base frame) pointing straight
 * down. Numeric (damped least squares), only used for placeholder poses.
 * `seed` sets the starting J2..J6 (arm configuration); J1 always starts
 * pointed at the target.
 */
export function jakaIkDown(p: Point3, seed: readonly number[] = [0, -90, 90, -90, -90, 0]): number[] {
  const toward = deg(Math.atan2(p.y, p.x)) + 180; // UR-style arms reach along -x at J1 = 0
  let q = seed.map((v, i) => (i === 0 ? toward : v));
  const lambda = 10;
  for (let iter = 0; iter < 300; iter++) {
    const r = jakaResidual(q, p);
    if (Math.hypot(...r) < 0.01) break;
    const J = r.map(() => new Array<number>(6).fill(0));
    for (let j = 0; j < 6; j++) {
      const qh = [...q];
      qh[j]! += 1e-4;
      const rh = jakaResidual(qh, p);
      for (let i = 0; i < 6; i++) J[i]![j] = (rh[i]! - r[i]!) / 1e-4;
    }
    // dq = J^T (J J^T + lambda^2 I)^-1 (-r)
    const JJt = J.map((ri, i) => J.map((rj, j) => ri.reduce((s, v, k) => s + v * rj[k]!, 0) + (i === j ? lambda ** 2 : 0)));
    const y = solve(JJt, r.map((v) => -v));
    q = q.map((v, j) => v + J.reduce((s, row, i) => s + row[j]! * y[i]!, 0));
  }
  const err = Math.hypot(...jakaResidual(q, p).slice(0, 3));
  // `!(err <= 1)` also rejects NaN from a diverged solve.
  if (!(err <= 1)) throw new Error(`Jaka cannot reach (${p.x}, ${p.y}, ${p.z}): ${err.toFixed(1)} mm off`);
  return q.map((v) => ((((v + 180) % 360) + 360) % 360) - 180);
}
