require("dotenv").config();
const zmq = require("zeromq");

const id = parseInt(process.argv[2]);
const n = parseInt(process.argv[3]);
const m = parseInt(process.argv[4]);
const xInicial = parseInt(process.argv[5]);
const yInicial = parseInt(process.argv[6]);
const velocidad = parseInt(process.argv[7]);
const maxServicios = parseInt(process.argv[8]); // Límite de servicios diarios

// Verificación de variables de entorno
if (!process.env.SERVER_IP || !process.env.SERVER_PORT_PUB || !process.env.SERVER_PORT_REP) {
    throw new Error("Las variables de entorno SERVER_IP, SERVER_PORT_PUB o SERVER_PORT_REP no están definidas");
}

// Configuración del servidor central desde .env
const serverRepAddress = `tcp://${process.env.SERVER_IP}:${process.env.SERVER_PORT_REP}`;
const serverPubAddress = `tcp://${process.env.SERVER_IP}:${process.env.SERVER_PORT_PUB}`;

// Validación de posición inicial
if (xInicial < 0 || xInicial >= n || yInicial < 0 || yInicial >= m) {
    console.error("La posición inicial del taxi está fuera de los límites de la cuadrícula.");
    process.exit(1);
}

// Estado inicial del taxi
let x = xInicial;
let y = yInicial;
let ocupado = false;
let serviciosRealizados = 0; // Contador de servicios completados

// Calcular el intervalo de movimiento en función de la velocidad
const minutosSimuladosPorSegundo = 1; // Cada segundo en tiempo real es un minuto en el sistema
const kmPorCelda = 1; // Cada celda representa 1 km
const intervaloMovimiento = (30 * 60 * 1000) / (velocidad * minutosSimuladosPorSegundo); // Intervalo en ms

// Función principal
(async () => {
    const socketReq = new zmq.Request();
    const socketPub = new zmq.Publisher();

    await socketReq.connect(serverRepAddress); // Conectar para registro y notificación de servicio
    await socketPub.connect(serverPubAddress); // Conectar para enviar posiciones

    // Función para registrar el taxi en el servidor central
    async function registrarTaxi() {
        const mensajeRegistro = { id: id, x: x, y: y, ocupado: false };
        await socketReq.send(JSON.stringify(mensajeRegistro));
        const [msg] = await socketReq.receive();
        const respuesta = JSON.parse(msg.toString());

        if (respuesta.exito) {
            console.log(`Taxi ${id} registrado exitosamente en el servidor central.`);
        } else {
            console.error(`Error al registrar Taxi ${id} en el servidor central.`);
            process.exit(1);
        }
    }

    // Llamada inicial de registro
    await registrarTaxi();

    // Función para mover el taxi y enviar posición
    async function enviarPosicion() {
        const interval = velocidad > 0 ? intervaloMovimiento : Infinity; // Movimiento solo si velocidad > 0

        setInterval(async () => {
            if (ocupado || serviciosRealizados >= maxServicios) return; // No se mueve si está ocupado o alcanzó el límite

            // Alterna movimiento horizontal y vertical
            if (Math.random() < 0.5) {
                x = x < n - 1 ? x + 1 : x - 1; // Mover en x
            } else {
                y = y < m - 1 ? y + 1 : y - 1; // Mover en y
            }

            const nuevaPosicion = { id: id, x: x, y: y, ocupado: false };
            await socketPub.send(JSON.stringify(nuevaPosicion)); // Enviar la nueva posición
            console.log(`Taxi ${id} se movió a (${x}, ${y})`);
        }, interval);
    }

    // Función para gestionar servicios
    async function gestionarServicios() {
        for await (const [msg] of socketReq) {
            const solicitud = JSON.parse(msg.toString());

            if (solicitud.idTaxi === id && serviciosRealizados < maxServicios) {
                ocupado = true;
                serviciosRealizados++;
                console.log(`Taxi ${id} asignado a un servicio. Atendiendo al Usuario ${solicitud.idUsuario}.`);

                // Simulación de servicio de 30 segundos
                await new Promise(resolve => setTimeout(resolve, 30000));

                ocupado = false; // Taxi vuelve a estar disponible
                x = xInicial;
                y = yInicial;

                const mensajeFinalizacion = { id: id, x: x, y: y, ocupado: false };
                await socketPub.send(JSON.stringify(mensajeFinalizacion));
                console.log(`Taxi ${id} volvió a la posición inicial (${xInicial}, ${yInicial}) y está disponible nuevamente.`);

                // Verificar si se alcanzó el límite de servicios
                if (serviciosRealizados >= maxServicios) {
                    console.log(`Taxi ${id} ha completado el máximo de servicios diarios y finaliza su operación.`);
                    process.exit(0);
                }
            }
        }
    }

    enviarPosicion();
    gestionarServicios();
})();
