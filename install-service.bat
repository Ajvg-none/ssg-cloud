@echo off
setlocal EnableExtensions
REM ============================================================
REM SGG Cloud - Instalador de Servicio Windows (NSSM)
REM ============================================================

REM --- 1) Auto-elevar a Administrador ---
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Solicitando privilegios de Administrador...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "NODE_EXE=C:\Program Files\nodejs\node.exe"
set "NSSM_DIR=%ROOT%\tools\nssm"
set "NSSM=%NSSM_DIR%\nssm.exe"
set "SERVICE_NAME=SGGCloud"
set "BACKEND_DIR=%ROOT%\backend"
set "FRONTEND_DIR=%ROOT%\frontend"
set "LOG_DIR=%BACKEND_DIR%\logs"
set "PSQL=C:\Program Files\PostgreSQL\18\bin\psql.exe"
set "BACKUP_FILE=C:\Users\Sistemas\backup_railway.sql"

cd /d "%ROOT%"

REM --- 2) Pre-checks ---
if not exist "%NODE_EXE%" (
    echo [ERROR] Node.js no encontrado en %NODE_EXE%
    exit /b 1
)
if not exist "%BACKEND_DIR%\.env" (
    echo [ERROR] Falta backend\.env
    exit /b 1
)

REM --- 3) Obtener NSSM (descarga automatica si falta) ---
if not exist "%NSSM%" (
    echo [..] Descargando NSSM 2.24...
    powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile '%TEMP%\nssm.zip'"
    if not exist "%TEMP%\nssm.zip" (
        echo [ERROR] No se pudo descargar NSSM. Colocalo manualmente en tools\nssm\nssm.exe
        exit /b 1
    )
    powershell -NoProfile -Command "Expand-Archive -Path '%TEMP%\nssm.zip' -DestinationPath '%TEMP%\nssm' -Force"
    if not exist "%NSSM_DIR%" mkdir "%NSSM_DIR%"
    copy /Y "%TEMP%\nssm\nssm-2.24\win64\nssm.exe" "%NSSM%" >nul
    if not exist "%NSSM%" (
        echo [ERROR] No se encontro nssm.exe en el ZIP descargado
        exit /b 1
    )
)
echo [OK] NSSM disponible: %NSSM%

REM --- 4) Sync schema (migraciones existentes) ---
echo [..] Aplicando migraciones de Prisma...
cd /d "%BACKEND_DIR%"
call npx prisma generate
if %errorlevel% neq 0 ( echo [ERROR] prisma generate fallo & exit /b 1 )
call npx prisma migrate deploy
if %errorlevel% neq 0 (
    echo [WARN] migrate deploy con problemas, intentando db push...
    call npx prisma db push
)
cd /d "%ROOT%"

REM --- 5) Restore condicional: SOLO si la BD esta vacia ---
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$u=(Get-Content '%BACKEND_DIR%\.env' | Where-Object { $_ -match '^DATABASE_URL=' }) -replace '^DATABASE_URL=','';" ^
    "if ($u -match 'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)') { $env:PGPASSWORD=$matches[2];" ^
    "  $n=& '%PSQL%' -h $matches[3] -p $matches[4] -U $matches[1] -d $matches[5] -t -A -c \"select coalesce(sum(x),0) from (select count(*) x from labs union all select count(*) from stores union all select count(*) from users) t\";" ^
    "  if ($n -eq '0') { if (Test-Path '%BACKUP_FILE%') { Write-Host 'BD vacia, restaurando backup...'; & '%PSQL%' -h $matches[3] -p $matches[4] -U $matches[1] -d $matches[5] -f '%BACKUP_FILE%' } else { Write-Host 'BD vacia pero no existe backup_railway.sql; se omite restore.' } }" ^
    "  else { Write-Host ('BD con datos (' + $n + '), se omite restore.') } } else { Write-Host 'No se pudo leer DATABASE_URL; se omite restore.' }"

REM --- 6) Build frontend (siempre) ---
echo [..] Construyendo frontend...
cd /d "%FRONTEND_DIR%"
call npm run build
if %errorlevel% neq 0 ( echo [ERROR] Build del frontend fallo & exit /b 1 )
cd /d "%ROOT%"

REM --- 7) Registrar servicio ---
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
"%NSSM%" stop %SERVICE_NAME% >nul 2>&1
"%NSSM%" remove %SERVICE_NAME% confirm >nul 2>&1

"%NSSM%" install %SERVICE_NAME% "%NODE_EXE%" "src/server.js"
"%NSSM%" set %SERVICE_NAME% AppDirectory "%BACKEND_DIR%"
"%NSSM%" set %SERVICE_NAME% DisplayName "SGG Cloud"
"%NSSM%" set %SERVICE_NAME% Description "Sistema de Garantias SGG Cloud (API + Frontend)"
"%NSSM%" set %SERVICE_NAME% Start SERVICE_AUTO_START
"%NSSM%" set %SERVICE_NAME% AppExit Default Restart
"%NSSM%" set %SERVICE_NAME% AppRestartDelay 2000
"%NSSM%" set %SERVICE_NAME% AppStdout "%LOG_DIR%\service.out.log"
"%NSSM%" set %SERVICE_NAME% AppStderr "%LOG_DIR%\service.err.log"
"%NSSM%" set %SERVICE_NAME% AppRotateFiles 1
"%NSSM%" set %SERVICE_NAME% AppRotateBytes 10485760
"%NSSM%" set %SERVICE_NAME% AppEnvironmentExtra NODE_ENV=production PORT=3000

REM --- 8) Arrancar y verificar ---
echo [..] Iniciando servicio...
"%NSSM%" start %SERVICE_NAME%
timeout /t 3 /nobreak >nul
sc query %SERVICE_NAME%
echo.
echo [OK] Servicio %SERVICE_NAME% instalado y arrancado.
echo      App: http://localhost:3000
echo      Health: http://localhost:3000/api/health
echo      Logs: %LOG_DIR%\service.out.log / service.err.log
endlocal
