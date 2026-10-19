@echo off
setlocal
cd /d "%~dp0"
set "WELKIN_NODE="
for /d %%D in ("%~dp0work\runtime\node-v*-win-x64") do if exist "%%D\node.exe" set "WELKIN_NODE=%%D\node.exe"
if not defined WELKIN_NODE set "WELKIN_NODE=node"
"%WELKIN_NODE%" "%~dp0start-preview.cjs" %*
if errorlevel 1 pause