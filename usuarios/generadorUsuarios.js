// usuarios/generadorUsuarios.js
require('dotenv').config();
const zmq = require('zeromq');
const fs = require('fs');
const path = require('path');

if (!process.env.SERVER_IP || !process.env.SERVER_PORT_REP) {
    throw new Error("Las variables de entorno SERVER_IP o SERVER_PORT_REP no están definidas");
}

const serverRepAddress = `tcp://${process.env.SERVER_IP}:${process.env.SERVER_PORT_REP}`;
const archivoPosiciones = process.argv[5];
const rutaArchivoPosiciones = path.resolve(archivoPosiciones);

if (!fs.existsSync(rutaArchivoPosiciones)) {
    console.error(`El archivo de posiciones no existe en la ruta: ${rutaArchivoPosiciones}`);
    process.exit(1);
}

let posiciones;
try {
    posiciones = JSON.parse(fs.readFileSync(rutaArchivoPosiciones, 'utf-8'));
} catch (error) {
    console.error(`Error al leer o parsear el archivo de posiciones: ${error.message}`);
    process.exit(1);
}

async function crearUsuario(id, x, y) {
    const socketReq = new zmq.Request();
    console.log(`Usuario ${id}: Conectando a ${serverRepAddress}`);
    await socketReq.connect(serverRepAddress);

    async function solicitarTaxi(tiempoEsperaInicial) {
        console.log(`Usuario ${id}: Solicitando un taxi desde (${x}, ${y}) en t=${tiempoEsperaInicial} segundos.`);
        const solicitud = { type: 'request_assignment', idUsuario: id, xUsuario: x, yUsuario: y };
        const tiempoInicio = Date.now();

        try {
            await socketReq.send(JSON.stringify(solicitud));
            const [msg] = await Promise.race([
                socketReq.receive(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)) // Timeout de 5 segundos
            ]);

            const respuesta = JSON.parse(msg.toString());
            const tiempoRespuesta = ((Date.now() - tiempoInicio) / 1000).toFixed(3);

            if (respuesta.exito) {
                console.log(`Usuario ${id}: Taxi asignado (ID: ${respuesta.idTaxi}) en ${tiempoRespuesta} segundos.`);
                await socketReq.close();
            } else {
                console.log(`Usuario ${id}: ${respuesta.mensaje}. Tiempo de respuesta: ${tiempoRespuesta} segundos.`);
                await socketReq.close();
            }
        } catch (error) {
            if (error.message === 'timeout') {
                console.log(`Usuario ${id}: Tiempo de espera agotado, tiempo de respuesta: 5.000 segundos.`);
            } else {
                console.log(`Usuario ${id}: Error en la solicitud: ${error.message}`);
            }
            await socketReq.close();
        }
    }

    // Generar un tiempo de espera inicial aleatorio entre 1 y 10 segundos
    const tiempoEsperaInicial = Math.floor(Math.random() * 10) + 1;
    setTimeout(() => solicitarTaxi(tiempoEsperaInicial), tiempoEsperaInicial * 1000);
}

async function generarUsuarios(numUsuarios, n, m) {
    let usuarioId = 1;
    const processUniqueId = process.pid;

    for (let i = 0; i < numUsuarios; i++) {
        const posicion = posiciones[Math.floor(Math.random() * posiciones.length)];
        const { x, y } = posicion;
        const uniqueUsuarioId = `${processUniqueId}_${usuarioId++}`;
        crearUsuario(uniqueUsuarioId, x, y);
    }
}

const [numUsuarios, n, m] = process.argv.slice(2, 5);

if (!numUsuarios || !n || !m || !process.argv[5]) {
    console.error("Uso: node generadorUsuarios.js <numUsuarios> <N> <M> <archivoPosiciones>");
    process.exit(1);
}

generarUsuarios(parseInt(numUsuarios), parseInt(n), parseInt(m))
    .then(() => {
        console.log(`Generador de usuarios ha generado ${numUsuarios} usuarios y continúa activo.`);
        // Mantener el proceso activo indefinidamente
        setInterval(() => {}, 1000);
    })
    .catch(error => {
        console.error(`Error al generar usuarios: ${error.message}`);
        process.exit(1);
    });
