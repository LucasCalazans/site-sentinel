import type { RunRow, Severity } from './types.ts';

export interface InsertRunInput {
    check_id: number;
    severity: Severity;
    message: string;
    duration_ms: number;
    details?: unknown;
    ran_at?: number;
}

export async function insertRun(
    db: D1Database,
    input: InsertRunInput,
): Promise<RunRow> {
    const details =
        input.details === undefined ? null : JSON.stringify(input.details);
    const ranAt = input.ran_at ?? Date.now();
    const result = await db
        .prepare(
            `INSERT INTO runs (check_id, severity, message, duration_ms, details_json, ran_at)
             VALUES (?, ?, ?, ?, ?, ?)
             RETURNING *`,
        )
        .bind(
            input.check_id,
            input.severity,
            input.message,
            input.duration_ms,
            details,
            ranAt,
        )
        .first<RunRow>();
    if (!result) throw new Error('insertRun: INSERT não retornou row');
    return result;
}

export async function listRunsByCheck(
    db: D1Database,
    checkId: number,
    options: { since?: number; limit?: number } = {},
): Promise<RunRow[]> {
    const since = options.since ?? 0;
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 1000);
    const result = await db
        .prepare(
            `SELECT * FROM runs
             WHERE check_id = ? AND ran_at >= ?
             ORDER BY ran_at DESC
             LIMIT ?`,
        )
        .bind(checkId, since, limit)
        .all<RunRow>();
    return result.results ?? [];
}

// Para o "Overview": último run de cada check. Usa subquery ao invés de
// GROUP BY pra ter o row inteiro (não só as colunas agregadas).
export async function latestRunPerCheck(
    db: D1Database,
): Promise<Array<RunRow & { check_name: string }>> {
    const result = await db
        .prepare(
            `SELECT r.*, c.name as check_name
             FROM runs r
             INNER JOIN checks c ON c.id = r.check_id
             WHERE r.id IN (
                 SELECT MAX(id) FROM runs GROUP BY check_id
             )
             ORDER BY c.name`,
        )
        .all<RunRow & { check_name: string }>();
    return result.results ?? [];
}

export async function listFailingRuns(
    db: D1Database,
    options: { since?: number; limit?: number } = {},
): Promise<RunRow[]> {
    const since = options.since ?? 0;
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 1000);
    const result = await db
        .prepare(
            `SELECT * FROM runs
             WHERE severity IN ('warn', 'critical') AND ran_at >= ?
             ORDER BY ran_at DESC
             LIMIT ?`,
        )
        .bind(since, limit)
        .all<RunRow>();
    return result.results ?? [];
}
