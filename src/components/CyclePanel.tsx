import { config } from '../config';
import { plcStep, STEP_LABELS } from '../estimator/items';
import { useTwinStore } from '../state/store';

/** Assignment limit for one run. */
const MAX_CYCLE_S = 7 * 60;

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function CyclePanel({ now }: { now: number }) {
  const io = useTwinStore((s) => s.io);
  const items = useTwinStore((s) => s.items);
  const fresh = io && now - io.receivedAt <= config.staleAfterMs ? io : null;
  const step = plcStep(fresh);

  const started = items?.cycleStartedAt ?? null;
  const elapsed = started === null ? null : (items?.cycleEndedAt ?? now) - started;
  const overLimit = elapsed !== null && elapsed / 1000 > MAX_CYCLE_S;

  return (
    <section className="panel">
      <h2>Cycle</h2>
      <dl className="cycle">
        <dt>Step</dt>
        <dd>{step === null ? '—' : `${step} · ${STEP_LABELS[step] ?? 'unknown'}`}</dd>
        <dt>Parts on the board</dt>
        <dd>{items ? `${items.partsOnBoard} / 2` : '—'}</dd>
        <dt>Squares drawn</dt>
        <dd>{items ? `${items.squaresDone} / 2` : '—'}</dd>
        <dt>Cycle time</dt>
        <dd className={overLimit ? 'error' : ''}>
          {elapsed === null ? '—' : `${formatDuration(elapsed)} of 7:00`}
        </dd>
        <dt>Completed cycles</dt>
        <dd>{fresh?.count ?? '—'}</dd>
      </dl>
    </section>
  );
}
