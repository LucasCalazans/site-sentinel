import type { CheckResult } from '../types.ts';
import { fireRoutine, buildFireText } from '../reporters/routine.ts';

// Edge-trigger persistente pro modelo runAllApps (deploy/sonda), que NÃO usa as
// tabelas runs/checks. Guarda a última severidade por (app, check) em
// `check_state` (num D1 dedicado e mínimo) e acorda a rotina só na TRANSIÇÃO
// ok→falha — não a cada cron tick enquanto a falha persiste (senão um outage de
// 2h viraria ~24 sessões e PRs duplicados).

interface StateRow {
    check_name: string;
    severity: string;
}

export async function getLastSeverities(
    db: D1Database,
    app: string,
): Promise<Map<string, string>> {
    const res = await db
        .prepare('SELECT check_name, severity FROM check_state WHERE app = ?')
        .bind(app)
        .all<StateRow>();
    const m = new Map<string, string>();
    for (const r of res.results ?? []) m.set(r.check_name, r.severity);
    return m;
}

export async function saveSeverities(
    db: D1Database,
    app: string,
    results: CheckResult[],
    now: number,
): Promise<void> {
    if (results.length === 0) return;
    const stmt = db.prepare(
        `INSERT INTO check_state (app, check_name, severity, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(app, check_name)
         DO UPDATE SET severity = excluded.severity, updated_at = excluded.updated_at`,
    );
    await db.batch(results.map((r) => stmt.bind(app, r.name, r.severity, now)));
}

// Checks que entraram em falha AGORA: severity != ok e o estado anterior era
// ok (ou inexistente — primeira vez que vemos o check).
export function newlyFailing(
    prev: Map<string, string>,
    results: CheckResult[],
): CheckResult[] {
    return results.filter(
        (r) => r.severity !== 'ok' && (prev.get(r.name) ?? 'ok') === 'ok',
    );
}

export interface FireGateResult {
    fired: boolean;
    transitioned: number;
    error?: string;
}

// Orquestra o edge-trigger: lê estado anterior, computa transições ok→falha,
// dispara a rotina (best-effort) e SEMPRE persiste o novo estado (mesmo sem
// disparar — senão a próxima rodada veria tudo como "novo").
export async function fireRoutineOnTransition(opts: {
    db: D1Database;
    app: string;
    results: CheckResult[];
    fireUrl?: string;
    fireToken?: string;
    now: number;
}): Promise<FireGateResult> {
    const { db, app, results, fireUrl, fireToken, now } = opts;
    const prev = await getLastSeverities(db, app);
    const fresh = newlyFailing(prev, results);
    await saveSeverities(db, app, results, now);

    if (fresh.length === 0) return { fired: false, transitioned: 0 };
    if (!fireUrl || !fireToken) {
        return { fired: false, transitioned: fresh.length, error: 'ROUTINE_FIRE_URL/TOKEN ausente' };
    }
    try {
        await fireRoutine(fireUrl, fireToken, buildFireText(fresh.map((result) => ({ app, result }))));
        return { fired: true, transitioned: fresh.length };
    } catch (err) {
        return { fired: false, transitioned: fresh.length, error: (err as Error).message };
    }
}
