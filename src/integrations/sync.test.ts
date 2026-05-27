import { env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureSchema, resetAllTables } from '../test-helpers.ts';
import { syncCloudflare, syncGitHub } from './sync.ts';
import {
    getIntegration,
    latestSnapshot,
    latestSnapshotsByPrefix,
} from '../db/integrations.ts';
import type { Env } from '../api/env.ts';

let db: D1Database;
let originalFetch: typeof fetch;

beforeAll(async () => {
    db = await ensureSchema();
    originalFetch = globalThis.fetch;
});

beforeEach(async () => {
    await resetAllTables(db);
});

afterEach(() => {
    globalThis.fetch = originalFetch;
});

function cfOk<T>(result: T): Response {
    return new Response(JSON.stringify({ success: true, errors: [], result }), {
        status: 200,
    });
}
function ghOk<T>(result: T): Response {
    return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

function urlMatcher(handlers: Record<string, () => Response | Promise<Response>>): typeof fetch {
    return (async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        for (const [pattern, handler] of Object.entries(handlers)) {
            if (url.includes(pattern)) return handler();
        }
        return new Response('not mocked', { status: 500 });
    }) as typeof fetch;
}

describe('syncCloudflare', () => {
    it('grava snapshots de pages, workers, d1, analytics', async () => {
        const e = { ...env, CF_API_TOKEN: 'tok', CF_ACCOUNT_ID: 'acc', CF_ZONE_ID: 'zone' } as Env;
        const fetchImpl = urlMatcher({
            '/pages/projects': () => cfOk([{ name: 'p' }]),
            '/workers/scripts': () => cfOk([{ id: 'w' }]),
            '/d1/database': () => cfOk([{ uuid: 'd1', name: 'db' }]),
            '/analytics/dashboard': () =>
                cfOk({ totals: { since: '', until: '' } }),
        });
        const result = await syncCloudflare(e, fetchImpl);
        expect(result.snapshots).toBe(4);
        expect(result.errors).toEqual([]);
        const integ = await getIntegration(db, 'cloudflare');
        expect(integ?.last_synced_at).not.toBeNull();

        const all = await latestSnapshotsByPrefix(db, 'cloudflare.');
        expect(all.map((s) => s.kind).sort()).toEqual([
            'cloudflare.analytics',
            'cloudflare.d1',
            'cloudflare.pages',
            'cloudflare.workers',
        ]);
    });

    it('pula sync quando CF_API_TOKEN ausente', async () => {
        const e = { ...env, CF_API_TOKEN: '', CF_ACCOUNT_ID: 'acc' } as Env;
        const result = await syncCloudflare(e);
        expect(result.snapshots).toBe(0);
        expect(result.errors[0]).toMatch(/ausente/);
    });

    it('pula sync quando CF_ACCOUNT_ID ausente', async () => {
        const e = { ...env, CF_API_TOKEN: 'tok', CF_ACCOUNT_ID: '' } as Env;
        const result = await syncCloudflare(e);
        expect(result.errors[0]).toMatch(/ausente/);
    });

    it('pula analytics quando CF_ZONE_ID ausente', async () => {
        const e = { ...env, CF_API_TOKEN: 'tok', CF_ACCOUNT_ID: 'acc', CF_ZONE_ID: '' } as Env;
        const fetchImpl = urlMatcher({
            '/pages/projects': () => cfOk([]),
            '/workers/scripts': () => cfOk([]),
            '/d1/database': () => cfOk([]),
        });
        const result = await syncCloudflare(e, fetchImpl);
        expect(result.snapshots).toBe(3);
        expect(await latestSnapshot(db, 'cloudflare.analytics')).toBeNull();
    });

    it('continua mesmo quando uma chamada falha (errors acumulam)', async () => {
        const e = { ...env, CF_API_TOKEN: 'tok', CF_ACCOUNT_ID: 'acc' } as Env;
        const fetchImpl = urlMatcher({
            '/pages/projects': () =>
                new Response(JSON.stringify({ success: false, errors: [{ message: 'boom' }] })),
            '/workers/scripts': () => cfOk([]),
            '/d1/database': () => cfOk([]),
        });
        const result = await syncCloudflare(e, fetchImpl);
        expect(result.snapshots).toBe(2);
        expect(result.errors[0]).toMatch(/cloudflare\.pages.*boom/);
    });
});

describe('syncGitHub', () => {
    it('itera repos e captura 4 snapshots por repo', async () => {
        const e = {
            ...env,
            GITHUB_TOKEN: 'tok',
            GITHUB_REPOS: 'a/b',
        } as Env;
        const fetchImpl = urlMatcher({
            '/repos/a/b/issues': () => ghOk([]),
            '/repos/a/b/releases/latest': () => ghOk({ tag_name: 'v1', html_url: 'u' }),
            '/repos/a/b/actions/runs': () => ghOk({ total_count: 0, workflow_runs: [] }),
            '/repos/a/b': () =>
                ghOk({ full_name: 'a/b', description: null, html_url: 'u' }),
        });
        const result = await syncGitHub(e, fetchImpl);
        expect(result.snapshots).toBe(4);
        const snaps = await latestSnapshotsByPrefix(db, 'github.');
        expect(snaps).toHaveLength(4);
    });

    it('pula sync quando GITHUB_TOKEN ausente', async () => {
        const e = { ...env, GITHUB_TOKEN: '', GITHUB_REPOS: 'a/b' } as Env;
        const result = await syncGitHub(e);
        expect(result.snapshots).toBe(0);
        expect(result.errors[0]).toMatch(/ausente/);
    });

    it('múltiplos repos via CSV', async () => {
        const e = {
            ...env,
            GITHUB_TOKEN: 'tok',
            GITHUB_REPOS: 'a/b,c/d',
        } as Env;
        const fetchImpl = urlMatcher({
            '/repos/a/b/issues': () => ghOk([]),
            '/repos/a/b/releases/latest': () => ghOk({ tag_name: 'v1', html_url: 'u' }),
            '/repos/a/b/actions/runs': () => ghOk({ total_count: 0, workflow_runs: [] }),
            '/repos/a/b': () => ghOk({ full_name: 'a/b', description: null, html_url: 'u' }),
            '/repos/c/d/issues': () => ghOk([]),
            '/repos/c/d/releases/latest': () => ghOk({ tag_name: 'v1', html_url: 'u' }),
            '/repos/c/d/actions/runs': () => ghOk({ total_count: 0, workflow_runs: [] }),
            '/repos/c/d': () => ghOk({ full_name: 'c/d', description: null, html_url: 'u' }),
        });
        const result = await syncGitHub(e, fetchImpl);
        expect(result.snapshots).toBe(8);
    });

    it('captura errors sem abortar quando endpoint específico falha', async () => {
        const e = { ...env, GITHUB_TOKEN: 'tok', GITHUB_REPOS: 'x/y' } as Env;
        const fetchImpl = urlMatcher({
            '/repos/x/y/issues': () => new Response('', { status: 500 }),
            '/repos/x/y/releases/latest': () => ghOk({ tag_name: 'v', html_url: 'u' }),
            '/repos/x/y/actions/runs': () => ghOk({ total_count: 0, workflow_runs: [] }),
            '/repos/x/y': () => ghOk({ full_name: 'x/y', description: null, html_url: 'u' }),
        });
        const result = await syncGitHub(e, fetchImpl);
        expect(result.snapshots).toBe(3);
        expect(result.errors[0]).toMatch(/issues/);
    });

    it('cria row na tabela integrations quando ainda não existe', async () => {
        const e = { ...env, GITHUB_TOKEN: 'tok', GITHUB_REPOS: 'a/b' } as Env;
        const fetchImpl = urlMatcher({
            '/repos/a/b/issues': () => ghOk([]),
            '/repos/a/b/releases/latest': () => ghOk({ tag_name: 'v', html_url: 'u' }),
            '/repos/a/b/actions/runs': () => ghOk({ total_count: 0, workflow_runs: [] }),
            '/repos/a/b': () => ghOk({ full_name: 'a/b', description: null, html_url: 'u' }),
        });
        // Verifica que integrations.github não existe ainda (resetAllTables apagou).
        expect(await getIntegration(db, 'github')).toBeNull();
        await syncGitHub(e, fetchImpl);
        const integ = await getIntegration(db, 'github');
        expect(integ).not.toBeNull();
        expect(integ?.last_synced_at).not.toBeNull();
    });
});
