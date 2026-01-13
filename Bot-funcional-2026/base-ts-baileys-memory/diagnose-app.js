// diagnose-app.js - Diagnosticar app.ts sin ejecutarlo
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 DIAGNÓSTICO DE app.ts\n');

const appPath = path.join(__dirname, 'app.ts');

// 1. Verificar que el archivo existe
if (!fs.existsSync(appPath)) {
    console.log('❌ app.ts no encontrado');
    process.exit(1);
}

console.log(`✅ app.ts encontrado (${fs.statSync(appPath).size} bytes)\n`);

// 2. Buscar healthApp.listen()
const content = fs.readFileSync(appPath, 'utf8');
const healthAppLines = content.split('\n').filter(line => line.includes('healthApp.listen'));

if (healthAppLines.length === 0) {
    console.log('❌ NO se encontró healthApp.listen() en el archivo');
    console.log('💡 Buscando en el contenido...');
    
    // Mostrar contexto alrededor de healthApp
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('healthApp')) {
            console.log(`Línea ${i + 1}: ${lines[i]}`);
            if (i > 0) console.log(`Línea ${i}: ${lines[i - 1]}`);
            if (i < lines.length - 1) console.log(`Línea ${i + 2}: ${lines[i + 1]}`);
            console.log('---');
        }
    }
} else {
    console.log(`✅ Se encontró healthApp.listen() ${healthAppLines.length} veces:`);
    healthAppLines.forEach((line, index) => {
        console.log(`   ${index + 1}. ${line.trim()}`);
    });
}

// 3. Verificar TypeScript
console.log('\n🔧 Verificando TypeScript...');
try {
    const result = execSync('npx tsc --noEmit app.ts', { encoding: 'utf8', stdio: 'pipe' });
    console.log('✅ TypeScript: SIN ERRORES de sintaxis');
} catch (error) {
    console.log('❌ TypeScript tiene ERRORES:');
    console.log(error.stderr.toString());
}

// 4. Verificar si main() se llama
console.log('\n📋 Verificando estructura...');
if (content.includes('main()') || content.includes('main().catch') || content.includes('main().then')) {
    console.log('✅ main() está definido y probablemente se llama');
} else {
    console.log('⚠️  main() no se encontró o no se llama');
    
    // Mostrar las últimas 20 líneas
    const lines = content.split('\n');
    console.log('\n📄 Últimas 20 líneas del archivo:');
    lines.slice(-20).forEach((line, index) => {
        console.log(`   ${lines.length - 20 + index + 1}: ${line}`);
    });
}