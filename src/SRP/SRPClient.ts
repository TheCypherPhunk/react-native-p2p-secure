import srp from 'secure-remote-password/client';

export type SRPRegistrationData = {
    username: string,
    salt: string,
    clientEphemeralPublic: string
}

/**
 * The SRPClient class represents a client-side implementation of the Secure Remote Password (SRP) protocol.
 * It provides methods for registration, login, session key derivation, and session verification.
 * This class can be used to securely authenticate and communicate with a server using SRP.
 */
export class SRPClient {
    private username: string;
    private password: string;
    private salt: string;
    private clientEphemeral: srp.Ephemeral;
    private privateKey: string;
    private clientSession: srp.Session | null;

    /**
     * Creates an instance of the SRPClient class.
     * @param username - The username of the client.
     * @param password - The password of the client.
     */
    constructor(username: string, password: string) {
        this.username = username;
        this.password = password;
        this.salt = srp.generateSalt();
        this.privateKey = srp.derivePrivateKey(this.salt, this.username, this.password);
        this.clientEphemeral = srp.generateEphemeral();
        this.clientSession = null;

        // console.log('[SRPClient] username: ', this.username);
        // console.log('[SRPClient] salt: ', this.salt);
        // console.log('[SRPClient] privateKey: ', this.privateKey);
        // console.log('[SRPClient] clientEphemeral: ', this.clientEphemeral);
        // console.log('[SRPClient] password: ', this.password)
    }

    /**
     * Retrieves the registration and login data required for the client to authenticate with the server.
     * @returns An object containing the username, salt, and client ephemeral public key.
     */
    public getRegistrationAndLoginData(): SRPRegistrationData {
        return {
            username: this.username,
            salt: this.salt,
            clientEphemeralPublic: this.clientEphemeral.public
        };
    }

    /**
     * Derives the session key using the server's ephemeral public key.
     * @param serverEphemeralPublic - The server's ephemeral public key.
     * @returns The session key derived from the client's ephemeral secret and the server's public key.
     */
    public deriveSessionKey(serverEphemeralPublic: string): string {
        this.clientSession = srp.deriveSession(this.clientEphemeral.secret, serverEphemeralPublic, this.salt, this.username, this.privateKey);
        // console.log('[SRPClient] derived session key: ', this.clientSession?.key);
        return this.clientSession?.proof;
    }

    /**
     * Verifies the session by comparing the server's session proof with the client's session.
     * @param serverSessionProof - The server's session proof.
     * @returns A boolean indicating whether the session is valid (true) or not (false).
     */
    public verifySession(serverSessionProof: string): boolean {
        try {
            srp.verifySession(this.clientEphemeral.public, this.clientSession as srp.Session, serverSessionProof);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Retrieves the session key used for encrypting and decrypting messages.
     * @returns The session key.
     */
    public getSessionKey(): string | undefined {
        return this.clientSession?.key;
    }
}

