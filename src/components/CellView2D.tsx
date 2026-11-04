// Top-down schematic of the cell driven by PLC I/O. Arm poses come from live
// joints when available, otherwise from the PLC-based estimate.
// Positions are placeholders: adjust them to the real layout once the cell
// is measured (all coordinates are in SVG units of the viewBox).

import { useRobotView } from '../hooks/useRobotView';
import { pointsOfRobot, type RobotId, type SignalId } from '../model/cell';
import { isEmergencyActive, signalValue, type PlcIoSnapshot } from '../model/messages';

const VIEW = { w: 800, h: 440 };

// `heading` is the direction of J1 = 0 in the drawing (degrees, counter-clockwise
// from +x): both robots face the conveyor.
const ROBOT_POS: Record<RobotId, { x: number; y: number; name: string; heading: number }> = {
  staubli: { x: 130, y: 220, name: 'Stäubli', heading: 0 },
  jaka: { x: 670, y: 220, name: 'Jaka', heading: 180 },
};

// Drawing sizes in SVG units, not real link lengths.
const SCARA_LINKS = { l1: 65, l2: 65 };
const SCARA_STROKE_MM = 200;
const JAKA_REACH = 100;

type Point = { x: number; y: number };

function polar(from: Point, deg: number, len: number): Point {
  const r = (deg * Math.PI) / 180;
  return { x: from.x + len * Math.cos(r), y: from.y - len * Math.sin(r) };
}

/** Top view of the arm: SCARA links from J1/J2 (J3 shown as tool size), Jaka as its J1 direction. */
function Arm({ robot, joints }: { robot: RobotId; joints: readonly number[] }) {
  const { x, y, heading } = ROBOT_POS[robot];
  const base = { x, y };
  const j = (i: number) => joints[i] ?? 0;

  if (robot === 'staubli') {
    const elbow = polar(base, heading + j(0), SCARA_LINKS.l1);
    const tool = polar(elbow, heading + j(0) + j(1), SCARA_LINKS.l2);
    const down = Math.min(Math.max(j(2) / SCARA_STROKE_MM, 0), 1);
    return (
      <g>
        <polyline points={`${base.x},${base.y} ${elbow.x},${elbow.y} ${tool.x},${tool.y}`} className="svg-arm" />
        <circle cx={elbow.x} cy={elbow.y} r={6} className="svg-joint" />
        <circle cx={tool.x} cy={tool.y} r={9 - 5 * down} className="svg-tool" />
      </g>
    );
  }

  const tool = polar(base, heading + j(0), JAKA_REACH);
  return (
    <g>
      <line x1={base.x} y1={base.y} x2={tool.x} y2={tool.y} className="svg-arm" />
      <circle cx={tool.x} cy={tool.y} r={7} className="svg-tool" />
    </g>
  );
}

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

function Robot({ robot, io, now }: { robot: RobotId; io: PlcIoSnapshot | null; now: number }) {
  const { x, y, name } = ROBOT_POS[robot];
  const { joints, estimate } = useRobotView(robot, now);
  const fromRobot = pointsOfRobot(robot, 'di'); // robot DO -> PLC
  const toRobot = pointsOfRobot(robot, 'do'); // PLC -> robot DI
  const anyActive = [...fromRobot, ...toRobot].some((p) => signalValue(io, p.id));
  const ledX = x - 55;
  const barWidth = 120;

  return (
    <g>
      <text x={x} y={y + 44} textAnchor="middle" className="svg-title">
        {name}
      </text>
      {estimate && (
        <g>
          <text x={x} y={y + 62} textAnchor="middle" className="svg-phase">
            {estimate.phase}
          </text>
          <rect x={x - barWidth / 2} y={y + 70} width={barWidth} height={4} rx={2} className="svg-progress-track" />
          <rect
            x={x - barWidth / 2}
            y={y + 70}
            width={barWidth * estimate.progress}
            height={4}
            rx={2}
            className="svg-progress"
          />
        </g>
      )}
      {/* Arm last so it stays visible when it swings over the labels. */}
      <circle cx={x} cy={y} r={18} className={`svg-robot ${anyActive ? 'is-active' : ''}`} />
      {joints && <Arm robot={robot} joints={joints} />}

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

export function CellView2D({ io, stale, now }: { io: PlcIoSnapshot | null; stale: boolean; now: number }) {
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

      <Robot robot="staubli" io={data} now={now} />
      <Robot robot="jaka" io={data} now={now} />

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
