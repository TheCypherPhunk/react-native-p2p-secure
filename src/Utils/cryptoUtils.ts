import forge from './forge'

export type DecryptionResult = {
    message: string | null,
    status: 'success' | 'error',
    error: null | string
}

export type EncryptionResult = {    
    message: string | null,
    status: 'success' | 'error',
    error: null | string
}

export class CryptoUtils {
    public static aesDecrypt(keyHex: string, iv: string, encryptedData: string): DecryptionResult {
        let key = Uint8Array.from(Buffer.from(keyHex, 'hex'));
        let decipher = forge.cipher.createDecipher('AES-CBC', forge.util.createBuffer(key));
        decipher.start({iv: iv});
        decipher.update(forge.util.createBuffer(encryptedData));
        let result = decipher.finish()
        let decryptionResult: DecryptionResult;
        if(!result) {
            console.log('[CryptoUtils] could not decrypt data');
            decryptionResult = {
                message: null,
                status: 'error',
                error: 'Could not decrypt data'
            }
        } else {
            decryptionResult = {
                message: decipher.output.data,
                status: 'success',
                error: null
            }
        }
        return decryptionResult;
    }

    public static aesEncrypt(keyHex: string, iv: string, data: string): EncryptionResult {
        let key = Uint8Array.from(Buffer.from(keyHex, 'hex'));
        let cipher = forge.cipher.createCipher('AES-CBC', forge.util.createBuffer(key));
        cipher.start({iv: iv});
        cipher.update(forge.util.createBuffer(data));
        let result = cipher.finish()
        let encryptionResult: EncryptionResult;
        if(!result) {
            console.log('[CryptoUtils] could not encrypt session data');
            encryptionResult = {
                message: null,
                status: 'error',
                error: 'Could not encrypt data'
            }
        } else {
            encryptionResult = {
                message: cipher.output.getBytes(),
                status: 'success',
                error: null
            }
        }
        return encryptionResult;
    }
}