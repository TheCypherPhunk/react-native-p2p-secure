import {Node, NodeInfo, NodeMessage} from './Node';
import forge from '../Utils/forge';
import net from 'net';

export type ServerNodeNeighbor = NodeInfo;

export type ServerStartMessageEncryptedPayload = {
    nodes: {
        username: string,
        ip: string,
        port: number,
        sendKey: string,
        receiveKey: string
    }[]
}

export class ServerNode extends Node {
    ackedNeighbors: Set<string> = new Set();

    /**
     * Represents a ServerNode instance.
     * @constructor
     * @param {string} identifier - The identifier of the ServerNode.
     * @param {number} port - The port number of the ServerNode.
     * @param {forge.pki.rsa.KeyPair} rsaKeys - The RSA key pair of the ServerNode.
     * @param {ServerNodeNeighbor[]} neighbors - The neighbors of the ServerNode.
     */
    constructor(identifier:string, port:number, rsaKeys:forge.pki.rsa.KeyPair, neighbors: ServerNodeNeighbor[]) {
        super(identifier, port, rsaKeys, ServerNode.handleClientMessage);
        neighbors.forEach((neighbor) => {
            super.addNegihbor(neighbor);
        });
    }

    /**
     * Handles the client message received by the server node.
     * This method is responsible for processing the data received from a client and delegating it to the appropriate handler.
     * It is intended to be used as a callback function for client messages.
     *
     * @param instance - The instance of the ServerNode class.
     * @returns A callback function that takes the data, socket, and connection as parameters.
     *
     * @remarks
     * This method is an internal implementation detail of the ServerNode class and should not be called directly.
     * It is automatically invoked when a client message is received by the server node.
     */
    private static handleClientMessage(instance:Node) {
        return (data: string, socket: net.Socket, connection: forge.tls.Connection) => {
            let self = instance as ServerNode;
            let dataJSON : NodeMessage;
            dataJSON = JSON.parse(forge.util.decodeUtf8(data));
            
            if (dataJSON.type === 'ack-hello') {
                console.log('[Node] handleClientMessage - ', 'Start Message Received');
                console.log('[Node] handleClientMessage - ', 'Data: ', dataJSON);
                let sender = dataJSON.from;
                let neighbor = self.neighbors.get(sender);
                if(!neighbor) {
                    console.log('[Node] handleClientMessage - ', 'Error getting neighbor: ', sender);
                    return;
                } else if (neighbor.ip !== socket.remoteAddress) {
                    console.log(`[Node] handleClientMessage - `, `Neighbor not authenticated, skipping hello. Neighbor: ${sender}`);
                    console.log( `[Node] handleClientMessage - `, `Registered address for user ${sender}: ${neighbor.ip}:${neighbor.serverPort}`);
                    console.log( `[Node] handleClientMessage - `, `Actual address for user ${sender}: ${socket.remoteAddress}:${socket.remotePort}`);
                    return;
                }

                self.ackedNeighbors.add(sender);

                if(self.ackedNeighbors.size === self.neighbors.size) {
                    self.eventEmitter.emit('session-started');
                    self.ackedNeighbors.clear();
                }
                
            } else {
                self.handleMessage(data, socket, connection);
            }
        }
    }

    /**
     * Generates the hello message to be sent to the connected neighbors. The payload of the hello message contains the list of neighbors of the server node.
     * This includes the username, IP address, port number, and public keys of the neighbors.
     * @returns The hello message as a string.
     */
    private _generateHelloMessage() : string {
        let payload: ServerStartMessageEncryptedPayload = {nodes: []}
        this.neighbors.forEach((neighbor, username) => {
            payload.nodes.push({
                username: username,
                ip: neighbor.ip,
                port: neighbor.serverPort,
                sendKey: neighbor.sendKey,
                receiveKey: neighbor.receiveKey
            });
        });
        return JSON.stringify(payload);
    }

    /**
     * Sends a hello message to all neighbors. Neighbors receive this message to establish a connection with the other neighbor nodes along with the server node.
     */
    private sayHello() {
        console.log('[ServerNode] sayHello - ', 'Saying hello to neighbors');
        let helloMessage = this._generateHelloMessage();
        if(this.neighbors){
            this.neighbors.forEach((nodeInfo, username) => {
                if(helloMessage) {
                    this.sendMessage(helloMessage, username, 'hello');
                }
            });
            console.log('[ServerNode] sayHello - ', 'Hello messages sent')
        }
    }

    /**
     * Starts the server node by connecting to all neighbors and sending a hello message, ultimately starting the P2P network.
     */
    public start(): void {
        this.neighbors.forEach((neighbor, username) => {
            neighbor.tlsSocket.connect(neighbor.serverPort, neighbor.ip).then(()=>{
                console.log('[Node] start - ', 'Connecting to neighbor: ', username);
            }).catch((error) => {
                this.eventEmitter.emit('error', {error: error, metadata: {func: 'start', username: username}});
                console.log('[Node] start - ', 'Error connecting to neighbor: ', error);
            });
        });
        this.sayHello();    
    }
}