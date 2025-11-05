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

// ==== Sistema de Timeouts Global - NUEVO ====
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
  if (!conexionMySQL || !conexionMySQL._closing) {
    conexionMySQL = await crearConexionMySQL();
  }

  // Verificar si la conexión sigue activa
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
      userData.identificacionSubida || false,  // 🔧 NUEVO CAMPO
      userData.timestampIdentificacion || null // 🔧 NUEVO CAMPO
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

// ==== Función para redirección segura después de timeout - CORREGIDA ====
async function redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic) {
  try {
    // 🔧 LIMPIAR TODO ANTES DE REDIRIGIR
    await limpiarEstado(state);

    // 🔧 PEQUEÑA PAUSA PARA ASEGURAR LA LIMPIEZA
    await new Promise(resolve => setTimeout(resolve, 100));

    // 🔧 REDIRIGIR AL MENÚ (CORREGIDO - sin recursividad)
    return gotoFlow(flowMenu);
  } catch (error) {
    console.error('❌ Error en redirección al menú:', error);
    // 🔧 FALLBACK: Enviar mensaje y forzar limpieza
    await flowDynamic('🔧 Reiniciando bot... Por favor escribe *menú* para continuar.');
    await limpiarEstado(state);
    return gotoFlow(flowMenu);
  }
}

// ==== Funciones de Gestión de Estados - CORREGIDAS ====
async function actualizarEstado(state, nuevoEstado, metadata = {}) {
  try {
    const estadoActual = await state.getMyState();

    // 🔧 CORRECCIÓN: Asegurar que los datos de usuario no sean undefined
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

    // Guardar también en MySQL si es un proceso largo
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
        await actualizarEstado(state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
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

// ==== Función para enviar mensajes y medios al contacto ====
async function enviarAlAdmin(provider, mensaje, ctx = null) { // 🔧 AGREGAR ctx como parámetro opcional
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

    // Enviar mensaje de texto primero
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

// ==== FLUJO INTERCEPTOR GLOBAL - CORREGIDO Y MEJORADO ====
const flowInterceptorGlobal = addKeyword(EVENTS.WELCOME)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow, endFlow }) => {
    await debugFlujo(ctx, 'flowInterceptorGlobal');

    if (ctx.from === CONTACTO_ADMIN) return endFlow();

    // 🔧 VERIFICAR PRIMERO SI ESTÁ EN PROCESO LARGO
    const myState = await state.getMyState();

    if (myState?.estadoUsuario === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
      console.log(`🔒 Usuario ${ctx.from} está en proceso largo, redirigiendo a bloqueo`);
      await mostrarEstadoBloqueado(flowDynamic, myState);
      return gotoFlow(flowBloqueoActivo);
    }

    const input = ctx.body?.toLowerCase().trim();

    // 🔧 PERMITIR SOLO COMANDOS ESPECÍFICOS SI NO ESTÁ BLOQUEADO
    const comandosPermitidos = [
      'hola', 'inicio', 'menu', 'menú', 'estado', 'ayuda',
      '1', '2', '3', '4', '5', '6', '7'
    ];

    if (comandosPermitidos.includes(input)) {
      console.log(`✅ Comando permitido: "${input}", permitiendo pasar...`);
      return endFlow();
    }

    // 🔧 SI NO ES COMANDO PERMITIDO Y NO ESTÁ BLOQUEADO, MOSTRAR MENSAJE
    if (!myState?.estadoUsuario || myState.estadoUsuario === ESTADOS_USUARIO.LIBRE) {
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
      return endFlow();
    }

    return endFlow();
  });

// ==== Flujo de Bloqueo Activo - ACTUALIZADO CON TIEMPOS ====
const flowBloqueoActivo = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow, endFlow }) => {
    await debugFlujo(ctx, 'flowBloqueoActivo');
    if (ctx.from === CONTACTO_ADMIN) return endFlow();

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
      await actualizarEstado(state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
        ...myState.estadoMetadata,
        // Mantenemos todos los metadatos existentes pero actualizamos el timestamp
      });
    }

    // 🔧 MANEJAR DIFERENTES TIPOS DE MENSAJES
    if (input === 'estado') {
      await mostrarEstadoBloqueado(flowDynamic, myState);
      return endFlow();
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
      return endFlow();
    }

    return endFlow();
  });

// ==== FLUJO PARA BLOQUEAR AL ADMINISTRADOR ====
const flowBlockAdmin = addKeyword(EVENTS.WELCOME)
  .addAction(async (ctx, { endFlow }) => {
    await debugFlujo(ctx, 'flowBlockAdmin');
    if (ctx.from === CONTACTO_ADMIN) {
      console.log('🚫 Mensaje del administrador bloqueado - No se procesará')
      return endFlow()
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
    await actualizarEstado(state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
      tipo: "🔐 Restablecimiento de Contraseña",
      inicio: Date.now(),
      esTrabajador: esTrabajador || false
    });

    const phone = ctx.from;
    const identificacion = esTrabajador ? correoInstitucional : numeroControl;
    const tipoUsuario = esTrabajador ? "Trabajador" : "Alumno";

    // ✅ ENVIAR INFORMACIÓN COMPLETA AL ADMINISTRADOR
    const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE RESTABLECIMIENTO DE CONTRASEÑA* 🔔\n\n📋 *Información del usuario:*\n👤 Nombre: ${nombreCompleto}\n👥 Tipo: ${tipoUsuario}\n📧 ${esTrabajador ? 'Correo' : 'Número de control'}: ${identificacion}\n📞 Teléfono: ${phone}\n🆔 Identificación: ${myState.identificacionSubida ? '✅ SUBIDA' : '❌ PENDIENTE'}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n🔐 Contraseña temporal asignada: *SoporteCC1234$*\n\n⚠️ Reacciona para validar que está listo`;

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
    await actualizarEstado(state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
      tipo: "🔑 Configuración de Autenticador",
      inicio: Date.now(),
      esTrabajador: esTrabajador || false
    });

    const phone = ctx.from;
    const identificacion = esTrabajador ? correoInstitucional : numeroControl;
    const tipoUsuario = esTrabajador ? "Trabajador" : "Alumno";

    // ✅ ENVIAR INFORMACIÓN COMPLETA AL ADMINISTRADOR
    const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE DESHABILITAR EL AUTENTICADOR* 🔔\n\n📋 *Información del usuario:*\n👤 Nombre: ${nombreCompleto}\n👥 Tipo: ${tipoUsuario}\n📧 ${esTrabajador ? 'Correo' : 'Número de control'}: ${identificacion}\n📞 Teléfono: ${phone}\n🆔 Identificación: ${myState.identificacionSubida ? '✅ SUBIDA' : '❌ PENDIENTE'}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n\n⚠️ *Proceso en curso...*`;

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
    await actualizarEstado(state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
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

// ==== FLUJO PARA SISTEMA DE TICKETS (OPCIÓN 7) - ACTUALIZADO ====
const flowTickets = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { flowDynamic, gotoFlow, state }) => {
    await debugFlujo(ctx, 'flowTickets');
    if (ctx.from === CONTACTO_ADMIN) return;

    if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
      return;
    }

    await flowDynamic([
      '🎫 *Sistema de Tickets - Soporte Administrativo* 🎫',
      '',
      '🔧 **¿Qué deseas hacer?**',
      '',
      '1️⃣ Crear un nuevo perfil de usuario',
      '2️⃣ Restablecer contraseña del sistema de gestión',
      '',
      '💡 *Selecciona una opción (1 o 2)*',
      '',
      '🔙 Escribe *menú* para volver al menú principal.'
    ].join('\n'));
  })
  .addAnswer(
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      const opcion = ctx.body.trim().toLowerCase();

      if (opcion === 'menu' || opcion === 'menú') {
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (opcion === '1') {
        await flowDynamic('👤 Iniciando proceso para crear un nuevo perfil de usuario...');
        // 🔧 GUARDAR EL TIPO DE SOLICITUD EN EL ESTADO
        await state.update({ tipoSolicitudTicket: 'crear_perfil' });
        return gotoFlow(flowCapturaNombreTicket);
      }

      if (opcion === '2') {
        await flowDynamic('🔐 Iniciando proceso para restablecer contraseña del sistema de gestión...');
        // 🔧 GUARDAR EL TIPO DE SOLICITUD EN EL ESTADO
        await state.update({ tipoSolicitudTicket: 'restablecer_contrasena' });
        return gotoFlow(flowCapturaUsuarioSistema);
      }

      await flowDynamic('❌ Opción no válida. Escribe *1* o *2*.');
      return gotoFlow(flowTickets);
    }
  );

// ==== FLUJO DE CAPTURA DE DATOS PARA TICKETS - NUEVO ====
const flowCapturaDatosTicket = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en captura de datos para ticket');
        await flowDynamic('⏱️ No recibimos tu información. Serás redirigido al menú.');
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
        return gotoFlow(flowCapturaDatosTicket);
      }

      if (!isValidText(input) || !/^[a-zA-ZÁÉÍÓÚÑáéíóúñ\s]+$/.test(input)) {
        await flowDynamic('❌ Solo texto válido. Escribe tu *nombre completo*.');
        return gotoFlow(flowCapturaDatosTicket);
      }

      if (input.length < 3) {
        await flowDynamic('❌ El nombre parece muy corto. Escribe tu *nombre completo* real.');
        return gotoFlow(flowCapturaDatosTicket);
      }

      await state.update({ nombreCompleto: input });
      await flowDynamic(`✅ Recibimos tu nombre: *${input}*`);

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowCapturaAreaTicket);
    }
  );

// ==== FLUJO DE CAPTURA DE ÁREA/DEPARTAMENTO - NUEVO ====
const flowCapturaAreaTicket = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en captura de área');
        await flowDynamic('⏱️ No recibimos tu área/departamento. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);

    await state.update({
      timeoutCapturaArea: timeout,
      ultimaInteraccion: Date.now()
    });
  })
  .addAnswer(
    [
      '🏢 *Información del Área/Departamento*',
      '',
      '📋 Por favor escribe tu *área o departamento*:',
      '',
      '💡 **Ejemplos:**',
      '• Recursos Humanos',
      '• Contabilidad',
      '• Dirección',
      '• Servicios Escolares',
      '• Coordinación Académica',
      '',
      '🔙 Escribe *menú* para volver al menú principal.'
    ].join('\n'),
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
        await flowDynamic('❌ No recibimos tu área/departamento. Por favor escríbelo.');
        return gotoFlow(flowCapturaAreaTicket);
      }

      if (!isValidText(input)) {
        await flowDynamic('❌ Solo texto válido. Escribe tu *área o departamento*.');
        return gotoFlow(flowCapturaAreaTicket);
      }

      await state.update({ areaDepartamento: input });
      await flowDynamic(`✅ Recibimos tu área/departamento: *${input}*`);

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowFinalTicket);
    }
  );

// ==== FLUJO FINAL PARA TICKETS - COMPLETAMENTE ACTUALIZADO ====
const flowFinalTicket = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, provider, gotoFlow }) => {
    // ⚡ Excluir administrador
    if (ctx.from === CONTACTO_ADMIN) return;

    // 🔍 VERIFICAR QUE TENEMOS LOS DATOS COMPLETOS
    const myState = (await state.getMyState()) || {};
    const tipoSolicitud = myState.tipoSolicitudTicket;
    const nombreCompleto = myState.nombreCompleto;
    const usuarioSistema = myState.usuarioSistema;
    const departamento = myState.departamento;

    // 🔧 VALIDACIÓN SEGÚN EL TIPO DE SOLICITUD
    if (tipoSolicitud === 'crear_perfil' && (!nombreCompleto || !departamento)) {
      console.log('❌ Datos incompletos para crear perfil, redirigiendo...');
      await flowDynamic('❌ No tenemos tu información completa. Volvamos a empezar.');
      return gotoFlow(flowCapturaNombreTicket);
    }

    if (tipoSolicitud === 'restablecer_contrasena' && (!usuarioSistema || !departamento)) {
      console.log('❌ Datos incompletos para restablecer contraseña, redirigiendo...');
      await flowDynamic('❌ No tenemos tu información completa. Volvamos a empezar.');
      return gotoFlow(flowCapturaUsuarioSistema);
    }

    // 🔒 ACTUALIZAR ESTADO - BLOQUEAR USUARIO
    await actualizarEstado(state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
      tipo: tipoSolicitud === 'crear_perfil' 
        ? "🎫 Creación de Perfil - Sistema de Gestión" 
        : "🎫 Restablecimiento de Contraseña - Sistema de Gestión",
      inicio: Date.now(),
      tipoSolicitud: tipoSolicitud
    });

    const phone = ctx.from;

    // ✅ ENVIAR INFORMACIÓN COMPLETA AL ADMINISTRADOR
    let mensajeAdmin = '';
    
    if (tipoSolicitud === 'crear_perfil') {
      mensajeAdmin = `🎫 *NUEVA SOLICITUD DE CREACIÓN DE PERFIL - SISTEMA DE GESTIÓN* 🎫\n\n📋 *Información del solicitante:*\n👤 Nombre: ${nombreCompleto}\n🏢 Departamento: ${departamento}\n📞 Teléfono: ${phone}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n\n🔧 *Tipo de solicitud:* Creación de nuevo perfil\n\n⚠️ *Procesando solicitud...*`;
    } else {
      mensajeAdmin = `🎫 *NUEVA SOLICITUD DE RESTABLECIMIENTO DE CONTRASEÑA - SISTEMA DE GESTIÓN* 🎫\n\n📋 *Información del solicitante:*\n👤 Usuario del sistema: ${usuarioSistema}\n🏢 Departamento: ${departamento}\n📞 Teléfono: ${phone}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n\n🔧 *Tipo de solicitud:* Restablecimiento de contraseña\n\n⚠️ *Procesando solicitud...*`;
    }

    const envioExitoso = await enviarAlAdmin(provider, mensajeAdmin);

    if (envioExitoso) {
      await flowDynamic('⏳ Hemos recibido tu solicitud. Estamos procesando tu información... \n\n *Te solicitamos no enviar mensajes en lo que realizamos este proceso, este proceso durará aproximadamente 30 minutos.*');
    } else {
      await flowDynamic('⚠️ Hemos registrado tu solicitud. Si no recibes respuesta, contacta directamente al centro de cómputo.');
    }

    let minutosRestantes = 30;

    // Aviso cada 10 minutos
    const intervalId = setInterval(async () => {
      minutosRestantes -= 10;
      if (minutosRestantes > 0) {
        const nombre = tipoSolicitud === 'crear_perfil' ? nombreCompleto : usuarioSistema;
        await flowDynamic(`⏳ Hola *${nombre}*, faltan *${minutosRestantes} minutos* para completar el proceso...`);
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
        // 🔧 GENERAR CREDENCIALES AUTOMÁTICAMENTE
        const usuarioGenerado = tipoSolicitud === 'crear_perfil' 
          ? generarUsuario(nombreCompleto) 
          : usuarioSistema;
        
        const contrasenaGenerada = generarContrasena();

        if (tipoSolicitud === 'crear_perfil') {
          await flowDynamic([
            '✅ *¡Perfil creado exitosamente!* ✅',
            '',
            '📋 **Tus credenciales de acceso al sistema de gestión:**',
            '',
            `👤 *Usuario:* \`${usuarioGenerado}\``,
            `🔐 *Contraseña:* \`${contrasenaGenerada}\``,
            '',
            '💡 **Guarda esta información en un lugar seguro**'
          ].join('\n'));

          console.log(`✅ Perfil creado para *${nombreCompleto}* - Usuario: *${usuarioGenerado}* - Departamento: *${departamento}*`);
        } else {
          await flowDynamic([
            '✅ *¡Contraseña restablecida exitosamente!* ✅',
            '',
            '📋 **Tus nuevas credenciales de acceso al sistema de gestión:**',
            '',
            `👤 *Usuario:* \`${usuarioGenerado}\``,
            `🔐 *Nueva Contraseña:* \`${contrasenaGenerada}\``,
            '',
            '💡 **Guarda esta información en un lugar seguro**'
          ].join('\n'));

          console.log(`✅ Contraseña restablecida para *${usuarioSistema}* - Departamento: *${departamento}*`);
        }

        // 🔧 INSTRUCCIONES ADICIONALES
        await flowDynamic([
          '🔐 **Instrucciones de acceso:**',
          '',
          '1. Accede al sistema de gestión en:',
          '   https://sistema.ita.edu.mx',
          '2. Ingresa tu usuario y contraseña',
          '3. Cambia tu contraseña después del primer acceso',
          '',
          '⚠️ **Recomendaciones de seguridad:**',
          '• No compartas tus credenciales',
          '• Cambia tu contraseña regularmente',
          '• Usa una contraseña segura y única',
          '',
          '📞 **Para soporte técnico:**',
          '• Centro de cómputo: 449 910 50 02 EXT. 145',
          '',
          '🔙 Escribe *menú* para volver al menú principal.'
        ].join('\n'));

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

// ==== FUNCIONES AUXILIARES PARA GENERAR CREDENCIALES - NUEVAS ====
function generarUsuario(nombreCompleto) {
  // Convertir nombre a formato de usuario: nombre.apellido
  const nombres = nombreCompleto.toLowerCase().split(' ');
  let usuario = '';
  
  if (nombres.length >= 2) {
    // Tomar primer nombre y primer apellido
    const primerNombre = nombres[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const primerApellido = nombres[1].normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    usuario = `${primerNombre}.${primerApellido}`;
  } else {
    // Si solo tiene un nombre, usar ese
    usuario = nombres[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  
  // Limpiar caracteres especiales y agregar número aleatorio para unicidad
  usuario = usuario.replace(/[^a-z.]/g, '');
  const numeroAleatorio = Math.floor(Math.random() * 90) + 10; // Número entre 10-99
  
  return `${usuario}${numeroAleatorio}`;
}

function generarContrasena() {
  const longitud = 12;
  const mayusculas = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const minusculas = 'abcdefghijklmnopqrstuvwxyz';
  const numeros = '0123456789';
  const especiales = '!@#$%&*';
  
  let contrasena = '';
  
  // Asegurar al menos un carácter de cada tipo
  contrasena += mayusculas[Math.floor(Math.random() * mayusculas.length)];
  contrasena += minusculas[Math.floor(Math.random() * minusculas.length)];
  contrasena += numeros[Math.floor(Math.random() * numeros.length)];
  contrasena += especiales[Math.floor(Math.random() * especiales.length)];
  
  // Completar el resto de la contraseña
  const todosCaracteres = mayusculas + minusculas + numeros + especiales;
  for (let i = contrasena.length; i < longitud; i++) {
    contrasena += todosCaracteres[Math.floor(Math.random() * todosCaracteres.length)];
  }
  
  // Mezclar la contraseña
  return contrasena.split('').sort(() => Math.random() - 0.5).join('');
}

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

// ==== FLUJO DE CAPTURA DE NOMBRE PARA TICKETS - NUEVO ====
const flowCapturaNombreTicket = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en captura de nombre para ticket');
        await flowDynamic('⏱️ No recibimos tu información. Serás redirigido al menú.');
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
        return gotoFlow(flowCapturaNombreTicket);
      }

      if (!isValidText(input) || !/^[a-zA-ZÁÉÍÓÚÑáéíóúñ\s]+$/.test(input)) {
        await flowDynamic('❌ Solo texto válido. Escribe tu *nombre completo*.');
        return gotoFlow(flowCapturaNombreTicket);
      }

      if (input.length < 3) {
        await flowDynamic('❌ El nombre parece muy corto. Escribe tu *nombre completo* real.');
        return gotoFlow(flowCapturaNombreTicket);
      }

      await state.update({ nombreCompleto: input });
      await flowDynamic(`✅ Recibimos tu nombre: *${input}*`);

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowCapturaDepartamentoTicket);
    }
  );

// ==== FLUJO DE CAPTURA DE USUARIO DEL SISTEMA - NUEVO ====
const flowCapturaUsuarioSistema = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en captura de usuario del sistema');
        await flowDynamic('⏱️ No recibimos tu información. Serás redirigido al menú.');
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
    [
      '👤 *Información del Usuario del Sistema*',
      '',
      '📝 Por favor escribe tu *nombre de usuario* en el sistema de gestión:',
      '',
      '💡 **Ejemplos:**',
      '• juan.perez',
      '• maria.gonzalez',
      '• carlos.rodriguez',
      '',
      '🔙 Escribe *menú* para volver al menú principal.'
    ].join('\n'),
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
        await flowDynamic('❌ No recibimos tu nombre de usuario. Por favor escríbelo.');
        return gotoFlow(flowCapturaUsuarioSistema);
      }

      if (!isValidText(input)) {
        await flowDynamic('❌ Solo texto válido. Escribe tu *nombre de usuario*.');
        return gotoFlow(flowCapturaUsuarioSistema);
      }

      await state.update({ usuarioSistema: input });
      await flowDynamic(`✅ Recibimos tu usuario del sistema: *${input}*`);

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowCapturaDepartamentoTicket);
    }
  );

// ==== FLUJO DE CAPTURA DE DEPARTAMENTO - ACTUALIZADO ====
const flowCapturaDepartamentoTicket = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    const timeout = timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en captura de departamento');
        await flowDynamic('⏱️ No recibimos tu departamento. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);

    await state.update({
      timeoutCapturaDepartamento: timeout,
      ultimaInteraccion: Date.now()
    });
  })
  .addAnswer(
    [
      '🏢 *Información del Departamento*',
      '',
      '📋 Por favor escribe tu *departamento*:',
      '',
      '💡 **Ejemplos:**',
      '• Recursos Humanos',
      '• Contabilidad',
      '• Dirección',
      '• Servicios Escolares',
      '• Coordinación Académica',
      '• Centro de Cómputo',
      '• Mantenimiento',
      '',
      '🔙 Escribe *menú* para volver al menú principal.'
    ].join('\n'),
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
        await flowDynamic('❌ No recibimos tu departamento. Por favor escríbelo.');
        return gotoFlow(flowCapturaDepartamentoTicket);
      }

      if (!isValidText(input)) {
        await flowDynamic('❌ Solo texto válido. Escribe tu *departamento*.');
        return gotoFlow(flowCapturaDepartamentoTicket);
      }

      await state.update({ departamento: input });
      await flowDynamic(`✅ Recibimos tu departamento: *${input}*`);

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowFinalTicket);
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

// ==== Función auxiliar para detectar saludos - NUEVA ====
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

  // 🔧 BÚSQUEDA MÁS FLEXIBLE Y ROBUSTA
  for (const saludo of saludos) {
    const saludoLimpio = saludo.toLowerCase().trim();

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

    // Para saludos más largos, verificar si contiene las palabras clave principales
    if (saludoLimpio.length > 10) {
      const palabrasClave = ['hola', 'problema', 'ayuda', 'cuenta', 'acceso', 'contraseña', 'autenticador', 'disculpa'];
      const contienePalabraClave = palabrasClave.some(palabra => textoLimpio.includes(palabra));
      if (contienePalabraClave) {
        console.log(`✅ Contiene palabra clave: "${textoLimpio}"`);
        return true;
      }
    }
  }
  console.log(`❌ No es saludo válido: "${textoLimpio}"`);
  return false;
}

// ==== FLUJO PRINCIPAL - VERSIÓN HÍBRIDA (MÁS ROBUSTA) ====
const flowPrincipal = addKeyword([
  'hola', 'Hola', 'Hola!', 'HOLA', 'Holi', 'holi', 'holis', 'Holis',
  'holaa', 'Holaa', 'holaaa', 'Holaaa', 'holaaaa', 'Holaaaa',
  'buenos días', 'buenas tardes', 'buenas noches',
  'buenos dias', 'Buenos días', 'Buenas tardes', 'Buenas noches',
  'inicio', 'Inicio', 'comenzar', 'Comenzar', 'empezar', 'Empezar',
  'ayuda', 'Ayuda', 'start', 'Start', 'hello', 'Hello', 'hi', 'Hi'
])
  .addAction(async (ctx, { flowDynamic, state, gotoFlow, endFlow }) => {
    await debugFlujo(ctx, 'flowPrincipal');

    if (ctx.from === CONTACTO_ADMIN) return endFlow();

    // 🔧 VERIFICAR BLOQUEO PRIMERO
    if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
      return endFlow();
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
    await actualizarEstado(state, ESTADOS_USUARIO.EN_MENU);

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

// ==== FLUJO MENÚ PRINCIPAL - ACTUALIZADO CON OPCIÓN 7 ====
const flowMenu = addKeyword(['menu', 'menú', '1', '2', '3', '4', '5', '6', '7'])
  .addAction(async (ctx, { flowDynamic, gotoFlow, state }) => {
    console.log('📱 FLOW MENÚ - Mensaje recibido:', ctx.body);

    if (ctx.from === CONTACTO_ADMIN) return;

    // 🔧 VERIFICAR BLOQUEO PRIMERO
    if (await verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow })) {
      return;
    }

    const opcion = ctx.body.trim();

    // 🔧 ACTUALIZAR ESTADO AL ESTAR EN MENÚ
    await actualizarEstado(state, ESTADOS_USUARIO.EN_MENU);

    // Si es un comando de menú, mostrar opciones
    if (opcion === 'menu' || opcion === 'menú') {
      await mostrarOpcionesMenu(flowDynamic);
      return; // Esperar la respuesta del usuario
    }

    // Si es una opción numérica, procesarla
    if (['1', '2', '3', '4', '5', '6', '7'].includes(opcion)) {
      await procesarOpcionMenu(opcion, flowDynamic, gotoFlow, state);
      return;
    }

    // Si no es ninguna de las anteriores, mostrar menú
    await mostrarOpcionesMenu(flowDynamic);
  });

// ==== FUNCIÓN PARA MOSTRAR OPCIONES DEL MENÚ - ACTUALIZADA CON OPCIÓN 7 ====
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
    '7️⃣ 🎫 Sistema de Tickets - Soporte Administrativo',
    '',
    '💡 *Escribe solo el número (1-7)*'
  ].join('\n'));
}

// ==== FUNCIÓN PARA PROCESAR OPCIONES - ACTUALIZADA CON OPCIÓN 7 ====
async function procesarOpcionMenu(opcion, flowDynamic, gotoFlow, state) {
  console.log('🎯 Procesando opción:', opcion);

  switch (opcion) {
    case '1':
      await flowDynamic('🔐 Iniciando proceso de restablecimiento de contraseña... \n\n En este proceso podrás restablecer la contraseña con la que ingresas a tu cuenta institucional, recuerda que tu contraseña es tu primer nivel de seguridad ante un hackeo.');
      console.log('🚀 Redirigiendo a flowSubMenuContrasena');
      // 🔧 LIMPIAR ESTADO ANTES DE COMENZAR NUEVO PROCESO
      await limpiarEstado(state);
      return gotoFlow(flowSubMenuContrasena);

    case '2':
      await flowDynamic('🔑 Iniciando proceso de autenticador... \n\n En este proceso podrás restablecer el autenticador (Número de teléfono o aplicación de autenticación) con la que ingresas a tu cuenta institucional, recuerda que tu contraseña es tu segundo nivel de seguridad ante un hackeo.');
      console.log('🚀 Redirigiendo a flowSubMenuAutenticador');
      // 🔧 LIMPIAR ESTADO ANTES DE COMENZAR NUEVO PROCESO
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
      await flowDynamic('🎫 Redirigiendo al Sistema de Tickets...');
      console.log('🚀 Redirigiendo a flowTickets');
      // 🔧 LIMPIAR ESTADO ANTES DE COMENZAR NUEVO PROCESO
      await limpiarEstado(state);
      return gotoFlow(flowTickets);

    default:
      await flowDynamic('❌ Opción no válida. Por favor escribe *1*, *2*, *3*, *4*, *5*, *6* o *7*.');
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

  // 🔧 SI ES UN NÚMERO SOLO (1-7), REDIRIGIR AL MENÚ
  if (/^[1-7]$/.test(input)) {
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
    '7️⃣ Sistema de Tickets',
    '',
    '🔙 Escribe *hola* para comenzar.'
  ]);
});

// ==== Inicialización CORREGIDA ====
const main = async () => {
  try {
    console.log('🚀 Iniciando bot de WhatsApp...');

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

      // ==================== 🎫 FLUJOS DE TICKETS - NUEVOS ====================
      flowTickets,
      flowCapturaDatosTicket,
      flowCapturaAreaTicket,
      flowFinalTicket,

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
    ])

    // ==== CONFIGURACIÓN DEL PROVIDER - VERSIÓN CORREGIDA Y OPTIMIZADA ====
    const adapterProvider = createProvider(BaileysProvider, {
      printQRInTerminal: true,

      // 🔧 CONFIGURACIÓN DE AUTENTICACIÓN SIMPLIFICADA
      // Dejar que Baileys maneje la autenticación automáticamente
      // auth: {}, // 🔧 COMENTADO - Dejar que Baileys lo maneje

      // 🔧 CONFIGURACIÓN DE LOGS OPTIMIZADA
      logger: {
        level: 'fatal' // 🔧 CAMBIADO: 'fatal' en lugar de 'silent' para errores críticos únicamente
      },

      // 🔧 CONFIGURACIONES DE CONEXIÓN
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,

      // 🔧 CONFIGURACIONES DE RECONEXIÓN (CORREGIDAS)
      reconnect: true,
      maxRetries: 5, // 🔧 REDUCIDO: 5 intentos en lugar de 10
      connectTimeoutMs: 30000, // 🔧 CORREGIDO: connectTimeoutMs en lugar de connectTimeout
      keepAliveIntervalMs: 20000, // 🔧 CORREGIDO: keepAliveIntervalMs en lugar de keepAliveInterval

      // 🔧 ELIMINAR configuración problemática de getMessage
      // getMessage: async (key) => {
      //   return {
      //     conversation: 'mensaje no disponible'
      //   }
      // },

      // 🔧 CONFIGURACIONES ADICIONALES DE ESTABILIDAD
      emitOwnEvents: false, // 🔧 CAMBIADO: false para mejor estabilidad
      defaultQueryTimeoutMs: 30000, // 🔧 REDUCIDO: 30 segundos en lugar de 60

      // 🔧 NUEVAS CONFIGURACIONES PARA MEJOR ESTABILIDAD
      fireInitQueries: true,
      syncFullHistory: false,
      linkPreviewImageThumbnailWidth: 192,
      transactionOpts: {
        maxRetries: 3,
        delayInMs: 1000
      },

      // 🔧 CONFIGURACIÓN PARA MANEJO DE MEDIOS
      downloadHistory: false,
      mediaCache: {
        maxItems: 50,
        maxSize: 104857600 // 100MB
      }
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