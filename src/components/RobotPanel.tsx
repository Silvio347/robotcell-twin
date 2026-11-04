import { useRobotView } from '../hooks/useRobotView';
import type { RobotId } from '../model/cell';
import { jakaFk, scaraFk } from '../model/kinematics';
import { toCellFrame, type Point3 } from '../model/layout';
import { POSES_ARE_PLACEHOLDERS } from '../model/poses';
import { ROBOT_IDS, ROBOTS, type JointDef } from '../model/robots';

function formatJoint(value: number, def: JointDef): string {
  return def.unit === 'mm' ? `${value.toFixed(0)} mm` : `${value.toFixed(1)}°`;
}

function formatPoint(p: Point3): string {
  return `x ${p.x.toFixed(0)}, y ${p.y.toFixed(0)}, z ${p.z.toFixed(0)} mm`;
}

function toolPosition(robot: RobotId, joints: readonly number[]): Point3 {
  const tool = robot === 'staubli' ? scaraFk(joints).tool : jakaFk(joints).points[6]!;
  return toCellFrame(robot, tool);
}

function RobotCard({ robot, now }: { robot: RobotId; now: number }) {
  const def = ROBOTS[robot];
  const { joints, source, estimate } = useRobotView(robot, now);
  const stopped = estimate?.stoppedReason != null;

  return (
    <div className="robot">
      <h3>
        {def.name} <span className="muted">· {def.kind}</span>
      </h3>
      {estimate && (
        <>
          <p className={`phase ${stopped ? 'is-stopped' : ''}`}>
            {estimate.phase}
            {estimate.waitingFor && <span className="muted"> · waiting for {estimate.waitingFor}</span>}
          </p>
          <div className="progress" aria-hidden="true">
            <span style={{ width: `${Math.round(estimate.progress * 100)}%` }} />
          </div>
        </>
      )}
      {joints ? (
        <ol className={`joints ${stopped && source !== 'live' ? 'is-stale' : ''}`}>
          {def.joints.map((j, i) => (
            <li key={j.label}>
              {j.label}: {formatJoint(joints[i] ?? 0, j)}
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No data yet.</p>
      )}
      {joints && (
        <p className="small">
          Tool {formatPoint(toolPosition(robot, joints))}
          {estimate && <span className="muted"> · gripper {estimate.holding ? 'holding a part' : 'empty'}</span>}
        </p>
      )}
      {source && (
        <p className="muted small">
          {source === 'live'
            ? 'Live joints from the robot controller.'
            : `Estimated from PLC signals${POSES_ARE_PLACEHOLDERS ? ', placeholder poses' : ''}. Cycles seen: ${estimate?.cycles ?? 0}.`}
        </p>
      )}
    </div>
  );
}

export function RobotPanel({ now }: { now: number }) {
  return (
    <section className="panel">
      <h2>Robots</h2>
      {ROBOT_IDS.map((id) => (
        <RobotCard key={id} robot={id} now={now} />
      ))}
    </section>
  );
}
