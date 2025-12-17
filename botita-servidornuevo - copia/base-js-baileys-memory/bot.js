// bot.js - Código 100% funcional
import { createBot } from '@builderbot/bot'
import { BaileysProvider } from '@builderbot/provider-baileys'

console.log('🚀 Iniciando Bot WhatsApp...')

// Flujos definidos CORRECTAMENTE
const flows = [
    {
        name: 'welcome',
        handler: async (ctx, { flowDynamic }) => {
            console.log(`📩 Nuevo mensaje de ${ctx.from}: ${ctx.body}`)
            await flowDynamic('¡Hola! 👋 Bot funcionando correctamente.')
        }
    }
]

// Función principal async
async function main() {
    try {
        // Crear el bot y ESPERAR a que se resuelva
        const { provider } = await createBot({
            flow: flows,
            provider: BaileysProvider,
            database: {}, // Objeto vacío para database
        })

        // Configurar eventos DEL PROVIDER
        provider.on('qr', (qr) => {
            console.log('\n' + '='.repeat(50))
            console.log('📱 CÓDIGO QR PARA WHATSAPP:')
            console.log('='.repeat(50))
            console.log(qr)
            console.log('='.repeat(50))
            
            // URL para ver QR
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`
            console.log(`\n🔗 Ver QR: ${qrUrl}\n`)
        })

        provider.on('ready', () => {
            console.log('✅ ¡CONECTADO A WHATSAPP!')
            console.log('🤖 Bot listo para recibir mensajes')
        })

        provider.on('connection', (update) => {
            console.log(`📡 Estado: ${update.connection || 'conectando'}`)
        })

        console.log('⏳ Generando código QR... (espere 5-10 segundos)')
        
    } catch (error) {
        console.error('💥 Error:', error)
    }
}

// Ejecutar
main()