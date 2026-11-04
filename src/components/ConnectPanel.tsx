import { useState, type FormEvent } from 'react';
import { config } from '../config';
import { connectTwin } from '../mqtt/connection';
import { startDemo } from '../sim/demo';
import { useTwinStore } from '../state/store';

// URL and username are remembered in localStorage. The password is never
// stored: it lives only in memory for the current connection.
const URL_KEY = 'twin.mqttUrl';
const USER_KEY = 'twin.mqttUser';

export function ConnectPanel() {
  const error = useTwinStore((s) => s.error);
  const [url, setUrl] = useState(() => localStorage.getItem(URL_KEY) ?? config.defaultMqttUrl);
  const [username, setUsername] = useState(() => localStorage.getItem(USER_KEY) ?? '');
  const [password, setPassword] = useState('');

  const urlValid = /^wss?:\/\/.+/i.test(url.trim());

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!urlValid) return;
    localStorage.setItem(URL_KEY, url.trim());
    localStorage.setItem(USER_KEY, username.trim());
    connectTwin({ url: url.trim(), username: username.trim(), password });
    setPassword('');
  }

  return (
    <form className="panel connect" onSubmit={onSubmit}>
      <h2>Connect to broker</h2>
      <p className="muted">
        Use a broker credential with subscribe-only access to <code>{config.topicPrefix}/#</code>.
      </p>
      <label>
        Broker URL (WebSocket)
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="wss://<cluster>.hivemq.cloud:8884/mqtt"
          required
        />
      </label>
      {!urlValid && url !== '' && <p className="error">URL must start with wss:// (or ws:// for a local broker).</p>}
      <label>
        Username
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={!urlValid}>
        Connect
      </button>
      <button type="button" className="secondary" onClick={startDemo}>
        Run demo without broker
      </button>
    </form>
  );
}
