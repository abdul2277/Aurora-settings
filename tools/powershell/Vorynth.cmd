@echo off
:: Vorynth launcher - double-click to open the menu as administrator.
:: Any arguments are passed through, e.g.  Vorynth.cmd -Apply Recommended
cd /d "%~dp0"
net session >nul 2>&1
if %errorlevel% neq 0 (
    if "%~1"=="" (
        powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    ) else (
        powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs"
    )
    exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Vorynth.ps1" %*
if "%~1"=="" exit /b
pause
