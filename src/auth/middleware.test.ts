import { describe, expect, it } from 'vitest';
import { requireAuth } from './middleware.ts';
import { signJwt } from './jwt.ts';

const KEY = 'middleware-test-key';

function mkReq(headers: Record<string, string> = {}): Request {
    return new Request('https://example.test/api/whatever', { headers });
}

describe('requireAuth', () => {
    it('autoriza com Bearer JWT válido', async () => {
        const token = await signJwt({ sub: 'admin' }, KEY, 3600);
        const result = await requireAuth(mkReq({ Authorization: `Bearer ${token}` }), KEY);
        expect(result.kind).toBe('ok');
        if (result.kind === 'ok') {
            expect(result.payload.sub).toBe('admin');
        }
    });

    it('retorna 401 quando Authorization ausente', async () => {
        const result = await requireAuth(mkReq(), KEY);
        expect(result.kind).toBe('unauthorized');
        if (result.kind === 'unauthorized') {
            expect(result.response.status).toBe(401);
            const body = (await result.response.json()) as { error: string };
            expect(body.error).toMatch(/missing/i);
        }
    });

    it('retorna 401 quando scheme não é Bearer', async () => {
        const result = await requireAuth(
            mkReq({ Authorization: 'Basic dXNlcjpwYXNz' }),
            KEY,
        );
        expect(result.kind).toBe('unauthorized');
        if (result.kind === 'unauthorized') {
            const body = (await result.response.json()) as { error: string };
            expect(body.error).toMatch(/Bearer/);
        }
    });

    it('retorna 401 quando token vazio após Bearer', async () => {
        const result = await requireAuth(mkReq({ Authorization: 'Bearer ' }), KEY);
        expect(result.kind).toBe('unauthorized');
        if (result.kind === 'unauthorized') {
            const body = (await result.response.json()) as { error: string };
            expect(body.error).toMatch(/empty/i);
        }
    });

    it('retorna 401 com JWT mal formado', async () => {
        const result = await requireAuth(
            mkReq({ Authorization: 'Bearer nao.eh.jwt' }),
            KEY,
        );
        expect(result.kind).toBe('unauthorized');
    });

    it('retorna 401 com JWT expirado', async () => {
        // Assina com iat no passado e expiry curto.
        const past = Math.floor(Date.now() / 1000) - 7200;
        const token = await signJwt({ sub: 'admin' }, KEY, 60, past);
        const result = await requireAuth(
            mkReq({ Authorization: `Bearer ${token}` }),
            KEY,
        );
        expect(result.kind).toBe('unauthorized');
        if (result.kind === 'unauthorized') {
            const body = (await result.response.json()) as { error: string };
            expect(body.error).toMatch(/invalid|expired/i);
        }
    });

    it('Response 401 sempre traz Content-Type JSON', async () => {
        const result = await requireAuth(mkReq(), KEY);
        if (result.kind === 'unauthorized') {
            expect(result.response.headers.get('Content-Type')).toBe('application/json');
        }
    });
});
