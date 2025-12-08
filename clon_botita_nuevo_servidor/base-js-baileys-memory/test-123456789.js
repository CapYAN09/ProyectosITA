// test-123456789.js
import { encriptarContrasena, probarEncriptacionCompatible } from './src/encriptacion.js';

console.log('🧪 PRUEBA ESPECÍFICA CONTRASEÑA: 123456789\n');

// Prueba 1: Usando función de prueba completa
console.log('1. 🔍 PRUEBA COMPLETA DE COMPATIBILIDAD:');
probarEncriptacionCompatible();

console.log('\n══════════════════════════════════════════════════\n');

// Prueba 2: Solo encriptación directa
console.log('2. 🔐 ENCRIPTACIÓN DIRECTA:');
const resultadoDirecto = encriptarContrasena('123456789');
console.log('Resultado:', resultadoDirecto);

// Crear archivo PHP de prueba
import fs from 'fs';

const phpTestCode = `<?php
// test_123456789.php
// Subir a 172.30.247.185 y ejecutar

include_once 'C:/xampp/htdocs/helpdeskita_2/clases/funciones_encriptacion.php';

echo "🧪 PRUEBA DE COMPATIBILIDAD PHP-NODE.JS\\n";
echo "🔐 CONTRASEÑA: 123456789\\n\\n";

// Resultado PHP
\$resultado_php = getEncryptedPassword('123456789');
echo "🔐 RESULTADO PHP:\\n";
echo "'\$resultado_php'\\n";
echo "Longitud: " . strlen(\$resultado_php) . " caracteres\\n\\n";

// Resultado Node.js esperado
echo "🔐 RESULTADO NODE.JS ESPERADO:\\n";
'${resultadoDirecto}'\\n";
echo "Longitud: ${resultadoDirecto ? resultadoDirecto.length : 0} caracteres\\n\\n";

// Comparación
echo "📊 COMPARACIÓN:\\n";
if (\$resultado_php === '${resultadoDirecto}') {
    echo "✅ ¡COMPATIBLES! Los resultados son IDÉNTICOS.\\n";
} else {
    echo "❌ INCOMPATIBLES. Los resultados son DIFERENTES.\\n\\n";
    
    echo "🔍 ANALIZANDO DIFERENCIAS:\\n";
    echo "PHP:   '\$resultado_php'\\n";
    echo "Node:  '${resultadoDirecto}'\\n\\n";
    
    // Mostrar proceso paso a paso
    echo "🔧 PROCESO PASO A PASO EN PHP:\\n";
    \$key = hash('sha256', ENCRYPT_SECRET_KEY);
    \$iv = substr(hash('sha256', ENCRYPT_SECRET_IV), 0, 16);
    
    echo "1. Key (sha256): \$key\\n";
    echo "2. IV (32 chars hex): " . bin2hex(\$iv) . "\\n";
    
    \$paso1 = openssl_encrypt('123456789', ENCRYPT_METHOD, \$key, 0, \$iv);
    echo "3. openssl_encrypt: '\$paso1'\\n";
    
    \$paso2 = base64_encode(\$paso1);
    echo "4. base64_encode: '\$paso2'\\n";
    
    echo "\\n📏 LONGITUDES:\\n";
    echo "Paso 1: " . strlen(\$paso1) . " chars\\n";
    echo "Paso 2: " . strlen(\$paso2) . " chars\\n";
}

// Probar desencriptación
echo "\\n🔓 PRUEBA DE DESENCRIPTACIÓN:\\n";
\$desencriptado = getUnencryptedPassword(\$resultado_php);
echo "PHP: '\$resultado_php' → '\$desencriptado'\\n";
echo "¿Coincide?: " . ('123456789' === \$desencriptado ? '✅ SÍ' : '❌ NO') . "\\n";
?>`;

fs.writeFileSync('test_123456789.php', phpTestCode);
console.log('\n✅ Archivo PHP creado: test_123456789.php');
console.log('📤 Instrucciones:');
console.log('   1. Subir test_123456789.php a 172.30.247.185');
console.log('   2. Ejecutar: http://172.30.247.185/test_123456789.php');
console.log('   3. Comparar resultados');