@echo off
REM ZeroWall managed Python command shim
call "%~dp0pip.cmd" %*
exit /b %ERRORLEVEL%
