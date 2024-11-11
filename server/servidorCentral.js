// server/servidorCentral.js
require("dotenv").config();
const zmq = require("zeromq");

// Configuración del servidor central desde .env
const serverRepAddress = `tcp://${process.env.SERVER_IP}:${process.env.SERVER_PORT_REP}`;
const serverPubAddress = `tcp://${process.env.SERVER_IP}:${process.env.SERVER_PORT_PUB}`;

// Estado de los taxis
const taxis = {};

// Crear sockets
const repSocket = new zmq.Reply();
const pubSocket = new zmq.Publisher();

// Función para encontrar taxis disponibles
function encontrarTaxisDisponibles() {
    return Object.values(taxis).filter(taxi => !taxi.ocupado);
}

// Función para asignar un taxi al usuario
async function asignarTaxi(idUsuario, xUsuario, yUsuario) {
    const disponibles = encontrarTaxisDisponibles();
    if (disponibles.length === 0) {
        console.log(`No hay taxis disponibles para el Usuario ${idUsuario}.`);
        return null;
    }

    // Seleccionar el taxi más cercano (simplemente el primero disponible)
    const taxiAsignado = disponibles[0];
    taxiAsignado.ocupado = true;
    console.log(`Asignando Taxi ${taxiAsignado.id} al Usuario ${idUsuario} en posición (${xUsuario}, ${yUsuario})`);

    // Publicar la asignación al taxi específico
    const asignacion = {
        type: 'assignment',
        idUsuario,
        xUsuario,
        yUsuario
    };
    await pubSocket.send([`assignment-${taxiAsignado.id}`, JSON.stringify(asignacion)]);
    return taxiAsignado.id;
}

(async () => {
    await repSocket.bind(serverRepAddress);
    await pubSocket.bind(serverPubAddress);
    console.log(`Servidor Central iniciado en ${serverPubAddress} (asignaciones) y ${serverRepAddress} (registros y solicitudes)`);

    for await (const [msg] of repSocket) {
        const mensaje = JSON.parse(msg.toString());

        if (mensaje.type === 'register') {
            const { id, x, y, ocupado } = mensaje;
            if (taxis[id]) {
                // Taxi ya registrado
                await repSocket.send(JSON.stringify({ exito: true }));
                console.log(`Taxi ${id} ya registrado.`);
            } else {
                // Nuevo registro
                taxis[id] = { id, x, y, ocupado, serviciosRealizados: 0 };
                await repSocket.send(JSON.stringify({ exito: true }));
                console.log(`Taxi ${id} registrado en posición (${x}, ${y}), disponible.`);
            }
        } else if (mensaje.type === 'update') {
            const { id, x, y, ocupado } = mensaje;
            if (taxis[id]) {
                taxis[id].x = x;
                taxis[id].y = y;
                taxis[id].ocupado = ocupado;
                await repSocket.send(JSON.stringify({ exito: true }));
                console.log(`Actualización de Taxi ${id}: posición (${x}, ${y}), ocupado: ${ocupado}`);

                // Si el taxi no está ocupado, puede recibir nuevas asignaciones
                if (!ocupado) {
                    console.log(`Taxi ${id} está disponible para nuevas asignaciones.`);
                }
            } else {
                // Taxi no registrado
                await repSocket.send(JSON.stringify({ exito: false, mensaje: "Taxi no registrado." }));
                console.log(`Actualización fallida: Taxi ${id} no está registrado.`);
            }
        } else if (mensaje.type === 'deregister') {
            const { id } = mensaje;
            if (taxis[id]) {
                delete taxis[id];
                await repSocket.send(JSON.stringify({ exito: true }));
                console.log(`Taxi ${id} desregistrado y eliminado de la lista de disponibles.`);
            } else {
                // Taxi no registrado
                await repSocket.send(JSON.stringify({ exito: false, mensaje: "Taxi no registrado." }));
                console.log(`Desregistro fallido: Taxi ${id} no está registrado.`);
            }
        } else if (mensaje.type === 'request_assignment') {
            const { idUsuario, xUsuario, yUsuario } = mensaje;
            const taxiId = await asignarTaxi(idUsuario, xUsuario, yUsuario);
            if (taxiId !== null) {
                await repSocket.send(JSON.stringify({ exito: true, idTaxi: taxiId }));
            } else {
                await repSocket.send(JSON.stringify({ exito: false, mensaje: "No hay taxis disponibles." }));
            }
        } else if (mensaje.type === 'healthcheck') {
            // Manejo de solicitudes de healthcheck
            await repSocket.send(JSON.stringify({ estado: "Activo" }));
            console.log(`Healthcheck recibido. Estado: Activo.`);
        } else {
            // Tipo de mensaje desconocido
            await repSocket.send(JSON.stringify({ exito: false, mensaje: "Tipo de mensaje desconocido." }));
            console.log(`Mensaje desconocido recibido: ${JSON.stringify(mensaje)}`);
        }
    }
})();
