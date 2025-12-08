// test-compatibilidad-final.js
import { encriptarContrasenaPHP, probarConValoresPHP } from './src/encriptacion.js';

console.log('🧪 PRUEBA FINAL DE COMPATIBILIDAD PHP-NODE.JS\n');

const password = '123456789';

console.log('1. 🔐 PRUEBA CON FUNCIÓN AUTOMÁTICA:');
const resultado1 = encriptarContrasenaPHP(password);
console.log('Resultado:', resultado1);
console.log('PHP esperado: ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09');
console.log('¿Coinciden?:', resultado1 === 'ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09' ? '✅ SÍ' : '❌ NO');

console.log('\n2. 🔐 PRUEBA CON VALORES EXACTOS DE PHP:');
const resultado2 = probarConValoresPHP();
console.log('¿Coinciden?:', resultado2 === 'ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09' ? '✅ SÍ' : '❌ NO');

if (resultado2 === 'ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09') {
    console.log('\n🎉 ¡COMPATIBILIDAD CONFIRMADA!');
    console.log('\n📋 COMANDO SQL PARA EJECUTAR:');
    console.log("UPDATE usuariosprueba SET password = 'ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09', fecha_insert = NOW() WHERE usuario = 'Dep_centro_de_computo';");
}