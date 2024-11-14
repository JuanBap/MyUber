// server/servidorReplica.js
require("dotenv").config();
const zmq = require("zeromq");
const fs = require('fs');
const path = require('path');

// Configuración del servidor réplica desde .env
const replicaRepAddress = `tcp://${process.env.REPLICA_SERVER_IP}:${process.env.REPLICA_SERVER_PORT_REP}`;
const replicaPubAddress = `tcp://${process.env.REPLICA_SERVER_IP}:${process.env.REPLICA_SERVER_PORT_PUB}`;
const brokerToReplicaSubAddress = `tcp://127.0.0.1:${process.env.BROKER_TO_REPLICA_PORT}`; // Asumiendo broker en localhost

// Estado de los taxis
const taxis = {};

// Crear sockets
const repSocket = new zmq.Reply();
const pubSocket = new zmq.Publisher();

// Crear socket para recibir notificaciones del broker
const brokerToReplicaSub = new zmq.Subscriber();

// Flag para imprimir el mensaje una vez
let healthcheckPrinted = false;

// Función para encontrar taxis disponibles
function encontrarTaxisDisponibles() {
    return Object.values(taxis).filter(taxi => !taxi.ocupado);
}

// Función para calcular la distancia Manhattan entre dos puntos
function calcularDistancia(x1, y1, x2, y2) {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

// Función para cargar o inicializar el archivo de logs
function cargarLogs() {
    const logPath = path.join(__dirname, '..', 'taxilog.json');
    if (!fs.existsSync(logPath)) {
        const initialLog = {
            taxis: {},
            servicios: {
                exitosos: 0,
                negados: 0
            }
        };
        fs.writeFileSync(logPath, JSON.stringify(initialLog, null, 2));
        return initialLog;
    }
    return JSON.parse(fs.readFileSync(logPath, 'utf8'));
}

// Función para guardar los logs
function guardarLogs(logs) {
    const logPath = path.join(__dirname, '..', 'taxilog.json');
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
}

// Función para asignar un taxi al usuario
async function asignarTaxi(idUsuario, xUsuario, yUsuario) {
    const disponibles = encontrarTaxisDisponibles();
    const logs = cargarLogs();

    if (disponibles.length === 0) {
        console.log(`Replica: No hay taxis disponibles para el Usuario ${idUsuario}.`);
        logs.servicios.negados++;
        guardarLogs(logs);
        return null;
    }

    // Encontrar el taxi más cercano calculando la distancia Manhattan
    const taxiAsignado = disponibles.reduce((nearest, current) => {
        const distanciaCurrent = calcularDistancia(current.x, current.y, xUsuario, yUsuario);
        const distanciaNearest = calcularDistancia(nearest.x, nearest.y, xUsuario, yUsuario);
        return distanciaCurrent < distanciaNearest ? current : nearest;
    });

    taxiAsignado.ocupado = true;
    console.log(`Replica: Asignando Taxi ${taxiAsignado.id} al Usuario ${idUsuario} en posición (${xUsuario}, ${yUsuario})`);
    console.log(`Replica: Distancia al usuario: ${calcularDistancia(taxiAsignado.x, taxiAsignado.y, xUsuario, yUsuario)} unidades`);

    // Registrar el servicio en los logs
    if (!logs.taxis[taxiAsignado.id]) {
        logs.taxis[taxiAsignado.id] = {
            posiciones: [],
            serviciosRealizados: 0,
            asignaciones: []
        };
    }
    logs.taxis[taxiAsignado.id].serviciosRealizados++;
    logs.servicios.exitosos++;
    logs.taxis[taxiAsignado.id].asignaciones.push({
        taxiPos: { x: taxiAsignado.x, y: taxiAsignado.y },
        userPos: { x: xUsuario, y: yUsuario },
        timestamp: new Date().toISOString()
    });
    guardarLogs(logs);

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
    // Bind de los sockets de réplica
    await repSocket.bind(replicaRepAddress);
    await pubSocket.bind(replicaPubAddress);
    console.log(`Servidor Réplica iniciado en ${replicaPubAddress} (asignaciones) y ${replicaRepAddress} (registros y solicitudes)`);

    // Conectar al broker para recibir notificaciones
    await brokerToReplicaSub.connect(brokerToReplicaSubAddress);
    brokerToReplicaSub.subscribe('role');
    console.log(`Servidor Réplica: Suscrito a 'role' en ${brokerToReplicaSubAddress} para recibir notificaciones.`);

    // Manejar notificaciones del broker
    (async () => {
        for await (const [topic, msg] of brokerToReplicaSub) {
            if (topic.toString() === 'role') {
                const notificacion = JSON.parse(msg.toString());
                if (notificacion.accion === 'asumir_principal') {
                    console.log("Servidor réplica asumiendo rol de principal.");
                    // Aquí podrías implementar lógica adicional si es necesario
                    // Por ejemplo, cambiar configuraciones internas o activar procesos específicos
                }
            }
        }
    })();

    // Manejar solicitudes de clientes (taxis y usuarios)
    for await (const [msg] of repSocket) {
        const mensaje = JSON.parse(msg.toString());

        if (mensaje.type === 'register') {
            const { id, x, y, ocupado } = mensaje;
            if (taxis[id]) {
                // Taxi ya registrado
                await repSocket.send(JSON.stringify({ exito: true }));
                if (!healthcheckPrinted) {
                    console.log(`Replica: Taxi ${id} ya registrado.`);
                }
            } else {
                // Nuevo registro
                taxis[id] = { id, x, y, ocupado, serviciosRealizados: 0 };
                await repSocket.send(JSON.stringify({ exito: true }));
                if (!healthcheckPrinted) {
                    console.log(`Replica: Taxi ${id} registrado en posición (${x}, ${y}), disponible.`);
                }
            }
        } else if (mensaje.type === 'update') {
            const { id, x, y, ocupado } = mensaje;
            if (taxis[id]) {
                taxis[id].x = x;
                taxis[id].y = y;
                taxis[id].ocupado = ocupado;

                // Registrar movimiento en tiempo real
                const logPath = path.join(__dirname, '..', 'taxilog.json');
                let logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
                
                // Agregar el movimiento al registro
                logs.movimientos.push({
                    taxiId: id,
                    posicion: { x, y },
                    timestamp: new Date().toISOString(),
                    ocupado
                });

                // Guardar inmediatamente
                fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));

                await repSocket.send(JSON.stringify({ exito: true }));
                if (!healthcheckPrinted) {
                    console.log(`Replica: Actualización de Taxi ${id}: posición (${x}, ${y}), ocupado: ${ocupado}`);
                }

                // Si el taxi no está ocupado, puede recibir nuevas asignaciones
                if (!ocupado && !healthcheckPrinted) {
                    console.log(`Replica: Taxi ${id} está disponible para nuevas asignaciones.`);
                }
            } else {
                // Taxi no registrado
                await repSocket.send(JSON.stringify({ exito: false, mensaje: "Taxi no registrado." }));
                if (!healthcheckPrinted) {
                    console.log(`Replica: Actualización fallida: Taxi ${id} no está registrado.`);
                }
            }
        } else if (mensaje.type === 'deregister') {
            const { id } = mensaje;
            if (taxis[id]) {
                delete taxis[id];
                await repSocket.send(JSON.stringify({ exito: true }));
                if (!healthcheckPrinted) {
                    console.log(`Replica: Taxi ${id} desregistrado y eliminado de la lista de disponibles.`);
                }
            } else {
                // Taxi no registrado
                await repSocket.send(JSON.stringify({ exito: false, mensaje: "Taxi no registrado." }));
                if (!healthcheckPrinted) {
                    console.log(`Replica: Desregistro fallido: Taxi ${id} no está registrado.`);
                }
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
            if (!healthcheckPrinted) {
                console.log(`Replica: Healthcheck recibido. Estado: Activo.`);
                healthcheckPrinted = true;
            }
            await repSocket.send(JSON.stringify({ estado: "Activo" }));
        } else {
            // Tipo de mensaje desconocido
            await repSocket.send(JSON.stringify({ exito: false, mensaje: "Tipo de mensaje desconocido." }));
            if (!healthcheckPrinted) {
                console.log(`Replica: Mensaje desconocido recibido: ${JSON.stringify(mensaje)}`);
            }
        }
    }
})();
