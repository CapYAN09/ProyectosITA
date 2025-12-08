// test-dep-centro-computo-123456789.js
import { encriptarContrasena, desencriptarContrasena } from './src/encriptacion.js';

console.log('🧪 PRUEBA ESPECÍFICA: Dep_centro_de_computo con contraseña 123456789\n');

const USUARIO = 'Dep_centro_de_computo';
const CONTRASENA = '123456789';

console.log('📋 DATOS DE PRUEBA:');
console.log(`👤 Usuario: ${USUARIO}`);
console.log(`🔐 Contraseña: ${CONTRASENA}`);
console.log('');

// 1. Encriptar en Node.js
console.log('🔐 ENCRIPTANDO EN NODE.JS:');
const encriptadaNode = encriptarContrasena(CONTRASENA);

if (encriptadaNode) {
    console.log('✅ Contraseña encriptada en Node.js:', encriptadaNode);
    console.log('📏 Longitud:', encriptadaNode.length, 'caracteres');
    
    // 2. Desencriptar para verificar
    const desencriptadaNode = desencriptarContrasena(encriptadaNode);
    console.log('🔓 Contraseña desencriptada en Node.js:', desencriptadaNode);
    console.log('✅ ¿Coincide con la original?:', CONTRASENA === desencriptadaNode ? 'SÍ ✅' : 'NO ❌');
    
    // 3. Crear archivo SQL para actualizar
    console.log('\n📋 COMANDO SQL PARA ACTUALIZAR EN LA BD:');
    console.log(`UPDATE usuariosprueba SET password = '${encriptadaNode}', fecha_insert = NOW() WHERE usuario = '${USUARIO}';`);
    
    // 4. Crear script PHP de prueba
    console.log('\n📋 SCRIPT PHP PARA VERIFICAR EN EL SERVIDOR:');
    const phpTestCode = `<?php
// test_dep_centro_computo.php
// Subir a 172.30.247.185 y ejecutar

include_once 'C:/xampp/htdocs/helpdeskita_2/clases/funciones_encriptacion.php';

echo "🧪 PRUEBA PARA Dep_centro_de_computo\\n";
echo "🔐 CONTRASEÑA: 123456789\\n\\n";

// 1. Encriptar en PHP
\\$encriptada_php = getEncryptedPassword('123456789');
echo "🔐 RESULTADO PHP:\\n";
echo "\\$encriptada_php\\n";
echo "📏 Longitud: " . strlen(\\$encriptada_php) . " caracteres\\n\\n";

// 2. Resultado esperado de Node.js
echo "🔐 RESULTADO NODE.JS ESPERADO:\\n";
echo '${encriptadaNode}' . "\\n";
echo "📏 Longitud: ${encriptadaNode.length} caracteres\\n\\n";

// 3. Comparación
echo "📊 COMPARACIÓN:\\n";
if (\\$encriptada_php === '${encriptadaNode}') {
    echo "✅ ¡COMPATIBLES! Los resultados son IDÉNTICOS.\\n\\n";
    
    echo "📋 COMANDO SQL PARA ACTUALIZAR:\\n";
    echo "UPDATE usuariosprueba SET password = '\\$encriptada_php', fecha_insert = NOW() WHERE usuario = '${USUARIO}';\\n\\n";
    
    echo "🔓 PRUEBA DE DESENCRIPTACIÓN:\\n";
    \\$desencriptada = getUnencryptedPassword(\\$encriptada_php);
    echo "PHP: '\\$encriptada_php' → '\\$desencriptada'\\n";
    echo "¿Coincide con '123456789'?: " . ('123456789' === \\$desencriptada ? '✅ SÍ' : '❌ NO') . "\\n";
} else {
    echo "❌ INCOMPATIBLES. Los resultados son DIFERENTES.\\n\\n";
    
    echo "🔍 DIFERENCIAS:\\n";
    echo "PHP:   '\\$encriptada_php'\\n";
    echo "Node:  '${encriptadaNode}'\\n\\n";
    
    // Mostrar proceso paso a paso
    echo "🔧 PROCESO PASO A PASO EN PHP:\\n";
    \\$key = hash('sha256', ENCRYPT_SECRET_KEY);
    \\$iv = substr(hash('sha256', ENCRYPT_SECRET_IV), 0, 16);
    
    echo "1. Key (sha256): \\$key\\n";
    echo "2. IV (32 chars hex): " . bin2hex(\\$iv) . "\\n";
    
    \\$paso1 = openssl_encrypt('123456789', ENCRYPT_METHOD, \\$key, 0, \\$iv);
    echo "3. openssl_encrypt: '\\$paso1'\\n";
    echo "   Longitud: " . strlen(\\$paso1) . " chars\\n";
    
    \\$paso2 = base64_encode(\\$paso1);
    echo "4. base64_encode: '\\$paso2'\\n";
    echo "   Longitud: " . strlen(\\$paso2) . " chars\\n";
}
?>`;
    
    // Guardar archivo PHP
    import fs from 'fs';
    fs.writeFileSync('test_dep_centro_computo.php', phpTestCode);
    console.log('✅ Archivo PHP creado: test_dep_centro_computo.php');
    console.log('\n📤 INSTRUCCIONES:');
    console.log('1. Subir test_dep_centro_computo.php a 172.30.247.185');
    console.log('2. Ejecutar: http://172.30.247.185/test_dep_centro_computo.php');
    console.log('3. Si los resultados son iguales, ejecutar este comando SQL:');
    console.log(`   UPDATE usuariosprueba SET password = '${encriptadaNode}', fecha_insert = NOW() WHERE usuario = '${USUARIO}';`);
    
} else {
    console.error('❌ Error al encriptar la contraseña en Node.js');
}