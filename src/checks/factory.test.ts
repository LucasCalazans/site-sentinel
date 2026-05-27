import { describe, expect, it } from 'vitest';
import { buildCheckFromRow } from './factory.ts';
import type { CheckRow } from '../db/types.ts';

function row(overrides: Partial<CheckRow> = {}): CheckRow {
    return {
        id: 1,
        name: 'r',
        type: 'performance',
        config_json: JSON.stringify({ targets: [{ url: 'https://a.com', warnMs: 1, criticalMs: 10 }] }),
        enabled: 1,
        cron_pattern: '*/5 * * * *',
        app_label: 't',
        created_at: 0,
        updated_at: 0,
        ...overrides,
    };
}

describe('buildCheckFromRow — performance', () => {
    it('cria check válido', () => {
        const c = buildCheckFromRow(row());
        expect(c.name).toBe('r');
    });

    it('rejeita targets vazio', () => {
        expect(() =>
            buildCheckFromRow(row({ config_json: JSON.stringify({ targets: [] }) })),
        ).toThrow(/não-vazio/);
    });

    it('rejeita targets ausente', () => {
        expect(() =>
            buildCheckFromRow(row({ config_json: JSON.stringify({}) })),
        ).toThrow(/targets/);
    });

    it('rejeita target sem warnMs', () => {
        expect(() =>
            buildCheckFromRow(
                row({
                    config_json: JSON.stringify({
                        targets: [{ url: 'https://x.com', criticalMs: 1 }],
                    }),
                }),
            ),
        ).toThrow(/warnMs/);
    });

    it('rejeita target não-objeto', () => {
        expect(() =>
            buildCheckFromRow(
                row({
                    config_json: JSON.stringify({ targets: [null] }),
                }),
            ),
        ).toThrow();
    });
});

describe('buildCheckFromRow — content_sentinel', () => {
    it('cria com mustContain strings', () => {
        const c = buildCheckFromRow(
            row({
                type: 'content_sentinel',
                config_json: JSON.stringify({
                    url: 'https://x.com',
                    mustContain: ['hello'],
                }),
            }),
        );
        expect(c.name).toBe('r');
    });

    it('decoda mustContain regex objects', () => {
        const c = buildCheckFromRow(
            row({
                type: 'content_sentinel',
                config_json: JSON.stringify({
                    url: 'https://x.com',
                    mustContain: [{ pattern: 'hello', flags: 'i' }],
                    mustNotContain: [{ pattern: 'bad', flags: 'i' }],
                }),
            }),
        );
        expect(c).toBeDefined();
    });

    it('rejeita url ausente', () => {
        expect(() =>
            buildCheckFromRow(
                row({
                    type: 'content_sentinel',
                    config_json: JSON.stringify({ mustContain: [] }),
                }),
            ),
        ).toThrow(/url/);
    });

    it('rejeita mustContain ausente', () => {
        expect(() =>
            buildCheckFromRow(
                row({
                    type: 'content_sentinel',
                    config_json: JSON.stringify({ url: 'https://x.com' }),
                }),
            ),
        ).toThrow(/mustContain/);
    });

    it('rejeita pattern com shape inválido', () => {
        expect(() =>
            buildCheckFromRow(
                row({
                    type: 'content_sentinel',
                    config_json: JSON.stringify({
                        url: 'https://x.com',
                        mustContain: [{ no_pattern: true }],
                    }),
                }),
            ),
        ).toThrow(/pattern inválido/);
    });

    it('mustNotContain undefined é OK', () => {
        const c = buildCheckFromRow(
            row({
                type: 'content_sentinel',
                config_json: JSON.stringify({
                    url: 'https://x.com',
                    mustContain: ['x'],
                }),
            }),
        );
        expect(c).toBeDefined();
    });

    it('parsePattern aceita string', () => {
        const c = buildCheckFromRow(
            row({
                type: 'content_sentinel',
                config_json: JSON.stringify({
                    url: 'https://x.com',
                    mustContain: ['plain-string'],
                }),
            }),
        );
        expect(c).toBeDefined();
    });

    it('parsePattern rejeita number', () => {
        expect(() =>
            buildCheckFromRow(
                row({
                    type: 'content_sentinel',
                    config_json: JSON.stringify({
                        url: 'https://x.com',
                        mustContain: [42],
                    }),
                }),
            ),
        ).toThrow();
    });
});

describe('buildCheckFromRow — redirect_chain', () => {
    it('cria check válido', () => {
        const c = buildCheckFromRow(
            row({
                type: 'redirect_chain',
                config_json: JSON.stringify({
                    startUrl: 'https://a.com',
                    allowedHosts: ['a.com'],
                }),
            }),
        );
        expect(c.name).toBe('r');
    });

    it('aceita finalHost, expectOk, maxHops opcionais', () => {
        const c = buildCheckFromRow(
            row({
                type: 'redirect_chain',
                config_json: JSON.stringify({
                    startUrl: 'https://a.com',
                    allowedHosts: ['a.com'],
                    finalHost: 'a.com',
                    expectOk: false,
                    maxHops: 3,
                }),
            }),
        );
        expect(c).toBeDefined();
    });

    it('rejeita startUrl ausente', () => {
        expect(() =>
            buildCheckFromRow(
                row({
                    type: 'redirect_chain',
                    config_json: JSON.stringify({ allowedHosts: [] }),
                }),
            ),
        ).toThrow(/startUrl/);
    });

    it('rejeita allowedHosts ausente', () => {
        expect(() =>
            buildCheckFromRow(
                row({
                    type: 'redirect_chain',
                    config_json: JSON.stringify({ startUrl: 'https://a.com' }),
                }),
            ),
        ).toThrow(/allowedHosts/);
    });

    it('rejeita allowedHosts com não-string', () => {
        expect(() =>
            buildCheckFromRow(
                row({
                    type: 'redirect_chain',
                    config_json: JSON.stringify({
                        startUrl: 'https://a.com',
                        allowedHosts: [123],
                    }),
                }),
            ),
        ).toThrow();
    });
});

describe('buildCheckFromRow — integrity', () => {
    const validIntegrity = {
        downloadUrl: 'https://x.com/app.exe',
        releasesRepo: 'foo/bar',
        assetName: 'app.exe',
    };

    it('cria check válido', () => {
        const c = buildCheckFromRow(
            row({
                type: 'integrity',
                config_json: JSON.stringify(validIntegrity),
            }),
        );
        expect(c.name).toBe('r');
    });

    it('usa githubToken da config quando presente', () => {
        const c = buildCheckFromRow(
            row({
                type: 'integrity',
                config_json: JSON.stringify({ ...validIntegrity, githubToken: 'in-config' }),
            }),
            { githubToken: 'env-token' },
        );
        // Não há jeito direto de inspecionar — só garantir que não joga.
        expect(c).toBeDefined();
    });

    it('falls back pra fcontext.githubToken', () => {
        const c = buildCheckFromRow(
            row({
                type: 'integrity',
                config_json: JSON.stringify(validIntegrity),
            }),
            { githubToken: 'env-token' },
        );
        expect(c).toBeDefined();
    });

    it('rejeita campos obrigatórios ausentes', () => {
        expect(() =>
            buildCheckFromRow(
                row({
                    type: 'integrity',
                    config_json: JSON.stringify({ downloadUrl: 'x' }),
                }),
            ),
        ).toThrow();
        expect(() =>
            buildCheckFromRow(
                row({
                    type: 'integrity',
                    config_json: JSON.stringify({
                        downloadUrl: 'x',
                        releasesRepo: 'y',
                    }),
                }),
            ),
        ).toThrow(/assetName/);
        expect(() =>
            buildCheckFromRow(
                row({
                    type: 'integrity',
                    config_json: JSON.stringify({
                        releasesRepo: 'y',
                        assetName: 'z',
                    }),
                }),
            ),
        ).toThrow(/downloadUrl/);
    });
});

describe('buildCheckFromRow — generic errors', () => {
    it('rejeita config_json inválido', () => {
        expect(() =>
            buildCheckFromRow(row({ config_json: 'not-json' })),
        ).toThrow(/config_json inválido/);
    });

    it('rejeita config não-objeto', () => {
        expect(() =>
            buildCheckFromRow(row({ config_json: '123' })),
        ).toThrow(/objeto/);
        expect(() =>
            buildCheckFromRow(row({ config_json: 'null' })),
        ).toThrow();
    });
});
