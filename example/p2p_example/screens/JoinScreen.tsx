import { useCallback, useContext, useEffect, useRef, useState } from 'react'
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
  Alert
} from 'react-native'
import { P2PClient, P2PSessionType } from 'react-native-p2p-secure'
import { CodeField, Cursor, useBlurOnFulfill, useClearByFocusCell } from 'react-native-confirmation-code-field';
import { NodeContext } from '../P2PContexts'
export default function JoinScreen({route, navigation}: any) {

    const [client, setClient] = useState<P2PClient>(null!); // Change type to Session
    const [loading, setLoading] = useState(true);
     
    const [sessions, setSessions] = useState<string[]>([]);

  
    const [sessionID, setSessionID] = useState<string | null>(null);
    const [sessionConnectingTo, setSessionConnectingTo] = useState<string | null>(null);

    const [joinModalVisible, setJoinModalVisible] = useState(false);
    const [connectedToSession, setConnectedToSession] = useState(false); 

    const [nodeNeighbors, setNodeNeighbors] = useState<string[]>([]); 
   
    const CELL_COUNT = 6;

    const [value, setValue] = useState('');
    const ref = useBlurOnFulfill({value, cellCount: CELL_COUNT});
    const [props, getCellOnLayoutHandler] = useClearByFocusCell({
        value,
        setValue,
    });
    const [_, setNodeContext] = useContext(NodeContext);
    const [disconnectedModalVisible, setDisconnectedModalVisible] = useState(false);

    useEffect(() => {
        P2PClient.create('p2pcomms').then((session) => {
            setClient(session);
            setSessionID(session.identifierString);

            session.on('discovery-service-list-update', (updatedSessions) => {
                console.log('sessions', updatedSessions);
                setSessions(sessions => [...updatedSessions.map((s: P2PSessionType) => s.name)]);
            })
            session.on('session-started', () => {
                setDisconnectedModalVisible(false);
                setLoading(true);
                navigation.navigate('Chat', {sessionID, neighbors: nodeNeighbors})
            });
            session.on('coordinator-error', (error) => {
                Alert.alert('Error', error);
                console.log('Error connecting to session', error);
                setLoading(false);
                setValue('')
            });
            session.on('coordinator-disconnected', () => {
                console.log('Disconnected from coordinator');
                setLoading(false);
                setDisconnectedModalVisible(true);
            });
            session.on('coordinator-authenticated', () => {
                console.log('Authenticated with coordinator');
            });
            session.start();
            setLoading(false);

        });

    }, []);
    
    function renderDisconnectedModal(){
        return(
            <Modal visible={disconnectedModalVisible} animationType='slide' transparent={true} >
                <View style={styles.modalView}>
                    <TouchableOpacity style={{position:'absolute', margin: 15, top:0, right: 0}} onPress={() => {setDisconnectedModalVisible(false)}}>
                        <Text>x</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>You have been disconnected from the session</Text>
                    
                    <TouchableOpacity style={styles.okayButton} onPress={() => setDisconnectedModalVisible(false)}>
                        <Text style={{color: 'white'}}>Okay</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        )
    }

    // module for modal with 6 digit code input, seperated
    function renderJoinSessionModal(){
        return(
            <Modal visible={joinModalVisible} animationType='slide' transparent={true} >
                <View style={styles.modalView}>
                    <TouchableOpacity style={{position:'absolute', margin: 15, top:0, right: 0}} onPress={() => {setJoinModalVisible(false)}}>
                        <Text>x</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Enter 6 Digit Session Code</Text>
                    <CodeField
                        ref={ref}
                        {...props}
                        caretHidden={false}
                        value={value}
                        onChangeText={setValue}
                        cellCount={CELL_COUNT}
                        rootStyle={styles.codeFieldRoot}
                        keyboardType="number-pad"
                        textContentType="oneTimeCode"
                        renderCell={({index, symbol, isFocused}) => (
                        <Text
                            key={index}
                            style={[styles.cell, isFocused && styles.focusCell]}
                            onLayout={getCellOnLayoutHandler(index)}>
                            {symbol || (isFocused ? <Cursor/> : null)}
                        </Text>
                        )}
                    />
                    <TouchableOpacity
                        style={styles.button}
                        onPress={() => {
                            setConnectedToSession(false);
                            setJoinModalVisible(false);
                            setLoading(true);
                            client.connectSession(sessionConnectingTo as string, value).then(() => {
                                console.log('Connected to session');
                                setNodeNeighbors(client.getNeighbors());
                                setConnectedToSession(true);

                                setNodeContext(client.getNode());
                            })
                        }}
                    >
                        <Text style={styles.buttonText}>Join Session</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        )
    }


    return(
        <SafeAreaView style={styles.container}>
            {
                loading ?
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#000000" />
                    {connectedToSession?<Text style={styles.loadingText}>Waiting for host to start session...</Text> : <Text style={styles.loadingText}>Loading...</Text>}
                </View>
                :
                <View style={styles.container}>
                    <View style={{flex:1, flexDirection: 'column'}}>
                        <View style={{flex: 2, flexDirection: 'row', borderBottomWidth: 1.5, borderColor: 'grey', alignItems:'center'}}>
                            <Text style={{flex: 2, textAlign: 'center', fontSize: 50, fontWeight: 'bold'}}>👤</Text>
                            <View style={{flex:10, flexDirection: 'row', alignItems: 'center'}}>
                                <Text style={styles.idText}>Name: {sessionID}</Text>
                            </View>
                            <View style={{flex: 1, alignItems:'center', justifyContent:'flex-end'}}>
                                <ActivityIndicator size="small" color="#000000" />
                            </View>
                        </View>
                        <View style={{flex: 15}} >
                            <FlatList
                                data={sessions}
                                renderItem={({item}) => 
                                <TouchableOpacity style={styles.listItem} onPress={()=>{setSessionConnectingTo(item); setJoinModalVisible(true)}}>
                                    <Text style={styles.listItemText}>{item}</Text>
                                </TouchableOpacity>
                                }
                                keyExtractor={item => item}
                                extraData={sessions}
                            />
                        </View>
                    </View>
                    {renderJoinSessionModal()}
                    {renderDisconnectedModal()}
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
    input: {
        height: 40,
        margin: 12,
        borderWidth: 1,
        padding: 10,
        alignSelf: 'center',
    },
    closeModalX: {
        fontSize: 25,
        fontWeight: 'bold',
        textAlign: 'right',
        marginRight: 20,
        marginTop: 20,
    },
    modalView: {
        top: '35%',
        marginHorizontal: 20,
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 35,
        shadowColor: '#000',
        shadowOffset: {
          width: 0,
          height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    closeButton: {
        position: "absolute",
        top: 10,
        right: 10
    },
    title: {textAlign: 'center', fontSize: 30},
    codeFieldRoot: {marginTop: 20},
    cell: {
        width: 40,
        height: 50,
        lineHeight: 45,
        fontSize: 24,
        borderWidth: 2,
        borderColor: '#00000030',
        textAlign: 'center',
        borderRadius: 10,
    },
    focusCell: {
        borderColor: '#000',
    },
    button: {
        alignSelf: 'center',
        marginTop: 20,
        backgroundColor: '#DDDDDD',
        padding: 10,
        borderRadius: 10,
    },
    okayButton: {
        backgroundColor: 'blue',
        alignItems: 'center',
        padding: 10,
        borderRadius: 10,
        marginTop: 20,
    },
    buttonText: {
        fontSize: 20,
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