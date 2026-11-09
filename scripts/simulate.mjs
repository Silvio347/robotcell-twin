// Publishes the whiteboard application cycle over MQTT so the website can be
// developed without the PLC. Plays src/sim/timeline.json in a loop, the same
// run as the in-browser demo, in the format the bridge publishes.
//
// Usage:
//   MQTT_URL=mqtts://<cluster>.hivemq.cloud:8883 MQTT_USERNAME=... MQTT_PASSWORD=... npm run simulate
//
// It announces itself on <prefix>/source/status as "simulated" so the website
// shows a SIMULATED badge. Do not run it while the real PLC/bridge is
// publishing on the same prefix.

import { readFileSync } from 'node:fs';
import mqtt from 'mqtt';

const url = process.env.MQTT_URL;
const username = process.env.MQTT_USERNAME;
const password = process.env.MQTT_PASSWORD;
const prefix = process.env.TOPIC_PREFIX ?? 'robotcell';

if (!url) {
  console.error('Set MQTT_URL (e.g. mqtts://<cluster>.hivemq.cloud:8883). See README.md.');
  process.exit(1);
}

const timeline = JSON.parse(readFileSync(new URL('../src/sim/timeline.json', import.meta.url), 'utf8'));
const RUN_MS = timeline.durationS * 1000;
const CHANNELS = 12;

const topics = {
  io: `${prefix}/plc/io`,
  status: `${prefix}/source/status`,
};

/** I/O state `ms` into a run; same rules as src/sim/timeline.ts. */
function stateAt(ms) {
  const di = new Array(CHANNELS).fill(false);
  const dout = new Array(CHANNELS).fill(false);
  di[11] = true; // E-stop input TRUE = safe
  let step = 0;
  let running = false;
  let countUps = 0;
  for (const e of timeline.events) {
    if (e.t * 1000 > ms) break;
    for (const [name, value] of Object.entries(e.set ?? {})) {
      if (name === 'DI12') continue;
      const ch = Number(name.slice(2)) - 1;
      if (name.startsWith('DI')) di[ch] = value;
      else if (name.startsWith('DO')) dout[ch] = value;
    }
    if (e.step !== undefined) step = e.step;
    if (e.running !== undefined) running = e.running;
    if (e.countUp) countUps += 1;
  }
  return { di, do: dout, step, running, countUps };
}

const client = mqtt.connect(url, {
  username,
  password,
  clientId: `twin-sim-${Math.random().toString(16).slice(2, 10)}`,
  clean: true,
  will: { topic: topics.status, payload: 'offline', retain: true, qos: 1 },
});

let timer = null;
const startedAt = Date.now();

client.on('connect', () => {
  console.log(`[sim] Connected to ${url}, publishing under ${prefix}/`);
  client.publish(topics.status, 'simulated', { retain: true, qos: 1 });
  if (timer) return; // reconnect: loop is already running

  // Same period as the PLC sender (TwinSender.st).
  timer = setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const run = Math.floor(elapsed / RUN_MS);
    const s = stateAt(elapsed % RUN_MS);
    const payload = { ts: Date.now(), di: s.di, do: s.do, step: s.step, count: (run + s.countUps) % 256, running: s.running };
    client.publish(topics.io, JSON.stringify(payload), { qos: 0 });
  }, 200);
});

client.on('error', (err) => console.error('[sim] MQTT error:', err.message));

function shutdown() {
  if (timer) clearInterval(timer);
  timer = null;
  client.publish(topics.status, 'offline', { retain: true, qos: 1 }, () => client.end(false, () => process.exit(0)));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
