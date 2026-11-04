export const config = {
  defaultMqttUrl: import.meta.env.VITE_MQTT_URL ?? '',
  topicPrefix: import.meta.env.VITE_TOPIC_PREFIX ?? 'robotcell',
  /** Data older than this is shown as stale (the publisher sends a heartbeat). */
  staleAfterMs: 5000,
} as const;
