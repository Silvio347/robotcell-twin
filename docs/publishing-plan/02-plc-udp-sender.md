# Step 2: PLC UDP sender

The PLC sends its I/O state every 200 ms to the bridge PC. The cell sequence
is not changed: the sender only reads variables.

Status: **code in the project, not compiled yet** (no Automation Studio here).
Compile it on the lab PC following 2.1–2.3.

## Files

| File | Change |
|---|---|
| `Logical/NewProgram/TwinSender.st` | New action `TwinSender` with the sender |
| `Logical/NewProgram/IEC.prg` | Lists `TwinSender.st` as part of the program |
| `Logical/NewProgram/NewProgram.var` | New `VAR` block with the `Twin*` variables |
| `Logical/NewProgram/NewProgramCyclic.st` | Calls `TwinSender;` at the end of `_CYCLIC` |

The sender lives in its own action file, so it survives a rewrite of the
sequence: keep the `TwinSender;` call at the end of `_CYCLIC`.

## 2.1 Add the AsUDP library

The library is part of Automation Runtime E3.10 (`AsUDP.br` is in the
project's runtime folder), but the project does not reference it yet.

1. Open `plc/ProjetoFinalRobotica/ProjetoFinalRobotica.apj` in Automation Studio.
2. Logical View → right click `Libraries` → Add Object → Library → `AsUDP`.

Automation Studio adds the library folder, `Libraries/Package.pkg` and the
entry in `Cpu.sw`. Commit those files too.

Without this step the build fails with "UdpOpen"/"UdpSend" unknown.

## 2.2 Set the bridge PC address

In `NewProgram.var`, `TwinHost` must be the IP of the PC that runs the
bridge **on the cell network** (`192.168.0.x`). On Windows, run `ipconfig`
on that PC and look at the Ethernet adapter connected to the PLC.

```
TwinHost : STRING[15] := '192.168.0.100'; (*IP of the bridge PC on the cell network*)
```

`TwinHost` can also be changed online in the watch window; the next packet
goes to the new address.

## 2.3 Build, transfer, check

1. Build. Then Transfer to the PLC (it is a normal program change; the
   sequence keeps running as before).
2. In the watch window of `NewProgram`, check:
   - `TwinState` cycles between 1 and 2.
   - `TwinSeq` counts up about 5 times per second.
   - `TwinSendErrors` stays at 0. If it grows, `TwinHost` is wrong or the PC
     is not reachable.
3. On the bridge PC, run the bridge with `-v` ([step 3](03-bridge.md)), or
   Wireshark with filter `udp.port == 5005`: one 28-byte packet every
   200 ms from `192.168.0.70`.

## How the sender works

```
state 0  UdpOpen on local port 5006 ──ok──► state 1
           │ error
           ▼
state 3  wait 5 s, try again
state 1  wait 200 ms, increment the sequence byte ──► state 2
state 2  UdpSend to TwinHost:5005, call while busy, then back to state 1
```

Send errors are only counted in `TwinSendErrors`. A missing bridge PC never
affects the cell; the website shows the data as stale.

## Packet layout

`TwinPacket : ARRAY[0..27] OF USINT` (byte array, so no struct padding):

| Bytes | Content |
|---|---|
| 0–11 | X20DI9371 channels 1–12 (0/1) |
| 12–23 | X20DO9322 channels 1–12 (0/1) |
| 24 | `Etapa` |
| 25 | `iContador` |
| 26 | `Ligar` (0/1) |
| 27 | Sequence number, wraps at 255 (lets the bridge detect a frozen PLC) |

Spare channels (DI 4, 11; DO 4, 9, 10) are always 0.
