const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot')
const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const MockAdapter = require('@bot-whatsapp/database/mock')

// Contacto específico donde se enviará la información
const CONTACTO_ADMIN = '5214494877990@s.whatsapp.net'

// ==== FLUJO INTERCEPTOR GLOBAL (NUEVO) ====
const flowInterceptorGlobal = addKeyword(EVENTS.WELCOME)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow, endFlow }) => {
    // ⚡ Excluir administrador
    if (ctx.from === CONTACTO_ADMIN) return endFlow();
    
    // 🔒 VERIFICAR SI ESTÁ BLOQUEADO - ESTO SE EJECUTA PRIMERO
    const myState = await state.getMyState();
    
    if (myState?.estadoUsuario === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
      const metadata = myState.estadoMetadata || {};
      const tiempoTranscurrido = Date.now() - (metadata.ultimaActualizacion || Date.now());
      const minutosTranscurridos = Math.floor(tiempoTranscurrido / 60000);
      const minutosRestantes = Math.max(0, 30 - minutosTranscurridos);
      
      await flowDynamic([
        '🔒 *Sistema Ocupado* 🔒',
        '',
        `📋 **Proceso en curso:**`,
        `${metadata.tipo || 'Proceso largo'}`,
        '',
        `⏰ **Tiempo restante:** ${minutosRestantes} minutos`,
        '',
        '🔄 **Estamos trabajando en tu petición...**',
        '📱 **Por favor espera a que termine este proceso**',
        '',
        '💡 **Comandos disponibles:**',
        '1️⃣ *estado* - Ver progreso actual',
        //'• *cancelar* - Detener proceso',
        //'• *ayuda* - Mostrar ayuda'
      ].join('\n'));
      
      // 🔄 Redirigir al flujo de bloqueo activo
      return gotoFlow(flowBloqueoActivo);
    }
    
    // Si no está bloqueado, continuar con el flujo normal
    return endFlow();
  });

// ==== Sistema de Estados del Usuario ====
const ESTADOS_USUARIO = {
  LIBRE: 'libre',
  EN_PROCESO_LARGO: 'en_proceso_largo',
  ESPERANDO_DATOS: 'esperando_datos',
  EN_MENU: 'en_menu'
};

// ==== Funciones de Gestión de Estados ====
async function actualizarEstado(state, nuevoEstado, metadata = {}) {
  await state.update({ 
    estadoUsuario: nuevoEstado,
    estadoMetadata: {
      ...metadata,
      ultimaActualizacion: Date.now()
    }
  });
}

// ==== Función de verificación MEJORADA ====
async function verificarEstadoBloqueado(ctx, { state, flowDynamic, gotoFlow }) {
  if (ctx.from === CONTACTO_ADMIN) return false;
  
  const myState = await state.getMyState();
  
  if (myState?.estadoUsuario === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
    const metadata = myState.estadoMetadata || {};
    const tiempoTranscurrido = Date.now() - (metadata.ultimaActualizacion || Date.now());
    const minutosTranscurridos = Math.floor(tiempoTranscurrido / 60000);
    const minutosRestantes = Math.max(0, 30 - minutosTranscurridos);
    
    await flowDynamic([
      '🔒 *Sistema Ocupado* 🔒',
      '',
      `📋 **Proceso en curso:**`,
      `${metadata.tipo || 'Proceso largo'}`,
      '',
      `⏰ **Tiempo restante:** ${minutosRestantes} minutos`,
      '',
      '🔄 **Estamos trabajando en tu petición...**',
      '📱 **Por favor espera a que termine este proceso**',
      '',
      '💡 **Comandos disponibles:**',
      '1️⃣ *estado* - Ver progreso actual',
      //'• *cancelar* - Detener proceso',
      //'• *ayuda* - Mostrar ayuda'
    ].join('\n'));
    
    return true;
  }
  
  return false;
}

async function limpiarEstado(state) {
  const myState = await state.getMyState();
  if (myState?.estadoMetadata?.timeoutId) {
    clearTimeout(myState.estadoMetadata.timeoutId);
  }
  if (myState?.estadoMetadata?.intervalId) {
    clearInterval(myState.estadoMetadata.intervalId);
  }
  await state.update({ 
    estadoUsuario: ESTADOS_USUARIO.LIBRE,
    estadoMetadata: {}
  });
}

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

// ==== Flujo de Bloqueo Activo (NUEVO) ====
const flowBloqueoActivo = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
    if (ctx.from === CONTACTO_ADMIN) return;
    
    const myState = await state.getMyState();
    
    // Si ya no hay proceso activo, liberar al usuario
    if (!myState?.estadoUsuario || myState.estadoUsuario !== ESTADOS_USUARIO.EN_PROCESO_LARGO) {
      await limpiarEstado(state);
      return gotoFlow(flowMenu);
    }

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
      '💡 **Puedes usar estos comandos:**',
      '1️⃣ *estado* - Ver progreso actual',
      //'• *cancelar* - Detener proceso', 
      //'• *ayuda* - Mostrar ayuda'
    ].join('\n'));
  })
  .addAnswer(
    { capture: true },
    async (ctx, { gotoFlow, state, flowDynamic }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      const input = ctx.body.toLowerCase().trim();

      // Procesar comandos especiales
      if (input === 'estado' || input === 'cancelar' || input === 'ayuda') {
        return gotoFlow(flowComandosEspeciales);
      }

      // Cualquier otro mensaje vuelve a mostrar el estado de bloqueo
      return gotoFlow(flowBloqueoActivo);
    }
  );

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

// ==== Flujo final de contraseña (COMPLETO Y CORREGIDO) ====
const flowContrasena = addKeyword(EVENTS.ACTION)
  .addAnswer(
    '⏳ Permítenos un momento, vamos a restablecer tu contraseña... \n\n *Te solicitamos no enviar mensajes en lo que realizamos esté proceso, esté proceso durará aproximadamente 30 minutos.*',
    null,
    async (ctx, { state, flowDynamic, provider }) => {
      // ⚡ Excluir administrador
      if (ctx.from === CONTACTO_ADMIN) return;

      // 🔒 ACTUALIZAR ESTADO - BLOQUEAR USUARIO
      await actualizarEstado(state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
        tipo: "🔐 Restablecimiento de Contraseña",
        inicio: Date.now()
      });

      // Obtener información del usuario
      const myState = (await state.getMyState()) || {}
      const nombreCompleto = myState.nombreCompleto || 'Usuario'
      const numeroControl = myState?.numeroControl || 'Sin matrícula'
      const phone = ctx.from

      // Enviar información al administrador inmediatamente
      const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE RESTABLECIMIENTO DE CONTRASEÑA* 🔔\n\n📋 *Información del usuario:*\n👤 Nombre: ${nombreCompleto}\n🔢 Número de control: ${numeroControl}\n📞 Teléfono: ${phone}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n Contraseña temporal asignada: *SoporteCC1234$*\n\n⚠️Reacciona para validar que está listo`
      
      enviarAlAdmin(provider, mensajeAdmin).then(success => {
        if (!success) {
          console.log('⚠️ No se pudo enviar al administrador, pero el flujo continúa')
        }
      })

      let minutosRestantes = 30

      // Aviso cada 10 minutos
      const intervalId = setInterval(async () => {
        minutosRestantes -= 10;
        if (minutosRestantes > 0) {
          await flowDynamic(`⏳ Hola *${nombreCompleto}*, faltan *${minutosRestantes} minutos* para completar el proceso...`)
        }
      }, 10 * 60000)

      // Guardar ID del intervalo en el estado
      await state.update({ 
        estadoMetadata: {
          ...(await state.getMyState())?.estadoMetadata,
          intervalId: intervalId
        }
      });

      // Mensaje final después de 30 minutos
      const timeoutId = setTimeout(async () => {
        clearInterval(intervalId)

        try {
          await flowDynamic(`✅ Se restableció correctamente tu contraseña.\nTu nueva contraseña temporal es: *SoporteCC1234$*`)
          console.log(`✅ Contraseña enviada correctamente a *${nombreCompleto}* con matrícula *${numeroControl}*`)

          await flowDynamic(
            '*Instrucciones para acceder* \n\n Paso 1.- Cierra la pestaña actual en donde estabas intentando acceder al correo. \n Paso 2.- Ingresa a la página de: https://office.com o en la página: https://login.microsoftonline.com/?whr=tecnm.mx para acceder a tu cuenta institucional. \n Paso 3.- Ingresa tu correo institucional recuerda que es: numero_control@aguascalientes.tecnm.mx \n Paso 4.- Ingresa la contraseña temporal: *SoporteCC1234$*  \n Paso 5.- Una vez que ingreses te va a solicitar que realices el cambio de tu contraseña. En contraseña actual es la contraseña temporal: *SoporteCC1234$* en los siguientes campos vas a generar tu nueva contraseña. \n Con esto terminaríamos el proceso total del cambio de contraseña.'
          )

          await flowDynamic(
            '🔐 Por seguridad, te recomendamos cambiar esta contraseña al iniciar sesión.\n🔙 Escribe *inicio* si necesitas ayuda adicional.'
          )
          
        } catch (error) {
          console.error('❌ Error enviando mensaje final:', error.message)
        }

        // 🔓 LIBERAR ESTADO al finalizar
        await limpiarEstado(state);
        await state.clear()
      }, 30 * 60000)

      // Guardar ID del timeout en el estado
      await state.update({ 
        estadoMetadata: {
          ...(await state.getMyState())?.estadoMetadata,
          timeoutId: timeoutId
        }
      });
    }
  )
  // 🔒🔒🔒 BLOQUEAR COMPLETAMENTE - REDIRIGIR A FLUJO DE BLOQUEO
  .addAnswer(
    { capture: true },
    async (ctx, { gotoFlow }) => {
      if (ctx.from === CONTACTO_ADMIN) return;
      // Redirigir al flujo de bloqueo activo
      return gotoFlow(flowBloqueoActivo);
    }
  )

// ==== Flujo final de autenticador (COMPLETO Y CORREGIDO) ====
const flowAutenticador = addKeyword(EVENTS.ACTION)
  .addAnswer(
    '⏳ Permítenos un momento, vamos a configurar tu autenticador... \n *Te solicitamos no enviar mensajes en lo que realizamos esté proceso, esté proceso durará aproximadamente 30 minutos.*',
    null,
    async (ctx, { state, flowDynamic, provider }) => {
      // ⚡ Excluir administrador
      if (ctx.from === CONTACTO_ADMIN) return;

      // 🔒 ACTUALIZAR ESTADO - BLOQUEAR USUARIO
      await actualizarEstado(state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
        tipo: "🔑 Configuración de Autenticador",
        inicio: Date.now()
      });

      // Obtener información del usuario
      const myState = (await state.getMyState()) || {}
      const nombreCompleto = myState.nombreCompleto || 'Usuario'
      const numeroControl = myState?.numeroControl || 'Sin matrícula'
      const phone = ctx.from

      // Enviar información al administrador inmediatamente
      const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE DESHABILITAR EL AUTENTICADOR* 🔔\n\n📋 *Información del usuario:*\n👤 Nombre: ${nombreCompleto}\n🔢 Número de control: ${numeroControl}\n📞 Teléfono: ${phone}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n\n⚠️ *Proceso en curso...*`
      
      enviarAlAdmin(provider, mensajeAdmin).then(success => {
        if (!success) {
          console.log('⚠️ No se pudo enviar al administrador, pero el flujo continúa')
        }
      })

      let minutosRestantes = 30

      // Aviso cada 10 minutos
      const intervalId = setInterval(async () => {
        minutosRestantes -= 10;
        if (minutosRestantes > 0) {
          await flowDynamic(`⏳ Hola *${nombreCompleto}*, faltan *${minutosRestantes} minutos* para completar la configuración del autenticador...`)
        }
      }, 10 * 60000)

      // Guardar ID del intervalo
      await state.update({ 
        estadoMetadata: {
          ...(await state.getMyState())?.estadoMetadata,
          intervalId: intervalId
        }
      });

      // Mensaje final después de 30 minutos
      const timeoutId = setTimeout(async () => {
        clearInterval(intervalId)

        try {
          await flowDynamic(
            '✅ Se desconfiguró correctamente el autenticador de dos factores'
          )
          console.log(`✅ Autenticador desconfigurado correctamente para *${nombreCompleto}* con matrícula *${numeroControl}*`)

          await flowDynamic(
            '*Es importante que estos pasos lo vayas a realizar en una computadora*\n ya que necesitaras tu celular y tu computadora para poder configurar el autenticador. \n\n Paso 1.- Cierra la pestaña actual en donde estabas intentando acceder al correo. \n Paso 2.- Ingresa a la página de: https://office.com o en la página: https://login.microsoftonline.com/?whr=tecnm.mx para acceder a tu cuenta institucional. \n Paso 3.- Ingresa tu correo institucional recuerda que es: numero_control@aguascalientes.tecnm.mx \n Paso 4.- tu contraseña con la que ingresas normalmente \n Paso 5.- Te va a aparecer una pagina en donde vas a reconfigurar tu autenticador, sigue los pasos que se te mostraran en la pantalla. Necesitaras configurar la aplicación de autenticador y también debes de ingresar un número de teléfono.'
          )
          
          await flowDynamic(
            '🔐 Por seguridad, te recomendamos configurar un nuevo método de autenticación al iniciar sesión.\n🔙 Escribe *inicio* si necesitas ayuda adicional.'
          )
          
        } catch (error) {
          console.error('❌ Error enviando mensaje final:', error.message)
        }
        
        // 🔓 LIBERAR ESTADO al finalizar
        await limpiarEstado(state);
        await state.clear()
      }, 30 * 60000)

      // Guardar ID del timeout
      await state.update({ 
        estadoMetadata: {
          ...(await state.getMyState())?.estadoMetadata,
          timeoutId: timeoutId
        }
      });
    }
  )
  // 🔒🔒🔒 BLOQUEAR COMPLETAMENTE - REDIRIGIR A FLUJO DE BLOQUEO
  .addAnswer(
    { capture: true },
    async (ctx, { gotoFlow }) => {
      if (ctx.from === CONTACTO_ADMIN) return;
      // Redirigir al flujo de bloqueo activo
      return gotoFlow(flowBloqueoActivo);
    }
  )

// ==== Flujo final de SIE (COMPLETO Y CORREGIDO) ====
const flowFinSIE = addKeyword(EVENTS.ACTION)
  .addAnswer(
    '⏳ Permítenos un momento, vamos a actualizar tus datos... \n\n *Te solicitamos no enviar mensajes en lo que realizamos esté proceso, esté proceso durará aproximadamente 30 minutos.*',
    null,
    async (ctx, { state, flowDynamic, provider }) => {
      // ⚡ Excluir administrador
      if (ctx.from === CONTACTO_ADMIN) return;

      // 🔒 ACTUALIZAR ESTADO - BLOQUEAR USUARIO
      await actualizarEstado(state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
        tipo: "📊 Sincronización de Datos SIE",
        inicio: Date.now()
      });

      // Obtener información del usuario
      const myState = (await state.getMyState()) || {}
      const nombreCompleto = myState.nombreCompleto || 'Usuario'
      const numeroControl = myState?.numeroControl || 'Sin matrícula'
      const phone = ctx.from

      // Enviar información al administrador inmediatamente
      const mensajeAdmin = `🔔 *NUEVA SOLICITUD DE SINCRONIZACIÓN DE DATOS*\nNo le aparece el horario ni las materias en el SIE 🔔\n\n📋 *Información del usuario:*\n👤 Nombre: ${nombreCompleto}\n🔢 Número de control: ${numeroControl}\n📞 Teléfono: ${phone}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n\n⚠️Reacciona para validar que está listo`
      
      enviarAlAdmin(provider, mensajeAdmin).then(success => {
        if (!success) {
          console.log('⚠️ No se pudo enviar al administrador, pero el flujo continúa')
        }
      })

      let minutosRestantes = 30

      // Aviso cada 10 minutos
      const intervalId = setInterval(async () => {
        minutosRestantes -= 10;
        if (minutosRestantes > 0) {
          await flowDynamic(`⏳ Hola *${nombreCompleto}*, faltan *${minutosRestantes} minutos* para completar el proceso...`)
        }
      }, 10 * 60000)

      // Guardar ID del intervalo
      await state.update({ 
        estadoMetadata: {
          ...(await state.getMyState())?.estadoMetadata,
          intervalId: intervalId
        }
      });

      // Mensaje final después de 30 minutos
      const timeoutId = setTimeout(async () => {
        clearInterval(intervalId)

        try {
          await flowDynamic(`✅ Se sincronizaron los datos correctamente en tu portal del SIE*`)
          console.log(`✅ Sincronización enviada correctamente a *${nombreCompleto}* con matrícula *${numeroControl}*`)

          await flowDynamic(
            '✅Ingresa nuevamente al portal del SIE y valida tus datos.\n🔙 Escribe *inicio* si necesitas ayuda adicional.'
          )
          
        } catch (error) {
          console.error('❌ Error enviando mensaje final:', error.message)
        }

        // 🔓 LIBERAR ESTADO al finalizar
        await limpiarEstado(state);
        await state.clear()
      }, 30 * 60000)

      // Guardar ID del timeout
      await state.update({ 
        estadoMetadata: {
          ...(await state.getMyState())?.estadoMetadata,
          timeoutId: timeoutId
        }
      });
    }
  )
  // 🔒🔒🔒 BLOQUEAR COMPLETAMENTE - REDIRIGIR A FLUJO DE BLOQUEO
  .addAnswer(
    { capture: true },
    async (ctx, { gotoFlow }) => {
      if (ctx.from === CONTACTO_ADMIN) return;
      // Redirigir al flujo de bloqueo activo
      return gotoFlow(flowBloqueoActivo);
    }
  )

// ==== Flujo de espera para principal ====
const flowEsperaPrincipal = addKeyword(EVENTS.ACTION)
  .addAction(async (_, { state, flowDynamic }) => {
    // Configurar temporizador inmediatamente al entrar al flujo
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
        return gotoFlow(flowMenu);
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
    // Configurar temporizador inmediatamente al entrar al flujo
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
        return gotoFlow(flowMenu);
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
    // Configurar temporizador inmediatamente al entrar al flujo
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
        return gotoFlow(flowMenu);
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
    // Configurar temporizador inmediatamente al entrar al flujo
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
        return gotoFlow(flowMenu);
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
//const flowEsperaMenuDistancia = addKeyword(EVENTS.ACTION)
const flowEsperaMenuDistancia = addKeyword(EVENTS.ACTION)
  .addAction(async (_, { state, flowDynamic }) => {
    // Configurar temporizador inmediatamente al entrar al flujo
    const timeout = setTimeout(async () => {
      console.log('⌛ Tiempo agotado en espera de menú Educación a Distancia.');
      await flowDynamic('⏱️ Tiempo agotado. Por favor inicia el bot nuevamente escribiendo *Hola*.');
      await state.clear(); // ← Esto es importante para limpiar el estado
    }, 5 * 60 * 1000);

    await state.update({ timeoutMenuDistancia: timeout });
  })
  .addAnswer(
    '🔙 Escribe *menú* para regresar al menú principal.',
    { capture: true },
    async (ctx, { gotoFlow, flowDynamic, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      const input = ctx.body.trim().toLowerCase();

      // Validar todas las variantes de "menú" con expresión regular
      if (/^men[uú]$/i.test(input)) {
        clearTimeout(await state.get('timeoutMenuDistancia'));
        await state.clear(); // ← Limpiar estado al salir
        return gotoFlow(flowMenu);
      }

      // Si el usuario escribe "hola", redirigir al flujo principal
      if (input === 'hola') {
        clearTimeout(await state.get('timeoutMenuDistancia'));
        await state.clear(); // ← Limpiar estado
        return gotoFlow(flowPrincipal);
      }

      await flowDynamic('❌ Opción no válida. Escribe *menú* para regresar al menú principal.');
      return gotoFlow(flowEsperaMenuDistancia);
    }
  );

// ==== Flujo de espera para menú principal ====
const flowEsperaMenu = addKeyword(EVENTS.ACTION)
  .addAction(async (_, { state, flowDynamic }) => {
    // Configurar temporizador inmediatamente al entrar al flujo
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
        return gotoFlow(flowMenu);
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

// ==== Flujo de espera para menú SIE ====
const flowEsperaMenuSIE = addKeyword(EVENTS.ACTION)
  .addAction(async (_, { state, flowDynamic }) => {
    // Configurar temporizador inmediatamente al entrar al flujo
    const timeout = setTimeout(async () => {
      console.log('⌛ Tiempo agotado en espera de menú SIE.');
      await flowDynamic('⏱️ Tiempo agotado. Por favor inicia el bot nuevamente escribiendo *Hola*.');
      await state.clear(); // ← Esto es importante para limpiar el estado
    }, 5 * 60 * 1000);

    await state.update({ timeoutMenuSIE: timeout });
  })
  .addAnswer(
    '🔙 Escribe *menú* para regresar al menú principal.',
    { capture: true },
    async (ctx, { gotoFlow, flowDynamic, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      const input = ctx.body.trim().toLowerCase();

      // Validar todas las variantes de "menú" con expresión regular
      if (/^men[uú]$/i.test(input)) {
        clearTimeout(await state.get('timeoutMenuSIE'));
        await state.clear(); // ← Limpiar estado al salir
        return gotoFlow(flowMenu);
      }

      // Si el usuario escribe "hola", redirigir al flujo principal
      if (input === 'hola') {
        clearTimeout(await state.get('timeoutMenuSIE'));
        await state.clear(); // ← Limpiar estado
        return gotoFlow(flowPrincipal);
      }

      await flowDynamic('❌ Opción no válida. Escribe *menú* para regresar al menú principal.');
      return gotoFlow(flowEsperaMenuSIE);
    }
  );

// ==== Flujo de acceso al SIE ====
const flowSIE = addKeyword(['sie']).addAnswer(
  '📚 Acceso al SIE\n' +
  'Por favor selecciona una opción:\n\n' +
  '1️⃣ Restablecer contraseña de acceso\n' +
  '2️⃣ No puedo ver mi horario o calificaciones\n\n' +
  '🔙 Escribe *menú* para volver al menú principal.',
  { capture: true },
  async (ctx, { flowDynamic, gotoFlow }) => {
    if (ctx.from === CONTACTO_ADMIN) return;

    const opcion = ctx.body.trim().toLowerCase();

    // Si el usuario escribe "menú" desde cualquier opción
    if (opcion === 'menu' || opcion === 'menú') {
      return gotoFlow(flowMenu);
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


// ==== Subflujos para pedir nombre completo ====
const flowNombre = addKeyword(EVENTS.ACTION).addAnswer(
  '📝 Por favor escribe tu *nombre completo*:',
  { capture: true },
  async (ctx, { state, flowDynamic, gotoFlow }) => {
    // ⚡ Excluir administrador
    if (ctx.from === CONTACTO_ADMIN) return;

    // Si el usuario no escribe nada
    if (!ctx.body || ctx.body.trim() === '' || ctx.body.length === 0 || ctx.body === "") {
      await flowDynamic('❌ No recibimos tu nombre completo. Por favor escríbelo.')
      return gotoFlow(flowEsperaContrasena)
    }

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

    // Si el usuario no escribe nada
    if (!ctx.body || ctx.body.trim() === '' || ctx.body.length === 0 || ctx.body === "") {
      await flowDynamic('❌ No recibimos tu nombre completo. Por favor escríbelo.')
      return gotoFlow(flowEsperaAutenticador)
    }

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

// 📌 Pedir Nombre Completo para SIE (reutiliza el flujo existente de restablecimiento)
const flowNombreSIE = addKeyword(EVENTS.ACTION).addAnswer(
  '📝 Por favor escribe tu *nombre completo*:',
  { capture: true },
  async (ctx, { state, flowDynamic, gotoFlow }) => {
    if (ctx.from === CONTACTO_ADMIN) return;

    // Si el usuario no escribe nada
    if (!ctx.body || ctx.body.trim() === '' || ctx.body.length === 0 || ctx.body === "") {
      await flowDynamic('❌ No recibimos tu nombre completo. Por favor escríbelo.')
      return gotoFlow(flowEsperaSIE); // ← Redirigir al flujo de espera
    }

    const nombreInput = (ctx.body || '').trim();

    // Validación simple de texto
    if (!isValidText(nombreInput) || !/^[a-zA-ZÁÉÍÓÚÑáéíóúñ\s]+$/.test(nombreInput)) {
      await flowDynamic('❌ Solo texto válido. Escribe tu *nombre completo*.');
      return gotoFlow(flowNombreSIE); // ← Redirigir al flujo de espera
    }

    if (nombreInput.length < 3) {
      await flowDynamic('❌ El nombre parece muy corto. Escribe tu *nombre completo* real.');
      return gotoFlow(flowNombreSIE); // ← Redirigir al flujo de espera
    }

    const myState = (await state.getMyState()) || {};
    const numeroControl = myState.numeroControl || 'Sin matrícula';

    // Guardar nombre y confirmar
    await state.update({ nombreCompleto: nombreInput });

    await flowDynamic(
      `🙌 Gracias, *${nombreInput}*.\n✅ Registramos tu número de control: *${numeroControl}*`
    );

    // Ahora continuamos con el flujo final que ya tienes (restablecimiento):
    // flowContrasena es el flujo que envía al admin y realiza el proceso de 30 minutos
    return gotoFlow(flowFinSIE); //flowFinSIE
  }
);

// ==== Flujo de captura con timeout ====
const flowCapturaNumeroControl = addKeyword(EVENTS.ACTION)
  .addAction(async (_, { state, flowDynamic, gotoFlow }) => {
    // Configurar timeout de 2 minutos
    const timeout = setTimeout(async () => {
      console.log('⏱️ Timeout de 2 minutos en número de control');
      await flowDynamic('⏱️ No recibimos tu número de control. Serás redirigido al menú.');
      // Redirigir directamente al flowMenu
      return gotoFlow(flowMenu);
    }, 2 * 60 * 1000);

    await state.update({ timeoutCaptura: timeout });
  })
  .addAnswer(
    '📝 Por favor escribe tu *número de control*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      // Limpiar timeout
      clearTimeout(await state.get('timeoutCaptura'));

      const input = ctx.body.trim().toLowerCase();

      if (input === 'menu' || input === 'menú') {
        return gotoFlow(flowMenu);
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
      return gotoFlow(flowCapturaNombre);
    }
  );

// ==== Flujo de captura para autenticador ====
const flowCapturaNumeroControlAutenticador = addKeyword(EVENTS.ACTION)
  .addAction(async (_, { state, flowDynamic, gotoFlow }) => {
    const timeout = setTimeout(async () => {
      console.log('⏱️ Timeout de 2 minutos en número de control - autenticador');
      await flowDynamic('⏱️ No recibimos tu número de control. Serás redirigido al menú.');
      // Redirigir directamente al flowMenu
      return gotoFlow(flowMenu);
    }, 2 * 60 * 1000);

    await state.update({ timeoutCaptura: timeout });
  })
  .addAnswer(
    '📝 Por favor escribe tu *número de control*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      clearTimeout(await state.get('timeoutCaptura'));

      const input = ctx.body.trim().toLowerCase();

      if (input === 'menu' || input === 'menú') {
        return gotoFlow(flowMenu);
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
  .addAction(async (_, { state, flowDynamic, gotoFlow }) => {
    const timeout = setTimeout(async () => {
      console.log('⏱️ Timeout de 2 minutos en número de control - SIE');
      await flowDynamic('⏱️ No recibimos tu número de control. Serás redirigido al menú.');
      // Redirigir directamente al flowMenu
      return gotoFlow(flowMenu);
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
        return gotoFlow(flowMenu);
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

// ==== Flujo de captura para nombre (contraseña) ====
const flowCapturaNombre = addKeyword(EVENTS.ACTION)
  .addAction(async (_, { state, flowDynamic, gotoFlow }) => {
    // Configurar timeout de 2 minutos
    const timeout = setTimeout(async () => {
      console.log('⏱️ Timeout de 2 minutos en nombre completo - contraseña');
      await flowDynamic('⏱️ No recibimos tu nombre completo. Serás redirigido al menú.');
      // Redirigir directamente al flowMenu
      return gotoFlow(flowMenu);
    }, 2 * 60 * 1000);

    await state.update({ timeoutCaptura: timeout });
  })
  .addAnswer(
    '📝 Por favor escribe tu *nombre completo*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      // Limpiar timeout
      clearTimeout(await state.get('timeoutCaptura'));

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
      return gotoFlow(flowContrasena);
    }
  );

// ==== Flujo de captura para nombre (autenticador) ====
const flowCapturaNombreAutenticador = addKeyword(EVENTS.ACTION)
  .addAction(async (_, { state, flowDynamic, gotoFlow }) => {
    // Configurar timeout de 2 minutos
    const timeout = setTimeout(async () => {
      console.log('⏱️ Timeout de 2 minutos en nombre completo - autenticador');
      await flowDynamic('⏱️ No recibimos tu nombre completo. Serás redirigido al menú.');
      // Redirigir directamente al flowMenu
      return gotoFlow(flowMenu);
    }, 2 * 60 * 1000);

    await state.update({ timeoutCaptura: timeout });
  })
  .addAnswer(
    '📝 Por favor escribe tu *nombre completo*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      // Limpiar timeout
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
      return gotoFlow(flowAutenticador);
    }
  );

  // ==== Flujo de captura para nombre (SIE) ====
const flowCapturaNombreSIE = addKeyword(EVENTS.ACTION)
  .addAction(async (_, { state, flowDynamic, gotoFlow }) => {
    // Configurar timeout de 2 minutos
    const timeout = setTimeout(async () => {
      console.log('⏱️ Timeout de 2 minutos en nombre completo - SIE');
      await flowDynamic('⏱️ No recibimos tu nombre completo. Serás redirigido al menú.');
      // Redirigir directamente al flowMenu
      return gotoFlow(flowMenu);
    }, 2 * 60 * 1000);

    await state.update({ timeoutCaptura: timeout });
  })
  .addAnswer(
    '📝 Por favor escribe tu *nombre completo*:',
    { capture: true },
    async (ctx, { flowDynamic, gotoFlow, state }) => {
      if (ctx.from === CONTACTO_ADMIN) return;

      // Limpiar timeout
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

// ==== Flujo de restablecimiento de contraseña ====
const flowrestablecercontrase = addKeyword(['restablecer']).addAnswer(
  [
    '📄 Vamos a comenzar a restablecer la contraseña de tu correo institucional',
    '\n🚨 Ahora necesitamos tu número de control para continuar.',
    '\n🔙 Escribe *menú* para volver a ver el menú.'
  ],
  null,
  async (ctx, { gotoFlow }) => {
    if (ctx.from === CONTACTO_ADMIN) return;
    return gotoFlow(flowCapturaNumeroControl);
  }
);

// Modificar flowrestablecerautenti
const flowrestablecerautenti = addKeyword(['autenticador']).addAnswer(
  [
    '📄 Vamos a comenzar a configurar tu autenticador',
    '\n🚨 Ahora necesitamos tu número de control para continuar.',
    '\n🔙 Escribe *menú* para volver a ver el menú.'
  ],
  null,
  async (ctx, { gotoFlow }) => {
    if (ctx.from === CONTACTO_ADMIN) return;
    return gotoFlow(flowCapturaNumeroControlAutenticador);
  }
);

// ==== Flujo de restablecimiento de SIE ====
// Nota: usamos EVENTS.ACTION porque el flujo se llama con gotoFlow desde el menú
// Modificar flowrestablecerSIE
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

// ==== Flujo de Educación a Distancia ====
const flowDistancia = addKeyword(['Moodle'])
  .addAction(async (ctx, { flowDynamic, gotoFlow }) => {
    // ⚡ Excluir administrador - Solo retornar sin endFlow
    if (ctx.from === CONTACTO_ADMIN) return;

    // 🔒 VERIFICAR SI ESTÁ BLOQUEADO
    if (await verificarEstadoBloqueado(ctx, { state, flowDynamic })) {
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
    
    // Redirigir al flujo de espera después de mostrar el mensaje
    return gotoFlow(flowEsperaMenuDistancia);
  });

// ==== Flujo principal (CORREGIDO) ====
const flowPrincipal = addKeyword(['hola', 'ole', 'alo', 'Hola', 'HOLA', '.', 'Inicio', 'inicio', 'INICIO'])
  .addAction(async (ctx, { flowDynamic, state, gotoFlow }) => {
    // ⚡ EXCLUIR al administrador del flujo normal
    if (ctx.from === CONTACTO_ADMIN) return;
    
    // 🔒 VERIFICAR SI ESTÁ BLOQUEADO POR PROCESO
    if (await verificarEstadoBloqueado(ctx, { state, flowDynamic })) {
      return;
    }

    // 🔓 ACTUALIZAR ESTADO A LIBRE/MENÚ
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
      // ⚡ Excluir administrador
      if (ctx.from === CONTACTO_ADMIN) return;

      // 🔒 VERIFICAR SI ESTÁ BLOQUEADO - ESTA ES LA PARTE QUE FALTABA
      if (await verificarEstadoBloqueado(ctx, { state, flowDynamic })) {
        return; // ← Si está bloqueado, NO procesa la opción
      }

      const opcion = ctx.body.trim()

      // Si el usuario escribe un comando especial durante la captura
      if (ctx.body.toLowerCase() === 'estado' || ctx.body.toLowerCase() === 'cancelar' || ctx.body.toLowerCase() === 'ayuda') {
        return gotoFlow(flowComandosEspeciales);
      }

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

// ==== Flujo de menú (CORREGIDO) ====
const flowMenu = addKeyword(['menu', 'menú', 'Menu', 'Menú', 'MENU', 'MENÚ'])
  .addAction(async (ctx, { flowDynamic, state, gotoFlow }) => {
    // ⚡ Excluir administrador
    if (ctx.from === CONTACTO_ADMIN) return;

    // 🔒 VERIFICAR SI ESTÁ BLOQUEADO
    if (await verificarEstadoBloqueado(ctx, { state, flowDynamic })) {
      return;
    }

    // 🔓 ACTUALIZAR ESTADO A MENÚ
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
      // ⚡ Excluir administrador
      if (ctx.from === CONTACTO_ADMIN) return;

      // 🔒 VERIFICAR SI ESTÁ BLOQUEADO - ESTA ES LA PARTE QUE FALTABA
      if (await verificarEstadoBloqueado(ctx, { state, flowDynamic })) {
        return; // ← Si está bloqueado, NO procesa la opción
      }

      // Si el usuario escribe un comando especial durante la captura
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

// ==== Flujo para comandos especiales durante procesos (ACTUALIZADO) ====
const flowComandosEspeciales = addKeyword(['estado', 'cancelar', 'ayuda'])
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
          '🔄 El proceso continúa en segundo plano...'
        ].join('\n'));
      } else {
        await flowDynamic('✅ No tienes procesos activos. Serás redirigido al menú.');
        return gotoFlow(flowMenu);
      }
    }

    if (comando === 'cancelar' && myState?.estadoUsuario === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
      // Limpiar timeouts e intervalos
      await limpiarEstado(state);
      
      await flowDynamic([
        '❌ **Proceso cancelado**',
        '',
        'El proceso ha sido detenido exitosamente.',
        'Ahora puedes seleccionar una nueva opción del menú.',
        '',
        '💡 Escribe *menú* para ver las opciones disponibles'
      ].join('\n'));
      
      return gotoFlow(flowMenu);
    }

    if (comando === 'ayuda') {
      await flowDynamic([
        'ℹ️ **Comandos Disponibles Durante Procesos**',
        '',
        '• *estado* - Ver el progreso del proceso actual',
        '• *cancelar* - Detener el proceso en curso', 
        '• *ayuda* - Mostrar esta información',
        '',
        '🔒 Mientras el proceso esté activo, no podrás usar el menú principal.',
        '⏳ Los procesos toman aproximadamente 30 minutos.'
      ].join('\n'));
    }
    
    // 🔄 SIEMPRE regresar al bloqueo activo si hay proceso en curso
    if (myState?.estadoUsuario === ESTADOS_USUARIO.EN_PROCESO_LARGO) {
      return gotoFlow(flowBloqueoActivo);
    }
    
    return gotoFlow(flowMenu);
  });

// ==== Flujo para mensajes no entendidos (MODIFICADO) ====
const flowDefault = addKeyword(EVENTS.WELCOME).addAction(async (ctx, { flowDynamic, state, gotoFlow }) => {
  // ⚡ Excluir administrador
  if (ctx.from === CONTACTO_ADMIN) return;

  // 🔒 VERIFICAR SI ESTÁ BLOQUEADO
  if (await verificarEstadoBloqueado(ctx, { state, flowDynamic })) {
    return;
  }

  await flowDynamic([
    '🤖 No entiendo ese tipo de mensajes.',
    '',
    '💡 **Comandos disponibles:**',
    '• *menú* - Ver opciones principales',
    '• *estado* - Ver progreso de procesos',
    //'• *ayuda* - Mostrar ayuda',
    '',
    '🔙 Escribe *menú* para ver las opciones disponibles.'
  ])
});

// ==== Inicialización ====
const main = async () => {
  const adapterDB = new MockAdapter()
  
  // ⚡ ORDEN CORREGIDO - flowInterceptorGlobal DEBE ESTAR EN SEGUNDO LUGAR
  const adapterFlow = createFlow([
    flowBlockAdmin,           // ← 1. Bloquear admin
    flowInterceptorGlobal,    // ← 2. Interceptor global (VERIFICA BLOQUEO PRIMERO)
    flowComandosEspeciales,   // ← 3. Comandos especiales
    flowPrincipal,            // ← 4. Flujo principal
    flowMenu,                 // ← 5. Menú
    flowBloqueoActivo,        // ← 6. Bloqueo activo
    flowrestablecercontrase,
    flowrestablecerautenti,
    flowNombre,
    flowNombreAutenticador,
    flowContrasena,
    flowAutenticador,
    flowDistancia,        
    flowGracias,
    flowSIE,
    flowrestablecerSIE,    
    flowNombreSIE,
    flowEsperaMenuSIE,     
    flowEsperaContrasena,   
    flowEsperaAutenticador,  
    flowEsperaMenuDistancia, 
    flowCapturaNumeroControl,
    flowCapturaNumeroControlAutenticador, 
    flowCapturaNumeroControlSIE,
    flowEsperaMenu,
    flowEsperaSIE,
    flowEsperaPrincipal,
    flowFinSIE,
    flowCapturaNombre,
    flowCapturaNombreAutenticador,
    flowCapturaNombreSIE,
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