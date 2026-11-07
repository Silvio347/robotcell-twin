// Robot tasks of the whiteboard application as seen from the PLC
// (NewProgram in plc/ProjetoFinalRobotica, docs/whiteboard-application.md).
// See docs/robot-estimation.md for the reasoning behind each event.
//
// Every command uses a four-phase handshake, so most segments end on an exact
// PLC event. Optional events are progress pulses the robot programs may set:
//   Jaka DO5    = marker gripped
//   Stäubli DO6 = one part placed      Stäubli DO7 = one square drawn
// Until a pulse has been seen once, its segment advances on time.

import type { RobotId } from '../model/cell';
import { JAKA_POSES as J, STAUBLI_POSES as S, STAUBLI_SQUARES } from '../model/poses';
import type { TaskDef } from './engine';

const [square1, square2] = STAUBLI_SQUARES;

export const TASKS: Record<RobotId, TaskDef> = {
  jaka: {
    robot: 'jaka',
    // Cobot joints, deg/s (nominal, for timing the moves only).
    jointSpeeds: [90, 90, 90, 120, 120, 120],
    segments: [
      {
        // PLC step 0 sets Jaka DI3: put the marker on the conveyor.
        label: 'Home, waiting for the PLC',
        path: [J.home],
        defaultMs: 2000,
        learn: false,
        endsOn: [{ signal: 'jakaDi3', when: 'high' }],
      },
      {
        label: 'Picking the marker',
        path: [J.aboveMarker, J.pickMarker, J.aboveMarker],
        defaultMs: 2500,
        grip: { at: 1, closed: true },
        meta: { item: 'marker' },
        endsOn: [{ signal: 'jakaDo5', when: 'rise', optional: true }],
      },
      {
        label: 'Putting the marker on the conveyor',
        path: [J.aboveConveyor, J.placeConveyor],
        defaultMs: 2000,
        endsOn: [{ signal: 'jakaSensor', when: 'rise' }],
      },
      {
        // DONE: Jaka DO7. The PLC then clears DI3 and starts the conveyor.
        label: 'Releasing the marker',
        path: [J.placeConveyor],
        defaultMs: 500,
        grip: { at: 0, closed: false },
        meta: { item: 'marker' },
        endsOn: [{ signal: 'jakaDo7', when: 'rise' }],
      },
      {
        label: 'Returning home',
        path: [J.aboveConveyor, J.home],
        defaultMs: 2000,
        endsOn: [],
      },
    ],
  },
  staubli: {
    robot: 'staubli',
    // J1, J2, J4 in deg/s and J3 in mm/s (nominal, for timing the moves only).
    jointSpeeds: [300, 300, 400, 600],
    // Lift J3 to the top before J1/J2/J4 move, like VAL3 approach points.
    travelAxis: { axis: 2, safe: 0 },
    segments: [
      {
        // 0. PLC step 0 sets Stäubli DI12: place the two parts on the board.
        label: 'Home, waiting for the PLC',
        path: [S.home],
        defaultMs: 2000,
        learn: false,
        endsOn: [{ signal: 'staubliDi12', when: 'high' }],
      },
      {
        // 1
        label: 'Picking part 1',
        path: [S.aboveSource1, S.pickSource1, S.aboveSource1],
        defaultMs: 1500,
        grip: { at: 1, closed: true },
        meta: { item: 'part1' },
        endsOn: [],
      },
      {
        // 2
        label: 'Placing part 1 on the board',
        path: [S.aboveSlot1, S.placeSlot1, S.aboveSlot1],
        defaultMs: 1500,
        grip: { at: 1, closed: false },
        meta: { item: 'part1' },
        endsOn: [{ signal: 'staubliDo6', when: 'rise', optional: true }],
      },
      {
        // 3
        label: 'Picking part 2',
        path: [S.aboveSource2, S.pickSource2, S.aboveSource2],
        defaultMs: 1500,
        grip: { at: 1, closed: true },
        meta: { item: 'part2' },
        endsOn: [],
      },
      {
        // 4. DONE: Stäubli DO4, after going home.
        label: 'Placing part 2 on the board',
        path: [S.aboveSlot2, S.placeSlot2, S.aboveSlot2, S.home],
        defaultMs: 2000,
        grip: { at: 1, closed: false },
        meta: { item: 'part2' },
        endsOn: [{ signal: 'staubliDo4', when: 'rise' }],
      },
      {
        // 5. PLC step 2 sets Stäubli DI14 once the marker has arrived.
        label: 'Home, waiting for the marker',
        path: [S.home],
        defaultMs: 2000,
        learn: false,
        endsOn: [{ signal: 'staubliDi14', when: 'high' }],
      },
      {
        // 6. The marker leaves Sensor Stäubli when it is lifted.
        label: 'Picking the marker',
        path: [S.abovePickMarker, S.pickMarker, S.abovePickMarker],
        defaultMs: 1500,
        grip: { at: 1, closed: true },
        meta: { item: 'marker' },
        endsOn: [{ signal: 'staubliSensor', when: 'fall' }],
      },
      {
        // 7
        label: 'Drawing square 1',
        path: square1,
        defaultMs: 4000,
        noLift: true,
        meta: { square: 0 },
        endsOn: [{ signal: 'staubliDo7', when: 'rise', optional: true }],
      },
      {
        // 8
        label: 'Drawing square 2',
        path: square2,
        defaultMs: 4000,
        noLift: true,
        meta: { square: 1 },
        endsOn: [{ signal: 'staubliDo7', when: 'rise', optional: true }],
      },
      {
        // 9. DONE: Stäubli DO5, after going home.
        label: 'Storing the marker',
        path: [S.aboveHolder, S.placeHolder, S.aboveHolder, S.home],
        defaultMs: 2000,
        grip: { at: 1, closed: false },
        meta: { item: 'marker' },
        endsOn: [{ signal: 'staubliDo5', when: 'rise' }],
      },
    ],
  },
};
