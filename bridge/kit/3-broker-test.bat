@echo off
call "%~dp0config.bat"
call "%~dp0_python.bat"
if errorlevel 1 (
  pause
  exit /b 1
)
"%PY_EXE%" %PY_ARGS% "%~dp0bridge.py" --selftest
echo.
pause
