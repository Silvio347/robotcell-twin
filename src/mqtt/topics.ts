import { config } from '../config';
import type { RobotId } from '../model/cell';

const p = config.topicPrefix;

export const topics = {
  all: `${p}/#`,
  plcIo: `${p}/plc/io`,
  sourceStatus: `${p}/source/status`,
  robotState: (robot: RobotId) => `${p}/${robot}/state`,
} as const;

export function robotFromStateTopic(topic: string): RobotId | null {
  if (topic === topics.robotState('jaka')) return 'jaka';
  if (topic === topics.robotState('staubli')) return 'staubli';
  return null;
}
