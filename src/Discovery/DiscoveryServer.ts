import zeroconf from "react-native-zeroconf";
import EventEmitter from "events"

import {getTCPOpenPort} from "../Utils/protocolHelpers";
import { DISCOVERY_DOMAIN, DISCOVERY_PROTOCOL } from "./constants";
import { DiscoveryServerTxtRecord } from "./TxtRecord";

/**
 * DiscoveryServer class is responsible for handling the discovery functionality.
 */
export class DiscoveryServer {
    private zeroconf: zeroconf;
    private zeroconfPort: number;
    private serviceName: string;
    private serviceType: string;
    private txtRecord: DiscoveryServerTxtRecord;
    private eventEmitter: EventEmitter;

    readonly _protocol = DISCOVERY_PROTOCOL;
    readonly _domain = DISCOVERY_DOMAIN;

    /**
     * Create a new instance of DiscoveryServer.
     * @param port - The port number to use for the zeroconf server.
     * @param serviceName - The name of the service to publish.
     * @param serviceType - The type of the service to publish.
     * @param txtRecord - The TXT record to publish with the service.
     */
    private constructor(port: number, serviceName: string, serviceType: string, txtRecord: DiscoveryServerTxtRecord) {
        this.zeroconf = this.initZeroconf();
        this.zeroconfPort = port;
        this.serviceName = serviceName;
        this.serviceType = serviceType;
        this.txtRecord = txtRecord;
        this.eventEmitter = new EventEmitter();
        console.log('[DiscoveryServer] constructor: ', 'created new DiscoveryServer');
    }

    /**
     * Initialize the zeroconf server and set up error handling.
     * @returns The initialized zeroconf server.
     */
    private initZeroconf(): zeroconf{
        let zeroconfServer = new zeroconf();

        zeroconfServer.on('error', (error) => {
            console.warn('[DiscoveryServer] initZeroconf - ', 'Error on zeroconf: ', error);
            this.eventEmitter.emit('error', 'Discovery: ' + error);
        });

        return zeroconfServer;
    }

    /**
     * Create a new instance of DiscoveryServer.
     * @param serviceName - The name of the service to publish.
     * @param serviceType - The type of the service to publish.
     * @param txtRecord - The TXT record to publish with the service.
     * @returns A Promise that resolves with the new instance of DiscoveryServer.
     * @throws An error if the zeroconf server cannot be initialized due to not being able to secure a port.
     */
    public static async create(serviceName: string, serviceType: string, txtRecord: DiscoveryServerTxtRecord): Promise<DiscoveryServer> {
        let port = await getTCPOpenPort(5330).catch((reason) => {
            console.warn('[DiscoveryServer] create - ', 'Error getting open port: ', reason);
            return Promise.reject(reason);
        }); //Using Port 5330 as the default port for discovery. If not usable, will use a random port.
        return Promise.resolve(new DiscoveryServer(port, serviceName, serviceType, txtRecord));
    }

    /**
     * Start the zeroconf server and publish the service.
     */
    public start() : void {
        let txtRecord = {...this.txtRecord};
        this.zeroconf.publishService(this.serviceType, this._protocol, this._domain, this.serviceName, this.zeroconfPort, txtRecord);
        this.eventEmitter.emit('published');
        console.log('[DiscoveryServer] start - ', 'zeroconf published');
    }

    /**
     * Stop the zeroconf server and unpublish the service.
     */
    public stop() : void {
        this.zeroconf.unpublishService(this.serviceName);
        this.eventEmitter.emit('unpublished');
        console.log('[DiscoveryServer] stop - ', 'zeroconf unpublished');
    }

    /**
     * Register a listener function to be called when a specific event is emitted.
     * @param event - The name of the event to listen for. Can be 'published', 'unpublished', or 'error'.
     * @param listener - The function to be called when the event is emitted.
     */
    public on(event: 'published' | 'unpublished' | 'error', listener: (...args: any[]) => void) {
        this.eventEmitter.on(event, listener);
    }
}
