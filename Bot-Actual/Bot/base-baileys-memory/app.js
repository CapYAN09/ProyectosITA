const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot')
const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const MySQLAdapter = require('@bot-whatsapp/database/mysql')

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

// ==== Función para manejar inactividad - NUEVA ====
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
      // 🔧 CONFIGURACIONES ACTUALIZADAS (sin opciones obsoletas)
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

// ==== Función para mostrar estado de bloqueo - CORREGIDA ====
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

// ==== Función para enviar identificación al admin - SOLUCIÓN DEFINITIVA ====
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

    // Enviar mensaje informativo primero
    const mensajeInfo = `📸 IDENTIFICACIÓN RECIBIDA\n\n👤 Nombre: ${userData.nombre}\n📧 ${userData.tipo}: ${userData.identificacion}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}`;
    
    await sock.sendMessage(CONTACTO_ADMIN, {
      text: mensajeInfo
    });

    console.log('🔍 Analizando tipo de medio...');
    console.log('📸 Tipo de mensaje:', ctx.message?.type);
    console.log('📸 Tiene imageMessage:', !!ctx.message?.imageMessage);
    console.log('📸 Tiene documentMessage:', !!ctx.message?.documentMessage);

    // DETECTAR EL TIPO DE MEDIO Y MANEJARLO CORRECTAMENTE
    let mediaEnviada = false;

    // 1. Si es imageMessage (imágenes de cámara de WhatsApp)
    if (ctx.message?.imageMessage) {
      try {
        console.log('🔄 Descargando imageMessage...');
        const buffer = await sock.downloadMediaMessage(ctx.message);
        
        if (buffer) {
          await sock.sendMessage(CONTACTO_ADMIN, {
            image: buffer,
            caption: `📸 IDENTIFICACIÓN - ${userData.nombre} (${userData.identificacion})`
          });
          console.log('✅ ImageMessage enviado correctamente');
          mediaEnviada = true;
        }
      } catch (imageError) {
        console.error('❌ Error con imageMessage:', imageError.message);
      }
    }
    
    // 2. Si es documentMessage con imagen
    else if (ctx.message?.documentMessage && ctx.message.documentMessage.mimetype?.startsWith('image/')) {
      try {
        console.log('🔄 Descargando documentMessage...');
        const buffer = await sock.downloadMediaMessage(ctx.message);
        
        if (buffer) {
          await sock.sendMessage(CONTACTO_ADMIN, {
            image: buffer,
            caption: `📸 IDENTIFICACIÓN - ${userData.nombre} (${userData.identificacion})`
          });
          console.log('✅ DocumentMessage enviado como imagen');
          mediaEnviada = true;
        }
      } catch (docError) {
        console.error('❌ Error con documentMessage:', docError.message);
      }
    }
    
    // 3. Si es un mensaje de tipo 'image' (imágenes de galería)
    else if (ctx.message?.type === 'image') {
      try {
        console.log('🔄 Descargando imagen de tipo image...');
        const buffer = await sock.downloadMediaMessage(ctx.message);
        
        if (buffer) {
          await sock.sendMessage(CONTACTO_ADMIN, {
            image: buffer,
            caption: `📸 IDENTIFICACIÓN - ${userData.nombre} (${userData.identificacion})`
          });
          console.log('✅ Imagen de tipo image enviada correctamente');
          mediaEnviada = true;
        }
      } catch (imageError) {
        console.error('❌ Error con imagen tipo image:', imageError.message);
      }
    }
    
    // 4. Intentar descargar cualquier medio
    else {
      try {
        console.log('🔄 Intentando descargar medio genérico...');
        const buffer = await sock.downloadMediaMessage(ctx.message);
        
        if (buffer) {
          // Detectar el tipo por mimetype o usar image por defecto
          const mimetype = ctx.message?.mimetype || 'image/jpeg';
          
          if (mimetype.startsWith('image/')) {
            await sock.sendMessage(CONTACTO_ADMIN, {
              image: buffer,
              caption: `📸 IDENTIFICACIÓN - ${userData.nombre} (${userData.identificacion})`,
              mimetype: mimetype
            });
            console.log('✅ Medio genérico enviado como imagen');
          } else {
            await sock.sendMessage(CONTACTO_ADMIN, {
              document: buffer,
              caption: `📸 IDENTIFICACIÓN - ${userData.nombre} (${userData.identificacion})`,
              mimetype: mimetype,
              fileName: `identificacion_${userData.nombre}.${mimetype.split('/')[1] || 'jpg'}`
            });
            console.log('✅ Medio genérico enviado como documento');
          }
          mediaEnviada = true;
        }
      } catch (genericError) {
        console.error('❌ Error con medio genérico:', genericError.message);
      }
    }

    // 5. Si no se pudo enviar el medio, intentar reenviar el mensaje original
    if (!mediaEnviada) {
      try {
        console.log('🔄 Intentando reenviar mensaje original...');
        await sock.sendMessage(CONTACTO_ADMIN, {
          forward: ctx.key
        });
        console.log('✅ Mensaje reenviado correctamente');
        mediaEnviada = true;
      } catch (forwardError) {
        console.error('❌ Error reenviando mensaje:', forwardError.message);
      }
    }

    if (mediaEnviada) {
      console.log('✅ Identificación enviada completamente al administrador');
      return true;
    } else {
      console.log('❌ No se pudo enviar la identificación');
      await sock.sendMessage(CONTACTO_ADMIN, {
        text: `❌ NO SE PUDO ENVIAR LA IDENTIFICACIÓN\n\n👤 Usuario: ${userData.nombre}\n📧 ${userData.identificacion}\n\n⚠️ El usuario envió una identificación pero no se pudo procesar. Contactar manualmente.`
      });
      return false;
    }

  } catch (error) {
    console.error('❌ Error crítico enviando identificación al admin:', error.message);
    return false;
  }
}

// ==== Función auxiliar para descargar medios ====
async function descargarMedio(sock, message) {
  try {
    console.log('📥 Descargando medio...');
    const buffer = await sock.downloadMediaMessage(message);
    
    if (buffer) {
      console.log('✅ Medio descargado correctamente, tamaño:', buffer.length, 'bytes');
      return buffer;
    } else {
      console.log('❌ No se pudo descargar el medio (buffer vacío)');
      return null;
    }
  } catch (error) {
    console.error('❌ Error descargando medio:', error.message);
    return null;
  }
}

// ==== Función para enviar mensajes y medios al contacto - SIMPLIFICADA ====
async function enviarAlAdmin(provider, mensaje, userData = null) {
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

    // Enviar mensaje de texto con la información
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

/// ==== FLUJO INTERCEPTOR GLOBAL - MEJORADO ====
const flowInterceptorGlobal = addKeyword(EVENTS.WELCOME)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow, endFlow }) => {
    if (ctx.from === CONTACTO_ADMIN) return endFlow();

    // Reiniciar contador de inactividad en cada mensaje
    await reiniciarInactividad(ctx, state, flowDynamic, gotoFlow);

    // Intentar restaurar estado desde MySQL al iniciar
    const estadoRestaurado = await restaurarEstadoInicial(ctx, state);

    if (estadoRestaurado) {
      await mostrarEstadoBloqueado(flowDynamic, await state.getMyState());
      return gotoFlow(flowBloqueoActivo);
    }

    // 🔧 USAR la función de validación aquí en el interceptor
    const input = ctx.body?.toLowerCase().trim();

    // Si el mensaje NO es un saludo válido Y el usuario no tiene estado activo
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

// ==== Flujo de Bloqueo Activo - CORREGIDO ====
const flowBloqueoActivo = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    if (ctx.from === CONTACTO_ADMIN) return;

    const myState = await state.getMyState();

    if (!myState?.estadoUsuario || myState.estadoUsuario !== ESTADOS_USUARIO.EN_PROCESO_LARGO) {
      await limpiarEstado(state);
      return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
    }

    // Solo mostrar el estado si el usuario escribe "estado"
    const input = ctx.body?.toLowerCase().trim();

    if (input === 'estado') {
      await mostrarEstadoBloqueado(flowDynamic, myState);
    } else if (input && input !== 'estado') {
      // Si escribe cualquier otra cosa
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

      // 🔧 SOLO "estado" redirige a comandos especiales
      if (input === 'estado') {
        return gotoFlow(flowComandosEspeciales);
      }

      // 🔧 Cualquier otra cosa vuelve al flujo de bloqueo
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

// ==== SUBMENÚ PARA OPCIÓN 1 - RESTABLECER CONTRASEÑA (CORREGIDO) ====
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

// ==== Función mejorada para verificar imágenes - MÁS FLEXIBLE ====
function esImagenValida(ctx) {
  if (!ctx || !ctx.message) {
    console.log('❌ No hay contexto o mensaje');
    return false;
  }

  try {
    const message = ctx.message;
    
    console.log('🔍 ANALIZANDO MENSAJE COMPLETO:');
    console.log('📸 Keys del mensaje:', Object.keys(message));
    
    // Verificar cualquier propiedad que indique que es un medio
    const tieneMedio = 
      message.type === 'image' ||
      message.type === 'sticker' ||
      message.type === 'document' ||
      message.mimetype ||
      message.imageMessage ||
      message.documentMessage ||
      message.stickerMessage ||
      message.jpegThumbnail ||
      message.mediaKey ||
      message.url ||
      message.directPath;

    console.log('📸 Tiene medio:', tieneMedio);
    
    if (tieneMedio) {
      console.log('✅ Medio detectado - procediendo como válido');
      return true;
    }

    console.log('❌ No se detectó medio válido');
    return false;
    
  } catch (error) {
    console.error('❌ Error verificando imagen:', error);
    return false;
  }
}

// ==== Flujo final de contraseña - SIMPLIFICADO ====
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

    // ✅ ENVIAR SOLO INFORMACIÓN AL ADMINISTRADOR (la imagen ya se envió antes)
    const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE RESTABLECIMIENTO DE CONTRASEÑA* 🔔\n\n📋 *Información del usuario:*\n👤 Nombre: ${nombreCompleto}\n👥 Tipo: ${tipoUsuario}\n📧 ${esTrabajador ? 'Correo' : 'Número de control'}: ${identificacion}\n📞 Teléfono: ${phone}\n🆔 Identificación: ${myState.identificacionSubida ? '✅ SUBIDA' : '❌ PENDIENTE'}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n🔐 Contraseña temporal asignada: *SoporteCC1234$*\n\n⚠️ Reacciona para validar que está listo`;

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

// ==== Función para obtener información de la imagen - MEJORADA ====
function obtenerInfoImagen(ctx) {
  if (!ctx || !ctx.message) return null;

  try {
    const message = ctx.message;
    let tipo = message.type;
    let mimetype = message.mimetype || 'image/jpeg';
    let timestamp = message.timestamp || Date.now();

    // Si es imagen de cámara de WhatsApp
    if (message.imageMessage) {
      tipo = 'image';
      mimetype = message.imageMessage.mimetype || 'image/jpeg';
      timestamp = message.imageMessage.timestamp || Date.now();
    }
    
    // Si es documento con imagen
    if (message.documentMessage && message.documentMessage.mimetype.startsWith('image/')) {
      tipo = 'document';
      mimetype = message.documentMessage.mimetype;
      timestamp = message.documentMessage.timestamp || Date.now();
    }

    return {
      tipo: tipo,
      mimetype: mimetype,
      timestamp: timestamp,
      from: ctx.from,
      messageId: ctx.key?.id
    };
  } catch (error) {
    console.error('❌ Error obteniendo info de imagen:', error);
    return null;
  }
}

// ==== Flujo de captura para identificación oficial - MEJORADO ====
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
      '📱 **Instrucciones:**',
      '1. Toca el ícono de 📎',
      '2. Selecciona "Cámara" 📸', 
      '3. Toma una foto CLARA de tu identificación',
      '4. Envía la foto',
      '',
      '⚠️ **Asegúrate de que:**',
      '• Se vean todos tus datos claramente',
      '• La imagen no esté borrosa', 
      '• La iluminación sea buena',
      '',
      '🔒 Tu información está protegida y será usada solo para verificación.'
    ].join('\n'),
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      timeoutManager.clearTimeout(ctx.from);

      console.log('🎯 MEDIO RECIBIDO - PROCESANDO...');
      console.log('📸 Tipo:', ctx.message?.type);
      console.log('📸 Mimetype:', ctx.message?.mimetype);

      // ACEPTAR CUALQUIER MEDIO Y PROCESAR
      const myState = await state.getMyState();
      
      await state.update({
        identificacionSubida: true,
        timestampIdentificacion: Date.now(),
        imagenContext: {
          key: ctx.key,
          message: ctx.message,
          from: ctx.from
        }
      });

      await flowDynamic('✅ ¡Perfecto! Hemos recibido tu identificación correctamente.');

      // Enviar identificación al admin
      const userData = {
        nombre: myState.nombreCompleto || 'Por confirmar',
        identificacion: myState.esTrabajador ? myState.correoInstitucional : myState.numeroControl,
        tipo: myState.esTrabajador ? 'Trabajador' : 'Alumno'
      };

      const envioExitoso = await enviarIdentificacionAlAdmin(provider, ctx, userData);
      
      if (envioExitoso) {
        await flowDynamic('📤 Identificación enviada para verificación. Continuando con el proceso...');
      } else {
        await flowDynamic('⚠️ Hemos recibido tu identificación pero hubo un problema al enviarla. Continuaremos con el proceso.');
      }

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
    async (ctx, { flowDynamic, gotoFlow, state }) => {
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
      await state.update({
        identificacionSubida: true,
        infoIdentificacion: infoImagen,
        timestampIdentificacion: Date.now()
      });

      await flowDynamic('✅ ¡Perfecto! Hemos recibido tu identificación correctamente.');

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowAutenticador);
    }
  );

// ==== Flujo final de autenticador - ACTUALIZADO PARA ENVIAR IMAGEN ====
const flowAutenticador = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, provider, gotoFlow }) => {
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
      return gotoFlow(flowSubMenuAutenticador);
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

    // ✅ ENVIAR INFORMACIÓN COMPLETA AL ADMINISTRADOR CON IMAGEN
    const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE DESHABILITAR EL AUTENTICADOR* 🔔\n\n📋 *Información del usuario:*\n👤 Nombre: ${nombreCompleto}\n👥 Tipo: ${tipoUsuario}\n📧 ${esTrabajador ? 'Correo' : 'Número de control'}: ${identificacion}\n📞 Teléfono: ${phone}\n🆔 Identificación: ${myState.identificacionSubida ? '✅ SUBIDA' : '❌ PENDIENTE'}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n\n⚠️ *Proceso en curso...*`;

    // Preparar datos del usuario para enviar con la imagen
    const userData = {
      nombre: nombreCompleto,
      identificacion: identificacion,
      tipo: tipoUsuario,
      telefono: phone
    };

    // Obtener el contexto de la imagen si está disponible
    let imagenContext = null;
    if (myState.imagenIdentificacion) {
      imagenContext = {
        message: myState.imagenIdentificacion,
        key: ctx.key,
        from: ctx.from
      };
    }

    const envioExitoso = await enviarAlAdmin(provider, mensajeAdmin, imagenContext, userData);

    if (envioExitoso) {
      await flowDynamic('⏳ Permítenos un momento, vamos a desconfigurar tu autenticador... \n\n Te solicitamos no enviar mensajes en lo que realizamos esté proceso, esté proceso durará aproximadamente 30 minutos.');
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
  .addAction(async (ctx, { state, flowDynamic, provider }) => {
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
      await flowDynamic('⏳ Permítenos un momento, vamos a restablecer tu contraseña... \n\n Te solicitamos no enviar mensajes en lo que realizamos esté proceso, esté proceso durará aproximadamente 30 minutos.');
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
      await flowDynamic('⏱️ Tiempo agotado. Por favor inicia el bot nuevamente escribiendo *Hola*.');
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

      if (input === 'hola') {
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

const flowCapturaNombreAutenticador = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => { // 🔧 AGREGAR ctx
    const timeout = setTimeout(async () => {
      console.log('⏱️ Timeout de 2 minutos en nombre completo - autenticador');
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
const flowrestablecercontrase = addKeyword(['1', 'restablecer contraseña', 'contraseña'])
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
const flowrestablecerautenti = addKeyword(['2', 'restablecer autenticador', 'autenticador'])
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

// ==== Función auxiliar para detectar saludos - NUEVA ====
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
    'Hola buenos días, tengo un problema con mi cuenta'
  ];

  return saludos.some(saludo => textoLimpio.includes(saludo));
}

// ==== Flujo principal (CORREGIDO) ====
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

      // 🔧 CORRECCIÓN: Usar las palabras clave correctas
      if (opcion === '1') return gotoFlow(flowrestablecercontrase)
      if (opcion === '2') return gotoFlow(flowrestablecerautenti)
      if (opcion === '3') return gotoFlow(flowDistancia)
      if (opcion === '4') return gotoFlow(flowSIE)
    }
  )

// ==== Flujo de menú (CORREGIDO) ====
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

      const opcion = ctx.body.trim()

      if (!isValidText(opcion) || !['1', '2', '3', '4', '5'].includes(opcion)) {
        await flowDynamic('❌ Opción no válida. Escribe *1*, *2*, *3*, *4* o *5*.')
        return gotoFlow(flowEsperaMenu)
      }

      // 🔧 CORRECCIÓN: Usar las palabras clave correctas
      if (opcion === '1') return gotoFlow(flowrestablecercontrase)
      if (opcion === '2') return gotoFlow(flowrestablecerautenti)
      if (opcion === '3') return gotoFlow(flowDistancia)
      if (opcion === '4') return gotoFlow(flowSIE)
      if (opcion === '5') return gotoFlow(flowGracias)
    }
  )

// ==== Flujo para comandos especiales durante procesos (SIMPLIFICADO) ====
const flowComandosEspeciales = addKeyword(['estado']) // 🔧 Solo "estado"
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

    // 🔧 Siempre regresar al flujo de bloqueo después de mostrar estado
    if (myState?.estadoUsuario === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
      return gotoFlow(flowBloqueoActivo);
    }

    return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
  });

// ==== VERIFICACIÓN DE LA BASE DE DATOS - SIMPLIFICADA ====
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

    // Verificar que la tabla existe
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

// ==== Flujo para mensajes no entendidos - ACTUALIZADO ====
const flowDefault = addKeyword(EVENTS.WELCOME).addAction(async (ctx, { flowDynamic, state, gotoFlow }) => {
  if (ctx.from === CONTACTO_ADMIN) return;

  // Reiniciar inactividad incluso en mensajes no entendidos
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
  // ==================== 🛡️ FLUJOS DE INTERCEPTACIÓN (PRIMERO) ====================
  flowBlockAdmin,
  flowInterceptorGlobal,
  flowComandosEspeciales,

  // ==================== 🎯 FLUJOS PRINCIPALES DE USUARIO ====================
  flowPrincipal,
  flowMenu,

  // ==================== 🔄 FLUJOS DE INICIO DE PROCESOS ====================
  flowrestablecercontrase,  // 🔧 ESTE DEBE ESTAR ANTES DE LOS SUBMENÚS
  flowrestablecerautenti,   // 🔧 ESTE DEBE ESTAR ANTES DE LOS SUBMENÚS
  
  // ==================== 🎪 SUBMENÚS ====================
  flowSubMenuContrasena,    // 🔧 SUBMENÚ CONTRASEÑA
  flowSubMenuAutenticador,  // 🔧 SUBMENÚ AUTENTICADOR

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

  // ==================== 🔐 FLUJOS DE PROCESOS LARGOS ====================
  flowrestablecerSIE,

  // ==================== ⏳ FLUJOS FINALES (BLOQUEAN USUARIO) ====================
  flowContrasena,
  flowAutenticador,
  flowFinSIE,
  flowBloqueoActivo,

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

    // ==== MEJORA EN LA CONFIGURACIÓN DEL PROVIDER ====
    const adapterProvider = createProvider(BaileysProvider, {
      printQRInTerminal: true,
      // 🔧 CONFIGURACIONES ADICIONALES DE ESTABILIDAD
      auth: {
        creds: {},
        keys: {}
      },
      logger: {
        level: 'silent'
      },
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
      // 🔧 CONFIGURACIONES DE RECONEXIÓN MEJORADAS
      reconnect: true,
      maxRetries: 10,
      connectTimeout: 30000,
      keepAliveInterval: 15000,
      // Manejo de errores mejorado
      getMessage: async (key) => {
        return {
          conversation: 'mensaje no disponible'
        }
      },
      // Configuración para evitar desconexiones
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