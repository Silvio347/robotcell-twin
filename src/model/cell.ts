// Static description of the robot cell, taken from Table I of the
// "Projeto Célula Robótica" handout (Inatel): Power Panel 4PP481.1043-B5 with
// X20DI9371 (12 digital inputs) and X20DO9322 (12 digital outputs).
//
// Direction is seen from the PLC: "di" = signal read by the PLC,
// "do" = signal written by the PLC.

export type RobotId = 'jaka' | 'staubli';
export type IoDirection = 'di' | 'do';

export const IO_CHANNELS = 12;

export interface IoPoint {
  id: string;
  direction: IoDirection;
  /** 1-based channel number on the X20 module. */
  channel: number;
  label: string;
  robot?: RobotId;
}

export const IO_POINTS = [
  // X20DI9371 - inputs to the PLC
  { id: 'jakaDo7', direction: 'di', channel: 1, label: 'Jaka DO7', robot: 'jaka' },
  { id: 'jakaDo6', direction: 'di', channel: 2, label: 'Jaka DO6', robot: 'jaka' },
  { id: 'jakaDo5', direction: 'di', channel: 3, label: 'Jaka DO5', robot: 'jaka' },
  { id: 'staubliDo4', direction: 'di', channel: 5, label: 'Stäubli DO4', robot: 'staubli' },
  { id: 'staubliDo5', direction: 'di', channel: 6, label: 'Stäubli DO5', robot: 'staubli' },
  { id: 'staubliDo6', direction: 'di', channel: 7, label: 'Stäubli DO6', robot: 'staubli' },
  { id: 'staubliDo7', direction: 'di', channel: 8, label: 'Stäubli DO7', robot: 'staubli' },
  { id: 'staubliSensor', direction: 'di', channel: 9, label: 'Sensor Stäubli' },
  { id: 'jakaSensor', direction: 'di', channel: 10, label: 'Sensor Jaka' },
  { id: 'emergency', direction: 'di', channel: 12, label: 'Emergency stop' },

  // X20DO9322 - outputs from the PLC
  { id: 'jakaDi3', direction: 'do', channel: 1, label: 'Jaka DI3', robot: 'jaka' },
  { id: 'jakaDi2', direction: 'do', channel: 2, label: 'Jaka DI2', robot: 'jaka' },
  { id: 'jakaDi1', direction: 'do', channel: 3, label: 'Jaka DI1', robot: 'jaka' },
  { id: 'staubliDi12', direction: 'do', channel: 5, label: 'Stäubli DI12', robot: 'staubli' },
  { id: 'staubliDi13', direction: 'do', channel: 6, label: 'Stäubli DI13', robot: 'staubli' },
  { id: 'staubliDi14', direction: 'do', channel: 7, label: 'Stäubli DI14', robot: 'staubli' },
  { id: 'staubliDi15', direction: 'do', channel: 8, label: 'Stäubli DI15', robot: 'staubli' },
  { id: 'conveyorStaubliToJaka', direction: 'do', channel: 11, label: 'Conveyor Stäubli → Jaka' },
  { id: 'conveyorJakaToStaubli', direction: 'do', channel: 12, label: 'Conveyor Jaka → Stäubli' },
] as const satisfies readonly IoPoint[];

export type CellIoPoint = (typeof IO_POINTS)[number];
export type SignalId = CellIoPoint['id'];

/**
 * The E-stop input reads TRUE while the cell is safe: the PLC program
 * (ProjetoFinalRobotica, NewProgram) only runs the cycle when
 * `Ligar AND Emergencia`.
 */
export const EMERGENCY_ACTIVE_LOW = true;

export function findIoPoint(direction: IoDirection, channel: number): CellIoPoint | undefined {
  return IO_POINTS.find((p) => p.direction === direction && p.channel === channel);
}

export function pointsOfRobot(robot: RobotId, direction: IoDirection): CellIoPoint[] {
  return IO_POINTS.filter((p: IoPoint) => p.robot === robot && p.direction === direction);
}
