// bot.cjs - CommonJS version
const { createBot } = require('@builderbot/bot')
const { BaileysProvider } = require('@builderbot/provider-baileys')

console.log('🤖 Iniciando Bot WhatsApp...')

const flows = [
    {
        name: 'main',
        handler: async (ctx, { flowDynamic }) => {
            console.log(`💬 Mensaje: ${ctx.body}`)
            await flowDynamic('¡Hola! 👋')
        }
    }
]

async function startBot() {
    try {
        // Crear bot y esperar
        const { provider } = await createBot({
            flow: flows,
            provider: BaileysProvider,
            database: {}
        })

        // Eventos
        provider.on('qr', (qr) => {
            console.log('\n' + '🔘'.repeat(40))
            console.log('QR PARA VINCULAR WHATSAPP:')
            console.log('🔘'.repeat(40))
            console.log('\n' + qr + '\n')
            console.log('🔘'.repeat(40))
            
            console.log(`\n📱 Abre este enlace para ver el QR:`)
            console.log(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qr)}`)
            console.log('\n📋 Instrucciones:')
            console.log('1. Abre WhatsApp en tu teléfono')
            console.log('2. Toca ⋮ → Dispositivos vinculados')
            console.log('3. Toca "Vincular un dispositivo"')
            console.log('4. Escanea el código QR\n')
        })

        provider.on('ready', () => {
            console.log('✅ ¡CONECTADO EXITOSAMENTE!')
        })

        console.log('⏳ Esperando QR...')
        
    } catch (error) {
        console.error('❌ Error:', error.message)
    }
}

// Iniciar
startBot()