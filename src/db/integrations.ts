import type {
    IntegrationRow,
    IntegrationType,
    SyncSnapshotRow,
} from './types.ts';

export async function getIntegration(
    db: D1Database,
    type: IntegrationType,
): Promise<IntegrationRow | null> {
    return await db
        .prepare('SELECT * FROM integrations WHERE type = ?')
        .bind(type)
        .first<IntegrationRow>();
}

export async function upsertIntegration(
    db: D1Database,
    type: IntegrationType,
    config: unknown,
    lastSyncedAt: number | null = null,
): Promise<IntegrationRow> {
    const configJson = JSON.stringify(config);
    const result = await db
        .prepare(
            `INSERT INTO integrations (type, config_json, last_synced_at)
             VALUES (?, ?, ?)
             ON CONFLICT(type) DO UPDATE SET
                 config_json = excluded.config_json,
                 last_synced_at = excluded.last_synced_at
             RETURNING *`,
        )
        .bind(type, configJson, lastSyncedAt)
        .first<IntegrationRow>();
    if (!result) throw new Error('upsertIntegration: INSERT não retornou row');
    return result;
}

export async function touchIntegrationSync(
    db: D1Database,
    type: IntegrationType,
    syncedAt: number = Date.now(),
): Promise<void> {
    await db
        .prepare('UPDATE integrations SET last_synced_at = ? WHERE type = ?')
        .bind(syncedAt, type)
        .run();
}

export interface InsertSyncSnapshotInput {
    integration_id: number;
    kind: string;
    payload: unknown;
    captured_at?: number;
}

export async function insertSyncSnapshot(
    db: D1Database,
    input: InsertSyncSnapshotInput,
): Promise<SyncSnapshotRow> {
    const captured = input.captured_at ?? Date.now();
    const result = await db
        .prepare(
            `INSERT INTO sync_snapshots (integration_id, kind, payload_json, captured_at)
             VALUES (?, ?, ?, ?)
             RETURNING *`,
        )
        .bind(
            input.integration_id,
            input.kind,
            JSON.stringify(input.payload),
            captured,
        )
        .first<SyncSnapshotRow>();
    if (!result) {
        throw new Error('insertSyncSnapshot: INSERT não retornou row');
    }
    return result;
}

export async function latestSnapshot(
    db: D1Database,
    kind: string,
): Promise<SyncSnapshotRow | null> {
    return await db
        .prepare(
            `SELECT * FROM sync_snapshots
             WHERE kind = ?
             ORDER BY captured_at DESC
             LIMIT 1`,
        )
        .bind(kind)
        .first<SyncSnapshotRow>();
}

export async function latestSnapshotsByPrefix(
    db: D1Database,
    kindPrefix: string,
): Promise<SyncSnapshotRow[]> {
    // Pra cada `kind` que começa com prefix, pega o snapshot mais recente.
    const result = await db
        .prepare(
            `SELECT s.* FROM sync_snapshots s
             WHERE s.kind LIKE ? AND s.id IN (
                 SELECT MAX(id) FROM sync_snapshots WHERE kind LIKE ? GROUP BY kind
             )
             ORDER BY s.kind`,
        )
        .bind(`${kindPrefix}%`, `${kindPrefix}%`)
        .all<SyncSnapshotRow>();
    return result.results ?? [];
}

// Cleanup: mantém só os N snapshots mais recentes por kind. Chame
// periodicamente pra prevenir crescimento ilimitado.
export async function prunePastSnapshots(
    db: D1Database,
    keepPerKind = 30,
): Promise<number> {
    const result = await db
        .prepare(
            `DELETE FROM sync_snapshots
             WHERE id NOT IN (
                 SELECT id FROM (
                     SELECT id,
                            ROW_NUMBER() OVER (PARTITION BY kind ORDER BY captured_at DESC) as rn
                     FROM sync_snapshots
                 )
                 WHERE rn <= ?
             )`,
        )
        .bind(keepPerKind)
        .run();
    return result.meta.changes ?? 0;
}
