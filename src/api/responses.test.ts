import { describe, expect, it } from 'vitest';
import {
    badRequest,
    jsonResponse,
    methodNotAllowed,
    notFound,
    serverError,
    unauthorized,
} from './responses.ts';

describe('jsonResponse', () => {
    it('default 200 com Content-Type JSON', async () => {
        const resp = jsonResponse({ ok: true });
        expect(resp.status).toBe(200);
        expect(resp.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
        expect(await resp.json()).toEqual({ ok: true });
    });

    it('respeita status custom', () => {
        expect(jsonResponse({}, 418).status).toBe(418);
    });

    it('mescla extra headers', () => {
        const resp = jsonResponse({}, 200, { 'X-Custom': 'yes' });
        expect(resp.headers.get('X-Custom')).toBe('yes');
        expect(resp.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    });
});

describe('error helpers', () => {
    it('badRequest = 400 com { error }', async () => {
        const r = badRequest('campo X');
        expect(r.status).toBe(400);
        expect(await r.json()).toEqual({ error: 'campo X' });
    });

    it('unauthorized = 401 com default msg', async () => {
        const r = unauthorized();
        expect(r.status).toBe(401);
        expect(await r.json()).toEqual({ error: 'unauthorized' });
    });

    it('unauthorized aceita msg custom', async () => {
        expect(await unauthorized('login required').json()).toEqual({ error: 'login required' });
    });

    it('notFound = 404', async () => {
        expect(notFound().status).toBe(404);
        expect(await notFound('xxx').json()).toEqual({ error: 'xxx' });
    });

    it('serverError = 500', async () => {
        expect(serverError().status).toBe(500);
    });

    it('methodNotAllowed = 405', async () => {
        expect(methodNotAllowed().status).toBe(405);
        expect(await methodNotAllowed('no put').json()).toEqual({ error: 'no put' });
    });
});
