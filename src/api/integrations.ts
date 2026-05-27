// Handlers REST das integrações. Servem do cache D1 (sync_snapshots), não da
// API externa — pra UI não ser sensível ao rate-limit. Sync acontece no cron.

import { getIntegration, latestSnapshot, latestSnapshotsByPrefix } from '../db/integrations.ts';
import { jsonResponse, notFound } from './responses.ts';
import type { RouteContext } from './router.ts';

interface SnapshotWire {
    kind: string;
    captured_at: number;
    payload: unknown;
}

function snapshotToWire(row: { kind: string; captured_at: number; payload_json: string }): SnapshotWire {
    let payload: unknown = null;
    try {
        payload = JSON.parse(row.payload_json);
    } catch {
        payload = { _error: 'payload_json inválido' };
    }
    return { kind: row.kind, captured_at: row.captured_at, payload };
}

export async function cloudflareSnapshotsHandler({ env, url }: RouteContext): Promise<Response> {
    const integ = await getIntegration(env.DB, 'cloudflare');
    const kindFilter = url.searchParams.get('kind');
    if (kindFilter) {
        const snap = await latestSnapshot(env.DB, kindFilter);
        if (!snap) return notFound('snapshot não existe pra esse kind');
        return jsonResponse({
            integration: integ,
            snapshot: snapshotToWire(snap),
        });
    }
    const snaps = await latestSnapshotsByPrefix(env.DB, 'cloudflare.');
    return jsonResponse({
        integration: integ,
        snapshots: snaps.map(snapshotToWire),
    });
}

export async function githubSnapshotsHandler({ env, url }: RouteContext): Promise<Response> {
    const integ = await getIntegration(env.DB, 'github');
    const kindFilter = url.searchParams.get('kind');
    if (kindFilter) {
        const snap = await latestSnapshot(env.DB, kindFilter);
        if (!snap) return notFound('snapshot não existe pra esse kind');
        return jsonResponse({
            integration: integ,
            snapshot: snapshotToWire(snap),
        });
    }
    const snaps = await latestSnapshotsByPrefix(env.DB, 'github.');
    return jsonResponse({
        integration: integ,
        snapshots: snaps.map(snapshotToWire),
    });
}
