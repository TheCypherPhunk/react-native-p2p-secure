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

export class Host {
    private Discovery: DiscoveryServer;
    private Coordinator: CoordinatorServer;
    private identifier: string;
    private node!: ServerNode;
    private nodePort: number;
    private eventEmitter: EventEmitter;
    private nodeKeysPromise : Promise<forge.pki.rsa.KeyPair>;


    private constructor(Discovery: DiscoveryServer, Coordinator: CoordinatorServer, sessionName: string, nodePort: number) {
        this.Discovery = Discovery;
        this.Coordinator = Coordinator;
        this.identifier = sessionName;

        this.nodePort = nodePort;
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

        this.eventEmitter = new EventEmitter();

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

    public start() {
        this.Coordinator.start();
        this.Discovery.start();
    }

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

        let nodeKeys = await this.nodeKeysPromise;
        // console.log('[Host] serverConnect - ', 'NeighborsInfo: ', JSON.stringify(neighborsInfo));
        this.node = new ServerNode(this.identifier, this.nodePort, nodeKeys, neighborsInfo)

        this.node.on('message', (message, username) => {
            // console.log('[Host] message - ', 'Message: ', message, ' From: ', username);
            this.eventEmitter.emit('node-message', message, username);
        });

        this.node.on('disconnected', (username) => {
            // console.log('[Host] disconnected - ', 'Disconnected: ', username);
            this.eventEmitter.emit('node-disconnected', username);
        });

        this.node.on('reconnected', (username) => {
            // console.log('[Host] reconnected - ', 'Reconnected: ', username);
            this.eventEmitter.emit('node-reconnected', username);
        });

        this.node.on('session-started', () => {
            // console.log('[Host] session-started - ', 'Session started');
            this.stop();
            this.eventEmitter.emit('session-started');
        });

        this.node.start();

    }

    public reconnect() {
        this.node.reconnect();
    }

    public broadcast(message: string) {
        this.node.broadcastMessage(message);
    }    
    
    public send(message: string, username: string) {
        this.node.sendMessage(message, username);
    }

    public getNeighbors() {
        return this.node.getNeighbors();
    }

    public on(event: 'node-message' | 'node-disconnected' | 'node-reconnected' | 'coordinator-connection-start' | 'coordinator-connection-fail' |'coordinator-connected' | 'coordinator-disconnected' | 'coordinator-reconnected' | 'discovery-published' | 'discovery-unpublished' | 'discovery-error' | 'session-started', callback: (...args: any[]) => void) {
        this.eventEmitter.on(event, callback);
    }

    private stop() {
        this.Coordinator.stop();
        this.Discovery.stop();
    }

    get sessionPasscode() {
        return (this.Coordinator as CoordinatorServer).passcode;
    }

    get identifierString() {
        return this.identifier;
    }

    get connectedNeighbors() {
        return (this.Coordinator as CoordinatorServer).exportUsers().map((neighbor) => {
            return neighbor.userName;
        });
    }

    public getNode() {      
        return this.node;
    }
}

export {Host as P2PHost}