// fix-bot.js - Script de diagnóstico
import { createBot, createFlow, addKeyword, createProvider } from '@builderbot/bot';
import { MemoryDB } from '@builderbot/bot';
import { BaileysProvider } from '@builderbot/provider-baileys';

console.log('🔧 DIAGNÓSTICO BOT ITA');

async function diagnostic() {
    try {
        console.log('1. Creando provider...');
        
        const provider = createProvider(BaileysProvider, {
            browser: ['Ubuntu', 'Chrome', '20.0.04'],
            version: [2, 2413, 1],
            logger: { level: 'warn' },
        });
        
        console.log('2. Verificando vendor...');
        console.log('   Vendor existe:', !!provider.vendor);
        console.log('   Vendor.ev existe:', !!(provider.vendor && provider.vendor.ev));
        
        if (provider.vendor && provider.vendor.ev) {
            provider.vendor.ev.on('connection.update', (update) => {
                console.log('   📡 Evento conexión:', update.connection);
                if (update.qr) {
                    console.log('   ✅ QR recibido!');
                }
            });
        }
        
        console.log('3. Creando flow simple...');
        const flow = addKeyword(['hola']).addAnswer('¡Hola!');
        
        console.log('4. Creando bot...');
        const bot = await createBot({
            flow: createFlow([flow]),
            provider: provider,
            database: new MemoryDB(),
        });
        
        console.log('✅ Bot creado exitosamente');
        console.log('📱 Esperando QR...');
        
        // Mantener vivo
        setInterval(() => {}, 1000);
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
        console.error('Stack:', error.stack);
    }
}

diagnostic();