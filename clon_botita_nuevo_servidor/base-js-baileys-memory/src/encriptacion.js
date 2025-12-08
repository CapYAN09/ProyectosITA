// src/encriptacion.js - VERSIÓN CORREGIDA
import crypto from 'crypto';

// 🔐 CONSTANTES IDÉNTICAS AL PHP
const ENCRYPT_METHOD = 'AES-256-CBC';
const ENCRYPT_SECRET_KEY = 'Tecnologico';
const ENCRYPT_SECRET_IV = '990520';

// 🔑 GENERAR KEY - IDÉNTICO A PHP
function generarKeyPHP() {
    // En PHP: $key = hash('sha256', ENCRYPT_SECRET_KEY);
    // hash() en PHP devuelve string hexadecimal (64 chars)
    const keyHex = crypto.createHash('sha256')
        .update(ENCRYPT_SECRET_KEY)
        .digest('hex');
    
    console.log('🔑 Key PHP (hex):', keyHex);
    console.log('🔑 Key PHP esperada: b023fa1e7a61dbf919d471777ecf99b87253e8237f64f97f356f14d8ad6f965d');
    
    return keyHex;
}

// 🔐 GENERAR IV - CORREGIDO PARA SER IDÉNTICO A PHP
function generarIVPHP() {
    // En PHP: $iv = substr(hash('sha256', ENCRYPT_SECRET_IV), 0, 16);
    // hash() devuelve hexadecimal (ej: "5b6f6aad5f79777f...")
    // substr(..., 0, 16) toma primeros 16 CARACTERES (no bytes)
    
    const ivHexFull = crypto.createHash('sha256')
        .update(ENCRYPT_SECRET_IV)
        .digest('hex');
    
    console.log('🔐 IV Full (hex):', ivHexFull);
    
    // PHP toma primeros 16 CARACTERES del string hexadecimal
    const ivHex16Chars = ivHexFull.substring(0, 16);
    
    console.log('🔐 IV PHP (16 chars):', ivHex16Chars);
    console.log('🔐 IV PHP esperado: 3562663666616164');
    
    // Convertir string a buffer (cada 2 chars hex = 1 byte)
    const ivBuffer = Buffer.from(ivHex16Chars, 'utf8');
    
    console.log('🔐 IV Buffer:', ivBuffer.toString('hex'));
    
    return {
        ivHex: ivHex16Chars,      // String de 16 caracteres
        ivBuffer: ivBuffer        // Buffer de 16 bytes
    };
}

// 🔐 ENCRIPTAR CONTRASEÑA - VERSIÓN CORREGIDA
export function encriptarContrasenaPHP(password) {
    try {
        console.log('\n🔐 ENCRIPTANDO (PHP compatible)...');
        console.log('📝 Contraseña:', password);
        
        // 1. Generar key (hex string)
        const keyHex = generarKeyPHP();
        
        // 2. Generar IV (16 chars string)
        const { ivHex, ivBuffer } = generarIVPHP();
        
        // 3. Convertir key hexadecimal a Buffer
        // En PHP, openssl_encrypt espera key como string binario
        // Pero hash() devuelve hex, y PHP lo usa directamente
        const keyBuffer = Buffer.from(keyHex, 'hex');
        
        console.log('🔑 Key Buffer:', keyBuffer.toString('hex'));
        console.log('🔐 IV Buffer final:', ivBuffer.toString('hex'));
        console.log('🔐 IV como string:', ivHex);
        
        // 4. Encriptar (openssl_encrypt)
        const cipher = crypto.createCipheriv(ENCRYPT_METHOD, keyBuffer, ivBuffer);
        
        let encrypted = cipher.update(password, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        
        console.log('🔐 openssl_encrypt result:', encrypted);
        console.log('🔐 Longitud:', encrypted.length, 'chars');
        
        // 5. Doble base64 (base64_encode)
        const doubleBase64 = Buffer.from(encrypted).toString('base64');
        
        console.log('🔐 base64_encode result:', doubleBase64);
        console.log('🔐 Longitud final:', doubleBase64.length, 'chars');
        
        return doubleBase64;
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        return null;
    }
}

// 🔓 DESENCRIPTAR CONTRASEÑA - VERSIÓN CORREGIDA
export function desencriptarContrasenaPHP(encrypted) {
    try {
        console.log('\n🔓 DESENCRIPTANDO (PHP compatible)...');
        
        // 1. Generar key y IV
        const keyHex = generarKeyPHP();
        const { ivBuffer } = generarIVPHP();
        const keyBuffer = Buffer.from(keyHex, 'hex');
        
        // 2. Primer base64_decode (como en PHP)
        const decodedOnce = Buffer.from(encrypted, 'base64').toString('utf8');
        
        // 3. Desencriptar
        const decipher = crypto.createDecipheriv(ENCRYPT_METHOD, keyBuffer, ivBuffer);
        
        let decrypted = decipher.update(decodedOnce, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        
        console.log('🔓 Resultado:', decrypted);
        
        return decrypted;
        
    } catch (error) {
        console.error('❌ Error desencriptando:', error.message);
        return null;
    }
}

// 🧪 FUNCIÓN DE PRUEBA CON VALORES ESPECÍFICOS
export function probarConValoresPHP() {
    console.log('\n🧪 PRUEBA CON VALORES EXACTOS DE PHP\n');
    
    // Valores del PHP que viste en la salida
    const keyHexPHP = 'b023fa1e7a61dbf919d471777ecf99b87253e8237f64f97f356f14d8ad6f965d';
    const ivHexPHP = '3562663666616164';  // 16 caracteres exactos del PHP
    
    console.log('🔑 Key PHP:', keyHexPHP);
    console.log('🔐 IV PHP (16 chars):', ivHexPHP);
    
    // Convertir a buffers
    const keyBuffer = Buffer.from(keyHexPHP, 'hex');
    const ivBuffer = Buffer.from(ivHexPHP, 'utf8');  // ¡IMPORTANTE! utf8, no hex
    
    console.log('🔑 Key Buffer:', keyBuffer.toString('hex'));
    console.log('🔐 IV Buffer:', ivBuffer.toString('hex'));
    console.log('🔐 IV como string:', ivBuffer.toString('utf8'));
    
    // Encriptar
    const cipher = crypto.createCipheriv(ENCRYPT_METHOD, keyBuffer, ivBuffer);
    
    const password = '123456789';
    let encrypted = cipher.update(password, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    console.log('🔐 openssl_encrypt:', encrypted);
    
    // Doble base64
    const finalResult = Buffer.from(encrypted).toString('base64');
    
    console.log('\n🔐 RESULTADO FINAL ESPERADO:');
    console.log(finalResult);
    
    return finalResult;
}