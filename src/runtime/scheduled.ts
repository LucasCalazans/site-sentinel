// Handler do cron. Lê checks habilitados do D1 pro cron pattern atual,
// roda, grava runs + alerts, posta Discord. Implementação completa
// em runScheduled — a factory de checks usa src/checks/factory.ts.

import type { Env } from '../api/env.ts';
import { listEnabledForCron } from '../db/checks.ts';
import { insertAlert } from '../db/alerts.ts';
import { insertRun, latestRunPerCheck } from '../db/runs.ts';
import { runChecks } from '../runner.ts';
import { postToDiscord } from '../reporters/discord.ts';
import { fireRoutine, buildFireText } from '../reporters/routine.ts';
import { buildCheckFromRow } from '../checks/factory.ts';
import { syncCloudflare, syncGitHub, type SyncResult } from '../integrations/sync.ts';
import { prunePastSnapshots } from '../db/integrations.ts';
import type { CheckResult } from '../types.ts';

// Cron que dispara o sync de integrações pesado. Coincide com o cron
// horário já usado pro integrity check — uma vez por hora bate na CF e GH.
const SYNC_CRON = '0 * * * *';

export interface ScheduledSummary {
    cron: string;
    total: number;
    ran: number;
    failing: number;
    results: Array<{
        check_id: number;
        name: string;
        severity: string;
        message: string;
        duration_ms: number;
    }>;
    sync?: SyncResult[];
}

export async function runScheduled(env: Env, cron: string): Promise<ScheduledSummary> {
    const rows = await listEnabledForCron(env.DB, cron);

    // Constrói Check pra cada row do D1. Se a config_json é inválida, conta
    // como falha "critical" sem rodar — UI vê o problema na próxima query.
    const fcontext = { githubToken: env.GITHUB_TOKEN };
    const checks = rows.map((row) => {
        try {
            return {
                row,
                check: buildCheckFromRow(row, fcontext),
                error: null as string | null,
            };
        } catch (err) {
            return { row, check: null, error: (err as Error).message };
        }
    });

    const results: Array<{ row: typeof rows[number]; result: CheckResult }> = [];

    // Roda em paralelo só os que tiveram factory bem-sucedida.
    const runnable = checks.filter((c) => c.check !== null);
    const runResults = await runChecks(
        runnable.map((c) => c.check!),
        {
            fetch: (input, init) => globalThis.fetch(input, init),
            now: () => Date.now(),
        },
    );
    for (let i = 0; i < runnable.length; i++) {
        const entry = runnable[i];
        const result = runResults[i];
        if (entry && result) results.push({ row: entry.row, result });
    }

    // Adiciona os erros de factory como runs criticais.
    for (const entry of checks) {
        if (entry.error) {
            results.push({
                row: entry.row,
                result: {
                    name: entry.row.name,
                    severity: 'critical',
                    message: `factory falhou: ${entry.error}`,
                    durationMs: 0,
                },
            });
        }
    }

    // Severidade anterior por check, lida ANTES de inserir as runs novas
    // (latestRunPerCheck olha MAX(id) por check = estado da rodada passada).
    // Base do edge-trigger: só acordamos a rotina quando um check TRANSICIONA
    // ok→falha, não a cada tick enquanto a falha persiste — senão um outage de
    // 2h dispararia ~24 sessões e PRs duplicados.
    const prevSeverity = new Map<number, string>();
    for (const r of await latestRunPerCheck(env.DB)) {
        prevSeverity.set(r.check_id, r.severity);
    }

    // Persiste runs + alerts.
    const failingResults: CheckResult[] = [];
    const newlyFailing: Array<{ app: string; result: CheckResult; runId: number }> = [];
    let failingCount = 0;
    for (const { row, result } of results) {
        const runRow = await insertRun(env.DB, {
            check_id: row.id,
            severity: result.severity,
            message: result.message,
            duration_ms: result.durationMs,
            details: result.details,
        });
        if (result.severity !== 'ok') {
            failingCount++;
            failingResults.push(result);
            // Transição ok→falha (ou primeira run do check) → candidato a fire.
            if ((prevSeverity.get(row.id) ?? 'ok') === 'ok') {
                newlyFailing.push({ app: row.app_label, result, runId: runRow.id });
            }
            // Posta Discord (best-effort) e grava alert.
            if (env.DISCORD_WEBHOOK_URL) {
                try {
                    await postToDiscord(env.DISCORD_WEBHOOK_URL, row.app_label, [result]);
                    await insertAlert(env.DB, {
                        run_id: runRow.id,
                        channel: 'discord',
                        status: 'sent',
                    });
                } catch (err) {
                    await insertAlert(env.DB, {
                        run_id: runRow.id,
                        channel: 'discord',
                        status: 'failed',
                        error_message: (err as Error).message,
                    });
                }
            } else {
                await insertAlert(env.DB, {
                    run_id: runRow.id,
                    channel: 'discord',
                    status: 'skipped',
                });
            }
        }
    }

    // Event-driven: acorda a rotina Claude Code UMA vez quando há check(s)
    // entrando em falha agora. Best-effort — erro aqui não derruba o cron
    // (Discord já alertou). Dedup de PR é responsabilidade da própria rotina.
    if (newlyFailing.length > 0) {
        if (env.ROUTINE_FIRE_URL && env.ROUTINE_FIRE_TOKEN) {
            let status: 'sent' | 'failed' = 'sent';
            let errMsg: string | null = null;
            try {
                await fireRoutine(
                    env.ROUTINE_FIRE_URL,
                    env.ROUTINE_FIRE_TOKEN,
                    buildFireText(newlyFailing.map(({ app, result }) => ({ app, result }))),
                );
            } catch (err) {
                status = 'failed';
                errMsg = (err as Error).message;
            }
            for (const n of newlyFailing) {
                await insertAlert(env.DB, {
                    run_id: n.runId,
                    channel: 'routine',
                    status,
                    error_message: errMsg,
                });
            }
        } else {
            // Sem credencial configurada → registra skipped pra observabilidade.
            for (const n of newlyFailing) {
                await insertAlert(env.DB, { run_id: n.runId, channel: 'routine', status: 'skipped' });
            }
        }
    }

    // Sync horário: dispara CF + GH e mantém só os últimos 30 snapshots por kind.
    let sync: SyncResult[] | undefined;
    if (cron === SYNC_CRON) {
        sync = [];
        try {
            sync.push(await syncCloudflare(env));
        } catch (err) {
            sync.push({
                integration: 'cloudflare',
                snapshots: 0,
                errors: [(err as Error).message],
            });
        }
        try {
            sync.push(await syncGitHub(env));
        } catch (err) {
            sync.push({
                integration: 'github',
                snapshots: 0,
                errors: [(err as Error).message],
            });
        }
        await prunePastSnapshots(env.DB, 30);
    }

    return {
        cron,
        total: rows.length,
        ran: results.length,
        failing: failingCount,
        results: results.map(({ row, result }) => ({
            check_id: row.id,
            name: row.name,
            severity: result.severity,
            message: result.message,
            duration_ms: result.durationMs,
        })),
        sync,
    };
}
