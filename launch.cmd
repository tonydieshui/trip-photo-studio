@echo off
setlocal
cd /d "%~dp0"
set "ELECTRON=%CD%\node_modules\electron\dist\electron.exe"

if not exist "%ELECTRON%" goto runtime_missing

start "" "%ELECTRON%" "%CD%"
exit /b 0

:runtime_missing
echo Desktop runtime is missing.
echo App folder: %CD%
pause
exit /b 1
