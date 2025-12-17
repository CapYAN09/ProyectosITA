// src/app.js - Código funcionando
import { createBot, createProvider, createFlow } from '@builderbot/bot'
import { BaileysProvider } from '@builderbot/provider-baileys'

console.log('🚀 Bot WhatsApp iniciando...')

const flow = createFlow([
    async (ctx, { flowDynamic }) => {
        console.log(`💬 ${ctx.from}: ${ctx.body}`)
        await flowDynamic('¡Hola! Bot funcionando correctamente. 🤖')
    }
])

const provider = createProvider(BaileysProvider)

provider.on('qr', (qr) => {
    console.log('\n' + '🔘'.repeat(30))
    console.log('QR PARA WHATSAPP:')
    console.log(qr)
    console.log('🔘'.repeat(30))
})

provider.on('ready', () => {
    console.log('✅ CONECTADO A WHATSAPP')
})

async function start() {
    await createBot({
        flow: createFlow([flow]),
        provider: provider
    })
    console.log('⏳ Esperando código QR...')
}

start().catch(console.error)