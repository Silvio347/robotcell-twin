import { CellView2D } from './components/CellView2D';
import { ConnectPanel } from './components/ConnectPanel';
import { IoTable } from './components/IoTable';
import { RobotPanel } from './components/RobotPanel';
import { StatusBar } from './components/StatusBar';
import { config } from './config';
import { useNow } from './hooks/useNow';
import { useTwinStore } from './state/store';

export function App() {
  const connection = useTwinStore((s) => s.connection);
  const io = useTwinStore((s) => s.io);
  const now = useNow();
  const stale = !io || now - io.receivedAt > config.staleAfterMs;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Robot Cell Digital Twin</h1>
        <StatusBar now={now} />
      </header>

      {connection === 'disconnected' ? (
        <ConnectPanel />
      ) : (
        <main className="layout">
          <section className="panel cell-panel">
            <h2>Cell (2D)</h2>
            <CellView2D io={io} stale={stale} now={now} />
          </section>
          <aside className="side">
            <IoTable io={stale ? null : io} />
            <RobotPanel now={now} />
          </aside>
        </main>
      )}
    </div>
  );
}
