<?php
// test_dep_centro_computo.php
// Subir a 172.30.247.185 y ejecutar

include_once 'C:/xampp/htdocs/helpdeskita_2/clases/funciones_encriptacion.php';

echo "🧪 PRUEBA PARA Dep_centro_de_computo\n";
echo "🔐 CONTRASEÑA: 123456789\n\n";

// 1. Encriptar en PHP
\$encriptada_php = getEncryptedPassword('123456789');
echo "🔐 RESULTADO PHP:\n";
echo \$encriptada_php . "\n";
echo "📏 Longitud: " . strlen(\$encriptada_php) . " caracteres\n\n";

// 2. Resultado esperado de Node.js
echo "🔐 RESULTADO NODE.JS ESPERADO:\n";
echo 'eU5wWDNQdXB5NEZBU0JhNTBkRWZsdz09' . "\n";
echo "📏 Longitud: 32 caracteres\n\n";

// 3. Comparación
echo "📊 COMPARACIÓN:\n";
if (\$encriptada_php === 'eU5wWDNQdXB5NEZBU0JhNTBkRWZsdz09') {
    echo "✅ ¡COMPATIBLES! Los resultados son IDÉNTICOS.\n\n";
    
    echo "📋 COMANDO SQL PARA ACTUALIZAR:\n";
    echo "UPDATE usuariosprueba SET password = '\$encriptada_php', fecha_insert = NOW() WHERE usuario = 'Dep_centro_de_computo';\n\n";
    
    echo "🔓 PRUEBA DE DESENCRIPTACIÓN:\n";
    \$desencriptada = getUnencryptedPassword(\$encriptada_php);
    echo "PHP: '\$encriptada_php' → '\$desencriptada'\n";
    echo "¿Coincide con '123456789'?: " . ('123456789' === \$desencriptada ? '✅ SÍ' : '❌ NO') . "\n";
} else {
    echo "❌ INCOMPATIBLES. Los resultados son DIFERENTES.\n\n";
    
    echo "🔍 DIFERENCIAS:\n";
    echo "PHP:   '\$encriptada_php'\n";
    echo "Node:  'eU5wWDNQdXB5NEZBU0JhNTBkRWZsdz09'\n\n";
    
    // Mostrar proceso paso a paso
    echo "🔧 PROCESO PASO A PASO EN PHP:\n";
    \$key = hash('sha256', ENCRYPT_SECRET_KEY);
    \$iv = substr(hash('sha256', ENCRYPT_SECRET_IV), 0, 16);
    
    echo "1. Key (sha256): \$key\n";
    echo "2. IV (32 chars hex): " . bin2hex(\$iv) . "\n";
    
    \$paso1 = openssl_encrypt('123456789', ENCRYPT_METHOD, \$key, 0, \$iv);
    echo "3. openssl_encrypt: '\$paso1'\n";
    echo "   Longitud: " . strlen(\$paso1) . " chars\n";
    
    \$paso2 = base64_encode(\$paso1);
    echo "4. base64_encode: '\$paso2'\n";
    echo "   Longitud: " . strlen(\$paso2) . " chars\n";
}
?>