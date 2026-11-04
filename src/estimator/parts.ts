// Estimates where the part is, from the PLC I/O and the robots' gripper state.
//
// - On the Jaka → Stäubli conveyor from the moment Sensor Jaka sees it.
// - While the conveyor runs, it moves at the belt speed learned from
//   "conveyor on" → "Sensor Stäubli on" in earlier cycles.
// - It leaves the belt when the Stäubli gripper closes, and counts as placed
//   when the Stäubli gripper opens.
//
// Pure: state in, state out. Held parts are drawn at the robot tools by the
// view, so this module only tracks the belt and the counter.

import type { RobotId } from '../model/cell';
import { signalValue, type PlcIoSnapshot } from '../model/messages';

export interface PartsState {
  /** Position on the belt, 0 = Jaka end, 1 = Stäubli end; null = no part on the belt. */
  belt: number | null;
  /** Learned time for a part to travel the whole belt. */
  travelMs: number;
  conveyorOnAt: number | null;
  /** Parts placed by the Stäubli since the data source started. */
  placed: number;
  holding: Record<RobotId, boolean>;
  lastAt: number;
}

export interface PartsEstimate {
  belt: number | null;
  placed: number;
}

const DEFAULT_TRAVEL_MS = 3000;
const LEARN_RATE = 0.5;
/** Without a sensor confirmation the part stops just before the Stäubli end. */
const MAX_UNCONFIRMED = 0.95;

export function initialParts(now: number): PartsState {
  return {
    belt: null,
    travelMs: DEFAULT_TRAVEL_MS,
    conveyorOnAt: null,
    placed: 0,
    holding: { jaka: false, staubli: false },
    lastAt: now,
  };
}

function on(io: PlcIoSnapshot | null, id: Parameters<typeof signalValue>[1]): boolean {
  return signalValue(io, id) === true;
}

export function updateParts(
  state: PartsState,
  io: PlcIoSnapshot | null,
  prev: PlcIoSnapshot | null,
  holding: Record<RobotId, boolean>,
  now: number,
): PartsState {
  const dt = Math.max(0, now - state.lastAt);
  let s: PartsState = { ...state, lastAt: now };
  if (!io) return { ...s, holding };

  const conveyor = on(io, 'conveyorJakaToStaubli');
  const rise = (id: Parameters<typeof signalValue>[1]) => on(io, id) && !!prev && !on(prev, id);

  if (rise('conveyorJakaToStaubli')) s.conveyorOnAt = now;
  if (rise('jakaSensor')) s.belt = 0;

  if (s.belt !== null && conveyor) s.belt = Math.min(MAX_UNCONFIRMED, s.belt + dt / s.travelMs);

  if (rise('staubliSensor')) {
    if (s.conveyorOnAt !== null) {
      const measured = now - s.conveyorOnAt;
      s.travelMs = s.travelMs + (measured - s.travelMs) * LEARN_RATE;
      s.conveyorOnAt = null;
    }
    s.belt = 1;
  }

  // Joining mid-cycle: a sensor that is on means a part is there.
  if (s.belt === null && on(io, 'staubliSensor') && !holding.staubli) s.belt = 1;
  if (s.belt === null && on(io, 'jakaSensor') && !holding.jaka) s.belt = 0;

  if (holding.staubli && !state.holding.staubli) s.belt = null;
  if (!holding.staubli && state.holding.staubli) s.placed += 1;

  return { ...s, holding };
}

export function partsEstimate(s: PartsState): PartsEstimate {
  return { belt: s.belt, placed: s.placed };
}
