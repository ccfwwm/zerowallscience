@echo off
setlocal
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0..\..\ZeroWallScience.exe" --expose-internals "%~dp0zws.mjs" %*
exit /b %errorlevel%
