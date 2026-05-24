// Exemplo: config completo monitorando uma landing + worker + binário de
// download (caso real do projeto Sonda — recuperação de arquivos em pendrives).
//
// Como usar no seu fork:
//   1. Adicione as vars abaixo em wrangler.toml > [vars] (ou ajuste os defaults
//      e use secrets onde fizer sentido).
//   2. Em ../src/index.ts, importe e registre:
//          import { buildSondaChecks } from '../examples/sonda/config.ts';
//          const APPS: AppConfig[] = [
//              { name: 'sonda', buildChecks: buildSondaChecks },
//          ];
//   3. Garanta que [triggers].crons em wrangler.toml inclui '0 * * * *'
//      (cron horário) — é nele que o check de integrity (pesado) roda.

import type { Check } from '../../src/types.ts';
import type { Env } from '../../src/index.ts';
import { createPerformanceCheck } from '../../src/checks/performance.ts';
import { createRedirectChainCheck } from '../../src/checks/redirectChain.ts';
import { createContentSentinelCheck } from '../../src/checks/contentSentinel.ts';
import { createIntegrityCheck } from '../../src/checks/integrity.ts';

export interface SondaEnv extends Env {
    SONDA_LANDING_URL: string;
    SONDA_API_URL: string;
    SONDA_DOWNLOAD_URL: string;
    SONDA_RELEASES_REPO: string;
    PERF_WARN_MS: string;
    PERF_CRITICAL_MS: string;
}

// Checks leves rodam em todo cron tick (ex.: */5). Integrity (que baixa
// ~2.5MB) só roda no cron horário ('0 * * * *') — adicione esse trigger no
// wrangler.toml se ainda não existir.
export function buildSondaChecks(env: SondaEnv, cron: string): Check[] {
    const warn = Number(env.PERF_WARN_MS);
    const crit = Number(env.PERF_CRITICAL_MS);

    const checks: Check[] = [
        createPerformanceCheck('sonda.performance', [
            { url: env.SONDA_LANDING_URL, warnMs: warn, criticalMs: crit },
            { url: `${env.SONDA_LANDING_URL}/pt-BR`, warnMs: warn, criticalMs: crit },
            { url: `${env.SONDA_LANDING_URL}/es`, warnMs: warn, criticalMs: crit },
            { url: `${env.SONDA_API_URL}/`, warnMs: warn, criticalMs: crit },
        ]),

        createRedirectChainCheck('sonda.download_redirect_chain', {
            startUrl: env.SONDA_DOWNLOAD_URL,
            allowedHosts: [
                'sonda-recover.com',
                'api.sonda-recover.com',
                'github.com',
                '.githubusercontent.com',
            ],
            finalHost: '.githubusercontent.com',
        }),

        createContentSentinelCheck('sonda.landing_defacement', {
            url: env.SONDA_LANDING_URL,
            mustContain: [
                'Sonda',
                'sonda-setup-x64.exe',
                'mailto:contato@sonda-recover.com',
                'href="https://sonda-recover.com/pt-BR"',
            ],
            mustNotContain: [
                /hacked by/i,
                /pwned by/i,
                /defaced/i,
                /<script[^>]*>[^<]{0,200}\beval\s*\(/i,
            ],
        }),

        createContentSentinelCheck('sonda.security_txt', {
            url: `${env.SONDA_LANDING_URL}/.well-known/security.txt`,
            mustContain: ['security@sonda-recover.com', 'Canonical: https://sonda-recover.com'],
        }),
    ];

    if (cron === '0 * * * *') {
        checks.push(
            createIntegrityCheck('sonda.download_integrity', {
                downloadUrl: env.SONDA_DOWNLOAD_URL,
                releasesRepo: env.SONDA_RELEASES_REPO,
                assetName: 'sonda-setup-x64.exe',
            }),
        );
    }

    return checks;
}
