import { create } from 'zustand';
import type { RobotId } from '../model/cell';
import type { PlcIoSnapshot, RobotState, SourceStatus } from '../model/messages';

/** 'demo' = data generated in the browser by src/sim/demo.ts, no broker. */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'demo';

interface TwinState {
  connection: ConnectionState;
  error: string | null;
  source: SourceStatus;
  io: PlcIoSnapshot | null;
  robots: Record<RobotId, RobotState | null>;
  setConnection: (connection: ConnectionState) => void;
  setError: (error: string | null) => void;
  setSource: (source: SourceStatus) => void;
  setIo: (io: PlcIoSnapshot) => void;
  setRobot: (robot: RobotId, state: RobotState) => void;
  reset: () => void;
}

const initialData = {
  source: 'unknown' as SourceStatus,
  io: null,
  robots: { jaka: null, staubli: null },
};

export const useTwinStore = create<TwinState>()((set) => ({
  connection: 'disconnected',
  error: null,
  ...initialData,
  setConnection: (connection) => set({ connection }),
  setError: (error) => set({ error }),
  setSource: (source) => set({ source }),
  setIo: (io) => set({ io }),
  setRobot: (robot, state) => set((s) => ({ robots: { ...s.robots, [robot]: state } })),
  reset: () => set({ ...initialData, robots: { jaka: null, staubli: null } }),
}));
