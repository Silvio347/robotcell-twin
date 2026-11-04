// Connects the estimator to the store: every PLC snapshot is fed to it, and a
// 100 ms tick keeps the animation moving between snapshots.

import { config } from '../config';
import type { RobotId } from '../model/cell';
import type { PlcIoSnapshot } from '../model/messages';
import { ROBOT_IDS } from '../model/robots';
import { useTwinStore } from '../state/store';
import { estimate, initialState, update, type EstimatorState } from './engine';
import { TASKS } from './tasks';

const TICK_MS = 100;

function freshStates(now: number): Record<RobotId, EstimatorState> {
  return { jaka: initialState(TASKS.jaka, now), staubli: initialState(TASKS.staubli, now) };
}

export function startEstimator(): () => void {
  let states = freshStates(Date.now());
  let prevIo: PlcIoSnapshot | null = null;

  const run = (io: PlcIoSnapshot | null, prev: PlcIoSnapshot | null) => {
    const now = Date.now();
    // A new data source starts from scratch, including learned timings.
    if (!io) states = freshStates(now);
    const fresh = io && now - io.receivedAt <= config.staleAfterMs ? io : null;
    for (const robot of ROBOT_IDS) {
      states[robot] = update(TASKS[robot], states[robot], fresh, fresh ? prev : null, now);
    }
    useTwinStore.getState().setEstimates({
      jaka: estimate(TASKS.jaka, states.jaka, now),
      staubli: estimate(TASKS.staubli, states.staubli, now),
    });
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
