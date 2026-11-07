// Top view of the cell, drawn to scale from src/model/layout.ts (mm).
// Arms come from forward kinematics of the joints (live when available,
// otherwise estimated from the PLC), marker, parts and ink from the item
// estimator.
// Tool height is shown on a gauge next to each robot because a top view
// cannot show it.

import { useRobotView } from '../hooks/useRobotView';
import { pointsOfRobot, type RobotId, type SignalId } from '../model/cell';
import { jakaFk, SCARA, scaraFk } from '../model/kinematics';
import { LAYOUT, toCellFrame, type ConveyorLayout, type Point2, type Point3 } from '../model/layout';
import { isEmergencyActive, signalValue, type PlcIoSnapshot } from '../model/messages';
import { useTwinStore } from '../state/store';

const PANEL = 100; // side columns with the robot signals
const MARGIN = 28;
const { bounds } = LAYOUT;
const K = 0.295; // SVG units per mm
const VIEW = {
  w: PANEL * 2 + (bounds.maxX - bounds.minX) * K,
  h: MARGIN * 2 + (bounds.maxY - bounds.minY) * K,
};

const sx = (x: number) => PANEL + (x - bounds.minX) * K;
const sy = (y: number) => MARGIN + (bounds.maxY - y) * K;
const sp = (p: Point2) => ({ x: sx(p.x), y: sy(p.y) });

const JAKA_REACH = 580;
const Z_RANGE: Record<RobotId, { min: number; max: number }> = {
  staubli: { min: SCARA.zTop - SCARA.stroke, max: SCARA.zTop },
  jaka: { min: 0, max: 450 },
};
const NAMES: Record<RobotId, string> = { staubli: 'Stäubli', jaka: 'Jaka' };

const CONVEYORS: { id: SignalId; layout: ConveyorLayout; label: string }[] = [
  { id: 'conveyorStaubliToJaka', layout: LAYOUT.conveyors.staubliToJaka, label: 'Conveyor Stäubli → Jaka' },
  { id: 'conveyorJakaToStaubli', layout: LAYOUT.conveyors.jakaToStaubli, label: 'Conveyor Jaka → Stäubli' },
];

function ledClass(value: boolean | null): string {
  return value === null ? 'svg-led-unknown' : value ? 'svg-led-on' : 'svg-led-off';
}

function Led({ x, y, value, label }: { x: number; y: number; value: boolean | null; label: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={5} className={ledClass(value)} />
      {label && (
        <text x={x + 10} y={y + 4} className="svg-small">
          {label}
        </text>
      )}
    </g>
  );
}

function Part({ at, faded = false }: { at: Point2; faded?: boolean }) {
  const size = LAYOUT.part.size * K;
  const p = sp(at);
  return (
    <rect x={p.x - size / 2} y={p.y - size / 2} width={size} height={size} rx={2} className={`svg-part ${faded ? 'is-faded' : ''}`} />
  );
}

function Marker({ at }: { at: Point2 }) {
  const l = LAYOUT.marker.length * K;
  const d = LAYOUT.marker.diameter * K;
  const p = sp(at);
  return (
    <g>
      <rect x={p.x - l / 2} y={p.y - d / 2} width={l} height={d} rx={d / 2} className="svg-marker" />
      <rect x={p.x - l / 2} y={p.y - d / 2} width={l * 0.18} height={d} rx={d / 2} className="svg-marker-tip" />
    </g>
  );
}

/** Tool position and drawing of one arm, in cell coordinates. */
function armGeometry(robot: RobotId, joints: readonly number[]): { chain: Point3[]; tool: Point3; toolYaw: number | null } {
  if (robot === 'staubli') {
    const fk = scaraFk(joints);
    const base = { x: 0, y: 0, z: SCARA.zTop };
    const chain = [base, fk.elbow, fk.tool].map((p) => toCellFrame('staubli', p));
    return { chain, tool: chain[2]!, toolYaw: fk.toolYaw + LAYOUT.robots.staubli.yaw };
  }
  const chain = jakaFk(joints).points.map((p) => toCellFrame('jaka', p));
  return { chain, tool: chain[chain.length - 1]!, toolYaw: null };
}

function ZGauge({ robot, z, x, y }: { robot: RobotId; z: number; x: number; y: number }) {
  const { min, max } = Z_RANGE[robot];
  const h = 70;
  const k = Math.min(Math.max((z - min) / (max - min), 0), 1);
  return (
    <g>
      <rect x={x - 3} y={y} width={6} height={h} rx={3} className="svg-progress-track" />
      <circle cx={x} cy={y + h * (1 - k)} r={5} className="svg-tool" />
      <text x={x} y={y - 6} textAnchor="middle" className="svg-small">
        Z {z.toFixed(0)} mm
      </text>
    </g>
  );
}

function Robot({ robot, now, gaugeX }: { robot: RobotId; now: number; gaugeX: number }) {
  const base = sp(LAYOUT.robots[robot]);
  const { joints, estimate } = useRobotView(robot, now);
  const geo = joints ? armGeometry(robot, joints) : null;
  const reach = robot === 'staubli' ? SCARA.l1 + SCARA.l2 : JAKA_REACH;
  const barWidth = 120;

  return (
    <g>
      <circle cx={base.x} cy={base.y} r={reach * K} className="svg-reach" />
      <circle cx={base.x} cy={base.y} r={16} className="svg-robot" />
      {geo && (
        <g>
          <polyline points={geo.chain.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')} className="svg-arm" />
          {geo.chain.slice(1, -1).map((p, i) => (
            <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={4} className="svg-joint" />
          ))}
          {geo.toolYaw !== null && (
            <line
              x1={sx(geo.tool.x) - 9 * Math.cos((geo.toolYaw * Math.PI) / 180)}
              y1={sy(geo.tool.y) + 9 * Math.sin((geo.toolYaw * Math.PI) / 180)}
              x2={sx(geo.tool.x) + 9 * Math.cos((geo.toolYaw * Math.PI) / 180)}
              y2={sy(geo.tool.y) - 9 * Math.sin((geo.toolYaw * Math.PI) / 180)}
              className="svg-gripper"
            />
          )}
          <circle cx={sx(geo.tool.x)} cy={sy(geo.tool.y)} r={4} className="svg-tool" />
          <ZGauge robot={robot} z={geo.tool.z} x={gaugeX} y={base.y - 35} />
        </g>
      )}
      {/* Labels last, outlined, so they stay readable when the arm crosses them. */}
      <text x={base.x} y={base.y + 44} textAnchor="middle" className="svg-title svg-halo">
        {NAMES[robot]}
      </text>
      {estimate && (
        <g>
          <text x={base.x} y={base.y + 60} textAnchor="middle" className="svg-phase svg-halo">
            {estimate.phase}
          </text>
          <rect x={base.x - barWidth / 2} y={base.y + 67} width={barWidth} height={4} rx={2} className="svg-progress-track" />
          <rect
            x={base.x - barWidth / 2}
            y={base.y + 67}
            width={barWidth * estimate.progress}
            height={4}
            rx={2}
            className="svg-progress"
          />
        </g>
      )}
    </g>
  );
}

function SignalPanel({ robot, io, x }: { robot: RobotId; io: PlcIoSnapshot | null; x: number }) {
  const fromRobot = pointsOfRobot(robot, 'di');
  const toRobot = pointsOfRobot(robot, 'do');
  return (
    <g>
      <text x={x} y={MARGIN + 6} className="svg-caption">
        {NAMES[robot]} → PLC
      </text>
      {fromRobot.map((p, i) => (
        <Led key={p.id} x={x + 6} y={MARGIN + 24 + i * 17} value={signalValue(io, p.id)} label={p.label} />
      ))}
      <text x={x} y={VIEW.h / 2 + 40} className="svg-caption">
        PLC → {NAMES[robot]}
      </text>
      {toRobot.map((p, i) => (
        <Led key={p.id} x={x + 6} y={VIEW.h / 2 + 58 + i * 17} value={signalValue(io, p.id)} label={p.label} />
      ))}
    </g>
  );
}

function lerp(a: Point2, b: Point2, t: number): Point2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function Fixtures() {
  const { board, boardSlots, partSource, jakaMarkerHolder, staubliMarkerHolder, squareHalf } = LAYOUT;
  const b = sp({ x: board.x - board.width / 2, y: board.y + board.depth / 2 });
  const holder = (at: Point2, label: string) => {
    const p = sp(at);
    const w = (LAYOUT.marker.length + 30) * K;
    const h = (LAYOUT.marker.diameter + 30) * K;
    return (
      <g>
        <rect x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} className="svg-area" />
        <text x={p.x} y={p.y + h / 2 + 11} textAnchor="middle" className="svg-small">
          {label}
        </text>
      </g>
    );
  };
  return (
    <g>
      <rect x={b.x} y={b.y} width={board.width * K} height={board.depth * K} rx={2} className="svg-board" />
      <text x={b.x + (board.width * K) / 2} y={b.y - 5} textAnchor="middle" className="svg-small">
        Whiteboard
      </text>
      {boardSlots.map((slot, i) => {
        const c = sp({ x: slot.x - squareHalf, y: slot.y + squareHalf });
        return <rect key={i} x={c.x} y={c.y} width={2 * squareHalf * K} height={2 * squareHalf * K} className="svg-square-guide" />;
      })}
      {partSource.map((src, i) => {
        const p = sp(src);
        const size = (LAYOUT.part.size + 16) * K;
        return <rect key={i} x={p.x - size / 2} y={p.y - size / 2} width={size} height={size} className="svg-area" />;
      })}
      <text x={sx(partSource[0]!.x)} y={sy(partSource[0]!.y) - 14} textAnchor="middle" className="svg-small">
        Parts
      </text>
      {holder(jakaMarkerHolder, 'Marker (start)')}
      {holder(staubliMarkerHolder, 'Marker holder')}
    </g>
  );
}

function Items({ now }: { now: number }) {
  const items = useTwinStore((s) => s.items);
  const jaka = useRobotView('jaka', now);
  const staubli = useRobotView('staubli', now);
  if (!items) return null;
  const belt = LAYOUT.conveyors.jakaToStaubli;
  const jakaTool = jaka.joints ? armGeometry('jaka', jaka.joints).tool : null;
  const staubliTool = staubli.joints ? armGeometry('staubli', staubli.joints).tool : null;

  const markerAt: Point2 | null =
    items.marker === 'jakaHolder'
      ? LAYOUT.jakaMarkerHolder
      : items.marker === 'staubliHolder'
        ? LAYOUT.staubliMarkerHolder
        : items.marker === 'belt'
          ? lerp(belt.from, belt.to, items.belt)
          : items.marker === 'jakaGripper'
            ? jakaTool
            : staubliTool;

  return (
    <g>
      {items.ink.map((line, i) =>
        line.length > 1 ? (
          <polyline key={i} points={line.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')} className="svg-ink" />
        ) : null,
      )}
      {items.parts.map((place, i) => {
        if (place === 'source') return <Part key={i} at={LAYOUT.partSource[i]!} />;
        if (place === 'board') return <Part key={i} at={LAYOUT.boardSlots[i]!} />;
        return staubliTool ? <Part key={i} at={staubliTool} /> : null;
      })}
      {markerAt && <Marker at={markerAt} />}
    </g>
  );
}

export function CellView2D({ io, stale, now }: { io: PlcIoSnapshot | null; stale: boolean; now: number }) {
  const data = stale ? null : io;
  const emergency = isEmergencyActive(data);
  return (
    <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className="cell-view" role="img" aria-label="Robot cell, top view to scale">
      <rect x={1} y={1} width={VIEW.w - 2} height={VIEW.h - 2} rx={12} className={`svg-frame ${emergency ? 'is-emergency' : ''}`} />
      <rect x={PANEL} y={MARGIN} width={VIEW.w - 2 * PANEL} height={VIEW.h - 2 * MARGIN} rx={8} className="svg-table" />

      {CONVEYORS.map((c) => {
        const running = signalValue(data, c.id) === true;
        const a = sp(c.layout.from);
        const b = sp(c.layout.to);
        const half = (c.layout.width * K) / 2;
        return (
          <g key={c.id}>
            <rect
              x={Math.min(a.x, b.x)}
              y={a.y - half}
              width={Math.abs(b.x - a.x)}
              height={half * 2}
              rx={4}
              className="svg-conveyor"
            />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`svg-belt ${running ? 'run-forward' : ''}`} />
            <text x={(a.x + b.x) / 2} y={a.y - half - 5} textAnchor="middle" className="svg-small">
              {c.label} {running ? '(running)' : ''}
            </text>
          </g>
        );
      })}

      {(['jakaSensor', 'staubliSensor'] as const).map((id) => {
        const end = id === 'jakaSensor' ? LAYOUT.conveyors.jakaToStaubli.from : LAYOUT.conveyors.jakaToStaubli.to;
        const p = sp({ x: end.x, y: end.y - 85 });
        return (
          <g key={id}>
            <Led x={p.x} y={p.y} value={signalValue(data, id)} label="" />
            <text x={p.x} y={p.y + 16} textAnchor="middle" className="svg-small">
              {id === 'jakaSensor' ? 'Sensor Jaka' : 'Sensor Stäubli'}
            </text>
          </g>
        );
      })}

      <Fixtures />

      <SignalPanel robot="staubli" io={data} x={8} />
      <SignalPanel robot="jaka" io={data} x={VIEW.w - PANEL + 8} />

      <Items now={now} />
      <Robot robot="staubli" now={now} gaugeX={sx(-560)} />
      <Robot robot="jaka" now={now} gaugeX={sx(1960)} />

      {emergency && (
        <text x={VIEW.w / 2} y={VIEW.h - 10} textAnchor="middle" className="svg-emergency">
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
