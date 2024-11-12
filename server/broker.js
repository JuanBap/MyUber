// server/broker.js
require("dotenv").config();
const zmq = require("zeromq");

const {
    SERVER_IP,
    SERVER_PORT_REP,
    SERVER_PORT_PUB,
    REPLICA_SERVER_IP,
    REPLICA_SERVER_PORT_REP,
    REPLICA_SERVER_PORT_PUB,
    BROKER_PORT,
    BROKER_PUB_PORT,
    BROKER_TO_REPLICA_PORT
} = process.env;

// Direcciones de los servidores
const centralRepAddress = `tcp://${SERVER_IP}:${SERVER_PORT_REP}`;
const centralPubAddress = `tcp://${SERVER_IP}:${SERVER_PORT_PUB}`;

const replicaRepAddress = `tcp://${REPLICA_SERVER_IP}:${REPLICA_SERVER_PORT_REP}`;
const replicaPubAddress = `tcp://${REPLICA_SERVER_IP}:${REPLICA_SERVER_PORT_PUB}`;

// Configuración de sockets del broker
const brokerRep = new zmq.Reply(); // Para recibir solicitudes de clientes (taxis y usuarios)
const brokerPub = new zmq.Publisher(); // Para enviar notificaciones a clientes

// Configuración de sockets hacia los servidores
const centralReq = new zmq.Request(); // Para enviar solicitudes al servidor central
const replicaReq = new zmq.Request(); // Para enviar solicitudes al servidor réplica

// Configuración del socket para notificar al servidor réplica
const brokerToReplicaPub = new zmq.Publisher(); // Para enviar notificaciones al servidor réplica

// Estado del servidor central
let centralActivo = true;
let fallosConsecutivos = 0;
const MAX_FALLOS = 3;
let replicaAsumio = false;

// Declarar healthcheckInterval en el ámbito global para que sea accesible dentro de verificarServidorCentral
let healthcheckInterval;

// Función para enviar mensajes a los servidores
async function enviarAlServidor(socket, mensaje) {
    try {
        await socket.send(JSON.stringify(mensaje));
        const [respuesta] = await Promise.race([
            socket.receive(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500))
        ]);
        return JSON.parse(respuesta.toString());
    } catch (error) {
        throw new Error('No se pudo recibir respuesta del servidor.');
    }
}

// Función de healthcheck para el servidor central
async function verificarServidorCentral() {
    const mensajeHealthcheck = { type: 'healthcheck' };
    try {
        await centralReq.send(JSON.stringify(mensajeHealthcheck));
        const [respuesta] = await Promise.race([
            centralReq.receive(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500))
        ]);
        const resp = JSON.parse(respuesta.toString());
        if (resp.estado === "Activo") {
            if (!centralActivo) {
                centralActivo = true;
                console.log("Broker: El servidor central ha vuelto a estar activo.");
                await brokerPub.send(['estado', JSON.stringify({ estado: 'activo' })]);
            }
            fallosConsecutivos = 0;
        } else {
            throw new Error('Estado desconocido del servidor central.');
        }
    } catch (error) {
        fallosConsecutivos += 1;
        console.log(`Broker: Fallo de healthcheck al servidor central. Intento ${fallosConsecutivos}/${MAX_FALLOS}.`);
        if (fallosConsecutivos >= MAX_FALLOS && centralActivo) {
            centralActivo = false;
            console.log("Broker: El servidor central está inactivo. Cambiando al servidor réplica.");
            await brokerPub.send(['estado', JSON.stringify({ estado: 'inactivo' })]);

            // Notificar al servidor réplica para que asuma el rol principal
            await brokerToReplicaPub.send(['role', JSON.stringify({ accion: 'asumir_principal' })]);
            console.log("Broker: Servidor réplica asumiendo rol de principal.");
            replicaAsumio = true;

            // Detener los healthchecks
            clearInterval(healthcheckInterval);
        }
    }
}

// Función para inicializar el broker
async function iniciarBroker() {
    // Bind de los sockets del broker
    await brokerRep.bind(`tcp://*:${BROKER_PORT}`);
    console.log(`Broker: Escuchando solicitudes en tcp://*:${BROKER_PORT}`);

    await brokerPub.bind(`tcp://*:${BROKER_PUB_PORT}`);
    console.log(`Broker: Publicando notificaciones en tcp://*:${BROKER_PUB_PORT}`);

    // Bind del socket para notificar al servidor réplica
    await brokerToReplicaPub.bind(`tcp://*:${BROKER_TO_REPLICA_PORT}`);
    console.log(`Broker: Publicando notificaciones al réplica en tcp://*:${BROKER_TO_REPLICA_PORT}`);

    // Conectar a los servidores
    await centralReq.connect(centralRepAddress);
    console.log(`Broker: Conectado al servidor central en ${centralRepAddress}`);

    await replicaReq.connect(replicaRepAddress);
    console.log(`Broker: Conectado al servidor réplica en ${replicaRepAddress}`);

    // Iniciar el ciclo de healthcheck
    healthcheckInterval = setInterval(verificarServidorCentral, 1000);

    // Manejar solicitudes de clientes
    for await (const [mensaje] of brokerRep) {
        let msg;
        try {
            msg = JSON.parse(mensaje.toString());
        } catch (error) {
            await brokerRep.send(JSON.stringify({ exito: false, mensaje: "Formato de mensaje inválido." }));
            continue;
        }

        // Decidir a qué servidor enviar el mensaje
        const servidorDestino = centralActivo ? centralReq : replicaReq;

        try {
            const respuesta = await enviarAlServidor(servidorDestino, msg);
            await brokerRep.send(JSON.stringify(respuesta));
        } catch (error) {
            await brokerRep.send(JSON.stringify({ exito: false, mensaje: "No se pudo contactar con el servidor." }));
        }
    }
}

// Iniciar el broker
iniciarBroker();
