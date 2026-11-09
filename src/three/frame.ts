// Per-frame values for the 3D view. The store is updated every 100 ms; the
// 3D view instead computes the joints for the exact frame time from the
// estimator state, so the motion is smooth at the display frame rate.
// Everything is read with getState() inside useFrame, without React renders.

import { config } from '../config';
import { jointsAt } from '../estimator/engine';
import { toolPoint } from '../estimator/items';
import { getEstimatorStates } from '../estimator/runner';
import { TASKS } from '../estimator/tasks';
import type { RobotId } from '../model/cell';
import type { Point3 } from '../model/layout';
import { useTwinStore } from '../state/store';

interface FrameCache {
  at: number;
  joints: readonly number[];
  tool: Point3;
}

const cache: Partial<Record<RobotId, FrameCache>> = {};

/** Joints and tool tip (cell frame, mm) of `robot` at time `now` (ms). */
export function robotAt(robot: RobotId, now: number): FrameCache {
  const hit = cache[robot];
  if (hit && hit.at === now) return hit;
  const live = useTwinStore.getState().robots[robot];
  const joints =
    live && now - live.receivedAt <= config.staleAfterMs
      ? live.joints
      : jointsAt(TASKS[robot], getEstimatorStates()[robot], now);
  const entry = { at: now, joints, tool: toolPoint(robot, joints) };
  cache[robot] = entry;
  return entry;
}

/** One timestamp per rendered frame, shared by every component. */
let frameNow = 0;
let frameId = -1;
export function frameTime(frame: number): number {
  if (frame !== frameId) {
    frameId = frame;
    frameNow = Date.now();
  }
  return frameNow;
}
