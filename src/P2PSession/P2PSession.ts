import { ClientNode, ServerNode } from "../Node";
import { EventEmitter } from 'events';
import forge from "../Utils/forge";

/**
 * Represents a P2P session.
 * This class is an abstract class that provides the basic functionality for a P2P session.
 * It is extended by the P2PHost and P2PClient classes.
 * 
 * External usage of this class is limited to casting P2PHost and P2PClient instances to P2PSession.
 * This allows users to access only the methods required for P2P communication.
 */
export abstract class P2PSession {
    protected node!: ServerNode | ClientNode;
    protected eventEmitter: EventEmitter;
    protected identifier: string;
    protected nodePort: number;
    protected nodeKeysPromise: Promise<forge.pki.rsa.KeyPair>;

    /**
     * Handles the common functionality for starting the Host and Clients.
     * @param sessionName The name of the session.
     * @param nodePort The port number that the node will listen on.
     */
    constructor(sessionName: string, nodePort: number) {
        this.eventEmitter = new EventEmitter();
        this.identifier = sessionName;
        this.nodeKeysPromise = new Promise<forge.pki.rsa.KeyPair>((resolve, reject) => {
            setTimeout(() => {
                forge.pki.rsa.generateKeyPair({bits: 2048, workers: -1}, (err, keypair) => {
                    if(err) {
                        reject(err);
                    }
                    resolve(keypair);
                });
            });
        });
        this.nodePort = nodePort;
    }

    /**
     * An async wrapper for the keys of the node.
     * @returns A promise that resolves to the RSA key pair of the node.
     */
    protected async getNodeKeys(): Promise<forge.pki.rsa.KeyPair> {
        return this.nodeKeysPromise;
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
     * Registers a callback function to be executed when the specified event occurs.
     * @param event The name of the event to listen for.
     * @param callback The callback function to be executed when the event occurs.
     */
    public on(event: 'session-started' | 'node-connected' | 'node-disconnected' | 'node-reconnected' | 'node-error' | 'node-message' | string , callback: (...args: any[]) => void) {
        this.eventEmitter.on(event, callback);
    }

    /**
     * Destroys the P2P Connection.
     */
    public destroy() {
        this.node.destroy();
        this.eventEmitter.removeAllListeners();
    }

}