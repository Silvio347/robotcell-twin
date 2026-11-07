(********************************************************************
 * COPYRIGHT --  
 ********************************************************************
 * Program: NewProgram
 * File: TwinSender.st
 ********************************************************************
 * Digital twin: sends the I/O state to the bridge PC over UDP.
 * Called once per scan at the end of _CYCLIC.
 * Packet layout: docs/publishing-plan/02-plc-udp-sender.md
 * Needs the AsUDP library (Logical View > Libraries > Add Object).
 * Send errors are only counted: the cell must never depend on the
 * bridge PC being present.
 ********************************************************************)
ACTION TwinSender:

	(* Bytes 0..11: X20DI9371 channels 1..12 *)
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

	(* Bytes 12..23: X20DO9322 channels 1..12 *)
	TwinPacket[12] := BOOL_TO_USINT(Jaka_DI3);
	TwinPacket[13] := BOOL_TO_USINT(Jaka_DI2);
	TwinPacket[14] := BOOL_TO_USINT(Jaka_DI1);
	TwinPacket[16] := BOOL_TO_USINT(Staubli_DI12);
	TwinPacket[17] := BOOL_TO_USINT(Staubli_DI13);
	TwinPacket[18] := BOOL_TO_USINT(Staubli_DI14);
	TwinPacket[19] := BOOL_TO_USINT(Staubli_DI15);
	TwinPacket[22] := BOOL_TO_USINT(Esteira_StaubliJaka);
	TwinPacket[23] := BOOL_TO_USINT(Esteira_JakaStaubli);

	(* Bytes 24..26: sequence state. Byte 27 (counter) is set when sending. *)
	TwinPacket[24] := INT_TO_USINT(Etapa);
	TwinPacket[25] := INT_TO_USINT(iContador);
	TwinPacket[26] := BOOL_TO_USINT(Ligar);

	CASE TwinState OF

		0: (* open the UDP socket *)
			TwinOpen(enable := TRUE, pIfAddr := 0, port := TwinLocalPort, options := 0);
			IF TwinOpen.status = ERR_OK THEN
				TwinState := 1;
			ELSIF TwinOpen.status <> ERR_FUB_BUSY THEN
				TwinOpen(enable := FALSE);
				TwinState := 3;
			END_IF;

		1: (* wait for the next period *)
			TwinTimer(IN := TRUE, PT := T#200ms);
			IF TwinTimer.Q THEN
				TwinTimer(IN := FALSE);
				TwinSeq := TwinSeq + 1;
				TwinPacket[27] := TwinSeq;
				TwinState := 2;
			END_IF;

		2: (* send; keep calling while busy *)
			TwinSend(enable := TRUE, ident := TwinOpen.ident, pHost := ADR(TwinHost), port := TwinPort,
				pData := ADR(TwinPacket), datalen := SIZEOF(TwinPacket), flags := 0);
			IF TwinSend.status <> ERR_FUB_BUSY THEN
				IF TwinSend.status <> ERR_OK THEN
					TwinSendErrors := TwinSendErrors + 1;
				END_IF;
				TwinSend(enable := FALSE);
				TwinState := 1;
			END_IF;

		3: (* opening failed: try again in 5 s *)
			TwinTimer(IN := TRUE, PT := T#5s);
			IF TwinTimer.Q THEN
				TwinTimer(IN := FALSE);
				TwinState := 0;
			END_IF;

	END_CASE;

END_ACTION
