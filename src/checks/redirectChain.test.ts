import { describe, expect, it } from 'vitest';
import { createRedirectChainCheck } from './redirectChain.ts';

function chainCtx(responses: Array<{ status: number; location?: string }>) {
    let i = 0;
    return {
        fetch: (async () => {
            const r = responses[i++];
            if (!r) throw new Error('no more responses');
            const headers: Record<string, string> = {};
            if (r.location) headers.Location = r.location;
            return new Response('', { status: r.status, headers });
        }) as typeof fetch,
        now: () => 0,
    };
}

describe('createRedirectChainCheck', () => {
    it('severity ok quando chain válida termina em 2xx', async () => {
        const check = createRedirectChainCheck('rc', {
            startUrl: 'https://a.com/start',
            allowedHosts: ['a.com', 'b.com'],
            finalHost: 'b.com',
        });
        const result = await check.run(
            chainCtx([
                { status: 302, location: 'https://b.com/final' },
                { status: 200 },
            ]),
        );
        expect(result.severity).toBe('ok');
        expect(result.message).toMatch(/2 hops/);
    });

    it('aceita sufixo .x.com', async () => {
        const check = createRedirectChainCheck('rc', {
            startUrl: 'https://api.x.com/start',
            allowedHosts: ['.x.com'],
        });
        const result = await check.run(chainCtx([{ status: 200 }]));
        expect(result.severity).toBe('ok');
    });

    it('host fora da whitelist → critical', async () => {
        const check = createRedirectChainCheck('rc', {
            startUrl: 'https://a.com/x',
            allowedHosts: ['a.com'],
        });
        const result = await check.run(
            chainCtx([
                { status: 302, location: 'https://evil.com/' },
                { status: 200 },
            ]),
        );
        expect(result.severity).toBe('critical');
        expect(result.message).toMatch(/whitelist/);
    });

    it('finalHost incorreto → critical', async () => {
        const check = createRedirectChainCheck('rc', {
            startUrl: 'https://a.com/x',
            allowedHosts: ['a.com', 'b.com'],
            finalHost: 'b.com',
        });
        const result = await check.run(chainCtx([{ status: 200 }]));
        expect(result.severity).toBe('critical');
        expect(result.message).toMatch(/destino final.*≠/);
    });

    it('final status não-2xx → critical (expectOk default true)', async () => {
        const check = createRedirectChainCheck('rc', {
            startUrl: 'https://a.com/x',
            allowedHosts: ['a.com'],
        });
        const result = await check.run(chainCtx([{ status: 500 }]));
        expect(result.severity).toBe('critical');
    });

    it('expectOk = false aceita não-2xx', async () => {
        const check = createRedirectChainCheck('rc', {
            startUrl: 'https://a.com/x',
            allowedHosts: ['a.com'],
            expectOk: false,
        });
        const result = await check.run(chainCtx([{ status: 404 }]));
        expect(result.severity).toBe('ok');
    });

    it('chain que estoura maxHops → critical', async () => {
        const check = createRedirectChainCheck('rc', {
            startUrl: 'https://a.com/x',
            allowedHosts: ['a.com'],
            maxHops: 2,
        });
        const result = await check.run(
            chainCtx([
                { status: 302, location: 'https://a.com/a' },
                { status: 302, location: 'https://a.com/b' },
            ]),
        );
        expect(result.severity).toBe('critical');
        expect(result.message).toMatch(/maxHops/);
    });

    it('details inclui a chain visitada', async () => {
        const check = createRedirectChainCheck('rc', {
            startUrl: 'https://a.com/x',
            allowedHosts: ['a.com'],
        });
        const result = await check.run(chainCtx([{ status: 200 }]));
        expect(result.details).toMatchObject({
            chain: [expect.objectContaining({ url: 'https://a.com/x', status: 200 })],
        });
    });

    it('Location relativa resolve contra current URL', async () => {
        const check = createRedirectChainCheck('rc', {
            startUrl: 'https://a.com/start',
            allowedHosts: ['a.com'],
        });
        const result = await check.run(
            chainCtx([
                { status: 302, location: '/next' }, // relativa
                { status: 200 },
            ]),
        );
        expect(result.severity).toBe('ok');
        const details = result.details as { chain: Array<{ url: string }> };
        expect(details.chain[1]?.url).toBe('https://a.com/next');
    });
});
