import { lazy, Suspense, useState } from 'react';
import { CellView2D } from './components/CellView2D';
import { ConnectPanel } from './components/ConnectPanel';
import { CyclePanel } from './components/CyclePanel';
import { IoTable } from './components/IoTable';
import { RobotPanel } from './components/RobotPanel';
import { StatusBar } from './components/StatusBar';
import { View3DBoundary } from './components/View3DBoundary';
import { config } from './config';
import { useNow } from './hooks/useNow';
import { isEmergencyActive } from './model/messages';
import { useTwinStore } from './state/store';

// Three.js is loaded only when the 3D tab is opened.
const Cell3D = lazy(() => import('./three/Cell3D'));

type View = '2d' | '3d';
const VIEW_KEY = 'twin.view';

export function App() {
  const connection = useTwinStore((s) => s.connection);
  const io = useTwinStore((s) => s.io);
  const now = useNow();
  const stale = !io || now - io.receivedAt > config.staleAfterMs;
  const [view, setView] = useState<View>(() => (localStorage.getItem(VIEW_KEY) === '3d' ? '3d' : '2d'));
  const selectView = (v: View) => {
    localStorage.setItem(VIEW_KEY, v);
    setView(v);
  };

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
            <div className="panel-head">
              <h2>Cell</h2>
              <div className="tabs" role="tablist">
                {(['2d', '3d'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={view === v}
                    className={view === v ? '' : 'secondary'}
                    onClick={() => selectView(v)}
                  >
                    {v === '2d' ? 'Top view' : '3D'}
                  </button>
                ))}
              </div>
            </div>
            {view === '2d' ? (
              <CellView2D io={io} stale={stale} now={now} />
            ) : (
              <View3DBoundary>
                <Suspense fallback={<p className="muted">Loading the 3D view…</p>}>
                  <Cell3D stale={stale} emergency={!stale && isEmergencyActive(io) === true} />
                </Suspense>
              </View3DBoundary>
            )}
          </section>
          <aside className="side">
            <CyclePanel now={now} />
            <IoTable io={stale ? null : io} />
            <RobotPanel now={now} />
          </aside>
        </main>
      )}
    </div>
  );
}
