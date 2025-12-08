// encriptacion.js
const crypto = require('crypto');

// 🔐 CONSTANTES DE ENCRIPTACIÓN - DEBEN COINCIDIR CON PHP
const ENCRYPT_METHOD = 'aes-256-cbc';
const ENCRYPT_SECRET_KEY = 'Tecnologico';
const ENCRYPT_SECRET_IV = '990520';

// Generar clave y IV (igual que en PHP)
function generarClaveYIV() {
    // En PHP: $key = hash('sha256', ENCRYPT_SECRET_KEY);
    const key = crypto.createHash('sha256').update(ENCRYPT_SECRET_KEY).digest();
    
    // En PHP: $iv = substr(hash('sha256', ENCRYPT_SECRET_IV), 0, 16);
    const ivBuffer = crypto.createHash('sha256').update(ENCRYPT_SECRET_IV).digest();
    const iv = ivBuffer.slice(0, 16); // Tomar primeros 16 bytes
    
    return { key, iv };
}

// 🔐 Encriptar contraseña (equivalente a getEncryptedPassword en PHP)
function encriptarContrasena(contrasena) {
    try {
        console.log('🔐 Iniciando encriptación...');
        console.log('📝 Contraseña original:', contrasena);
        
        const { key, iv } = generarClaveYIV();
        
        // Crear cipher
        const cipher = crypto.createCipheriv(ENCRYPT_METHOD, key, iv);
        
        // Encriptar
        let encriptado = cipher.update(contrasena, 'utf8', 'base64');
        encriptado += cipher.final('base64');
        
        console.log('🔐 Contraseña encriptada:', encriptado);
        
        // En PHP adicionalmente se hace: base64_encode($output)
        // Pero como ya está en base64, no necesitamos hacer nada más
        
        return encriptado;
    } catch (error) {
        console.error('❌ Error encriptando contraseña:', error.message);
        return null;
    }
}

// 🔓 Desencriptar contraseña (equivalente a getUnencryptedPassword en PHP)
function desencriptarContrasena(contrasenaEncriptada) {
    try {
        console.log('🔓 Iniciando desencriptación...');
        console.log('📝 Contraseña encriptada:', contrasenaEncriptada);
        
        const { key, iv } = generarClaveYIV();
        
        // Crear decipher
        const decipher = crypto.createDecipheriv(ENCRYPT_METHOD, key, iv);
        
        // Desencriptar
        // Nota: En PHP se hace base64_decode primero
        let desencriptado = decipher.update(contrasenaEncriptada, 'base64', 'utf8');
        desencriptado += decipher.final('utf8');
        
        console.log('🔓 Contraseña desencriptada:', desencriptado);
        
        return desencriptado;
    } catch (error) {
        console.error('❌ Error desencriptando contraseña:', error.message);
        return null;
    }
}

// 🔍 Verificar compatibilidad con PHP
async function verificarCompatibilidadPHP() {
    console.log('\n🔍 VERIFICANDO COMPATIBILIDAD CON PHP\n');
    
    // Contraseña de prueba
    const testPassword = 'Test123$%';
    
    // 1. Encriptar en Node.js
    const encriptadoNode = encriptarContrasena(testPassword);
    
    // 2. Desencriptar para verificar
    if (encriptadoNode) {
        const desencriptadoNode = desencriptarContrasena(encriptadoNode);
        const coincide = testPassword === desencriptadoNode;
        
        console.log('📊 Resultados Node.js:');
        console.log(`✅ Encriptación/Desencriptación: ${coincide ? 'CORRECTA' : 'FALLIDA'}`);
        
        // 3. Si tienes acceso a PHP, puedes comparar manualmente
        console.log('\n📋 Para verificar con PHP:');
        console.log('Ejecuta este código en PHP:');
        console.log(`
<?php
define('ENCRYPT_METHOD','AES-256-CBC');
define('ENCRYPT_SECRET_KEY','Tecnologico');
define('ENCRYPT_SECRET_IV','990520');

function getEncryptedPassword($password){
    $output = FALSE;
    $key = hash('sha256', ENCRYPT_SECRET_KEY);
    $iv = substr(hash('sha256', ENCRYPT_SECRET_IV), 0, 16);
    $output = openssl_encrypt($password, ENCRYPT_METHOD, $key, 0, $iv);
    return base64_encode($output);
}

echo getEncryptedPassword('${testPassword}');
?>
        `);
        console.log('\n🔐 Resultado esperado en Node.js:', encriptadoNode);
    }
    
    return encriptadoNode;
}

// Exportar funciones
module.exports = {
    encriptarContrasena,
    desencriptarContrasena,
    verificarCompatibilidadPHP
};