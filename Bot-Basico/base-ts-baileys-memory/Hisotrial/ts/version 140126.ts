import { join } from 'path'
import { createBot, createProvider, createFlow, addKeyword, utils } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import { CoreClass } from '@builderbot/bot'
import mysql from 'mysql2/promise'
import express from 'express';
//import {  encriptarContrasena, desencriptarContrasena, probarEncriptacion, encriptarContrasenaParaBD } from './encriptacion'; // Ajusta la ruta según tu estructura

const healthApp = express();
const HEALTH_PORT = 3010;

// INICIAR HEALTH ENDPOINT DE INMEDIATO
healthApp.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'whatsapp-bot',
        uptime: process.uptime()
    });
});

// Iniciar el servidor de health INMEDIATAMENTE
healthApp.listen(HEALTH_PORT, () => {
    console.log(`✅ Health endpoint INICIADO en puerto ${HEALTH_PORT}`);
    console.log(`   📍 URL: http://localhost:${HEALTH_PORT}/health`);
});

// También agregar un endpoint simple en el puerto principal
const simpleApp = express();
simpleApp.get('/health', (req, res) => {
    res.json({ status: 'ok', port: 3008 });
});

simpleApp.listen(3009, () => {
    console.log(`✅ Health alternativo en puerto 3009`);
});

// ==== VARIABLES GLOBALES Y CONFIGURACIONES ====
const CONTACTO_ADMIN = '5214494877990@s.whatsapp.net'
const PORT = process.env.PORT ?? 3008

// Al inicio de tu app.ts, después de las importaciones
process.on('uncaughtException', (error) => {
    console.error('💥 Error no capturado:', error);
    // NO salgas, deja que el supervisor te reinicie
    // process.exit(1); // ← NO uses esto
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Promise rechazada no manejada:', reason);
});

// Heartbeat periódico para demostrar que está vivo
setInterval(() => {
    console.log('💓 Bot activo -', new Date().toLocaleTimeString('es-MX'));
}, 300000); // Cada 5 minutos

// ==== CONFIGURACIÓN DE BASES DE DATOS ====================
const DB_CONFIG = {
    actextita: {
        host: '172.30.247.186',
        user: 'ccomputo',
        password: 'Jarjar0904$',
        database: 'actextita',
        port: 3306
    },
    bot_whatsapp: {
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'bot_whatsapp',
        port: 3306
    },
    sistematickets: {
        host: '172.30.247.185',
        user: 'ccomputo',
        password: 'Jarjar0904$',
        database: 'b1o04dzhm1guhvmjcrwb',
        port: 3306
    }
};

// ==== CONEXIONES A BASES DE DATOS ====================
let conexionMySQL = null;
let conexionActextita = null;
let conexionSistematickets = null;
let reconectando = false;

// Función genérica para crear conexiones
async function crearConexion(config, nombre) {
    try {
        const connection = await mysql.createConnection({
            ...config,
            connectTimeout: 30000,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10000
        });

        connection.on('error', (err) => {
            console.error(`❌ Error en conexión ${nombre}:`, err.message);
            if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
                console.log(`🔄 Reconectando a ${nombre}...`);
                reconectarConexion(nombre);
            }
        });

        console.log(`✅ Conexión ${nombre} creada exitosamente`);
        return connection;
    } catch (error) {
        console.error(`❌ Error creando conexión ${nombre}:`, error.message);
        return null;
    }
}

// Función genérica para reconectar
async function reconectarConexion(nombre) {
    if (reconectando) return;
    reconectando = true;

    try {
        let conexion;
        let config;

        switch (nombre) {
            case 'MySQL':
                conexion = conexionMySQL;
                config = DB_CONFIG.bot_whatsapp;
                break;
            case 'actextita':
                conexion = conexionActextita;
                config = DB_CONFIG.actextita;
                break;
            case 'sistematickets':
                conexion = conexionSistematickets;
                config = DB_CONFIG.sistematickets;
                break;
        }

        if (conexion) {
            try { await conexion.end(); } catch (e) { }
        }

        const nuevaConexion = await crearConexion(config, nombre);

        switch (nombre) {
            case 'MySQL':
                conexionMySQL = nuevaConexion;
                break;
            case 'actextita':
                conexionActextita = nuevaConexion;
                break;
            case 'sistematickets':
                conexionSistematickets = nuevaConexion;
                break;
        }

        reconectando = false;

        if (nuevaConexion) {
            console.log(`✅ Reconexión a ${nombre} exitosa`);
        }
    } catch (error) {
        console.error(`❌ Error en reconexión ${nombre}:`, error.message);
        reconectando = false;
        setTimeout(() => reconectarConexion(nombre), 5000);
    }
}

// ==== INICIALIZACIÓN DE CONEXIONES ====================

// Conexión MySQL Local
async function inicializarMySQL() {
    try {
        if (!conexionMySQL || conexionMySQL._closing) {
            conexionMySQL = await crearConexion(DB_CONFIG.bot_whatsapp, 'MySQL');
        }

        if (conexionMySQL) {
            await conexionMySQL.execute('SELECT 1');
        }
        return conexionMySQL;
    } catch (error) {
        console.error('❌ Error en inicializarMySQL:', error.message);
        await reconectarConexion('MySQL');
        return conexionMySQL;
    }
}

// Conexión a actextita
async function inicializarActextita() {
    try {
        if (!conexionActextita || conexionActextita._closing) {
            conexionActextita = await crearConexion(DB_CONFIG.actextita, 'actextita');
        }

        if (conexionActextita) {
            await conexionActextita.execute('SELECT 1');
        }
        return conexionActextita;
    } catch (error) {
        console.error('❌ Error en inicializarActextita:', error.message);
        await reconectarConexion('actextita');
        return conexionActextita;
    }
}

// Conexión a sistematickets
async function inicializarSistematickets() {
    try {
        if (!conexionSistematickets || conexionSistematickets._closing) {
            conexionSistematickets = await crearConexion(DB_CONFIG.sistematickets, 'sistematickets');
        }

        if (conexionSistematickets) {
            await conexionSistematickets.execute('SELECT 1');
        }
        return conexionSistematickets;
    } catch (error) {
        console.error('❌ Error en inicializarSistematickets:', error.message);
        await reconectarConexion('sistematickets');
        return conexionSistematickets;
    }
}

// ==== FUNCIONES DE BASE DE DATOS ====================

// 1. Consultar alumno en base de datos actextita (usando conexión persistente)
async function consultarAlumnoEnBaseDatos(numeroControl) {
    let connection;
    try {
        // Usar conexión persistente si está disponible
        if (conexionActextita) {
            connection = conexionActextita;
        } else {
            connection = await inicializarActextita();
        }

        if (!connection) {
            throw new Error('No se pudo establecer conexión con la base de datos');
        }

        const [anuevoIngreso] = await connection.execute(
            'SELECT * FROM anuevo_ingreso WHERE numero_control = ?',
            [numeroControl]
        );

        const [aResagados] = await connection.execute(
            'SELECT * FROM a_resagados WHERE numero_control = ?',
            [numeroControl]
        );

        if (anuevoIngreso.length > 0) {
            return { encontrado: true, ...anuevoIngreso[0] };
        } else if (aResagados.length > 0) {
            return { encontrado: true, ...aResagados[0] };
        } else {
            return { encontrado: false };
        }

    } catch (error) {
        console.error('❌ Error consultando alumno:', error.message);

        // Intentar reconectar si hay error de conexión
        if (error.code === 'PROTOCOL_CONNECTION_LOST' || error.code === 'ECONNRESET') {
            await reconectarConexion('actextita');
        }

        return { encontrado: false, error: error.message };
    }
}

// 2. Verificar administrador en base de datos actextita
async function verificarAdministradorEnBaseDatos(usuario) {
    let connection;
    try {
        // Usar conexión persistente si está disponible
        if (conexionActextita) {
            connection = conexionActextita;
        } else {
            connection = await inicializarActextita();
        }

        if (!connection) {
            return false;
        }

        const [resultados] = await connection.execute(
            'SELECT usuario, estado, fecha_creacion FROM admins WHERE usuario = ? AND estado = "activo"',
            [usuario]
        );

        return resultados.length > 0;

    } catch (error) {
        console.error('❌ Error verificando administrador:', error.message);

        // Intentar reconectar si hay error de conexión
        if (error.code === 'PROTOCOL_CONNECTION_LOST' || error.code === 'ECONNRESET') {
            await reconectarConexion('actextita');
        }

        return false;
    }
}

// 3. Actualizar contraseña de admin
async function actualizarContrasenaAdmin(usuario, nuevaContrasena) {
    let connection;
    try {
        // Usar conexión persistente si está disponible
        if (conexionActextita) {
            connection = conexionActextita;
        } else {
            connection = await inicializarActextita();
        }

        if (!connection) {
            return false;
        }

        const [resultado] = await connection.execute(
            'UPDATE admins SET contraseña = ? WHERE usuario = ?',
            [nuevaContrasena, usuario]
        );

        return resultado.affectedRows > 0;

    } catch (error) {
        console.error('❌ Error actualizando contraseña de admin:', error.message);

        // Intentar reconectar si hay error de conexión
        if (error.code === 'PROTOCOL_CONNECTION_LOST' || error.code === 'ECONNRESET') {
            await reconectarConexion('actextita');
        }

        return false;
    }
}

// 4. Función para consultar en sistematickets
async function consultarSistematickets(query, params = []) {
    let connection;
    try {
        // Usar conexión persistente si está disponible
        if (conexionSistematickets) {
            connection = conexionSistematickets;
        } else {
            connection = await inicializarSistematickets();
        }

        if (!connection) {
            throw new Error('No se pudo establecer conexión con sistematickets');
        }

        const [resultados] = await connection.execute(query, params);
        return resultados;

    } catch (error) {
        console.error('❌ Error consultando sistematickets:', error.message);

        // Intentar reconectar si hay error de conexión
        if (error.code === 'PROTOCOL_CONNECTION_LOST' || error.code === 'ECONNRESET') {
            await reconectarConexion('sistematickets');
        }

        throw error;
    }
}

// 5. Función para consultar en bot_whatsapp (local)
async function consultarBotWhatsapp(query, params = []) {
    let connection;
    try {
        // Usar conexión persistente si está disponible
        if (conexionMySQL) {
            connection = conexionMySQL;
        } else {
            connection = await inicializarMySQL();
        }

        if (!connection) {
            throw new Error('No se pudo establecer conexión con bot_whatsapp');
        }

        const [resultados] = await connection.execute(query, params);
        return resultados;

    } catch (error) {
        console.error('❌ Error consultando bot_whatsapp:', error.message);

        // Intentar reconectar si hay error de conexión
        if (error.code === 'PROTOCOL_CONNECTION_LOST' || error.code === 'ECONNRESET') {
            await reconectarConexion('MySQL');
        }

        throw error;
    }
}

// 6. Función para verificar conexión remota
async function verificarConexionRemota() {
    try {
        const connection = await inicializarSistematickets();
        return connection !== null;
    } catch (error) {
        console.error('❌ Error verificando conexión remota:', error.message);
        return false;
    }
}

// 7. Función para obtener estado de conexiones
function obtenerEstadoConexiones() {
    return {
        mysql: conexionMySQL ? '✅ CONECTADO' : '❌ DESCONECTADO',
        actextita: conexionActextita ? '✅ CONECTADO' : '❌ DESCONECTADO',
        sistematickets: conexionSistematickets ? '✅ CONECTADO' : '❌ DESCONECTADO'
    };
}

// ==== INICIALIZAR TODAS LAS CONEXIONES AL INICIAR LA APLICACIÓN ====================
async function inicializarTodasLasConexiones() {
    console.log('🚀 Inicializando todas las conexiones a bases de datos...');

    try {
        await Promise.allSettled([
            inicializarMySQL(),
            inicializarActextita(),
            inicializarSistematickets()
        ]);

        console.log('✅ Todas las conexiones inicializadas');
    } catch (error) {
        console.error('❌ Error inicializando conexiones:', error.message);
    }
}

// ==== CERRAR CONEXIONES ====================
async function cerrarTodasLasConexiones() {
    console.log('🔴 Cerrando todas las conexiones a bases de datos...');

    const conexiones = [
        { nombre: 'MySQL', conexion: conexionMySQL },
        { nombre: 'actextita', conexion: conexionActextita },
        { nombre: 'sistematickets', conexion: conexionSistematickets }
    ];

    for (const { nombre, conexion } of conexiones) {
        if (conexion) {
            try {
                await conexion.end();
                console.log(`✅ Conexión ${nombre} cerrada`);
            } catch (error) {
                console.error(`❌ Error cerrando conexión ${nombre}:`, error.message);
            }
        }
    }
}

// ==== SINGLETON PARA EL BOT ====
class BotSingleton {
    private static instance: CoreClass<Provider, Database> | null = null

    static setInstance(bot: CoreClass<Provider, Database>): void {
        BotSingleton.instance = bot
        console.log('✅ Singleton: Bot almacenado en singleton')
    }

    static getInstance(): CoreClass<Provider, Database> | null {
        return BotSingleton.instance
    }
}

// ==== CLASE TIMEOUT MANAGER ====================
class TimeoutManager {
    private timeouts = new Map<string, NodeJS.Timeout>()
    private intervals = new Map<string, NodeJS.Timeout>()

    setTimeout(userPhone: string, callback: () => void, delay: number): NodeJS.Timeout {
        this.clearTimeout(userPhone)
        const timeoutId = setTimeout(callback, delay)
        this.timeouts.set(userPhone, timeoutId)
        return timeoutId
    }

    setInterval(userPhone: string, callback: () => void, delay: number): NodeJS.Timeout {
        this.clearInterval(userPhone)
        const intervalId = setInterval(callback, delay)
        this.intervals.set(userPhone, intervalId)
        return intervalId
    }

    clearTimeout(userPhone: string): void {
        if (this.timeouts.has(userPhone)) {
            clearTimeout(this.timeouts.get(userPhone)!)
            this.timeouts.delete(userPhone)
        }
    }

    clearInterval(userPhone: string): void {
        if (this.intervals.has(userPhone)) {
            clearInterval(this.intervals.get(userPhone)!)
            this.intervals.delete(userPhone)
        }
    }

    clearAll(userPhone: string): void {
        this.clearTimeout(userPhone)
        this.clearInterval(userPhone)
    }
}

const timeoutManager = new TimeoutManager()

// ==== SISTEMA DE ESTADOS DEL USUARIO ====================
const ESTADOS_USUARIO = {
    LIBRE: 'libre',
    EN_PROCESO_LARGO: 'en_proceso_largo',
    ESPERANDO_DATOS: 'esperando_datos',
    EN_MENU: 'en_menu'
}

// ==== FUNCIONES DE UTILIDAD ====================
function normalizarIdWhatsAppBusiness(id: string): string {
    if (!id) return id

    if (id.includes('@s.whatsapp.net') || id.includes('@g.us')) {
        return id
    }

    const numeroLimpio = id.replace(/[^\d]/g, '')

    if (!numeroLimpio || numeroLimpio.length < 10) {
        return id
    }

    let numeroNormalizado = numeroLimpio

    // CORREGIDO: No auto-asignar
    if (!numeroNormalizado.startsWith('52') && numeroNormalizado.length === 10) {
        numeroNormalizado = '52' + numeroNormalizado
    }

    return `${numeroNormalizado}@s.whatsapp.net`
}

function isValidText(input: string): boolean {
    if (!input || typeof input !== 'string') return false
    if (input.trim().length === 0) return false
    if (input.includes('sticker') || input.includes('image') || input.includes('video')) return false
    return true
}

function validarNumeroControl(numeroControl: string): boolean {
    const letrasPermitidas = ['D', 'C', 'B', 'R', 'G', 'd', 'c', 'b', 'r', 'g']
    const posicion3Permitidas = ['9', '0', '2', '4', '5', '1', '3', '6']
    const posicion4Permitidas = ['0', '2', '5', '6', '9', '1', '5', '7', '3', '4']

    if (numeroControl.length === 8) {
        const esSoloNumeros = /^\d+$/.test(numeroControl)
        const posicion2Correcta = posicion3Permitidas.includes(numeroControl[2])
        const posicion3Correcta = posicion4Permitidas.includes(numeroControl[3])
        return esSoloNumeros && posicion2Correcta && posicion3Correcta
    }

    if (numeroControl.length === 9) {
        const primeraLetraValida = letrasPermitidas.includes(numeroControl[0])
        const restoEsNumeros = /^\d+$/.test(numeroControl.slice(1))
        const posicion3Correcta = posicion3Permitidas.includes(numeroControl[3])
        const posicion4Correcta = posicion4Permitidas.includes(numeroControl[4])
        return primeraLetraValida && restoEsNumeros && posicion3Correcta && posicion4Correcta
    }

    return false
}

function validarCorreoTrabajador(correo: string): boolean {
    const regex = /^[a-zA-Z0-9._%+-]+@aguascalientes\.tecnm\.mx$/
    return regex.test(correo) && correo.length > 0
}

function esImagenValida(ctx: any): boolean {
    if (!ctx || typeof ctx !== 'object') return false

    if (ctx.message) {
        const messageKeys = Object.keys(ctx.message)
        const hasMediaMessage = messageKeys.some(key => {
            return key.includes('Message') &&
                !key.includes('conversation') &&
                !key.includes('extendedTextMessage') &&
                !key.includes('protocolMessage') &&
                !key.includes('senderKeyDistributionMessage')
        })

        if (hasMediaMessage) {
            if (ctx.message.imageMessage) return true
            if (ctx.message.documentMessage) {
                const mimeType = ctx.message.documentMessage.mimetype
                if (mimeType && mimeType.startsWith('image/')) return true
            }
            if (ctx.message.viewOnceMessageV2 || ctx.message.viewOnceMessage) return true
            return true
        }
    }

    if (ctx.type === 'image' || ctx.type === 'sticker' || ctx.type === 'document') return true
    if (ctx.media || ctx.hasMedia || ctx.mimetype) return true
    if (ctx.key && ctx.key.remoteJid && ctx.key.id) return true

    if (ctx.body) {
        const bodyLower = ctx.body.toLowerCase()
        const imageKeywords = ['foto', 'photo', 'imagen', 'image', 'cámara', 'camera', '📷', '📸']
        if (imageKeywords.some(keyword => bodyLower.includes(keyword))) return true
    }

    return false
}

// ==== MANTENER CONEXIONES ACTIVAS =============
function mantenerConexionesActivas() {
    setInterval(async () => {
        try {
            console.log('🔄 Manteniendo conexiones a BD activas...');

            if (conexionMySQL) {
                await conexionMySQL.execute('SELECT 1').catch(() => {
                    console.log('🔄 Reconectando MySQL...');
                    reconectarConexion('MySQL');
                });
            }

            if (conexionActextita) {
                await conexionActextita.execute('SELECT 1').catch(() => {
                    console.log('🔄 Reconectando Actextita...');
                    reconectarConexion('actextita');
                });
            }

            if (conexionSistematickets) {
                await conexionSistematickets.execute('SELECT 1').catch(() => {
                    console.log('🔄 Reconectando Sistematickets...');
                    reconectarConexion('sistematickets');
                });
            }

        } catch (error) {
            console.error('❌ Error manteniendo conexiones:', error.message);
        }
    }, 60 * 1000); // Cada minuto
}

// ==== FUNCIONES DE ESTADO ====================
async function actualizarEstado(ctx: any, state: any, nuevoEstado: string, metadata = {}) {
    try {
        if (!ctx || !ctx.from) return

        const userPhone = ctx.from

        const metadataLimpio: any = {
            ultimaActualizacion: Date.now()
        }

        // Copiar metadata correctamente
        Object.keys(metadata).forEach(key => {
            const valor = metadata[key]
            if (valor === null ||
                typeof valor === 'string' ||
                typeof valor === 'number' ||
                typeof valor === 'boolean' ||
                Array.isArray(valor)) {
                try {
                    JSON.stringify(valor)
                    metadataLimpio[key] = valor
                } catch (e) {
                    metadataLimpio[key] = `[${typeof valor}]`
                }
            } else if (typeof valor === 'object') {
                const objLimpio: any = {}
                Object.keys(valor).forEach(subKey => {
                    const subValor = valor[subKey]
                    if (subValor === null ||
                        typeof subValor === 'string' ||
                        typeof subValor === 'number' ||
                        typeof subValor === 'boolean') {
                        objLimpio[subKey] = subValor
                    }
                })
                metadataLimpio[key] = objLimpio
            }
        })

        // IMPORTANTE: Si es proceso largo, asegurar que tenga 'inicio'
        if (nuevoEstado === ESTADOS_USUARIO.EN_PROCESO_LARGO && !metadataLimpio.inicio) {
            metadataLimpio.inicio = Date.now();
        }

        await state.update({
            estadoUsuario: nuevoEstado,
            estadoMetadata: metadataLimpio
        })

        console.log(`✅ Estado actualizado a: ${nuevoEstado} para: ${userPhone}`)

    } catch (error) {
        console.error('❌ Error actualizando estado:', error)
    }
}

async function limpiarEstado(state: any) {
    try {
        const myState = await state.getMyState()
        const userPhone = state.id

        if (userPhone) {
            timeoutManager.clearAll(userPhone)
        }

        await state.update({
            estadoUsuario: ESTADOS_USUARIO.LIBRE,
            estadoMetadata: {},
            numeroControl: null,
            nombreCompleto: null,
            correoInstitucional: null,
            esTrabajador: null,
            identificacionSubida: false,
            infoIdentificacion: null,
            timestampIdentificacion: null,
            ultimaInteraccion: Date.now()
        })

    } catch (error) {
        console.error('❌ Error limpiando estado:', error)
    }
}

async function redirigirAMenuConLimpieza(ctx: any, state: any, gotoFlow: any, flowDynamic: any) {
    try {
        await limpiarEstado(state)

        // IMPORTANTE: Limpiar específicamente el tipoProceso de CIAPAGOS
        await state.update({
            estadoUsuario: ESTADOS_USUARIO.LIBRE,
            tipoProceso: null, // Limpiar el tipoProceso
            esTrabajador: null,
            numeroControl: null,
            nombreCompleto: null,
            correoInstitucional: null,
            identificacionSubida: false
        })

        return gotoFlow(flowMenu)
    } catch (error) {
        console.error('❌ Error en redirección al menú:', error)
        await flowDynamic('🔧 Reiniciando bot... Por favor escribe *hola* para continuar.')
        return gotoFlow(flowPrincipal)
    }
}

// =====================================================================================
// FUNCIÓN MEJORADA PARA VERIFICAR ESTADO BLOQUEADO - VERSIÓN CORREGIDA
// =====================================================================================
async function verificarEstadoBloqueado(ctx: any, { state, flowDynamic, gotoFlow }: any): Promise<boolean> {
    if (ctx.from === CONTACTO_ADMIN) return false;

    try {
        const myState = await state.getMyState();
        
        if (myState?.estadoUsuario === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
            console.log(`🔒 Usuario ${ctx.from} está BLOQUEADO - Mensaje: "${ctx.body}"`);
            
            const input = ctx.body?.toLowerCase().trim();
            
            // CORRECCIÓN: Manejar específicamente "menu" y "menú"
            if (input === 'menu' || input === 'menú') {
                const metadata = myState.estadoMetadata || {};
                const tiempoTranscurrido = Date.now() - (metadata.inicio || Date.now());
                const minutosTranscurridos = Math.floor(tiempoTranscurrido / 60000);
                const minutosRestantes = Math.max(0, 30 - minutosTranscurridos);
                
                await flowDynamic([
                    '🚫 *ACCESO BLOQUEADO* 🚫',
                    '',
                    '⏳ Tu sesión está bloqueada mientras procesamos tu solicitud.',
                    '',
                    '📋 **Proceso activo:**',
                    `• ${metadata.tipo || 'Restablecimiento en curso'}`,
                    `• ⏰ Tiempo transcurrido: ${minutosTranscurridos} minutos`,
                    `• ⏳ Tiempo restante: ${minutosRestantes} minutos`,
                    '',
                    '🚫 **No puedes acceder al menú durante este proceso**',
                    '',
                    '✅ **Solo puedes escribir:**',
                    '*estado* - Para ver el progreso actual',
                    '',
                    '🔄 El proceso continuará automáticamente.',
                    '¡Gracias por tu paciencia! 🙏'
                ].join('\n'));
                
                return true; // Bloquear el mensaje
            }
            
            // Manejar "estado"
            if (input === 'estado') {
                const metadata = myState.estadoMetadata || {};
                const tiempoTranscurrido = Date.now() - (metadata.inicio || Date.now());
                const minutosTranscurridos = Math.floor(tiempoTranscurrido / 60000);
                const minutosRestantes = Math.max(0, 30 - minutosTranscurridos);
                
                await flowDynamic([
                    '📊 **Estado del Proceso**',
                    '',
                    `📋 ${metadata.tipo || 'Proceso en curso'}`,
                    `⏰ Tiempo transcurrido: ${minutosTranscurridos} minutos`,
                    `⏳ Tiempo restante: ${minutosRestantes} minutos`,
                    '',
                    '🔄 El proceso continúa en segundo plano...',
                    '⏰ Se completará automáticamente.'
                ].join('\n'));
                
                return true; // Bloquear el mensaje
            }
            
            // Cualquier otro mensaje durante el bloqueo
            if (input && input !== 'estado' && input !== 'menu' && input !== 'menú') {
                await flowDynamic([
                    '⏳ *Proceso en curso* ⏳',
                    '',
                    '📋 Tu solicitud está siendo procesada...',
                    '',
                    '🚫 **No es necesario que escribas nada**',
                    '⏰ El proceso continuará automáticamente',
                    '',
                    '💡 **Solo puedes escribir:**',
                    '*estado* - Para ver el progreso actual',
                    '',
                    '¡Gracias por tu paciencia! 🙏'
                ].join('\n'));
                
                return true; // Bloquear el mensaje
            }
            
            return true; // Por defecto, bloquear
        }
    } catch (error) {
        console.error('❌ Error en verificación de estado bloqueado:', error);
    }
    
    return false;
}

// Middleware global que intercepta TODOS los mensajes
function crearMiddlewareGlobal(bot: CoreClass<Provider, Database>) {
    const provider = bot.provider;
    
    // Interceptar eventos de mensajes
    provider.on('message', async (ctx: any) => {
        try {
            // Solo procesar si es un mensaje de texto
            if (!ctx.body || ctx.body.trim() === '') return;
            
            const userPhone = normalizarIdWhatsAppBusiness(ctx.from);
            
            // Obtener el estado del usuario
            const state = bot.database;
            // Necesitarías adaptar esta parte según tu estructura
            // La idea es verificar el estado ANTES de que el flujo lo procese
            
        } catch (error) {
            console.error('❌ Error en middleware global:', error);
        }
    });
}

// =====================================================================================
// MIDDLEWARE GLOBAL DE BLOQUEO - AGREGAR AL INICIO DE CADA FLUJO IMPORTANTE
// =====================================================================================
const bloqueoMiddleware = async (ctx: any, { state, flowDynamic, gotoFlow }: any, next: () => Promise<any>) => {
    if (ctx.from === CONTACTO_ADMIN) {
        return next();
    }

    // Verificar si el usuario está en proceso largo
    const bloqueado = await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow });
    
    if (bloqueado) {
        // Si está bloqueado, no continuar con el flujo normal
        return;
    }
    
    // Si no está bloqueado, continuar con el flujo
    return next();
};

async function guardarEstadoMySQL(userPhone: string, estado: string, metadata = {}, userData = {}) {
    console.log(`💾 Guardando estado para: ${userPhone} - ${estado}`)

    try {
        // Guardar en base de datos local
        await consultarBotWhatsapp(
            'INSERT INTO estados_usuarios (user_phone, estado, metadata, user_data, timestamp) VALUES (?, ?, ?, ?, NOW()) ' +
            'ON DUPLICATE KEY UPDATE estado = ?, metadata = ?, user_data = ?, timestamp = NOW()',
            [
                userPhone,
                estado,
                JSON.stringify(metadata),
                JSON.stringify(userData),
                estado,
                JSON.stringify(metadata),
                JSON.stringify(userData)
            ]
        );
        return true;
    } catch (error) {
        console.error('❌ Error guardando estado en MySQL:', error.message);
        return false;
    }
}

async function limpiarEstadoMySQL(userPhone: string) {
    console.log(`🧹 Limpiando estado MySQL para: ${userPhone}`)

    try {
        await consultarBotWhatsapp(
            'DELETE FROM estados_usuarios WHERE user_phone = ?',
            [userPhone]
        );
        return true;
    } catch (error) {
        console.error('❌ Error limpiando estado en MySQL:', error.message);
        return false;
    }
}

// ==== FUNCIÓN ENVIAR AL ADMIN MEJORADA CON SINGLETON ====
async function enviarAlAdmin(mensaje: string, maxIntentos: number = 3): Promise<boolean> {
    for (let intento = 1; intento <= maxIntentos; intento++) {
        try {
            console.log(`📤 [Intento ${intento}/${maxIntentos}] Enviando al administrador...`)

            const bot = BotSingleton.getInstance()

            if (!bot) {
                console.error('❌ Singleton: Bot no disponible en singleton')
                if (intento === 1) {
                    console.log('🔄 Intentando obtener bot...')
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * intento))
                continue
            }

            if (!bot.provider) {
                console.error('❌ Provider no disponible en el bot singleton')
                continue
            }

            // Enviar mensaje usando el provider del bot
            await bot.provider.sendText(CONTACTO_ADMIN, mensaje)
            console.log(`✅ Mensaje enviado al admin: ${CONTACTO_ADMIN}`)
            return true

        } catch (error: any) {
            console.error(`❌ Error en intento ${intento}:`, error.message)

            if (intento < maxIntentos) {
                console.log(`🔄 Reintentando en ${intento * 2} segundos...`)
                await new Promise(resolve => setTimeout(resolve, intento * 2000))
            }
        }
    }

    console.error(`❌ Falló después de ${maxIntentos} intentos`)
    return false
}

// ==== FUNCIÓN PARA DETECTAR SALUDOS VÁLIDOS ====
function esSaludoValido(texto: string): boolean {
    if (!texto || typeof texto !== 'string') return false

    const textoLimpio = texto.toLowerCase().trim()
    const saludos = [
        'hola', 'ole', 'alo', 'inicio', 'Inicio', 'comenzar', 'empezar',
        'buenos días', 'buenas tardes', 'buenas noches',
        'buenos dias', 'buenas tardes', 'buenas noches',
        'hola.', 'hola!', 'hola?', 'ayuda', 'Hola', '.', 'Holi', 'holi', 'holis', 'Holis', 'holaa', 'Holaa', 'holaaa', 'Holaaa',
        'holaaaa', 'Holaaaa', 'holaaaaa', 'Holaaaaa', 'holaaaaaa', 'Holaaaaaa',
        'holaaaaaaa', 'Holaaaaaaa', 'holaaaaaaaa', 'Holaaaaaaaa', 'Holi!', 'Holi.', 'Holi?', 'holi!', 'holi.', 'holi?',
        'ciapagos', 'cía pagos', 'cía-pagos', 'cía/pagos',
        'problema con cia pagos', 'no puedo acceder a cia pagos',
        'error en cia pagos', 'portal de pagos', 'pagos en línea',
        'problema con el portal de pagos', 'cía pagos no funciona',
        'Hola buenas tardes, tengo un problema con cia pagos',
        'Hola buenos días, no puedo acceder a cia pagos',
        'Hola buenas noches, el portal de cia pagos no me deja entrar',
        'buenos días, tengo un problema', 'buenas tardes, tengo un problema',
        'buenas noches, tengo un problema', 'buenos días tengo un problema',
        'buenas tardes tengo un problema', 'buenas noches tengo un problema',
        'tengo un problema', 'necesito ayuda', 'ayuda', 'tengo un problema con mi cuenta',
        'no puedo acceder a mi cuenta', 'problema con mi cuenta', 'problema con mi acceso',
        'Hola buenas tardes necesito restablecer contraseña del correo institucional',
        'Hola buenas noches necesito restablecer contraseña del correo institucional',
        'Hola buenos días necesito restablecer contraseña del correo institucional',
        'Hola buenas tardes necesito restablecer autenticador',
        'Hola buenas noches necesito restablecer autenticador',
        'Hola buenos días necesito restablecer autenticador',
        'Hola buenas tardes mi cuenta me está solicitando un código de seguridad',
        'Hola buenas noches mi cuenta me está solicitando un código de seguridad',
        'Hola buenos días mi cuenta me está solicitando un código de seguridad',
        'Hola buenas tardes no puedo acceder a mi cuenta',
        'Hola buenas noches no puedo acceder a mi cuenta',
        'Hola buenos dias, cambie de celular y no puedo acceder a mi cuenta',
        'Hola buenas tardes, cambie de celular y no puedo acceder a mi cuenta',
        'Hola buenas noches, cambie de celular y no puedo acceder a mi cuenta',
        'Hola buenas tardes, tengo un problema con mi cuenta',
        'Hola buenas noches, tengo un problema con mi cuenta',
        'Hola buenos días, tengo un problema con mi cuenta',
        'hola buenas tardes, disculpa, no me deja ingresar a mi correo institucional',
        'hola buenas noches, disculpa, no me deja ingresar a mi correo institucional',
        'hola buenos días, disculpa, no me deja ingresar a mi correo institucional',
        'Hola buenas tardes, tengo un problema con el acceso a mi cuenta',
        'Hola buenas noches, tengo un problema con el acceso a mi cuenta',
        'Hola buenos días, tengo un problema con el acceso a mi cuenta',
        'Hola buenas tardes, necesito ayuda con mi cuenta',
        'Hola buenas noches, necesito ayuda con mi cuenta',
        'Hola buenos días, necesito ayuda con mi cuenta',
        'hola buenas tardes, disculpa, no me deja ingresar a mi correo institucional por mi contraseña como lo puedo restablecer?',
        'hola buenas noches, disculpa, no me deja ingresar a mi correo institucional por mi contraseña como lo puedo restablecer?',
        'hola buenos días, disculpa, no me deja ingresar a mi correo institucional por mi contraseña como lo puedo restablecer?',
        'Hola buenas tardes, necesito ayuda con el acceso a mi cuenta',
        'Hola buenas noches, necesito ayuda con el acceso a mi cuenta',
        'Hola buenos días, necesito ayuda con el acceso a mi cuenta',
        'Problemas con el autenticador', 'Problema con el autenticador',
        'problemas con la contraseña', 'problema con la contraseña',
        'problemas con el acceso', 'problema con el acceso',
        'no conozco mi correo', 'no sé mi correo', 'no recuerdo mi correo',
        'no conozco mi contraseña', 'no sé mi contraseña', 'no recuerdo mi contraseña',
        'no conozco mis credenciales', 'no sé mis credenciales', 'no recuerdo mis credenciales',
        'cuál es mi correo', 'cual es mi correo', 'dime mi correo',
        'cuál es mi contraseña', 'cual es mi contraseña', 'dime mi contraseña',
        'cuáles son mis credenciales', 'cuales son mis credenciales', 'dime mis credenciales', 'Hola!, tengo un problema',
        'Hola!, tengo un problema. ¿Me pueden ayudar por favor?'
    ]

    // Verificar coincidencia exacta
    for (const saludo of saludos) {
        if (textoLimpio === saludo.toLowerCase().trim()) return true
    }

    // Verificar si contiene algún saludo
    for (const saludo of saludos) {
        if (textoLimpio.includes(saludo.toLowerCase().trim())) return true
    }

    const palabrasClave = [
        'hola', 'Hola', 'problema', 'ayuda', 'cuenta', 'acceso',
        'contraseña', 'autenticador', 'disculpa', 'restablecer',
        'configurar', 'soporte', 'ayudar', 'asistencia', 'ciapagos', 'pagos'
    ]

    // Verificar si contiene palabras clave
    return palabrasClave.some(palabra => textoLimpio.includes(palabra))
}

// ==== FUNCIÓN PARA MOSTRAR OPCIONES DEL MENÚ ====
async function mostrarOpcionesMenu(flowDynamic: any) {
    await flowDynamic([
        '📋 *MENÚ PRINCIPAL* 📋',
        '',
        'Te recomiendo que tengas tu credencial a la mano para agilizar el proceso. Se te solicitará para validar tu identidad al momento de restablecer tu contraseña o autenticador.\n',
        'Selecciona una opción:',
        '',
        '1️⃣ 🔐 Restablecer contraseña del correo institucional',
        '2️⃣ 🔑 Restablecer autenticador del correo institucional',
        '3️⃣ 🎓 Educación a Distancia (Moodle)',
        '4️⃣ 📊 Sistema SIE',
        '5️⃣ 🙏 Información adicional',
        '6️⃣ ❓ ¿No conoces tu correo institucional ni tu contraseña?',
        //'7️⃣ 👨‍💼 Gestión de Servicios (Exclusivo Trabajadores)',
        //'8️⃣ 🗃️ Acceso a Base de Datos Actextita',
        '9️⃣ 🏦 Problema para acceder al portal de CIAPAGOS',
        '',
        '💡 *Escribe solo el número (1-9)*'
    ].join('\n'))
}

// ==== FUNCION PARA PROCESAR OPCIONES ====================
async function procesarOpcionMenu(opcion: string, flowDynamic: any, gotoFlow: any, state: any) {
    console.log('🎯 Procesando opción:', opcion)
    await limpiarEstado(state)

    console.log(`🎯 Procesando opción ${opcion} para ${state.id}`);
    const estadoAntes = await state.getMyState();
    console.log(`🔍 Estado ANTES de procesar:`, estadoAntes);

    switch (opcion) {
        case '1':
            await flowDynamic('🔐 Iniciando proceso de restablecimiento de contraseña... \n\n En este proceso podrás restablecer la contraseña con la que ingresas a tu cuenta institucional, recuerda que tu contraseña es tu primer nivel de seguridad ante un hackeo.')
            console.log('🚀 Redirigiendo a flowSubMenuContrasena')
            await limpiarEstado(state)
            return gotoFlow(flowSubMenuContrasena)

        case '2':
            await flowDynamic('🔑 Iniciando proceso de autenticador... \n\n En este proceso podrás restablecer el autenticador (Número de teléfono o aplicación de autenticación) con la que ingresas a tu cuenta institucional, recuerda que tu contraseña es tu segundo nivel de seguridad ante un hackeo.')
            console.log('🚀 Redirigiendo a flowSubMenuAutenticador')
            await limpiarEstado(state)
            return gotoFlow(flowSubMenuAutenticador)

        case '3':
            await flowDynamic('🎓 Redirigiendo a Educación a Distancia...')
            console.log('🚀 Redirigiendo a flowDistancia')
            await limpiarEstado(state)
            return gotoFlow(flowDistancia)

        case '4':
            await flowDynamic('📊 Redirigiendo al Sistema SIE...')
            console.log('🚀 Redirigiendo a flowSIE')
            await limpiarEstado(state)
            return gotoFlow(flowSIE)

        case '5':
            await flowDynamic('🙏 Redirigiendo a información adicional...')
            console.log('🚀 Redirigiendo a flowInfoAdicional')
            await limpiarEstado(state)
            return gotoFlow(flowInfoAdicional)

        case '6':
            await flowDynamic('❓ Redirigiendo a información de credenciales...')
            console.log('🚀 Redirigiendo a flowInfoCredenciales')
            await limpiarEstado(state)
            return gotoFlow(flowInfoCredenciales)

        case '7':
            await flowDynamic('👨‍💼 Redirigiendo a Gestión de Servicios...\n\n🔗 *Conectando a base de datos*')
            console.log('🚀 Redirigiendo a flowGestionServicios')
            await limpiarEstado(state)
            return gotoFlow(flowGestionServicios)

        case '8':
            await flowDynamic('🗃️ Conectando a Base de Datos Actextita...')
            console.log('🚀 Redirigiendo a flowConexionBaseDatos')
            await limpiarEstado(state)
            return gotoFlow(flowConexionBaseDatos)

        case '9':
            await flowDynamic('🏦 Redirigiendo a problemas con CIAPAGOS...')
            console.log('🚀 Redirigiendo a flowCiaPagos')
            // IMPORTANTE: Limpiar estado completamente antes de ir a CIAPAGOS
            await limpiarEstado(state)
            await state.update({
                estadoUsuario: ESTADOS_USUARIO.LIBRE,
                tipoProceso: 'CIAPAGOS'
            })
            return gotoFlow(flowCiaPagos)

        default:
            await flowDynamic('❌ Opción no válida. Por favor escribe *1*, *2*, *3*, *4*, *5*, *6*, *7*, *8* o *9*.')
            return gotoFlow(flowMenu)
    }
}

// =====================================================================================
// FLUJO PRINCIPAL ÚNICO (MEJORADO)
// =====================================================================================
const flowPrincipal = addKeyword<Provider, Database>([''])
    .addAction(async (ctx, { flowDynamic, gotoFlow, state }) => {
        const input = ctx.body?.toLowerCase().trim();
        console.log(`📥 Mensaje recibido: "${input}" de ${ctx.from}`);

        // PRIMERO: Verificar si el usuario está en proceso largo
        const myState = await state.getMyState();
        
        if (myState?.estadoUsuario === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
            console.log(`🔒 Usuario ${ctx.from} en proceso largo, redirigiendo a flowBloqueoActivo`);
            return gotoFlow(flowBloqueoActivo);
        }

        // PRIMERO Y MÁS IMPORTANTE: Manejar el comando "menu" desde CUALQUIER lugar
        if (input === 'menu' || input === 'menú') {
            console.log(`📋 Comando de menú detectado GLOBALMENTE: "${input}"`);
            await limpiarEstado(state);
            await mostrarOpcionesMenu(flowDynamic);
            return;
        }

        if (myState?.estadoUsuario === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
            console.log(`🔒 Usuario ${ctx.from} en proceso largo`);

            if (input === 'estado') {
                const metadata = myState.estadoMetadata || {};
                const tiempoTranscurrido = Date.now() - (metadata.ultimaActualizacion || Date.now());
                const minutosTranscurridos = Math.floor(tiempoTranscurrido / 60000);
                const minutosRestantes = Math.max(0, 30 - minutosTranscurridos);

                await flowDynamic([
                    '📊 **Estado del Proceso**',
                    '',
                    `📋 ${metadata.tipo || 'Proceso en curso'}`,
                    `⏰ Tiempo transcurrido: ${minutosTranscurridos} min`,
                    `⏳ Tiempo restante: ${minutosRestantes} min`,
                    '',
                    '🔄 El proceso continúa en segundo plano...',
                    '',
                    '⏰ Se completará automáticamente.'
                ].join('\n'));
            } else if (input) {
                await flowDynamic([
                    '⏳ *Proceso en curso* ⏳',
                    '',
                    '📋 Tu solicitud está siendo procesada activamente...',
                    '',
                    '🔄 **No es necesario que escribas nada**',
                    '⏰ El proceso continuará automáticamente',
                    '',
                    '💡 **Solo escribe:**',
                    '*estado* - Para ver el progreso actual',
                    '',
                    '¡Gracias por tu paciencia! 🙏'
                ].join('\n'));
            }
            return;
        }

        // TERCERO: Verificar si es un saludo válido
        if (esSaludoValido(input)) {
            console.log(`✅ Saludo detectado: "${input}"`);
            await limpiarEstado(state);

            try {
                await flowDynamic([{
                    body: '🎉 ¡Bienvenido al bot de Centro de Cómputo del ITA!',
                    media: 'https://raw.githubusercontent.com/CapYAN09/ProyectosITA/main/img/Imagen_de_WhatsApp_2025-09-05_a_las_11.03.34_cdb84c7c-removebg-preview.png'
                }]);
            } catch (error) {
                await flowDynamic('🎉 ¡Bienvenido al *AguiBot* del ITA!');
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
            await mostrarOpcionesMenu(flowDynamic);
            return;
        }

        // CUARTO: Verificar si es una opción del menú (1-9)
        if (/^[1-9]$/.test(input)) {
            console.log(`🎯 Opción del menú detectada: "${input}"`);
            await procesarOpcionMenu(input, flowDynamic, gotoFlow, state);
            return;
        }

        // QUINTO: Verificar si es "doc"
        if (input === 'doc') {
            return gotoFlow(discordFlow);
        }

        // SEXTO: Si el usuario ya estaba en CIAPAGOS pero no seleccionó una opción válida
        // o si está "perdido" después de CIAPAGOS
        if (myState?.tipoProceso === 'CIAPAGOS') {
            console.log(`🔍 Usuario estaba en CIAPAGOS pero envió: "${input}"`);

            if (input === '1' || input === '2') {
                // Si envía 1 o 2 de nuevo, procesarlo
                if (input === '1') {
                    await flowDynamic([
                        '✅ ¡Excelente! Nos alegra que hayas podido resolver tu problema.',
                        '',
                        '🔙 Escribe *menú* para volver al menú principal.'
                    ].join('\n'));
                } else if (input === '2') {
                    await flowDynamic([
                        '❌ Lamentamos que no hayas podido resolver tu problema.',
                        '',
                        '📧 **Envía un correo a:** cccomputo@aguascalientes.tecnm.mx',
                        '',
                        '🔙 Escribe *menú* para volver al menú principal.'
                    ].join('\n'));
                }
                return;
            }
        }

        // Si no se entiende el mensaje, mostrar ayuda
        await flowDynamic([
            '🤖 No entiendo ese mensaje.',
            '',
            '💡 **Para comenzar, escribe:**',
            '• *hola* - Iniciar conversación',
            '• *inicio* - Ver menú principal',
            '• *menu* - Ver opciones disponibles',
            '',
            '📋 **O selecciona una opción directa:**',
            '1️⃣ Restablecer contraseña',
            '2️⃣ Configurar autenticador',
            '3️⃣ Educación a Distancia',
            '4️⃣ Sistema SIE',
            '5️⃣ Información adicional',
            '6️⃣ No conozco mis credenciales',
            '9️⃣ Problema para acceder al portal de CIAPAGOS',
            '',
            '💡 *Escribe solo el número (1-9)*',
            '',
            '🔙 Escribe *hola* para comenzar.'
        ].join('\n'));
    });

// =====================================================================================
// SUBMENÚ PARA OPCIÓN 1 - RESTABLECER CONTRASEÑA
// =====================================================================================
const flowSubMenuContrasena = addKeyword<Provider, Database>(utils.setEvent('SUBMENU_CONTRASENA'))
    .addAnswer(
        '🔑 *RESTABLECIMIENTO DE CONTRASEÑA*\n\n' +
        'Una vez comenzado este proceso no podrá ser detenido hasta completarse.\n\n' +
        '👥 *Selecciona tu tipo de usuario:*\n\n' +
        '1️⃣ ¿Eres un estudiante?\n' +
        '2️⃣ ¿Eres un trabajador o docente?\n\n' +
        '🔙 Escribe *menú* para volver al menú principal.',
        { capture: true },
        async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
            ctx.from = normalizarIdWhatsAppBusiness(ctx.from)
            if (ctx.from === CONTACTO_ADMIN) return

            const opcion = ctx.body.trim().toLowerCase()

            if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
                return // No continuar si está bloqueado
            }

            if (opcion === 'menu' || opcion === 'menú') {
                return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic)
            }

            if (opcion === '1') {
                await flowDynamic('🎓 Perfecto, eres alumno. Vamos a comenzar con el proceso...')
                await state.update({ esTrabajador: false, tipoProceso: 'CONTRASENA' })
                return gotoFlow(flowCapturaNumeroControl)
            }

            if (opcion === '2') {
                await flowDynamic('👨‍💼 Perfecto, eres trabajador. Vamos a comenzar con el proceso...')
                await state.update({ esTrabajador: true, tipoProceso: 'CONTRASENA' })
                return gotoFlow(flowCapturaCorreoTrabajador)
            }

            await flowDynamic('❌ Opción no válida. Escribe *1* o *2*.')
            return gotoFlow(flowSubMenuContrasena)
        }
    )

// =====================================================================================
// FLUJO DE CAPTURA DE CORREO PARA TRABAJADOR
// =====================================================================================
const flowCapturaCorreoTrabajador = addKeyword<Provider, Database>(utils.setEvent('CAPTURA_CORREO_TRABAJADOR'))
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        const userPhone = ctx.from

        timeoutManager.setTimeout(userPhone, async () => {
            try {
                console.log('⏱️ Timeout de 2 minutos en correo trabajador')
                await flowDynamic('⏱️ No recibimos tu correo. Serás redirigido al menú.')
                await limpiarEstado(state)
                return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic)
            } catch (error) {
                console.error('❌ Error en timeout de captura:', error)
            }
        }, 2 * 60 * 1000)
    })
    .addAnswer(
        '📝 Por favor escribe tu *correo institucional* (ejemplo: nombre.apellido@aguascalientes.tecnm.mx):',
        { capture: true },
        async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
            ctx.from = normalizarIdWhatsAppBusiness(ctx.from)
            if (ctx.from === CONTACTO_ADMIN) return

            timeoutManager.clearTimeout(ctx.from)

            const input = ctx.body.trim().toLowerCase()

            if (input === 'menu' || input === 'menú') {
                await limpiarEstado(state)
                return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic)
            }

            if (!input || input === '') {
                await flowDynamic('❌ No recibimos tu correo. Por favor escríbelo.')
                return gotoFlow(flowCapturaCorreoTrabajador)
            }

            if (!isValidText(input) || !validarCorreoTrabajador(input)) {
                await flowDynamic('❌ Correo institucional inválido. Debe ser: nombre.apellido@aguascalientes.tecnm.mx\nIntenta de nuevo o escribe *menú* para volver.')
                return gotoFlow(flowCapturaCorreoTrabajador)
            }

            await state.update({
                correoInstitucional: input,
                esTrabajador: true
            })
            await flowDynamic(`✅ Recibimos tu correo institucional: *${input}*`)

            timeoutManager.clearTimeout(ctx.from)
            return gotoFlow(flowCapturaNombre)
        }
    )

// =====================================================================================
// FLUJO DE CAPTURA DE NÚMERO DE CONTROL
// =====================================================================================
const flowCapturaNumeroControl = addKeyword<Provider, Database>(utils.setEvent('CAPTURA_NUMERO_CONTROL'))
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        const userPhone = ctx.from

        timeoutManager.setTimeout(userPhone, async () => {
            try {
                console.log('⏱️ Timeout de 2 minutos en número de control')
                await flowDynamic('⏱️ No recibimos tu número de control. Serás redirigido al menú.')
                await limpiarEstado(state)
                return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic)
            } catch (error) {
                console.error('❌ Error en timeout de captura:', error)
            }
        }, 2 * 60 * 1000)
    })
    .addAnswer(
        '📝 Por favor escribe tu *número de control*:',
        { capture: true },
        async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
            ctx.from = normalizarIdWhatsAppBusiness(ctx.from)
            if (ctx.from === CONTACTO_ADMIN) return

            timeoutManager.clearTimeout(ctx.from)

            const input = ctx.body.trim().toLowerCase()

            if (input === 'menu' || input === 'menú') {
                await limpiarEstado(state)
                return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic)
            }

            if (!input || input === '') {
                await flowDynamic('❌ No recibimos tu número de control. Por favor escríbelo.')
                return gotoFlow(flowCapturaNumeroControl)
            }

            if (!isValidText(input) || !validarNumeroControl(input)) {
                await flowDynamic('❌ Número de control inválido. Intenta de nuevo o escribe *menú* para volver.')
                return gotoFlow(flowCapturaNumeroControl)
            }

            await state.update({ numeroControl: input })
            await flowDynamic(`✅ Recibimos tu número de control: *${input}*`)

            timeoutManager.clearTimeout(ctx.from)
            return gotoFlow(flowCapturaNombre)
        }
    )

// =====================================================================================
// FLUJO DE CAPTURA DE NOMBRE
// =====================================================================================
const flowCapturaNombre = addKeyword<Provider, Database>(utils.setEvent('CAPTURA_NOMBRE'))
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        const userPhone = ctx.from

        timeoutManager.setTimeout(userPhone, async () => {
            try {
                console.log('⏱️ Timeout de 2 minutos en nombre completo')
                await flowDynamic('⏱️ No recibimos tu nombre completo. Serás redirigido al menú.')
                await limpiarEstado(state)
                return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic)
            } catch (error) {
                console.error('❌ Error en timeout de captura:', error)
            }
        }, 2 * 60 * 1000)
    })
    .addAnswer(
        '📝 Por favor escribe tu *nombre completo*:',
        { capture: true },
        async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
            ctx.from = normalizarIdWhatsAppBusiness(ctx.from)
            if (ctx.from === CONTACTO_ADMIN) return

            timeoutManager.clearTimeout(ctx.from)

            const input = ctx.body.trim()

            if (!input || input === '') {
                await flowDynamic('❌ No recibimos tu nombre completo. Por favor escríbelo.')
                return gotoFlow(flowCapturaNombre)
            }

            if (!isValidText(input) || !/^[a-zA-ZÁÉÍÓÚÑáéíóúñ\s]+$/.test(input)) {
                await flowDynamic('❌ Solo texto válido. Escribe tu *nombre completo*.')
                return gotoFlow(flowCapturaNombre)
            }

            if (input.length < 3) {
                await flowDynamic('❌ El nombre parece muy corto. Escribe tu *nombre completo* real.')
                return gotoFlow(flowCapturaNombre)
            }

            const myState = (await state.getMyState()) || {}
            const identificacion = myState.esTrabajador ? myState.correoInstitucional : myState.numeroControl
            const tipoProceso = myState.tipoProceso || ''

            await flowDynamic(`🙌 Gracias, *${input}*.\n✅ Registramos tu identificación: *${identificacion}*`)
            await state.update({ nombreCompleto: input })

            timeoutManager.clearTimeout(ctx.from)

            // Verificar si es proceso SIE (no requiere identificación)
            if (tipoProceso === 'SIE') {
                console.log('🚀 Proceso SIE detectado, redirigiendo a flowFinSIE')
                return gotoFlow(flowFinSIE)
            }

            // Para otros procesos (CONTRASENA, AUTENTICADOR), ir a identificación
            return gotoFlow(flowCapturaIdentificacion)
        }
    )

// =====================================================================================
// FLUJO DE CAPTURA DE IDENTIFICACIÓN (FOTO)
// =====================================================================================
const flowCapturaIdentificacion = addKeyword<Provider, Database>(utils.setEvent('CAPTURA_IDENTIFICACION'))
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        const userPhone = ctx.from

        timeoutManager.setTimeout(userPhone, async () => {
            try {
                console.log('⏱️ Timeout de 4 minutos en identificación')
                await flowDynamic('⏱️ No recibimos tu identificación en 4 minutos. Serás redirigido al menú.')
                await limpiarEstado(state)
                return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic)
            } catch (error) {
                console.error('❌ Error en timeout de captura:', error)
            }
        }, 4 * 60 * 1000)
    })
    .addAnswer(
        [
            '📸 *Verificación de Identidad - Toma la foto AHORA* 📸',
            '',
            'Es importante que solamente respondas con la fotografía de tu credencial escolar del ITA. No envíes mensajes de texto ni otros tipos de archivos. \nEn caso de no contar con tu credencial escolar, puedes enviar una identificación oficial vigente con fotografía (INE, pasaporte, cédula profesional, etc.)',
            '',
            '⚠️ **IMPORTANTE PARA FOTOS DESDE WHATSAPP:**',
            '• Usa la cámara de tu celular, NO la computadora',
            '• Toca el ícono de 📎 (clip)',
            '• Selecciona "Cámara" o "Camera"',
            '• Toma una foto NUEVA de tu credencial',
            '• Asegúrate de que sea CLARA y legible',
            '',
            '⏰ **Tienes 4 minutos** para enviar la fotografía'
        ].join('\n'),
        { capture: true },
        async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
            ctx.from = normalizarIdWhatsAppBusiness(ctx.from)
            if (ctx.from === CONTACTO_ADMIN) return

            timeoutManager.clearTimeout(ctx.from)

            if (!esImagenValida(ctx)) {
                await flowDynamic([
                    '❌ *No recibimos una fotografía válida*',
                    '',
                    '⚠️ **Para WhatsApp Web/Desktop:**',
                    '1. Usa tu CELULAR para tomar la foto',
                    '2. Toca el clip 📎 en WhatsApp',
                    '3. Selecciona "Cámara" (NO "Galería")',
                    '4. Toma foto NUEVA de tu credencial',
                    '5. Envíala directamente',
                    '',
                    '🔄 **Intenta de nuevo por favor.**'
                ].join('\n'))

                return gotoFlow(flowCapturaIdentificacion)
            }

            await state.update({
                identificacionSubida: true,
                timestampIdentificacion: Date.now(),
                fotoEnVivo: true
            })

            await flowDynamic('✅ *¡Perfecto! Foto tomada correctamente con la cámara*\n\n📋 Continuando con el proceso...')

            // Obtener el estado actualizado
            const myState = await state.getMyState()

            // Determinar a dónde redirigir basado en el tipo de proceso
            const tipoProceso = myState.tipoProceso || ''

            console.log('🔍 Tipo proceso detectado:', tipoProceso)

            // REGLA CLARA DE REDIRECCIÓN:
            if (tipoProceso === 'AUTENTICADOR') {
                console.log('🚀 Redirigiendo a flowAutenticador (tipo: AUTENTICADOR)')
                return gotoFlow(flowAutenticador)
            } else if (tipoProceso === 'SIE') {
                console.log('🚀 Redirigiendo a flowFinSIE (tipo: SIE)')
                // Para SIE, vamos directamente al flujo final sin necesitar identificación
                return gotoFlow(flowFinSIE)
            } else {
                // Por defecto, ir al flow de contraseña (CONTRASENA o cualquier otro)
                console.log('🚀 Redirigiendo a flowContrasena (tipo por defecto)')
                return gotoFlow(flowContrasena)
            }
        }
    )

// =====================================================================================
// FLUJO FINAL DE CONTRASEÑA (VERSIÓN CORREGIDA)
// =====================================================================================
const flowContrasena = addKeyword<Provider, Database>(utils.setEvent('FLOW_CONTRASENA'))
    .addAction(async (ctx, { state, flowDynamic, provider, gotoFlow }) => {
        ctx.from = normalizarIdWhatsAppBusiness(ctx.from);
        
        // 1. VERIFICAR SI ES ADMIN
        if (ctx.from === CONTACTO_ADMIN) return;
        
        // 2. VERIFICAR SI YA ESTÁ BLOQUEADO (IMPORTANTE: Esto debe ir PRIMERO)
        const bloqueado = await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow });
        if (bloqueado) {
            console.log(`🚫 Usuario ${ctx.from} ya está bloqueado, no iniciar nuevo proceso`);
            return; // No continuar si ya está bloqueado
        }
        
        // 3. VERIFICAR DATOS COMPLETOS
        const myState = await state.getMyState();
        const nombreCompleto = myState.nombreCompleto;
        const esTrabajador = myState.esTrabajador || false;
        const identificacion = esTrabajador ? myState.correoInstitucional : myState.numeroControl;

        if (!nombreCompleto || !identificacion) {
            console.log(`❌ Datos incompletos para ${ctx.from}: nombre=${nombreCompleto}, identificación=${identificacion}`);
            await flowDynamic('❌ Información incompleta. Volviendo al inicio.');
            return gotoFlow(flowMenu);
        }

        console.log(`🚀 Iniciando proceso de contraseña para ${ctx.from}: ${nombreCompleto}`);

        // 4. VERIFICAR CONEXIONES ANTES DE BLOQUEAR
        const estadoConexiones = obtenerEstadoConexiones();
        const conexionRemota = await verificarConexionRemota();
        
        if (!conexionRemota) {
            await flowDynamic([
                '❌ *Error de conexión*',
                '',
                'No se pudo establecer conexión con el sistema remoto.',
                '',
                '🔄 Por favor intenta nuevamente en unos minutos.',
                '🔙 Escribe *menú* para volver al menú principal.'
            ].join('\n'));
            return;
        }

        // 5. **BLOQUEAR AL USUARIO INMEDIATAMENTE** (esto es lo más importante)
        await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
            tipo: "🔐 Restablecimiento de Contraseña",
            inicio: Date.now(),  // Guardar tiempo exacto de inicio
            esTrabajador: esTrabajador,
            identificacion: identificacion,
            timestampBloqueo: Date.now()
        });

        // 6. Guardar en base de datos
        await guardarEstadoMySQL(ctx.from, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
            tipo: "Restablecimiento de Contraseña",
            inicio: Date.now(),
            identificacion: identificacion
        }, {
            numeroControl: myState.numeroControl,
            nombreCompleto: myState.nombreCompleto,
            identificacionSubida: myState.identificacionSubida,
            timestampIdentificacion: myState.timestampIdentificacion
        });

        // 7. NOTIFICAR AL ADMINISTRADOR
        const tipoUsuario = esTrabajador ? "Trabajador" : "Alumno";
        const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE RESTABLECIMIENTO DE CONTRASEÑA* 🔔\n\n📋 *Información:*\n👤 Nombre: ${nombreCompleto}\n👥 Tipo: ${tipoUsuario}\n📧 ${esTrabajador ? 'Correo' : 'Número de control'}: ${identificacion}\n📞 Teléfono: ${ctx.from}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n🔐 Contraseña temporal: *SoporteCC1234$*\n\n💾 *Estados de conexión:*\n• MySQL: ${estadoConexiones.mysql}\n• Actextita: ${estadoConexiones.actextita}\n• Sistematickets: ${estadoConexiones.sistematickets}\n\n⚠️ Usuario BLOQUEADO por 30 minutos`;

        const enviado = await enviarAlAdmin(mensajeAdmin);
        if (!enviado) {
            console.error(`⚠️ No se pudo notificar al admin sobre: ${ctx.from} - ${nombreCompleto}`);
        }

        // 8. CONFIGURAR TIMEOUT DE 30 MINUTOS
        const userPhone = ctx.from;
        
        // Limpiar timeouts previos (por seguridad)
        timeoutManager.clearTimeout(userPhone);
        timeoutManager.clearInterval(userPhone);

        // Timeout para finalizar el proceso
        const timeoutId = timeoutManager.setTimeout(userPhone, async () => {
            try {
                console.log(`⏰ Timeout completado para ${userPhone}, enviando mensaje final...`);
                
                const correoUsuario = esTrabajador ? identificacion : `${identificacion}@aguascalientes.tecnm.mx`;

                await flowDynamic([
                    '✅ *¡Contraseña restablecida exitosamente!* ✅',
                    '',
                    '📋 **Tu nueva contraseña temporal:**',
                    '🔐 *SoporteCC1234$*',
                    '',
                    '💡 **Instrucciones para acceder:**',
                    '1. Cierra sesiones anteriores del correo',
                    '2. Ingresa a: https://office.com',
                    '3. Usa tu correo: ' + correoUsuario,
                    '4. Contraseña temporal: *SoporteCC1234$*',
                    '5. Te pedirá cambiar la contraseña inmediatamente',
                    '',
                    '🔒 **Recomendaciones de seguridad:**',
                    '• Mínimo 11 caracteres',
                    '• Usa mayúsculas, minúsculas, números y símbolos',
                    '• No la compartas con nadie',
                    '',
                    '🔙 Escribe *menú* para volver al menú principal.'
                ].join('\n'));

            } catch (error: any) {
                console.error('❌ Error en finalización de contraseña:', error.message);
                await flowDynamic('✅ Se ha completado el proceso. Por favor verifica tu correo institucional.');
            }

            // LIMPIAR TODO AL TERMINAR
            await limpiarEstado(state);
            await limpiarEstadoMySQL(userPhone);
            timeoutManager.clearAll(userPhone);

        }, 30 * 60 * 1000); // 30 minutos exactos

        // 9. CONFIGURAR INTERVALO PARA NOTIFICACIONES (cada 5 minutos)
        const intervalId = timeoutManager.setInterval(userPhone, async () => {
            try {
                const estadoActual = await state.getMyState();
                if (!estadoActual || estadoActual.estadoUsuario !== ESTADOS_USUARIO.EN_PROCESO_LARGO) {
                    timeoutManager.clearInterval(userPhone);
                    return;
                }

                const metadata = estadoActual.estadoMetadata || {};
                const tiempoTranscurrido = Date.now() - (metadata.inicio || Date.now());
                const minutosTranscurridos = Math.floor(tiempoTranscurrido / 60000);
                const minutosRestantes = Math.max(0, 30 - minutosTranscurridos);

                // Solo enviar notificación cada 5 minutos
                if (minutosTranscurridos > 0 && minutosTranscurridos % 5 === 0) {
                    await flowDynamic(`⏳ *Actualización:* ${minutosTranscurridos} min transcurridos, ${minutosRestantes} min restantes.`);
                }

                // Si ya pasaron 30 minutos, limpiar
                if (minutosTranscurridos >= 30) {
                    timeoutManager.clearInterval(userPhone);
                }
            } catch (error) {
                console.error('❌ Error en notificación periódica:', error);
            }
        }, 60 * 1000); // Verificar cada minuto

        // 10. GUARDAR IDs EN EL ESTADO
        await state.update({
            estadoMetadata: {
                ...(await state.getMyState())?.estadoMetadata,
                timeoutId: timeoutId,
                intervalId: intervalId,
                timeoutExpira: Date.now() + (30 * 60 * 1000),
                tipoProceso: 'CONTRASENA',
                userPhone: userPhone
            }
        });

        // 11. MENSAJE INICIAL DE BLOQUEO (MUY IMPORTANTE)
        await flowDynamic([
            '⏳ *¡PROCESO INICIADO - BLOQUEADO POR 30 MINUTOS!* ⏳',
            '',
            '🔒 **TU SESIÓN HA SIDO BLOQUEADA**',
            '',
            '📋 Tu solicitud está siendo procesada.',
            '⏰ **Tiempo estimado:** 30 minutos',
            '',
            '🚫 **NO PUEDES:**',
            '• Acceder al menú',
            '• Iniciar otro proceso',
            '• Cancelar esta solicitud',
            '',
            '✅ **PUEDES:**',
            '• Escribir *estado* para ver progreso',
            '',
            '🔄 El proceso es automático y continuará en segundo plano.',
            '',
            '¡Gracias por tu paciencia! 🙏'
        ].join('\n'));

        // 12. **NO HACER gotoFlow** - El usuario queda bloqueado aquí
        // El flujo principal manejará cualquier mensaje que envíe
        console.log(`✅ Usuario ${ctx.from} BLOQUEADO por 30 minutos para restablecimiento de contraseña`);
    });

// =====================================================================================
// SUBMENÚ PARA OPCIÓN 2 - RESTABLECER AUTENTICADOR
// =====================================================================================
const flowSubMenuAutenticador = addKeyword<Provider, Database>(utils.setEvent('SUBMENU_AUTENTICADOR'))
    .addAnswer(
        '🔑 *RESTABLECIMIENTO DE AUTENTICADOR*\n\n' +
        'Una vez comenzado este proceso no podrá ser detenido hasta completarse.\n\n' +
        '👥 *Selecciona tu tipo de usuario:*\n\n' +
        '1️⃣ ¿Eres un estudiante?\n' +
        '2️⃣ ¿Eres un trabajador o docente?\n\n' +
        '🔙 Escribe *menú* para volver al menú principal.',
        { capture: true },
        async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
            ctx.from = normalizarIdWhatsAppBusiness(ctx.from)
            if (ctx.from === CONTACTO_ADMIN) return

            const opcion = ctx.body.trim().toLowerCase()

            if (opcion === 'menu' || opcion === 'menú') {
                return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic)
            }

            if (opcion === '1') {
                await flowDynamic('🎓 Perfecto, eres alumno. Vamos a comenzar con el proceso...')
                await state.update({ esTrabajador: false, tipoProceso: 'AUTENTICADOR' })
                return gotoFlow(flowCapturaNumeroControl)
            }

            if (opcion === '2') {
                await flowDynamic('👨‍💼 Perfecto, eres trabajador. Vamos a comenzar con el proceso...')
                await state.update({ esTrabajador: true, tipoProceso: 'AUTENTICADOR' })
                return gotoFlow(flowCapturaCorreoTrabajador)
            }

            await flowDynamic('❌ Opción no válida. Escribe *1* o *2*.')
            return gotoFlow(flowSubMenuAutenticador)
        }
    )

// =====================================================================================
// FLUJO FINAL DE AUTENTICADOR (VERSIÓN CORREGIDA)
// =====================================================================================
const flowAutenticador = addKeyword<Provider, Database>(utils.setEvent('FLOW_AUTENTICADOR'))
    .addAction(async (ctx, { state, flowDynamic, provider, gotoFlow }) => {
        ctx.from = normalizarIdWhatsAppBusiness(ctx.from);
        
        // 1. VERIFICAR SI ES ADMIN
        if (ctx.from === CONTACTO_ADMIN) return;
        
        // 2. VERIFICAR SI YA ESTÁ BLOQUEADO (IMPORTANTE: Esto debe ir PRIMERO)
        const bloqueado = await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow });
        if (bloqueado) {
            console.log(`🚫 Usuario ${ctx.from} ya está bloqueado, no iniciar nuevo proceso`);
            return; // No continuar si ya está bloqueado
        }
        
        const myState = await state.getMyState();
        const nombreCompleto = myState.nombreCompleto;
        const esTrabajador = myState.esTrabajador || false;
        const identificacion = esTrabajador ? myState.correoInstitucional : myState.numeroControl;

        if (!nombreCompleto || !identificacion) {
            await flowDynamic('❌ Información incompleta. Volviendo al inicio.');
            return gotoFlow(flowMenu);
        }

        console.log(`🚀 Iniciando proceso de autenticador para ${ctx.from}: ${nombreCompleto}`);

        // 3. **BLOQUEAR AL USUARIO INMEDIATAMENTE**
        await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
            tipo: "🔑 Configuración de Autenticador",
            inicio: Date.now(),
            esTrabajador: esTrabajador,
            identificacion: identificacion
        });

        await guardarEstadoMySQL(ctx.from, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
            tipo: "Configuración de Autenticador",
            inicio: Date.now()
        }, {
            numeroControl: myState.numeroControl,
            nombreCompleto: myState.nombreCompleto,
            identificacionSubida: myState.identificacionSubida,
            timestampIdentificacion: myState.timestampIdentificacion
        });

        const estadoConexiones = obtenerEstadoConexiones();
        const tipoUsuario = esTrabajador ? "Trabajador" : "Alumno";
        const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE DESHABILITAR EL AUTENTICADOR* 🔔\n\n📋 *Información:*\n👤 Nombre: ${nombreCompleto}\n👥 Tipo: ${tipoUsuario}\n📧 ${esTrabajador ? 'Correo' : 'Número de control'}: ${identificacion}\n📞 Teléfono: ${ctx.from}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n\n💾 *Estados de conexión:*\n• MySQL: ${estadoConexiones.mysql}\n• Actextita: ${estadoConexiones.actextita}\n• Sistematickets: ${estadoConexiones.sistematickets}\n\n⚠️ Usuario BLOQUEADO por 30 minutos`;

        await enviarAlAdmin(mensajeAdmin);

        // 4. CONFIGURAR TIMEOUT DE 30 MINUTOS
        const userPhone = ctx.from;
        
        // Limpiar timeouts previos
        timeoutManager.clearTimeout(userPhone);
        timeoutManager.clearInterval(userPhone);

        // Timeout para finalizar el proceso
        const timeoutId = timeoutManager.setTimeout(userPhone, async () => {
            try {
                console.log(`⏰ Timeout completado para ${userPhone} (autenticador), enviando mensaje final...`);
                
                const correoUsuario = esTrabajador ? identificacion : `${identificacion}@aguascalientes.tecnm.mx`;

                await flowDynamic([
                    '✅ *Autenticador desconfigurado correctamente* ✅',
                    '',
                    '💡 **Instrucciones para reconfigurar:**',
                    '1. Cierra sesiones anteriores del correo',
                    '2. Ingresa a: https://office.com',
                    '3. Usa tu correo: ' + correoUsuario,
                    '4. Ingresa tu contraseña actual',
                    '5. Te pedirá reconfigurar tu autenticador',
                    '',
                    '📱 **Necesitarás:**',
                    '• Configurar aplicación de autenticador',
                    '• O ingresar un número de teléfono',
                    '',
                    '🔒 **Configura un nuevo método de autenticación**',
                    '',
                    '🔙 Escribe *menú* para volver al menú principal.'
                ].join('\n'));

            } catch (error: any) {
                console.error('❌ Error en finalización de autenticador:', error.message);
                await flowDynamic('✅ Se ha completado el proceso. Por favor verifica tu correo institucional.');
            }

            // LIMPIAR TODO AL TERMINAR
            await limpiarEstado(state);
            await limpiarEstadoMySQL(userPhone);
            timeoutManager.clearAll(userPhone);

        }, 30 * 60 * 1000); // 30 minutos

        // 5. CONFIGURAR INTERVALO PARA NOTIFICACIONES
        const intervalId = timeoutManager.setInterval(userPhone, async () => {
            try {
                const estadoActual = await state.getMyState();
                if (!estadoActual || estadoActual.estadoUsuario !== ESTADOS_USUARIO.EN_PROCESO_LARGO) {
                    timeoutManager.clearInterval(userPhone);
                    return;
                }

                const metadata = estadoActual.estadoMetadata || {};
                const tiempoTranscurrido = Date.now() - (metadata.inicio || Date.now());
                const minutosTranscurridos = Math.floor(tiempoTranscurrido / 60000);
                const minutosRestantes = Math.max(0, 30 - minutosTranscurridos);

                // Solo enviar notificación cada 5 minutos
                if (minutosTranscurridos > 0 && minutosTranscurridos % 5 === 0) {
                    await flowDynamic(`⏳ *Actualización autenticador:* ${minutosTranscurridos} min transcurridos, ${minutosRestantes} min restantes.`);
                }

                // Si ya pasaron 30 minutos, limpiar
                if (minutosTranscurridos >= 30) {
                    timeoutManager.clearInterval(userPhone);
                }
            } catch (error) {
                console.error('❌ Error en notificación periódica:', error);
            }
        }, 60 * 1000); // Verificar cada minuto

        // 6. GUARDAR IDs EN EL ESTADO
        await state.update({
            estadoMetadata: {
                ...(await state.getMyState())?.estadoMetadata,
                timeoutId: timeoutId,
                intervalId: intervalId,
                timeoutExpira: Date.now() + (30 * 60 * 1000),
                tipoProceso: 'AUTENTICADOR',
                userPhone: userPhone
            }
        });

        // 7. MENSAJE INICIAL DE BLOQUEO
        await flowDynamic([
            '⏳ *¡PROCESO DE AUTENTICADOR INICIADO - BLOQUEADO POR 30 MINUTOS!* ⏳',
            '',
            '🔒 **TU SESIÓN HA SIDO BLOQUEADA**',
            '',
            '📋 Tu solicitud de desconfiguración de autenticador está siendo procesada.',
            '⏰ **Tiempo estimado:** 30 minutos',
            '',
            '🚫 **NO PUEDES:**',
            '• Acceder al menú',
            '• Iniciar otro proceso',
            '• Cancelar esta solicitud',
            '',
            '✅ **PUEDES:**',
            '• Escribir *estado* para ver progreso',
            '',
            '🔄 El proceso es automático y continuará en segundo plano.',
            '',
            '¡Gracias por tu paciencia! 🙏'
        ].join('\n'));

        // 8. **NO HACER gotoFlow** - El usuario queda bloqueado aquí
        console.log(`✅ Usuario ${ctx.from} BLOQUEADO por 30 minutos para autenticador`);
    });

// =====================================================================================
// FLUJO PRINCIPAL PARA PROBLEMAS CON CIAPAGOS (VERSIÓN SIMPLIFICADA)
// =====================================================================================
const flowCiaPagos = addKeyword<Provider, Database>(['ciapagos', utils.setEvent('FLOW_CIAPAGOS')])
    .addAction(async (ctx, { flowDynamic, gotoFlow, state }) => {
        ctx.from = normalizarIdWhatsAppBusiness(ctx.from);
        if (ctx.from === CONTACTO_ADMIN) return;

        console.log(`🔍 Entrando a flowCiaPagos para usuario: ${ctx.from}`);

        await state.update({
            estadoUsuario: ESTADOS_USUARIO.LIBRE,
            tipoProceso: 'CIAPAGOS'
        });

        await flowDynamic([
            '🏦 *PROBLEMAS PARA ACCEDER AL PORTAL DE CIAPAGOS* 🏦',
            '',
            '🔍 **Si no puedes acceder a CIAPAGOS, verifica lo siguiente:**',
            '',
            '1️⃣ **Credenciales incorrectas:**',
            '• En el campo de "#No. de control" Solamente ingresa tú numero de control:',
            '• En el campo de "Contraseña" ingresa la misma contraseña que usas para el portal del SIE',
            '',
            '2️⃣ **Problemas técnicos del sistema:**',
            '• CIAPAGOS puede presentar mantenimiento programado, si el portal no carga, intenta más tarde',
            '• Verifica tú conexión a internet',
            '• Intenta desde otro navegador (Chrome, Firefox, Edge)',
            '',
            '3️⃣ **Bloqueo por múltiples intentos fallidos:**',
            '• Si ingresaste mal tu contraseña varias veces, tu cuenta puede bloquearse temporalmente',
            '• Espera 30 minutos e intenta nuevamente',
            '',
            '4️⃣ **Error en la página web:**',
            '• Verifica que la URL sea correcta: https://ciapagos.aguascalientes.tecnm.mx/',
            '• Limpia el caché y cookies de tu navegador',
            '• Intenta en modo incógnito',
            '',
            '---',
            '',
            '❓ **¿Se resolvió tu duda con esta información?**',
            '',
            '1️⃣ ✅ Sí, ya puedo acceder',
            '2️⃣ ❌ No, necesito más ayuda, Necesito recuperar mi contraseña al portal CIAPAGOS',
            '',
            '💡 *Escribe solo el número (1 o 2)*',
            '🔙 O escribe *menú* para volver al menú principal'
        ].join('\n'));
    })
    .addAction(
        { capture: true },
        async (ctx, { flowDynamic, gotoFlow, state }) => {
            const opcion = ctx.body.trim().toLowerCase();
            console.log(`🎯 Opción CIAPAGOS seleccionada: "${opcion}"`);

            if (opcion === 'menu' || opcion === 'menú') {
                await limpiarEstado(state);
                return gotoFlow(flowMenu);
            }

            if (opcion === '1') {
                await flowDynamic([
                    '✅ ¡Excelente! Nos alegra que hayas podido resolver tu problema.',
                    '',
                    '💡 **Recuerda que para futuros problemas puedes:**',
                    '• Escribir *menú* para ver todas las opciones disponibles',
                    '• Contactar directamente a las áreas correspondientes',
                    '',
                ].join('\n'));
                return gotoFlow(flowEsperaMenu);
            }

            if (opcion === '2') {
                await flowDynamic([
                    '❌ Lamentamos que no hayas podido resolver tu problema con CIAPAGOS.',
                    '',
                    '📧 **Para recibir atención personalizada, por favor envía un correo, deste tú correo institucional a:**',
                    '📩 *ccomputo@aguascalientes.tecnm.mx*',
                    '',
                    '🔔 Asunto del correo: *Ayuda con CIAPAGOS - [Tu Número de Control]*',
                    '📋 **En tu correo incluye la siguiente información:**',
                    '• 🔢 Número de control completo',
                    '• 👤 Nombre completo',
                    '• 📝 Descripción detallada del problema',
                    '',
                    '*Recuerda que es importante que el correo sea enviado desde tu correo institucional para una correcta atención, ya que por motivos de seguridad no se atienden solicitudes desde correos personales.*',
                    '⏰ **Tiempo de respuesta estimado:**',
                    '• 1-24 horas hábiles',
                    '',
                ].join('\n'));
                return gotoFlow(flowEsperaMenu);
            }

            await flowDynamic('❌ Opción no válida. Escribe 1, 2 o menú.');
            return gotoFlow(flowCiaPagos);
        }
    );

// =====================================================================================
// FLUJO DE ESPERA PARA MENÚ (SIMPLIFICADO)
// =====================================================================================
const flowEsperaMenu = addKeyword<Provider, Database>(utils.setEvent('ESPERA_MENU'))
    .addAnswer(
        '🔙 Escribe *menú* para volver al menú principal.',
        { capture: true },
        async (ctx, { flowDynamic, gotoFlow, state }) => {
            const input = ctx.body.trim().toLowerCase();

            if (input === 'menu' || input === 'menú') {
                await limpiarEstado(state);
                return gotoFlow(flowMenu);
            }

            // Si no es "menu", mostrar el mismo mensaje de nuevo
            await flowDynamic('🔙 Escribe *menú* para volver al menú principal.');

            return gotoFlow(flowEsperaMenu);
        }
    );

// =====================================================================================
// FLUJO PARA MANEJAR LA RESPUESTA DE CIAPAGOS (SEPARADO)
// =====================================================================================
const flowCiaPagosRespuesta = addKeyword<Provider, Database>(utils.setEvent('CIAPAGOS_RESPUESTA'))
    .addAnswer(
        '💡 *Escribe tu respuesta:*',
        { capture: true },
        async (ctx, { flowDynamic, gotoFlow, state, endFlow }) => {
            const opcion = ctx.body.trim().toLowerCase();
            console.log(`🎯 Opción CIAPAGOS seleccionada: "${opcion}"`);

            if (opcion === '1') {
                await flowDynamic([
                    '✅ ¡Excelente! Nos alegra que hayas podido resolver tu problema.',
                    '',
                    '💡 **Recuerda que para futuros problemas puedes:**',
                    '• Escribir *menú* para ver todas las opciones disponibles',
                    '• Contactar directamente a las áreas correspondientes',
                    '',
                    '🔙 Escribe *menú* para volver al menú principal.'
                ].join('\n'));

                // Usar endFlow() para terminar este flujo específico
                return endFlow();
            }

            if (opcion === '2') {
                await flowDynamic([
                    '❌ Lamentamos que no hayas podido resolver tu problema con CIAPAGOS.',
                    '',
                    '📧 **Para recibir atención personalizada, por favor envía un correo a:**',
                    '📩 *ccentrocomputo@aguascalientes.tecnm.mx*',
                    '',
                    '📋 **En tu correo incluye la siguiente información:**',
                    '• 🔢 Número de control completo',
                    '• 👤 Nombre completo',
                    '• 📝 Descripción detallada del problema',
                    '',
                    '⏰ **Tiempo de respuesta estimado:**',
                    '• 1-24 horas hábiles',
                    '',
                    '🔙 Escribe *menú* para volver al menú principal.'
                ].join('\n'));

                // Usar endFlow() para terminar este flujo específico
                return endFlow();
            }

            if (opcion === 'menu' || opcion === 'menú') {
                await limpiarEstado(state);
                return gotoFlow(flowMenu);
            }

            // Si la opción no es válida, mostrar mensaje y volver a preguntar
            await flowDynamic([
                '❌ Opción no válida. Por favor escribe:',
                '',
                '1️⃣ - Si ya resolviste tu problema',
                '2️⃣ - Si necesitas más ayuda',
                '',
                '🔙 O escribe *menú* para volver al menú principal.'
            ].join('\n'));

            // Volver al flujo de respuesta para intentar nuevamente
            return gotoFlow(flowCiaPagosRespuesta);
        }
    );

// =====================================================================================
// FLUJO DE RESTABLECIMIENTO DE SIE
// =====================================================================================
const flowrestablecerSIE = addKeyword<Provider, Database>(utils.setEvent('RESTABLECER_SIE'))
    .addAnswer(
        [
            '📄 *SINCRONIZACIÓN DE DATOS SIE*',
            '',
            'Vamos a comenzar el proceso de sincronización de tus datos en el *SIE*.',
            '',
            '🚨 Necesitamos tu número de control para continuar.',
            '',
            '⚠️ **IMPORTANTE:**',
            '• Este proceso es solo para sincronización de datos',
            '• No requiere envío de identificación',
            '• El tiempo estimado es de 30 minutos',
            '',
            '🔙 Escribe *menú* para volver al menú principal.'
        ].join('\n'),
        null,
        async (ctx, { gotoFlow, state }) => {
            ctx.from = normalizarIdWhatsAppBusiness(ctx.from)
            if (ctx.from === CONTACTO_ADMIN) return

            // Limpiar estado específico de SIE y marcar tipo de proceso
            await state.update({
                esTrabajador: false,
                tipoProceso: 'SIE',
                identificacionSubida: false,
                requiereIdentificacion: false // Marcar que SIE no requiere identificación
            })

            return gotoFlow(flowCapturaNumeroControl)
        }
    )

// =====================================================================================
// FLUJO FINAL DE SIE (VERSIÓN CORREGIDA)
// =====================================================================================
const flowFinSIE = addKeyword<Provider, Database>(utils.setEvent('FIN_SIE'))
    .addAction(async (ctx, { state, flowDynamic, provider, gotoFlow }) => {
        ctx.from = normalizarIdWhatsAppBusiness(ctx.from);
        
        // 1. VERIFICAR SI ES ADMIN
        if (ctx.from === CONTACTO_ADMIN) return;
        
        // 2. VERIFICAR SI YA ESTÁ BLOQUEADO (IMPORTANTE: Esto debe ir PRIMERO)
        const bloqueado = await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow });
        if (bloqueado) {
            console.log(`🚫 Usuario ${ctx.from} ya está bloqueado, no iniciar nuevo proceso`);
            return; // No continuar si ya está bloqueado
        }
        
        const myState = await state.getMyState();
        const nombreCompleto = myState.nombreCompleto;
        const numeroControl = myState.numeroControl;

        if (!nombreCompleto || !numeroControl) {
            console.log('❌ Datos incompletos para SIE, redirigiendo a captura...');
            await flowDynamic('❌ No tenemos tu información completa. Volvamos a empezar.');
            return gotoFlow(flowCapturaNumeroControl);
        }

        console.log(`🚀 Iniciando proceso SIE para ${ctx.from}: ${nombreCompleto}`);

        // 3. **BLOQUEAR AL USUARIO INMEDIATAMENTE**
        await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
            tipo: "📊 Sincronización de Datos SIE",
            inicio: Date.now(),
            identificacion: numeroControl
        });

        const estadoConexiones = obtenerEstadoConexiones();
        const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE SINCRONIZACIÓN DE DATOS* 🔔\n\n📋 *Información:*\n👤 Nombre: ${nombreCompleto}\n🔢 Número de control: ${numeroControl}\n📞 Teléfono: ${ctx.from}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n\n💾 *Estados de conexión:*\n• MySQL: ${estadoConexiones.mysql}\n• Actextita: ${estadoConexiones.actextita}\n• Sistematickets: ${estadoConexiones.sistematickets}\n\n⚠️ Usuario BLOQUEADO por 30 minutos`;

        await enviarAlAdmin(mensajeAdmin);

        // 4. CONFIGURAR TIMEOUT DE 30 MINUTOS
        const userPhone = ctx.from;
        
        // Limpiar timeouts previos
        timeoutManager.clearTimeout(userPhone);
        timeoutManager.clearInterval(userPhone);

        // Timeout para finalizar el proceso
        const timeoutId = timeoutManager.setTimeout(userPhone, async () => {
            try {
                console.log(`⏰ Timeout completado para ${userPhone} (SIE), enviando mensaje final...`);

                await flowDynamic([
                    '✅ *Sincronización de datos SIE completada* ✅',
                    '',
                    '📋 **Se sincronizaron los datos correctamente en tu portal del SIE**',
                    '',
                    '💡 **Pasos a seguir:**',
                    '1. Cierra sesión actual del SIE si la tienes abierta',
                    '2. Accede a: https://sie.ita.mx',
                    '3. Ingresa con tu número de control y contraseña',
                    '4. Verifica que ahora aparezcan:',
                    '   • Tu horario completo',
                    '   • Todas tus materias',
                    '   • Calificaciones actualizadas',
                    '',
                    '🔍 **Si aún no ves la información:**',
                    '• Espera 5-10 minutos y refresca la página',
                    '• Limpia el caché de tu navegador',
                    '• Intenta en otro navegador',
                    '',
                    '🔙 Escribe *menú* para volver al menú principal.'
                ].join('\n'));

            } catch (error: any) {
                console.error('❌ Error en finalización de SIE:', error.message);
                await flowDynamic('✅ Se ha completado la sincronización. Por favor verifica tu portal del SIE.');
            }

            // LIMPIAR TODO AL TERMINAR
            await limpiarEstado(state);
            await limpiarEstadoMySQL(userPhone);
            timeoutManager.clearAll(userPhone);

        }, 30 * 60 * 1000); // 30 minutos

        // 5. CONFIGURAR INTERVALO PARA NOTIFICACIONES
        const intervalId = timeoutManager.setInterval(userPhone, async () => {
            try {
                const estadoActual = await state.getMyState();
                if (!estadoActual || estadoActual.estadoUsuario !== ESTADOS_USUARIO.EN_PROCESO_LARGO) {
                    timeoutManager.clearInterval(userPhone);
                    return;
                }

                const metadata = estadoActual.estadoMetadata || {};
                const tiempoTranscurrido = Date.now() - (metadata.inicio || Date.now());
                const minutosTranscurridos = Math.floor(tiempoTranscurrido / 60000);
                const minutosRestantes = Math.max(0, 30 - minutosTranscurridos);

                // Solo enviar notificación cada 5 minutos
                if (minutosTranscurridos > 0 && minutosTranscurridos % 5 === 0) {
                    await flowDynamic(`⏳ *Actualización SIE:* ${minutosTranscurridos} min transcurridos, ${minutosRestantes} min restantes.`);
                }

                // Si ya pasaron 30 minutos, limpiar
                if (minutosTranscurridos >= 30) {
                    timeoutManager.clearInterval(userPhone);
                }
            } catch (error) {
                console.error('❌ Error en notificación periódica:', error);
            }
        }, 60 * 1000); // Verificar cada minuto

        // 6. GUARDAR IDs EN EL ESTADO
        await state.update({
            estadoMetadata: {
                ...(await state.getMyState())?.estadoMetadata,
                timeoutId: timeoutId,
                intervalId: intervalId,
                timeoutExpira: Date.now() + (30 * 60 * 1000),
                tipoProceso: 'SIE',
                userPhone: userPhone
            }
        });

        // 7. MENSAJE INICIAL DE BLOQUEO
        await flowDynamic([
            '⏳ *¡PROCESO DE SINCRONIZACIÓN SIE INICIADO - BLOQUEADO POR 30 MINUTOS!* ⏳',
            '',
            '🔒 **TU SESIÓN HA SIDO BLOQUEADA**',
            '',
            '📋 Tu solicitud de sincronización de datos en el SIE está siendo procesada.',
            '⏰ **Tiempo estimado:** 30 minutos',
            '',
            '🚫 **NO PUEDES:**',
            '• Acceder al menú',
            '• Iniciar otro proceso',
            '• Cancelar esta solicitud',
            '',
            '✅ **PUEDES:**',
            '• Escribir *estado* para ver progreso',
            '',
            '🔄 El proceso es automático y continuará en segundo plano.',
            '',
            '¡Gracias por tu paciencia! 🙏'
        ].join('\n'));

        // 8. **NO HACER gotoFlow** - El usuario queda bloqueado aquí
        console.log(`✅ Usuario ${ctx.from} BLOQUEADO por 30 minutos para sincronización SIE`);
    });

// =====================================================================================
// FLUJO DE EDUCACIÓN A DISTANCIA
// =====================================================================================
const flowDistancia = addKeyword<Provider, Database>(utils.setEvent('FLOW_DISTANCIA'))
    .addAction(async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
        ctx.from = normalizarIdWhatsAppBusiness(ctx.from)
        if (ctx.from === CONTACTO_ADMIN) return

        // Verificar si está bloqueado
        if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
            return
        }

        try {
            await flowDynamic([{
                body: '😞 Por el momento no podemos apoyarte con el restablecimiento de contraseña de tu *Moodle*. \n👉 Te invitamos a asistir a *Coordinación de Educación a Distancia*. \n📍 Sus oficinas están en el edificio de *Idiomas* (planta baja), frente a la sala Isóptica, a un costado del elevador.',
                media: 'https://raw.githubusercontent.com/CapYAN09/ProyectosITA/main/img/Imagen_de_WhatsApp_2025-09-10_a_las_13.53.25_7b1508b3-removebg-preview.png'
            }])
        } catch (error) {
            await flowDynamic('😞 Por el momento no podemos apoyarte con el restablecimiento de contraseña de tu *Moodle*. \n👉 Te invitamos a asistir a *Coordinación de Educación a Distancia*. \n📍 Sus oficinas están en el edificio de *Idiomas* (planta baja), frente a la sala Isóptica, a un costado del elevador.')
        }

        await flowDynamic('🔙 Escribe *menú* para volver al menú principal.')
        return
    })

// =====================================================================================
// FLUJO DE SIE
// =====================================================================================
const flowSIE = addKeyword<Provider, Database>(['sie', utils.setEvent('FLOW_SIE')])
    .addAnswer(
        '📚 *ACCESO AL SISTEMA SIE*\n\n' +
        'Por favor selecciona una opción:\n\n' +
        '1️⃣ Restablecer contraseña de acceso\n' +
        '2️⃣ No puedo ver mi horario o calificaciones\n\n' +
        '🔙 Escribe *menú* para volver al menú principal.',
        { capture: true },
        async (ctx, { flowDynamic, gotoFlow, state }) => {
            ctx.from = normalizarIdWhatsAppBusiness(ctx.from)
            if (ctx.from === CONTACTO_ADMIN) return

            const opcion = ctx.body.trim().toLowerCase()

            if (opcion === 'menu' || opcion === 'menú') {
                return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic)
            }

            if (opcion === '1') {
                await flowDynamic(
                    '🔐 *RESTABLECIMIENTO DE CONTRASEÑA SIE*\n\n' +
                    'Para restablecer tu contraseña de acceso al SIE, por favor comunícate con tu *Coordinador de Carrera*. ' +
                    'Ellos podrán asistirte directamente con el restablecimiento.\n\n' +
                    '🔙 Escribe *menú* para volver al menú principal.'
                )
                return;
            }

            if (opcion === '2') {
                await flowDynamic('📊 Vamos a sincronizar tus datos en el SIE...')
                return gotoFlow(flowrestablecerSIE)
            }

            await flowDynamic('❌ Opción no válida. Escribe *1* o *2*.')
            return gotoFlow(flowSIE)
        }
    )

// =====================================================================================
// FLUJO DE INFORMACIÓN ADICIONAL
// =====================================================================================
const flowInfoAdicional = addKeyword<Provider, Database>(utils.setEvent('FLOW_INFO_ADICIONAL'))
    .addAction(async (ctx, { flowDynamic, gotoFlow, state }) => {
        ctx.from = normalizarIdWhatsAppBusiness(ctx.from)

        // Verificar si es el administrador
        if (ctx.from === CONTACTO_ADMIN) return

        // Opcional: Verificar si está bloqueado (aunque este flujo es informativo)
        if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
            return
        }

        await flowDynamic([
            '🙏 ¡Gracias por comunicarte con el Centro de Cómputo del ITA! 💙',
            'Estamos para ayudarte siempre que lo necesites.',
            '',
            'En dado caso de que tengas más dudas o requieras asistencia adicional, no dudes en contactarnos nuevamente.',
            '',
            '📞 **También puedes comunicarte a los siguientes teléfonos:**',
            '• Centro de cómputo: 449 910 50 02 EXT. 145',
            '• Coordinación de educación a distancia: 449 910 50 02 EXT. 125',
            '',
            '🔙 Escribe *menú* si deseas regresar al inicio.'
        ].join('\n'))
    })

// =====================================================================================
// FLUJO DE INFORMACIÓN DE CREDENCIALES
// =====================================================================================
const flowInfoCredenciales = addKeyword<Provider, Database>(utils.setEvent('FLOW_INFO_CREDENCIALES'))
    .addAction(async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
        ctx.from = normalizarIdWhatsAppBusiness(ctx.from)

        // Verificar si es el administrador (no mostrar esta información al admin)
        if (ctx.from === CONTACTO_ADMIN) return

        // Verificar si está bloqueado
        if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
            return
        }

        await flowDynamic([
            '❓ *¿No conoces tu correo institucional ni tu contraseña?* ❓',
            '',
            '📋 **Para estudiantes:**',
            '• Tu correo institucional se forma con tu número de control:',
            '  *numero_de_control@aguascalientes.tecnm.mx*',
            '',
            '📋 **Para trabajadores/docentes:**',
            '• Tu correo institucional generalmente es:',
            '  *nombre.apellido@aguascalientes.tecnm.mx*',
            '',
            '🔍 **Si no recuerdas tu número de control:**',
            '• Revisa tu credencial escolar del ITA',
            '• Consulta con tu coordinador de carrera',
            '• Revisa documentos oficiales de inscripción',
            '',
            '🔐 **Para restablecer tu contraseña:**',
            '• Si conoces tu correo pero no tu contraseña,',
            '  puedes restablecerla usando este bot, regresa al menú principal',
            '  selecciona la opción *1* y sigue las instrucciones.',
            '',
            '📞 **Si necesitas ayuda adicional:**',
            '• Centro de cómputo: 449 910 50 02 EXT. 145',
            '• Coordinación de educación a distancia: 449 910 50 02 EXT. 125',
            '',
            '🔙 Escribe *menú* para volver al menú principal.'
        ].join('\n'))
    })

// =====================================================================================
// FLUJO DE GESTIÓN DE SERVICIOS
// =====================================================================================
const flowGestionServicios = addKeyword<Provider, Database>(utils.setEvent('FLOW_GESTION_SERVICIOS'))
    .addAction(async (ctx, { flowDynamic, gotoFlow, state }) => {
        ctx.from = normalizarIdWhatsAppBusiness(ctx.from)

        // Verificar si es el administrador
        if (ctx.from === CONTACTO_ADMIN) return

        // Verificar si está bloqueado
        if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
            return
        }

        try {
            // Verificar conexión a actextita
            const connection = await inicializarActextita();
            if (!connection) {
                await flowDynamic('❌ No se pudo conectar a la base de datos de administración. Por favor intenta más tarde.');
                return gotoFlow(flowMenu);
            }

            // Verificar si el usuario es administrador
            const [admins] = await connection.execute(
                'SELECT usuario FROM admins WHERE estado = "activo"'
            );

            if (admins.length === 0) {
                await flowDynamic('🔒 Esta opción es exclusiva para trabajadores autorizados.\n\n🔙 Escribe *menú* para volver al menú principal.');
                return;
            }

            await flowDynamic([
                '👨‍💼 *Gestión de Servicios - Exclusivo Trabajadores*',
                '',
                '🔧 **Opciones disponibles:**',
                '1️⃣ 📊 Ver estadísticas del bot',
                '2️⃣ 👥 Consultar usuarios registrados',
                '3️⃣ 🔐 Administrar permisos',
                '4️⃣ 📋 Ver solicitudes pendientes',
                '',
                '🔙 Escribe *menú* para volver al menú principal.',
                '💡 *Escribe el número de la opción deseada*'
            ].join('\n'));

        } catch (error) {
            console.error('❌ Error en gestión de servicios:', error);
            await flowDynamic('❌ Ocurrió un error al acceder a la gestión de servicios. Por favor intenta más tarde.');
            return gotoFlow(flowMenu);
        }
    })

// =====================================================================================
// FLUJO DE CONEXIÓN A BASE DE DATOS ACTEXTITA
// =====================================================================================
const flowConexionBaseDatos = addKeyword<Provider, Database>(utils.setEvent('FLOW_CONEXION_BASE_DATOS'))
    .addAction(async (ctx, { flowDynamic, gotoFlow, state }) => {
        ctx.from = normalizarIdWhatsAppBusiness(ctx.from)

        // Verificar si es el administrador
        if (ctx.from === CONTACTO_ADMIN) return

        // Verificar si está bloqueado
        if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
            return
        }

        try {
            // Verificar conexión a actextita
            const connection = await inicializarActextita();
            if (!connection) {
                await flowDynamic('❌ No se pudo conectar a la base de datos Actextita. Por favor intenta más tarde.');
                return gotoFlow(flowMenu);
            }

            // Consultar estadísticas básicas
            const [totalAlumnos] = await connection.execute(
                'SELECT COUNT(*) as total FROM (SELECT numero_control FROM anuevo_ingreso UNION SELECT numero_control FROM a_resagados) AS alumnos'
            );

            const [totalAdmins] = await connection.execute(
                'SELECT COUNT(*) as total FROM admins WHERE estado = "activo"'
            );

            await flowDynamic([
                '🗃️ *Base de Datos Actextita - Información*',
                '',
                '📊 **Estadísticas:**',
                `• 📚 Total de alumnos registrados: ${totalAlumnos[0]?.total || 0}`,
                `• 👨‍💼 Administradores activos: ${totalAdmins[0]?.total || 0}`,
                '',
                '🔗 **Estado de conexión:**',
                `• MySQL Local: ${conexionMySQL ? '✅ CONECTADO' : '❌ DESCONECTADO'}`,
                `• Actextita: ${conexionActextita ? '✅ CONECTADO' : '❌ DESCONECTADO'}`,
                `• Sistematickets: ${conexionSistematickets ? '✅ CONECTADO' : '❌ DESCONECTADO'}`,
                '',
                '💡 **Funciones disponibles:**',
                '• Consultar información de alumnos',
                '• Verificar administradores',
                '• Gestionar permisos',
                '',
                '🔙 Escribe *menú* para volver al menú principal.'
            ].join('\n'));

        } catch (error) {
            console.error('❌ Error en conexión a base de datos:', error);
            await flowDynamic('❌ Ocurrió un error al conectar con la base de datos. Por favor intenta más tarde.');
            return gotoFlow(flowMenu);
        }
    })

// =====================================================================================
// FLUJO DE BLOQUEO ACTIVO MEJORADO
// =====================================================================================
const flowBloqueoActivo = addKeyword<Provider, Database>(utils.setEvent('BLOQUEO_ACTIVO'))
    .addAction(async (ctx, { state, flowDynamic }) => {
        ctx.from = normalizarIdWhatsAppBusiness(ctx.from);
        if (ctx.from === CONTACTO_ADMIN) return;
        
        const input = ctx.body?.toLowerCase().trim();
        const myState = await state.getMyState();
        
        if (!myState?.estadoUsuario || myState.estadoUsuario !== ESTADOS_USUARIO.EN_PROCESO_LARGO) {
            console.log(`🔓 Usuario ${ctx.from} ya no está bloqueado`);
            // Aquí deberías redirigir al menú principal
            return;
        }
        
        // Manejar comandos específicos durante el bloqueo
        if (input === 'estado') {
            const metadata = myState.estadoMetadata || {};
            const tiempoTranscurrido = Date.now() - (metadata.inicio || Date.now());
            const minutosTranscurridos = Math.floor(tiempoTranscurrido / 60000);
            const minutosRestantes = Math.max(0, 30 - minutosTranscurridos);
            
            await flowDynamic([
                '📊 **Estado del Proceso**',
                '',
                `📋 ${metadata.tipo || 'Proceso en curso'}`,
                `⏰ Tiempo transcurrido: ${minutosTranscurridos} min`,
                `⏳ Tiempo restante: ${minutosRestantes} min`,
                '',
                '🔄 El proceso continúa en segundo plano...',
                '⏰ Se completará automáticamente.'
            ].join('\n'));
        } 
        else if (input === 'menu' || input === 'menú') {
            await flowDynamic([
                '🚫 *ACCESO DENEGADO* 🚫',
                '',
                '⏳ Tu sesión está bloqueada mientras procesamos tu solicitud.',
                '',
                '📋 **Proceso activo:**',
                `• ${myState.estadoMetadata?.tipo || 'Restablecimiento en curso'}`,
                `• Tiempo restante: ${Math.max(0, 30 - Math.floor((Date.now() - (myState.estadoMetadata?.inicio || Date.now())) / 60000))} min`,
                '',
                '🚫 **No puedes acceder al menú durante este proceso**',
                '',
                '✅ **Solo puedes escribir:**',
                '*estado* - Para ver el progreso actual',
                '',
                '¡Gracias por tu paciencia! 🙏'
            ].join('\n'));
        }
        else if (input) {
            // Cualquier otro mensaje
            await flowDynamic([
                '⏳ *Proceso en curso* ⏳',
                '',
                '📋 Tu solicitud está siendo procesada...',
                '',
                '🔄 **No es necesario que escribas nada**',
                '⏰ El proceso continuará automáticamente',
                '',
                '💡 **Solo puedes escribir:**',
                '*estado* - Para ver el progreso actual',
                '',
                '¡Gracias por tu paciencia! 🙏'
            ].join('\n'));
        }
        
        // Quedarse en este flujo, no redirigir a ningún lado
        return;
    });

// =====================================================================================
// FLUJO DEL MENÚ (solo para redirecciones internas)
// =====================================================================================
const flowMenu = addKeyword<Provider, Database>(utils.setEvent('SHOW_MENU'))
    .addAction(async (ctx, { flowDynamic, state, gotoFlow }) => {
        // Verificar si está bloqueado primero
        if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
            return // No continuar si está bloqueado
        }

        await mostrarOpcionesMenu(flowDynamic)
    })

// =====================================================================================
// FLUJO DE DOCUMENTACIÓN
// =====================================================================================
const discordFlow = addKeyword<Provider, Database>('doc').addAnswer(
    ['You can see the documentation here', '📄 https://builderbot.app/docs \n', 'Do you want to continue? *yes*'].join(
        '\n'
    ),
    { capture: true },
    async (ctx, { gotoFlow, flowDynamic }) => {
        if (ctx.body.toLocaleLowerCase().includes('yes')) {
            return gotoFlow(registerFlow)
        }
        await flowDynamic('Thanks!')
        return
    }
)

// =====================================================================================
// FLUJO DE REGISTRO
// =====================================================================================
const registerFlow = addKeyword<Provider, Database>(utils.setEvent('REGISTER_FLOW'))
    .addAnswer(`What is your name?`, { capture: true }, async (ctx, { state }) => {
        await state.update({ name: ctx.body })
    })
    .addAnswer('What is your age?', { capture: true }, async (ctx, { state }) => {
        await state.update({ age: ctx.body })
    })
    .addAction(async (_, { flowDynamic, state }) => {
        await flowDynamic(`${state.get('name')}, thanks for your information!: Your age: ${state.get('age')}`)
    })

// =====================================================================================
// FLUJO DE MUESTRAS
// =====================================================================================
const fullSamplesFlow = addKeyword<Provider, Database>(['samples', utils.setEvent('SAMPLES')])
    .addAnswer(`💪 I'll send you a lot files...`)
    .addAnswer(`Send image from Local`, { media: join(process.cwd(), 'assets', 'sample.png') })
    .addAnswer(`Send video from URL`, {
        media: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYTJ0ZGdjd2syeXAwMjQ4aWdkcW04OWlqcXI3Ynh1ODkwZ25zZWZ1dCZlcD12MV9pbnRlcm5hbF9naWZfZnk/giphy.mp4',
    })
    .addAnswer(`Send audio from URL`, { media: 'https://cdn.freesound.org/previews/728/728142_11861866-lq.mp3' })
    .addAnswer(`Send file from URL`, {
        media: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    })

// =====================================================================================
// FLUJO POR DEFECTO
// =====================================================================================
const flowDefault = addKeyword<Provider, Database>('')
    .addAction(async (ctx, { flowDynamic, gotoFlow }) => {
        const input = ctx.body?.toLowerCase().trim()
        console.log(`🤔 Mensaje no capturado: "${input}"`)

        // Si llega aquí, redirigir al flowPrincipal para manejar el mensaje
        return gotoFlow(flowPrincipal)
    })

// =====================================================================================
// CONFIGURACIÓN DE ENDPOINTS DE HEALTH
// =====================================================================================
healthApp.get('/health', (req, res) => {
    const estadoConexiones = obtenerEstadoConexiones();

    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        connections: estadoConexiones,
        memory: {
            used: process.memoryUsage().heapUsed / 1024 / 1024,
            total: process.memoryUsage().heapTotal / 1024 / 1024
        },
        uptime: process.uptime()
    });
});

healthApp.listen(HEALTH_PORT, () => {
    console.log(`✅ Health endpoint en puerto ${HEALTH_PORT}`);
});

// Modificar el heartbeat para incluir más información
setInterval(() => {
    const estadoConexiones = obtenerEstadoConexiones();
    const memoryUsage = process.memoryUsage();
    const heapUsed = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    const heapTotal = Math.round(memoryUsage.heapTotal / 1024 / 1024);

    console.log(`💓 Bot activo - ${new Date().toLocaleTimeString('es-MX')}`);
    console.log(`🧠 Memoria: ${heapUsed}MB / ${heapTotal}MB`);
    console.log(`🔗 Conexiones:`, estadoConexiones);
}, 5 * 60 * 1000); // Cada 5 minutos

// =====================================================================================
// FUNCIÓN PRINCIPAL
// =====================================================================================
const main = async () => {
    // Inicializar todas las conexiones a bases de datos
    console.log('🚀 Inicializando conexiones a bases de datos...');
    await inicializarTodasLasConexiones();

    // =================================================================================
    // ORDEN DE FLUJOS - VERSIÓN CORREGIDA (IMPORTANTE)
    // =================================================================================
    const adapterFlow = createFlow([
        // 1. FLUJO DE BLOQUEO ACTIVO - DEBE IR PRIMERO SIEMPRE
        flowBloqueoActivo,

        // 2. FLUJO PRINCIPAL - DEBE IR SEGUNDO
        flowPrincipal,

        // 3. FLUJO DEL MENÚ
        flowMenu,

        // 4. FLUJOS LARGOS (que bloquean usuarios)
        flowContrasena,        // ← Ya verifica bloqueo
        flowAutenticador,      // ← Ya verifica bloqueo
        flowFinSIE,            // ← Ya verifica bloqueo

        // 5. FLUJOS DE CAPTURA (antes de los largos)
        flowSubMenuContrasena,
        flowSubMenuAutenticador,
        flowCapturaCorreoTrabajador,
        flowCapturaNumeroControl,
        flowCapturaNombre,
        flowCapturaIdentificacion,

        // 6. FLUJOS SIE
        flowSIE,
        flowrestablecerSIE,

        // 7. FLUJOS INFORMATIVOS
        flowDistancia,
        flowInfoAdicional,
        flowInfoCredenciales,
        flowGestionServicios,
        flowConexionBaseDatos,

        // 8. FLUJO CIAPAGOS
        flowCiaPagos,
        flowCiaPagosRespuesta,
        flowEsperaMenu,

        // 9. FLUJOS DE EJEMPLO
        discordFlow,
        registerFlow,
        fullSamplesFlow,

        // 10. FLUJO POR DEFECTO (último)
        flowDefault
    ]);

    const adapterProvider = createProvider(Provider,
        { version: [2, 3000, 1027934701] as any }
    )
    const adapterDB = new Database()

    // 1. Primero inicializar el bot
    console.log('🚀 Inicializando bot...')
    const bot = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    // 2. Guardar en singleton AL INSTANTE
    BotSingleton.setInstance(bot)
    console.log('✅ Bot almacenado en singleton')

    // 3. Obtener handleCtx y httpServer del bot
    const { handleCtx, httpServer } = bot

    // 4. Configurar endpoints HTTP - AHORA SI adapterProvider está definido
    adapterProvider.server.post(
        '/v1/messages/admin',
        handleCtx(async (bot, req, res) => {
            try {
                const { number, message } = req.body;

                // Verificar si es el admin
                if (number === CONTACTO_ADMIN) {
                    await bot.provider.sendText(number, message);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ status: 'sent' }));
                } else {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ status: 'unauthorized' }));
                }
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                    status: 'error',
                    error: error.message
                }));
            }
        })
    )

    adapterProvider.server.post(
        '/v1/messages',
        handleCtx(async (bot, req, res) => {
            const { number, message, urlMedia } = req.body
            await bot.sendMessage(number, message, { media: urlMedia ?? null })
            return res.end('sended')
        })
    )

    adapterProvider.server.post(
        '/v1/register',
        handleCtx(async (bot, req, res) => {
            const { number, name } = req.body
            await bot.dispatch('REGISTER_FLOW', { from: number, name })
            return res.end('trigger')
        })
    )

    adapterProvider.server.post(
        '/v1/samples',
        handleCtx(async (bot, req, res) => {
            const { number, name } = req.body
            await bot.dispatch('SAMPLES', { from: number, name })
            return res.end('trigger')
        })
    )

    adapterProvider.server.post(
        '/v1/blacklist',
        handleCtx(async (bot, req, res) => {
            const { number, intent } = req.body
            if (intent === 'remove') bot.blacklist.remove(number)
            if (intent === 'add') bot.blacklist.add(number)

            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', number, intent }))
        })
    )

    adapterProvider.server.get(
        '/v1/blacklist/list',
        handleCtx(async (bot, req, res) => {
            const blacklist = bot.blacklist.getList()
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', blacklist }))
        })
    )

    // 5. Esperar a que el provider esté listo
    console.log('⏳ Esperando que el provider esté listo...')

    // Función para verificar si el provider está listo
    const waitForProvider = async (maxWaitTime: number = 10000): Promise<boolean> => {
        const startTime = Date.now()

        while (Date.now() - startTime < maxWaitTime) {
            const botInstance = BotSingleton.getInstance()
            if (botInstance?.provider?.sendText) {
                console.log('✅ Provider listo y funcionando')
                return true
            }
            console.log('⏳ Esperando provider...')
            await new Promise(resolve => setTimeout(resolve, 1000))
        }

        console.error('❌ Timeout esperando por provider')
        return false
    }

    // 6. Esperar que el provider esté listo
    const providerReady = await waitForProvider(15000)

    if (providerReady) {
        // 7. Enviar mensaje de prueba con estado de conexiones
        try {
            const estadoConexiones = obtenerEstadoConexiones();
            console.log('🧪 Enviando mensaje de prueba al admin...')
            await enviarAlAdmin(`🤖 Bot iniciado correctamente\n⏰ Sesión: ${new Date().toLocaleString()}\n\n💾 *Estados de conexión:*\n• MySQL Local: ${estadoConexiones.mysql}\n• Actextita: ${estadoConexiones.actextita}\n• Sistematickets: ${estadoConexiones.sistematickets}\n\n✅ Bot listo para recibir solicitudes`)
        } catch (error) {
            console.error('❌ Error enviando mensaje de prueba:', error)
        }
    } else {
        console.error('⚠️ No se pudo enviar mensaje de prueba - provider no disponible')
    }

    // 8. Iniciar servidor
    console.log(`🌐 Servidor iniciando en puerto ${PORT}...`)
    httpServer(+PORT)

    // 9. Log cada minuto para verificar que el bot está vivo
    setInterval(() => {
        const estadoConexiones = obtenerEstadoConexiones();
        console.log('💓 Bot activo -', new Date().toLocaleTimeString());
        console.log('🔗 Estados conexión:', estadoConexiones);
    }, 60000)

    // 10. Configurar cierre limpio
    process.on('SIGINT', async () => {
        console.log('🔴 Recibido SIGINT. Cerrando conexiones...');
        await cerrarTodasLasConexiones();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('🔴 Recibido SIGTERM. Cerrando conexiones...');
        await cerrarTodasLasConexiones();
        process.exit(0);
    });
}

main().catch(error => {
    console.error('💥 Error fatal en main:', error)
    // Cerrar conexiones antes de salir
    cerrarTodasLasConexiones().finally(() => {
        process.exit(1)
    })
})