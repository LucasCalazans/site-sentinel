import { describe, expect, it } from 'vitest';
import { HEADER_B64URL, signJwt, verifyJwt } from './jwt.ts';
import { b64urlDecode, b64urlEncode } from './encoding.ts';

const KEY = 'test-signing-key-pra-testes-apenas';

describe('signJwt', () => {
    it('produz JWT com 3 partes separadas por .', async () => {
        const token = await signJwt({ sub: 'admin' }, KEY, 3600);
        expect(token.split('.')).toHaveLength(3);
    });

    it('header é sempre o fixo HS256', async () => {
        const token = await signJwt({ sub: 'admin' }, KEY, 60);
        expect(token.split('.')[0]).toBe(HEADER_B64URL);
    });

    it('inclui iat e exp no payload', async () => {
        const now = 1_700_000_000;
        const token = await signJwt({ sub: 'admin' }, KEY, 3600, now);
        const payloadB64 = token.split('.')[1] ?? '';
        const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as Record<string, unknown>;
        expect(payload.sub).toBe('admin');
        expect(payload.iat).toBe(now);
        expect(payload.exp).toBe(now + 3600);
    });

    it('rejeita signingKey vazia', async () => {
        await expect(signJwt({ sub: 'admin' }, '', 60)).rejects.toThrow(/signingKey/);
    });

    it('rejeita expiry <= 0', async () => {
        await expect(signJwt({ sub: 'admin' }, KEY, 0)).rejects.toThrow(/expirySeconds/);
        await expect(signJwt({ sub: 'admin' }, KEY, -1)).rejects.toThrow(/expirySeconds/);
    });
});

describe('verifyJwt', () => {
    it('verifica token recém-assinado e retorna payload', async () => {
        const now = 1_700_000_000;
        const token = await signJwt({ sub: 'admin' }, KEY, 3600, now);
        const payload = await verifyJwt(token, KEY, now);
        expect(payload).not.toBeNull();
        expect(payload?.sub).toBe('admin');
        expect(payload?.iat).toBe(now);
        expect(payload?.exp).toBe(now + 3600);
    });

    it('retorna null pra token vazio', async () => {
        expect(await verifyJwt('', KEY)).toBeNull();
    });

    it('retorna null pra signingKey vazia', async () => {
        const token = await signJwt({ sub: 'admin' }, KEY, 60);
        expect(await verifyJwt(token, '')).toBeNull();
    });

    it('retorna null pra token sem 3 partes', async () => {
        expect(await verifyJwt('header.payload', KEY)).toBeNull();
        expect(await verifyJwt('a.b.c.d', KEY)).toBeNull();
    });

    it('retorna null pra parts vazias entre os pontos', async () => {
        expect(await verifyJwt('..', KEY)).toBeNull();
        expect(await verifyJwt(`${HEADER_B64URL}..sig`, KEY)).toBeNull();
    });

    it('retorna null pra header diferente (rejeita alg confusion)', async () => {
        // Header com alg:none — algoritmo proibido.
        const noneHeader = b64urlEncode(
            new TextEncoder().encode(JSON.stringify({ alg: 'none', typ: 'JWT' })),
        );
        const payload = b64urlEncode(
            new TextEncoder().encode(JSON.stringify({ sub: 'attacker', iat: 1, exp: 9999999999 })),
        );
        const forged = `${noneHeader}.${payload}.`;
        expect(await verifyJwt(forged, KEY)).toBeNull();
    });

    it('retorna null pra signature inválida', async () => {
        const token = await signJwt({ sub: 'admin' }, KEY, 60);
        // Tamper signature: muda o último byte.
        const parts = token.split('.');
        const sig = parts[2] ?? '';
        const tamperedSig = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A');
        const tampered = `${parts[0]}.${parts[1]}.${tamperedSig}`;
        expect(await verifyJwt(tampered, KEY)).toBeNull();
    });

    it('retorna null com signingKey diferente da que assinou', async () => {
        const token = await signJwt({ sub: 'admin' }, KEY, 60);
        expect(await verifyJwt(token, 'outra-key-completamente-diferente')).toBeNull();
    });

    it('retorna null pra token expirado', async () => {
        const past = 1_700_000_000;
        const token = await signJwt({ sub: 'admin' }, KEY, 60, past);
        // 1h depois do iat — exp era past+60.
        expect(await verifyJwt(token, KEY, past + 3600)).toBeNull();
    });

    it('retorna null pra token no exato segundo do expiry (exclusivo)', async () => {
        const t0 = 1_700_000_000;
        const token = await signJwt({ sub: 'admin' }, KEY, 60, t0);
        expect(await verifyJwt(token, KEY, t0 + 60)).toBeNull();
    });

    it('retorna null pra payload sem claims obrigatórias', async () => {
        // Forja payload sem sub.
        const badPayload = b64urlEncode(
            new TextEncoder().encode(JSON.stringify({ iat: 1, exp: 9999999999 })),
        );
        // Assina o badPayload com KEY pra a signature passar e a verificação falhar
        // só nos claims.
        const signingInput = `${HEADER_B64URL}.${badPayload}`;
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(KEY),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign'],
        );
        const sigBuf = await crypto.subtle.sign('HMAC', keyMaterial, new TextEncoder().encode(signingInput));
        const sigB64 = b64urlEncode(new Uint8Array(sigBuf));
        expect(await verifyJwt(`${signingInput}.${sigB64}`, KEY)).toBeNull();
    });

    it('retorna null pra payload JSON inválido', async () => {
        const badPayload = b64urlEncode(new TextEncoder().encode('not-json-at-all'));
        const signingInput = `${HEADER_B64URL}.${badPayload}`;
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(KEY),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign'],
        );
        const sigBuf = await crypto.subtle.sign('HMAC', keyMaterial, new TextEncoder().encode(signingInput));
        const sigB64 = b64urlEncode(new Uint8Array(sigBuf));
        expect(await verifyJwt(`${signingInput}.${sigB64}`, KEY)).toBeNull();
    });

    it('retorna null pra signature com base64 inválido', async () => {
        const token = await signJwt({ sub: 'admin' }, KEY, 60);
        const parts = token.split('.');
        // '!!!!' não é base64url decodável.
        const broken = `${parts[0]}.${parts[1]}.!!!!`;
        expect(await verifyJwt(broken, KEY)).toBeNull();
    });
});
