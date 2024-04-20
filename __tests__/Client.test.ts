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
        };
    });
});
let testSession = {
    name: 'TestSession',
    port: 8080,
    address: 'localhost',
};
import { DiscoveryClient } from '../src/Discovery';
import { Client } from '../src/P2PSession/Client';
import { CoordinatorClient } from '../src/Coordinator';
import { mock, instance, when, anything, verify } from 'ts-mockito';
import * as protocolHelpers from '../src/Utils/protocolHelpers';

describe('Client', () => {
    let mockDiscoveryClient: DiscoveryClient;
    let mockCoordinatorClient: CoordinatorClient;

    beforeEach(() => {
        mockDiscoveryClient = mock(DiscoveryClient);
        mockCoordinatorClient = mock(CoordinatorClient);
    });

    describe('create', () => {
        it('should create a new Client instance', async () => {
            const discoveryServiceType = 'p2p-chat';
            const username = 'testUser';
            const nodePort = 8080;

            const client = await Client.create(discoveryServiceType, username);

            expect(client).toBeInstanceOf(Client);
        });

        it('should throw an error if there is an error getting an open port', async () => {
            const discoveryServiceType = 'p2p-chat';
            const username = 'testUser';
            // Mock the getTCPOpenPort function to throw an error
            const getTCPOpenPortMock = jest.fn().mockImplementation(() => {
                throw new Error('Error getting open port');
            });

            // Replace the real getTCPOpenPort function with the mock
            jest.spyOn(protocolHelpers, 'getTCPOpenPort').mockImplementation(getTCPOpenPortMock);

            await expect(Client.create(discoveryServiceType, username)).rejects.toThrow('Error getting open port');

            // Restore the real getTCPOpenPort function after the test
            jest.spyOn(protocolHelpers, 'getTCPOpenPort').mockRestore();
        });
    });

    describe('start', () => {
        it('should start the discovery service', async () => {
            const client = await Client.create('p2p-chat', 'testUser');
            let mockDone = jest.fn();

            client.on('discovery-start', () => {
                //pass test
                mockDone();
            });
            client.start();

            expect(mockDone).toHaveBeenCalled();
        });
    });

    describe('connectSession', () => {
        it('should resolve', async () => {
            jest.spyOn(DiscoveryClient.prototype, 'getActiveServices').mockReturnValue([testSession])
            jest.spyOn(CoordinatorClient.prototype, 'start').mockResolvedValue(
                {
                    info: {
                    userName: 'fakeUser',
                    ip: '192.168.1.134',
                    port: 3245
                    },
                    key: 'b755b5c7d88b44a6f8484fbb8b7e0b2402d3a3c0b7972b65e0893e75cf4a376'
                }
            )
            const sessionName = testSession.name;
            const password = '123456';
            const client = await Client.create('p2p-chat', 'testUser');

            //expecting that the call is resolved
            await expect(client.connectSession(sessionName, password)).resolves.toBeUndefined();
        });
    });
});