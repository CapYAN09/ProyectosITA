const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot')
const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const MockAdapter = require('@bot-whatsapp/database/mock')

// ==== Flujos secundarios ====
const flowSecundario = addKeyword(['2', 'siguiente']).addAnswer([
  '📄 Ingresa Menú para volver al menu principal'
])

const flowTuto = addKeyword(['tutorial']).addAnswer(
  [
    '🙌 Aquí encuentras un ejemplo rápido:',
    'https://bot-whatsapp.netlify.app/docs/example/',
    '\n👉 Escribe *menu* para volver al inicio.'
  ],
  null,
  null,
  [flowSecundario]
)

// Función para validar si es texto válido
function isValidText(input) {
  if (!input || typeof input !== 'string') return false
  if (input.trim().length === 0) return false
  if (input.includes('sticker') || input.includes('image') || input.includes('video')) return false
  return true
}

// Función para validar número de control (ACTUALIZADA)
function validarNumeroControl(numeroControl) {
  const letrasPermitidas = ['D', 'C', 'B', 'R', 'G', 'd', 'c', 'b', 'r', 'g']
  
  // Caso 1: 8 caracteres (solo números)
  if (numeroControl.length === 8) {
    const esSoloNumeros = /^\d+$/.test(numeroControl)
    const posicion3Correcta = numeroControl[2] === '1'
    const posicion4Correcta = numeroControl[3] === '5'
    
    return esSoloNumeros && posicion3Correcta && posicion4Correcta
  }
  
  // Caso 2: 9 caracteres (letra permitida + 8 números)
  if (numeroControl.length === 9) {
    const primeraLetraValida = letrasPermitidas.includes(numeroControl[0])
    const restoEsNumeros = /^\d+$/.test(numeroControl.slice(1))
    const posicion3Correcta = numeroControl[3] === '1' // Ahora posición 3 considerando la letra
    const posicion4Correcta = numeroControl[4] === '5' // Ahora posición 4 considerando la letra
    
    return primeraLetraValida && restoEsNumeros && posicion3Correcta && posicion4Correcta
  }
  
  return false
}

// ==== Flujo final que muestra la contraseña después del tiempo ====
const flowContrasena = addKeyword(EVENTS.ACTION).addAnswer(
  '⏳ Permítenos un momento, vamos a restablecer tu contraseña...',
  null,
  async (ctx, { state, flowDynamic }) => {
    const myState = (await state.getMyState()) || {}
    const nombreCompleto = myState.nombreCompleto
    const numeroControl = myState.numeroControl

    // Programar envío de contraseña después de 1 minuto
    setTimeout(async () => {
      try {
        await flowDynamic('✅ Se restableció correctamente tu contraseña.\nTu nueva contraseña temporal es: *SoporteCC123?*')
        await flowDynamic('🔐 Por seguridad, te recomendamos cambiar esta contraseña al iniciar sesión.\nEscribe *menu* si necesitas ayuda adicional.')
        console.log('✅ Mensaje diferido enviado correctamente')
      } catch (error) {
        console.error('Error enviando mensaje diferido con flowDynamic:', error.message)
      }
    }, 60000)

    await state.clear()
  }
)

// ==== Flujo final para autenticador ====
const flowAutenticador = addKeyword(EVENTS.ACTION).addAnswer(
  '⏳ Permítenos un momento, vamos a configurar tu autenticador...',
  null,
  async (ctx, { state, flowDynamic }) => {
    const myState = (await state.getMyState()) || {}
    const nombreCompleto = myState.nombreCompleto
    const numeroControl = myState.numeroControl

    // Programar envío de configuración después de 1 minuto
    setTimeout(async () => {
      try {
        await flowDynamic('✅ Se desconfiguró correctamente el autenticador de dos factores, puedes cerrar la pestaña de tu navegador o aplicación móvil y volver a ingresar con tú contraseña')
        await flowDynamic('🔐 Por seguridad, te recomendamos configurar un nuevo método de autenticación al iniciar sesión. (Esté lo podras configurar al iniciar sesión a tu cuenta nuevamente)\nEscribe *menú* si necesitas ayuda adicional.')
        console.log('✅ Mensaje diferido para autenticador enviado correctamente')
      } catch (error) {
        console.error('Error enviando mensaje diferido con flowDynamic:', error.message)
      }
    }, 60000)

    await state.clear()
  }
)

// ==== Subflujo para pedir nombre completo (contraseña) ====
const flowNombre = addKeyword(EVENTS.ACTION).addAnswer(
  '📝 Por favor escribe tu *nombre completo*:',
  { capture: true },
  async (ctx, { state, flowDynamic, gotoFlow }) => {
    if (!isValidText(ctx.body)) {
      await flowDynamic('❌ No puedo procesar stickers, imágenes u otros archivos. Por favor escribe tu *nombre completo* con texto.')
      return gotoFlow(flowNombre)
    }

    const nombreCompleto = ctx.body.trim()
    
    if (nombreCompleto.length < 3) {
      await flowDynamic('❌ El nombre parece muy corto. Por favor escribe tu *nombre completo* real.')
      return gotoFlow(flowNombre)
    }

    const myState = (await state.getMyState()) || {}
    const numeroControl = myState.numeroControl

    await flowDynamic(`🙌 Gracias, *${nombreCompleto}*.\n✅ Registramos tu número de control: *${numeroControl}*`)
    
    // Guardar el nombre en el estado y pasar al flujo de contraseña
    await state.update({ nombreCompleto })
    return gotoFlow(flowContrasena)
  }
)

// ==== Subflujo para pedir nombre completo (autenticador) ====
const flowNombreAutenticador = addKeyword(EVENTS.ACTION).addAnswer(
  '📝 Por favor escribe tu *nombre completo*:',
  { capture: true },
  async (ctx, { state, flowDynamic, gotoFlow }) => {
    if (!isValidText(ctx.body)) {
      await flowDynamic('❌ No puedo procesar stickers, imágenes u otros archivos. Por favor escribe tu *nombre completo* con texto.')
      return gotoFlow(flowNombreAutenticador)
    }

    const nombreCompleto = ctx.body.trim()
    
    if (nombreCompleto.length < 3) {
      await flowDynamic('❌ El nombre parece muy corto. Por favor escribe tu *nombre completo* real.')
      return gotoFlow(flowNombreAutenticador)
    }

    const myState = (await state.getMyState()) || {}
    const numeroControl = myState.numeroControl

    await flowDynamic(`🙌 Gracias, *${nombreCompleto}*.\n✅ Registramos tu número de control: *${numeroControl}*`)
    
    // Guardar el nombre en el estado y pasar al flujo de autenticador
    await state.update({ nombreCompleto })
    return gotoFlow(flowAutenticador)
  }
)

// ==== Flujo de restablecimiento de contraseña ====
const flowrestablecercontrase = addKeyword(['restablecer']).addAnswer(
  [
    '📄 Vamos a comenzar a restablecer la contraseña de tu correo institucional',
    '\n🚨 Para ello apóyanos compartiéndonos tu *número de control*.',
    '\n👉 Escribe *menú* para volver al inicio.'
  ],
  { capture: true },
  async (ctx, { flowDynamic, gotoFlow, state }) => {
    if (!isValidText(ctx.body)) {
      await flowDynamic('❌ No puedo procesar stickers, imágenes u otros archivos. Por favor escribe tu *número de control* con texto.')
      return gotoFlow(flowrestablecercontrase)
    }

    const numeroControl = ctx.body.trim()

    // Validación actualizada
    if (!validarNumeroControl(numeroControl)) {
      await flowDynamic(
        '❌ No podemos validar tu número de control. Debe ser:\n\n' +
        '• 8 dígitos: El 3ro debe ser "1" y el 4to "5" (ej: 00150000)\n' +
        '• 9 caracteres: Comenzar con D,C,B,R,G (ej: D0150000)\n\n' +
        'Por favor intenta de nuevo.'
      )
      return gotoFlow(flowrestablecercontrase)
    }

    await state.update({ numeroControl })
    await flowDynamic(`✅ Recibimos tu número de control: *${numeroControl}*`)
    return gotoFlow(flowNombre)
  }
)

// ==== Flujo de restablecimiento de autenticador ====
const flowrestablecerautenti = addKeyword(['autenticador']).addAnswer(
  [
    '📄 Vamos a comenzar a configurar tu autenticador para el correo institucional',
    '\n🚨 Para ello apóyanos compartiéndonos tu *número de control*.',
    '\n👉 Escribe *menú* para volver al inicio.'
  ],
  { capture: true },
  async (ctx, { flowDynamic, gotoFlow, state }) => {
    if (!isValidText(ctx.body)) {
      await flowDynamic('❌ No puedo procesar stickers, imágenes u otros archivos. Por favor escribe tu *número de control* con texto.')
      return gotoFlow(flowrestablecerautenti)
    }

    const numeroControl = ctx.body.trim()

    // Validación actualizada
    if (!validarNumeroControl(numeroControl)) {
      await flowDynamic(
        '❌ No podemos validar tu número de control. Debe ser:\n\n' +
        '• 8 dígitos: El 3ro debe ser "1" y el 4to "5" (ej: 00150000)\n' +
        '• 9 caracteres: Comenzar con D,C,B,R,G (ej: D0150000)\n\n' +
        'Por favor intenta de nuevo.'
      )
      return gotoFlow(flowrestablecerautenti)
    }

    await state.update({ numeroControl })
    await flowDynamic(`✅ Recibimos tu número de control: *${numeroControl}*`)
    return gotoFlow(flowNombreAutenticador)
  }
)

// ==== Flujo principal con menú numérico ====
const flowPrincipal = addKeyword(['hola', 'ole', 'alo', 'Hola', 'menu', 'Menu', '.', 'Menú', 'menú', '.', 'MENU', 'MENÚ'])
  .addAnswer('🙌 Hola, bienvenido a este *Chatbot* de Centro de Cómputo del ITA')
  .addAnswer(
    [
      'Por favor elige una de las siguientes opciones respondiendo con el número:',
      '\n1️⃣ Restablecer contraseña del correo institucional',
      '\n2️⃣ Restablecer configuración de autenticador de correo institucional',
    ],
    { capture: true },
    async (ctx, { gotoFlow, flowDynamic }) => {
      if (!isValidText(ctx.body)) {
        await flowDynamic('❌ No puedo procesar stickers, imágenes u otros archivos. Por favor elige una opción con el número correspondiente.')
        return gotoFlow(flowPrincipal)
      }

      const opcion = ctx.body.trim()
      
      if (!['1', '2'].includes(opcion)) {
        await flowDynamic('❌ Opción no válida. Por favor elige *1* para restablecer contraseña o *2* para autenticador.')
        return gotoFlow(flowPrincipal)
      }

      if (opcion === '1') return gotoFlow(flowrestablecercontrase)
      if (opcion === '2') return gotoFlow(flowrestablecerautenti)
    }
  )

// Flujo para manejar mensajes no entendidos
const flowDefault = addKeyword(EVENTS.WELCOME)
  .addAnswer('🤖 ¡Hola! Soy el asistente virtual del Centro de Cómputo del ITA')
  .addAnswer([
    'No entiendo ese tipo de mensajes (stickers, imágenes, archivos).',
    'Por favor escribe *menú* para ver las opciones disponibles.'
  ])

// ==== Inicialización ====
const main = async () => {
  const adapterDB = new MockAdapter()
  const adapterFlow = createFlow([
    flowPrincipal,
    flowrestablecercontrase,
    flowrestablecerautenti,
    flowNombre,
    flowNombreAutenticador,
    flowContrasena,
    flowAutenticador,
    flowTuto,
    flowDefault
  ])

  const adapterProvider = createProvider(BaileysProvider)

  createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB
  })

  QRPortalWeb()
}

main()

/*
const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot')
const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const MockAdapter = require('@bot-whatsapp/database/mock')

// ==== Flujos secundarios ====
const flowSecundario = addKeyword(['2', 'siguiente']).addAnswer([
  '📄 Ingresa *Menú* para volver al menu principal'
])

const flowTuto = addKeyword(['tutorial']).addAnswer(
  [
    '🙌 Aquí encuentras un ejemplo rápido:',
    'https://bot-whatsapp.netlify.app/docs/example/',
    '\n👉 Escribe *menu* para volver al inicio.'
  ],
  null,
  null,
  [flowSecundario]
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
  async (ctx, { state, flowDynamic }) => {
    setTimeout(async () => {
      try {
        await flowDynamic('✅ Se restableció correctamente tu contraseña.\nTu nueva contraseña temporal es: *SoporteCC123?*')
        await flowDynamic('🔐 Por seguridad, te recomendamos cambiar esta contraseña al iniciar sesión.\nEscribe *menu* si necesitas ayuda adicional.')
        console.log('✅ Mensaje diferido enviado correctamente')
      } catch (error) {
        console.error('Error enviando mensaje diferido con flowDynamic:', error.message)
      }
    }, 60000)

    await state.clear()
  }
)

// ==== Flujo final de autenticador ====
const flowAutenticador = addKeyword(EVENTS.ACTION).addAnswer(
  '⏳ Permítenos un momento, vamos a configurar tu autenticador...',
  null,
  async (ctx, { state, flowDynamic }) => {
    setTimeout(async () => {
      try {
        await flowDynamic('✅ Se desconfiguró correctamente el autenticador de dos factores, puedes cerrar la pestaña de tu navegador o aplicación móvil y volver a ingresar con tu contraseña')
        await flowDynamic('🔐 Por seguridad, te recomendamos configurar un nuevo método de autenticación al iniciar sesión.\nEscribe *menú* si necesitas ayuda adicional.')
        console.log('✅ Mensaje diferido para autenticador enviado correctamente')
      } catch (error) {
        console.error('Error enviando mensaje diferido con flowDynamic:', error.message)
      }
    }, 60000)

    await state.clear()
  }
)

// ==== Subflujos para pedir nombre completo ====
const flowNombre = addKeyword(EVENTS.ACTION).addAnswer(
  '📝 Por favor escribe tu *nombre completo*:',
  { capture: true },
  async (ctx, { state, flowDynamic, gotoFlow }) => {
    if (!isValidText(ctx.body)) {
      await flowDynamic('❌ No puedo procesar stickers, imágenes u otros archivos. Por favor escribe tu *nombre completo* con texto.')
      return gotoFlow(flowNombre)
    }

    const nombreCompleto = ctx.body.trim()
    if (nombreCompleto.length < 3) {
      await flowDynamic('❌ El nombre parece muy corto. Por favor escribe tu *nombre completo* real.')
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
      await flowDynamic('❌ No puedo procesar stickers, imágenes u otros archivos. Por favor escribe tu *nombre completo* con texto.')
      return gotoFlow(flowNombreAutenticador)
    }

    const nombreCompleto = ctx.body.trim()
    if (nombreCompleto.length < 3) {
      await flowDynamic('❌ El nombre parece muy corto. Por favor escribe tu *nombre completo* real.')
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
    '\n🚨 Para ello apóyanos compartiéndonos tu *número de control*.',
    '\n👉 Escribe *menú* para volver al inicio.'
  ],
  { capture: true },
  async (ctx, { flowDynamic, gotoFlow, state }) => {
    const input = ctx.body.trim().toLowerCase()

    // Si el usuario escribe "menú", regresar al flujo principal
    if (input === 'menu' || input === 'menú') {
      return gotoFlow(flowPrincipal)
    }

    if (!isValidText(input) || !validarNumeroControl(input)) {
      await flowDynamic('❌ Número de control inválido. Debe cumplir con los formatos correctos. Intenta de nuevo o escribe *menú* para volver.')
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
    '📄 Vamos a comenzar a configurar tu autenticador para el correo institucional',
    '\n🚨 Para ello apóyanos compartiéndonos tu *número de control*. ',
    '\n👉 Escribe *menú* para volver al inicio.'
  ],
  { capture: true },
  async (ctx, { flowDynamic, gotoFlow, state }) => {
    const input = ctx.body.trim().toLowerCase()

    // Interceptamos "menú"
    if (input === 'menu' || input === 'menú') {
      return gotoFlow(flowPrincipal)
    }

    if (!isValidText(input) || !validarNumeroControl(input)) {
      await flowDynamic('❌ Número de control inválido. Debe cumplir con los formatos correctos. Intenta de nuevo o escribe *menú* para volver.')
      return
    }

    await state.update({ numeroControl: input })
    await flowDynamic(`✅ Recibimos tu número de control: *${input}*`)
    return gotoFlow(flowNombreAutenticador)
  }
)

// ==== Flujo principal con menú numérico ====
const flowPrincipal = addKeyword(['hola', 'ole', 'alo', 'Hola', 'menu', 'Menu', 'Menú', 'menú', 'MENU', 'MENÚ', '.'])
  .addAction(async (ctx, { flowDynamic }) => {
    try {
      await flowDynamic([{
        body: '🎉 ¡Bienvenido al Centro de Cómputo del ITA!',
        media: 'https://raw.githubusercontent.com/CapYAN09/ProyectosITA/main/img/0b69c0d0892fa7600e9cc3ba44359b23-removebg-preview.png'
      }])
      console.log('✅ Imagen de bienvenida enviada correctamente')
    } catch (error) {
      console.error('❌ Error enviando imagen:', error.message)
      await flowDynamic('🎉 ¡Bienvenido al *AguiBot* del ITA!')
    }

    await flowDynamic('🙌 Hola, bienvenido al *Nido de AguiBot* de Centro de Cómputo')
  })
  .addAnswer(
    [
      'Por favor elige una de las siguientes opciones respondiendo con el número:',
      '\n1️⃣ Restablecer contraseña del correo institucional',
      '\n2️⃣ Restablecer configuración de autenticador del correo institucional',
    ],
    { capture: true },
    async (ctx, { gotoFlow, flowDynamic }) => {
      const opcion = ctx.body.trim()

      if (!isValidText(opcion) || !['1', '2'].includes(opcion)) {
        await flowDynamic('❌ Opción no válida. Escribe *1* para restablecer contraseña o *2* para autenticador.')
        await flowDynamic([
          'Por favor elige una opción:',
          '\n1️⃣ Restablecer contraseña',
          '\n2️⃣ Restablecer autenticador'
        ])
        return
      }

      if (opcion === '1') return gotoFlow(flowrestablecercontrase)
      if (opcion === '2') return gotoFlow(flowrestablecerautenti)
    }
  )

// ==== Flujo para mensajes no entendidos ====
const flowDefault = addKeyword(EVENTS.WELCOME)
  .addAction(async (ctx, { flowDynamic }) => {
    await flowDynamic([
      '🤖 No entiendo ese tipo de mensajes (stickers, imágenes, archivos).',
      'Por favor escribe *menú* para ver las opciones disponibles.'
    ])
  })

// ==== Inicialización ====
const main = async () => {
  const adapterDB = new MockAdapter()
  const adapterFlow = createFlow([
    flowPrincipal,
    flowrestablecercontrase,
    flowrestablecerautenti,
    flowNombre,
    flowNombreAutenticador,
    flowContrasena,
    flowAutenticador,
    flowTuto,
    flowDefault
  ])

  const adapterProvider = createProvider(BaileysProvider)

  createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB
  })

  QRPortalWeb()
}

main()
*/