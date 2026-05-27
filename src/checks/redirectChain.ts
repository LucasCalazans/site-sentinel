import type { Check } from '../types.ts';

export interface RedirectChainConfig {
    startUrl: string;
    // Whitelist de hosts. Todo hop visitado deve ter hostname casando com
    // algum item dessa lista. Suporta sufixo: ".foo.com" casa "x.foo.com"
    // mas NÃO casa "foo.com" exato (use "foo.com" explícito pra isso).
    allowedHosts: string[];
    // Hostname (ou sufixo) que o destino final deve ter. Opcional.
    finalHost?: string;
    // Se true (default), o destino final deve retornar 2xx.
    expectOk?: boolean;
    maxHops?: number;
}

interface Hop {
    url: string;
    status: number;
    location?: string;
}

function hostMatches(actual: string, pattern: string): boolean {
    if (pattern.startsWith('.')) return actual.endsWith(pattern);
    return actual === pattern;
}

function hostInAny(actual: string, patterns: string[]): boolean {
    return patterns.some((p) => hostMatches(actual, p));
}

export function createRedirectChainCheck(name: string, cfg: RedirectChainConfig): Check {
    return {
        name,
        async run(ctx) {
            const t0 = ctx.now();
            const maxHops = cfg.maxHops ?? 10;
            const expectOk = cfg.expectOk ?? true;
            const visited: Hop[] = [];
            let currentUrl = cfg.startUrl;

            for (let i = 0; i < maxHops; i++) {
                const res = await ctx.fetch(currentUrl, {
                    method: 'GET',
                    redirect: 'manual',
                    // UA explícito pra a telemetria do destino conseguir
                    // filtrar nossos hits (regex de bot do sonda-license bate
                    // em 'monitor'). Sem isso, default workerd vai vazio e
                    // os hits entram como is_likely_bot=0.
                    headers: { 'User-Agent': 'site-sentinel-monitor/0.2' },
                });
                await res.body?.cancel();
                const location = res.headers.get('Location') ?? undefined;
                visited.push({ url: currentUrl, status: res.status, location });

                if (res.status >= 300 && res.status < 400 && location) {
                    currentUrl = new URL(location, currentUrl).toString();
                } else {
                    break;
                }
            }

            const issues: string[] = [];

            for (const hop of visited) {
                const host = new URL(hop.url).hostname;
                if (!hostInAny(host, cfg.allowedHosts)) {
                    issues.push(`hop ${host} não está na whitelist (${cfg.allowedHosts.join(', ')})`);
                }
            }

            const final = visited[visited.length - 1];
            if (!final) {
                issues.push('nenhum hop visitado');
            } else {
                if (cfg.finalHost) {
                    const finalHost = new URL(final.url).hostname;
                    if (!hostMatches(finalHost, cfg.finalHost)) {
                        issues.push(`destino final ${finalHost} ≠ esperado ${cfg.finalHost}`);
                    }
                }
                if (expectOk && (final.status < 200 || final.status >= 300)) {
                    issues.push(`destino final ${final.url} retornou ${final.status} (esperado 2xx)`);
                }
            }
            if (visited.length >= maxHops && final?.status && final.status >= 300 && final.status < 400) {
                issues.push(`chain estourou maxHops=${maxHops} sem destino final`);
            }

            return {
                name,
                severity: issues.length > 0 ? 'critical' : 'ok',
                message:
                    issues.length > 0
                        ? issues.join('; ')
                        : `chain OK (${visited.length} hops, final ${final?.status})`,
                details: { chain: visited },
                durationMs: ctx.now() - t0,
            };
        },
    };
}
