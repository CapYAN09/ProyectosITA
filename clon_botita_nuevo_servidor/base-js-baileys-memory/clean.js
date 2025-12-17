import { promises as fs } from 'fs';

async function clean() {
  try {
    console.log('🧹 Limpiando sesión de WhatsApp...');
    await fs.rm('./auth', { recursive: true, force: true }).catch(() => {});
    console.log('✅ Carpeta auth eliminada');
    
    // También limpia otras carpetas que puedan interferir
    await fs.rm('./baileys_store', { recursive: true, force: true }).catch(() => {});
    console.log('✅ Cache limpio');
    
    console.log('\n🔄 Ahora reinicia el bot con: npm start');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

clean();