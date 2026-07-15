@echo off
chcp 65001 >nul
setlocal
"C:\Users\YOGA-01\Documents\Frontend\.venv\Scripts\python.exe" "C:\Users\YOGA-01\Documents\Frontend\server\croquis_com.py" --batch
echo.
echo ============================================
echo Proceso finalizado. Revisa el log arriba.
echo Presiona una tecla para cerrar.
echo ============================================
pause >nul
