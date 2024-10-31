// server/servidorCentral.js
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

    // Método para calcular la distancia Manhattan
    calcularDistancia(x1, y1, x2, y2) {
        return Math.abs(x1 - x2) + Math.abs(y1 - y2);
    }

    // Registrar un taxi y marcarlo como disponible
    registrarTaxis(taxi) {
        if (!this.taxis[taxi.id]) {
            this.taxis[taxi.id] = { ...taxi, ocupado: false };
            console.log(`Taxi ${taxi.id} registrado en posición (${taxi.x}, ${taxi.y}), disponible.`);
        } else {
            // Actualizar posición y estado
            this.taxis[taxi.id].x = taxi.x;
            this.taxis[taxi.id].y = taxi.y;
            this.taxis[taxi.id].ocupado = taxi.ocupado;
            console.log(`Actualizando Taxi ${taxi.id} a posición (${taxi.x}, ${taxi.y}), ocupado: ${taxi.ocupado}`);
        }
    }

    // Asignar taxi más cercano disponible
    asignarTaxi(solicitud) {
        const { idUsuario, x, y } = solicitud;
        console.log(`Recibida solicitud de taxi para Usuario ${idUsuario} en posición (${x}, ${y})`);

        // Filtrar taxis disponibles
        const taxisDisponibles = Object.values(this.taxis).filter(taxi => !taxi.ocupado);
        console.log(`Taxis disponibles: ${taxisDisponibles.map(taxi => taxi.id).join(", ") || "Ninguno"}`);

        if (taxisDisponibles.length === 0) {
            console.log(`No hay taxis disponibles para el Usuario ${idUsuario}`);
            return { exito: false, mensaje: "No hay taxis disponibles en este momento" };
        }

        // Calcular distancias
        taxisDisponibles.forEach(taxi => {
            taxi.distancia = this.calcularDistancia(x, y, taxi.x, taxi.y);
        });

        // Encontrar la distancia mínima
        const distanciaMinima = Math.min(...taxisDisponibles.map(taxi => taxi.distancia));

        // Filtrar taxis con la distancia mínima
        const taxisCercanos = taxisDisponibles.filter(taxi => taxi.distancia === distanciaMinima);

        // Seleccionar el taxi con el menor ID en caso de empate
        taxisCercanos.sort((a, b) => a.id - b.id);
        const taxiSeleccionado = taxisCercanos[0];

        // Marcar como ocupado
        this.taxis[taxiSeleccionado.id].ocupado = true;

        console.log(`Asignando Taxi ${taxiSeleccionado.id} al Usuario ${idUsuario} en posición (${x}, ${y})`);
        return { exito: true, idTaxi: taxiSeleccionado.id, x: taxiSeleccionado.x, y: taxiSeleccionado.y };
    }

    // Método para recibir registros de taxis y solicitudes de usuarios
    async recibirRegistroTaxis() {
        for await (const [msg] of this.socketRep) {
            const solicitud = JSON.parse(msg.toString());

            // Verificar si es un registro de taxi
            if (solicitud.id !== undefined && solicitud.x !== undefined && solicitud.y !== undefined && solicitud.ocupado !== undefined) {
                this.registrarTaxis(solicitud);
                // Enviar confirmación al taxi
                await this.socketRep.send(JSON.stringify({ exito: true }));
            }
            // Verificar si es una solicitud de usuario
            else if (solicitud.idUsuario !== undefined && solicitud.x !== undefined && solicitud.y !== undefined) {
                const respuesta = this.asignarTaxi(solicitud);
                await this.socketRep.send(JSON.stringify(respuesta));
            }
            else {
                console.log("Error en solicitud recibida: datos incompletos o mal formados.");
                await this.socketRep.send(JSON.stringify({ exito: false, mensaje: "Datos incompletos o mal formados." }));
            }
        }
    }
}

(async () => {
    const servidorCentral = new ServidorCentral();
    await servidorCentral.iniciar();
})();
