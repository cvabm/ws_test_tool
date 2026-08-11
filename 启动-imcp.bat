@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 goto :no_node

if not exist "node_modules\ws" goto :install_deps
goto :run

:install_deps
echo [INFO] First run, installing dependencies...
call npm install
if errorlevel 1 goto :npm_fail
echo.
goto :run

:run
echo Starting ws-imcp ...
echo.
node ws-imcp.js
echo.
echo Program exited.
pause
exit /b 0

:no_node
echo [ERROR] Node.js not found. Install from https://nodejs.org/
pause
exit /b 1

:npm_fail
echo [ERROR] npm install failed.
pause
exit /b 1
