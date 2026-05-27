// CRUD da tabela `checks`. Cada função recebe o binding D1Database (não
// dependência implícita em env) — facilita teste e composição.

import type { CheckRow, CheckType } from './types.ts';

export interface CreateCheckInput {
    name: string;
    type: CheckType;
    config: unknown;
    enabled?: boolean;
    cron_pattern: string;
    app_label: string;
}

export interface UpdateCheckInput {
    name?: string;
    type?: CheckType;
    config?: unknown;
    enabled?: boolean;
    cron_pattern?: string;
    app_label?: string;
}

export async function listChecks(db: D1Database): Promise<CheckRow[]> {
    const result = await db
        .prepare('SELECT * FROM checks ORDER BY name')
        .all<CheckRow>();
    return result.results ?? [];
}

export async function listChecksByApp(
    db: D1Database,
    appLabel: string,
): Promise<CheckRow[]> {
    const result = await db
        .prepare('SELECT * FROM checks WHERE app_label = ? ORDER BY name')
        .bind(appLabel)
        .all<CheckRow>();
    return result.results ?? [];
}

export async function getCheck(
    db: D1Database,
    id: number,
): Promise<CheckRow | null> {
    return await db
        .prepare('SELECT * FROM checks WHERE id = ?')
        .bind(id)
        .first<CheckRow>();
}

export async function getCheckByName(
    db: D1Database,
    name: string,
): Promise<CheckRow | null> {
    return await db
        .prepare('SELECT * FROM checks WHERE name = ?')
        .bind(name)
        .first<CheckRow>();
}

export async function createCheck(
    db: D1Database,
    input: CreateCheckInput,
): Promise<CheckRow> {
    const now = Date.now();
    const result = await db
        .prepare(
            `INSERT INTO checks (name, type, config_json, enabled, cron_pattern, app_label, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             RETURNING *`,
        )
        .bind(
            input.name,
            input.type,
            JSON.stringify(input.config),
            (input.enabled ?? true) ? 1 : 0,
            input.cron_pattern,
            input.app_label,
            now,
            now,
        )
        .first<CheckRow>();
    if (!result) {
        throw new Error('createCheck: INSERT não retornou row');
    }
    return result;
}

export async function updateCheck(
    db: D1Database,
    id: number,
    input: UpdateCheckInput,
): Promise<CheckRow | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (input.name !== undefined) {
        fields.push('name = ?');
        values.push(input.name);
    }
    if (input.type !== undefined) {
        fields.push('type = ?');
        values.push(input.type);
    }
    if (input.config !== undefined) {
        fields.push('config_json = ?');
        values.push(JSON.stringify(input.config));
    }
    if (input.enabled !== undefined) {
        fields.push('enabled = ?');
        values.push(input.enabled ? 1 : 0);
    }
    if (input.cron_pattern !== undefined) {
        fields.push('cron_pattern = ?');
        values.push(input.cron_pattern);
    }
    if (input.app_label !== undefined) {
        fields.push('app_label = ?');
        values.push(input.app_label);
    }
    if (fields.length === 0) {
        return await getCheck(db, id);
    }
    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);
    const result = await db
        .prepare(`UPDATE checks SET ${fields.join(', ')} WHERE id = ? RETURNING *`)
        .bind(...values)
        .first<CheckRow>();
    return result ?? null;
}

export async function deleteCheck(
    db: D1Database,
    id: number,
): Promise<boolean> {
    const result = await db
        .prepare('DELETE FROM checks WHERE id = ?')
        .bind(id)
        .run();
    return (result.meta.changes ?? 0) > 0;
}

export async function listEnabledForCron(
    db: D1Database,
    cron: string,
): Promise<CheckRow[]> {
    const result = await db
        .prepare('SELECT * FROM checks WHERE enabled = 1 AND cron_pattern = ?')
        .bind(cron)
        .all<CheckRow>();
    return result.results ?? [];
}
