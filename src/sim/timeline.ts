// Reads src/sim/timeline.json (shared with scripts/simulate.mjs) and gives the
// PLC I/O snapshot at any time of the run.

import { IO_CHANNELS } from '../model/cell';
import timeline from './timeline.json';

interface TimelineEvent {
  t: number;
  set?: Record<string, boolean | undefined>;
  step?: number;
  running?: boolean;
  countUp?: boolean;
}

const EVENTS = timeline.events as TimelineEvent[];
export const RUN_MS = timeline.durationS * 1000;
const EMERGENCY_OK = 'DI12';

export interface TimelineState {
  di: boolean[];
  do: boolean[];
  step: number;
  running: boolean;
  /** Runs completed within the current run (0, or 1 after the last event). */
  countUps: number;
}

/** I/O state `ms` milliseconds into a run. */
export function stateAt(ms: number): TimelineState {
  const di = new Array<boolean>(IO_CHANNELS).fill(false);
  const dout = new Array<boolean>(IO_CHANNELS).fill(false);
  di[11] = true; // E-stop input TRUE = safe
  let step = 0;
  let running = false;
  let countUps = 0;
  for (const e of EVENTS) {
    if (e.t * 1000 > ms) break;
    for (const [name, value] of Object.entries(e.set ?? {})) {
      if (name === EMERGENCY_OK || value === undefined) continue;
      const ch = Number(name.slice(2)) - 1;
      if (name.startsWith('DI')) di[ch] = value;
      else if (name.startsWith('DO')) dout[ch] = value;
    }
    if (e.step !== undefined) step = e.step;
    if (e.running !== undefined) running = e.running;
    if (e.countUp) countUps += 1;
  }
  return { di, do: dout, step, running, countUps };
}
