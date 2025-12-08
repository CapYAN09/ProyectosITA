// test-compatibilidad-final.js
import { probarEncriptacion } from './src/encriptacion.js';

console.log('🧪 PRUEBA FINAL DE COMPATIBILIDAD PHP-NODE.JS 🧪\n');
console.log('='.repeat(60));

const compatible = probarEncriptacion();

console.log('\n' + '='.repeat(60));
console.log('ESTADO FINAL:', compatible ? '✅ COMPATIBLE' : '❌ NO COMPATIBLE');

if (!compatible) {
    console.log('\n🔄 Prueba alternativa con valores exactos del hash...');
    
    // Calcular el hash exacto
    const crypto = await import('crypto');
    
    const keyHash = crypto.createHash('sha256')
        .update('Tecnologico')
        .digest('hex');
    
    const ivHash = crypto.createHash('sha256')
        .update('990520')
        .digest('hex');
    
    console.log('\n🔑 Key hash:', keyHash);
    console.log('🔐 IV hash completo:', ivHash);
    console.log('🔐 IV primeros 16 chars:', ivHash.substring(0, 16));
    console.log('🔐 IV como bytes:', Buffer.from(ivHash.substring(0, 16), 'utf8'));
}