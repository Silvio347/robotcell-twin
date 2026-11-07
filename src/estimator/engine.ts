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
// Inside a segment, each move gets a share of the time proportional to how
// long it takes at the robot's joint speeds, and a SCARA lifts its vertical
// axis before travelling. The gripper state follows the `grip` points.
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
  /**
   * Poses visited in order. Must not be empty. The segment time is split
   * between the moves in proportion to how long each move takes at the
   * robot's joint speeds.
   */
  path: readonly Pose[];
  defaultMs: number;
  /** Any of these ends the segment. */
  endsOn: readonly EventDef[];
  /** False for segments whose length depends on the rest of the cell (waiting). */
  learn?: boolean;
  /** The gripper closes (or opens) when the robot reaches `path[at]`. */
  grip?: { at: number; closed: boolean };
  /** Keep the vertical axis where it is between poses (drawing at a fixed height). */
  noLift?: boolean;
  /** What the segment does with the cell objects; read by src/estimator/items.ts. */
  meta?: SegmentMeta;
}

export type ItemId = 'marker' | 'part1' | 'part2';

export interface SegmentMeta {
  /** Object gripped or released at the grip point. */
  item?: ItemId;
  /** Index of the square drawn in this segment. */
  square?: 0 | 1;
}

export interface TaskDef {
  robot: RobotId;
  segments: readonly SegmentDef[];
  /** Nominal speed of each joint (units per second), used to time the moves. */
  jointSpeeds: readonly number[];
  /**
   * Axis that must reach `safe` before any other joint moves (SCARA: lift J3
   * before travelling), like the approach points in a pick-and-place program.
   */
  travelAxis?: { axis: number; safe: number };
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
  /** Gripper state when the robot was frozen. */
  stoppedHolding: boolean;
  cycles: number;
}

export interface RobotEstimate {
  phase: string;
  /** Index of the current segment in the task. */
  segment: number;
  progress: number;
  waitingFor: string | null;
  joints: number[];
  /** True while the gripper is estimated to hold a part. */
  holding: boolean;
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
  if (!level(io, RUNNING_SIGNAL)) return 'Idle';
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
    stoppedHolding: false,
    cycles: 0,
  };
}

function progressOf(s: EstimatorState, now: number): number {
  const dur = s.durations[s.index] ?? 1;
  return clamp((now - s.startedAt) / dur, 0, 1);
}

interface Waypoint {
  joints: readonly number[];
  /** Index in the segment path, or null for an inserted lift point. */
  pathIndex: number | null;
  /** Fraction of the segment time at which this point is reached. */
  at: number;
}

/** Time a move takes at the nominal joint speeds, plus a short settle. */
function moveSeconds(task: TaskDef, a: readonly number[], b: readonly number[]): number {
  const slowest = a.reduce((m, v, i) => Math.max(m, Math.abs((b[i] ?? v) - v) / (task.jointSpeeds[i] ?? 1)), 0);
  return slowest > 1e-6 ? slowest + 0.1 : 0;
}

function needsLift(task: TaskDef, from: readonly number[], to: readonly number[]): boolean {
  const t = task.travelAxis;
  if (!t || Math.abs((from[t.axis] ?? t.safe) - t.safe) < 1) return false;
  return from.some((v, i) => i !== t.axis && Math.abs((to[i] ?? v) - v) > 0.5);
}

/** Points the robot visits in the current segment, starting where it is. */
function waypoints(task: TaskDef, s: EstimatorState): Waypoint[] {
  const seg = task.segments[s.index];
  const points: Omit<Waypoint, 'at'>[] = [{ joints: s.startJoints, pathIndex: null }];
  seg?.path.forEach((pose, i) => {
    const from = points[points.length - 1]!.joints;
    if (!seg?.noLift && needsLift(task, from, pose)) {
      const lifted = [...from];
      lifted[task.travelAxis!.axis] = task.travelAxis!.safe;
      points.push({ joints: lifted, pathIndex: null });
    }
    points.push({ joints: pose, pathIndex: i });
  });

  const times = points.map((p, i) => (i === 0 ? 0 : moveSeconds(task, points[i - 1]!.joints, p.joints)));
  const total = times.reduce((a, b) => a + b, 0);
  const legs = points.length - 1;
  let acc = 0;
  return points.map((p, i) => {
    acc += times[i]!;
    // Equal shares when nothing moves (robot already at every point).
    return { ...p, at: total > 0 ? acc / total : legs > 0 ? i / legs : 1 };
  });
}

export function jointsAt(task: TaskDef, s: EstimatorState, now: number): number[] {
  if (s.stoppedReason || !task.segments[s.index]) return [...s.startJoints];
  const pts = waypoints(task, s);
  const t = progressOf(s, now);
  const leg = Math.max(1, pts.findIndex((p, i) => i > 0 && t <= p.at));
  const a = pts[leg - 1]!;
  const b = pts[leg] ?? a;
  const span = b.at - a.at;
  const k = smoothstep(span > 0 ? clamp((t - a.at) / span, 0, 1) : 1);
  return a.joints.map((v, i) => v + ((b.joints[i] ?? v) - v) * k);
}

/** Gripper state at the start of each segment, following the grip events of the loop. */
function holdingAtStart(task: TaskDef): boolean[] {
  const out: boolean[] = [];
  let holding = false;
  for (const seg of task.segments) {
    out.push(holding);
    if (seg.grip) holding = seg.grip.closed;
  }
  return out;
}

export function holdingAt(task: TaskDef, s: EstimatorState, now: number): boolean {
  if (s.stoppedReason) return s.stoppedHolding;
  const seg = task.segments[s.index];
  const start = holdingAtStart(task)[s.index] ?? false;
  if (!seg?.grip) return start;
  const point = waypoints(task, s).find((p) => p.pathIndex === seg.grip!.at);
  return point && progressOf(s, now) >= point.at ? seg.grip.closed : start;
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
      stoppedHolding: holdingAt(task, s, now),
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
    segment: s.index,
    progress,
    waitingFor: !s.stoppedReason && progress >= 1 && waited ? eventLabel(waited) : null,
    joints: jointsAt(task, s, now),
    holding: holdingAt(task, s, now),
    stoppedReason: s.stoppedReason,
    cycles: s.cycles,
  };
}
