// src/encriptacion.js - VERSIÓN ES MODULE
import crypto from 'crypto';

// 🔐 CONSTANTES DE ENCRIPTACIÓN - DEBEN COINCIDIR EXACTAMENTE CON PHP
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
export function encriptarContrasena(contrasena) {
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
        
        return encriptado;
    } catch (error) {
        console.error('❌ Error encriptando contraseña:', error.message);
        return null;
    }
}

// 🔓 Desencriptar contraseña (equivalente a getUnencryptedPassword en PHP)
export function desencriptarContrasena(contrasenaEncriptada) {
    try {
        console.log('🔓 Iniciando desencriptación...');
        
        const { key, iv } = generarClaveYIV();
        
        // Crear decipher
        const decipher = crypto.createDecipheriv(ENCRYPT_METHOD, key, iv);
        
        // Desencriptar
        let desencriptado = decipher.update(contrasenaEncriptada, 'base64', 'utf8');
        desencriptado += decipher.final('utf8');
        
        console.log('🔓 Contraseña desencriptada:', desencriptado);
        
        return desencriptado;
    } catch (error) {
        console.error('❌ Error desencriptando contraseña:', error.message);
        return null;
    }
}

// 🔍 Función para probar la encriptación
export function probarEncriptacion() {
    console.log('\n🔍 PROBANDO SISTEMA DE ENCRIPTACIÓN\n');
    
    const testPassword = '123456789';
    console.log('🔐 Contraseña de prueba:', testPassword);
    
    const encriptado = encriptarContrasena(testPassword);
    
    if (encriptado) {
        const desencriptado = desencriptarContrasena(encriptado);
        const coincide = testPassword === desencriptado;
        
        console.log('📊 Resultado:');
        console.log(`✅ Encriptación/Desencriptación: ${coincide ? 'CORRECTO' : 'FALLIDO'}`);
        
        if (coincide) {
            console.log('🎉 ¡Encriptación funcionando correctamente!');
        } else {
            console.log('⚠️ La encriptación/desencriptación no coincide');
        }
        
        return encriptado;
    }
    
    return null;
}