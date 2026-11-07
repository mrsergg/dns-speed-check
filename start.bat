@echo off
rem Local static preview. The repository contains no server code.
cd /d "%~dp0"
start "" "http://localhost:8484"
npx --yes http-server . -p 8484 -c-1
pause
