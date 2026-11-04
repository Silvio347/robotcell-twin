// In-browser demo: drives the store with a fake PLC cycle, no broker needed.
// The sequence follows NewProgram in plc/ProjetoFinalRobotica (Jaka places a
// part -> conveyor Jaka -> Stäubli -> Stäubli picks). Only PLC I/O is
// generated: robot motion comes from the estimator, as it will with the real
// PLC. Keep the cycle in sync with scripts/simulate.mjs.

import { IO_CHANNELS } from '../model/cell';
import { disconnectTwin } from '../mqtt/connection';
import { useTwinStore } from '../state/store';

// Channel numbers from Table I (1-based).
const DI = { jakaDo7: 1, staubliSensor: 9, jakaSensor: 10, emergency: 12 };
const DO = { jakaDi3: 1, jakaDi2: 2, staubliDi12: 5, staubliDi13: 6, convJakaToStaubli: 12 };

// "Keep active" outputs held high for the whole cycle (Etapa 0).
const HOLD = [DO.jakaDi2, DO.staubliDi13];

interface Step {
  ms: number;
  di: number[];
  do: number[];
}

const CYCLE: Step[] = [
  { ms: 4000, di: [], do: [DO.jakaDi3] }, // Etapa 0 -> 1: Jaka fetches a part
  { ms: 800, di: [DI.jakaSensor], do: [DO.jakaDi3] }, // part on the conveyor
  { ms: 500, di: [DI.jakaSensor, DI.jakaDo7], do: [DO.convJakaToStaubli] }, // Jaka done: PLC clears DI3, starts conveyor
  { ms: 2500, di: [], do: [DO.convJakaToStaubli] }, // Etapa 2: part travelling
  { ms: 1000, di: [DI.staubliSensor], do: [DO.staubliDi12] }, // Stäubli may pick (1 s pulse)
  { ms: 1500, di: [DI.staubliSensor], do: [] }, // Stäubli picking, part leaves the sensor at the end
];

const IO_PERIOD_MS = 500;

let ioTimer: number | null = null;
let stepTimer: number | null = null;
let stepIndex = 0;

function channels(active: number[]): boolean[] {
  const set = new Set(active);
  return Array.from({ length: IO_CHANNELS }, (_, i) => set.has(i + 1));
}

function publishIo(): void {
  const step = CYCLE[stepIndex];
  if (!step) return;
  const now = Date.now();
  useTwinStore.getState().setIo({
    ts: now,
    receivedAt: now,
    di: channels([...step.di, DI.emergency]),
    do: channels([...step.do, ...HOLD]),
  });
}

function scheduleNextStep(): void {
  const step = CYCLE[stepIndex];
  stepTimer = window.setTimeout(() => {
    stepIndex = (stepIndex + 1) % CYCLE.length;
    publishIo(); // show the transition immediately
    scheduleNextStep();
  }, step?.ms ?? 1000);
}

function stopTimers(): void {
  if (ioTimer !== null) window.clearInterval(ioTimer);
  if (stepTimer !== null) window.clearTimeout(stepTimer);
  ioTimer = null;
  stepTimer = null;
}

export function startDemo(): void {
  disconnectTwin();
  stopTimers();
  const store = useTwinStore.getState();
  store.reset();
  store.setError(null);
  store.setSource('simulated');
  store.setConnection('demo');

  stepIndex = 0;
  publishIo();
  scheduleNextStep();
  ioTimer = window.setInterval(publishIo, IO_PERIOD_MS);
}

export function stopDemo(): void {
  stopTimers();
  const store = useTwinStore.getState();
  store.reset();
  store.setConnection('disconnected');
}
