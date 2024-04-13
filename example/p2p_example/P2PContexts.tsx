import { createContext, useContext } from 'react';
import { P2PNode } from 'react-native-p2p-secure'

const NodeContext = createContext<[P2PNode|null, (value: P2PNode) => void]>([null, (value:P2PNode) => {}]);

const useNodeContext = () => {
    const [currentNodeContext, _] = useContext(NodeContext);
    if(!currentNodeContext) {
        throw new Error('NodeContext must be used within a NodeProvider');
    }
    return currentNodeContext;
}

export { NodeContext, useNodeContext};

