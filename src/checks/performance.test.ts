import { describe, expect, it, vi } from 'vitest';
import { createPerformanceCheck } from './performance.ts';

function mockFetch(handlers: Array<(url: string) => Response | Promise<Response> | Error>): typeof fetch {
    let i = 0;
    return (async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const handler = handlers[i++];
        if (!handler) throw new Error(`no handler for ${url}`);
        const out = await handler(url);
        if (out instanceof Error) throw out;
        return out;
    }) as typeof fetch;
}

function ctx(handlers: Array<(url: string) => Response | Promise<Response> | Error>, nowSeq?: number[]) {
    let n = 0;
    return {
        fetch: mockFetch(handlers),
        now: () => (nowSeq ? (nowSeq[n++] ?? 1000) : Date.now()),
    };
}

describe('createPerformanceCheck', () => {
    it('severity ok quando todos os targets respondem 200 abaixo do warn', async () => {
        const check = createPerformanceCheck('p', [
            { url: 'https://a.com', warnMs: 1000, criticalMs: 5000 },
            { url: 'https://b.com', warnMs: 1000, criticalMs: 5000 },
        ]);
        const result = await check.run(
            ctx(
                [
                    () => new Response('ok', { status: 200 }),
                    () => new Response('ok', { status: 200 }),
                ],
                [0, 0, 100, 0, 200, 1000],
            ),
        );
        expect(result.severity).toBe('ok');
        expect(result.message).toMatch(/2 targets OK/);
    });

    it('severity warn quando latência > warnMs', async () => {
        const check = createPerformanceCheck('p', [
            { url: 'https://slow.com', warnMs: 50, criticalMs: 500 },
        ]);
        const result = await check.run(
            ctx([() => new Response('ok', { status: 200 })], [0, 0, 200, 200]),
        );
        expect(result.severity).toBe('warn');
        expect(result.message).toMatch(/warn/);
    });

    it('severity critical quando latência > criticalMs', async () => {
        const check = createPerformanceCheck('p', [
            { url: 'https://very-slow.com', warnMs: 100, criticalMs: 500 },
        ]);
        const result = await check.run(
            ctx([() => new Response('ok')], [0, 0, 1000, 1000]),
        );
        expect(result.severity).toBe('critical');
    });

    it('severity critical quando status != expected (default 200)', async () => {
        const check = createPerformanceCheck('p', [
            { url: 'https://broken.com', warnMs: 1000, criticalMs: 5000 },
        ]);
        const result = await check.run(
            ctx([() => new Response('', { status: 500 })], [0, 0, 10, 10]),
        );
        expect(result.severity).toBe('critical');
        expect(result.message).toMatch(/HTTP 500/);
    });

    it('respeita expectStatus custom', async () => {
        const check = createPerformanceCheck('p', [
            {
                url: 'https://x.com',
                warnMs: 1000,
                criticalMs: 5000,
                expectStatus: 301,
            },
        ]);
        const result = await check.run(
            ctx([() => new Response('', { status: 301 })], [0, 0, 10, 10]),
        );
        expect(result.severity).toBe('ok');
    });

    it('severity critical quando fetch lança', async () => {
        const check = createPerformanceCheck('p', [
            { url: 'https://err.com', warnMs: 1000, criticalMs: 5000 },
        ]);
        const result = await check.run(
            ctx([() => new Error('network down')], [0, 0, 10, 10]),
        );
        expect(result.severity).toBe('critical');
        expect(result.message).toMatch(/network down/);
    });

    it('lida com erro não-Error (string)', async () => {
        const check = createPerformanceCheck('p', [
            { url: 'https://x.com', warnMs: 1000, criticalMs: 5000 },
        ]);
        // Mocka fetch que rejeita com string.
        const result = await check.run({
            fetch: (async () => {
                // eslint-disable-next-line no-throw-literal
                throw 'plain string error';
            }) as typeof fetch,
            now: () => Date.now(),
        });
        expect(result.severity).toBe('critical');
        expect(result.message).toMatch(/plain string error/);
    });

    it('pior severity ganha (multi-target)', async () => {
        const check = createPerformanceCheck('p', [
            { url: 'https://a.com', warnMs: 1000, criticalMs: 5000 },
            { url: 'https://b.com', warnMs: 1000, criticalMs: 5000 },
        ]);
        const result = await check.run({
            fetch: vi.fn(async (input) => {
                const url = String(input);
                if (url.includes('a.com')) return new Response('', { status: 500 });
                return new Response('ok', { status: 200 });
            }) as typeof fetch,
            now: () => Date.now(),
        });
        expect(result.severity).toBe('critical');
    });

    it('details inclui results por URL', async () => {
        const check = createPerformanceCheck('p', [
            { url: 'https://a.com', warnMs: 1000, criticalMs: 5000 },
        ]);
        const result = await check.run(
            ctx([() => new Response('ok', { status: 200 })], [0, 0, 50, 50]),
        );
        expect(result.details).toMatchObject({
            results: [expect.objectContaining({ url: 'https://a.com', status: 200 })],
        });
    });

    it('details inclui error path quando fetch falha', async () => {
        const check = createPerformanceCheck('p', [
            { url: 'https://err.com', warnMs: 1, criticalMs: 1 },
        ]);
        const result = await check.run(
            ctx([() => new Error('boom')], [0, 0, 1, 1]),
        );
        expect(result.details).toMatchObject({
            results: [expect.objectContaining({ url: 'https://err.com', error: 'boom' })],
        });
    });
});
