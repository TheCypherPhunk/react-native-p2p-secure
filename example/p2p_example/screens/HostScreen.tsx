import { useCallback, useEffect, useRef, useState, useContext } from 'react'
import {
  Platform,
  StyleSheet,
  TouchableOpacity,
  Text,
  SafeAreaView,
  FlatList,
  View,
  RefreshControl,
  TextInput,
  ScrollView,
  Modal,
  Button,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { P2PSession, P2PHost } from 'react-native-p2p-secure'
import { CodeField, Cursor, useBlurOnFulfill, useClearByFocusCell } from 'react-native-confirmation-code-field';
import { P2PSessionContext } from '../P2PContexts';
import React from 'react';



export default function HostScreen({route, navigation}: any) {

    const [server, setServer] = useState<P2PHost>(null!);
    const [loading, setLoading] = useState(true);

    const [sessionPass, setSessionPass] = useState<string | null>(null);
    const [sessionID, setSessionID] = useState<string | null>(null);
    const [connectedNeighbors, setConnectedNeighbors] = useState<{username: string, connected: boolean, connecting: boolean, disconnected: boolean}[]>([]);
    const [nodeNeighbors, setNodeNeighbors] = useState<string[]>([]); 
    const [clientMessage, setClientMessage] = useState('');

    const CELL_COUNT = 6;

    const [value, setValue] = useState('');
    const ref = useBlurOnFulfill({value, cellCount: CELL_COUNT});
    const [props, getCellOnLayoutHandler] = useClearByFocusCell({
        value,
        setValue,
    });

    const [_, setNodeContext] : [any, any] = useContext(P2PSessionContext);

    useEffect(() => {
            P2PSession.create('p2pcomms').then((session) => {
                let server = new P2PHost(session)
                setServer(server);
                setSessionPass(server.sessionPasscode);
                setSessionID(server.getIdentifier());
                
                server.on('coordinator-connected', (neighbor) => {
                    setConnectedNeighbors(connectedNeighbors => connectedNeighbors.map(n => {
                        if (n.username === neighbor) {
                            return {...n, connected: true, connecting: false}
                        }
                        return n;
                    }));
                    console.log('connectedNeighbors', connectedNeighbors);
                });
                server.on('coordinator-disconnected', (neighbor) => {
                    setConnectedNeighbors(connectedNeighbors => connectedNeighbors.map(n => {
                        if (n.username === neighbor) {
                            return {...n, disconnected: true}
                            }
                            return n;
                    }));
                    console.log('coordinator-disconnected', neighbor);
                });
                server.on('coordinator-reconnected', (neighbor) => {
                    setConnectedNeighbors(connectedNeighbors => connectedNeighbors.map(n => {
                        if (n.username === neighbor) {
                            return {...n, disconnected: false}
                        }
                        return n;
                    }));
                    console.log('coordinator-reconnected', neighbor);
                });
                server.on('coordinator-connection-start', (neighbor) => {
                    setConnectedNeighbors(connectedNeighbors => connectedNeighbors.filter(n => n.username !== neighbor));
                    setConnectedNeighbors(connectedNeighbors => [...connectedNeighbors, {username: neighbor, connected: false, connecting: true, disconnected: false}]);
                    console.log('coordinator-connection-start', neighbor);
                });
                server.on('coordinator-connection-fail', (neighbor, error) => {
                    setConnectedNeighbors(connectedNeighbors => connectedNeighbors.filter(n => n.username !== neighbor));
                    console.log('coordinator-connection-fail', neighbor, error);
                    Alert.alert('Connection to ' + neighbor + ' failed.', error);
                });
                server.on('session-started', () => {
                    setNodeContext(server);
                    navigation.replace('Chat', {sessionID, neighbors: nodeNeighbors});
                });
                server.start();
                setLoading(false);
            }).catch((error: string | undefined) => {
                Alert.alert('Error', error);
            });
    }, []);    

    return(
        <SafeAreaView style={styles.container}>
        {
             loading ?
             <View style={styles.loadingContainer}>
                 <ActivityIndicator size="large" color="#000000" />
                 <Text style={styles.loadingText}>Loading...</Text>
             </View>
             :
                <View style={styles.container}>
                    <View style={{flex:1, flexDirection: 'column'}}>
                        <View style={{flex: 2, flexDirection: 'row', borderBottomWidth: 1.5, borderColor: 'grey', alignItems:'center'}}>
                            <Text style={{flex: 2, textAlign: 'center', fontSize: 50, fontWeight: 'bold'}}>👤</Text>
                            <View style={{flex:10, flexDirection: 'row', alignItems: 'center'}}>
                                <View style={{flex: 1, flexDirection: 'column', alignItems:'flex-start'}}>
                                    <Text style={styles.idText}>Name: {sessionID}</Text>
                                    <Text style={styles.idText}>Code: {sessionPass}</Text>
                                </View>
                            </View>
                            <View style={{flex: 1, alignItems:'center', justifyContent:'flex-end'}}>
                                <ActivityIndicator size="small" color="#000000" />
                            </View>
                        </View>
                        <View style={{flex: 15}} >
                            <FlatList
                                data={connectedNeighbors}
                                renderItem={({item}) => (
                                <View style={[styles.listItem, {flexDirection: 'row', justifyContent: 'space-between'}]}>
                                    <Text style={styles.listItemText}>{item.username}</Text>
                                    {
                                        item.disconnected?
                                            <Text>❌</Text>
                                        :
                                        item.connecting?
                                            <ActivityIndicator size="small" color="#000000" />
                                        : item.connected?
                                            <Text>✅</Text>
                                        : <Text>❌</Text>
                                    }
                                </View>
                                    )}
                                keyExtractor={item => item.username}
                                extraData={connectedNeighbors}
                            />
                        </View>
                        <View style={{flex: 1, justifyContent: 'flex-start'}}>
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
                        </View>
                    </View>
                </View>                
        }   
        </SafeAreaView>
        
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        fontSize: 25,
        fontWeight: 'bold',
        textAlign: 'center',
        marginTop: 50,
    },
    modalView: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'white',
        borderRadius: 20,
        width: '100%',
        height: '100%',
    },
    closeModalX: {
        fontSize: 25,
        fontWeight: 'bold',
        textAlign: 'right',
        marginRight: 20,
        marginTop: 20,
    },
    input: {
        height: 40,
        margin: 12,
        borderWidth: 1,
        padding: 10,
    },
    loadingText: {
        fontSize: 20,
        textAlign: 'center',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    idText: {
        textAlign: 'center',
        fontSize: 20,
        fontWeight: 'bold',
        textTransform: 'capitalize'
    },
    listItem: {
        borderBottomWidth: 0.5,
        borderColor: 'grey',
        padding: 10,
        marginHorizontal: 10,
    },
    listItemText: {
        padding: 5,
        fontSize: 15,
        textTransform: 'capitalize'
    }
})