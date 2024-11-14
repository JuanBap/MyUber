// taxis/taxi.js
require("dotenv").config();
const zmq = require("zeromq");
const process = require('process');

// Parámetros de entrada
const id = parseInt(process.argv[2]);
const n = parseInt(process.argv[3]);
const m = parseInt(process.argv[4]);
const xInicial = parseInt(process.argv[5]);
const yInicial = parseInt(process.argv[6]);
const velocidad = parseInt(process.argv[7]);
const maxServicios = parseInt(process.argv[8]); // Límite de servicios diarios

// Verificación de variables de entorno
if (!process.env.BROKER_PORT || !process.env.BROKER_PUB_PORT) {
    throw new Error("Las variables de entorno BROKER_PORT o BROKER_PUB_PORT no están definidas");
}

// Configuración del broker desde .env
const brokerRepAddress = `tcp://${process.env.BROKER_IP}:${process.env.BROKER_PORT}`;
const brokerPubAddress = `tcp://${process.env.BROKER_IP}:${process.env.BROKER_PUB_PORT}`;

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
    // Crear dos sockets Request
    const socketReqControl = new zmq.Request();
    const socketReqUpdate = new zmq.Request();
    const socketSub = new zmq.Subscriber();

    // Conectar al broker para solicitudes de control (register, deregister)
    await socketReqControl.connect(brokerRepAddress);
    console.log(`Taxi ${id}: Conectado al broker en ${brokerRepAddress} para control.`);

    // Conectar al broker para solicitudes de actualización (update)
    await socketReqUpdate.connect(brokerRepAddress);
    console.log(`Taxi ${id}: Conectado al broker en ${brokerRepAddress} para actualizaciones.`);

    // Conectar al broker para recibir notificaciones
    await socketSub.connect(brokerPubAddress); // PUB-SUB desde broker
    const estadoTopic = 'estado';
    socketSub.subscribe(estadoTopic);
    console.log(`Taxi ${id} suscrito a '${estadoTopic}' para recibir notificaciones.`);

    // Conectar al broker para recibir asignaciones específicas
    const assignmentTopic = `assignment-${id}`;
    socketSub.subscribe(assignmentTopic);
    console.log(`Taxi ${id} suscrito a '${assignmentTopic}' para recibir asignaciones.`);

    // Función para registrar el taxi en el servidor actual (central o réplica)
    async function registrarTaxi() {
        const mensajeRegistro = { type: 'register', id: id, x: x, y: y, ocupado: false };
        try {
            await socketReqControl.send(JSON.stringify(mensajeRegistro));
            const [msg] = await socketReqControl.receive();
            const respuesta = JSON.parse(msg.toString());

            if (respuesta.exito) {
                console.log(`Taxi ${id}: Registrado exitosamente en el servidor.`);
                console.log(`Taxi ${id}: Posición inicial: (${xInicial}, ${yInicial})`);
            } else {
                console.error(`Taxi ${id}: Error al registrar en el servidor. Mensaje: ${respuesta.mensaje}`);
                process.exit(1);
            }
        } catch (error) {
            console.error(`Taxi ${id}: Error al registrar en el servidor: ${error.message}`);
            process.exit(1);
        }
    }

    // Función para desregistrar el taxi del servidor actual (central o réplica)
    async function desregistrarTaxi() {
        const mensajeDesregistro = { type: 'deregister', id: id };
        try {
            await socketReqControl.send(JSON.stringify(mensajeDesregistro));
            const [msgDesreg] = await socketReqControl.receive();
            const respuestaDesreg = JSON.parse(msgDesreg.toString());

            if (respuestaDesreg.exito) {
                console.log(`Taxi ${id}: Desregistrado correctamente del servidor.`);
            } else {
                console.error(`Taxi ${id}: Error al desregistrar del servidor: ${respuestaDesreg.mensaje}`);
            }
        } catch (error) {
            console.error(`Taxi ${id}: Error al desregistrar del servidor: ${error.message}`);
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
                await socketReqUpdate.send(JSON.stringify(nuevaPosicion)); // Enviar la nueva posición
                const [msg] = await socketReqUpdate.receive();
                const respuesta = JSON.parse(msg.toString());
                if (!respuesta.exito) {
                    console.error(`Taxi ${id}: Error al actualizar posición: ${respuesta.mensaje}`);
                }
            } catch (error) {
                console.error(`Taxi ${id}: Error al enviar posición: ${error.message}`);
            }

            console.log(`Taxi ${id}: Se movió a (${x}, ${y})`);
        }, intervaloMovimiento);
    }

    // Función para manejar notificaciones de estado (activo/inactivo)
    async function manejarEstado() {
        for await (const [topic, msg] of socketSub) {
            const topicStr = topic.toString();
            const notificacion = JSON.parse(msg.toString());

            if (topicStr === 'estado') {
                if (notificacion.estado === 'inactivo') {
                    console.log(`Taxi ${id}: Detectado fallo del servidor central. Re-registrando en el servidor réplica.`);
                    // Desregistrarse del servidor actual
                    await desregistrarTaxi();

                    // Re-inicializar estado
                    x = xInicial;
                    y = yInicial;
                    ocupado = false;
                    serviciosRealizados = 0;

                    // Re-registrarse en el servidor réplica
                    await registrarTaxi();
                } else if (notificacion.estado === 'activo') {
                    console.log(`Taxi ${id}: El servidor central ha vuelto a estar activo.`);
                    // Opcional: Podrías implementar lógica para cambiar de nuevo al servidor central si lo deseas
                }
            } else if (topicStr === `assignment-${id}`) {
                // Asignación específica
                if (notificacion.type === 'assignment') {
                    console.log(`Taxi ${id}: Asignado al Usuario ${notificacion.idUsuario} en posición (${notificacion.xUsuario}, ${notificacion.yUsuario}).`);
                    serviciosRealizados += 1;
                    await servicioOcupado();
                }
            }
        }
    }

    // Función para manejar el servicio ocupado
    async function servicioOcupado(tiempoServicio = 30000) { // 30 segundos por defecto
        ocupado = true;
        console.log(`Taxi ${id}: Ocupado... entrando en timeout.`);

        // Simular servicio
        setTimeout(async () => {
            // Finalizar servicio
            ocupado = false;
            console.log(`Taxi ${id}: Ha completado el servicio y está disponible.`);

            // Regresar a la posición inicial
            x = xInicial;
            y = yInicial;
            const mensajeFinalizacion = { type: 'update', id: id, x: x, y: y, ocupado: false };
            try {
                await socketReqUpdate.send(JSON.stringify(mensajeFinalizacion)); // Enviar la nueva posición
                const [msgPos] = await socketReqUpdate.receive();
                const respuestaPos = JSON.parse(msgPos.toString());
                if (!respuestaPos.exito) {
                    console.error(`Taxi ${id}: Error al actualizar posición inicial: ${respuestaPos.mensaje}`);
                }
            } catch (error) {
                console.error(`Taxi ${id}: Error al enviar posición inicial: ${error.message}`);
            }

            console.log(`Taxi ${id}: Volvió a la posición inicial (${xInicial}, ${yInicial}) y está disponible nuevamente.`);

            // Verificar si se alcanzó el límite de servicios
            if (serviciosRealizados >= maxServicios) {
                console.log(`Taxi ${id}: Ha completado el máximo de servicios diarios y finaliza su operación.`);

                // Enviar mensaje de desregistro antes de salir
                await desregistrarTaxi();

                process.exit(0);
            }
        }, tiempoServicio);
    }

    // Iniciar las funciones
    enviarPosicion();
    manejarEstado();
})();
