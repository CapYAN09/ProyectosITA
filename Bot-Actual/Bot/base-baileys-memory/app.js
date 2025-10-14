const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot')
const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const MySQLAdapter = require('@bot-whatsapp/database/mysql')

// Contacto específico donde se enviará la información
const CONTACTO_ADMIN = '5214494877990@s.whatsapp.net'

// ==== Sistema de Timeouts Global ====
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

// ==== Función para manejar inactividad ====
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
          '• *menú* - Para ver las opciones disponibles',
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

// ==== Función para reiniciar inactividad ====
async function reiniciarInactividad(ctx, state, flowDynamic, gotoFlow) {
  await manejarInactividad(ctx, state, flowDynamic, gotoFlow);
}

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
    setTimeout(() => {
      reconectarMySQL();
    }, 5000);
  }
}

// ==== Funciones para MySQL usando nuestra propia conexión ====
async function inicializarMySQL() {
  if (!conexionMySQL || !conexionMySQL._closing) {
    conexionMySQL = await crearConexionMySQL();
  }

  if (conexionMySQL) {
    try {
      await conexionMySQL.execute('SELECT 1');
    } catch (error) {
      console.log('🔄 Conexión MySQL inactiva, reconectando...');
      await reconectarMySQL();
    }
  }

  return conexionMySQL;
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

// ==== ACTUALIZAR FUNCIÓN GUARDAR ESTADO MYSQL ====
async function guardarEstadoMySQL(userPhone, estado, metadata = {}, userData = {}) {
  try {
    await inicializarMySQL();
    if (!conexionMySQL) {
      console.log('⚠️ No hay conexión MySQL, omitiendo guardado');
      return false;
    }

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
      userPhone,
      estado,
      JSON.stringify(metadata),
      userData.numeroControl || null,
      userData.nombreCompleto || null,
      userData.identificacionSubida || false,
      userData.timestampIdentificacion || null
    ];

    const valoresFinales = values.map(val => val === undefined ? null : val);

    await conexionMySQL.execute(query, valoresFinales);
    console.log(`✅ Estado guardado en MySQL para: ${userPhone}`);
    return true;
  } catch (error) {
    console.error('❌ Error guardando estado en MySQL:', error.message);
    return false;
  }
}

// ==== FUNCIÓN OBTENER ESTADO MYSQL ====
async function obtenerEstadoMySQL(userPhone) {
  try {
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
        nombreCompleto: estado.nombre_completo
      };
    }
  } catch (error) {
    console.error('❌ Error obteniendo estado de MySQL:', error.message);
  }

  return null;
}

// ==== Sistema de Estados del Usuario ====
const ESTADOS_USUARIO = {
  LIBRE: 'libre',
  EN_PROCESO_LARGO: 'en_proceso_largo',
  ESPERANDO_DATOS: 'esperando_datos',
  EN_MENU: 'en_menu'
};

// ==== Función para redirección segura después de timeout ====
async function redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic) {
  try {
    await limpiarEstado(state);
    await new Promise(resolve => setTimeout(resolve, 100));
    return gotoFlow(flowMenu);
  } catch (error) {
    console.error('❌ Error en redirección al menú:', error);
    await flowDynamic('🔧 Reiniciando bot... Por favor escribe *menú* para continuar.');
    await limpiarEstado(state);
    return gotoFlow(flowMenu);
  }
}

// ==== Funciones de Gestión de Estados ====
async function actualizarEstado(state, nuevoEstado, metadata = {}) {
  try {
    const estadoActual = await state.getMyState();

    const userData = {
      numeroControl: estadoActual?.numeroControl || null,
      nombreCompleto: estadoActual?.nombreCompleto || null
    };

    const nuevoMetadata = {
      ...metadata,
      ultimaActualizacion: Date.now()
    };

    await state.update({
      estadoUsuario: nuevoEstado,
      estadoMetadata: nuevoMetadata
    });

    if (nuevoEstado === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
      await guardarEstadoMySQL(state.id, nuevoEstado, nuevoMetadata, userData);
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

    console.log('✅ Estado limpiado correctamente');
  } catch (error) {
    console.error('❌ Error limpiando estado:', error);
  }
}

async function restaurarEstadoInicial(ctx, state) {
  if (!ctx.from) return false;

  try {
    const estadoMySQL = await obtenerEstadoMySQL(ctx.from);

    if (estadoMySQL && estadoMySQL.estadoUsuario === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
      const tiempoTranscurrido = Date.now() - (estadoMySQL.estadoMetadata.ultimaActualizacion || Date.now());
      const minutosTranscurridos = Math.floor(tiempoTranscurrido / 60000);

      if (minutosTranscurridos > 30) {
        await limpiarEstadoMySQL(ctx.from);
        return false;
      }

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

// ==== Función para mostrar estado de bloqueo ====
async function mostrarEstadoBloqueado(flowDynamic, myState) {
  const metadata = myState.estadoMetadata || {};
  const tiempoTranscurrido = Date.now() - (metadata.ultimaActualizacion || Date.now());
  const minutosTranscurridos = Math.floor(tiempoTranscurrido / 60000);
  const minutosRestantes = Math.max(0, 30 - minutosTranscurridos);

  await flowDynamic([
    '🔒 *Proceso en Curso* 🔒',
    '',
    `📋 ${metadata.tipo || 'Proceso largo'}`,
    `⏰ Tiempo transcurrido: ${minutosTranscurridos} minutos`,
    `⏳ Tiempo restante: ${minutosRestantes} minutos`,
    '',
    '🔄 **Estamos trabajando en tu solicitud...**',
    '📱 Por favor espera, este proceso toma aproximadamente 30 minutos',
    '',
    '💡 **Para ver el progreso actual escribe:**',
    '*estado*',
    '',
    '⏰ El proceso continuará automáticamente.'
  ].join('\n'));
}

// ==== Función de verificación MEJORADA ====
async function verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow }) {
  if (ctx.from === CONTACTO_ADMIN) return false;

  try {
    const myState = await state.getMyState();

    if (myState?.estadoUsuario === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
      await mostrarEstadoBloqueado(flowDynamic, myState);
      return true;
    }
  } catch (error) {
    console.error('❌ Error en verificación de estado bloqueado:', error);
  }

  return false;
}

// ==== Función para enviar identificación al admin - SIMPLIFICADA ====
async function enviarIdentificacionAlAdmin(provider, userData) {
  if (!provider) {
    console.error('❌ Provider no disponible')
    return false
  }

  try {
    const sock = provider.vendor
    
    if (!sock) {
      console.error('❌ Socket de Baileys no disponible')
      return false
    }

    await sock.sendMessage(CONTACTO_ADMIN, {
      text: `📸 *IDENTIFICACIÓN RECIBIDA*\n\n👤 Nombre: ${userData.nombre}\n📧 ${userData.tipo}: ${userData.identificacion}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n\n✅ El usuario ha subido su identificación correctamente.`
    });
    
    console.log('✅ Notificación de identificación enviada al administrador');
    return true;
  } catch (error) {
    console.error('❌ Error enviando notificación de identificación:', error.message);
    return false;
  }
}

// ==== Función para enviar mensajes al contacto ====
async function enviarAlAdmin(provider, mensaje) {
  if (!provider) {
    console.error('❌ Provider no está disponible')
    return false
  }

  try {
    console.log('📤 Intentando enviar mensaje al administrador...')

    const sock = provider.vendor

    if (!sock) {
      console.error('❌ Socket de Baileys no disponible')
      return false
    }

    await sock.sendMessage(CONTACTO_ADMIN, {
      text: mensaje
    });

    console.log('✅ Información enviada al administrador correctamente')
    return true
  } catch (error) {
    console.error('❌ Error enviando información al administrador:', error.message)

    if (error.message.includes('not-authorized')) {
      console.log('⚠️ El administrador no te tiene agregado como contacto')
    }
    if (error.message.includes('blocked')) {
      console.log('⚠️ El administrador te tiene bloqueado')
    }

    return false
  }
}

// ==== Funciones de validación ====
function isValidText(input) {
  if (!input || typeof input !== 'string') return false
  if (input.trim().length === 0) return false
  if (input.includes('sticker') || input.includes('image') || input.includes('video')) return false
  return true
}

// ==== Validar número de control ====
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

// ==== Función para validar que es una imagen ====
function esImagenValida(message) {
  if (!message) return false;

  const esImagen = message.type === 'image' ||
    message.type === 'sticker' ||
    (message.type === 'document' &&
      message.mimetype &&
      message.mimetype.startsWith('image/'));

  return esImagen;
}

// ==== Función para obtener información de la imagen ====
function obtenerInfoImagen(message) {
  if (!message) return null;

  return {
    tipo: message.type,
    mimetype: message.mimetype || 'image/jpeg',
    timestamp: message.timestamp || Date.now()
  };
}

// ==== Función para validar correo institucional de trabajadores ====
function validarCorreoTrabajador(correo) {
  const regex = /^[a-zA-Z0-9._%+-]+@aguascalientes\.tecnm\.mx$/;
  return regex.test(correo) && correo.length > 0;
}

// ==== Función auxiliar para detectar saludos ====
function esSaludoValido(texto) {
  if (!texto || typeof texto !== 'string') return false;

  const textoLimpio = texto.toLowerCase().trim();
  const saludos = [
    'hola', 'ole', 'alo', 'inicio', 'Inicio', 'comenzar', 'empezar',
    'buenos días', 'buenas tardes', 'buenas noches',
    'buenos dias', 'buenas tardes', 'buenas noches',
    'hola.', 'hola!', 'hola?', 'ayuda', 'Hola', '.',
    'buenos días, tengo un problema', 'buenas tardes, tengo un problema',
    'buenas noches, tengo un problema', 'buenos días tengo un problema',
    'buenas tardes tengo un problema', 'buenas noches tengo un problema',
    'tengo un problema', 'necesito ayuda', 'ayuda', 'tengo un problema con mi cuenta',
    'no puedo acceder a mi cuenta', 'problema con mi cuenta', 'problema con mi acceso'
  ];

  return saludos.some(saludo => textoLimpio.includes(saludo));
}

/// ==== FLUJO INTERCEPTOR GLOBAL ====
const flowInterceptorGlobal = addKeyword(EVENTS.WELCOME)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow, endFlow }) => {
    if (ctx.from === CONTACTO_ADMIN) return endFlow();

    await reiniciarInactividad(ctx, state, flowDynamic, gotoFlow);

    const estadoRestaurado = await restaurarEstadoInicial(ctx, state);

    if (estadoRestaurado) {
      await mostrarEstadoBloqueado(flowDynamic, await state.getMyState());
      return gotoFlow(flowBloqueoActivo);
    }

    const input = ctx.body?.toLowerCase().trim();

    if (!esSaludoValido(input)) {
      const myState = await state.getMyState();
      if (!myState?.estadoUsuario || myState.estadoUsuario === ESTADOS_USUARIO.LIBRE) {
        const ultimaInteraccion = myState?.ultimaInteraccion || 0;
        const tiempoInactivo = Date.now() - ultimaInteraccion;

        if (tiempoInactivo > 60000) {
          await flowDynamic([
            '🔒 *Bot Inactivo*',
            '',
            'Para comenzar a usar el bot, escribe la palabra:',
            '',
            '🌟 *hola*',
            '',
            '¡Estaré encantado de ayudarte! 🐦'
          ].join('\n'));
        }
        return endFlow();
      }
    }

    return endFlow();
  });

// ==== Flujo de Bloqueo Activo ====
const flowBloqueoActivo = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    if (ctx.from === CONTACTO_ADMIN) return;

    const myState = await state.getMyState();

    if (!myState?.estadoUsuario || myState.estadoUsuario !== ESTADOS_USUARIO.EN_PROCESO_LARGO) {
      await limpiarEstado(state);
      return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
    }

    const input = ctx.body?.toLowerCase().trim();

    if (input === 'estado') {
      await mostrarEstadoBloqueado(flowDynamic, myState);
    } else if (input && input !== 'estado') {
      await flowDynamic([
        '⏳ *Proceso en curso*',
        '',
        'Tu solicitud está siendo procesada...',
        '',
        '💡 **Para ver el progreso actual escribe:**',
        '*estado*',
        '',
        '🔄 El proceso continuará automáticamente.'
      ].join('\n'));
    }
  })
  .addAnswer(
    { capture: true },
    async (ctx, { gotoFlow }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      const input = ctx.body.toLowerCase().trim();

      if (input === 'estado') {
        return gotoFlow(flowComandosEspeciales);
      }

      return gotoFlow(flowBloqueoActivo);
    }
  );

// ==== FLUJO PARA BLOQUEAR AL ADMINISTRADOR ====
const flowBlockAdmin = addKeyword(EVENTS.WELCOME)
  .addAction(async (ctx, { endFlow }) => {
    if (ctx.from === CONTACTO_ADMIN) {
      console.log('🚫 Mensaje del administrador bloqueado - No se procesará')
      return endFlow()
    }
  })

// ==== SUBMENÚ PARA OPCIÓN 1 - RESTABLECER CONTRASEÑA ====
const flowSubMenuContrasena = addKeyword(EVENTS.ACTION)
  .addAnswer(
    '👥 *Selecciona tu tipo de usuario:*\n\n' +
    '1️⃣ ¿Eres un alumno?\n' +
    '2️⃣ ¿Eres un trabajador?\n\n' +
    '🔙 Escribe *menú* para volver al menú principal.',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      const opcion = ctx.body.trim().toLowerCase();

      if (opcion === 'menu' || opcion === 'menú') {
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (opcion === '1') {
        await flowDynamic('🎓 Perfecto, eres alumno. Vamos a comenzar con el proceso...');
        return gotoFlow(flowCapturaNumeroControl);
      }

      if (opcion === '2') {
        await flowDynamic('👨‍💼 Perfecto, eres trabajador. Vamos a comenzar con el proceso...');
        return gotoFlow(flowCapturaCorreoTrabajador);
      }

      await flowDynamic('❌ Opción no válida. Escribe *1* o *2*.');
      return gotoFlow(flowSubMenuContrasena);
    }
  );

// ==== Flujo de captura de correo para trabajador ====
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

// ==== SUBMENÚ PARA OPCIÓN 2 - RESTABLECER AUTENTICADOR ====
const flowSubMenuAutenticador = addKeyword(EVENTS.ACTION)
  .addAnswer(
    '👥 *Selecciona tu tipo de usuario:*\n\n' +
    '1️⃣ ¿Eres un alumno?\n' +
    '2️⃣ ¿Eres un trabajador?\n\n' +
    '🔙 Escribe *menú* para volver al menú principal.',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      const opcion = ctx.body.trim().toLowerCase();

      if (opcion === 'menu' || opcion === 'menú') {
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (opcion === '1') {
        await flowDynamic('🎓 Perfecto, eres alumno. Vamos a comenzar con el proceso...');
        return gotoFlow(flowCapturaNumeroControlAutenticador);
      }

      if (opcion === '2') {
        await flowDynamic('👨‍💼 Perfecto, eres trabajador. Vamos a comenzar con el proceso...');
        return gotoFlow(flowCapturaCorreoTrabajadorAutenticador);
      }

      await flowDynamic('❌ Opción no válida. Escribe *1* o *2*.');
      return gotoFlow(flowSubMenuAutenticador);
    }
  );

// ==== Flujo final de contraseña ====
const flowContrasena = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, provider, gotoFlow }) => {
    if (ctx.from === CONTACTO_ADMIN) return;

    const myState = (await state.getMyState()) || {};
    const nombreCompleto = myState.nombreCompleto;
    const numeroControl = myState.numeroControl;
    const correoInstitucional = myState.correoInstitucional;
    const esTrabajador = myState.esTrabajador;

    if (!nombreCompleto || (!numeroControl && !correoInstitucional)) {
      console.log('❌ Datos incompletos, redirigiendo a captura...');
      await flowDynamic('❌ No tenemos tu información completa. Volvamos a empezar.');
      return gotoFlow(flowSubMenuContrasena);
    }

    await actualizarEstado(state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
      tipo: "🔐 Restablecimiento de Contraseña",
      inicio: Date.now(),
      esTrabajador: esTrabajador || false
    });

    const phone = ctx.from;
    const identificacion = esTrabajador ? correoInstitucional : numeroControl;
    const tipoUsuario = esTrabajador ? "Trabajador" : "Alumno";

    const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE RESTABLECIMIENTO DE CONTRASEÑA* 🔔\n\n📋 *Información del usuario:*\n👤 Nombre: ${nombreCompleto}\n👥 Tipo: ${tipoUsuario}\n📧 ${esTrabajador ? 'Correo' : 'Número de control'}: ${identificacion}\n📞 Teléfono: ${phone}\n🆔 Identificación: ${myState.identificacionSubida ? '✅ SUBIDA' : '❌ PENDIENTE'}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n🔐 Contraseña temporal asignada: *SoporteCC1234$*\n\n⚠️ Reacciona para validar que está listo`;

    const envioExitoso = await enviarAlAdmin(provider, mensajeAdmin);

    if (envioExitoso) {
      await flowDynamic('⏳ Permítenos un momento, vamos a restablecer tu contraseña... \n\n *Te solicitamos no enviar mensajes en lo que realizamos esté proceso, esté proceso durará aproximadamente 30 minutos.*');
    } else {
      await flowDynamic('⚠️ Hemos registrado tu solicitud. Si no recibes respuesta, contacta directamente al centro de cómputo.');
    }

    let minutosRestantes = 30;

    const intervalId = setInterval(async () => {
      minutosRestantes -= 10;
      if (minutosRestantes > 0) {
        await flowDynamic(`⏳ Hola *${nombreCompleto}*, faltan *${minutosRestantes} minutos* para completar el proceso...`);
      }
    }, 10 * 60000);

    await state.update({
      estadoMetadata: {
        ...(await state.getMyState())?.estadoMetadata,
        intervalId: intervalId
      }
    });

    const timeoutId = setTimeout(async () => {
      clearInterval(intervalId);

      try {
        await flowDynamic(`✅ Se restableció correctamente tu contraseña.\nTu nueva contraseña temporal es: *SoporteCC1234$*`);

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

      await limpiarEstado(state);
    }, 30 * 60000);

    await state.update({
      estadoMetadata: {
        ...(await state.getMyState())?.estadoMetadata,
        timeoutId: timeoutId
      }
    });
  })
  .addAnswer(
    { capture: true },
    async (ctx, { gotoFlow }) => {
      if (ctx.from === CONTACTO_ADMIN) return;
      return gotoFlow(flowBloqueoActivo);
    }
  );

// ==== Flujo de captura para identificación oficial ====
const flowCapturaIdentificacion = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 3 minutos en identificación');
        await flowDynamic('⏱️ No recibimos tu identificación. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 3 * 60 * 1000);

    await state.update({
      timeoutCapturaIdentificacion: timeout,
      ultimaInteraccion: Date.now()
    });
  })
  .addAnswer(
    [
      '📸 *Verificación de Identidad* 📸',
      '',
      'Para continuar con el proceso, necesitamos verificar tu identidad.',
      '',
      '📋 **Por favor toma una foto CLARA de tu identificación oficial:**',
      '• INE/IFE',
      '• Licencia de conducir',
      '• Pasaporte',
      '• Credencial escolar con foto',
      '',
      '⚠️ **Asegúrate de que:**',
      '• La foto sea legible',
      '• Los datos sean visibles',
      '• La imagen esté bien iluminada',
      '',
      '🔒 Tu información está protegida y será usada solo para verificación.'
    ].join('\n'),
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      timeoutManager.clearTimeout(ctx.from);

      if (!esImagenValida(ctx)) {
        await flowDynamic([
          '❌ *No recibimos una imagen válida*',
          '',
          'Por favor envía una FOTO CLARA de tu identificación oficial:',
          '',
          '📷 Toma una foto de:',
          '• INE/IFE por ambos lados',
          '• Licencia de conducir',
          '• Pasaporte',
          '• Credencial escolar con foto',
          '',
          '⚠️ Asegúrate de que se vean claramente tus datos.'
        ].join('\n'));
        return gotoFlow(flowCapturaIdentificacion);
      }

      const infoImagen = obtenerInfoImagen(ctx);
      const myState = await state.getMyState();
      
      await state.update({
        identificacionSubida: true,
        infoIdentificacion: infoImagen,
        timestampIdentificacion: Date.now(),
        imagenIdentificacion: ctx.message
      });

      await flowDynamic('✅ ¡Perfecto! Hemos recibido tu identificación correctamente.');

      const userData = {
        nombre: myState.nombreCompleto || 'Por confirmar',
        identificacion: myState.esTrabajador ? myState.correoInstitucional : myState.numeroControl,
        tipo: myState.esTrabajador ? 'Trabajador' : 'Alumno'
      };

      await enviarIdentificacionAlAdmin(provider, userData);

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowContrasena);
    }
  );

// ==== Flujo similar para autenticador ====
const flowCapturaIdentificacionAutenticador = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 3 minutos en identificación - autenticador');
        await flowDynamic('⏱️ No recibimos tu identificación. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 3 * 60 * 1000);

    await state.update({
      timeoutCapturaIdentificacion: timeout,
      ultimaInteraccion: Date.now()
    });
  })
  .addAnswer(
    [
      '📸 *Verificación de Identidad* 📸',
      '',
      'Para continuar con la configuración del autenticador, necesitamos verificar tu identidad.',
      '',
      '📋 **Por favor toma una foto CLARA de tu identificación oficial:**',
      '• INE/IFE',
      '• Licencia de conducir',
      '• Pasaporte',
      '• Credencial escolar con foto',
      '',
      '⚠️ **Asegúrate de que:**',
      '• La foto sea legible',
      '• Los datos sean visibles',
      '• La imagen esté bien iluminada'
    ].join('\n'),
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      timeoutManager.clearTimeout(ctx.from);

      if (!esImagenValida(ctx)) {
        await flowDynamic([
          '❌ *No recibimos una imagen válida*',
          '',
          'Por favor envía una FOTO CLARA de tu identificación oficial.',
          'Esto es necesario por seguridad para configurar tu autenticador.'
        ].join('\n'));
        return gotoFlow(flowCapturaIdentificacionAutenticador);
      }

      const infoImagen = obtenerInfoImagen(ctx);
      const myState = await state.getMyState();
      
      await state.update({
        identificacionSubida: true,
        infoIdentificacion: infoImagen,
        timestampIdentificacion: Date.now(),
        imagenIdentificacion: ctx.message
      });

      await flowDynamic('✅ ¡Perfecto! Hemos recibido tu identificación correctamente.');

      const userData = {
        nombre: myState.nombreCompleto || 'Por confirmar',
        identificacion: myState.esTrabajador ? myState.correoInstitucional : myState.numeroControl,
        tipo: myState.esTrabajador ? 'Trabajador' : 'Alumno'
      };

      await enviarIdentificacionAlAdmin(provider, userData);

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowAutenticador);
    }
  );

// ==== Flujo final de autenticador ====
const flowAutenticador = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, provider, gotoFlow }) => {
    if (ctx.from === CONTACTO_ADMIN) return;

    const myState = (await state.getMyState()) || {};
    const nombreCompleto = myState.nombreCompleto;
    const numeroControl = myState.numeroControl;
    const correoInstitucional = myState.correoInstitucional;
    const esTrabajador = myState.esTrabajador;

    if (!nombreCompleto || (!numeroControl && !correoInstitucional)) {
      console.log('❌ Datos incompletos, redirigiendo a captura...');
      await flowDynamic('❌ No tenemos tu información completa. Volvamos a empezar.');
      return gotoFlow(flowSubMenuAutenticador);
    }

    await actualizarEstado(state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
      tipo: "🔑 Configuración de Autenticador",
      inicio: Date.now(),
      esTrabajador: esTrabajador || false
    });

    const phone = ctx.from;
    const identificacion = esTrabajador ? correoInstitucional : numeroControl;
    const tipoUsuario = esTrabajador ? "Trabajador" : "Alumno";

    const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE DESHABILITAR EL AUTENTICADOR* 🔔\n\n📋 *Información del usuario:*\n👤 Nombre: ${nombreCompleto}\n👥 Tipo: ${tipoUsuario}\n📧 ${esTrabajador ? 'Correo' : 'Número de control'}: ${identificacion}\n📞 Teléfono: ${phone}\n🆔 Identificación: ${myState.identificacionSubida ? '✅ SUBIDA' : '❌ PENDIENTE'}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n\n⚠️ *Proceso en curso...*`;

    const envioExitoso = await enviarAlAdmin(provider, mensajeAdmin);

    if (envioExitoso) {
      await flowDynamic('⏳ Permítenos un momento, vamos a desconfigurar tu autenticador... \n\n Te solicitamos no enviar mensajes en lo que realizamos esté proceso, esté proceso durará aproximadamente 30 minutos.');
    } else {
      await flowDynamic('⚠️ Hemos registrado tu solicitud. Si no recibes respuesta, contacta directamente al centro de cómputo.');
    }

    let minutosRestantes = 30;

    const intervalId = setInterval(async () => {
      minutosRestantes -= 10;
      if (minutosRestantes > 0) {
        await flowDynamic(`⏳ Hola *${nombreCompleto}*, faltan *${minutosRestantes} minutos* para completar la configuración del autenticador...`);
      }
    }, 10 * 60000);

    await state.update({
      estadoMetadata: {
        ...(await state.getMyState())?.estadoMetadata,
        intervalId: intervalId
      }
    });

    const timeoutId = setTimeout(async () => {
      clearInterval(intervalId);

      try {
        await flowDynamic(
          '✅ Se desconfiguró correctamente el autenticador de dos factores'
        );

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

      await limpiarEstado(state);
    }, 30 * 60000);

    await state.update({
      estadoMetadata: {
        ...(await state.getMyState())?.estadoMetadata,
        timeoutId: timeoutId
      }
    });
  })
  .addAnswer(
    { capture: true },
    async (ctx, { gotoFlow }) => {
      if (ctx.from === CONTACTO_ADMIN) return;
      return gotoFlow(flowBloqueoActivo);
    }
  );

// ==== Flujo final de SIE ====
const flowFinSIE = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, provider }) => {
    if (ctx.from === CONTACTO_ADMIN) return;

    const myState = (await state.getMyState()) || {};
    const nombreCompleto = myState.nombreCompleto;
    const numeroControl = myState.numeroControl;

    if (!nombreCompleto || !numeroControl) {
      console.log('❌ Datos incompletos, redirigiendo a captura...');
      await flowDynamic('❌ No tenemos tu información completa. Volvamos a empezar.');
      return gotoFlow(flowCapturaNumeroControlSIE);
    }

    await actualizarEstado(state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
      tipo: "📊 Sincronización de Datos SIE",
      inicio: Date.now()
    });

    const phone = ctx.from;

    const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE SINCRONIZACIÓN DE DATOS*\nNo le aparece el horario ni las materias en el SIE 🔔\n\n📋 *Información del usuario:*\n👤 Nombre: ${nombreCompleto}\n🔢 Número de control: ${numeroControl}\n📞 Teléfono: ${phone}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n\n⚠️ Reacciona para validar que está listo`;

    const envioExitoso = await enviarAlAdmin(provider, mensajeAdmin);

    if (envioExitoso) {
      await flowDynamic('⏳ Permítenos un momento, vamos a restablecer tu contraseña... \n\n Te solicitamos no enviar mensajes en lo que realizamos esté proceso, esté proceso durará aproximadamente 30 minutos.');
    } else {
      await flowDynamic('⚠️ Hemos registrado tu solicitud. Si no recibes respuesta, contacta directamente al centro de cómputo.');
    }

    let minutosRestantes = 30;

    const intervalId = setInterval(async () => {
      minutosRestantes -= 10;
      if (minutosRestantes > 0) {
        await flowDynamic(`⏳ Hola *${nombreCompleto}*, faltan *${minutosRestantes} minutos* para completar el proceso...`);
      }
    }, 10 * 60000);

    await state.update({
      estadoMetadata: {
        ...(await state.getMyState())?.estadoMetadata,
        intervalId: intervalId
      }
    });

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

      await limpiarEstado(state);
    }, 30 * 60000);

    await state.update({
      estadoMetadata: {
        ...(await state.getMyState())?.estadoMetadata,
        timeoutId: timeoutId
      }
    });
  })
  .addAnswer(
    { capture: true },
    async (ctx, { gotoFlow }) => {
      if (ctx.from === CONTACTO_ADMIN) return;
      return gotoFlow(flowBloqueoActivo);
    }
  );

// ==== Flujo de captura con timeout ====
const flowCapturaNumeroControl = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en número de control');
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
        return gotoFlow(flowCapturaNumeroControl);
      }

      if (!isValidText(input) || !validarNumeroControl(input)) {
        await flowDynamic('❌ Número de control inválido. Intenta de nuevo o escribe *menú* para volver.');
        return gotoFlow(flowCapturaNumeroControl);
      }

      await state.update({ numeroControl: input });
      await flowDynamic(`✅ Recibimos tu número de control: *${input}*`);

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowCapturaNombre);
    }
  );

// ==== Flujo de captura para autenticador ====
const flowCapturaNumeroControlAutenticador = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
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
      return gotoFlow(flowCapturaNombreAutenticador);
    }
  );

// ==== Flujo de captura para SIE ====
const flowCapturaNumeroControlSIE = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en número de control - SIE');
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

// ==== Flujo de captura para nombre (TRABAJADOR) ====
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

// ==== Flujo de captura para nombre (TRABAJADOR - AUTENTICADOR) ====
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
      return gotoFlow(flowCapturaIdentificacionAutenticador);
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

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowCapturaIdentificacion);
    }
  );

// ==== Flujo de captura para nombre (autenticador) ====
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
      return gotoFlow(flowCapturaIdentificacionAutenticador);
    }
  );

// ==== Flujo de captura para nombre (SIE) ====
const flowCapturaNombreSIE = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en nombre completo - SIE');
        await flowDynamic('⏱️ No recibimos tu nombre completo. Serás redirigido al menú.');
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

// ==== Flujo de restablecimiento de contraseña ====
const flowrestablecercontrase = addKeyword(['restablecer']).addAnswer(
  [
    '📄 Vamos a comenzar a restablecer la contraseña de tu correo institucional',
    '\n👥 Primero necesitamos saber tu tipo de usuario.',
    '\n🔙 Escribe *menú* para volver a ver el menú.'
  ],
  null,
  async (ctx, { gotoFlow }) => {
    if (ctx.from === CONTACTO_ADMIN) return;
    return gotoFlow(flowSubMenuContrasena);
  }
);

// ==== Flujo de restablecimiento de autenticador ====
const flowrestablecerautenti = addKeyword(['autenticador']).addAnswer(
  [
    '📄 Vamos a comenzar a configurar tu autenticador',
    '\n👥 Primero necesitamos saber tu tipo de usuario.',
    '\n🔙 Escribe *menú* para volver a ver el menú.'
  ],
  null,
  async (ctx, { gotoFlow }) => {
    if (ctx.from === CONTACTO_ADMIN) return;
    return gotoFlow(flowSubMenuAutenticador);
  }
);

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
    if (ctx.from === CONTACTO_ADMIN) return;

    await flowDynamic(
      '🙏 ¡Gracias por comunicarte con el Centro de Cómputo del ITA! 💙\n' +
      'Estamos para ayudarte siempre que lo necesites.\n\n' +
      '🔙 Escribe *menú* si deseas regresar al inicio.'
    )
    console.log('✅ Mensaje de agradecimiento enviada correctamente \n')
  }
)

// ==== Flujo de Educación a Distancia ====
const flowDistancia = addKeyword(['Moodle'])
  .addAction(async (ctx, { flowDynamic, gotoFlow, state }) => {
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

// ==== Flujo de acceso al SIE ====
const flowSIE = addKeyword(['sie']).addAnswer(
  '📚 Acceso al SIE\n' +
  'Por favor selecciona una opción:\n\n' +
  '1️⃣ Restablecer contraseña de acceso\n' +
  '2️⃣ No puedo ver mi horario o calificaciones\n\n' +
  '🔙 Escribe *menú* para volver al menú principal.',
  { capture: true },
  async (ctx, { flowDynamic, gotoFlow, state }) => {
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

// ==== Flujo principal ====
const flowPrincipal = addKeyword(['hola', 'ole', 'alo', 'inicio', 'comenzar', 'empezar', 'buenos días', 'buenas tardes', 'buenas noches', 'Hola', '.', 'Buenas tardes, tengo un problema', 'Buenas noches, tengo un problema', 'Buenos días, tengo un problema', 'buenas tardes tengo un problema', 'buenas noches tengo un problema', 'buenos días tengo un problema'])
  .addAction(async (ctx, { flowDynamic, state, gotoFlow }) => {
    if (ctx.from === CONTACTO_ADMIN) return;

    if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
      return;
    }

    await actualizarEstado(state, ESTADOS_USUARIO.EN_MENU);

    try {
      await flowDynamic([{
        body: '🎉 ¡Bienvenido al bot de Centro de Cómputo del ITA!',
        media: 'https://raw.githubusercontent.com/CapYAN09/ProyectosITA/main/img/Imagen_de_WhatsApp_2025-09-05_a_las_11.03.34_cdb84c7c-removebg-preview.png'
      }])
      console.log('✅ Imagen de bienvenida enviada correctamente \n')
    } catch (error) {
      console.error('❌ Error enviando imagen:', error.message)
      await flowDynamic('🎉 ¡Bienvenido al *AguiBot* del ITA!')
    }

    await flowDynamic(
      '🙌 Hola, bienvenido al *Nido de Willy* 🐦 el dia de hoy te encuentras hablando con Willy en Centro de Cómputo\n\n' +
      '📋 Menú principal:\n' +
      '1️⃣ Restablecer contraseña\n' +
      '2️⃣ Restablecer autenticador\n' +
      '3️⃣ Restablecer contraseña de Moodle\n' +
      '4️⃣ Acceso al SIE'
    )
  })
  .addAnswer(
    "Ingresa el número de la opción en la que necesitas apoyo",
    { capture: true },
    async (ctx, { gotoFlow, flowDynamic, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
        return;
      }

      const opcion = ctx.body.trim()

      if (!isValidText(opcion) || !['1', '2', '3', '4'].includes(opcion)) {
        await flowDynamic('❌ Opción no válida. Escribe *1*, *2*, *3* o *4*.')
        return gotoFlow(flowEsperaPrincipal)
      }

      if (opcion === '1') return gotoFlow(flowrestablecercontrase)
      if (opcion === '2') return gotoFlow(flowrestablecerautenti)
      if (opcion === '3') return gotoFlow(flowDistancia)
      if (opcion === '4') return gotoFlow(flowSIE)
    }
  )

// ==== Flujo de menú ====
const flowMenu = addKeyword(['menu', 'menú'])
  .addAction(async (ctx, { flowDynamic, state, gotoFlow }) => {
    if (ctx.from === CONTACTO_ADMIN) return;

    if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
      return;
    }

    await actualizarEstado(state, ESTADOS_USUARIO.EN_MENU);

    await flowDynamic(
      '📋 Menú principal:\n' +
      '1️⃣ Restablecer contraseña\n' +
      '2️⃣ Restablecer autenticador\n' +
      '3️⃣ Restablecer contraseña de Moodle\n' +
      '4️⃣ Acceso al SIE\n' +
      '5️⃣ Agradecimiento'
    )
  })
  .addAnswer(
    "Ingresa el número de la opción en la que necesitas apoyo",
    { capture: true },
    async (ctx, { gotoFlow, flowDynamic, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
        return;
      }

      if (ctx.body.toLowerCase() === 'estado' || ctx.body.toLowerCase() === 'cancelar' || ctx.body.toLowerCase() === 'ayuda') {
        return gotoFlow(flowComandosEspeciales);
      }

      const opcion = ctx.body.trim()

      if (!isValidText(opcion) || !['1', '2', '3', '4', '5'].includes(opcion)) {
        await flowDynamic('❌ Opción no válida. Escribe *1*, *2*, *3*, *4* o *5*.')
        return gotoFlow(flowEsperaMenu)
      }

      if (opcion === '1') return gotoFlow(flowrestablecercontrase)
      if (opcion === '2') return gotoFlow(flowrestablecerautenti)
      if (opcion === '3') return gotoFlow(flowDistancia)
      if (opcion === '4') return gotoFlow(flowSIE)
      if (opcion === '5') return gotoFlow(flowGracias)
    }
  )

// ==== Flujo para comandos especiales ====
const flowComandosEspeciales = addKeyword(['estado'])
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
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

    if (myState?.estadoUsuario === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
      return gotoFlow(flowBloqueoActivo);
    }

    return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
  });

// ==== Flujos de espera (simplificados) ====
const crearFlujoEspera = (nombre, mensaje) => {
  return addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic }) => {
      const timeout = setTimeout(async () => {
        console.log(`⌛ Tiempo agotado en ${nombre}.`);
        await flowDynamic('⏱️ Tiempo agotado. Por favor inicia el bot nuevamente escribiendo *Hola*.');
        await limpiarEstado(state);
      }, 5 * 60 * 1000);

      await state.update({ [`timeout${nombre}`]: timeout });
    })
    .addAnswer(
      mensaje,
      { capture: true },
      async (ctx, { gotoFlow, flowDynamic, state }) => {
        if (ctx.from === CONTACTO_ADMIN) return;

        const input = ctx.body.trim().toLowerCase();

        if (/^men[uú]$/i.test(input)) {
          clearTimeout(await state.get(`timeout${nombre}`));
          await limpiarEstado(state);
          return gotoFlow(flowMenu);
        }

        if (input === 'hola') {
          clearTimeout(await state.get(`timeout${nombre}`));
          await limpiarEstado(state);
          return gotoFlow(flowPrincipal);
        }

        await flowDynamic('❌ Opción no válida. Escribe *menú* para volver al menú principal.');
        return gotoFlow(flowEsperaMenu);
      }
    );
};

const flowEsperaPrincipal = crearFlujoEspera('Principal', '🔙 Escribe *menú* para ver el menú principal.');
const flowEsperaMenu = crearFlujoEspera('Menu', '🔙 Escribe *menú* para volver a ver el menú principal.');
const flowEsperaSIE = crearFlujoEspera('SIE', '🔙 Escribe *menú* para regresar al menú principal.');
const flowEsperaContrasena = crearFlujoEspera('Contrasena', '🔙 Escribe *menú* para regresar al menú principal.');
const flowEsperaAutenticador = crearFlujoEspera('Autenticador', '🔙 Escribe *menú* para regresar al menú principal.');
const flowEsperaMenuDistancia = crearFlujoEspera('MenuDistancia', '🔙 Escribe *menú* para regresar al menú principal.');
const flowEsperaMenuSIE = crearFlujoEspera('MenuSIE', '🔙 Escribe *menú* para regresar al menú principal.');

// ==== Flujo para mensajes no entendidos ====
const flowDefault = addKeyword(EVENTS.WELCOME).addAction(async (ctx, { flowDynamic, state, gotoFlow }) => {
  if (ctx.from === CONTACTO_ADMIN) return;

  await reiniciarInactividad(ctx, state, flowDynamic, gotoFlow);

  if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
    return;
  }

  await flowDynamic([
    '🤖 No entiendo ese tipo de mensajes.',
    '',
    '💡 **Comandos disponibles:**',
    '• *hola* - Reactivar el bot',
    '• *menú* - Ver opciones principales',
    '• *estado* - Ver progreso de procesos',
    '',
    '🔙 Escribe *hola* para comenzar de nuevo.'
  ])
});

// ==== VERIFICACIÓN DE LA BASE DE DATOS ====
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          )
        `);
        console.log('✅ Tabla user_states creada exitosamente');
      } else {
        console.log('✅ Tabla user_states encontrada');
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

// ==== Inicialización ====
const main = async () => {
  try {
    console.log('🚀 Iniciando bot de WhatsApp...');

    const dbOk = await verificarBaseDeDatos();
    if (!dbOk) {
      console.log('⚠️ Modo sin base de datos - Los estados no persistirán');
    } else {
      console.log('🎯 Base de datos lista - Estados persistirán correctamente');
      await inicializarMySQL();
    }

    const adapterFlow = createFlow([
      flowBlockAdmin,
      flowInterceptorGlobal,
      flowComandosEspeciales,
      flowPrincipal,
      flowMenu,
      flowCapturaNumeroControl,
      flowCapturaNombre,
      flowCapturaNumeroControlAutenticador,
      flowCapturaNombreAutenticador,
      flowCapturaNumeroControlSIE,
      flowCapturaNombreSIE,
      flowCapturaCorreoTrabajador,
      flowCapturaNombreTrabajador,
      flowCapturaCorreoTrabajadorAutenticador,
      flowCapturaNombreTrabajadorAutenticador,
      flowCapturaIdentificacion,
      flowCapturaIdentificacionAutenticador,
      flowDistancia,
      flowGracias,
      flowSIE,
      flowrestablecercontrase,
      flowrestablecerautenti,
      flowrestablecerSIE,
      flowContrasena,
      flowAutenticador,
      flowFinSIE,
      flowBloqueoActivo,
      flowEsperaPrincipal,
      flowEsperaMenu,
      flowEsperaSIE,
      flowEsperaContrasena,
      flowEsperaAutenticador,
      flowEsperaMenuDistancia,
      flowEsperaMenuSIE,
      flowDefault
    ])

    const adapterProvider = createProvider(BaileysProvider, {
      printQRInTerminal: true,
      auth: {
        creds: {},
        keys: {}
      },
      logger: {
        level: 'silent'
      },
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
      reconnect: true,
      maxRetries: 10,
      connectTimeout: 30000,
      keepAliveInterval: 15000,
      getMessage: async (key) => {
        return {
          conversation: 'mensaje no disponible'
        }
      },
      emitOwnEvents: true,
      defaultQueryTimeoutMs: 60000
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