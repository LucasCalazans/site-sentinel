import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureSchema, resetDataTables } from '../test-helpers.ts';
import { createCheck } from '../db/checks.ts';
import { insertRun } from '../db/runs.ts';
import {
    failingRunsHandler,
    latestRunsHandler,
    listRunsHandler,
    runToWire,
} from './runs.ts';
import type { Env } from './env.ts';

let db: D1Database;
let checkId: number;

beforeAll(async () => {
    db = await ensureSchema();
});

beforeEach(async () => {
    await resetDataTables(db);
    const c = await createCheck(db, {
        name: 'r.api',
        type: 'performance',
        config: {},
        cron_pattern: '*/5 * * * *',
        app_label: 'test',
    });
    checkId = c.id;
});

describe('runToWire', () => {
    it('parsea details_json', () => {
        const wire = runToWire({
            id: 1,
            check_id: 2,
            severity: 'ok',
            message: 'x',
            duration_ms: 10,
            details_json: '{"a":1}',
            ran_at: 100,
        });
        expect(wire.details).toEqual({ a: 1 });
    });

    it('details = null quando details_json é null', () => {
        const wire = runToWire({
            id: 1,
            check_id: 2,
            severity: 'ok',
            message: '',
            duration_ms: 1,
            details_json: null,
            ran_at: 0,
        });
        expect(wire.details).toBeNull();
    });

    it('details com _error quando JSON inválido', () => {
        const wire = runToWire({
            id: 1,
            check_id: 2,
            severity: 'ok',
            message: '',
            duration_ms: 1,
            details_json: 'not-json',
            ran_at: 0,
        });
        expect(wire.details).toMatchObject({ _error: expect.any(String) });
    });
});

function mkUrl(qs: string): URL {
    return new URL(`https://x.test/api/runs${qs}`);
}

describe('listRunsHandler', () => {
    it('400 sem check_id', async () => {
        const resp = await listRunsHandler({
            req: new Request('https://x.test/api/runs'),
            env: env as Env,
            params: {},
            url: mkUrl(''),
        });
        expect(resp.status).toBe(400);
    });

    it('400 com check_id não-numérico', async () => {
        const resp = await listRunsHandler({
            req: new Request('https://x.test/api/runs?check_id=abc'),
            env: env as Env,
            params: {},
            url: mkUrl('?check_id=abc'),
        });
        expect(resp.status).toBe(400);
    });

    it('400 com check_id <= 0', async () => {
        const resp = await listRunsHandler({
            req: new Request('https://x.test/api/runs?check_id=0'),
            env: env as Env,
            params: {},
            url: mkUrl('?check_id=0'),
        });
        expect(resp.status).toBe(400);
    });

    it('lista runs do check', async () => {
        await insertRun(db, {
            check_id: checkId,
            severity: 'ok',
            message: 'a',
            duration_ms: 1,
        });
        const resp = await listRunsHandler({
            req: new Request(`https://x.test/api/runs?check_id=${checkId}`),
            env: env as Env,
            params: {},
            url: mkUrl(`?check_id=${checkId}`),
        });
        expect(resp.status).toBe(200);
        const body = (await resp.json()) as { runs: unknown[] };
        expect(body.runs).toHaveLength(1);
    });

    it('respeita since e limit', async () => {
        for (let i = 0; i < 5; i++) {
            await insertRun(db, {
                check_id: checkId,
                severity: 'ok',
                message: String(i),
                duration_ms: 1,
                ran_at: 1000 + i,
            });
        }
        const resp = await listRunsHandler({
            req: new Request(`https://x.test`),
            env: env as Env,
            params: {},
            url: mkUrl(`?check_id=${checkId}&since=1002&limit=2`),
        });
        const body = (await resp.json()) as { runs: Array<{ message: string }> };
        expect(body.runs).toHaveLength(2);
    });
});

describe('latestRunsHandler', () => {
    it('retorna latest por check', async () => {
        await insertRun(db, {
            check_id: checkId,
            severity: 'ok',
            message: 'latest',
            duration_ms: 1,
            ran_at: 5000,
        });
        const resp = await latestRunsHandler({
            req: new Request('https://x.test'),
            env: env as Env,
            params: {},
            url: mkUrl('/latest'),
        });
        const body = (await resp.json()) as {
            runs: Array<{ check_name: string; message: string }>;
        };
        expect(body.runs).toHaveLength(1);
        expect(body.runs[0]?.check_name).toBe('r.api');
        expect(body.runs[0]?.message).toBe('latest');
    });
});

describe('failingRunsHandler', () => {
    it('retorna só severity != ok', async () => {
        await insertRun(db, {
            check_id: checkId,
            severity: 'ok',
            message: 'ok',
            duration_ms: 1,
        });
        await insertRun(db, {
            check_id: checkId,
            severity: 'warn',
            message: 'w',
            duration_ms: 1,
        });
        await insertRun(db, {
            check_id: checkId,
            severity: 'critical',
            message: 'c',
            duration_ms: 1,
        });
        const resp = await failingRunsHandler({
            req: new Request('https://x.test'),
            env: env as Env,
            params: {},
            url: mkUrl('/failing'),
        });
        const body = (await resp.json()) as { runs: Array<{ severity: string }> };
        expect(body.runs.map((r) => r.severity).sort()).toEqual(['critical', 'warn']);
    });
});
