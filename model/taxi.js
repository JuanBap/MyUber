// model/taxi.js

class Taxi {
    constructor(id, x, y, velocidad, maxServicios) {
        // Validación de parámetros
        if (typeof id !== 'number' || id <= 0) {
            throw new Error("El identificador del taxi debe ser un número entero positivo.");
        }
        if (!Number.isInteger(x) || x < 0) {
            throw new Error("La coordenada X debe ser un número entero no negativo.");
        }
        if (!Number.isInteger(y) || y < 0) {
            throw new Error("La coordenada Y debe ser un número entero no negativo.");
        }
        if (![1, 2, 4].includes(velocidad)) {
            throw new Error("La velocidad debe ser 1, 2 o 4 km/h.");
        }
        if (!Number.isInteger(maxServicios) || maxServicios <= 0) {
            throw new Error("El número máximo de servicios debe ser un número entero positivo.");
        }

        this.id = id;
        this.x = x;
        this.y = y;
        this.posicionInicial = { x: x, y: y };
        this.velocidad = velocidad;
        this.maxServicios = maxServicios;
        this.serviciosRealizados = 0;
        this.ocupado = false;
    }

    // Método para marcar el taxi como ocupado y aumentar el contador de servicios
    asignarServicio() {
        if (this.serviciosRealizados < this.maxServicios) {
            this.serviciosRealizados += 1;
            this.ocupado = true;
        } else {
            throw new Error(`Taxi ${this.id} ha alcanzado el máximo de servicios diarios.`);
        }
    }

    // Método para liberar el taxi después de completar un servicio
    finalizarServicio() {
        this.ocupado = false;
        this.x = this.posicionInicial.x;
        this.y = this.posicionInicial.y;
    }

    // Mostrar información del taxi por consola (console.log)
    mostrarInformacion() {
        console.log(`Taxi ${this.id} en posición (${this.x}, ${this.y}) - Ocupado: ${this.ocupado} - Servicios realizados: ${this.serviciosRealizados}/${this.maxServicios}`);
    }
}

module.exports = Taxi;
