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
    public constructor(port: number, serviceName: string, serviceType: string, txtRecord: DiscoveryServerTxtRecord) {
        this.zeroconf = this.initZeroconf();
        this.zeroconfPort = port;
        this.serviceName = serviceName;
        this.serviceType = serviceType;
        this.txtRecord = txtRecord;
        this.eventEmitter = new EventEmitter();
        // console.log('[DiscoveryServer] constructor: ', 'created new DiscoveryServer');
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
     * Start the zeroconf server and publish the service.
     */
    public start() : void {
        let txtRecord = {...this.txtRecord};
        this.zeroconf.publishService(this.serviceType, this._protocol, this._domain, this.serviceName, this.zeroconfPort, txtRecord);
        this.eventEmitter.emit('published');
        // console.log('[DiscoveryServer] start - ', 'zeroconf published');
    }

    /**
     * Stop the zeroconf server and unpublish the service.
     */
    public stop() : void {
        this.zeroconf.unpublishService(this.serviceName);
        this.eventEmitter.emit('unpublished');
        // console.log('[DiscoveryServer] stop - ', 'zeroconf unpublished');
    }

    /**
     * Register a listener function to be called when a specific event is emitted.
     * @param event - The name of the event to listen for. Can be 'published', 'unpublished', or 'error'.
     * @param listener - The function to be called when the event is emitted.
     */
    public on(event: 'published' | 'unpublished' | 'error', listener: (...args: any[]) => void) {
        this.eventEmitter.on(event, listener);
    }

    public destroy() {
        this.zeroconf.unpublishService(this.serviceName);
        this.zeroconf.removeDeviceListeners();
        this.eventEmitter.removeAllListeners();
    }
}
