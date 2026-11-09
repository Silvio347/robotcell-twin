@echo off
rem Full path without the real PLC: a fake PLC sends the demo run to this PC
rem (127.0.0.1) and the bridge publishes it to the broker. Close both windows to stop.
call "%~dp0config.bat"
call "%~dp0_python.bat"
if errorlevel 1 (
  pause
  exit /b 1
)
start "Fake PLC" "%PY_EXE%" %PY_ARGS% "%~dp0fake_plc.py"
set "PLC_IP=127.0.0.1"
set "PUNCH=0"
"%PY_EXE%" %PY_ARGS% "%~dp0bridge.py"
pause
