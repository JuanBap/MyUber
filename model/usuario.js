class Usuario{
    constructor(id, x, y, tiempoEspera){
        this.id = id;
        this.x = x;
        this.y = y;
        this.tiempoEspera = tiempoEspera; //Tiempo en minutos hasta que necesite un taxi
        this.solicitudRealizada = false;  //Estado de la solicitud (solicitada o no)
        this.tiempoRespuesta = null;      //Tiempo de respuesta del servidor
        this.resultadoSolicitud = null;   //Resultado de la solicitud (aceptada o no)
    }


    //Método para registrar el resultado de la solicitud de taxi
    registrarSolicitudExitosa(tiempoRespuesta){
        this.solicitRealizada = true;
        this.tiempoRespuesta = tiempoRespuesta;
        this.resultadoSolicitud = "satisfactoria";
    }

    //Método para registrar un resultado no satisfactorio (timeout o falta de taxis)
    registrarSolicitudNoSatisfactoria(razon){
        this.solicitRealizada = true;
        this.resultadoSolicitud = razon;
    }

    //Mostrar información del usuario por consola (console.log)
    mostrarInformacion(){
        console.log(`Usuario ${this.id} en posición (${this.x},${this.y})`);
    }

}

module.exports = Usuario;





