import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureSchema, resetDataTables } from '../test-helpers.ts';
import { signJwt } from '../auth/jwt.ts';
import { handleRequest, isPublicPath } from './handler.ts';
import type { Env } from './env.ts';

let db: D1Database;
let token: string;

beforeAll(async () => {
    db = await ensureSchema();
    token = await signJwt({ sub: 'admin' }, env.JWT_SIGNING_KEY, 3600);
});

beforeEach(async () => {
    await resetDataTables(db);
});

function req(method: string, path: string, opts: { auth?: boolean; body?: unknown; origin?: string } = {}): Request {
    const headers: Record<string, string> = {};
    if (opts.auth) headers.Authorization = `Bearer ${token}`;
    if (opts.body) headers['Content-Type'] = 'application/json';
    if (opts.origin) headers.Origin = opts.origin;
    return new Request(`https://api.test${path}`, {
        method,
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
}

describe('handleRequest — public routes', () => {
    it('GET / responde 200 com metadata', async () => {
        const resp = await handleRequest(req('GET', '/'), env as Env);
        expect(resp.status).toBe(200);
        const body = (await resp.json()) as { name: string };
        expect(body.name).toBe('site-sentinel');
    });

    it('GET /api/health responde 200 com db ok', async () => {
        const resp = await handleRequest(req('GET', '/api/health'), env as Env);
        expect(resp.status).toBe(200);
        const body = (await resp.json()) as { ok: boolean; db: boolean };
        expect(body.ok).toBe(true);
        expect(body.db).toBe(true);
    });

    it('OPTIONS responde 204 com CORS headers', async () => {
        const resp = await handleRequest(
            req('OPTIONS', '/api/checks', { origin: 'http://localhost:5173' }),
            env as Env,
        );
        expect(resp.status).toBe(204);
        expect(resp.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    });

    it('GET / sem origin reconhecido — CORS sem Allow-Origin', async () => {
        const resp = await handleRequest(
            req('GET', '/', { origin: 'https://evil.com' }),
            env as Env,
        );
        expect(resp.status).toBe(200);
        expect(resp.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
});

describe('handleRequest — auth', () => {
    it('rota privada sem Authorization → 401', async () => {
        const resp = await handleRequest(req('GET', '/api/checks'), env as Env);
        expect(resp.status).toBe(401);
    });

    it('rota privada com token válido → 200', async () => {
        const resp = await handleRequest(
            req('GET', '/api/checks', { auth: true }),
            env as Env,
        );
        expect(resp.status).toBe(200);
    });

    it('rota privada com token inválido → 401', async () => {
        const r = new Request('https://api.test/api/checks', {
            headers: { Authorization: 'Bearer garbage.token.here' },
        });
        const resp = await handleRequest(r, env as Env);
        expect(resp.status).toBe(401);
    });
});

describe('handleRequest — routing', () => {
    it('404 pra rota /api/* não-mapeada', async () => {
        const resp = await handleRequest(
            req('GET', '/api/unknown', { auth: true }),
            env as Env,
        );
        expect(resp.status).toBe(404);
    });

    it('404 pra rota fora de /api/', async () => {
        const resp = await handleRequest(req('GET', '/static.html'), env as Env);
        expect(resp.status).toBe(404);
    });
});

describe('handleRequest — error path', () => {
    it('500 quando handler lança erro inesperado', async () => {
        // POST /api/checks com payload válido mas vamos quebrar D1 temporariamente
        // simulando: nada, vamos só forçar um erro via env corrompido.
        const brokenEnv = { ...env, DB: undefined as unknown as D1Database } as Env;
        const resp = await handleRequest(
            req('GET', '/api/checks', { auth: true }),
            brokenEnv,
        );
        expect(resp.status).toBe(500);
    });
});

describe('isPublicPath', () => {
    it('reconhece /api/login, /, /api/health', () => {
        expect(isPublicPath('/api/login')).toBe(true);
        expect(isPublicPath('/')).toBe(true);
        expect(isPublicPath('/api/health')).toBe(true);
    });

    it('não reconhece outros paths', () => {
        expect(isPublicPath('/api/checks')).toBe(false);
        expect(isPublicPath('/anywhere')).toBe(false);
    });
});
