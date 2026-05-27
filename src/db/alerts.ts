import type { AlertRow, AlertStatus } from './types.ts';

export interface InsertAlertInput {
    run_id: number;
    channel: string;
    status: AlertStatus;
    error_message?: string | null;
    sent_at?: number;
}

export async function insertAlert(
    db: D1Database,
    input: InsertAlertInput,
): Promise<AlertRow> {
    const sentAt = input.sent_at ?? Date.now();
    const result = await db
        .prepare(
            `INSERT INTO alerts (run_id, channel, status, error_message, sent_at)
             VALUES (?, ?, ?, ?, ?)
             RETURNING *`,
        )
        .bind(
            input.run_id,
            input.channel,
            input.status,
            input.error_message ?? null,
            sentAt,
        )
        .first<AlertRow>();
    if (!result) throw new Error('insertAlert: INSERT não retornou row');
    return result;
}

export async function listAlerts(
    db: D1Database,
    options: { since?: number; limit?: number } = {},
): Promise<AlertRow[]> {
    const since = options.since ?? 0;
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 1000);
    const result = await db
        .prepare(
            `SELECT * FROM alerts
             WHERE sent_at >= ?
             ORDER BY sent_at DESC
             LIMIT ?`,
        )
        .bind(since, limit)
        .all<AlertRow>();
    return result.results ?? [];
}
