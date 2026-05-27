import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureSchema, resetDataTables } from '../test-helpers.ts';
import { createCheck } from './checks.ts';
import {
    insertRun,
    latestRunPerCheck,
    listFailingRuns,
    listRunsByCheck,
} from './runs.ts';

let db: D1Database;
let checkId: number;

beforeAll(async () => {
    db = await ensureSchema();
});

beforeEach(async () => {
    await resetDataTables(db);
    const c = await createCheck(db, {
        name: 'r.test',
        type: 'performance',
        config: { targets: [] },
        cron_pattern: '*/5 * * * *',
        app_label: 'test',
    });
    checkId = c.id;
});

describe('insertRun', () => {
    it('insere run com severity ok e sem details', async () => {
        const row = await insertRun(db, {
            check_id: checkId,
            severity: 'ok',
            message: 'tudo bem',
            duration_ms: 42,
        });
        expect(row.id).toBeGreaterThan(0);
        expect(row.severity).toBe('ok');
        expect(row.details_json).toBeNull();
        expect(row.ran_at).toBeGreaterThan(0);
    });

    it('serializa details', async () => {
        const row = await insertRun(db, {
            check_id: checkId,
            severity: 'critical',
            message: 'broken',
            duration_ms: 100,
            details: { expected: 'a', actual: 'b' },
        });
        expect(JSON.parse(row.details_json ?? 'null')).toEqual({
            expected: 'a',
            actual: 'b',
        });
    });

    it('respeita ran_at custom', async () => {
        const row = await insertRun(db, {
            check_id: checkId,
            severity: 'ok',
            message: '',
            duration_ms: 1,
            ran_at: 1_700_000_000_000,
        });
        expect(row.ran_at).toBe(1_700_000_000_000);
    });

    it('rejeita severity inválido (CHECK constraint)', async () => {
        await expect(
            insertRun(db, {
                check_id: checkId,
                severity: 'unknown' as 'ok',
                message: 'x',
                duration_ms: 1,
            }),
        ).rejects.toThrow();
    });
});

describe('listRunsByCheck', () => {
    it('retorna ordenado DESC por ran_at', async () => {
        await insertRun(db, {
            check_id: checkId,
            severity: 'ok',
            message: 'a',
            duration_ms: 1,
            ran_at: 1000,
        });
        await insertRun(db, {
            check_id: checkId,
            severity: 'ok',
            message: 'b',
            duration_ms: 1,
            ran_at: 3000,
        });
        await insertRun(db, {
            check_id: checkId,
            severity: 'ok',
            message: 'c',
            duration_ms: 1,
            ran_at: 2000,
        });
        const rows = await listRunsByCheck(db, checkId);
        expect(rows.map((r) => r.message)).toEqual(['b', 'c', 'a']);
    });

    it('respeita since', async () => {
        await insertRun(db, {
            check_id: checkId,
            severity: 'ok',
            message: 'old',
            duration_ms: 1,
            ran_at: 1000,
        });
        await insertRun(db, {
            check_id: checkId,
            severity: 'ok',
            message: 'new',
            duration_ms: 1,
            ran_at: 5000,
        });
        const rows = await listRunsByCheck(db, checkId, { since: 4000 });
        expect(rows.map((r) => r.message)).toEqual(['new']);
    });

    it('respeita limit', async () => {
        for (let i = 0; i < 5; i++) {
            await insertRun(db, {
                check_id: checkId,
                severity: 'ok',
                message: String(i),
                duration_ms: 1,
                ran_at: 1000 + i,
            });
        }
        const rows = await listRunsByCheck(db, checkId, { limit: 2 });
        expect(rows).toHaveLength(2);
    });

    it('clampa limit no max=1000 e min=1', async () => {
        await insertRun(db, {
            check_id: checkId,
            severity: 'ok',
            message: 'x',
            duration_ms: 1,
        });
        // -5 → 1
        const minRows = await listRunsByCheck(db, checkId, { limit: -5 });
        expect(minRows).toHaveLength(1);
        // 10000 → 1000 (não falha)
        const maxRows = await listRunsByCheck(db, checkId, { limit: 10000 });
        expect(maxRows).toHaveLength(1);
    });

    it('retorna [] pra check sem runs', async () => {
        const rows = await listRunsByCheck(db, checkId);
        expect(rows).toEqual([]);
    });
});

describe('latestRunPerCheck', () => {
    it('retorna a row mais recente de cada check', async () => {
        const c2 = await createCheck(db, {
            name: 'r.other',
            type: 'performance',
            config: {},
            cron_pattern: '*/5 * * * *',
            app_label: 'test',
        });
        await insertRun(db, {
            check_id: checkId,
            severity: 'ok',
            message: 'old c1',
            duration_ms: 1,
            ran_at: 1000,
        });
        await insertRun(db, {
            check_id: checkId,
            severity: 'critical',
            message: 'new c1',
            duration_ms: 1,
            ran_at: 5000,
        });
        await insertRun(db, {
            check_id: c2.id,
            severity: 'warn',
            message: 'only c2',
            duration_ms: 1,
            ran_at: 3000,
        });
        const rows = await latestRunPerCheck(db);
        expect(rows).toHaveLength(2);
        const byName = new Map(rows.map((r) => [r.check_name, r]));
        expect(byName.get('r.test')?.message).toBe('new c1');
        expect(byName.get('r.test')?.severity).toBe('critical');
        expect(byName.get('r.other')?.message).toBe('only c2');
    });

    it('retorna [] quando não há runs', async () => {
        expect(await latestRunPerCheck(db)).toEqual([]);
    });
});

describe('listFailingRuns', () => {
    it('retorna só warn e critical', async () => {
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
        const rows = await listFailingRuns(db);
        expect(rows.map((r) => r.severity).sort()).toEqual(['critical', 'warn']);
    });

    it('respeita limit clampado', async () => {
        for (let i = 0; i < 3; i++) {
            await insertRun(db, {
                check_id: checkId,
                severity: 'warn',
                message: String(i),
                duration_ms: 1,
                ran_at: 1000 + i,
            });
        }
        expect(await listFailingRuns(db, { limit: 0 })).toHaveLength(1);
    });
});
