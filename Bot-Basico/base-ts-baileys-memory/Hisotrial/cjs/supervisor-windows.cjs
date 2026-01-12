const { exec } = require('child_process');
const { existsSync, appendFileSync, mkdirSync } = require('fs');
const { join } = require('path');

// Configuración
let restartCount = 0;
const MAX_RESTARTS = 20;
const LOGS_DIR = join(__dirname, 'logs');
const ERROR_LOG = join(LOGS_DIR, 'supervisor-error.log');
const BOT_LOG = join(LOGS_DIR, 'bot-output.log');
let botProcess = null;
let isShuttingDown = false;

// Crear directorio de logs si no existe
function initLogs() {
    try {
        if (!existsSync(LOGS_DIR)) {
            mkdirSync(LOGS_DIR, { recursive: true });
        }
    } catch (error) {
        console.error('❌ Error creando logs:', error.message);
    }
}

// Función de logging mejorada
function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
    
    // Mostrar en consola con colores
    if (type === 'error') {
        console.error('\x1b[31m%s\x1b[0m', logMessage); // Rojo
    } else if (type === 'warn') {
        console.warn('\x1b[33m%s\x1b[0m', logMessage); // Amarillo
    } else if (type === 'success') {
        console.log('\x1b[32m%s\x1b[0m', logMessage); // Verde
    } else {
        console.log(logMessage);
    }
    
    // Guardar en archivo
    try {
        const logFile = type === 'error' ? ERROR_LOG : BOT_LOG;
        appendFileSync(logFile, logMessage + '\n', 'utf8');
    } catch (error) {
        // Silencioso en caso de error de archivo
    }
}

// Compilar TypeScript
function compileBot() {
    return new Promise((resolve) => {
        log('🔨 Compilando TypeScript con Rollup...', 'info');
        
        const buildProcess = exec('npm run build', (error, stdout, stderr) => {
            if (error) {
                log(`❌ Error compilando: ${error.message}`, 'error');
                if (stderr) {
                    log(`📝 Detalles: ${stderr}`, 'error');
                }
                resolve(false);
            } else {
                log('✅ Compilación exitosa', 'success');
                resolve(true);
            }
        });
        
        // Capturar salida
        buildProcess.stdout.on('data', (data) => {
            log(`[BUILD] ${data.toString().trim()}`, 'info');
        });
        
        buildProcess.stderr.on('data', (data) => {
            log(`[BUILD-ERR] ${data.toString().trim()}`, 'error');
        });
    });
}

// Iniciar el bot
async function startBot() {
    if (isShuttingDown) return;
    
    restartCount++;
    log(`\n🔄 Intento #${restartCount}`, 'info');
    
    // 1. Compilar
    const compiled = await compileBot();
    if (!compiled) {
        log('❌ Falló la compilación, reintentando...', 'error');
        scheduleRestart();
        return;
    }
    
    // 2. Verificar archivo compilado
    const appPath = join(__dirname, 'dist', 'app.js');
    if (!existsSync(appPath)) {
        log(`❌ Archivo no encontrado: ${appPath}`, 'error');
        scheduleRestart();
        return;
    }
    
    log(`🚀 Ejecutando: ${appPath}`, 'info');
    
    // 3. Detener proceso anterior si existe
    if (botProcess) {
        log('⚠️ Terminando proceso anterior...', 'warn');
        try {
            botProcess.kill('SIGTERM');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Forzar si sigue vivo
            if (botProcess.exitCode === null) {
                botProcess.kill('SIGKILL');
            }
        } catch (error) {
            // Ignorar errores al matar proceso
        }
    }
    
    // 4. Ejecutar el bot con comillas para manejar espacios
    const command = `node "${appPath}"`;
    log(`📝 Comando: ${command}`, 'info');
    
    botProcess = exec(command, {
        cwd: __dirname,
        env: {
            ...process.env,
            NODE_ENV: 'production',
            SUPERVISOR: 'true',
            RESTART_COUNT: restartCount.toString(),
            WINDOWS_USER: process.env.USERNAME || 'unknown'
        },
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    
    // Capturar salida del bot
    botProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
            log(`[BOT] ${output}`, 'info');
        }
    });
    
    botProcess.stderr.on('data', (data) => {
        const error = data.toString().trim();
        if (error) {
            log(`[BOT-ERR] ${error}`, 'error');
        }
    });
    
    // Manejar cierre del bot
    botProcess.on('close', (code, signal) => {
        if (isShuttingDown) return;
        
        if (code === 0) {
            log(`✅ Bot cerrado normalmente (código: ${code})`, 'success');
        } else {
            log(`❌ Bot terminó con código: ${code}, señal: ${signal || 'N/A'}`, 'error');
        }
        
        if (restartCount >= MAX_RESTARTS) {
            log('🛑 Máximo de reinicios alcanzado. Necesita intervención manual.', 'error');
            log(`📝 Revisa los logs en: ${LOGS_DIR}`, 'info');
            process.exit(1);
        }
        
        scheduleRestart();
    });
    
    botProcess.on('error', (error) => {
        log(`❌ Error ejecutando bot: ${error.message}`, 'error');
        scheduleRestart();
    });
    
    // Verificar que se inició correctamente
    setTimeout(() => {
        if (botProcess && botProcess.exitCode === null) {
            log('✅ Bot iniciado y funcionando correctamente', 'success');
            log('📊 Monitoreo activo - El bot se reiniciará automáticamente si falla', 'info');
        }
    }, 5000);
}

// Programar reinicio con backoff exponencial
function scheduleRestart() {
    if (isShuttingDown) return;
    
    const baseDelay = 5000; // 5 segundos base
    const maxDelay = 60000; // 1 minuto máximo
    const delay = Math.min(baseDelay * Math.pow(1.5, restartCount - 1), maxDelay);
    
    log(`⏳ Próximo intento en ${Math.round(delay / 1000)} segundos...`, 'info');
    
    setTimeout(() => {
        if (!isShuttingDown) {
            startBot();
        }
    }, delay);
}

// Apagado controlado
async function gracefulShutdown() {
    if (isShuttingDown) return;
    
    isShuttingDown = true;
    log('\n🛑 Iniciando apagado controlado...', 'warn');
    
    // 1. Detener el bot
    if (botProcess && botProcess.exitCode === null) {
        log('🛑 Enviando señal de terminación al bot...', 'warn');
        botProcess.kill('SIGTERM');
        
        // Esperar máximo 10 segundos
        await new Promise((resolve) => {
            const timeout = setTimeout(() => {
                log('⚠️ Forzando terminación del bot...', 'warn');
                if (botProcess) botProcess.kill('SIGKILL');
                resolve();
            }, 10000);
            
            botProcess.on('close', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }
    
    // 2. Mensaje final
    log('✅ Supervisor detenido correctamente', 'success');
    log(`📊 Estadísticas: ${restartCount} reinicios realizados`, 'info');
    log('👋 Hasta luego!', 'info');
    
    process.exit(0);
}

// Configurar manejadores de señales
function setupSignalHandlers() {
    process.on('SIGINT', () => {
        log('\n🛑 Señal SIGINT recibida (Ctrl+C)', 'warn');
        gracefulShutdown();
    });
    
    process.on('SIGTERM', () => {
        log('\n🛑 Señal SIGTERM recibida', 'warn');
        gracefulShutdown();
    });
    
    // Windows específico
    process.on('SIGHUP', () => {
        log('\n🛑 Señal SIGHUP recibida (cierre de ventana)', 'warn');
        gracefulShutdown();
    });
    
    // Manejar errores no capturados
    process.on('uncaughtException', (error) => {
        log(`💥 Error no capturado: ${error.message}`, 'error');
        log(error.stack, 'error');
        setTimeout(() => process.exit(1), 1000);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
        log(`💥 Promise rechazada no manejada: ${reason}`, 'error');
    });
}

// Función de monitoreo periódico
function startMonitoring() {
    // Monitoreo cada 5 minutos
    setInterval(() => {
        if (botProcess && botProcess.exitCode === null) {
            const now = new Date();
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            
            log(`📊 Estado: Bot activo por ${hours}h ${minutes}m, Reinicios: ${restartCount}`, 'info');
            log(`🕐 Hora actual: ${now.toLocaleTimeString('es-MX')}`, 'info');
            
            // Verificación de salud adicional
            if (restartCount > 5) {
                log('⚠️ Muchos reinicios, revisar posibles problemas', 'warn');
            }
        }
    }, 5 * 60 * 1000); // 5 minutos
}

// Inicio
function main() {
    console.clear();
    console.log('\x1b[36m%s\x1b[0m', '╔════════════════════════════════════════════╗');
    console.log('\x1b[36m%s\x1b[0m', '║     SUPERVISOR WHATSAPP BOT ITA           ║');
    console.log('\x1b[36m%s\x1b[0m', '║     Windows Edition - Centro de Cómputo   ║');
    console.log('\x1b[36m%s\x1b[0m', '╚════════════════════════════════════════════╝');
    console.log('');
    
    log('🚀 Iniciando supervisor...', 'info');
    log(`📁 Directorio: ${__dirname}`, 'info');
    log(`👤 Usuario: ${process.env.USERNAME || 'Desconocido'}`, 'info');
    log(`🖥️  Sistema: ${process.platform} ${process.arch}`, 'info');
    log(`⚙️  Node.js: ${process.version}`, 'info');
    
    // Inicializar
    initLogs();
    setupSignalHandlers();
    startMonitoring();
    
    // Iniciar bot después de 2 segundos
    setTimeout(() => {
        startBot();
    }, 2000);
}

// Ejecutar
main();