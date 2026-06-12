@echo off
setlocal
cd /d "%~dp0"

if "%NAS_WATCH_PATH%"=="" (
  echo Ruta local sincronizada por Synology Drive:
  set /p NAS_WATCH_PATH="NAS_WATCH_PATH= "
)

if "%NAS_WATCH_INTERVAL_MS%"=="" set NAS_WATCH_INTERVAL_MS=5000
if "%NAS_WATCH_HASH_LIMIT_MB%"=="" set NAS_WATCH_HASH_LIMIT_MB=50

echo.
echo Watcher NAS iniciado
echo Ruta: %NAS_WATCH_PATH%
echo.
npm run watch:nas

pause
