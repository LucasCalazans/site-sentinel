// Factory: converte uma CheckRow (config armazenada como JSON no D1) em uma
// instância Check executável. Discriminated por `type`. Lança Error com
// mensagem clara se config_json for inválido — handler de erro registra
// como run "critical" pro usuário ver no dashboard.

import type { Check } from '../types.ts';
import type { CheckRow } from '../db/types.ts';
import {
    createPerformanceCheck,
    type PerfTarget,
} from './performance.ts';
import {
    createContentSentinelCheck,
    type ContentSentinelConfig,
} from './contentSentinel.ts';
import {
    createRedirectChainCheck,
    type RedirectChainConfig,
} from './redirectChain.ts';
import { createIntegrityCheck, type IntegrityConfig } from './integrity.ts';

export interface FactoryContext {
    // Token usado pro check integrity quando a config não traz githubToken
    // próprio. Vem de env.GITHUB_TOKEN em runtime.
    githubToken?: string;
}

// Patterns regex no D1 ficam como `{pattern, flags}` (JSON não suporta
// RegExp diretamente). Converte de volta pra RegExp, ou aceita string
// literal pra busca substring.
function parsePattern(input: unknown): string | RegExp {
    if (typeof input === 'string') return input;
    if (input && typeof input === 'object') {
        const obj = input as { pattern?: unknown; flags?: unknown };
        if (typeof obj.pattern === 'string') {
            const flags = typeof obj.flags === 'string' ? obj.flags : '';
            return new RegExp(obj.pattern, flags);
        }
    }
    throw new Error(`pattern inválido: ${JSON.stringify(input)}`);
}

export function buildCheckFromRow(
    row: CheckRow,
    fcontext: FactoryContext = {},
): Check {
    let config: unknown;
    try {
        config = JSON.parse(row.config_json);
    } catch (err) {
        throw new Error(`config_json inválido (${(err as Error).message})`);
    }
    if (config === null || typeof config !== 'object') {
        throw new Error('config_json deve ser objeto');
    }
    switch (row.type) {
        case 'performance':
            return buildPerformance(row.name, config as Record<string, unknown>);
        case 'content_sentinel':
            return buildContentSentinel(
                row.name,
                config as Record<string, unknown>,
            );
        case 'redirect_chain':
            return buildRedirectChain(row.name, config as Record<string, unknown>);
        case 'integrity':
            return buildIntegrity(
                row.name,
                config as Record<string, unknown>,
                fcontext,
            );
    }
}

function buildPerformance(name: string, config: Record<string, unknown>): Check {
    const targets = config.targets;
    if (!Array.isArray(targets) || targets.length === 0) {
        throw new Error('performance config: targets[] obrigatório (não-vazio)');
    }
    for (const t of targets) {
        if (
            !t ||
            typeof t !== 'object' ||
            typeof (t as PerfTarget).url !== 'string' ||
            typeof (t as PerfTarget).warnMs !== 'number' ||
            typeof (t as PerfTarget).criticalMs !== 'number'
        ) {
            throw new Error(
                'performance target inválido: precisa de url, warnMs, criticalMs',
            );
        }
    }
    return createPerformanceCheck(name, targets as PerfTarget[]);
}

function buildContentSentinel(
    name: string,
    config: Record<string, unknown>,
): Check {
    if (typeof config.url !== 'string') {
        throw new Error('content_sentinel: url obrigatório');
    }
    if (!Array.isArray(config.mustContain)) {
        throw new Error('content_sentinel: mustContain[] obrigatório');
    }
    const mustContain = config.mustContain.map(parsePattern);
    const mustNotContain = Array.isArray(config.mustNotContain)
        ? config.mustNotContain.map(parsePattern)
        : undefined;
    const cfg: ContentSentinelConfig = {
        url: config.url,
        mustContain,
        mustNotContain,
    };
    return createContentSentinelCheck(name, cfg);
}

function buildRedirectChain(
    name: string,
    config: Record<string, unknown>,
): Check {
    if (typeof config.startUrl !== 'string') {
        throw new Error('redirect_chain: startUrl obrigatório');
    }
    if (!Array.isArray(config.allowedHosts)) {
        throw new Error('redirect_chain: allowedHosts[] obrigatório');
    }
    for (const h of config.allowedHosts) {
        if (typeof h !== 'string') {
            throw new Error('redirect_chain: allowedHosts deve ser string[]');
        }
    }
    const cfg: RedirectChainConfig = {
        startUrl: config.startUrl,
        allowedHosts: config.allowedHosts as string[],
        finalHost: typeof config.finalHost === 'string' ? config.finalHost : undefined,
        expectOk: typeof config.expectOk === 'boolean' ? config.expectOk : undefined,
        maxHops: typeof config.maxHops === 'number' ? config.maxHops : undefined,
    };
    return createRedirectChainCheck(name, cfg);
}

function buildIntegrity(
    name: string,
    config: Record<string, unknown>,
    fcontext: FactoryContext,
): Check {
    if (typeof config.downloadUrl !== 'string') {
        throw new Error('integrity: downloadUrl obrigatório');
    }
    if (typeof config.releasesRepo !== 'string') {
        throw new Error('integrity: releasesRepo obrigatório');
    }
    if (typeof config.assetName !== 'string') {
        throw new Error('integrity: assetName obrigatório');
    }
    const cfg: IntegrityConfig = {
        downloadUrl: config.downloadUrl,
        releasesRepo: config.releasesRepo,
        assetName: config.assetName,
        githubToken:
            typeof config.githubToken === 'string'
                ? config.githubToken
                : fcontext.githubToken,
    };
    return createIntegrityCheck(name, cfg);
}
