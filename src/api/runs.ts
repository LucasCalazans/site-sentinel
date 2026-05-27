// Handlers REST pra /api/runs. Read-only — runs são criadas pelo scheduled
// handler, não pelo cliente.

import {
    latestRunPerCheck,
    listFailingRuns,
    listRunsByCheck,
} from '../db/runs.ts';
import type { RunRow } from '../db/types.ts';
import { badRequest, jsonResponse } from './responses.ts';
import type { RouteContext } from './router.ts';
import { parsePositiveInt } from './validation.ts';

export interface WireRun {
    id: number;
    check_id: number;
    severity: string;
    message: string;
    duration_ms: number;
    details: unknown;
    ran_at: number;
}

export function runToWire(row: RunRow): WireRun {
    let details: unknown = null;
    if (row.details_json) {
        try {
            details = JSON.parse(row.details_json);
        } catch {
            details = { _error: 'details_json inválido', raw: row.details_json };
        }
    }
    return {
        id: row.id,
        check_id: row.check_id,
        severity: row.severity,
        message: row.message,
        duration_ms: row.duration_ms,
        details,
        ran_at: row.ran_at,
    };
}

export async function listRunsHandler({ env, url }: RouteContext): Promise<Response> {
    const checkIdRaw = url.searchParams.get('check_id');
    const since = parsePositiveInt(url.searchParams.get('since'), 0);
    const limit = parsePositiveInt(url.searchParams.get('limit'), 100, 1000);

    if (checkIdRaw === null) {
        return badRequest('check_id é obrigatório');
    }
    const checkId = Number.parseInt(checkIdRaw, 10);
    if (!Number.isFinite(checkId) || checkId <= 0) {
        return badRequest('check_id inválido');
    }
    const rows = await listRunsByCheck(env.DB, checkId, { since, limit });
    return jsonResponse({ runs: rows.map(runToWire) });
}

export async function latestRunsHandler({ env }: RouteContext): Promise<Response> {
    const rows = await latestRunPerCheck(env.DB);
    return jsonResponse({
        runs: rows.map((row) => ({
            ...runToWire(row),
            check_name: row.check_name,
        })),
    });
}

export async function failingRunsHandler({ env, url }: RouteContext): Promise<Response> {
    const since = parsePositiveInt(url.searchParams.get('since'), 0);
    const limit = parsePositiveInt(url.searchParams.get('limit'), 100, 1000);
    const rows = await listFailingRuns(env.DB, { since, limit });
    return jsonResponse({ runs: rows.map(runToWire) });
}
