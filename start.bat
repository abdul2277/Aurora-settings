@echo off
setlocal
cd /d "%~dp0"
title Aurora Settings launcher

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed. Opening the download page...
  echo  Install the "LTS" version, then double-click start.bat again.
  start https://nodejs.org/en/download
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo.
  echo  First run: installing Aurora Settings. This takes a few minutes...
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo  Install failed. Take a photo or screenshot of the red text above and send it to Claude.
    echo.
    pause
    exit /b 1
  )
)

rem Newer npm versions skip Electron's own download step, so run it by hand if the program file is missing.
if not exist "node_modules\electron\dist\electron.exe" (
  echo  Downloading Electron...
  call node node_modules\electron\install.js
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo.
  echo  Electron could not be downloaded. Check your internet connection and run start.bat again,
  echo  or just use Aurora-Settings.exe instead (no install needed).
  echo.
  pause
  exit /b 1
)

echo  Starting Aurora Settings...
call npx electron .
if errorlevel 1 (
  echo.
  echo  The app closed with an error. Screenshot the text above and send it to Claude.
  echo.
  pause
)
