// Kinematic description of the two robots, as far as the twin needs it.
// From the cell photos: the Stäubli is a 4-axis SCARA (check the nameplate for
// the exact model) and the Jaka Minicobo is a 6-axis cobot.

import type { RobotId } from './cell';

export interface JointDef {
  label: string;
  unit: '°' | 'mm';
}

export interface RobotDef {
  id: RobotId;
  name: string;
  kind: string;
  joints: readonly JointDef[];
}

const rotary = (label: string): JointDef => ({ label, unit: '°' });

export const ROBOTS: Record<RobotId, RobotDef> = {
  staubli: {
    id: 'staubli',
    name: 'Stäubli',
    kind: '4-axis SCARA',
    // J3 is the vertical (prismatic) axis: 0 = top, positive = down.
    joints: [rotary('J1'), rotary('J2'), { label: 'J3', unit: 'mm' }, rotary('J4')],
  },
  jaka: {
    id: 'jaka',
    name: 'Jaka Minicobo',
    kind: '6-axis cobot',
    joints: ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'].map(rotary),
  },
};

/** Display order: Stäubli on the left of the cell, Jaka on the right. */
export const ROBOT_IDS: readonly RobotId[] = ['staubli', 'jaka'];
