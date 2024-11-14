# Proyecto MyUber - Introducción a Sistemas Distribuidos

## Preparar el entorno para la ejecución

- npm install dotenv mongoose zeromq

---

# .env

# Servidor Central
SERVER_IP=127.0.0.1
SERVER_PORT_PUB=5556
SERVER_PORT_REP=5555

# Servidor Réplica
REPLICA_SERVER_IP=127.0.0.1
REPLICA_SERVER_PORT_PUB=5558
REPLICA_SERVER_PORT_REP=5557

# Broker
BROKER_PORT=6000         # Puerto para recibir solicitudes de taxis y generadores de usuarios
BROKER_PUB_PORT=6001     # Puerto para publicar notificaciones a taxis y generadores de usuarios
BROKER_TO_REPLICA_PORT=6002 # Puerto para enviar notificaciones al servidor réplica