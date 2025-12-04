const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot')
const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const MySQLAdapter = require('@bot-whatsapp/database/mysql')

// ==== Función para debuggear flujos ====
async function debugFlujo(ctx, nombreFlujo) {
  console.log(`🔍 [DEBUG] ${nombreFlujo} - Usuario: ${ctx.from}, Mensaje: "${ctx.body}"`);
}

// Contacto específico donde se enviará la información
const CONTACTO_ADMIN = '5214494877990@s.whatsapp.net'

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

//nuevo

// ==== FLUJO PARA OPCIÓN 8 - CONEXIÓN A BASE DE DATOS ACTEXTITA ====
const flowConexionBaseDatos = addKeyword(EVENTS.ACTION)
  .addAnswer(
    '🔐 *ACCESO AL SISTEMA - BASE DE DATOS ACTEXTITA* 🔐\n\n' +
    'Por favor selecciona tu tipo de usuario:\n\n' +
    '1️⃣ 👨‍🎓 Soy alumno\n' +
    '2️⃣ 👨‍💼 Soy administrador\n\n' +
    '🔙 Escribe *menú* para volver al menú principal.',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      const opcion = ctx.body.trim().toLowerCase();

      if (opcion === 'menu' || opcion === 'menú') {
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (opcion === '1') {
        await flowDynamic('🎓 Identificado como alumno. Vamos a verificar tu número de control...');
        return gotoFlow(flowCapturaNumeroControlBaseDatos);
      }

      if (opcion === '2') {
        await flowDynamic('👨‍💼 Identificado como administrador. Vamos a verificar tus credenciales...');
        return gotoFlow(flowCapturaUsuarioAdmin);
      }

      await flowDynamic('❌ Opción no válida. Escribe *1* o *2*.');
      return gotoFlow(flowConexionBaseDatos);
    }
  );

// ==== FLUJO PARA CAPTURAR NÚMERO DE CONTROL (ALUMNO) ====
const flowCapturaNumeroControlBaseDatos = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en número de control - base datos');
        await flowDynamic('⏱️ No recibimos tu número de control. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);

    await state.update({
      timeoutCaptura: timeout,
      ultimaInteraccion: Date.now()
    });
  })
  .addAnswer(
    '📝 Por favor escribe tu *número de control*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      timeoutManager.clearTimeout(ctx.from);

      const input = ctx.body.trim();

      if (input === 'menu' || input === 'menú') {
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (!input || input === '') {
        await flowDynamic('❌ No recibimos tu número de control. Por favor escríbelo.');
        return gotoFlow(flowCapturaNumeroControlBaseDatos);
      }

      // Validar formato básico de número de control
      if (!/^[A-Za-z0-9]{8,9}$/.test(input)) {
        await flowDynamic('❌ Formato de número de control inválido. Debe tener 8 o 9 caracteres alfanuméricos.');
        return gotoFlow(flowCapturaNumeroControlBaseDatos);
      }

      await state.update({ numeroControl: input });
      await flowDynamic(`✅ Recibimos tu número de control: *${input}*\n\n🔍 Consultando en la base de datos...`);

      // Consultar en la base de datos
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
      return gotoFlow(flowEsperaMenu);
    }
  );

// ==== FLUJO PARA CAPTURAR USUARIO DE ADMINISTRADOR ====
const flowCapturaUsuarioAdmin = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en usuario admin');
        await flowDynamic('⏱️ No recibimos tu usuario. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);

    await state.update({
      timeoutCaptura: timeout,
      ultimaInteraccion: Date.now()
    });
  })
  .addAnswer(
    '👤 Por favor escribe tu *nombre de usuario de administrador*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      timeoutManager.clearTimeout(ctx.from);

      const input = ctx.body.trim();

      if (input === 'menu' || input === 'menú') {
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (!input || input === '') {
        await flowDynamic('❌ No recibimos tu usuario. Por favor escríbelo.');
        return gotoFlow(flowCapturaUsuarioAdmin);
      }

      await state.update({ usuarioAdmin: input });
      await flowDynamic(`✅ Recibimos tu usuario: *${input}*\n\n🔍 Verificando en la base de datos...`);

      // Verificar administrador en la base de datos
      const adminEncontrado = await verificarAdministradorEnBaseDatos(input);

      if (adminEncontrado) {
        await flowDynamic([
          '✅ *¡Administrador verificado!* ✅',
          '',
          `👤 Usuario: ${input}`,
          '🔄 Generando nueva contraseña segura...'
        ].join('\n'));

        // Generar nueva contraseña
        const nuevaContrasena = generarContrasenaSegura();

        // Actualizar contraseña en la base de datos
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
      return gotoFlow(flowEsperaMenu);
    }
  );

async function consultarAlumnoEnBaseDatos(numeroControl) {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: '172.30.247.186',
      user: 'root',
      password: '', // 🔧 AGREGAR contraseña si es necesaria
      database: 'actextita',
      port: 3306
    });

    // Consultar en ambas tablas
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

// ❌ PROBLEMA: Configuración de conexión faltante
// ✅ SOLUCIÓN: Completar la configuración

async function verificarAdministradorEnBaseDatos(usuario) {
  try {
    const connection = await mysql.createConnection({
      host: '172.30.247.186',
      user: 'root',
      password: '', // 🔧 CONTRASEÑA FALTANTE
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

// ==== FUNCIÓN PARA ACTUALIZAR CONTRASEÑA DE ADMINISTRADOR ====
async function actualizarContrasenaAdmin(usuario, nuevaContrasena) {
  try {
    console.log(`🔐 Actualizando contraseña para admin: ${usuario}`);

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

// ==== Función para verificar si un usuario existe ====
async function verificarUsuarioEnSistema(usuario) {
  try {
    await inicializarConexionRemota();
    if (!conexionRemota) {
      console.error('❌ No hay conexión a BD para verificar usuario');
      return null;
    }

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

// ==== Función CORREGIDA para insertar DIRECTAMENTE en usuariosprueba ====
async function insertarUsuarioDirectoEnusuariosprueba(nombreCompleto, area, usuario, contrasena, telefono) {
  try {
    console.log(`🎯 INSERTANDO DIRECTAMENTE en usuariosprueba: ${usuario}`);

    await inicializarConexionRemota();
    if (!conexionRemota) {
      console.error('❌ No hay conexión a BD usuariosprueba');
      return false;
    }

    // 🔧 VALORES PARA LA INSERCIÓN DIRECTA
    const id_rol = 2;
    const id_persona = 0;
    const ubicacion = area || 'Sin ubicacion'; // 🔧 SIN TILDE
    const estado = 'Activo';

    console.log(`📊 Datos para inserción directa:`, {
      usuario: usuario,
      contrasena: contrasena,
      nombre: nombreCompleto,
      area: area,
      telefono: telefono
    });

    // 🔧 PRIMERO: VERIFICAR LA ESTRUCTURA DE LA TABLA
    try {
      const [columnas] = await conexionRemota.execute(`
        SHOW COLUMNS FROM usuariosprueba
      `);
      console.log('🔍 Estructura de la tabla usuariosprueba:');
      columnas.forEach(col => {
        console.log(`   - ${col.Field} (${col.Type})`);
      });
    } catch (error) {
      console.error('❌ Error obteniendo estructura de tabla:', error.message);
    }

    // 🔧 INSERCIÓN DIRECTA EN usuariosprueba - COLUMNA CORREGIDA
    const query = `
      INSERT INTO usuariosprueba 
      (id_rol, id_persona, usuario, password, ubicacion, fecha_insert, estado)
      VALUES (?, ?, ?, ?, ?, NOW(), ?)
    `;

    console.log(`📝 Ejecutando query: ${query}`);
    console.log(`📦 Valores:`, [id_rol, id_persona, usuario, contrasena, ubicacion, estado]);

    const [result] = await conexionRemota.execute(query, [
      id_rol,
      id_persona,
      usuario,
      contrasena,
      ubicacion,
      estado
    ]);

    console.log(`✅ INSERCIÓN DIRECTA EXITOSA en usuariosprueba:`);
    console.log(`   - Usuario: ${usuario}`);
    console.log(`   - ID generado: ${result.insertId}`);
    console.log(`   - Filas afectadas: ${result.affectedRows}`);
    console.log(`   - Contraseña: ${contrasena}`);

    return true;

  } catch (error) {
    console.error('❌ ERROR en inserción directa usuariosprueba:', error.message);
    console.error('🔍 Detalles del error:', {
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    });

    return false;
  }
}

const timeoutManager = new TimeoutManager();

async function enviarMensajeBusiness(provider, destinatario, mensaje) {
  try {
    if (!provider?.vendor?.sendMessage) {
      console.error('❌ Provider no está listo');
      return false;
    }

    const sock = provider.vendor;

    // 🔧 NORMALIZACIÓN MEJORADA
    const destinatarioNormalizado = normalizarIdWhatsAppBusiness(destinatario);

    console.log(`📤 ENVIANDO A: ${destinatarioNormalizado}`);
    console.log(`💬 Mensaje: ${mensaje.substring(0, 50)}...`);

    // 🔧 VERIFICAR QUE EL DESTINATARIO SEA VÁLIDO
    if (!destinatarioNormalizado.includes('@s.whatsapp.net') &&
      !destinatarioNormalizado.includes('@g.us')) {
      console.error('❌ Destinatario no válido:', destinatarioNormalizado);
      return false;
    }

    // 🔧 PAUSA PARA ESTABILIDAD
    await new Promise(resolve => setTimeout(resolve, 1000));

    const resultado = await sock.sendMessage(destinatarioNormalizado, {
      text: mensaje
    });

    console.log('✅ Mensaje enviado correctamente a:', destinatarioNormalizado);
    return true;

  } catch (error) {
    console.error('❌ Error enviando mensaje:', error.message);

    // 🔧 DIAGNÓSTICO DETALLADO
    if (error.message.includes('not-authorized')) {
      console.log('🔍 El usuario no tiene al bot agregado como contacto');
    } else if (error.message.includes('blocked')) {
      console.log('🔍 El usuario tiene bloqueado al bot');
    } else if (error.message.includes('chat')) {
      console.log('🔍 Error de chat - posible ID incorrecto');
    } else if (error.message.includes('timed out')) {
      console.log('🔍 Timeout en envío');
    } else if (error.message.includes('group')) {
      console.log('🔍 Posible problema con chat grupal');
    }

    return false;
  }
}

// ==== Función para manejar inactividad - CORREGIDA ====
async function manejarInactividad(ctx, state, flowDynamic, gotoFlow) {
  if (ctx.from === CONTACTO_ADMIN) return;

  const userPhone = ctx.from;

  // Limpiar timeout anterior si existe
  timeoutManager.clearTimeout(userPhone);

  // Configurar nuevo timeout para 2 minutos
  timeoutManager.setTimeout(userPhone, async () => {
    try {
      const myState = await state.getMyState();

      // Solo mostrar mensaje si no está en proceso largo
      if (myState?.estadoUsuario !== ESTADOS_USUARIO.EN_PROCESO_LARGO) {
        await flowDynamic([
          '⏰ *Sesión Inactiva*',
          '',
          'He notado que no has interactuado conmigo en los últimos 2 minutos.',
          '',
          '💡 **Para reactivar el bot, escribe:**',
          '• *hola* - Para reiniciar la conversación',
          '• *inicio* - Para volver al menú principal',
          '',
          '¡Estoy aquí para ayudarte! 🐦'
        ].join('\n'));

        // Limpiar estado temporal pero mantener información básica
        await state.update({
          estadoUsuario: ESTADOS_USUARIO.LIBRE,
          ultimaInteraccion: Date.now()
        });
      }
    } catch (error) {
      console.error('❌ Error en manejo de inactividad:', error);
    }
  }, 2 * 60 * 1000); // 2 minutos
}

// ==== Función para reiniciar inactividad - NUEVA ====
async function reiniciarInactividad(ctx, state, flowDynamic, gotoFlow) {
  await manejarInactividad(ctx, state, flowDynamic, gotoFlow);
}

// ✅ Configuración centralizada
const DB_CONFIG = {
  actextita: {
    host: '172.30.247.186',
    user: 'root',
    password: '', // 🔧 COMPLETAR
    database: 'actextita',
    port: 3306
  },
  bot_whatsapp: {
    host: 'localhost',
    user: 'root',
    password: '', // 🔧 COMPLETAR si es necesaria
    database: 'bot_whatsapp',
    port: 3306
  }
};

// ==== Configuración para XAMPP ====
const adapterDB = new MySQLAdapter({
  host: 'localhost',
  user: 'root',
  database: 'bot_whatsapp',
  password: '',
  port: 3306,
})

// ==== ALTERNATIVA: Crear nuestra propia conexión MySQL ====
const mysql = require('mysql2/promise');

// Variable global para nuestra conexión
let conexionMySQL = null;

let reconectando = false;

async function crearConexionMySQL() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'bot_whatsapp',
      port: 3306,
      // 🔧 CONFIGURACIONES CORRECTAS para mysql2
      connectTimeout: 60000,
      acquireTimeout: 60000,
      timeout: 60000,
      // Configuraciones para mantener conexión activa
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000
    });

    // 🔧 MANEJADOR DE ERRORES MEJORADO
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
  console.log('🔄 Iniciando reconexión a MySQL...');

  try {
    if (conexionMySQL) {
      try {
        await conexionMySQL.end();
      } catch (e) {
        console.log('⚠️ Cerrando conexión anterior...');
      }
    }

    conexionMySQL = await crearConexionMySQL();
    reconectando = false;

    if (conexionMySQL) {
      console.log('✅ Reconexión a MySQL exitosa');
    }
  } catch (error) {
    console.error('❌ Error en reconexión MySQL:', error.message);
    reconectando = false;

    // Reintentar después de 5 segundos
    setTimeout(() => {
      reconectarMySQL();
    }, 5000);
  }
}

// ==== Funciones para MySQL usando nuestra propia conexión ====
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

// ==== FUNCIÓN LIMPIAR ESTADO MYSQL ====
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

// ==== Función CORREGIDA para guardar estado en MySQL ====
async function guardarEstadoMySQL(userPhone, estado, metadata = {}, userData = {}) {
  try {
    await inicializarMySQL();
    if (!conexionMySQL) {
      console.log('⚠️ No hay conexión MySQL, omitiendo guardado');
      return false;
    }

    // 🔧 VALIDAR QUE userPhone NO SEA NULL O UNDEFINED
    if (!userPhone) {
      console.error('❌ userPhone es null/undefined en guardarEstadoMySQL');
      return false;
    }

    console.log(`💾 Guardando estado para: ${userPhone}`);

    const query = `
      INSERT INTO user_states (user_phone, estado_usuario, estado_metadata, numero_control, nombre_completo, identificacion_subida, timestamp_identificacion)
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
      userPhone, // 🔧 Asegurar que no sea null
      estado,
      JSON.stringify(metadata),
      userData.numeroControl || null,
      userData.nombreCompleto || null,
      userData.identificacionSubida || false,
      userData.timestampIdentificacion || null
    ];

    console.log(`📦 Valores para guardar estado:`, {
      userPhone: userPhone,
      estado: estado,
      metadataKeys: Object.keys(metadata)
    });

    await conexionMySQL.execute(query, values);
    console.log(`✅ Estado guardado en MySQL para: ${userPhone}`);
    return true;
  } catch (error) {
    console.error('❌ Error guardando estado en MySQL:', error.message);

    // 🔧 DETALLES DEL ERROR
    if (error.message.includes('user_phone') && error.message.includes('null')) {
      console.error('🔍 El user_phone está llegando como null al ejecutar la query');
    }

    return false;
  }
}

// ==== FUNCIÓN MEJORADA OBTENER ESTADO MYSQL ====
async function obtenerEstadoMySQL(userPhone) {
  try {
    // 🔧 VALIDAR userPhone
    if (!userPhone) {
      console.error('❌ userPhone es null en obtenerEstadoMySQL');
      return null;
    }

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
        esTrabajador: estado.es_trabajador
      };
    }
  } catch (error) {
    console.error('❌ Error obteniendo estado de MySQL:', error.message);
  }

  return null;
}

// ==== CONEXIÓN A BASE DE DATOS REMOTA PARA USUARIOS ====
let conexionRemota = null;

// ==== CONEXIÓN MEJORADA a BD usuariosprueba ====
async function crearConexionRemota() {
  try {
    console.log('🔗 Conectando a BD usuariosprueba en localhost...');

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

    // Verificar que podemos hacer queries
    const [rows] = await connection.execute('SELECT COUNT(*) as count FROM usuariosprueba');
    console.log(`📊 usuariosprueba tiene: ${rows[0].count} registros`);

    return connection;
  } catch (error) {
    console.error('❌ Error creando conexión DIRECTA a usuariosprueba:', error.message);

    // Intentar con IP local como fallback
    try {
      console.log('🔄 Intentando conexión con IP local 172.30.247.184...');
      const connectionFallback = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'b1o04dzhm1guhvmjcrwb',
        port: 3306
      });
      console.log('✅ Conexión exitosa con IP local');
      return connectionFallback;
    } catch (error2) {
      console.error('❌ Error en conexión fallback:', error2.message);
      return null;
    }
  }
}

// ✅ MEJORA: Agregar manejo robusto de errores

async function inicializarConexionRemota() {
  if (!conexionRemota) {
    conexionRemota = await crearConexionRemota();
  }

  // Verificar si la conexión sigue activa
  if (conexionRemota) {
    try {
      await conexionRemota.execute('SELECT 1');
      return conexionRemota;
    } catch (error) {
      console.log('🔄 Conexión remota inactiva, reconectando...');
      try {
        await conexionRemota.end();
      } catch (e) {
        console.log('⚠️ Error cerrando conexión anterior:', e.message);
      }
      conexionRemota = await crearConexionRemota();
    }
  }

  return conexionRemota;
}

// ==== Sistema de Estados del Usuario ====
const ESTADOS_USUARIO = {
  LIBRE: 'libre',
  EN_PROCESO_LARGO: 'en_proceso_largo',
  ESPERANDO_DATOS: 'esperando_datos',
  EN_MENU: 'en_menu'
};

// ❌ PROBLEMA: Posible recursividad infinita
// ✅ SOLUCIÓN: Agregar validación adicional

async function redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic) {
  try {
    const myState = await state.getMyState();

    // 🔧 PROTECCIÓN MÁS ROBUSTA CONTRA RECURSIVIDAD
    if (myState?.redirigiendo || myState?.enRedireccion) {
      console.log('⚠️ Ya se está redirigiendo, evitando recursividad');
      return;
    }

    // 🔧 MARCAR INICIO DE REDIRECCIÓN
    await state.update({
      redirigiendo: true,
      enRedireccion: true
    });

    await limpiarEstado(state);
    await new Promise(resolve => setTimeout(resolve, 200));

    // 🔧 LIMPIAR BANDERAS DESPUÉS DE LA REDIRECCIÓN
    setTimeout(async () => {
      await state.update({
        redirigiendo: false,
        enRedireccion: false
      });
    }, 1000);

    return gotoFlow(flowMenu);
  } catch (error) {
    console.error('❌ Error en redirección al menú:', error);

    // 🔧 ASEGURAR LIMPIEZA DE BANDERAS EN CASO DE ERROR
    await state.update({
      redirigiendo: false,
      enRedireccion: false
    });

    await flowDynamic('🔧 Reiniciando bot... Por favor escribe *menú* para continuar.');
    await limpiarEstado(state);
    return gotoFlow(flowMenu);
  }
}

// ==== Función CORREGIDA para actualizar estado ====
async function actualizarEstado(ctx, state, nuevoEstado, metadata = {}) {
  try {
    // 🔧 VALIDACIÓN ROBUSTA DE PARÁMETROS
    if (!ctx || !ctx.from) {
      console.error('❌ ctx o ctx.from es null en actualizarEstado');
      return;
    }

    const estadoActual = await state.getMyState();
    const userPhone = ctx.from;

    if (!userPhone) {
      console.error('❌ userPhone es null en actualizarEstado');
      return;
    }

    // 🔧 LIMPIAR METADATA DE OBJETOS COMPLEJOS
    const metadataLimpio = {};

    Object.keys(metadata).forEach(key => {
      const valor = metadata[key];

      // Solo guardar propiedades serializables
      if (valor === null ||
        typeof valor === 'string' ||
        typeof valor === 'number' ||
        typeof valor === 'boolean' ||
        Array.isArray(valor)) {

        try {
          JSON.stringify(valor);
          metadataLimpio[key] = valor;
        } catch (e) {
          console.log(`⚠️ Excluyendo propiedad no serializable: ${key}`);
          metadataLimpio[key] = `[${typeof valor}]`;
        }
      } else if (typeof valor === 'object') {
        // Para objetos, intentar serializar solo propiedades simples
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

    const userData = {
      numeroControl: estadoActual?.numeroControl || null,
      nombreCompleto: estadoActual?.nombreCompleto || null,
      correoInstitucional: estadoActual?.correoInstitucional || null,
      esTrabajador: estadoActual?.esTrabajador || false,
      identificacionSubida: estadoActual?.identificacionSubida || false,
      timestampIdentificacion: estadoActual?.timestampIdentificacion || null
    };

    await state.update({
      estadoUsuario: nuevoEstado,
      estadoMetadata: metadataLimpio,
      ...userData
    });

    console.log(`✅ Estado actualizado a: ${nuevoEstado} para: ${userPhone}`);

    // Guardar también en MySQL si es un proceso largo
    if (nuevoEstado === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
      await guardarEstadoMySQL(userPhone, nuevoEstado, metadataLimpio, userData);
    }

  } catch (error) {
    console.error('❌ Error actualizando estado:', error);
  }
}

// ==== ACTUALIZAR FUNCIÓN LIMPIAR ESTADO ====
async function limpiarEstado(state) {
  try {
    const myState = await state.getMyState();
    const userPhone = state.id;

    if (userPhone) {
      timeoutManager.clearAll(userPhone);
      // ... (limpiar timeouts existentes)
    }

    // 🔧 LIMPIAR ESTADO EN MEMORIA (AGREGAR NUEVOS CAMPOS)
    await state.update({
      estadoUsuario: ESTADOS_USUARIO.LIBRE,
      estadoMetadata: {},
      numeroControl: null,
      nombreCompleto: null,
      correoInstitucional: null,
      esTrabajador: null,
      identificacionSubida: false,        // 🔧 NUEVO
      infoIdentificacion: null,           // 🔧 NUEVO
      timestampIdentificacion: null,      // 🔧 NUEVO
      ultimaInteraccion: Date.now()
    });

    // ... resto del código de limpieza
  } catch (error) {
    console.error('❌ Error limpiando estado:', error);
  }
}

async function restaurarEstadoInicial(ctx, state) {
  if (!ctx.from) return false;

  try {
    const estadoMySQL = await obtenerEstadoMySQL(ctx.from);

    if (estadoMySQL && estadoMySQL.estadoUsuario === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
      // Verificar si el proceso ya expiró (más de 30 minutos)
      const tiempoTranscurrido = Date.now() - (estadoMySQL.estadoMetadata.ultimaActualizacion || Date.now());
      const minutosTranscurridos = Math.floor(tiempoTranscurrido / 60000);

      if (minutosTranscurridos > 30) {
        // Proceso expirado, limpiar estado
        await limpiarEstadoMySQL(ctx.from);
        return false;
      }

      // Restaurar el estado desde MySQL
      await state.update({
        estadoUsuario: estadoMySQL.estadoUsuario,
        estadoMetadata: estadoMySQL.estadoMetadata,
        numeroControl: estadoMySQL.numeroControl,
        nombreCompleto: estadoMySQL.nombreCompleto
      });

      console.log(`🔄 Estado restaurado para: ${ctx.from}`);
      return true;
    }
  } catch (error) {
    console.error('❌ Error restaurando estado inicial:', error);
  }

  return false;
}

// ==== Función para mostrar estado de bloqueo - ACTUALIZADA CON TIEMPOS ====
async function mostrarEstadoBloqueado(flowDynamic, myState) {
  const metadata = myState.estadoMetadata || {};
  const tiempoTranscurrido = Date.now() - (metadata.ultimaActualizacion || Date.now());
  const minutosTranscurridos = Math.floor(tiempoTranscurrido / 60000);
  const minutosRestantes = Math.max(0, 30 - minutosTranscurridos);

  // Calcular la última interacción (usamos ultimaActualizacion como referencia)
  const tiempoDesdeInteraccion = Date.now() - (metadata.ultimaActualizacion || Date.now());
  const minutosDesdeInteraccion = Math.floor(tiempoDesdeInteraccion / 60000);

  await flowDynamic([
    '🔒 *Proceso en Curso* 🔒',
    '',
    `📋 ${metadata.tipo || 'Proceso largo'}`,
    `⏰ Tiempo transcurrido: ${minutosTranscurridos} minutos`,
    `⏳ Tiempo restante: ${minutosRestantes} minutos`,
    `🔄 Interacción activa hace: ${minutosDesdeInteraccion} minutos`,
    `🎯 Falta: ${minutosRestantes} minutos para terminar el proceso`,
    '',
    '🔄 **Estamos trabajando en tu solicitud...**',
    '📱 Por favor espera, *este proceso toma aproximadamente 30 minutos*',
    '',
    '💡 **Para ver el progreso actual escribe:**',
    '*estado*',
    '',
    '⏰ El proceso continuará automáticamente.'
  ].join('\n'));
}

// ==== Función de verificación MEJORADA - CON ACTUALIZACIÓN DE INTERACCIÓN ====
async function verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow }) {
  if (ctx.from === CONTACTO_ADMIN) return false;

  try {
    const myState = await state.getMyState();

    if (myState?.estadoUsuario === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
      console.log(`🔒 Bloqueando mensaje de ${ctx.from} - Proceso en curso`);

      const input = ctx.body?.toLowerCase().trim();

      // 🔧 ACTUALIZAR LA ÚLTIMA INTERACCIÓN USANDO TU FUNCIÓN actualizarEstado
      if (input) {
        await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
          ...myState.estadoMetadata,
          // Mantenemos todos los metadatos existentes
        });
      }

      // 🔧 SI ESCRIBE "estado", MOSTRAR INFORMACIÓN DETALLADA
      if (input === 'estado') {
        await mostrarEstadoBloqueado(flowDynamic, myState);
      } else if (input && input !== 'estado') {
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
      }

      return true;
    }
  } catch (error) {
    console.error('❌ Error en verificación de estado bloqueado:', error);
  }

  return false;
}

// ==== FUNCIONES PARA CONSULTAR EN TABLA usuariosprueba ====

// ==== Función para consultar usuario en usuariosprueba ====
async function consultarUsuarioEnusuariosprueba(criterio) {
  try {
    await inicializarConexionRemota();
    if (!conexionRemota) {
      console.error('❌ No hay conexión a BD remota');
      return null;
    }

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

// ==== Función para listar todos los usuarios de usuariosprueba ====
async function listarTodosusuariosprueba() {
  try {
    await inicializarConexionRemota();
    if (!conexionRemota) {
      console.error('❌ No hay conexión a BD remota');
      return [];
    }

    const query = `SELECT * FROM usuariosprueba ORDER BY id_usuario LIMIT 50`;
    const [rows] = await conexionRemota.execute(query);

    console.log(`✅ ${rows.length} usuarios encontrados en usuariosprueba`);
    return rows;
  } catch (error) {
    console.error('❌ Error listando usuarios de usuariosprueba:', error.message);
    return [];
  }
}

// ==== Función CORREGIDA para insertar usuario en usuariosprueba ====
async function insertarUsuarioEnusuariosprueba(nombreCompleto, area, usuario, contrasena, telefono) {
  try {
    await inicializarConexionRemota();
    if (!conexionRemota) {
      console.error('❌ No hay conexión a BD usuariosprueba');
      return false;
    }

    // 🔧 VALORES POR DEFECTO
    const id_rol = 2;
    const id_persona = 0;
    const ubicacion = area || 'Sin ubicacion'; // 🔧 CORREGIDO: sin tilde
    const estado = 'Activo';

    console.log(`📝 Insertando en usuariosprueba: ${usuario} - ${nombreCompleto}`);

    const query = `
      INSERT INTO usuariosprueba 
      (id_rol, id_persona, usuario, password, ubicacion, fecha_insert, estado)
      VALUES (?, ?, ?, ?, ?, NOW(), ?)
    `;

    const [result] = await conexionRemota.execute(query, [
      id_rol,
      id_persona,
      usuario,
      contrasena,
      ubicacion,
      estado
    ]);

    console.log(`✅ Usuario insertado en usuariosprueba: ${usuario}, ID: ${result.insertId}`);
    return true;
  } catch (error) {
    console.error('❌ Error insertando usuario en usuariosprueba:', error.message);

    // 🔧 DETALLES DEL ERROR PARA DIAGNÓSTICO
    if (error.code === 'ER_DUP_ENTRY') {
      console.log('🔍 El usuario ya existe en la base de datos');
    } else if (error.code === 'ER_NO_SUCH_TABLE') {
      console.log('🔍 La tabla usuariosprueba no existe');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('🔍 Error de acceso - verificar usuario/contraseña');
    } else if (error.code === 'ER_BAD_FIELD_ERROR') {
      console.log('🔍 Error en nombre de columna - verificar estructura de tabla');
    }

    return false;
  }
}

// ==== Función para verificar estructura de tabla usuariosprueba ====
async function verificarEstructurausuariosprueba() {
  try {
    await inicializarConexionRemota();
    if (!conexionRemota) {
      console.error('❌ No hay conexión para verificar estructura');
      return false;
    }

    console.log('🔍 VERIFICANDO ESTRUCTURA DE TABLA usuariosprueba:');

    const [columnas] = await conexionRemota.execute(`
      SHOW COLUMNS FROM usuariosprueba
    `);

    console.log('📋 Columnas de usuariosprueba:');
    columnas.forEach(col => {
      console.log(`   ✅ ${col.Field} (${col.Type}) ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'} ${col.Key || ''}`);
    });

    // Verificar datos existentes
    const [datos] = await conexionRemota.execute(`
      SELECT COUNT(*) as total, 
             MAX(id_usuario) as max_id,
             MIN(fecha_insert) as fecha_min,
             MAX(fecha_insert) as fecha_max
      FROM usuariosprueba
    `);

    console.log('📊 Estadísticas de usuariosprueba:');
    console.log(`   - Total registros: ${datos[0].total}`);
    console.log(`   - ID máximo: ${datos[0].max_id}`);
    console.log(`   - Fecha mínimo: ${datos[0].fecha_min}`);
    console.log(`   - Fecha máximo: ${datos[0].fecha_max}`);

    return true;
  } catch (error) {
    console.error('❌ Error verificando estructura:', error.message);
    return false;
  }
}

// ==== Función MEJORADA para actualizar contraseña en usuariosprueba ====
async function actualizarContrasenaEnusuariosprueba(usuario, nuevaContrasena, telefono) {
  try {
    await inicializarConexionRemota();
    if (!conexionRemota) {
      console.error('❌ No hay conexión a BD usuariosprueba');
      return false;
    }

    console.log(`🔍 Buscando usuario: ${usuario} para actualizar contraseña`);

    // 🔧 PRIMERO: Verificar que el usuario existe
    const queryVerificar = `SELECT id_usuario, usuario FROM usuariosprueba WHERE usuario = ?`;
    const [usuarios] = await conexionRemota.execute(queryVerificar, [usuario]);

    if (usuarios.length === 0) {
      console.log(`❌ Usuario no encontrado en usuariosprueba: ${usuario}`);
      return false;
    }

    const usuarioEncontrado = usuarios[0];
    console.log(`✅ Usuario encontrado: ${usuarioEncontrado.usuario} (ID: ${usuarioEncontrado.id_usuario})`);

    // 🔧 SEGUNDO: Actualizar SOLO la contraseña
    const queryActualizar = `
      UPDATE usuariosprueba 
      SET password = ?, fecha_insert = NOW()
      WHERE usuario = ?
    `;

    console.log(`📝 Actualizando contraseña para usuario: ${usuario}`);
    console.log(`🔐 Nueva contraseña: ${nuevaContrasena}`);

    const [result] = await conexionRemota.execute(queryActualizar, [
      nuevaContrasena,
      usuario
    ]);

    if (result.affectedRows > 0) {
      console.log(`✅ Contraseña actualizada exitosamente para usuario: ${usuario}`);
      console.log(`📊 Filas afectadas: ${result.affectedRows}`);

      // 🔧 OPCIONAL: Verificar que se actualizó correctamente
      const [verificacion] = await conexionRemota.execute(
        'SELECT usuario, password FROM usuariosprueba WHERE usuario = ?',
        [usuario]
      );

      if (verificacion.length > 0) {
        console.log(`🔍 Verificación: Usuario ${verificacion[0].usuario} - Contraseña actualizada: ${verificacion[0].password === nuevaContrasena ? '✅' : '❌'}`);
      }

      return true;
    } else {
      console.log(`❌ No se pudo actualizar la contraseña para usuario: ${usuario}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Error actualizando contraseña en usuariosprueba:', error.message);
    console.error('🔍 Detalles del error:', {
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    });
    return false;
  }
}

// ==== FLUJO PARA BUSCAR USUARIO ESPECÍFICO EN usuariosprueba ====
const flowBuscarUsuarioEspecifico = addKeyword(EVENTS.ACTION)
  .addAnswer(
    '🔎 Escribe el *ID de usuario, nombre de usuario o ID de persona* a buscar:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      const input = ctx.body.trim();

      if (input === 'menu' || input === 'menú') {
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (!input || input === '') {
        await flowDynamic('❌ No recibimos el dato a buscar. Por favor escríbelo.');
        return gotoFlow(flowBuscarUsuarioEspecifico);
      }

      // Realizar consulta en la tabla usuariosprueba
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
          `📍 Ubicación: ${usuario.ubicación || 'No especificada'}`,
          `📅 Fecha inserción: ${usuario.fecha_insert || 'No especificada'}`,
          `🔄 Estado: ${usuario.estado || 'No especificado'}`,
          '',
          //'💡 *Información confidencial - Base de datos: 172.30.247.185*'
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
          '',
          //'🔗 *Base de datos: 172.30.247.185*'
        ].join('\n'));
      }

      await flowDynamic('🔙 Escribe *menú* para volver al menú principal.');
      return gotoFlow(flowEsperaMenu);
    }
  );

// ==== FLUJO PARA LISTAR TODOS LOS USUARIOS DE usuariosprueba ====
const flowListarTodosUsuarios = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { flowDynamic, gotoFlow, state }) => {
    if (ctx.from === CONTACTO_ADMIN) return;

    await flowDynamic('📋 Consultando todos los usuarios en usuariosprueba...');

    const usuarios = await listarTodosusuariosprueba();

    if (usuarios.length > 0) {
      let mensaje = '👥 *LISTA DE USUARIOS - usuariosprueba* 👥\n\n';

      usuarios.forEach((usuario, index) => {
        mensaje += `${index + 1}. ${usuario.usuario} \n`;
        mensaje += `   🆔 ID: ${usuario.id_usuario} | Rol: ${usuario.id_rol} | Persona: ${usuario.id_persona}\n`;
        mensaje += `   📍 ${usuario.ubicación || 'Sin ubicación'} | 🔄 ${usuario.estado || 'Sin estado'}\n`;
        mensaje += `   📅 ${usuario.fecha_insert || 'Sin fecha'}\n\n`;
      });

      mensaje += `📊 Total: ${usuarios.length} usuarios\n`;
      mensaje += '💡 *Base de datos: 172.30.247.185*';

      await flowDynamic(mensaje);
    } else {
      await flowDynamic('❌ No se encontraron usuarios en la tabla usuariosprueba.');
    }

    await flowDynamic('🔙 Escribe *menú* para volver al menú principal.');
    return gotoFlow(flowEsperaMenu);
  });

// ==== FLUJO PARA CONSULTA DE USUARIO ====
const flowConsultaUsuario = addKeyword(EVENTS.ACTION)
  .addAnswer(
    '🔍 *CONSULTA DE USUARIOS - usuariosprueba* 🔍\n\nSelecciona una opción:\n\n1️⃣ 🔎 Buscar usuario específico\n2️⃣ 📋 Listar todos los usuarios\n\n🔙 Escribe *menú* para volver al menú principal.',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      const opcion = ctx.body.trim().toLowerCase();

      if (opcion === 'menu' || opcion === 'menú') {
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (opcion === '1') {
        await flowDynamic('🔎 Iniciando búsqueda de usuario específico...');
        return gotoFlow(flowBuscarUsuarioEspecifico);
      }

      if (opcion === '2') {
        await flowDynamic('📋 Obteniendo lista de todos los usuarios...');
        return gotoFlow(flowListarTodosUsuarios);
      }

      await flowDynamic('❌ Opción no válida. Escribe *1* o *2*.');
      return gotoFlow(flowConsultaUsuario);
    }
  );

// ==== Función MODIFICADA para NO enviar identificación al admin ====
async function enviarIdentificacionAlAdmin(provider, ctx, userData) {
  if (!provider || !ctx) {
    console.error('❌ Provider o contexto no disponible')
    return false
  }

  try {
    const sock = provider.vendor

    if (!sock) {
      console.error('❌ Socket de Baileys no disponible')
      return false
    }

    // 🔧 MODIFICACIÓN: SOLO registrar en logs, NO enviar al admin
    if (esImagenValida(ctx)) {
      console.log('📸 Identificación recibida correctamente - NO enviada al administrador');
      console.log(`👤 Usuario: ${userData.nombre} (${userData.identificacion})`);
      return true;
    } else {
      console.log('⚠️ No se pudo validar identificación: mensaje no contiene imagen válida');
      return false;
    }
  } catch (error) {
    console.error('❌ Error procesando identificación:', error.message);
    return false;
  }
}

// ==== Función CORREGIDA para enviar mensajes y medios al contacto ====
async function enviarAlAdmin(provider, mensaje, ctx = null) {
  if (!provider) {
    console.error('❌ Provider no disponible para enviar al admin');
    return false;
  }

  try {
    console.log('📤 Intentando enviar mensaje al administrador Business...');

    const sock = provider.vendor;

    if (!sock) {
      console.error('❌ Socket de Baileys no disponible');
      return false;
    }

    // 🔧 NORMALIZAR EL ID DEL ADMINISTRADOR
    const adminIdNormalizado = normalizarIdWhatsAppBusiness(CONTACTO_ADMIN);

    console.log(`📤 Enviando a ID Business: ${adminIdNormalizado}`);

    // 🔧 PAUSA DE SEGURIDAD
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Enviar mensaje de texto
    await sock.sendMessage(adminIdNormalizado, {
      text: mensaje,
      // 🔧 CONFIGURACIÓN PARA BUSINESS
      contextInfo: {
        isForwarded: false,
        forwardingScore: 0
      }
    });

    console.log('✅ Información enviada al administrador Business correctamente');
    return true;
  } catch (error) {
    console.error('❌ Error enviando información al administrador Business:', error.message);

    // 🔧 DIAGNÓSTICO ESPECÍFICO
    if (error.message.includes('not-authorized')) {
      console.log('⚠️ El administrador no tiene agregado al bot como contacto');
    } else if (error.message.includes('blocked')) {
      console.log('⚠️ El administrador tiene bloqueado al bot');
    } else if (error.message.includes('chat')) {
      console.log('⚠️ Error de chat - posible problema con el ID Business');
    } else if (error.message.includes('timed out')) {
      console.log('⚠️ Timeout en envío - reconectando...');
    }

    return false;
  }
}

// ==== FUNCIÓN PARA GENERAR CONTRASEÑA SEGURA ====
function generarContrasenaSegura() {
  const mayusculas = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const minusculas = 'abcdefghijklmnopqrstuvwxyz';
  const numeros = '0123456789';
  const simbolos = '!#$%&/()=?¡¿+*}{][-_';

  const todosCaracteres = mayusculas + minusculas + numeros + simbolos;

  let contrasena = '';

  // Asegurar al menos un carácter de cada tipo
  contrasena += mayusculas[Math.floor(Math.random() * mayusculas.length)];
  contrasena += minusculas[Math.floor(Math.random() * minusculas.length)];
  contrasena += numeros[Math.floor(Math.random() * numeros.length)];
  contrasena += simbolos[Math.floor(Math.random() * simbolos.length)];

  // Completar los 12 caracteres
  for (let i = 4; i < 12; i++) {
    contrasena += todosCaracteres[Math.floor(Math.random() * todosCaracteres.length)];
  }

  // Mezclar los caracteres para que no estén en orden predecible
  contrasena = contrasena.split('').sort(() => Math.random() - 0.5).join('');

  return contrasena;
}

// ==== FUNCIÓN PARA FORMATEAR NOMBRE DE USUARIO ====
function formatearNombreUsuario(departamento) {
  // Limpiar el departamento: quitar espacios, acentos y caracteres especiales
  const departamentoLimpio = departamento
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .replace(/[^a-zA-Z0-9]/g, "_") // reemplazar caracteres especiales con _
    .toLowerCase();

  return `Dep_${departamentoLimpio}`;
}

// ==== Funciones de validación ====
function isValidText(input) {
  if (!input || typeof input !== 'string') return false
  if (input.trim().length === 0) return false
  if (input.includes('sticker') || input.includes('image') || input.includes('video')) return false
  return true
}

// ==== Validar número de control (8 o 9 dígitos, con reglas específicas) ====
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

// ==== Función MEJORADA para normalizar IDs de WhatsApp Business ====
function normalizarIdWhatsAppBusiness(id) {
  if (!id) return id;

  console.log(`🔍 Normalizando ID: ${id}`);

  // Si ya tiene formato correcto, dejarlo como está
  if (id.includes('@s.whatsapp.net') || id.includes('@g.us')) {
    return id;
  }

  // Limpiar el número - quitar caracteres no numéricos
  const numeroLimpio = id.replace(/[^\d]/g, '');

  // Validar que sea un número válido
  if (!numeroLimpio || numeroLimpio.length < 10) {
    console.error('❌ Número inválido para normalizar:', id);
    return id; // Devolver original si no se puede normalizar
  }

  // Para México, asegurar código de país
  let numeroNormalizado = numeroLimpio;
  if (numeroNormalizado.startsWith('1') && numeroNormalizado.length === 11) {
    // Número con código de país US
    numeroNormalizado = numeroNormalizado;
  } else if (numeroNormalizado.startsWith('52') && numeroNormalizado.length === 12) {
    // Número México con código de país
    numeroNormalizado = numeroNormalizado;
  } else if (numeroNormalizado.length === 10) {
    // Número local México, agregar código de país
    numeroNormalizado = '52' + numeroNormalizado;
  }

  return `${numeroNormalizado}@s.whatsapp.net`;
}

// ==== FLUJO INTERCEPTOR GLOBAL - CORREGIDO PARA PROBLEMA DE CHATS ====
const flowInterceptorGlobal = addKeyword(EVENTS.WELCOME)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow, provider }) => {
    try {
      // 🔧 NORMALIZAR ID PRIMERO
      const remitenteOriginal = ctx.from;
      const remitenteNormalizado = normalizarIdWhatsAppBusiness(ctx.from);

      console.log(`🔍 INTERCEPTOR - Original: ${remitenteOriginal} | Normalizado: ${remitenteNormalizado}`);

      // Actualizar el contexto con el ID normalizado
      ctx.from = remitenteNormalizado;

      const adminNormalizado = normalizarIdWhatsAppBusiness(CONTACTO_ADMIN);

      // 🔧 EXCLUIR ADMIN
      if (ctx.from === adminNormalizado) {
        console.log('🚫 Mensaje del administrador, omitiendo interceptor');
        return;
      }

      await debugFlujo(ctx, 'flowInterceptorGlobal');

      // 🔧 VERIFICAR SI ESTÁ EN PROCESO LARGO
      const myState = await state.getMyState();

      if (myState?.estadoUsuario === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
        console.log(`🔒 Usuario ${ctx.from} está en proceso largo`);
        await mostrarEstadoBloqueado(flowDynamic, myState);
        return gotoFlow(flowBloqueoActivo);
      }

      const input = ctx.body?.toLowerCase().trim();

      // 🔧 PERMITIR COMANDOS ESPECÍFICOS Y SALUDOS
      const comandosPermitidos = [
        'hola', 'inicio', 'menu', 'menú', 'estado', 'ayuda',
        '1', '2', '3', '4', '5', '6', '7', '8'
      ];

      // Si es un saludo o comando permitido, dejar pasar
      if (comandosPermitidos.includes(input) || esSaludoValido(input)) {
        console.log(`✅ Comando/saludo permitido: "${input}", permitiendo pasar...`);
        return;
      }

      // 🔧 SI ESTÁ EN MENÚ O LIBRE, PERMITIR CUALQUIER MENSAJE
      if (!myState?.estadoUsuario ||
        myState.estadoUsuario === ESTADOS_USUARIO.LIBRE ||
        myState.estadoUsuario === ESTADOS_USUARIO.EN_MENU) {
        console.log(`✅ Usuario en estado libre/menú, permitiendo mensaje`);
        return;
      }

      // 🔧 SOLO BLOQUEAR SI NO ES UN COMANDO VÁLIDO Y ESTÁ EN PROCESO
      console.log(`🚫 Mensaje bloqueado: "${input}" - Estado: ${myState?.estadoUsuario}`);

      await flowDynamic([
        '🔒 *Bot Inactivo*',
        '',
        'Para comenzar a usar el bot, escribe:',
        '',
        '🌟 *hola* - Para comenzar',
        '🌟 *inicio* - Para volver al menú',
        '',
        '¡Estaré encantado de ayudarte! 🐦'
      ].join('\n'));

      return;

    } catch (error) {
      console.error('❌ Error en interceptor global:', error);
      // En caso de error, permitir que el mensaje continúe
      return;
    }
  });

// ==== Función para diagnosticar problemas de IDs ====
async function diagnosticarProblemaIDs(ctx, provider) {
  console.log('\n🔍 DIAGNÓSTICO DETALLADO DE IDs:');
  console.log('📱 Remitente Original:', ctx.from);
  console.log('🔄 Remitente Normalizado:', normalizarIdWhatsAppBusiness(ctx.from));
  console.log('👤 Admin Original:', CONTACTO_ADMIN);
  console.log('🔄 Admin Normalizado:', normalizarIdWhatsAppBusiness(CONTACTO_ADMIN));

  // Verificar estructura del ID
  const id = ctx.from;
  console.log('📋 Estructura del ID:');
  console.log('   - Tiene @s.whatsapp.net:', id.includes('@s.whatsapp.net'));
  console.log('   - Tiene @g.us:', id.includes('@g.us'));
  console.log('   - Tiene @c.us:', id.includes('@c.us'));
  console.log('   - Es número limpio:', /^\d+$/.test(id));

  // Verificar provider
  if (provider && provider.vendor) {
    try {
      const sock = provider.vendor;
      console.log('🔌 Estado del Provider: Conectado');

      // Intentar obtener información del chat
      try {
        const jidNormalizado = normalizarIdWhatsAppBusiness(ctx.from);
        console.log('💬 Intentando obtener chat para:', jidNormalizado);

        // Esta línea puede variar según la versión de Baileys
        const chat = await sock.onWhatsApp(jidNormalizado);
        console.log('💬 Chat encontrado en WhatsApp:', chat ? 'Sí' : 'No');
      } catch (chatError) {
        console.log('💬 Error obteniendo chat:', chatError.message);
      }
    } catch (error) {
      console.log('🔌 Error verificando provider:', error.message);
    }
  } else {
    console.log('🔌 Provider no disponible para diagnóstico');
  }
  console.log('----------------------------------------\n');
}

// ==== Función UNIVERSAL para enviar respuestas de forma segura ====
async function enviarRespuestaSegura(provider, destinatario, mensaje) {
  try {
    if (!provider || !provider.vendor) {
      console.error('❌ Provider no disponible para enviar respuesta');
      return false;
    }

    const sock = provider.vendor;

    // 🔧 NORMALIZAR DESTINATARIO
    const destinatarioNormalizado = normalizarIdWhatsAppBusiness(destinatario);

    console.log(`📤 ENVIANDO RESPUESTA - Destino: ${destinatarioNormalizado}`);

    // 🔧 VERIFICACIÓN EXTRA DE SEGURIDAD
    if (!destinatarioNormalizado || !destinatarioNormalizado.includes('@')) {
      console.error('❌ Destinatario inválido para respuesta:', destinatarioNormalizado);
      return false;
    }

    // 🔧 VERIFICAR QUE NO ESTÉS ENVIANDO A TI MISMO O AL ADMIN POR ERROR
    if (destinatarioNormalizado === normalizarIdWhatsAppBusiness(CONTACTO_ADMIN)) {
      console.log('⚠️ Intento de enviar mensaje al admin desde interceptor, omitiendo');
      return false;
    }

    await sock.sendMessage(destinatarioNormalizado, { text: mensaje });
    console.log('✅ Respuesta enviada correctamente al usuario');
    return true;

  } catch (error) {
    console.error('❌ Error enviando respuesta segura:', error.message);

    // 🔧 DIAGNÓSTICO DETALLADO DEL ERROR
    if (error.message.includes('not-authorized')) {
      console.log('🔍 Diagnóstico: El bot no está autorizado para enviar a este chat');
    } else if (error.message.includes('blocked')) {
      console.log('🔍 Diagnóstico: El usuario tiene bloqueado al bot');
    } else if (error.message.includes('chat')) {
      console.log('🔍 Diagnóstico: Error de chat - ID posiblemente incorrecto');
    } else if (error.message.includes('group')) {
      console.log('🔍 Diagnóstico: Posible problema con chat grupal');
    }

    return false;
  }
}

// ==== Función de diagnóstico mejorada ====
async function diagnosticarProblemaEnvio(ctx, provider) {
  console.log('🔍 DIAGNÓSTICO DETALLADO:');
  console.log('📱 Remitente Original:', ctx.from);
  console.log('🔄 Remitente Normalizado:', normalizarIdWhatsAppBusiness(ctx.from));
  console.log('👤 Admin Original:', CONTACTO_ADMIN);
  console.log('🔄 Admin Normalizado:', normalizarIdWhatsAppBusiness(CONTACTO_ADMIN));
  console.log('💬 Mensaje:', ctx.body);

  // Verificar estado del provider
  if (provider && provider.vendor) {
    try {
      const sock = provider.vendor;
      console.log('🔌 Estado Socket:', sock ? 'Conectado' : 'Desconectado');

      // Intentar obtener información del chat
      try {
        const chat = await sock.chatModify({}, normalizarIdWhatsAppBusiness(ctx.from));
        console.log('💬 Chat encontrado:', chat ? 'Sí' : 'No');
      } catch (chatError) {
        console.log('💬 Error obteniendo chat:', chatError.message);
      }
    } catch (error) {
      console.log('🔌 Error verificando provider:', error.message);
    }
  } else {
    console.log('🔌 Provider no disponible para diagnóstico');
  }
}

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
      await mostrarEstadoBloqueado(flowDynamic, myState);
      return;
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

// ==== FLUJO PARA BLOQUEAR AL ADMINISTRADOR ====
const flowBlockAdmin = addKeyword(EVENTS.WELCOME)
  .addAction(async (ctx, { state }) => {
    await debugFlujo(ctx, 'flowBlockAdmin');
    if (ctx.from === CONTACTO_ADMIN) {
      console.log('🚫 Mensaje del administrador bloqueado - No se procesará')
      return
    }
  })

// ==== SUBMENÚ PARA OPCIÓN 1 - RESTABLECER CONTRASEÑA (CORREGIDO) ====
const flowSubMenuContrasena = addKeyword(EVENTS.ACTION)
  .addAnswer(
    ' Una ves comenzado esté proceso no podrá ser detenido hasta completarse.\n\n' +
    '👥 *Selecciona tu tipo de usuario (Solamente ingresa el número):*\n\n' +
    '1️⃣ ¿Eres un estudiante?\n' +
    '2️⃣ ¿Eres un trabajador o docente?\n\n' +
    '🔙 Escribe *menú* para volver al menú principal.',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      await debugFlujo(ctx, 'flowSubMenuContrasena');
      if (ctx.from === CONTACTO_ADMIN) return;

      const opcion = ctx.body.trim().toLowerCase();

      if (opcion === 'menu' || opcion === 'menú') {
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (opcion === '1') {
        // Alumno - flujo normal con número de control
        await flowDynamic('🎓 Perfecto, eres alumno. Vamos a comenzar con el proceso...');
        return gotoFlow(flowCapturaNumeroControl);
      }

      if (opcion === '2') {
        // Trabajador - flujo con correo institucional
        await flowDynamic('👨‍💼 Perfecto, eres trabajador. Vamos a comenzar con el proceso...');
        return gotoFlow(flowCapturaCorreoTrabajador);
      }

      await flowDynamic('❌ Opción no válida. Escribe *1* o *2*.');
      return gotoFlow(flowSubMenuContrasena);
    }
  );

// ==== Función para validar correo institucional de trabajadores ====
function validarCorreoTrabajador(correo) {
  const regex = /^[a-zA-Z0-9._%+-]+@aguascalientes\.tecnm\.mx$/;
  return regex.test(correo) && correo.length > 0;
}

// ==== Flujo de captura de correo para trabajador (CONTRASEÑA) ====
const flowCapturaCorreoTrabajador = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en correo trabajador');
        await flowDynamic('⏱️ No recibimos tu correo. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);

    await state.update({
      timeoutCaptura: timeout,
      ultimaInteraccion: Date.now(),
      esTrabajador: true // 🔧 MARCADOR PARA TRABAJADOR
    });
  })
  .addAnswer(
    '📝 Por favor escribe tu *correo institucional* (ejemplo: nombre.apellido@aguascalientes.tecnm.mx):',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      timeoutManager.clearTimeout(ctx.from);

      const input = ctx.body.trim().toLowerCase();

      if (input === 'menu' || input === 'menú') {
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (!input || input === '') {
        await flowDynamic('❌ No recibimos tu correo. Por favor escríbelo.');
        return gotoFlow(flowCapturaCorreoTrabajador);
      }

      if (!isValidText(input) || !validarCorreoTrabajador(input)) {
        await flowDynamic('❌ Correo institucional inválido. Debe ser: nombre.apellido@aguascalientes.tecnm.mx\nIntenta de nuevo o escribe *menú* para volver.');
        return gotoFlow(flowCapturaCorreoTrabajador);
      }

      await state.update({
        correoInstitucional: input,
        esTrabajador: true
      });
      await flowDynamic(`✅ Recibimos tu correo institucional: *${input}*`);

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowCapturaNombreTrabajador);
    }
  );

// ==== Flujo de captura de correo para trabajador (AUTENTICADOR) ====
const flowCapturaCorreoTrabajadorAutenticador = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en correo trabajador - autenticador');
        await flowDynamic('⏱️ No recibimos tu correo. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);

    await state.update({
      timeoutCaptura: timeout,
      ultimaInteraccion: Date.now(),
      esTrabajador: true
    });
  })
  .addAnswer(
    '📝 Por favor escribe tu *correo institucional* (ejemplo: nombre.apellido@aguascalientes.tecnm.mx):',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      timeoutManager.clearTimeout(ctx.from);

      const input = ctx.body.trim().toLowerCase();

      if (input === 'menu' || input === 'menú') {
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (!input || input === '') {
        await flowDynamic('❌ No recibimos tu correo. Por favor escríbelo.');
        return gotoFlow(flowCapturaCorreoTrabajadorAutenticador);
      }

      if (!isValidText(input) || !validarCorreoTrabajador(input)) {
        await flowDynamic('❌ Correo institucional inválido. Debe ser: nombre.apellido@aguascalientes.tecnm.mx\nIntenta de nuevo o escribe *menú* para volver.');
        return gotoFlow(flowCapturaCorreoTrabajadorAutenticador);
      }

      await state.update({
        correoInstitucional: input,
        esTrabajador: true
      });
      await flowDynamic(`✅ Recibimos tu correo institucional: *${input}*`);

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowCapturaNombreTrabajadorAutenticador);
    }
  );

// ==== SUBMENÚ PARA OPCIÓN 2 - RESTABLECER AUTENTICADOR (CORREGIDO) ====
const flowSubMenuAutenticador = addKeyword(EVENTS.ACTION)
  .addAnswer(
    ' Una ves comenzado esté proceso no podrá ser detenido hasta completarse.\n\n' +
    '👥 *Selecciona tu tipo de usuario (Solamente ingresa el número):*\n\n' +
    '1️⃣ ¿Eres un estudiante?\n' +
    '2️⃣ ¿Eres un trabajador o docente?\n\n' +
    '🔙 Escribe *menú* para volver al menú principal.',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      await debugFlujo(ctx, 'flowSubMenuAutenticador');
      if (ctx.from === CONTACTO_ADMIN) return;

      const opcion = ctx.body.trim().toLowerCase();

      if (opcion === 'menu' || opcion === 'menú') {
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (opcion === '1') {
        // Alumno - flujo normal con número de control
        await flowDynamic('🎓 Perfecto, eres alumno. Vamos a comenzar con el proceso...');
        return gotoFlow(flowCapturaNumeroControlAutenticador);
      }

      if (opcion === '2') {
        // Trabajador - flujo con correo institucional
        await flowDynamic('👨‍💼 Perfecto, eres trabajador. Vamos a comenzar con el proceso...');
        return gotoFlow(flowCapturaCorreoTrabajadorAutenticador);
      }

      await flowDynamic('❌ Opción no válida. Escribe *1* o *2*.');
      return gotoFlow(flowSubMenuAutenticador);
    }
  );

// ==== Función para obtener información de medios ====
async function obtenerUrlImagen(message) {
  try {
    // Esto es un ejemplo - necesitas adaptarlo según cómo Baileys maneja los medios
    if (message.imageMessage) {
      // Para imágenes normales
      return message.imageMessage.url ||
        (message.imageMessage.mimetype ?
          `data:${message.imageMessage.mimetype};base64,${message.imageMessage.fileSha256}` :
          null);
    } else if (message.documentMessage && message.documentMessage.mimetype.startsWith('image/')) {
      // Para documentos que son imágenes
      return message.documentMessage.url ||
        (message.documentMessage.mimetype ?
          `data:${message.documentMessage.mimetype};base64,${message.documentMessage.fileSha256}` :
          null);
    }
    return null;
  } catch (error) {
    console.error('❌ Error obteniendo URL de imagen:', error);
    return null;
  }
}

// ==== Función CORREGIDA para verificar imágenes de WhatsApp - VERSIÓN ÚNICA ====
function esImagenValida(ctx) {
  if (!ctx || typeof ctx !== 'object') {
    console.log('❌ Contexto inválido para validar imagen');
    return false;
  }

  console.log('🔍 Analizando mensaje para validación de imagen:', JSON.stringify(ctx, null, 2));

  // 🔧 PRIMERO: Verificar si es un mensaje multimedia de WhatsApp
  if (ctx.message) {
    const messageKeys = Object.keys(ctx.message);

    // Verificar si tiene cualquier tipo de mensaje multimedia
    const hasMediaMessage = messageKeys.some(key => {
      return key.includes('Message') &&
        !key.includes('conversation') &&
        !key.includes('extendedTextMessage') &&
        !key.includes('protocolMessage') &&
        !key.includes('senderKeyDistributionMessage');
    });

    if (hasMediaMessage) {
      console.log('✅ Estructura de mensaje multimedia detectada en ctx.message');

      // Verificar tipos específicos de imagen
      if (ctx.message.imageMessage) {
        console.log('✅ Imagen detectada en message.imageMessage');
        return true;
      }

      // Verificar documento que sea imagen
      if (ctx.message.documentMessage) {
        const mimeType = ctx.message.documentMessage.mimetype;
        if (mimeType && mimeType.startsWith('image/')) {
          console.log('✅ Imagen detectada como documento con mimetype:', mimeType);
          return true;
        }
      }

      // Verificar mensaje de vista previa de enlace con imagen
      if (ctx.message.viewOnceMessageV2 || ctx.message.viewOnceMessage) {
        console.log('✅ Mensaje de vista única (posible imagen)');
        return true;
      }

      // Si tiene estructura multimedia pero no podemos identificar el tipo exacto, asumir que es válido
      console.log('✅ Estructura multimedia genérica detectada');
      return true;
    }
  }

  // 🔧 SEGUNDO: Verificar propiedades directas
  if (ctx.type === 'image' || ctx.type === 'sticker' || ctx.type === 'document') {
    console.log('✅ Imagen detectada por tipo directo:', ctx.type);
    return true;
  }

  // 🔧 TERCERO: Verificar propiedades de medios
  if (ctx.media || ctx.hasMedia || ctx.mimetype) {
    console.log('✅ Imagen detectada por propiedades media/mimetype');
    return true;
  }

  // 🔧 CUARTO: Verificar estructura de clave WhatsApp
  if (ctx.key && ctx.key.remoteJid && ctx.key.id) {
    console.log('✅ Mensaje tiene estructura WhatsApp válida con key');
    // En WhatsApp, si tiene estructura válida y llegó aquí, podría ser media
    return true;
  }

  // 🔧 QUINTO: Verificar por palabras clave en el cuerpo (fallback)
  if (ctx.body) {
    const bodyLower = ctx.body.toLowerCase();
    const imageKeywords = ['foto', 'photo', 'imagen', 'image', 'cámara', 'camera', '📷', '📸'];
    if (imageKeywords.some(keyword => bodyLower.includes(keyword))) {
      console.log('✅ Palabra clave de imagen detectada en el mensaje');
      return true;
    }
  }

  console.log('❌ No se pudo identificar como imagen válida después de todas las validaciones');
  console.log('Tipo recibido:', ctx.type);
  console.log('Estructura message:', ctx.message ? Object.keys(ctx.message) : 'No');
  console.log('Tiene media:', ctx.media || ctx.hasMedia ? 'Sí' : 'No');
  console.log('Tiene key:', ctx.key ? 'Sí' : 'No');
  return false;
}

// ==== Flujo final de contraseña - ACTUALIZADO ====
const flowContrasena = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, provider, gotoFlow }) => {
    // ⚡ Excluir administrador
    if (ctx.from === CONTACTO_ADMIN) return;

    // 🔍 VERIFICAR QUE TENEMOS LOS DATOS COMPLETOS
    const myState = (await state.getMyState()) || {};
    const nombreCompleto = myState.nombreCompleto;
    const numeroControl = myState.numeroControl;
    const correoInstitucional = myState.correoInstitucional;
    const esTrabajador = myState.esTrabajador;

    // 🔧 VALIDACIÓN CORREGIDA - aceptar número de control O correo
    if (!nombreCompleto || (!numeroControl && !correoInstitucional)) {
      console.log('❌ Datos incompletos, redirigiendo a captura...');
      await flowDynamic('❌ No tenemos tu información completa. Volvamos a empezar.');
      return gotoFlow(flowSubMenuContrasena);
    }

    // 🔒 ACTUALIZAR ESTADO - BLOQUEAR USUARIO
    await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
      tipo: "🔐 Restablecimiento de Contraseña",
      inicio: Date.now(),
      esTrabajador: esTrabajador || false
    });

    const phone = ctx.from;
    const identificacion = esTrabajador ? correoInstitucional : numeroControl;
    const tipoUsuario = esTrabajador ? "Trabajador" : "Alumno";

    // ✅ ENVIAR INFORMACIÓN COMPLETA AL ADMINISTRADOR
    const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE RESTABLECIMIENTO DE CONTRASEÑA DEL CORRO INSTITUCIONAL.* 🔔\n\n📋 *Información del usuario:*\n👤 Nombre: ${nombreCompleto}\n👥 Tipo: ${tipoUsuario}\n📧 ${esTrabajador ? 'Correo' : 'Número de control'}: ${identificacion}\n📞 Teléfono: ${phone}\n🆔 Identificación: ${myState.identificacionSubida ? '✅ SUBIDA' : '❌ PENDIENTE'}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n🔐 Contraseña temporal asignada: *SoporteCC1234$*\n\n⚠️ Reacciona para validar que está listo`;

    const envioExitoso = await enviarAlAdmin(provider, mensajeAdmin);

    // 🔧 ENVIAR IDENTIFICACIÓN SI ESTÁ DISPONIBLE
    if (myState.identificacionSubida && myState.imagenIdentificacion) {
      const userData = {
        nombre: nombreCompleto,
        identificacion: identificacion,
        tipo: tipoUsuario
      };
      // Reenviar la identificación al admin
      await enviarIdentificacionAlAdmin(provider, {
        message: myState.imagenIdentificacion,
        key: ctx.key
      }, userData);
    }

    if (envioExitoso) {
      await flowDynamic('⏳ Permítenos un momento, vamos a restablecer tu contraseña... \n\n *Te solicitamos no enviar mensajes en lo que realizamos esté proceso, esté proceso durará aproximadamente 30 minutos.*');
    } else {
      await flowDynamic('⚠️ Hemos registrado tu solicitud. Si no recibes respuesta, contacta directamente al centro de cómputo.');
    }

    let minutosRestantes = 30;

    // Aviso cada 10 minutos
    const intervalId = setInterval(async () => {
      minutosRestantes -= 10;
      if (minutosRestantes > 0) {
        await flowDynamic(`⏳ Hola *${nombreCompleto}*, faltan *${minutosRestantes} minutos* para completar el proceso...`);
      }
    }, 10 * 60000);

    // Guardar ID del intervalo en el estado
    await state.update({
      estadoMetadata: {
        ...(await state.getMyState())?.estadoMetadata,
        intervalId: intervalId
      }
    });

    // Mensaje final después de 30 minutos
    const timeoutId = setTimeout(async () => {
      clearInterval(intervalId);

      try {
        await flowDynamic(`✅ Se restableció correctamente tu contraseña.\nTu nueva contraseña temporal es: *SoporteCC1234$*`);

        // 🔧 CORREGIR: Obtener el correo correcto según el tipo de usuario
        const correoUsuario = esTrabajador ? correoInstitucional : `${numeroControl}@aguascalientes.tecnm.mx`;

        console.log(`✅ Contraseña enviada correctamente a *${nombreCompleto}* - ${esTrabajador ? 'Correo' : 'Matrícula'}: *${identificacion}*`);

        await flowDynamic(
          `*Instrucciones para acceder* \n\n *Te recomendamos que esté primer inicio de sesión lo realices desde tu computadora* para poder configurar todo correctamente, después del primer inicio de sesión ya puedes configurar tus aplicaciones \n\n Paso 1.- Cierra la pestaña actual en donde estabas intentando acceder al correo. \n Paso 2.- Ingresa a la página de: https://office.com o en la página: https://login.microsoftonline.com/?whr=tecnm.mx para acceder a tu cuenta institucional. \n Paso 3.- Ingresa tu correo institucional recuerda que es: ${correoUsuario} \n Paso 4.- Ingresa la contraseña temporal: *SoporteCC1234$*  \n Paso 5.- Una vez que ingreses te va a solicitar que realices el cambio de tu contraseña. En contraseña actual es la contraseña temporal: *SoporteCC1234$* en los siguientes campos vas a generar tu nueva contraseña personalizada \n (Por recomendación de seguridad procura que tenga mínimo 11 caracteres, al menos debería de contener: Una mayúscula, una minúscula, un número y un carácter especial: %$#!&/-_.*+). \n Con esto terminaríamos el proceso total del cambio de contraseña.`
        );

        await flowDynamic(
          '🔐 Por seguridad, *Te recomendamos que esté primer inicio de sesión lo realices desde tu computadora* y de esta manera poder cambiar tu contraseña de una manera más cómoda.\n\n 🔙 Escribe *menú* para volver a ver el menú principal.'
        );

      } catch (error) {
        console.error('❌ Error enviando mensaje final:', error.message);
      }

      // 🔓 LIBERAR ESTADO al finalizar
      await limpiarEstado(state);
    }, 30 * 60000);

    // Guardar ID del timeout en el estado
    await state.update({
      estadoMetadata: {
        ...(await state.getMyState())?.estadoMetadata,
        timeoutId: timeoutId
      }
    });
  })
  // 🔒 BLOQUEAR COMPLETAMENTE - REDIRIGIR A FLUJO DE BLOQUEO
  .addAnswer(
    { capture: true },
    async (ctx, { gotoFlow }) => {
      if (ctx.from === CONTACTO_ADMIN) return;
      return gotoFlow(flowBloqueoActivo);
    }
  );

// ==== Función MEJORADA para obtener información de la imagen ====
function obtenerInfoImagen(ctx) {
  if (!ctx) return null;

  try {
    const info = {
      tipo: ctx.type || 'desconocido',
      timestamp: Date.now(),
      from: ctx.from,
      id: ctx.id,
      esValida: esImagenValida(ctx)
    };

    // Información específica según el tipo
    if (ctx.message) {
      if (ctx.message.imageMessage) {
        info.mimetype = ctx.message.imageMessage.mimetype || 'image/jpeg';
        info.tamaño = ctx.message.imageMessage.fileLength;
        info.esImageMessage = true;
        info.caption = ctx.message.imageMessage.caption || 'Sin descripción';
        info.url = ctx.message.imageMessage.url;
      }
      if (ctx.message.documentMessage) {
        info.mimetype = ctx.message.documentMessage.mimetype;
        info.nombreArchivo = ctx.message.documentMessage.title;
        info.tamaño = ctx.message.documentMessage.fileLength;
        info.esDocumentMessage = true;
        info.url = ctx.message.documentMessage.url;
      }
    }

    // Información adicional de depuración
    info.estructuraCompleta = {
      tieneMessage: !!ctx.message,
      keysMessage: ctx.message ? Object.keys(ctx.message) : [],
      tipoMensaje: ctx.type,
      tieneMedia: !!(ctx.media || ctx.hasMedia),
      timestampRecepcion: new Date().toISOString()
    };

    console.log('📄 Información completa de imagen:', info);
    return info;
  } catch (error) {
    console.error('❌ Error obteniendo info de imagen:', error);
    return {
      tipo: 'error',
      timestamp: Date.now(),
      error: error.message
    };
  }
}

// ==== Función AUXILIAR para manejar específicamente fotos de cámara de WhatsApp ====
function esFotoDeCamaraWhatsApp(ctx) {
  if (!ctx.message) return false;

  // Las fotos tomadas directamente con la cámara de WhatsApp generalmente
  // vienen como imageMessage sin caption o con caption vacío
  if (ctx.message.imageMessage) {
    const hasCaption = ctx.message.imageMessage.caption &&
      ctx.message.imageMessage.caption.trim().length > 0;
    return !hasCaption; // Si no tiene caption, probablemente es foto directa de cámara
  }

  return false;
}

// ==== Flujo de captura para identificación oficial - MEJORADO ====
const flowCapturaIdentificacion = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 4 minutos en identificación');
        await flowDynamic('⏱️ No recibimos tu identificación en 4 minutos. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 4 * 60 * 1000);

    await state.update({
      timeoutCapturaIdentificacion: timeout,
      ultimaInteraccion: Date.now()
    });
  })
  .addAnswer(
    [
      '📸 *Verificación de Identidad - Toma la foto AHORA* 📸',
      '',
      'Es importante que solamente respondas con la fotografía de tu credencial escolar del ITA. No envíes mensajes de texto ni otros tipos de archivos. \n en caso de no contar con tu credencial escolar, puedes enviar una identificación oficial vigente con fotografía (INE, pasaporte, cédula profesional, etc.)',
      '',
      '⚠️ **IMPORTANTE PARA FOTOS DESDE WHATSAPP:**',
      '• Usa la cámara de tu celular, NO la computadora',
      '• Toca el ícono de 📎 (clip)',
      '• Selecciona "Cámara" o "Camera"',
      '• Toma una foto NUEVA de tu credencial',
      '• Asegúrate de que sea CLARA y legible',
      '',
      '📋 **Credencial requerida:**',
      '• Credencial escolar CON FOTO del ITA',
      '• Debe ser actual y vigente',
      '• Todos los datos deben ser visibles',
      '',
      '⏰ **Tienes 4 minutos** para enviar la fotografía',
      '',
      '❌ **NO se aceptan:**',
      '• Fotos de galería o archivos antiguos',
      '• Capturas de pantalla',
      '• Documentos escaneados o PDF',
      '• Fotos borrosas o oscuras'
    ].join('\n'),
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      timeoutManager.clearTimeout(ctx.from);

      // 🔧 VALIDACIÓN MEJORADA CON MÁS TOLERANCIA
      const esValida = esImagenValida(ctx);
      const infoImagen = obtenerInfoImagen(ctx);
      const esDeCamara = esFotoDeCamaraWhatsApp(ctx);

      if (!esValida) {
        console.log('❌ Imagen no válida - Información detallada:', infoImagen);

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
          '📱 **Si usas WhatsApp en computadora:**',
          '• La foto debe tomarse con tu celular',
          '• NO uses la cámara de la computadora',
          '• NO envíes archivos de galería',
          '',
          '🔄 **Intenta de nuevo por favor.**'
        ].join('\n'));

        return gotoFlow(flowCapturaIdentificacion);
      }

      // 🔧 GUARDAR INFORMACIÓN MEJORADA CON DETECCIÓN DE CÁMARA
      await state.update({
        identificacionSubida: true,
        infoIdentificacion: infoImagen,
        timestampIdentificacion: Date.now(),
        imagenIdentificacion: ctx,
        fotoEnVivo: esDeCamara, // 🔧 MEJORADO: Detectar si es de cámara
        tipoValidacion: esDeCamara ? 'fotografia_en_tiempo_real' : 'fotografia_de_galeria',
        esWhatsAppWeb: !esDeCamara // 🔧 NUEVO: Marcar si posiblemente es de WhatsApp Web
      });

      // Mensaje según el tipo de imagen
      if (esDeCamara) {
        await flowDynamic([
          '✅ *¡Perfecto! Foto tomada correctamente con la cámara*',
          '',
          '📋 **Hemos validado:**',
          '• Fotografía en tiempo real ✓',
          '• Credencial con foto visible ✓',
          '• Datos legibles ✓',
          '',
          '🔄 Continuando con el proceso...'
        ].join('\n'));
      } else {
        await flowDynamic([
          '✅ *¡Identificación recibida!*',
          '',
          '📋 Continuamos con el proceso...',
          '',
          '⚠️ **Nota:** Para mayor seguridad, recomendamos',
          'tomar fotos directamente con la cámara la próxima vez.'
        ].join('\n'));
      }

      // 🔧 REGISTRO MEJORADO EN LOGS
      const myState = await state.getMyState();
      console.log('📸 Identificación recibida y validada');
      console.log(`👤 Usuario: ${myState.nombreCompleto || 'Por confirmar'}`);
      console.log(`📧 Identificación: ${myState.esTrabajador ? myState.correoInstitucional : myState.numeroControl}`);
      console.log(`📱 Tipo: ${esDeCamara ? 'Foto de cámara' : 'Posible archivo/galería'}`);
      console.log(`🕒 Timestamp: ${new Date().toISOString()}`);

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowContrasena);
    }
  );

// ==== Flujo de captura para identificación oficial (AUTENTICADOR) - ACTUALIZADO ====
const flowCapturaIdentificacionAutenticador = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 4 minutos en identificación - autenticador');
        await flowDynamic('⏱️ No recibimos tu identificación en 4 minutos. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 4 * 60 * 1000);

    await state.update({
      timeoutCapturaIdentificacion: timeout,
      ultimaInteraccion: Date.now()
    });
  })
  .addAnswer(
    [
      '📸 *Verificación de Identidad - Toma la foto AHORA* 📸',
      '',
      'Es importante que solamente respondas con la fotografía de tu credencial escolar del ITA. No envíes mensajes de texto ni otros tipos de archivos. \n en caso de no contar con tu credencial escolar, puedes enviar una identificación oficial vigente con fotografía (INE, pasaporte, cédula profesional, etc.)',
      '',
      '⚠️ **IMPORTANTE PARA FOTOS DESDE WHATSAPP:**',
      '• Usa la cámara de tu celular, NO la computadora',
      '• Toca el ícono de 📎 (clip)',
      '• Selecciona "Cámara" o "Camera"',
      '• Toma una foto NUEVA de tu credencial',
      'En caso de no contar con la credencial escolar, puedes enviar una identificación oficial vigente con fotografía (INE, pasaporte, cédula profesional, etc.)',
      '• Asegúrate de que sea CLARA y legible',
      '',
      '📋 **Para configurar tu autenticador, necesitamos verificar tu identidad:**',
      '• Credencial escolar CON FOTO del ITA',
      'En caso de no contar con la credencial escolar, puedes enviar una identificación oficial vigente con fotografía (INE, pasaporte, cédula profesional, etc.)',
      '• Debe ser actual y vigente',
      '• Todos los datos deben ser visibles',
      '',
      '⏰ **Tienes 4 minutos** para enviar la fotografía',
      '',
      '❌ **NO se aceptan:**',
      '• Fotos de galería o archivos antiguos',
      '• Capturas de pantalla',
      '• Documentos escaneados o PDF',
      '• Fotos borrosas o oscuras'
    ].join('\n'),
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      timeoutManager.clearTimeout(ctx.from);

      // 🔧 VALIDACIÓN MEJORADA CON MÁS TOLERANCIA
      const esValida = esImagenValida(ctx);
      const infoImagen = obtenerInfoImagen(ctx);
      const esDeCamara = esFotoDeCamaraWhatsApp(ctx);

      if (!esValida) {
        console.log('❌ Imagen no válida - Información detallada:', infoImagen);

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
          '📱 **Si usas WhatsApp en computadora:**',
          '• La foto debe tomarse con tu celular',
          '• NO uses la cámara de la computadora',
          '• NO envíes archivos de galería',
          '',
          '🔄 **Intenta de nuevo por favor.**'
        ].join('\n'));

        return gotoFlow(flowCapturaIdentificacionAutenticador);
      }

      // 🔧 GUARDAR INFORMACIÓN MEJORADA CON DETECCIÓN DE CÁMARA
      await state.update({
        identificacionSubida: true,
        infoIdentificacion: infoImagen,
        timestampIdentificacion: Date.now(),
        imagenIdentificacion: ctx,
        fotoEnVivo: esDeCamara,
        tipoValidacion: esDeCamara ? 'fotografia_en_tiempo_real' : 'fotografia_de_galeria',
        esWhatsAppWeb: !esDeCamara
      });

      // Mensaje según el tipo de imagen
      if (esDeCamara) {
        await flowDynamic([
          '✅ *¡Perfecto! Foto tomada correctamente con la cámara*',
          '',
          '📋 **Hemos validado:**',
          '• Fotografía en tiempo real ✓',
          '• Credencial con foto visible ✓',
          '• Datos legibles ✓',
          '',
          '🔄 Continuando con la configuración de tu autenticador...'
        ].join('\n'));
      } else {
        await flowDynamic([
          '✅ *¡Identificación recibida!*',
          '',
          '📋 Continuamos con la configuración del autenticador...',
          '',
          '⚠️ **Nota:** Para mayor seguridad, recomendamos',
          'tomar fotos directamente con la cámara la próxima vez.'
        ].join('\n'));
      }

      // 🔧 REGISTRO MEJORADO EN LOGS
      const myState = await state.getMyState();
      console.log('📸 Identificación recibida y validada (Autenticador)');
      console.log(`👤 Usuario: ${myState.nombreCompleto || 'Por confirmar'}`);
      console.log(`📧 Identificación: ${myState.esTrabajador ? myState.correoInstitucional : myState.numeroControl}`);
      console.log(`📱 Tipo: ${esDeCamara ? 'Foto de cámara' : 'Posible archivo/galería'}`);
      console.log(`🕒 Timestamp: ${new Date().toISOString()}`);

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowAutenticador);
    }
  );

// ==== Flujo final de autenticador - ACTUALIZADO PARA AMBOS TIPOS ====
const flowAutenticador = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, provider, gotoFlow }) => { // 🔧 AGREGAR gotoFlow
    // ⚡ Excluir administrador
    if (ctx.from === CONTACTO_ADMIN) return;

    // 🔍 VERIFICAR QUE TENEMOS LOS DATOS COMPLETOS
    const myState = (await state.getMyState()) || {};
    const nombreCompleto = myState.nombreCompleto;
    const numeroControl = myState.numeroControl;
    const correoInstitucional = myState.correoInstitucional;
    const esTrabajador = myState.esTrabajador;

    // 🔧 VALIDACIÓN CORREGIDA
    if (!nombreCompleto || (!numeroControl && !correoInstitucional)) {
      console.log('❌ Datos incompletos, redirigiendo a captura...');
      await flowDynamic('❌ No tenemos tu información completa. Volvamos a empezar.');
      return gotoFlow(flowSubMenuAutenticador); // 🔧 Redirigir al submenú
    }

    // 🔒 ACTUALIZAR ESTADO - BLOQUEAR USUARIO
    await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
      tipo: "🔑 Configuración de Autenticador",
      inicio: Date.now(),
      esTrabajador: esTrabajador || false
    });

    const phone = ctx.from;
    const identificacion = esTrabajador ? correoInstitucional : numeroControl;
    const tipoUsuario = esTrabajador ? "Trabajador" : "Alumno";

    // ✅ ENVIAR INFORMACIÓN COMPLETA AL ADMINISTRADOR
    const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE DESHABILITAR EL AUTENTICADOR DEL CORREO INSTITUCIONAL.* 🔔\n\n📋 *Información del usuario:*\n👤 Nombre: ${nombreCompleto}\n👥 Tipo: ${tipoUsuario}\n📧 ${esTrabajador ? 'Correo' : 'Número de control'}: ${identificacion}\n📞 Teléfono: ${phone}\n🆔 Identificación: ${myState.identificacionSubida ? '✅ SUBIDA' : '❌ PENDIENTE'}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n\n⚠️ *Proceso en curso...*`;

    const envioExitoso = await enviarAlAdmin(provider, mensajeAdmin);

    if (envioExitoso) {
      await flowDynamic('⏳ Permítenos un momento, vamos a desconfigurar tu autenticador... \n\n *Te solicitamos no enviar mensajes en lo que realizamos esté proceso, esté proceso durará aproximadamente 30 minutos.*');
    } else {
      await flowDynamic('⚠️ Hemos registrado tu solicitud. Si no recibes respuesta, contacta directamente al centro de cómputo.');
    }

    let minutosRestantes = 30;

    // Aviso cada 10 minutos
    const intervalId = setInterval(async () => {
      minutosRestantes -= 10;
      if (minutosRestantes > 0) {
        await flowDynamic(`⏳ Hola *${nombreCompleto}*, faltan *${minutosRestantes} minutos* para completar la configuración del autenticador...`);
      }
    }, 10 * 60000);

    // Guardar ID del intervalo
    await state.update({
      estadoMetadata: {
        ...(await state.getMyState())?.estadoMetadata,
        intervalId: intervalId
      }
    });

    // Mensaje final después de 30 minutos
    const timeoutId = setTimeout(async () => {
      clearInterval(intervalId);

      try {
        await flowDynamic(
          '✅ Se desconfiguró correctamente el autenticador de dos factores'
        );

        // 🔧 CORREGIR: Obtener el correo correcto según el tipo de usuario
        const correoUsuario = esTrabajador ? correoInstitucional : `${numeroControl}@aguascalientes.tecnm.mx`;

        console.log(`✅ Autenticador desconfigurado correctamente para *${nombreCompleto}* - ${esTrabajador ? 'Correo' : 'Matrícula'}: *${identificacion}*`);

        await flowDynamic(
          `*Es importante que estos pasos los realices en una computadora*,\nya que necesitarás tu celular y tu computadora para poder configurar el autenticador. \n\n Paso 1.- Cierra la pestaña actual en donde estabas intentando acceder al correo. \n Paso 2.- Ingresa a la página de: https://office.com o en la página: https://login.microsoftonline.com/?whr=tecnm.mx para acceder a tu cuenta institucional. \n Paso 3.- Ingresa tu correo institucional recuerda que es: ${correoUsuario} \n Paso 4.- Tu contraseña con la que ingresas normalmente \n Paso 5.- Te va a aparecer una página en donde vas a reconfigurar tu autenticador, sigue los pasos que se te mostrarán en la pantalla. Necesitarás configurar la aplicación de autenticador y también debes de ingresar un número de teléfono.`
        );

        await flowDynamic(
          '🔐 Por seguridad, será necesario configurar un nuevo método de autenticación al iniciar sesión.\n\n 🔙 Escribe *menú* para volver a ver el menú principal.'
        );

      } catch (error) {
        console.error('❌ Error enviando mensaje final:', error.message);
      }

      // 🔓 LIBERAR ESTADO al finalizar
      await limpiarEstado(state);
    }, 30 * 60000);

    // Guardar ID del timeout
    await state.update({
      estadoMetadata: {
        ...(await state.getMyState())?.estadoMetadata,
        timeoutId: timeoutId
      }
    });
  })
  // 🔒 BLOQUEAR COMPLETAMENTE - REDIRIGIR A FLUJO DE BLOQUEO
  .addAnswer(
    { capture: true },
    async (ctx, { gotoFlow }) => {
      if (ctx.from === CONTACTO_ADMIN) return;
      return gotoFlow(flowBloqueoActivo);
    }
  );

// ==== Flujo final de SIE - CORREGIDO (SOLO cuando ya tiene datos) ====
const flowFinSIE = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, provider, gotoFlow }) => {
    // ⚡ Excluir administrador
    if (ctx.from === CONTACTO_ADMIN) return;

    // 🔍 VERIFICAR QUE TENEMOS LOS DATOS COMPLETOS
    const myState = (await state.getMyState()) || {};
    const nombreCompleto = myState.nombreCompleto;
    const numeroControl = myState.numeroControl;

    if (!nombreCompleto || !numeroControl) {
      console.log('❌ Datos incompletos, redirigiendo a captura...');
      await flowDynamic('❌ No tenemos tu información completa. Volvamos a empezar.');
      return gotoFlow(flowCapturaNumeroControlSIE);
    }

    // 🔒 ACTUALIZAR ESTADO - BLOQUEAR USUARIO
    await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
      tipo: "📊 Sincronización de Datos SIE",
      inicio: Date.now()

    });

    const phone = ctx.from;

    // ✅ ENVIAR INFORMACIÓN COMPLETA AL ADMINISTRADOR
    const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE SINCRONIZACIÓN DE DATOS*\nNo le aparece el horario ni las materias en el SIE 🔔\n\n📋 *Información del usuario:*\n👤 Nombre: ${nombreCompleto}\n🔢 Número de control: ${numeroControl}\n📞 Teléfono: ${phone}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n\n⚠️ Reacciona para validar que está listo`;

    const envioExitoso = await enviarAlAdmin(provider, mensajeAdmin);

    if (envioExitoso) {
      await flowDynamic('⏳ Permítenos un momento, vamos a restablecer tu contraseña... \n\n *Te solicitamos no enviar mensajes en lo que realizamos esté proceso, esté proceso durará aproximadamente 30 minutos.*');
    } else {
      await flowDynamic('⚠️ Hemos registrado tu solicitud. Si no recibes respuesta, contacta directamente al centro de cómputo.');
    }

    let minutosRestantes = 30;

    // Aviso cada 10 minutos
    const intervalId = setInterval(async () => {
      minutosRestantes -= 10;
      if (minutosRestantes > 0) {
        await flowDynamic(`⏳ Hola *${nombreCompleto}*, faltan *${minutosRestantes} minutos* para completar el proceso...`);
      }
    }, 10 * 60000);

    // Guardar ID del intervalo
    await state.update({
      estadoMetadata: {
        ...(await state.getMyState())?.estadoMetadata,
        intervalId: intervalId
      }
    });

    // Mensaje final después de 30 minutos
    const timeoutId = setTimeout(async () => {
      clearInterval(intervalId);

      try {
        await flowDynamic(`✅ Se sincronizaron los datos correctamente en tu portal del SIE*`);
        console.log(`✅ Sincronización enviada correctamente a *${nombreCompleto}* con matrícula *${numeroControl}*`);

        await flowDynamic(
          '✅ Ingresa nuevamente al portal del SIE y valida tus datos.\n\n 🔙 Escribe *menú* para volver a ver el menú principal.'
        );

      } catch (error) {
        console.error('❌ Error enviando mensaje final:', error.message);
      }

      // 🔓 LIBERAR ESTADO al finalizar
      await limpiarEstado(state);
    }, 30 * 60000);

    // Guardar ID del timeout
    await state.update({
      estadoMetadata: {
        ...(await state.getMyState())?.estadoMetadata,
        timeoutId: timeoutId
      }
    });
  })
  // 🔒 BLOQUEAR COMPLETAMENTE - REDIRIGIR A FLUJO DE BLOQUEO
  .addAnswer(
    { capture: true },
    async (ctx, { gotoFlow }) => {
      if (ctx.from === CONTACTO_ADMIN) return;
      return gotoFlow(flowBloqueoActivo);
    }
  );

// ==== FLUJO PARA INFORMACIÓN DE CREDENCIALES (OPCIÓN 6) ====
const flowInfoCredenciales = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { flowDynamic, gotoFlow, state }) => {
    await debugFlujo(ctx, 'flowInfoCredenciales');
    if (ctx.from === CONTACTO_ADMIN) return;

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

    return gotoFlow(flowEsperaMenu);
  });

// ==== Flujo de espera para menú principal ====
const flowEsperaMenu = addKeyword(EVENTS.ACTION)
  .addAction(async (_, { state, flowDynamic }) => {
    const timeout = setTimeout(async () => {
      console.log('⌛ Tiempo agotado en menú principal.');
      await flowDynamic('⏱️ Tiempo agotado. Por favor inicia el bot nuevamente escribiendo *Hola*.');
      await state.clear();
    }, 5 * 60 * 1000);

    await state.update({ timeoutMenu: timeout });
  })
  .addAnswer(
    '🔙 Escribe *menú* para volver a ver el menú principal.',
    { capture: true },
    async (ctx, { gotoFlow, flowDynamic, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      const input = ctx.body.trim().toLowerCase();

      if (/^men[uú]$/i.test(input)) {
        clearTimeout(await state.get('timeoutMenu'));
        await state.clear();
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (input === 'hola') {
        clearTimeout(await state.get('timeoutMenu'));
        await state.clear();
        return gotoFlow(flowPrincipal);
      }

      await flowDynamic('❌ Opción no válida. Escribe *menú* para volver al menú principal.');
      return gotoFlow(flowEsperaMenu);
    }
  );

// ==== Flujo de espera para principal ====
const flowEsperaPrincipal = addKeyword(EVENTS.ACTION)
  .addAction(async (_, { state, flowDynamic }) => {
    const timeout = setTimeout(async () => {
      console.log('⌛ Tiempo agotado en flujo principal.');
      await flowDynamic([
        '⏱️ *Tiempo agotado*',
        '',
        'Para continuar usando el bot, escribe:',
        '',
        '🌟 *hola* - Para reiniciar',
        '🌟 *inicio* - Para volver al menú',
        '',
        '¡Te espero! 🐦'
      ].join('\n'));
      await state.clear();
    }, 5 * 60 * 1000);

    await state.update({ timeoutPrincipal: timeout });
  })
  .addAnswer(
    '🔙 Escribe *menú* para ver el menú principal.',
    { capture: true },
    async (ctx, { gotoFlow, flowDynamic, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      const input = ctx.body.trim().toLowerCase();

      if (/^men[uú]$/i.test(input)) {
        clearTimeout(await state.get('timeoutPrincipal'));
        await state.clear();
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (input === 'hola' || input === 'inicio') {
        clearTimeout(await state.get('timeoutPrincipal'));
        await state.clear();
        return gotoFlow(flowPrincipal);
      }

      await flowDynamic('❌ Opción no válida. Escribe *menú* para ver el menú principal.');
      return gotoFlow(flowEsperaPrincipal);
    }
  );

// ==== Flujo de espera para SIE ====
const flowEsperaSIE = addKeyword(EVENTS.ACTION)
  .addAction(async (_, { state, flowDynamic }) => {
    const timeout = setTimeout(async () => {
      console.log('⌛ Tiempo agotado en proceso SIE.');
      await flowDynamic('⏱️ Tiempo agotado. Por favor inicia el bot nuevamente escribiendo *Hola*.');
      await state.clear();
    }, 5 * 60 * 1000);

    await state.update({ timeoutSIE: timeout });
  })
  .addAnswer(
    '🔙 Escribe *menú* para regresar al menú principal.',
    { capture: true },
    async (ctx, { gotoFlow, flowDynamic, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      const input = ctx.body.trim().toLowerCase();

      if (/^men[uú]$/i.test(input)) {
        clearTimeout(await state.get('timeoutSIE'));
        await state.clear();
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (input === 'hola') {
        clearTimeout(await state.get('timeoutSIE'));
        await state.clear();
        return gotoFlow(flowPrincipal);
      }

      await flowDynamic('❌ Opción no válida. Escribe *menú* para regresar al menú principal.');
      return gotoFlow(flowEsperaSIE);
    }
  );

// ==== Flujo de espera para restablecimiento de contraseña ====
const flowEsperaContrasena = addKeyword(EVENTS.ACTION)
  .addAction(async (_, { state, flowDynamic }) => {
    const timeout = setTimeout(async () => {
      console.log('⌛ Tiempo agotado en restablecimiento de contraseña.');
      await flowDynamic('⏱️ Tiempo agotado. Por favor inicia el bot nuevamente escribiendo *Hola*.');
      await state.clear();
    }, 5 * 60 * 1000);

    await state.update({ timeoutContrasena: timeout });
  })
  .addAnswer(
    '🔙 Escribe *menú* para regresar al menú principal.',
    { capture: true },
    async (ctx, { gotoFlow, flowDynamic, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      const input = ctx.body.trim().toLowerCase();

      if (/^men[uú]$/i.test(input)) {
        clearTimeout(await state.get('timeoutContrasena'));
        await state.clear();
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (input === 'hola') {
        clearTimeout(await state.get('timeoutContrasena'));
        await state.clear();
        return gotoFlow(flowPrincipal);
      }

      await flowDynamic('❌ Opción no válida. Escribe *menú* para regresar al menú principal.');
      return gotoFlow(flowEsperaContrasena);
    }
  );

// ==== Flujo de espera para restablecimiento de autenticador ====
const flowEsperaAutenticador = addKeyword(EVENTS.ACTION)
  .addAction(async (_, { state, flowDynamic }) => {
    const timeout = setTimeout(async () => {
      console.log('⌛ Tiempo agotado en restablecimiento de autenticador.');
      await flowDynamic('⏱️ Tiempo agotado. Por favor inicia el bot nuevamente escribiendo *Hola*.');
      await state.clear();
    }, 5 * 60 * 1000);

    await state.update({ timeoutAutenticador: timeout });
  })
  .addAnswer(
    '🔙 Escribe *menú* para regresar al menú principal.',
    { capture: true },
    async (ctx, { gotoFlow, flowDynamic, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      const input = ctx.body.trim().toLowerCase();

      if (/^men[uú]$/i.test(input)) {
        clearTimeout(await state.get('timeoutAutenticador'));
        await state.clear();
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (input === 'hola') {
        clearTimeout(await state.get('timeoutAutenticador'));
        await state.clear();
        return gotoFlow(flowPrincipal);
      }

      await flowDynamic('❌ Opción no válida. Escribe *menú* para regresar al menú principal.');
      return gotoFlow(flowEsperaAutenticador);
    }
  );

// ==== Flujo de espera para menú Educación a Distancia ====
const flowEsperaMenuDistancia = addKeyword(EVENTS.ACTION)
  .addAction(async (_, { state, flowDynamic }) => {
    const timeout = setTimeout(async () => {
      console.log('⌛ Tiempo agotado en espera de menú Educación a Distancia.');
      await flowDynamic('⏱️ Tiempo agotado. Por favor inicia el bot nuevamente escribiendo *Hola*.');
      await state.clear();
    }, 5 * 60 * 1000);

    await state.update({ timeoutMenuDistancia: timeout });
  })
  .addAnswer(
    '🔙 Escribe *menú* para regresar al menú principal.',
    { capture: true },
    async (ctx, { gotoFlow, flowDynamic, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      const input = ctx.body.trim().toLowerCase();

      if (/^men[uú]$/i.test(input)) {
        clearTimeout(await state.get('timeoutMenuDistancia'));
        await state.clear();
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (input === 'hola') {
        clearTimeout(await state.get('timeoutMenuDistancia'));
        await state.clear();
        return gotoFlow(flowPrincipal);
      }

      await flowDynamic('❌ Opción no válida. Escribe *menú* para regresar al menú principal.');
      return gotoFlow(flowEsperaMenuDistancia);
    }
  );

// ==== Flujo de espera para menú SIE ====
const flowEsperaMenuSIE = addKeyword(EVENTS.ACTION)
  .addAction(async (_, { state, flowDynamic }) => {
    const timeout = setTimeout(async () => {
      console.log('⌛ Tiempo agotado en espera de menú SIE.');
      await flowDynamic('⏱️ Tiempo agotado. Por favor inicia el bot nuevamente escribiendo *Hola*.');
      await state.clear();
    }, 5 * 60 * 1000);

    await state.update({ timeoutMenuSIE: timeout });
  })
  .addAnswer(
    '🔙 Escribe *menú* para regresar al menú principal.',
    { capture: true },
    async (ctx, { gotoFlow, flowDynamic, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      const input = ctx.body.trim().toLowerCase();

      if (/^men[uú]$/i.test(input)) {
        clearTimeout(await state.get('timeoutMenuSIE'));
        await state.clear();
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (input === 'hola') {
        clearTimeout(await state.get('timeoutMenuSIE'));
        await state.clear();
        return gotoFlow(flowPrincipal);
      }

      await flowDynamic('❌ Opción no válida. Escribe *menú* para regresar al menú principal.');
      return gotoFlow(flowEsperaMenuSIE);
    }
  );

// ==== Flujo de acceso al SIE - CORREGIDO ====
const flowSIE = addKeyword(['sie']).addAnswer(
  '📚 Acceso al SIE\n' +
  'Por favor selecciona una opción:\n\n' +
  '1️⃣ Restablecer contraseña de acceso\n' +
  '2️⃣ No puedo ver mi horario o calificaciones\n\n' +
  '🔙 Escribe *menú* para volver al menú principal.',
  { capture: true },
  async (ctx, { flowDynamic, gotoFlow, state }) => { // 🔧 AGREGAR state aquí
    await debugFlujo(ctx, 'flowSIE');
    if (ctx.from === CONTACTO_ADMIN) return;

    const opcion = ctx.body.trim().toLowerCase();

    if (opcion === 'menu' || opcion === 'menú') {
      return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
    }

    if (opcion === '1') {
      await flowDynamic(
        '🔐 Para restablecer tu contraseña de acceso al SIE, por favor comunícate con tu *Coordinador de Carrera*. Ellos podrán asistirte directamente con el restablecimiento.'
      );
      return gotoFlow(flowEsperaMenuSIE);
    }

    if (opcion === '2') {
      return gotoFlow(flowrestablecerSIE);
    }

    await flowDynamic('❌ Opción no válida. Escribe *1* o *2*.');
    return gotoFlow(flowSIE);
  }
);

// ==== Flujo de captura con timeout - CORREGIDO ====
const flowCapturaNumeroControl = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    await debugFlujo(ctx, 'flowCapturaNumeroControl');
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en número de control');
        await flowDynamic('⏱️ No recibimos tu número de control. Serás redirigido al menú.');

        // 🔧 LIMPIAR ESTADO COMPLETAMENTE
        await limpiarEstado(state);

        // 🔧 REDIRIGIR AL MENÚ PRINCIPAL
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);

    await state.update({
      timeoutCaptura: timeout,
      ultimaInteraccion: Date.now()
    });
  })
  .addAnswer(
    '📝 Por favor escribe tu *número de control*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      // 🔧 LIMPIAR TIMEOUT INMEDIATAMENTE
      timeoutManager.clearTimeout(ctx.from);

      const input = ctx.body.trim().toLowerCase();

      if (input === 'menu' || input === 'menú') {
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (!input || input === '') {
        await flowDynamic('❌ No recibimos tu número de control. Por favor escríbelo.');
        return gotoFlow(flowCapturaNumeroControl);
      }

      if (!isValidText(input) || !validarNumeroControl(input)) {
        await flowDynamic('❌ Número de control inválido. Intenta de nuevo o escribe *menú* para volver.');
        return gotoFlow(flowCapturaNumeroControl);
      }

      await state.update({ numeroControl: input });
      await flowDynamic(`✅ Recibimos tu número de control: *${input}*`);

      // 🔧 LIMPIAR TIMEOUT ANTES DE CONTINUAR
      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowCapturaNombre);
    }
  );

// ==== Flujo de captura para autenticador ====
const flowCapturaNumeroControlAutenticador = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => { // 🔧 AGREGAR ctx
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en número de control - autenticador');
        await flowDynamic('⏱️ No recibimos tu número de control. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);

    await state.update({
      timeoutCaptura: timeout,
      ultimaInteraccion: Date.now()
    });
  })
  .addAnswer(
    '📝 Por favor escribe tu *número de control*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      timeoutManager.clearTimeout(ctx.from);

      const input = ctx.body.trim().toLowerCase();

      if (input === 'menu' || input === 'menú') {
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (!input || input === '') {
        await flowDynamic('❌ No recibimos tu número de control. Por favor escríbelo.');
        return gotoFlow(flowCapturaNumeroControlAutenticador);
      }

      if (!isValidText(input) || !validarNumeroControl(input)) {
        await flowDynamic('❌ Número de control inválido. Intenta de nuevo o escribe *menú* para volver.');
        return gotoFlow(flowCapturaNumeroControlAutenticador);
      }

      await state.update({ numeroControl: input });
      await flowDynamic(`✅ Recibimos tu número de control: *${input}*`);

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowCapturaNombreAutenticador);
    }
  );

// ==== Flujo de captura para SIE ====
const flowCapturaNumeroControlSIE = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => { // 🔧 AGREGAR ctx
    const timeout = setTimeout(async () => {
      console.log('⏱️ Timeout de 2 minutos en número de control - SIE');
      await flowDynamic('⏱️ No recibimos tu número de control. Serás redirigido al menú.');
      return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
    }, 2 * 60 * 1000);

    await state.update({ timeoutCaptura: timeout });
  })
  .addAnswer(
    '📝 Por favor escribe tu *número de control*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      clearTimeout(await state.get('timeoutCaptura'));

      const input = ctx.body.trim();

      if (!input || input === '') {
        await flowDynamic('❌ No recibimos tu número de control. Por favor escríbelo.');
        return gotoFlow(flowCapturaNumeroControlSIE);
      }

      const inputLower = input.toLowerCase();
      if (inputLower === 'menu' || inputLower === 'menú') {
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (!isValidText(input) || !validarNumeroControl(input)) {
        await flowDynamic('❌ Número de control inválido. Intenta de nuevo o escribe *menú* para volver.');
        return gotoFlow(flowCapturaNumeroControlSIE);
      }

      await state.update({ numeroControl: input });
      await flowDynamic(`✅ Recibimos tu número de control: *${input}*`);
      return gotoFlow(flowCapturaNombreSIE);
    }
  );

// ==== Flujo de captura para nombre (TRABAJADOR - CONTRASEÑA) ====
const flowCapturaNombreTrabajador = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en nombre trabajador');
        await flowDynamic('⏱️ No recibimos tu nombre completo. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);

    await state.update({
      timeoutCapturaNombre: timeout,
      ultimaInteraccion: Date.now()
    });
  })
  .addAnswer(
    '📝 Por favor escribe tu *nombre completo*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      timeoutManager.clearTimeout(ctx.from);

      const input = ctx.body.trim();

      if (!input || input === '') {
        await flowDynamic('❌ No recibimos tu nombre completo. Por favor escríbelo.');
        return gotoFlow(flowCapturaNombreTrabajador);
      }

      if (!isValidText(input) || !/^[a-zA-ZÁÉÍÓÚÑáéíóúñ\s]+$/.test(input)) {
        await flowDynamic('❌ Solo texto válido. Escribe tu *nombre completo*.');
        return gotoFlow(flowCapturaNombreTrabajador);
      }

      if (input.length < 3) {
        await flowDynamic('❌ El nombre parece muy corto. Escribe tu *nombre completo* real.');
        return gotoFlow(flowCapturaNombreTrabajador);
      }

      const myState = (await state.getMyState()) || {};
      const correoInstitucional = myState.correoInstitucional;

      await flowDynamic(`🙌 Gracias, *${input}*.\n✅ Registramos tu correo institucional: *${correoInstitucional}*`);
      await state.update({ nombreCompleto: input });

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowCapturaIdentificacion);
    }
  );

// ==== Flujo de captura para nombre (TRABAJADOR - AUTENTICADOR) - ACTUALIZADO ====
const flowCapturaNombreTrabajadorAutenticador = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en nombre trabajador - autenticador');
        await flowDynamic('⏱️ No recibimos tu nombre completo. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);

    await state.update({
      timeoutCapturaNombre: timeout,
      ultimaInteraccion: Date.now()
    });
  })
  .addAnswer(
    '📝 Por favor escribe tu *nombre completo*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      timeoutManager.clearTimeout(ctx.from);

      const input = ctx.body.trim();

      if (!input || input === '') {
        await flowDynamic('❌ No recibimos tu nombre completo. Por favor escríbelo.');
        return gotoFlow(flowCapturaNombreTrabajadorAutenticador);
      }

      if (!isValidText(input) || !/^[a-zA-ZÁÉÍÓÚÑáéíóúñ\s]+$/.test(input)) {
        await flowDynamic('❌ Solo texto válido. Escribe tu *nombre completo*.');
        return gotoFlow(flowCapturaNombreTrabajadorAutenticador);
      }

      if (input.length < 3) {
        await flowDynamic('❌ El nombre parece muy corto. Escribe tu *nombre completo* real.');
        return gotoFlow(flowCapturaNombreTrabajadorAutenticador);
      }

      const myState = (await state.getMyState()) || {};
      const correoInstitucional = myState.correoInstitucional;

      await flowDynamic(`🙌 Gracias, *${input}*.\n✅ Registramos tu correo institucional: *${correoInstitucional}*`);
      await state.update({ nombreCompleto: input });

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowCapturaIdentificacionAutenticador); // 🔧 Ahora redirige al flujo CORREGIDO
    }
  );

// ==== Flujo de captura para nombre (contraseña) ====
const flowCapturaNombre = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en nombre completo - contraseña');
        await flowDynamic('⏱️ No recibimos tu nombre completo. Serás redirigido al menú.');

        // 🔧 LIMPIAR ESTADO COMPLETAMENTE
        await limpiarEstado(state);

        // 🔧 REDIRIGIR AL MENÚ PRINCIPAL
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);

    // Guardar el timeout ID en el estado
    await state.update({
      timeoutCapturaNombre: timeout,
      ultimaInteraccion: Date.now()
    });
  })
  .addAnswer(
    '📝 Por favor escribe tu *nombre completo*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      // 🔧 LIMPIAR TIMEOUT INMEDIATAMENTE
      timeoutManager.clearTimeout(ctx.from);

      const input = ctx.body.trim();

      if (!input || input === '') {
        await flowDynamic('❌ No recibimos tu nombre completo. Por favor escríbelo.');
        return gotoFlow(flowCapturaNombre);
      }

      if (!isValidText(input) || !/^[a-zA-ZÁÉÍÓÚÑáéíóúñ\s]+$/.test(input)) {
        await flowDynamic('❌ Solo texto válido. Escribe tu *nombre completo*.');
        return gotoFlow(flowCapturaNombre);
      }

      if (input.length < 3) {
        await flowDynamic('❌ El nombre parece muy corto. Escribe tu *nombre completo* real.');
        return gotoFlow(flowCapturaNombre);
      }

      const myState = (await state.getMyState()) || {};
      const numeroControl = myState.numeroControl;

      await flowDynamic(`🙌 Gracias, *${input}*.\n✅ Registramos tu número de control: *${numeroControl}*`);
      await state.update({ nombreCompleto: input });

      // 🔧 LIMPIAR TIMEOUT ANTES DE CONTINUAR
      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowCapturaIdentificacion);
    }
  );

// ==== Flujo de captura para nombre (AUTENTICADOR) - ACTUALIZADO ====
const flowCapturaNombreAutenticador = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en nombre completo - autenticador');
        await flowDynamic('⏱️ No recibimos tu nombre completo. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);

    await state.update({
      timeoutCapturaNombre: timeout,
      ultimaInteraccion: Date.now()
    });
  })
  .addAnswer(
    '📝 Por favor escribe tu *nombre completo*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      timeoutManager.clearTimeout(ctx.from);

      const input = ctx.body.trim();

      if (!input || input === '') {
        await flowDynamic('❌ No recibimos tu nombre completo. Por favor escríbelo.');
        return gotoFlow(flowCapturaNombreAutenticador);
      }

      if (!isValidText(input) || !/^[a-zA-ZÁÉÍÓÚÑáéíóúñ\s]+$/.test(input)) {
        await flowDynamic('❌ Solo texto válido. Escribe tu *nombre completo*.');
        return gotoFlow(flowCapturaNombreAutenticador);
      }

      if (input.length < 3) {
        await flowDynamic('❌ El nombre parece muy corto. Escribe tu *nombre completo* real.');
        return gotoFlow(flowCapturaNombreAutenticador);
      }

      const myState = (await state.getMyState()) || {};
      const numeroControl = myState.numeroControl;

      await flowDynamic(`🙌 Gracias, *${input}*.\n✅ Registramos tu número de control: *${numeroControl}*`);
      await state.update({ nombreCompleto: input });

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowCapturaIdentificacionAutenticador); // 🔧 Ahora redirige al flujo CORREGIDO
    }
  );

// ==== Flujo de captura para nombre (SIE) ====
const flowCapturaNombreSIE = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => { // 🔧 AGREGAR ctx
    const timeout = setTimeout(async () => {
      console.log('⏱️ Timeout de 2 minutos en nombre completo - SIE');
      await flowDynamic('⏱️ No recibimos tu nombre completo. Serás redirigido al menú.');
      return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
    }, 2 * 60 * 1000);

    await state.update({ timeoutCaptura: timeout });
  })
  .addAnswer(
    '📝 Por favor escribe tu *nombre completo*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      clearTimeout(await state.get('timeoutCaptura'));

      const input = ctx.body.trim();

      if (!input || input === '') {
        await flowDynamic('❌ No recibimos tu nombre completo. Por favor escríbelo.');
        return gotoFlow(flowCapturaNombreSIE);
      }

      if (!isValidText(input) || !/^[a-zA-ZÁÉÍÓÚÑáéíóúñ\s]+$/.test(input)) {
        await flowDynamic('❌ Solo texto válido. Escribe tu *nombre completo*.');
        return gotoFlow(flowCapturaNombreSIE);
      }

      if (input.length < 3) {
        await flowDynamic('❌ El nombre parece muy corto. Escribe tu *nombre completo* real.');
        return gotoFlow(flowCapturaNombreSIE);
      }

      const myState = (await state.getMyState()) || {};
      const numeroControl = myState.numeroControl || 'Sin matrícula';

      await flowDynamic(`🙌 Gracias, *${input}*.\n✅ Registramos tu número de control: *${numeroControl}*`);
      await state.update({ nombreCompleto: input });
      return gotoFlow(flowFinSIE);
    }
  );

// ==== Flujo de restablecimiento de contraseña (MODIFICADO) ====
const flowrestablecercontrase = addKeyword(['restablecer_contraseña_opcion1']) // 🔧 CAMBIADO: Palabra clave única
  .addAction(async (ctx, { flowDynamic, gotoFlow, state }) => {
    if (ctx.from === CONTACTO_ADMIN) return;

    await flowDynamic([
      '🔐 *Restablecimiento de Contraseña* 🔐',
      '',
      'Vamos a ayudarte a restablecer la contraseña de tu correo institucional.',
      '',
      'Primero necesitamos saber tu tipo de usuario:'
    ].join('\n'));

    return gotoFlow(flowSubMenuContrasena);
  });

// ==== Flujo de restablecimiento de autenticador (MODIFICADO) ====
const flowrestablecerautenti = addKeyword(['restablecer_autenticador_opcion2']) // 🔧 CAMBIADO: Palabra clave única
  .addAction(async (ctx, { flowDynamic, gotoFlow, state }) => {
    if (ctx.from === CONTACTO_ADMIN) return;

    await flowDynamic([
      '🔑 *Configuración de Autenticador* 🔑',
      '',
      'Vamos a ayudarte a configurar tu autenticador.',
      '',
      'Primero necesitamos saber tu tipo de usuario:'
    ].join('\n'));

    return gotoFlow(flowSubMenuAutenticador);
  });

// ==== Flujo de restablecimiento de SIE ====
const flowrestablecerSIE = addKeyword(EVENTS.ACTION).addAnswer(
  [
    '📄 Vamos a comenzar el proceso de sincronización de tus datos en el *SIE*.',
    '\n🚨 Ahora necesitamos tu número de control para continuar.',
    '\n🔙 Escribe *menú* para volver al menú principal.'
  ],
  null,
  async (ctx, { gotoFlow }) => {
    if (ctx.from === CONTACTO_ADMIN) return;
    return gotoFlow(flowCapturaNumeroControlSIE);
  }
);

// ==== Flujo de agradecimiento ====
const flowGracias = addKeyword(EVENTS.ACTION).addAction(
  async (ctx, { flowDynamic }) => {
    await debugFlujo(ctx, 'flowGracias');
    if (ctx.from === CONTACTO_ADMIN) return;

    await flowDynamic(
      '🙏 ¡Gracias por comunicarte con el Centro de Cómputo del ITA! 💙\n' +
      'Estamos para ayudarte siempre que lo necesites.\n\n' +
      'En dado caso de que tengas más dudas o requieras asistencia adicional, no dudes en contactarnos nuevamente \n\n Tambien puedes comunicarte a los siguientes telefonos: \n Centro de cómputo: 449 910 50 02 EXT. 145 \n Coordinación de educación a distancia 449 910 50 02 EXT. 125' +
      '🔙 Escribe *menú* si deseas regresar al inicio.'
    )
    console.log('✅ Mensaje de agradecimiento enviada correctamente \n')
  }
)

// ==== Flujo de Educación a Distancia ====
const flowDistancia = addKeyword(['Moodle'])
  .addAction(async (ctx, { flowDynamic, gotoFlow, state }) => {
    await debugFlujo(ctx, 'flowDistancia');
    if (ctx.from === CONTACTO_ADMIN) return;

    if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
      return;
    }

    try {
      await flowDynamic([{
        body: '😞 Por el momento no podemos apoyarte con el restablecimiento de contraseña de tu *Moodle*. \n👉 Te invitamos a asistir a *Coordinación de Educación a Distancia*. \n📍 Sus oficinas están en el edificio de *Idiomas* (planta baja), frente a la sala Isóptica, a un costado del elevador.',
        media: 'https://raw.githubusercontent.com/CapYAN09/ProyectosITA/main/img/Imagen_de_WhatsApp_2025-09-10_a_las_13.53.25_7b1508b3-removebg-preview.png'
      }])
      console.log('✅ Imagen de Educación a distancia enviada correctamente \n')
    } catch (error) {
      console.error('❌ Error enviando imagen:', error.message)
      await flowDynamic('😞 Por el momento no podemos apoyarte con el restablecimiento de contraseña de tu *Moodle*. \n👉 Te invitamos a asistir a *Coordinación de Educación a Distancia*. \n📍 Sus oficinas están en el edificio de *Idiomas* (planta baja), frente a la sala Isóptica, a un costado del elevador.')
    }

    return gotoFlow(flowEsperaMenuDistancia);
  });

// ==== Función auxiliar para detectar saludos - CORREGIDA ====
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
    'cuáles son mis credenciales', 'cuales son mis credenciales', 'dime mis credenciales'
  ];

  // 🔧 CORRECCIÓN: BÚSQUEDA SIMPLIFICADA Y EFICIENTE
  // Coincidencia exacta
  for (const saludo of saludos) {
    const saludoLimpio = saludo.toLowerCase().trim();
    if (textoLimpio === saludoLimpio) {
      console.log(`✅ Coincidencia exacta: "${textoLimpio}"`);
      return true;
    }
  }

  // Coincidencia parcial (más flexible)
  for (const saludo of saludos) {
    const saludoLimpio = saludo.toLowerCase().trim();
    if (textoLimpio.includes(saludoLimpio)) {
      console.log(`✅ Coincidencia parcial: "${textoLimpio}" contiene "${saludoLimpio}"`);
      return true;
    }
  }

  // Verificar si contiene palabras clave importantes
  const palabrasClave = [
    'hola', 'problema', 'ayuda', 'cuenta', 'acceso',
    'contraseña', 'autenticador', 'disculpa', 'restablecer',
    'configurar', 'soporte', 'ayudar', 'asistencia'
  ];

  const contienePalabraClave = palabrasClave.some(palabra =>
    textoLimpio.includes(palabra)
  );

  if (contienePalabraClave) {
    console.log(`✅ Contiene palabra clave: "${textoLimpio}"`);
    return true;
  }

  console.log(`❌ No es saludo válido: "${textoLimpio}"`);
  return false;
}

// ==== FLUJO PRINCIPAL - VERSIÓN HÍBRIDA (MÁS ROBUSTA) ====
// ==== FLUJO PRINCIPAL - VERSIÓN HÍBRIDA (MÁS ROBUSTA) ====
const flowPrincipal = addKeyword([
  'hola', 'Hola', 'Hola!', 'HOLA', 'Holi', 'holi', 'holis', 'Holis',
  'holaa', 'Holaa', 'holaaa', 'Holaaa', 'holaaaa', 'Holaaaa',
  'buenos días', 'buenas tardes', 'buenas noches',
  'buenos dias', 'Buenos días', 'Buenas tardes', 'Buenas noches',
  'inicio', 'Inicio', 'comenzar', 'Comenzar', 'empezar', 'Empezar',
  'ayuda', 'Ayuda', 'start', 'Start', 'hello', 'Hello', 'hi', 'Hi'
])
  .addAction(async (ctx, { flowDynamic, state, gotoFlow, provider }) => {
    // 🔧 NORMALIZAR ID PRIMERO (AGREGAR ESTA LÍNEA)
    ctx.from = normalizarIdWhatsAppBusiness(ctx.from);

    console.log(`🎯 FLOW PRINCIPAL - ID Normalizado: ${ctx.from}`);

    await debugFlujo(ctx, 'flowPrincipal');

    if (ctx.from === normalizarIdWhatsAppBusiness(CONTACTO_ADMIN)) return;

    // 🔧 VERIFICAR BLOQUEO PRIMERO
    if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
      return;
    }

    const input = ctx.body?.toLowerCase().trim();
    console.log(`🔍 FLOW PRINCIPAL - Mensaje: "${input}"`);

    // 🔧 MEJORAR LA DETECCIÓN DE SALUDOS
    const esSaludo = esSaludoValido(input);

    if (!esSaludo) {
      console.log(`⚠️ Mensaje no reconocido como saludo: "${input}"`);
      // Pero como llegó aquí por palabra clave, procedemos igual
    }

    console.log(`✅ BOT ACTIVADO por: "${input}"`);

    // LIMPIAR ESTADO Y PROCEDER
    await limpiarEstado(state);
    await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_MENU);

    // ENVIAR BIENVENIDA
    try {
      await flowDynamic([{
        body: '🎉 ¡Bienvenido al bot de Centro de Cómputo del ITA!',
        media: 'https://raw.githubusercontent.com/CapYAN09/ProyectosITA/main/img/Imagen_de_WhatsApp_2025-09-05_a_las_11.03.34_cdb84c7c-removebg-preview.png'
      }]);
    } catch (error) {
      await flowDynamic('🎉 ¡Bienvenido al *AguiBot* del ITA!');
    }

    return gotoFlow(flowMenu);
  });


// ==== FLUJO MENÚ PRINCIPAL - ACTUALIZADO ====
const flowMenu = addKeyword(['menu', 'menú', '1', '2', '3', '4', '5', '6', '7', '8'])
  .addAction(async (ctx, { flowDynamic, gotoFlow, state }) => {
    ctx.from = normalizarIdWhatsAppBusiness(ctx.from);

    console.log('📱 FLOW MENÚ - Mensaje recibido:', ctx.body, 'Usuario:', ctx.from);

    if (ctx.from === normalizarIdWhatsAppBusiness(CONTACTO_ADMIN)) return;

    // 🔧 VERIFICAR BLOQUEO PRIMERO
    if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
      return;
    }

    const opcion = ctx.body.trim();

    // 🔧 ACTUALIZAR ESTADO AL ESTAR EN MENÚ
    await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_MENU);

    // Si es un comando de menú, mostrar opciones
    if (opcion === 'menu' || opcion === 'menú') {
      await mostrarOpcionesMenu(flowDynamic);
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
    //'7️⃣ 👨‍💼 Gestión de Servicios (Exclusivo Trabajadores)',
    //'8️⃣ 🗃️ Acceso a Base de Datos Actextita',
    '',
    '💡 *Escribe solo el número (1-8)*'
  ].join('\n'));
}

// ==== FUNCIÓN PARA PROCESAR OPCIONES - ACTUALIZADA ====
async function procesarOpcionMenu(opcion, flowDynamic, gotoFlow, state) {
  console.log('🎯 Procesando opción:', opcion);

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

// ==== Flujo para comandos especiales durante procesos (SIMPLIFICADO) ====
const flowComandosEspeciales = addKeyword(['estado']) // 🔧 Solo "estado"
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    await debugFlujo(ctx, 'flowComandosEspeciales');
    if (ctx.from === CONTACTO_ADMIN) return;

    const myState = await state.getMyState();
    const comando = ctx.body.toLowerCase();

    if (comando === 'estado') {
      if (myState?.estadoUsuario === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
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
      } else {
        await flowDynamic('✅ No tienes procesos activos. Serás redirigido al menú.');
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }
    }

    // 🔧 Siempre regresar al flujo de bloqueo después de mostrar estado
    if (myState?.estadoUsuario === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
      return gotoFlow(flowBloqueoActivo);
    }

    return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
  });

// ==== VERIFICACIÓN DE LA BASE DE DATOS - ACTUALIZADA ====
async function verificarBaseDeDatos() {
  try {
    console.log('🔍 Verificando conexión a MySQL...');

    const connection = await crearConexionMySQL();
    if (!connection) {
      console.error('❌ No se pudo conectar a la base de datos');
      console.log('💡 Verifica que:');
      console.log('   1. XAMPP esté ejecutándose');
      console.log('   2. MySQL esté activo en puerto 3306');
      console.log('   3. La base de datos "bot_whatsapp" exista');
      return false;
    }

    // Verificar que la tabla existe con todas las columnas necesarias
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

        // Verificar si faltan columnas y agregarlas
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

  // 🔧 DETECCIÓN MÁS FLEXIBLE DE SALUDOS
  if (esSaludoValido(input)) {
    console.log(`🔄 Saludo válido detectado en flowDefault: "${input}", redirigiendo al flowPrincipal...`);
    return gotoFlow(flowPrincipal);
  }

  // 🔧 SI ES UN NÚMERO SOLO (1-5), REDIRIGIR AL MENÚ
  if (/^[1-5]$/.test(input)) {
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
    '',
    '📋 **O selecciona una opción directa:**',
    '1️⃣ Restablecer contraseña',
    '2️⃣ Configurar autenticador',
    '3️⃣ Educación a Distancia',
    '4️⃣ Sistema SIE',
    '5️⃣ Información CC',
    '6️⃣ No conozco mis credenciales',
    //'7️⃣ 👨‍💼 Gestión de Servicios (Exclusivo Trabajadores)',
    //'8️⃣ 🗃️ Acceso a Base de Datos Actextita',
    '',
    '🔙 Escribe *hola* para comenzar.'
  ]);
});

// ==== FLUJO MEJORADO PARA GESTIÓN DE SERVICIOS ====
const flowGestionServicios = addKeyword(EVENTS.ACTION)
  .addAnswer(
    [
      '👨‍💼 *GESTIÓN DE SERVICIOS - EXCLUSIVO TRABAJADORES* 👨‍💼',
      '',
      //'🔗 *Conectado a base de datos remota: 172.30.247.185*',
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
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      await debugFlujo(ctx, 'flowGestionServicios');
      if (ctx.from === CONTACTO_ADMIN) return;

      const opcion = ctx.body.trim().toLowerCase();

      if (opcion === 'menu' || opcion === 'menú') {
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (opcion === '1') {
        await flowDynamic('🔐 Iniciando proceso de restablecimiento de contraseña de acceso del sistema...');
        return gotoFlow(flowRestablecimientoSistema);
      }

      if (opcion === '2') {
        await flowDynamic('👤 Iniciando proceso de solicitud de nuevo usuario...');
        return gotoFlow(flowNuevoUsuario);
      }

      if (opcion === '3') {
        await flowDynamic('🔍 Iniciando consulta de información de usuarios...\n\n🔗 *Conectando a 172.30.247.185*');
        return gotoFlow(flowConsultaUsuario);
      }

      await flowDynamic('❌ Opción no válida. Escribe *1*, *2* o *3*.');
      return gotoFlow(flowGestionServicios);
    }
  );

// ==== FLUJO PARA RESTABLECIMIENTO DE SISTEMA (ACTUALIZADO) ====
const flowRestablecimientoSistema = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en restablecimiento sistema');
        await flowDynamic('⏱️ Tiempo agotado. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);

    await state.update({
      timeoutCaptura: timeout,
      ultimaInteraccion: Date.now()
    });
  })
  .addAnswer(
    '📝 Por favor escribe tu *nombre completo*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      timeoutManager.clearTimeout(ctx.from);

      const input = ctx.body.trim();

      if (input === 'menu' || input === 'menú') {
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (!input || input === '') {
        await flowDynamic('❌ No recibimos tu nombre completo. Por favor escríbelo.');
        return gotoFlow(flowRestablecimientoSistema);
      }

      if (!isValidText(input) || !/^[a-zA-ZÁÉÍÓÚÑáéíóúñ\s]+$/.test(input)) {
        await flowDynamic('❌ Solo texto válido. Escribe tu *nombre completo*.');
        return gotoFlow(flowRestablecimientoSistema);
      }

      await state.update({ nombreCompleto: input });
      await flowDynamic(`✅ Recibimos tu nombre: *${input}*`);

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowCapturaDepartamento); // 🔧 USA TU FLUJO EXISTENTE
    }
  );

// ==== FLUJO PARA CAPTURAR DEPARTAMENTO ====
const flowCapturaDepartamento = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en departamento');
        await flowDynamic('⏱️ Tiempo agotado. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);

    await state.update({
      timeoutCaptura: timeout,
      ultimaInteraccion: Date.now()
    });
  })
  .addAnswer(
    '🏢 Por favor escribe el *departamento al que perteneces*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      timeoutManager.clearTimeout(ctx.from);

      const input = ctx.body.trim();

      if (input === 'menu' || input === 'menú') {
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (!input || input === '') {
        await flowDynamic('❌ No recibimos el departamento. Por favor escríbelo.');
        return gotoFlow(flowCapturaDepartamento);
      }

      if (!isValidText(input)) {
        await flowDynamic('❌ Texto inválido. Escribe el *nombre del departamento*.');
        return gotoFlow(flowCapturaDepartamento);
      }

      await state.update({ departamento: input });
      await flowDynamic(`✅ Recibimos tu departamento: *${input}*`);

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowCapturaUsuarioSistema);
    }
  );

// ==== FLUJO PARA SOLICITUD DE NUEVO USUARIO ====
const flowNuevoUsuario = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en nuevo usuario');
        await flowDynamic('⏱️ Tiempo agotado. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);

    await state.update({
      timeoutCaptura: timeout,
      ultimaInteraccion: Date.now()
    });
  })
  .addAnswer(
    '📝 Por favor escribe tu *nombre completo*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      timeoutManager.clearTimeout(ctx.from);

      const input = ctx.body.trim();

      if (input === 'menu' || input === 'menú') {
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (!input || input === '') {
        await flowDynamic('❌ No recibimos tu nombre completo. Por favor escríbelo.');
        return gotoFlow(flowNuevoUsuario);
      }

      if (!isValidText(input) || !/^[a-zA-ZÁÉÍÓÚÑáéíóúñ\s]+$/.test(input)) {
        await flowDynamic('❌ Solo texto válido. Escribe tu *nombre completo*.');
        return gotoFlow(flowNuevoUsuario);
      }

      await state.update({ nombreCompleto: input });
      await flowDynamic(`✅ Recibimos tu nombre: *${input}*`);

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowCapturaArea);
    }
  );

const flowCapturaArea = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow, provider }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en área');
        await flowDynamic('⏱️ Tiempo agotado. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);

    await state.update({
      timeoutCaptura: timeout,
      ultimaInteraccion: Date.now()
    });
  })
  .addAnswer(
    '🏢 Por favor escribe el *área a la que perteneces*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      timeoutManager.clearTimeout(ctx.from);

      const input = ctx.body.trim();

      if (input === 'menu' || input === 'menú') {
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (!input || input === '') {
        await flowDynamic('❌ No recibimos el área. Por favor escríbelo.');
        return gotoFlow(flowCapturaArea);
      }

      if (!isValidText(input)) {
        await flowDynamic('❌ Texto inválido. Escribe el *nombre del área*.');
        return gotoFlow(flowCapturaArea);
      }

      // 🔧 OBTENER DATOS ACTUALES
      const myState = await state.getMyState();
      const nombreCompleto = myState.nombreCompleto;
      const userPhone = ctx.from;

      if (!nombreCompleto) {
        await flowDynamic('❌ Error: No tenemos tu nombre completo. Volviendo al inicio.');
        return gotoFlow(flowNuevoUsuario);
      }

      // 🔧 GENERAR USUARIO Y CONTRASEÑA
      const nuevoUsuario = formatearNombreUsuario(input);
      const nuevaContrasena = generarContrasenaSegura();

      console.log(`🔧 Generando nuevo usuario: ${nuevoUsuario} para ${nombreCompleto}`);

      // ✅ PRIMERO: INSERTAR DIRECTAMENTE EN LA TABLA usuariosprueba
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

      // 🔒 ACTUALIZAR ESTADO - BLOQUEAR USUARIO (SOLO DATOS SIMPLES)
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

      // 🔧 CORRECCIÓN: PASAR ctx COMO PRIMER PARÁMETRO
      await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_PROCESO_LARGO, metadataProceso);

      // ✅ ENVIAR INFORMACIÓN AL ADMINISTRADOR
      const mensajeAdmin = `🔔 *SOLICITUD DE CREACIÓN DE NUEVO USUARIO* 🔔\n\n📋 *Información del trabajador:*\n👤 Nombre: ${nombreCompleto}\n🏢 Área: ${input}\n👤 *Nuevo usuario generado:* ${nuevoUsuario}\n🔐 *Contraseña generada:* ${nuevaContrasena}\n📞 Teléfono: ${userPhone}\n💾 *INSERTADO EN usuariosprueba:* ${insercionExitosa ? '✅ EXITOSO' : '❌ FALLÓ'}\n🏠 *Servidor:* 172.30.247.184\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n\n⚠️ *Proceso en curso...*`;

      const envioExitoso = await enviarAlAdmin(provider, mensajeAdmin);

      // 📱 MENSAJE AL USUARIO
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

      // 🔔 SISTEMA DE NOTIFICACIONES CADA 10 MINUTOS (solo si se insertó correctamente)
      if (insercionExitosa) {
        let notificacionesEnviadas = 0;
        const maxNotificaciones = 3;

        console.log(`🔔 Iniciando notificaciones para ${userPhone} - ${nombreCompleto}`);

        // 🔧 USAR TIMEOUT MANAGER PARA EL INTERVALO
        timeoutManager.setInterval(userPhone, async () => {
          notificacionesEnviadas++;
          const minutosTranscurridos = notificacionesEnviadas * 10;
          const minutosRestantes = 30 - minutosTranscurridos;

          // Verificar que el usuario todavía está en proceso
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

              // 🔧 ACTUALIZAR SOLO DATOS SIMPLES - PASAR ctx
              await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
                ...metadataProceso,
                notificacionesEnviadas: notificacionesEnviadas,
                ultimaNotificacion: Date.now()
              });

            } catch (error) {
              console.error('❌ Error enviando notificación:', error.message);
            }
          } else {
            // Detener intervalo cuando se completen las notificaciones
            timeoutManager.clearInterval(userPhone);
          }
        }, 10 * 60 * 1000); // 10 minutos

        // ⏰ PROCESO DE 30 MINUTOS - MENSAJE FINAL
        timeoutManager.setTimeout(userPhone, async () => {
          // 🔧 LIMPIAR INTERVALO AL TERMINAR
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

          // 🔓 LIBERAR ESTADO al finalizar
          await limpiarEstado(state);
          await limpiarEstadoMySQL(userPhone);

        }, 30 * 60 * 1000); // 30 minutos

      } else {
        // ❌ SI FALLÓ LA INSERCIÓN
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
        return gotoFlow(flowEsperaMenu);
      }

      timeoutManager.clearTimeout(userPhone);
      return gotoFlow(flowBloqueoActivo);
    }
  );

// ==== FLUJO MEJORADO PARA CAPTURAR USUARIO DEL SISTEMA ====
const flowCapturaUsuarioSistema = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en usuario sistema');
        await flowDynamic('⏱️ Tiempo agotado. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);

    await state.update({
      timeoutCaptura: timeout,
      ultimaInteraccion: Date.now()
    });
  })
  .addAnswer(
    '👤 Por favor escribe tu *nombre de usuario del sistema* (el que usas para iniciar sesión):',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      timeoutManager.clearTimeout(ctx.from);

      const input = ctx.body.trim();

      if (input === 'menu' || input === 'menú') {
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (!input || input === '') {
        await flowDynamic('❌ No recibimos tu usuario del sistema. Por favor escríbelo.');
        return gotoFlow(flowCapturaUsuarioSistema);
      }

      if (!isValidText(input)) {
        await flowDynamic('❌ Texto inválido. Escribe tu *nombre de usuario del sistema*.');
        return gotoFlow(flowCapturaUsuarioSistema);
      }

      // 🔧 VERIFICAR PRIMERO SI EL USUARIO EXISTE
      await flowDynamic('🔍 Verificando usuario en el sistema...');

      try {
        await inicializarConexionRemota();
        if (!conexionRemota) {
          await flowDynamic('❌ Error de conexión a la base de datos. Intenta más tarde.');
          return gotoFlow(flowGestionServicios);
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
          return gotoFlow(flowCapturaUsuarioSistema);
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
        return gotoFlow(flowGestionServicios);
      }

      // 🔧 GENERAR NUEVA CONTRASEÑA AUTOMÁTICAMENTE
      const nuevaContrasena = generarContrasenaSegura();

      await state.update({
        usuarioSistema: input,
        nuevaContrasena: nuevaContrasena
      });

      // 🔒 ACTUALIZAR ESTADO - BLOQUEAR USUARIO
      await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
        tipo: "🔐 Restablecimiento de Contraseña del Sistema",
        inicio: Date.now(),
        esTrabajador: true
      });

      const myState = await state.getMyState();
      const nombreCompleto = myState.nombreCompleto;
      const departamento = myState.departamento;
      const usuarioSistema = myState.usuarioSistema;

      // ✅ ACTUALIZAR CONTRASEÑA EN TABLA usuariosprueba
      await flowDynamic('🔄 Actualizando contraseña en el sistema...');

      const actualizacionExitosa = await actualizarContrasenaEnusuariosprueba(
        usuarioSistema,
        nuevaContrasena,
        ctx.from
      );

      // ✅ ENVIAR INFORMACIÓN AL ADMINISTRADOR
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

      // 🔔 NOTIFICACIONES CADA 10 MINUTOS
      const intervalId = setInterval(async () => {
        minutosRestantes -= 10;
        if (minutosRestantes > 0) {
          try {
            await flowDynamic(`⏳ Hola *${nombreCompleto}*, faltan *${minutosRestantes} minutos* para completar el restablecimiento de tu contraseña...`);
          } catch (error) {
            console.error('❌ Error enviando notificación:', error.message);
          }
        }
      }, 10 * 60000);

      // Simular proceso de 30 minutos
      const timeoutId = setTimeout(async () => {
        // 🔧 LIMPIAR INTERVALO AL TERMINAR
        clearInterval(intervalId);

        try {
          // 🔧 MENSAJE FINAL CON CREDENCIALES
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

        // 🔓 LIBERAR ESTADO al finalizar
        await limpiarEstado(state);
      }, 30 * 60000);

      await state.update({
        estadoMetadata: {
          ...(await state.getMyState())?.estadoMetadata,
          timeoutId: timeoutId,
          intervalId: intervalId
        }
      });

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowBloqueoActivo);
    }
  );

// ==== Inicialización CORREGIDA ====
const main = async () => {
  try {
    console.log('🚀 Iniciando bot de WhatsApp...');

    // 🔍 DIAGNÓSTICO WHATSAPP BUSINESS - AGREGADO
    console.log('\n🔍 DIAGNÓSTICO WHATSAPP BUSINESS:');
    console.log('📱 Contacto Admin:', CONTACTO_ADMIN);
    console.log('🔄 Contacto Normalizado:', normalizarIdWhatsAppBusiness(CONTACTO_ADMIN));
    console.log('🗄️  BD Configurada:', adapterDB ? '✅' : '❌');
    console.log('🔧 Provider Business:', 'Configurado con ajustes Business');
    console.log('----------------------------------------\n');

    // 🔍 VERIFICAR ESTRUCTURA DE TABLA AL INICIAR
    console.log('\n🔍 VERIFICANDO ESTRUCTURA DE TABLAS...');
    await verificarEstructurausuariosprueba();
    console.log('----------------------------------------\n');
    // En tu función main(), después de crear el flow:
    console.log('🎯 ORDEN DE FLUJOS CONFIGURADO:');
    console.log('  1. Seguridad e Interceptor Global');
    console.log('  2. Entrada Principal y Menú');
    console.log('  3. Acciones Rápidas');
    console.log('  4. Consultas y Base de Datos');
    console.log('  5. Capturas de Datos');
    console.log('  6. Procesos Largos (al final)');
    console.log('  7. Flujo Default (siempre último)');
    console.log('----------------------------------------\n');
    // Verificar la base de datos antes de iniciar
    const dbOk = await verificarBaseDeDatos();
    if (!dbOk) {
      console.log('⚠️ Modo sin base de datos - Los estados no persistirán');
    } else {
      console.log('🎯 Base de datos lista - Estados persistirán correctamente');
      // Inicializar nuestra conexión
      await inicializarMySQL();
    }

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
    /*
    const adapterFlow = createFlow([
      // ==================== 🛡️ FLUJOS DE SEGURIDAD ====================
      flowBlockAdmin,

      // ==================== 🔄 INTERCEPTOR GLOBAL (PRIMERO) ====================
      flowInterceptorGlobal,  // 🔧 PRIMERO - maneja inactividad pero permite saludos

      // ==================== 🎯 FLUJOS PRINCIPALES (PRIMERO) ====================
      flowPrincipal,  // 🔧 PRIMERO - captura todos los saludos
      flowMenu,       // 🔧 SEGUNDO - maneja el menú principal

      // ==================== 🔄 COMANDOS ESPECIALES ====================
      flowComandosEspeciales,

      // ==================== 🎪 SUBMENÚS ====================
      flowSubMenuContrasena,
      flowSubMenuAutenticador,

      // ==================== 🔄 FLUJOS DE CAPTURA DE DATOS ====================
      flowCapturaNumeroControl,
      flowCapturaNombre,
      flowCapturaNumeroControlAutenticador,
      flowCapturaNombreAutenticador,
      flowCapturaNumeroControlSIE,
      flowCapturaNombreSIE,

      // ==================== 👨‍💼 GESTIÓN DE SERVICIOS TRABAJADORES ====================
      flowGestionServicios,
      flowRestablecimientoSistema,
      flowCapturaDepartamento,
      flowCapturaUsuarioSistema,
      flowNuevoUsuario,
      flowCapturaArea,
      flowGestionServicios,
      flowRestablecimientoSistema,

      // ==================== 📧 FLUJOS PARA TRABAJADORES ====================
      flowCapturaCorreoTrabajador,
      flowCapturaNombreTrabajador,
      flowCapturaCorreoTrabajadorAutenticador,
      flowCapturaNombreTrabajadorAutenticador,

      // ==================== 📸 FLUJOS DE IDENTIFICACIÓN ====================
      flowCapturaIdentificacion,
      flowCapturaIdentificacionAutenticador,

      // ==================== ⚡ FLUJOS DE ACCIÓN RÁPIDA ====================
      flowDistancia,
      flowGracias,
      flowSIE,

      // ==================== 🔍 FLUJOS DE CONSULTA BD REMOTA ====================
      flowConsultaUsuario,
      flowBuscarUsuarioEspecifico,
      flowListarTodosUsuarios,

      // ==================== 🗃️ BASE DE DATOS ACTEXTITA ====================
      flowConexionBaseDatos,
      flowCapturaNumeroControlBaseDatos,
      flowCapturaUsuarioAdmin,

      // ==================== 🔄 FLUJOS DE INICIO DE PROCESOS ====================
      flowrestablecercontrase,
      flowrestablecerautenti,

      // ==================== 🔐 FLUJOS DE PROCESOS LARGOS ====================
      flowrestablecerSIE,

      // ==================== ⏳ FLUJOS FINALES (BLOQUEAN USUARIO) ====================
      flowContrasena,
      flowAutenticador,
      flowFinSIE,
      flowBloqueoActivo,
      flowInfoCredenciales,

      // ==================== 🕒 FLUJOS DE ESPERA ====================
      flowEsperaPrincipal,
      flowEsperaMenu,
      flowEsperaSIE,
      flowEsperaContrasena,
      flowEsperaAutenticador,
      flowEsperaMenuDistancia,
      flowEsperaMenuSIE,

      // ==================== ❓ FLUJO POR DEFECTO (ÚLTIMO) ====================
      flowDefault
    ])*/


    // ==== CONFIGURACIÓN DEL PROVIDER - VERSIÓN CORREGIDA Y OPTIMIZADA ====
    const adapterProvider = createProvider(BaileysProvider, {
      printQRInTerminal: true,
      browser: ['Chrome', 'Windows', '10.0'],
      browser: ['Chrome (Linux)', '', ''],
      auth: {
        // Configuración de autenticación más robusta
        clientId: "BOT_ITA_" + Date.now(),
      },

      // 🔧 CONFIGURACIÓN BUSINESS
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
      syncFullHistory: false,
      linkPreviewImageThumbnailWidth: 192,

      // 🔧 CONFIGURACIÓN DE NEGOCIO
      businessName: "Centro de Cómputo ITA",
      businessDescription: "Soporte técnico para estudiantes y personal",

      // 🔧 CONFIGURACIÓN DE LOGS
      logger: {
        level: 'warn' // Reducir logs para mejor diagnóstico
      },

      // 🔧 CONFIGURACIÓN DE RECONEXIÓN
      reconnect: true,
      maxRetries: 5,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,

      // 🔧 CONFIGURACIÓN ADICIONAL
      emitOwnEvents: false,
      defaultQueryTimeoutMs: 45000,
      fireInitQueries: true,

      // 🔧 ELIMINAR configuraciones duplicadas
    });

    console.log('🔧 Creando bot...');
    await createBot({
      flow: adapterFlow,
      provider: adapterProvider,
      database: adapterDB
    });

    console.log('✅ Bot iniciado correctamente');
    console.log('📱 Escaneando QR code...');

    QRPortalWeb();

  } catch (error) {
    console.error('❌ Error crítico al iniciar el bot:', error);
  }
}

main();

//final de app.js