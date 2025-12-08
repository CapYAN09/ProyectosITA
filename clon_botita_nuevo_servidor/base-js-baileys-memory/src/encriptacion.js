// src/encriptacion.js - VERSIÓN 100% COMPATIBLE CON PHP
import crypto from 'crypto';

// 🔐 CONSTANTES IDÉNTICAS AL PHP
const ENCRYPT_METHOD = 'AES-256-CBC';        // ⚠️ IMPORTANTE: Mismo caso que PHP
const ENCRYPT_SECRET_KEY = 'Tecnologico';    // ⚠️ EXACTAMENTE igual
const ENCRYPT_SECRET_IV = '990520';          // ⚠️ EXACTAMENTE igual

// Generar clave y IV (EXACTAMENTE igual que en PHP)
function generarClaveYIV() {
    // En PHP: $key = hash('sha256', ENCRYPT_SECRET_KEY);
    // IMPORTANTE: En PHP hash() devuelve string hexadecimal en minúsculas
    const key = crypto.createHash('sha256').update(ENCRYPT_SECRET_KEY).digest('hex');
    
    // En PHP: $iv = substr(hash('sha256', ENCRYPT_SECRET_IV), 0, 16);
    // hash() devuelve string hex, substr toma primeros 16 caracteres (32 hex chars = 16 bytes)
    const ivHex = crypto.createHash('sha256').update(ENCRYPT_SECRET_IV).digest('hex');
    const ivHex16 = ivHex.substring(0, 32); // 32 caracteres hex = 16 bytes
    const iv = Buffer.from(ivHex16, 'hex');
    
    return { key, iv };
}

// 🔐 Encriptar contraseña (IDÉNTICO a getEncryptedPassword en PHP)
export function encriptarContrasena(password) {
    try {
        console.log('🔐 Iniciando encriptación (compatible PHP)...');
        console.log('📝 Contraseña original:', password);
        
        const { key, iv } = generarClaveYIV();
        
        // En PHP: $output = openssl_encrypt($password, ENCRYPT_METHOD, $key, 0, $iv);
        // key es string hexadecimal
        const keyBuffer = Buffer.from(key, 'hex');
        
        const cipher = crypto.createCipheriv(ENCRYPT_METHOD, keyBuffer, iv);
        
        // Encriptar
        let encriptado = cipher.update(password, 'utf8', 'base64');
        encriptado += cipher.final('base64');
        
        // En PHP: return base64_encode($output);
        // Pero openssl_encrypt ya devuelve base64, y luego se hace base64_encode
        // Esto significa: base64_encode(openssl_encrypt(...))
        // openssl_encrypt devuelve base64, y luego se codifica OTRA VEZ en base64
        const doubleBase64 = Buffer.from(encriptado).toString('base64');
        
        console.log('🔐 Después de openssl_encrypt (base64):', encriptado);
        console.log('🔐 Después de base64_encode (double):', doubleBase64);
        console.log('📏 Longitud final:', doubleBase64.length, 'caracteres');
        
        return doubleBase64;
    } catch (error) {
        console.error('❌ Error encriptando contraseña:', error.message);
        return null;
    }
}

// 🔓 Desencriptar contraseña (IDÉNTICO a getUnencryptedPassword en PHP)
export function desencriptarContrasena(encrypted) {
    try {
        console.log('🔓 Iniciando desencriptación (compatible PHP)...');
        
        const { key, iv } = generarClaveYIV();
        const keyBuffer = Buffer.from(key, 'hex');
        
        // En PHP: base64_decode($encrypted) primero
        // Luego: openssl_decrypt(..., ENCRYPT_METHOD, $key, 0, $iv)
        const decodedOnce = Buffer.from(encrypted, 'base64').toString('utf8');
        
        const decipher = crypto.createDecipheriv(ENCRYPT_METHOD, keyBuffer, iv);
        
        let desencriptado = decipher.update(decodedOnce, 'base64', 'utf8');
        desencriptado += decipher.final('utf8');
        
        console.log('🔓 Contraseña desencriptada:', desencriptado);
        
        return desencriptado;
    } catch (error) {
        console.error('❌ Error desencriptando contraseña:', error.message);
        
        // Intentar método alternativo si el primero falla
        console.log('🔄 Intentando método alternativo...');
        try {
            const { key, iv } = generarClaveYIV();
            const keyBuffer = Buffer.from(key, 'hex');
            
            const decipher = crypto.createDecipheriv(ENCRYPT_METHOD, keyBuffer, iv);
            
            // Probar sin el doble base64
            let desencriptado = decipher.update(encrypted, 'base64', 'utf8');
            desencriptado += decipher.final('utf8');
            
            console.log('🔓 (Alternativo) Contraseña desencriptada:', desencriptado);
            return desencriptado;
        } catch (error2) {
            console.error('❌ Error en método alternativo:', error2.message);
            return null;
        }
    }
}

// 🔍 Función para probar compatibilidad exacta
export function probarEncriptacionCompatible() {
    console.log('\n🧪 PROBANDO COMPATIBILIDAD EXACTA CON PHP\n');
    
    const testPassword = '123456789';
    console.log('🔐 Contraseña de prueba:', testPassword);
    console.log('📋 Configuración PHP:');
    console.log('   ENCRYPT_METHOD:', ENCRYPT_METHOD);
    console.log('   ENCRYPT_SECRET_KEY:', ENCRYPT_SECRET_KEY);
    console.log('   ENCRYPT_SECRET_IV:', ENCRYPT_SECRET_IV);
    console.log('');
    
    // Proceso paso a paso igual que PHP
    console.log('🔧 PROCESO PASO A PASO (igual que PHP):');
    
    // Paso 1: Generar key (hash sha256)
    const key = crypto.createHash('sha256').update(ENCRYPT_SECRET_KEY).digest('hex');
    console.log('1. Key (sha256):', key);
    console.log('   Longitud:', key.length, 'caracteres hex');
    
    // Paso 2: Generar iv (primeros 16 chars de hash sha256)
    const ivHex = crypto.createHash('sha256').update(ENCRYPT_SECRET_IV).digest('hex');
    const ivHex16 = ivHex.substring(0, 32); // 32 chars hex = 16 bytes
    console.log('2. IV Full (sha256):', ivHex);
    console.log('   IV primeros 16 bytes (32 chars hex):', ivHex16);
    
    const iv = Buffer.from(ivHex16, 'hex');
    console.log('   IV Buffer:', iv.toString('hex'));
    console.log('   Longitud IV:', iv.length, 'bytes');
    
    // Paso 3: openssl_encrypt
    const keyBuffer = Buffer.from(key, 'hex');
    const cipher = crypto.createCipheriv(ENCRYPT_METHOD, keyBuffer, iv);
    let opensslResult = cipher.update(testPassword, 'utf8', 'base64');
    opensslResult += cipher.final('base64');
    console.log('3. openssl_encrypt result (base64):', opensslResult);
    
    // Paso 4: base64_encode (doble base64)
    const finalResult = Buffer.from(opensslResult).toString('base64');
    console.log('4. base64_encode result (doble):', finalResult);
    console.log('   Longitud final:', finalResult.length, 'caracteres');
    
    // Probar con función principal
    console.log('\n🔐 USANDO FUNCIÓN PRINCIPAL:');
    const encriptado = encriptarContrasena(testPassword);
    
    if (encriptado) {
        console.log('✅ Encriptado:', encriptado);
        
        // Desencriptar
        const desencriptado = desencriptarContrasena(encriptado);
        console.log('🔓 Desencriptado:', desencriptado);
        console.log('✅ ¿Coincide?:', testPassword === desencriptado ? 'SÍ ✅' : 'NO ❌');
        
        // Generar código PHP para comparar
        console.log('\n📋 PARA COMPARAR EN PHP (172.30.247.185):');
        console.log(`
<?php
include_once 'C:/xampp/htdocs/helpdeskita_2/clases/funciones_encriptacion.php';

\$test = '123456789';
\$resultado_php = getEncryptedPassword(\$test);

echo "🔐 PHP: '\$test' → '\$resultado_php'\\n";
echo "📏 Longitud PHP: " . strlen(\$resultado_php) . "\\n\\n";
echo "🔐 Node.js esperado: '${encriptado}'\\n";
echo "📏 Longitud Node.js: ${encriptado.length}\\n\\n";
echo "📊 ¿Son idénticas?: " . (\$resultado_php === '${encriptado}' ? '✅ SÍ' : '❌ NO') . "\\n";

if (\$resultado_php !== '${encriptado}') {
    echo "\\n🔍 DIFERENCIAS:\\n";
    echo "PHP:   '\$resultado_php'\\n";
    echo "Node:  '${encriptado}'\\n";
    
    // Mostrar detalles
    \$key = hash('sha256', ENCRYPT_SECRET_KEY);
    \$iv = substr(hash('sha256', ENCRYPT_SECRET_IV), 0, 16);
    echo "\\n🔧 DETALLES PHP:\\n";
    echo "Key: \$key\\n";
    echo "IV (hex): " . bin2hex(\$iv) . "\\n";
    
    \$paso1 = openssl_encrypt(\$test, ENCRYPT_METHOD, \$key, 0, \$iv);
    echo "\\nPaso 1 (openssl_encrypt): '\$paso1'\\n";
    \$paso2 = base64_encode(\$paso1);
    echo "Paso 2 (base64_encode): '\$paso2'\\n";
}
?>
        `);
    }
    
    return encriptado;
}