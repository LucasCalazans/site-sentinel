// Sync periódico: chama as APIs externas (CF, GH) e grava snapshots no D1.
// O dashboard lê só dos snapshots, nunca direto da API externa. Isso protege
// contra rate limits e dá visibilidade do "estado conhecido até X" mesmo
// quando a API externa está fora.

import type { Env } from '../api/env.ts';
import {
    getZoneAnalytics,
    listD1Databases,
    listPagesProjects,
    listWorkers,
} from './cloudflare.ts';
import {
    getActionsRuns,
    getLatestRelease,
    getOpenIssues,
    getRepoMeta,
} from './github.ts';
import {
    getIntegration,
    insertSyncSnapshot,
    touchIntegrationSync,
} from '../db/integrations.ts';
import type { IntegrationRow, IntegrationType } from '../db/types.ts';

export interface SyncResult {
    integration: IntegrationType;
    snapshots: number;
    errors: string[];
}

async function ensureIntegration(
    db: D1Database,
    type: IntegrationType,
): Promise<IntegrationRow> {
    const existing = await getIntegration(db, type);
    if (existing) return existing;
    // Cria com config minimal se ainda não existir.
    return await db
        .prepare(
            `INSERT INTO integrations (type, config_json, last_synced_at)
             VALUES (?, ?, NULL)
             RETURNING *`,
        )
        .bind(type, '{}')
        .first<IntegrationRow>() as IntegrationRow;
}

export async function syncCloudflare(
    env: Env,
    fetchImpl: typeof fetch = globalThis.fetch,
): Promise<SyncResult> {
    const errors: string[] = [];
    let snapshots = 0;
    const integ = await ensureIntegration(env.DB, 'cloudflare');

    async function capture(kind: string, fn: () => Promise<unknown>): Promise<void> {
        try {
            const payload = await fn();
            await insertSyncSnapshot(env.DB, {
                integration_id: integ.id,
                kind,
                payload,
            });
            snapshots++;
        } catch (err) {
            errors.push(`${kind}: ${(err as Error).message}`);
        }
    }

    if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) {
        errors.push('CF_API_TOKEN ou CF_ACCOUNT_ID ausente — pulando sync CF');
        return { integration: 'cloudflare', snapshots, errors };
    }

    await capture('cloudflare.pages', () =>
        listPagesProjects(env.CF_ACCOUNT_ID, env.CF_API_TOKEN, fetchImpl),
    );
    await capture('cloudflare.workers', () =>
        listWorkers(env.CF_ACCOUNT_ID, env.CF_API_TOKEN, fetchImpl),
    );
    await capture('cloudflare.d1', () =>
        listD1Databases(env.CF_ACCOUNT_ID, env.CF_API_TOKEN, fetchImpl),
    );
    if (env.CF_ZONE_ID) {
        await capture('cloudflare.analytics', () =>
            getZoneAnalytics(env.CF_ZONE_ID, 1440, env.CF_API_TOKEN, fetchImpl),
        );
    }

    await touchIntegrationSync(env.DB, 'cloudflare');
    return { integration: 'cloudflare', snapshots, errors };
}

export async function syncGitHub(
    env: Env,
    fetchImpl: typeof fetch = globalThis.fetch,
): Promise<SyncResult> {
    const errors: string[] = [];
    let snapshots = 0;
    const integ = await ensureIntegration(env.DB, 'github');

    if (!env.GITHUB_TOKEN || !env.GITHUB_REPOS) {
        errors.push('GITHUB_TOKEN ou GITHUB_REPOS ausente — pulando sync GH');
        return { integration: 'github', snapshots, errors };
    }

    const repos = env.GITHUB_REPOS.split(',')
        .map((r) => r.trim())
        .filter(Boolean);

    async function capture(kind: string, fn: () => Promise<unknown>): Promise<void> {
        try {
            const payload = await fn();
            await insertSyncSnapshot(env.DB, {
                integration_id: integ.id,
                kind,
                payload,
            });
            snapshots++;
        } catch (err) {
            errors.push(`${kind}: ${(err as Error).message}`);
        }
    }

    for (const repo of repos) {
        await capture(`github.repo.${repo}`, () =>
            getRepoMeta(repo, env.GITHUB_TOKEN, fetchImpl),
        );
        await capture(`github.release.${repo}`, () =>
            getLatestRelease(repo, env.GITHUB_TOKEN, fetchImpl),
        );
        await capture(`github.actions.${repo}`, () =>
            getActionsRuns(repo, env.GITHUB_TOKEN, fetchImpl),
        );
        await capture(`github.issues.${repo}`, () =>
            getOpenIssues(repo, env.GITHUB_TOKEN, fetchImpl),
        );
    }

    await touchIntegrationSync(env.DB, 'github');
    return { integration: 'github', snapshots, errors };
}
