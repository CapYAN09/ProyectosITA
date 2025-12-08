// test-simple.js
import { encriptarContrasena, desencriptarContrasena } from './src/encriptacion.js';

console.log('🧪 PRUEBA SIMPLE DE ENCRIPTACIÓN\n');

const password = '123456789';

console.log('1. 🔐 Encriptando contraseña:', password);
const encriptado = encriptarContrasena(password);

console.log('\n2. 🎯 Resultado obtenido:', encriptado);
console.log('   Resultado esperado PHP:', 'ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09');

console.log('\n3. 🔓 Desencriptando...');
const desencriptado = desencriptarContrasena(encriptado);
console.log('   Contraseña desencriptada:', desencriptado);

console.log('\n4. ✅ Verificación:');
console.log('   ¿Coincide con original?:', desencriptado === password ? '✅ SÍ' : '❌ NO');
console.log('   ¿Coincide con PHP?:', encriptado === 'ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09' ? '✅ SÍ' : '❌ NO');