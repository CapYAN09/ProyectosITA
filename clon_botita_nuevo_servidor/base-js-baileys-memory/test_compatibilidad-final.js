// test-final.js
import { encriptarContrasenaParaBD } from './src/encriptacion.js';

console.log('🧪 PRUEBA FINAL - COMPATIBILIDAD CON PHP\n');

// Probar con la contraseña que necesitas
const password = '123456789';
const resultado = encriptarContrasenaParaBD(password);

console.log('\n📊 RESULTADO:');
console.log('Contraseña:', password);
console.log('Encriptado:', resultado);
console.log('PHP espera:', 'ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09');
console.log('¿Coinciden?:', resultado === 'ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09' ? '✅ SÍ' : '❌ NO');

if (resultado === 'ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09') {
    console.log('\n🎉 ¡LISTO PARA USAR EN LA BASE DE DATOS!');
    console.log('\n📋 Ejecuta este comando SQL o usa la función en app.js:');
    console.log("UPDATE usuariosprueba SET password = 'ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09', fecha_insert = NOW() WHERE usuario = 'Dep_centro_de_computo';");
}