@echo off
setlocal
REM ============================================================
REM SGG Cloud - Desinstalador de Servicio Windows
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
set "NSSM=%ROOT%\tools\nssm\nssm.exe"
set "SERVICE_NAME=SGGCloud"

sc query %SERVICE_NAME% >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] El servicio %SERVICE_NAME% no existe. Nada que hacer.
    exit /b 0
)

echo [..] Deteniendo servicio %SERVICE_NAME%...
if exist "%NSSM%" (
    "%NSSM%" stop %SERVICE_NAME%
    "%NSSM%" remove %SERVICE_NAME% confirm
) else (
    sc stop %SERVICE_NAME% >nul 2>&1
    sc delete %SERVICE_NAME% >nul 2>&1
)

sc query %SERVICE_NAME% >nul 2>&1
if %errorlevel% neq 0 (
    echo [OK] Servicio %SERVICE_NAME% eliminado correctamente.
) else (
    echo [WARN] El servicio aun existe; revisalo en services.msc
)
endlocal
