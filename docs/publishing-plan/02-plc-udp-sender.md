# Step 2: PLC UDP sender

Add a small sender to `NewProgram` that sends the I/O state every 200 ms to
the bridge PC. The cell sequence stays the same.

> The code below is a sketch written from the AsUDP documentation and has not
> been compiled. Check the function block parameters in the Automation Studio
> help (AsUDP) before downloading it to the PLC.

## 2.1 Add the library

Logical View → Libraries → Add Object → Library → `AsUDP`. It ships with
AR E3.10. Automation Studio adds it to `Cpu.sw`.

## 2.2 Packet layout

`ARRAY[0..27] OF USINT` (byte array, so no struct padding):

| Bytes | Content |
|---|---|
| 0–11 | X20DI9371 channels 1–12 (0/1) |
| 12–23 | X20DO9322 channels 1–12 (0/1) |
| 24 | `Etapa` |
| 25 | `iContador` |
| 26 | `Ligar` (0/1) |
| 27 | Sequence number, wraps at 255 (lets the bridge detect a frozen PLC) |

Spare channels (DI 4, 11; DO 4, 9, 10) are sent as 0.

## 2.3 Variables (`NewProgram.var`)

```
TwinOpen   : UdpOpen;
TwinSend   : UdpSend;
TwinTimer  : TON;
TwinPacket : ARRAY[0..27] OF USINT;
TwinHost   : STRING[15] := '192.168.0.100';  (* bridge PC *)
TwinSeq    : USINT;
TwinState  : USINT;
```

## 2.4 Code (end of `_CYCLIC`, after the sequence)

```
(* --- Digital twin: send I/O state to the bridge PC --- *)
TwinPacket[0]  := BOOL_TO_USINT(Jaka_DO7);
TwinPacket[1]  := BOOL_TO_USINT(Jaka_DO6);
TwinPacket[2]  := BOOL_TO_USINT(Jaka_DO5);
TwinPacket[4]  := BOOL_TO_USINT(Staubli_DO4);
TwinPacket[5]  := BOOL_TO_USINT(Staubli_DO5);
TwinPacket[6]  := BOOL_TO_USINT(Staubli_DO6);
TwinPacket[7]  := BOOL_TO_USINT(Staubli_DO7);
TwinPacket[8]  := BOOL_TO_USINT(Sensor_Staubli);
TwinPacket[9]  := BOOL_TO_USINT(Sensor_Jaka);
TwinPacket[11] := BOOL_TO_USINT(Emergencia);
TwinPacket[12] := BOOL_TO_USINT(Jaka_DI3);
TwinPacket[13] := BOOL_TO_USINT(Jaka_DI2);
TwinPacket[14] := BOOL_TO_USINT(Jaka_DI1);
TwinPacket[16] := BOOL_TO_USINT(Staubli_DI12);
TwinPacket[17] := BOOL_TO_USINT(Staubli_DI13);
TwinPacket[18] := BOOL_TO_USINT(Staubli_DI14);
TwinPacket[19] := BOOL_TO_USINT(Staubli_DI15);
TwinPacket[22] := BOOL_TO_USINT(Esteira_StaubliJaka);
TwinPacket[23] := BOOL_TO_USINT(Esteira_JakaStaubli);
TwinPacket[24] := INT_TO_USINT(Etapa);
TwinPacket[25] := INT_TO_USINT(iContador);
TwinPacket[26] := BOOL_TO_USINT(Ligar);

CASE TwinState OF
    0: (* open a UDP socket on any local port *)
        TwinOpen(enable := TRUE, pIfAddr := 0, port := 0, options := 0);
        IF TwinOpen.status = 0 THEN
            TwinState := 1;
        END_IF;

    1: (* wait 200 ms *)
        TwinTimer(IN := TRUE, PT := T#200ms);
        IF TwinTimer.Q THEN
            TwinTimer(IN := FALSE);
            TwinSeq := TwinSeq + 1;
            TwinPacket[27] := TwinSeq;
            TwinState := 2;
        END_IF;

    2: (* send; status 65535 = busy, call again next scan *)
        TwinSend(enable := TRUE, ident := TwinOpen.ident, pHost := ADR(TwinHost),
                 port := 5005, pData := ADR(TwinPacket), datalen := SIZEOF(TwinPacket), flags := 0);
        IF TwinSend.status <> 65535 THEN
            TwinState := 1;  (* on error, just try again on the next period *)
        END_IF;
END_CASE;
```

The sender ignores send errors on purpose. A missing bridge PC must never
affect the cell, and the website shows the data as stale anyway.

## 2.5 Check it

On the bridge PC, run Wireshark with filter `udp.port == 5005`. You should see
one 28-byte packet every 200 ms from `192.168.0.70`, with byte 27 counting up.
