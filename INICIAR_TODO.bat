@echo off
chcp 65001 >nul
echo ==========================================
echo  🚀 Iniciando Obras Ferroviarias
echo ==========================================
echo.

:: 1. Verificar Docker Desktop
powershell -Command "Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo ⏳ Docker Desktop no está corriendo. Iniciando...
  start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  echo ⏳ Esperando a que Docker esté listo (30 segundos)...
  timeout /t 30 /nobreak >nul
) else (
  echo ✅ Docker Desktop ya está corriendo
)

:: 2. Verificar Supabase
cd /d "C:\Users\YOGA-01\Documents\Frontend"
echo ⏳ Verificando Supabase...
supabase status >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo ⏳ Iniciando Supabase local...
  supabase start
) else (
  echo ✅ Supabase ya está corriendo
)

echo.
echo ==========================================
echo  🌐 Iniciando servidor frontend...
echo ==========================================
echo.

:: 3. Iniciar Vite y abrir navegador
start http://localhost:5173
bun run dev

pause
