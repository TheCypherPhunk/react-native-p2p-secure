import forge from '../Utils/forge';
import { SRPHandshakeResult } from '../Coordinator';
import { TLSServer } from '../TLS/TLSServer';
import { TLSClient } from '../TLS/TLSClient';
import { CryptoUtils } from '../Utils/cryptoUtils';
import net from 'net';
import { EventEmitter } from 'events';


export type ServerStartMessage = {
    type: 'start',
    encryptedPayload: string,
    iv: string
}

export type NodeMessage = {
    type: 'message' | 'hello' | 'broadcast' | 'ack-hello',
    encryptedMessage: string,
    iv: string,
    from: string
}

export type NodeInfo = SRPHandshakeResult | {
    info: {
        userName: string,
        ip: string,
        port: number
    },
    sendKey: string,
    receiveKey: string,
}

export type Neighbor = {
    ip: string,
    port: number,
    tlsSocket: TLSClient,
    sendKey: string,
    receiveKey: string,
    connectionPromise: Promise<void>
}

/**
 * Represents a node in a network.
 */
export class Node {
    private tlsServer!: TLSServer;
    private reconnecting: boolean;
    protected tcpServerPort!: number;
    protected rsaKeys!: forge.pki.rsa.KeyPair;
    protected identifier!: string;
    protected neighbors!: Map<string, {ip: string, serverPort: number, clientPort?: number, tlsSocket:TLSClient, sendKey:string, receiveKey:string, connectionPromise: Promise<void>, disconnected?: boolean, serverSoftDisconnected?: boolean, softDisconnected?: boolean, rebuildingSocket?: boolean}>;
    protected eventEmitter!: EventEmitter;

    /**
     * Represents a Node in the network.
     * @constructor
     * @param {string} identifier - The identifier of the node.
     * @param {number} tcpServerPort - The TCP server port for the node.
     * @param {forge.pki.rsa.KeyPair} rsaKeys - The RSA key pair for the node.
     * @param {(instance: Node) => (data: string, socket: net.Socket, connection: forge.tls.Connection) => void} handler - The handler function for the node.
     */
    public constructor(identifier: string, tcpServerPort: number, rsaKeys: forge.pki.rsa.KeyPair, handler: (instance: Node) => (data: string, socket: net.Socket, connection: forge.tls.Connection) => void) {
        this.identifier = identifier;
        this.tcpServerPort = tcpServerPort;
        this.rsaKeys = rsaKeys;
        this.neighbors = new Map();
        this.eventEmitter = new EventEmitter();
        this.tlsServer = new TLSServer(this.rsaKeys, this.tcpServerPort, this.identifier, handler(this), true);
        this.tlsServer.listen(this.tcpServerPort);
        this.initReconnectLogic();
        this.reconnecting = false;
        // console.log('[Node] constructor - ', 'Server Started');
    }

    /**
     * Gets the TCP port of the Node.
     * @returns The TCP port number.
     */
    get tcpPort() {
        return this.tcpServerPort;
    }

    protected getTLSServer() {
        return this.tlsServer;
    }

    /**
     * Handles the incoming message from a connected node.
     * 
     * @param data - The received data as a string.
     * @param socket - The network socket associated with the connection.
     * @param connection - The TLS connection object.
     * @returns void
     * 
     * @remarks
     * This method is responsible for processing the incoming message from a connected node.
     * It performs the necessary decryption and validation steps before emitting the 'message' event.
     * 
     * @throws Error - If there is an error getting the neighbor or the key for the neighbor.
     * 
     * @emits message - When a valid message is received, the 'message' event is emitted with the sender and payload as arguments.
     */
    protected handleMessage(data:string, socket: net.Socket, connection: forge.tls.Connection) {
        let self = this;
        let dataJSON : NodeMessage;
        dataJSON = JSON.parse(forge.util.decodeUtf8(data));

        if (dataJSON) {
            if (dataJSON.type === 'message') {
            
                // console.log('[Node] handleClientMessage - ', 'Message Received');
                // console.log('[Node] handleClientMessage - ', 'Data: ', dataJSON);

                let encryptedPayload = forge.util.decode64(dataJSON.encryptedMessage);
                let iv = forge.util.decode64(dataJSON.iv);
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

                let key = neighbor.receiveKey;
                // console.log('[Node] handleClientMessage - ', 'Key: ', key)
                if(!key) {
                    // console.log('[Node] handleClientMessage - ', 'Error getting key for neighbor: ', sender);
                    return;
                }

                let decrypted = CryptoUtils.aesDecrypt(key as string, iv, encryptedPayload);
                let payload: string = forge.util.createBuffer(forge.util.decode64(decrypted.message as string)).toString();
                // console.log('[Node] handleClientMessage - ', 'Payload from ' + sender + ': ', payload);
                this.eventEmitter.emit('message', sender, payload);
                
            }
        }
    }

    /**
     * Broadcasts a message to all neighbors.
     * @param message - The message to be broadcasted.
     */
    public broadcastMessage(message: string) {
        this.neighbors.forEach((neighbor, username) => {
            this.sendMessage(message, username);
        });
    }

    /**
     * Sends a message to a specific neighbor.
     * @param message - The message to be sent.
     * @param username - The username of the neighbor to send the message to.
     * @param messageType - The type of the message. Defaults to 'message'.
     * @returns void
     * @remarks
     * This method encrypts the message using AES encryption before sending it to the neighbor.
     * If the encryption fails, an error message is logged and an empty string is returned.
     * The encrypted message is sent over a TLS socket connection.
     */
    public async sendMessage(message: string, username: string, messageType: 'message' | 'broadcast' | 'hello' | 'ack-hello' = 'message') {
        let neighbor = this.neighbors.get(username);

        if (neighbor) {
            let msg = forge.util.encode64(forge.util.createBuffer(message, 'utf8').bytes());
            let iv = forge.random.getBytesSync(16);
            let key = neighbor.sendKey;
            let encrypted = CryptoUtils.aesEncrypt(key, iv, msg);
            if(encrypted.status !== 'success') {
                // console.log('[Node] sendMessage - ', 'Error encrypting payload');
                this.eventEmitter.emit('error', {error: 'Error encrypting payload', metadata: {fn: 'sendMessage', message: message, username: username, messageType: messageType}});
                return Promise.reject('Error encrypting payload')
            } else {
                let NodeMessage: NodeMessage = {
                    type: messageType,
                    encryptedMessage: forge.util.encode64(encrypted.message as string),
                    iv: forge.util.encode64(iv),
                    from: this.identifier
                }
                // console.log('[Node] sendMessage - ', 'Message: ', msg);
                neighbor.connectionPromise.then(() => {
                    neighbor!.tlsSocket.send(JSON.stringify(NodeMessage)).then(() => {
                        // console.log('[Node] sendMessage - ', 'Message sent to neighbor: ', username);
                        return Promise.resolve();
                    });
                });
            }
        }
    }

    /**
     * Adds a neighbor to the node.
     * 
     * @param nodeInfo - The information of the neighbor node.
     * @remarks
     * This method establishes a connection with the neighbor node using TLSClient.
     * It sets up event listeners for 'connected', 'data', 'closed', and 'error' events emitted by the TLSClient.
     * If the neighbor node is successfully connected, the 'connected' event is emitted.
     * If data is received from the neighbor node, the 'data' event is emitted.
     * If the connection is closed, the 'closed' event is emitted.
     * If an error occurs during the connection, the 'error' event is emitted.
     */
    protected addNegihbor(nodeInfo: NodeInfo) {
        //extract username and ip from username@ip
        let username = nodeInfo.info.userName;
        let ip = nodeInfo.info.ip;
        if(username === this.identifier && nodeInfo.info.port === this.tcpServerPort) return;
        let {tlsClient, deferredPromise} = this._generateNeighborTLSClient(username, new TLSClient(username, this.rsaKeys, true));
        //if nodeinfo is SRPHandshakeResult
        if('key' in nodeInfo) {
            this.neighbors.set(username, {ip: ip, serverPort: nodeInfo.info.port, tlsSocket: tlsClient, sendKey: nodeInfo.key, receiveKey: nodeInfo.key, connectionPromise: deferredPromise.promise});
        } else {
            this.neighbors.set(username, {ip: ip, serverPort: nodeInfo.info.port, tlsSocket: tlsClient, sendKey: nodeInfo.sendKey, receiveKey: nodeInfo.receiveKey, connectionPromise: deferredPromise.promise});
        }
        
        // console.log('[Node] addNeighbor - ', 'Connecting to neighbor: ', username);
    }

    /**
     * Registers a callback function to be executed when the specified event occurs.
     * 
     * @param event - The name of the event to listen for.
     * @param callback - The callback function to be executed when the event occurs.
     */
    public on(event: 'message' | 'session-started' | 'disconnected' | 'reconnected' | 'connected' | 'error', callback: (...args: any[]) => void) {
        this.eventEmitter.on(event, callback);
    }

    /**
     * Returns an array of neighbors connected to the node.
     * @returns {Array<string>} An array of neighbor node IDs.
     */
    public getNeighbors(): Array<string> {
        return Array.from(this.neighbors.keys());
    }
    
    /**
     * Returns the status of the neighbors connected to the node.
     * @returns {Array<{username: string, status: string}>} An array of objects containing the username and status of the neighbors.
     * @remarks
     * The status of a neighbor can be either 'connected' or 'disconnected'.
     * The status of a neighbor is determined by the 'disconnected' property of the neighbor object.
     */
    public getNeighborStatus(): [{username: string, status: string}] {
        let status: any = [];
        this.neighbors.forEach((neighbor, username) => {
            let n = {username: username, status: this._isNeighborDisconnected(username) ? 'disconnected' : 'connected'};
            status.push(n);
        });
        return status;
    }

    /**
     * Generates a new TLSClient instance for a neighbor using the specified username.
     * @param username
     * @returns 
     */
    private _generateNeighborTLSClient(username: string, tlsClient: TLSClient) {
        let self = this

        function _generateDeferredPromise() {
            let resolve: any, reject: any;
            const promise: Promise<void> = new Promise((res, rej) => {
                [resolve, reject] = [res, rej];
            });
            return {promise, reject, resolve};
        }
        
        let deferredPromise = _generateDeferredPromise();

        let neighbor = this.neighbors.get(username);
        if(neighbor) {
            neighbor.tlsSocket = tlsClient;
            neighbor.connectionPromise = deferredPromise.promise;
        }

        tlsClient.on('tls-connected', function () {
            // console.log('[Node.ts][socket] tls-connected to neighbor: ' + username);
            deferredPromise.resolve();
            let neighbor = self.neighbors.get(username);
            if(neighbor) {
                neighbor.disconnected = false;
                neighbor.softDisconnected = false;
                neighbor.serverSoftDisconnected = false;
                neighbor.rebuildingSocket = false;
            }
            self.eventEmitter.emit('connected', username);
        });

        tlsClient.on('socket-connected', function () {
            // console.log('[Node.ts][socket] socket-connected to neighbor: ' + username);
            
        });

        tlsClient.on('data', function (data:string) {
            // console.log('[Node.ts][socket] received data from server: ' + data);
        });

        tlsClient.on('socket-closed', async function () {
            // console.log('[Node.ts][socket] socket connection closed');
            let was_disconnected = self._isNeighborDisconnected(username);
            self.neighbors.get(username)!.disconnected = true;
            // await self.tlsServer.disconnectClient(self.neighbors.get(username)!.ip);

            if(Array.from(self.neighbors.values()).every((neighbor) => neighbor.disconnected)) {
                self.reconnect();
            }
            
            !was_disconnected ? self.eventEmitter.emit('disconnected', username) : null;
        });

        tlsClient.on('disconnected', function () {
            // console.log('[Node.ts][socket] disconnected from neighbor: ' + username);
            let was_disconnected = self._isNeighborDisconnected(username);
            let neighbor = self.neighbors.get(username);
            neighbor!.softDisconnected = true;

            if(Array.from(self.neighbors.values()).every((neighbor) => neighbor.softDisconnected && !neighbor.disconnected)) {
                self.reconnect();
            }
        
            !was_disconnected ? self.eventEmitter.emit('disconnected', username) : null;
        });

        tlsClient.on('reconnected', function () { 
            // console.log('[Node.ts][socket] reconnected to neighbor: ' + username);
            self.neighbors.get(username)!.softDisconnected = false;
            self.eventEmitter.emit('reconnected', username);
        });

        tlsClient.on('socket-error', function (error:string) {
            // console.log('[Node.ts][socket] socket error', error);
            // deferredPromise.reject();
        });

        tlsClient.on('tls-error', function (error:string) {
            // console.log('[Node.ts][socket] tls error', error);
            // deferredPromise.reject();
        });

        return {tlsClient, deferredPromise};
    }

    /**
     * Initializes the reconnect logic for the node.
     * @returns void
     * @remarks
     * This method listens for incoming connections and checks if the neighbor has reconnected.
     * If the neighbor has reconnected, the 'reconnected' event is emitted.
     */
    private initReconnectLogic() {

        let self = this;

        function getNeighborByAddress(ip: string) {
            for (let [username, neighbor] of self.neighbors.entries()) {
                if(neighbor.ip === ip) {
                    return username
                }
            }
            return null;
        }

        this.tlsServer.on('connection', (socket: net.Socket, connection: forge.tls.Connection) => {
            // console.log('[Node] initReconnectLogic (connection) - ', 'Connection established:', 'Address: ', socket.remoteAddress, 'Port: ', socket.remotePort);

            let neighborUsername = getNeighborByAddress(socket.remoteAddress as string);
            if(neighborUsername) { //This is a neighbor trying to reconnect because we already have him in the neighbors list
                let neighborObj = self.neighbors.get(neighborUsername)!;
                neighborObj.serverSoftDisconnected = false;
                if(neighborObj.clientPort!==socket.remotePort) {
                    // console.log('[Node] initReconnectLogic (connection) - ', 'Neighbor port mismatch: ', neighborObj.clientPort, socket.remotePort);
                    neighborObj.clientPort = socket.remotePort;
                }
                // console.log('[Node] initReconnectLogic (connection) - ', 'Neighbor: ', neighborUsername);
                
                // console.log('[Node] initReconnectLogic (connection) - ', 'Neighbor reconnecting: ', neighborUsername);
                self.reconnect_user(neighborUsername).then(() => {
                    // console.log('[Node] initReconnectLogic (connection) - ', 'Connected to neighbor: ', neighborUsername);
                });
            }
        });

        this.tlsServer.on('disconnected', ({address, port}) => {
            // console.log('[Node] initReconnectLogic (disconnected) - ', 'Connection disconnected:', 'Address: ', address, 'Port: ', port);

            let neighborUsername = getNeighborByAddress(address);
            if(neighborUsername) {
                // console.log('[Node] initReconnectLogic (disconnected) - ', 'Neighbor disconnected: ', neighborUsername);
                this.neighbors.get(neighborUsername)!.serverSoftDisconnected = true;
                if(Array.from(this.neighbors.values()).every((neighbor) => neighbor.serverSoftDisconnected)) {
                    this.reconnect();
                }
            }
        });

        this.tlsServer.on('reconnected', ({address, port})=>{
            // console.log('[Node] initReconnectLogic (reconnected) - ', 'Address reconnected: ', address);

            let neighborUsername = getNeighborByAddress(address);
            if(neighborUsername) {
                // console.log('[Node] initReconnectLogic (reconnected) - ', 'Neighbor reconnected: ', neighborUsername);
                this.neighbors.get(neighborUsername)!.serverSoftDisconnected = false;
                this.neighbors.get(neighborUsername)!.disconnected = true
                    this.reconnect_user(neighborUsername).then(() => {
                        // console.log('[Node] initReconnectLogic (reconnected) - ', 'Reconnected to neighbor: ', neighborUsername);
                    });

            }
        })
    }
    
    /**
     * Reconnects the node to the network.
     * @returns void
     * @remarks
     * This method destroys the current TLS server and rebuilds it.
     * It also reconnects all the neighbors to the node.
     */
    private async reconnect() {
        if(this.reconnecting) { return }

        this.reconnecting = true;
        let self = this;

        if(!Array.from(this.neighbors.values()).every((neighbor) => !neighbor.disconnected && !neighbor.softDisconnected && !neighbor.serverSoftDisconnected)) {
            // console.log('[Node.ts][reconnect] Destroying server')
            await this.tlsServer.destroy()

            // console.log('[Node.ts][reconnect] Rebuilding server');
            await this.tlsServer.rebuild();
            self.initReconnectLogic();
        }

        let reconnectPromises = [];
        // console.log('[Node.ts][reconnect] Rebuilding neighbors');
        for (let [username, neighbor] of this.neighbors.entries()) {
            // neighbor.disconnected = true;
            reconnectPromises.push(self.reconnect_user(username));

        }
        //check if all neighbors are reconnected through connectionPromise
        return Promise.all(reconnectPromises).then(() => {
            self.reconnecting = false;
            // console.log('[Node.ts][reconnect] Reconnected to all neighbors');
        });

    }

    /**
     * Reconnects the node to the network.
     * @param username - The username of the neighbor to reconnect.
     * @returns void
     * @remarks
     * This method reconnects the node to the network by establishing a new TLS connection to the specified neighbor.
     * If the connection is established successfully, the 'reconnected' event is emitted.
     * If an error occurs during the connection, an error message is logged.
     */
    private async reconnect_user(username: string) {
        let self = this;
        let neighbor = this.neighbors.get(username);

        let deferredPromise = new Promise<void>((resolve, reject) => {
            resolve();
        });

        if(neighbor) {
            let resolve: any;
            deferredPromise = new Promise((res, rej) => {
                resolve = res
            });

            deferredPromise.then(()=>{
                // console.log('[Node.ts][reconnect] Resolved promise for neighbor: ' + username);
                neighbor.rebuildingSocket = false;
            });

            if(!neighbor.rebuildingSocket && neighbor.disconnected) { 
                neighbor.rebuildingSocket = true;
                
                // if(!neighbor.softDisconnected && !neighbor.serverSoftDisconnected) { resolve(); return }
                // if(neighbor.softDisconnected && !neighbor.disconnected && !neighbor.serverSoftDisconnected) { resolve(); return }
                
                // console.log('[Node.ts][reconnect] Destroying socket connection to neighbor: ' + username)
                let oldSocket = neighbor.tlsSocket;
                await oldSocket.destroy()

                // console.log('[Node.ts][reconnect] Rebuilding socket connection to neighbor: ' + username)
                oldSocket.rebuild();

                let {tlsClient, deferredPromise} = this._generateNeighborTLSClient(username, oldSocket);

                // console.log('[Node.ts][reconnect] Reconnecting to neighbor: ' + username)

                tlsClient.once('socket-error', (error) => {
                    // console.log('[Node.ts][reconnect] Error connecting to neighbor: ' + username, 'Error: ' + error);
                    resolve();
                });

                tlsClient.connect(neighbor.serverPort, neighbor.ip).then(() => {
                    // console.log('[Node.ts][reconnect] Connected to neighbor: ' + username);
                    resolve();
                }).catch(() => {
                    try{
                        this.eventEmitter.emit('error', {error: 'Error connecting to neighbor', metadata: { fn: 'reconnect_user',username: username}});
                    } catch(e) {
                        // console.log('[Node.ts][reconnect] Error emitting error event', e);
                    }
                    // console.log('[Node.ts][reconnect] Error connecting to neighbor: ' + username, error);
                    resolve();
                });  
            } else {
                resolve(); 
            }
        }
        return deferredPromise;
    }

    /**
     * Checks if the neighbor is disconnected.
     * @param username The username of the neighbor to check.
     * @returns A boolean value indicating if the neighbor is disconnected.
     */
    private _isNeighborDisconnected(username: string) {
        return this.neighbors.get(username)!.disconnected || this.neighbors.get(username)!.softDisconnected;
    }

    /**
     * Destroys the node.
     * @returns A promise that resolves when the node is destroyed.
     */
    public destroy() {
        return new Promise<void>(async (resolve, reject) => {
            // console.log('[Node.ts][destroy] Destroying node');
            await this.tlsServer.destroy();

            for (let [username, neighbor] of this.neighbors.entries()) {
                // console.log('[Node.ts][destroy] Destroying neighbor: ', username);
                await neighbor.tlsSocket.destroy();
            }
        
            this.eventEmitter.removeAllListeners();
            // console.log('[Node.ts][destroy] Node destroyed');
            resolve();
        
        });
    }
}