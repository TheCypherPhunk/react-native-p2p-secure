import { SRPRegistrationData } from '../SRP'

export type SRPClientHandshake_1 = {
    type: 'srp-handshake_1',
    payload: SRPRegistrationData
}

export type SRPClientHandshake_2 = {
    type: 'srp-handshake_2',
    payload: {
        sessionProof: string,
        username: string
        nodePort: number
    }
}

export type SRPServerHandshake_1 = {
    type: 'srp-handshake_1',
    payload: {
        serverEphermalKey: string,
    } | null
    status: 'success' | 'error'
    error: string | null
}

export type SRPServerHandshake_2 = {
    type: 'srp-handshake_2',
    payload: {
        iv: string,
        encrypted: string,
        serverProof: string
    } | null
    status: 'success' | 'error'
    error: string | null
}

export type SRPHandshakeEncryptedPayload = {
    userName: string,
    ip: string,
    port: number
}

export type SRPHandshakeResult = {
    info: SRPHandshakeEncryptedPayload,
    key: string
}
