@echo off
chcp 65001 > nul
title WhatsApp Bot ITA - Enhanced Supervisor
color 0F

echo ╔════════════════════════════════════════════╗
echo ║     WHATSAPP BOT ITA - SUPERVISOR         ║
echo ║     Centro de Computo - Windows 10        ║
echo ╚════════════════════════════════════════════╝
echo.

:: Configuración
set PROJECT_DIR=%~dp0
set SUPERVISOR_FILE=supervisor-enhanced.cjs

echo [CONFIG] Directorio: %PROJECT_DIR%
echo [CONFIG] Supervisor: %SUPERVISOR_FILE%
echo.

:: Verificar requerimientos
echo [CHECK] Verificando requerimientos...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] ❌ Node.js no encontrado
    echo          Descarga desde: https://nodejs.org/
    timeout /t 10
    exit /b 1
)

if not exist "package.json" (
    echo [ERROR] ❌ package.json no encontrado
    timeout /t 5
    exit /b 1
)

if not exist "src\app.ts" (
    echo [ERROR] ❌ src/app.ts no encontrado
    timeout /t 5
    exit /b 1
)

echo [CHECK] ✅ Requerimientos verificados
echo.

:: Crear supervisor mejorado si no existe
if not exist "%SUPERVISOR_FILE%" (
    echo [SETUP] Creando supervisor mejorado...
    
    (echo // Supervisor mejorado para WhatsApp Bot ITA
    echo const { exec } = require('child_process');
    echo const { existsSync, appendFileSync, mkdirSync } = require('fs');
    echo const { join } = require('path');
    echo 
    echo let restartCount = 0;
    echo const MAX_RESTARTS = 20;
    echo const LOGS_DIR = join(__dirname, 'logs');
    echo let botProcess = null;
    echo 
    echo function log(msg, type) {
    echo   const d = new Date();
    echo   console.log(`[\${d.toLocaleTimeString()}] \${msg}`);
    echo }
    echo 
    echo async function startBot() {
    echo   restartCount++;
    echo   log(`🔄 Intento #\${restartCount}`);
    echo   
    echo   // Compilar
    echo   log('🔨 Compilando...');
    echo   exec('npm run build', (err) => {
    echo     if (err) {
    echo       log('❌ Error compilando');
    echo       setTimeout(startBot, 5000);
    echo       return;
    echo     }
    echo     
    echo     // Ejecutar
    echo     const appPath = join(__dirname, 'dist', 'app.js');
    echo     log(`🚀 Ejecutando: \${appPath}`);
    echo     
    echo     botProcess = exec(`node "\${appPath}"`, {
    echo       cwd: __dirname
    echo     });
    echo     
    echo     botProcess.stdout.pipe(process.stdout);
    echo     botProcess.stderr.pipe(process.stderr);
    echo     
    echo     botProcess.on('close', (code) => {
    echo       log(`❌ Bot terminado (código: \${code})`);
    echo       if (restartCount ^< MAX_RESTARTS) {
    echo         setTimeout(startBot, 5000);
    echo       } else {
    echo         log('🛑 Maximo reinicios');
    echo       }
    echo     });
    echo   });
    echo }
    echo 
    echo process.on('SIGINT', () => {
    echo   log('🛑 Deteniendo...');
    echo   if (botProcess) botProcess.kill();
    echo   process.exit(0);
    echo });
    echo 
    echo startBot();) > "%SUPERVISOR_FILE%"
    
    echo [SETUP] ✅ Supervisor creado
    echo.
)

:: Verificar dependencias
echo [DEPS] Verificando dependencias...
if not exist "node_modules" (
    echo [DEPS] ⚠️  Instalando dependencias...
    call npm install --silent
    if %errorlevel% neq 0 (
        echo [DEPS] ❌ Error instalando
        timeout /t 5
        exit /b 1
    )
    echo [DEPS] ✅ Dependencias instaladas
) else (
    echo [DEPS] ✅ Dependencias encontradas
)

echo.
echo ╔════════════════════════════════════════════╗
echo ║            INFORMACION IMPORTANTE         ║
echo ╚════════════════════════════════════════════╝
echo.
echo 📍 El supervisor mantendra el bot 24/7 activo
echo 📍 Se reiniciara automaticamente si falla
echo 📍 Logs guardados en: %PROJECT_DIR%logs\
echo 📍 Para detener: Presiona Ctrl+C dos veces
echo.
echo ⚠️  NO CIERRES ESTA VENTANA
echo.

timeout /t 5 /nobreak > nul
echo [START] 🚀 Iniciando supervisor...
echo.

:: Ejecutar supervisor
node "%SUPERVISOR_FILE%"

:: Si llega aquí, hubo error
echo.
echo ╔════════════════════════════════════════════╗
echo ║               ERROR CRITICO               ║
echo ╚════════════════════════════════════════════╝
echo.
echo El supervisor terminó inesperadamente.
echo.
echo Posibles causas:
echo 1. Error de permiso
echo 2. Memoria insuficiente
echo 3. Problema con Node.js
echo.
echo Soluciones:
echo 1. Reinicia la computadora
echo 2. Ejecuta como administrador
echo 3. Verifica espacio en disco
echo.

pause