import { findIoPoint, IO_CHANNELS, type IoDirection } from '../model/cell';
import { channelValue, type PlcIoSnapshot } from '../model/messages';

const MODULES: { direction: IoDirection; title: string }[] = [
  { direction: 'di', title: 'X20DI9371 (inputs)' },
  { direction: 'do', title: 'X20DO9322 (outputs)' },
];

const channels = Array.from({ length: IO_CHANNELS }, (_, i) => i + 1);

export function IoTable({ io }: { io: PlcIoSnapshot | null }) {
  return (
    <section className="panel">
      <h2>PLC I/O</h2>
      <div className="io-grid">
        {MODULES.map(({ direction, title }) => (
          <table key={direction} className="io-table">
            <caption>{title}</caption>
            <tbody>
              {channels.map((ch) => {
                const point = findIoPoint(direction, ch);
                const value = channelValue(io, direction, ch);
                return (
                  <tr key={ch} className={point ? '' : 'spare'}>
                    <td className="ch">{ch}</td>
                    <td>{point?.label ?? 'spare'}</td>
                    <td>
                      <span className={`led ${value === null ? 'led-unknown' : value ? 'led-on' : 'led-off'}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
      </div>
    </section>
  );
}
