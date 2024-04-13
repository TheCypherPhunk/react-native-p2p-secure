import forge from '../Utils/forge';
import { SRPClient } from '../SRP';
import {
    SRPClientHandshake_1,
    SRPClientHandshake_2,
    SRPServerHandshake_1,
    SRPServerHandshake_2,
    SRPHandshakeEncryptedPayload,
    SRPHandshakeResult
} from './messages';
import { TLSClient } from '../TLS/TLSClient';
import { CryptoUtils } from '../Utils/cryptoUtils';
import { EventEmitter } from 'events';

/**
 * Represents a client for coordinating with a server.
 */
export class CoordinatorClient {
    private identifier: string;
    private rsaKeys: forge.pki.rsa.KeyPair;
    private eventEmitter: EventEmitter;

    static readonly rsaKeyLength = 2048;
    /**
     * Creates a new instance of the CoordinatorClient class.
     * @param identifier - The identifier for the client.
     * @param rsaKeys - The RSA key pair for encryption.
     */
    private constructor(identifier: string, rsaKeys: forge.pki.rsa.KeyPair) {
        this.identifier = identifier;
        this.rsaKeys = rsaKeys;
        this.eventEmitter = new EventEmitter();
    }

    /**
     * Creates a new instance of the CoordinatorClient class.
     * @param identifier - The identifier for the client.
     * @returns A promise that resolves with the created CoordinatorClient instance.
     */
    public static async create(identifier: string): Promise<CoordinatorClient> {
        console.log('[CoordinatorClient] creating client');
        console.log('[CoordinatorClient] generating RSA keys');
        const rsaKeys = forge.pki.rsa.generateKeyPair(CoordinatorClient.rsaKeyLength);
        console.log('[CoordinatorClient] generated RSA keys');

        return new CoordinatorClient(identifier, rsaKeys);
    }

    /**
     * Starts the client and performs the SRP handshake with the server.
     * 
     * @param sessionName - The name of the session.
     * @param password - The password for authentication.
     * @param sessionPort - The port number of the session.
     * @param sessionIp - The IP address of the session.
     * @param nodePort - The port number of the node.
     * @returns A Promise that resolves to an SRPHandshakeResult object.
     *          The SRPHandshakeResult object contains information about the session and the session key.
     * @throws If there is an error connecting to the server, registering with the host, or verifying with the server,
     *         the event emitter will emit an 'error' event with the error message received from the server.
     */
    public async start(
        sessionName: string,
        password: string,
        sessionPort: number,
        sessionIp: string,
        nodePort: number
    ): Promise<SRPHandshakeResult> {
        let srpClient = new SRPClient(this.identifier, password);
        let client = new TLSClient(sessionName, this.rsaKeys);

        return new Promise((resolve, reject) => {
            client.on('tls-connected', () => {
                this.eventEmitter.emit('connected');
                console.log('[CoordinatorClient] connected to server');
                console.log('[CoordinatorClient] Starting SRP handshake');
                let client_handshake_1: SRPClientHandshake_1 = {
                    type: 'srp-handshake_1',
                    payload: srpClient.getRegistrationAndLoginData()
                };
                client.send(JSON.stringify(client_handshake_1));
            });

            client.on('socket-closed', () => {
                console.log('[CoordinatorClient] socket closed');
                this.eventEmitter.emit('disconnected');
                client.destroy();
            });

            client.on('data', async (data: string) => {
                console.log('[CoordinatorClient] data received from server: ', data);
                let d: SRPServerHandshake_1 | SRPServerHandshake_2 = JSON.parse(data);
                //determine which type of response we got based on the possible types d has
                if (d.type === 'srp-handshake_1') {
                    if (!d.payload) {
                        console.log('[CoordinatorClient] error logging in or registering. Error from server: ', d.error);
                        this.eventEmitter.emit('error', d.error);
                    } else {
                        console.log('[CoordinatorClient] received SRP handshake 1 from server');
                        if (d.status !== 'success') {
                            console.log('[CoordinatorClient] error logging in or registering. Error from server: ', d.error);
                            this.eventEmitter.emit('error', d.error);
                        }
                        let sessionProof = srpClient.deriveSessionKey(d.payload!.serverEphermalKey);
                        let client_handshake_2: SRPClientHandshake_2 = {
                            type: 'srp-handshake_2',
                            payload: {
                                sessionProof: sessionProof,
                                username: this.identifier,
                                nodePort: nodePort
                            }
                        };
                        client.send(JSON.stringify(client_handshake_2));
                    }
                } else {
                    if (!d.payload) {
                        this.eventEmitter.emit('error', d.error);
                        console.log('[CoordinatorClient] error getting server session proof. Error from server: ', d.error);
                    } else {
                        console.log('[CoordinatorClient] received SRP handshake 2 from server');
                        if (d.status !== 'success') {
                            this.eventEmitter.emit('error', d.error);
                            console.log('[CoordinatorClient] error getting server session proof. Error from server: ', d.error);
                        }
                        let verified = srpClient.verifySession(d.payload!.serverProof);
                        if (!verified) {
                            this.eventEmitter.emit('error', 'Could not verify server, please try again');
                        } else {
                            console.log('[CoordinatorClient] session verified');
                            let iv = forge.util.decode64(d.payload!.iv);
                            let encrypted = forge.util.decode64(d.payload!.encrypted);
                                                            let key = srpClient.getSessionKey();
                            let decryptionResult = CryptoUtils.aesDecrypt(key as string, iv, encrypted);
                            if(decryptionResult.status !== 'success') {
                            }
                            let sessionData: SRPHandshakeEncryptedPayload = JSON.parse(decryptionResult.message as string);
                            this.eventEmitter.emit('authenticated');
                            resolve({info: sessionData, key: srpClient.getSessionKey() as string});
                        }
                    }
                }
            });

            client.connect(sessionPort, sessionIp).then(() => {  
            });
        });
    }

    /**
     * Registers a callback function to be called when a specific event occurs.
     * @param event The event name ('connected', 'authenticated', 'error').
     * @param callback The callback function to be called when the event occurs.
     */
    public on(event: 'connected' | 'authenticated' | 'error' | 'disconnected', callback: (...args: any[]) => void) {
        this.eventEmitter.addListener(event, callback);
    }
}

export default CoordinatorClient;