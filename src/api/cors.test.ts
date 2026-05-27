import { describe, expect, it } from 'vitest';
import { corsHeaders, preflight, withCors } from './cors.ts';

const ALLOWED = 'http://localhost:5173,https://monitor.example.com';

describe('corsHeaders', () => {
    it('inclui Access-Control-Allow-Origin quando origem está na whitelist', () => {
        const h = corsHeaders('http://localhost:5173', ALLOWED);
        expect(h.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    });

    it('omite Access-Control-Allow-Origin quando origem não está', () => {
        const h = corsHeaders('https://evil.com', ALLOWED);
        expect(h.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('omite Access-Control-Allow-Origin quando origin header ausente', () => {
        const h = corsHeaders(null, ALLOWED);
        expect(h.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('sempre inclui Vary, Methods, Headers, Max-Age', () => {
        const h = corsHeaders(null, ALLOWED);
        expect(h.get('Vary')).toBe('Origin');
        expect(h.get('Access-Control-Allow-Methods')).toContain('GET');
        expect(h.get('Access-Control-Allow-Methods')).toContain('POST');
        expect(h.get('Access-Control-Allow-Methods')).toContain('DELETE');
        expect(h.get('Access-Control-Allow-Headers')).toContain('Authorization');
        expect(h.get('Access-Control-Max-Age')).toBe('600');
    });

    it('trim de espaços nos itens CSV', () => {
        const h = corsHeaders('http://x.com', '  http://x.com ,  http://y.com  ');
        expect(h.get('Access-Control-Allow-Origin')).toBe('http://x.com');
    });
});

describe('preflight', () => {
    it('retorna 204 sem body', async () => {
        const req = new Request('https://x.test', {
            method: 'OPTIONS',
            headers: { Origin: 'http://localhost:5173' },
        });
        const resp = preflight(req, ALLOWED);
        expect(resp.status).toBe(204);
        expect(await resp.text()).toBe('');
    });

    it('inclui CORS headers', () => {
        const req = new Request('https://x.test', {
            headers: { Origin: 'http://localhost:5173' },
        });
        const resp = preflight(req, ALLOWED);
        expect(resp.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    });
});

describe('withCors', () => {
    it('adiciona CORS headers na response existente', () => {
        const original = new Response('hello', { status: 200 });
        const req = new Request('https://x.test', {
            headers: { Origin: 'http://localhost:5173' },
        });
        const wrapped = withCors(original, req, ALLOWED);
        expect(wrapped.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
        expect(wrapped.headers.get('Vary')).toBe('Origin');
    });

    it('não muda status nem body', async () => {
        const original = new Response(JSON.stringify({ ok: true }), { status: 201 });
        const req = new Request('https://x.test');
        const wrapped = withCors(original, req, ALLOWED);
        expect(wrapped.status).toBe(201);
        expect(await wrapped.json()).toEqual({ ok: true });
    });
});
