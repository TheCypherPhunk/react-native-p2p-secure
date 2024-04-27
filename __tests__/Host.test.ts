import { EventEmitter } from 'events';
import forge from 'node-forge';
import Zeroconf from 'react-native-zeroconf';
import modPow from 'react-native-modpow';

jest.mock('react-native-modpow', () => {
    return jest.fn().mockImplementation((base, exponent, modulus) => {
        return 'd3693b7da6e96f371db7fcf65eb4db2e32c2055c31f60950cfd40387ec4359e2df148e6f6d83042589bde4dceece1122e5343875cc4d8f2ceeed8019dd7a9d68815a85e2e57806068f25df481a2cf9f47bc6fb20ec6db790e88dd5550ea1d50fd28d9fdb7a0d7364eec466736727f8dcf6c8a27615576f6c78c76649e58fe9e8'
    });
});

//mock zeroconf
let zerconfEventEmitter = new EventEmitter();
jest.mock('react-native-zeroconf', () => {
    return jest.fn().mockImplementation(() => {
        return {
            scan: jest.fn().mockImplementation(() => {
                zerconfEventEmitter.emit('start');
            }),
            stop: jest.fn().mockImplementation(() => {
                zerconfEventEmitter.emit('stop');
            }),
            addDevice: jest.fn(),
            removeDevice: jest.fn(),
            getServices: jest.fn(),
            on: jest.fn().mockImplementation((event, callback) => {
                zerconfEventEmitter.on(event, callback);
            }),
            removeListener: jest.fn(),
            publishService: jest.fn().mockImplementation(() => {
                zerconfEventEmitter.emit('published');
            }),
        };
    });
});
let testSession = {
    name: 'TestSession',
    port: 8080,
    address: 'localhost',
};
import { DiscoveryServer } from '../src/Discovery';
import { CoordinatorServer } from '../src/Coordinator';
import { Host } from '../src/P2PSession/Host';
import { mock, instance, when, anything, verify } from 'ts-mockito';
import * as protocolHelpers from '../src/Utils/protocolHelpers';
import { Client } from '../src/P2PSession';
import { P2PSession } from '../src/P2PSession';
import { P2PHost } from '../src/P2PSession/Host';

describe('Host', () => {

    describe('create', () => {
        it('should create a new Host instance', async () => {
            const discoveryServiceType = 'p2p-chat';
            const username = 'testUser';

            const session = await P2PSession.create(discoveryServiceType);
            const host = new P2PHost(session);
            expect(host).toBeInstanceOf(Host);
        });
    });

    describe('start', () => {
        it('should start the host', async () => {
            const discoveryServiceType = 'p2p-chat';
            const username = 'testUser';
            const session = await P2PSession.create(discoveryServiceType);
            const host = new P2PHost(session);

            let mockDone = jest.fn();

            host.on('discovery-published', () => {
                mockDone();
            })

            await host.start();

            expect(mockDone).toHaveBeenCalled();

        });
    });

    describe('startP2PSession', () => {
        it('should return the neighbor status', async () => {
            const discoveryServiceType = 'p2p-chat';
            const username = 'testUser';
            const session = await P2PSession.create(discoveryServiceType);
            const host = new P2PHost(session);
            host.start();

            let client_sess = await P2PSession.create(discoveryServiceType, 'client');
            let client = new Client(client_sess);

            client.start();

            client.on('discovery-service-list-update', () => {
                client.connectSession('testUser', host.sessionPasscode);
            });
        

            jest.spyOn(CoordinatorServer.prototype, 'exportUsers').mockReturnValue(
            
                [{ 
                    userName: 'client', 
                    ip: '0.0.0.0', 
                    port: 8080, 
                    serverSessionKey: 'b755b5c7d88b44a6f8484fbb8b7e0b2402d3a3c0b7972b65e0893e75cf4a376' 
                }]
            
            );

            host.on('coordinator-connected', () => {
                host.startP2PSession();
            });

            host.on('session-started', () => {
                let neighbors = host.getNeighbors();
                expect(neighbors.length).toBe(1);
            });

        });
    });

    describe('getSessionPasscode', () => {
        it('should return the session passcode', async () => {
            const discoveryServiceType = 'p2p-chat';
            const username = 'testUser';
            const session = await P2PSession.create(discoveryServiceType);
            const host = new P2PHost(session);

            const passcode = host.sessionPasscode;

            expect(passcode).toBeDefined();
        });
    });

    describe('identifierString', () => {
        it('should return the identifier string', async () => {
            const discoveryServiceType = 'p2p-chat';
            const username = 'testUser';
            const session = await P2PSession.create(discoveryServiceType);
            const host = new P2PHost(session);

            const identifier = host.getIdentifier();

            expect(identifier).toBeDefined();
        });
    });
});