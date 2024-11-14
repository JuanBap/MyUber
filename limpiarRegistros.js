
const fs = require('fs');
const path = require('path');

function limpiarRegistros() {
    const logPath = path.join(__dirname, 'taxilog.json');
    
    // Estructura inicial del archivo
    const initialLog = {
        taxis: {},
        servicios: {
            exitosos: 0,
            negados: 0
        },
        movimientos: []
    };

    try {
        // Escribir la estructura inicial
        fs.writeFileSync(logPath, JSON.stringify(initialLog, null, 2));
        console.log('✅ Archivo taxilog.json limpiado exitosamente');
        console.log('📁 Nueva estructura:');
        console.log(JSON.stringify(initialLog, null, 2));
    } catch (error) {
        console.error('❌ Error al limpiar el archivo:', error.message);
    }
}

// Ejecutar la limpieza
limpiarRegistros();