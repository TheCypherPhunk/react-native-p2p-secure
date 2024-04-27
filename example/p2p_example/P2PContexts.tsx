import { createContext, useContext } from 'react';
import { P2PSession } from 'react-native-p2p-secure'

const P2PSessionContext = createContext<[P2PSession|null, (value: P2PSession) => void]>([null, (value:P2PSession) => {}]);

const useP2PSessionContext = () => {
    const [currentP2PSessionContext, _] = useContext(P2PSessionContext);
    if(!currentP2PSessionContext) {
        throw new Error('p2pSessionContext must be used within a p2pSessionProvider');
    }
    return currentP2PSessionContext;
}

export { P2PSessionContext as P2PSessionContext, useP2PSessionContext as useP2PSessionContext};

