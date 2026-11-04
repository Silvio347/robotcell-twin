import { config } from '../config';
import type { RobotId } from '../model/cell';
import { useTwinStore } from '../state/store';

const ROBOTS: { id: RobotId; name: string }[] = [
  { id: 'staubli', name: 'Stäubli' },
  { id: 'jaka', name: 'Jaka Minicobo' },
];

// Joint data is not available through the PLC I/O. It will come from the
// robot controllers (see docs/architecture.md) and drives the future 3D view.
export function RobotPanel({ now }: { now: number }) {
  const robots = useTwinStore((s) => s.robots);

  return (
    <section className="panel">
      <h2>Robot joints</h2>
      {ROBOTS.map(({ id, name }) => {
        const state = robots[id];
        const stale = !state || now - state.receivedAt > config.staleAfterMs;
        return (
          <div key={id} className="robot">
            <h3>
              {name} {state?.mode && <span className="muted">({state.mode})</span>}
            </h3>
            {state ? (
              <ol className={`joints ${stale ? 'is-stale' : ''}`}>
                {state.joints.map((deg, i) => (
                  <li key={i}>
                    J{i + 1}: {deg.toFixed(1)}°
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">No joint data yet.</p>
            )}
          </div>
        );
      })}
    </section>
  );
}
