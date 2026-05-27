import { env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureSchema, resetDataTables } from '../test-helpers.ts';
import { createCheck } from '../db/checks.ts';
import { listAlerts } from '../db/alerts.ts';
import { listRunsByCheck } from '../db/runs.ts';
import { runScheduled } from './scheduled.ts';
import type { Env } from '../api/env.ts';

let db: D1Database;
let originalFetch: typeof fetch;

beforeAll(async () => {
    db = await ensureSchema();
    originalFetch = globalThis.fetch;
});

beforeEach(async () => {
    await resetDataTables(db);
});

afterEach(() => {
    globalThis.fetch = originalFetch;
});

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): void {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        return handler(url, init);
    }) as typeof fetch;
}

const env_ = env as Env;

describe('runScheduled', () => {
    it('total = 0 quando não há checks habilitados', async () => {
        const summary = await runScheduled(env_, '*/5 * * * *');
        expect(summary.total).toBe(0);
        expect(summary.ran).toBe(0);
        expect(summary.failing).toBe(0);
    });

    it('roda check de performance e grava run + alert.skipped quando ok mas sem webhook', async () => {
        stubFetch(() => new Response('ok', { status: 200 }));
        const c = await createCheck(db, {
            name: 'p1',
            type: 'performance',
            config: { targets: [{ url: 'https://x.com', warnMs: 5000, criticalMs: 9999 }] },
            cron_pattern: '*/5 * * * *',
            app_label: 'test',
        });
        const summary = await runScheduled(env_, '*/5 * * * *');
        expect(summary.ran).toBe(1);
        expect(summary.failing).toBe(0);
        const runs = await listRunsByCheck(db, c.id);
        expect(runs).toHaveLength(1);
        expect(runs[0]?.severity).toBe('ok');
        // Nenhum alert porque tudo ok.
        const alerts = await listAlerts(db);
        expect(alerts).toHaveLength(0);
    });

    it('posta Discord e grava alert.sent quando há falha', async () => {
        let webhookCalled = false;
        stubFetch((url) => {
            if (url.startsWith('https://discord.com')) {
                webhookCalled = true;
                return new Response('ok', { status: 200 });
            }
            return new Response('', { status: 500 });
        });
        await createCheck(db, {
            name: 'fail',
            type: 'performance',
            config: { targets: [{ url: 'https://broken.com', warnMs: 1000, criticalMs: 5000 }] },
            cron_pattern: '*/5 * * * *',
            app_label: 'test',
        });
        const summary = await runScheduled(env_, '*/5 * * * *');
        expect(summary.failing).toBe(1);
        expect(webhookCalled).toBe(true);
        const alerts = await listAlerts(db);
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.status).toBe('sent');
    });

    it('grava alert.failed quando webhook lança', async () => {
        stubFetch((url) => {
            if (url.startsWith('https://discord.com')) {
                return new Response('rate limited', { status: 429 });
            }
            return new Response('', { status: 500 });
        });
        await createCheck(db, {
            name: 'fail2',
            type: 'performance',
            config: { targets: [{ url: 'https://broken.com', warnMs: 1000, criticalMs: 5000 }] },
            cron_pattern: '*/5 * * * *',
            app_label: 'test',
        });
        await runScheduled(env_, '*/5 * * * *');
        const alerts = await listAlerts(db);
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.status).toBe('failed');
        expect(alerts[0]?.error_message).toMatch(/429/);
    });

    it('grava alert.skipped quando DISCORD_WEBHOOK_URL não setado', async () => {
        stubFetch(() => new Response('', { status: 500 }));
        await createCheck(db, {
            name: 'fail3',
            type: 'performance',
            config: { targets: [{ url: 'https://x.com', warnMs: 1, criticalMs: 1 }] },
            cron_pattern: '*/5 * * * *',
            app_label: 'test',
        });
        const summary = await runScheduled(
            { ...env_, DISCORD_WEBHOOK_URL: '' },
            '*/5 * * * *',
        );
        expect(summary.failing).toBe(1);
        const alerts = await listAlerts(db);
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.status).toBe('skipped');
    });

    it('factory falha → grava run critical sem rodar fetch', async () => {
        let fetchCalled = false;
        stubFetch(() => {
            fetchCalled = true;
            return new Response('', { status: 200 });
        });
        // config_json inválido → factory throws.
        await db
            .prepare(
                `INSERT INTO checks (name, type, config_json, enabled, cron_pattern, app_label, created_at, updated_at)
                 VALUES (?, 'performance', 'not-json', 1, '*/5 * * * *', 'test', ?, ?)`,
            )
            .bind('bad', Date.now(), Date.now())
            .run();
        const summary = await runScheduled(env_, '*/5 * * * *');
        expect(summary.failing).toBe(1);
        expect(fetchCalled).toBe(false);
        const c = await db.prepare('SELECT id FROM checks WHERE name = ?').bind('bad').first<{ id: number }>();
        const runs = await listRunsByCheck(db, c?.id ?? 0);
        expect(runs[0]?.severity).toBe('critical');
        expect(runs[0]?.message).toMatch(/factory falhou/);
    });

    it('ignora checks com cron_pattern diferente', async () => {
        stubFetch(() => new Response('ok', { status: 200 }));
        await createCheck(db, {
            name: 'hourly',
            type: 'performance',
            config: { targets: [{ url: 'https://x.com', warnMs: 5000, criticalMs: 9999 }] },
            cron_pattern: '0 * * * *',
            app_label: 'test',
        });
        await createCheck(db, {
            name: 'frequent',
            type: 'performance',
            config: { targets: [{ url: 'https://y.com', warnMs: 5000, criticalMs: 9999 }] },
            cron_pattern: '*/5 * * * *',
            app_label: 'test',
        });
        const summary = await runScheduled(env_, '*/5 * * * *');
        expect(summary.total).toBe(1);
        expect(summary.results[0]?.name).toBe('frequent');
    });
});
