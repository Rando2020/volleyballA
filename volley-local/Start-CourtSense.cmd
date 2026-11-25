@echo off
cd /d "%~dp0"
set "PY=python"
if exist ".runtime-python" set /p PY=<.runtime-python

if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"
if not exist "frontend\dist\index.html" (
  echo Build the frontend first using the setup steps in README.md
  pause
  exit /b 1
)
"%PY%" -m backend.app.launch
if errorlevel 1 pause
