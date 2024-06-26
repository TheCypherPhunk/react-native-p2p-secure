# react-native-p2p-secure

The first secure multipeer library to enable p2p communication between Android/iOS devices over WLAN or mobile hotspot for React Native. It allows you to create a secure peer-to-peer network between multiple devices, enabling them to communicate with each other securely. The library uses the Zeroconf protocol for peer discovery and the Secure Remote Password (SRP) protocol for secure authentication between peers. Once authenticated, the library establishes a secure peer-to-peer network between the devices, allowing them to communicate securely with each other.

## Table of Contents
- [How this works (in a nutshell)](#how-this-works-in-a-nutshell)
- [Installation](#installation)
    - [Android Platform](#android-platform)
    - [iOS Platform](#ios-platform)
- [Usage](#usage)
    - [Client Example](#client-example)
    - [Host Example](#host-example)
    - [P2PSession Example](#P2PSession-example)
- [API](#api)
    - [P2PHost](#p2phost)
    - [P2PClient](#p2pclient)
    - [P2PSession](#P2PSession)
- [Contributing](#contributing)
- [License](#license)

## How this works (in a nutshell)

 The network initially starts off with a client-server model with one device acting as a session host and the rest of the devices are clients who are actively looking for a session to join. Following the client-server model:
 - The server is the P2P session host. The host in this case is the device that advertises itself to the rest of the network using the Zeroconf protocol. 
 - The client(s) in this scenario are the devices that are looking to join a hosted session. The clients in this case are the devices that are scanning for advertised Zeroconf services.

Upon client discovery:
- Clients will have the option to attempt to connect to the discovered hosts. Given that this library was built to communicate highly confidential information, a password based authentication mechanism is required to authenticate clients by the host.
- The host will have a secure random 6 digit pin generated. This should be displayed to the host user so it can be communicated offline to the authorized clients. Effectively, this library should be used when users of the network (the humans operating it) are in close proximity to share the passcode offline.
- Clients will then attempt to connect to the host over TLS and communicate the required 6 digit pin. At this point the [Secure Remote Password](http://srp.stanford.edu/) (SRP) protocol is used to authenticate the clients and avoid any potential network attacks on the session. Communication from then on after will be secured using the SRP session keys.

Upon authentication:
- The client will wait for the host to start the actual peer-to-peer session where each device is a node in the network connected each node is connected to all other nodes.
- The host will mark authenticated clients as so and add each of these clients to a neighbors list it will share once the user decides to start off the proper peer-to-peer network.

Upon p2p session start:
- The host shares the neighbors list with all the clients.
- Upon receiving the list, each client will establish a connection with the rest of the neighbors.

From then on after, nodes are able to communicate securely with each other.

## Installation

This package is a pure TypeScript library which utilizes established react-native modules to effectively create a secure p2p communication network between N peers. Given the nature of this library (seeing that it does not implement native code), the following are identified as peer dependencies needed to be installed alongside this package to properly function:

 - [react-native-zeroconf](https://github.com/balthazar/react-native-zeroconf): which is a [Zeroconf](https://en.wikipedia.org/wiki/Zero-configuration_networking) protocol implementation for React Native to allow for peer discovery over the network.
 - [react-native-tcp-socket](https://github.com/Rapsssito/react-native-tcp-socket): to allow for communication between peers after discovery.
 - [react-native-crypto](https://github.com/tradle/react-native-crypto): to enable cryptographic operations for peer authentication and communication encryption.
 - [react-native-randombytes](https://github.com/mvayngrib/react-native-randombytes): as a peer dependency for react-native-crypto. Allows for secure random number generation in React Native.
 - [react-native-modpow](https://github.com/seald/react-native-modpow): A native implemetation of the modpow operation which is used when the [node-forge](https://github.com/digitalbazaar/forge) library generates ephermal RSA keys for communication encryption.

To install the peer dependencies required of this package alongside the package itself:
```sh
npm install react-native-zeroconf react-native-tcp-socket react-native-crypto react-native-randombytes react-native-modpow react-native-p2p-secure
```

This package utilizes react-native-crypto to enable cryptographic operations for TLS connectivity, RSA key generation, SRP operations, and others. The crypto library requires rn-nodeify to work properly:

```sh
npm install --save-dev rn-nodeify
```

It is recommended to add the following command to the `scripts` object in `package.json` for better maintainence. However, running it once after installing rn-nodeify should be okay. In the case node_modules is deleted and restored again through an `npm install`, you will need to run the command again. This is mainly why it is recommended:

```json
  "scripts": {
    "postinstall": "./node_modules/.bin/rn-nodeify --install stream,buffer,crypto --hack"
  },
```
The following steps are installation requirements for React Native >= 0.60:  
### Android Platform:

  Modify your **`android/build.gradle`** configuration to be `minSdkVersion = 21` or more for react-native-tcp-socket support:
  ```
  buildscript {
    ext {
      ...
      minSdkVersion = 21
      ...
    }
  ```
  Please ensure your `AndroidManifest.xml` (uder `android/app/src/debug/` and `android/app/src/main/`) is requesting all necessary permissions for react-native-zeroconf discovery services.
    ```xml
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
    <uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE" />
    ```
    Note: TXT records (which are a requirement for the discovery mechanism) are available on Android >= 7.

### iOS Platform:

    For discovery on iOS 14+, you will be required to specify the discovery services you want to scan for and a description for what you're using them.

    In your `ios/{project_name}/info.plist` add the following strings:

    ```xml
    <key>NSBonjourServices</key>
        <array>
            <string>_my_service._tcp.</string>
        </array>
    <key>NSLocalNetworkUsageDescription</key>
    <string>Describe why you want to use local network discovery here</string>
    ```
    Replace `my_service` above as per your preference. It is recommended to have it as a unique name, such as the name of the app you are building as it will be later used to identify the service name you will be advertising/discovering.

    Finally, the following command is used to install the pods required by the peer dependencies for iOS:
    ```sh
    cd ios && pod install && cd ..
    ```

## Usage

Import the library:

```js
import {P2PHost, P2PClient, P2PSession} from 'react-native-p2p-secure';
```

### Client Example:

```js
const [client, setClient] = useState<P2PClient | null>(null);
const [sessionPass, setSessionPass] = useState<string | null>(null);
const [sessionID, setSessionID] = useState<string | null>(null);

useEffect(() => {
    //myservice is the name of the service setup in info.plist in the iOS platform installation step
    P2PSession.create('myservice').then((session) => { 
        let client = new P2PClient(session);
        setClient(client);
        setSessionPass(client.sessionPasscode);
        setSessionID(client.getIdentifier();

        client.on('discovery-service-list-update', (updatedSessions) => {// to capture changes in active sessions during discovery
            console.log('sessions', updatedSessions);
        })
        client.on('session-started', () => {// emitted when the host starts the p2p session
            console.log('session started');
        });
        client.on('coordinator-error', (error) => {// emitted when an error occurs during connection before the p2p session starts. This usually captures authentication, collision, and any other errors happening during the connection phase before the p2p session starts.
            console.log('Error connecting to session', error);
        });
        client.on('coordinator-disconnected', () => {// emitted when the host disconnects from the session before starting the p2p session
            console.log('Disconnected from coordinator');
        });
        client.on('coordinator-authenticated', () => { // emitted when the client successfully authenticates with the host
            console.log('Authenticated with coordinator');
        });
        client.start(); // starts the discovery process
    });
}, []);
```
```jsx
let sessionConnectingTo = 'sessionID'; // the sessionID of the session you want to connect to
let pin = '123456' // the pin generated by the host
client.connectSession(sessionConnectingTo as string, pin).then(() => { // attempts to connect to the session
    console.log('Connected to session');
})
```
For a functional example, see the [example](./example/p2p_example/screens/JoinScreen.tsx) in the example folder.

### Host Example:

```jsx
const [server, setServer] = useState<P2PHost | null>(null);
const [sessionPass, setSessionPass] = useState<string | null>(null);
const [sessionID, setSessionID] = useState<string | null>(null);
useEffect(() => {
    P2PSession.create('myservice').then((session) => {
        let server = new P2PHost(session);
        setServer(server);
        setSessionPass(server.getSessionPasscode());
        setSessionID(server.identifierString);

        server.on('coordinator-connected', (neighbor) => { // emitted when a client successfully connects to the host
            console.log('connected to', neighbor);
        });
        server.on('coordinator-disconnected', (neighbor) => { // emitted when a client disconnects from the host after authentication but before the p2p session starts
            console.log('disconnected from', neighbor);
        });
        server.on('coordinator-reconnected', (neighbor) => { // emitted when a client reconnects to the host after disconnection
            console.log('reconnected to', neighbor);
        });
        server.on('coordinator-connection-start', (neighbor) => { // emitted when a client starts connecting to the host
            console.log('connecting to', neighbor);
        });
        server.on('coordinator-connection-fail', (neighbor, error) => { // emitted when a client fails to connect to the host
            console.log('failed to connect to', neighbor, error);
        });
        server.on('session-started', () => { // emitted when the host starts the p2p session
            console.log('session started');
        });
        server.start(); // starts advertising the service to be discovered by clients
    });
}, []);
```
```jsx
server.startP2PSession().then(() => { // starts the p2p session
    console.log('p2p session started');
})            
```
For a functional example, see the [example](./example/p2p_example/screens/HostScreen.tsx) in the example folder.

### P2PSession Example:
Once the p2p session has been successfully created, the host and clients can communicate with each other. At this point, the host and clients can can be casted to their shared base class `P2PSession` for more straighfoward usage. For example:

```js
let node = server as P2PSession; // server is the P2PHost object
```
or
```js
let node = client as P2PSession; // client is the P2PClient object
```
Then:
```jsx
const [chatter, setChatter] = useState([]);
const [neighborStatus, setNeighborStatus] = useState<[{username: string, status: string}]>(p2pSessionContext.getNeighborStatus());

useEffect(() => {
    p2pSessionContext.onNodeEvent('node-message', (message:string, sender:string) => {
        console.log('message', message, 'sender', sender);
        updateChatter(sender, message);
    });

    p2pSessionContext.onNodeEvent('node-disconnected', (username: string) => {
        console.log('Connection Closed', 'The connection to ' + username + ' has been closed. You will need to reconnect.');        
        setNeighborStatus(p2pSessionContext.getNeighborStatus());
    });    

    p2pSessionContext.onNodeEvent('node-connected', (username: string) => {
        console.log('Connection Open', 'The connection to ' + username + ' has been established.');
        setNeighborStatus(p2pSessionContext.getNeighborStatus());
    });

    p2pSessionContext.onNodeEvent('node-reconnected', (username: string) => {
        console.log('Connection Reopened', 'The connection to ' + username + ' has been reestablished.');
        setNeighborStatus(p2pSessionContext.getNeighborStatus());
    });

}, []);
```
```jsx
node.sendMessage('Hello You!'); // sends a message to all connected nodes
node.broadcastMessage('Hello World!'); // sends a message to all connected nodes except the sender
```

For a functional example, see the [example](./example/p2p_example/screens/ChatScreen.tsx) in the example folder. This example uses context to share the node object between screens. See [P2PContext](./example/p2p_example/context/P2PContext.tsx) and [App.tsx](./example/p2p_example/App.tsx) for the context implementation.

## API

### P2PHost

### `P2PHost.create(discoveryServiceType: string, username?: string): Promise<P2PSession>`

Returns a Promise of a new instance of the `P2PSession` parent class. The `discoveryServiceType` parameter is the type of service that the host will be advertising during the discovery process. The `username` parameter is optional and is used to identify the host in the p2p network. 
- `discoveryServiceType`: should be the same as the string used in the `info.plist` file in the iOS platform installation step above.
- `username`: should be a unique string that identifies the host in the p2p network. If not provided, a random string will be generated.

Example:
```typescript
let session: P2PSession = await P2PSession.create('myservice');
let host = new P2PHost(session);
```
### `P2PHost.start(): void`
Starts the discovery service and begins advertising the service.

### `P2PHost.startP2PSession(): Promise<void>`
Starts the P2P session. Returns a promise that resolves when the session is started.

Example:
```typescript
await host.startP2PSession();
```

### `P2PHost.getNeighbors(): string[]`
Gets the neighbors of the host node in the active p2p network.

### `P2PHost.on(event: string, callback: (...args: any[]) => void): void`

Registers a listener function to be called when the specified event is emitted.

- `event`: The event to listen for.
- `callback`: A callback function to be called when the event is emitted.

Available events:

- `'session-started'`: Emitted when the p2p session is started.
- `'node-connected'`: Emitted when a neighbor node connects to the host in the p2p network.
- `'node-disconnected'`: Emitted when a neighbor node disconnects from the host in the p2p network.
- `'node-reconnected'`: Emitted when a neighbor node reconnects to the host in the p2p network.
- `'node-error'`: Emitted when an error occurs in the node.
- `'node-message'`: Emitted when a message is received from a neighbor node in the p2p network.
- `'coordinator-connection-start'`: Emitted when the coordinator server starts a connection attempt to a neighbor node.
- `'coordinator-connection-fail'`: Emitted when the coordinator server fails to connect to a neighbor node.
- `'coordinator-connected'`: Emitted when the coordinator server successfully connects to a neighbor node.
- `'coordinator-disconnected'`: Emitted when the coordinator server disconnects from a neighbor node.
- `'coordinator-reconnected'`: Emitted when the coordinator server reconnects to a neighbor node.
- `'discovery-published'`: Emitted when the discovery server publishes the service.
- `'discovery-unpublished'`: Emitted when the discovery server unpublishes the service.
- `'discovery-error'`: Emitted when an error occurs in the discovery server.

### `P2PHost.getSessionPasscode(): string`

Returns the passcode for the session. This passcode should be shared (offline) with clients to allow them to connect to the session.

Example:
```typescript
let passcode = host.sessionPasscode;
```

### `P2PHost.getIdentifier(): string`

Returns the identifier for the host. This is useful when the username is randomly generated.

### `P2PHost.destroy(): void`

Destroys the host instance. This method should be called when the host is no longer needed. After calling this method, the host instance should be discarded.

### P2PClient

### `P2PClient.create(discoveryServiceType: string, username?: string): Promise<P2PClient>`

Returns a Promise of a new instance of the `P2PSession` parent class. The `discoveryServiceType` parameter is the type of service that the client will be looking for during the discovery process. The `username` parameter is optional and is used to identify the client in the p2p network. 
- `discoveryServiceType`: should be the same as the string used in the `info.plist` file in the iOS platform installation step above.
- `username`: should be a unique string that identifies the client in the p2p network. If not provided, a random string will be generated.

Example:
```typescript
let session: P2PSession = await P2PClient.create('myservice');
let client = new P2PClient(session);
```

### `P2PClient.start(): void`

Starts the discovery service and begins scanning for available services.

### `P2PClient.connectSession(sessionName: string, password: string): Promise<void>`

Connects to a session with the specified name and password. Returns a promise that resolves when the connection is successful.

Example:
```typescript
await client.connectSession('p2p-chat', '123456');
```

### `P2PClient.getActiveSessions()`

Gets the active sessions.

Example:
```typescript
let sessions = client.getActiveSessions(); 
//sessions will look something like this: [{name: 'kuzuf-suduf', port: 1234, address: '192.15.35.2'}, ...]

```

### `P2PClient.getNeighbors(): string[]`

Gets the neighbors of the client node in the active p2p network.

### `P2PClient.on(event: string, callback: (...args: any[]) => void): void`

Registers a callback function to be called when a specific event occurs.

Available events:
- `session-started`: Emitted when the client successfully connects to a session.
- `node-connnected`: Emitted when a node connects.
- `node-disconnected`: Emitted when a node disconnects.
- `node-reconnected`: Emitted when a node reconnects.
- `node-error`: Emitted when an error occurs in a node.
- `node-message`: Emitted when a node sends a message.
- `discovery-start`: Emitted when the discovery service starts.
- `discovery-stop`: Emitted when the discovery service stops.
- `discovery-error`: Emitted when an error occurs in the discovery service.
- `discovery-service-list-update`: Emitted when the list of active sessions changes.
- `coordinator-connected`: Emitted when the client connects to the coordinator.
- `coordinator-authenticated`: Emitted when the client successfully authenticates with the coordinator.
- `coordinator-error`: Emitted when an error occurs in the coordinator.
- `coordinator-disconnected`: Emitted when the coordinator disconnects.

### `P2PClient.getIdentifier(): string`

Gets the username used to identify the client in the p2p network. Useful in cases when the username is randomly generated.

### `P2PClient.destroy(): void`

Destroys the client. This method should be called when the client is no longer needed. After calling this method, the client instance should be discarded.

### P2PSession
This is the base class for both `P2PHost` and `P2PClient`. It provides an easier interface for sending messages and managing connections in the p2p network.

To use this class, you can cast a `P2PHost` or `P2PClient` instance to a `P2PSession` instance:

```typescript
let node = host as P2PSession;
```
### `P2PSession.create(sessionType: string, sessionName?: string): Promise<P2PSession>`

Creates a new instance of the `P2PSession` class. The `sessionType` parameter is the type of session to create. The `sessionName` parameter is optional and is used to identify the session.

### `P2PSession.getNeighbors(): string[]`

Gets the neighbors of the node in the active p2p network.

### `P2PSession.getNeighborStatus(): [{username: string, status: string}]`

Gets a list of neighbors and their connection status.

### `P2PSession.onNodeEvent(event: string, callback: (...args: any[]) => void): void`

Registers a listener function to be called when the specified event is emitted. This may be considered to be a filtered version of the `on` method, filtering for events that are specific to the actual P2P communication session.

- `event`: The event to listen for.
- `callback`: A callback function to be called when the event is emitted.

Available events:
- `'session-started'`: Emitted when the p2p session is started.
- `'node-connected'`: Emitted when a neighbor node connects to the node in the p2p network.
- `'node-disconnected'`: Emitted when a neighbor node disconnects from the node in the p2p network.
- `'node-reconnected'`: Emitted when a neighbor node reconnects to the node in the p2p network.
- `'node-error'`: Emitted when an error occurs in the node.
- `'node-message'`: Emitted when a message is received from a neighbor node in the p2p network.

Example:

```typescript
node.on('node-connected', (nodeId) => {
  console.log(`Node ${nodeId} connected`);
});
```

### `P2PSession.sendMessage(message: string, receiver: string): void`

Sends a message to a specific neighbor node in the p2p network.

- `message`: The message to send.
- `receiver`: The identifier of the neighbor node to send the message to.

Example:

```typescript
node.sendMessage('Hello neighbor!', 'neighborId');
```

### `P2PSession.broadcastMessage(message: string): void`

Broadcasts a message to all neighbor nodes in the p2p network.

- `message`: The message to broadcast.

Example:

```typescript
node.broadcastMessage('Hello everyone!');
```

### `P2PSession.getIdentifier(): string`

Returns the identifier for the node.

### `P2PSession.setIdentifier(identifier: string): void`

Sets the identifier for the node.

### `P2PSession.destroy(): void`

Destroys the node instance. This method should be called when the node is no longer needed. After calling this method, the node instance should be discarded.

## Motivation

This library was motivated by supporting HRF Bounty #8 for creating an easier Multisig experience in an opensource BTC wallet. During research, no library supported creating a p2p multi-platform two-way communication layer between Android/iOS devices. Therefore, this package came to be as a complete solution to support the development of that bounty.

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT
