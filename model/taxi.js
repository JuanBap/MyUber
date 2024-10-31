class Taxi{

    constructor(id, x, y, velocidad, maxServicios){
        this.id = id;
        this.x = x;
        this.y = y;
        this.posicionInicial = {x: x, y: y};
        this.velocidad = velocidad;
        this.maxServicios = maxServicios;
        this.serviciosRealizados = 0;
        this.ocupado = false;
    }

    //Método para marcar el taxi como ocupado y aumentar el contador de servicios
    asignarServicio(){
        if(this.serviciosRealizados < this.maxServicios){
            this.serviciosRealizados += 1;
            this.ocupado = true;
        }
    }

    //Método para liberar el taxi después de completar un servicio
    finalizarServicio(){
        this.ocupado = false;
        this.x = this.posicionInicial.x;
        this.y = this.posicionInicial.y;
    }

    //Mostrar información del taxi por consola (console.log)    
    mostrarInformacion(){
        console.log(`Taxi ${this.id} en posición (${this.x},${this.y})`);
    }

}

module.exports = Taxi;