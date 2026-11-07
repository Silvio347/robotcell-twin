(********************************************************************
 * COPYRIGHT --  
 ********************************************************************
 * Program: NewProgram
 * File: NewProgramCyclic.st
 * Author: supervisorio
 * Created: May 29, 2026
 ********************************************************************
 * Whiteboard application (docs/whiteboard-application.md):
 *   1. Jaka puts the marker on the conveyor while the Staubli places
 *      the two parts on the whiteboard.
 *   2. The conveyor brings the marker to the Staubli.
 *   3. The Staubli picks the marker, draws a square around each part
 *      and stores the marker in its holder.
 * Every robot task uses a four-phase handshake (no timers):
 *   PLC sets CMD -> robot sets DONE -> PLC clears CMD -> robot clears DONE.
 * One run per press of the start button: Ligar is cleared at the end
 * of the cycle and on E-stop.
 ********************************************************************)
PROGRAM _CYCLIC

	IF Ligar AND Emergencia THEN

		Jaka_DI2 := TRUE;							//Enable Jaka while the cycle runs
		Staubli_DI13 := TRUE;						//Enable Staubli while the cycle runs

		CASE Etapa OF

			0: (* Start: both robots work in parallel *)
				MarcadorNaEsteira := FALSE;
				MarcadorChegou := FALSE;
				PecasNoQuadro := FALSE;
				CicloConcluido := FALSE;
				iPecasNoQuadro := 0;
				iQuadrados := 0;
				iTempoCiclo_s := 0;
				Jaka_DI3 := TRUE;						//CMD Jaka: put the marker on the conveyor
				Staubli_DI12 := TRUE;					//CMD Staubli: place the two parts on the board
				Etapa := 1;

			1: (* Marker to the Staubli and parts on the board *)
				IF Jaka_DI3 AND Jaka_DO7 AND Sensor_Jaka THEN
					Jaka_DI3 := FALSE;					//Jaka done: marker on the conveyor
					MarcadorNaEsteira := TRUE;
					Esteira_JakaStaubli := TRUE;		//Carry the marker to the Staubli
				END_IF;

				IF Esteira_JakaStaubli AND Sensor_Staubli THEN
					Esteira_JakaStaubli := FALSE;		//Marker arrived
					MarcadorChegou := TRUE;
				END_IF;

				IF Staubli_DI12 AND Staubli_DO4 THEN
					Staubli_DI12 := FALSE;				//Staubli done: parts on the board
					PecasNoQuadro := TRUE;
					iPecasNoQuadro := 2;
				END_IF;

				//Wait for both robots to clear their DONE signals
				IF MarcadorChegou AND PecasNoQuadro AND NOT Staubli_DO4 AND NOT Jaka_DO7 THEN
					Etapa := 2;
				END_IF;

			2: (* Staubli picks the marker, draws the squares and stores the marker *)
				Staubli_DI14 := TRUE;					//CMD Staubli: pick the marker and draw
				IF Staubli_DO5 THEN
					Staubli_DI14 := FALSE;				//Staubli done: squares drawn, marker stored
					iQuadrados := 2;
					Etapa := 3;
				END_IF;

			3: (* Finish: wait for the Staubli to clear DONE *)
				IF NOT Staubli_DO5 THEN
					iContador := iContador + 1;			//Completed cycles
					CicloConcluido := TRUE;
					Ligar := FALSE;						//One run per start; press Ligar again for the next
					Etapa := 0;
				END_IF;

		END_CASE;

	ELSE
		//Stop or E-stop: every command and enable goes FALSE
		Jaka_DI1 := FALSE;
		Jaka_DI2 := FALSE;
		Jaka_DI3 := FALSE;
		Staubli_DI12 := FALSE;
		Staubli_DI13 := FALSE;
		Staubli_DI14 := FALSE;
		Staubli_DI15 := FALSE;
		Esteira_JakaStaubli := FALSE;
		Esteira_StaubliJaka := FALSE;
		IF NOT Emergencia THEN
			Ligar := FALSE;							//Releasing the E-stop must not restart the cell
		END_IF;
		Etapa := 0;
	END_IF;

	//Progress counters from the robots' optional pulses (Staubli DO6 = part placed, DO7 = square drawn)
	PulsoPeca(CLK := Staubli_DO6);
	IF PulsoPeca.Q AND Etapa = 1 AND iPecasNoQuadro < 2 THEN
		iPecasNoQuadro := iPecasNoQuadro + 1;
	END_IF;
	PulsoQuadrado(CLK := Staubli_DO7);
	IF PulsoQuadrado.Q AND Etapa = 2 AND iQuadrados < 2 THEN
		iQuadrados := iQuadrados + 1;
	END_IF;

	//Cycle time (kept on screen after the cycle ends)
	TempoCiclo(IN := Etapa > 0, PT := T#30m);
	IF Etapa > 0 THEN
		iTempoCiclo_s := DINT_TO_INT(TIME_TO_DINT(TempoCiclo.ET) / 1000);
	END_IF;

	//Where the marker is: 0 = Jaka holder, 1 = conveyor, 2 = Staubli
	IF MarcadorChegou THEN
		iMarcador := 2;
	ELSIF MarcadorNaEsteira THEN
		iMarcador := 1;
	ELSE
		iMarcador := 0;
	END_IF;

	//HMI colors (palette index): COR_ESPERA = waiting, COR_ANDAMENTO = running, COR_FEITO = done
	IF MarcadorNaEsteira THEN iCorJaka := COR_FEITO; ELSIF Jaka_DI3 THEN iCorJaka := COR_ANDAMENTO; ELSE iCorJaka := COR_ESPERA; END_IF;
	IF MarcadorChegou THEN iCorEsteira := COR_FEITO; ELSIF Esteira_JakaStaubli THEN iCorEsteira := COR_ANDAMENTO; ELSE iCorEsteira := COR_ESPERA; END_IF;
	IF PecasNoQuadro THEN iCorPecas := COR_FEITO; ELSIF Staubli_DI12 THEN iCorPecas := COR_ANDAMENTO; ELSE iCorPecas := COR_ESPERA; END_IF;
	IF CicloConcluido OR Etapa = 3 THEN iCorDesenho := COR_FEITO; ELSIF Etapa = 2 THEN iCorDesenho := COR_ANDAMENTO; ELSE iCorDesenho := COR_ESPERA; END_IF;
	IF CicloConcluido THEN iCorConcluido := COR_FEITO; ELSIF Etapa = 3 THEN iCorConcluido := COR_ANDAMENTO; ELSE iCorConcluido := COR_ESPERA; END_IF;

	IF iPecasNoQuadro >= 1 THEN iCorPeca1 := COR_PECA; ELSE iCorPeca1 := COR_VAZIO; END_IF;
	IF iPecasNoQuadro >= 2 THEN iCorPeca2 := COR_PECA; ELSE iCorPeca2 := COR_VAZIO; END_IF;
	IF iQuadrados >= 1 THEN iCorQuadrado1 := COR_TINTA; ELSE iCorQuadrado1 := COR_QUADRO; END_IF;
	IF iQuadrados >= 2 THEN iCorQuadrado2 := COR_TINTA; ELSE iCorQuadrado2 := COR_QUADRO; END_IF;

	IF iMarcador = 0 THEN iCorMarcJaka := COR_FEITO; ELSE iCorMarcJaka := COR_ESPERA; END_IF;
	IF iMarcador = 1 THEN iCorMarcEsteira := COR_FEITO; ELSE iCorMarcEsteira := COR_ESPERA; END_IF;
	IF iMarcador = 2 THEN iCorMarcStaubli := COR_FEITO; ELSE iCorMarcStaubli := COR_ESPERA; END_IF;

	IF NOT Emergencia THEN iCorEmergencia := COR_ALARME; ELSE iCorEmergencia := COR_ESPERA; END_IF;

	iProgresso := iPecasNoQuadro + iQuadrados;	//0..4 on the progress bar

	//Digital twin: send the I/O state to the bridge PC (TwinSender.st)
	TwinSender;

END_PROGRAM
