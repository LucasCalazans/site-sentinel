import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postToDiscord } from './discord.ts';
import type { CheckResult } from '../types.ts';

const webhookUrl = 'https://discord.com/api/webhooks/0/test';

interface FetchCall {
    url: string;
    body: { content: string; embeds: Array<{ title: string; color: number; fields: unknown[] }> };
}

let captured: FetchCall[];
let originalFetch: typeof fetch;

beforeEach(() => {
    captured = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const body = init?.body ? JSON.parse(init.body as string) : null;
        captured.push({ url, body });
        return new Response('ok', { status: 200 });
    }) as typeof fetch;
});

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe('postToDiscord', () => {
    it('não posta quando todos os results são ok', async () => {
        const results: CheckResult[] = [
            { name: 'a', severity: 'ok', message: 'fine', durationMs: 1 },
        ];
        await postToDiscord(webhookUrl, 'app', results);
        expect(captured).toHaveLength(0);
    });

    it('posta quando há falhas', async () => {
        const results: CheckResult[] = [
            { name: 'a', severity: 'critical', message: 'broken', durationMs: 10 },
            { name: 'b', severity: 'ok', message: 'fine', durationMs: 5 },
        ];
        await postToDiscord(webhookUrl, 'sonda', results);
        expect(captured).toHaveLength(1);
        expect(captured[0]?.url).toBe(webhookUrl);
        expect(captured[0]?.body.content).toMatch(/sonda/);
        expect(captured[0]?.body.embeds).toHaveLength(1);
        expect(captured[0]?.body.embeds[0]?.title).toContain('CRITICAL');
    });

    it('mapeia color por severity', async () => {
        const results: CheckResult[] = [
            { name: 'w', severity: 'warn', message: 'maybe', durationMs: 1 },
            { name: 'c', severity: 'critical', message: 'bad', durationMs: 1 },
        ];
        await postToDiscord(webhookUrl, 'app', results);
        const colors = captured[0]?.body.embeds.map((e) => e.color);
        expect(colors).toContain(0xf1c40f); // warn
        expect(colors).toContain(0xe74c3c); // critical
    });

    it('inclui details como fields', async () => {
        const results: CheckResult[] = [
            {
                name: 'x',
                severity: 'critical',
                message: 'msg',
                durationMs: 1,
                details: { a: 1, b: 'two' },
            },
        ];
        await postToDiscord(webhookUrl, 'app', results);
        const fields = captured[0]?.body.embeds[0]?.fields ?? [];
        expect(fields).toHaveLength(2);
    });

    it('trunca fields gigantes', async () => {
        const huge = 'x'.repeat(5000);
        const results: CheckResult[] = [
            {
                name: 'big',
                severity: 'critical',
                message: 'msg',
                durationMs: 1,
                details: { payload: huge },
            },
        ];
        await postToDiscord(webhookUrl, 'app', results);
        const field = (captured[0]?.body.embeds[0]?.fields[0] as { value: string }).value;
        expect(field.length).toBeLessThan(1024);
        expect(field).toMatch(/\.{3}/);
    });

    it('trunca description > 2000', async () => {
        const huge = 'x'.repeat(3000);
        const results: CheckResult[] = [
            { name: 'b', severity: 'critical', message: huge, durationMs: 1 },
        ];
        await postToDiscord(webhookUrl, 'app', results);
        const embed = captured[0]?.body.embeds[0] as unknown as { description: string };
        expect(embed.description.length).toBeLessThanOrEqual(2000);
    });

    it('limita a 10 embeds e marca overflow', async () => {
        const results: CheckResult[] = Array.from({ length: 15 }, (_, i) => ({
            name: `n${i}`,
            severity: 'critical' as const,
            message: 'x',
            durationMs: 1,
        }));
        await postToDiscord(webhookUrl, 'app', results);
        expect(captured[0]?.body.embeds).toHaveLength(10);
        expect(captured[0]?.body.content).toMatch(/\+5 omitidos/);
    });

    it('lança quando webhook retorna não-2xx', async () => {
        globalThis.fetch = (async () =>
            new Response('rate limited', { status: 429 })) as typeof fetch;
        await expect(
            postToDiscord(webhookUrl, 'app', [
                { name: 'x', severity: 'critical', message: 'm', durationMs: 1 },
            ]),
        ).rejects.toThrow(/429/);
    });

    it('error message inclui body truncado', async () => {
        const longBody = 'err '.repeat(1000);
        globalThis.fetch = (async () =>
            new Response(longBody, { status: 500 })) as typeof fetch;
        try {
            await postToDiscord(webhookUrl, 'app', [
                { name: 'x', severity: 'critical', message: 'm', durationMs: 1 },
            ]);
            expect.fail('deveria ter throw');
        } catch (err) {
            expect((err as Error).message).toMatch(/500/);
            expect((err as Error).message.length).toBeLessThan(500);
        }
    });

    it('lida com body unreadable', async () => {
        globalThis.fetch = (async () => {
            const resp = new Response('', { status: 500 });
            // Override text() pra simular leitura quebrada.
            Object.defineProperty(resp, 'text', {
                value: () => Promise.reject(new Error('read fail')),
            });
            return resp;
        }) as typeof fetch;
        await expect(
            postToDiscord(webhookUrl, 'app', [
                { name: 'x', severity: 'critical', message: 'm', durationMs: 1 },
            ]),
        ).rejects.toThrow(/500/);
    });

    it('serializa value não-string como JSON', async () => {
        const results: CheckResult[] = [
            {
                name: 'x',
                severity: 'critical',
                message: 'm',
                durationMs: 1,
                details: { stringValue: 'already-string', number: 42 },
            },
        ];
        await postToDiscord(webhookUrl, 'app', results);
        const fields = captured[0]?.body.embeds[0]?.fields ?? [];
        // 1º (stringValue) deve aparecer sem aspas JSON externas; 2º (number) deve ter o número renderizado.
        expect(JSON.stringify(fields)).toContain('already-string');
        expect(JSON.stringify(fields)).toContain('42');
    });
});
