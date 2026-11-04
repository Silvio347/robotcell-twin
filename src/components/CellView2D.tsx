// Top-down schematic of the cell driven only by PLC I/O.
// Positions are placeholders: adjust them to the real layout once the cell
// is measured/photographed (all coordinates are in SVG units of the viewBox).

import { pointsOfRobot, type RobotId, type SignalId } from '../model/cell';
import { isEmergencyActive, signalValue, type PlcIoSnapshot } from '../model/messages';

const VIEW = { w: 800, h: 440 };

const ROBOT_POS: Record<RobotId, { x: number; y: number; name: string }> = {
  staubli: { x: 130, y: 220, name: 'Stäubli' },
  jaka: { x: 670, y: 220, name: 'Jaka' },
};

const CONVEYORS: { id: SignalId; y: number; label: string; dir: 1 | -1 }[] = [
  { id: 'conveyorStaubliToJaka', y: 165, label: 'Conveyor Stäubli → Jaka', dir: 1 },
  { id: 'conveyorJakaToStaubli', y: 245, label: 'Conveyor Jaka → Stäubli', dir: -1 },
];
const CONVEYOR_X = { from: 230, to: 570, height: 30 };

function ledClass(value: boolean | null): string {
  return value === null ? 'svg-led-unknown' : value ? 'svg-led-on' : 'svg-led-off';
}

function Led({ x, y, value, label }: { x: number; y: number; value: boolean | null; label: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={6} className={ledClass(value)} />
      <text x={x + 12} y={y + 4} className="svg-small">
        {label}
      </text>
    </g>
  );
}

function Robot({ robot, io }: { robot: RobotId; io: PlcIoSnapshot | null }) {
  const { x, y, name } = ROBOT_POS[robot];
  const fromRobot = pointsOfRobot(robot, 'di'); // robot DO -> PLC
  const toRobot = pointsOfRobot(robot, 'do'); // PLC -> robot DI
  const anyActive = [...fromRobot, ...toRobot].some((p) => signalValue(io, p.id));
  const ledX = x - 55;

  return (
    <g>
      <circle cx={x} cy={y} r={55} className={`svg-robot ${anyActive ? 'is-active' : ''}`} />
      <text x={x} y={y + 5} textAnchor="middle" className="svg-title">
        {name}
      </text>

      <text x={ledX} y={40} className="svg-caption">
        Robot → PLC
      </text>
      {fromRobot.map((p, i) => (
        <Led key={p.id} x={ledX + 6} y={58 + i * 18} value={signalValue(io, p.id)} label={p.label} />
      ))}

      <text x={ledX} y={330} className="svg-caption">
        PLC → Robot
      </text>
      {toRobot.map((p, i) => (
        <Led key={p.id} x={ledX + 6} y={348 + i * 18} value={signalValue(io, p.id)} label={p.label} />
      ))}
    </g>
  );
}

export function CellView2D({ io, stale }: { io: PlcIoSnapshot | null; stale: boolean }) {
  const data = stale ? null : io;
  const emergency = isEmergencyActive(data);

  return (
    <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className="cell-view" role="img" aria-label="Robot cell schematic">
      <rect x={1} y={1} width={VIEW.w - 2} height={VIEW.h - 2} rx={12} className={`svg-frame ${emergency ? 'is-emergency' : ''}`} />

      {CONVEYORS.map((c) => {
        const running = signalValue(data, c.id) === true;
        const len = CONVEYOR_X.to - CONVEYOR_X.from;
        const mid = c.y + CONVEYOR_X.height / 2;
        return (
          <g key={c.id}>
            <rect x={CONVEYOR_X.from} y={c.y} width={len} height={CONVEYOR_X.height} rx={6} className="svg-conveyor" />
            <line
              x1={CONVEYOR_X.from + 8}
              x2={CONVEYOR_X.to - 8}
              y1={mid}
              y2={mid}
              className={`svg-belt ${running ? (c.dir === 1 ? 'run-forward' : 'run-backward') : ''}`}
            />
            <text x={CONVEYOR_X.from + len / 2} y={c.y - 6} textAnchor="middle" className="svg-small">
              {c.label} {running ? '(running)' : ''}
            </text>
          </g>
        );
      })}

      <Led x={CONVEYOR_X.from - 12} y={220} value={signalValue(data, 'staubliSensor')} label="" />
      <text x={CONVEYOR_X.from - 12} y={212} textAnchor="middle" className="svg-small">
        Sensor
      </text>
      <Led x={CONVEYOR_X.to + 12} y={220} value={signalValue(data, 'jakaSensor')} label="" />
      <text x={CONVEYOR_X.to + 12} y={212} textAnchor="middle" className="svg-small">
        Sensor
      </text>

      <Robot robot="staubli" io={data} />
      <Robot robot="jaka" io={data} />

      {emergency && (
        <text x={VIEW.w / 2} y={VIEW.h - 24} textAnchor="middle" className="svg-emergency">
          EMERGENCY STOP
        </text>
      )}
      {stale && (
        <g>
          <rect x={0} y={0} width={VIEW.w} height={VIEW.h} rx={12} className="svg-stale" />
          <text x={VIEW.w / 2} y={VIEW.h / 2} textAnchor="middle" className="svg-title">
            No live PLC data
          </text>
        </g>
      )}
    </svg>
  );
}
