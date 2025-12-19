import { join } from 'path'
import { createBot, createProvider, createFlow, addKeyword, utils } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'

const PORT = process.env.PORT ?? 3008
// ==== VARIABLES GLOBALES Y CONFIGURACIONES ====
const CONTACTO_ADMIN = '5214494877990@s.whatsapp.net'

// ==== FUNCIÓN PARA DETECTAR SALUDOS VÁLIDOS ====
function esSaludoValido(texto) {
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
    '💡 *Escribe solo el número (1-8)*'
  ].join('\n'));
}

// ==== FUNCION PARA PROCESAR OPCIONES ====================
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

// ==== FUNCIÓN PARA LIMPIAR ESTADO (simplificada) ====
async function limpiarEstado(state) {
  try {
    console.log('🧹 Limpiando estado del usuario');
    // Aquí podrías agregar lógica para limpiar el estado si es necesario
  } catch (error) {
    console.error('❌ Error limpiando estado:', error);
  }
}

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
    media: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYTJ0ZGdjd2syeXAwMjQ4aWdkcW04OWlqcXI3Ynh1ODkwZ25zZWZ1dCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/LCohAb657pSdHv0Q5h/giphy.mp4',
  })
  .addAnswer(`Send audio from URL`, { media: 'https://cdn.freesound.org/previews/728/728142_11861866-lq.mp3' })
  .addAnswer(`Send file from URL`, {
    media: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
  })

// ==== FLUJOS DEL SISTEMA (placeholders actualizados) ====

// Flujo de submenú contraseña (placeholder)
const flowSubMenuContrasena = addKeyword<Provider, Database>('submenu_contrasena')
  .addAnswer('🔐 Este es el flujo para restablecer contraseña (opción 1)')
  .addAnswer('🔙 Escribe *menú* para volver al menú principal.')

// Flujo de submenú autenticador (placeholder)
const flowSubMenuAutenticador = addKeyword<Provider, Database>('submenu_autenticador')
  .addAnswer('🔑 Este es el flujo para configurar autenticador (opción 2)')
  .addAnswer('🔙 Escribe *menú* para volver al menú principal.')

// Flujo de educación a distancia (placeholder)
const flowDistancia = addKeyword<Provider, Database>('distancia')
  .addAnswer('🎓 Este es el flujo para Educación a Distancia (opción 3)')
  .addAnswer('🔙 Escribe *menú* para volver al menú principal.')

// Flujo de sistema SIE (placeholder)
const flowSIE = addKeyword<Provider, Database>('sie')
  .addAnswer('📊 Este es el flujo para Sistema SIE (opción 4)')
  .addAnswer('🔙 Escribe *menú* para volver al menú principal.')

// Flujo de información adicional (placeholder)
const flowInfoAdicional = addKeyword<Provider, Database>('info_adicional')
  .addAnswer('🙏 Este es el flujo para información adicional (opción 5)')
  .addAnswer('🔙 Escribe *menú* para volver al menú principal.')

// Flujo de información de credenciales (placeholder)
const flowInfoCredenciales = addKeyword<Provider, Database>('info_credenciales')
  .addAnswer('❓ Este es el flujo para información de credenciales (opción 6)')
  .addAnswer('🔙 Escribe *menú* para volver al menú principal.')

// Flujo de gestión de servicios (placeholder)
const flowGestionServicios = addKeyword<Provider, Database>('gestion_servicios')
  .addAnswer('👨‍💼 Este es el flujo para Gestión de Servicios (opción 7)')
  .addAnswer('🔙 Escribe *menú* para volver al menú principal.')

// Flujo de conexión a base de datos (placeholder)
const flowConexionBaseDatos = addKeyword<Provider, Database>('conexion_base_datos')
  .addAnswer('🗃️ Este es el flujo para Acceso a Base de Datos Actextita (opción 8)')
  .addAnswer('🔙 Escribe *menú* para volver al menú principal.')

// ==== FLUJO PRINCIPAL ÚNICO (REEMPLAZA welcomeFlow y flowPrincipal) ====
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

// ==== FLUJO DEL MENÚ (solo para redirecciones internas) ====
const flowMenu = addKeyword<Provider, Database>(utils.setEvent('SHOW_MENU'))
  .addAction(async (_, { flowDynamic }) => {
    await mostrarOpcionesMenu(flowDynamic);
  });

// ==== FLUJO POR DEFECTO (solo para mensajes no capturados) ====
const flowDefault = addKeyword<Provider, Database>('')
  .addAction(async (ctx, { flowDynamic, gotoFlow }) => {
    const input = ctx.body?.toLowerCase().trim();
    console.log(`🤔 Mensaje no capturado: "${input}"`);
    
    // Si llega aquí, redirigir al flowPrincipal para manejar el mensaje
    return gotoFlow(flowPrincipal);
  });

const main = async () => {
  // ORDEN SIMPLIFICADO: Solo un flujo principal que maneje todo
  const adapterFlow = createFlow([
    // 1. Flujo principal único que maneja todo
    flowPrincipal,
    
    // 2. Flujo del menú (solo para eventos internos)
    flowMenu,
    
    // 3. Flujos específicos (submenús)
    flowSubMenuContrasena,
    flowSubMenuAutenticador,
    flowDistancia,
    flowSIE,
    flowInfoAdicional,
    flowInfoCredenciales,
    flowGestionServicios,
    flowConexionBaseDatos,
    
    // 4. Flujos existentes
    discordFlow,
    registerFlow,
    fullSamplesFlow,
    
    // 5. Flujo por defecto (solo redirecciona)
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