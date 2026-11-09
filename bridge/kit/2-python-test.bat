@echo off
call "%~dp0_python.bat"
if errorlevel 1 (
  pause
  exit /b 1
)
echo Using: %PY_EXE% %PY_ARGS%
"%PY_EXE%" %PY_ARGS% -c "import sys, ssl, socket; print('OK: Python', sys.version.split()[0], '-', ssl.OPENSSL_VERSION)"
echo.
pause
