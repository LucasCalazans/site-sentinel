import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { hashPassword } from '../auth/password.ts';
import { verifyJwt } from '../auth/jwt.ts';
import { loginHandler } from './login.ts';
import type { Env } from './env.ts';

const TEST_PASSWORD = 'admin-test-password';

async function mkEnvWithPassword(password: string): Promise<Env> {
    return {
        ...env,
        ADMIN_PASSWORD_HASH: await hashPassword(password, 1000),
    } as Env;
}

function postJson(body: unknown): Request {
    return new Request('https://x.test/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function postRaw(raw: string): Request {
    return new Request('https://x.test/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: raw,
    });
}

describe('loginHandler', () => {
    it('200 + token quando password correta', async () => {
        const e = await mkEnvWithPassword(TEST_PASSWORD);
        const resp = await loginHandler({
            req: postJson({ password: TEST_PASSWORD }),
            env: e,
            params: {},
            url: new URL('https://x.test/api/login'),
        });
        expect(resp.status).toBe(200);
        const body = (await resp.json()) as { token: string; expiresInSec: number };
        expect(typeof body.token).toBe('string');
        expect(body.expiresInSec).toBeGreaterThan(0);

        // Token deve ser válido com a signing key.
        const payload = await verifyJwt(body.token, e.JWT_SIGNING_KEY);
        expect(payload?.sub).toBe('admin');
    });

    it('respeita JWT_EXPIRY_DAYS', async () => {
        const e = { ...(await mkEnvWithPassword(TEST_PASSWORD)), JWT_EXPIRY_DAYS: '3' };
        const resp = await loginHandler({
            req: postJson({ password: TEST_PASSWORD }),
            env: e,
            params: {},
            url: new URL('https://x.test/api/login'),
        });
        const body = (await resp.json()) as { expiresInSec: number };
        expect(body.expiresInSec).toBe(3 * 86400);
    });

    it('usa default 7 dias quando JWT_EXPIRY_DAYS inválido', async () => {
        const e = { ...(await mkEnvWithPassword(TEST_PASSWORD)), JWT_EXPIRY_DAYS: 'abc' };
        const resp = await loginHandler({
            req: postJson({ password: TEST_PASSWORD }),
            env: e,
            params: {},
            url: new URL('https://x.test/api/login'),
        });
        const body = (await resp.json()) as { expiresInSec: number };
        expect(body.expiresInSec).toBe(7 * 86400);
    });

    it('usa default 7 dias quando JWT_EXPIRY_DAYS vazio', async () => {
        const e = { ...(await mkEnvWithPassword(TEST_PASSWORD)), JWT_EXPIRY_DAYS: '' };
        const resp = await loginHandler({
            req: postJson({ password: TEST_PASSWORD }),
            env: e,
            params: {},
            url: new URL('https://x.test/api/login'),
        });
        const body = (await resp.json()) as { expiresInSec: number };
        expect(body.expiresInSec).toBe(7 * 86400);
    });

    it('401 quando password errada', async () => {
        const e = await mkEnvWithPassword(TEST_PASSWORD);
        const resp = await loginHandler({
            req: postJson({ password: 'errada' }),
            env: e,
            params: {},
            url: new URL('https://x.test/api/login'),
        });
        expect(resp.status).toBe(401);
    });

    it('400 quando body não é JSON', async () => {
        const e = await mkEnvWithPassword(TEST_PASSWORD);
        const resp = await loginHandler({
            req: postRaw('not-json'),
            env: e,
            params: {},
            url: new URL('https://x.test/api/login'),
        });
        expect(resp.status).toBe(400);
    });

    it('400 quando password ausente', async () => {
        const e = await mkEnvWithPassword(TEST_PASSWORD);
        const resp = await loginHandler({
            req: postJson({ other: 'x' }),
            env: e,
            params: {},
            url: new URL('https://x.test/api/login'),
        });
        expect(resp.status).toBe(400);
    });

    it('400 quando password é string vazia', async () => {
        const e = await mkEnvWithPassword(TEST_PASSWORD);
        const resp = await loginHandler({
            req: postJson({ password: '' }),
            env: e,
            params: {},
            url: new URL('https://x.test/api/login'),
        });
        expect(resp.status).toBe(400);
    });

    it('400 quando password não é string', async () => {
        const e = await mkEnvWithPassword(TEST_PASSWORD);
        const resp = await loginHandler({
            req: postJson({ password: 123 }),
            env: e,
            params: {},
            url: new URL('https://x.test/api/login'),
        });
        expect(resp.status).toBe(400);
    });
});
