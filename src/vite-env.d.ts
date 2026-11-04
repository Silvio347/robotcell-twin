/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MQTT_URL?: string;
  readonly VITE_TOPIC_PREFIX?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
