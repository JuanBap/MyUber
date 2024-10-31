// taxis/taxi.js
require("dotenv").config();
const zmq = require("zeromq");
const Taxi = require("../model/taxi");

// Parámetros de entrada
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

// Crear instancia del Taxi
let taxi;
try {
    taxi = new Taxi(id, xInicial, yInicial, velocidad, maxServicios);
} catch (error) {
    console.error(`Error al crear el Taxi: ${error.message}`);
    process.exit(1);
}

// Estado inicial del taxi
let x = taxi.x;
let y = taxi.y;
let ocupado = taxi.ocupado;
let serviciosRealizados = taxi.serviciosRealizados;

// Direcciones actuales (1 para adelante, -1 para atrás)
let direccionX = 1;
let direccionY = 1;

// Función para mover el taxi en una dirección
function moverTaxi() {
    // Decidir aleatoriamente si mover en X o Y
    const moverEnX = Math.random() < 0.5;

    if (moverEnX) {
        // Intentar mover en X
        if ((direccionX === 1 && x < n - 1) || (direccionX === -1 && x > 0)) {
            x += direccionX;
            console.log(`Taxi ${id} se movió a (${x}, ${y})`);
            // Cambiar dirección aleatoriamente en el siguiente movimiento
            direccionX = Math.random() < 0.5 ? 1 : -1;
        } else {
            console.log(`Taxi ${id} ha llegado al borde en X (${x}) y cambia de dirección.`);
            // Cambiar dirección para evitar detenerse indefinidamente
            direccionX = -direccionX;
        }
    } else {
        // Intentar mover en Y
        if ((direccionY === 1 && y < m - 1) || (direccionY === -1 && y > 0)) {
            y += direccionY;
            console.log(`Taxi ${id} se movió a (${x}, ${y})`);
            // Cambiar dirección aleatoriamente en el siguiente movimiento
            direccionY = Math.random() < 0.5 ? 1 : -1;
        } else {
            console.log(`Taxi ${id} ha llegado al borde en Y (${y}) y cambia de dirección.`);
            // Cambiar dirección para evitar detenerse indefinidamente
            direccionY = -direccionY;
        }
    }
}

// Función para regresar a la posición inicial paso a paso
async function regresarAPosicionInicial(intervaloMovimiento) {
    while (x !== taxi.posicionInicial.x || y !== taxi.posicionInicial.y) {
        // Determinar dirección para X
        if (x < taxi.posicionInicial.x && x < n - 1) {
            x += 1;
        } else if (x > taxi.posicionInicial.x && x > 0) {
            x -= 1;
        }

        // Determinar dirección para Y
        if (y < taxi.posicionInicial.y && y < m - 1) {
            y += 1;
        } else if (y > taxi.posicionInicial.y && y > 0) {
            y -= 1;
        }

        // Enviar nueva posición al servidor
        const nuevaPosicion = { id: id, x: x, y: y, ocupado: ocupado };
        socketPub.send(JSON.stringify(nuevaPosicion));
        console.log(`Taxi ${id} regresó a (${x}, ${y})`);

        // Esperar el intervalo de movimiento
        await new Promise(resolve => setTimeout(resolve, intervaloMovimiento));
    }

    console.log(`Taxi ${id} ha regresado a la posición inicial (${xInicial}, ${yInicial}) y está disponible nuevamente.`);
}

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
            console.log(`Posición inicial: (${xInicial}, ${yInicial})`);
            // Enviar la posición inicial al servidor
            await socketPub.send(JSON.stringify(mensajeRegistro));
        } else {
            console.error(`Error al registrar Taxi ${id} en el servidor central.`);
            process.exit(1);
        }
    }

    // Llamada inicial de registro
    await registrarTaxi();

    // Definir cantidad de celdas a mover por intervalo según la velocidad
    let intervaloMovimiento;
    let celdasPorMovimiento;
    switch (velocidad) {
        case 1:
            intervaloMovimiento = 60 * 1000; // 60 segundos reales = 60 minutos simulados
            celdasPorMovimiento = 1;
            break;
        case 2:
            intervaloMovimiento = 30 * 1000; // 30 segundos reales = 30 minutos simulados
            celdasPorMovimiento = 1;
            break;
        case 4:
            intervaloMovimiento = 15 * 1000; // 15 segundos reales = 15 minutos simulados
            celdasPorMovimiento = 2;
            break;
        default:
            console.error("Velocidad inválida. Las velocidades válidas son 1, 2 y 4 km/h.");
            process.exit(1);
    }

    // Función para mover el taxi y enviar posición
    async function enviarPosicion() {
        setInterval(async () => {
            if (ocupado || serviciosRealizados >= maxServicios) return; // No se mueve si está ocupado o alcanzó el límite

            moverTaxi();

            // Enviar nueva posición
            const nuevaPosicion = { id: id, x: x, y: y, ocupado: ocupado };
            await socketPub.send(JSON.stringify(nuevaPosicion));
        }, intervaloMovimiento);
    }

    // Función para gestionar servicios
    async function gestionarServicios() {
        for await (const [msg] of socketReq) {
            const solicitud = JSON.parse(msg.toString());

            if (solicitud.idTaxi === id && serviciosRealizados < maxServicios) {
                try {
                    taxi.asignarServicio();
                } catch (error) {
                    console.error(error.message);
                    await socketReq.send(JSON.stringify({ exito: false, mensaje: error.message }));
                    continue;
                }

                ocupado = taxi.ocupado;
                serviciosRealizados = taxi.serviciosRealizados;
                console.log(`Taxi ${id} asignado a un servicio. Atendiendo al Usuario ${solicitud.idUsuario}.`);

                // **Agregar el mensaje solicitado aquí**
                console.log(`Taxi ${id} ocupado... entrando en timeout`);

                // Notificar al servidor que está ocupado
                await socketPub.send(JSON.stringify({ id: id, x: x, y: y, ocupado: ocupado }));

                // Simulación de servicio de 30 segundos (30 minutos simulados)
                await new Promise(resolve => setTimeout(resolve, 30000));

                // Finalizar el servicio
                taxi.finalizarServicio();
                ocupado = taxi.ocupado;
                console.log(`Taxi ${id} ha completado el servicio y está disponible.`);

                // Notificar al servidor que está disponible
                await socketPub.send(JSON.stringify({ id: id, x: x, y: y, ocupado: ocupado }));

                // Verificar si se alcanzó el límite de servicios
                if (serviciosRealizados >= maxServicios) {
                    console.log(`Taxi ${id} ha completado el máximo de servicios diarios y finaliza su operación.`);
                    process.exit(0);
                }

                // Iniciar el regreso a la posición inicial
                console.log(`Taxi ${id} comenzará a regresar a la posición inicial (${xInicial}, ${yInicial}).`);
                regresarAPosicionInicial(intervaloMovimiento);
            }
        }
    }

    enviarPosicion();
    gestionarServicios();
})();
