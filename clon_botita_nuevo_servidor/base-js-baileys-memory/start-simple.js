// test_simple.js
import { createBot, createProvider, createFlow, addKeyword } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import QRCode from 'qrcode-terminal'

const flowPrincipal = addKeyword(['hola'])
    .addAnswer('¡Hola! Soy un bot de prueba.')

const flowDefault = addKeyword([''])
    .addAnswer('Escribe "hola" para comenzar')

async function main() {
    try {
        console.log('🧪 INICIANDO PRUEBA MÍNIMA')

        const adapterFlow = createFlow([flowPrincipal, flowDefault])
        const adapterProvider = createProvider(Provider, {
            browser: ['Ubuntu', 'Chrome', '20.0.04'],
            authTimeoutMs: 60000,
            logger: undefined,
            // NO incluir printQRInTerminal - está deprecado
        });

        const adapterDB = new Database()

        const { httpServer } = await createBot({
            flow: adapterFlow,
            provider: adapterProvider,
            database: adapterDB,
        })

        httpServer(3010)
        console.log('✅ Bot en puerto 3010')

        if (adapterProvider.vendor?.ev) {
            adapterProvider.vendor.ev.on('connection.update', (update) => {
                const { connection, qr } = update
                console.log('Estado:', connection)
                if (qr) {
                    console.log('\n📱 QR:')
                    QRCode.generate(qr, { small: true })
                }
            })
        }

        // Mantener proceso activo
        process.on('SIGINT', () => {
            console.log('\n🛑 Cerrando...')
            process.exit(0)
        })

    } catch (error) {
        console.error('❌ Error:', error.message)
        console.error('Stack:', error.stack)
        process.exit(1)
    }
}

main()