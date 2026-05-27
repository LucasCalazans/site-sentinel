import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, setUnauthorizedHandler } from './api.ts';
import { setAuth, clearAuth, getToken } from './auth.ts';

const originalFetch = globalThis.fetch;

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
});

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): void {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        return handler(url, init);
    }) as typeof fetch;
}

describe('api()', () => {
    it('GET com JSON response', async () => {
        mockFetch(() =>
            new Response(JSON.stringify({ x: 1 }), {
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        const out = await api<{ x: number }>('/api/x');
        expect(out.x).toBe(1);
    });

    it('inclui Authorization quando token setado', async () => {
        let auth: string | null = null;
        mockFetch((_, init) => {
            auth = new Headers(init?.headers).get('Authorization');
            return new Response(JSON.stringify({}), { headers: { 'Content-Type': 'application/json' } });
        });
        setAuth('my-token', 60);
        await api('/api/x');
        expect(auth).toBe('Bearer my-token');
    });

    it('omite Authorization quando auth: false', async () => {
        let auth: string | null = null;
        mockFetch((_, init) => {
            auth = new Headers(init?.headers).get('Authorization');
            return new Response(JSON.stringify({}), { headers: { 'Content-Type': 'application/json' } });
        });
        setAuth('my-token', 60);
        await api('/api/x', { auth: false });
        expect(auth).toBeNull();
    });

    it('omite Authorization quando token não setado', async () => {
        let auth: string | null = null;
        mockFetch((_, init) => {
            auth = new Headers(init?.headers).get('Authorization');
            return new Response(JSON.stringify({}), { headers: { 'Content-Type': 'application/json' } });
        });
        await api('/api/x');
        expect(auth).toBeNull();
    });

    it('serializa body como JSON', async () => {
        let captured: string | null = null;
        mockFetch((_, init) => {
            captured = init?.body as string;
            return new Response(JSON.stringify({}), { headers: { 'Content-Type': 'application/json' } });
        });
        await api('/api/x', { method: 'POST', body: { a: 1 } });
        expect(captured).toBe('{"a":1}');
    });

    it('passa method', async () => {
        let method: string | null = null;
        mockFetch((_, init) => {
            method = init?.method ?? null;
            return new Response(JSON.stringify({}), { headers: { 'Content-Type': 'application/json' } });
        });
        await api('/api/x', { method: 'DELETE' });
        expect(method).toBe('DELETE');
    });

    it('lança ApiError em status != 2xx', async () => {
        mockFetch(() =>
            new Response(JSON.stringify({ error: 'bad' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        await expect(api('/api/x')).rejects.toBeInstanceOf(ApiError);
        try {
            await api('/api/x');
        } catch (err) {
            expect((err as ApiError).status).toBe(400);
            expect((err as ApiError).message).toBe('bad');
        }
    });

    it('mensagem fallback quando body sem error', async () => {
        mockFetch(() => new Response('', { status: 500 }));
        try {
            await api('/api/x');
            expect.fail();
        } catch (err) {
            expect((err as ApiError).message).toBe('HTTP 500');
        }
    });

    it('401 chama unauthorized handler e limpa auth', async () => {
        const handler = vi.fn();
        setUnauthorizedHandler(handler);
        setAuth('t', 60);
        mockFetch(() =>
            new Response(JSON.stringify({ error: 'unauth' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        await expect(api('/api/x')).rejects.toThrow();
        expect(handler).toHaveBeenCalled();
        expect(getToken()).toBeNull();
        setUnauthorizedHandler(() => {});
    });

    it('401 com auth:false NÃO dispara handler', async () => {
        const handler = vi.fn();
        setUnauthorizedHandler(handler);
        mockFetch(() =>
            new Response(JSON.stringify({}), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        await expect(api('/api/x', { auth: false })).rejects.toThrow();
        expect(handler).not.toHaveBeenCalled();
        setUnauthorizedHandler(() => {});
    });

    it('lida com response não-JSON', async () => {
        mockFetch(() => new Response('plain-text', { status: 200 }));
        const out = await api<string>('/api/x');
        expect(out).toBe('plain-text');
    });

    it('lida com JSON corrompido (catch)', async () => {
        mockFetch(() =>
            new Response('{not-json', {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        const out = await api('/api/x');
        expect(out).toBeNull();
    });

    it('aceita path absoluto ou relativo', async () => {
        let url: string | null = null;
        mockFetch((u) => {
            url = u;
            return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
        });
        await api('/api/abs');
        expect(url).toBe('/api/abs');
        await api('relative');
        expect(url).toBe('/relative');
    });

    it('respeita signal pra abort', async () => {
        const ac = new AbortController();
        mockFetch(
            (_, init) =>
                new Promise<Response>((_, reject) => {
                    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
                }),
        );
        const promise = api('/api/x', { signal: ac.signal });
        ac.abort();
        await expect(promise).rejects.toThrow(/aborted/);
    });
});

describe('ApiError', () => {
    it('expõe status e body', () => {
        const err = new ApiError(418, { x: 1 }, 'teapot');
        expect(err.status).toBe(418);
        expect(err.body).toEqual({ x: 1 });
        expect(err.message).toBe('teapot');
        expect(err.name).toBe('ApiError');
    });
});

describe('setUnauthorizedHandler', () => {
    it('substitui o handler ativo', () => {
        const a = vi.fn();
        const b = vi.fn();
        setUnauthorizedHandler(a);
        setUnauthorizedHandler(b);
        // Forçar 401 deveria chamar 'b', não 'a'.
        clearAuth();
    });
});
