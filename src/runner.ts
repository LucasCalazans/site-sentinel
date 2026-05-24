import type { Check, CheckContext, CheckResult } from './types.ts';

export async function runChecks(checks: Check[], ctx: CheckContext): Promise<CheckResult[]> {
    return Promise.all(
        checks.map(async (c): Promise<CheckResult> => {
            const t0 = ctx.now();
            try {
                return await c.run(ctx);
            } catch (err) {
                return {
                    name: c.name,
                    severity: 'critical',
                    message: `check threw: ${err instanceof Error ? err.message : String(err)}`,
                    details: err instanceof Error && err.stack ? { stack: err.stack } : undefined,
                    durationMs: ctx.now() - t0,
                };
            }
        }),
    );
}
