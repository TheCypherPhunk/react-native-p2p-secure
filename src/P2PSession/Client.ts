
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

export class Client {
    private Discovery: DiscoveryClient;
    private Coordinator: CoordinatorClient;
    private identifier: string;
    private node!: ClientNode;
    private nodePort: number;
    private eventEmitter: EventEmitter;
    private nodeKeysPromise! : Promise<forge.pki.rsa.KeyPair>;

    private constructor(Discovery: DiscoveryClient, Coordinator: CoordinatorClient, sessionName: string, nodePort: number) {
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
            this.eventEmitter.emit('discovery-service-list-update', services);
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

    public start() {
        this.Discovery.start();
    }

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

    public async connectToSession(sessionName: string, password: string, sessionPort: number, sessionIP: string) {

        let neighbor : SRPHandshakeResult = await (this.Coordinator as CoordinatorClient).start(sessionName as string, password as string, sessionPort as number, sessionIP as string, this.nodePort);

        let nodeKeys = await this.nodeKeysPromise;
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

        this.node.on('disconnected', (username) => {
            // console.log('[Session] disconnected - ', 'Neighbor: ', username);
            this.eventEmitter.emit('node-disconnected', username);
        });

        this.node.on('reconnected', (username) => {
            // console.log('[Session] reconnected - ', 'Neighbor: ', username);
            this.eventEmitter.emit('node-reconnected', username);
        });

        // console.log('[Session] clientConnect - ', 'Neighbor: ', JSON.stringify(neighbor));

        // this.stop();
    }

    public reconnect() {
        this.node.reconnect();
    }

    public getActiveSessions() {
        return (this.Discovery as DiscoveryClient).getActiveServices();
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

    public on(event: 'session-started' | 'node-message' | 'node-disconnected' | 'node-reconnected' | 'discovery-start' | 'discovery-stop' | 'discovery-error' | 'discovery-service-list-update' | 'coordinator-connected' | 'coordinator-authenticated' | 'coordinator-error' | 'coordinator-disconnected', callback: (...args: any[]) => void) {
        this.eventEmitter.on(event, callback);
    }

    public off(event: 'session-started' | 'node-message' | 'node-disconnected' | 'node-reconnected' | 'discovery-start' | 'discovery-stop' | 'discovery-error' | 'discovery-service-list-update' | 'coordinator-connected' | 'coordinator-authenticated' | 'coordinator-error' | 'coordinator-disconnected', callback: (...args: any[]) => void) {
        this.eventEmitter.off(event, callback);
    }

    private stop() {
        this.Discovery.stop();
    }

    get identifierString() {
        return this.identifier;
    }

    public discoverableSessions() {
        return (this.Discovery as DiscoveryClient).getActiveServices().map((service) => {
            return service.name;
        });
    }

    public getNode() {
        return this.node;
    }

}


export {Client as P2PClient}