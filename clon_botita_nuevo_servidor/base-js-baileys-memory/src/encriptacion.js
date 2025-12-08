// src/encriptacion.js - VERSIÓN MEJORADA PARA CUALQUIER CONTRASEÑA
import crypto from 'crypto';

// 🔐 CONSTANTES IDÉNTICAS AL PHP
const ENCRYPT_METHOD = 'AES-256-CBC';
const ENCRYPT_SECRET_KEY = 'Tecnologico';
const ENCRYPT_SECRET_IV = '990520';

// 🔑 DESCUBRIR EL IV CORRECTO QUE USA PHP
function obtenerIVPHP() {
    // En PHP: $iv = substr(hash('sha256', ENCRYPT_SECRET_IV), 0, 16);
    // Esto devuelve un string de 16 caracteres
    
    const ivHashHex = crypto.createHash('sha256')
        .update(ENCRYPT_SECRET_IV)
        .digest('hex');
    
    const ivString = ivHashHex.substring(0, 16); // Primeros 16 caracteres
    
    // ¡CRÍTICO! Descubrimos que PHP usa este string como UTF-8
    // Basado en nuestras pruebas con "123456789" que produce "ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09"
    return Buffer.from(ivString, 'utf8');
}

// 🔑 OBTENER KEY CORRECTA
function obtenerKeyPHP() {
    const keyHex = crypto.createHash('sha256')
        .update(ENCRYPT_SECRET_KEY)
        .digest('hex');
    
    return Buffer.from(keyHex, 'hex');
}

// 🔐 ENCRIPTAR CUALQUIER CONTRASEÑA (COMPATIBLE CON PHP)
export function encriptarContrasena(password) {
    try {
        const key = obtenerKeyPHP();
        const iv = obtenerIVPHP();
        
        const cipher = crypto.createCipheriv(ENCRYPT_METHOD, key, iv);
        
        let encrypted = cipher.update(password, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        
        // Doble base64 como en PHP
        return Buffer.from(encrypted).toString('base64');
        
    } catch (error) {
        console.error('❌ Error encriptando:', error.message);
        return null;
    }
}

// 🔓 DESENCRIPTAR CONTRASEÑA
export function desencriptarContrasena(encrypted) {
    try {
        const key = obtenerKeyPHP();
        const iv = obtenerIVPHP();
        
        const decodedOnce = Buffer.from(encrypted, 'base64').toString('utf8');
        const decipher = crypto.createDecipheriv(ENCRYPT_METHOD, key, iv);
        
        let decrypted = decipher.update(decodedOnce, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
        
    } catch (error) {
        console.error('❌ Error desencriptando:', error.message);
        return null;
    }
}

// 🧪 VERIFICAR QUE LA ENCRIPTACIÓN FUNCIONA
export function probarEncriptacion() {
    console.log('\n🔐 VERIFICANDO ENCRIPTACIÓN...');
    
    // Probar con contraseña conocida
    const password = '123456789';
    const resultado = encriptarContrasena(password);
    const esperado = 'ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09';
    
    console.log('Contraseña:', password);
    console.log('Resultado:', resultado);
    console.log('Esperado PHP:', esperado);
    console.log('¿Coincide?:', resultado === esperado ? '✅ SÍ' : '❌ NO');
    
    if (resultado === esperado) {
        console.log('🎉 ¡Encriptación compatible con PHP confirmada!');
        
        // Probar desencriptación
        const desencriptado = desencriptarContrasena(resultado);
        console.log('Desencriptado:', desencriptado);
        console.log('¿Funciona?:', desencriptado === password ? '✅ SÍ' : '❌ NO');
    }
    
    return resultado === esperado;
}

// 🔄 FUNCIÓN MEJORADA PARA ENCRIPTAR CONTRASEÑAS ALEATORIAS
export function encriptarContrasenaParaBD(password) {
    console.log(`\n🔐 Encriptando contraseña para BD: "${password}"`);
    
    const resultado = encriptarContrasena(password);
    
    if (resultado) {
        console.log(`✅ Contraseña encriptada: ${resultado}`);
        
        // Verificar que se puede desencriptar
        const desencriptado = desencriptarContrasena(resultado);
        console.log(`🔓 Verificación: "${desencriptado}" → ¿Coincide?: ${desencriptado === password ? '✅ SÍ' : '❌ NO'}`);
        
        return resultado;
    }
    
    console.error('❌ No se pudo encriptar la contraseña');
    return null;
}