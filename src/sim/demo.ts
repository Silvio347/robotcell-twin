// In-browser demo: plays src/sim/timeline.json (one run of the whiteboard
// application as PLC I/O) in a loop, no broker needed. Only PLC I/O is
// generated: robot motion, marker, parts and ink come from the estimator, as
// they will with the real PLC.

import { disconnectTwin } from '../mqtt/connection';
import { useTwinStore } from '../state/store';
import { RUN_MS, stateAt } from './timeline';

/** Same period as the PLC sender (TwinSender.st). */
const IO_PERIOD_MS = 200;

let timer: number | null = null;
let startedAt = 0;

function publish(): void {
  const now = Date.now();
  const elapsed = now - startedAt;
  const run = Math.floor(elapsed / RUN_MS);
  const s = stateAt(elapsed % RUN_MS);
  useTwinStore.getState().setIo({
    ts: now,
    receivedAt: now,
    di: s.di,
    do: s.do,
    step: s.step,
    count: (run + s.countUps) % 256,
    running: s.running,
  });
}

function stop(): void {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
}

export function startDemo(): void {
  disconnectTwin();
  stop();
  const store = useTwinStore.getState();
  store.reset();
  store.setError(null);
  store.setSource('simulated');
  store.setConnection('demo');
  startedAt = Date.now();
  publish();
  timer = window.setInterval(publish, IO_PERIOD_MS);
}

export function stopDemo(): void {
  stop();
  const store = useTwinStore.getState();
  store.reset();
  store.setConnection('disconnected');
}
