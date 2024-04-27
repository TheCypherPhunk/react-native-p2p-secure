
import { useCallback, useContext, useEffect, useState } from 'react';
import { GiftedChat } from 'react-native-gifted-chat';
import { 
    Alert,
    FlatList,
    Modal,
    SafeAreaView,
    StyleSheet,
    TouchableOpacity,
    View 
 } from 'react-native';
import { Text } from 'react-native';
import { P2PSessionContext, useP2PSessionContext } from '../P2PContexts';
import React from 'react';
import { HeaderBackButton } from '@react-navigation/elements';


export default function ChatScreen({route, navigation}: any) {

    const [modalVisible, setModalVisible] = useState(true);
    const [chatter, setChatter] = useState([]);
    const [users, setUsers] = useState<any>({});

    const sessionID: string = route.params.sessionID;
    const neighbors: string[] = route.params.neighbors;
    const nodeContext = useP2PSessionContext();

    const [neighborStatus, setNeighborStatus] = useState<[{username: string, status: string}]>(nodeContext.getNeighborStatus());

    function updateChatter(message: string, sender: string) {
        sender = sender.replace('-', ' ')
        //@ts-ignore
        function getIdFromName(name:string) {
            if(users[name] === undefined) {
                //assign user to id by length of users dict
                let n = Object.keys(users).length + 1;
                setUsers((users:any) => ({...users, [name]: n}));
                return n;
            } else {
                return users[name];
            }
        }
        // @ts-ignore
        setChatter(chatter => 
            GiftedChat.append( chatter, [{ _id: chatter.length.toString(), text: message, createdAt: new Date(), user: {_id: getIdFromName(sender),name: sender} }])
        );
    }

    useEffect(() => {
        nodeContext.onNodeEvent('node-message', (message:string, sender:string) => {
            console.log('message', message, 'sender', sender);
            updateChatter(sender, message);
        });
    
        nodeContext.onNodeEvent('node-disconnected', (username: string) => {
            console.log('Connection Closed', 'The connection to ' + username + ' has been closed. You will need to reconnect.');        
            setNeighborStatus(nodeContext.getNeighborStatus());
        });    

        nodeContext.onNodeEvent('node-connected', (username: string) => {
            console.log('Connection Open', 'The connection to ' + username + ' has been established.');
            setNeighborStatus(nodeContext.getNeighborStatus());
        });

        nodeContext.onNodeEvent('node-reconnected', (username: string) => {
            console.log('Connection Reopened', 'The connection to ' + username + ' has been reestablished.');
            setNeighborStatus(nodeContext.getNeighborStatus());
        });

    }, []);

    useEffect(() => {
        navigation.setOptions({
            headerRight: () => (
                <TouchableOpacity style={{marginRight: 10}} onPress={() => setModalVisible(true)}>
                    <Text>Neighbors</Text>
                </TouchableOpacity>
            ),
        });
        }, [navigation])

    useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
            e.preventDefault(); // Prevent default action
            unsubscribe() // Unsubscribe the event on first call to prevent infinite loop
            nodeContext.destroy();
            navigation.navigate('Home') // Navigate to your desired screen
        });
    }, [])

    const onSend = useCallback((messages = []) => {
        setChatter(previousMessages =>
        GiftedChat.append(previousMessages, messages),
        )
    }, [])

    function renderNeighborModal(){
        return(
            <Modal visible={modalVisible} animationType='slide' transparent={true} >
                <View style={styles.modalView}>
                    <TouchableOpacity style={{position:'absolute', margin: 15, top:0, right: 0}} onPress={() => {setModalVisible(false)}}>
                        <Text>x</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Neighbors</Text>
                    <View style={{flexDirection: 'row', justifyContent: 'center'}}>
                        <Text style={[styles.header, styles.columnText]}>Username</Text>
                        <Text style={[styles.header, styles.columnText]}>Status</Text>
                    </View>
                    <FlatList
                        data={neighborStatus}
                        renderItem={({item}) => (
                            <View style={{flexDirection: 'row', justifyContent: 'center'}}>
                                <Text style={[styles.columnText]}>{item.username}</Text>
                                <Text style={[styles.columnText]}>{item.status}</Text>
                            </View>
                        )}
                    />
                    {/* <TouchableOpacity style={styles.button} onPress={() => {nodeContext.reconnect()}}>
                        <Text style={{color: 'white'}}>Reconnect</Text>
                    </TouchableOpacity> */}
                </View>
            </Modal>
        )
    }

    return (
        <SafeAreaView style={styles.container}>
            {modalVisible? renderNeighborModal() : null}
            <View style={{flex: 3}}>
                <GiftedChat
                    messages={chatter}
                    //@ts-ignore
                    onSend={chatter => { onSend(chatter); nodeContext.broadcastMessage(chatter[0].text); }}
                    user={{
                        _id: 0,
                        name: sessionID?.replace('-', ' ')
                    }}
                    renderUsernameOnMessage={true}
                    showAvatarForEveryMessage={true}
                />
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
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
    title: {textAlign: 'center', fontSize: 30, fontWeight: 'bold', marginBottom: 20},
    button: {
        backgroundColor: 'blue',
        alignItems: 'center',
        padding: 10,
        borderRadius: 10,
        marginTop: 20,
    },
    header: {
        fontSize: 20,
        fontWeight: 'bold',
        textAlign: 'left'
    },
    columnText: {
        marginLeft: 15,
        marginRight: 15,
    }
});