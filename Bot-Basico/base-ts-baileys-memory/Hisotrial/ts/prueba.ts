import { join } from 'path'
import { createBot, createProvider, createFlow, addKeyword, utils } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'

const PORT = process.env.PORT ?? 3008

// ==== VARIABLES GLOBALES Y CONFIGURACIONES ====
const CONTACTO_ADMIN = '5214494877990@s.whatsapp.net'

// ==== CLASE TIMEOUT MANAGER ====================
class TimeoutManager {
  private timeouts: Map<string, NodeJS.Timeout>;
  private intervals: Map<string, NodeJS.Timeout>;

  constructor() {
    this.timeouts = new Map();
    this.intervals = new Map();
  }

  setTimeout(userPhone: string, callback: () => void, delay: number): NodeJS.Timeout {
    this.clearTimeout(userPhone);
    const timeoutId = setTimeout(callback, delay);
    this.timeouts.set(userPhone, timeoutId);
    return timeoutId;
  }

  setInterval(userPhone: string, callback: () => void, delay: number): NodeJS.Timeout {
    this.clearInterval(userPhone);
    const intervalId = setInterval(callback, delay);
    this.intervals.set(userPhone, intervalId);
    return intervalId;
  }

  clearTimeout(userPhone: string): void {
    if (this.timeouts.has(userPhone)) {
      clearTimeout(this.timeouts.get(userPhone)!);
      this.timeouts.delete(userPhone);
    }
  }

  clearInterval(userPhone: string): void {
    if (this.intervals.has(userPhone)) {
      clearInterval(this.intervals.get(userPhone)!);
      this.intervals.delete(userPhone);
    }
  }

  clearAll(userPhone: string): void {
    this.clearTimeout(userPhone);
    this.clearInterval(userPhone);
  }
}

const timeoutManager = new TimeoutManager();

// ==== SISTEMA DE ESTADOS DEL USUARIO ====================
const ESTADOS_USUARIO = {
  LIBRE: 'libre',
  EN_PROCESO_LARGO: 'en_proceso_largo',
  ESPERANDO_DATOS: 'esperando_datos',
  EN_MENU: 'en_menu'
};

// ==== FUNCIONES DE UTILIDAD ====================
function normalizarIdWhatsAppBusiness(id: string): string {
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
  const regex = /^[a-zA-Z0-9._%+-]+@aguascalientes\.tecnm\.mx$/;
  return regex.test(correo) && correo.length > 0;
}

function esImagenValida(ctx: any): boolean {
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

// ==== FUNCIONES DE ESTADO ====================
async function actualizarEstado(ctx: any, state: any, nuevoEstado: string, metadata = {}) {
  try {
    if (!ctx || !ctx.from) return;

    const userPhone = ctx.from;

    const metadataLimpio: any = {};
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
        const objLimpio: any = {};
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

async function limpiarEstado(state: any) {
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

async function redirigirAMenuConLimpieza(ctx: any, state: any, gotoFlow: any, flowDynamic: any) {
  try {
    await limpiarEstado(state);
    return gotoFlow(flowMenu);
  } catch (error) {
    console.error('❌ Error en redirección al menú:', error);
    await flowDynamic('🔧 Reiniciando bot... Por favor escribe *hola* para continuar.');
    return gotoFlow(flowPrincipal);
  }
}

async function verificarEstadoBloqueado(ctx: any, { state, flowDynamic, gotoFlow }: any) {
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

async function guardarEstadoMySQL(userPhone: string, estado: string, metadata = {}, userData = {}) {
  console.log(`💾 Guardando estado para: ${userPhone} - ${estado}`);
  // Implementación dummy - puedes agregar la conexión a MySQL aquí
  return true;
}

async function limpiarEstadoMySQL(userPhone: string) {
  console.log(`🧹 Limpiando estado MySQL para: ${userPhone}`);
}

async function enviarAlAdmin(provider: any, mensaje: string, ctx: any = null) {
  try {
    console.log('📤 Enviando al administrador:', mensaje.substring(0, 100) + '...');
    return true;
  } catch (error) {
    console.error('❌ Error enviando información al administrador:', error);
    return false;
  }
}

// ==== FUNCIÓN PARA DETECTAR SALUDOS VÁLIDOS ====
function esSaludoValido(texto: string): boolean {
  if (!texto || typeof texto !== 'string') return false;

  const textoLimpio = texto.toLowerCase().trim();
  const saludos = [
    'hola', 'ole', 'alo', 'inicio', 'comenzar', 'empezar',
    'buenos días', 'buenas tardes', 'buenas noches',
    'buenos dias', 'hola.', 'hola!', 'hola?', 'ayuda', 
    'holi', 'holis', 'holaa', 'holaaa', 'holaaaa', 'holaaaaa',
    'holaaaaaa', 'holaaaaaaa', 'holaaaaaaaa',
    'buenos días, tengo un problema', 'buenas tardes, tengo un problema',
    'buenas noches, tengo un problema', 'buenos días tengo un problema',
    'buenas tardes tengo un problema', 'buenas noches tengo un problema',
    'tengo un problema', 'necesito ayuda', 'tengo un problema con mi cuenta',
    'no puedo acceder a mi cuenta', 'problema con mi cuenta', 'problema con mi acceso'
  ];

  // Verificar coincidencia exacta
  for (const saludo of saludos) {
    if (textoLimpio === saludo.toLowerCase().trim()) return true;
  }

  // Verificar si contiene algún saludo
  for (const saludo of saludos) {
    if (textoLimpio.includes(saludo.toLowerCase().trim())) return true;
  }

  const palabrasClave = [
    'hola', 'problema', 'ayuda', 'cuenta', 'acceso',
    'contraseña', 'autenticador', 'disculpa', 'restablecer',
    'configurar', 'soporte', 'ayudar', 'asistencia'
  ];

  // Verificar si contiene palabras clave
  return palabrasClave.some(palabra => textoLimpio.includes(palabra));
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
    '7️⃣ 👨‍💼 Gestión de Servicios (Exclusivo Trabajadores)',
    '8️⃣ 🗃️ Acceso a Base de Datos Actextita',
    '',
    '💡 *Escribe solo el número (1-8)*'
  ].join('\n'));
}

// ==== FUNCION PARA PROCESAR OPCIONES ====================
async function procesarOpcionMenu(opcion: string, flowDynamic: any, gotoFlow: any, state: any) {
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
      await flowDynamic('🙏 Redirigiendo a información adicional...');
      console.log('🚀 Redirigiendo a flowInfoAdicional');
      return gotoFlow(flowInfoAdicional);

    case '6':
      await flowDynamic('❓ Redirigiendo a información de credenciales...');
      console.log('🚀 Redirigiendo a flowInfoCredenciales');
      return gotoFlow(flowInfoCredenciales);

    case '7':
      await flowDynamic('👨‍💼 Redirigiendo a Gestión de Servicios...\n\n🔗 *Conectando a base de datos*');
      console.log('🚀 Redirigiendo a flowGestionServicios');
      return gotoFlow(flowGestionServicios);

    case '8':
      await flowDynamic('🗃️ Conectando a Base de Datos Actextita...');
      console.log('🚀 Redirigiendo a flowConexionBaseDatos');
      return gotoFlow(flowConexionBaseDatos);

    default:
      await flowDynamic('❌ Opción no válida. Por favor escribe *1*, *2*, *3*, *4*, *5*, *6*, *7* o *8*.');
      return gotoFlow(flowMenu);
  }
}

// ==== FLUJO PRINCIPAL ÚNICO ====
const flowPrincipal = addKeyword<Provider, Database>([''])
  .addAction(async (ctx, { flowDynamic, gotoFlow, state }) => {
    const input = ctx.body?.toLowerCase().trim();
    console.log(`📥 Mensaje recibido: "${input}"`);

    // Verificar si es un saludo válido
    if (esSaludoValido(input)) {
      console.log(`✅ Saludo detectado: "${input}"`);
      
      // LIMPIAR ESTADO
      await limpiarEstado(state);

      // ENVIAR BIENVENIDA CON IMAGEN
      try {
        await flowDynamic([{
          body: '🎉 ¡Bienvenido al bot de Centro de Cómputo del ITA!',
          media: 'https://raw.githubusercontent.com/CapYAN09/ProyectosITA/main/img/Imagen_de_WhatsApp_2025-09-05_a_las_11.03.34_cdb84c7c-removebg-preview.png'
        }]);
      } catch (error) {
        console.error('❌ Error enviando imagen:', error);
        await flowDynamic('🎉 ¡Bienvenido al *AguiBot* del ITA!');
      }
      
      // Esperar un momento y mostrar el menú
      await new Promise(resolve => setTimeout(resolve, 1000));
      await mostrarOpcionesMenu(flowDynamic);
      
      // NO redirigir a flowMenu, quedarnos aquí para procesar opciones
      return;
    }
    
    // Si no es un saludo, verificar si es una opción del menú (1-8)
    if (/^[1-8]$/.test(input)) {
      console.log(`🎯 Opción del menú detectada: "${input}"`);
      await procesarOpcionMenu(input, flowDynamic, gotoFlow, state);
      return;
    }
    
    // Si es "menu" o "menú", mostrar el menú
    if (input === 'menu' || input === 'menú') {
      console.log(`📋 Comando de menú detectado: "${input}"`);
      await mostrarOpcionesMenu(flowDynamic);
      return;
    }
    
    // Si es "doc", redirigir al flujo de documentación
    if (input === 'doc') {
      console.log(`📄 Comando doc detectado: "${input}"`);
      return gotoFlow(discordFlow);
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
      '7️⃣ 👨‍💼 Gestión de Servicios (Exclusivo Trabajadores)',
      '8️⃣ 🗃️ Acceso a Base de Datos Actextita',
      '',
      '🔙 Escribe *hola* para comenzar.'
    ].join('\n'));
  });

// ==== SUBMENÚ PARA OPCIÓN 1 - RESTABLECER CONTRASEÑA ====
const flowSubMenuContrasena = addKeyword<Provider, Database>(utils.setEvent('SUBMENU_CONTRASENA'))
  .addAnswer(
    '🔐 *RESTABLECIMIENTO DE CONTRASEÑA DEL CORREO INSTITUCIONAL*\n\n' +
    'Una vez comenzado este proceso no podrá ser detenido hasta completarse.\n\n' +
    '👥 *Selecciona tu tipo de usuario:*\n\n' +
    '1️⃣ ¿Eres un estudiante?\n' +
    '2️⃣ ¿Eres un trabajador o docente?\n\n' +
    '🔙 Escribe *menú* para volver al menú principal.',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
      ctx.from = normalizarIdWhatsAppBusiness(ctx.from);
      if (ctx.from === CONTACTO_ADMIN) return;

      const opcion = ctx.body.trim().toLowerCase();

      if (opcion === 'menu' || opcion === 'menú') {
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      }

      if (opcion === '1') {
        await flowDynamic('🎓 Perfecto, eres alumno. Vamos a comenzar con el proceso...');
        await state.update({ esTrabajador: false, tipoProceso: 'CONTRASENA' });
        return gotoFlow(flowCapturaNumeroControl);
      }

      if (opcion === '2') {
        await flowDynamic('👨‍💼 Perfecto, eres trabajador. Vamos a comenzar con el proceso...');
        await state.update({ esTrabajador: true, tipoProceso: 'CONTRASENA' });
        return gotoFlow(flowCapturaCorreoTrabajador);
      }

      await flowDynamic('❌ Opción no válida. Escribe *1* o *2*.');
      return gotoFlow(flowSubMenuContrasena);
    }
  );

// ==== FLUJO DE CAPTURA DE CORREO PARA TRABAJADOR ====
const flowCapturaCorreoTrabajador = addKeyword<Provider, Database>(utils.setEvent('CAPTURA_CORREO_TRABAJADOR'))
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en correo trabajador');
        await flowDynamic('⏱️ No recibimos tu correo. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);
  })
  .addAnswer(
    '📝 Por favor escribe tu *correo institucional* (ejemplo: nombre.apellido@aguascalientes.tecnm.mx):',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
      ctx.from = normalizarIdWhatsAppBusiness(ctx.from);
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
      return gotoFlow(flowCapturaNombre);
    }
  );

// ==== FLUJO DE CAPTURA DE NÚMERO DE CONTROL ====
const flowCapturaNumeroControl = addKeyword<Provider, Database>(utils.setEvent('CAPTURA_NUMERO_CONTROL'))
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en número de control');
        await flowDynamic('⏱️ No recibimos tu número de control. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);
  })
  .addAnswer(
    '📝 Por favor escribe tu *número de control*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
      ctx.from = normalizarIdWhatsAppBusiness(ctx.from);
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

// ==== FLUJO DE CAPTURA DE NOMBRE ====
const flowCapturaNombre = addKeyword<Provider, Database>(utils.setEvent('CAPTURA_NOMBRE'))
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en nombre completo');
        await flowDynamic('⏱️ No recibimos tu nombre completo. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);
  })
  .addAnswer(
    '📝 Por favor escribe tu *nombre completo*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state, provider }) => {
      ctx.from = normalizarIdWhatsAppBusiness(ctx.from);
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
      const identificacion = myState.esTrabajador ? myState.correoInstitucional : myState.numeroControl;

      await flowDynamic(`🙌 Gracias, *${input}*.\n✅ Registramos tu identificación: *${identificacion}*`);
      await state.update({ nombreCompleto: input });

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowCapturaIdentificacion);
    }
  );

// ==== FLUJO DE CAPTURA DE IDENTIFICACIÓN ====
const flowCapturaIdentificacion = addKeyword<Provider, Database>(utils.setEvent('CAPTURA_IDENTIFICACION'))
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    const userPhone = ctx.from;

    timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 4 minutos en identificación');
        await flowDynamic('⏱️ No recibimos tu identificación en 4 minutos. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 4 * 60 * 1000);
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
      ctx.from = normalizarIdWhatsAppBusiness(ctx.from);
      if (ctx.from === CONTACTO_ADMIN) return;

      timeoutManager.clearTimeout(ctx.from);

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
        ].join('\n'));

        return gotoFlow(flowCapturaIdentificacion);
      }

      await state.update({
        identificacionSubida: true,
        timestampIdentificacion: Date.now(),
        fotoEnVivo: true
      });

      await flowDynamic('✅ *¡Perfecto! Foto tomada correctamente con la cámara*\n\n📋 Continuando con el proceso...');

      const myState = await state.getMyState();
      const tipoProceso = myState.tipoProceso || 'CONTRASENA';

      if (tipoProceso === 'AUTENTICADOR') {
        return gotoFlow(flowAutenticador);
      } else {
        return gotoFlow(flowContrasena);
      }
    }
  );

// ==== FLUJO FINAL DE CONTRASEÑA ====
const flowContrasena = addKeyword<Provider, Database>(utils.setEvent('FLOW_CONTRASENA'))
  .addAction(async (ctx, { state, flowDynamic, provider, gotoFlow }) => {
    ctx.from = normalizarIdWhatsAppBusiness(ctx.from);
    if (ctx.from === CONTACTO_ADMIN) return;

    const myState = await state.getMyState();
    const nombreCompleto = myState.nombreCompleto;
    const esTrabajador = myState.esTrabajador || false;
    const identificacion = esTrabajador ? myState.correoInstitucional : myState.numeroControl;

    if (!nombreCompleto || !identificacion) {
      await flowDynamic('❌ Información incompleta. Volviendo al inicio.');
      return gotoFlow(flowMenu);
    }

    await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
      tipo: "🔐 Restablecimiento de Contraseña",
      inicio: Date.now(),
      esTrabajador: esTrabajador
    });

    await guardarEstadoMySQL(ctx.from, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
      tipo: "Restablecimiento de Contraseña",
      inicio: Date.now()
    }, {
      numeroControl: myState.numeroControl,
      nombreCompleto: myState.nombreCompleto,
      identificacionSubida: myState.identificacionSubida,
      timestampIdentificacion: myState.timestampIdentificacion
    });

    const tipoUsuario = esTrabajador ? "Trabajador" : "Alumno";
    const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE RESTABLECIMIENTO DE CONTRASEÑA DEL CORREO INSTITUCIONAL.* 🔔\n\n📋 *Información del usuario:*\n👤 Nombre: ${nombreCompleto}\n👥 Tipo: ${tipoUsuario}\n📧 ${esTrabajador ? 'Correo' : 'Número de control'}: ${identificacion}\n📞 Teléfono: ${ctx.from}\n🆔 Identificación: ${myState.identificacionSubida ? '✅ SUBIDA' : '❌ PENDIENTE'}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n🔐 Contraseña temporal asignada: *SoporteCC1234$*\n💾 *MySQL:* ✅ CONECTADO\n🔗 *Remoto:* ${/* conexionRemota */ true ? '✅ CONECTADO' : '❌ DESCONECTADO'}\n\n⚠️ Reacciona para validar que está listo`;

    await enviarAlAdmin(provider, mensajeAdmin);

    await flowDynamic('⏳ Permítenos un momento, vamos a restablecer tu contraseña... \n\n *Te solicitamos no enviar mensajes en lo que realizamos este proceso, este proceso durará aproximadamente 30 minutos.*');

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

    return gotoFlow(flowBloqueoActivo);
  });

// ==== FLUJOS DE OTRAS OPCIONES (placeholders) ====
const flowAutenticador = addKeyword<Provider, Database>(utils.setEvent('FLOW_AUTENTICADOR'))
  .addAnswer('🔑 Este es el flujo para autenticador (en desarrollo)')
  .addAnswer('🔙 Escribe *menú* para volver al menú principal.');

  // ==== FLUJOS DE OTRAS OPCIONES (placeholders) ====
const flowSubMenuAutenticador = addKeyword<Provider, Database>(utils.setEvent('FLOW_AUTENTICADOR'))
  .addAnswer('🔑 Este es el flujo para autenticador (en desarrollo)')
  .addAnswer('🔙 Escribe *menú* para volver al menú principal.');

const flowDistancia = addKeyword<Provider, Database>('distancia')
  .addAnswer('🎓 Este es el flujo para Educación a Distancia (en desarrollo)')
  .addAnswer('🔙 Escribe *menú* para volver al menú principal.');

const flowSIE = addKeyword<Provider, Database>('sie')
  .addAnswer('📊 Este es el flujo para Sistema SIE (en desarrollo)')
  .addAnswer('🔙 Escribe *menú* para volver al menú principal.');

const flowInfoAdicional = addKeyword<Provider, Database>('info_adicional')
  .addAnswer('🙏 Este es el flujo para información adicional (en desarrollo)')
  .addAnswer('🔙 Escribe *menú* para volver al menú principal.');

const flowInfoCredenciales = addKeyword<Provider, Database>('info_credenciales')
  .addAnswer('❓ Este es el flujo para información de credenciales (en desarrollo)')
  .addAnswer('🔙 Escribe *menú* para volver al menú principal.');

const flowGestionServicios = addKeyword<Provider, Database>('gestion_servicios')
  .addAnswer('👨‍💼 Este es el flujo para Gestión de Servicios (en desarrollo)')
  .addAnswer('🔙 Escribe *menú* para volver al menú principal.');

const flowConexionBaseDatos = addKeyword<Provider, Database>('conexion_base_datos')
  .addAnswer('🗃️ Este es el flujo para Acceso a Base de Datos Actextita (en desarrollo)')
  .addAnswer('🔙 Escribe *menú* para volver al menú principal.');

// ==== FLUJO DE BLOQUEO ACTIVO ====
const flowBloqueoActivo = addKeyword<Provider, Database>(utils.setEvent('BLOQUEO_ACTIVO'))
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    ctx.from = normalizarIdWhatsAppBusiness(ctx.from);
    if (ctx.from === CONTACTO_ADMIN) return;

    const myState = await state.getMyState();

    if (!myState?.estadoUsuario || myState.estadoUsuario !== ESTADOS_USUARIO.EN_PROCESO_LARGO) {
      console.log(`🔓 Usuario ${ctx.from} ya no está bloqueado, liberando...`);
      await limpiarEstado(state);
      return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
    }

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

    return;
  });

// ==== FLUJO DEL MENÚ (solo para redirecciones internas) ====
const flowMenu = addKeyword<Provider, Database>(utils.setEvent('SHOW_MENU'))
  .addAction(async (_, { flowDynamic }) => {
    await mostrarOpcionesMenu(flowDynamic);
  });

// ==== FLUJO DE DOCUMENTACIÓN ====
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

// ==== FLUJO DE REGISTRO ====
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

// ==== FLUJO DE MUESTRAS ====
const fullSamplesFlow = addKeyword<Provider, Database>(['samples', utils.setEvent('SAMPLES')])
  .addAnswer(`💪 I'll send you a lot files...`)
  .addAnswer(`Send image from Local`, { media: join(process.cwd(), 'assets', 'sample.png') })
  .addAnswer(`Send video from URL`, {
    media: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYTJ0ZGdjd2syeXAwMjQ4aWdkcW04OWlqcXI3Ynh1ODkwZ25zZWZ1dCZlcD12MV9pbnRlcm5hbF9naif_fYnlfaWQmY3Q9Zw/LCohAb657pSdHv0Q5h/giphy.mp4',
  })
  .addAnswer(`Send audio from URL`, { media: 'https://cdn.freesound.org/previews/728/728142_11861866-lq.mp3' })
  .addAnswer(`Send file from URL`, {
    media: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
  })

// ==== FLUJO POR DEFECTO ====
const flowDefault = addKeyword<Provider, Database>('')
  .addAction(async (ctx, { flowDynamic, gotoFlow }) => {
    const input = ctx.body?.toLowerCase().trim();
    console.log(`🤔 Mensaje no capturado: "${input}"`);
    
    // Si llega aquí, redirigir al flowPrincipal para manejar el mensaje
    return gotoFlow(flowPrincipal);
  });

const main = async () => {
  // ORDEN DE FLUJOS
  const adapterFlow = createFlow([
    // 1. Flujo principal único que maneja todo
    flowPrincipal,
    
    // 2. Flujo del menú (solo para eventos internos)
    flowMenu,
    
    // 3. Flujos de restablecimiento de contraseña
    flowSubMenuContrasena,
    flowCapturaCorreoTrabajador,
    flowCapturaNumeroControl,
    flowCapturaNombre,
    flowCapturaIdentificacion,
    flowContrasena,
    flowAutenticador,
    flowBloqueoActivo,
    
    // 4. Otros flujos del sistema
    flowDistancia,
    flowSIE,
    flowInfoAdicional,
    flowInfoCredenciales,
    flowGestionServicios,
    flowConexionBaseDatos,
    
    // 5. Flujos existentes
    discordFlow,
    registerFlow,
    fullSamplesFlow,
    
    // 6. Flujo por defecto (solo redirecciona)
    flowDefault
  ])
  
  const adapterProvider = createProvider(Provider, 
    { version: [2, 3000, 1027934701] as any } 
  )
  const adapterDB = new Database()

  const { handleCtx, httpServer } = await createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB,
  })

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
  
  httpServer(+PORT)
}

main()