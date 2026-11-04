# Step 3: bridge PC

A small program on a lab PC (or laptop) that listens for the PLC packets and
publishes them to HiveMQ. It is not written yet. This is its specification.

## Behaviour

1. Connect to `mqtts://<cluster-id>.s1.eu.hivemq.cloud:8883` with the
   `robotcell-bridge` credential.
   - Last Will: `robotcell/source/status` = `offline`, retained.
2. Listen on UDP port 5005.
3. For each packet:
   - Drop it if it is not exactly 28 bytes or not from the PLC IP.
   - Publish `robotcell/plc/io` as JSON (format in
     [mqtt-contract.md](../mqtt-contract.md)). Bytes 24–26 become the extra
     fields `step`, `count` and `running`.
4. Publish `robotcell/source/status`:
   - `online` (retained) when packets are arriving.
   - `offline` (retained) if no packet arrives for 2 s, or if the sequence
     byte stops changing (PLC frozen).
5. Rate limit: at most one MQTT message per packet (5 per second), so the
   free HiveMQ tier is never a concern.

## Implementation

The repository already depends on `mqtt` (Node.js), so the bridge can live
in `bridge/bridge.mjs` and use Node's built-in `dgram`. It should be about
the same size as `scripts/simulate.mjs`.

## Setup on the PC

- Static IP on the cell interface (see [step 1.3](01-network-and-broker.md)).
- Windows firewall: allow inbound UDP 5005 on that interface only.
- Credentials through environment variables, never in the file.

## Website follow-up

Once `step`, `count` and `running` arrive, show them on the website: the
sequence step, the piece counter and the start state. The parser already
ignores unknown fields, so the bridge can send them before the website
uses them.
