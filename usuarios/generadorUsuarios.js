// usuarios/generadorUsuarios.js
require('dotenv').config();
const zmq = require('zeromq');
const Usuario = require('../model/usuario');
const fs = require('fs');
const path = require('path');

// Verificación de variables de entorno
if (!process.env.SERVER_IP || !process.env.SERVER_PORT_REP) {
    throw new Error("Las variables de entorno SERVER_IP o SERVER_PORT_REP no están definidas");
}

// Configuración del servidor central desde .env
const serverRepAddress = `tcp://${process.env.SERVER_IP}:${process.env.SERVER_PORT_REP}`;

// Cargar los argumentos de entrada
const [numUsuarios, n, m, archivoPosiciones] = process.argv.slice(2);

// Leer archivo de posiciones usando la ruta ajustada
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

// Validación de entrada
if (parseInt(numUsuarios) > posiciones.length) {
    console.error("El número de usuarios excede las posiciones disponibles en el archivo.");
    process.exit(1);
}

// Función para crear y manejar cada hilo de usuario
async function crearHiloUsuario(id, x, y, tiempoEspera) {
    const socketReq = new zmq.Request();
    console.log(`Usuario ${id}: Conectando a ${serverRepAddress}`);
    await socketReq.connect(serverRepAddress);

    // Crear una instancia de Usuario
    let usuario;
    try {
        usuario = new Usuario(id, x, y, tiempoEspera);
    } catch (error) {
        console.error(`Usuario ${id}: Error al crear instancia de Usuario: ${error.message}`);
        await socketReq.close();
        return;
    }

    // Función para enviar solicitud al servidor y manejar la respuesta
    async function solicitarTaxi() {
        // Espera el tiempo antes de solicitar
        await new Promise(resolve => setTimeout(resolve, tiempoEspera * 1000));

        console.log(`Usuario ${usuario.id}: Solicitando un taxi desde (${usuario.x}, ${usuario.y}) en t=${tiempoEspera} minutos.`);
        const solicitud = { idUsuario: usuario.id, x: usuario.x, y: usuario.y };
        const tiempoInicio = Date.now();

        try {
            // Enviar solicitud al servidor
            await socketReq.send(JSON.stringify(solicitud));

            // Esperar respuesta con timeout
            const [msg] = await Promise.race([
                socketReq.receive(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
            ]);

            const respuesta = JSON.parse(msg.toString());
            const tiempoRespuesta = ((Date.now() - tiempoInicio) / 1000).toFixed(3); // en segundos con 3 decimales

            if (respuesta.exito) {
                usuario.registrarSolicitudExitosa(tiempoRespuesta);
                console.log(`Usuario ${usuario.id}: Taxi asignado (ID: ${respuesta.idTaxi}) en ${tiempoRespuesta} segundos.`);
            } else {
                usuario.registrarSolicitudNoSatisfactoria(respuesta.mensaje);
                console.log(`Usuario ${usuario.id}: ${respuesta.mensaje}`);
            }
        } catch (error) {
            if (error.message === 'timeout') {
                usuario.registrarSolicitudNoSatisfactoria("timeout");
                console.log(`Usuario ${usuario.id}: Tiempo de espera agotado, sin respuesta del servidor.`);
            } else {
                usuario.registrarSolicitudNoSatisfactoria(error.message);
                console.log(`Usuario ${usuario.id}: Error en la solicitud: ${error.message}`);
            }
        } finally {
            await socketReq.close();
            usuario.mostrarInformacion();
        }
    }

    solicitarTaxi();
}

// Crear usuarios e hilos
for (let i = 0; i < parseInt(numUsuarios); i++) {
    const { x, y } = posiciones[i];
    const tiempoEspera = Math.floor(Math.random() * 10) + 1; // Generar tiempo de espera aleatorio entre 1 y 10 segundos

    crearHiloUsuario(i + 1, x, y, tiempoEspera);
}
