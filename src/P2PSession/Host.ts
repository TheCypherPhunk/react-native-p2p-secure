import { getTCPOpenPort } from '../Utils/protocolHelpers';
//@ts-ignore
import proquint from 'proquint';

import { DiscoveryServer, DiscoveryServerTxtRecord } from '../Discovery';
import { CoordinatorServer } from '../Coordinator';
import { ServerNode } from '../Node/ServerNode';
import { NodeInfo } from '../Node';
import { EventEmitter } from 'events';
import forge from '../Utils/forge';
import crypto from 'crypto';
import { P2PSession } from './P2PSession';

export class Host extends P2PSession {
    private Discovery: DiscoveryServer;
    private Coordinator: CoordinatorServer;

    /**
     * Constructs a new Host instance.
     * 
     * @param Discovery - The DiscoveryServer instance.
     * @param Coordinator - The CoordinatorServer instance.
     * @param sessionName - The name of the session.
     * @param nodePort - The port number of the node.
     * @returns A new Host instance.
     * 
     * @remarks
     * This constructor is private and should not be called directly.
     * To create a new Host instance, use the static create method.
     */
    private constructor(Discovery: DiscoveryServer, Coordinator: CoordinatorServer, sessionName: string, nodePort: number) {
        super(sessionName, nodePort);
        this.Discovery = Discovery;
        this.Coordinator = Coordinator;

        this.Coordinator.on('connection-attempt', (username) => {
            // console.log('[Host] connection-attempt - ', 'Connection attempt: ', username);
            this.eventEmitter.emit('coordinator-connection-start', username);
        });

        this.Coordinator.on('connection-attempt-fail', ({username, error}) => {
            // console.log('[Host] connection-attempt-fail - ', 'Connection attempt failed: ', username, error);
            this.eventEmitter.emit('coordinator-connection-fail', username, error);
        });

        this.Coordinator.on('connected', (user) => {
            // console.log('[Host] connected - ', 'Connected to user: ', user.userName);
            this.eventEmitter.emit('coordinator-connected', user.userName);
        });

        this.Coordinator.on('disconnected', (user) => {
            // console.log('[Host] disconnected - ', 'Disconnected from user: ', user);
            this.eventEmitter.emit('coordinator-disconnected', user);
        });

        this.Coordinator.on('reconnected', (user) => {
            // console.log('[Host] reconnected - ', 'Reconnected to user: ', user);
            this.eventEmitter.emit('coordinator-reconnected', user);
        });

        this.Discovery.on('published', () => {
            // console.log('[Host] published - ', 'Published discovery server');
            this.eventEmitter.emit('discovery-published');
        });

        this.Discovery.on('unpublished', () => {
            // console.log('[Host] unpublished - ', 'Unpublished discovery server');
            this.eventEmitter.emit('discovery-unpublished');
        });

        this.Discovery.on('error', (error) => {
            // console.log('[Host] error - ', 'Discovery server error: ', error);
            this.eventEmitter.emit('discovery-error', error);
        });

    }

    /**
     * Creates a new Host instance.
     * @param discoveryServiceType - The type of the discovery service.
     * @param username - The username of the host.
     * @returns - A promise that resolves with the created Host instance.
     */
    public static async create(discoveryServiceType: string, username?: string) {
        // console.log('[Host] create - ', 'Creating Host');
        let identifier = username == null? proquint.encode(crypto.randomBytes(4)) : username;
        // console.log('[Host] create - ', 'Identifier: ', identifier);

        // console.log('[Host] create - ', 'Generating Device IP')

        let nodePort = await getTCPOpenPort().catch((error) => {  
            console.error('[Host] create - ', 'Error getting open port: ', error);
            return Promise.reject(error);
        });

        let coordinatorServer = await CoordinatorServer.create(identifier, nodePort).catch((error) => {
            console.error('[Host] ' + 'create - ', 'Error creating coordinator server: ', error);
            return Promise.reject(error);
        });
    
        let txtRecord: DiscoveryServerTxtRecord = {
            "coordinatorPort": coordinatorServer.tcpPort,
        }
    
        let discoveryServer = await DiscoveryServer.create(identifier, discoveryServiceType, txtRecord).catch((error) => {
            console.error('[Host] ' + 'create - ', 'Error creating discovery server: ', error);
            return Promise.reject(error);
        });

        return new Host(discoveryServer, coordinatorServer, identifier, nodePort);
    }

    /**
     * Starts the Host instance.
     * 
     * @remarks
     * This method should be called after creating a new Host instance to start the discovery and coordinator servers.
     * The discovery server will start advertising the service, and the coordinator server will start listening for connections.
     */
    public start() {
        this.Coordinator.start();
        this.Discovery.start();
    }

    /**
     * Starts the P2P session.
     * 
     * @remarks
     * This method should be called after starting the Host instance and all neighbors have connected to the host.
     * It will start the P2P session by creating a new ServerNode instance and connecting to all neighbors. 
     */
    public async startP2PSession() {
        let neighbors = (this.Coordinator as CoordinatorServer).exportUsers();
        // console.log('[Host] serverConnect - ', 'Neighbors: ', JSON.stringify(neighbors));
        
        let neighborsInfo : NodeInfo[] = neighbors.map((neighbor) => {
            return {
                info: {
                    userName: neighbor.userName,
                    ip: neighbor.ip,
                    port: neighbor.port
                },
                key: neighbor.serverSessionKey!
            }
        });

        let nodeKeys = await this.getNodeKeys();
        // console.log('[Host] serverConnect - ', 'NeighborsInfo: ', JSON.stringify(neighborsInfo));
        this.node = new ServerNode(this.identifier, this.nodePort, nodeKeys, neighborsInfo)

        this.node.on('message', (message, username) => {
            // console.log('[Host] message - ', 'Message: ', message, ' From: ', username);
            this.eventEmitter.emit('node-message', message, username);
        });

        this.node.on('connected', (username) => {
            // console.log('[Host] connected - ', 'Connected: ', username);
            this.eventEmitter.emit('node-connected', username);
        });

        this.node.on('disconnected', (username) => {
            // console.log('[Host] disconnected - ', 'Disconnected: ', username);
            this.eventEmitter.emit('node-disconnected', username);
        });

        this.node.on('reconnected', (username) => {
            // console.log('[Host] reconnected - ', 'Reconnected: ', username);
            this.eventEmitter.emit('node-reconnected', username);
        });

        this.node.on('error', (error) => {
            // console.log('[Host] error - ', 'Error: ', error);
            this.eventEmitter.emit('node-error', error);
        });

        this.node.on('session-started', () => {
            // console.log('[Host] session-started - ', 'Session started');
            this.stopAdvertising();
            this.eventEmitter.emit('session-started');
        });

        (this.node as ServerNode).start();

    }

    /**
     * Stops the Host instance.
     * 
     * @remarks
     * This method should be called to stop the discovery and coordinator servers.
     */
    public getNeighbors() {
        return this.node.getNeighbors();
    }

    /**
     * Registers a listener function to be called when the specified event is emitted.
     * @param event The event to listen for.
     * @param callback A callback function to be called when the event is emitted.
     * 
     * @remarks
     * The following events can be listened for:
     * - 'session-started': Emitted when the p2p session is started.
     * - 'node-connected': Emitted when a neighbor node connects to the host in the p2p network.
     * - 'node-disconnected': Emitted when a neighbor node disconnects from the host in the p2p network.
     * - 'node-reconnected': Emitted when a neighbor node reconnects to the host in the p2p network.
     * - 'node-error': Emitted when an error occurs in the node.
     * - 'node-message': Emitted when a message is received from a neighbor node in the p2p network.
     * - 'node-message': Emitted when a message is received from a neighbor node in a p2p session.
     * - 'node-disconnected': Emitted when a neighbor node disconnects from the host.
     * - 'node-reconnected': Emitted when a neighbor node reconnects to the host.
     * - 'coordinator-connection-start': Emitted when the coordinator server starts a connection attempt to a neighbor node.
     * - 'coordinator-connection-fail': Emitted when the coordinator server fails to connect to a neighbor node.
     * - 'coordinator-connected': Emitted when the coordinator server successfully connects to a neighbor node.
     * - 'coordinator-disconnected': Emitted when the coordinator server disconnects from a neighbor node.
     * - 'coordinator-reconnected': Emitted when the coordinator server reconnects to a neighbor node.
     * - 'discovery-published': Emitted when the discovery server publishes the service.
     * - 'discovery-unpublished': Emitted when the discovery server unpublishes the service.
     * - 'discovery-error': Emitted when an error occurs in the discovery server.
     */
    public on(event: 'session-started' | 'node-connnected' | 'node-disconnected' | 'node-reconnected' | 'node-error' | 'node-message' | 'coordinator-connection-start' | 'coordinator-connection-fail' |'coordinator-connected' | 'coordinator-disconnected' | 'coordinator-reconnected' | 'discovery-published' | 'discovery-unpublished' | 'discovery-error', callback: (...args: any[]) => void) {
        this.eventEmitter.on(event, callback);
    }

    /**
     * Stops the coordinator and discovery servers.
     * 
     * @remarks
     * This method should be called to stop the discovery and coordinator servers.
     * It will stop the servers and close all connections. This method should be called when the host is no longer needed and the node has been connected to all neighbors.
     * The host instance should be discarded after calling this method.
     */
    private stopAdvertising() {
        this.Coordinator.stop();
        this.Discovery.stop();
    }

    /**
     * Returns the passcode for the session.
     * @returns The passcode for the session.
     */
    get sessionPasscode() {
        return (this.Coordinator as CoordinatorServer).passcode;
    }

    /**
     * Returns the identifier for the host.
     * @returns The identifier for the host.
     */
    get identifierString() {
        return this.identifier;
    }

    public destroy(): void {
        super.destroy();
        this.Coordinator.destroy();
        this.Discovery.destroy();
    }
}

export {Host as P2PHost}