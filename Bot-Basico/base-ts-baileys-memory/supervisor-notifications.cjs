const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// ============= CONFIGURACIÓN =============
const BOT_PORT = 3008;
const HEALTH_PORT = 3010; // Cambiado para evitar conflicto
const ADMIN_NUMBER = '5214494877990@s.whatsapp.net';
const MAX_RESTARTS = 12;
const HEALTH_CHECK_INTERVAL = 45000; // 45 segundos (más que 30s del bot)
const MAX_INACTIVITY = 4 * 60 * 1000; // 4 minutos
const LOGS_DIR = path.join(__dirname, 'logs');

// Archivos de log
const LOG_FILE = path.join(LOGS_DIR, 'supervisor.log');
const ERROR_LOG = path.join(LOGS_DIR, 'supervisor-errors.log');
const BOT_OUTPUT = path.join(LOGS_DIR, 'bot-output.log');
const NOTIFICATIONS_LOG = path.join(LOGS_DIR, 'notifications.log');

let botProcess = null;
let restartCount = 0;
let lastHealthCheck = Date.now();
let botStartTime = null;
let isShuttingDown = false;
let healthCheckTimer = null;
let inactivityTimer = null;

// ============= INICIALIZACIÓN =============
function initLogs() {
    try {
        if (!fs.existsSync(LOGS_DIR)) {
            fs.mkdirSync(LOGS_DIR, { recursive: true });
            console.log('✅ Directorio de logs creado');
        }
        
        // Crear archivos si no existen
        [LOG_FILE, ERROR_LOG, BOT_OUTPUT, NOTIFICATIONS_LOG].forEach(file => {
            if (!fs.existsSync(file)) {
                fs.writeFileSync(file, `=== ${path.basename(file)} iniciado ${new Date().toISOString()} ===\n`);
            }
        });
    } catch (error) {
        console.error('❌ Error creando logs:', error.message);
    }
}

// ============= LOGGING MEJORADO =============
function log(message, type = 'INFO') {
    const timestamp = new Date().toLocaleString('es-MX');
    const logMessage = `[${timestamp}] [${type}] ${message}`;
    
    // Colores para consola
    const colors = {
        'ERROR': '\x1b[31m',    // Rojo
        'WARN': '\x1b[33m',     // Amarillo
        'SUCCESS': '\x1b[32m',  // Verde
        'INFO': '\x1b[36m',     // Cyan
        'CRITICAL': '\x1b[41m\x1b[37m' // Fondo rojo, texto blanco
    };
    
    const color = colors[type] || '';
    const reset = '\x1b[0m';
    
    console.log(`${color}${logMessage}${reset}`);
    
    // Guardar en archivo
    try {
        fs.appendFileSync(LOG_FILE, logMessage + '\n', 'utf8');
        
        if (type === 'ERROR' || type === 'CRITICAL') {
            fs.appendFileSync(ERROR_LOG, logMessage + '\n', 'utf8');
        }
        
        // También guardar en output del bot si es relevante
        if (message.includes('[BOT]') || message.includes('💓') || message.includes('✅ Bot')) {
            fs.appendFileSync(BOT_OUTPUT, logMessage + '\n', 'utf8');
        }
    } catch (error) {
        // Fallback a consola si no se puede escribir en archivo
        console.error('❌ Error escribiendo log:', error.message);
    }
}

// ============= VERIFICACIÓN DE SALUD =============

/**
 * Verifica si el bot está respondiendo
 */
async function checkBotHealth() {
    try {
        // Intentar primero con el puerto de health dedicado
        const response = await axios.get(`http://localhost:${HEALTH_PORT}/health`, {
            timeout: 15000
        });
        
        if (response.status === 200) {
            lastHealthCheck = Date.now();
            const data = response.data;
            const uptime = data.uptime || 0;
            const status = data.status || 'unknown';
            
            log(`✅ Health OK: ${status}, uptime: ${Math.floor(uptime)}s, mem: ${data.memory?.used || 0}MB`, 'SUCCESS');
            return true;
        }
        
        log(`⚠️ Health responded ${response.status}`, 'WARN');
        return false;
        
    } catch (error) {
        // Si falla health, intentar con el endpoint del bot
        try {
            const botResponse = await axios.get(`http://localhost:${BOT_PORT}/health`, {
                timeout: 10000
            });
            
            if (botResponse.status === 200) {
                lastHealthCheck = Date.now();
                log('✅ Bot responding on main port', 'SUCCESS');
                return true;
            }
        } catch (botError) {
            // Ambos fallaron
            log(`❌ Health check failed: ${error.code || error.message}`, 'ERROR');
            
            // Verificar si es error de conexión o timeout
            if (error.code === 'ECONNREFUSED') {
                log('🔌 Conexión rechazada - Bot no está escuchando', 'ERROR');
            } else if (error.code === 'ETIMEDOUT') {
                log('⏱️ Timeout - Bot no responde', 'WARN');
            }
        }
        
        return false;
    }
}

/**
 * Verifica inactividad del bot
 */
function checkInactivity() {
    if (!botStartTime || !botProcess || botProcess.exitCode !== null) {
        return false;
    }
    
    const timeSinceLastCheck = Date.now() - lastHealthCheck;
    const minutesInactive = Math.floor(timeSinceLastCheck / 60000);
    
    if (timeSinceLastCheck > MAX_INACTIVITY) {
        const totalUptime = Math.floor((Date.now() - botStartTime) / 1000);
        log(`⚠️ Bot inactivo ${minutesInactive}min, uptime total: ${totalUptime}s`, 'WARN');
        return true;
    }
    
    return false;
}

// ============= NOTIFICACIONES =============

/**
 * Envía notificación al administrador
 */
async function notifyAdmin(message, type = 'info') {
    const timestamp = new Date().toLocaleString('es-MX');
    const emojis = {
        'critical': '🚨',
        'error': '❌',
        'warn': '⚠️',
        'info': 'ℹ️',
        'success': '✅',
        'start': '🚀',
        'restart': '🔄',
        'health': '💓'
    };
    
    const emoji = emojis[type] || '📢';
    const fullMessage = `${emoji} *SUPERVISOR BOT ITA*\n\n${message}\n\n🕐 ${timestamp}`;
    
    try {
        // Guardar en log de notificaciones
        fs.appendFileSync(NOTIFICATIONS_LOG, 
            `[${new Date().toISOString()}] [${type.toUpperCase()}] ${message}\n`, 'utf8');
        
        log(`📤 Notificando admin: ${type}`, 'INFO');
        
        // Intentar enviar al bot si está activo
        if (botProcess && botProcess.exitCode === null) {
            try {
                // Usar el endpoint del bot para enviar mensajes
                const response = await axios.post(`http://localhost:${BOT_PORT}/v1/messages`, {
                    number: ADMIN_NUMBER,
                    message: fullMessage
                }, { 
                    timeout: 15000,
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (response.status === 200) {
                    log('✅ Notificación enviada', 'SUCCESS');
                    return true;
                }
            } catch (error) {
                log(`⚠️ Error enviando notificación: ${error.message}`, 'WARN');
                
                // Guardar notificación pendiente
                const pendingFile = path.join(LOGS_DIR, 'pending-notifications.txt');
                fs.appendFileSync(pendingFile, 
                    `[${timestamp}] ${type.toUpperCase()}: ${message.substring(0, 100)}...\n`, 'utf8');
            }
        }
    } catch (error) {
        log(`❌ Error en notificación: ${error.message}`, 'ERROR');
    }
    
    return false;
}

// ============= FUNCIONES PRINCIPALES =============

async function compileBot() {
    return new Promise((resolve) => {
        log('🔨 Compilando bot...', 'INFO');
        
        const buildProcess = spawn('npm', ['run', 'build'], {
            cwd: __dirname,
            stdio: 'pipe',
            shell: true
        });
        
        let output = '';
        let hasError = false;
        
        buildProcess.stdout.on('data', (data) => {
            const text = data.toString().trim();
            if (text) {
                log(`[BUILD] ${text}`, 'INFO');
                output += text + '\n';
            }
        });
        
        buildProcess.stderr.on('data', (data) => {
            const text = data.toString().trim();
            if (text && !text.includes('warning')) {
                log(`[BUILD-ERR] ${text}`, 'ERROR');
                output += `ERROR: ${text}\n`;
                hasError = true;
            }
        });
        
        buildProcess.on('close', (code) => {
            if (code === 0 && !hasError) {
                log('✅ Compilación exitosa', 'SUCCESS');
                resolve(true);
            } else {
                log(`❌ Compilación falló (código ${code})`, 'ERROR');
                if (output.length > 0) {
                    log(`📝 Últimos 200 caracteres: ${output.slice(-200)}`, 'ERROR');
                }
                resolve(false);
            }
        });
        
        buildProcess.on('error', (error) => {
            log(`❌ Error ejecutando build: ${error.message}`, 'ERROR');
            resolve(false);
        });
    });
}

async function startBot() {
    if (isShuttingDown) return;
    
    restartCount++;
    botStartTime = Date.now();
    lastHealthCheck = Date.now();
    
    log(`\n══════════════════════════════════════════════════`, 'INFO');
    log(`🔄 REINICIO #${restartCount} - ${new Date().toLocaleString('es-MX')}`, 'INFO');
    log(`══════════════════════════════════════════════════`, 'INFO');
    
    // Notificar inicio
    if (restartCount === 1) {
        await notifyAdmin(
            `🚀 *Supervisor iniciado*\n📁 ${path.basename(__dirname)}\n🖥️ ${process.platform} ${process.arch}\n👤 ${process.env.USERNAME || 'system'}`,
            'start'
        );
    } else if (restartCount > 1) {
        await notifyAdmin(
            `🔄 *Reinicio automático #${restartCount}*\nEl bot se reinició por seguridad\n⏰ ${new Date().toLocaleString('es-MX')}`,
            'restart'
        );
    }
    
    // 1. Compilar (opcional, comentar si ya está compilado)
    const compiled = await compileBot();
    if (!compiled) {
        log('⚠️ Continuando con versión precompilada', 'WARN');
    }
    
    // 2. Verificar archivo compilado
    const appPath = path.join(__dirname, 'dist', 'app.js');
    if (!fs.existsSync(appPath)) {
        log(`❌ Archivo no encontrado: ${appPath}`, 'ERROR');
        await notifyAdmin('❌ Error: Archivo del bot no encontrado', 'error');
        scheduleRestart();
        return;
    }
    
    // 3. Detener proceso anterior si existe
    if (botProcess && botProcess.exitCode === null) {
        log('🛑 Terminando proceso anterior...', 'WARN');
        try {
            botProcess.kill('SIGTERM');
            
            // Esperar 2 segundos
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            if (botProcess.exitCode === null) {
                log('⚠️ Proceso no responde, forzando terminación...', 'WARN');
                botProcess.kill('SIGKILL');
            }
        } catch (error) {
            log(`⚠️ Error terminando proceso: ${error.message}`, 'WARN');
        }
        botProcess = null;
    }
    
    // 4. Iniciar nuevo proceso
    log(`🚀 Iniciando bot: node "${appPath}"`, 'INFO');
    
    botProcess = spawn('node', [appPath], {
        cwd: __dirname,
        env: {
            ...process.env,
            NODE_ENV: 'production',
            SUPERVISOR: 'true',
            RESTART_COUNT: restartCount.toString(),
            PORT: BOT_PORT.toString(),
            HEALTH_PORT: HEALTH_PORT.toString()
        },
        stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Capturar salida del bot
    botProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
            log(`[BOT] ${output}`, 'INFO');
            
            // Actualizar timestamp si vemos actividad
            if (output.includes('💓 Bot activo') || 
                output.includes('✅') || 
                output.includes('🚀') ||
                output.includes('🌐 Servidor iniciando')) {
                lastHealthCheck = Date.now();
            }
        }
    });
    
    botProcess.stderr.on('data', (data) => {
        const error = data.toString().trim();
        if (error && !error.includes('DeprecationWarning') && !error.includes('ExperimentalWarning')) {
            log(`[BOT-ERROR] ${error}`, 'ERROR');
        }
    });
    
    // Manejar cierre del proceso
    botProcess.on('close', (code, signal) => {
        const uptime = botStartTime ? Math.floor((Date.now() - botStartTime) / 1000) : 0;
        
        if (code === 0) {
            log(`✅ Bot cerrado normalmente después de ${uptime}s`, 'SUCCESS');
        } else {
            log(`❌ Bot falló después de ${uptime}s: código ${code}, señal ${signal || 'N/A'}`, 'ERROR');
            
            // Verificar si alcanzamos el máximo de reinicios
            if (restartCount >= MAX_RESTARTS) {
                const criticalMsg = `🛑 MÁXIMO DE REINICIOS ALCANZADO (${MAX_RESTARTS})\n🚨 INTERVENCIÓN MANUAL REQUERIDA\n📊 Total fallos: ${restartCount}`;
                
                log(criticalMsg, 'CRITICAL');
                notifyAdmin(criticalMsg, 'critical').then(() => {
                    log('🛑 Supervisor detenido por demasiados reinicios', 'CRITICAL');
                    process.exit(1);
                });
                return;
            }
        }
        
        botProcess = null;
        scheduleRestart();
    });
    
    botProcess.on('error', (error) => {
        log(`❌ Error ejecutando bot: ${error.message}`, 'ERROR');
        botProcess = null;
        scheduleRestart();
    });
    
    // Verificar que el bot inició correctamente
    setTimeout(async () => {
        if (botProcess && botProcess.exitCode === null) {
            log('✅ Proceso del bot iniciado', 'SUCCESS');
            
            // Esperar más tiempo para que el bot se inicialice completamente
            setTimeout(async () => {
                if (botProcess && botProcess.exitCode === null) {
                    const isHealthy = await checkBotHealth();
                    
                    if (isHealthy) {
                        const uptime = Math.floor((Date.now() - botStartTime) / 1000);
                        await notifyAdmin(
                            `✅ Bot iniciado exitosamente\n🔄 Reinicio #${restartCount}\n⏰ Uptime: ${uptime}s\n📈 Estado: Activo y respondiendo`,
                            'success'
                        );
                        log('🎉 Bot completamente inicializado y respondiendo', 'SUCCESS');
                    } else {
                        log('⚠️ Bot iniciado pero no responde a health check', 'WARN');
                        // Esperar un poco más y volver a intentar
                        setTimeout(async () => {
                            if (botProcess && botProcess.exitCode === null) {
                                const retryHealthy = await checkBotHealth();
                                if (!retryHealthy) {
                                    log('❌ Bot sigue sin responder, será reiniciado', 'ERROR');
                                    botProcess.kill('SIGTERM');
                                }
                            }
                        }, 30000);
                    }
                }
            }, 20000); // Esperar 20 segundos para inicialización completa
        }
    }, 5000);
}

function scheduleRestart() {
    if (isShuttingDown) return;
    
    const baseDelay = 10000; // 10 segundos base
    const maxDelay = 120000; // 2 minutos máximo
    const delay = Math.min(baseDelay * Math.pow(1.3, restartCount - 1), maxDelay);
    const seconds = Math.round(delay / 1000);
    
    log(`⏳ Próximo intento en ${seconds} segundos... (${new Date(Date.now() + delay).toLocaleTimeString('es-MX')})`, 'INFO');
    
    setTimeout(() => {
        if (!isShuttingDown) {
            startBot();
        }
    }, delay);
}

// ============= MONITOREO CONTINUO =============

function startHealthMonitoring() {
    // Health check periódico
    healthCheckTimer = setInterval(async () => {
        if (botProcess && botProcess.exitCode === null) {
            const isHealthy = await checkBotHealth();
            
            if (!isHealthy) {
                log('⚠️ Health check falló', 'WARN');
                
                // Verificar inactividad
                if (checkInactivity()) {
                    log('🔴 Bot inactivo, reiniciando...', 'ERROR');
                    
                    await notifyAdmin(
                        `⚠️ Bot inactivo detectado\n🔄 Reiniciando automáticamente\n📊 Uptime: ${Math.floor((Date.now() - botStartTime) / 1000)}s`,
                        'warn'
                    );
                    
                    if (botProcess) {
                        botProcess.kill('SIGTERM');
                    }
                }
            }
        } else if (!botProcess && restartCount === 0) {
            // Si no hay proceso y es el primer intento
            log('⚠️ No hay proceso del bot activo, iniciando...', 'WARN');
            startBot();
        }
    }, HEALTH_CHECK_INTERVAL);
    
    // Reporte de estado periódico
    setInterval(() => {
        if (botProcess && botProcess.exitCode === null) {
            const uptime = botStartTime ? Math.floor((Date.now() - botStartTime) / 1000) : 0;
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = uptime % 60;
            
            log(`📊 Estado: Activo ${hours}h ${minutes}m ${seconds}s | Reinicios: ${restartCount} | Mem: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, 'INFO');
            
            // Reporte cada 4 horas
            if (hours > 0 && hours % 4 === 0 && minutes < 5) {
                notifyAdmin(
                    `📊 Reporte de estado cada 4h\n⏰ Uptime: ${hours}h ${minutes}m\n🔄 Reinicios: ${restartCount}\n✅ Estado: Activo\n🧠 Memoria: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
                    'health'
                );
            }
        }
    }, 5 * 60 * 1000); // Cada 5 minutos
}

async function gracefulShutdown() {
    if (isShuttingDown) return;
    
    isShuttingDown = true;
    log('\n══════════════════════════════════════════════════', 'WARN');
    log('🛑 INICIANDO APAGADO CONTROLADO', 'WARN');
    log('══════════════════════════════════════════════════', 'WARN');
    
    // Limpiar timers
    if (healthCheckTimer) clearInterval(healthCheckTimer);
    if (inactivityTimer) clearInterval(inactivityTimer);
    
    await notifyAdmin(
        `🛑 Supervisor deteniéndose\n📊 Reinicios realizados: ${restartCount}\n⏰ ${new Date().toLocaleString('es-MX')}`,
        'warn'
    );
    
    // Detener el bot si está activo
    if (botProcess && botProcess.exitCode === null) {
        log('🛑 Terminando bot...', 'WARN');
        botProcess.kill('SIGTERM');
        
        await new Promise((resolve) => {
            const timeout = setTimeout(() => {
                if (botProcess) {
                    log('⚠️ Forzando terminación del bot...', 'WARN');
                    botProcess.kill('SIGKILL');
                }
                resolve();
            }, 8000);
            
            botProcess.on('close', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }
    
    log('✅ Supervisor detenido correctamente', 'SUCCESS');
    log(`📊 Estadísticas finales: ${restartCount} reinicios realizados`, 'INFO');
    log('👋 Hasta luego!', 'INFO');
    
    process.exit(0);
}

function setupSignalHandlers() {
    process.on('SIGINT', () => {
        log('\n🛑 Señal SIGINT recibida (Ctrl+C)', 'WARN');
        gracefulShutdown();
    });
    
    process.on('SIGTERM', () => {
        log('\n🛑 Señal SIGTERM recibida', 'WARN');
        gracefulShutdown();
    });
    
    process.on('SIGHUP', () => {
        log('\n🛑 Señal SIGHUP recibida (terminal cerrado)', 'WARN');
        gracefulShutdown();
    });
    
    process.on('uncaughtException', async (error) => {
        log(`💥 ERROR NO CAPTURADO: ${error.message}`, 'CRITICAL');
        log(error.stack, 'ERROR');
        
        await notifyAdmin(
            `💥 ERROR CRÍTICO EN SUPERVISOR\n📝 ${error.message.substring(0, 100)}...`,
            'critical'
        );
        
        setTimeout(() => process.exit(1), 2000);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
        log(`💥 PROMISE RECHAZADA NO MANEJADA: ${reason}`, 'ERROR');
    });
}

// ============= INICIO =============
async function main() {
    console.clear();
    console.log('\x1b[36m%s\x1b[0m', '╔══════════════════════════════════════════════════════╗');
    console.log('\x1b[36m%s\x1b[0m', '║       SUPERVISOR BOT ITA - NOTIFICACIONES v2.1      ║');
    console.log('\x1b[36m%s\x1b[0m', '║       Monitoreo 24/7 con reinicio automático       ║');
    console.log('\x1b[36m%s\x1b[0m', '╚══════════════════════════════════════════════════════╝');
    console.log('');
    
    log('🚀 Iniciando supervisor de notificaciones...', 'INFO');
    log(`📁 Directorio: ${__dirname}`, 'INFO');
    log(`🌐 Puerto bot: ${BOT_PORT}`, 'INFO');
    log(`🏥 Puerto health: ${HEALTH_PORT}`, 'INFO');
    log(`📞 Admin: ${ADMIN_NUMBER}`, 'INFO');
    log(`🔍 Health checks: cada ${HEALTH_CHECK_INTERVAL / 1000}s`, 'INFO');
    log(`⏱️  Inactividad máxima: ${MAX_INACTIVITY / 60000} minutos`, 'INFO');
    log(`🔄 Máximo de reinicios: ${MAX_RESTARTS}`, 'INFO');
    
    initLogs();
    setupSignalHandlers();
    startHealthMonitoring();
    
    // Iniciar el bot después de 3 segundos
    log('⏳ Iniciando bot en 3 segundos...', 'INFO');
    setTimeout(() => {
        startBot();
    }, 3000);
}

// ============= EJECUCIÓN =============
if (require.main === module) {
    main().catch((error) => {
        console.error('💥 ERROR FATAL INICIANDO SUPERVISOR:', error);
        process.exit(1);
    });
}

// Exportar funciones para testing
module.exports = {
    checkBotHealth,
    startBot,
    gracefulShutdown,
    notifyAdmin
};