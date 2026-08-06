@echo off
set "ROOT=%~dp0.."
"%ROOT%\node\node.exe" "%ROOT%\package\cli-wrapper.cjs" %*
