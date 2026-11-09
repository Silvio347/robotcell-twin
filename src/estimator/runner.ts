// Connects the estimator to the store: every PLC snapshot is fed to it, and a
// 100 ms tick keeps the animation moving between snapshots.

import { config } from '../config';
import type { RobotId } from '../model/cell';
import type { PlcIoSnapshot } from '../model/messages';
import { ROBOT_IDS } from '../model/robots';
import { useTwinStore } from '../state/store';
import { estimate, initialState, update, type EstimatorState, type RobotEstimate } from './engine';
import { initialItems, itemsEstimate, updateItems, type ItemsState } from './items';
import { TASKS } from './tasks';

const TICK_MS = 100;

function freshStates(now: number): Record<RobotId, EstimatorState> {
  return { jaka: initialState(TASKS.jaka, now), staubli: initialState(TASKS.staubli, now) };
}

let states: Record<RobotId, EstimatorState> = freshStates(Date.now());

/**
 * Current estimator states, for views that compute joints every frame
 * (`jointsAt(TASKS[robot], state, now)`) instead of every 100 ms tick.
 */
export function getEstimatorStates(): Readonly<Record<RobotId, EstimatorState>> {
  return states;
}

export function startEstimator(): () => void {
  states = freshStates(Date.now());
  let items: ItemsState = initialItems(Date.now());
  let prevIo: PlcIoSnapshot | null = null;

  const run = (io: PlcIoSnapshot | null, prev: PlcIoSnapshot | null) => {
    const now = Date.now();
    // A new data source starts from scratch, including learned timings.
    if (!io) {
      states = freshStates(now);
      items = initialItems(now);
    }
    const fresh = io && now - io.receivedAt <= config.staleAfterMs ? io : null;
    const next = { ...states };
    for (const robot of ROBOT_IDS) {
      next[robot] = update(TASKS[robot], states[robot], fresh, fresh ? prev : null, now);
    }
    states = next;
    const estimates: Record<RobotId, RobotEstimate> = {
      jaka: estimate(TASKS.jaka, states.jaka, now),
      staubli: estimate(TASKS.staubli, states.staubli, now),
    };
    items = updateItems(items, TASKS, fresh, fresh ? prev : null, estimates, now);
    useTwinStore.getState().setEstimates(estimates, itemsEstimate(items));
  };

  const unsubscribe = useTwinStore.subscribe((state, previous) => {
    if (state.io === previous.io) return;
    run(state.io, prevIo);
    prevIo = state.io;
  });

  const timer = window.setInterval(() => {
    const io = useTwinStore.getState().io;
    run(io, io);
  }, TICK_MS);

  return () => {
    unsubscribe();
    window.clearInterval(timer);
  };
}
