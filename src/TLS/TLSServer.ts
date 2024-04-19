
import forge from '../Utils/forge';
import {EventEmitter} from 'events';
import net from 'net';


/**
 * Represents a TLS server that handles incoming client connections.
 */
export class TLSServer {
    private server: net.Server;
    private rsaKeys: forge.pki.rsa.KeyPair;
    private cert: forge.pki.Certificate;
    private tlsMap: Map<string, forge.tls.Connection>;
    private handleClientMessage!: (message: string, socket: net.Socket, connection: forge.tls.Connection) => void;
    private eventEmitter: EventEmitter;
    private port?: number;
    private tcpMap: Map<string, net.Socket>;
    private clientMap: {
        [id:string] : {
            alive: boolean,
            heartbeatStr: string, 
            heartbeatDisconnectTimer: any, 
            disconnectPromise: Promise<void>, 
            disconnectPromiseResolve: any,
            heartbeatRetransmitTimer: any,
            closed: boolean,
            destroyedPromise: Promise<void>,
            destroyedPromiseResolve: any
        }
    };
    private keepAlive: boolean;

    /**
     * Creates a new instance of the TLSServer class.
     * @param rsaKeys - The RSA key pair used for encryption.
     * @param port - The port number on which the server will listen.
     * @param sessionName - The name of the TLS session.
     * @param handler - The callback function to handle client messages.
     */
    public constructor(rsaKeys: forge.pki.rsa.KeyPair, port: number, sessionName: string, handler: (message: string, socket: net.Socket, connection: forge.tls.Connection) => void, keepAlive: boolean = false) {
        this.rsaKeys = rsaKeys;
        this.tlsMap = new Map<string, forge.tls.Connection>();
        this.tcpMap = new Map<string, net.Socket>();
        this.clientMap = {};
        this.cert = TLSServer.generateCert(this.rsaKeys, port, sessionName);
        this.eventEmitter = new EventEmitter();
        this.server = this.initServer();
        this.handleClientMessage = handler;
        this.keepAlive = keepAlive;
    }

    /**
     * Generates a TLS certificate using the provided RSA key pair, host port, session name, and validity days.
     * @param rsaKeys - The RSA key pair used to generate the certificate.
     * @param hostPort - The host port number. Can be null.
     * @param sessionName - The name of the session.
     * @param validityDays - The number of days the certificate is valid for. Defaults to 1 day.
     * @returns The generated TLS certificate.
     */
    static generateCert(rsaKeys: forge.pki.rsa.KeyPair, hostPort: number | null, sessionName: string, validityDays: number = 1) {
        // console.log('[TLSServer] generateCert - ', 'Generating Certificate')

        const attrs = [{
            "name": 'commonName',
            "value": `${sessionName}${hostPort ? ':' + hostPort : ''}`
        }];

        const cert = forge.pki.createCertificate();
        cert.publicKey = rsaKeys.publicKey;
        
        cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(19)); // 1 octet = 8 bits = 1 byte = 2 hex chars
        cert.validity.notBefore = new Date();
        cert.validity.notAfter = new Date(new Date().getTime() + 1000 * 60 * 60 * 24 * (validityDays ?? 1));

        cert.setSubject(attrs);
        cert.setIssuer(attrs);

        cert.sign(rsaKeys.privateKey);

        // console.log('[TLSServer] generateCert - ', 'Certificate Generated')

        return cert;
    }

    /**
    * Initializes the TLS server.
    * 
    * This method creates and configures a net.Server instance to handle incoming TLS connections.
    * It sets up event listeners for various socket events such as 'connect', 'data', 'error', 'close', and 'timeout'.
    * 
    * @returns The net.Server instance representing the TLS server.
    */
    private initServer(): net.Server {
        let self = this;

        let server = net.createServer((socket: net.Socket) => {
            
            socket.on('connect', () => {
                // console.log('[TLSServer] initServer - ', 'Client Connected!');
            });

            socket.on('data', (data) => {
                let key = socket.remoteAddress + ':' + socket.remotePort;

                let d = forge.util.decode64(data.toString('utf8'));
                // // console.log('[TLSServer] initServer - ', 'Data Received: ', data.toString('utf8'));
                if(!self.clientMap[key]?.closed) {
                    self.tlsMap.get(key)?.process(d);
                }
            });

            socket.on('close', (error) => {
                let key = socket.remoteAddress + ':' + socket.remotePort;

                // console.log('[TLSServer] initServer - ', 'Client Disconnected');
                self.tcpMap.delete(key);

                if(self.clientMap[key]) {
                    if(!self.clientMap[key]?.closed) {
                        self.clientMap[key].closed = true;
                        self.tlsMap.get(key)?.close();
                    } else {
                        // console.log('[TLSServer] initServer - ', 'Client Destroy Resolved:', key);
                        self.clientMap[key].destroyedPromiseResolve();
                    }
                }
                // console.log('[TLSServer] initServer - ', `TCP Map Size: ${this.tcpMap.size}`)
                socket.removeAllListeners();
            });

            socket.on('error', (error) => {
                // console.log('[TLSServer] initServer - ', 'Error: ', error);
                socket.end();
                socket.emit('close')
                socket.destroy();
            });

            socket.on('timeout', () => {
                // console.log('[TLSServer] initServer - ', 'Socket Timed Out');
            });

            socket.on('drain', function () {
                // console.log('[TLSServer] initServer - drain');
            });

            socket.on('pause', function () {
                // console.log('[TLSServer] initServer - pause');
            });

            socket.on('resume', function () {
                // console.log('[TLSServer] initServer - resume');
            });

        });

        server.on('error', (error) => {
            // console.log('[TLSServer] initServer - ', 'Error: ', error.message);
            self.eventEmitter.emit('error', error.message);
        });

        server.on('close', () => {
            // console.log('[TLSServer] initServer - ', 'Server Closed');
            self.eventEmitter.emit('close');
        });

        server.on('listening', () => {
            // console.log('[TLSServer] initServer - ', 'Server Listening');
            self.eventEmitter.emit('listening');
        });

        server.on('connection', (socket) => {
            // console.log('[TLSServer] initServer - ', `Client Connected: ${socket.remoteAddress}:${socket.remotePort}`);
            let address = socket.remoteAddress;
            let port = socket.remotePort;
            let key = socket.remoteAddress + ':' + socket.remotePort;

            self.clientMap[key] = Object.assign({
                alive: false,
                heartbeatStr: '',
                heartbeatDisconnectTimer: null,
                disconnectPromise: new Promise<void>((resolve, reject) => {}),
                disconnectPromiseResolve: null,
                closed: false,
                destroyedPromise: new Promise<void>((resolve, reject) => {}),
                destroyedPromiseResolve: null,
                heartbeatRetransmitTimer: null
            });
            self.clientMap[key].destroyedPromise = new Promise<void>((res, rej) => {
                [self.clientMap[key].destroyedPromiseResolve, rej] = [res, rej];
            }); // to keep track of destroyed connections when destroying the server
            
            self.clientMap[key].destroyedPromise.then(() => {
                // console.log('[TLSServer] initServer - ', 'Client Destroyed: ', key);
                self.eventEmitter.emit('connection-closed', {address: address, port: port})
            });
            self.tcpMap.set(key, socket);
            self.tlsMap.set(key, self.initTLS(socket));
            
            self.eventEmitter.emit('connection', socket);
        });

        return server;
    }

    /**
     * Initializes the TLS connection for the server.
     * 
     * @param socket - The net.Socket object representing the connection with the client.
     * @returns The TLS connection object.
     * 
     * @remarks
     * This method creates a TLS connection using the Forge library. It sets up the necessary configuration
     * options for the TLS connection, such as cipher suites and certificate handling. It also registers
     * event handlers for various TLS events, such as connection establishment, data transmission, and
     * disconnection.
     * 
     * The TLS connection object returned by this method can be used to interact with the client over the
     * secure TLS channel.
     * 
     * @event connected - Emitted when the TLS connection is successfully established.
     * @event getCertificate - Emitted when the server needs to provide its certificate to the client.
     * @event getPrivateKey - Emitted when the server needs to provide its private key to the client.
     * @event tlsDataReady - Emitted when the TLS connection has data ready to be sent to the client.
     * @event dataReady - Emitted when the client sends data over the TLS connection.
     * @event closed - Emitted when the TLS connection is closed.
     * @event error - Emitted when an error occurs during the TLS connection.
     */
    private initTLS(socket: net.Socket) {
        let self = this;

        let key = socket.remoteAddress + ':' + socket.remotePort
        let clientObj = this.clientMap[key];

        let tls = forge.tls.createConnection({
            server: true,
            sessionCache: {},
            cipherSuites: [
                forge.tls.CipherSuites.TLS_RSA_WITH_AES_128_CBC_SHA,
                forge.tls.CipherSuites.TLS_RSA_WITH_AES_256_CBC_SHA,
            ],
            verifyClient: false,
            connected: function (connection) {
                // console.log('[TLSServer][tls] connected');
                clientObj.closed = false;
                
                if(self.keepAlive) {
                    clientObj.alive = true;
                 
                    clientObj.heartbeatStr = forge.random.getBytesSync(16);
                    connection.prepareHeartbeatRequest(forge.util.createBuffer(clientObj.heartbeatStr));

                    clientObj.disconnectPromise = new Promise<void>((res, rej) => {
                        clearTimeout(clientObj.heartbeatDisconnectTimer);
                        [clientObj.disconnectPromiseResolve, rej] = [res, rej];

                        clientObj.heartbeatDisconnectTimer = setTimeout(() => {
                            // console.log('[TLSServer][tls] disconnectPromise - disconnectPromise resolved');
                            clientObj.disconnectPromiseResolve();
                        }, 1000);
                    });;

                    clientObj.disconnectPromise.then(()=>{
                        // console.log('[TLSServer][tls] connected - disconnectPromise resolved');                        
                        clientObj.alive = false;
                        self.eventEmitter.emit('disconnected', {address: socket.remoteAddress, port: socket.remotePort});

                        clientObj.heartbeatStr = forge.random.getBytesSync(16);
                        connection.prepareHeartbeatRequest(forge.util.createBuffer(clientObj.heartbeatStr));
                    });
                }

            },
            getCertificate: function (connection, hint) {
                return forge.pki.certificateToPem(self.cert);
            },
            getPrivateKey: function (connection, cert) {
                return forge.pki.privateKeyToPem(self.rsaKeys.privateKey);
            },
            tlsDataReady: function (connection) {
                let data = connection.tlsData.getBytes();
                //// console.log('[TLSServer][tls] initTLS - ', 'TLS Data Ready: ', forge.util.encode64(data))
                
                try {
                    socket.write(forge.util.encode64(data));
                } catch (error) {
                    // console.log('[TLSServer][tls] initTLS - ', 'Error writing data: ', error);
                    connection.close();
                }
            
            },
            dataReady: function (connection) {
                let data = connection.data.getBytes();
                // // console.log('[TLSServer][tls] initTLS - ', 'the client sent: ' + forge.util.decodeUtf8(data));
                self.handleClientMessage(data, socket, connection);
            },
            closed: function (connection) {
                // console.log('[TLSServer][tls] initTLS - ', 'closed');
                clearTimeout(clientObj.heartbeatDisconnectTimer);
                clearTimeout(clientObj.heartbeatRetransmitTimer);

                if(!clientObj.closed) {
                    clientObj.closed = true;
                    socket.end();
                    socket.emit('close')
                    socket.destroy();
                } else {
                    // console.log('[TLSServer][tls] initTLS - ', 'Client Destroy Resolved:', key);
                    clientObj.destroyedPromiseResolve();
                }
                self.tlsMap.delete(key);
            },
            error: function (connection, error) {
                // console.log('[TLSServer][tls] initTLS - ', 'error', error.message);
                try {
                    self.eventEmitter.emit('error', error.message);
                } catch (e) {
                    // console.log('[TLSServer][tls] initTLS - ', 'Error emitting error event: ', e);
                }
            },
            heartbeatReceived: function (connection, payload) {
                // // console.log('[TLSServer][tls] initTLS - ', 'Heartbeat received');

                // restart retransmission timer, look at payload
                let payloadStr = payload.getBytes();
                
                if(payloadStr===clientObj.heartbeatStr){
                    // // console.log('[TLSServer][tls] heartbeatReceived - resetting disconnect timer');
                    clearTimeout(clientObj.heartbeatDisconnectTimer);
                    clearTimeout(clientObj.heartbeatRetransmitTimer);

                    let reconnecting = false;
                    if(!clientObj.alive) {
                        clientObj.alive = true;
                        reconnecting = true;
                        self.eventEmitter.emit('reconnected', {address: socket.remoteAddress, port: socket.remotePort});
                    }

                    // // console.log('[TLSServer][tls] heartbeatReceived - retranmitting heartbeat');
                    clientObj.heartbeatRetransmitTimer = setTimeout(() => {
                        clientObj.heartbeatStr = forge.random.getBytesSync(16);
                        connection.prepareHeartbeatRequest(forge.util.createBuffer(clientObj.heartbeatStr));
                        // // console.log('[TLSServer][tls] heartbeat retransmitted');

                        if(reconnecting) {
                            clientObj.disconnectPromise = new Promise<void>((res, rej) => {
                                [clientObj.disconnectPromiseResolve, rej] = [res, rej];
                                clientObj.heartbeatDisconnectTimer = setTimeout(() => {
                                    // console.log('[TLSServer][tls] heartbeatReceived - disconnectPromise resolving');
                                    clientObj.disconnectPromiseResolve();
                                }, 1000);
                            });
    
                            clientObj.disconnectPromise.then(()=>{
                                // console.log('[TLSServer][tls] heartbeatReceived - disconnectPromise resolved');
                                clientObj.alive = false;
                                self.eventEmitter.emit('disconnected', {address: socket.remoteAddress, port: socket.remotePort});
                                
                                clientObj.heartbeatStr = forge.random.getBytesSync(16);
                                connection.prepareHeartbeatRequest(forge.util.createBuffer(clientObj.heartbeatStr));
                            });

                        } else {
                            clientObj.heartbeatDisconnectTimer = setTimeout(() => {
                                // // console.log('[TLSServer][tls] heartbeatReceived - disconnectPromise resolved');
                                clientObj.disconnectPromiseResolve();
                            }, 1000);    
                        }
                    }, 1000);

                }
            }
        });
        return tls;
    }

        /**
     * Starts the TLS server and listens for incoming connections on the specified port.
     * @param port - The port number on which the server should listen.
     */
    public async listen(port: number): Promise<void> {
        this.port = port;
        let promise = new Promise<void>((resolve, reject) => {
            this.server.listen({port: port}, () => {
                // console.log('[TLSServer] listen - ', 'Server Started');
                resolve();
            });
        });
        return promise;
    }

    /**
     * Closes the TLS server. This stops the server from accepting new connections and keeps existing connections.
     */
    public close(cb?:any) {
        return this.server.close(cb);
    }

    /**
     * Registers a listener function to be called when the specified event is emitted.
     * @param event The name of the event to listen for.
     * @param callback The function to be called when the event is emitted.
     */
    public on(event: 'listening' | 'connection' | 'close' | 'error' | 'disconnected' | 'reconnected' | 'connection-closed', callback: (...args: any[]) => void) {
        this.eventEmitter.on(event, callback);
    }
    
    /*
     * Registers a listener function to be called once when the specified event is emitted.
     * @param event The name of the event to listen for.
     * @param callback The function to be called when the event is emitted.
     */
    public once(event: 'listening' | 'connection' | 'close' | 'error' | 'disconnected' | 'reconnected' | 'connection-closed', callback: (...args: any[]) => void) {
        this.eventEmitter.once(event, callback);
    }

    public async destroy(): Promise<void> {


        let resolve: any;
        let deferredPromise = new Promise<void>((res, rej) => {
            resolve = res;
        });  
        
        for(let key in this.clientMap) {
            clearTimeout(this.clientMap[key].heartbeatRetransmitTimer);
            clearTimeout(this.clientMap[key].heartbeatDisconnectTimer);
        }

        setTimeout(() => {

            this.server.close(() => {
                this.server.removeAllListeners();
                this.server = new net.Server();
                this.eventEmitter.removeAllListeners();

                Promise.all(Object.values(this.clientMap).map((client) => client.destroyedPromise)).then(() => {
                    resolve();
                });
            });

            this.tlsMap.forEach((tls) => {
                tls.close();
            });

            this.tcpMap.forEach((socket) => {
                socket.destroy();
            });

        }, 0);
        return deferredPromise;
    } 

    public async rebuild() {
        this.tcpMap.clear();
        this.tlsMap.clear();
        this.clientMap = {};

        this.eventEmitter = new EventEmitter();
        this.server = this.initServer();
        if(this.port) {
            if(!this.server.listening) {
                await this.listen(this.port);
            }
        }
    }

    public disconnectClient(address: string, port: number) {

        let key = address + ':' + port;
        let client = this.clientMap[key]!;
        if(!client) return;
        // console.log('[TLSServer] disconnectClient - ', 'Disconnecting Client: ', key);

        clearTimeout(client.heartbeatRetransmitTimer);
        clearTimeout(client.heartbeatDisconnectTimer);
        this.tlsMap.get(key)?.close();

        let promise = client.destroyedPromise
        delete this.clientMap[key];
        return promise;
    }

}