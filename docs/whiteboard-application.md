# Proposal: whiteboard application

Status: proposal for discussion. Nothing in the PLC sequence, HMI or website
has been changed for it yet.

## The application

On the Stäubli table: a whiteboard and two parts. On the Jaka side: a marker.

1. The Jaka picks the marker and puts it on the Jaka → Stäubli conveyor.
2. **At the same time**, the Stäubli places the two parts lying on the board.
3. The conveyor brings the marker to the Stäubli.
4. The Stäubli picks the marker and draws a square around each part.
5. Optional: the Stäubli puts the marker on the Stäubli → Jaka conveyor and
   the Jaka puts it back in its holder, so the cell is ready for the next run.

How it fits the assignment:

| Requirement | Fit | Check |
|---|---|---|
| Three or more pieces moved in coordination, both robots | 2 parts + marker; the Jaka and the Stäubli work in parallel in steps 1–2 | Confirm with the professor that the marker counts as a piece |
| Controlled by the PLC/HMI, 7 min maximum | One run is well under a minute | Show the cycle time on the HMI |
| Layout cannot change, external peripherals allowed | Whiteboard and marker holder are peripherals | |
| Repeatability and precision | Squares around the parts show precision visually | Step 5 makes runs repeatable without touching anything |

## Handshake rule

Use a four-phase handshake for every robot task, without timers:

1. PLC sets the command bit.
2. Robot does the task and sets its done bit.
3. PLC sees done and clears the command.
4. Robot sees the command cleared and clears done.

This avoids the timer problem in the current program (known issue 1 in
[plc-program.md](plc-program.md)) and gives the twin an exact event at every
phase boundary.

## Signal allocation

Only signals that are already wired (Table I) are used.

| Signal | Channel | Today | Proposed |
|---|---|---|---|
| `Jaka_DI2` | DO 2 | Keep active | **Enable**: TRUE while the cycle runs, FALSE on stop or E-stop |
| `Jaka_DI3` | DO 1 | May place a part | **CMD**: put the marker on the belt |
| `Jaka_DI1` | DO 3 | Unused | *Optional* **CMD**: put the marker back in the holder |
| `Jaka_DO7` | DI 1 | Finished placing | **DONE**: marker on the belt |
| `Jaka_DO6` | DI 2 | Unused | *Optional* **DONE**: marker back in the holder |
| `Jaka_DO5` | DI 3 | Unused | Pulse: marker gripped (twin only) |
| `Staubli_DI13` | DO 6 | Keep active | **Enable** (fix the stop branch so it goes FALSE) |
| `Staubli_DI12` | DO 5 | May pick | **CMD**: place the two parts on the board |
| `Staubli_DI14` | DO 7 | Unused | **CMD**: pick the marker and draw the squares |
| `Staubli_DO4` | DI 5 | Unused | **DONE**: parts on the board |
| `Staubli_DO5` | DI 6 | Unused | **DONE**: squares drawn (marker put away) |
| `Staubli_DO6` | DI 7 | Unused | Pulse: one part placed (HMI counter, twin) |
| `Staubli_DO7` | DI 8 | Unused | Pulse: one square finished (HMI counter, twin) |
| `Sensor_Jaka` | DI 10 | Part at the Jaka end | Marker on the belt |
| `Sensor_Staubli` | DI 9 | Part at the Stäubli end | Marker arrived |
| `Esteira_JakaStaubli` | DO 12 | Conveyor to the Stäubli | Same, carries the marker |
| `Esteira_StaubliJaka` | DO 11 | Unused | *Optional* return of the marker |

For the optional return, check whether `Sensor_Jaka` also sees objects on the
Stäubli → Jaka belt. If not, run the return belt for a fixed time.

## PLC sequence

| `Etapa` | Does | Next when |
|---|---|---|
| 0 | Idle, all commands off | Rising edge of `Ligar` with `Emergencia` TRUE |
| 10 | Set `Jaka_DI3` and `Staubli_DI12` | Immediately |
| 20 | Two branches in parallel (below) | Marker arrived **and** parts on the board **and** `Staubli_DO4` cleared |
| 30 | Set `Staubli_DI14` | `Staubli_DO5` → clear `Staubli_DI14` |
| 40 | Wait for `Staubli_DO5` to clear, count the cycle | Back to 0 (or 50 for the optional return) |

Step 20 branches:

- Jaka: `Jaka_DO7 AND Sensor_Jaka` → clear `Jaka_DI3`, start `Esteira_JakaStaubli`.
- Belt: conveyor running `AND Sensor_Staubli` → stop the conveyor, marker arrived.
- Stäubli: `Staubli_DO4` → clear `Staubli_DI12`, parts on the board.

Sketch in Structured Text (not compiled; names follow the existing program):

```
IF NOT (Ligar AND Emergencia) THEN
    Jaka_DI2 := FALSE; Jaka_DI3 := FALSE; Jaka_DI1 := FALSE;
    Staubli_DI13 := FALSE; Staubli_DI12 := FALSE; Staubli_DI14 := FALSE;
    Esteira_JakaStaubli := FALSE; Esteira_StaubliJaka := FALSE;
    MarcadorChegou := FALSE; PecasNoQuadro := FALSE;
    Etapa := 0;
ELSE
    Jaka_DI2 := TRUE;
    Staubli_DI13 := TRUE;
    CASE Etapa OF
        0:  IF StartEdge.Q THEN Etapa := 10; END_IF;
        10: Jaka_DI3 := TRUE; Staubli_DI12 := TRUE;
            MarcadorChegou := FALSE; PecasNoQuadro := FALSE;
            iPecasNoQuadro := 0; iQuadrados := 0;
            Etapa := 20;
        20: IF Jaka_DI3 AND Jaka_DO7 AND Sensor_Jaka THEN
                Jaka_DI3 := FALSE; Esteira_JakaStaubli := TRUE;
            END_IF;
            IF Esteira_JakaStaubli AND Sensor_Staubli THEN
                Esteira_JakaStaubli := FALSE; MarcadorChegou := TRUE;
            END_IF;
            IF Staubli_DI12 AND Staubli_DO4 THEN
                Staubli_DI12 := FALSE; PecasNoQuadro := TRUE;
            END_IF;
            IF MarcadorChegou AND PecasNoQuadro AND NOT Staubli_DO4 THEN Etapa := 30; END_IF;
        30: Staubli_DI14 := TRUE;
            IF Staubli_DO5 THEN Staubli_DI14 := FALSE; Etapa := 40; END_IF;
        40: IF NOT Staubli_DO5 THEN iContador := iContador + 1; Etapa := 0; END_IF;
    END_CASE;
END_IF;

StartEdge(CLK := Ligar);                          (* R_TRIG *)
PartPulse(CLK := Staubli_DO6);                    (* R_TRIG *)
IF PartPulse.Q THEN iPecasNoQuadro := iPecasNoQuadro + 1; END_IF;
SquarePulse(CLK := Staubli_DO7);                  (* R_TRIG *)
IF SquarePulse.Q THEN iQuadrados := iQuadrados + 1; END_IF;
CycleTimer(IN := Etapa >= 10, PT := T#10m);       (* TON, ET = cycle time *)
iTempoCiclo_s := DINT_TO_INT(TIME_TO_DINT(CycleTimer.ET) / 1000);

TwinSender;                                       (* keep at the end *)
```

The `ELSE` branch of today's program sets `Staubli_DI12`, `Staubli_DI13` and
`Jaka_DI3` to TRUE on stop. In this sketch every command and enable goes
FALSE on stop or E-stop.

## Robot programs

| Robot | Program |
|---|---|
| Jaka | Wait for `DI3` → pick the marker (pulse `DO5`) → place it at the belt start → set `DO7` → wait for `DI3` FALSE → clear `DO7` → home |
| Stäubli, command 1 | Wait for `DI12` → place part 1, pulse `DO6` → place part 2, pulse `DO6` → set `DO4` → wait for `DI12` FALSE → clear `DO4` |
| Stäubli, command 2 | Wait for `DI14` → pick the marker at the belt end → square 1 (`movel` at fixed Z), pulse `DO7` → square 2, pulse `DO7` → put the marker away → set `DO5` → wait for `DI14` FALSE → clear `DO5` |

Both robots also stop when their enable input (`DI2` / `DI13`) goes FALSE.

Practical points:

- A SCARA is a good fit for drawing: straight lines at a fixed height.
  A spring-loaded marker holder keeps the pressure even if the board is not
  perfectly flat.
- The Jaka gripper (SMC MHZ2-20D) opens about 10 mm in total, so the
  fingers must be shaped for the marker diameter.
- The Stäubli must hold both the parts and the marker. Check its gripper.

## HMI (`Init_Page`)

Today: Start/Stop buttons, 12 rectangles and a bar for `iContador`.

Proposed, with the new variables added to the HMI data source:

| Element | Variable |
|---|---|
| Start / Stop | `Ligar` (unchanged) |
| Step text (text group indexed by step) | `Etapa` |
| Parts on the board: x / 2 | `iPecasNoQuadro` |
| Squares drawn: x / 2 | `iQuadrados` |
| Cycle time mm:ss, turns red near 7:00 | `iTempoCiclo_s` |
| Marker: at Jaka / on the belt / at Stäubli | derived from `Etapa`, `Esteira_JakaStaubli`, `MarcadorChegou` |
| E-stop warning | `Emergencia` |

The 12 rectangles (`bRet1`..`bRet12`) can be removed.

## In the twin

The PLC sender needs no change: it already sends every I/O channel and
`Etapa`. The twin counts parts and squares from the `DO6` / `DO7` pulses.

Website changes, once the signal table above is agreed:

| Change | Detail |
|---|---|
| Layout | Whiteboard and two part positions on the Stäubli side, marker holder on the Jaka side |
| Tasks | Jaka: marker to the belt. Stäubli: part 1, part 2, wait, pick the marker, square 1, square 2, put it away. Every phase ends on an exact PLC event from the table |
| Objects | Marker on the belt and in the grippers, parts lying on the board |
| Ink | While the Stäubli holds the marker and its tool is at board height, the tool path is drawn on the board, so the squares appear as they are drawn |
| Overlay | Step, parts 0/2, squares 0/2, cycle time vs 7:00 |
| Demo and simulator | New cycle following the sequence above |

The ink follows the taught square corners, not what is really on the board:
the twin knows when a square starts and ends, not whether the pen touched.

This works in the current 2D top view (the board is a plane, so the squares
are fully visible from above) and carries over to 3D unchanged.
