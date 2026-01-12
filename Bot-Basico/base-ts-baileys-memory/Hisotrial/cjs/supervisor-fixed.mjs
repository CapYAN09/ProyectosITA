import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

// Obtener __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = import.meta.dirname || fileURLToPath(new URL('.', import.meta.url));

// Configuración
let restartCount = 0;
const MAX_RESTARTS = 10;
let botProcess = null;

console.log('👀 Supervisor TypeScript con Rollup iniciado...');
console.log('📁 Directorio:', __dirname);
console.log('🖥️  Plataforma:', process.platform);
console.log('🚀 Node.js:', process.version);

// Función para escapar rutas con espacios en Windows
function escapePathForWindows(path) {
    // En Windows, si la ruta tiene espacios, usar comillas dobles
    if (process.platform === 'win32' && path.includes(' ')) {
        return `"${path}"`;
    }
    return path;
}

// Función para leer package.json
function readPackageJson() {
    try {
        const packagePath = join(process.cwd(), 'package.json');
        const content = readFileSync(packagePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error('❌ Error leyendo package.json:', error.message);
        return null;
    }
}

// Compilar con Rollup
async function compileWithRollup() {
    return new Promise((resolve) => {
        console.log('🔨 Compilando con Rollup...');
        
        const packageJson = readPackageJson();
        if (packageJson?.scripts?.build) {
            console.log(`📝 Script build: ${packageJson.scripts.build}`);
        }
        
        const buildProcess = spawn('npm', ['run', 'build'], {
            stdio: 'inherit',
            shell: true,
            cwd: process.cwd()
        });
        
        buildProcess.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Compilación exitosa con Rollup');
                resolve(true);
            } else {
                console.error(`❌ Error en compilación (código: ${code})`);
                resolve(false);
            }
        });
        
        buildProcess.on('error', (error) => {
            console.error(`❌ Error ejecutando rollup: ${error.message}`);
            resolve(false);
        });
    });
}

// Buscar archivo compilado
function findCompiledFile() {
    const possiblePaths = [
        join(process.cwd(), 'dist', 'app.js'),
        join(process.cwd(), 'dist', 'app.cjs'),
        join(process.cwd(), 'dist', 'app.mjs'),
        join(process.cwd(), 'build', 'app.js'),
        join(process.cwd(), 'out', 'app.js')
    ];
    
    for (const filePath of possiblePaths) {
        if (existsSync(filePath)) {
            console.log(`✅ Archivo compilado encontrado: ${filePath}`);
            return filePath;
        }
    }
    
    console.error('❌ No se encontró archivo compilado');
    return null;
}

// Iniciar el bot - VERSIÓN CORREGIDA PARA ESPACIOS EN RUTAS
async function startBot() {
    restartCount++;
    console.log(`\n🔄 Intento #${restartCount}`);
    
    // 1. Compilar
    const compiled = await compileWithRollup();
    if (!compiled) {
        console.error('❌ Falló la compilación');
        scheduleRestart();
        return;
    }
    
    // 2. Buscar archivo compilado
    const appJsPath = findCompiledFile();
    if (!appJsPath) {
        console.error('❌ No se puede continuar sin archivo compilado');
        scheduleRestart();
        return;
    }
    
    console.log(`🚀 Ejecutando: ${appJsPath}`);
    
    // 3. Detener proceso anterior
    if (botProcess && !botProcess.killed) {
        console.log('⚠️ Terminando proceso anterior...');
        botProcess.kill('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // 4. IMPORTANTE: Escapar la ruta para Windows
    const escapedPath = escapePathForWindows(appJsPath);
    console.log(`📦 Iniciando proceso con ruta escapada: ${escapedPath}`);
    
    // 5. Usar un enfoque diferente para evitar problemas con spawn
    try {
        // En Windows, usar un comando de shell que maneje espacios
        let command;
        if (process.platform === 'win32') {
            // En Windows, usar cmd /c con comillas
            command = `node "${appJsPath}"`;
            console.log(`🖥️  Comando Windows: ${command}`);
            
            botProcess = spawn('cmd.exe', ['/c', command], {
                stdio: 'inherit',
                shell: false,
                windowsHide: false,
                cwd: process.cwd(),
                env: {
                    ...process.env,
                    NODE_ENV: 'production',
                    SUPERVISOR: 'true',
                    RESTART_COUNT: restartCount.toString()
                }
            });
        } else {
            // En otros sistemas
            botProcess = spawn('node', [appJsPath], {
                stdio: 'inherit',
                shell: false,
                cwd: process.cwd(),
                env: {
                    ...process.env,
                    NODE_ENV: 'production',
                    SUPERVISOR: 'true',
                    RESTART_COUNT: restartCount.toString()
                }
            });
        }
        
        botProcess.on('close', (code, signal) => {
            console.log(`\n❌ Proceso terminado (código: ${code}, señal: ${signal || 'N/A'})`);
            
            if (restartCount >= MAX_RESTARTS) {
                console.error('🛑 Máximo de reinicios alcanzado');
                process.exit(1);
            }
            
            scheduleRestart();
        });
        
        botProcess.on('error', (error) => {
            console.error(`❌ Error iniciando proceso: ${error.message}`);
            scheduleRestart();
        });
        
        // Verificar que el proceso se inició
        setTimeout(() => {
            if (botProcess && botProcess.exitCode === null) {
                console.log('✅ Bot iniciado correctamente');
            }
        }, 3000);
        
    } catch (error) {
        console.error(`❌ Error crítico: ${error.message}`);
        scheduleRestart();
    }
}

// Programar reinicio
function scheduleRestart() {
    const waitTime = Math.min(5000 * restartCount, 30000);
    console.log(`⏳ Reiniciando en ${waitTime / 1000} segundos...`);
    
    setTimeout(() => {
        startBot();
    }, waitTime);
}

// Manejar señales
function setupSignalHandlers() {
    process.on('SIGINT', () => {
        console.log('\n🛑 Deteniendo supervisor (Ctrl+C)...');
        if (botProcess && !botProcess.killed) {
            console.log('🛑 Terminando proceso del bot...');
            botProcess.kill('SIGTERM');
        }
        setTimeout(() => process.exit(0), 1000);
    });
    
    process.on('SIGTERM', () => {
        console.log('\n🛑 Supervisor terminado...');
        if (botProcess && !botProcess.killed) {
            botProcess.kill('SIGTERM');
        }
        setTimeout(() => process.exit(0), 1000);
    });
    
    // Capturar errores no manejados
    process.on('uncaughtException', (error) => {
        console.error('💥 Error no capturado:', error.message);
        console.error(error.stack);
    });
    
    process.on('unhandledRejection', (reason) => {
        console.error('💥 Promise rechazada no manejada:', reason);
    });
}

// Función principal
async function main() {
    console.log('🔍 Inicializando supervisor...');
    
    setupSignalHandlers();
    
    // Esperar un momento antes de empezar
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Iniciar el bot
    await startBot();
}

// Iniciar
main().catch((error) => {
    console.error('💥 Error en main:', error);
    process.exit(1);
});