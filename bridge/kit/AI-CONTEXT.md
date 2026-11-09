# Context for an AI assistant: robot cell digital twin bridge

Paste this file into the assistant together with the error or question. The
user is a student working on a lab PC at Inatel; answer in Brazilian
Portuguese, step by step, for Windows.

## The project

A website shows a live "digital twin" of a robot cell (Stäubli TS60 SCARA,
Jaka MiniCobo cobot, conveyors, sensors, B&R PLC). Data path:

```
PLC 192.168.0.70 --UDP 5005--> this kit on the lab PC --MQTT/TLS 8883--> HiveMQ Cloud --> website
```

- PLC: B&R Power Panel 4PP481.1043-B5, Automation Runtime E3.10, project in
  Automation Studio 4.1. It sends a 28-byte UDP packet every 200 ms.
- This kit: `bridge.py` receives the packets and publishes them. It is
  **standard-library Python only** (no pip), run by the portable Python in
  the `python` folder. `fake_plc.py` imitates the PLC for tests.
- Broker: HiveMQ Cloud, MQTT 3.1.1 over TLS on port 8883. The bridge
  publishes `robotcell/plc/io` (JSON) and `robotcell/source/status`
  (`online`/`offline`, retained, also the Last Will).
- Full source: https://github.com/Silvio347/robotcell-twin (public).

## Kit files

| File | What it does |
|---|---|
| `config.bat` | Broker host/port, PLC IP, topic prefix, `PUNCH` (firewall workaround). Edit with Notepad |
| `_python.bat` | Finds Python: `python\python.exe`, then `py -3`, then `python` (skips the Microsoft Store alias) |
| `1-network-test.bat` | `ipconfig`, `Test-NetConnection <broker> -Port 8883`, `ping <PLC>` |
| `2-python-test.bat` | Runs Python and prints its version and OpenSSL version |
| `3-broker-test.bat` | `bridge.py --selftest`: TLS connect, login, publish to `robotcell/bridge/selftest` |
| `4-test-with-fake-plc.bat` | Opens `fake_plc.py` (sends the demo run to 127.0.0.1:5005) and runs the bridge with `PLC_IP=127.0.0.1` |
| `5-run-bridge.bat` | Runs the bridge for the real PLC |
| `bridge.py`, `fake_plc.py`, `timeline.json` | Bridge, fake PLC and the demo run it plays |

`bridge.py --help` lists every option. Settings can also be environment
variables: `MQTT_HOST`, `MQTT_PORT`, `MQTT_USERNAME`, `MQTT_PASSWORD`,
`MQTT_TLS` (`0` = plain TCP), `MQTT_CA_FILE`, `TOPIC_PREFIX`, `UDP_PORT`,
`PLC_IP`, `PUNCH` (`1` = on). `-v` logs every packet.

## Test order and what success looks like

1. `1-network-test.bat`
   - One adapter has an IPv4 address `192.168.0.x`: this PC is on the cell
     network. That address goes into `TwinHost` on the PLC (see below).
   - `TcpTestSucceeded : True` for the broker. **If False, the campus
     network blocks port 8883**: nothing in the kit can fix that. Options:
     connect this PC to a phone hotspot (Wi-Fi) while keeping the cable to
     the cell, or use another machine.
   - `ping` to the PLC answers (it may not if the PLC or firewall drops ICMP;
     not fatal).
2. `2-python-test.bat` prints `OK: Python 3.13...`. If Windows blocks the
   program ("This app has been blocked", SmartScreen, AppLocker), try
   running the kit from another folder (Documents, Desktop, USB drive). If
   every location is blocked, this PC cannot run the bridge.
3. `3-broker-test.bat` prints `OK: connected, authenticated and published`.
4. `4-test-with-fake-plc.bat`: the bridge window shows `Connected to ...`
   and `Source status: online`. To see the data, open the HiveMQ Cloud
   console → Web Client, subscribe to `robotcell/#`; messages on
   `robotcell/plc/io` arrive about 5 per second. Or open the website and
   connect with a broker credential.
5. `5-run-bridge.bat` (PLC sender compiled and running): same as step 4 but
   with real data. `Source status: online` appears only when packets from the
   PLC arrive.

## Common errors

| Message | Meaning | Fix |
|---|---|---|
| `TcpTestSucceeded : False` | Port 8883 blocked by the network | Phone hotspot, or another network/machine |
| `FAILED: broker refused the connection: bad user name or password` | Wrong credential | Check the user/password in HiveMQ Cloud → Access Management |
| `FAILED: broker refused the connection: not authorized` | Credential without permission | Give the credential publish rights on `robotcell/#` |
| `certificate is not trusted` / `CERTIFICATE_VERIFY_FAILED` | Windows root store does not have the broker's CA, or a proxy intercepts TLS | Download the ISRG Root X1 certificate (Let's Encrypt) as a `.pem` file and set `MQTT_CA_FILE` in `config.bat`. If a campus proxy intercepts TLS, use the phone hotspot |
| `getaddrinfo failed` / `[Errno 11001]` | DNS cannot resolve the broker | No internet on this PC, or wrong `MQTT_HOST` |
| `timed out` | Traffic silently dropped | Same as port blocked |
| `[WinError 10048]` / address in use | Another bridge (or program) is already on UDP 5005 | Close the other window, or change `UDP_PORT` here and `TwinPort` on the PLC |
| Bridge connected but never `online` with the real PLC | No packets arriving | See "No packets from the PLC" |
| `Ignoring packet from 192.168.0.x` | Packets come from another IP than `PLC_IP` | Fix `PLC_IP` in `config.bat` |
| `Ignoring malformed packet` | Packet is not the 28-byte layout | The PLC sender code differs from `TwinSender.st` |

## No packets from the PLC

Check in this order:

1. On the PLC (Automation Studio, watch window of task `NewProgram`):
   `TwinSeq` counts up about 5 per second, `TwinState` alternates 1/2,
   `TwinSendErrors` stays 0. If `TwinSendErrors` grows, `TwinHost` is wrong
   or this PC is not reachable.
2. `TwinHost` (in `NewProgram.var`, or changed online in the watch window)
   must be this PC's `192.168.0.x` address from step 1.
3. Windows Firewall blocks incoming UDP 5005 unless allowed, and allowing it
   needs admin rights. Without admin: `PUNCH=1` in `config.bat` (default)
   makes the bridge send 1 byte to the PLC's port 5006 every 5 s, so Windows
   treats the PLC packets as replies and lets them in. It needs `PLC_IP` set
   to the PLC address. With admin rights, the clean fix is:
   `New-NetFirewallRule -DisplayName "Robot cell twin bridge" -Direction Inbound -Protocol UDP -LocalPort 5005 -Action Allow`
4. Run `5-run-bridge.bat` with `-v` (edit the .bat and add `-v` after
   `bridge.py`) to log every packet.

## PLC side (Automation Studio)

The sender is the action `TwinSender` in `Logical/NewProgram/TwinSender.st`,
called as the last line of `NewProgramCyclic.st`. It only reads variables;
the cell sequence does not depend on it.

- Before the first build: Logical View → `Libraries` → Add Object → Library
  → `AsUDP`. Without it the build fails with `UdpOpen` / `UdpSend` unknown.
- Packet: bytes 0–11 = X20DI9371 channels 1–12, 12–23 = X20DO9322 channels
  1–12, 24 = `Etapa`, 25 = `iContador`, 26 = `Ligar`, 27 = sequence counter.
- Variables: `TwinHost` (bridge PC IP, default `192.168.0.100`), `TwinPort`
  5005, `TwinLocalPort` 5006.

## Rules for the assistant

- Do not suggest changes to the cell sequence, the robot programs or safety
  logic (E-stop, enables). The bridge is read-only; it never sends commands.
- Never put the broker password in a file, a script or a command line; the
  kit asks for it at runtime.
- Do not disable the Windows firewall or antivirus; use the `PUNCH` option
  or ask the lab staff for a rule.
- Changing the lab PC or PLC configuration (IP addresses, Runtime) needs the
  professor or lab monitor's OK.
