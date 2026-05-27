import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureSchema, resetAllTables } from '../test-helpers.ts';
import {
    getIntegration,
    insertSyncSnapshot,
    latestSnapshot,
    latestSnapshotsByPrefix,
    prunePastSnapshots,
    touchIntegrationSync,
    upsertIntegration,
} from './integrations.ts';

let db: D1Database;

beforeAll(async () => {
    db = await ensureSchema();
});

beforeEach(async () => {
    await resetAllTables(db);
});

describe('upsertIntegration / getIntegration', () => {
    it('cria novo quando type não existe', async () => {
        const row = await upsertIntegration(db, 'github', { repos: ['a/b'] });
        expect(row.id).toBeGreaterThan(0);
        expect(row.type).toBe('github');
        expect(JSON.parse(row.config_json)).toEqual({ repos: ['a/b'] });
    });

    it('atualiza config quando type já existe', async () => {
        const first = await upsertIntegration(db, 'github', { repos: ['a/b'] });
        const updated = await upsertIntegration(db, 'github', {
            repos: ['c/d', 'e/f'],
        });
        expect(updated.id).toBe(first.id);
        expect(JSON.parse(updated.config_json)).toEqual({ repos: ['c/d', 'e/f'] });
    });

    it('inclui last_synced_at quando passado', async () => {
        const row = await upsertIntegration(db, 'cloudflare', {}, 1234);
        expect(row.last_synced_at).toBe(1234);
    });

    it('getIntegration retorna null quando type ausente', async () => {
        expect(await getIntegration(db, 'github')).toBeNull();
    });

    it('getIntegration retorna row existente', async () => {
        await upsertIntegration(db, 'github', { x: 1 });
        const got = await getIntegration(db, 'github');
        expect(got?.type).toBe('github');
    });
});

describe('touchIntegrationSync', () => {
    it('atualiza last_synced_at', async () => {
        await upsertIntegration(db, 'github', {});
        await touchIntegrationSync(db, 'github', 9999);
        const row = await getIntegration(db, 'github');
        expect(row?.last_synced_at).toBe(9999);
    });

    it('default usa Date.now()', async () => {
        await upsertIntegration(db, 'github', {});
        const before = Date.now();
        await touchIntegrationSync(db, 'github');
        const after = Date.now();
        const row = await getIntegration(db, 'github');
        expect(row?.last_synced_at).toBeGreaterThanOrEqual(before);
        expect(row?.last_synced_at).toBeLessThanOrEqual(after);
    });
});

describe('insertSyncSnapshot / latestSnapshot', () => {
    it('insere snapshot e o recupera por kind', async () => {
        const integ = await upsertIntegration(db, 'github', {});
        await insertSyncSnapshot(db, {
            integration_id: integ.id,
            kind: 'github.release.x/y',
            payload: { version: '1.0' },
            captured_at: 1000,
        });
        const got = await latestSnapshot(db, 'github.release.x/y');
        expect(got).not.toBeNull();
        expect(JSON.parse(got?.payload_json ?? '{}')).toEqual({ version: '1.0' });
    });

    it('latestSnapshot retorna o mais recente quando há múltiplos', async () => {
        const integ = await upsertIntegration(db, 'cloudflare', {});
        await insertSyncSnapshot(db, {
            integration_id: integ.id,
            kind: 'cloudflare.pages.foo',
            payload: { deploys: 1 },
            captured_at: 1000,
        });
        await insertSyncSnapshot(db, {
            integration_id: integ.id,
            kind: 'cloudflare.pages.foo',
            payload: { deploys: 2 },
            captured_at: 3000,
        });
        const got = await latestSnapshot(db, 'cloudflare.pages.foo');
        expect(JSON.parse(got?.payload_json ?? '{}')).toEqual({ deploys: 2 });
    });

    it('latestSnapshot retorna null pra kind ausente', async () => {
        expect(await latestSnapshot(db, 'nope')).toBeNull();
    });

    it('captured_at default usa Date.now()', async () => {
        const integ = await upsertIntegration(db, 'github', {});
        const before = Date.now();
        await insertSyncSnapshot(db, {
            integration_id: integ.id,
            kind: 'x',
            payload: {},
        });
        const after = Date.now();
        const got = await latestSnapshot(db, 'x');
        expect(got?.captured_at).toBeGreaterThanOrEqual(before);
        expect(got?.captured_at).toBeLessThanOrEqual(after);
    });
});

describe('latestSnapshotsByPrefix', () => {
    it('retorna o último de cada kind matching o prefix', async () => {
        const integ = await upsertIntegration(db, 'github', {});
        await insertSyncSnapshot(db, {
            integration_id: integ.id,
            kind: 'github.actions.a/b',
            payload: { v: 1 },
            captured_at: 1000,
        });
        await insertSyncSnapshot(db, {
            integration_id: integ.id,
            kind: 'github.actions.a/b',
            payload: { v: 2 },
            captured_at: 2000,
        });
        await insertSyncSnapshot(db, {
            integration_id: integ.id,
            kind: 'github.actions.c/d',
            payload: { v: 99 },
            captured_at: 1500,
        });
        // Kind fora do prefix — não deve aparecer.
        await insertSyncSnapshot(db, {
            integration_id: integ.id,
            kind: 'cloudflare.pages.x',
            payload: { ignore: true },
            captured_at: 5000,
        });
        const rows = await latestSnapshotsByPrefix(db, 'github.actions.');
        expect(rows).toHaveLength(2);
        const byKind = new Map(
            rows.map((r) => [r.kind, JSON.parse(r.payload_json) as Record<string, number>]),
        );
        expect(byKind.get('github.actions.a/b')).toEqual({ v: 2 });
        expect(byKind.get('github.actions.c/d')).toEqual({ v: 99 });
    });

    it('retorna [] quando prefix não bate nada', async () => {
        expect(await latestSnapshotsByPrefix(db, 'absent.')).toEqual([]);
    });
});

describe('prunePastSnapshots', () => {
    it('mantém só os N mais recentes por kind', async () => {
        const integ = await upsertIntegration(db, 'github', {});
        for (let i = 0; i < 5; i++) {
            await insertSyncSnapshot(db, {
                integration_id: integ.id,
                kind: 'k1',
                payload: { i },
                captured_at: 1000 + i,
            });
        }
        for (let i = 0; i < 3; i++) {
            await insertSyncSnapshot(db, {
                integration_id: integ.id,
                kind: 'k2',
                payload: { i },
                captured_at: 1000 + i,
            });
        }
        const deleted = await prunePastSnapshots(db, 2);
        // k1: 5 → 2 (apaga 3). k2: 3 → 2 (apaga 1). Total 4.
        expect(deleted).toBe(4);

        const k1 = await latestSnapshotsByPrefix(db, 'k1');
        expect(k1).toHaveLength(1); // só o "último por kind" via prefix
        // Conta direto:
        const allK1 = await db
            .prepare("SELECT COUNT(*) as c FROM sync_snapshots WHERE kind = 'k1'")
            .first<{ c: number }>();
        expect(allK1?.c).toBe(2);
    });

    it('default keepPerKind = 30 → não apaga se < 30 por kind', async () => {
        const integ = await upsertIntegration(db, 'github', {});
        for (let i = 0; i < 5; i++) {
            await insertSyncSnapshot(db, {
                integration_id: integ.id,
                kind: 'k',
                payload: {},
                captured_at: 1000 + i,
            });
        }
        const deleted = await prunePastSnapshots(db);
        expect(deleted).toBe(0);
    });
});
