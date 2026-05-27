import { describe, expect, it } from 'vitest';
import {
    getD1Database,
    getZoneAnalytics,
    listD1Databases,
    listPagesDeployments,
    listPagesProjects,
    listWorkers,
} from './cloudflare.ts';

function mockFetch(
    handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        return handler(url, init);
    }) as typeof fetch;
}

function cfOk<T>(result: T): Response {
    return new Response(
        JSON.stringify({ success: true, errors: [], messages: [], result }),
        { headers: { 'Content-Type': 'application/json' } },
    );
}

function cfErr(message: string, status = 200): Response {
    return new Response(
        JSON.stringify({
            success: false,
            errors: [{ code: 1, message }],
            result: null,
        }),
        { status, headers: { 'Content-Type': 'application/json' } },
    );
}

describe('listPagesProjects', () => {
    it('extrai shape mínimo', async () => {
        const f = mockFetch((url) => {
            expect(url).toContain('/accounts/acc/pages/projects');
            return cfOk([
                {
                    name: 'landing',
                    domains: ['x.com'],
                    created_on: '2026-01-01',
                    production_branch: 'master',
                    latest_deployment: {
                        id: 'dep-123',
                        short_id: 'dep1',
                        environment: 'production',
                        url: 'https://x.com',
                        created_on: '2026-05-01',
                        latest_stage: { name: 'deploy', status: 'success' },
                    },
                },
            ]);
        });
        const out = await listPagesProjects('acc', 'tok', f);
        expect(out).toHaveLength(1);
        expect(out[0]?.name).toBe('landing');
        expect(out[0]?.latest_deployment?.short_id).toBe('dep1');
    });

    it('preenche defaults pra campos ausentes', async () => {
        const f = mockFetch(() => cfOk([{ name: 'x' }]));
        const out = await listPagesProjects('acc', 'tok', f);
        expect(out[0]?.domains).toEqual([]);
        expect(out[0]?.production_branch).toBe('main');
        expect(out[0]?.latest_deployment).toBeUndefined();
    });

    it('inclui Authorization header', async () => {
        let auth: string | null = null;
        const f = mockFetch((_, init) => {
            auth = new Headers(init?.headers).get('Authorization');
            return cfOk([]);
        });
        await listPagesProjects('acc', 'my-tok', f);
        expect(auth).toBe('Bearer my-tok');
    });

    it('lança quando success=false', async () => {
        const f = mockFetch(() => cfErr('forbidden'));
        await expect(listPagesProjects('acc', 'tok', f)).rejects.toThrow(/forbidden/);
    });

    it('lança quando response não-JSON', async () => {
        const f = mockFetch(() => new Response('<html>', { status: 200 }));
        await expect(listPagesProjects('acc', 'tok', f)).rejects.toThrow(/não-JSON/);
    });
});

describe('listPagesDeployments', () => {
    it('mapa lista de deployments', async () => {
        const f = mockFetch((url) => {
            expect(url).toContain('/pages/projects/landing/deployments');
            return cfOk([
                { id: 'a-very-long-id-12345', environment: 'production' },
                { id: 'another', short_id: 'aaa' },
            ]);
        });
        const out = await listPagesDeployments('acc', 'landing', 'tok', f);
        expect(out).toHaveLength(2);
        expect(out[0]?.short_id).toBe('a-very-l');
        expect(out[1]?.short_id).toBe('aaa');
    });
});

describe('listWorkers', () => {
    it('extrai shape', async () => {
        const f = mockFetch(() =>
            cfOk([
                {
                    id: 'site-sentinel',
                    created_on: '2026-01-01',
                    modified_on: '2026-05-01',
                    handlers: ['scheduled', 'fetch'],
                    routes: [{}, {}],
                },
            ]),
        );
        const out = await listWorkers('acc', 'tok', f);
        expect(out[0]?.routes_count).toBe(2);
        expect(out[0]?.handlers).toEqual(['scheduled', 'fetch']);
    });

    it('lida com routes ausente', async () => {
        const f = mockFetch(() => cfOk([{ id: 'w', created_on: '', modified_on: '' }]));
        const out = await listWorkers('acc', 'tok', f);
        expect(out[0]?.routes_count).toBe(0);
        expect(out[0]?.handlers).toEqual([]);
    });
});

describe('listD1Databases / getD1Database', () => {
    it('list', async () => {
        const f = mockFetch(() =>
            cfOk([{ uuid: 'a', name: 'sonda-license', version: 'production', num_tables: 5, file_size: 12345 }]),
        );
        const out = await listD1Databases('acc', 'tok', f);
        expect(out[0]?.name).toBe('sonda-license');
        expect(out[0]?.num_tables).toBe(5);
    });

    it('get', async () => {
        const f = mockFetch((url) => {
            expect(url).toContain('/d1/database/abc-uuid');
            return cfOk({ uuid: 'abc-uuid', name: 'x' });
        });
        const db = await getD1Database('acc', 'abc-uuid', 'tok', f);
        expect(db.uuid).toBe('abc-uuid');
        expect(db.version).toBe('');
    });
});

describe('getZoneAnalytics', () => {
    it('mapeia totals', async () => {
        const f = mockFetch((url) => {
            expect(url).toContain('/zones/zone-x/analytics/dashboard');
            expect(url).toContain('since=-1440');
            return cfOk({
                totals: {
                    since: '2026-01-01',
                    until: '2026-01-02',
                    requests: { all: 1000, cached: 800, uncached: 200 },
                    bandwidth: { all: 50000 },
                    threats: { all: 2 },
                    pageviews: { all: 100 },
                    uniques: { all: 50 },
                },
            });
        });
        const out = await getZoneAnalytics('zone-x', 1440, 'tok', f);
        expect(out.requests.all).toBe(1000);
        expect(out.threats.all).toBe(2);
    });

    it('default zero pra campos ausentes', async () => {
        const f = mockFetch(() =>
            cfOk({ totals: { since: '', until: '' } }),
        );
        const out = await getZoneAnalytics('z', 60, 'tok', f);
        expect(out.requests.all).toBe(0);
        expect(out.bandwidth.cached).toBe(0);
        expect(out.uniques.all).toBe(0);
    });

    it('normaliza sinceMinutes pra negativo', async () => {
        let capturedUrl = '';
        const f = mockFetch((url) => {
            capturedUrl = url;
            return cfOk({ totals: { since: '', until: '' } });
        });
        await getZoneAnalytics('z', 720, 'tok', f);
        expect(capturedUrl).toContain('since=-720');
    });
});
