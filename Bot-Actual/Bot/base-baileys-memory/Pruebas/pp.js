async function consultarAlumnoEnBaseDatos(numeroControl) {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '', // 🔧 AGREGAR contraseña si es necesaria
      database: 'basededatos',
      port: 3306
    });

    // Consultar en ambas tablas
    const [anuevoIngreso] = await connection.execute(
      'SELECT * FROM datos WHERE numero = ?',
      [numeroControl]
    );

    const [aResagados] = await connection.execute(
      'SELECT * FROM datos12 WHERE numero1 = ?',
      [numeroControl]
    );

    if (anuevoIngreso.length > 0) {
      return { encontrado: true, ...anuevoIngreso[0] };
    } else if (aResagados.length > 0) {
      return { encontrado: true, ...aResagados[0] };
    } else {
      return { encontrado: false };
    }

  } catch (error) {
    console.error('Error consultando:', error.message);
    return { encontrado: false, error: error.message };
  } finally {
    if (connection) await connection.end();
  }
}