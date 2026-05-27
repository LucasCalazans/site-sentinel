import { describe, expect, it } from 'vitest';
import {
    getActionsRuns,
    getLatestRelease,
    getOpenIssues,
    getRepoMeta,
} from './github.ts';

function mockFetch(
    handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        return handler(url, init);
    }) as typeof fetch;
}

function ok<T>(body: T): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('getRepoMeta', () => {
    it('extrai shape mínimo', async () => {
        const f = mockFetch((url) => {
            expect(url).toContain('/repos/foo/bar');
            return ok({
                full_name: 'foo/bar',
                description: 'desc',
                stargazers_count: 10,
                forks_count: 2,
                open_issues_count: 3,
                default_branch: 'master',
                pushed_at: '2026-01-01',
                visibility: 'private',
                html_url: 'https://github.com/foo/bar',
            });
        });
        const r = await getRepoMeta('foo/bar', 'tok', f);
        expect(r.full_name).toBe('foo/bar');
        expect(r.stars).toBe(10);
        expect(r.forks).toBe(2);
    });

    it('default pra campos ausentes', async () => {
        const f = mockFetch(() =>
            ok({ full_name: 'x', description: null, html_url: 'u' }),
        );
        const r = await getRepoMeta('x', 'tok', f);
        expect(r.stars).toBe(0);
        expect(r.default_branch).toBe('main');
        expect(r.visibility).toBe('private');
    });

    it('inclui Authorization header', async () => {
        let auth: string | null = null;
        const f = mockFetch((_, init) => {
            auth = new Headers(init?.headers).get('Authorization');
            return ok({ full_name: 'x', description: null, html_url: 'u' });
        });
        await getRepoMeta('x', 'my-token', f);
        expect(auth).toBe('Bearer my-token');
    });

    it('inclui User-Agent', async () => {
        let ua: string | null = null;
        const f = mockFetch((_, init) => {
            ua = new Headers(init?.headers).get('User-Agent');
            return ok({ full_name: 'x', description: null, html_url: 'u' });
        });
        await getRepoMeta('x', 'tok', f);
        expect(ua).toMatch(/site-sentinel/);
    });

    it('lança em status != 2xx com detail', async () => {
        const f = mockFetch(() =>
            new Response(JSON.stringify({ message: 'Not Found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        await expect(getRepoMeta('x', 'tok', f)).rejects.toThrow(/404.*Not Found/);
    });

    it('lança sem detail quando body não-JSON', async () => {
        const f = mockFetch(() => new Response('plain', { status: 500 }));
        await expect(getRepoMeta('x', 'tok', f)).rejects.toThrow(/500/);
    });
});

describe('getLatestRelease', () => {
    it('mapeia release com assets', async () => {
        const f = mockFetch(() =>
            ok({
                tag_name: 'v1.0.0',
                name: 'Release 1.0.0',
                published_at: '2026-05-01',
                prerelease: false,
                html_url: 'https://github.com/x/releases/v1.0.0',
                assets: [
                    {
                        name: 'app.exe',
                        size: 1024,
                        download_count: 50,
                        digest: 'sha256:abc',
                        browser_download_url: 'https://download/app.exe',
                    },
                ],
            }),
        );
        const r = await getLatestRelease('x/y', 'tok', f);
        expect(r?.tag_name).toBe('v1.0.0');
        expect(r?.assets[0]?.download_count).toBe(50);
    });

    it('returns null em 404', async () => {
        const f = mockFetch(() =>
            new Response(JSON.stringify({ message: 'no release' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        const r = await getLatestRelease('x/y', 'tok', f);
        expect(r).toBeNull();
    });

    it('lança em erros não-404', async () => {
        const f = mockFetch(() =>
            new Response(JSON.stringify({ message: 'forbidden' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        await expect(getLatestRelease('x/y', 'tok', f)).rejects.toThrow(/403/);
    });

    it('default name=tag_name quando name ausente', async () => {
        const f = mockFetch(() =>
            ok({
                tag_name: 'v2',
                html_url: 'u',
            }),
        );
        const r = await getLatestRelease('x', 'tok', f);
        expect(r?.name).toBe('v2');
        expect(r?.assets).toEqual([]);
    });

    it('asset com campos ausentes ganha defaults', async () => {
        const f = mockFetch(() =>
            ok({
                tag_name: 'v1',
                html_url: 'u',
                assets: [{ name: 'x.exe', browser_download_url: 'd' }],
            }),
        );
        const r = await getLatestRelease('x', 'tok', f);
        expect(r?.assets[0]?.size).toBe(0);
        expect(r?.assets[0]?.download_count).toBe(0);
        expect(r?.assets[0]?.digest).toBeNull();
    });
});

describe('getActionsRuns', () => {
    it('mapeia runs', async () => {
        const f = mockFetch((url) => {
            expect(url).toContain('per_page=10');
            return ok({
                total_count: 1,
                workflow_runs: [
                    {
                        id: 1,
                        name: 'CI',
                        head_branch: 'master',
                        head_sha: 'abc',
                        event: 'push',
                        status: 'completed',
                        conclusion: 'success',
                        workflow_id: 10,
                        run_number: 42,
                        created_at: '2026-01-01',
                        updated_at: '2026-01-01',
                        html_url: 'https://github.com/...',
                    },
                ],
            });
        });
        const r = await getActionsRuns('x/y', 'tok', f);
        expect(r[0]?.conclusion).toBe('success');
        expect(r[0]?.run_number).toBe(42);
    });

    it('respeita perPage custom', async () => {
        let url = '';
        const f = mockFetch((u) => {
            url = u;
            return ok({ total_count: 0, workflow_runs: [] });
        });
        await getActionsRuns('x/y', 'tok', f, 5);
        expect(url).toContain('per_page=5');
    });

    it('defaults pra campos ausentes', async () => {
        const f = mockFetch(() =>
            ok({
                total_count: 1,
                workflow_runs: [{ id: 1, workflow_id: 10, html_url: 'u' }],
            }),
        );
        const r = await getActionsRuns('x', 'tok', f);
        expect(r[0]?.status).toBe('');
        expect(r[0]?.conclusion).toBeNull();
    });
});

describe('getOpenIssues', () => {
    it('lista issues e PRs', async () => {
        const f = mockFetch((url) => {
            expect(url).toContain('state=open');
            return ok([
                {
                    number: 1,
                    title: 'bug',
                    state: 'open',
                    created_at: '',
                    updated_at: '',
                    html_url: 'u1',
                    user: { login: 'alice' },
                    labels: [{ name: 'bug' }, 'urgent'],
                },
                {
                    number: 2,
                    title: 'pr',
                    state: 'open',
                    created_at: '',
                    updated_at: '',
                    html_url: 'u2',
                    user: { login: 'bob' },
                    labels: [],
                    pull_request: { url: 'p' },
                },
            ]);
        });
        const r = await getOpenIssues('x/y', 'tok', f);
        expect(r).toHaveLength(2);
        expect(r[0]?.labels).toEqual(['bug', 'urgent']);
        expect(r[0]?.is_pull_request).toBe(false);
        expect(r[1]?.is_pull_request).toBe(true);
    });

    it('lida com user null', async () => {
        const f = mockFetch(() =>
            ok([
                {
                    number: 1,
                    title: 't',
                    state: 'open',
                    created_at: '',
                    updated_at: '',
                    html_url: '',
                    user: null,
                    labels: [],
                },
            ]),
        );
        const r = await getOpenIssues('x', 'tok', f);
        expect(r[0]?.user).toBe('unknown');
    });

    it('respeita perPage', async () => {
        let url = '';
        const f = mockFetch((u) => {
            url = u;
            return ok([]);
        });
        await getOpenIssues('x', 'tok', f, 50);
        expect(url).toContain('per_page=50');
    });
});
