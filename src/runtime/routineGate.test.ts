import { env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureSchema, resetDataTables } from '../test-helpers.ts';
import {
    fireRoutineOnTransition,
    getLastSeverities,
    newlyFailing,
    saveSeverities,
} from './routineGate.ts';
import type { CheckResult } from '../types.ts';

let db: D1Database;
let originalFetch: typeof fetch;

beforeAll(async () => {
    db = await ensureSchema();
    originalFetch = globalThis.fetch;
});
beforeEach(async () => {
    await resetDataTables(db);
});
afterEach(() => {
    globalThis.fetch = originalFetch;
});

const FIRE_URL = 'https://api.anthropic.com/v1/claude_code/routines/trig_x/fire';
const FIRE_TOKEN = 'sk-ant-oat01-test';

function r(name: string, severity: 'ok' | 'warn' | 'critical'): CheckResult {
    return { name, severity, message: `${name} ${severity}`, durationMs: 1 };
}

function stubFire(handler: (url: string, init?: RequestInit) => Response): void {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        return handler(url, init);
    }) as typeof fetch;
}

describe('newlyFailing', () => {
    it('detecta transição ok→falha e primeira aparição', () => {
        const prev = new Map<string, string>([['a', 'ok']]);
        const fresh = newlyFailing(prev, [r('a', 'warn'), r('b', 'critical'), r('c', 'ok')]);
        expect(fresh.map((f) => f.name)).toEqual(['a', 'b']); // a: ok→warn, b: nova
    });
    it('ignora check que JÁ estava falhando', () => {
        const prev = new Map<string, string>([['a', 'critical']]);
        expect(newlyFailing(prev, [r('a', 'critical')])).toEqual([]);
    });
});

describe('getLastSeverities / saveSeverities', () => {
    it('round-trip + upsert por (app, check)', async () => {
        await saveSeverities(db, 'sonda', [r('x', 'ok'), r('y', 'critical')], 1000);
        let m = await getLastSeverities(db, 'sonda');
        expect(m.get('x')).toBe('ok');
        expect(m.get('y')).toBe('critical');
        await saveSeverities(db, 'sonda', [r('x', 'warn')], 2000);
        m = await getLastSeverities(db, 'sonda');
        expect(m.get('x')).toBe('warn');
        expect(m.get('y')).toBe('critical'); // intacto
    });
    it('isola por app', async () => {
        await saveSeverities(db, 'sonda', [r('x', 'critical')], 1000);
        await saveSeverities(db, 'outro', [r('x', 'ok')], 1000);
        expect((await getLastSeverities(db, 'sonda')).get('x')).toBe('critical');
        expect((await getLastSeverities(db, 'outro')).get('x')).toBe('ok');
    });
});

describe('fireRoutineOnTransition', () => {
    it('dispara na transição e persiste o novo estado', async () => {
        let fireBody: string | undefined;
        stubFire((url, init) => {
            if (url.includes('/fire')) {
                fireBody = init?.body as string;
                return new Response(JSON.stringify({ claude_code_session_url: 'x' }), { status: 200 });
            }
            return new Response('', { status: 500 });
        });
        const res = await fireRoutineOnTransition({
            db, app: 'sonda', results: [r('p', 'critical'), r('q', 'ok')],
            fireUrl: FIRE_URL, fireToken: FIRE_TOKEN, now: 1000,
        });
        expect(res).toEqual({ fired: true, transitioned: 1 });
        expect(fireBody).toContain('p');
        expect((await getLastSeverities(db, 'sonda')).get('p')).toBe('critical');
    });

    it('NÃO dispara quando o check já estava falhando', async () => {
        let fireCount = 0;
        stubFire((url) => {
            if (url.includes('/fire')) { fireCount++; return new Response('{}', { status: 200 }); }
            return new Response('', { status: 500 });
        });
        const args = { db, app: 'sonda', results: [r('p', 'critical')], fireUrl: FIRE_URL, fireToken: FIRE_TOKEN, now: 1000 };
        await fireRoutineOnTransition(args);
        await fireRoutineOnTransition({ ...args, now: 2000 });
        expect(fireCount).toBe(1);
    });

    it('redispara se voltou a ok e falhou de novo (flap)', async () => {
        let fireCount = 0;
        stubFire((url) => {
            if (url.includes('/fire')) { fireCount++; return new Response('{}', { status: 200 }); }
            return new Response('', { status: 500 });
        });
        const base = { db, app: 'sonda', fireUrl: FIRE_URL, fireToken: FIRE_TOKEN };
        await fireRoutineOnTransition({ ...base, results: [r('p', 'critical')], now: 1 });
        await fireRoutineOnTransition({ ...base, results: [r('p', 'ok')], now: 2 });
        await fireRoutineOnTransition({ ...base, results: [r('p', 'critical')], now: 3 });
        expect(fireCount).toBe(2);
    });

    it('sem credencial: não dispara mas persiste estado e reporta erro', async () => {
        let fireCount = 0;
        stubFire(() => { fireCount++; return new Response('{}', { status: 200 }); });
        const res = await fireRoutineOnTransition({
            db, app: 'sonda', results: [r('p', 'warn')], now: 1000,
        });
        expect(res.fired).toBe(false);
        expect(res.transitioned).toBe(1);
        expect(res.error).toMatch(/ausente/);
        expect(fireCount).toBe(0);
        expect((await getLastSeverities(db, 'sonda')).get('p')).toBe('warn');
    });
});
