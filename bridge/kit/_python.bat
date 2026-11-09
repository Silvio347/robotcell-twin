@echo off
rem Finds Python 3: the portable copy in .\python first, then "py -3", then "python".
rem Sets PY_EXE and PY_ARGS. The Microsoft Store alias in WindowsApps is skipped.
set "PY_EXE="
set "PY_ARGS="
if exist "%~dp0python\python.exe" set "PY_EXE=%~dp0python\python.exe"
if not defined PY_EXE (
  where py >nul 2>nul && (set "PY_EXE=py" & set "PY_ARGS=-3")
)
if not defined PY_EXE (
  for /f "delims=" %%p in ('where python 2^>nul ^| findstr /v /i "WindowsApps"') do if not defined PY_EXE set "PY_EXE=%%p"
)
if not defined PY_EXE (
  echo No Python found. Put the portable Python in the "python" folder of this kit.
  exit /b 1
)
exit /b 0
