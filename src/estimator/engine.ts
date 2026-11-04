// Estimates what each robot is doing using only PLC I/O.
//
// A robot task is a loop of segments. Each segment moves the robot along a
// path of taught poses and ends when a PLC signal event happens (for example
// "Sensor Jaka rises"). The time a segment takes is learned from the cycles
// already observed, so the animation follows the real cell speed.
//
// Segments that end on an "optional" event (a robot output the current robot
// programs do not set) advance on time alone until that signal is seen once.
//
// Everything here is pure: state in, state out. src/estimator/runner.ts
// feeds it with the store.

import { IO_POINTS, type RobotId, type SignalId } from '../model/cell';
import { isEmergencyActive, signalValue, type PlcIoSnapshot } from '../model/messages';
import type { Pose } from '../model/poses';

export interface EventDef {
  signal: SignalId;
  when: 'rise' | 'fall' | 'high';
  /** Other signals that must be TRUE at the same time. */
  also?: readonly SignalId[];
  /** Robot output that the current robot programs do not set (yet). */
  optional?: boolean;
}

export interface SegmentDef {
  label: string;
  /** Poses visited in order, at equal time shares. Must not be empty. */
  path: readonly Pose[];
  defaultMs: number;
  /** Any of these ends the segment. */
  endsOn: readonly EventDef[];
  /** False for segments whose length depends on the rest of the cell (waiting). */
  learn?: boolean;
}

export interface TaskDef {
  robot: RobotId;
  segments: readonly SegmentDef[];
}

export interface EstimatorState {
  index: number;
  startedAt: number;
  startJoints: readonly number[];
  /** Expected duration of each segment (ms), learned from observed cycles. */
  durations: readonly number[];
  /** First segment and start time since the last segment that ended on an event. */
  chainFrom: number;
  chainStart: number;
  /** Optional signals seen at least once: from then on they are waited for. */
  seenOptional: readonly SignalId[];
  stoppedReason: string | null;
  cycles: number;
}

export interface RobotEstimate {
  phase: string;
  progress: number;
  waitingFor: string | null;
  joints: number[];
  stoppedReason: string | null;
  cycles: number;
}

/**
 * The PLC holds Jaka DI2 ("keep active") TRUE while the sequence runs and
 * clears it in the stop branch, so it doubles as the "cell running" flag.
 * Stäubli DI13 cannot be used: the stop branch sets it TRUE as well.
 */
const RUNNING_SIGNAL: SignalId = 'jakaDi2';

const MIN_MS = 200;
const MAX_MS = 60_000;
const LEARN_RATE = 0.5;

function lastPose(path: readonly Pose[]): readonly number[] {
  return path[path.length - 1] ?? [];
}

function level(io: PlcIoSnapshot, id: SignalId): boolean {
  return signalValue(io, id) === true;
}

function fired(e: EventDef, io: PlcIoSnapshot, prev: PlcIoSnapshot | null): boolean {
  if (e.also && !e.also.every((id) => level(io, id))) return false;
  const now = level(io, e.signal);
  if (e.when === 'high') return now;
  if (!prev) return false;
  const before = level(prev, e.signal);
  return e.when === 'rise' ? now && !before : !now && before;
}

function isWaitedFor(e: EventDef, seen: readonly SignalId[]): boolean {
  return !e.optional || seen.includes(e.signal);
}

function blocking(seg: SegmentDef, seen: readonly SignalId[]): boolean {
  return seg.endsOn.some((e) => isWaitedFor(e, seen));
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function stopReason(io: PlcIoSnapshot | null): string | null {
  if (!io) return 'No PLC data';
  if (isEmergencyActive(io)) return 'E-stop';
  if (!level(io, RUNNING_SIGNAL)) return 'Cell stopped';
  return null;
}

export function initialState(task: TaskDef, now: number): EstimatorState {
  const first = task.segments[0];
  if (!first) throw new Error(`Task ${task.robot} has no segments`);
  return {
    index: 0,
    startedAt: now,
    startJoints: lastPose(first.path),
    durations: task.segments.map((s) => s.defaultMs),
    chainFrom: 0,
    chainStart: now,
    seenOptional: [],
    stoppedReason: 'No PLC data',
    cycles: 0,
  };
}

function progressOf(s: EstimatorState, now: number): number {
  const dur = s.durations[s.index] ?? 1;
  return clamp((now - s.startedAt) / dur, 0, 1);
}

export function jointsAt(task: TaskDef, s: EstimatorState, now: number): number[] {
  const seg = task.segments[s.index];
  if (s.stoppedReason || !seg) return [...s.startJoints];
  const points = [s.startJoints, ...seg.path];
  const legs = seg.path.length;
  const t = progressOf(s, now) * legs;
  const leg = Math.min(Math.floor(t), legs - 1);
  const k = smoothstep(t - leg);
  const a = points[leg] ?? [];
  const b = points[leg + 1] ?? a;
  return a.map((v, i) => v + ((b[i] ?? v) - v) * k);
}

/** Moves past segments that only wait for time. */
function advanceByTime(task: TaskDef, state: EstimatorState, now: number): EstimatorState {
  let s = state;
  for (let guard = 0; guard < task.segments.length; guard++) {
    const seg = task.segments[s.index];
    const dur = s.durations[s.index] ?? 0;
    if (!seg || blocking(seg, s.seenOptional) || now - s.startedAt < dur) break;
    s = {
      ...s,
      index: (s.index + 1) % task.segments.length,
      startedAt: s.startedAt + dur,
      startJoints: lastPose(seg.path),
    };
  }
  return s;
}

/** Segment `k` ended on its event: learn the timing and start the next one. */
function finishSegment(task: TaskDef, s: EstimatorState, k: number, now: number): EstimatorState {
  const n = task.segments.length;
  const chain: number[] = [];
  for (let i = s.chainFrom; chain.length <= n; i = (i + 1) % n) {
    chain.push(i);
    if (i === k) break;
  }

  let durations = s.durations;
  if (chain.every((i) => task.segments[i]?.learn !== false)) {
    const expected = chain.reduce((sum, i) => sum + (durations[i] ?? 0), 0);
    const scale = expected > 0 ? (now - s.chainStart) / expected : 1;
    durations = durations.map((d, i) =>
      chain.includes(i) ? clamp(d + (d * scale - d) * LEARN_RATE, MIN_MS, MAX_MS) : d,
    );
  }

  const next = (k + 1) % n;
  return {
    ...s,
    durations,
    index: next,
    startedAt: now,
    startJoints: jointsAt(task, s, now),
    chainFrom: next,
    chainStart: now,
    cycles: k === 0 ? s.cycles + 1 : s.cycles,
  };
}

/**
 * Feeds one PLC snapshot. Pass `io === prev` for a time-only tick: edges
 * (rise/fall) cannot fire then, level events still can.
 */
export function update(
  task: TaskDef,
  state: EstimatorState,
  io: PlcIoSnapshot | null,
  prev: PlcIoSnapshot | null,
  now: number,
): EstimatorState {
  let s = state;
  const reason = stopReason(io);
  if (reason || !io) {
    if (s.stoppedReason) return s.stoppedReason === reason ? s : { ...s, stoppedReason: reason };
    // Freeze where the robot is; restart from the first segment later.
    return {
      ...s,
      startJoints: jointsAt(task, s, now),
      stoppedReason: reason,
      index: 0,
      startedAt: now,
      chainFrom: 0,
      chainStart: now,
    };
  }
  if (s.stoppedReason) {
    s = { ...s, stoppedReason: null, index: 0, startedAt: now, chainFrom: 0, chainStart: now };
  }

  const optional = task.segments.flatMap((seg) => seg.endsOn.filter((e) => e.optional).map((e) => e.signal));
  const newlySeen = optional.filter((id) => !s.seenOptional.includes(id) && level(io, id));
  if (newlySeen.length > 0) s = { ...s, seenOptional: [...s.seenOptional, ...newlySeen] };

  s = advanceByTime(task, s, now);

  // Look ahead from the current segment, skipping time-only segments, but
  // never past one that waits for an event: the robot cannot skip a handshake.
  const n = task.segments.length;
  for (let d = 0; d < n; d++) {
    const k = (s.index + d) % n;
    const seg = task.segments[k];
    if (!seg) break;
    if (seg.endsOn.some((e) => fired(e, io, prev))) return finishSegment(task, s, k, now);
    if (blocking(seg, s.seenOptional)) break;
  }
  return s;
}

function eventLabel(e: EventDef): string {
  const label = IO_POINTS.find((p) => p.id === e.signal)?.label ?? e.signal;
  return e.when === 'fall' ? `${label} off` : label;
}

export function estimate(task: TaskDef, s: EstimatorState, now: number): RobotEstimate {
  const seg = task.segments[s.index];
  const progress = s.stoppedReason ? 0 : progressOf(s, now);
  const waited = seg?.endsOn.find((e) => isWaitedFor(e, s.seenOptional));
  return {
    phase: s.stoppedReason ?? seg?.label ?? '',
    progress,
    waitingFor: !s.stoppedReason && progress >= 1 && waited ? eventLabel(waited) : null,
    joints: jointsAt(task, s, now),
    stoppedReason: s.stoppedReason,
    cycles: s.cycles,
  };
}
