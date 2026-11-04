// In-browser demo: drives the store with a fake cell cycle, no broker needed.
// The sequence follows NewProgram in plc/ProjetoFinalRobotica (Jaka places a
// part -> conveyor Jaka -> Stäubli -> Stäubli picks). Keep it in sync with
// scripts/simulate.mjs, which publishes the same cycle over MQTT.

import { IO_CHANNELS, type RobotId } from '../model/cell';
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
  { ms: 1500, di: [], do: [DO.jakaDi3] }, // Etapa 0 -> 1: Jaka may place
  { ms: 1000, di: [DI.jakaSensor], do: [DO.jakaDi3] }, // part detected at Jaka
  { ms: 500, di: [DI.jakaSensor, DI.jakaDo7], do: [DO.jakaDi3] }, // Jaka done
  { ms: 2500, di: [], do: [DO.convJakaToStaubli] }, // Etapa 2: conveyor running
  { ms: 1000, di: [DI.staubliSensor], do: [DO.staubliDi12] }, // Stäubli may pick (1 s pulse)
  { ms: 1500, di: [DI.staubliSensor], do: [] }, // Stäubli picking
];

const IO_PERIOD_MS = 500;
const JOINT_PERIOD_MS = 100;

let timers: number[] = [];
let stepIndex = 0;
let stepTimer: number | null = null;

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

function publishJoints(): void {
  const t = Date.now() / 1000;
  const wave = (amp: number, speed: number, phase = 0) => amp * Math.sin(t * speed + phase);
  const now = Date.now();
  const joints: Record<RobotId, number[]> = {
    staubli: [wave(90, 0.5), wave(30, 0.7, 1), 90 + wave(20, 0.9), 0, wave(45, 1.1), 0],
    jaka: [wave(120, 0.4), 90 + wave(25, 0.6), wave(40, 0.8, 2), wave(60, 1), 90, wave(90, 0.5)],
  };
  const store = useTwinStore.getState();
  for (const robot of Object.keys(joints) as RobotId[]) {
    store.setRobot(robot, { ts: now, receivedAt: now, joints: joints[robot], mode: 'demo' });
  }
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
  publishJoints();
  scheduleNextStep();
  timers.push(window.setInterval(publishIo, IO_PERIOD_MS));
  timers.push(window.setInterval(publishJoints, JOINT_PERIOD_MS));
}

function stopTimers(): void {
  timers.forEach((id) => window.clearInterval(id));
  timers = [];
  if (stepTimer !== null) window.clearTimeout(stepTimer);
  stepTimer = null;
}

export function stopDemo(): void {
  stopTimers();
  const store = useTwinStore.getState();
  store.reset();
  store.setConnection('disconnected');
}
