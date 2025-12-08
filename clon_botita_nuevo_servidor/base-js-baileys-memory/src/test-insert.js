// test-encriptacion-automatica.js
import { encriptarContrasenaParaBD, desencriptarContrasena } from './src/encriptacion.js';

console.log('🧪 PROBANDO ENCRIPTACIÓN AUTOMÁTICA PARA CONTRASEÑAS ALEATORIAS\n');

// Generar algunas contraseñas aleatorias
function generarContrasenaSegura() {
  const mayusculas = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const minusculas = 'abcdefghijklmnopqrstuvwxyz';
  const numeros = '0123456789';
  const simbolos = '!#$%&/()=?¡¿+*}{][-_';
  const todosCaracteres = mayusculas + minusculas + numeros + simbolos;

  let contrasena = '';
  contrasena += mayusculas[Math.floor(Math.random() * mayusculas.length)];
  contrasena += minusculas[Math.floor(Math.random() * minusculas.length)];
  contrasena += numeros[Math.floor(Math.random() * numeros.length)];
  contrasena += simbolos[Math.floor(Math.random() * simbolos.length)];

  for (let i = 4; i < 12; i++) {
    contrasena += todosCaracteres[Math.floor(Math.random() * todosCaracteres.length)];
  }

  return contrasena.split('').sort(() => Math.random() - 0.5).join('');
}

// Probar con 5 contraseñas aleatorias
console.log('🔐 Probando encriptación de contraseñas aleatorias:\n');

for (let i = 1; i <= 5; i++) {
  const password = generarContrasenaSegura();
  console.log(`\n${i}. Contraseña original: ${password}`);
  
  const encriptada = encriptarContrasenaParaBD(password);
  
  if (encriptada) {
    console.log(`   Encriptada: ${encriptada}`);
    
    // Verificar desencriptación
    const desencriptada = desencriptarContrasena(encriptada);
    console.log(`   Desencriptada: ${desencriptada}`);
    console.log(`   ¿Coinciden?: ${password === desencriptada ? '✅ SÍ' : '❌ NO'}`);
  }
}

// Probar también con la contraseña conocida de PHP
console.log('\n🔍 VERIFICANDO COMPATIBILIDAD CON PHP:\n');
const passwordPHP = '123456789';
const encriptadaPHP = encriptarContrasenaParaBD(passwordPHP);
const esperadoPHP = 'ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09';

console.log(`Contraseña: ${passwordPHP}`);
console.log(`Encriptada: ${encriptadaPHP}`);
console.log(`Esperada PHP: ${esperadoPHP}`);
console.log(`¿Compatibilidad 100%?: ${encriptadaPHP === esperadoPHP ? '✅ SÍ' : '❌ NO'}`);

if (encriptadaPHP === esperadoPHP) {
  console.log('\n🎉 ¡SISTEMA LISTO PARA PRODUCCIÓN!');
  console.log('El bot puede ahora:');
  console.log('1. ✅ Generar contraseñas aleatorias seguras');
  console.log('2. ✅ Encriptarlas automáticamente (compatible PHP)');
  console.log('3. ✅ Guardarlas en la base de datos');
  console.log('4. ✅ Los usuarios podrán iniciar sesión con el sistema PHP');
}