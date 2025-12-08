// src/encriptacion.js - VERSIÓN CORREGIDA CON VALORES EXACTOS DE PHP
import crypto from 'crypto';

// 🔐 CONSTANTES IDÉNTICAS AL PHP
const ENCRYPT_METHOD = 'AES-256-CBC';
const ENCRYPT_SECRET_KEY = 'Tecnologico';
const ENCRYPT_SECRET_IV = '990520';

// 🔑 GENERAR KEY - IDÉNTICO A PHP (CORRECTO)
function generarKeyPHP() {
    // En PHP: $key = hash('sha256', ENCRYPT_SECRET_KEY);
    const keyHex = crypto.createHash('sha256')
        .update(ENCRYPT_SECRET_KEY)
        .digest('hex');
    
    return keyHex;
}

// 🔐 GENERAR IV - VERSIÓN CORREGIDA CON VALORES EXACTOS DEL PHP
function generarIVPHP() {
    // EL IV EXACTO QUE SE VE EN TU PHP ES: 3562663666616164
    // Esto parece ser la representación ASCII/UTF-8 de los primeros 16 bytes
    // del hash SHA256 de '990520'
    
    const ivHexFull = crypto.createHash('sha256')
        .update(ENCRYPT_SECRET_IV)
        .digest('hex');
    
    console.log('🔐 IV Full SHA256(990520):', ivHexFull);
    
    // El PHP muestra: 3562663666616164
    // Esto es "5bf6faad5f" en hexadecimal, pero en formato string
    // Tomamos los primeros 16 bytes del hash y los convertimos a su representación ASCII
    
    const ivHexBytes = Buffer.from(ivHexFull.substring(0, 32), 'hex'); // 16 bytes
    const ivString = ivHexBytes.toString('utf8');
    
    console.log('🔐 IV como string (16 chars):', ivString);
    
    // Pero el PHP muestra: 3562663666616164
    // Este es el IV REAL que está usando el PHP
    // Vamos a usar exactamente este valor
    const ivPHP = '3562663666616164';
    
    console.log('🔐 IV PHP exacto:', ivPHP);
    
    return {
        ivHex: ivPHP,
        ivBuffer: Buffer.from(ivPHP, 'utf8')
    };
}

// 🔐 ENCRIPTAR CONTRASEÑA - USANDO LOS VALORES EXACTOS DEL PHP
export function encriptarContrasenaPHP(password) {
    try {
        console.log('\n🔐 ENCRIPTANDO CON VALORES EXACTOS DE PHP...');
        console.log('📝 Contraseña:', password);
        
        // 1. Usar la KEY exacta del PHP
        const keyHex = 'b023fa1e7a61dbf919d471777ecf99b87253e8237f64f97f356f14d8ad6f965d';
        
        // 2. Usar el IV exacto del PHP
        const ivPHP = '3562663666616164';
        
        console.log('🔑 Key PHP:', keyHex);
        console.log('🔐 IV PHP:', ivPHP);
        
        // 3. Convertir a buffers
        const keyBuffer = Buffer.from(keyHex, 'hex');
        const ivBuffer = Buffer.from(ivPHP, 'utf8');  // IMPORTANTE: utf8, no hex
        
        console.log('🔑 Key Buffer:', keyBuffer.toString('hex'));
        console.log('🔐 IV Buffer:', ivBuffer.toString('hex'));
        console.log('🔐 IV como string:', ivBuffer.toString('utf8'));
        
        // 4. Encriptar (openssl_encrypt en PHP)
        const cipher = crypto.createCipheriv(ENCRYPT_METHOD, keyBuffer, ivBuffer);
        
        let encrypted = cipher.update(password, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        
        console.log('🔐 openssl_encrypt result:', encrypted);
        console.log('🔐 Longitud:', encrypted.length, 'chars');
        
        // 5. Doble base64 (base64_encode en PHP)
        const doubleBase64 = Buffer.from(encrypted).toString('base64');
        
        console.log('🔐 base64_encode result:', doubleBase64);
        console.log('🔐 Longitud final:', doubleBase64.length, 'chars');
        
        // 6. Verificar contra el resultado esperado
        const esperado = 'ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09';
        console.log('🔐 Resultado esperado PHP:', esperado);
        console.log('✅ ¿Coinciden?:', doubleBase64 === esperado ? 'SÍ' : 'NO');
        
        return doubleBase64;
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        return null;
    }
}

// 🔓 DESENCRIPTAR CONTRASEÑA
export function desencriptarContrasenaPHP(encrypted) {
    try {
        console.log('\n🔓 DESENCRIPTANDO...');
        console.log('🔐 Texto encriptado:', encrypted);
        
        // 1. Usar los valores exactos del PHP
        const keyHex = 'b023fa1e7a61dbf919d471777ecf99b87253e8237f64f97f356f14d8ad6f965d';
        const ivPHP = '3562663666616164';
        
        // 2. Convertir a buffers
        const keyBuffer = Buffer.from(keyHex, 'hex');
        const ivBuffer = Buffer.from(ivPHP, 'utf8');
        
        // 3. Primer base64_decode (como en PHP)
        const decodedOnce = Buffer.from(encrypted, 'base64').toString('utf8');
        console.log('🔓 Después de primer base64_decode:', decodedOnce);
        
        // 4. Desencriptar
        const decipher = crypto.createDecipheriv(ENCRYPT_METHOD, keyBuffer, ivBuffer);
        
        let decrypted = decipher.update(decodedOnce, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        
        console.log('🔓 Contraseña desencriptada:', decrypted);
        
        return decrypted;
        
    } catch (error) {
        console.error('❌ Error desencriptando:', error.message);
        return null;
    }
}

// 🧪 PRUEBA DE COMPATIBILIDAD
export function probarCompatibilidadPHP() {
    console.log('\n🧪 PRUEBA DE COMPATIBILIDAD PHP-NODE.JS\n');
    
    const password = '123456789';
    const resultado = encriptarContrasenaPHP(password);
    
    console.log('\n📊 RESUMEN:');
    console.log('Contraseña original:', password);
    console.log('Resultado Node.js:', resultado);
    console.log('Resultado PHP esperado:', 'ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09');
    
    if (resultado === 'ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09') {
        console.log('\n🎉 ¡COMPATIBILIDAD CONFIRMADA!');
        console.log('\n📋 COMANDO SQL PARA EJECUTAR:');
        console.log("UPDATE usuariosprueba SET password = 'ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09', fecha_insert = NOW() WHERE usuario = 'Dep_centro_de_computo';");
        
        // Probar desencriptación
        console.log('\n🔍 PROBANDO DESENCRIPTACIÓN:');
        const desencriptado = desencriptarContrasenaPHP(resultado);
        console.log('¿La desencriptación funciona?:', desencriptado === password ? '✅ SÍ' : '❌ NO');
        
        return true;
    } else {
        console.log('\n❌ NO HAY COMPATIBILIDAD');
        console.log('Diferencia:', resultado);
        return false;
    }
}

// 🔄 FUNCIONES PARA EXPORTAR (compatibilidad con app.js)
export function encriptarContrasena(password) {
    return encriptarContrasenaPHP(password);
}

export function desencriptarContrasena(encrypted) {
    return desencriptarContrasenaPHP(encrypted);
}

export function probarEncriptacion() {
    return probarCompatibilidadPHP();
}