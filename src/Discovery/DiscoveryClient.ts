import Zeroconf, {type Service} from "react-native-zeroconf";
import EventEmitter from "events"
import net from "net";

import type { DiscoveryServerTxtRecord } from "./TxtRecord";
import { DISCOVERY_DOMAIN, DISCOVERY_PROTOCOL } from "./constants";

/**
 * Represents a service discovered by the DiscoveryClient.
 */
export type DiscoveryClientService = {
    name: string,
    port: number,
    address: string,
}

/**
 * A client that discovers services on the local network using Zeroconf.
 */
export class DiscoveryClient {
    private zeroconf: Zeroconf;
    private services: Set<string> = new Set<string>();
    private serviceType: string;
    private status: 'stopped' | 'started' | 'initialized' = 'initialized';
    private eventEmitter: EventEmitter;

    readonly _protocol = DISCOVERY_PROTOCOL;
    readonly _domain = DISCOVERY_DOMAIN;

    /**
     * Constructs a new DiscoveryClient.
     * @param serviceType The type of service to discover.
     */
    public constructor(serviceType: string) {
        this.zeroconf = this.initZeroconf();
        this.serviceType = serviceType;
        this.eventEmitter = new EventEmitter();
    }

    /**
     * Handles a resolved service discovered by Zeroconf.
     * @param service The resolved service.
     * @returns True if the service was successfully added to the list of active services, returns false if the service was already in the list or in case IPV4 addresses were not found.
     */
    private handleServiceResolved(service: Service) : boolean {
        // console.log('[DiscoveryClient] handleServiceResolved - ', 'Resolved Service: ', service.name);
        let txtRecord = service.txt as DiscoveryServerTxtRecord;

        //filter ipv4 addresses and remove loopbacks
        let ipv4Addresses = service.addresses.filter((address: string) => {
            return net.isIPv4(address);
        }).filter((address: string) => {
            return address !== '127.0.0.1';
        });

        if (ipv4Addresses.length === 0) {
            console.warn('[DiscoveryClient] handleServiceResolved - ', 'No IPv4 addresses found for service: ', service);
            return false;
        }

        let address = ipv4Addresses[0]; //Expecting only one address since this works on a local network.
        if(address) {
            let newService : DiscoveryClientService = {
                name: service.name,
                port: txtRecord.coordinatorPort,
                address: address
            }
            let newServiceString = JSON.stringify(newService);

            if(this.services.has(newServiceString)) {
                // console.log('[DiscoveryClient] handleServiceResolved - ', 'Service already exists in list: ', newService.name);
                return false;
            } else {
                this.services.add(newServiceString);
                // console.log('[DiscoveryClient] handleServiceResolved - ', 'Added New Service to list ', newService);
                return true;
            }
        } else {
            console.warn('[DiscoveryClient] handleServiceResolved - ', 'No address found for service: ', service);
            return false;
        }
    }   

    /**
     * Handles the removal of a service with the given name from the list of active services. The service is removed from the list if it exists, otherwise nothing happens.
     * @param name The name of the service to be removed.
     * @returns True if the service was successfully removed, false if the service was not found in the list.
     */
    private handleServiceRemoved(name: string) : boolean {
        let service : string | undefined = undefined;
        this.services.forEach((value) => {
            let serviceObject = JSON.parse(value) as DiscoveryClientService;
            if (serviceObject.name === name) {
                service = value;
            }
        });
        if (service !== undefined) {
            this.services.delete(service);
            // console.log('[DiscoveryClient] handleServiceRemoved - ', 'Removed Service: ', name);
            return true;
        } else {
            // console.log('[DiscoveryClient] handleServiceRemoved - ', 'Could not find service to remove: ', name);
            return false;
        }
    }

    /**
     * Initializes the Zeroconf client. Sets up event listeners.
     * @returns A new Zeroconf client.
     */
    private initZeroconf(): Zeroconf{
        let zeroconfClient = new Zeroconf();

        zeroconfClient.on('start', () => {
            this.status = 'started';
            this.eventEmitter.emit('start');
            // console.log('[DiscoveryClient] initZeroconf - ', 'zeroconf scan started');
        });

        zeroconfClient.on('stop', () => {
            this.status = 'stopped';
            this.zeroconf.removeDeviceListeners();
            this.eventEmitter.emit('stop');
            // console.log('[DiscoveryClient] initZeroconf - ', 'zeroconf scan stopped');
        });

        zeroconfClient.on('error', (error) => {
            console.warn('[DiscoveryClient] initZeroconf - ', 'Error on zeroconf: ', error);
            this.eventEmitter.emit('error', 'Discovery: ' + error);
        });

        zeroconfClient.on('resolved', (service) => {
            // console.log('[DiscoveryClient] initZeroconf - ', 'Resolving Service: ', service.name);
            if(this.handleServiceResolved(service)) {
                this.eventEmitter.emit('service-list-update', this.getActiveServices());
            }
        });

        zeroconfClient.on('remove', (name) => {
            // console.log('[DiscoveryClient] initZeroconf - ', 'Removing Service: ', name);
            if(this.handleServiceRemoved(name)) {
                this.eventEmitter.emit('service-list-update', this.getActiveServices());
            }
        });

        return zeroconfClient;
    }

    /**
     * Starts the Zeroconf scan for the specified service type. If the service was previously stopped, it will be restarted.
     */
    public start() : void {
        this.services.clear();
        if(this.status === 'stopped') {
            this.zeroconf.addDeviceListeners();
            this.zeroconf.scan(this.serviceType,this._protocol, this._domain);
            // console.log('[DiscoveryClient] start - ', 'zeroconf scan started after stop');

        } else if(this.status === 'initialized') {
            this.zeroconf.scan(this.serviceType,this._protocol, this._domain);
            // console.log('[DiscoveryClient] start - ', 'zeroconf scan started after initialization');

        } else {
            // console.log('[DiscoveryClient] start - ', 'zeroconf scan already started');
        }
    }

    /**
     * Stops the Zeroconf scan.
     */
    public stop() : void {
        this.zeroconf.stop();
        // console.log('[DiscoveryClient] stop - ', 'zeroconf scan stopped');
    }

    /**
     * Returns the list of active services discovered by the client.
     * @returns The list of active services.
     */
    public getActiveServices() : DiscoveryClientService[] {
        let services : DiscoveryClientService[] = [];
        this.services.forEach((value) => {
            services.push(JSON.parse(value) as DiscoveryClientService);
        });
        return services;
    }


    /**
     * Registers a listener function to be called when the specified event is emitted.
     * @param event The name of the event to listen for.
     * @param callback The function to be called when the event is emitted.
     */
    public on(event: 'start' | 'stop' | 'error' | 'service-list-update', callback: (...args: any[]) => void) {
        this.eventEmitter.on(event, callback);
    }

    public destroy() {
        this.zeroconf.stop();
        this.zeroconf.removeDeviceListeners();
        this.eventEmitter.removeAllListeners();
    }
}