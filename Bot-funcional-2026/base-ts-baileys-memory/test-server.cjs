// test-server.cjs - Usa .cjs para CommonJS
const express = require('express');

console.log('🧪 TEST: Iniciando servidor de prueba (CommonJS)...');

const app = express();
const PORT = 3010;

app.get('/health', (req, res) => {
    console.log('✅ Health check recibido');
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        message: 'Servidor de prueba funcionando'
    });
});

app.get('/', (req, res) => {
    res.send('🤖 Servidor de prueba - Todo OK');
});

app.listen(PORT, () => {
    console.log(`✅ Servidor de prueba en http://localhost:${PORT}`);
    console.log(`📍 Health endpoint: http://localhost:${PORT}/health`);
    console.log('🎉 Prueba exitosa!');
    
    // Auto-test después de 1 segundo
    setTimeout(() => {
        console.log('\n🔍 Auto-testing...');
        const http = require('http');
        const req = http.get(`http://localhost:${PORT}/health`, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
                console.log(`📋 Respuesta: ${data}`);
                console.log('🎯 Ahora prueba en PowerShell:');
                console.log(`   curl http://localhost:${PORT}/health`);
            });
        });
        req.on('error', (err) => {
            console.error(`❌ Error en auto-test: ${err.message}`);
        });
    }, 1000);
});

// Manejar errores
process.on('uncaughtException', (error) => {
    console.error('💥 Error no capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Promise rechazada:', reason);
});