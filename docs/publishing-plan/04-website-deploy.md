# Step 4: website deploy

The build output (`dist/`) is a static site. Both options work unchanged.

## Netlify

1. Netlify → Add new site → Import from Git → `Silvio347/robotcell-twin`.
2. `netlify.toml` already sets the build command (`npm run build`), the
   publish folder (`dist`) and Node 20.
3. Site settings → Environment variables:
   - `VITE_MQTT_URL` = `wss://<cluster-id>.s1.eu.hivemq.cloud:8884/mqtt`
   - `VITE_TOPIC_PREFIX` = `robotcell`
4. Every push to `main` deploys again.

## Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # pick or create the project
cp .env.example .env.local    # set VITE_MQTT_URL
npm run build
firebase deploy --only hosting
```

`firebase.json` is already in the repository.

## Check it

Open the URL on a phone (mobile data, not the lab network), log in with the
`robotcell-web` credential and confirm the status bar shows
**Broker: connected**. With nothing publishing, **Run demo without broker**
still works.
