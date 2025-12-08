// src/encriptacion.js - VERSIÓN FINAL CORREGIDA
import crypto from 'crypto';

// 🔐 CONSTANTES IDÉNTICAS AL PHP
const ENCRYPT_METHOD = 'AES-256-CBC';
const ENCRYPT_SECRET_KEY = 'Tecnologico';
const ENCRYPT_SECRET_IV = '990520';

// 🔑 GENERAR KEY Y IV EXACTAMENTE COMO EN PHP
function generarClavesPHP() {
    // Key: hash('sha256', ENCRYPT_SECRET_KEY)
    const keyHex = crypto.createHash('sha256')
        .update(ENCRYPT_SECRET_KEY)
        .digest('hex');
    
    // IMPORTANTE: En PHP, openssl_encrypt espera el key como string binario
    // Pero cuando pasamos un string hexadecimal, PHP lo interpreta como binario
    // Necesitamos convertir el hex string a Buffer
    const key = Buffer.from(keyHex, 'hex');
    
    // IV: substr(hash('sha256', ENCRYPT_SECRET_IV), 0, 16)
    // Esto devuelve un string de 16 caracteres hexadecimales
    const ivHashHex = crypto.createHash('sha256')
        .update(ENCRYPT_SECRET_IV)
        .digest('hex');
    
    const ivString = ivHashHex.substring(0, 16); // 16 caracteres
    
    console.log('🔑 Key PHP (hex):', keyHex);
    console.log('🔐 IV PHP (16 chars):', ivString);
    console.log('🔐 IV como string:', ivString);
    
    // CRÍTICO: En PHP, el IV se pasa como string de 16 caracteres
    // openssl_encrypt en PHP espera un string de 16 bytes
    // Nuestro string de 16 caracteres se convierte automáticamente a bytes en PHP
    const iv = Buffer.from(ivString, 'utf8');
    
    console.log('🔑 Key Buffer:', key.toString('hex'));
    console.log('🔐 IV Buffer (hex):', iv.toString('hex'));
    console.log('🔐 IV Buffer length:', iv.length, 'bytes');
    
    return { key, iv };
}

// 🔐 ENCRIPTAR CONTRASEÑA - IDÉNTICO A PHP
export function encriptarContrasena(password) {
    try {
        console.log('\n🔐 ENCRIPTANDO (PHP compatible)...');
        console.log('📝 Contraseña:', password);
        
        const { key, iv } = generarClavesPHP();
        
        // openssl_encrypt en PHP
        const cipher = crypto.createCipheriv(ENCRYPT_METHOD, key, iv);
        
        let encrypted = cipher.update(password, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        
        console.log('🔐 openssl_encrypt result:', encrypted);
        
        // base64_encode en PHP
        const resultadoFinal = Buffer.from(encrypted).toString('base64');
        
        console.log('🔐 base64_encode result:', resultadoFinal);
        
        // Verificar con el resultado esperado de PHP
        const resultadoEsperadoPHP = 'ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09';
        console.log('🔐 Resultado esperado PHP:', resultadoEsperadoPHP);
        console.log('✅ ¿Coinciden?:', resultadoFinal === resultadoEsperadoPHP ? 'SÍ' : 'NO');
        
        return resultadoFinal;
        
    } catch (error) {
        console.error('❌ Error encriptando:', error.message);
        return null;
    }
}

// 🔓 DESENCRIPTAR CONTRASEÑA - IDÉNTICO A PHP
export function desencriptarContrasena(encrypted) {
    try {
        console.log('\n🔓 DESENCRIPTANDO...');
        console.log('🔐 Texto encriptado:', encrypted);
        
        const { key, iv } = generarClavesPHP();
        
        // base64_decode en PHP
        const decodedOnce = Buffer.from(encrypted, 'base64').toString('utf8');
        console.log('🔓 Después de base64_decode:', decodedOnce);
        
        // openssl_decrypt en PHP
        const decipher = crypto.createDecipheriv(ENCRYPT_METHOD, key, iv);
        
        let decrypted = decipher.update(decodedOnce, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        
        console.log('🔓 Contraseña desencriptada:', decrypted);
        
        return decrypted;
        
    } catch (error) {
        console.error('❌ Error desencriptando:', error.message);
        return null;
    }
}

// 🧪 PRUEBA DE COMPATIBILIDAD COMPLETA
export function probarEncriptacion() {
    console.log('\n🧪 PRUEBA DE COMPATIBILIDAD PHP-NODE.JS 🧪\n');
    
    const password = '123456789';
    const resultadoEsperadoPHP = 'ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09';
    
    console.log('📝 Contraseña de prueba:', password);
    console.log('🎯 Resultado esperado PHP:', resultadoEsperadoPHP);
    console.log('\n' + '='.repeat(50));
    
    // 1. Encriptar
    const resultado = encriptarContrasena(password);
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 RESULTADO:');
    console.log('Node.js:', resultado);
    console.log('PHP:     ', resultadoEsperadoPHP);
    
    if (resultado === resultadoEsperadoPHP) {
        console.log('\n🎉 ¡COMPATIBILIDAD 100% CONFIRMADA! 🎉');
        
        // 2. Probar desencriptación
        console.log('\n🔍 PROBANDO DESENCRIPTACIÓN:');
        const desencriptado = desencriptarContrasena(resultado);
        console.log('Desencriptado:', desencriptado);
        console.log('¿Funciona?:', desencriptado === password ? '✅ SÍ' : '❌ NO');
        
        if (desencriptado === password) {
            console.log('\n✅ ¡Sistema de encriptación funcionando correctamente!');
            console.log('\n📋 COMANDO SQL PARA ACTUALIZAR CONTRASEÑA:');
            console.log("UPDATE usuariosprueba SET password = 'ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09', fecha_insert = NOW() WHERE usuario = 'Dep_centro_de_computo';");
        }
        
        return true;
    } else {
        console.log('\n❌ NO HAY COMPATIBILIDAD');
        
        // Intentar diagnosticar el problema
        console.log('\n🔍 DIAGNÓSTICO:');
        
        // Calcular el hash SHA256 de '990520' para ver el IV
        const ivHashHex = crypto.createHash('sha256')
            .update(ENCRYPT_SECRET_IV)
            .digest('hex');
        
        console.log('Hash SHA256 de "990520":', ivHashHex);
        console.log('Primeros 16 caracteres:', ivHashHex.substring(0, 16));
        console.log('Como Buffer (hex):', Buffer.from(ivHashHex.substring(0, 16), 'utf8').toString('hex'));
        
        return false;
    }
}

// 🔄 FUNCIÓN PARA USAR EN app.js
export function encriptarContrasenaParaBD(password) {
    const resultado = encriptarContrasena(password);
    if (resultado) {
        console.log(`🔐 Contraseña encriptada para BD: ${resultado}`);
        return resultado;
    }
    return null;
}