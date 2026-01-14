const flowGestionServicios = addKeyword(EVENTS.ACTION)
  .addAnswer(
    [
      '👨‍💼 *GESTIÓN DE SERVICIOS - EXCLUSIVO TRABAJADORES* 👨‍💼',
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
    async (ctx: BotContext, { flowDynamic, gotoFlow, state }: any) => {
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

  const flowRestablecimientoSistema = addKeyword(utils.setEvent('RESTABLECIMIENTO_SISTEMA'))
  .addAction(async (ctx: BotContext, { state, flowDynamic, gotoFlow }: any) => {
    const userPhone = ctx.from;

    timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en restablecimiento sistema');
        await flowDynamic('⏱️ Tiempo agotado. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error: any) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);
  })
  .addAnswer(
    '📝 Por favor escribe tu *nombre completo*:',
    { capture: true },
    async (ctx: BotContext, { flowDynamic, gotoFlow, state, provider }: any) => {
      ctx.from = normalizarIdWhatsAppBusiness(ctx.from);
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
      return gotoFlow(flowCapturaDepartamento);
    }
  );

  const flowCapturaDepartamento = addKeyword(utils.setEvent('CAPTURA_DEPARTAMENTO'))
  .addAction(async (ctx: BotContext, { state, flowDynamic, gotoFlow }: any) => {
    const userPhone = ctx.from;

    timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en departamento');
        await flowDynamic('⏱️ Tiempo agotado. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error: any) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);
  })
  .addAnswer(
    '🏢 Por favor escribe el *departamento al que perteneces*:',
    { capture: true },
    async (ctx: BotContext, { flowDynamic, gotoFlow, state, provider }: any) => {
      ctx.from = normalizarIdWhatsAppBusiness(ctx.from);
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

  const flowCapturaUsuarioSistema = addKeyword(utils.setEvent('CAPTURA_USUARIO_SISTEMA'))
  .addAction(async (ctx: BotContext, { state, flowDynamic, gotoFlow }: any) => {
    const userPhone = ctx.from;

    timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en usuario sistema');
        await flowDynamic('⏱️ Tiempo agotado. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error: any) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);
  })
  .addAnswer(
    '👤 Por favor escribe tu *nombre de usuario del sistema* (el que usas para iniciar sesión):',
    { capture: true },
    async (ctx: BotContext, { flowDynamic, gotoFlow, state, provider }: any) => {
      ctx.from = normalizarIdWhatsAppBusiness(ctx.from);
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

      await flowDynamic('🔍 Verificando usuario en el sistema...');

      try {
        if (!conexionRemota) {
          await flowDynamic('❌ Error de conexión a la base de datos. Intenta más tarde.');
          return gotoFlow(flowGestionServicios);
        }

        const queryVerificar = `SELECT id_usuario, usuario, ubicacion FROM usuariosprueba WHERE usuario = ?`;
        const [usuarios] = await conexionRemota.execute<RowDataPacket[]>(queryVerificar, [input]);

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
          '🔄 Generando nueva contraseña segura...'
        ].join('\n'));

      } catch (error: any) {
        console.error('❌ Error verificando usuario:', error.message);
        await flowDynamic('❌ Error al verificar el usuario. Intenta más tarde.');
        return gotoFlow(flowGestionServicios);
      }

      const nuevaContrasena = generarContrasenaSegura();
      console.log(`🔐 Contraseña segura generada para ${input}: ${nuevaContrasena}`);

      await state.update({
        usuarioSistema: input,
        nuevaContrasena: nuevaContrasena
      });

      if (input.toLowerCase() === 'dep_centro_de_computo') {
        console.log('🔍 Ejecutando diagnóstico especial para Dep_centro_de_computo');
        const diagnostico = await diagnosticarDepCentroComputo(input, nuevaContrasena);

        if (!diagnostico) {
          await flowDynamic([
            '⚠️ *Problema detectado con el usuario Dep_centro_de_computo*',
            '',
            'Se detectó un problema al actualizar la contraseña en la base de datos.',
            '',
            '💡 **Solución alternativa:**',
            '1. Usaremos una contraseña pre-encriptada compatible',
            '2. El administrador recibirá instrucciones manuales',
            '',
            '🔒 Tu solicitud será procesada manualmente.'
          ].join('\n'));
        }
      }

      const resultadoActualizacion = await actualizarContrasenaEnusuariospruebaEspecial(
        input,
        nuevaContrasena,
        input.toLowerCase() === 'dep_centro_de_computo',
        ctx.from
      );

      if (!resultadoActualizacion.exito && input.toLowerCase() === 'dep_centro_de_computo') {
        console.log('🔄 Intentando con contraseña pre-encriptada conocida...');

        const contraseñaPreEncriptada = '12345678901';

        const resultadoFallback = await actualizarContrasenaEnusuariospruebaEspecial(
          input,
          contraseñaPreEncriptada,
          true,
          ctx.from
        );

        if (resultadoFallback.exito) {
          await flowDynamic([
            '✅ *Solicitud registrada con solución alternativa*',
            '',
            '📋 **Resumen de tu solicitud:**',
            `👤 Nombre: ${state.nombreCompleto}`,
            `🏢 Departamento: ${state.departamento}`,
            `👤 Usuario: ${input}`,
            `🔐 Contraseña temporal: ${contraseñaPreEncriptada}`,
            `💡 *Nota:* Se usó contraseña pre-encriptada por compatibilidad`,
            `💾 *Estado BD:* ✅ Actualizado`,
            '',
            '⏳ *Por favor espera aproximadamente 30 minutos*'
          ].join('\n'));

          resultadoActualizacion.exito = true;
        }
      }

      const metadataProceso: EstadoMetadata = {
        tipo: "🔐 Restablecimiento de Contraseña de Sistema",
        inicio: Date.now(),
        esTrabajador: true,
        departamento: state.departamento,
        usuarioSistema: input,
        nuevaContrasena: nuevaContrasena,
        resultadoActualizacion: resultadoActualizacion
      };

      await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_PROCESO_LARGO, metadataProceso);

      const mensajeAdmin = `🔔 *RESTABLECIMIENTO DE CONTRASEÑA DE SISTEMA* 🔔\n\n📋 *Información del trabajador:*\n👤 Nombre: ${state.nombreCompleto}\n🏢 Departamento: ${state.departamento}\n👤 Usuario: ${input}\n🔐 *Nueva contraseña:* ${nuevaContrasena}\n📞 Teléfono: ${ctx.from}\n💾 *Estado BD:* ${resultadoActualizacion.exito ? '✅ ACTUALIZADO' : '❌ ERROR'}\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n\n⚠️ *Proceso en curso...*`;

      await enviarAlAdmin(provider, mensajeAdmin);

      await flowDynamic([
        '✅ *Solicitud registrada correctamente*',
        '',
        '📋 **Resumen de tu solicitud:**',
        `👤 Nombre: ${state.nombreCompleto}`,
        `🏢 Departamento: ${state.departamento}`,
        `👤 Usuario: ${input}`,
        `💾 *Estado BD:* ${resultadoActualizacion.exito ? '✅ ACTUALIZADO' : '❌ ERROR - Contactar soporte'}`,
        '',
        resultadoActualizacion.exito
          ? '🎉 *¡Contraseña actualizada exitosamente!*'
          : '⚠️ *Error al actualizar contraseña, contacta a soporte*',
        '',
        '⏳ *Procesando configuración final... (30 minutos)*'
      ].join('\n'));

      if (resultadoActualizacion.exito) {
        let notificacionesEnviadas = 0;
        const maxNotificaciones = 3;

        console.log(`🔔 Iniciando notificaciones para ${ctx.from} - ${state.nombreCompleto}`);

        timeoutManager.setInterval(ctx.from, async () => {
          notificacionesEnviadas++;
          const minutosTranscurridos = notificacionesEnviadas * 10;
          const minutosRestantes = 30 - minutosTranscurridos;

          const estadoActual = await obtenerEstadoMySQL(ctx.from);
          if (!estadoActual || estadoActual.estadoUsuario !== ESTADOS_USUARIO.EN_PROCESO_LARGO) {
            console.log(`⚠️ Usuario ${ctx.from} ya no está en proceso, deteniendo notificaciones`);
            timeoutManager.clearInterval(ctx.from);
            return;
          }

          if (minutosRestantes > 0) {
            try {
              console.log(`🔔 Enviando notificación ${notificacionesEnviadas}/${maxNotificaciones} para ${ctx.from}`);
              await flowDynamic(
                `⏳ Hola *${state.nombreCompleto}*, han pasado *${minutosTranscurridos} minutos*. ` +
                `Faltan *${minutosRestantes} minutos* para completar la configuración...\n\n` +
                `👤 Usuario: ${input}\n` +
                `🏢 Departamento: ${state.departamento}\n` +
                `✅ Contraseña actualizada en sistema\n` +
                `🔄 Configuración en progreso...`
              );

              await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
                ...metadataProceso,
                notificacionesEnviadas: notificacionesEnviadas,
                ultimaNotificacion: Date.now()
              });

            } catch (error: any) {
              console.error('❌ Error enviando notificación:', error.message);
            }
          } else {
            timeoutManager.clearInterval(ctx.from);
          }
        }, 10 * 60 * 1000);

        timeoutManager.setTimeout(ctx.from, async () => {
          timeoutManager.clearInterval(ctx.from);

          try {
            const estadoActual = await state.getMyState();
            if (!estadoActual || estadoActual.estadoUsuario !== ESTADOS_USUARIO.EN_PROCESO_LARGO) {
              console.log('⚠️ Usuario ya no está en proceso, omitiendo mensaje final');
              return;
            }

            console.log(`✅ Enviando mensaje final a ${ctx.from} - ${state.nombreCompleto}`);

            await flowDynamic([
              '🎉 *¡Configuración completada exitosamente!* 🎉',
              '',
              '📋 **Tus credenciales de acceso actualizadas:**',
              `👤 *Usuario:* \`${input}\``,
              `🔐 *Contraseña:* \`${nuevaContrasena}\``,
              `✅ *Estado:* Contraseña actualizada en sistema`,
              '',
              '🔒 **Instrucciones importantes:**',
              '• Esta contraseña es temporal - cámbiala después del primer acceso',
              '• Ya puedes usar tus nuevas credenciales para acceder al sistema',
              '• Guarda estas credenciales en un lugar seguro',
              '',
              '🔙 Escribe *menú* para volver al menú principal.'
            ].join('\n'));

          } catch (error: any) {
            console.error('❌ Error enviando mensaje final:', error.message);
          }

          await limpiarEstado(state);
          await limpiarEstadoMySQL(ctx.from);

        }, 30 * 60 * 1000);
      } else {
        await flowDynamic([
          '❌ *Error en la actualización de contraseña*',
          '',
          '⚠️ No pudimos actualizar tu contraseña en el sistema.',
          'Por favor contacta al centro de cómputo para asistencia:',
          '',
          '📞 **Centro de cómputo:** 449 910 50 02 EXT. 145',
          '',
          '🔙 Escribe *menú* para volver al menú principal.'
        ].join('\n'));

        await limpiarEstado(state);
        return gotoFlow(flowMenu);
      }

      timeoutManager.clearTimeout(ctx.from);
      return gotoFlow(flowBloqueoActivo);
    }
  );

  
const flowNuevoUsuario = addKeyword(utils.setEvent('NUEVO_USUARIO'))
  .addAction(async (ctx: BotContext, { state, flowDynamic, gotoFlow }: any) => {
    const userPhone = ctx.from;

    timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en nuevo usuario');
        await flowDynamic('⏱️ Tiempo agotado. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error: any) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);
  })
  .addAnswer(
    '📝 Por favor escribe tu *nombre completo*:',
    { capture: true },
    async (ctx: BotContext, { flowDynamic, gotoFlow, state, provider }: any) => {
      ctx.from = normalizarIdWhatsAppBusiness(ctx.from);
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

const flowCapturaArea = addKeyword(utils.setEvent('CAPTURA_AREA'))
  .addAction(async (ctx: BotContext, { state, flowDynamic, gotoFlow, provider }: any) => {
    const userPhone = ctx.from;

    timeoutManager.setTimeout(userPhone, async () => {
      try {
        console.log('⏱️ Timeout de 2 minutos en área');
        await flowDynamic('⏱️ Tiempo agotado. Serás redirigido al menú.');
        await limpiarEstado(state);
        return await redirigirAMenuConLimpieza(ctx, state, gotoFlow, flowDynamic);
      } catch (error: any) {
        console.error('❌ Error en timeout de captura:', error);
      }
    }, 2 * 60 * 1000);
  })
  .addAnswer(
    '🏢 Por favor escribe el *área a la que perteneces*:',
    { capture: true },
    async (ctx: BotContext, { flowDynamic, gotoFlow, state, provider }: any) => {
      ctx.from = normalizarIdWhatsAppBusiness(ctx.from);
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

      const myState: EstadoUsuario = await state.getMyState();
      const nombreCompleto = myState.nombreCompleto;
      const userPhone = ctx.from;

      if (!nombreCompleto) {
        await flowDynamic('❌ Error: No tenemos tu nombre completo. Volviendo al inicio.');
        return gotoFlow(flowNuevoUsuario);
      }

      const nuevoUsuario = formatearNombreUsuario(input);
      const nuevaContrasena = generarContrasenaSegura();

      console.log(`🔧 Generando nuevo usuario: ${nuevoUsuario} para ${nombreCompleto}`);
      console.log(`🔐 Contraseña generada: ${nuevaContrasena}`);

      const necesitaEncriptacionEspecial = nuevoUsuario.toLowerCase() === 'dep_centro_de_computo';

      let insercionExitosa: InsertUsuarioResult = { exito: false };

      try {
        console.log(`📝 INSERTANDO DIRECTAMENTE en usuariosprueba: ${nuevoUsuario}`);

        insercionExitosa = await insertarUsuarioDirectoEnusuariosprueba(
          nombreCompleto,
          input,
          nuevoUsuario,
          nuevaContrasena,
          userPhone
        );

        console.log(`✅ Resultado inserción DIRECTA usuariosprueba: ${insercionExitosa.exito ? 'EXITOSA' : 'FALLIDA'}`);

        if (necesitaEncriptacionEspecial && insercionExitosa.exito) {
          console.log('🎯 Usuario especial creado - La contraseña se almacenó encriptada');
        }

      } catch (error: any) {
        console.error('❌ Error insertando DIRECTAMENTE en usuariosprueba:', error.message);
        insercionExitosa = { exito: false };
      }

      const metadataProceso: EstadoMetadata = {
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

      await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_PROCESO_LARGO, metadataProceso);

      const mensajeAdmin = `🔔 *SOLICITUD DE CREACIÓN DE NUEVO USUARIO* 🔔\n\n📋 *Información del trabajador:*\n👤 Nombre: ${nombreCompleto}\n🏢 Área: ${input}\n👤 *Nuevo usuario generado:* ${nuevoUsuario}\n🔐 *Contraseña generada:* ${nuevaContrasena}\n📞 Teléfono: ${userPhone}\n💾 *INSERTADO EN usuariosprueba:* ${insercionExitosa.exito ? '✅ EXITOSO' : '❌ FALLÓ'}\n🏠 *Servidor:* 172.30.247.185\n⏰ Hora: ${new Date().toLocaleString('es-MX')}\n\n⚠️ *Proceso en curso...*`;

      const envioExitoso = await enviarAlAdmin(provider, mensajeAdmin);

      await flowDynamic([
        '✅ *Solicitud registrada correctamente*',
        '',
        '📋 **Resumen de tu solicitud:**',
        `👤 Nombre: ${nombreCompleto}`,
        `🏢 Área: ${input}`,
        `👤 Usuario generado: ${nuevoUsuario}`,
        `💾 *Estado inserción:* ${insercionExitosa.exito ? '✅ EXITOSA - Usuario creado' : '❌ FALLÓ - Contactar soporte'}`,
        '',
        insercionExitosa.exito
          ? '🎉 *¡Usuario creado exitosamente en el sistema!*'
          : '⚠️ *Error al crear usuario, contacta a soporte*',
        '',
        '⏳ *Procesando configuración final... (30 minutos)*'
      ].join('\n'));

      if (insercionExitosa.exito) {
        let notificacionesEnviadas = 0;
        const maxNotificaciones = 3;

        console.log(`🔔 Iniciando notificaciones para ${userPhone} - ${nombreCompleto}`);

        timeoutManager.setInterval(userPhone, async () => {
          notificacionesEnviadas++;
          const minutosTranscurridos = notificacionesEnviadas * 10;
          const minutosRestantes = 30 - minutosTranscurridos;

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

              await actualizarEstado(ctx, state, ESTADOS_USUARIO.EN_PROCESO_LARGO, {
                ...metadataProceso,
                notificacionesEnviadas: notificacionesEnviadas,
                ultimaNotificacion: Date.now()
              });

            } catch (error: any) {
              console.error('❌ Error enviando notificación:', error.message);
            }
          } else {
            timeoutManager.clearInterval(userPhone);
          }
        }, 10 * 60 * 1000);

        timeoutManager.setTimeout(userPhone, async () => {
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

          } catch (error: any) {
            console.error('❌ Error enviando mensaje final:', error.message);
          }

          await limpiarEstado(state);
          await limpiarEstadoMySQL(userPhone);

        }, 30 * 60 * 1000);

      } else {
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
        return gotoFlow(flowMenu);
      }

      timeoutManager.clearTimeout(userPhone);
      return gotoFlow(flowBloqueoActivo);
    }
  );

  // 3. Actualizar contraseña de admin en actextita
async function actualizarContrasenaAdmin(usuario: string, contrasenaSinEncriptar: string): Promise<string | false> {
  try {
    console.log(`🔐 Procesando actualización para admin en actextita: ${usuario}`);
    console.log(`🔐 Contraseña sin encriptar: ${contrasenaSinEncriptar}`);

    if (!conexionActextita) {
      console.error('❌ Error: No hay conexión a actextita');
      return false;
    }

    // 🔐 ENCRIPTAR LA CONTRASEÑA
    const contrasenaEncriptada = encriptarContrasenaParaBD(contrasenaSinEncriptar);

    if (!contrasenaEncriptada) {
      console.error('❌ Error: No se pudo encriptar la contraseña');
      return false;
    }

    console.log(`🔐 Contraseña encriptada para BD: ${contrasenaEncriptada.substring(0, 30)}...`);

    // Verificar que la tabla admins existe
    try {
      const [tablas] = await conexionActextita.execute<RowDataPacket[]>(
        "SHOW TABLES LIKE 'admins'"
      );

      if (tablas.length === 0) {
        console.error('❌ Error: La tabla "admins" no existe en actextita');
        return false;
      }
    } catch (error: any) {
      console.error('❌ Error verificando tabla admins:', error.message);
      return false;
    }

    // Actualizar contraseña
    const [resultado] = await conexionActextita.execute<mysql.ResultSetHeader>(
      'UPDATE admins SET contraseña = ? WHERE usuario = ?',
      [contrasenaEncriptada, usuario]
    );

    console.log(`✅ Resultado actualización en actextita: ${resultado.affectedRows} filas afectadas`);

    if (resultado.affectedRows > 0) {
      console.log(`✅ Contraseña actualizada exitosamente para admin: ${usuario}`);

      // Verificar lo que se guardó
      const [verificacion] = await conexionActextita.execute<RowDataPacket[]>(
        'SELECT contraseña FROM admins WHERE usuario = ?',
        [usuario]
      );

      if (verificacion.length > 0) {
        console.log(`📝 Contraseña guardada en actextita (primeros 30 chars): ${verificacion[0].contraseña.substring(0, 30)}...`);
      }

      // Devolver la contraseña sin encriptar para mostrarla al usuario
      return contrasenaSinEncriptar;
    } else {
      console.log(`⚠️ No se encontró el usuario admin en actextita: ${usuario} o no hubo cambios`);
      return false;
    }

  } catch (error: any) {
    console.error('❌ Error actualizando contraseña de admin en actextita:', error.message);
    console.error('❌ Error stack:', error.stack);
    return false;
  }
}