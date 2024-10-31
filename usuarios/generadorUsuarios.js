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
const rutaArchivoPosiciones = path.join(__dirname, archivoPosiciones);
const posiciones = JSON.parse(fs.readFileSync(rutaArchivoPosiciones));

// Validación de entrada
if (numUsuarios > posiciones.length) {
    console.error("El número de usuarios excede las posiciones disponibles en el archivo.");
    process.exit(1);
}

// Función para crear y manejar cada hilo de usuario
async function crearHiloUsuario(id, x, y, tiempoEspera) {
    const socketReq = new zmq.Request();
    console.log("Conectando a:", serverRepAddress);
    await socketReq.connect(serverRepAddress);

    // Crear una instancia de Usuario
    const usuario = new Usuario(id, x, y);

    // Función para enviar solicitud al servidor y reintentar si no está disponible
    async function solicitarTaxi() {
        while (true) {
            console.log(`Usuario ${usuario.id} solicitando un taxi desde (${usuario.x}, ${usuario.y})`);
            const solicitud = { idUsuario: usuario.id, x: usuario.x, y: usuario.y };
            const tiempoInicio = Date.now();

            // Enviar solicitud al servidor
            await socketReq.send(JSON.stringify(solicitud));

            const timeout = setTimeout(() => {
                usuario.registrarSolicitudNoSatisfactoria("timeout");
                console.log(`Usuario ${usuario.id}: Tiempo de espera agotado, sin respuesta del servidor.`);
            }, 5000);

            for await (const [msg] of socketReq) {
                clearTimeout(timeout);

                const respuesta = JSON.parse(msg.toString());
                const tiempoRespuesta = (Date.now() - tiempoInicio) / 1000;

                if (respuesta.exito) {
                    usuario.registrarSolicitudExitosa(tiempoRespuesta);
                    console.log(`Usuario ${usuario.id}: Taxi asignado (ID: ${respuesta.idTaxi}) en ${tiempoRespuesta} segundos.`);
                    return; // Finaliza si se le asigna un taxi
                } else {
                    console.log(`Usuario ${usuario.id}: No hay taxis disponibles, reintentando en 5 segundos...`);
                    await new Promise(resolve => setTimeout(resolve, 5000)); // Espera 5 segundos y reintenta
                }
            }
        }
    }

    setTimeout(solicitarTaxi, tiempoEspera * 1000); // espera aleatoria antes de solicitar taxi
}

// Crear usuarios e hilos
for (let i = 0; i < numUsuarios; i++) {
    const { x, y } = posiciones[i];
    const tiempoEspera = Math.floor(Math.random() * 10) + 1; // Generar tiempo de espera aleatorio

    crearHiloUsuario(i + 1, x, y, tiempoEspera);
}
