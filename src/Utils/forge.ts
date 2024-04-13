import forge from 'node-forge';
import modPow from 'react-native-modpow';

forge.jsbn.BigInteger.prototype.modPow = function nativeModPow(e, m) {
    const result = modPow({
        target: this.toString(16),
        value: e.toString(16),
        modifier: m.toString(16)
    })

    return new forge.jsbn.BigInteger(result, 16)
}

export default forge;