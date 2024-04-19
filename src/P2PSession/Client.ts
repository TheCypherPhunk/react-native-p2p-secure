
import { getTCPOpenPort } from '../Utils/protocolHelpers';
//@ts-ignore
import proquint from 'proquint';

import { DiscoveryClient } from '../Discovery';
import { CoordinatorClient, SRPHandshakeResult } from '../Coordinator';
import { ClientNode } from '../Node/ClientNode';
import { EventEmitter } from 'events';
import { off } from 'process';
import forge from '../Utils/forge';
import crypto from 'crypto';
import { P2PSession } from './P2PSession';

export class Client extends P2PSession {
    private Discovery: DiscoveryClient;
    private Coordinator: CoordinatorClient;

    /**
     * Constructs a new Client instance.
     * @param Discovery  - The discovery client.
     * @param Coordinator - The coordinator client.
     * @param sessionName - The session name.
     * @param nodePort - The port number of the node.
     * @constructor
     * 
     * @remarks
     * This constructor is intended to be used internally by the Client class and should not be called directly.
     */
    private constructor(Discovery: DiscoveryClient, Coordinator: CoordinatorClient, sessionName: string, nodePort: number) {
        super(sessionName, nodePort);
        this.Discovery = Discovery;
        this.Coordinator = Coordinator;

        this.Discovery.on('start', () => {
            // console.log('[Session] start - ', 'Discovery started');
            this.eventEmitter.emit('discovery-start');
        });

        this.Discovery.on('stop', () => {
            // console.log('[Session] stop - ', 'Discovery stopped');
            this.eventEmitter.emit('discovery-stop');
        });

        this.Discovery.on('error', (error) => {
            // console.log('[Session] error - ', 'Discovery error: ', error);
            this.eventEmitter.emit('discovery-error', error);
        });

        this.Discovery.on('service-list-update', (services) => {
            // console.log('[Session] service-list-update - ', 'Services updated: ', services);
            let serviceNames = services.map((service) => {
                return service.name;
            });
            this.eventEmitter.emit('discovery-service-list-update', serviceNames);
        });

        this.Coordinator.on('connected', () => {
            // console.log('[Session] connected - ', 'Connected to coordinator');
            this.eventEmitter.emit('coordinator-connected');
        });

        this.Coordinator.on('authenticated', () => {
            // console.log('[Session] authenticated - ', 'Authenticated with coordinator');
            this.eventEmitter.emit('coordinator-authenticated');
        })

        this.Coordinator.on('error', (error) => {
            // console.log('[Session] error - ', 'Coordinator error: ', error);
            this.eventEmitter.emit('coordinator-error', error);
        });

        this.Coordinator.on('disconnected', () => {
            // console.log('[Session] closed - ', 'Coordinator closed');
            this.eventEmitter.emit('coordinator-disconnected');
        });
    }

    /**
    * Creates a new instance of the Client class.
    * @param discoveryServiceType - The type of the discovery service.
    * @param username - The username for the client, this is optional. If not provided, a random username will be generated.
    * @returns A promise that resolves with the created Client instance.
    * 
    * @throws If there is an error getting an open port, the promise will be rejected with the error.
    * 
    * @example
    * ```typescript
    * let client = await Client.create('p2p-chat');
    * ```
    */
    public static async create(discoveryServiceType: string, username?: string, ) {
        // console.log('[Session] create - ', 'Creating Client');
        let identifier = username == null? proquint.encode(crypto.randomBytes(4)) : username;
        // console.log('[Session] create - ', 'Identifier: ', identifier);

        // console.log('[Session] create - ', 'Generating Device IP')

        let nodePort = await getTCPOpenPort().catch((error) => {  
            // console.log('[Session] create - ', 'Error getting open port: ', error);
            return Promise.reject(error);
        });

        let discoveryClient = new DiscoveryClient(discoveryServiceType);
        let coordinatorClient = await CoordinatorClient.create(identifier);
        return new Client(discoveryClient, coordinatorClient, identifier, nodePort);
        
    }

    /**
     * Starts the discovery service.
     * 
     * @remarks
     * This method starts the discovery service and begins scanning for available services.
     * 
     */
    public start() {
        this.Discovery.start();
    }

    /**
     * connectSession - Connects to a session with the specified name and password.
     * 
     * @param sessionName - The name of the session to connect to.
     * @param password - The password for the session, this is a 6 digit number.
     * @returns A promise that resolves when the connection is successful.
     * 
     * @remarks
     * This method connects to a session with the specified name and password.
     * If the session is found, the client will connect to the session.
     * If the session is not found, the promise will be rejected with an error message.
     * 
     * @example
     * ```typescript
     * await client.connectSession('p2p-chat', '123456');
     * ```
     */
    public async connectSession(sessionName: string, password: string) {
        let service = (this.Discovery as DiscoveryClient).getActiveServices().find((service) => {
            return service.name === sessionName;
        });
        if (!service) {
            return Promise.reject('Service not found');
        } else {
            return this.connectToSession(sessionName, password, service.port, service.address).catch((error) => {
                // console.log('[Session] connectSession - ', 'Error connecting to session: ', error);
                return Promise.reject(error);
            });
        }
    }

    /**
     * connectToSession - Connects to a session with the specified name and password. This is used internally by the connectSession method.
     * 
     * @param sessionName - The name of the session to connect to.
     * @param password - The password for the session, this is a 6 digit number.
     * @param sessionPort - The port number of the session.
     * @param sessionIP - The IP address of the session.
     * @returns A promise that resolves when the connection is successful.
     * 
     * @remarks
     * This method connects to a session with the specified name and password.
     * If the session is found, the client will connect to the session.
     * If the session is not found, the promise will be rejected with an error message.
     */
    private async connectToSession(sessionName: string, password: string, sessionPort: number, sessionIP: string) {

        let neighbor : SRPHandshakeResult = await (this.Coordinator as CoordinatorClient).start(sessionName as string, password as string, sessionPort as number, sessionIP as string, this.nodePort);

        let nodeKeys = await this.getNodeKeys();
        if(!this.node) {
            this.node = new ClientNode(this.identifier, this.nodePort, nodeKeys, neighbor);
        } else {
            await this.node.destroy();
            this.node = new ClientNode(this.identifier, this.nodePort, nodeKeys, neighbor);
        }
        
        this.node.on('message', (message, username) => {
            // console.log('[Session] message - ', 'Message: ', message, ' From: ', username);
            this.eventEmitter.emit('node-message', message, username);
        });
        
        this.node.on('session-started', () => {
            // console.log('[Session] session-started - ', 'Session started');
            this.eventEmitter.emit('session-started');
        });

        this.node.on('connected', (username) => {
            // console.log('[Session] connected - ', 'Neighbor: ', username);
            this.eventEmitter.emit('node-connected', username);
        });

        this.node.on('disconnected', (username) => {
            // console.log('[Session] disconnected - ', 'Neighbor: ', username);
            this.eventEmitter.emit('node-disconnected', username);
        });

        this.node.on('reconnected', (username) => {
            // console.log('[Session] reconnected - ', 'Neighbor: ', username);
            this.eventEmitter.emit('node-reconnected', username);
        });

        this.node.on('error', (error) => {
            // console.log('[Session] error - ', 'Error: ', error);
            this.eventEmitter.emit('node-error', error);
        });

        // console.log('[Session] clientConnect - ', 'Neighbor: ', JSON.stringify(neighbor));
    }

    /**
     * Gets the active sessions.
     */
    public getActiveSessions() {
        return (this.Discovery as DiscoveryClient).getActiveServices();
    }

    /**
     * getNeighbors - Gets the neighbors of the client node in the active p2p network.
     */
    public getNeighbors() {
        return this.node.getNeighbors();
    }

    /**
     * Registers a callback function to be called when a specific event occurs.
     * @param event The event name ('session-started', 'node-message', 'node-disconnected', 'node-reconnected', 'discovery-start', 'discovery-stop', 'discovery-error', 'discovery-service-list-update', 'coordinator-connected', 'coordinator-authenticated', 'coordinator-error', 'coordinator-disconnected').
     * @param callback The callback function to be called when the event occurs.
     * 
     * Available events:
     * - 'session-started': Emitted when the p2p session is started.
     * - 'node-connected': Emitted when a neighbor node connects to the host in the p2p network.
     * - 'node-disconnected': Emitted when a neighbor node disconnects from the host in the p2p network.
     * - 'node-reconnected': Emitted when a neighbor node reconnects to the host in the p2p network.
     * - 'node-error': Emitted when an error occurs in the node.
     * - 'node-message': Emitted when a message is received from a neighbor node in the p2p network.
     * - 'discovery-start': Emitted when the discovery service is started.
     * - 'discovery-stop': Emitted when the discovery service is stopped.
     * - 'discovery-error': Emitted when there is an error with the discovery service.
     * - 'discovery-service-list-update': Emitted when the list of active services is updated.
     * - 'coordinator-connected': Emitted when the client is connected to the host but not yet authenticated.
     * - 'coordinator-authenticated': Emitted when the client is authenticated with the host.
     * - 'coordinator-error': Emitted when there is an error while connecting/authenticating with the host.
     * - 'coordinator-disconnected': Emitted when the client is disconnected from the host.
     * 
     */
    public on(event: 'session-started' | 'node-connnected' | 'node-disconnected' | 'node-reconnected' | 'node-error' | 'node-message' | 'discovery-start' | 'discovery-stop' | 'discovery-error' | 'discovery-service-list-update' | 'coordinator-connected' | 'coordinator-authenticated' | 'coordinator-error' | 'coordinator-disconnected', callback: (...args: any[]) => void) {
        this.eventEmitter.on(event, callback);
    }

    /** 
     * Gets the username used to identify the client in the p2p network.
     */
    get identifierString() {
        return this.identifier;
    }

    public destroy() {
        super.destroy();
        this.Discovery.destroy();
        this.Coordinator.destroy();
    }

}


export {Client as P2PClient}