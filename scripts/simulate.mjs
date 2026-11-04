// Publishes a fake cell cycle so the website can be developed without the PLC.
//
// Usage:
//   MQTT_URL=mqtts://<cluster>.hivemq.cloud:8883 MQTT_USERNAME=... MQTT_PASSWORD=... npm run simulate
//
// It announces itself on <prefix>/source/status as "simulated" so the website
// shows a SIMULATED badge. Do not run it while the real PLC/bridge is
// publishing on the same prefix.

import mqtt from 'mqtt';

const url = process.env.MQTT_URL;
const username = process.env.MQTT_USERNAME;
const password = process.env.MQTT_PASSWORD;
const prefix = process.env.TOPIC_PREFIX ?? 'robotcell';

if (!url) {
  console.error('Set MQTT_URL (e.g. mqtts://<cluster>.hivemq.cloud:8883). See README.md.');
  process.exit(1);
}

const topics = {
  io: `${prefix}/plc/io`,
  status: `${prefix}/source/status`,
};

// Same cycle as the in-browser demo (src/sim/demo.ts), which follows NewProgram
// in plc/ProjetoFinalRobotica. Keep both in sync. Only PLC I/O is published,
// like the real bridge: the website estimates robot motion from it.
// Channel numbers from Table I (1-based). Emergency (DI12) is TRUE while safe.
const DI = { jakaDo7: 1, staubliSensor: 9, jakaSensor: 10, emergency: 12 };
const DO = { jakaDi3: 1, jakaDi2: 2, staubliDi12: 5, staubliDi13: 6, convJakaToStaubli: 12 };

// "Keep active" outputs held high for the whole cycle (Etapa 0).
const HOLD = [DO.jakaDi2, DO.staubliDi13];

const CYCLE = [
  { ms: 4000, di: [], do: [DO.jakaDi3] }, // Etapa 0 -> 1: Jaka fetches a part
  { ms: 800, di: [DI.jakaSensor], do: [DO.jakaDi3] }, // part on the conveyor
  { ms: 500, di: [DI.jakaSensor, DI.jakaDo7], do: [DO.convJakaToStaubli] }, // Jaka done: PLC clears DI3, starts conveyor
  { ms: 2500, di: [], do: [DO.convJakaToStaubli] }, // Etapa 2: part travelling
  { ms: 1000, di: [DI.staubliSensor], do: [DO.staubliDi12] }, // Stäubli may pick (1 s pulse)
  { ms: 1500, di: [DI.staubliSensor], do: [] }, // Stäubli picking, part leaves the sensor at the end
];

function channels(active, always = []) {
  const set = new Set([...active, ...always]);
  return Array.from({ length: 12 }, (_, i) => set.has(i + 1));
}

const client = mqtt.connect(url, {
  username,
  password,
  clientId: `twin-sim-${Math.random().toString(16).slice(2, 10)}`,
  clean: true,
  will: { topic: topics.status, payload: 'offline', retain: true, qos: 1 },
});

let step = 0;
let timers = [];

client.on('connect', () => {
  console.log(`[sim] Connected to ${url}, publishing under ${prefix}/`);
  client.publish(topics.status, 'simulated', { retain: true, qos: 1 });
  if (timers.length > 0) return; // reconnect: loops are already running

  const publishIo = () => {
    const s = CYCLE[step];
    const payload = { ts: Date.now(), di: channels(s.di, [DI.emergency]), do: channels(s.do, HOLD) };
    client.publish(topics.io, JSON.stringify(payload), { qos: 0 });
  };

  const nextStep = () => {
    timers.push(
      setTimeout(() => {
        step = (step + 1) % CYCLE.length;
        publishIo();
        nextStep();
      }, CYCLE[step].ms),
    );
  };
  nextStep();

  timers.push(setInterval(publishIo, 500));
});

client.on('error', (err) => console.error('[sim] MQTT error:', err.message));

function shutdown() {
  timers.forEach((t) => {
    clearTimeout(t);
    clearInterval(t);
  });
  timers = [];
  client.publish(topics.status, 'offline', { retain: true, qos: 1 }, () => client.end(false, () => process.exit(0)));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
