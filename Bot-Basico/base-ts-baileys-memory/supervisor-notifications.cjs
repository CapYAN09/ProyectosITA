const { exec } = require('child_process');
const { existsSync, appendFileSync, mkdirSync, readFileSync } = require('fs');
const { join } = require('path');
const axios = require('axios'); // Para notificaciones HTTP si las necesitas

// ============= CONFIGURACIÓN =============
const ADMIN_NUMBER = '5214494877990@s.whatsapp.net'; // Tu número de admin
const MAX_RESTARTS = 20;
const LOGS_DIR = join(__dirname, 'logs');
const ERROR_LOG = join(LOGS_DIR, 'supervisor-error.log');
const BOT_LOG = join(LOGS_DIR, 'bot-output.log');
const NOTIFICATIONS_LOG = join(LOGS_DIR, 'notifications.log');

let botProcess = null;
let isShuttingDown = false;
let restartCount = 0;
let lastNotificationTime = 0;
const NOTIFICATION_COOLDOWN = 5 * 60 * 1000; // 5 minutos entre notificaciones

// ============= INICIALIZACIÓN =============
function initLogs() {
    try {
        if (!existsSync(LOGS_DIR)) {
            mkdirSync(LOGS_DIR, { recursive: true });
        }
    } catch (error) {
        console.error('❌ Error creando logs:', error.message);
    }
}

// ============= SISTEMA DE NOTIFICACIONES =============

/**
 * Envía notificación al administrador por WhatsApp
 */
async function notifyAdmin(message, type = 'info') {
    const now = Date.now();
    
    // Evitar notificaciones demasiado frecuentes
    if (now - lastNotificationTime < NOTIFICATION_COOLDOWN && type !== 'critical') {
        log(`⏳ Notificación omitida (cooldown): ${message}`, 'info');
        return false;
    }
    
    lastNotificationTime = now;
    
    try {
        // Log de la notificación
        log(`📤 Enviando notificación: ${message}`, 'info');
        
        // Guardar en archivo de notificaciones
        appendFileSync(NOTIFICATIONS_LOG, 
            `[${new Date().toISOString()}] [${type.toUpperCase()}] ${message}\n`, 'utf8');
        
        // Intentar enviar al bot si está disponible
        await sendWhatsAppNotification(message, type);
        
        log('✅ Notificación enviada', 'success');
        return true;
        
    } catch (error) {
        log(`❌ Error enviando notificación: ${error.message}`, 'error');
        return false;
    }
}

/**
 * Envía mensaje de WhatsApp usando el bot (si está activo)
 */
async function sendWhatsAppNotification(message, type) {
    // Emojis según el tipo
    const emojis = {
        'critical': '🚨',
        'error': '❌',
        'warn': '⚠️',
        'info': 'ℹ️',
        'success': '✅',
        'start': '🚀',
        'restart': '🔄'
    };
    
    const emoji = emojis[type] || '📢';
    const fullMessage = `${emoji} *SUPERVISOR BOT ITA*\n\n${message}\n\n🕐 ${new Date().toLocaleString('es-MX')}`;
    
    // Intentar enviar usando el endpoint HTTP del bot
    try {
        // Si tu bot tiene un endpoint HTTP para recibir mensajes
        const response = await axios.post('http://localhost:3008/v1/messages', {
            number: ADMIN_NUMBER,
            message: fullMessage
        }, { timeout: 10000 });
        
        return response.status === 200;
        
    } catch (error) {
        // Si falla, intentar método alternativo
        log(`⚠️ No se pudo enviar por HTTP: ${error.message}`, 'warn');
        return await tryAlternativeNotification(fullMessage);
    }
}

/**
 * Método alternativo de notificación
 */
async function tryAlternativeNotification(message) {
    try {
        // Opción 1: Guardar en archivo para que otro proceso lo envíe
        const pendingFile = join(LOGS_DIR, 'pending-notifications.json');
        let pending = [];
        
        if (existsSync(pendingFile)) {
            pending = JSON.parse(readFileSync(pendingFile, 'utf8'));
        }
        
        pending.push({
            timestamp: new Date().toISOString(),
            message: message,
            to: ADMIN_NUMBER
        });
        
        // Mantener solo las últimas 10 notificaciones pendientes
        if (pending.length > 10) {
            pending = pending.slice(-10);
        }
        
        appendFileSync(pendingFile, JSON.stringify(pending, null, 2), 'utf8');
        log('💾 Notificación guardada para envío posterior', 'info');
        
        return true;
        
    } catch (error) {
        log(`❌ Método alternativo falló: ${error.message}`, 'error');
        return false;
    }
}

// ============= LOGGING MEJORADO =============
function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
    
    // Colores en consola
    const colors = {
        'error': '\x1b[31m', // Rojo
        'warn': '\x1b[33m',  // Amarillo
        'success': '\x1b[32m', // Verde
        'info': '\x1b[36m',   // Cyan
        'critical': '\x1b[41m\x1b[37m' // Fondo rojo, texto blanco
    };
    
    const color = colors[type] || '';
    const reset = '\x1b[0m';
    
    console.log(`${color}${logMessage}${reset}`);
    
    // Guardar en archivo
    try {
        const logFile = type === 'error' || type === 'critical' ? ERROR_LOG : BOT_LOG;
        appendFileSync(logFile, logMessage + '\n', 'utf8');
    } catch (error) {
        // Silencioso
    }
}

// ============= FUNCIONES PRINCIPALES =============

async function compileBot() {
    return new Promise((resolve) => {
        log('🔨 Compilando TypeScript con Rollup...', 'info');
        
        const buildProcess = exec('npm run build', (error, stdout, stderr) => {
            if (error) {
                log(`❌ Error compilando: ${error.message}`, 'error');
                if (stderr) {
                    log(`📝 Detalles: ${stderr}`, 'error');
                }
                
                // Notificar al admin
                notifyAdmin(`❌ Error de compilación\n📝 ${error.message.substring(0, 100)}...`, 'error');
                
                resolve(false);
            } else {
                log('✅ Compilación exitosa', 'success');
                resolve(true);
            }
        });
        
        buildProcess.stdout.on('data', (data) => {
            log(`[BUILD] ${data.toString().trim()}`, 'info');
        });
        
        buildProcess.stderr.on('data', (data) => {
            log(`[BUILD-ERR] ${data.toString().trim()}`, 'error');
        });
    });
}

async function startBot() {
    if (isShuttingDown) return;
    
    restartCount++;
    
    // Notificar inicio/reinicio
    if (restartCount === 1) {
        await notifyAdmin(
            `🚀 *Supervisor iniciado*\n📁 ${process.cwd()}\n👤 ${process.env.USERNAME || 'Desconocido'}\n🖥️ ${process.platform} ${process.arch}`,
            'start'
        );
    } else {
        await notifyAdmin(
            `🔄 *Reinicio #${restartCount}*\nEl bot se detuvo y está reiniciándose...\n⏳ Próximo intento automático`,
            'restart'
        );
    }
    
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
        await notifyAdmin(`❌ Archivo compilado no encontrado\n📂 ${appPath}`, 'error');
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
            
            if (botProcess.exitCode === null) {
                botProcess.kill('SIGKILL');
            }
        } catch (error) {
            // Ignorar
        }
    }
    
    // 4. Ejecutar el bot
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
        maxBuffer: 10 * 1024 * 1024
    });
    
    // Capturar salida
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
    
    // Manejar cierre
    botProcess.on('close', async (code, signal) => {
        if (isShuttingDown) return;
        
        if (code === 0) {
            log(`✅ Bot cerrado normalmente (código: ${code})`, 'success');
            await notifyAdmin(
                `✅ Bot cerrado correctamente\n📊 Código: ${code}\n🔁 Se reiniciará automáticamente`,
                'info'
            );
        } else {
            log(`❌ Bot terminó con código: ${code}, señal: ${signal || 'N/A'}`, 'error');
            
            let errorType = 'error';
            let errorMessage = `❌ Bot falló\n📊 Código: ${code}`;
            
            if (code === 1) {
                errorType = 'critical';
                errorMessage += '\n🚨 Error crítico - Revisar logs';
            } else if (code === null && signal) {
                errorMessage += `\n⚠️ Señal: ${signal}`;
            }
            
            await notifyAdmin(errorMessage, errorType);
        }
        
        if (restartCount >= MAX_RESTARTS) {
            const criticalMsg = `🛑 MÁXIMO DE REINICIOS ALCANZADO\n🚨 Se requieren ${restartCount} intervención manual\n📝 Revisa logs en: ${LOGS_DIR}`;
            
            log(criticalMsg, 'critical');
            await notifyAdmin(criticalMsg, 'critical');
            
            process.exit(1);
        }
        
        scheduleRestart();
    });
    
    botProcess.on('error', async (error) => {
        log(`❌ Error ejecutando bot: ${error.message}`, 'error');
        await notifyAdmin(`❌ Error ejecutando bot\n📝 ${error.message}`, 'error');
        scheduleRestart();
    });
    
    // Verificar inicio exitoso
    setTimeout(async () => {
        if (botProcess && botProcess.exitCode === null) {
            log('✅ Bot iniciado y funcionando correctamente', 'success');
            
            await notifyAdmin(
                `✅ Bot iniciado exitosamente\n🔄 Reinicio #${restartCount}\n📊 Estado: Activo y monitoreado\n⏰ ${new Date().toLocaleString('es-MX')}`,
                'success'
            );
            
            log('📊 Monitoreo activo - El bot se reiniciará automáticamente si falla', 'info');
        }
    }, 8000); // Más tiempo para que el bot inicialice completamente
}

function scheduleRestart() {
    if (isShuttingDown) return;
    
    const baseDelay = 5000;
    const maxDelay = 60000;
    const delay = Math.min(baseDelay * Math.pow(1.5, restartCount - 1), maxDelay);
    
    log(`⏳ Próximo intento en ${Math.round(delay / 1000)} segundos...`, 'info');
    
    setTimeout(() => {
        if (!isShuttingDown) {
            startBot();
        }
    }, delay);
}

async function gracefulShutdown() {
    if (isShuttingDown) return;
    
    isShuttingDown = true;
    log('\n🛑 Iniciando apagado controlado...', 'warn');
    
    // Notificar apagado
    await notifyAdmin(
        `🛑 Supervisor deteniéndose\n👤 Usuario: ${process.env.USERNAME || 'Desconocido'}\n📊 Reinicios realizados: ${restartCount}\n⏰ ${new Date().toLocaleString('es-MX')}`,
        'warn'
    );
    
    // 1. Detener el bot
    if (botProcess && botProcess.exitCode === null) {
        log('🛑 Enviando señal de terminación al bot...', 'warn');
        botProcess.kill('SIGTERM');
        
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

function setupSignalHandlers() {
    process.on('SIGINT', () => {
        log('\n🛑 Señal SIGINT recibida (Ctrl+C)', 'warn');
        gracefulShutdown();
    });
    
    process.on('SIGTERM', () => {
        log('\n🛑 Señal SIGTERM recibida', 'warn');
        gracefulShutdown();
    });
    
    process.on('SIGHUP', () => {
        log('\n🛑 Señal SIGHUP recibida (cierre de ventana)', 'warn');
        gracefulShutdown();
    });
    
    process.on('uncaughtException', async (error) => {
        log(`💥 Error no capturado: ${error.message}`, 'critical');
        log(error.stack, 'error');
        
        await notifyAdmin(
            `💥 ERROR CRÍTICO EN SUPERVISOR\n📝 ${error.message.substring(0, 150)}...\n🚨 El supervisor se detendrá`,
            'critical'
        );
        
        setTimeout(() => process.exit(1), 1000);
    });
    
    process.on('unhandledRejection', async (reason) => {
        log(`💥 Promise rechazada no manejada: ${reason}`, 'error');
        
        await notifyAdmin(
            `⚠️ Promise rechazada en supervisor\n📝 ${String(reason).substring(0, 100)}...`,
            'warn'
        );
    });
}

function startMonitoring() {
    // Monitoreo cada hora para reporte de estado
    setInterval(async () => {
        if (botProcess && botProcess.exitCode === null) {
            const now = new Date();
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            
            log(`📊 Estado: Bot activo por ${hours}h ${minutes}m, Reinicios: ${restartCount}`, 'info');
            log(`🕐 Hora actual: ${now.toLocaleTimeString('es-MX')}`, 'info');
            
            // Reporte de estado cada 6 horas
            if (hours % 6 === 0 && minutes === 0) {
                await notifyAdmin(
                    `📊 Reporte de estado cada 6h\n⏰ Uptime: ${hours}h ${minutes}m\n🔄 Reinicios: ${restartCount}\n✅ Estado: Activo y estable\n🕐 ${now.toLocaleString('es-MX')}`,
                    'info'
                );
            }
            
            if (restartCount > 5) {
                log('⚠️ Muchos reinicios, revisar posibles problemas', 'warn');
            }
        }
    }, 60 * 60 * 1000); // Cada hora
    
    // Verificación de salud cada 30 minutos
    setInterval(() => {
        if (botProcess && botProcess.exitCode !== null) {
            log('⚠️ Proceso del bot no está activo pero debería', 'warn');
        }
    }, 30 * 60 * 1000);
}

// ============= INICIO =============
async function main() {
    console.clear();
    console.log('\x1b[36m%s\x1b[0m', '╔══════════════════════════════════════════════════╗');
    console.log('\x1b[36m%s\x1b[0m', '║     SUPERVISOR WHATSAPP BOT ITA - NOTIFICACIONES║');
    console.log('\x1b[36m%s\x1b[0m', '║     Windows Edition - Centro de Cómputo         ║');
    console.log('\x1b[36m%s\x1b[0m', '╚══════════════════════════════════════════════════╝');
    console.log('');
    
    log('🚀 Iniciando supervisor con notificaciones...', 'info');
    log(`📁 Directorio: ${__dirname}`, 'info');
    log(`👤 Usuario: ${process.env.USERNAME || 'Desconocido'}`, 'info');
    log(`📞 Admin: ${ADMIN_NUMBER}`, 'info');
    log(`🖥️  Sistema: ${process.platform} ${process.arch}`, 'info');
    log(`⚙️  Node.js: ${process.version}`, 'info');
    
    // Instalar axios si no está
    try {
        require('axios');
    } catch {
        log('📦 Instalando axios para notificaciones...', 'info');
        exec('npm install axios', { silent: true });
    }
    
    // Inicializar
    initLogs();
    setupSignalHandlers();
    startMonitoring();
    
    // Iniciar bot después de 3 segundos
    setTimeout(() => {
        startBot();
    }, 3000);
}

// ============= EJECUCIÓN =============
if (require.main === module) {
    main().catch(async (error) => {
        log(`💥 Error fatal en main: ${error.message}`, 'critical');
        log(error.stack, 'error');
        
        // Intentar notificar el error fatal
        try {
            await notifyAdmin(
                `💥 ERROR FATAL EN SUPERVISOR\n📝 ${error.message}\n🚨 El supervisor no pudo iniciar`,
                'critical'
            );
        } catch {
            // Si falla, al menos mostrar en consola
        }
        
        process.exit(1);
    });
}