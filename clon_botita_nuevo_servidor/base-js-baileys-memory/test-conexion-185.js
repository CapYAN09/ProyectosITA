// test-conexion-bd.js
import mysql from 'mysql2/promise';

async function testConexionYActualizacion() {
  console.log('🔍 DIAGNÓSTICO DE CONEXIÓN Y ACTUALIZACIÓN\n');
  
  try {
    // 1. Conectar a la BD remota
    console.log('1. 🔗 Conectando a 172.30.247.185...');
    const connection = await mysql.createConnection({
      host: '172.30.247.185',
      user: 'ccomputo',
      password: 'Jarjar0904$',
      database: 'b1o04dzhm1guhvmjcrwb',
      port: 3306
    });
    
    console.log('✅ Conexión exitosa a la BD remota');
    
    // 2. Verificar si existe el usuario Dep_centro_de_computo
    console.log('\n2. 🔍 Verificando usuario Dep_centro_de_computo...');
    const [usuarios] = await connection.execute(
      'SELECT id_usuario, usuario, password, fecha_insert FROM usuariosprueba WHERE usuario = ?',
      ['Dep_centro_de_computo']
    );
    
    if (usuarios.length === 0) {
      console.log('❌ Usuario Dep_centro_de_computo NO encontrado en la tabla usuariosprueba');
      
      // Listar usuarios existentes
      const [todosUsuarios] = await connection.execute(
        'SELECT usuario FROM usuariosprueba LIMIT 10'
      );
      console.log('📋 Usuarios existentes (primeros 10):');
      todosUsuarios.forEach(user => console.log(`  - ${user.usuario}`));
    } else {
      const usuario = usuarios[0];
      console.log('✅ Usuario encontrado:');
      console.log(`   ID: ${usuario.id_usuario}`);
      console.log(`   Usuario: ${usuario.usuario}`);
      console.log(`   Password actual: ${usuario.password}`);
      console.log(`   Fecha inserción: ${usuario.fecha_insert}`);
      
      // 3. Probar actualización
      console.log('\n3. 🔄 Probando actualización...');
      
      const nuevaContrasenaEncriptada = 'ck1TTUM3ZHp0dmlERmY1bnJUbkEwUT09';
      
      const [resultado] = await connection.execute(
        'UPDATE usuariosprueba SET password = ?, fecha_insert = NOW() WHERE usuario = ?',
        [nuevaContrasenaEncriptada, 'Dep_centro_de_computo']
      );
      
      console.log(`✅ Filas afectadas: ${resultado.affectedRows}`);
      console.log(`✅ Password actualizado a: ${nuevaContrasenaEncriptada}`);
      
      // 4. Verificar el cambio
      console.log('\n4. 📋 Verificando cambio...');
      const [verificacion] = await connection.execute(
        'SELECT password FROM usuariosprueba WHERE usuario = ?',
        ['Dep_centro_de_computo']
      );
      
      if (verificacion.length > 0) {
        console.log(`✅ Password actual en BD: ${verificacion[0].password}`);
        console.log(`¿Coincide con el esperado?: ${verificacion[0].password === nuevaContrasenaEncriptada ? '✅ SÍ' : '❌ NO'}`);
      }
    }
    
    await connection.end();
    console.log('\n🎉 Diagnóstico completado');
    
  } catch (error) {
    console.error('❌ Error en diagnóstico:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Ejecutar diagnóstico
testConexionYActualizacion();