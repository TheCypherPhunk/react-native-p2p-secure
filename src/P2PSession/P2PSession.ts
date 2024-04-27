import { ClientNode, ServerNode } from "../Node";
import { EventEmitter } from 'events';
import forge from "../Utils/forge";
import { getTCPOpenPort } from "../Utils/protocolHelpers";
import proquint from 'proquint';
import crypto from 'crypto';

/**
 * Represents a P2P session.
 * This class is a class that provides the basic functionality for a P2P session.
 * It is extended by the P2PHost and P2PClient classes.
 * 
 * External usage of this class is limited to casting P2PHost and P2PClient instances to and from P2PSession.
 * This allows users to access only the methods required for P2P communication.
 */
export class P2PSession {
    private static readonly rsaKeyLength = 2048;
    protected node!: ServerNode | ClientNode;

    protected eventEmitter: EventEmitter;

    protected identifier: string;

    protected nodePort: number;
    protected coordinatorPort: number;
    protected discoveryPort: number;

    protected discoveryServiceType: string;

    protected nodeKeys: forge.pki.rsa.KeyPair;
    protected coordinatorKeys: forge.pki.rsa.KeyPair;

    /**
     * Handles the common functionality for starting the Host and Clients.
     * @param sessionName The name of the session.
     * @param nodePort The port number that the node will listen on.
     */
    protected constructor(sessionName: string, nodePort: number, coordinatorPort: number, discoveryPort: number, discoveryServiceType: string, coordinatorKeys: forge.pki.rsa.KeyPair, nodeKeys: forge.pki.rsa.KeyPair) {
        this.eventEmitter = new EventEmitter();
        this.identifier = sessionName;

        this.nodeKeys = nodeKeys;
        this.coordinatorKeys = coordinatorKeys;

        this.nodePort = nodePort;
        this.coordinatorPort = coordinatorPort;
        this.discoveryPort = discoveryPort;

        this.discoveryServiceType = discoveryServiceType;
    }

    /**
     * Creates a new P2P session.
     * @param sessionType the type of session to create, this is the zeroconf service type
     * @param sessionName the name of the session, if not provided, a random name will be generated
     * @returns A promise that resolves to a P2PSession object.
     */

    public static async create(sessionType: string, sessionName?: string): Promise<P2PSession> {
        let coordinatorPort: number;
        try {
            coordinatorPort = await getTCPOpenPort();
        } catch (error) {
            // console.log('[CoordinatorServer] create - ', 'Error: Could not secure a port for authentication.');
            return Promise.reject('Could not secure a port for coordinator.');
        }

        let nodePort: number;
        try {
            nodePort = await getTCPOpenPort();
        } catch (error) {
            // console.log('[CoordinatorServer] create - ', 'Error: Could not secure a port for authentication.');
            return Promise.reject('Could not secure a port for node.');
        }

        let discoveryPort = await getTCPOpenPort(5330).catch((reason) => {
            console.warn('[P2PSession] Create - ', 'Error getting open port for discovery server: ', reason);
            return Promise.reject(reason);
        }); //Using Port 5330 as the default port for discovery. If not usable, will use a random port.

        let identifier = sessionName == null? proquint.encode(crypto.randomBytes(4)) : sessionName;

        let nodeKeysPromise = new Promise<forge.pki.rsa.KeyPair>((resolve, reject) => {
            setTimeout(() => {
                forge.pki.rsa.generateKeyPair({bits: 2048, workers: -1}, (err, keypair) => {
                    if(err) {
                        reject(err);
                    }
                    resolve(keypair);
                });
            });
        });


        let coordinatorKeysPromise = new Promise<forge.pki.rsa.KeyPair>((resolve, reject) => {
            setTimeout(() => {
                forge.pki.rsa.generateKeyPair({bits: 2048, workers: -1}, (err, keypair) => {
                    if(err) {
                        reject(err);
                    }
                    resolve(keypair);
                });
            });
        });

        let nodeKeyPair = await nodeKeysPromise;
        let coordinatorKeyPair = await coordinatorKeysPromise;

        return new P2PSession(identifier, nodePort, coordinatorPort, discoveryPort, sessionType, coordinatorKeyPair, nodeKeyPair);
    }

    /**
     * Gets the neighbors connected to the node with a status of 'connected' or 'disconnected'.
     * @returns An array of neighbor information.
     * @example
     * ```typescript
     * const neighborStatus: [{username: string, status: string}] = session.getNeighborStatus();
     * ```
     */
    public getNeighborStatus() {
        return this.node.getNeighborStatus();
    }

    /**
     * Returns an array containing the names of neighbors connected to the node.
     * @returns An array of neighbors connected to the node.
     */
    public getNeighbors() {
        return this.node.getNeighbors();
    }

    /**
     * Sends a message to a neighbor.
     * @param message The message to send.
     * @param to The name of the neighbor to send the message to.
     */
    public sendMessage(message: string, to: string) {
        this.node.sendMessage(message, to);
    }

    /**
     * Broadcasts a message to all neighbors.
     * @param message The message to broadcast.
     */
    public broadcastMessage(message: string) {
        this.node.broadcastMessage(message);
    }

    /**
     * Registers a callback function to be executed when the specified event occurs. This method is used to listen for node events.
     * @param event The name of the event to listen for.
     * @param callback The callback function to be executed when the event occurs.
     * Available events:
     * - 'session-started': Emitted when the session is started.
     * - 'node-connected': Emitted when a node is connected.
     * - 'node-disconnected': Emitted when a node is disconnected.
     * - 'node-reconnected': Emitted when a node is reconnected.
     * - 'node-error': Emitted when an error occurs with a node.
     * - 'node-message': Emitted when a message is received from a node.
     */
    public onNodeEvent(event: 'session-started' | 'node-connected' | 'node-disconnected' | 'node-reconnected' | 'node-error' | 'node-message' , callback: (...args: any[]) => void) {
        this.eventEmitter.on(event, callback);
    }

    /**
     * Destroys the P2P Connection.
     */
    public destroy() {
        this.node.destroy();
        this.eventEmitter.removeAllListeners();
    }

    /**
     * Returns the identifier for the host/client.
     * @returns The identifier for the host/client.
     */
    public getIdentifier() {
        return this.identifier;
    }

    /**
     * Returns the port number that the node is listening on.
     * @returns The port number that the node is listening on.
     */
    /** @internal */
    public getNodePort() {
        return this.nodePort;
    }

    /**
     * Returns the port number that the coordinator is listening on.
     * @returns The port number that the coordinator is listening on.
     */
    /** @internal */
    public getCoordinatorPort() {
        return this.coordinatorPort;
    }

    /**
     * Returns the port number that the discovery service is listening on.
     * @returns The port number that the discovery service is listening on.
     */
    /** @internal */
    public getDiscoveryPort() {
        return this.discoveryPort;
    }

    /**
     * Returns the zeroconf service type.
     * @returns The zeroconf service type.
     */
    /** @internal */
    public getDiscoveryServiceType() {
        return this.discoveryServiceType;
    }

    /**
     * An async wrapper for the keys of the node.
     * @returns A promise that resolves to the RSA key pair of the node.
     */
    /** @internal */
    public getNodeKeys(): forge.pki.rsa.KeyPair {
        return this.nodeKeys;
    }

    /**
     * An async wrapper for the keys of the coordinator.
     * @returns A promise that resolves to the RSA key pair of the coordinator.
     */
    /** @internal */
    public getCoordinatorKeys(): forge.pki.rsa.KeyPair {
        return this.coordinatorKeys;
    }
}