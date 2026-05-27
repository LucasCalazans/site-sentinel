import { listAlerts } from '../db/alerts.ts';
import type { AlertRow } from '../db/types.ts';
import { jsonResponse } from './responses.ts';
import type { RouteContext } from './router.ts';
import { parsePositiveInt } from './validation.ts';

export interface WireAlert {
    id: number;
    run_id: number;
    channel: string;
    status: string;
    error_message: string | null;
    sent_at: number;
}

export function alertToWire(row: AlertRow): WireAlert {
    return {
        id: row.id,
        run_id: row.run_id,
        channel: row.channel,
        status: row.status,
        error_message: row.error_message,
        sent_at: row.sent_at,
    };
}

export async function listAlertsHandler({ env, url }: RouteContext): Promise<Response> {
    const since = parsePositiveInt(url.searchParams.get('since'), 0);
    const limit = parsePositiveInt(url.searchParams.get('limit'), 100, 1000);
    const rows = await listAlerts(env.DB, { since, limit });
    return jsonResponse({ alerts: rows.map(alertToWire) });
}
