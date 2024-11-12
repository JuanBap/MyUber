// healthcheck.js
require('dotenv').config();
const zmq = require('zeromq');

const serverRepAddress = `tcp://${process.env.SERVER_IP}:${process.env.SERVER_PORT_REP}`;
const CHECK_INTERVAL = 1000; // Intervalo de 1 segundo 
const TIMEOUT = 500; // Timeout de 0.5 segundos 

async function realizarHealthcheck() {
    const socket = new zmq.Request();

    try {
        console.log("Healthcheck revisando Servidor Central...");
        await socket.connect(serverRepAddress);

        const solicitud = { type: 'healthcheck' };
        const tiempoInicio = Date.now();

        await socket.send(JSON.stringify(solicitud));

        const [msg] = await Promise.race([
            socket.receive(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT))
        ]);

        const respuesta = JSON.parse(msg.toString());
        const tiempoRespuesta = ((Date.now() - tiempoInicio) / 1000).toFixed(3);

        if (respuesta.estado === "Activo") {
            console.log(`Estado: Activo (Respondido en ${tiempoRespuesta} segundos)`);
        } else {
            console.log(`Estado: Inactivo (Respuesta desconocida)`);
        }

        await socket.close();
    } catch (error) {
        console.log(`Estado: Inactivo (No se pudo contactar al servidor. Error: ${error.message})`);
        await socket.close();
    }
}

async function iniciarHealthcheck() {
    await realizarHealthcheck(); // Realizar la primera verificación inmediatamente

    setInterval(async () => {
        await realizarHealthcheck();
    }, CHECK_INTERVAL);
}

iniciarHealthcheck();
