@echo off
rem Legacy Windows helper. Requires Node.js and npm; GitHub Pages users do not need this.
cd /d "%~dp0"
start "" "http://localhost:8484"
node server.js
pause
