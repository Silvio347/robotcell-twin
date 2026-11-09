// Estimates where the plate, the two parts and the marker are, and the ink on
// the board, from the PLC I/O and the robots' estimated gripper state
// (whiteboard application, docs/whiteboard-application.md).
//
// - A new run starts when Jaka DI3 rises: the operator has put the loaded
//   plate back at the Jaka and cleared the board.
// - Gripper closing / opening moves the object named in the segment's `meta`.
//   Parts still in the plate move with it.
// - The plate enters the conveyor when the Jaka releases it and moves at a
//   belt speed learned from "conveyor on" -> "Sensor Stäubli on".
// - While the Stäubli holds the marker in a drawing segment and its tool is at
//   drawing height, the tool path is recorded as ink.
//
// Pure: state in, state out.

import type { RobotId, SignalId } from '../model/cell';
import { jakaFk, scaraFk } from '../model/kinematics';
import { LAYOUT, toCellFrame, type Point2, type Point3 } from '../model/layout';
import { signalValue, type PlcIoSnapshot } from '../model/messages';
import { DRAW_Z } from '../model/poses';
import type { ItemId, RobotEstimate, TaskDef } from './engine';

export type PlatePlace = 'jakaTable' | 'jakaGripper' | 'belt' | 'staubliGripper' | 'staubliTable';
export type PartPlace = 'plate' | 'gripper' | 'board';
export type MarkerPlace = 'holder' | 'gripper';

export interface ItemsState {
  plate: PlatePlace;
  /** Plate position on the belt, 0 = Jaka end, 1 = Stäubli end. */
  belt: number;
  travelMs: number;
  conveyorOnAt: number | null;
  parts: [PartPlace, PartPlace];
  marker: MarkerPlace;
  ink: [Point2[], Point2[]];
  squaresDone: number;
  cycleStartedAt: number | null;
  cycleEndedAt: number | null;
  /** Previous robot state, to detect gripper and segment changes. */
  robots: Record<RobotId, { holding: boolean; segment: number; stopped: boolean }>;
  lastAt: number;
}

export interface ItemsEstimate {
  plate: PlatePlace;
  belt: number;
  parts: readonly [PartPlace, PartPlace];
  marker: MarkerPlace;
  ink: readonly [readonly Point2[], readonly Point2[]];
  partsOnBoard: number;
  squaresDone: number;
  cycleStartedAt: number | null;
  cycleEndedAt: number | null;
}

const DEFAULT_TRAVEL_MS = 3500;
const LEARN_RATE = 0.5;
/** Without a sensor confirmation the plate stops just before the Stäubli end. */
const MAX_UNCONFIRMED = 0.95;
/** Tool height tolerance for "marker touching the board". */
const INK_TOLERANCE = 2;
/** Minimum distance between recorded ink points. */
const INK_STEP = 1.5;
/** Ink of a square is only recorded this close to it (mm), so a segment cut short by its pulse cannot smear into the next square. */
const INK_MARGIN = 4;

export function initialItems(now: number): ItemsState {
  return {
    plate: 'jakaTable',
    belt: 0,
    travelMs: DEFAULT_TRAVEL_MS,
    conveyorOnAt: null,
    parts: ['plate', 'plate'],
    marker: 'holder',
    ink: [[], []],
    squaresDone: 0,
    cycleStartedAt: null,
    cycleEndedAt: null,
    robots: {
      jaka: { holding: false, segment: 0, stopped: true },
      staubli: { holding: false, segment: 0, stopped: true },
    },
    lastAt: now,
  };
}

const on = (io: PlcIoSnapshot | null, id: SignalId) => signalValue(io, id) === true;

/** Tool tip in cell coordinates for the given joints. */
export function toolPoint(robot: RobotId, joints: readonly number[]): Point3 {
  const tool = robot === 'staubli' ? scaraFk(joints).tool : jakaFk(joints).points[6]!;
  return toCellFrame(robot, tool);
}

/**
 * Object involved in a gripper change between two updates. The robot may have
 * moved on to the next segment in the same update (an event ended the grip
 * segment early), so look back from the current segment to the previous one
 * for the last segment whose grip point matches.
 */
function grippedItem(task: TaskDef, from: number, to: number, closed: boolean): ItemId | undefined {
  const n = task.segments.length;
  for (let k = to, guard = 0; guard < n; k = (k - 1 + n) % n, guard++) {
    const seg = task.segments[k];
    if (seg?.grip?.closed === closed && seg.meta?.item) return seg.meta.item;
    if (k === from) break;
  }
  return undefined;
}

function partIndex(item: ItemId | undefined): 0 | 1 | null {
  return item === 'part1' ? 0 : item === 'part2' ? 1 : null;
}

export function updateItems(
  state: ItemsState,
  tasks: Record<RobotId, TaskDef>,
  io: PlcIoSnapshot | null,
  prev: PlcIoSnapshot | null,
  estimates: Record<RobotId, RobotEstimate>,
  now: number,
): ItemsState {
  const dt = Math.max(0, now - state.lastAt);
  const s: ItemsState = {
    ...state,
    parts: [...state.parts],
    ink: [state.ink[0], state.ink[1]],
    lastAt: now,
    robots: {
      jaka: { holding: estimates.jaka.holding, segment: estimates.jaka.segment, stopped: estimates.jaka.stoppedReason !== null },
      staubli: {
        holding: estimates.staubli.holding,
        segment: estimates.staubli.segment,
        stopped: estimates.staubli.stoppedReason !== null,
      },
    },
  };
  if (!io) return s;
  const rise = (id: SignalId) => on(io, id) && !!prev && !on(prev, id);
  const fall = (id: SignalId) => !on(io, id) && !!prev && on(prev, id);

  // New run. The first snapshot counts too, so joining at the very start of a
  // run (or starting the demo) shows the cycle time.
  const firstData = !prev && state.cycleStartedAt === null;
  if (rise('jakaDi3') || (firstData && on(io, 'jakaDi3'))) {
    s.plate = 'jakaTable';
    s.belt = 0;
    s.parts = ['plate', 'plate'];
    s.marker = 'holder';
    s.ink = [[], []];
    s.squaresDone = 0;
    s.cycleStartedAt = now;
    s.cycleEndedAt = null;
  }
  if (fall('jakaDi2') && s.cycleStartedAt !== null && s.cycleEndedAt === null) s.cycleEndedAt = now;

  // Gripper changes. A gripper that empties because the robot restarts after a
  // stop has not placed anything: the estimator just reset its task.
  for (const robot of ['jaka', 'staubli'] as const) {
    const before = state.robots[robot];
    const after = s.robots[robot];
    if (before.stopped || after.stopped || before.holding === after.holding) continue;
    const item = grippedItem(tasks[robot], before.segment, after.segment, after.holding);
    const part = partIndex(item);
    if (item === 'plate') {
      if (after.holding) s.plate = robot === 'jaka' ? 'jakaGripper' : 'staubliGripper';
      else if (robot === 'jaka') {
        s.plate = 'belt';
        s.belt = 0;
      } else s.plate = 'staubliTable';
    }
    if (item === 'marker' && robot === 'staubli') s.marker = after.holding ? 'gripper' : 'holder';
    if (part !== null) s.parts[part] = after.holding ? 'gripper' : 'board';
  }

  // Conveyor.
  if (rise('conveyorJakaToStaubli')) s.conveyorOnAt = now;
  if (s.plate === 'belt' && on(io, 'conveyorJakaToStaubli')) {
    s.belt = Math.min(MAX_UNCONFIRMED, s.belt + dt / s.travelMs);
  }
  if (rise('staubliSensor')) {
    if (s.conveyorOnAt !== null) {
      s.travelMs += (now - s.conveyorOnAt - s.travelMs) * LEARN_RATE;
      s.conveyorOnAt = null;
    }
    if (s.plate === 'belt' || s.plate === 'jakaGripper') {
      s.plate = 'belt';
      s.belt = 1;
    }
  }

  // Squares: one finished each time the Stäubli leaves a drawing segment.
  const staubliTask = tasks.staubli;
  const prevSquare = staubliTask.segments[state.robots.staubli.segment]?.meta?.square;
  if (
    prevSquare !== undefined &&
    state.robots.staubli.segment !== s.robots.staubli.segment &&
    !s.robots.staubli.stopped
  ) {
    s.squaresDone = Math.max(s.squaresDone, prevSquare + 1);
  }

  // Ink.
  const square = staubliTask.segments[s.robots.staubli.segment]?.meta?.square;
  if (square !== undefined && s.marker === 'gripper' && !s.robots.staubli.stopped) {
    const tool = toolPoint('staubli', estimates.staubli.joints);
    const slot = LAYOUT.boardSlots[square]!;
    const near =
      Math.abs(tool.x - slot.x) <= LAYOUT.squareHalf + INK_MARGIN && Math.abs(tool.y - slot.y) <= LAYOUT.squareHalf + INK_MARGIN;
    if (near && tool.z <= DRAW_Z + INK_TOLERANCE) {
      const line = s.ink[square];
      const last = line[line.length - 1];
      if (!last || Math.hypot(tool.x - last.x, tool.y - last.y) >= INK_STEP) {
        s.ink[square] = [...line, { x: tool.x, y: tool.y }];
      }
    }
  }

  return s;
}

export function itemsEstimate(s: ItemsState): ItemsEstimate {
  return {
    plate: s.plate,
    belt: s.belt,
    parts: s.parts,
    marker: s.marker,
    ink: s.ink,
    partsOnBoard: s.parts.filter((p) => p === 'board').length,
    squaresDone: s.squaresDone,
    cycleStartedAt: s.cycleStartedAt,
    cycleEndedAt: s.cycleEndedAt,
  };
}

/** PLC step: from the bridge when available, otherwise derived from the outputs. */
export function plcStep(io: PlcIoSnapshot | null): number | null {
  if (!io) return null;
  if (io.step !== null) return io.step;
  if (!on(io, 'jakaDi2')) return 0;
  if (on(io, 'staubliDi14')) return 4;
  if (on(io, 'staubliDi12')) return 2;
  return 1;
}

export const STEP_LABELS: Record<number, string> = {
  0: 'Idle',
  1: 'Plate to the Stäubli',
  2: 'Plate on the table, parts to the board',
  3: 'Parts done',
  4: 'Drawing the squares',
  5: 'Finishing',
};
