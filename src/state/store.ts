import { create } from 'zustand';
import type { RobotEstimate } from '../estimator/engine';
import type { RobotId } from '../model/cell';
import type { PlcIoSnapshot, RobotState, SourceStatus } from '../model/messages';

/** 'demo' = data generated in the browser by src/sim/demo.ts, no broker. */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'demo';

interface TwinState {
  connection: ConnectionState;
  error: string | null;
  source: SourceStatus;
  io: PlcIoSnapshot | null;
  /** Joint positions measured by the robot controllers (MQTT), if any. */
  robots: Record<RobotId, RobotState | null>;
  /** Phase and joints estimated from PLC I/O (src/estimator). */
  estimates: Record<RobotId, RobotEstimate | null>;
  setConnection: (connection: ConnectionState) => void;
  setError: (error: string | null) => void;
  setSource: (source: SourceStatus) => void;
  setIo: (io: PlcIoSnapshot) => void;
  setRobot: (robot: RobotId, state: RobotState) => void;
  setEstimates: (estimates: Record<RobotId, RobotEstimate>) => void;
  reset: () => void;
}

const initialData = () => ({
  source: 'unknown' as SourceStatus,
  io: null,
  robots: { jaka: null, staubli: null },
});

export const useTwinStore = create<TwinState>()((set) => ({
  connection: 'disconnected',
  error: null,
  estimates: { jaka: null, staubli: null },
  ...initialData(),
  setConnection: (connection) => set({ connection }),
  setError: (error) => set({ error }),
  setSource: (source) => set({ source }),
  setIo: (io) => set({ io }),
  setRobot: (robot, state) => set((s) => ({ robots: { ...s.robots, [robot]: state } })),
  setEstimates: (estimates) => set({ estimates }),
  // Estimates are not cleared here: the estimator resets itself when io becomes null.
  reset: () => set(initialData()),
}));
