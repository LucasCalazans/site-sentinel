import { describe, expect, it } from 'vitest';
import { createContentSentinelCheck } from './contentSentinel.ts';

function ctx(response: Response | Error) {
    return {
        fetch: (async () => {
            if (response instanceof Error) throw response;
            return response;
        }) as typeof fetch,
        now: () => 0,
    };
}

describe('createContentSentinelCheck', () => {
    it('severity ok quando todos mustContain presentes', async () => {
        const check = createContentSentinelCheck('cs', {
            url: 'https://x.com',
            mustContain: ['hello', 'world'],
        });
        const result = await check.run(
            ctx(new Response('hello world greetings', { status: 200 })),
        );
        expect(result.severity).toBe('ok');
    });

    it('severity critical quando mustContain falta', async () => {
        const check = createContentSentinelCheck('cs', {
            url: 'https://x.com',
            mustContain: ['hello', 'absent'],
        });
        const result = await check.run(
            ctx(new Response('hello there', { status: 200 })),
        );
        expect(result.severity).toBe('critical');
        expect(result.message).toMatch(/absent/);
    });

    it('mustNotContain detectado → critical', async () => {
        const check = createContentSentinelCheck('cs', {
            url: 'https://x.com',
            mustContain: ['Sonda'],
            mustNotContain: [/hacked by/i],
        });
        const result = await check.run(
            ctx(new Response('Sonda HACKED BY xyz', { status: 200 })),
        );
        expect(result.severity).toBe('critical');
        expect(result.message).toMatch(/proibidos/);
    });

    it('aceita string em mustNotContain', async () => {
        const check = createContentSentinelCheck('cs', {
            url: 'https://x.com',
            mustContain: ['ok'],
            mustNotContain: ['BAD'],
        });
        const result = await check.run(
            ctx(new Response('ok BAD', { status: 200 })),
        );
        expect(result.severity).toBe('critical');
    });

    it('severity critical quando HTTP não-OK', async () => {
        const check = createContentSentinelCheck('cs', {
            url: 'https://x.com',
            mustContain: ['x'],
        });
        const result = await check.run(
            ctx(new Response('', { status: 500 })),
        );
        expect(result.severity).toBe('critical');
        expect(result.message).toMatch(/500/);
    });

    it('aceita RegExp em mustContain', async () => {
        const check = createContentSentinelCheck('cs', {
            url: 'https://x.com',
            mustContain: [/sonda v\d+\.\d+\.\d+/i],
        });
        const ok = await check.run(
            ctx(new Response('app Sonda v1.2.3 release', { status: 200 })),
        );
        expect(ok.severity).toBe('ok');
        const bad = await check.run(
            ctx(new Response('app Sonda no version', { status: 200 })),
        );
        expect(bad.severity).toBe('critical');
    });

    it('mustNotContain ausente é OK (campo opcional)', async () => {
        const check = createContentSentinelCheck('cs', {
            url: 'https://x.com',
            mustContain: ['x'],
        });
        const result = await check.run(
            ctx(new Response('x', { status: 200 })),
        );
        expect(result.severity).toBe('ok');
    });

    it('details inclui contagem de bytes e missing/found arrays', async () => {
        const check = createContentSentinelCheck('cs', {
            url: 'https://x.com',
            mustContain: ['hello', 'absent'],
            mustNotContain: ['BAD'],
        });
        const result = await check.run(
            ctx(new Response('hello BAD', { status: 200 })),
        );
        expect(result.details).toMatchObject({
            missing: ['absent'],
            found: ['BAD'],
            bodySize: 9,
        });
    });
});
