import type { Check } from '../types.ts';

export interface ContentSentinelConfig {
    url: string;
    // Padrões que DEVEM estar presentes no body. Se algum sumir → crítico.
    mustContain: (string | RegExp)[];
    // Padrões que NÃO podem aparecer (sinais comuns de defacement). Opcional.
    mustNotContain?: (string | RegExp)[];
}

function matches(pattern: string | RegExp, body: string): boolean {
    return typeof pattern === 'string' ? body.includes(pattern) : pattern.test(body);
}

export function createContentSentinelCheck(name: string, cfg: ContentSentinelConfig): Check {
    return {
        name,
        async run(ctx) {
            const t0 = ctx.now();
            const res = await ctx.fetch(cfg.url, { method: 'GET', redirect: 'follow' });
            if (!res.ok) {
                await res.body?.cancel();
                return {
                    name,
                    severity: 'critical',
                    message: `fetch retornou ${res.status} pra ${cfg.url}`,
                    durationMs: ctx.now() - t0,
                };
            }

            const body = await res.text();
            const missing: string[] = [];
            const found: string[] = [];

            for (const p of cfg.mustContain) {
                if (!matches(p, body)) missing.push(String(p));
            }
            for (const p of cfg.mustNotContain ?? []) {
                if (matches(p, body)) found.push(String(p));
            }

            const problems: string[] = [];
            if (missing.length > 0) problems.push(`sentinels sumidos: ${missing.join(', ')}`);
            if (found.length > 0) problems.push(`padrões proibidos encontrados: ${found.join(', ')}`);

            return {
                name,
                severity: problems.length > 0 ? 'critical' : 'ok',
                message:
                    problems.length > 0
                        ? problems.join(' | ')
                        : `OK (${cfg.mustContain.length} sentinels presentes, ${body.length} bytes)`,
                details:
                    problems.length > 0
                        ? { url: cfg.url, missing, found, bodySize: body.length }
                        : undefined,
                durationMs: ctx.now() - t0,
            };
        },
    };
}
