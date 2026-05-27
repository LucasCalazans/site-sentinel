// PBKDF2-SHA256 password hashing via WebCrypto. Formato armazenado:
//   pbkdf2$<iterations>$<salt-b64url>$<hash-b64url>
// Compatível com o que scripts/hash-password.mjs gera.
//
// Iterações default = 100k. Em workerd ~50-100ms por verify, o que é OK pra
// admin login (rate limit natural). Pra workloads de auth de produto real
// (centenas de logins/seg) considerar Argon2 — mas pra password único de
// admin do dashboard, PBKDF2 é overkill safety + zero dependência.

import { b64urlDecode, b64urlEncode, constantTimeEqual } from './encoding.ts';

export const DEFAULT_PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

async function deriveBits(
    password: string,
    salt: Uint8Array,
    iterations: number,
): Promise<Uint8Array> {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
        keyMaterial,
        HASH_BYTES * 8,
    );
    return new Uint8Array(bits);
}

export async function hashPassword(
    password: string,
    iterations: number = DEFAULT_PBKDF2_ITERATIONS,
): Promise<string> {
    if (!password) throw new Error('password vazia');
    if (iterations < 1000) throw new Error('iterations < 1000 é inseguro');
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const hash = await deriveBits(password, salt, iterations);
    return `pbkdf2$${iterations}$${b64urlEncode(salt)}$${b64urlEncode(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    if (!password || !stored) return false;
    const parts = stored.split('$');
    if (parts.length !== 4) return false;
    const [scheme, iterStr, saltB64, hashB64] = parts;
    if (scheme !== 'pbkdf2') return false;
    if (!iterStr || !saltB64 || !hashB64) return false;
    const iterations = Number.parseInt(iterStr, 10);
    if (!Number.isFinite(iterations) || iterations < 1000) return false;
    let salt: Uint8Array;
    let expected: Uint8Array;
    try {
        salt = b64urlDecode(saltB64);
        expected = b64urlDecode(hashB64);
    } catch {
        return false;
    }
    const actual = await deriveBits(password, salt, iterations);
    return constantTimeEqual(actual, expected);
}
