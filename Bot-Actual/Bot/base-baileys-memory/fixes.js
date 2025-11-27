// fixes.js - Correcciones críticas para app.js

// 1. Corrección para TimeoutManager - eliminar duplicados
class TimeoutManagerFixed {
  constructor() {
    this.timeouts = new Map();
    this.intervals = new Map();
  }

  setTimeout(userPhone, callback, delay) {
    this.clearTimeout(userPhone);
    const timeoutId = setTimeout(callback, delay);
    this.timeouts.set(userPhone, timeoutId);
    return timeoutId;
  }

  setInterval(userPhone, callback, delay) {
    this.clearInterval(userPhone);
    const intervalId = setInterval(callback, delay);
    this.intervals.set(userPhone, intervalId);
    return intervalId;
  }

  clearTimeout(userPhone) {
    if (this.timeouts.has(userPhone)) {
      clearTimeout(this.timeouts.get(userPhone));
      this.timeouts.delete(userPhone);
    }
  }

  clearInterval(userPhone) {
    if (this.intervals.has(userPhone)) {
      clearInterval(this.intervals.get(userPhone));
      this.intervals.delete(userPhone);
    }
  }

  clearAll(userPhone) {
    this.clearTimeout(userPhone);
    this.clearInterval(userPhone);
  }
}

// 2. Configuración de base de datos para funciones específicas
const DB_CONFIG_ACTEXTITA = {
  host: '172.30.247.186',
  user: 'root',
  password: '',
  database: 'actextita',
  port: 3306
};

// 3. Función de redirección segura
async function redirigirAMenuSeguro(ctx, state, gotoFlow, flowDynamic) {
  try {
    await limpiarEstado(state);
    await new Promise(resolve => setTimeout(resolve, 150));
    return gotoFlow(flowMenu);
  } catch (error) {
    console.error('❌ Error en redirección:', error);
    await flowDynamic('🔄 Reiniciando... Escribe *menú* para continuar.');
    await limpiarEstado(state);
    return gotoFlow(flowMenu);
  }
}

module.exports = {
  TimeoutManagerFixed,
  DB_CONFIG_ACTEXTITA,
  redirigirAMenuSeguro
};