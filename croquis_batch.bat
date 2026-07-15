@echo off
chcp 65001 >nul
setlocal
"%~dp0.venv\Scripts\python.exe" "%~dp0server\croquis_batch_launcher.py"
echo.
echo ============================================
echo Proceso finalizado. Revisa el log arriba.
echo Presiona una tecla para cerrar.
echo ============================================
pause >nul
