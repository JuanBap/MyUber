
require("dotenv").config();
const zmq = require("zeromq");

// Configuración del broker desde .env
const bindRepAddress = `tcp://${process.env.BROKER_IP}:${process.env.BROKER_PORT}`;
const bindPubAddress = `tcp://${process.env.BROKER_IP}:${process.env.BROKER_PUB_PORT}`;

// Crear sockets
const repSocket = new zmq.Reply();
const pubSocket = new zmq.Publisher();

// Estado del servidor central
let servidorCentralActivo = true;

// Función para manejar solicitudes de los clientes
async function manejarSolicitudes() {
    for await (const [msg] of repSocket) {
        const mensaje = JSON.parse(msg.toString());

        if (mensaje.type === 'request_assignment') {
            // Lógica para manejar la solicitud de asignación de taxi
            // Aquí puedes implementar la lógica para redirigir la solicitud al servidor central o réplica
        } else if (mensaje.type === 'register') {
            // Lógica para manejar el registro de taxis
        } else if (mensaje.type === 'update') {
            // Lógica para manejar la actualización de taxis
        } else if (mensaje.type === 'deregister') {
            // Lógica para manejar la desregistración de taxis
        } else if (mensaje.type === 'healthcheck') {
            // Lógica para manejar las solicitudes de healthcheck
        } else {
            // Tipo de mensaje desconocido
            await repSocket.send(JSON.stringify({ exito: false, mensaje: "Tipo de mensaje desconocido." }));
        }
    }
}

// Función para publicar el estado del servidor central
async function publicarEstado() {
    while (true) {
        const estado = { estado: servidorCentralActivo ? 'activo' : 'inactivo' };
        await pubSocket.send(['estado', JSON.stringify(estado)]);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Publicar cada 5 segundos
    }
}

(async () => {
    // Bind de los sockets del broker
    await repSocket.bind(bindRepAddress);
    await pubSocket.bind(bindPubAddress);
    console.log(`Broker iniciado en ${bindRepAddress} (solicitudes) y ${bindPubAddress} (publicaciones)`);

    // Iniciar el manejo de solicitudes y la publicación de estado
    manejarSolicitudes();
    publicarEstado();
})();