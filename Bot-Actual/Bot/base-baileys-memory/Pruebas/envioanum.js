const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot')
const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const MockAdapter = require('@bot-whatsapp/database/mock')

// Contacto específico donde se enviará la información
const CONTACTO_ADMIN = '5214494877990@s.whatsapp.net'

// ==== Función para enviar mensajes al contacto SIN trigger de flujos ====
async function enviarAlAdmin(provider, mensaje) {
  if (!provider) {
    console.error('❌ Provider no está disponible')
    return false
  }

  try {
    console.log('📤 Intentando enviar mensaje al administrador...')
    
    // ⚡ USAR EL MÉTODO INTERNO DE BAILEYS
    // Esto evita que se disparen los flujos del bot
    const sock = provider.vendor
    
    // Verificar si el socket está disponible
    if (!sock) {
      console.error('❌ Socket de Baileys no disponible')
      return false
    }
    
    // Enviar mensaje directamente usando el socket
    await sock.sendMessage(CONTACTO_ADMIN, { 
      text: mensaje 
    })
    
    console.log('✅ Información enviada al administrador correctamente')
    return true
  } catch (error) {
    console.error('❌ Error enviando información al administrador:', error.message)
    
    // Manejo específico de errores
    if (error.message.includes('not-authorized')) {
      console.log('⚠️ El administrador no te tiene agregado como contacto')
    }
    if (error.message.includes('blocked')) {
      console.log('⚠️ El administrador te tiene bloqueado')
    }
    
    return false
  }
}

// ==== FLUJO PARA BLOQUEAR AL ADMINISTRADOR ====
const flowBlockAdmin = addKeyword(EVENTS.WELCOME)
  .addAction(async (ctx, { endFlow }) => {
    // Si el mensaje viene del administrador, BLOQUEAR el flujo
    if (ctx.from === CONTACTO_ADMIN) {
      console.log('🚫 Mensaje del administrador bloqueado - No se procesará')
      return endFlow() // Termina el flujo inmediatamente
    }
  })

// ==== Funciones de validación ====
function isValidText(input) {
  if (!input || typeof input !== 'string') return false
  if (input.trim().length === 0) return false
  if (input.includes('sticker') || input.includes('image') || input.includes('video')) return false
  return true
}

function validarNumeroControl(numeroControl) {
  const letrasPermitidas = ['D', 'C', 'B', 'R', 'G', 'd', 'c', 'b', 'r', 'g']
  
  if (numeroControl.length === 8) {
    const esSoloNumeros = /^\d+$/.test(numeroControl)
    const posicion3Correcta = numeroControl[2] === '1'
    const posicion4Correcta = numeroControl[3] === '5'
    return esSoloNumeros && posicion3Correcta && posicion4Correcta
  }
  
  if (numeroControl.length === 9) {
    const primeraLetraValida = letrasPermitidas.includes(numeroControl[0])
    const restoEsNumeros = /^\d+$/.test(numeroControl.slice(1))
    const posicion3Correcta = numeroControl[3] === '1'
    const posicion4Correcta = numeroControl[4] === '5'
    return primeraLetraValida && restoEsNumeros && posicion3Correcta && posicion4Correcta
  }
  
  return false
}

// ==== Flujo final de contraseña ====
const flowContrasena = addKeyword(EVENTS.ACTION).addAnswer(
  '⏳ Permítenos un momento, vamos a restablecer tu contraseña...',
  null,
  async (ctx, { state, flowDynamic, provider }) => {
    // ⚡ Excluir administrador
    if (ctx.from === CONTACTO_ADMIN) return;

    // Obtener información del usuario
    const myState = (await state.getMyState()) || {}
    const nombreCompleto = myState.nombreCompleto || 'Usuario'
    const numeroControl = myState?.numeroControl || 'Sin matrícula'
    const phone = ctx.from

    // Enviar información al administrador inmediatamente
    const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE RESTABLECIMIENTO* 🔔\n\n📋 *Información del usuario:*\n👤 Nombre: ${nombreCompleto}\n🔢 Número de control: ${numeroControl}\n📞 Teléfono: ${phone}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n\n⚠️ *Proceso en curso...*`
    
    // Enviar al administrador
    enviarAlAdmin(provider, mensajeAdmin).then(success => {
      if (!success) {
        console.log('⚠️ No se pudo enviar al administrador, pero el flujo continúa')
      }
    })

    let minutosRestantes = 5

    // Aviso cada minuto
    const intervalId = setInterval(async () => {
      if (minutosRestantes > 0) {
        await flowDynamic(`⏳ Hola *${nombreCompleto}*, faltan *${minutosRestantes} minutos* para completar el proceso...`)
        minutosRestantes--
      }
    }, 60000)

    // Mensaje final después de 5 minutos
    setTimeout(async () => {
      clearInterval(intervalId)

      try {
        await flowDynamic(`✅ Se restableció correctamente tu contraseña.\nTu nueva contraseña temporal es: *SoporteCC123?*`)
        console.log(`✅ Contraseña enviada correctamente a *${nombreCompleto}* con matrícula *${numeroControl}*`)

        await flowDynamic(
          '🔐 Por seguridad, te recomendamos cambiar esta contraseña al iniciar sesión.\n🔙 Escribe *inicio* si necesitas ayuda adicional.'
        )
        
        // Enviar mensaje de finalización al administrador
        /*
        const mensajeFinal = `✅ *PROCESO COMPLETADO* ✅\n\n👤 Usuario: ${nombreCompleto}\n🔢 Matrícula: ${numeroControl}\n⏰ Finalizado: ${new Date().toLocaleString('es-MX')}\n📞 Teléfono: ${phone}`
        enviarAlAdmin(provider, mensajeFinal).then(success => {
          if (!success) {
            console.log('⚠️ No se pudo enviar finalización al administrador')
          }
        })
        */

      } catch (error) {
        console.error('❌ Error enviando mensaje final:', error.message)
      }

      await state.clear()
    }, 5 * 60000)
  }
)

// ==== Flujo final de autenticador ====
const flowAutenticador = addKeyword(EVENTS.ACTION).addAnswer(
  '⏳ Permítenos un momento, vamos a configurar tu autenticador...',
  null,
  async (ctx, { state, flowDynamic, provider }) => {
    // ⚡ Excluir administrador
    if (ctx.from === CONTACTO_ADMIN) return;

    // Obtener información del usuario
    const myState = (await state.getMyState()) || {}
    const nombreCompleto = myState.nombreCompleto || 'Usuario'
    const numeroControl = myState?.numeroControl || 'Sin matrícula'
    const phone = ctx.from

    // Enviar información al administrador inmediatamente
    const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE AUTENTICADOR* 🔔\n\n📋 *Información del usuario:*\n👤 Nombre: ${nombreCompleto}\n🔢 Número de control: ${numeroControl}\n📞 Teléfono: ${phone}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n\n⚠️ *Proceso en curso...*`
    
    // Enviar al administrador
    enviarAlAdmin(provider, mensajeAdmin).then(success => {
      if (!success) {
        console.log('⚠️ No se pudo enviar al administrador, pero el flujo continúa')
      }
    })

    let minutosRestantes = 5

    // Aviso cada minuto
    const intervalId = setInterval(async () => {
      if (minutosRestantes > 0) {
        await flowDynamic(`⏳ Hola *${nombreCompleto}*, faltan *${minutosRestantes} minutos* para completar la configuración del autenticador...`)
        minutosRestantes--
      }
    }, 60000)

    // Mensaje final después de 5 minutos
    setTimeout(async () => {
      clearInterval(intervalId)

      try {
        await flowDynamic(
          '✅ Se desconfiguró correctamente el autenticador de dos factores, puedes cerrar la pestaña de tu navegador o aplicación móvil y volver a ingresar con tu contraseña'
        )
        console.log(`✅ Autenticador desconfigurado correctamente para *${nombreCompleto}* con matrícula *${numeroControl}*`)

        await flowDynamic(
          '🔐 Por seguridad, te recomendamos configurar un nuevo método de autenticación al iniciar sesión.\n🔙 Escribe *inicio* si necesitas ayuda adicional.'
        )
        
        // Enviar mensaje de finalización al administrador
        /*
        const mensajeFinal = `✅ *AUTENTICADOR CONFIGURADO* ✅\n\n👤 Usuario: ${nombreCompleto}\n🔢 Matrícula: ${numeroControl}\n⏰ Finalizado: ${new Date().toLocaleString('es-MX')}\n📞 Teléfono: ${phone}`
        enviarAlAdmin(provider, mensajeFinal).then(success => {
          if (!success) {
            console.log('⚠️ No se pudo enviar finalización al administrador')
          }
        })
          */

      } catch (error) {
        console.error('❌ Error enviando mensaje final:', error.message)
      }
      await state.clear()
    }, 5 * 60000)
  }
)

// ==== Subflujos para pedir nombre completo ====
const flowNombre = addKeyword(EVENTS.ACTION).addAnswer(
  '📝 Por favor escribe tu *nombre completo*:',
  { capture: true },
  async (ctx, { state, flowDynamic, gotoFlow }) => {
    // ⚡ Excluir administrador
    if (ctx.from === CONTACTO_ADMIN) return;

    if (!isValidText(ctx.body)) {
      await flowDynamic('❌ Solo texto válido. Escribe tu *nombre completo*.')
      return gotoFlow(flowNombre)
    }

    const nombreCompleto = ctx.body.trim()
    if (nombreCompleto.length < 3) {
      await flowDynamic('❌ El nombre parece muy corto. Escribe tu *nombre completo* real.')
      return gotoFlow(flowNombre)
    }

    const myState = (await state.getMyState()) || {}
    const numeroControl = myState.numeroControl

    await flowDynamic(`🙌 Gracias, *${nombreCompleto}*.\n✅ Registramos tu número de control: *${numeroControl}*`)
    await state.update({ nombreCompleto })
    return gotoFlow(flowContrasena)
  }
)

const flowNombreAutenticador = addKeyword(EVENTS.ACTION).addAnswer(
  '📝 Por favor escribe tu *nombre completo*:',
  { capture: true },
  async (ctx, { state, flowDynamic, gotoFlow }) => {
    // ⚡ Excluir administrador
    if (ctx.from === CONTACTO_ADMIN) return;

    if (!isValidText(ctx.body)) {
      await flowDynamic('❌ Solo texto válido. Escribe tu *nombre completo*.')
      return gotoFlow(flowNombreAutenticador)
    }

    const nombreCompleto = ctx.body.trim()
    if (nombreCompleto.length < 3) {
      await flowDynamic('❌ El nombre parece muy corto. Escribe tu *nombre completo* real.')
      return gotoFlow(flowNombreAutenticador)
    }

    const myState = (await state.getMyState()) || {}
    const numeroControl = myState.numeroControl

    await flowDynamic(`🙌 Gracias, *${nombreCompleto}*.\n✅ Registramos tu número de control: *${numeroControl}*`)
    await state.update({ nombreCompleto })
    return gotoFlow(flowAutenticador)
  }
)

// ==== Flujo de restablecimiento de contraseña ====
const flowrestablecercontrase = addKeyword(['restablecer']).addAnswer(
  [
    '📄 Vamos a comenzar a restablecer la contraseña de tu correo institucional',
    '\n🚨 Escribe tu *número de control*.',
    '\n🔙 Escribe *menú* para volver a ver el menú.'
  ],
  { capture: true },
  async (ctx, { flowDynamic, gotoFlow, state }) => {
    // ⚡ Excluir administrador
    if (ctx.from === CONTACTO_ADMIN) return;

    const input = ctx.body.trim().toLowerCase()

    if (input === 'menu' || input === 'menú') {
      return gotoFlow(flowMenu)
    }

    if (!isValidText(input) || !validarNumeroControl(input)) {
      await flowDynamic('❌ Número de control inválido. Intenta de nuevo o escribe *menú* para volver.')
      return
    }

    await state.update({ numeroControl: input })
    await flowDynamic(`✅ Recibimos tu número de control: *${input}*`)
    return gotoFlow(flowNombre)
  }
)

// ==== Flujo de restablecimiento de autenticador ====
const flowrestablecerautenti = addKeyword(['autenticador']).addAnswer(
  [
    '📄 Vamos a comenzar a configurar tu autenticador',
    '\n🚨 Escribe tu *número de control*.',
    '\n🔙 Escribe *menú* para volver a ver el menú.'
  ],
  { capture: true },
  async (ctx, { flowDynamic, gotoFlow, state }) => {
    // ⚡ Excluir administrador
    if (ctx.from === CONTACTO_ADMIN) return;

    const input = ctx.body.trim().toLowerCase()

    if (input === 'menu' || input === 'menú') {
      return gotoFlow(flowMenu)
    }

    if (!isValidText(input) || !validarNumeroControl(input)) {
      await flowDynamic('❌ Número de control inválido. Intenta de nuevo o escribe *menú* para volver.')
      return
    }

    await state.update({ numeroControl: input })
    await flowDynamic(`✅ Recibimos tu número de control: *${input}*`)
    return gotoFlow(flowNombreAutenticador)
  }
)

// ==== Flujo de agradecimiento ====
const flowGracias = addKeyword(EVENTS.ACTION).addAction(
  async (ctx, { flowDynamic }) => {
    // ⚡ Excluir administrador
    if (ctx.from === CONTACTO_ADMIN) return;

    await flowDynamic(
      '🙏 ¡Gracias por comunicarte con el Centro de Cómputo del ITA! 💙\n' +
      'Estamos para ayudarte siempre que lo necesites.\n\n' +
      '🔙 Escribe *menú* si deseas regresar al inicio.'
    )
    console.log('✅ Mensaje de agradecimiento enviada correctamente \n')
  }
)

// ==== Flujo separado para menú ====
const flowMenu = addKeyword(['menu', 'menú', 'Menu', 'Menú', 'MENU', 'MENÚ'])
  .addAction(async (ctx, { flowDynamic }) => {
    // ⚡ Excluir administrador - Solo retornar sin endFlow
    if (ctx.from === CONTACTO_ADMIN) return;

    await flowDynamic(
      '📋 Menú principal:\n' +
      '1️⃣ Restablecer contraseña\n' +
      '2️⃣ Restablecer autenticador\n' +
      '3️⃣ Restablecer contraseña de Moodle\n' +
      '4️⃣ Agradecimiento'
    )
  })
  .addAnswer(
    "Ingresa el número de la opción en la que necesitas apoyo",
    { capture: true },
    async (ctx, { gotoFlow, flowDynamic }) => {
      // ⚡ Excluir administrador
      if (ctx.from === CONTACTO_ADMIN) return;

      const opcion = ctx.body.trim()

      if (!isValidText(opcion) || !['1', '2', '3', '4'].includes(opcion)) {
        await flowDynamic('❌ Opción no válida. Escribe *1*, *2*, *3* o *4*.')
        return
      }

      if (opcion === '1') return gotoFlow(flowrestablecercontrase)
      if (opcion === '2') return gotoFlow(flowrestablecerautenti)
      if (opcion === '3') return gotoFlow(flowDistancia)
      if (opcion === '4') return gotoFlow(flowGracias)
    }
  )

// ==== Flujo de Educación a Distancia ====
const flowDistancia = addKeyword(['Moodle'])
  .addAction(async (ctx, { flowDynamic }) => {
    // ⚡ Excluir administrador - Solo retornar sin endFlow
    if (ctx.from === CONTACTO_ADMIN) return;

    try {
      await flowDynamic([{
        body: '😞 Por el momento no podemos apoyarte con el restablecimiento de contraseña de tu *Moodle*. \n👉 Te invitamos a asistir a *Coordinación de Educación a Distancia*. \n📍 Sus oficinas están en el edificio de *Idiomas* (planta baja), frente a la sala Isóptica, a un costado del elevador. \n\n🔙 Escribe *menú* para regresar al menú principal.',
        media: 'https://raw.githubusercontent.com/CapYAN09/ProyectosITA/main/img/Imagen_de_WhatsApp_2025-09-10_a_las_13.53.25_7b1508b3-removebg-preview.png'
      }])
      console.log('✅ Imagen de Educación a distancia enviada correctamente \n')
    } catch (error) {
      console.error('❌ Error enviando imagen:', error.message)
      await flowDynamic('😞 Por el momento no podemos apoyarte con el restablecimiento de contraseña de tu *Moodle*. \n👉 Te invitamos a asistir a *Coordinación de Educación a Distancia*. \n📍 Sus oficinas están en el edificio de *Idiomas* (planta baja), frente a la sala Isóptica, a un costado del elevador. \n\n🔙 Escribe *menú* para regresar al menú principal.')
    }
  })
  .addAnswer(
    null,
    { capture: true },
    async (ctx, { gotoFlow, flowDynamic }) => {
      // ⚡ Excluir administrador
      if (ctx.from === CONTACTO_ADMIN) return;

      const input = ctx.body.trim().toLowerCase()
      if (input === 'menu' || input === 'menú') {
        return gotoFlow(flowMenu)
      }
      await flowDynamic('❌ Opción no válida. Escribe *menú* para regresar al menú principal.')
    }
  )

// ==== Flujo principal ====
const flowPrincipal = addKeyword(['hola', 'ole', 'alo', 'Hola', 'HOLA', '.', 'Inicio', 'inicio', 'INICIO'])
  .addAction(async (ctx, { flowDynamic }) => {
    // ⚡ EXCLUIR al administrador del flujo normal - Solo retornar
    if (ctx.from === CONTACTO_ADMIN) return;
    
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
      '3️⃣ Restablecer contraseña de Moodle'
    )
  })
  .addAnswer(
    "Ingresa el número de la opción en la que necesitas apoyo",
    { capture: true },
    async (ctx, { gotoFlow, flowDynamic }) => {
      // ⚡ Excluir administrador
      if (ctx.from === CONTACTO_ADMIN) return;

      const opcion = ctx.body.trim()

      if (!isValidText(opcion) || !['1', '2', '3'].includes(opcion)) {
        await flowDynamic('❌ Opción no válida. Escribe *1*, *2* o *3*.')
        return
      }

      if (opcion === '1') return gotoFlow(flowrestablecercontrase)
      if (opcion === '2') return gotoFlow(flowrestablecerautenti)
      if (opcion === '3') return gotoFlow(flowDistancia)
    }
  )

// ==== Flujo para mensajes no entendidos ====
const flowDefault = addKeyword(EVENTS.WELCOME).addAction(async (ctx, { flowDynamic }) => {
  // ⚡ Excluir administrador - Solo retornar
  if (ctx.from === CONTACTO_ADMIN) return;

  await flowDynamic([
    '🤖 No entiendo ese tipo de mensajes.',
    '🔙 Escribe *menú* para ver las opciones disponibles.'
  ])
})

// ==== Inicialización ====
const main = async () => {
  const adapterDB = new MockAdapter()
  
  // ⚡ AGREGAR flowBlockAdmin PRIMERO en la lista
  const adapterFlow = createFlow([
    flowBlockAdmin, // ← ESTE PRIMERO para bloquear admin
    flowPrincipal,
    flowMenu,
    flowrestablecercontrase,
    flowrestablecerautenti,
    flowNombre,
    flowNombreAutenticador,
    flowContrasena,
    flowAutenticador,
    flowDistancia,
    flowGracias,
    flowDefault
  ])

  const adapterProvider = createProvider(BaileysProvider, {
    printQRInTerminal: true,
    logger: {
      level: 'warn'
    }
  })

  createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB
  })

  QRPortalWeb()
}

main()