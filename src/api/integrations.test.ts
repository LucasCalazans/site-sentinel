import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureSchema, resetAllTables } from '../test-helpers.ts';
import {
    insertSyncSnapshot,
    upsertIntegration,
} from '../db/integrations.ts';
import {
    cloudflareSnapshotsHandler,
    githubSnapshotsHandler,
} from './integrations.ts';
import type { Env } from './env.ts';

let db: D1Database;

beforeAll(async () => {
    db = await ensureSchema();
});

beforeEach(async () => {
    await resetAllTables(db);
});

function mkUrl(qs: string): URL {
    return new URL(`https://x.test/api/integrations/cloudflare${qs}`);
}

describe('cloudflareSnapshotsHandler', () => {
    it('lista vazio quando não há snapshots', async () => {
        await upsertIntegration(db, 'cloudflare', {});
        const resp = await cloudflareSnapshotsHandler({
            req: new Request('https://x.test'),
            env: env as Env,
            params: {},
            url: mkUrl(''),
        });
        const body = (await resp.json()) as {
            integration: { type: string };
            snapshots: unknown[];
        };
        expect(body.integration.type).toBe('cloudflare');
        expect(body.snapshots).toEqual([]);
    });

    it('retorna snapshots prefixados com cloudflare.', async () => {
        const integ = await upsertIntegration(db, 'cloudflare', {});
        await insertSyncSnapshot(db, {
            integration_id: integ.id,
            kind: 'cloudflare.pages',
            payload: [{ name: 'landing' }],
        });
        await insertSyncSnapshot(db, {
            integration_id: integ.id,
            kind: 'cloudflare.workers',
            payload: [],
        });
        // Outro integration — não deve aparecer.
        const integ2 = await upsertIntegration(db, 'github', {});
        await insertSyncSnapshot(db, {
            integration_id: integ2.id,
            kind: 'github.release.x/y',
            payload: {},
        });
        const resp = await cloudflareSnapshotsHandler({
            req: new Request('https://x.test'),
            env: env as Env,
            params: {},
            url: mkUrl(''),
        });
        const body = (await resp.json()) as {
            snapshots: Array<{ kind: string }>;
        };
        expect(body.snapshots).toHaveLength(2);
        expect(body.snapshots.every((s) => s.kind.startsWith('cloudflare.'))).toBe(true);
    });

    it('filtro por ?kind=', async () => {
        const integ = await upsertIntegration(db, 'cloudflare', {});
        await insertSyncSnapshot(db, {
            integration_id: integ.id,
            kind: 'cloudflare.pages',
            payload: [{ name: 'foo' }],
        });
        const resp = await cloudflareSnapshotsHandler({
            req: new Request('https://x.test'),
            env: env as Env,
            params: {},
            url: mkUrl('?kind=cloudflare.pages'),
        });
        const body = (await resp.json()) as {
            snapshot: { payload: unknown };
        };
        expect(body.snapshot.payload).toEqual([{ name: 'foo' }]);
    });

    it('404 quando ?kind= não bate nada', async () => {
        await upsertIntegration(db, 'cloudflare', {});
        const resp = await cloudflareSnapshotsHandler({
            req: new Request('https://x.test'),
            env: env as Env,
            params: {},
            url: mkUrl('?kind=cloudflare.absent'),
        });
        expect(resp.status).toBe(404);
    });

    it('payload corrompido retorna _error', async () => {
        const integ = await upsertIntegration(db, 'cloudflare', {});
        await db
            .prepare(
                `INSERT INTO sync_snapshots (integration_id, kind, payload_json, captured_at)
                 VALUES (?, 'cloudflare.broken', 'not-json', ?)`,
            )
            .bind(integ.id, Date.now())
            .run();
        const resp = await cloudflareSnapshotsHandler({
            req: new Request('https://x.test'),
            env: env as Env,
            params: {},
            url: mkUrl('?kind=cloudflare.broken'),
        });
        const body = (await resp.json()) as { snapshot: { payload: unknown } };
        expect(body.snapshot.payload).toMatchObject({ _error: expect.any(String) });
    });
});

describe('githubSnapshotsHandler', () => {
    it('lista snapshots prefixados github.', async () => {
        const integ = await upsertIntegration(db, 'github', {});
        await insertSyncSnapshot(db, {
            integration_id: integ.id,
            kind: 'github.release.a/b',
            payload: { tag_name: 'v1' },
        });
        const resp = await githubSnapshotsHandler({
            req: new Request('https://x.test'),
            env: env as Env,
            params: {},
            url: new URL('https://x.test/api/integrations/github'),
        });
        const body = (await resp.json()) as { snapshots: Array<{ kind: string }> };
        expect(body.snapshots).toHaveLength(1);
        expect(body.snapshots[0]?.kind).toBe('github.release.a/b');
    });

    it('filtro ?kind=', async () => {
        const integ = await upsertIntegration(db, 'github', {});
        await insertSyncSnapshot(db, {
            integration_id: integ.id,
            kind: 'github.actions.a/b',
            payload: { ok: 1 },
        });
        const resp = await githubSnapshotsHandler({
            req: new Request('https://x.test'),
            env: env as Env,
            params: {},
            url: new URL('https://x.test/api/integrations/github?kind=github.actions.a/b'),
        });
        const body = (await resp.json()) as { snapshot: { payload: { ok: number } } };
        expect(body.snapshot.payload.ok).toBe(1);
    });

    it('404 quando filtro não bate', async () => {
        await upsertIntegration(db, 'github', {});
        const resp = await githubSnapshotsHandler({
            req: new Request('https://x.test'),
            env: env as Env,
            params: {},
            url: new URL('https://x.test/api/integrations/github?kind=github.absent'),
        });
        expect(resp.status).toBe(404);
    });
});
