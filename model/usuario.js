// model/usuario.js

class Usuario {
    constructor(id, x, y, tiempoEspera) {
        // Validación de parámetros
        if (typeof id !== 'number' || id <= 0) {
            throw new Error("El identificador del usuario debe ser un número entero positivo.");
        }
        if (!Number.isInteger(x) || x < 0) {
            throw new Error("La coordenada X debe ser un número entero no negativo.");
        }
        if (!Number.isInteger(y) || y < 0) {
            throw new Error("La coordenada Y debe ser un número entero no negativo.");
        }
        if (!Number.isInteger(tiempoEspera) || tiempoEspera < 0) {
            throw new Error("El tiempo de espera debe ser un número entero no negativo.");
        }

        this.id = id;
        this.x = x;
        this.y = y;
        this.tiempoEspera = tiempoEspera; // Tiempo en minutos hasta que necesite un taxi
        this.solicitudRealizada = false;   // Estado de la solicitud (solicitada o no)
        this.tiempoRespuesta = null;       // Tiempo de respuesta del servidor
        this.resultadoSolicitud = null;    // Resultado de la solicitud (aceptada o no)
    }

    // Método para registrar el resultado de la solicitud de taxi
    registrarSolicitudExitosa(tiempoRespuesta) {
        this.solicitudRealizada = true;
        this.tiempoRespuesta = tiempoRespuesta;
        this.resultadoSolicitud = "satisfactoria";
    }

    // Método para registrar un resultado no satisfactorio (timeout o falta de taxis)
    registrarSolicitudNoSatisfactoria(razon) {
        this.solicitudRealizada = true;
        this.resultadoSolicitud = razon;
    }

    // Mostrar información del usuario por consola (console.log)
    mostrarInformacion() {
        console.log(`Usuario ${this.id} en posición (${this.x}, ${this.y}) - Solicitud realizada: ${this.solicitudRealizada} - Resultado: ${this.resultadoSolicitud}`);
    }
}

module.exports = Usuario;
