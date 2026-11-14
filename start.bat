@echo off
rem Starts splIT: the server (API on port 3000) and the client (app on port 5173),
rem each in its own window. Close a window (or press Ctrl+C in it) to stop that part.

rem %~dp0 is the folder this file is in, so it works from anywhere.
start "splIT server" cmd /k "cd /d "%~dp0server" && npm run dev"
start "splIT client" cmd /k "cd /d "%~dp0client" && npm run dev"

rem Give them a few seconds to start, then open the app in the browser.
timeout /t 5 /nobreak >nul
start "" http://localhost:5173
