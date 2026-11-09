// Parsers for the MQTT payloads. The contract is documented in docs/mqtt-contract.md.
// Anything that does not match is rejected so a bad publisher cannot put the
// twin in an undefined state.

import {
  EMERGENCY_ACTIVE_LOW,
  IO_CHANNELS,
  IO_POINTS,
  type IoDirection,
  type SignalId,
} from './cell';

export interface PlcIoSnapshot {
  /** Publisher timestamp (ms since epoch), if it sent one. */
  ts: number | null;
  /** Local time the message arrived; used for staleness. */
  receivedAt: number;
  di: boolean[];
  do: boolean[];
  /** PLC `Etapa`, `iContador` and `Ligar`, sent by the bridge; null if absent. */
  step: number | null;
  count: number | null;
  running: boolean | null;
}

export interface RobotState {
  ts: number | null;
  receivedAt: number;
  /** Joint positions base to flange, units per src/model/robots.ts. */
  joints: number[];
  mode: string | null;
}

export type SourceStatus = 'online' | 'offline' | 'simulated' | 'unknown';

function toBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 0 || value === 1) return value === 1;
  return null;
}

function parseChannels(value: unknown): boolean[] | null {
  if (!Array.isArray(value) || value.length !== IO_CHANNELS) return null;
  const out: boolean[] = [];
  for (const item of value) {
    const b = toBool(item);
    if (b === null) return null;
    out.push(b);
  }
  return out;
}

function parseTs(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseJson(payload: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(payload);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function parsePlcIo(payload: string, receivedAt: number): PlcIoSnapshot | null {
  const obj = parseJson(payload);
  if (!obj) return null;
  const di = parseChannels(obj.di);
  const dout = parseChannels(obj.do);
  if (!di || !dout) return null;
  return {
    ts: parseTs(obj.ts),
    receivedAt,
    di,
    do: dout,
    step: parseByte(obj.step),
    count: parseByte(obj.count),
    running: obj.running === undefined ? null : toBool(obj.running),
  };
}

/** Optional 0..255 integer (one byte of the PLC packet). */
function parseByte(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255 ? value : null;
}

/** `jointCount` comes from src/model/robots.ts (4 for the Stäubli SCARA, 6 for the Jaka). */
export function parseRobotState(payload: string, receivedAt: number, jointCount: number): RobotState | null {
  const obj = parseJson(payload);
  if (!obj || !Array.isArray(obj.joints) || obj.joints.length !== jointCount) return null;
  if (!obj.joints.every((j) => typeof j === 'number' && Number.isFinite(j))) return null;
  return {
    ts: parseTs(obj.ts),
    receivedAt,
    joints: obj.joints as number[],
    mode: typeof obj.mode === 'string' ? obj.mode : null,
  };
}

export function parseSourceStatus(payload: string): SourceStatus {
  const value = payload.trim().toLowerCase();
  return value === 'online' || value === 'offline' || value === 'simulated' ? value : 'unknown';
}

export function channelValue(
  io: PlcIoSnapshot | null,
  direction: IoDirection,
  channel: number,
): boolean | null {
  if (!io) return null;
  return io[direction][channel - 1] ?? null;
}

export function signalValue(io: PlcIoSnapshot | null, id: SignalId): boolean | null {
  const point = IO_POINTS.find((p) => p.id === id);
  return point ? channelValue(io, point.direction, point.channel) : null;
}

/** True when the E-stop is pressed, null when unknown. */
export function isEmergencyActive(io: PlcIoSnapshot | null): boolean | null {
  const raw = signalValue(io, 'emergency');
  if (raw === null) return null;
  return EMERGENCY_ACTIVE_LOW ? !raw : raw;
}
