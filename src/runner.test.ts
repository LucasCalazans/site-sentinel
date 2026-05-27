import { describe, expect, it } from 'vitest';
import { runChecks } from './runner.ts';
import type { Check } from './types.ts';

const ctx = { fetch: globalThis.fetch, now: () => Date.now() };

describe('runChecks', () => {
    it('roda múltiplos checks em paralelo', async () => {
        const checks: Check[] = [
            {
                name: 'a',
                async run() {
                    return { name: 'a', severity: 'ok', message: 'a', durationMs: 1 };
                },
            },
            {
                name: 'b',
                async run() {
                    return { name: 'b', severity: 'warn', message: 'b', durationMs: 2 };
                },
            },
        ];
        const results = await runChecks(checks, ctx);
        expect(results.map((r) => r.name).sort()).toEqual(['a', 'b']);
    });

    it('captura exceção e retorna critical', async () => {
        const checks: Check[] = [
            {
                name: 'thrower',
                async run() {
                    throw new Error('boom');
                },
            },
        ];
        const results = await runChecks(checks, ctx);
        expect(results[0]?.severity).toBe('critical');
        expect(results[0]?.message).toMatch(/boom/);
        expect(results[0]?.details).toMatchObject({ stack: expect.any(String) });
    });

    it('captura non-Error throws', async () => {
        const checks: Check[] = [
            {
                name: 'stringy',
                async run() {
                    // eslint-disable-next-line no-throw-literal
                    throw 'plain string';
                },
            },
        ];
        const results = await runChecks(checks, ctx);
        expect(results[0]?.severity).toBe('critical');
        expect(results[0]?.message).toMatch(/plain string/);
    });

    it('lista vazia retorna []', async () => {
        const results = await runChecks([], ctx);
        expect(results).toEqual([]);
    });
});
