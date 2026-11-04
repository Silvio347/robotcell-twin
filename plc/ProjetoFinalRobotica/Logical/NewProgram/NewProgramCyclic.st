(********************************************************************
 * COPYRIGHT --  
 ********************************************************************
 * Program: NewProgram
 * File: NewProgramCyclic.st
 * Author: supervisorio
 * Created: May 29, 2026
 ********************************************************************
 * Implementation of program NewProgram
 ********************************************************************)

PROGRAM _CYCLIC
	
	IF (Ligar AND Emergencia) THEN 							//Inicia o processo
	
		CASE Etapa OF 										//Loop de pegar/posicionar peças
			
			0:
				Jaka_DI2 := TRUE; 							//Mantém o Jaka ativo até o fim do processo ou em caso de um desligamento manual do sistema (botão IHM ou Emergência)
				Staubli_DI13 := TRUE; 						//Mantém o Staubli ativo até o fim do processo ou em caso de um desligamento manual do sistema (botão IHM ou Emergência)
				Jaka_DI3 := TRUE; 							//Jaka pode posicionar a peça
				Etapa := 1;
			
			1: 												//Espera a peça ser identificada na posição do sensor do Jaka e um sinal q ele terminou de posicionar
				IF (Sensor_Jaka AND Jaka_DO7) THEN
					Jaka_DI3 := FALSE; 						//Desliga a saída digital e espera retomar o loop para posicionar a próxima peça
					Esteira_JakaStaubli := TRUE; 			//Liga a esteira no sentido do Staubli
					Etapa := 2;
					
					IF iContador < 12 THEN
						iContador := iContador + 1;			//Incrementa o contador
					ELSE
						iContador := 0;
					END_IF;
					
				END_IF;
	
			2: 												//Espera a peça ser identificada na posição do sensor do Staubli
				IF Sensor_Staubli THEN
					Esteira_JakaStaubli := FALSE;			//Desliga a esteira
					Staubli_DI12 := TRUE; 					//Staubli pode pegar a peça
					Timer_Staubli.IN := TRUE;				//Timer de 1 segundo
					
					IF Timer_Staubli.Q THEN 				//Desliga a saída digital e espera retomar o loop para pegar a próxima peça
						Staubli_DI12 := FALSE;
					END_IF;
					
					IF iContador < 12 THEN
						iContador := iContador + 1;			//Incrementa o contador
					ELSE
						iContador := 0;
					END_IF;
					
					Etapa := 0; 							//Retoma o Loop
				END_IF;
	
		END_CASE;
	
	ELSE
															//Reset geral se desligar
		Esteira_JakaStaubli := FALSE; 						//Parar a esteira
		Jaka_DI2 := FALSE; 									//Parar o Jaka
		Jaka_DI3 := TRUE;
		Staubli_DI13 := TRUE;								//Parar o Staubli
		Staubli_DI12 := TRUE;
		iContador := 0;										//Resetar contador
		Etapa := 0;											//Volta para o início do programa
		
	END_IF;
	
	//Define as cores dos retângulos na IHM
	IF iContador >= 1 THEN bRet1 := 155; ELSE bRet1 := 250; END_IF;
	IF iContador >= 2 THEN bRet2 := 155; ELSE bRet2 := 250; END_IF;
	IF iContador >= 3 THEN bRet3 := 155; ELSE bRet3 := 250; END_IF;
	IF iContador >= 4 THEN bRet4 := 155; ELSE bRet4 := 250; END_IF;
	IF iContador >= 5 THEN bRet5 := 155; ELSE bRet5 := 250; END_IF;
	IF iContador >= 6 THEN bRet6 := 155; ELSE bRet6 := 250; END_IF;
	IF iContador >= 7 THEN bRet7 := 155; ELSE bRet7 := 250; END_IF;
	IF iContador >= 8 THEN bRet8 := 155; ELSE bRet8 := 250; END_IF;
	IF iContador >= 9 THEN bRet9 := 155; ELSE bRet9 := 250; END_IF;
	IF iContador >= 10 THEN bRet10 := 155; ELSE bRet10 := 250; END_IF;
	IF iContador >= 11 THEN bRet11 := 155; ELSE bRet11 := 250; END_IF;
	IF iContador >= 12 THEN bRet12 := 155; ELSE bRet12 := 250; END_IF;
	
	Timer_Staubli(PT := T#1s);

END_PROGRAM
