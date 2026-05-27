// JWT HS256 sign + verify via WebCrypto. Sem dep externa.
//
// Header fixo: {"alg":"HS256","typ":"JWT"} — não suportamos negociação de
// algoritmo (evita confusion attack `alg: none`).

import { b64urlDecode, b64urlEncode, constantTimeEqual } from './encoding.ts';

// base64url de '{"alg":"HS256","typ":"JWT"}'.
export const HEADER_B64URL = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';

export interface JwtPayload {
    sub: string;
    iat: number;
    exp: number;
}

async function hmacSha256(key: string, data: string): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(key),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const sig = await crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        new TextEncoder().encode(data),
    );
    return new Uint8Array(sig);
}

export async function signJwt(
    payload: Omit<JwtPayload, 'iat' | 'exp'>,
    signingKey: string,
    expirySeconds: number,
    nowSec: number = Math.floor(Date.now() / 1000),
): Promise<string> {
    if (!signingKey) throw new Error('signingKey vazia');
    if (expirySeconds <= 0) throw new Error('expirySeconds deve ser > 0');
    const full: JwtPayload = {
        ...payload,
        iat: nowSec,
        exp: nowSec + expirySeconds,
    };
    const payloadB64 = b64urlEncode(
        new TextEncoder().encode(JSON.stringify(full)),
    );
    const signingInput = `${HEADER_B64URL}.${payloadB64}`;
    const sig = await hmacSha256(signingKey, signingInput);
    return `${signingInput}.${b64urlEncode(sig)}`;
}

export async function verifyJwt(
    token: string,
    signingKey: string,
    nowSec: number = Math.floor(Date.now() / 1000),
): Promise<JwtPayload | null> {
    if (!token || !signingKey) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    if (!h || !p || !s) return null;
    if (h !== HEADER_B64URL) return null;
    const signingInput = `${h}.${p}`;
    const expected = await hmacSha256(signingKey, signingInput);
    let actual: Uint8Array;
    try {
        actual = b64urlDecode(s);
    } catch {
        return null;
    }
    if (!constantTimeEqual(expected, actual)) return null;
    let raw: unknown;
    try {
        raw = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
    } catch {
        return null;
    }
    if (!raw || typeof raw !== 'object') return null;
    const candidate = raw as Record<string, unknown>;
    if (
        typeof candidate.sub !== 'string' ||
        typeof candidate.iat !== 'number' ||
        typeof candidate.exp !== 'number'
    ) {
        return null;
    }
    if (nowSec >= candidate.exp) return null;
    return {
        sub: candidate.sub,
        iat: candidate.iat,
        exp: candidate.exp,
    };
}
