import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureSchema, resetDataTables } from '../test-helpers.ts';
import { createCheck } from '../db/checks.ts';
import { insertRun } from '../db/runs.ts';
import { insertAlert } from '../db/alerts.ts';
import { alertToWire, listAlertsHandler } from './alerts.ts';
import type { Env } from './env.ts';

let db: D1Database;
let runId: number;

beforeAll(async () => {
    db = await ensureSchema();
});

beforeEach(async () => {
    await resetDataTables(db);
    const c = await createCheck(db, {
        name: 'a.api',
        type: 'performance',
        config: {},
        cron_pattern: '*/5 * * * *',
        app_label: 'test',
    });
    const r = await insertRun(db, {
        check_id: c.id,
        severity: 'critical',
        message: 'x',
        duration_ms: 1,
    });
    runId = r.id;
});

describe('alertToWire', () => {
    it('mapeia row pra wire', () => {
        const wire = alertToWire({
            id: 1,
            run_id: 5,
            channel: 'discord',
            status: 'sent',
            error_message: null,
            sent_at: 100,
        });
        expect(wire).toEqual({
            id: 1,
            run_id: 5,
            channel: 'discord',
            status: 'sent',
            error_message: null,
            sent_at: 100,
        });
    });
});

describe('listAlertsHandler', () => {
    it('lista alerts ordenados DESC', async () => {
        await insertAlert(db, { run_id: runId, channel: 'discord', status: 'sent', sent_at: 1000 });
        await insertAlert(db, { run_id: runId, channel: 'discord', status: 'failed', sent_at: 2000 });
        const resp = await listAlertsHandler({
            req: new Request('https://x.test'),
            env: env as Env,
            params: {},
            url: new URL('https://x.test/api/alerts'),
        });
        expect(resp.status).toBe(200);
        const body = (await resp.json()) as { alerts: Array<{ sent_at: number }> };
        expect(body.alerts.map((a) => a.sent_at)).toEqual([2000, 1000]);
    });

    it('respeita since e limit', async () => {
        for (let i = 0; i < 5; i++) {
            await insertAlert(db, {
                run_id: runId,
                channel: 'discord',
                status: 'sent',
                sent_at: 1000 + i,
            });
        }
        const resp = await listAlertsHandler({
            req: new Request('https://x.test'),
            env: env as Env,
            params: {},
            url: new URL('https://x.test/api/alerts?since=1002&limit=2'),
        });
        const body = (await resp.json()) as { alerts: unknown[] };
        expect(body.alerts).toHaveLength(2);
    });
});
