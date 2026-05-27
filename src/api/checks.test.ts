import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureSchema, resetDataTables } from '../test-helpers.ts';
import { createCheck as dbCreate } from '../db/checks.ts';
import {
    checkToWire,
    createCheckHandler,
    deleteCheckHandler,
    getCheckHandler,
    listChecksHandler,
    updateCheckHandler,
} from './checks.ts';
import type { Env } from './env.ts';

let db: D1Database;

beforeAll(async () => {
    db = await ensureSchema();
});

beforeEach(async () => {
    await resetDataTables(db);
});

function mkUrl(path: string): URL {
    return new URL(`https://x.test${path}`);
}

const baseCreate = {
    name: 'h.test',
    type: 'performance',
    config: { targets: [{ url: 'https://a.com', warnMs: 1000, criticalMs: 5000 }] },
    cron_pattern: '*/5 * * * *',
    app_label: 'test',
};

describe('checkToWire', () => {
    it('parsea config_json', async () => {
        const row = await dbCreate(db, {
            name: 'w',
            type: 'performance',
            config: { x: 1 },
            cron_pattern: '*/5 * * * *',
            app_label: 't',
        });
        const wire = checkToWire(row);
        expect(wire.config).toEqual({ x: 1 });
        expect(wire.enabled).toBe(true);
    });

    it('lida com config_json corrompido', () => {
        const row = {
            id: 1,
            name: 'bad',
            type: 'performance' as const,
            config_json: 'not-json',
            enabled: 1 as const,
            cron_pattern: '*/5 * * * *',
            app_label: 't',
            created_at: 0,
            updated_at: 0,
        };
        const wire = checkToWire(row);
        expect(wire.config).toMatchObject({ _error: expect.any(String) });
    });
});

describe('listChecksHandler', () => {
    it('lista todos sem filtro', async () => {
        await dbCreate(db, { ...baseCreate, name: 'a' });
        await dbCreate(db, { ...baseCreate, name: 'b' });
        const resp = await listChecksHandler({
            req: new Request('https://x.test/api/checks'),
            env: env as Env,
            params: {},
            url: mkUrl('/api/checks'),
        });
        const body = (await resp.json()) as { checks: Array<{ name: string }> };
        expect(body.checks.map((c) => c.name)).toEqual(['a', 'b']);
    });

    it('filtra por app via ?app=', async () => {
        await dbCreate(db, { ...baseCreate, name: 'a1', app_label: 'sonda' });
        await dbCreate(db, { ...baseCreate, name: 'a2', app_label: 'other' });
        const resp = await listChecksHandler({
            req: new Request('https://x.test/api/checks?app=sonda'),
            env: env as Env,
            params: {},
            url: mkUrl('/api/checks?app=sonda'),
        });
        const body = (await resp.json()) as { checks: Array<{ name: string }> };
        expect(body.checks).toHaveLength(1);
        expect(body.checks[0]?.name).toBe('a1');
    });
});

describe('getCheckHandler', () => {
    it('retorna check existente', async () => {
        const row = await dbCreate(db, baseCreate);
        const resp = await getCheckHandler({
            req: new Request('https://x.test'),
            env: env as Env,
            params: { id: String(row.id) },
            url: mkUrl(`/api/checks/${row.id}`),
        });
        expect(resp.status).toBe(200);
        const body = (await resp.json()) as { check: { id: number } };
        expect(body.check.id).toBe(row.id);
    });

    it('404 pra id inexistente', async () => {
        const resp = await getCheckHandler({
            req: new Request('https://x.test'),
            env: env as Env,
            params: { id: '99999' },
            url: mkUrl('/api/checks/99999'),
        });
        expect(resp.status).toBe(404);
    });

    it('400 pra id inválido', async () => {
        const resp = await getCheckHandler({
            req: new Request('https://x.test'),
            env: env as Env,
            params: { id: 'abc' },
            url: mkUrl('/api/checks/abc'),
        });
        expect(resp.status).toBe(400);
    });

    it('400 pra id <= 0', async () => {
        const resp = await getCheckHandler({
            req: new Request('https://x.test'),
            env: env as Env,
            params: { id: '0' },
            url: mkUrl('/api/checks/0'),
        });
        expect(resp.status).toBe(400);
    });
});

describe('createCheckHandler', () => {
    function postBody(body: unknown): Request {
        return new Request('https://x.test/api/checks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    it('201 quando válido', async () => {
        const resp = await createCheckHandler({
            req: postBody(baseCreate),
            env: env as Env,
            params: {},
            url: mkUrl('/api/checks'),
        });
        expect(resp.status).toBe(201);
        const body = (await resp.json()) as { check: { id: number } };
        expect(body.check.id).toBeGreaterThan(0);
    });

    it('400 pra body não-JSON', async () => {
        const req = new Request('https://x.test/api/checks', {
            method: 'POST',
            body: 'not-json',
        });
        const resp = await createCheckHandler({
            req,
            env: env as Env,
            params: {},
            url: mkUrl('/api/checks'),
        });
        expect(resp.status).toBe(400);
    });

    it('400 quando payload inválido', async () => {
        const resp = await createCheckHandler({
            req: postBody({ name: '', type: 'x' }),
            env: env as Env,
            params: {},
            url: mkUrl('/api/checks'),
        });
        expect(resp.status).toBe(400);
    });

    it('409 quando name duplicado', async () => {
        await createCheckHandler({
            req: postBody(baseCreate),
            env: env as Env,
            params: {},
            url: mkUrl('/api/checks'),
        });
        const resp = await createCheckHandler({
            req: postBody(baseCreate),
            env: env as Env,
            params: {},
            url: mkUrl('/api/checks'),
        });
        expect(resp.status).toBe(409);
    });
});

describe('updateCheckHandler', () => {
    function putBody(body: unknown): Request {
        return new Request('https://x.test', {
            method: 'PUT',
            body: JSON.stringify(body),
        });
    }

    it('200 com update parcial', async () => {
        const row = await dbCreate(db, baseCreate);
        const resp = await updateCheckHandler({
            req: putBody({ enabled: false }),
            env: env as Env,
            params: { id: String(row.id) },
            url: mkUrl(`/api/checks/${row.id}`),
        });
        expect(resp.status).toBe(200);
        const body = (await resp.json()) as { check: { enabled: boolean } };
        expect(body.check.enabled).toBe(false);
    });

    it('404 pra id inexistente', async () => {
        const resp = await updateCheckHandler({
            req: putBody({ enabled: false }),
            env: env as Env,
            params: { id: '99999' },
            url: mkUrl('/api/checks/99999'),
        });
        expect(resp.status).toBe(404);
    });

    it('400 pra id inválido', async () => {
        const resp = await updateCheckHandler({
            req: putBody({ enabled: false }),
            env: env as Env,
            params: { id: 'x' },
            url: mkUrl('/api/checks/x'),
        });
        expect(resp.status).toBe(400);
    });

    it('400 pra body não-JSON', async () => {
        const row = await dbCreate(db, baseCreate);
        const resp = await updateCheckHandler({
            req: new Request('https://x.test', { method: 'PUT', body: 'invalid' }),
            env: env as Env,
            params: { id: String(row.id) },
            url: mkUrl(`/api/checks/${row.id}`),
        });
        expect(resp.status).toBe(400);
    });

    it('400 pra payload com campo inválido', async () => {
        const row = await dbCreate(db, baseCreate);
        const resp = await updateCheckHandler({
            req: putBody({ type: 'unknown' }),
            env: env as Env,
            params: { id: String(row.id) },
            url: mkUrl(`/api/checks/${row.id}`),
        });
        expect(resp.status).toBe(400);
    });

    it('409 quando rename pra name existente', async () => {
        await dbCreate(db, { ...baseCreate, name: 'occupied' });
        const row = await dbCreate(db, { ...baseCreate, name: 'free' });
        const resp = await updateCheckHandler({
            req: putBody({ name: 'occupied' }),
            env: env as Env,
            params: { id: String(row.id) },
            url: mkUrl(`/api/checks/${row.id}`),
        });
        expect(resp.status).toBe(409);
    });
});

describe('deleteCheckHandler', () => {
    it('200 quando apaga', async () => {
        const row = await dbCreate(db, baseCreate);
        const resp = await deleteCheckHandler({
            req: new Request('https://x.test', { method: 'DELETE' }),
            env: env as Env,
            params: { id: String(row.id) },
            url: mkUrl(`/api/checks/${row.id}`),
        });
        expect(resp.status).toBe(200);
    });

    it('404 quando não existe', async () => {
        const resp = await deleteCheckHandler({
            req: new Request('https://x.test', { method: 'DELETE' }),
            env: env as Env,
            params: { id: '99999' },
            url: mkUrl('/api/checks/99999'),
        });
        expect(resp.status).toBe(404);
    });

    it('400 pra id inválido', async () => {
        const resp = await deleteCheckHandler({
            req: new Request('https://x.test', { method: 'DELETE' }),
            env: env as Env,
            params: { id: 'abc' },
            url: mkUrl('/api/checks/abc'),
        });
        expect(resp.status).toBe(400);
    });
});
