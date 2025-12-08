<?php
// test_dep_centro_computo.php
// Subir a 172.30.247.185 y ejecutar

include_once 'C:/xampp/htdocs/helpdeskita_2/clases/funciones_encriptacion.php';

echo "🧪 PRUEBA PARA Dep_centro_de_computo<br>";
echo "🔐 CONTRASEÑA: 123456789<br><br>";

// 1. Encriptar en PHP
$encriptada_php = getEncryptedPassword('123456789');
echo "🔐 RESULTADO PHP:<br>";
echo $encriptada_php . "<br>";
echo "📏 Longitud: " . strlen($encriptada_php) . " caracteres<br><br>";

// 2. Resultado esperado de Node.js
echo "🔐 RESULTADO NODE.JS ESPERADO:<br>";
echo 'eU5wWDNQdXB5NEZBU0JhNTBkRWZsdz09' . "<br>";
echo "📏 Longitud: 32 caracteres<br><br>";

// 3. Comparación
echo "📊 COMPARACIÓN:<br>";
if ($encriptada_php === 'eU5wWDNQdXB5NEZBU0JhNTBkRWZsdz09') {
    echo "✅ ¡COMPATIBLES! Los resultados son IDÉNTICOS.<br><br>";
    
    echo "📋 COMANDO SQL PARA ACTUALIZAR:<br>";
    echo "UPDATE usuariosprueba SET password = '" . $encriptada_php . "', fecha_insert = NOW() WHERE usuario = 'Dep_centro_de_computo';<br><br>";
    
    echo "🔓 PRUEBA DE DESENCRIPTACIÓN:<br>";
    $desencriptada = getUnencryptedPassword($encriptada_php);
    echo "PHP: '" . $encriptada_php . "' → '" . $desencriptada . "'<br>";
    echo "¿Coincide con '123456789'?: " . ('123456789' === $desencriptada ? '✅ SÍ' : '❌ NO') . "<br>";
} else {
    echo "❌ INCOMPATIBLES. Los resultados son DIFERENTES.<br><br>";
    
    echo "🔍 DIFERENCIAS:<br>";
    echo "PHP:   '" . $encriptada_php . "'<br>";
    echo "Node:  'eU5wWDNQdXB5NEZBU0JhNTBkRWZsdz09'<br><br>";
    
    // Mostrar proceso paso a paso
    echo "🔧 PROCESO PASO A PASO EN PHP:<br>";
    $key = hash('sha256', ENCRYPT_SECRET_KEY);
    $iv = substr(hash('sha256', ENCRYPT_SECRET_IV), 0, 16);
    
    echo "1. Key (sha256): " . $key . "<br>";
    echo "2. IV (32 chars hex): " . bin2hex($iv) . "<br>";
    
    $paso1 = openssl_encrypt('123456789', ENCRYPT_METHOD, $key, 0, $iv);
    echo "3. openssl_encrypt: '" . $paso1 . "'<br>";
    echo "   Longitud: " . strlen($paso1) . " chars<br>";
    
    $paso2 = base64_encode($paso1);
    echo "4. base64_encode: '" . $paso2 . "'<br>";
    echo "   Longitud: " . strlen($paso2) . " chars<br>";
}
?>