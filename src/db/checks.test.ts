import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureSchema, resetDataTables } from '../test-helpers.ts';
import {
    createCheck,
    deleteCheck,
    getCheck,
    getCheckByName,
    listChecks,
    listChecksByApp,
    listEnabledForCron,
    updateCheck,
} from './checks.ts';

let db: D1Database;

beforeAll(async () => {
    db = await ensureSchema();
});

beforeEach(async () => {
    await resetDataTables(db);
});

const baseInput = {
    name: 'test.performance',
    type: 'performance' as const,
    config: { targets: [{ url: 'https://test.com', warnMs: 1000, criticalMs: 5000 }] },
    cron_pattern: '*/5 * * * *',
    app_label: 'test',
};

describe('createCheck', () => {
    it('cria com defaults (enabled = true)', async () => {
        const row = await createCheck(db, baseInput);
        expect(row.id).toBeGreaterThan(0);
        expect(row.name).toBe('test.performance');
        expect(row.enabled).toBe(1);
        expect(row.created_at).toBeGreaterThan(0);
        expect(row.updated_at).toBe(row.created_at);
    });

    it('respeita enabled = false', async () => {
        const row = await createCheck(db, { ...baseInput, enabled: false });
        expect(row.enabled).toBe(0);
    });

    it('serializa config como JSON', async () => {
        const row = await createCheck(db, baseInput);
        expect(JSON.parse(row.config_json)).toEqual(baseInput.config);
    });

    it('rejeita name duplicado', async () => {
        await createCheck(db, baseInput);
        await expect(createCheck(db, baseInput)).rejects.toThrow();
    });
});

describe('getCheck / getCheckByName', () => {
    it('retorna row existente por id', async () => {
        const created = await createCheck(db, baseInput);
        const found = await getCheck(db, created.id);
        expect(found?.name).toBe('test.performance');
    });

    it('retorna null pra id inexistente', async () => {
        const found = await getCheck(db, 99999);
        expect(found).toBeNull();
    });

    it('retorna row por name', async () => {
        await createCheck(db, baseInput);
        const found = await getCheckByName(db, 'test.performance');
        expect(found).not.toBeNull();
    });

    it('retorna null pra name inexistente', async () => {
        expect(await getCheckByName(db, 'nope')).toBeNull();
    });
});

describe('listChecks / listChecksByApp / listEnabledForCron', () => {
    it('lista ordenado por name', async () => {
        await createCheck(db, { ...baseInput, name: 'z.last' });
        await createCheck(db, { ...baseInput, name: 'a.first' });
        const rows = await listChecks(db);
        expect(rows.map((r) => r.name)).toEqual(['a.first', 'z.last']);
    });

    it('filtra por app_label', async () => {
        await createCheck(db, { ...baseInput, name: 'sonda.x', app_label: 'sonda' });
        await createCheck(db, { ...baseInput, name: 'other.y', app_label: 'other' });
        const rows = await listChecksByApp(db, 'sonda');
        expect(rows).toHaveLength(1);
        expect(rows[0]?.name).toBe('sonda.x');
    });

    it('listEnabledForCron retorna só os habilitados pro pattern', async () => {
        await createCheck(db, { ...baseInput, name: 'hot', cron_pattern: '*/5 * * * *' });
        await createCheck(db, { ...baseInput, name: 'hourly', cron_pattern: '0 * * * *' });
        await createCheck(db, {
            ...baseInput,
            name: 'disabled',
            cron_pattern: '*/5 * * * *',
            enabled: false,
        });
        const rows = await listEnabledForCron(db, '*/5 * * * *');
        expect(rows.map((r) => r.name)).toEqual(['hot']);
    });

    it('listChecks retorna array vazio quando não tem rows', async () => {
        expect(await listChecks(db)).toEqual([]);
    });
});

describe('updateCheck', () => {
    it('atualiza campos selecionados', async () => {
        const created = await createCheck(db, baseInput);
        // Mock Date.now pra garantir updated_at avança.
        await new Promise((r) => setTimeout(r, 5));
        const updated = await updateCheck(db, created.id, { enabled: false });
        expect(updated?.enabled).toBe(0);
        expect(updated?.updated_at).toBeGreaterThanOrEqual(created.updated_at);
    });

    it('atualiza name + type + config', async () => {
        const created = await createCheck(db, baseInput);
        const updated = await updateCheck(db, created.id, {
            name: 'renamed',
            type: 'integrity',
            config: { downloadUrl: 'x', releasesRepo: 'y', assetName: 'z' },
        });
        expect(updated?.name).toBe('renamed');
        expect(updated?.type).toBe('integrity');
        expect(JSON.parse(updated?.config_json ?? '{}')).toEqual({
            downloadUrl: 'x',
            releasesRepo: 'y',
            assetName: 'z',
        });
    });

    it('atualiza cron_pattern e app_label', async () => {
        const created = await createCheck(db, baseInput);
        const updated = await updateCheck(db, created.id, {
            cron_pattern: '0 * * * *',
            app_label: 'other',
        });
        expect(updated?.cron_pattern).toBe('0 * * * *');
        expect(updated?.app_label).toBe('other');
    });

    it('no-op quando input não tem nenhum campo (retorna row atual)', async () => {
        const created = await createCheck(db, baseInput);
        const updated = await updateCheck(db, created.id, {});
        expect(updated?.id).toBe(created.id);
    });

    it('retorna null pra id inexistente', async () => {
        expect(await updateCheck(db, 99999, { enabled: false })).toBeNull();
    });
});

describe('deleteCheck', () => {
    it('apaga row existente e retorna true', async () => {
        const created = await createCheck(db, baseInput);
        expect(await deleteCheck(db, created.id)).toBe(true);
        expect(await getCheck(db, created.id)).toBeNull();
    });

    it('retorna false pra id inexistente', async () => {
        expect(await deleteCheck(db, 99999)).toBe(false);
    });
});
