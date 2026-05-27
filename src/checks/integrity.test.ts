import { describe, expect, it } from 'vitest';
import { createIntegrityCheck } from './integrity.ts';

// Helper: gera SHA-256 hex de um ArrayBuffer.
async function sha256Hex(buf: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function buildFetch(
    handlers: Record<string, (init?: RequestInit) => Response | Promise<Response>>,
): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        for (const [pattern, handler] of Object.entries(handlers)) {
            if (url.includes(pattern)) return handler(init);
        }
        throw new Error(`unmocked url ${url}`);
    }) as typeof fetch;
}

const releaseUrl = 'api.github.com/repos/foo/bar/releases/latest';
const downloadUrl = 'https://cdn.example.com/app.exe';

describe('createIntegrityCheck', () => {
    it('severity ok quando SHA-256 bate', async () => {
        const payload = new TextEncoder().encode('binary-content-here').buffer as ArrayBuffer;
        const expectedHex = await sha256Hex(payload);

        const check = createIntegrityCheck('i', {
            downloadUrl,
            releasesRepo: 'foo/bar',
            assetName: 'app.exe',
        });
        const result = await check.run({
            fetch: buildFetch({
                [releaseUrl]: () =>
                    new Response(
                        JSON.stringify({
                            tag_name: 'v1.0.0',
                            assets: [{ name: 'app.exe', digest: `sha256:${expectedHex}` }],
                        }),
                    ),
                [downloadUrl]: () => new Response(payload),
            }),
            now: () => 0,
        });
        expect(result.severity).toBe('ok');
        expect(result.message).toMatch(/v1\.0\.0/);
    });

    it('severity critical quando SHA-256 não bate', async () => {
        const payload = new TextEncoder().encode('actual content').buffer as ArrayBuffer;
        const wrongHex = 'a'.repeat(64);

        const check = createIntegrityCheck('i', {
            downloadUrl,
            releasesRepo: 'foo/bar',
            assetName: 'app.exe',
        });
        const result = await check.run({
            fetch: buildFetch({
                [releaseUrl]: () =>
                    new Response(
                        JSON.stringify({
                            tag_name: 'v1.0.0',
                            assets: [{ name: 'app.exe', digest: `sha256:${wrongHex}` }],
                        }),
                    ),
                [downloadUrl]: () => new Response(payload),
            }),
            now: () => 0,
        });
        expect(result.severity).toBe('critical');
        expect(result.message).toMatch(/TROCA/);
    });

    it('severity critical quando GitHub API retorna não-2xx', async () => {
        const check = createIntegrityCheck('i', {
            downloadUrl,
            releasesRepo: 'foo/bar',
            assetName: 'app.exe',
        });
        const result = await check.run({
            fetch: buildFetch({
                [releaseUrl]: () => new Response('', { status: 403 }),
            }),
            now: () => 0,
        });
        expect(result.severity).toBe('critical');
        expect(result.message).toMatch(/403/);
    });

    it('severity critical quando asset não está no release', async () => {
        const check = createIntegrityCheck('i', {
            downloadUrl,
            releasesRepo: 'foo/bar',
            assetName: 'missing.exe',
        });
        const result = await check.run({
            fetch: buildFetch({
                [releaseUrl]: () =>
                    new Response(
                        JSON.stringify({
                            tag_name: 'v1',
                            assets: [{ name: 'other.exe', digest: 'sha256:abc' }],
                        }),
                    ),
            }),
            now: () => 0,
        });
        expect(result.severity).toBe('critical');
        expect(result.message).toMatch(/não encontrado/);
    });

    it('severity warn quando asset sem digest', async () => {
        const check = createIntegrityCheck('i', {
            downloadUrl,
            releasesRepo: 'foo/bar',
            assetName: 'app.exe',
        });
        const result = await check.run({
            fetch: buildFetch({
                [releaseUrl]: () =>
                    new Response(
                        JSON.stringify({
                            tag_name: 'v1',
                            assets: [{ name: 'app.exe' }],
                        }),
                    ),
            }),
            now: () => 0,
        });
        expect(result.severity).toBe('warn');
    });

    it('severity warn quando digest não é sha256', async () => {
        const check = createIntegrityCheck('i', {
            downloadUrl,
            releasesRepo: 'foo/bar',
            assetName: 'app.exe',
        });
        const result = await check.run({
            fetch: buildFetch({
                [releaseUrl]: () =>
                    new Response(
                        JSON.stringify({
                            tag_name: 'v1',
                            assets: [{ name: 'app.exe', digest: 'md5:abc' }],
                        }),
                    ),
            }),
            now: () => 0,
        });
        expect(result.severity).toBe('warn');
    });

    it('severity critical quando download retorna não-2xx', async () => {
        const check = createIntegrityCheck('i', {
            downloadUrl,
            releasesRepo: 'foo/bar',
            assetName: 'app.exe',
        });
        const result = await check.run({
            fetch: buildFetch({
                [releaseUrl]: () =>
                    new Response(
                        JSON.stringify({
                            tag_name: 'v1',
                            assets: [{ name: 'app.exe', digest: 'sha256:' + 'a'.repeat(64) }],
                        }),
                    ),
                [downloadUrl]: () => new Response('', { status: 502 }),
            }),
            now: () => 0,
        });
        expect(result.severity).toBe('critical');
        expect(result.message).toMatch(/502/);
    });

    it('inclui Authorization header quando githubToken passado', async () => {
        const payload = new ArrayBuffer(8);
        const expectedHex = await sha256Hex(payload);
        let capturedAuth: string | null = null;

        const check = createIntegrityCheck('i', {
            downloadUrl,
            releasesRepo: 'foo/bar',
            assetName: 'app.exe',
            githubToken: 'my-token',
        });
        await check.run({
            fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
                if (url.includes(releaseUrl)) {
                    capturedAuth = new Headers(init?.headers).get('Authorization');
                    return new Response(
                        JSON.stringify({
                            tag_name: 'v1',
                            assets: [{ name: 'app.exe', digest: 'sha256:' + expectedHex }],
                        }),
                    );
                }
                return new Response(payload);
            }) as typeof fetch,
            now: () => 0,
        });
        expect(capturedAuth).toBe('Bearer my-token');
    });
});
