import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureSchema, resetDataTables } from '../test-helpers.ts';
import { createCheck } from './checks.ts';
import { insertRun } from './runs.ts';
import { insertAlert, listAlerts } from './alerts.ts';

let db: D1Database;
let runId: number;

beforeAll(async () => {
    db = await ensureSchema();
});

beforeEach(async () => {
    await resetDataTables(db);
    const c = await createCheck(db, {
        name: 'a.test',
        type: 'performance',
        config: {},
        cron_pattern: '*/5 * * * *',
        app_label: 'test',
    });
    const r = await insertRun(db, {
        check_id: c.id,
        severity: 'critical',
        message: 'broken',
        duration_ms: 100,
    });
    runId = r.id;
});

describe('insertAlert', () => {
    it('insere alerta com status sent', async () => {
        const row = await insertAlert(db, {
            run_id: runId,
            channel: 'discord',
            status: 'sent',
        });
        expect(row.status).toBe('sent');
        expect(row.error_message).toBeNull();
    });

    it('insere com status failed e error_message', async () => {
        const row = await insertAlert(db, {
            run_id: runId,
            channel: 'discord',
            status: 'failed',
            error_message: 'webhook 500',
        });
        expect(row.status).toBe('failed');
        expect(row.error_message).toBe('webhook 500');
    });

    it('rejeita status fora do CHECK constraint', async () => {
        await expect(
            insertAlert(db, {
                run_id: runId,
                channel: 'discord',
                status: 'pending' as 'sent',
            }),
        ).rejects.toThrow();
    });

    it('respeita sent_at custom', async () => {
        const row = await insertAlert(db, {
            run_id: runId,
            channel: 'discord',
            status: 'sent',
            sent_at: 1234,
        });
        expect(row.sent_at).toBe(1234);
    });
});

describe('listAlerts', () => {
    it('retorna ordenado DESC por sent_at', async () => {
        await insertAlert(db, {
            run_id: runId,
            channel: 'discord',
            status: 'sent',
            sent_at: 1000,
        });
        await insertAlert(db, {
            run_id: runId,
            channel: 'discord',
            status: 'failed',
            sent_at: 3000,
        });
        await insertAlert(db, {
            run_id: runId,
            channel: 'discord',
            status: 'sent',
            sent_at: 2000,
        });
        const rows = await listAlerts(db);
        expect(rows.map((r) => r.sent_at)).toEqual([3000, 2000, 1000]);
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
        const rows = await listAlerts(db, { since: 1003, limit: 2 });
        expect(rows).toHaveLength(2);
        expect(rows.every((r) => r.sent_at >= 1003)).toBe(true);
    });

    it('retorna [] sem alertas', async () => {
        expect(await listAlerts(db)).toEqual([]);
    });
});
