<?php
// test_123456789.php
// Subir a 172.30.247.185 y ejecutar

include_once 'C:/xampp/htdocs/helpdeskita_2/clases/funciones_encriptacion.php';

echo "🧪 PRUEBA DE COMPATIBILIDAD PHP-NODE.JS\n";
echo "🔐 CONTRASEÑA: 123456789\n\n";

// Resultado PHP
$resultado_php = getEncryptedPassword('123456789');
echo "🔐 RESULTADO PHP:\n";
echo "'$resultado_php'\n";
echo "Longitud: " . strlen($resultado_php) . " caracteres\n\n";

// Resultado Node.js esperado
echo "🔐 RESULTADO NODE.JS ESPERADO:\n";
'eU5wWDNQdXB5NEZBU0JhNTBkRWZsdz09'\n";
echo "Longitud: 32 caracteres\n\n";

// Comparación
echo "📊 COMPARACIÓN:\n";
if ($resultado_php === 'eU5wWDNQdXB5NEZBU0JhNTBkRWZsdz09') {
    echo "✅ ¡COMPATIBLES! Los resultados son IDÉNTICOS.\n";
} else {
    echo "❌ INCOMPATIBLES. Los resultados son DIFERENTES.\n\n";
    
    echo "🔍 ANALIZANDO DIFERENCIAS:\n";
    echo "PHP:   '$resultado_php'\n";
    echo "Node:  'eU5wWDNQdXB5NEZBU0JhNTBkRWZsdz09'\n\n";
    
    // Mostrar proceso paso a paso
    echo "🔧 PROCESO PASO A PASO EN PHP:\n";
    $key = hash('sha256', ENCRYPT_SECRET_KEY);
    $iv = substr(hash('sha256', ENCRYPT_SECRET_IV), 0, 16);
    
    echo "1. Key (sha256): $key\n";
    echo "2. IV (32 chars hex): " . bin2hex($iv) . "\n";
    
    $paso1 = openssl_encrypt('123456789', ENCRYPT_METHOD, $key, 0, $iv);
    echo "3. openssl_encrypt: '$paso1'\n";
    
    $paso2 = base64_encode($paso1);
    echo "4. base64_encode: '$paso2'\n";
    
    echo "\n📏 LONGITUDES:\n";
    echo "Paso 1: " . strlen($paso1) . " chars\n";
    echo "Paso 2: " . strlen($paso2) . " chars\n";
}

// Probar desencriptación
echo "\n🔓 PRUEBA DE DESENCRIPTACIÓN:\n";
$desencriptado = getUnencryptedPassword($resultado_php);
echo "PHP: '$resultado_php' → '$desencriptado'\n";
echo "¿Coincide?: " . ('123456789' === $desencriptado ? '✅ SÍ' : '❌ NO') . "\n";
?>