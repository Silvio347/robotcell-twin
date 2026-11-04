import { config } from '../config';
import { disconnectTwin } from '../mqtt/connection';
import { stopDemo } from '../sim/demo';
import { useTwinStore } from '../state/store';

function formatAge(ms: number): string {
  if (ms < 1000) return 'now';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}min ago`;
}

export function StatusBar({ now }: { now: number }) {
  const connection = useTwinStore((s) => s.connection);
  const source = useTwinStore((s) => s.source);
  const error = useTwinStore((s) => s.error);
  const io = useTwinStore((s) => s.io);

  const age = io ? now - io.receivedAt : null;
  const fresh = age !== null && age <= config.staleAfterMs;

  return (
    <div className="status-bar">
      <span className={`pill pill-${connection}`}>
        {connection === 'demo' ? 'Demo mode (no broker)' : `Broker: ${connection}`}
      </span>
      <span className={`pill pill-source-${source}`}>
        Source: {source === 'simulated' ? 'SIMULATED' : source}
      </span>
      <span className={`pill ${fresh ? 'pill-connected' : 'pill-stale'}`}>
        PLC data: {age === null ? 'none' : formatAge(age)}
      </span>
      {error && connection !== 'disconnected' && <span className="error">{error}</span>}
      {connection !== 'disconnected' && (
        <button type="button" className="secondary" onClick={connection === 'demo' ? stopDemo : disconnectTwin}>
          {connection === 'demo' ? 'Stop demo' : 'Disconnect'}
        </button>
      )}
    </div>
  );
}
