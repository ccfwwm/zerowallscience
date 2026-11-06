@echo off
REM ZeroWall managed Python command shim
setlocal
if not defined ZEROWALL_PYTHON_EXECUTABLE (echo PYTHON_ENVIRONMENT_UNAVAILABLE: bundled ZeroWall Python is not configured. 1>&2 & exit /b 9009)
if not exist "%ZEROWALL_PYTHON_EXECUTABLE%" (echo PYTHON_ENVIRONMENT_UNAVAILABLE: bundled ZeroWall Python is not ready. 1>&2 & exit /b 9009)
"%ZEROWALL_PYTHON_EXECUTABLE%" %*
exit /b %ERRORLEVEL%
