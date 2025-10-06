const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot')
const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const MockAdapter = require('@bot-whatsapp/database/mock')

// ==== Flujos secundarios ====
const flowSecundario = addKeyword(['2', 'siguiente']).addAnswer([
  '📄 Ingresa *menú* para volver al menú principal'
])

const flowDistancia = addKeyword(['Moodle'])
  .addAction(async (ctx, { flowDynamic }) => {
    try {
      await flowDynamic([{
        body: '😞 Por el momento no podemos apoyarte con el restablecimiento de contraseña de tu *Moodle*. \n👉 Te invitamos a asistir a *Coordinación de Educación a Distancia*. \n📍 Sus oficinas están en el edificio de *Idiomas* (planta baja), frente a la sala Isóptica, a un costado del elevador. \n\n🔙 Escribe *menú* para regresar al menú principal.',
        media: 'https://raw.githubusercontent.com/CapYAN09/ProyectosITA/main/img/Imagen_de_WhatsApp_2025-09-05_a_las_11.03.34_cdb84c7c-removebg-preview.png'
      }])
      console.log('✅ Imagen de Educación a distancia enviada correctamente \n')
    } catch (error) {
      console.error('❌ Error enviando imagen:', error.message)
      await flowDynamic('😞 Por el momento no podemos apoyarte con el restablecimiento de contraseña de tu *Moodle*. \n👉 Te invitamos a asistir a *Coordinación de Educación a Distancia*. \n📍 Sus oficinas están en el edificio de *Idiomas* (planta baja), frente a la sala Isóptica, a un costado del elevador. \n\n🔙 Escribe *menú* para regresar al menú principal.')
    }
  })
  .addAnswer(
    null, // no necesitamos texto extra
    { capture: true },
    async (ctx, { gotoFlow, flowDynamic }) => {
      const input = ctx.body.trim().toLowerCase()
      if (input === 'menu' || input === 'menú') {
        return gotoFlow(flowMenu)
      }
      await flowDynamic('❌ Opción no válida. Escribe *menú* para regresar al menú principal.')
    }
  )

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
  async (ctx, { state, flowDynamic, gotoFlow }) => {
    const myState = (await state.getMyState()) || {}
    const nombreCompleto = myState.nombreCompleto || 'Usuario'
    const numeroControl = myState?.numeroControl || 'Sin matrícula'

    let minutosRestantes = 5

    // Aviso cada minuto
    const intervalId = setInterval(async () => {
      if (minutosRestantes > 0) {
        await flowDynamic(`⏳ Hola *${nombreCompleto}*, faltan *${minutosRestantes} minutos* para completar el proceso...`)
        minutosRestantes--
      }
    }, 60000) // cada 60 segundos

    // Mensaje final después de 5 minutos
    setTimeout(async () => {
      clearInterval(intervalId) // detener los avisos

      try {
        await flowDynamic(`✅ Se restableció correctamente tu contraseña.\nTu nueva contraseña temporal es: *SoporteCC123?*`)
        console.log(`✅ Contraseña enviada correctamente a *${nombreCompleto}* con matrícula *${numeroControl}*`)

        await flowDynamic(
          '🔐 Por seguridad, te recomendamos cambiar esta contraseña al iniciar sesión.\n🔙 Escribe *inicio* si necesitas ayuda adicional.'
        )
        console.log(`✅ Mensaje final enviado correctamente para *${nombreCompleto}*`)
      } catch (error) {
        console.error('❌ Error enviando mensaje final:', error.message)
      }

      await state.clear()
    }, 5 * 60000) // 5 minutos en milisegundos
  }
)

// ==== Flujo final de autenticador con avisos cada minuto ====
const flowAutenticador = addKeyword(EVENTS.ACTION).addAnswer(
  '⏳ Permítenos un momento, vamos a configurar tu autenticador...',
  null,
  async (ctx, { state, flowDynamic, gotoFlow }) => {
    const myState = (await state.getMyState()) || {}
    const nombreCompleto = myState.nombreCompleto || 'Usuario'
    const numeroControl = myState?.numeroControl || 'Sin matrícula'

    let minutosRestantes = 5

    // Aviso cada minuto
    const intervalId = setInterval(async () => {
      if (minutosRestantes > 0) {
        await flowDynamic(`⏳ Hola *${nombreCompleto}*, faltan *${minutosRestantes} minutos* para completar la configuración del autenticador...`)
        minutosRestantes--
      }
    }, 60000) // cada 60 segundos

    // Mensaje final después de 5 minutos
    setTimeout(async () => {
      clearInterval(intervalId) // detener los avisos

      try {
        await flowDynamic(
          '✅ Se desconfiguró correctamente el autenticador de dos factores, puedes cerrar la pestaña de tu navegador o aplicación móvil y volver a ingresar con tu contraseña'
        )
        console.log(`✅ Autenticador desconfigurado correctamente para *${nombreCompleto}* con matrícula *${numeroControl}*`)

        await flowDynamic(
          '🔐 Por seguridad, te recomendamos configurar un nuevo método de autenticación al iniciar sesión.\n🔙 Escribe *inicio* si necesitas ayuda adicional.'
        )
        console.log(`✅ Mensaje final enviado correctamente para *${nombreCompleto}*`)

      } catch (error) {
        console.error('❌ Error enviando mensaje final:', error.message)
      }
      await state.clear()
    }, 5 * 60000) // 5 minutos en milisegundos
  }
)

// ==== Subflujos para pedir nombre completo ====
const flowNombre = addKeyword(EVENTS.ACTION).addAnswer(
  '📝 Por favor escribe tu *nombre completo*:',
  { capture: true },
  async (ctx, { state, flowDynamic, gotoFlow }) => {
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

// ==== Flujo separado para menú (sin bienvenida) ====
// ==== Flujo de agradecimiento ====
const flowGracias = addKeyword(EVENTS.ACTION).addAction(
  async (ctx, { flowDynamic }) => {
    await flowDynamic(
      '🙏 ¡Gracias por comunicarte con el Centro de Cómputo del ITA! 💙\n' +
      'Estamos para ayudarte siempre que lo necesites.\n\n' +
      '🔙 Escribe *menú* si deseas regresar al inicio.'
    )
    console.log('✅ Mensaje de agradecimiento enviado correctamente \n')
  }
)

// ==== Flujo separado para menú (con opción 4) ====
const flowMenu = addKeyword(['menu', 'menú', 'Menu', 'Menú', 'MENU', 'MENÚ']).addAction(
  async (ctx, { flowDynamic }) => {
    await flowDynamic(
      '📋 Menú principal:\n' +
      '1️⃣ Restablecer contraseña\n' +
      '2️⃣ Restablecer autenticador\n' +
      '3️⃣ Restablecer contraseña de Moodle\n' +
      '4️⃣ Agradecimiento'
    )
  }
).addAnswer(
  "Ingresa el número de la opción en la que necesitas apoyo",
  { capture: true },
  async (ctx, { gotoFlow, flowDynamic }) => {
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


// ==== Flujo principal (solo con "hola") ====
const flowPrincipal = addKeyword(['hola', 'ole', 'alo', 'Hola', 'HOLA', '.', 'Inicio', 'inicio', 'INICIO'])
  .addAction(async (ctx, { flowDynamic }) => {
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
    "Ingresa el número de la opción en la que necesitas apoyo", // 👈 ahora sí captura respuesta
    { capture: true },
    async (ctx, { gotoFlow, flowDynamic }) => {
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
  await flowDynamic([
    '🤖 No entiendo ese tipo de mensajes.',
    '🔙 Escribe *menú* para ver las opciones disponibles.'
  ])
})

// ==== Inicialización ====
const main = async () => {
  const adapterDB = new MockAdapter()
  const adapterFlow = createFlow([
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
  printQRInTerminal: true, // sigue mostrando el QR
  logger: {
    level: 'warn' // solo muestra warnings o errores, ignora info/debug
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

/*
// ==== Inicialización ====
const main = async () => {
  const adapterDB = new MockAdapter()
  const adapterFlow = createFlow([
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

  const adapterProvider = createProvider(BaileysProvider)

  const bot = createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB
  })

  // 🔹 Ahora sí, esperamos a que la instancia esté lista
  setTimeout(async () => {
    try {
      const sock = await adapterProvider.getInstance()
      const groups = await sock.groupFetchAllParticipating()
      console.log("📋 Lista de grupos disponibles:")
      Object.values(groups).forEach(g => {
        console.log(`🟢 ${g.subject} -> ${g.id}`)
      })
    } catch (error) {
      console.error("❌ Error obteniendo grupos:", error)
    }
  }, 5000) // le damos 5 segundos para conectar

  QRPortalWeb()
}

main()
*/