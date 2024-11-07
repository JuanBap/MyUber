// taxis/taxi.js
require("dotenv").config();
const zmq = require("zeromq");

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

// Estado inicial del taxi
let x = xInicial;
let y = yInicial;
let ocupado = false;
let serviciosRealizados = 0; // Contador de servicios completados

// Función principal
(async () => {
    const socketReq = new zmq.Request();
    const socketSub = new zmq.Subscriber();

    // Conectar al servidor para solicitudes y actualizaciones
    await socketReq.connect(serverRepAddress); // REQ-REP para registro y actualizaciones

    // Conectar al servidor para recibir asignaciones
    await socketSub.connect(serverPubAddress); // PUB-SUB para asignaciones
    const assignmentTopic = `assignment-${id}`;
    socketSub.subscribe(assignmentTopic);
    console.log(`Taxi ${id} suscrito a '${assignmentTopic}' para recibir asignaciones.`);

    // Función para registrar el taxi en el servidor central
    async function registrarTaxi() {
        const mensajeRegistro = { type: 'register', id: id, x: x, y: y, ocupado: false };
        await socketReq.send(JSON.stringify(mensajeRegistro));
        const [msg] = await socketReq.receive();
        const respuesta = JSON.parse(msg.toString());

        if (respuesta.exito) {
            console.log(`Taxi ${id} registrado exitosamente en el servidor central.`);
            console.log(`Posición inicial: (${xInicial}, ${yInicial})`);
        } else {
            console.error(`Error al registrar Taxi ${id} en el servidor central.`);
            process.exit(1);
        }
    }

    // Llamada inicial de registro
    await registrarTaxi();

    // Calcular el intervalo de movimiento en función de la velocidad
    const minutosSimuladosPorSegundo = 1; // Cada segundo en tiempo real es un minuto en el sistema
    const intervaloMovimiento = (60 * 1000) / (velocidad * minutosSimuladosPorSegundo); // Intervalo en ms

    // Función para mover el taxi y enviar posición
    async function enviarPosicion() {
        setInterval(async () => {
            if (ocupado || serviciosRealizados >= maxServicios) return; // No se mueve si está ocupado o alcanzó el límite

            // Alterna movimiento horizontal y vertical
            if (Math.random() < 0.5) {
                x = x < n - 1 ? x + 1 : x - 1; // Mover en x
            } else {
                y = y < m - 1 ? y + 1 : y - 1; // Mover en y
            }

            const nuevaPosicion = { type: 'update', id: id, x: x, y: y, ocupado: ocupado };
            try {
                await socketReq.send(JSON.stringify(nuevaPosicion)); // Enviar la nueva posición
                const [msg] = await socketReq.receive();
                const respuesta = JSON.parse(msg.toString());
                if (!respuesta.exito) {
                    console.error(`Error al actualizar posición del Taxi ${id}: ${respuesta.mensaje}`);
                }
            } catch (error) {
                console.error(`Error al enviar posición del Taxi ${id}: ${error.message}`);
            }

            console.log(`Taxi ${id} se movió a (${x}, ${y})`);
        }, intervaloMovimiento);
    }

    // Función para manejar asignaciones recibidas
    async function manejarAsignacion() {
        for await (const [topic, msg] of socketSub) {
            const asignacion = JSON.parse(msg.toString());
            if (asignacion.type === 'assignment') {
                console.log(`Taxi ${id} ocupado... entrando en timeout`);

                // Marcar como ocupado
                ocupado = true;
                serviciosRealizados += 1;

                // Simular servicio de 30 segundos
                setTimeout(async () => {
                    // Finalizar servicio
                    ocupado = false;
                    console.log(`Taxi ${id} ha completado el servicio y está disponible.`);

                    // Regresar a la posición inicial
                    x = xInicial;
                    y = yInicial;
                    const mensajeFinalizacion = { type: 'update', id: id, x: x, y: y, ocupado: false };
                    try {
                        await socketReq.send(JSON.stringify(mensajeFinalizacion)); // Actualizar posición inicial
                        const [msgPos] = await socketReq.receive();
                        const respuestaPos = JSON.parse(msgPos.toString());
                        if (!respuestaPos.exito) {
                            console.error(`Error al actualizar posición del Taxi ${id}: ${respuestaPos.mensaje}`);
                        }
                    } catch (error) {
                        console.error(`Error al enviar posición del Taxi ${id}: ${error.message}`);
                    }

                    console.log(`Taxi ${id} volvió a la posición inicial (${xInicial}, ${yInicial}) y está disponible nuevamente.`);

                    // Verificar si se alcanzó el límite de servicios
                    if (serviciosRealizados >= maxServicios) {
                        console.log(`Taxi ${id} ha completado el máximo de servicios diarios y finaliza su operación.`);

                        // Enviar mensaje de desregistro antes de salir
                        const mensajeDesregistro = { type: 'deregister', id: id };
                        try {
                            await socketReq.send(JSON.stringify(mensajeDesregistro));
                            const [msgDesreg] = await socketReq.receive();
                            const respuestaDesreg = JSON.parse(msgDesreg.toString());
                            if (respuestaDesreg.exito) {
                                console.log(`Taxi ${id} desregistrado correctamente del servidor central.`);
                            } else {
                                console.error(`Error al desregistrar Taxi ${id}: ${respuestaDesreg.mensaje}`);
                            }
                        } catch (error) {
                            console.error(`Error al desregistrar Taxi ${id}: ${error.message}`);
                        }

                        process.exit(0);
                    }
                }, 30000); // 30 segundos para simular el servicio
            }
        }
    }

    enviarPosicion();
    manejarAsignacion();
})();
