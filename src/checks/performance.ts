import type { Check, Severity } from '../types.ts';

export interface PerfTarget {
    url: string;
    expectStatus?: number;
    warnMs: number;
    criticalMs: number;
}

type Outcome =
    | { kind: 'ok'; url: string; status: number; elapsedMs: number; target: PerfTarget }
    | { kind: 'err'; url: string; error: string; elapsedMs: number; target: PerfTarget };

export function createPerformanceCheck(name: string, targets: PerfTarget[]): Check {
    return {
        name,
        async run(ctx) {
            const t0 = ctx.now();

            const outcomes: Outcome[] = await Promise.all(
                targets.map(async (t): Promise<Outcome> => {
                    const start = ctx.now();
                    try {
                        const res = await ctx.fetch(t.url, { method: 'GET', redirect: 'follow' });
                        const elapsed = ctx.now() - start;
                        await res.body?.cancel();
                        return { kind: 'ok', url: t.url, status: res.status, elapsedMs: elapsed, target: t };
                    } catch (err) {
                        return {
                            kind: 'err',
                            url: t.url,
                            error: err instanceof Error ? err.message : String(err),
                            elapsedMs: ctx.now() - start,
                            target: t,
                        };
                    }
                }),
            );

            let worst: Severity = 'ok';
            const problems: string[] = [];

            const bump = (s: Severity) => {
                if (s === 'critical') worst = 'critical';
                else if (s === 'warn' && worst === 'ok') worst = 'warn';
            };

            for (const o of outcomes) {
                if (o.kind === 'err') {
                    bump('critical');
                    problems.push(`${o.url}: ${o.error}`);
                    continue;
                }
                const expect = o.target.expectStatus ?? 200;
                if (o.status !== expect) {
                    bump('critical');
                    problems.push(`${o.url}: HTTP ${o.status} (esperado ${expect})`);
                } else if (o.elapsedMs > o.target.criticalMs) {
                    bump('critical');
                    problems.push(`${o.url}: ${o.elapsedMs}ms > critical ${o.target.criticalMs}ms`);
                } else if (o.elapsedMs > o.target.warnMs) {
                    bump('warn');
                    problems.push(`${o.url}: ${o.elapsedMs}ms > warn ${o.target.warnMs}ms`);
                }
            }

            return {
                name,
                severity: worst,
                message: worst === 'ok' ? `${targets.length} targets OK` : problems.join('; '),
                details: {
                    results: outcomes.map((o) =>
                        o.kind === 'err'
                            ? { url: o.url, error: o.error, elapsedMs: o.elapsedMs }
                            : { url: o.url, status: o.status, elapsedMs: o.elapsedMs },
                    ),
                },
                durationMs: ctx.now() - t0,
            };
        },
    };
}
