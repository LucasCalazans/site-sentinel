// Handlers REST pra /api/checks. Auth obrigatória — montados via handler.ts.

import {
    createCheck as dbCreate,
    deleteCheck as dbDelete,
    getCheck as dbGet,
    listChecks as dbList,
    listChecksByApp as dbListByApp,
    updateCheck as dbUpdate,
} from '../db/checks.ts';
import type { CheckRow } from '../db/types.ts';
import { badRequest, jsonResponse, notFound } from './responses.ts';
import type { RouteContext } from './router.ts';
import { parseCreateCheck, parseUpdateCheck } from './validation.ts';

// Shape "wire" — serializado pra UI. Diferente do row do D1: config vira
// objeto (não string), enabled vira boolean.
export interface WireCheck {
    id: number;
    name: string;
    type: string;
    config: unknown;
    enabled: boolean;
    cron_pattern: string;
    app_label: string;
    created_at: number;
    updated_at: number;
}

export function checkToWire(row: CheckRow): WireCheck {
    let config: unknown;
    try {
        config = JSON.parse(row.config_json);
    } catch {
        config = { _error: 'config_json inválido', raw: row.config_json };
    }
    return {
        id: row.id,
        name: row.name,
        type: row.type,
        config,
        enabled: row.enabled === 1,
        cron_pattern: row.cron_pattern,
        app_label: row.app_label,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

export async function listChecksHandler({ env, url }: RouteContext): Promise<Response> {
    const app = url.searchParams.get('app');
    const rows = app
        ? await dbListByApp(env.DB, app)
        : await dbList(env.DB);
    return jsonResponse({ checks: rows.map(checkToWire) });
}

export async function getCheckHandler({ env, params }: RouteContext): Promise<Response> {
    const id = Number.parseInt(params.id ?? '', 10);
    if (!Number.isFinite(id) || id <= 0) return badRequest('id inválido');
    const row = await dbGet(env.DB, id);
    if (!row) return notFound('check não existe');
    return jsonResponse({ check: checkToWire(row) });
}

export async function createCheckHandler({ env, req }: RouteContext): Promise<Response> {
    let raw: unknown;
    try {
        raw = await req.json();
    } catch {
        return badRequest('JSON body inválido');
    }
    const parsed = parseCreateCheck(raw);
    if (!parsed.ok) return jsonResponse(parsed.error, 400);
    try {
        const row = await dbCreate(env.DB, parsed.value);
        return jsonResponse({ check: checkToWire(row) }, 201);
    } catch (err) {
        const msg = (err as Error).message ?? 'erro';
        // UNIQUE constraint do name.
        if (/UNIQUE/i.test(msg)) {
            return jsonResponse({ error: 'name já existe' }, 409);
        }
        throw err;
    }
}

export async function updateCheckHandler({ env, req, params }: RouteContext): Promise<Response> {
    const id = Number.parseInt(params.id ?? '', 10);
    if (!Number.isFinite(id) || id <= 0) return badRequest('id inválido');
    let raw: unknown;
    try {
        raw = await req.json();
    } catch {
        return badRequest('JSON body inválido');
    }
    const parsed = parseUpdateCheck(raw);
    if (!parsed.ok) return jsonResponse(parsed.error, 400);
    try {
        const row = await dbUpdate(env.DB, id, parsed.value);
        if (!row) return notFound('check não existe');
        return jsonResponse({ check: checkToWire(row) });
    } catch (err) {
        const msg = (err as Error).message ?? 'erro';
        if (/UNIQUE/i.test(msg)) {
            return jsonResponse({ error: 'name já existe' }, 409);
        }
        throw err;
    }
}

export async function deleteCheckHandler({ env, params }: RouteContext): Promise<Response> {
    const id = Number.parseInt(params.id ?? '', 10);
    if (!Number.isFinite(id) || id <= 0) return badRequest('id inválido');
    const ok = await dbDelete(env.DB, id);
    if (!ok) return notFound('check não existe');
    return jsonResponse({ deleted: true });
}
