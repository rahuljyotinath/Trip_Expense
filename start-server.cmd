@echo off
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is required. Install it, then run this script again.
  exit /b 1
)

node scripts\start-server.mjs
exit /b %errorlevel%
