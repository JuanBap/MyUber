// usuarios/generadorUsuarios.js
require('dotenv').config();
const zmq = require('zeromq');
const fs = require('fs');
const path = require('path');
const process = require('process');

if (!process.env.BROKER_PORT || !process.env.BROKER_PUB_PORT) {
    throw new Error("Las variables de entorno BROKER_PORT o BROKER_PUB_PORT no están definidas");
}

const brokerRepAddress = `tcp://127.0.0.1:${process.env.BROKER_PORT}`; // Asumiendo broker en localhost
const brokerPubAddress = `tcp://127.0.0.1:${process.env.BROKER_PUB_PORT}`;

// Parámetros de entrada
const [numUsuarios, n, m, archivoPosiciones] = process.argv.slice(2, 6);

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

// Función para crear un usuario
async function crearUsuario(id, x, y) {
    const socketReq = new zmq.Request();
    const socketSub = new zmq.Subscriber();

    // Conectar al broker para solicitudes y actualizaciones
    await socketReq.connect(brokerRepAddress); // REQ-REP hacia broker
    console.log(`Usuario ${id}: Conectado al broker en ${brokerRepAddress}`);

    // Conectar al broker para recibir notificaciones de estado
    await socketSub.connect(brokerPubAddress); // PUB-SUB desde broker
    const estadoTopic = 'estado';
    socketSub.subscribe(estadoTopic);
    console.log(`Usuario ${id} suscrito a '${estadoTopic}' para recibir notificaciones.`);

    // Función para solicitar un taxi
    async function solicitarTaxi() {
        console.log(`Usuario ${id}: Solicitando un taxi.`);
        const solicitud = { type: 'request_assignment', idUsuario: id, xUsuario: x, yUsuario: y };
        const tiempoInicio = Date.now();
        
        try {
            await socketReq.send(JSON.stringify(solicitud));
            const [msg] = await Promise.race([
                socketReq.receive(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
            ]);
            
            const respuesta = JSON.parse(msg.toString());
            const tiempoRespuesta = ((Date.now() - tiempoInicio) / 1000).toFixed(3);
            
            if (respuesta.exito) {
                console.log(`Usuario ${id}: Taxi asignado (ID: ${respuesta.idTaxi}) en ${tiempoRespuesta} segundos.`);
            } else {
                console.log(`Usuario ${id}: ${respuesta.mensaje}. Tiempo de respuesta: ${tiempoRespuesta} segundos.`);
                // Cerrar conexiones cuando no hay taxis disponibles
                await socketReq.close();
                await socketSub.close();
                process.exit(0);
            }
        } catch (error) {
            console.log(`Usuario ${id}: Error en la solicitud: ${error.message}`);
            // Cerrar conexiones en caso de error
            await socketReq.close();
            await socketSub.close();
            process.exit(1);
        }
    }

    // Función para manejar notificaciones de estado (activo/inactivo)
    async function manejarEstado() {
        for await (const [topic, msg] of socketSub) {
            const topicStr = topic.toString();
            const notificacion = JSON.parse(msg.toString());

            if (topicStr === 'estado') {
                if (notificacion.estado === 'inactivo') {
                    console.log(`Usuario ${id}: Detectado fallo del servidor central. Reintentando la solicitud en el servidor réplica.`);
                    // Reintentar la solicitud inmediatamente
                    await solicitarTaxi(1);
                } else if (notificacion.estado === 'activo') {
                    console.log(`Usuario ${id}: El servidor central ha vuelto a estar activo.`);
                    // Opcional: Podrías implementar lógica para manejar el cambio de vuelta al servidor central
                }
            }
        }
    }

    // Generar un tiempo de espera inicial aleatorio entre 1 y 10 segundos
    const tiempoEsperaInicial = Math.floor(Math.random() * 10) + 1;
    setTimeout(() => solicitarTaxi(), tiempoEsperaInicial * 1000);

    // Iniciar la función para manejar las notificaciones de estado
    manejarEstado().catch(error => {
        console.error(`Usuario ${id}: Error al manejar estado: ${error.message}`);
    });
}

// Función para generar múltiples usuarios
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

if (!numUsuarios || !n || !m || !archivoPosiciones) {
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
