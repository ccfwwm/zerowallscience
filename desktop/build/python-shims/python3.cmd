@echo off
REM ZeroWall managed Python command shim
call "%~dp0python.cmd" %*
exit /b %ERRORLEVEL%
