import { config } from '../config';
import type { RobotEstimate } from '../estimator/engine';
import type { RobotId } from '../model/cell';
import { useTwinStore } from '../state/store';

export type JointSource = 'live' | 'estimated';

export interface RobotView {
  joints: readonly number[] | null;
  source: JointSource | null;
  estimate: RobotEstimate | null;
}

/** Live joints from the robot controller win; otherwise the PLC-based estimate. */
export function useRobotView(robot: RobotId, now: number): RobotView {
  const live = useTwinStore((s) => s.robots[robot]);
  const estimate = useTwinStore((s) => s.estimates[robot]);
  if (live && now - live.receivedAt <= config.staleAfterMs) {
    return { joints: live.joints, source: 'live', estimate };
  }
  return { joints: estimate?.joints ?? null, source: estimate ? 'estimated' : null, estimate };
}
