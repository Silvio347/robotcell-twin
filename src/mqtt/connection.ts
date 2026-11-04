// Single MQTT connection for the whole app. The twin is read-only: it only
// subscribes and never publishes, so the website cannot drive the real cell.

import mqtt, { type MqttClient } from 'mqtt';
import { parsePlcIo, parseRobotState, parseSourceStatus } from '../model/messages';
import { ROBOTS } from '../model/robots';
import { useTwinStore } from '../state/store';
import { robotFromStateTopic, topics } from './topics';

export interface BrokerCredentials {
  url: string;
  username: string;
  password: string;
}

// CONNACK return codes 4 (bad user/password) and 5 (not authorized).
const AUTH_ERROR_CODES = new Set([4, 5]);

let client: MqttClient | null = null;

function handleMessage(topic: string, payload: string): void {
  const store = useTwinStore.getState();
  const now = Date.now();

  if (topic === topics.plcIo) {
    const io = parsePlcIo(payload, now);
    if (io) store.setIo(io);
    else console.warn('[mqtt] Ignoring malformed PLC IO payload', payload);
    return;
  }

  if (topic === topics.sourceStatus) {
    store.setSource(parseSourceStatus(payload));
    return;
  }

  const robot = robotFromStateTopic(topic);
  if (robot) {
    const state = parseRobotState(payload, now, ROBOTS[robot].joints.length);
    if (state) store.setRobot(robot, state);
    else console.warn(`[mqtt] Ignoring malformed ${robot} state payload`, payload);
  }
}

export function connectTwin({ url, username, password }: BrokerCredentials): void {
  disconnectTwin();
  const store = useTwinStore.getState();
  store.reset();
  store.setError(null);
  store.setConnection('connecting');

  const c = mqtt.connect(url, {
    username,
    password,
    clientId: `twin-web-${Math.random().toString(16).slice(2, 10)}`,
    protocolVersion: 4,
    clean: true,
    keepalive: 15,
    reconnectPeriod: 3000,
    connectTimeout: 10_000,
  });
  client = c;

  c.on('connect', () => {
    store.setConnection('connected');
    store.setError(null);
    c.subscribe(topics.all, { qos: 1 }, (err) => {
      if (err) store.setError(`Subscribe failed: ${err.message}`);
    });
  });

  c.on('reconnect', () => store.setConnection('reconnecting'));

  c.on('close', () => {
    // Only report a drop for the active client; disconnectTwin() clears `client` first.
    if (client === c) useTwinStore.getState().setConnection('reconnecting');
  });

  c.on('error', (err) => {
    const code = (err as { code?: unknown }).code;
    useTwinStore.getState().setError(err.message);
    if (typeof code === 'number' && AUTH_ERROR_CODES.has(code)) {
      // Retrying with wrong credentials only spams the broker.
      disconnectTwin();
      useTwinStore.getState().setError('Broker rejected the credentials.');
    }
  });

  c.on('message', (topic, buffer) => handleMessage(topic, buffer.toString()));
}

export function disconnectTwin(): void {
  const c = client;
  client = null;
  useTwinStore.getState().setConnection('disconnected');
  c?.end(true);
}
