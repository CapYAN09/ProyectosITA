const { spawn } = require('child_process');
const fs = require('fs');

// Contador de reinicios para evitar bucles infinitos
let reinicios = 0;
const MAX_REINICIOS = 10;

function iniciarBot() {
  console.log(`🚀 Iniciando bot... (Reinicio #${reinicios + 1})`);
  
  const bot = spawn('node', ['app.js'], {
    stdio: 'inherit',
    shell: true
  });

  bot.on('close', (code) => {
    reinicios++;
    console.log(`❌ Bot se cerró con código: ${code}`);
    
    // Registrar el error en un archivo
    fs.appendFileSync('errores.log', `[${new Date().toISOString()}] Bot cerrado con código: ${code}\n`);
    
    if (reinicios >= MAX_REINICIOS) {
      console.error('🛑 Máximo de reinicios alcanzado. Deteniendo...');
      process.exit(1);
    }
    
    const tiempoEspera = Math.min(5000 * reinicios, 30000); // Backoff exponencial máximo 30 segundos
    console.log(`🔄 Reiniciando en ${tiempoEspera/1000} segundos...`);
    setTimeout(iniciarBot, tiempoEspera);
  });

  bot.on('error', (error) => {
    console.error('❌ Error iniciando bot:', error);
    fs.appendFileSync('errores.log', `[${new Date().toISOString()}] Error: ${error.message}\n`);
  });
}

// Manejar cierre graceful del proceso padre
process.on('SIGINT', () => {
  console.log('\n🛑 Deteniendo supervisor...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Supervisor terminado...');
  process.exit(0);
});

console.log('👀 Supervisor del bot iniciado...');
iniciarBot();