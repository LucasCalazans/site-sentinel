import { runChecks } from './runner.ts';
import { postToDiscord } from './reporters/discord.ts';
import type { Check } from './types.ts';

// Estenda este Env no seu fork pra adicionar as vars que seus configs consomem.
// Tudo declarado aqui vira propriedade do `env` injetado pelo runtime do
// Cloudflare Worker — vindo de `[vars]` em wrangler.toml ou de secrets
// (`wrangler secret put`).
export interface Env {
    DISCORD_WEBHOOK_URL: string;
}

export interface AppConfig<E extends Env = Env> {
    name: string;
    // Recebe o cron que disparou (string igual ao item de `[triggers].crons`),
    // pra você poder filtrar checks pesados pra ticks menos frequentes.
    buildChecks(env: E, cron: string): Check[];
}

// =========================================================================
//  Registre seus apps aqui.
//
//  Veja examples/sonda/ pra um config completo de referência (4 checks +
//  cron split entre tick leve e tick horário). Pra ativar o exemplo,
//  importe de `../examples/sonda/config.ts` e adicione ao array abaixo.
// =========================================================================
const APPS: AppConfig[] = [];

export default {
    async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        ctx.waitUntil(runAllApps(env, event.cron));
    },

    // HTTP fallback útil pra debug local (wrangler dev) ou trigger manual.
    async fetch(req: Request, env: Env): Promise<Response> {
        const url = new URL(req.url);
        if (url.pathname === '/run') {
            const cron = url.searchParams.get('cron') ?? '*/5 * * * *';
            const summary = await runAllApps(env, cron);
            return Response.json(summary);
        }
        return new Response('site-sentinel — POST /run?cron=... pra disparar manualmente', {
            status: 200,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    },
};

async function runAllApps(env: Env, cron: string) {
    const summary: Record<string, unknown> = { cron, apps: [] as unknown[] };
    const apps = summary.apps as unknown[];

    for (const app of APPS) {
        const checks = app.buildChecks(env, cron);
        // fetch precisa estar com `this` ligado ao globalThis no Worker —
        // passar a ref nua quebra com "Illegal invocation". Wrapamos em arrow
        // pra preservar o binding. Mesma defesa pra Date.now por uniformidade.
        const results = await runChecks(checks, {
            fetch: (input, init) => globalThis.fetch(input, init),
            now: () => Date.now(),
        });
        const failing = results.filter((r) => r.severity !== 'ok');

        if (failing.length > 0 && env.DISCORD_WEBHOOK_URL) {
            try {
                await postToDiscord(env.DISCORD_WEBHOOK_URL, app.name, results);
            } catch (err) {
                console.error(`discord webhook failed for ${app.name}:`, err);
            }
        }

        apps.push({
            app: app.name,
            total: results.length,
            failing: failing.length,
            results: results.map((r) => ({
                name: r.name,
                severity: r.severity,
                message: r.message,
                durationMs: r.durationMs,
            })),
        });
    }

    return summary;
}
