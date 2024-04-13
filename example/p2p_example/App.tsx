import { NavigationContainer, NavigationProp } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  Text,
  View,
  Button,
  StyleSheet,
} from "react-native";
import React, { useState } from 'react';
import HostScreen from "./screens/HostScreen";
import JoinScreen from "./screens/JoinScreen";
import ChatScreen from "./screens/ChatPage";
import { NodeContext } from "./P2PContexts";
import { P2PNode } from "react-native-secure-p2p";

function HomeScreen({navigation}: {navigation: NavigationProp<any>}) {
  return (
    <View style={styles.container}>
      <View style={styles.button}>
        <Button title="Host Session" onPress={() => navigation.navigate('Host Session')} />
      </View>
      <View style={styles.button}>
        <Button title="Join Session" onPress={() => navigation.navigate('Join Sessions')} />
      </View>
    </View>
  );
}
const Stack = createNativeStackNavigator();
export default function App() {
  const [nodeContext, setNodeContext] = useState(null as unknown as P2PNode);
  return (
    <NodeContext.Provider value={[nodeContext, setNodeContext]}>
      <NavigationContainer>
      <Stack.Navigator>
          {/*Define our routes*/}
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Host Session" component={HostScreen} />
          <Stack.Screen name="Join Sessions" component={JoinScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </NodeContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  button: {
    marginTop: 20,
  },
})