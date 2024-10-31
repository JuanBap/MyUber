require("dotenv").config();
const zmq = require("zeromq");

// Configuración de direcciones desde el archivo .env
const serverPubAddress = `tcp://${process.env.SERVER_IP}:${process.env.SERVER_PORT_PUB}`;
const serverRepAddress = `tcp://${process.env.SERVER_IP}:${process.env.SERVER_PORT_REP}`;

class ServidorCentral {
    constructor() {
        this.taxis = {}; // Registro de taxis
        this.socketPub = new zmq.Publisher();
        this.socketRep = new zmq.Reply();
    }

    // Inicializar el servidor y sus sockets
    async iniciar() {
        await this.socketPub.bind(serverPubAddress); // Publicar posiciones de taxis
        await this.socketRep.bind(serverRepAddress); // Recibir registros y solicitudes de usuarios

        console.log(`Servidor Central iniciado en ${serverPubAddress} (posiciones) y ${serverRepAddress} (solicitudes)`);

        this.recibirRegistroTaxis(); // Manejar registros de taxis y solicitudes de usuarios
    }

    // Registrar un taxi y marcarlo como disponible
    registrarTaxis(taxi) {
        if (!this.taxis[taxi.id]) {
            this.taxis[taxi.id] = { ...taxi, ocupado: false }; // Marcar como disponible
            console.log(`Taxi ${taxi.id} registrado en posición (${taxi.x}, ${taxi.y}), disponible.`);
        } else {
            console.log(`Taxi ${taxi.id} ya registrado.`);
        }
    }

    // Método para recibir registros de taxis y confirmar registro
    async recibirRegistroTaxis() {
        for await (const [msg] of this.socketRep) {
            const solicitud = JSON.parse(msg.toString());

            // Confirmar que la solicitud es un registro o una solicitud de usuario
            if (solicitud.id && solicitud.x !== undefined && solicitud.y !== undefined && solicitud.ocupado === false) {
                this.registrarTaxis(solicitud);
                console.log(`Taxi ${solicitud.id} registrado correctamente.`);
                await this.socketRep.send(JSON.stringify({ exito: true })); // Confirmación al taxi
            } else if (solicitud.idUsuario) {
                const respuesta = this.asignarTaxi(solicitud);
                await this.socketRep.send(JSON.stringify(respuesta));
            } else {
                console.log(`Error en solicitud recibida: datos incompletos.`);
                await this.socketRep.send(JSON.stringify({ exito: false }));
            }
        }
    }

    // Asignar taxi disponible a un usuario
    asignarTaxi(solicitud) {
        const { idUsuario, x, y } = solicitud;
        console.log("Evaluando taxis disponibles...");

        // Verificar taxis disponibles
        const taxisDisponibles = Object.values(this.taxis).filter(taxi => !taxi.ocupado);
        console.log("Taxis disponibles:", taxisDisponibles.map(taxi => taxi.id));

        if (taxisDisponibles.length > 0) {
            const taxiDisponible = taxisDisponibles[0]; // Seleccionar el primer taxi disponible
            this.taxis[taxiDisponible.id].ocupado = true; // Marcar como ocupado en el registro del servidor

            console.log(`Asignando Taxi ${taxiDisponible.id} al Usuario ${idUsuario} en posición (${x}, ${y})`);
            return { exito: true, idTaxi: taxiDisponible.id, x: taxiDisponible.x, y: taxiDisponible.y };
        } else {
            console.log(`No hay taxis disponibles para el Usuario ${idUsuario}`);
            return { exito: false, mensaje: "No hay taxis disponibles en este momento" };
        }
    }
}

// Iniciar el servidor
const servidorCentral = new ServidorCentral();
servidorCentral.iniciar();
