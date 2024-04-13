import net from 'net';
import forge from '../Utils/forge';
import {EventEmitter} from 'events';

/**
 * Represents a TLS client that connects to a server using TCP and establishes a TLS connection.
 */
export class TLSClient {
    private socket: net.Socket;
    private rsaKeys: forge.pki.rsa.KeyPair;
    private tls: forge.tls.Connection;
    private eventEmitter: EventEmitter;
    private sessionName: string;
    
    private keepAlive: boolean;
    private alive: boolean;

    private heartbeatStr: string = '';
    private heartbeatDisconnectTimer: any;
    private disconnectPromise!: Promise<void>;
    private disconnectPromiseResolve!: any;
    private heartbeatRetransmitTimer: any;

    private closed: boolean;
    private destroyedPromise: Promise<void>;

    /**
     * Creates a new TLSClient instance.
     * @param sessionName - The name of the TLS session.
     * @param rsaKeys - The RSA key pair used for encryption.
     */
    constructor(sessionName: string, rsaKeys: forge.pki.rsa.KeyPair, keepAlive: boolean = false) {
        this.socket = this.initTCP();
        this.rsaKeys = rsaKeys;
        this.tls = this.initTLS(sessionName);
        this.eventEmitter = new EventEmitter();
        this.sessionName = sessionName;
        this.keepAlive = keepAlive;
        this.alive = false;
        this.closed = true;
        this.destroyedPromise = new Promise<void>((res, rej) => {
            this.eventEmitter.on('destroyed', () => {
                res();
            });
        });
    }

    /**
     * Initializes a TCP client socket and sets up event listeners for various socket events.
     * 
     * @returns The TCP client socket.
     * @remarks
     * This method creates a new TCP client socket using the `net.Socket` class from the Node.js `net` module.
     * It sets up event listeners for the 'connect', 'data', 'close', and 'error' events emitted by the socket.
     * 
     * The 'connect' event is emitted when the socket successfully connects to the server.
     * The 'data' event is emitted when data is received from the server. The received data is processed using the `tls.process` method.
     * The 'close' event is emitted when the socket connection is closed.
     * The 'error' event is emitted when an error occurs with the socket connection.
     * 
     * Developers can listen to the 'closed' event emitted by the `eventEmitter` to be notified when the socket connection is closed.
     * Developers can listen to the 'error' event emitted by the `eventEmitter` to handle socket errors.
     * 
     * @example
     * ```typescript
     * const client = initTCP();
     * client.connect(8080, 'localhost');
     * ```
     */
    initTCP(socket: net.Socket = new net.Socket()) {
        let self = this;
        const client = socket;

        client.on('connect', function () {
            // console.log('[TLSClient] connect - TLS handshake started');
            self.tls.handshake();
            self.eventEmitter.emit('socket-connected');
        });

        client.on('data', function (data) {
            let d = forge.util.decode64(data.toString('utf8'));
            // // console.log('[TLSClient][Socket] received data from server: ' + data);
            self.tls.process(d);
        });

        client.on('close', function () {
            // console.log('[TLSClient][Socket] connection closed');
            if(!self.closed) {
                self.closed = true;
                self.tls.close();
            } else {
                // console.log('[TLSClient][Socket] close - emitting destroyed event');
                self.eventEmitter.emit('destroyed')
            }
            client.removeAllListeners();
            self.eventEmitter.emit('socket-closed');
        });

        client.on('error', function (error) {
            // console.log('[TLSClient][Socket] error', error);
            client.end();
            client.emit('close')
            client.destroy();            
            self.eventEmitter.emit('socket-error', error);
        });

        client.on('drain', function () {
            // console.log('[TLSClient][Socket] drain');
        });

        client.on('pause', function () {
            // console.log('[TLSClient][Socket] pause');
        });

        client.on('resume', function () {
            // console.log('[TLSClient][Socket] resume');
        });

        client.on('timeout', function () {
            // console.log('[TLSClient][Socket] timeout');
        });

        return client;
    }

    /**
     * Initializes a TLS (Transport Layer Security) connection to a server.
     * This method creates a TLS connection with the provided session name and returns the connection object.
     *
     * @param sessionName - The name of the session to connect to.
     * @returns The forge.tls.Connection object representing the TLS connection.
     * @remarks
     * The TLS connection is established using the provided session name. It verifies the server's certificate
     * and emits events based on the connection status.
     *
     * The TLS connection supports the following events:
     * - 'verify': The server's certificate is verified.
     * - 'connected': The TLS connection is established.
     * - 'tlsDataReady': The TLS connection is ready to send data to the server.
     * - 'dataReady': The TLS connection received data from the server.
     * - 'closed': The TLS connection is closed.
     * - 'error': An error occurred during the TLS handshake or communication with the server.
     *
     * Note: The TLS connection uses the 'TLS_RSA_WITH_AES_256_CBC_SHA' and 'TLS_RSA_WITH_AES_128_CBC_SHA'
     * cipher suites for secure communication.
     */
    initTLS(sessionName:string): forge.tls.Connection {
        let self = this;

        self.closed = true;
        
        let tls = forge.tls.createConnection({
            server: false,
            sessionCache: {},
            cipherSuites: [
              forge.tls.CipherSuites.TLS_RSA_WITH_AES_256_CBC_SHA,
              forge.tls.CipherSuites.TLS_RSA_WITH_AES_128_CBC_SHA,
            ],
            verify: function(connection, verified, depth, certs) {
                if(depth === 0) {
                    let cn = certs[0].subject.getField('CN').value;
                    // console.log('[TLSClient][tls] server certificate CN:', cn);
                    let sName = cn.split(':')[0];
                    let sPort = cn.split(':')[1];

                    if(sName !== sessionName || sPort !== self.socket.remotePort?.toString()) {
                        // console.log('[TLSClient][tls] server certificate not valid for this session');
                        return verified = {
                            alert: forge.tls.Alert.Description.bad_certificate,
                            message: 'Certificate common name does not match expected client.'
                        };
                    } 
                }
                // console.log('[TLSClient][tls] server certificate verified');
                return true;
            },
            connected: function (connection) {
                // console.log('[TLSClient][tls] connected');
                self.closed = false;
                /* NOTE: experimental, start heartbeat retransmission timer */
                if(self.keepAlive) {
                    self.alive = true;

                    self.heartbeatStr = forge.random.getBytesSync(16);
                    connection.prepareHeartbeatRequest(forge.util.createBuffer(self.heartbeatStr));

                    self.disconnectPromise = new Promise<void>((res, rej) => {
                        clearTimeout(self.heartbeatDisconnectTimer);
                        [self.disconnectPromiseResolve, rej] = [res, rej];

                        self.heartbeatDisconnectTimer = setTimeout(() => {
                            // console.log('[TLSClient][tls] disconnectPromise - disconnectPromise resolved');
                            self.disconnectPromiseResolve();
                        }, 1000);
                    });;

                    self.disconnectPromise.then(()=>{
                        // console.log('[TLSClient][tls] connected - disconnectPromise resolved');
                        self.alive = false;
                        self.eventEmitter.emit('disconnected');

                        self.heartbeatStr = forge.random.getBytesSync(16);
                        connection.prepareHeartbeatRequest(forge.util.createBuffer(self.heartbeatStr));
                    });
                }

                self.eventEmitter.emit('tls-connected');
            },
            getPrivateKey: function (connection, cert) {
                // console.log('[TLSClient][tls] getting private key');
                return forge.pki.privateKeyToPem(self.rsaKeys.privateKey);
            },
            tlsDataReady: function (connection) {
                let data = connection.tlsData.getBytes();
                // // console.log('[TLSClient][tls] data ready to be sent to the server: ' + forge.util.encode64(data));

                try {
                    self.socket.write(forge.util.encode64(data));
                }
                catch(e) {
                    // console.log('[TLSClient][tls] tlsDataReady - error writing to socket: ', e);
                    if(self.socket.destroyed) {
                        // console.log('[TLSClient][tls] tlsDataReady - socket is destroyed, closing tls connection');
                        connection.close();
                    }
                }
            },
            dataReady: function (connection) {
                let data = connection.data.getBytes();
                // // console.log('[TLSClient][tls] data received from the server: ' + forge.util.decodeUtf8(data));
                self.eventEmitter.emit('data', forge.util.decodeUtf8(data));
            },
            closed: function () {
                // console.log('[TLSClient][tls] disconnected');
                clearTimeout(self.heartbeatDisconnectTimer);
                clearTimeout(self.heartbeatRetransmitTimer); 

                if(!self.closed) {
                    self.closed = true;
                    self.socket.end();
                    self.socket.emit('close')
                    self.socket.destroy();
                } else {
                    // console.log('[TLSClient][tls] closed - emitting destroyed event');
                    self.eventEmitter.emit('destroyed');
                }
                self.eventEmitter.emit('tls-closed');
            },
            error: function (connection, error) {
                // console.log('[TLSClient][tls] error: ', error.message);
                try {
                    self.eventEmitter.emit('tls-error', error.message);
                } catch (e) {
                    // console.log('[TLSServer][tls] initTLS - ', 'Error emitting error event: ', e);
                }            
            },
            /* NOTE: experimental */
            heartbeatReceived: function (connection, payload) {
                // // console.log('[TLSClient][tls] heartbeat received');

                // restart retransmission timer, look at payload
                let payloadStr = payload.getBytes();
                // // console.log('[TLSClient][tls] heartbeat payload: ' + payloadStr);
                
                if(payloadStr===self.heartbeatStr){
                    // // console.log('[TLSClient][tls] heartbeatReceived - resetting disconnect timer');
                    clearTimeout(self.heartbeatDisconnectTimer);
                    clearTimeout(self.heartbeatRetransmitTimer);

                    // if is not alive, set alive to true and emit reconnected event. rebuild disconnectPromise logic

                    let reconnecting = false;
                    if(!self.alive) {
                        self.alive = true;
                        reconnecting = true;
                        self.eventEmitter.emit('reconnected');
                    }

                    // // console.log('[TLSClient][tls] heartbeatReceived - retranmitting heartbeat');
                    self.heartbeatRetransmitTimer = setTimeout(() => {
                        self.heartbeatStr = forge.random.getBytesSync(16);
                        connection.prepareHeartbeatRequest(forge.util.createBuffer(self.heartbeatStr));
                        // // console.log('[TLSClient][tls] heartbeat retransmitted');
                        
                        if(reconnecting) {
                            self.disconnectPromise = new Promise<void>((res, rej) => {
                                [self.disconnectPromiseResolve, rej] = [res, rej];
                                self.heartbeatDisconnectTimer = setTimeout(() => {
                                    // console.log('[TLSClient][tls] disconnectPromise (reconnecting) - disconnectPromise resolving');
                                    self.disconnectPromiseResolve();
                                }, 1000);
                            });
        
                            self.disconnectPromise.then(()=>{
                                // console.log('[TLSClient][tls] heartbeatReceived - disconnectPromise resolved');
                                self.alive = false;
                                self.eventEmitter.emit('disconnected');

                                self.heartbeatStr = forge.random.getBytesSync(16);
                                connection.prepareHeartbeatRequest(forge.util.createBuffer(self.heartbeatStr));
                            });

                        } else {
                            self.heartbeatDisconnectTimer = setTimeout(() => {
                                // console.log('[TLSClient][tls] heartbeatReceived (not reconnecting) - disconnectPromise resolving');
                                self.disconnectPromiseResolve();
                            }, 1000);    
                        }
                    }, 1000);


                }
            },
        });

        return tls;
    }

    /**
     * Establishes a TLS connection to the specified host and port.
     * 
     * @param port - The port number to connect to.
     * @param host - The host to connect to.
     * @returns A Promise that resolves when the connection is established successfully.
     * 
     * @remarks
     * This method connects to the server using the specified host and port. It initiates a TLS handshake
     * to establish a secure connection. Once the connection is established, the 'connect' event is emitted.
     * 
     * @example
     * ```typescript
     * const tlsClient = new TLSClient();
     * await tlsClient.connect(443, 'example.com');
     * // console.log('Connected to server successfully!');
     * ```
     */
    public async connect(port: number, host: string) {
        let deferredPromise = new Promise<void>((res, rej) => {
            this.eventEmitter.on('tls-connected', () => {
                res();
            });
            this.eventEmitter.on('tls-closed', () => {
                rej();
            });
        });
        this.socket.connect({port: port, host: host}, () => {
            // console.log('[TLSClient] connect - socket connected to server');
        });
        return deferredPromise;
    }

    /**
     * Sends data to the server.
     * @param data The data to be sent.
     */
    public async send(data: string) {
        // console.log('[TLSClient] sending data to server: ' + data)
        this.tls.prepare(data);
    }

    /**
     * Registers an event listener for the specified event.
     * 
     * @param event - The event to listen for. Can be one of 'closed', 'connected', 'error', or 'data'.
     * @param cb - The callback function to be executed when the event is triggered.
     * @remarks
     * This method caters to the following events:
     * - 'socket-closed': The TCP socket is closed.
     * - 'tls-closed': The TLS connection is closed.
     * - 'socket-connected': The TCP socket is connected.
     * - 'tls-connected': The TLS connection is established.
     * - 'socket-error': An error occurs with the TCP socket.
     * - 'tls-error': An error occurs with the TLS connection.
     * - 'data': Data is received from the server. This is emitted when the TLS connection receives data from the server.
     * - 'disconnected': The connection is disconnected. This will be emitted when keepAlive is set to true and the heartbeat disconnect timer is triggered.
     * - 'reconnected': The connection is reconnected. This will be emitted when keepAlive is set to true and the heartbeat is received after a disconnect event.
     */
    public on(event: 'socket-closed' | 'tls-closed' | 'socket-connected' | 'tls-connected' | 'socket-error' | 'tls-error' | 'data' | 'disconnected' | 'reconnected', cb: (...args: any[]) => void) {
        this.eventEmitter.on(event, cb);
    }

    /**
     * Registers an event listener for the specified event that will only be called once.
     * 
     * @param event - The event to listen for. Can be one of 'closed', 'connected', 'error', or 'data'.
     * @param cb - The callback function to be executed when the event is triggered.
     * @remarks
     * This method is similar to the `on` method, but the event listener will only be called once.
     * After the event is triggered, the event listener is removed.
     * This method caters to the following events:
     * - 'socket-closed': The TCP socket is closed.
     * - 'tls-closed': The TLS connection is closed.
     * - 'socket-connected': The TCP socket is connected.
     * - 'tls-connected': The TLS connection is established.
     * - 'socket-error': An error occurs with the TCP socket.
     * - 'tls-error': An error occurs with the TLS connection.
     * - 'data': Data is received from the server. This is emitted when the TLS connection receives data from the server.
     * - 'disconnected': The connection is disconnected. This will be emitted when keepAlive is set to true and the heartbeat disconnect timer is triggered.
     * - 'reconnected': The connection is reconnected. This will be emitted when keepAlive is set to true and the heartbeat is received after a disconnect event.
     */
    public once(event: 'socket-closed' | 'tls-closed' | 'socket-connected' | 'tls-connected' | 'socket-error' | 'tls-error' | 'data' | 'disconnected' | 'reconnected', cb: (...args: any[]) => void) {
        this.eventEmitter.once(event, cb);
    }

    /**
     * Closes the TLS connection and the TCP socket.
     * @remarks
     * This method closes the TLS connection and the TCP socket. It emits the 'closed' event when the connection is closed.
     * Developers can listen to the 'closed' event to be notified when the connection is closed.
     */
    public async destroy(): Promise<void> {
        let resolve: any;
        let deferredPromise = new Promise<void>((res, rej) => {
            resolve = res;
        });
        clearTimeout(this.heartbeatRetransmitTimer);
        clearTimeout(this.heartbeatDisconnectTimer);

        setTimeout(() => {
            this.tls.close(); // eventually closes the socket

            this.destroyedPromise.then(() => {
                this.socket.removeAllListeners();
                this.socket = new net.Socket();
    
                this.eventEmitter.removeAllListeners();
                resolve();
            });


        }, 0);
        return deferredPromise;
    }
    
    public rebuild() {
        this.eventEmitter = new EventEmitter();
        this.socket = this.initTCP();
        this.tls = this.initTLS(this.sessionName);
        this.alive = false;
        this.closed = true;
        this.destroyedPromise = new Promise<void>((res, rej) => {
            this.eventEmitter.on('destroyed', () => {
                res();
            });
        });        
    }
}