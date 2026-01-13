@echo off
chcp 65001 > nul
title WhatsApp Bot ITA - Windows
color 0A

echo ============================================
echo    WHATSAPP BOT SUPERVISOR - WINDOWS
echo ============================================
echo.

:: Cambiar al directorio del script
cd /d "%~dp0"

echo [INFO] Directorio: %cd%
echo [INFO] Usuario: %USERNAME%
echo.

:: Crear archivo supervisor si no existe
if not exist "supervisor-windows.cjs" (
    echo Creando supervisor-windows.cjs...
    
    echo // Supervisor para Windows > supervisor-windows.cjs
    echo const { exec } = require('child_process'); >> supervisor-windows.cjs
    echo const { existsSync } = require('fs'); >> supervisor-windows.cjs
    echo const { join } = require('path'); >> supervisor-windows.cjs
    echo. >> supervisor-windows.cjs
    echo let restartCount = 0; >> supervisor-windows.cjs
    echo const MAX_RESTARTS = 10; >> supervisor-windows.cjs
    echo let botProcess = null; >> supervisor-windows.cjs
    echo. >> supervisor-windows.cjs
    echo console.log('🖥️  Supervisor Windows para WhatsApp Bot'); >> supervisor-windows.cjs
    echo. >> supervisor-windows.cjs
    echo function startBot() { >> supervisor-windows.cjs
    echo   restartCount++; >> supervisor-windows.cjs
    echo   console.log(`\n🔄 Intento #\${restartCount}`); >> supervisor-windows.cjs
    echo   exec('npm run build', (error) => { >> supervisor-windows.cjs
    echo     if (error) { >> supervisor-windows.cjs
    echo       console.error('❌ Error:', error.message); >> supervisor-windows.cjs
    echo       scheduleRestart(); >> supervisor-windows.cjs
    echo       return; >> supervisor-windows.cjs
    echo     } >> supervisor-windows.cjs
    echo     console.log('✅ Compilado'); >> supervisor-windows.cjs
    echo     const appPath = join(__dirname, 'dist', 'app.js'); >> supervisor-windows.cjs
    echo     if (!existsSync(appPath)) { >> supervisor-windows.cjs
    echo       console.error('❌ Archivo no encontrado'); >> supervisor-windows.cjs
    echo       scheduleRestart(); >> supervisor-windows.cjs
    echo       return; >> supervisor-windows.cjs
    echo     } >> supervisor-windows.cjs
    echo     console.log(`🚀 Ejecutando: \${appPath}`); >> supervisor-windows.cjs
    echo     botProcess = exec(`node "\${appPath}"`, { >> supervisor-windows.cjs
    echo       cwd: __dirname, >> supervisor-windows.cjs
    echo       env: { ...process.env } >> supervisor-windows.cjs
    echo     }); >> supervisor-windows.cjs
    echo     botProcess.stdout.pipe(process.stdout); >> supervisor-windows.cjs
    echo     botProcess.stderr.pipe(process.stderr); >> supervisor-windows.cjs
    echo     botProcess.on('close', (code) => { >> supervisor-windows.cjs
    echo       console.log(`\n❌ Terminado (código: \${code})`); >> supervisor-windows.cjs
    echo       if (restartCount ^>^= MAX_RESTARTS) { >> supervisor-windows.cjs
    echo         console.error('🛑 Maximo reinicios'); >> supervisor-windows.cjs
    echo         process.exit(1); >> supervisor-windows.cjs
    echo       } >> supervisor-windows.cjs
    echo       scheduleRestart(); >> supervisor-windows.cjs
    echo     }); >> supervisor-windows.cjs
    echo     console.log('✅ Bot iniciado'); >> supervisor-windows.cjs
    echo   }); >> supervisor-windows.cjs
    echo } >> supervisor-windows.cjs
    echo. >> supervisor-windows.cjs
    echo function scheduleRestart() { >> supervisor-windows.cjs
    echo   const waitTime = Math.min(5000 * restartCount, 30000); >> supervisor-windows.cjs
    echo   console.log(`⏳ Siguiente en \${waitTime/1000}s...`); >> supervisor-windows.cjs
    echo   setTimeout(startBot, waitTime); >> supervisor-windows.cjs
    echo } >> supervisor-windows.cjs
    echo. >> supervisor-windows.cjs
    echo process.on('SIGINT', () => { >> supervisor-windows.cjs
    echo   console.log('\n🛑 Deteniendo...'); >> supervisor-windows.cjs
    echo   if (botProcess) botProcess.kill(); >> supervisor-windows.cjs
    echo   process.exit(0); >> supervisor-windows.cjs
    echo }); >> supervisor-windows.cjs
    echo. >> supervisor-windows.cjs
    echo startBot(); >> supervisor-windows.cjs
    
    echo ✅ Creado supervisor-windows.cjs
    echo.
)

echo [INFO] Iniciando supervisor...
echo [INFO] El bot se reiniciara automaticamente
echo [INFO] Presiona Ctrl+C para salir
echo.

timeout /t 2 /nobreak > nul

node supervisor-windows.cjs

echo.
pause