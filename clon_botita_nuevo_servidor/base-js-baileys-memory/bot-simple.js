// bot-working.js
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import QRCode from 'qrcode-terminal'
import qrcode from 'qrcode'
import fs from 'fs'
import path from 'path'

// Configuración
const authFolder = './auth'

// Limpiar archivos anteriores
function limpiarArchivosAnteriores() {
  console.log('🧹 Limpiando archivos anteriores...')
  
  // Lista de archivos a eliminar
  const archivos = ['bot.qr.png', 'bot.qr.txt', 'baileys.log']
  
  archivos.forEach(file => {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file)
        console.log(`✅ Eliminado: ${file}`)
      } catch (err) {
        console.log(`⚠️ No se pudo eliminar ${file}: ${err.message}`)
      }
    }
  })
  
  // Eliminar carpeta auth si existe
  if (fs.existsSync(authFolder)) {
    try {
      fs.rmSync(authFolder, { recursive: true, force: true })
      console.log('✅ Eliminada carpeta de autenticación anterior')
    } catch (err) {
      console.log(`⚠️ No se pudo eliminar carpeta auth: ${err.message}`)
    }
  }
  
  // Crear carpeta auth
  try {
    fs.mkdirSync(authFolder, { recursive: true })
  } catch (err) {
    console.log(`⚠️ No se pudo crear carpeta auth: ${err.message}`)
  }
}

// Guardar QR como imagen
async function guardarQRComoImagen(qrCode) {
  try {
    console.log('🖼️ Generando imagen QR...')
    
    // Opciones para el QR
    const qrOptions = {
      color: {
        dark: '#000000',    // Puntos oscuros
        light: '#FFFFFF'    // Fondo blanco
      },
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'H' // Alta corrección de errores
    }
    
    // Guardar como PNG
    await qrcode.toFile('bot.qr.png', qrCode, qrOptions)
    
    // Guardar como texto
    fs.writeFileSync('bot.qr.txt', qrCode)
    
    const rutaAbsoluta = path.resolve('bot.qr.png')
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ ARCHIVOS QR GENERADOS EXITOSAMENTE')
    console.log('='.repeat(60))
    console.log(`📁 IMAGEN: ${rutaAbsoluta}`)
    console.log(`📄 TEXTO:  ${path.resolve('bot.qr.txt')}`)
    console.log('='.repeat(60) + '\n')
    
    return true
    
  } catch (error) {
    console.error('❌ Error generando archivos QR:', error.message)
    return false
  }
}

// Mostrar instrucciones
function mostrarInstrucciones() {
  console.log('\n' + '═'.repeat(60))
  console.log('📱 PASOS PARA CONECTAR WHATSAPP')
  console.log('═'.repeat(60))
  console.log('\n1. 📲 Abre WhatsApp en tu CELULAR')
  console.log('2. ⋯ Toca los 3 puntos (menú)')
  console.log('3. 🔗 Selecciona "Dispositivos vinculados"')
  console.log('4. ➕ Toca "Vincular un dispositivo"')
  console.log('5. 📷 ESCANEA el código QR de arriba')
  console.log('\n💡 CONSEJOS:')
  console.log('   • Usa la cámara de tu celular')
  console.log('   • Asegúrate de que el QR sea visible')
  console.log('   • El archivo "bot.qr.png" está listo para usar')
  console.log('═'.repeat(60) + '\n')
}

// Crear conexión a WhatsApp
async function crearConexionWhatsApp() {
  try {
    // Obtener estado de autenticación
    const { state, saveCreds } = await useMultiFileAuthState(authFolder)
    
    // Configuración del socket
    const socketConfig = {
      auth: state,
      printQRInTerminal: false, // Lo manejamos nosotros
      syncFullHistory: false,
      markOnlineOnConnect: true
    }
    
    // Crear socket
    const sock = makeWASocket(socketConfig)
    
    return { sock, saveCreds }
    
  } catch (error) {
    console.error('❌ Error creando conexión:', error.message)
    throw error
  }
}

// Conectar a WhatsApp
async function conectarWhatsApp() {
  console.log('🔌 Conectando a WhatsApp...')
  
  try {
    const { sock, saveCreds } = await crearConexionWhatsApp()
    
    // Manejar eventos de conexión
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update
      
      // Mostrar estado
      if (connection) {
        console.log(`📡 Estado: ${connection}`)
      }
      
      // Manejar QR
      if (qr) {
        console.log('\n' + '★'.repeat(60))
        console.log('✨ ¡CÓDIGO QR DISPONIBLE!')
        console.log('★'.repeat(60) + '\n')
        
        // Mostrar en terminal
        QRCode.generate(qr, { small: true })
        
        // Guardar archivos
        await guardarQRComoImagen(qr)
        
        // Mostrar instrucciones
        mostrarInstrucciones()
      }
      
      // Manejar cierre de conexión
      if (connection === 'close') {
        const error = lastDisconnect?.error
        
        if (error) {
          console.log('⚠️ Desconectado:', error.message)
          
          // Verificar si es error de autenticación
          const isAuthError = (
            (error instanceof Boom && error.output?.statusCode === 401) ||
            error.message?.includes('401') ||
            error.message?.includes('Not authorized')
          )
          
          if (isAuthError) {
            console.log('🔐 Error de autenticación - Necesitas nuevo QR')
            limpiarArchivosAnteriores()
          }
        }
        
        // Reconectar
        console.log('🔄 Reconectando en 3 segundos...')
        setTimeout(conectarWhatsApp, 3000)
      }
      
      // Conexión exitosa
      if (connection === 'open') {
        console.log('\n' + '🎉'.repeat(30))
        console.log('✅ ¡CONECTADO A WHATSAPP!')
        console.log('🤖 Bot listo para recibir mensajes')
        console.log('🎉'.repeat(30) + '\n')
        
        // Eliminar archivos QR después de 2 segundos
        setTimeout(() => {
          ['bot.qr.png', 'bot.qr.txt'].forEach(file => {
            if (fs.existsSync(file)) {
              try {
                fs.unlinkSync(file)
                console.log(`🗑️  Eliminado: ${file}`)
              } catch (e) {}
            }
          })
        }, 2000)
        
        // Configurar respuestas básicas
        configurarRespuestas(sock)
      }
    })
    
    // Guardar credenciales
    sock.ev.on('creds.update', saveCreds)
    
    return sock
    
  } catch (error) {
    console.error('❌ Error en conexión:', error.message)
    
    // Intentar de nuevo
    console.log('🔄 Reintentando en 5 segundos...')
    setTimeout(conectarWhatsApp, 5000)
  }
}

// Configurar respuestas automáticas
function configurarRespuestas(sock) {
  sock.ev.on('messages.upsert', async (m) => {
    try {
      if (!m.messages || m.messages.length === 0) return
      
      const msg = m.messages[0]
      if (!msg.message?.conversation) return
      
      const from = msg.key.remoteJid
      const text = msg.message.conversation.toLowerCase().trim()
      
      console.log(`💬 Mensaje: "${text}"`)
      
      // Respuesta según el mensaje
      let respuesta = 'Hola, soy el bot de pruebas. Escribe "menu" para opciones.'
      
      if (text.includes('hola') || text === 'inicio') {
        respuesta = '¡Hola! 👋 Soy el bot del Centro de Cómputo ITA.\nEscribe *menu* para ver opciones.'
      } else if (text.includes('menu')) {
        respuesta = '📋 *MENÚ*\n\n1. Opción 1\n2. Opción 2\n3. Opción 3\n\nEscribe el número.'
      } else if (text === '1') {
        respuesta = 'Opción 1 seleccionada.'
      } else if (text === '2') {
        respuesta = 'Opción 2 seleccionada.'
      }
      
      // Enviar respuesta
      await sock.sendMessage(from, { text: respuesta })
      console.log(`📤 Respuesta enviada`)
      
    } catch (error) {
      console.error('❌ Error procesando mensaje:', error.message)
    }
  })
}

// Función principal
async function main() {
  console.log('\n' + '='.repeat(60))
  console.log('🤖 BOT WHATSAPP - GENERADOR DE QR')
  console.log('='.repeat(60))
  console.log('\nEste bot generará el archivo: bot.qr.png')
  console.log('Escanea el QR con WhatsApp para conectar.\n')
  
  // Limpiar
  limpiarArchivosAnteriores()
  
  // Esperar
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  // Conectar
  await conectarWhatsApp()
}

// Manejo de errores globales
process.on('uncaughtException', (err) => {
  console.error('\n⚠️ Error no capturado:', err.message)
})

process.on('unhandledRejection', (reason) => {
  console.error('\n⚠️ Promesa rechazada:', reason)
})

// Manejar Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n👋 Bot detenido. ¡Hasta pronto!')
  process.exit(0)
})

// Iniciar
console.log('🚀 Iniciando...')
main().catch(err => {
  console.error('❌ Error al iniciar:', err.message)
  console.log('🔄 Reiniciando en 10 segundos...')
  setTimeout(main, 10000)
})