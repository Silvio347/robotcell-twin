# Repository Guidelines

## Overview

React + TypeScript + Vite website that shows a digital twin of a robot cell.
Live data comes over MQTT (HiveMQ Cloud, WebSockets). Topics and payloads are
defined in `docs/mqtt-contract.md`; keep code and that document in sync.

## Commands

- `npm install`: install dependencies.
- `npm run dev`: local dev server.
- `npm run build`: type-check and production build.
- `npm run simulate`: publish fake cell data (needs `MQTT_URL`, see README).

## Rules

- Code, comments and docs in English.
- The website is read-only: do not add MQTT publishing from the browser
  without an explicit design for safety (PLC interlocks, confirmation).
- Never commit broker passwords. `VITE_*` variables are public.
- Validate every incoming payload in `src/model/messages.ts`.
