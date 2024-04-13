import forge             from '../Utils/forge';
import net from 'net';
import {SRPServer} from '../SRP';
import { getTCPOpenPort } from '../Utils/protocolHelpers';
import { 
    SRPClientHandshake_1, 
    SRPClientHandshake_2, 
    SRPServerHandshake_1, SRPServerHandshake_2, 
    SRPHandshakeEncryptedPayload, 
} from './messages';import { TLSServer } from '../TLS/TLSServer';
import { CryptoUtils } from '../Utils/cryptoUtils';
import { EventEmitter } from 'events';


/**
 * The `CoordinatorServer` class represents a server that coordinates communication between clients in a session.
 * It handles client authentication, registration, and message handling.
 */
export class CoordinatorServer {
    
   /**
     * The name of the session.
     */
   private sessionName: string;

   /**
    * The TCP port number on which the server listens for incoming connections.
    */
   private port: number;

   /**
    * The passcode used for session authentication.
    */
   private sessionPasscode: string;

   /**
    * The SRP (Secure Remote Password) server instance for user authentication.
    */
   private srpServer: SRPServer;

   /**
    * A dictionary that stores information about connected clients.
    * Key: username, Value: {retryCount: number, ip: string}
    */
   private clients: { [username: string]: { retryCount: number, ip: string, registered: boolean } } = {};

   /**
    * The port number of the node server.
    */
   private nodePort: number;

   /**
    * An array of authenticated client payloads.
    */
   private authenticatedClients: SRPHandshakeEncryptedPayload[] = [];

   /**
    * The TLS (Transport Layer Security) server instance for secure communication.
    */
   private tlsServer: TLSServer;

   /**
    * The RSA key pair used for encryption and decryption.
    */
   private rsaKeys: forge.pki.rsa.KeyPair;

   /**
    * An event emitter for handling server events.
    */
   private eventEmitter: EventEmitter;

   /**
    * The length of the RSA key in bits.
    */
   static readonly rsaKeyLength = 2048;

   /**
    * The maximum number of SRP (Secure Remote Password) authentication retries allowed.
    */
   static readonly maxSRPRetrys = 3;


    get tcpPort(): number {
        return this.port;
    }

     /**
     * Creates a new instance of the `CoordinatorServer` class.
     * @param sessionName The name of the session.
     * @param nodePort The port number of the node server.
     * @returns A promise that resolves with a new `CoordinatorServer` instance.
     * @throws If a port for authentication cannot be secured.
     */
    public static async create(sessionName: string, nodePort: number) : Promise<CoordinatorServer> {
        // console.log('[CoordinatorServer] create - ', 'Creating CoordinatorServer');

        let port: number;
        try {
            port = await getTCPOpenPort();
        } catch (error) {
            // console.log('[CoordinatorServer] create - ', 'Error: Could not secure a port for authentication.');
            return Promise.reject('Could not secure a port for authentication.');
        }

        // console.log('[CoordinatorServer] create - ', 'Port: ', port);

        // console.log('[CoordinatorServer] create - ', 'Generating Keys');
        let rsaKeys = forge.pki.rsa.generateKeyPair(CoordinatorServer.rsaKeyLength);
        // console.log('[CoordinatorServer] create - ', 'Keys Generated');


        return new CoordinatorServer(sessionName, port, rsaKeys, nodePort);
    }

    /**
    * Constructs a new instance of the `CoordinatorServer` class.
    * @param sessionName The name of the session.
    * @param port The TCP port number on which the server listens for incoming connections.
    * @param rsaKeys The RSA key pair used for encryption and decryption.
    * @param nodePort The port number of the node server.
    */
    private constructor(sessionName: string, port: number, rsaKeys: forge.pki.rsa.KeyPair, nodePort: number) {
        // console.log('[CoordinatorServer] constructor - ', 'Constructing CoordinatorServer')

        this.sessionName = sessionName;
        this.port = port;
        this.sessionPasscode = parseInt(forge.util.bytesToHex(forge.random.getBytesSync(3)), 16).toString().slice(0,6).padStart(6, '0')
        this.srpServer = new SRPServer(this.sessionPasscode);
        // console.log('[CoordinatorServer] constructor - ', 'Session Passcode: ', this.sessionPasscode)
        this.nodePort = nodePort;

        this.rsaKeys = rsaKeys;

        this.tlsServer = new TLSServer(this.rsaKeys, this.port, this.sessionName, this.handleClientMessage.bind(this), true);

        this.tlsServer.on('connection-closed', ({address, port}) => {
            // console.log('[CoordinatorServer] disconnected - ', 'Client disconnected');
            // console.log('[CoordinatorServer] disconnected - ', 'Address: ', address, 'Port: ', port);
            let client = this.authenticatedClients.find((client) => client.ip === address);
            // console.log('[CoordinatorServer] disconnected - ', 'authenticatedClients: ', JSON.stringify(this.authenticatedClients));
            if(client) {
                // console.log('[CoordinatorServer] disconnected - ', 'Client: ', client.userName);
                this.authenticatedClients = this.authenticatedClients.filter((c) => c.ip !== address);
                this.eventEmitter.emit('disconnected', client.userName);
            }
        });

        this.tlsServer.on('disconnected', ({address, port}) => {
            // console.log('[CoordinatorServer] disconnected - ', 'Client disconnected');
            // console.log('[CoordinatorServer] disconnected - ', 'Address: ', address, 'Port: ', port);
            let client = this.authenticatedClients.find((client) => client.ip === address);
            // console.log('[CoordinatorServer] disconnected - ', 'authenticatedClients: ', JSON.stringify(this.authenticatedClients));
            if(client) {
                // console.log('[CoordinatorServer] disconnected - ', 'Client: ', client.userName);
                this.eventEmitter.emit('disconnected', client.userName);
            }
        });

        this.tlsServer.on('reconnected', ({address, port}) => {
            // console.log('[CoordinatorServer] reconnected - ', 'Client reconnected');
            // console.log('[CoordinatorServer] reconnected - ', 'Address: ', address, 'Port: ', port);
            let client = this.authenticatedClients.find((client) => client.ip === address);
            // console.log('[CoordinatorServer] reconnected - ', 'authenticatedClients: ', JSON.stringify(this.authenticatedClients));
            if(client) {
                // console.log('[CoordinatorServer] reconnected - ', 'Client: ', client.userName);
                this.eventEmitter.emit('reconnected', client.userName);
            }
        });
            


        this.eventEmitter = new EventEmitter();
    }


    /**
     * Handles the incoming client message.
     * 
     * @param data - The message data received from the client.
     * @param socket - The network socket associated with the client.
     * @param connection - The TLS connection object.
     * 
     * @remarks
     * This method parses the incoming message data, performs various checks and operations based on the message type,
     * and prepares the appropriate response to be sent back to the client.
     * 
     * If the message is of type 'srp-handshake_1', it checks if the user is already registered. If not, it registers
     * the user and generates a server ephemeral key. It then sends a success response back to the client with the
     * server ephemeral key. If the user is already registered, it sends an error response back to the client.
     * 
     * If the message is of type 'srp-handshake_2', it checks if the user is registered and if the username matches
     * the initial IP address. If not, it sends an error response back to the client. If the user is registered and
     * the username matches the initial IP address, it increments the retry count for the user. If the retry count
     * exceeds the maximum allowed attempts, it sends an error response back to the client. Otherwise, it derives
     * the server proof and verifies the client's session proof. It then prepares the appropriate response to be sent
     * back to the client.The method also handles various error scenarios, such as user not registered, username 
     * and IP address mismatch, and too many authentication attempts.
     * 
     * @throws - This method does not throw any specific errors.
     * 
     * @emits - This method emits the 'connected' event when the client is successfully authenticated.
     * 
     * @returns - This method does not return any value.
     */
    private handleClientMessage(data: string, socket: net.Socket, connection: forge.tls.Connection) {
        let self = this;
        let dataJSON : any = null;
        try {
            dataJSON = JSON.parse(forge.util.decodeUtf8(data));
        } catch (error) {
            
        }
        if (dataJSON) {
            if (dataJSON.type === 'srp-handshake_1') {
                let {username, salt, clientEphemeralPublic} = dataJSON.payload;

                dataJSON = dataJSON as SRPClientHandshake_1;
            
                // no event is emitted on username collision. A TLS message is sent to the client on the collision.
                if(self.clients[username] && socket.remoteAddress !== self.clients[username].ip) {
                    // console.log('[CoordinatorServer][tls] initTLS - ', 'User already registered');
                    let server_handshake_1: SRPServerHandshake_1 = {
                        type: 'srp-handshake_1',
                        payload: null,
                        status: 'error',
                        error: `Username '${dataJSON.payload.username}' already registered in session. Try joining again with a new name.`
                    }
                    connection.prepare(forge.util.encodeUtf8(JSON.stringify(server_handshake_1)));
                    return;
                } else {
                    if(!self.clients[username]) {
                        self.clients[username] = {retryCount: 0, ip: socket.remoteAddress as string, registered: false};
                    } else {
                        self.clients[username].retryCount++;
                    }
                    this.eventEmitter.emit('connection-attempt', username);
                }

                let serverEphermalKey = self.srpServer.registerAndLogin(username, salt, clientEphemeralPublic);
                if(serverEphermalKey) {
                    // console.log('[CoordinatorServer][tls] initTLS - ', 'Registered User')
                    let server_handshake_1: SRPServerHandshake_1 = {
                        type: 'srp-handshake_1',
                        payload: {serverEphermalKey: serverEphermalKey},
                        status: 'success',
                        error: null
                    }
                    connection.prepare(forge.util.encodeUtf8(JSON.stringify(server_handshake_1)));
                } 
            } else if(dataJSON.type === 'srp-handshake_2') {
                if(!self.srpServer.getSRPUser(dataJSON.payload.username)) {
                    // console.log('[CoordinatorServer][tls] initTLS - ', 'User not registered');
                    let server_handshake_2: SRPServerHandshake_2 = {
                        type: 'srp-handshake_2',
                        payload: null,
                        status: 'error',
                        error: 'Something went wrong. Please try joining again.'
                    }
                    connection.prepare(forge.util.encodeUtf8(JSON.stringify(server_handshake_2)));
                    self.eventEmitter.emit('connection-attempt-fail', {username: dataJSON.payload.username, error: `Something went wrong. ${dataJSON.payload.username} should try joining again.`});
                    return;
                }
                let {sessionProof, username, nodePort} = dataJSON.payload;

                dataJSON = dataJSON as SRPClientHandshake_2;
                // console.log('[CoordinatorServer][tls] initTLS - ', 'clients: ', JSON.stringify(self.clients));

                let userIP = self.clients[username]!.ip;
                if(userIP!==socket.remoteAddress) {
                    // console.log('[CoordinatorServer][tls] initTLS - ', 'Username does not match IP Address');
                    let server_handshake_2: SRPServerHandshake_2 = {
                        type: 'srp-handshake_2',
                        payload: null,
                        status: 'error',
                        error: 'Username does not match initial IP Address. Please restart and try again.'
                    }
                    connection.prepare(forge.util.encodeUtf8(JSON.stringify(server_handshake_2)));
                    self.eventEmitter.emit('connection-attempt-fail', {username: dataJSON.payload.username, error: `Username does not match original IP Address. ${dataJSON.payload.username} should restart and try joining again.`});
                    return;
                }

                let retryCountForIP = Object.values(self.clients).filter((client) => client.ip === socket.remoteAddress).reduce((acc, client) => acc + client.retryCount, 0);
                if(!self.clients[username]) {
                    // console.log('[CoordinatorServer][tls] initTLS - ', 'User not registered');
                    let server_handshake_2: SRPServerHandshake_2 = {
                        type: 'srp-handshake_2',
                        payload: null,
                        status: 'error',
                        error: 'Out of order message received. Please try joining again.'
                    }
                    connection.prepare(forge.util.encodeUtf8(JSON.stringify(server_handshake_2)));
                    self.eventEmitter.emit('connection-attempt-fail', {username: dataJSON.payload.username, error: `Something went wrong. ${dataJSON.payload.username} should try joining again.`});
                    return;
                } else if(retryCountForIP >= CoordinatorServer.maxSRPRetrys) {
                    // console.log('[CoordinatorServer][tls] initTLS - ', 'Too many attempts');
                    let server_handshake_2: SRPServerHandshake_2 = {
                        type: 'srp-handshake_2',
                        payload: null,
                        status: 'error',
                        error: 'Too many failed authentication attempts for this IP! Please restart and try again.'
                    }
                    connection.prepare(forge.util.encodeUtf8(JSON.stringify(server_handshake_2)));
                    self.eventEmitter.emit('connection-attempt-fail', {username: dataJSON.payload.username, error: `Too many failed authentication attempts. The host should restart the session to try joining again.`});
                    return;
                }
                let serverProof = self.srpServer.deriveKeyAndVerifyClient(username, sessionProof);
                if(serverProof) {
                    // console.log('[CoordinatorServer][tls] initTLS - ', 'Verified Client')
                    self.authenticatedClients.push({userName: username, ip: socket.remoteAddress as string, port: nodePort});

                    let srpEncryptedPayload: SRPHandshakeEncryptedPayload = {
                        userName: self.sessionName,
                        ip: socket.localAddress as string,
                        port: self.nodePort
                    }
                    let d = JSON.stringify(srpEncryptedPayload);
                    let iv = forge.random.getBytesSync(16);
                    let key = self.srpServer.getSessionKey(username) as string;
                    let encryptedResult = CryptoUtils.aesEncrypt(key, iv, d);
                    // console.log('[CoordinatorServer][tls] initTLS - ', 'SRP Session Key: ', forge.util.createBuffer(key))
                    // console.log('[CoordinatorServer][tls] initTLS - ', 'Encryption Result: ', encryptedResult)
                    let server_handshake_2: SRPServerHandshake_2 = {
                        type: 'srp-handshake_2',
                        payload: encryptedResult.status === 'error' ? null :{
                            iv: forge.util.encode64(iv),
                            encrypted: forge.util.encode64(encryptedResult.message!),
                            serverProof: serverProof
                        },
                        status: encryptedResult.status === 'error'? 'error' : 'success',
                        error: encryptedResult.status === 'error'? encryptedResult.error : null
                    }
                    let response = JSON.stringify(server_handshake_2);
                    self.clients[username].registered = true;
                    this.eventEmitter.emit('connected', {userName: username, ip: socket.remoteAddress as string, port: nodePort, serverSessionKey: key});

                    connection.prepare(forge.util.encodeUtf8(response));
                } else {
                    // console.log('[CoordinatorServer][tls] initTLS - ', 'Could not verify client');

                    connection.prepare(forge.util.encodeUtf8(JSON.stringify({error: 'Unable to verify client. Please try joining again.', status: 'error'})));
                    self.eventEmitter.emit('connection-attempt-fail', {username: dataJSON.payload.username, error: `Could not authenticate. ${dataJSON.payload.username} should try joining again.`});
                    return;
                }
            }
        }
    }

    /**
     * Starts the Coordinator server and begins listening for incoming connections.
     * 
     * @returns void
     */
    public start(cb?:any): void {
        this.tlsServer.listen(this.port).then(() => {
            // console.log('[CoordinatorServer] start - ', 'Coordinator Server started listening on port: ', this.port);
            if(cb) {
                cb();
            }
        });
    }

    /**
     * Stops the Coordinator server, closing the TLS server.
     * 
     * @returns void
     */
    public stop(): void {
        this.tlsServer.destroy();
    }

    /**
     * Exports the users and their associated information.
     * This method returns an array of objects containing the user details, including the server session key.
     * The server session key is obtained from the users and added to the authenticated clients.
     * If a user does not have a server session key, it will be set to null in the returned object.
     *
     * @returns An array of objects representing the exported users.
     * Each object contains the following properties:
     * - userName: The username of the client.
     * - port: The port of the client.
     * - ip: The IP address of the client.
     * - serverSessionKey: The server session key of the user. If not available, it will be null.
     *
     * @remarks
     * This method relies on the `srpServer` and `authenticatedClients` properties being properly initialized.
     * It maps the authenticated clients and finds the corresponding user from the exported users based on the username.
     * If a user is found, their details are included in the returned object.
     * If a user is not found, their details are included in the returned object with a null server session key.
     */
    public exportUsers() {
        let users = this.srpServer.exportUsers();
        //get serverSessionKey from users and add it to this.authenticatedClients
        return this.authenticatedClients.map((client) => {
            let user = users.find((user) => user.username === client.userName);
            if(user) {
                return {
                    userName: client.userName,
                    port: client.port,
                    ip: client.ip,
                    serverSessionKey: user.serverSessionKey
                }
            } else {
                return {
                    userName: client.userName,
                    ip: client.ip,
                    port: client.port,
                    serverSessionKey: null
                }
            }
        });

    }

    /**
     * Gets the passcode for the session.
     * @returns The passcode for the session.
     */
    get passcode(): string{
        return this.sessionPasscode;
    }

    /**
     * Registers a callback function to be called when the specified event is triggered.
     * 
     * @param event - The name of the event to listen for.
     * @param callback - The callback function to be called when the event is triggered.
     */
    public on(event: 'connection-attempt' | 'connection-attempt-fail' | 'connected' | 'disconnected' | 'reconnected', callback: (...args: any[]) => void) {
        this.eventEmitter.addListener(event, callback);
    }
}

export default CoordinatorServer;