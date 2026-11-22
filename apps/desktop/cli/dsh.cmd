@echo off
setlocal DisableDelayedExpansion
set "ELECTRON_RUN_AS_NODE=1"
set "DSH_DESKTOP_EXE=%~dp0..\..\..\..\ZeroWallScience.exe"
if not exist "%DSH_DESKTOP_EXE%" set "DSH_DESKTOP_EXE=%~dp0..\..\..\..\ZeroWall Science.exe"
"%DSH_DESKTOP_EXE%" --expose-internals "%~dp0..\..\..\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js" %*
exit /b %errorlevel%
