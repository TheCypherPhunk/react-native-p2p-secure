import {Node, NodeInfo, NodeMessage} from './Node';
import forge from '../Utils/forge';
import net from 'net';
import { CryptoUtils } from '../Utils/cryptoUtils';

export type ClientNodeNeighbor = NodeInfo;

export type ServerStartMessageEncryptedPayload = {
    nodes: {
        username: string,
        ip: string,
        port: number,
        sendKey: string,
        receiveKey: string
    }[]
}

export class ClientNode extends Node {
    
    /**
     * Constructs a new ClientNode instance.
     * 
     * @param identifier - The identifier for the client node.
     * @param port - The port number for the client node.
     * @param rsaKeys - The RSA key pair for the client node.
     * @param neighbor - The neighbor client node.
     */
    constructor(identifier:string,  port:number, rsaKeys:forge.pki.rsa.KeyPair, neighbor: ClientNodeNeighbor) {
        super(identifier, port, rsaKeys, ClientNode.handleClientMessage);
        super.addNegihbor(neighbor);
        super.getTLSServer().once('connection', () => {
            this.eventEmitter.emit('session-started');
        });
    }

    /**
     * Handles the client message received by the ClientNode instance.
     * This method is responsible for processing the incoming message from a client and taking appropriate actions based on the message type.
     * It decrypts the message, validates the sender, and updates the list of neighbors accordingly.
     * If the message type is not 'hello', it delegates the handling to the handleMessage method of the Node instance for P2P message exchange.
     * 
     * @param instance - The ClientNode instance.
     * @returns A function that takes the received data, socket, and connection as parameters.
     */
    private static handleClientMessage(instance: Node) {
        return (data: string, socket: net.Socket, connection: forge.tls.Connection) => {
            let self = instance as ClientNode;
            let dataJSON : NodeMessage;
            dataJSON = JSON.parse(forge.util.decodeUtf8(data));
            
            if (dataJSON.type === 'hello' && self.neighbors.size === 1) {
                // console.log('[Node] handleClientMessage - ', 'Start Message Received');
                // console.log('[Node] handleClientMessage - ', 'Data: ', dataJSON);
                let sender = dataJSON.from;
                let neighbor = self.neighbors.get(sender);
                if(!neighbor) {
                    // console.log('[Node] handleClientMessage - ', 'Error getting neighbor: ', sender);
                    return;
                } else if (neighbor.ip !== socket.remoteAddress) {
                    // console.log(`[Node] handleClientMessage - `, `Neighbor not authenticated, skipping hello. Neighbor: ${sender}`);
                    // console.log( `[Node] handleClientMessage - `, `Registered address for user ${sender}: ${neighbor.ip}:${neighbor.serverPort}`);
                    // console.log( `[Node] handleClientMessage - `, `Actual address for user ${sender}: ${socket.remoteAddress}:${socket.remotePort}`);
                    return;
                }

                let encryptedPayload = forge.util.decode64(dataJSON.encryptedMessage);
                let iv = forge.util.decode64(dataJSON.iv);
                let key = neighbor.receiveKey;
                if(!key) {
                    // console.log('[Node] handleClientMessage - ', 'Error getting key for neighbor: ', sender);
                    return;
                }
                let decrypted = CryptoUtils.aesDecrypt(key as string, iv, encryptedPayload);
                decrypted.message = forge.util.decode64(decrypted.message as string);
                let payload: ServerStartMessageEncryptedPayload = JSON.parse(decrypted.message as string);
                // console.log('[Node] handleClientMessage - ', 'Payload: ', payload);
                let receiveKey = payload.nodes.find((node) => {
                    return node.username === self.identifier && node.port === self.tcpServerPort;
                })?.receiveKey;
                payload.nodes.forEach((node) => {
                    if (!self.neighbors.has(node.username)) {
                        self.addNegihbor({
                            info: {
                                userName: node.username,
                                ip: node.ip,
                                port: node.port
                            },
                            sendKey: node.sendKey,
                            receiveKey: receiveKey as string
                        });
                    }
                });
                self.neighbors.forEach((neighbor, username) => {
                    neighbor.tlsSocket.connect(neighbor.serverPort, neighbor.ip).then(()=>{
                        // console.log('[Node] start - ', 'Connecting to neighbor: ', username);
                    }).catch((error) => {
                        // console.log('[Node] start - ', 'Error connecting to neighbor: ', error);
                    });
                });

                self.sendMessage('', sender, 'ack-hello');
            } else {
                self.handleMessage(data, socket, connection);
            }
        }
    }
}