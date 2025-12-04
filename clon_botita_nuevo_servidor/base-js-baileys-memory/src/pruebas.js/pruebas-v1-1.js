import { join } from 'path'
import { createBot, createProvider, createFlow, addKeyword, utils } from '@builderbot/bot'
import { EVENTS } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import mysql from 'mysql2/promise'
import QRCode from 'qrcode-terminal'

const PORT = process.env.PORT ?? 3008
const CONTACTO_ADMIN = '5214494877990@s.whatsapp.net'

// ==================== CONFIGURACIONES DE BASE DE DATOS ====================
const DB_CONFIG = {
    actextita: {
        host: '172.30.247.186',
        user: 'root',
        password: '',
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
    usuariosprueba: {
        host: '172.30.247.185',
        user: 'ccomputo',
        password: 'Jarjar0904$',
        database: 'b1o04dzhm1guhvmjcrwb',
        port: 3306
    }
};

// ==================== CLASE TIMEOUT MANAGER ====================
class TimeoutManager {
    constructor() {
        this.timeouts = new Map();
        this.intervals = new Map();
    }

    setTimeout(userPhone, callback, delay) {
        this.clearTimeout(userPhone);
        const timeoutId = setTimeout(callback, delay);
        this.timeouts.set(userPhone, timeoutId);
        return timeoutId;
    }

    setInterval(userPhone, callback, delay) {
        this.clearInterval(userPhone);
        const intervalId = setInterval(callback, delay);
        this.intervals.set(userPhone, intervalId);
        return intervalId;
    }

    clearTimeout(userPhone) {
        if (this.timeouts.has(userPhone)) {
            clearTimeout(this.timeouts.get(userPhone));
            this.timeouts.delete(userPhone);
        }
    }

    clearInterval(userPhone) {
        if (this.intervals.has(userPhone)) {
            clearInterval(this.intervals.get(userPhone));
            this.intervals.delete(userPhone);
        }
    }

    clearAll(userPhone) {
        this.clearTimeout(userPhone);
        this.clearInterval(userPhone);
    }
}

const timeoutManager = new TimeoutManager();

// ==================== CLASE FLOW MANAGER ====================
class FlowManager {
    constructor() {
        this.flows = new Map();
    }

    registerFlow(name, flow) {
        this.flows.set(name, flow);
    }

    getFlow(name) {
        return this.flows.get(name);
    }

    async navigateToFlow(flowName, ctx, { state, flowDynamic, gotoFlow, provider }) {
        try {
            const targetFlow = this.getFlow(flowName);
            if (!targetFlow) {
                console.error(`❌ Flujo no encontrado: ${flowName}`);
                await flowDynamic('🔧 Error interno. Por favor intenta de nuevo escribiendo *hola*.');
                return gotoFlow(flowPrincipal);
            }

            console.log(`🔄 Navegando a flujo: ${flowName} - Usuario: ${ctx.from}`);
            
            // Limpiar timeouts antes de navegar
            const userPhone = ctx.from;
            timeoutManager.clearAll(userPhone);
            
            return gotoFlow(targetFlow);
        } catch (error) {
            console.error(`❌ Error navegando a flujo ${flowName}:`, error);
            await flowDynamic('🔧 Error al cambiar de flujo. Volviendo al inicio.');
            return gotoFlow(flowPrincipal);
        }
    }
}

const flowManager = new FlowManager();

// ==================== CONSTANTES Y CONFIGURACIONES ====================
const ESTADOS_USUARIO = {
    LIBRE: 'libre',
    EN_PROCESO_LARGO: 'en_proceso_largo',
    ESPERANDO_DATOS: 'esperando_datos',
    EN_MENU: 'en_menu'
};

// ==================== CONEXIONES A BASES DE DATOS ====================
let conexionMySQL = null;
let conexionRemota = null;
let reconectando = false;

// Conexión MySQL Local
async function crearConexionMySQL() {
    try {
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'bot_whatsapp',
            port: 3306,
            connectTimeout: 60000,
            acquireTimeout: 60000,
            timeout: 60000,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10000
        });

        connection.on('error', (err) => {
            console.error('❌ Error en conexión MySQL:', err.message);
            if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
                console.log('🔄 Reconectando a MySQL...');
                reconectarMySQL();
            }
        });

        console.log('✅ Conexión MySQL creada exitosamente');
        return connection;
    } catch (error) {
        console.error('❌ Error creando conexión MySQL:', error.message);
        return null;
    }
}

async function reconectarMySQL() {
    if (reconectando) return;
    reconectando = true;

    try {
        if (conexionMySQL) {
            try { await conexionMySQL.end(); } catch (e) { }
        }

        conexionMySQL = await crearConexionMySQL();
        reconectando = false;

        if (conexionMySQL) {
            console.log('✅ Reconexión a MySQL exitosa');
        }
    } catch (error) {
        console.error('❌ Error en reconexión MySQL:', error.message);
        reconectando = false;
        setTimeout(() => reconectarMySQL(), 5000);
    }
}

async function inicializarMySQL() {
    try {
        if (!conexionMySQL || conexionMySQL._closing) {
            conexionMySQL = await crearConexionMySQL();
        }

        if (conexionMySQL) {
            await conexionMySQL.execute('SELECT 1');
        }
        return conexionMySQL;
    } catch (error) {
        console.error('❌ Error en inicializarMySQL:', error.message);
        await reconectarMySQL();
        return conexionMySQL;
    }
}

// Conexión BD Remota (usuariosprueba)
async function crearConexionRemota() {
    try {
        console.log('🔗 Conectando a BD usuariosprueba en 172.30.247.185...');

        const connection = await mysql.createConnection({
            host: '172.30.247.185',
            user: 'ccomputo',
            password: 'Jarjar0904$',
            database: 'b1o04dzhm1guhvmjcrwb',
            port: 3306,
            connectTimeout: 30000,
            acquireTimeout: 30000,
            timeout: 30000
        });

        console.log('✅ Conexión DIRECTA a usuariosprueba establecida');
        return connection;
    } catch (error) {
        console.error('❌ Error creando conexión DIRECTA a usuariosprueba:', error.message);
        return null;
    }
}

async function inicializarConexionRemota() {
    if (!conexionRemota) {
        conexionRemota = await crearConexionRemota();
    }

    if (conexionRemota) {
        try {
            await conexionRemota.execute('SELECT 1');
            return conexionRemota;
        } catch (error) {
            console.log('🔄 Conexión remota inactiva, reconectando...');
            try { await conexionRemota.end(); } catch (e) { }
            conexionRemota = await crearConexionRemota();
        }
    }

    return conexionRemota;
}

// ==================== FUNCIONES DE BASE DE DATOS ====================

// 1. Consultar alumno en base de datos actextita
async function consultarAlumnoEnBaseDatos(numeroControl) {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: '172.30.247.186',
            user: 'root',
            password: '',
            database: 'actextita',
            port: 3306
        });

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
        return { encontrado: false, error: error.message };
    } finally {
        if (connection) await connection.end();
    }
}

// 2. Verificar administrador en base de datos actextita
async function verificarAdministradorEnBaseDatos(usuario) {
    try {
        const connection = await mysql.createConnection({
            host: '172.30.247.186',
            user: 'root',
            password: '',
            database: 'actextita',
            port: 3306
        });

        const [resultados] = await connection.execute(
            'SELECT usuario, estado, fecha_creacion FROM admins WHERE usuario = ? AND estado = "activo"',
            [usuario]
        );

        await connection.end();
        return resultados.length > 0;

    } catch (error) {
        console.error('❌ Error verificando administrador:', error.message);
        return false;
    }
}

// 3. Actualizar contraseña de admin
async function actualizarContrasenaAdmin(usuario, nuevaContrasena) {
    try {
        const connection = await mysql.createConnection({
            host: '172.30.247.186',
            user: 'root',
            password: '',
            database: 'actextita',
            port: 3306
        });

        const [resultado] = await connection.execute(
            'UPDATE admins SET contraseña = ? WHERE usuario = ?',
            [nuevaContrasena, usuario]
        );

        await connection.end();
        return resultado.affectedRows > 0;

    } catch (error) {
        console.error('❌ Error actualizando contraseña de admin:', error.message);
        return false;
    }
}

// 4. Verificar usuario en sistema usuariosprueba
async function verificarUsuarioEnSistema(usuario) {
    try {
        await inicializarConexionRemota();
        if (!conexionRemota) return null;

        const query = `
            SELECT id_usuario, usuario, ubicacion, estado, fecha_insert 
            FROM usuariosprueba 
            WHERE usuario = ?
        `;

        const [usuarios] = await conexionRemota.execute(query, [usuario]);

        if (usuarios.length > 0) {
            console.log(`✅ Usuario encontrado: ${usuario}`);
            return usuarios[0];
        } else {
            console.log(`❌ Usuario no encontrado: ${usuario}`);
            return null;
        }
    } catch (error) {
        console.error('❌ Error verificando usuario:', error.message);
        return null;
    }
}

// 5. Insertar usuario directo en usuariosprueba
async function insertarUsuarioDirectoEnusuariosprueba(nombreCompleto, area, usuario, contrasena, telefono) {
    try {
        await inicializarConexionRemota();
        if (!conexionRemota) return false;

        const id_rol = 2;
        const id_persona = 0;
        const ubicacion = area || 'Sin ubicacion';
        const estado = 'Activo';

        console.log(`📝 Insertando en usuariosprueba: ${usuario} - ${nombreCompleto}`);

        const query = `
            INSERT INTO usuariosprueba 
            (id_rol, id_persona, usuario, password, ubicacion, fecha_insert, estado)
            VALUES (?, ?, ?, ?, ?, NOW(), ?)
        `;

        const [result] = await conexionRemota.execute(query, [
            id_rol, id_persona, usuario, contrasena, ubicacion, estado
        ]);

        console.log(`✅ Usuario insertado en usuariosprueba: ${usuario}, ID: ${result.insertId}`);
        return true;
    } catch (error) {
        console.error('❌ Error insertando usuario en usuariosprueba:', error.message);
        return false;
    }
}

// 6. Consultar usuario en usuariosprueba
async function consultarUsuarioEnusuariosprueba(criterio) {
    try {
        await inicializarConexionRemota();
        if (!conexionRemota) return null;

        const query = `
            SELECT * FROM usuariosprueba 
            WHERE id_usuario = ? OR usuario = ? OR id_persona = ? OR usuario LIKE ?
        `;

        const parametros = [criterio, criterio, criterio, `%${criterio}%`];
        const [rows] = await conexionRemota.execute(query, parametros);

        if (rows.length > 0) {
            console.log(`✅ Usuario encontrado en usuariosprueba: ${rows[0].usuario}`);
            return rows[0];
        }

        console.log(`❌ Usuario no encontrado en usuariosprueba: ${criterio}`);
        return null;
    } catch (error) {
        console.error('❌ Error consultando en usuariosprueba:', error.message);
        return null;
    }
}

// 7. Listar todos usuariosprueba
async function listarTodosusuariosprueba() {
    try {
        await inicializarConexionRemota();
        if (!conexionRemota) return [];

        const query = `SELECT * FROM usuariosprueba ORDER BY id_usuario LIMIT 50`;
        const [rows] = await conexionRemota.execute(query);

        console.log(`✅ ${rows.length} usuarios encontrados en usuariosprueba`);
        return rows;
    } catch (error) {
        console.error('❌ Error listando usuarios de usuariosprueba:', error.message);
        return [];
    }
}

// 8. Actualizar contraseña en usuariosprueba
async function actualizarContrasenaEnusuariosprueba(usuario, nuevaContrasena, telefono) {
    try {
        await inicializarConexionRemota();
        if (!conexionRemota) return false;

        console.log(`🔍 Buscando usuario: ${usuario} para actualizar contraseña`);

        const queryVerificar = `SELECT id_usuario, usuario FROM usuariosprueba WHERE usuario = ?`;
        const [usuarios] = await conexionRemota.execute(queryVerificar, [usuario]);

        if (usuarios.length === 0) {
            console.log(`❌ Usuario no encontrado en usuariosprueba: ${usuario}`);
            return false;
        }

        const queryActualizar = `
            UPDATE usuariosprueba 
            SET password = ?, fecha_insert = NOW()
            WHERE usuario = ?
        `;

        const [result] = await conexionRemota.execute(queryActualizar, [
            nuevaContrasena, usuario
        ]);

        if (result.affectedRows > 0) {
            console.log(`✅ Contraseña actualizada exitosamente para usuario: ${usuario}`);
            return true;
        } else {
            console.log(`❌ No se pudo actualizar la contraseña para usuario: ${usuario}`);
            return false;
        }
    } catch (error) {
        console.error('❌ Error actualizando contraseña en usuariosprueba:', error.message);
        return false;
    }
}

// 9. Verificar estructura usuariosprueba
async function verificarEstructurausuariosprueba() {
    try {
        await inicializarConexionRemota();
        if (!conexionRemota) return false;

        console.log('🔍 VERIFICANDO ESTRUCTURA DE TABLA usuariosprueba:');

        const [columnas] = await conexionRemota.execute(`SHOW COLUMNS FROM usuariosprueba`);
        console.log('📋 Columnas de usuariosprueba:');
        columnas.forEach(col => {
            console.log(`   ✅ ${col.Field} (${col.Type})`);
        });

        return true;
    } catch (error) {
        console.error('❌ Error verificando estructura:', error.message);
        return false;
    }
}

// 10. Guardar estado en MySQL local
async function guardarEstadoMySQL(userPhone, estado, metadata = {}, userData = {}) {
    try {
        await inicializarMySQL();
        if (!conexionMySQL) return false;

        if (!userPhone) {
            console.error('❌ userPhone es null/undefined en guardarEstadoMySQL');
            return false;
        }

        console.log(`💾 Guardando estado para: ${userPhone}`);

        const query = `
            INSERT INTO user_states (user_phone, estado_usuario, estado_metadata, 
            numero_control, nombre_completo, identificacion_subida, timestamp_identificacion)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            estado_usuario = VALUES(estado_usuario),
            estado_metadata = VALUES(estado_metadata),
            numero_control = VALUES(numero_control),
            nombre_completo = VALUES(nombre_completo),
            identificacion_subida = VALUES(identificacion_subida),
            timestamp_identificacion = VALUES(timestamp_identificacion),
            updated_at = CURRENT_TIMESTAMP
        `;

        const values = [
            userPhone,
            estado,
            JSON.stringify(metadata),
            userData.numeroControl || null,
            userData.nombreCompleto || null,
            userData.identificacionSubida || false,
            userData.timestampIdentificacion || null
        ];

        await conexionMySQL.execute(query, values);
        console.log(`✅ Estado guardado en MySQL para: ${userPhone}`);
        return true;
    } catch (error) {
        console.error('❌ Error guardando estado en MySQL:', error.message);
        return false;
    }
}

// 11. Obtener estado de MySQL
async function obtenerEstadoMySQL(userPhone) {
    try {
        if (!userPhone) return null;

        await inicializarMySQL();
        if (!conexionMySQL) return null;

        const query = `SELECT * FROM user_states WHERE user_phone = ?`;
        const [rows] = await conexionMySQL.execute(query, [userPhone]);

        if (rows.length > 0) {
            const estado = rows[0];
            let estadoMetadata = {};

            try {
                estadoMetadata = JSON.parse(estado.estado_metadata || '{}');
            } catch (e) {
                console.error('❌ Error parseando estado_metadata:', e);
            }

            return {
                estadoUsuario: estado.estado_usuario,
                estadoMetadata: estadoMetadata,
                numeroControl: estado.numero_control,
                nombreCompleto: estado.nombre_completo,
                correoInstitucional: estado.correo_institucional,
                esTrabajador: estado.es_trabajador,
                identificacionSubida: estado.identificacion_subida
            };
        }
    } catch (error) {
        console.error('❌ Error obteniendo estado de MySQL:', error.message);
    }

    return null;
}

// 12. Limpiar estado en MySQL
async function limpiarEstadoMySQL(userPhone) {
    try {
        await inicializarMySQL();
        if (!conexionMySQL) return;

        const query = `DELETE FROM user_states WHERE user_phone = ?`;
        await conexionMySQL.execute(query, [userPhone]);
        console.log(`✅ Estado limpiado en MySQL para: ${userPhone}`);
    } catch (error) {
        console.error('❌ Error limpiando estado en MySQL:', error.message);
    }
}

// ==================== FUNCIONES DE NAVEGACIÓN MEJORADAS ====================
async function navegarAFlujoConValidacion(ctx, flowName, { state, flowDynamic, gotoFlow, provider }) {
    if (ctx.from === CONTACTO_ADMIN) return;
    
    // Verificar si está bloqueado
    if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
        return gotoFlow(flowBloqueoActivo);
    }
    
    return flowManager.navigateToFlow(flowName, ctx, { state, flowDynamic, gotoFlow, provider });
}

// ==== FUNCIÓN PARA PROCESAR OPCIONES - ACTUALIZADA ====
async function procesarOpcionMenu(opcion, flowDynamic, gotoFlow, state) {
  console.log('🎯 Procesando opción:', opcion);

  // 🔧 AGREGAR MANEJO PARA "estado"
  if (opcion === 'estado') {
    return gotoFlow(flowComandosEspeciales);
  }

  switch (opcion) {
    case '1':
      await flowDynamic('🔐 Iniciando proceso de restablecimiento de contraseña... \n\n En este proceso podrás restablecer la contraseña con la que ingresas a tu cuenta institucional, recuerda que tu contraseña es tu primer nivel de seguridad ante un hackeo.');
      console.log('🚀 Redirigiendo a flowSubMenuContrasena');
      await limpiarEstado(state);
      return gotoFlow(flowSubMenuContrasena);

    case '2':
      await flowDynamic('🔑 Iniciando proceso de autenticador... \n\n En este proceso podrás restablecer el autenticador (Número de teléfono o aplicación de autenticación) con la que ingresas a tu cuenta institucional, recuerda que tu contraseña es tu segundo nivel de seguridad ante un hackeo.');
      console.log('🚀 Redirigiendo a flowSubMenuAutenticador');
      await limpiarEstado(state);
      return gotoFlow(flowSubMenuAutenticador);

    case '3':
      await flowDynamic('🎓 Redirigiendo a Educación a Distancia...');
      console.log('🚀 Redirigiendo a flowDistancia');
      return gotoFlow(flowDistancia);

    case '4':
      await flowDynamic('📊 Redirigiendo al Sistema SIE...');
      console.log('🚀 Redirigiendo a flowSIE');
      return gotoFlow(flowSIE);

    case '5':
      await flowDynamic('🙏 Redirigiendo a agradecimiento...');
      console.log('🚀 Redirigiendo a flowGracias');
      return gotoFlow(flowGracias);

    case '6':
      await flowDynamic('❓ Redirigiendo a información de credenciales...');
      console.log('🚀 Redirigiendo a flowInfoCredenciales');
      return gotoFlow(flowInfoCredenciales);

    case '7':
      await flowDynamic('👨‍💼 Redirigiendo a Gestión de Servicios...\n\n🔗 *Conectado a base de datos*');
      console.log('🚀 Redirigiendo a flowGestionServicios');
      return gotoFlow(flowGestionServicios);

    case '8':
      await flowDynamic('🗃️ Conectando a Base de Datos Actextita...');
      return gotoFlow(flowConexionBaseDatos);

    default:
      await flowDynamic('❌ Opción no válida. Por favor escribe *1*, *2*, *3*, *4*, *5*, *6*, *7* o *8*.');
      return gotoFlow(flowMenu);
  }
}

// ==================== FUNCIONES DE UTILIDAD ====================
function normalizarIdWhatsAppBusiness(id) {
    if (!id) return id;

    if (id.includes('@s.whatsapp.net') || id.includes('@g.us')) {
        return id;
    }

    const numeroLimpio = id.replace(/[^\d]/g, '');

    if (!numeroLimpio || numeroLimpio.length < 10) {
        return id;
    }

    let numeroNormalizado = numeroLimpio;
    if (numeroNormalizado.startsWith('52') && numeroNormalizado.length === 12) {
        numeroNormalizado = numeroNormalizado;
    } else if (numeroNormalizado.length === 10) {
        numeroNormalizado = '52' + numeroNormalizado;
    }

    return `${numeroNormalizado}@s.whatsapp.net`;
}

function isValidText(input) {
    if (!input || typeof input !== 'string') return false
    if (input.trim().length === 0) return false
    if (input.includes('sticker') || input.includes('image') || input.includes('video')) return false
    return true
}

function validarNumeroControl(numeroControl) {
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

function validarCorreoTrabajador(correo) {
    const regex = /^[a-zA-Z0-9._%+-]+@aguascalientes\.tecnm\.mx$/;
    return regex.test(correo) && correo.length > 0;
}

function esSaludoValido(texto) {
    if (!texto || typeof texto !== 'string') return false;

    const textoLimpio = texto.toLowerCase().trim();
    const saludos = [
        'hola', 'ole', 'alo', 'inicio', 'Inicio', 'comenzar', 'empezar',
        'buenos días', 'buenas tardes', 'buenas noches',
        'buenos dias', 'buenas tardes', 'buenas noches',
        'hola.', 'hola!', 'hola?', 'ayuda', 'Hola', '.', 'Holi', 'holi', 'holis', 'Holis', 'holaa', 'Holaa', 'holaaa', 'Holaaa',
        'holaaaa', 'Holaaaa', 'holaaaaa', 'Holaaaaa', 'holaaaaaa', 'Holaaaaaa',
        'holaaaaaaa', 'Holaaaaaaa', 'holaaaaaaaa', 'Holaaaaaaaa', 'Holi!', 'Holi.', 'Holi?', 'holi!', 'holi.', 'holi?',
        'buenos días, tengo un problema', 'buenas tardes, tengo un problema',
        'buenas noches, tengo un problema', 'buenos días tengo un problema',
        'buenas tardes tengo un problema', 'buenas noches tengo un problema',
        'tengo un problema', 'necesito ayuda', 'ayuda', 'tengo un problema con mi cuenta',
        'no puedo acceder a mi cuenta', 'problema con mi cuenta', 'problema con mi acceso'
    ];

    for (const saludo of saludos) {
        const saludoLimpio = saludo.toLowerCase().trim();
        if (textoLimpio === saludoLimpio) return true;
    }

    for (const saludo of saludos) {
        const saludoLimpio = saludo.toLowerCase().trim();
        if (textoLimpio.includes(saludoLimpio)) return true;
    }

    const palabrasClave = [
        'hola', 'problema', 'ayuda', 'cuenta', 'acceso',
        'contraseña', 'autenticador', 'disculpa', 'restablecer',
        'configurar', 'soporte', 'ayudar', 'asistencia'
    ];

    const contienePalabraClave = palabrasClave.some(palabra =>
        textoLimpio.includes(palabra)
    );

    return contienePalabraClave;
}

function formatearNombreUsuario(departamento) {
    const departamentoLimpio = departamento
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]/g, "_")
        .toLowerCase();
    return `Dep_${departamentoLimpio}`;
}

function generarContrasenaSegura() {
    const mayusculas = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const minusculas = 'abcdefghijklmnopqrstuvwxyz';
    const numeros = '0123456789';
    const simbolos = '!#$%&/()=?¡¿+*}{][-_';
    const todosCaracteres = mayusculas + minusculas + numeros + simbolos;

    let contrasena = '';
    contrasena += mayusculas[Math.floor(Math.random() * mayusculas.length)];
    contrasena += minusculas[Math.floor(Math.random() * minusculas.length)];
    contrasena += numeros[Math.floor(Math.random() * numeros.length)];
    contrasena += simbolos[Math.floor(Math.random() * simbolos.length)];

    for (let i = 4; i < 12; i++) {
        contrasena += todosCaracteres[Math.floor(Math.random() * todosCaracteres.length)];
    }

    return contrasena.split('').sort(() => Math.random() - 0.5).join('');
}

// ==================== FUNCIONES DE ESTADO ====================
async function actualizarEstado(ctx, state, nuevoEstado, metadata = {}) {
    try {
        if (!ctx || !ctx.from) return;

        const userPhone = ctx.from;

        const metadataLimpio = {};
        Object.keys(metadata).forEach(key => {
            const valor = metadata[key];
            if (valor === null ||
                typeof valor === 'string' ||
                typeof valor === 'number' ||
                typeof valor === 'boolean' ||
                Array.isArray(valor)) {
                try {
                    JSON.stringify(valor);
                    metadataLimpio[key] = valor;
                } catch (e) {
                    metadataLimpio[key] = `[${typeof valor}]`;
                }
            } else if (typeof valor === 'object') {
                const objLimpio = {};
                Object.keys(valor).forEach(subKey => {
                    const subValor = valor[subKey];
                    if (subValor === null ||
                        typeof subValor === 'string' ||
                        typeof subValor === 'number' ||
                        typeof subValor === 'boolean') {
                        objLimpio[subKey] = subValor;
                    }
                });
                metadataLimpio[key] = objLimpio;
            }
        });

        metadataLimpio.ultimaActualizacion = Date.now();

        await state.update({
            estadoUsuario: nuevoEstado,
            estadoMetadata: metadataLimpio
        });

        console.log(`✅ Estado actualizado a: ${nuevoEstado} para: ${userPhone}`);

    } catch (error) {
        console.error('❌ Error actualizando estado:', error);
    }
}

async function limpiarEstado(state) {
    try {
        const myState = await state.getMyState();
        const userPhone = state.id;

        if (userPhone) {
            timeoutManager.clearAll(userPhone);
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
        });

    } catch (error) {
        console.error('❌ Error limpiando estado:', error);
    }
}

async function redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic) {
    try {
        await limpiarEstado(state);
        return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow });
    } catch (error) {
        console.error('❌ Error en redirección al menú:', error);
        await flowDynamic('🔧 Reiniciando bot... Por favor escribe *hola* para continuar.');
        return navegarAFlujoConValidacion(ctx, 'PRINCIPAL', { state, flowDynamic, gotoFlow });
    }
}

async function verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow }) {
    if (ctx.from === CONTACTO_ADMIN) return false;

    try {
        const myState = await state.getMyState();

        if (myState?.estadoUsuario === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
            console.log(`🔒 Bloqueando mensaje de ${ctx.from} - Proceso en curso`);

            const input = ctx.body?.toLowerCase().trim();

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

            return true;
        }
    } catch (error) {
        console.error('❌ Error en verificación de estado bloqueado:', error);
    }

    return false;
}

// ==================== FUNCIONES DE MENSAJES ====================
// ==== FUNCIÓN PARA MOSTRAR OPCIONES DEL MENÚ ====
async function mostrarOpcionesMenu(flowDynamic) {
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
    '7️⃣ 👨‍💼 Gestión de Servicios (Exclusivo Trabajadores)',
    '8️⃣ 🗃️ Acceso a Base de Datos Actextita',
    '',
    '📊 *Comandos adicionales:*',
    '• *estado* - Ver el progreso de tu proceso activo',
    '• *menu* - Volver a ver este menú',
    '',
    '💡 *Escribe solo el número (1-8) o el comando*'
  ].join('\n'));
}

async function enviarAlAdmin(provider, mensaje, ctx = null) {
    try {
        const sock = provider.vendor;
        if (!sock) return false;

        const adminIdNormalizado = normalizarIdWhatsAppBusiness(CONTACTO_ADMIN);
        await sock.sendMessage(adminIdNormalizado, { text: mensaje });

        console.log('✅ Información enviada al administrador');
        return true;
    } catch (error) {
        console.error('❌ Error enviando información al administrador:', error.message);
        return false;
    }
}

// ==================== FUNCIONES DE IMÁGENES/MEDIA ====================
function esImagenValida(ctx) {
    if (!ctx || typeof ctx !== 'object') return false;

    if (ctx.message) {
        const messageKeys = Object.keys(ctx.message);
        const hasMediaMessage = messageKeys.some(key => {
            return key.includes('Message') &&
                !key.includes('conversation') &&
                !key.includes('extendedTextMessage') &&
                !key.includes('protocolMessage') &&
                !key.includes('senderKeyDistributionMessage');
        });

        if (hasMediaMessage) {
            if (ctx.message.imageMessage) return true;
            if (ctx.message.documentMessage) {
                const mimeType = ctx.message.documentMessage.mimetype;
                if (mimeType && mimeType.startsWith('image/')) return true;
            }
            if (ctx.message.viewOnceMessageV2 || ctx.message.viewOnceMessage) return true;
            return true;
        }
    }

    if (ctx.type === 'image' || ctx.type === 'sticker' || ctx.type === 'document') return true;
    if (ctx.media || ctx.hasMedia || ctx.mimetype) return true;
    if (ctx.key && ctx.key.remoteJid && ctx.key.id) return true;

    if (ctx.body) {
        const bodyLower = ctx.body.toLowerCase();
        const imageKeywords = ['foto', 'photo', 'imagen', 'image', 'cámara', 'camera', '📷', '📸'];
        if (imageKeywords.some(keyword => bodyLower.includes(keyword))) return true;
    }

    return false;
}

// ==================== FLUJOS PRINCIPALES ====================

// ==== FLUJO PRINCIPAL ====
const flowPrincipal = addKeyword([
    'hola', 'Hola', 'Hola!', 'HOLA', 'Holi', 'holi', 'holis', 'Holis',
    'holaa', 'Holaa', 'holaaa', 'Holaaa', 'holaaaa', 'Holaaaa',
    'buenos días', 'buenas tardes', 'buenas noches',
    'buenos dias', 'Buenos días', 'Buenas tardes', 'Buenas noches',
    'inicio', 'Inicio', 'comenzar', 'Comenzar', 'empezar', 'Empezar',
    'ayuda', 'Ayuda', 'start', 'Start', 'hello', 'Hello', 'hi', 'Hi'
])
.addAction(async (ctx, { flowDynamic, state, gotoFlow, provider }) => {
    ctx.from = normalizarIdWhatsAppBusiness(ctx.from);
    console.log(`🎯 FLOW PRINCIPAL - ID: ${ctx.from}`);
    
    if (ctx.from === normalizarIdWhatsAppBusiness(CONTACTO_ADMIN)) return;

    if (myState?.estadoUsuario === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
        console.log(`🔒 Usuario ${ctx.from} tiene proceso en curso`);
        await flowDynamic('🔍 Detectamos que tienes un proceso en curso. Redirigiendo...');
        return gotoFlow(flowBloqueoActivo); // Usar gotoFlow directo en lugar de navegarAFlujoConValidacion
    }
    
    // Inicializar conexiones
    await inicializarMySQL();
    await inicializarConexionRemota();
    
    // Verificar si hay proceso en curso
    const myState = await state.getMyState();
    if (myState?.estadoUsuario === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
        console.log(`🔒 Usuario ${ctx.from} tiene proceso en curso`);
        await flowDynamic('🔍 Detectamos que tienes un proceso en curso. Redirigiendo...');
        return navegarAFlujoConValidacion(ctx, 'BLOQUEO_ACTIVO', { state, flowDynamic, gotoFlow, provider });
    }
    
    // Limpiar estado anterior
    await limpiarEstado(state);
    await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_MENU);
    
    // Mensaje de bienvenida
    try {
        await flowDynamic([{
            body: '🎉 ¡Bienvenido al bot de Centro de Cómputo del ITA!',
            media: 'https://raw.githubusercontent.com/CapYAN09/ProyectosITA/main/img/Imagen_de_WhatsApp_2025-09-05_a_las_11.03.34_cdb84c7c-removebg-preview.png'
        }]);
    } catch (error) {
        await flowDynamic('🎉 ¡Bienvenido al *AguiBot* del ITA!');
    }
    
    // Mostrar menú
    await mostrarOpcionesMenu(flowDynamic);
});

// ==== FLUJO MENÚ PRINCIPAL - ACTUALIZADO ====
const flowMenu = addKeyword(['menu', 'menú', '1', '2', '3', '4', '5', '6', '8', '7', 'estado']) // 🔧 AGREGAR 'estado'
  .addAction(async (ctx, { flowDynamic, gotoFlow, state }) => {
    ctx.from = normalizarIdWhatsAppBusiness(ctx.from);

    console.log('📱 FLOW MENÚ - Mensaje recibido:', ctx.body, 'Usuario:', ctx.from);

    if (ctx.from === normalizarIdWhatsAppBusiness(CONTACTO_ADMIN)) return;

    // 🔧 VERIFICAR BLOQUEO PRIMERO
    if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
      return;
    }

    const opcion = ctx.body.trim().toLowerCase(); // 🔧 Asegurar minúsculas

    // 🔧 ACTUALIZAR ESTADO AL ESTAR EN MENÚ
    await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_MENU);

    // Si es un comando de menú, mostrar opciones
    if (opcion === 'menu' || opcion === 'menú') {
      await mostrarOpcionesMenu(flowDynamic);
      return;
    }

    // Si es "estado", procesar como comando especial
    if (opcion === 'estado') {
      await procesarOpcionMenu(opcion, flowDynamic, gotoFlow, state);
      return;
    }

    // Si es una opción numérica, procesarla
    if (['1', '2', '3', '4', '5', '6', '7', '8'].includes(opcion)) {
      await procesarOpcionMenu(opcion, flowDynamic, gotoFlow, state);
      return;
    }

    // Si no es ninguna de las anteriores, mostrar menú
    await mostrarOpcionesMenu(flowDynamic);
  });

// ==== FLUJO CAPTURA NÚMERO CONTROL (ALUMNO) ====
const flowCapturaNumeroControl = addKeyword(utils.setEvent('CAPTURA_NUMERO_CONTROL'))
.addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;
    timeoutManager.setTimeout(userPhone, async () => {
        await flowDynamic('⏱️ Tiempo agotado. Serás redirigido al menú.');
        return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, flowDynamic });
    }, 2 * 60 * 1000);
})
.addAnswer(
    '📝 Por favor escribe tu *número de control*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
        timeoutManager.clearTimeout(ctx.from);
        
        const input = ctx.body.trim();
        
        if (input.toLowerCase() === 'menu' || input.toLowerCase() === 'menú') {
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (!validarNumeroControl(input)) {
            await flowDynamic('❌ Número de control inválido. Intenta de nuevo o escribe *menú* para volver.');
            return navegarAFlujoConValidacion(ctx, 'CAPTURA_NUMERO_CONTROL', { state, flowDynamic, gotoFlow, provider });
        }
        
        await state.update({ numeroControl: input });
        await flowDynamic(`✅ Recibimos tu número de control: *${input}*`);
        
        return navegarAFlujoConValidacion(ctx, 'CAPTURA_NOMBRE', { state, flowDynamic, gotoFlow, provider });
    }
);

// ==== FLUJO CAPTURA NOMBRE ====
const flowCapturaNombre = addKeyword(utils.setEvent('CAPTURA_NOMBRE'))
.addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;
    timeoutManager.setTimeout(userPhone, async () => {
        await flowDynamic('⏱️ Tiempo agotado. Serás redirigido al menú.');
        return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, flowDynamic });
    }, 2 * 60 * 1000);
})
.addAnswer(
    '📝 Por favor escribe tu *nombre completo*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
        timeoutManager.clearTimeout(ctx.from);
        
        const input = ctx.body.trim();
        
        if (input.toLowerCase() === 'menu' || input.toLowerCase() === 'menú') {
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (!isValidText(input) || input.length < 3) {
            await flowDynamic('❌ Nombre inválido. Escribe tu nombre completo.');
            return navegarAFlujoConValidacion(ctx, 'CAPTURA_NOMBRE', { state, flowDynamic, gotoFlow, provider });
        }
        
        await state.update({ nombreCompleto: input });
        
        const myState = await state.getMyState();
        const identificacion = myState.esTrabajador ? myState.correoInstitucional : myState.numeroControl;
        
        await flowDynamic(`✅ Registramos tu nombre: *${input}*\n📧 Identificación: *${identificacion}*`);
        
        return navegarAFlujoConValidacion(ctx, 'CAPTURA_IDENTIFICACION', { state, flowDynamic, gotoFlow, provider });
    }
);

// ==== FLUJO CAPTURA CORREO TRABAJADOR ====
const flowCapturaCorreoTrabajador = addKeyword(utils.setEvent('CAPTURA_CORREO_TRABAJADOR'))
.addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;
    timeoutManager.setTimeout(userPhone, async () => {
        await flowDynamic('⏱️ Tiempo agotado. Serás redirigido al menú.');
        return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, flowDynamic });
    }, 2 * 60 * 1000);
})
.addAnswer(
    '📝 Por favor escribe tu *correo institucional* (ejemplo: nombre.apellido@aguascalientes.tecnm.mx):',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
        timeoutManager.clearTimeout(ctx.from);
        
        const input = ctx.body.trim().toLowerCase();
        
        if (input === 'menu' || input === 'menú') {
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (!validarCorreoTrabajador(input)) {
            await flowDynamic('❌ Correo institucional inválido. Debe ser: nombre.apellido@aguascalientes.tecnm.mx');
            return navegarAFlujoConValidacion(ctx, 'CAPTURA_CORREO_TRABAJADOR', { state, flowDynamic, gotoFlow, provider });
        }
        
        await state.update({ correoInstitucional: input });
        await flowDynamic(`✅ Recibimos tu correo institucional: *${input}*`);
        
        return navegarAFlujoConValidacion(ctx, 'CAPTURA_NOMBRE', { state, flowDynamic, gotoFlow, provider });
    }
);

// ==== FLUJO CAPTURA IDENTIFICACIÓN ====
const flowCapturaIdentificacion = addKeyword(utils.setEvent('CAPTURA_IDENTIFICACION'))
.addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;
    timeoutManager.setTimeout(userPhone, async () => {
        await flowDynamic('⏱️ Tiempo agotado. Serás redirigido al menú.');
        return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, flowDynamic });
    }, 4 * 60 * 1000);
})
.addAnswer(
    [
        '📸 *VERIFICACIÓN DE IDENTIDAD*\n\n',
        'Es importante que solamente respondas con la fotografía de tu credencial escolar del ITA. No envíes mensajes de texto ni otros tipos de archivos.\n',
        'En caso de no contar con tu credencial escolar, puedes enviar una identificación oficial vigente con fotografía (INE, pasaporte, cédula profesional, etc.)\n\n',
        '⚠️ **IMPORTANTE PARA FOTOS DESDE WHATSAPP:**\n',
        '• Usa la cámara de tu celular, NO la computadora\n',
        '• Toca el ícono de 📎 (clip)\n',
        '• Selecciona "Cámara" o "Camera"\n',
        '• Toma una foto NUEVA de tu credencial\n',
        '• Asegúrate de que sea CLARA y legible\n\n',
        '⏰ **Tienes 4 minutos** para enviar la fotografía'
    ].join(''),
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
        timeoutManager.clearTimeout(ctx.from);
        
        if (!esImagenValida(ctx)) {
            await flowDynamic([
                '❌ *No recibimos una fotografía válida*\n\n',
                '⚠️ **Para WhatsApp Web/Desktop:**\n',
                '1. Usa tu CELULAR para tomar la foto\n',
                '2. Toca el clip 📎 en WhatsApp\n',
                '3. Selecciona "Cámara" (NO "Galería")\n',
                '4. Toma foto NUEVA de tu credencial\n',
                '5. Envíala directamente\n\n',
                '🔄 **Intenta de nuevo por favor.**'
            ].join(''));
            return navegarAFlujoConValidacion(ctx, 'CAPTURA_IDENTIFICACION', { state, flowDynamic, gotoFlow, provider });
        }
        
        await state.update({
            identificacionSubida: true,
            timestampIdentificacion: Date.now(),
            fotoEnVivo: true
        });
        
        await flowDynamic('✅ *¡Perfecto! Foto tomada correctamente con la cámara*\n\n📋 Continuando con el proceso...');
        
        // Determinar si es para contraseña o autenticador
        const myState = await state.getMyState();
        const tipoProceso = myState.tipoProceso || 'CONTRASENA';
        
        if (tipoProceso === 'AUTENTICADOR') {
            return navegarAFlujoConValidacion(ctx, 'FLOW_AUTENTICADOR', { state, flowDynamic, gotoFlow, provider });
        } else {
            return navegarAFlujoConValidacion(ctx, 'FLOW_CONTRASENA', { state, flowDynamic, gotoFlow, provider });
        }
    }
);

// ==== FLUJO CONTRASEÑA FINAL ====
const flowContrasena = addKeyword(utils.setEvent('FLOW_CONTRASENA'))
.addAction(async (ctx, { state, flowDynamic, provider, gotoFlow }) => {
    const myState = await state.getMyState();
    const nombreCompleto = myState.nombreCompleto;
    const esTrabajador = myState.esTrabajador || false;
    const identificacion = esTrabajador ? myState.correoInstitucional : myState.numeroControl;
    
    if (!nombreCompleto || !identificacion) {
        await flowDynamic('❌ Información incompleta. Volviendo al inicio.');
        return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, provider });
    }
    
    await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
        tipo: "🔐 Restablecimiento de Contraseña",
        inicio: Date.now(),
        esTrabajador: esTrabajador
    });
    
    // Guardar estado en MySQL
    await guardarEstadoMySQL(ctx.from, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
        tipo: "Restablecimiento de Contraseña",
        inicio: Date.now()
    }, {
        numeroControl: myState.numeroControl,
        nombreCompleto: myState.nombreCompleto,
        identificacionSubida: myState.identificacionSubida,
        timestampIdentificacion: myState.timestampIdentificacion
    });
    
    // Enviar notificación al admin
    const tipoUsuario = esTrabajador ? "Trabajador" : "Alumno";
    const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE RESTABLECIMIENTO DE CONTRASEÑA DEL CORREO INSTITUCIONAL.* 🔔\n\n📋 *Información del usuario:*\n👤 Nombre: ${nombreCompleto}\n👥 Tipo: ${tipoUsuario}\n📧 ${esTrabajador ? 'Correo' : 'Número de control'}: ${identificacion}\n📞 Teléfono: ${ctx.from}\n🆔 Identificación: ${myState.identificacionSubida ? '✅ SUBIDA' : '❌ PENDIENTE'}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n🔐 Contraseña temporal asignada: *SoporteCC1234$*\n💾 *MySQL:* ✅ CONECTADO\n🔗 *Remoto:* ${conexionRemota ? '✅ CONECTADO' : '❌ DESCONECTADO'}\n\n⚠️ Reacciona para validar que está listo`;
    
    await enviarAlAdmin(provider, mensajeAdmin);
    
    await flowDynamic('⏳ Permítenos un momento, vamos a restablecer tu contraseña... \n\n *Te solicitamos no enviar mensajes en lo que realizamos este proceso, este proceso durará aproximadamente 30 minutos.*');
    
    // Configurar intervalo de notificaciones
    let minutosRestantes = 30;
    
    const intervalId = setInterval(async () => {
        minutosRestantes -= 10;
        if (minutosRestantes > 0) {
            try {
                await flowDynamic(`⏳ Hola *${nombreCompleto}*, faltan *${minutosRestantes} minutos* para completar el proceso...`);
            } catch (error) {
                console.error('❌ Error enviando notificación:', error.message);
            }
        }
    }, 10 * 60 * 1000);
    
    const timeoutId = setTimeout(async () => {
        clearInterval(intervalId);
        
        try {
            const correoUsuario = esTrabajador ? identificacion : `${identificacion}@aguascalientes.tecnm.mx`;
            
            await flowDynamic([
                '✅ *¡Contraseña restablecida exitosamente!* ✅',
                '',
                '📋 **Tu nueva contraseña temporal:**',
                '🔐 *SoporteCC1234$*',
                '',
                '💡 **Instrucciones para acceder:**',
                '*Te recomendamos que este primer inicio de sesión lo realices desde tu computadora*',
                '',
                '1. Cierra la pestaña actual donde intentabas acceder al correo',
                '2. Ingresa a: https://office.com o https://login.microsoftonline.com/?whr=tecnm.mx',
                '3. Ingresa tu correo institucional: ' + correoUsuario,
                '4. Usa la contraseña temporal: *SoporteCC1234$*',
                '5. Te solicitará cambiar la contraseña:',
                '   - Contraseña actual: *SoporteCC1234$*',
                '   - Nueva contraseña: (crea una personalizada)',
                '',
                '🔒 **Recomendaciones de seguridad:**',
                '• Mínimo 11 caracteres',
                '• Incluye mayúsculas, minúsculas, números y símbolos (%$#!&/-_.*+)',
                '• No compartas tu contraseña',
                '',
                '🔙 Escribe *menú* para volver al menú principal.'
            ].join('\n'));
            
        } catch (error) {
            console.error('❌ Error enviando mensaje final:', error.message);
            await flowDynamic('✅ Se ha completado el proceso. Por favor verifica tu correo institucional.');
        }
        
        await limpiarEstado(state);
        await limpiarEstadoMySQL(ctx.from);
        
    }, 30 * 60 * 1000);
    
    await state.update({
        estadoMetadata: {
            ...(await state.getMyState())?.estadoMetadata,
            timeoutId: timeoutId,
            intervalId: intervalId
        }
    });
    
    return navegarAFlujoConValidacion(ctx, 'BLOQUEO_ACTIVO', { state, flowDynamic, gotoFlow, provider });
});

// ==== FLUJO SUBMENÚ AUTENTICADOR ====
const flowSubMenuAutenticador = addKeyword(utils.setEvent('SUBMENU_AUTENTICADOR'))
.addAnswer(
    '🔑 *RESTABLECIMIENTO DE AUTENTICADOR*\n\n' +
    'Una vez comenzado este proceso no podrá ser detenido hasta completarse.\n\n' +
    '👥 *Selecciona tu tipo de usuario:*\n\n' +
    '1️⃣ ¿Eres un estudiante?\n' +
    '2️⃣ ¿Eres un trabajador o docente?\n\n' +
    '🔙 Escribe *menú* para volver al menú principal.',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
        const opcion = ctx.body.trim().toLowerCase();
        
        if (opcion === 'menu' || opcion === 'menú') {
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (opcion === '1') {
            await flowDynamic('🎓 Perfecto, eres alumno. Vamos a comenzar con el proceso...');
            await state.update({ esTrabajador: false, tipoProceso: 'AUTENTICADOR' });
            return navegarAFlujoConValidacion(ctx, 'CAPTURA_NUMERO_CONTROL', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (opcion === '2') {
            await flowDynamic('👨‍💼 Perfecto, eres trabajador. Vamos a comenzar con el proceso...');
            await state.update({ esTrabajador: true, tipoProceso: 'AUTENTICADOR' });
            return navegarAFlujoConValidacion(ctx, 'CAPTURA_CORREO_TRABAJADOR', { state, flowDynamic, gotoFlow, provider });
        }
        
        await flowDynamic('❌ Opción no válida. Escribe *1* o *2*.');
        return navegarAFlujoConValidacion(ctx, 'SUBMENU_AUTENTICADOR', { state, flowDynamic, gotoFlow, provider });
    }
);

// ==== FLUJO AUTENTICADOR FINAL ====
const flowAutenticador = addKeyword(utils.setEvent('FLOW_AUTENTICADOR'))
.addAction(async (ctx, { state, flowDynamic, provider, gotoFlow }) => {
    const myState = await state.getMyState();
    const nombreCompleto = myState.nombreCompleto;
    const esTrabajador = myState.esTrabajador || false;
    const identificacion = esTrabajador ? myState.correoInstitucional : myState.numeroControl;
    
    if (!nombreCompleto || !identificacion) {
        await flowDynamic('❌ Información incompleta. Volviendo al inicio.');
        return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, provider });
    }
    
    await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
        tipo: "🔑 Configuración de Autenticador",
        inicio: Date.now(),
        esTrabajador: esTrabajador
    });
    
    // Guardar estado en MySQL
    await guardarEstadoMySQL(ctx.from, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
        tipo: "Configuración de Autenticador",
        inicio: Date.now()
    }, {
        numeroControl: myState.numeroControl,
        nombreCompleto: myState.nombreCompleto,
        identificacionSubida: myState.identificacionSubida,
        timestampIdentificacion: myState.timestampIdentificacion
    });
    
    // Enviar notificación al admin
    const tipoUsuario = esTrabajador ? "Trabajador" : "Alumno";
    const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE DESHABILITAR EL AUTENTICADOR DEL CORREO INSTITUCIONAL.* 🔔\n\n📋 *Información del usuario:*\n👤 Nombre: ${nombreCompleto}\n👥 Tipo: ${tipoUsuario}\n📧 ${esTrabajador ? 'Correo' : 'Número de control'}: ${identificacion}\n📞 Teléfono: ${ctx.from}\n🆔 Identificación: ${myState.identificacionSubida ? '✅ SUBIDA' : '❌ PENDIENTE'}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n💾 *MySQL:* ✅ CONECTADO\n🔗 *Remoto:* ${conexionRemota ? '✅ CONECTADO' : '❌ DESCONECTADO'}\n\n⚠️ *Proceso en curso...*`;
    
    await enviarAlAdmin(provider, mensajeAdmin);
    
    await flowDynamic('⏳ Permítenos un momento, vamos a desconfigurar tu autenticador... \n\n *Te solicitamos no enviar mensajes en lo que realizamos este proceso, este proceso durará aproximadamente 30 minutos.*');
    
    // Configurar intervalo de notificaciones
    let minutosRestantes = 30;
    
    const intervalId = setInterval(async () => {
        minutosRestantes -= 10;
        if (minutosRestantes > 0) {
            try {
                await flowDynamic(`⏳ Hola *${nombreCompleto}*, faltan *${minutosRestantes} minutos* para completar la configuración del autenticador...`);
            } catch (error) {
                console.error('❌ Error enviando notificación:', error.message);
            }
        }
    }, 10 * 60 * 1000);
    
    const timeoutId = setTimeout(async () => {
        clearInterval(intervalId);
        
        try {
            const correoUsuario = esTrabajador ? identificacion : `${identificacion}@aguascalientes.tecnm.mx`;
            
            await flowDynamic([
                '✅ *Autenticador desconfigurado correctamente* ✅',
                '',
                '💡 **Instrucciones para reconfigurar:**',
                '*Es importante que estos pasos los realices en una computadora*',
                '',
                '1. Cierra la pestaña actual donde intentabas acceder al correo',
                '2. Ingresa a: https://office.com o https://login.microsoftonline.com/?whr=tecnm.mx',
                '3. Ingresa tu correo institucional: ' + correoUsuario,
                '4. Ingresa tu contraseña actual',
                '5. Te aparecerá una página para reconfigurar tu autenticador',
                '6. Sigue los pasos que se muestran en pantalla',
                '',
                '📱 **Necesitarás:**',
                '• Configurar la aplicación de autenticador',
                '• Ingresar un número de teléfono',
                '',
                '🔒 **Será necesario configurar un nuevo método de autenticación**',
                '',
                '🔙 Escribe *menú* para volver al menú principal.'
            ].join('\n'));
            
        } catch (error) {
            console.error('❌ Error enviando mensaje final:', error.message);
            await flowDynamic('✅ Se ha completado el proceso. Por favor verifica tu correo institucional.');
        }
        
        await limpiarEstado(state);
        await limpiarEstadoMySQL(ctx.from);
        
    }, 30 * 60 * 1000);
    
    await state.update({
        estadoMetadata: {
            ...(await state.getMyState())?.estadoMetadata,
            timeoutId: timeoutId,
            intervalId: intervalId
        }
    });
    
    return navegarAFlujoConValidacion(ctx, 'BLOQUEO_ACTIVO', { state, flowDynamic, gotoFlow, provider });
});

// ==== FLUJO GESTIÓN DE SERVICIOS ====
const flowGestionServicios = addKeyword(utils.setEvent('GESTION_SERVICIOS'))
.addAnswer(
    [
        '👨‍💼 *GESTIÓN DE SERVICIOS - EXCLUSIVO TRABAJADORES* 👨‍💼',
        '',
        'Selecciona el servicio que necesitas:',
        '',
        '1️⃣ 🔐 Restablecimiento de contraseña de acceso del sistema',
        '2️⃣ 👤 Solicitar creación de nuevo usuario para acceder',
        '3️⃣ 🔍 Consultar información de usuarios (BD Remota)',
        '',
        '🔙 Escribe *menú* para volver al menú principal.'
    ].join('\n'),
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
        const opcion = ctx.body.trim().toLowerCase();
        
        if (opcion === 'menu' || opcion === 'menú') {
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (opcion === '1') {
            await flowDynamic('🔐 Iniciando proceso de restablecimiento de contraseña de acceso del sistema...');
            return navegarAFlujoConValidacion(ctx, 'RESTABLECIMIENTO_SISTEMA', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (opcion === '2') {
            await flowDynamic('👤 Iniciando proceso de solicitud de nuevo usuario...');
            return navegarAFlujoConValidacion(ctx, 'NUEVO_USUARIO', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (opcion === '3') {
            await flowDynamic('🔍 Iniciando consulta de información de usuarios...\n\n🔗 *Conectando a 172.30.247.185*');
            return navegarAFlujoConValidacion(ctx, 'CONSULTA_USUARIO', { state, flowDynamic, gotoFlow, provider });
        }
        
        await flowDynamic('❌ Opción no válida. Escribe *1*, *2* o *3*.');
        return navegarAFlujoConValidacion(ctx, 'GESTION_SERVICIOS', { state, flowDynamic, gotoFlow, provider });
    }
);

// ==== FLUJO RESTABLECIMIENTO SISTEMA ====
const flowRestablecimientoSistema = addKeyword(utils.setEvent('RESTABLECIMIENTO_SISTEMA'))
.addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;
    timeoutManager.setTimeout(userPhone, async () => {
        try {
            console.log('⏱️ Timeout de 2 minutos en restablecimiento sistema');
            await flowDynamic('⏱️ Tiempo agotado. Serás redirigido al menú.');
            await limpiarEstado(state);
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, flowDynamic });
        } catch (error) {
            console.error('❌ Error en timeout de captura:', error);
        }
    }, 2 * 60 * 1000);
})
.addAnswer(
    '📝 Por favor escribe tu *nombre completo*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
        timeoutManager.clearTimeout(ctx.from);
        
        const input = ctx.body.trim();
        
        if (input.toLowerCase() === 'menu' || input.toLowerCase() === 'menú') {
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (!input || input === '') {
            await flowDynamic('❌ No recibimos tu nombre completo. Por favor escríbelo.');
            return navegarAFlujoConValidacion(ctx, 'RESTABLECIMIENTO_SISTEMA', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (!isValidText(input) || !/^[a-zA-ZÁÉÍÓÚÑáéíóúñ\s]+$/.test(input)) {
            await flowDynamic('❌ Solo texto válido. Escribe tu *nombre completo*.');
            return navegarAFlujoConValidacion(ctx, 'RESTABLECIMIENTO_SISTEMA', { state, flowDynamic, gotoFlow, provider });
        }
        
        await state.update({ nombreCompleto: input });
        await flowDynamic(`✅ Recibimos tu nombre: *${input}*`);
        
        return navegarAFlujoConValidacion(ctx, 'CAPTURA_DEPARTAMENTO', { state, flowDynamic, gotoFlow, provider });
    }
);

// ==== FLUJO CAPTURA DEPARTAMENTO ====
const flowCapturaDepartamento = addKeyword(utils.setEvent('CAPTURA_DEPARTAMENTO'))
.addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;
    timeoutManager.setTimeout(userPhone, async () => {
        try {
            console.log('⏱️ Timeout de 2 minutos en departamento');
            await flowDynamic('⏱️ Tiempo agotado. Serás redirigido al menú.');
            await limpiarEstado(state);
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, flowDynamic });
        } catch (error) {
            console.error('❌ Error en timeout de captura:', error);
        }
    }, 2 * 60 * 1000);
})
.addAnswer(
    '🏢 Por favor escribe el *departamento al que perteneces*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
        timeoutManager.clearTimeout(ctx.from);
        
        const input = ctx.body.trim();
        
        if (input.toLowerCase() === 'menu' || input.toLowerCase() === 'menú') {
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (!input || input === '') {
            await flowDynamic('❌ No recibimos el departamento. Por favor escríbelo.');
            return navegarAFlujoConValidacion(ctx, 'CAPTURA_DEPARTAMENTO', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (!isValidText(input)) {
            await flowDynamic('❌ Texto inválido. Escribe el *nombre del departamento*.');
            return navegarAFlujoConValidacion(ctx, 'CAPTURA_DEPARTAMENTO', { state, flowDynamic, gotoFlow, provider });
        }
        
        await state.update({ departamento: input });
        await flowDynamic(`✅ Recibimos tu departamento: *${input}*`);
        
        return navegarAFlujoConValidacion(ctx, 'CAPTURA_USUARIO_SISTEMA', { state, flowDynamic, gotoFlow, provider });
    }
);

// ==== FLUJO CAPTURA USUARIO SISTEMA ====
const flowCapturaUsuarioSistema = addKeyword(utils.setEvent('CAPTURA_USUARIO_SISTEMA'))
.addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;
    timeoutManager.setTimeout(userPhone, async () => {
        try {
            console.log('⏱️ Timeout de 2 minutos en usuario sistema');
            await flowDynamic('⏱️ Tiempo agotado. Serás redirigido al menú.');
            await limpiarEstado(state);
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, flowDynamic });
        } catch (error) {
            console.error('❌ Error en timeout de captura:', error);
        }
    }, 2 * 60 * 1000);
})
.addAnswer(
    '👤 Por favor escribe tu *nombre de usuario del sistema* (el que usas para iniciar sesión):',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
        timeoutManager.clearTimeout(ctx.from);
        
        const input = ctx.body.trim();
        
        if (input.toLowerCase() === 'menu' || input.toLowerCase() === 'menú') {
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (!input || input === '') {
            await flowDynamic('❌ No recibimos tu usuario del sistema. Por favor escríbelo.');
            return navegarAFlujoConValidacion(ctx, 'CAPTURA_USUARIO_SISTEMA', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (!isValidText(input)) {
            await flowDynamic('❌ Texto inválido. Escribe tu *nombre de usuario del sistema*.');
            return navegarAFlujoConValidacion(ctx, 'CAPTURA_USUARIO_SISTEMA', { state, flowDynamic, gotoFlow, provider });
        }
        
        await flowDynamic('🔍 Verificando usuario en el sistema...');
        
        try {
            await inicializarConexionRemota();
            if (!conexionRemota) {
                await flowDynamic('❌ Error de conexión a la base de datos. Intenta más tarde.');
                return navegarAFlujoConValidacion(ctx, 'GESTION_SERVICIOS', { state, flowDynamic, gotoFlow, provider });
            }
            
            const queryVerificar = `SELECT id_usuario, usuario, ubicacion FROM usuariosprueba WHERE usuario = ?`;
            const [usuarios] = await conexionRemota.execute(queryVerificar, [input]);
            
            if (usuarios.length === 0) {
                await flowDynamic([
                    '❌ *Usuario no encontrado*',
                    '',
                    `El usuario *${input}* no existe en el sistema.`,
                    '',
                    '💡 **Verifica:**',
                    '• Que escribiste correctamente tu usuario',
                    '• Que el usuario existe en el sistema',
                    '',
                    '🔄 Intenta de nuevo o escribe *menú* para volver.'
                ].join('\n'));
                return navegarAFlujoConValidacion(ctx, 'CAPTURA_USUARIO_SISTEMA', { state, flowDynamic, gotoFlow, provider });
            }
            
            const usuarioInfo = usuarios[0];
            await flowDynamic([
                '✅ *Usuario verificado*',
                '',
                `👤 Usuario: ${usuarioInfo.usuario}`,
                `📍 Ubicación: ${usuarioInfo.ubicacion || 'No especificada'}`,
                '',
                '🔄 Generando nueva contraseña...'
            ].join('\n'));
            
        } catch (error) {
            console.error('❌ Error verificando usuario:', error.message);
            await flowDynamic('❌ Error al verificar el usuario. Intenta más tarde.');
            return navegarAFlujoConValidacion(ctx, 'GESTION_SERVICIOS', { state, flowDynamic, gotoFlow, provider });
        }
        
        const nuevaContrasena = generarContrasenaSegura();
        
        await state.update({
            usuarioSistema: input,
            nuevaContrasena: nuevaContrasena
        });
        
        await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
            tipo: "🔐 Restablecimiento de Contraseña del Sistema",
            inicio: Date.now(),
            esTrabajador: true
        });
        
        const myState = await state.getMyState();
        const nombreCompleto = myState.nombreCompleto;
        const departamento = myState.departamento;
        const usuarioSistema = myState.usuarioSistema;
        
        await flowDynamic('🔄 Actualizando contraseña en el sistema...');
        
        const actualizacionExitosa = await actualizarContrasenaEnusuariosprueba(
            usuarioSistema,
            nuevaContrasena,
            ctx.from
        );
        
        const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE RESTABLECIMIENTO DE CONTRASEÑA DEL SISTEMA* 🔔\n\n📋 *Información del trabajador:*\n👤 Nombre: ${nombreCompleto}\n🏢 Departamento: ${departamento}\n👤 Usuario del sistema: ${usuarioSistema}\n🔐 *Nueva contraseña generada:* ${nuevaContrasena}\n📞 Teléfono: ${ctx.from}\n💾 *BD Remota:* ${actualizacionExitosa ? '✅ ACTUALIZADO' : '❌ ERROR'}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n\n⚠️ *Proceso en curso...*`;
        
        const envioExitoso = await enviarAlAdmin(provider, mensajeAdmin);
        
        if (envioExitoso) {
            await flowDynamic([
                '✅ *Solicitud registrada correctamente*',
                '',
                '📋 **Resumen de tu solicitud:**',
                `👤 Nombre: ${nombreCompleto}`,
                `🏢 Departamento: ${departamento}`,
                `👤 Usuario: ${usuarioSistema}`,
                `💾 *Estado BD:* ${actualizacionExitosa ? '✅ Actualizado' : '⚠️ Pendiente'}`,
                '',
                '⏳ *Por favor espera aproximadamente 30 minutos*',
                'Nuestro equipo está procesando tu solicitud de restablecimiento de contraseña del sistema.',
                '',
                '🔒 **Tu solicitud está siendo atendida**',
                'Te notificaremos cuando el proceso esté completo.'
            ].join('\n'));
        } else {
            await flowDynamic('⚠️ Hemos registrado tu solicitud. Si no recibes respuesta, contacta directamente al centro de cómputo.');
        }
        
        let minutosRestantes = 30;
        
        const intervalId = setInterval(async () => {
            minutosRestantes -= 10;
            if (minutosRestantes > 0) {
                try {
                    await flowDynamic(`⏳ Hola *${nombreCompleto}*, faltan *${minutosRestantes} minutos* para completar el restablecimiento de tu contraseña...`);
                } catch (error) {
                    console.error('❌ Error enviando notificación:', error.message);
                }
            }
        }, 10 * 60 * 1000);
        
        const timeoutId = setTimeout(async () => {
            clearInterval(intervalId);
            
            try {
                await flowDynamic([
                    '✅ *Contraseña restablecida correctamente*',
                    '',
                    '📋 **Tus nuevas credenciales de acceso:**',
                    `👤 *Usuario:* \`${usuarioSistema}\``,
                    `🔐 *Contraseña:* \`${nuevaContrasena}\``,
                    `💾 *Base de datos:* ${actualizacionExitosa ? '✅ Actualizado' : '⚠️ Contactar soporte'}`,
                    '',
                    '🔒 **Instrucciones importantes:**',
                    '• Recibirás un correo con la confirmación',
                    '• Cambia tu contraseña después del primer inicio de sesión',
                    '• La contraseña es temporal por seguridad',
                    '',
                    '🔙 Escribe *menú* para volver al menú principal.'
                ].join('\n'));
            } catch (error) {
                console.error('❌ Error enviando mensaje final:', error.message);
            }
            
            await limpiarEstado(state);
        }, 30 * 60 * 1000);
        
        await state.update({
            estadoMetadata: {
                ...(await state.getMyState())?.estadoMetadata,
                timeoutId: timeoutId,
                intervalId: intervalId
            }
        });
        
        timeoutManager.clearTimeout(ctx.from);
        return navegarAFlujoConValidacion(ctx, 'BLOQUEO_ACTIVO', { state, flowDynamic, gotoFlow, provider });
    }
);

// ==== FLUJO NUEVO USUARIO ====
const flowNuevoUsuario = addKeyword(utils.setEvent('NUEVO_USUARIO'))
.addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;
    timeoutManager.setTimeout(userPhone, async () => {
        try {
            console.log('⏱️ Timeout de 2 minutos en nuevo usuario');
            await flowDynamic('⏱️ Tiempo agotado. Serás redirigido al menú.');
            await limpiarEstado(state);
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, flowDynamic });
        } catch (error) {
            console.error('❌ Error en timeout de captura:', error);
        }
    }, 2 * 60 * 1000);
})
.addAnswer(
    '📝 Por favor escribe tu *nombre completo*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
        timeoutManager.clearTimeout(ctx.from);
        
        const input = ctx.body.trim();
        
        if (input.toLowerCase() === 'menu' || input.toLowerCase() === 'menú') {
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (!input || input === '') {
            await flowDynamic('❌ No recibimos tu nombre completo. Por favor escríbelo.');
            return navegarAFlujoConValidacion(ctx, 'NUEVO_USUARIO', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (!isValidText(input) || !/^[a-zA-ZÁÉÍÓÚÑáéíóúñ\s]+$/.test(input)) {
            await flowDynamic('❌ Solo texto válido. Escribe tu *nombre completo*.');
            return navegarAFlujoConValidacion(ctx, 'NUEVO_USUARIO', { state, flowDynamic, gotoFlow, provider });
        }
        
        await state.update({ nombreCompleto: input });
        await flowDynamic(`✅ Recibimos tu nombre: *${input}*`);
        
        return navegarAFlujoConValidacion(ctx, 'CAPTURA_AREA', { state, flowDynamic, gotoFlow, provider });
    }
);

// ==== FLUJO CAPTURA ÁREA ====
const flowCapturaArea = addKeyword(utils.setEvent('CAPTURA_AREA'))
.addAction(async (ctx, { state, flowDynamic, gotoFlow, provider }) => {
    const userPhone = ctx.from;
    timeoutManager.setTimeout(userPhone, async () => {
        try {
            console.log('⏱️ Timeout de 2 minutos en área');
            await flowDynamic('⏱️ Tiempo agotado. Serás redirigido al menú.');
            await limpiarEstado(state);
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, flowDynamic });
        } catch (error) {
            console.error('❌ Error en timeout de captura:', error);
        }
    }, 2 * 60 * 1000);
})
.addAnswer(
    '🏢 Por favor escribe el *área a la que perteneces*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
        timeoutManager.clearTimeout(ctx.from);
        
        const input = ctx.body.trim();
        
        if (input.toLowerCase() === 'menu' || input.toLowerCase() === 'menú') {
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (!input || input === '') {
            await flowDynamic('❌ No recibimos el área. Por favor escríbelo.');
            return navegarAFlujoConValidacion(ctx, 'CAPTURA_AREA', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (!isValidText(input)) {
            await flowDynamic('❌ Texto inválido. Escribe el *nombre del área*.');
            return navegarAFlujoConValidacion(ctx, 'CAPTURA_AREA', { state, flowDynamic, gotoFlow, provider });
        }
        
        const myState = await state.getMyState();
        const nombreCompleto = myState.nombreCompleto;
        const userPhone = ctx.from;
        
        if (!nombreCompleto) {
            await flowDynamic('❌ Error: No tenemos tu nombre completo. Volviendo al inicio.');
            return navegarAFlujoConValidacion(ctx, 'NUEVO_USUARIO', { state, flowDynamic, gotoFlow, provider });
        }
        
        const nuevoUsuario = formatearNombreUsuario(input);
        const nuevaContrasena = generarContrasenaSegura();
        
        console.log(`🔧 Generando nuevo usuario: ${nuevoUsuario} para ${nombreCompleto}`);
        
        let insercionExitosa = false;
        
        try {
            console.log(`📝 INSERTANDO DIRECTAMENTE en usuariosprueba: ${nuevoUsuario}`);
            
            insercionExitosa = await insertarUsuarioDirectoEnusuariosprueba(
                nombreCompleto,
                input,
                nuevoUsuario,
                nuevaContrasena,
                userPhone
            );
            
            console.log(`✅ Resultado inserción DIRECTA usuariosprueba: ${insercionExitosa}`);
            
        } catch (error) {
            console.error('❌ Error insertando DIRECTAMENTE en usuariosprueba:', error.message);
            insercionExitosa = false;
        }
        
        const metadataProceso = {
            tipo: "👤 Solicitud de Nuevo Usuario del Sistema",
            inicio: Date.now(),
            esTrabajador: true,
            area: input,
            nuevoUsuario: nuevoUsuario,
            nuevaContrasena: nuevaContrasena,
            notificacionesEnviadas: 0,
            usuarioInsertado: insercionExitosa,
            tieneNotificacionesActivas: true,
            procesoIniciado: Date.now()
        };
        
        await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_PROCESO_LARGO, metadataProceso);
        
        const mensajeAdmin = `🔔 *SOLICITUD DE CREACIÓN DE NUEVO USUARIO* 🔔\n\n📋 *Información del trabajador:*\n👤 Nombre: ${nombreCompleto}\n🏢 Área: ${input}\n👤 *Nuevo usuario generado:* ${nuevoUsuario}\n🔐 *Contraseña generada:* ${nuevaContrasena}\n📞 Teléfono: ${userPhone}\n💾 *INSERTADO EN usuariosprueba:* ${insercionExitosa ? '✅ EXITOSO' : '❌ FALLÓ'}\n🏠 *Servidor:* 172.30.247.184\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n\n⚠️ *Proceso en curso...*`;
        
        const envioExitoso = await enviarAlAdmin(provider, mensajeAdmin);
        
        await flowDynamic([
            '✅ *Solicitud registrada correctamente*',
            '',
            '📋 **Resumen de tu solicitud:**',
            `👤 Nombre: ${nombreCompleto}`,
            `🏢 Área: ${input}`,
            `👤 Usuario generado: ${nuevoUsuario}`,
            `💾 *Estado inserción:* ${insercionExitosa ? '✅ EXITOSA - Usuario creado' : '❌ FALLÓ - Contactar soporte'}`,
            '',
            insercionExitosa
                ? '🎉 *¡Usuario creado exitosamente en el sistema!*'
                : '⚠️ *Error al crear usuario, contacta a soporte*',
            '',
            '⏳ *Procesando configuración final... (30 minutos)*'
        ].join('\n'));
        
        if (insercionExitosa) {
            let notificacionesEnviadas = 0;
            const maxNotificaciones = 3;
            
            console.log(`🔔 Iniciando notificaciones para ${userPhone} - ${nombreCompleto}`);
            
            timeoutManager.setInterval(userPhone, async () => {
                notificacionesEnviadas++;
                const minutosTranscurridos = notificacionesEnviadas * 10;
                const minutosRestantes = 30 - minutosTranscurridos;
                
                const estadoActual = await obtenerEstadoMySQL(userPhone);
                if (!estadoActual || estadoActual.estadoUsuario !== ESTADOS_USUARIO.EN_PROCESO_LARGO) {
                    console.log(`⚠️ Usuario ${userPhone} ya no está en proceso, deteniendo notificaciones`);
                    timeoutManager.clearInterval(userPhone);
                    return;
                }
                
                if (minutosRestantes > 0) {
                    try {
                        console.log(`🔔 Enviando notificación ${notificacionesEnviadas}/${maxNotificaciones} para ${userPhone}`);
                        await flowDynamic(
                            `⏳ Hola *${nombreCompleto}*, han pasado *${minutosTranscurridos} minutos*. ` +
                            `Faltan *${minutosRestantes} minutos* para completar la configuración...\n\n` +
                            `👤 Usuario: ${nuevoUsuario}\n` +
                            `🏢 Área: ${input}\n` +
                            `✅ Usuario insertado en sistema\n` +
                            `🔄 Configuración en progreso...`
                        );
                        
                        await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
                            ...metadataProceso,
                            notificacionesEnviadas: notificacionesEnviadas,
                            ultimaNotificacion: Date.now()
                        });
                        
                    } catch (error) {
                        console.error('❌ Error enviando notificación:', error.message);
                    }
                } else {
                    timeoutManager.clearInterval(userPhone);
                }
            }, 10 * 60 * 1000);
            
            timeoutManager.setTimeout(userPhone, async () => {
                timeoutManager.clearInterval(userPhone);
                
                try {
                    const estadoActual = await state.getMyState();
                    if (!estadoActual || estadoActual.estadoUsuario !== ESTADOS_USUARIO.EN_PROCESO_LARGO) {
                        console.log('⚠️ Usuario ya no está en proceso, omitiendo mensaje final');
                        return;
                    }
                    
                    console.log(`✅ Enviando mensaje final a ${userPhone} - ${nombreCompleto}`);
                    
                    await flowDynamic([
                        '🎉 *¡Configuración completada exitosamente!* 🎉',
                        '',
                        '📋 **Tus credenciales de acceso:**',
                        `👤 *Usuario:* \`${nuevoUsuario}\``,
                        `🔐 *Contraseña:* \`${nuevaContrasena}\``,
                        `✅ *Estado:* Usuario activo en sistema`,
                        '',
                        '🔒 **Instrucciones importantes:**',
                        '• Esta contraseña es temporal - cámbiala después del primer acceso',
                        '• Ya puedes usar tus credenciales para acceder al sistema',
                        '• Guarda estas credenciales en un lugar seguro',
                        '',
                        '🔙 Escribe *menú* para volver al menú principal.'
                    ].join('\n'));
                    
                } catch (error) {
                    console.error('❌ Error enviando mensaje final:', error.message);
                }
                
                await limpiarEstado(state);
                await limpiarEstadoMySQL(userPhone);
                
            }, 30 * 60 * 1000);
            
        } else {
            await flowDynamic([
                '❌ *Error en la creación del usuario*',
                '',
                '⚠️ No pudimos crear tu usuario en el sistema.',
                'Por favor contacta al centro de cómputo para asistencia:',
                '',
                '📞 **Centro de cómputo:** 449 910 50 02 EXT. 145',
                '',
                '🔙 Escribe *menú* para volver al menú principal.'
            ].join('\n'));
            
            await limpiarEstado(state);
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, provider });
        }
        
        timeoutManager.clearTimeout(userPhone);
        return navegarAFlujoConValidacion(ctx, 'BLOQUEO_ACTIVO', { state, flowDynamic, gotoFlow, provider });
    }
);

// ==== FLUJO CONSULTA USUARIO ====
const flowConsultaUsuario = addKeyword(utils.setEvent('CONSULTA_USUARIO'))
.addAnswer(
    '🔍 *CONSULTA DE USUARIOS - usuariosprueba* 🔍\n\nSelecciona una opción:\n\n1️⃣ 🔎 Buscar usuario específico\n2️⃣ 📋 Listar todos los usuarios\n\n🔙 Escribe *menú* para volver al menú principal.',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
        const opcion = ctx.body.trim().toLowerCase();
        
        if (opcion === 'menu' || opcion === 'menú') {
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (opcion === '1') {
            await flowDynamic('🔎 Iniciando búsqueda de usuario específico...');
            return navegarAFlujoConValidacion(ctx, 'BUSCAR_USUARIO_ESPECIFICO', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (opcion === '2') {
            await flowDynamic('📋 Obteniendo lista de todos los usuarios...');
            return navegarAFlujoConValidacion(ctx, 'LISTAR_TODOS_USUARIOS', { state, flowDynamic, gotoFlow, provider });
        }
        
        await flowDynamic('❌ Opción no válida. Escribe *1* o *2*.');
        return navegarAFlujoConValidacion(ctx, 'CONSULTA_USUARIO', { state, flowDynamic, gotoFlow, provider });
    }
);

// ==== FLUJO BUSCAR USUARIO ESPECÍFICO ====
const flowBuscarUsuarioEspecifico = addKeyword(utils.setEvent('BUSCAR_USUARIO_ESPECIFICO'))
.addAnswer(
    '🔎 Escribe el *ID de usuario, nombre de usuario o ID de persona* a buscar:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
        const input = ctx.body.trim();
        
        if (input === 'menu' || input === 'menú') {
            await limpiarEstado(state);
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (!input || input === '') {
            await flowDynamic('❌ No recibimos el dato a buscar. Por favor escríbelo.');
            return navegarAFlujoConValidacion(ctx, 'BUSCAR_USUARIO_ESPECIFICO', { state, flowDynamic, gotoFlow, provider });
        }
        
        await flowDynamic('🔍 Consultando información en la base de datos remota (172.30.247.185)...');
        
        const usuario = await consultarUsuarioEnusuariosprueba(input);
        
        if (usuario) {
            await flowDynamic([
                '✅ *Usuario encontrado* ✅',
                '',
                `📋 **Información del usuario:**`,
                `🆔 ID Usuario: ${usuario.id_usuario}`,
                `👤 Usuario: ${usuario.usuario}`,
                `👥 ID Rol: ${usuario.id_rol}`,
                `👤 ID Persona: ${usuario.id_persona}`,
                `📍 Ubicación: ${usuario.ubicacion || 'No especificada'}`,
                `📅 Fecha inserción: ${usuario.fecha_insert || 'No especificada'}`,
                `🔄 Estado: ${usuario.estado || 'No especificado'}`,
            ].join('\n'));
        } else {
            await flowDynamic([
                '❌ *Usuario no encontrado*',
                '',
                'El usuario no fue encontrado en la tabla usuariosprueba.',
                '',
                '💡 **Verifica:**',
                '• El ID de usuario',
                '• El nombre de usuario',
                '• El ID de persona',
            ].join('\n'));
        }
        
        await flowDynamic('🔙 Escribe *menú* para volver al menú principal.');
        return navegarAFlujoConValidacion(ctx, 'GESTION_SERVICIOS', { state, flowDynamic, gotoFlow, provider });
    }
);

// ==== FLUJO LISTAR TODOS USUARIOS ====
const flowListarTodosUsuarios = addKeyword(utils.setEvent('LISTAR_TODOS_USUARIOS'))
.addAction(async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
    await flowDynamic('📋 Consultando todos los usuarios en usuariosprueba...');
    
    const usuarios = await listarTodosusuariosprueba();
    
    if (usuarios.length > 0) {
        let mensaje = '👥 *LISTA DE USUARIOS - usuariosprueba* 👥\n\n';
        
        usuarios.forEach((usuario, index) => {
            mensaje += `${index + 1}. ${usuario.usuario} \n`;
            mensaje += `   🆔 ID: ${usuario.id_usuario} | Rol: ${usuario.id_rol} | Persona: ${usuario.id_persona}\n`;
            mensaje += `   📍 ${usuario.ubicacion || 'Sin ubicación'} | 🔄 ${usuario.estado || 'Sin estado'}\n`;
            mensaje += `   📅 ${usuario.fecha_insert || 'Sin fecha'}\n\n`;
        });
        
        mensaje += `📊 Total: ${usuarios.length} usuarios\n`;
        mensaje += '💡 *Base de datos: 172.30.247.185*';
        
        await flowDynamic(mensaje);
    } else {
        await flowDynamic('❌ No se encontraron usuarios en la tabla usuariosprueba.');
    }
    
    await flowDynamic('🔙 Escribe *menú* para volver al menú principal.');
    return navegarAFlujoConValidacion(ctx, 'GESTION_SERVICIOS', { state, flowDynamic, gotoFlow, provider });
});

// ==== FLUJO CONEXIÓN BASE DE DATOS ACTEXTITA ====
const flowConexionBaseDatos = addKeyword(utils.setEvent('CONEXION_BASE_DATOS'))
.addAnswer(
    '🔐 *ACCESO AL SISTEMA - BASE DE DATOS ACTEXTITA* 🔐\n\n' +
    'Por favor selecciona tu tipo de usuario:\n\n' +
    '1️⃣ 👨‍🎓 Soy alumno\n' +
    '2️⃣ 👨‍💼 Soy administrador\n\n' +
    '🔙 Escribe *menú* para volver al menú principal.',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
        const opcion = ctx.body.trim().toLowerCase();
        
        if (opcion === 'menu' || opcion === 'menú') {
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (opcion === '1') {
            await flowDynamic('🎓 Identificado como alumno. Vamos a verificar tu número de control...');
            return navegarAFlujoConValidacion(ctx, 'CAPTURA_NUMERO_CONTROL_BASE_DATOS', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (opcion === '2') {
            await flowDynamic('👨‍💼 Identificado como administrador. Vamos a verificar tus credenciales...');
            return navegarAFlujoConValidacion(ctx, 'CAPTURA_USUARIO_ADMIN', { state, flowDynamic, gotoFlow, provider });
        }
        
        await flowDynamic('❌ Opción no válida. Escribe *1* o *2*.');
        return navegarAFlujoConValidacion(ctx, 'CONEXION_BASE_DATOS', { state, flowDynamic, gotoFlow, provider });
    }
);

// ==== FLUJO CAPTURA NÚMERO CONTROL BASE DATOS ====
const flowCapturaNumeroControlBaseDatos = addKeyword(utils.setEvent('CAPTURA_NUMERO_CONTROL_BASE_DATOS'))
.addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;
    timeoutManager.setTimeout(userPhone, async () => {
        try {
            console.log('⏱️ Timeout de 2 minutos en número de control - base datos');
            await flowDynamic('⏱️ No recibimos tu número de control. Serás redirigido al menú.');
            await limpiarEstado(state);
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, flowDynamic });
        } catch (error) {
            console.error('❌ Error en timeout de captura:', error);
        }
    }, 2 * 60 * 1000);
})
.addAnswer(
    '📝 Por favor escribe tu *número de control*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
        timeoutManager.clearTimeout(ctx.from);
        
        const input = ctx.body.trim();
        
        if (input.toLowerCase() === 'menu' || input.toLowerCase() === 'menú') {
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (!/^[A-Za-z0-9]{8,9}$/.test(input)) {
            await flowDynamic('❌ Formato de número de control inválido. Debe tener 8 o 9 caracteres alfanuméricos.');
            return navegarAFlujoConValidacion(ctx, 'CAPTURA_NUMERO_CONTROL_BASE_DATOS', { state, flowDynamic, gotoFlow, provider });
        }
        
        await state.update({ numeroControl: input });
        await flowDynamic(`✅ Recibimos tu número de control: *${input}*\n\n🔍 Consultando en la base de datos...`);
        
        const resultado = await consultarAlumnoEnBaseDatos(input);
        
        if (resultado.encontrado) {
            await flowDynamic([
                '✅ *¡Alumno encontrado en el sistema!* ✅',
                '',
                `📋 **Información del alumno:**`,
                `🔢 Número de control: ${resultado.numero_control}`,
                `👤 Nombre: ${resultado.nombre || 'No especificado'}`,
                `📚 Carrera: ${resultado.carrera || 'No especificado'}`,
                `📅 Semestre: ${resultado.semestre || 'No especificado'}`,
                `📍 Grupo: ${resultado.grupo || 'No especificado'}`,
                `🔄 Estado: ${resultado.estado || 'No especificado'}`,
                '',
                '💾 *Base de datos: actextita*',
                '🔗 *Servidor: 172.30.247.186*'
            ].join('\n'));
        } else {
            await flowDynamic([
                '❌ *Alumno no encontrado*',
                '',
                `El número de control *${input}* no fue encontrado en las tablas:`,
                '• anuevo_ingreso',
                '• a_resagados',
                '',
                '💡 **Verifica:**',
                '• Que el número de control sea correcto',
                '• Que estés registrado en el sistema',
                '',
                '🔙 Escribe *menú* para volver al menú principal.'
            ].join('\n'));
        }
        
        timeoutManager.clearTimeout(ctx.from);
        return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, provider });
    }
);

// ==== FLUJO CAPTURA USUARIO ADMIN ====
const flowCapturaUsuarioAdmin = addKeyword(utils.setEvent('CAPTURA_USUARIO_ADMIN'))
.addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;
    timeoutManager.setTimeout(userPhone, async () => {
        try {
            console.log('⏱️ Timeout de 2 minutos en usuario admin');
            await flowDynamic('⏱️ No recibimos tu usuario. Serás redirigido al menú.');
            await limpiarEstado(state);
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, flowDynamic });
        } catch (error) {
            console.error('❌ Error en timeout de captura:', error);
        }
    }, 2 * 60 * 1000);
})
.addAnswer(
    '👤 Por favor escribe tu *nombre de usuario de administrador*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
        timeoutManager.clearTimeout(ctx.from);
        
        const input = ctx.body.trim();
        
        if (input.toLowerCase() === 'menu' || input.toLowerCase() === 'menú') {
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (!input || input === '') {
            await flowDynamic('❌ No recibimos tu usuario. Por favor escríbelo.');
            return navegarAFlujoConValidacion(ctx, 'CAPTURA_USUARIO_ADMIN', { state, flowDynamic, gotoFlow, provider });
        }
        
        await state.update({ usuarioAdmin: input });
        await flowDynamic(`✅ Recibimos tu usuario: *${input}*\n\n🔍 Verificando en la base de datos...`);
        
        const adminEncontrado = await verificarAdministradorEnBaseDatos(input);
        
        if (adminEncontrado) {
            await flowDynamic([
                '✅ *¡Administrador verificado!* ✅',
                '',
                `👤 Usuario: ${input}`,
                '🔄 Generando nueva contraseña segura...'
            ].join('\n'));
            
            const nuevaContrasena = generarContrasenaSegura();
            
            const actualizacionExitosa = await actualizarContrasenaAdmin(input, nuevaContrasena);
            
            if (actualizacionExitosa) {
                await flowDynamic([
                    '🔐 *Contraseña actualizada exitosamente* 🔐',
                    '',
                    `📋 **Tus nuevas credenciales:**`,
                    `👤 Usuario: ${input}`,
                    `🔐 Nueva contraseña: *${nuevaContrasena}*`,
                    '',
                    '⚠️ **Importante:**',
                    '• Guarda esta contraseña en un lugar seguro',
                    '• Cámbiala después del primer acceso',
                    '• No compartas tus credenciales',
                    '',
                    '💾 *Base de datos: actextita*',
                    '🔗 *Servidor: 172.30.247.186*',
                    '📊 *Tabla: admins*'
                ].join('\n'));
            } else {
                await flowDynamic('❌ Error al actualizar la contraseña. Contacta al administrador del sistema.');
            }
        } else {
            await flowDynamic([
                '❌ *Administrador no encontrado*',
                '',
                `El usuario *${input}* no existe en la tabla de administradores.`,
                '',
                '💡 **Verifica:**',
                '• Que el usuario sea correcto',
                '• Que tengas permisos de administrador',
                '',
                '🔙 Escribe *menú* para volver al menú principal.'
            ].join('\n'));
        }
        
        timeoutManager.clearTimeout(ctx.from);
        return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, provider });
    }
);

// ==== FLUJO EDUCACIÓN A DISTANCIA ====
const flowDistancia = addKeyword(utils.setEvent('FLOW_DISTANCIA'))
.addAction(async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
    if (ctx.from === CONTACTO_ADMIN) return;
    
    if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
        return;
    }
    
    try {
        await flowDynamic([{
            body: '😞 Por el momento no podemos apoyarte con el restablecimiento de contraseña de tu *Moodle*. \n👉 Te invitamos a asistir a *Coordinación de Educación a Distancia*. \n📍 Sus oficinas están en el edificio de *Idiomas* (planta baja), frente a la sala Isóptica, a un costado del elevador.',
            media: 'https://raw.githubusercontent.com/CapYAN09/ProyectosITA/main/img/Imagen_de_WhatsApp_2025-09-10_a_las_13.53.25_7b1508b3-removebg-preview.png'
        }]);
    } catch (error) {
        await flowDynamic('😞 Por el momento no podemos apoyarte con el restablecimiento de contraseña de tu *Moodle*. \n👉 Te invitamos a asistir a *Coordinación de Educación a Distancia*. \n📍 Sus oficinas están en el edificio de *Idiomas* (planta baja), frente a la sala Isóptica, a un costado del elevador.');
    }
    
    await flowDynamic('🔙 Escribe *menú* para volver al menú principal.');
    return;
});

// ==== FLUJO SIE ====
const flowSIE = addKeyword(utils.setEvent('FLOW_SIE'))
.addAnswer(
    '📚 *SISTEMA SIE*\n\n' +
    'Por favor selecciona una opción:\n\n' +
    '1️⃣ Restablecer contraseña de acceso\n' +
    '2️⃣ No puedo ver mi horario o calificaciones\n\n' +
    '🔙 Escribe *menú* para volver al menú principal.',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
        const opcion = ctx.body.trim().toLowerCase();
        
        if (opcion === 'menu' || opcion === 'menú') {
            return navegarAFlujoConValidacion(ctx, 'MENU_PRINCIPAL', { state, flowDynamic, gotoFlow, provider });
        }
        
        if (opcion === '1') {
            await flowDynamic('🔐 Para restablecer tu contraseña de acceso al SIE, por favor comunícate con tu *Coordinador de Carrera*. Ellos podrán asistirte directamente con el restablecimiento.');
            await flowDynamic('🔙 Escribe *menú* para volver al menú principal.');
            return;
        }
        
        if (opcion === '2') {
            await flowDynamic('📋 Esta función está en desarrollo. Pronto estará disponible.');
            await flowDynamic('🔙 Escribe *menú* para volver al menú principal.');
            return;
        }
        
        await flowDynamic('❌ Opción no válida. Escribe *1* o *2*.');
        return navegarAFlujoConValidacion(ctx, 'FLOW_SIE', { state, flowDynamic, gotoFlow, provider });
    }
);

// ==== FLUJO DE GRACIAS ====
const flowGracias = addKeyword(utils.setEvent('FLOW_GRACIAS'))
.addAction(async (ctx, { flowDynamic }) => {
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
    ].join('\n'));
});

// ==== FLUJO INFORMACIÓN CREDENCIALES ====
const flowInfoCredenciales = addKeyword(utils.setEvent('FLOW_INFO_CREDENCIALES'))
.addAction(async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
    if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
        return;
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
    ].join('\n'));
});

// ==== Flujo para comandos especiales durante procesos (SIMPLIFICADO) ====
const flowComandosEspeciales = addKeyword(['estado']) // 🔧 Solo "estado"
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    await debugFlujo(ctx, 'flowComandosEspeciales');
    if (ctx.from === CONTACTO_ADMIN) return;

    const myState = await state.getMyState();
    
    if (myState?.estadoUsuario === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
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
        '',
        '⏰ Se completará automáticamente.'
      ].join('\n'));
      
      // 🔧 NO redirigir al menú, permanecer en el flujo actual
      return;
    } else {
      await flowDynamic('✅ No tienes procesos activos.');
      // Solo redirigir al menú si no hay proceso
      return gotoFlow(flowMenu);
    }
  });

// ==== Flujo de Bloqueo Activo - ACTUALIZADO CON TIEMPOS ====
const flowBloqueoActivo = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    await debugFlujo(ctx, 'flowBloqueoActivo');
    if (ctx.from === CONTACTO_ADMIN) return;

    const myState = await state.getMyState();

    // 🔧 VERIFICAR SI SIGUE EN ESTADO DE BLOQUEO
    if (!myState?.estadoUsuario || myState.estadoUsuario !== ESTADOS_USUARIO.EN_PROCESO_LARGO) {
      console.log(`🔓 Usuario ${ctx.from} ya no está bloqueado, liberando...`);
      await limpiarEstado(state);
      return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
    }

    const input = ctx.body?.toLowerCase().trim();

    // 🔧 ACTUALIZAR LA ÚLTIMA INTERACCIÓN USANDO TU FUNCIÓN actualizarEstado
    if (input) {
      await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
        ...myState.estadoMetadata,
        // Mantenemos todos los metadatos existentes pero actualizamos el timestamp
      });
    }

    // 🔧 MANEJAR DIFERENTES TIPOS DE MENSAJES
    if (input === 'estado') {
      // Redirigir al flujo de comandos especiales para mostrar el estado
      return gotoFlow(flowComandosEspeciales);
    } else if (input) {
      // 🔧 CALCULAR TIEMPOS PARA EL MENSAJE GENÉRICO
      const metadata = myState.estadoMetadata || {};
      const tiempoTranscurrido = Date.now() - (metadata.ultimaActualizacion || Date.now());
      const minutosTranscurridos = Math.floor(tiempoTranscurrido / 60000);
      const minutosRestantes = Math.max(0, 30 - minutosTranscurridos);

      const tiempoDesdeInteraccion = Date.now() - (metadata.ultimaActualizacion || Date.now());
      const minutosDesdeInteraccion = Math.floor(tiempoDesdeInteraccion / 60000);

      await flowDynamic([
        '⏳ *Proceso en curso* ⏳',
        '',
        '📋 Tu solicitud está siendo procesada activamente...',
        '',
        `🔄 Interacción activa hace: ${minutosDesdeInteraccion} minutos`,
        `🎯 Falta: ${minutosRestantes} minutos para terminar el proceso`,
        '',
        '🔄 **No es necesario que escribas nada**',
        '⏰ El proceso continuará automáticamente',
        '',
        '💡 **Solo escribe:**',
        '*estado* - Para ver el progreso actual',
        '',
        '¡Gracias por tu paciencia! 🙏'
      ].join('\n'));
      return;
    }

    return;
  });

// ==== Flujo para mensajes no entendidos - MEJORADO ====
const flowDefault = addKeyword(EVENTS.WELCOME).addAction(async (ctx, { flowDynamic, state, gotoFlow }) => {
  await debugFlujo(ctx, 'flowDefault');
  if (ctx.from === CONTACTO_ADMIN) return;

  // Reiniciar inactividad incluso en mensajes no entendidos
  await reiniciarInactividad(ctx, state, flowDynamic, gotoFlow);

  if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
    return;
  }

  const input = ctx.body?.toLowerCase().trim();

  // 🔧 MANEJAR "estado" incluso en el flujo default
  if (input === 'estado') {
    return gotoFlow(flowComandosEspeciales);
  }

  // 🔧 DETECCIÓN MÁS FLEXIBLE DE SALUDOS
  if (esSaludoValido(input)) {
    console.log(`🔄 Saludo válido detectado en flowDefault: "${input}", redirigiendo al flowPrincipal...`);
    return gotoFlow(flowPrincipal);
  }

  // 🔧 SI ES UN NÚMERO SOLO (1-8), REDIRIGIR AL MENÚ
  if (/^[1-8]$/.test(input)) {
    console.log(`🔄 Número de opción detectado: "${input}", redirigiendo al menú...`);
    return gotoFlow(flowMenu);
  }

  await flowDynamic([
    '🤖 No entiendo ese mensaje.',
    '',
    '💡 **Para comenzar, escribe:**',
    '• *hola* - Iniciar conversación',
    '• *inicio* - Ver menú principal',
    '• *ayuda* - Obtener asistencia',
    '• *estado* - Ver estado del proceso actual',
    '',
    '📋 **O selecciona una opción directa:**',
    '1️⃣ Restablecer contraseña',
    '2️⃣ Configurar autenticador',
    '3️⃣ Educación a Distancia',
    '4️⃣ Sistema SIE',
    '5️⃣ Información CC',
    '6️⃣ No conozco mis credenciales',
    '7️⃣ 👨‍💼 Gestión de Servicios (Exclusivo Trabajadores)',
    '8️⃣ 🗃️ Acceso a Base de Datos Actextita',
    '',
    '🔙 Escribe *hola* para comenzar.'
  ]);
});

// ==================== REGISTRAR TODOS LOS FLUJOS ====================
function registrarFlujos() {
    // Flujos principales
    flowManager.registerFlow('PRINCIPAL', flowPrincipal);
    flowManager.registerFlow('MENU_PRINCIPAL', flowMenu);
    flowManager.registerFlow('DEFAULT', flowDefault);
    flowManager.registerFlow('BLOQUEO_ACTIVO', flowBloqueoActivo);
    flowManager.registerFlow('COMANDOS_ESPECIALES', flowComandosEspeciales);
    
    // Flujos de contraseña
    flowManager.registerFlow('SUBMENU_CONTRASENA', flowSubMenuContrasena);
    flowManager.registerFlow('CAPTURA_NUMERO_CONTROL', flowCapturaNumeroControl);
    flowManager.registerFlow('CAPTURA_NOMBRE', flowCapturaNombre);
    flowManager.registerFlow('CAPTURA_IDENTIFICACION', flowCapturaIdentificacion);
    flowManager.registerFlow('FLOW_CONTRASENA', flowContrasena);
    
    // Flujos de trabajador
    flowManager.registerFlow('CAPTURA_CORREO_TRABAJADOR', flowCapturaCorreoTrabajador);
    
    // Flujos de autenticador
    flowManager.registerFlow('SUBMENU_AUTENTICADOR', flowSubMenuAutenticador);
    flowManager.registerFlow('FLOW_AUTENTICADOR', flowAutenticador);
    
    // Flujos de gestión de servicios
    flowManager.registerFlow('GESTION_SERVICIOS', flowGestionServicios);
    flowManager.registerFlow('RESTABLECIMIENTO_SISTEMA', flowRestablecimientoSistema);
    flowManager.registerFlow('CAPTURA_DEPARTAMENTO', flowCapturaDepartamento);
    flowManager.registerFlow('CAPTURA_USUARIO_SISTEMA', flowCapturaUsuarioSistema);
    flowManager.registerFlow('NUEVO_USUARIO', flowNuevoUsuario);
    flowManager.registerFlow('CAPTURA_AREA', flowCapturaArea);
    flowManager.registerFlow('CONSULTA_USUARIO', flowConsultaUsuario);
    flowManager.registerFlow('BUSCAR_USUARIO_ESPECIFICO', flowBuscarUsuarioEspecifico);
    flowManager.registerFlow('LISTAR_TODOS_USUARIOS', flowListarTodosUsuarios);
    
    // Flujos de base de datos actextita
    flowManager.registerFlow('CONEXION_BASE_DATOS', flowConexionBaseDatos);
    flowManager.registerFlow('CAPTURA_NUMERO_CONTROL_BASE_DATOS', flowCapturaNumeroControlBaseDatos);
    flowManager.registerFlow('CAPTURA_USUARIO_ADMIN', flowCapturaUsuarioAdmin);
    
    // Otros flujos
    flowManager.registerFlow('FLOW_DISTANCIA', flowDistancia);
    flowManager.registerFlow('FLOW_SIE', flowSIE);
    flowManager.registerFlow('FLOW_GRACIAS', flowGracias);
    flowManager.registerFlow('FLOW_INFO_CREDENCIALES', flowInfoCredenciales);
    
    console.log(`✅ Registrados ${flowManager.flows.size} flujos`);
}

// ==================== VERIFICACIÓN DE BASE DE DATOS ====================
async function verificarBaseDeDatos() {
    try {
        console.log('🔍 Verificando conexión a MySQL...');
        
        const connection = await crearConexionMySQL();
        if (!connection) {
            console.error('❌ No se pudo conectar a la base de datos');
            return false;
        }
        
        try {
            const [tablas] = await connection.execute(`
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = 'bot_whatsapp' 
                AND TABLE_NAME = 'user_states'
            `);
            
            if (tablas.length === 0) {
                console.log('📦 Creando tabla user_states...');
                await connection.execute(`
                    CREATE TABLE user_states (
                        user_phone VARCHAR(255) PRIMARY KEY,
                        estado_usuario VARCHAR(50) NOT NULL,
                        estado_metadata JSON,
                        numero_control VARCHAR(20),
                        nombre_completo VARCHAR(255),
                        correo_institucional VARCHAR(255),
                        es_trabajador BOOLEAN DEFAULT FALSE,
                        identificacion_subida BOOLEAN DEFAULT FALSE,
                        info_identificacion JSON,
                        timestamp_identificacion TIMESTAMP NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    )
                `);
                console.log('✅ Tabla user_states creada exitosamente con todas las columnas');
            } else {
                console.log('✅ Tabla user_states encontrada, verificando columnas...');
                
                const columnasNecesarias = [
                    'identificacion_subida', 'timestamp_identificacion',
                    'correo_institucional', 'es_trabajador', 'info_identificacion'
                ];
                
                for (const columna of columnasNecesarias) {
                    const [columnas] = await connection.execute(`
                        SELECT COLUMN_NAME 
                        FROM INFORMATION_SCHEMA.COLUMNS 
                        WHERE TABLE_SCHEMA = 'bot_whatsapp' 
                        AND TABLE_NAME = 'user_states' 
                        AND COLUMN_NAME = '${columna}'
                    `);
                    
                    if (columnas.length === 0) {
                        console.log(`📦 Agregando columna faltante: ${columna}`);
                        
                        let tipoColumna = 'BOOLEAN DEFAULT FALSE';
                        if (columna === 'timestamp_identificacion') tipoColumna = 'TIMESTAMP NULL';
                        if (columna === 'correo_institucional') tipoColumna = 'VARCHAR(255) NULL';
                        if (columna === 'info_identificacion') tipoColumna = 'JSON';
                        
                        await connection.execute(`
                            ALTER TABLE user_states 
                            ADD COLUMN ${columna} ${tipoColumna}
                        `);
                        console.log(`✅ Columna ${columna} agregada`);
                    }
                }
                console.log('✅ Todas las columnas necesarias están presentes');
            }
            
            await connection.end();
            return true;
            
        } catch (error) {
            console.error('❌ Error en verificación de tabla:', error.message);
            return false;
        }
        
    } catch (error) {
        console.error('❌ Error verificando base de datos:', error.message);
        return false;
    }
}

// ==================== CONFIGURACIÓN FINAL DEL BOT ====================
const main = async () => {
    console.log('🚀 Iniciando bot ITA - Versión Completa con Bases de Datos\n');
    
    try {
        // 1. Verificar base de datos
        await verificarBaseDeDatos();
        
        // 2. Registrar todos los flujos
        registrarFlujos();
        
        // 3. Configurar provider
        const adapterProvider = createProvider(Provider, {
            name: 'ITA-Bot-WhatsApp',
            authPath: './auth',
            headless: true,
            qrTimeout: 60000,
            printQRInTerminal: true,
            browser: ['Windows', 'Chrome', '20.0.04'],
            puppeteerOptions: {
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--window-size=1920,1080'
                ],
                headless: 'new',
                ignoreHTTPSErrors: true
            }
        });
        
        const adapterFlow = createFlow([
      // ==================== 🔧 FLUJOS CRÍTICOS DE SISTEMA (PRIMEROS) ====================
      flowInterceptorGlobal,      // 🛡️ PRIMERO - Normalización IDs y seguridad global
      flowBlockAdmin,            // 🛡️ SEGUNDO - Bloqueo administrador

      // ==================== 🎯 FLUJOS DE ENTRADA PRINCIPAL ====================
      flowPrincipal,             // 🔥 TERCERO - Captura todos los saludos e inicios
      flowMenu,                  // 🔥 CUARTO - Menú principal y navegación

      // ==================== ⚡ FLUJOS DE ACCIÓN RÁPIDA ====================
      flowDistancia,             // 🎓 Educación a distancia (sin procesos largos)
      flowGracias,               // 🙏 Agradecimiento (sin interacción)
      flowInfoCredenciales,      // ❓ Información credenciales (solo lectura)

      // ==================== 🔄 COMANDOS ESPECIALES ====================
      flowComandosEspeciales,    // 📊 Comando "estado" durante procesos

      // ==================== 🗃️ CONSULTAS Y BASE DE DATOS ====================
      flowConsultaUsuario,               // 🔍 Consulta usuarios
      flowBuscarUsuarioEspecifico,       // 🔎 Búsqueda específica
      flowListarTodosUsuarios,           // 📋 Listar todos usuarios
      flowConexionBaseDatos,             // 🗃️ Base datos Actextita
      flowCapturaNumeroControlBaseDatos, // 🔢 Captura número control BD
      flowCapturaUsuarioAdmin,           // 👨‍💼 Captura usuario admin

      // ==================== 🎪 SUBMENÚS DE OPCIONES ====================
      flowSubMenuContrasena,              // 🔐 Submenú contraseña
      flowSubMenuAutenticador,            // 🔑 Submenú autenticador

      // ==================== 📝 FLUJOS DE CAPTURA BÁSICA ====================
      flowCapturaNumeroControl,           // 🔢 Número control (contraseña)
      flowCapturaNombre,                  // 📝 Nombre (contraseña)
      flowCapturaNumeroControlAutenticador, // 🔢 Número control (autenticador)
      flowCapturaNombreAutenticador,      // 📝 Nombre (autenticador)
      flowCapturaNumeroControlSIE,        // 🔢 Número control (SIE)
      flowCapturaNombreSIE,               // 📝 Nombre (SIE)

      // ==================== 📧 FLUJOS PARA TRABAJADORES ====================
      flowCapturaCorreoTrabajador,        // 📧 Correo trabajador (contraseña)
      flowCapturaNombreTrabajador,        // 📝 Nombre trabajador (contraseña)
      flowCapturaCorreoTrabajadorAutenticador, // 📧 Correo trabajador (autenticador)
      flowCapturaNombreTrabajadorAutenticador, // 📝 Nombre trabajador (autenticador)

      // ==================== 📸 FLUJOS DE IDENTIFICACIÓN ====================
      flowCapturaIdentificacion,          // 📸 Identificación (contraseña)
      flowCapturaIdentificacionAutenticador, // 📸 Identificación (autenticador)

      // ==================== 👨‍💼 GESTIÓN DE SERVICIOS TRABAJADORES ====================
      flowGestionServicios,               // 👨‍💼 Menú gestión servicios
      flowRestablecimientoSistema,        // 🔐 Restablecimiento sistema
      flowCapturaDepartamento,            // 🏢 Captura departamento
      flowCapturaUsuarioSistema,          // 👤 Captura usuario sistema
      flowNuevoUsuario,                   // 👤 Solicitud nuevo usuario
      flowCapturaArea,                    // 🏢 Captura área

      // ==================== 🔄 FLUJOS DE INICIO DE PROCESOS ====================
      flowrestablecercontrase,            // 🚀 Inicio proceso contraseña
      flowrestablecerautenti,             // 🚀 Inicio proceso autenticador
      flowrestablecerSIE,                 // 🚀 Inicio proceso SIE
      flowSIE,                            // 📊 Menú SIE

      // ==================== 🔐 FLUJOS DE PROCESOS LARGOS (BLOQUEANTES) ====================
      flowContrasena,                     // ⏳ Proceso largo contraseña
      flowAutenticador,                   // ⏳ Proceso largo autenticador
      flowFinSIE,                         // ⏳ Proceso largo SIE
      flowBloqueoActivo,                  // 🔒 Bloqueo durante procesos

      // ==================== 🕒 FLUJOS DE ESPERA Y TIMEOUTS ====================
      flowEsperaPrincipal,                // ⏰ Espera en principal
      flowEsperaMenu,                     // ⏰ Espera en menú
      flowEsperaSIE,                      // ⏰ Espera en SIE
      flowEsperaContrasena,               // ⏰ Espera en contraseña
      flowEsperaAutenticador,             // ⏰ Espera en autenticador
      flowEsperaMenuDistancia,            // ⏰ Espera en educación distancia
      flowEsperaMenuSIE,                  // ⏰ Espera en menú SIE

      // ==================== ❓ FLUJO POR DEFECTO (SIEMPRE ÚLTIMO) ====================
      flowDefault                         // 🤖 Manejo mensajes no entendidos
    ]);
        
        // 5. Base de datos
        const adapterDB = new Database();
        
        // 6. Crear bot
        console.log('🔧 Creando instancia del bot...');
        const { httpServer } = await createBot({
            flow: adapterFlow,
            provider: adapterProvider,
            database: adapterDB,
            port: PORT
        });
        
        console.log('══════════════════════════════════════════════════');
        console.log(`✅ BOT INICIADO: http://localhost:${PORT}`);
        console.log('📱 Esperando conexión de WhatsApp...');
        console.log('══════════════════════════════════════════════════\n');
        
        // 7. Configurar eventos
        adapterProvider.on('qr', (qr) => {
            console.log('\n══════════════════════════════════════════════════');
            console.log('📱 ESCANEA ESTE CÓDIGO QR CON WHATSAPP:');
            console.log('══════════════════════════════════════════════════\n');
            QRCode.generate(qr, { small: true });
            console.log('\n══════════════════════════════════════════════════');
            console.log('📱 INSTRUCCIONES PARA WINDOWS:');
            console.log('1. Abre WhatsApp en tu teléfono');
            console.log('2. Toca los 3 puntos → Dispositivos vinculados');
            console.log('3. Toca "Vincular un dispositivo"');
            console.log('4. Escanea el código QR mostrado arriba');
            console.log('══════════════════════════════════════════════════\n');
        });
        
        adapterProvider.on('ready', () => {
            console.log('\n🎉 ¡CONEXIÓN EXITOSA! Bot listo para recibir mensajes\n');
            console.log('💬 Puedes enviar "hola" a este número de WhatsApp');
            console.log('💾 MySQL: ✅ CONECTADO');
            console.log('🔗 BD Remota (172.30.247.185):', conexionRemota ? '✅ CONECTADO' : '❌ DESCONECTADO');
        });
        
        adapterProvider.on('auth_failure', (error) => {
            console.error('\n❌ Error de autenticación:', error);
            console.log('🔄 Limpiando sesión y generando nuevo QR...');
            
            // Limpiar archivos de autenticación corruptos
            try {
                const fs = require('fs');
                if (fs.existsSync('./auth')) {
                    fs.rmSync('./auth', { recursive: true, force: true });
                    console.log('✅ Sesión corrupta eliminada');
                }
            } catch (e) {
                console.error('No se pudo limpiar la sesión:', e.message);
            }
        });
        
        adapterProvider.on('disconnected', (reason) => {
            console.log('\n🔌 Desconectado de WhatsApp. Razón:', reason);
            console.log('🔄 Reconectando en 5 segundos...');
            
            setTimeout(() => {
                console.log('🔄 Intentando reconexión...');
                adapterProvider.vendor?.init()?.catch(console.error);
            }, 5000);
        });
        
        // 8. Iniciar servidor HTTP
        httpServer(+PORT);
        
        // 9. Función para reiniciar si hay problemas
        const reiniciarConexion = () => {
            console.log('🔄 Reiniciando conexión WhatsApp...');
            try {
                if (adapterProvider.vendor) {
                    adapterProvider.vendor.end();
                    setTimeout(() => {
                        adapterProvider.vendor?.init()?.catch(console.error);
                    }, 3000);
                }
            } catch (error) {
                console.error('❌ Error al reiniciar:', error.message);
            }
        };
        
        // 10. Verificar conexión periódicamente
setInterval(() => {
    try {
        if (adapterProvider.vendor?.ws) {
            const estado = adapterProvider.vendor.ws.readyState;
            if (estado !== 1) { // 1 = OPEN
                console.log(`⚠️ WebSocket no está abierto (estado: ${estado})`);
                if (estado === 3) { // 3 = CLOSED
                    reiniciarConexion();
                }
            }
        } else {
            console.log('⚠️ WebSocket no disponible, intentando reconectar...');
            reiniciarConexion();
        }
    } catch (error) {
        console.error('❌ Error verificando WebSocket:', error.message);
    }
}, 30000);
        
    } catch (error) {
        console.error('\n❌ ERROR CRÍTICO al iniciar el bot:');
        console.error('Mensaje:', error.message);
        console.error('Stack:', error.stack ? error.stack.split('\n').slice(0, 5).join('\n') : 'No stack');
        
        // Intentar limpiar y reiniciar
        try {
            const fs = await import('fs');
            if (fs.existsSync('./auth')) {
                console.log('🔄 Limpiando sesión corrupta...');
                fs.rmSync('./auth', { recursive: true, force: true });
                console.log('✅ Sesión limpia. Reinicia el bot.');
            }
        } catch (e) {
            console.error('No se pudo limpiar la sesión');
        }
    }
};

// Manejo de errores global
process.on('uncaughtException', (error) => {
    console.error('\n❌ ERROR NO CAPTURADO:', error.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('\n❌ PROMESA RECHAZADA:', reason);
});

// Ejecutar
main();