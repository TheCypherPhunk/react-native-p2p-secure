# react-native-p2p-secure

The first secure multipeer library to enable p2p communication between Android/iOS devices over WLAN or mobile hotspot for React Native.

## Installation

This package is a JavaScript (TypeScript) library which utilizes established react-native modules to effectively create a secure p2p communication network between N peers. Given the nature of this library (seeing that it does not implement native code), the following are identified as peer dependencies needed to be installed alongside this package to properly function:

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
    ...,
    "postinstall": "./node_modules/.bin/rn-nodeify --install stream,buffer,crypto --hack"
  },
```
The following steps are installation requirements for React Native >= 0.60:  
### Android Platform:

  Modify your **`android/build.gradle`** configuration to match `minSdkVersion = 21` for react-native-tcp-socket support:
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

    In your `info.plist` add the following strings:

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

## Usage

Import the library:

```js
import {P2PHost, P2PClient, Node, P2PSessionType} from 'react-native-p2p-secure';
```

Client Example:

```js
const [client, setClient] = useState<P2PClient | null>(null);
const [sessionPass, setSessionPass] = useState<string | null>(null);
const [sessionID, setSessionID] = useState<string | null>(null);

useEffect(() => {
    //myservice is the name of the service setup in info.plist in the iOS platform installation step
    P2PClient.create('myservice').then((session) => { 
        setClient(session);
        setSessionPass(session.sessionPasscode);
        setSessionID(session.identifierString);

        session.on('discovery-service-list-update', (updatedSessions) => {// to capture changes in active sessions during discovery
            console.log('sessions', updatedSessions);
        })
        session.on('session-started', () => {// emitted when the host starts the p2p session
            console.log('session started');
        });
        session.on('coordinator-error', (error) => {// emitted when an error occurs during connection before the p2p session starts. This usually captures authentication, collision, and any other errors happening during the connection phase before the p2p session starts.
            console.log('Error connecting to session', error);
        });
        session.on('coordinator-disconnected', () => {// emitted when the host disconnects from the session before starting the p2p session
            console.log('Disconnected from coordinator');
        });
        session.on('coordinator-authenticated', () => { // emitted when the client successfully authenticates with the host
            console.log('Authenticated with coordinator');
        });
        session.start(); // starts the discovery process
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

Host Example:

```jsx
const [server, setServer] = useState<P2PHost | null>(null);
const [sessionPass, setSessionPass] = useState<string | null>(null);
const [sessionID, setSessionID] = useState<string | null>(null);
useEffect(() => {
    P2PHost.create('myservice').then((session) => {
        setServer(session);
        setSessionPass(session.sessionPasscode);
        setSessionID(session.identifierString);

        session.on('coordinator-connected', (neighbor) => { // emitted when a client successfully connects to the host
            console.log('connected to', neighbor);
        });
        session.on('coordinator-disconnected', (neighbor) => { // emitted when a client disconnects from the host after authentication but before the p2p session starts
            console.log('disconnected from', neighbor);
        });
        session.on('coordinator-reconnected', (neighbor) => { // emitted when a client reconnects to the host after disconnection
            console.log('reconnected to', neighbor);
        });
        session.on('coordinator-connection-start', (neighbor) => { // emitted when a client starts connecting to the host
            console.log('connecting to', neighbor);
        });
        session.on('coordinator-connection-fail', (neighbor, error) => { // emitted when a client fails to connect to the host
            console.log('failed to connect to', neighbor, error);
        });
        session.on('session-started', () => { // emitted when the host starts the p2p session
            console.log('session started');
        });
        session.start(); // starts advertising the service to be discovered by clients
    });
}, []);
```
```jsx
server.startP2PSession().then(() => { // starts the p2p session
    console.log('p2p session started');
})            
```
For a functional example, see the [example](./example/p2p_example/screens/HostScreen.tsx) in the example folder.

Once the p2p session has been successfully created, the host and clients can communicate with each other. At this point, the host and clients can create a Node object to communicate with each other. The Node object is created using the `getNode()` method on the P2PHost or P2PClient object. Below is an example on how to use the Node object to communicate with other nodes in the network:

```js
let nodeContext = server.getNode(); // server is the P2PHost object
```
or
```js
let nodeContext = client.getNode(); // client is the P2PClient object
```
Then:
```jsx
useEffect(() => {
    nodeContext.on('message', (message:string, sender:string) => { // listens for messages from other nodes
        console.log('message', message, 'sender', sender);
    });

    nodeContext.on('disconnected', (username: string) => { // listens for disconnections from other nodes
        console.log('Connection Closed', 'The connection to ' + username + ' has been closed.');        
    });    

    nodeContext.on('connected', (username: string) => { // listens for connections to other nodes
        console.log('Connection Open', 'The connection to ' + username + ' has been established.');
    });

    nodeContext.on('reconnected', (username: string) => { // listens for reconnections to other nodes
        console.log('Connection Reopened', 'The connection to ' + username + ' has been reestablished.');
    });
}, []);
```
```jsx
nodeContext.sendMessage('Hello You!'); // sends a message to all connected nodes
nodeContext.broadcastMessage('Hello World!'); // sends a message to all connected nodes except the sender
```

For a functional example, see the [example](./example/p2p_example/screens/ChatScreen.tsx) in the example folder.

## API
There are three main imports from this library:

### P2PHost
This is the class that should be used in the scenario where the user hosts a session.


### P2PClient
THis is the class...

### Node
This is the class

```jsx
P2PHost.create('p2pcomms').then((session) => {
                setServer(session);
                setSessionPass(session.sessionPasscode);
                setSessionID(session.identifierString);
                
                session.on('coordinator-connected', (neighbor) => {
                    setConnectedNeighbors(connectedNeighbors => connectedNeighbors.map(n => {
                        if (n.username === neighbor) {
                            return {...n, connected: true, connecting: false}
                        }
                        return n;
                    }));
                    console.log('connectedNeighbors', connectedNeighbors);
                });
                session.on('coordinator-disconnected', (neighbor) => {
                    setConnectedNeighbors(connectedNeighbors => connectedNeighbors.map(n => {
                        if (n.username === neighbor) {
                            return {...n, disconnected: true}
                            }
                            return n;
                    }));
                    console.log('coordinator-disconnected', neighbor);
                });
                session.on('coordinator-reconnected', (neighbor) => {
                    setConnectedNeighbors(connectedNeighbors => connectedNeighbors.map(n => {
                        if (n.username === neighbor) {
                            return {...n, disconnected: false}
                        }
                        return n;
                    }));
                    console.log('coordinator-reconnected', neighbor);
                });
                session.on('coordinator-connection-start', (neighbor) => {
                    setConnectedNeighbors(connectedNeighbors => connectedNeighbors.filter(n => n.username !== neighbor));
                    setConnectedNeighbors(connectedNeighbors => [...connectedNeighbors, {username: neighbor, connected: false, connecting: true, disconnected: false}]);
                    console.log('coordinator-connection-start', neighbor);
                });
                session.on('coordinator-connection-fail', (neighbor, error) => {
                    setConnectedNeighbors(connectedNeighbors => connectedNeighbors.filter(n => n.username !== neighbor));
                    console.log('coordinator-connection-fail', neighbor, error);
                    Alert.alert('Connection to ' + neighbor + ' failed.', error);
                });
                session.on('session-started', () => {
                    setNodeContext(session.getNode());
                    navigation.navigate('Chat', {sessionID, neighbors: nodeNeighbors});
                });
                session.start();
                setLoading(false);
            }).catch((error: string | undefined) => {
                Alert.alert('Error', error);
            });

            <Button
                title="Start Session"
                onPress={() => {
                    setLoading(true);
                    server.startP2PSession().then(()=>{
                        setLoading(false);
                        setNodeNeighbors(server.getNeighbors());                                        
                    });
                }}
            />
```

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT
