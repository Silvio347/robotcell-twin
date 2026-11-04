// Robot tasks as seen from the PLC (NewProgram in plc/ProjetoFinalRobotica).
// See docs/robot-estimation.md for the reasoning behind each event.
//
// Optional events use robot outputs that are already wired to the PLC but not
// set by the current robot programs. If a robot program starts setting them,
// the estimator picks them up automatically:
//   Jaka DO5     = part gripped        Jaka DO6     = back at home
//   Stäubli DO4  = part gripped        Stäubli DO5  = part placed
//   Stäubli DO6  = back at home

import type { RobotId } from '../model/cell';
import { JAKA_POSES as J, STAUBLI_POSES as S } from '../model/poses';
import type { TaskDef } from './engine';

export const TASKS: Record<RobotId, TaskDef> = {
  jaka: {
    robot: 'jaka',
    segments: [
      {
        // PLC step 0 sets Jaka DI3 ("may place").
        label: 'Home, waiting for the PLC',
        path: [J.home],
        defaultMs: 2000,
        learn: false,
        endsOn: [{ signal: 'jakaDi3', when: 'high' }],
      },
      {
        label: 'Picking part',
        path: [J.abovePart, J.pickPart, J.abovePart],
        defaultMs: 3000,
        endsOn: [{ signal: 'jakaDo5', when: 'rise', optional: true }],
      },
      {
        label: 'Placing part on conveyor',
        path: [J.aboveConveyor, J.placeConveyor],
        defaultMs: 2500,
        endsOn: [{ signal: 'jakaSensor', when: 'rise' }],
      },
      {
        // PLC step 1 waits for Sensor Jaka AND Jaka DO7.
        label: 'Releasing part',
        path: [J.placeConveyor],
        defaultMs: 500,
        endsOn: [{ signal: 'jakaDo7', when: 'rise' }],
      },
      {
        label: 'Returning home',
        path: [J.aboveConveyor, J.home],
        defaultMs: 2000,
        endsOn: [{ signal: 'jakaDo6', when: 'rise', optional: true }],
      },
    ],
  },
  staubli: {
    robot: 'staubli',
    segments: [
      {
        // PLC step 2 sets Stäubli DI12 ("may pick") once the part is at the sensor.
        label: 'Home, waiting for a part',
        path: [S.home],
        defaultMs: 2000,
        learn: false,
        endsOn: [{ signal: 'staubliDi12', when: 'high', also: ['staubliSensor'] }],
      },
      {
        // The part leaves the sensor when the Stäubli lifts it.
        label: 'Picking part from conveyor',
        path: [S.abovePick, S.pick, S.abovePick],
        defaultMs: 2500,
        endsOn: [
          { signal: 'staubliSensor', when: 'fall' },
          { signal: 'staubliDo4', when: 'rise', optional: true },
        ],
      },
      {
        label: 'Placing part',
        path: [S.abovePlace, S.place, S.abovePlace],
        defaultMs: 3000,
        endsOn: [{ signal: 'staubliDo5', when: 'rise', optional: true }],
      },
      {
        label: 'Returning home',
        path: [S.home],
        defaultMs: 2000,
        endsOn: [{ signal: 'staubliDo6', when: 'rise', optional: true }],
      },
    ],
  },
};
