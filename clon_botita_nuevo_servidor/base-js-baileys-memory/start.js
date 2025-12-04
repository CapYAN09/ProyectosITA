#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuración
const BOT_SCRIPT = join(__dirname, 'src', 'app.js');
const LOG_FILE = join(__dirname, 'bot.log');
const ERROR_LOG_FILE = join(__dirname, 'error.log');

// Función para escribir logs
function logToFile(message, isError = false) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    
    if (isError) {
        fs.appendFileSync(ERROR_LOG_FILE, logMessage);
        console.error(logMessage);
    } else {
        fs.appendFileSync(LOG_FILE, logMessage);
        console.log(logMessage);
    }
}

// Función para iniciar el bot
function startBot() {
    logToFile('🚀 Iniciando bot ITA...');
    
    const botProcess = spawn('node', [BOT_SCRIPT], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'production' }
    });

    // Capturar salida estándar
    botProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
            logToFile(`[BOT] ${output}`);
        }
    });

    // Capturar errores
    botProcess.stderr.on('data', (data) => {
        const error = data.toString().trim();
        if (error) {
            logToFile(`[ERROR] ${error}`, true);
        }
    });

    // Manejar cierre del proceso
    botProcess.on('close', (code) => {
        logToFile(`⚠️ Bot cerrado con código ${code}. Reiniciando en 5 segundos...`);
        setTimeout(startBot, 5000);
    });

    // Manejar errores de spawn
    botProcess.on('error', (err) => {
        logToFile(`❌ Error al iniciar proceso: ${err.message}`, true);
        setTimeout(startBot, 10000);
    });

    // Manejar señales del sistema
    process.on('SIGINT', () => {
        logToFile('🛑 Recibida señal SIGINT. Cerrando bot...');
        botProcess.kill('SIGINT');
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        logToFile('🛑 Recibida señal SIGTERM. Cerrando bot...');
        botProcess.kill('SIGTERM');
        process.exit(0);
    });

    return botProcess;
}

// Iniciar el bot
startBot();

logToFile('✅ Sistema de monitoreo iniciado. Ver logs en:');
logToFile(`   📝 Log normal: ${LOG_FILE}`);
logToFile(`   ⚠️  Log de errores: ${ERROR_LOG_FILE}`);