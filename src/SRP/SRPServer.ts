import srp from 'secure-remote-password/server'
import srpclient from 'secure-remote-password/client'

interface User {
    salt: string;
    verifier: string;
    clientPublicEphermal: string;
    serverEphermal: srp.Ephemeral;
    serverSession: srp.Session | null;
}

type UserRecord = {
    [username: string]: User
}   

/**
 * The SRPServer class provides functionality for server-side operations in the Secure Remote Password (SRP) protocol.
 * It allows users to register, login, derive session keys, and export user information.
 * 
 * @remarks
 * The SRPServer class relies on the SRP client library for cryptographic operations.
 * 
 * @public
 */
class SRPServer { 
    private userDB: UserRecord;
    private password: string;

    /**
     * Creates an instance of SRPServer.
     * 
     * @param password - The password used for user authentication.
     */
    constructor(password: string) {
        this.userDB = {};
        this.password = password;
    }

    /**
     * Retrieves the SRP user record for the specified username.
     * 
     * @param username - The username of the SRP user.
     * @returns The SRP user record, or undefined if the user does not exist.
     */
    public getSRPUser(username: string): User {
        return this.userDB[username];
    }

    /**
     * Registers a new user and performs login using the SRP protocol.
     * 
     * @param username - The username of the user to register.
     * @param salt - The salt value used for user authentication.
     * @param clientEphermalKey - The client's ephemeral key.
     * @returns The server's ephemeral key, or false if the user already exists.
     */
    public registerAndLogin(username: string, salt: string, clientEphermalKey: string): string | false {
        let userPrivateKey = srpclient.derivePrivateKey(salt, username, this.password);
        let verifier = srpclient.deriveVerifier(userPrivateKey);
        let serverEphermal = srp.generateEphemeral(verifier);
        this.userDB[username] = { salt: salt, verifier: verifier, clientPublicEphermal: clientEphermalKey, serverEphermal: serverEphermal, serverSession: null };
        return serverEphermal.public;
    }

    /**
     * Derives the session key and verifies the client's proof in the SRP protocol.
     * 
     * @param username - The username of the user.
     * @param clientProof - The client's proof.
     * @returns The server's session proof, or false if the user does not exist or the verification fails.
     */
    public deriveKeyAndVerifyClient(username: string, clientProof: string): string | false {
        // console.log('[SRPServer] deriveKeyAndVerifyClient - ', 'User DB: ', JSON.stringify(this.userDB))
        let user = this.userDB[username];
        if (!user) return false;
        // console.log('[SRPServer] deriveKeyAndVerifyClient - ', 'Client Proof: ', clientProof)
        // console.log('[SRPServer] deriveKeyAndVerifyClient - ', 'Client Public: ', user.clientPublicEphermal)
        // console.log('[SRPServer] deriveKeyAndVerifyClient - ', 'Salt: ', user.salt)
        // console.log('[SRPServer] deriveKeyAndVerifyClient - ', 'Username: ', username)
        // console.log('[SRPServer] deriveKeyAndVerifyClient - ', 'Verifier: ', user.verifier)
        // console.log('[SRPServer] deriveKeyAndVerifyClient - ', 'Server Private: ', user.serverEphermal.secret)
        try {
            let serverSession = srp.deriveSession(user.serverEphermal.secret, user.clientPublicEphermal, user.salt, username, user.verifier, clientProof);
            this.userDB[username].serverSession = serverSession;
            // console.log('[SRPServer] deriveKeyAndVerifyClient - ', 'Server Session Proof: ', serverSession.proof)
            return serverSession.proof;
        } catch (error) {
            // console.log('[SRPServer] deriveKeyAndVerifyClient - ', error);
            return false;
        }
    }

    /**
     * Retrieves the session key for the specified user.
     * 
     * @param username - The username of the user.
     * @returns The session key, or false if the user does not exist.
     */
    public getSessionKey(username: string): string | undefined | false {
        let user = this.userDB[username];
        if (!user) return false;
        return user.serverSession?.key;
    }

    /**
     * Exports the user information, including the username and server session key, for all registered users.
     * 
     * @returns An array of user objects containing the username and server session key.
     */
    public exportUsers(): { username: string, serverSessionKey?: string }[] {
        return Array.from(Object.entries(this.userDB)).map(([username, user]) => {
            return {
                username: username,
                serverSessionKey: user.serverSession?.key
            };
        });
    }
}


export default SRPServer;