// test-encriptacion.js
import { encriptarContrasena, desencriptarContrasena, probarEncriptacion } from './src/encriptacion.js';

console.log('🧪 PROBANDO ENCRIPTACIÓN...\n');

// Prueba 1: Encriptación básica
const password = 'MiContraseña123$';
console.log('📝 Contraseña original:', password);

const encriptada = encriptarContrasena(password);
console.log('🔐 Contraseña encriptada:', encriptada);

if (encriptada) {
    const desencriptada = desencriptarContrasena(encriptada);
    console.log('🔓 Contraseña desencriptada:', desencriptada);
    console.log('✅ ¿Coinciden?', password === desencriptada ? 'SÍ' : 'NO');
}

// Prueba 2: Función de prueba
console.log('\n🧪 EJECUTANDO PRUEBA COMPLETA...');
probarEncriptacion();