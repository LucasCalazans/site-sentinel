import { describe, expect, it } from 'vitest';
import { Router } from './router.ts';
import type { Env } from './env.ts';

const fakeEnv = {} as Env;

function jsonResp(body: unknown): Response {
    return new Response(JSON.stringify(body), { status: 200 });
}

describe('Router', () => {
    it('roteia GET com path estático', async () => {
        const r = new Router();
        r.on('GET', '/api/ping', async () => jsonResp({ pong: true }));
        const resp = await r.dispatch(
            new Request('https://x.test/api/ping'),
            fakeEnv,
        );
        expect(resp).not.toBeNull();
        expect(await resp?.json()).toEqual({ pong: true });
    });

    it('captura param :id', async () => {
        const r = new Router();
        r.on('GET', '/api/checks/:id', async ({ params }) =>
            jsonResp({ id: params.id }),
        );
        const resp = await r.dispatch(
            new Request('https://x.test/api/checks/42'),
            fakeEnv,
        );
        expect(await resp?.json()).toEqual({ id: '42' });
    });

    it('captura múltiplos params', async () => {
        const r = new Router();
        r.on('GET', '/api/:resource/:id/:action', async ({ params }) =>
            jsonResp(params),
        );
        const resp = await r.dispatch(
            new Request('https://x.test/api/checks/7/edit'),
            fakeEnv,
        );
        expect(await resp?.json()).toEqual({
            resource: 'checks',
            id: '7',
            action: 'edit',
        });
    });

    it('decodifica URI params', async () => {
        const r = new Router();
        r.on('GET', '/api/:name', async ({ params }) => jsonResp({ name: params.name }));
        const resp = await r.dispatch(
            new Request('https://x.test/api/hello%20world'),
            fakeEnv,
        );
        expect(await resp?.json()).toEqual({ name: 'hello world' });
    });

    it('discrimina por método', async () => {
        const r = new Router();
        r.on('GET', '/api/x', async () => jsonResp({ m: 'GET' }));
        r.on('POST', '/api/x', async () => jsonResp({ m: 'POST' }));
        const getResp = await r.dispatch(
            new Request('https://x.test/api/x'),
            fakeEnv,
        );
        const postResp = await r.dispatch(
            new Request('https://x.test/api/x', { method: 'POST' }),
            fakeEnv,
        );
        expect(await getResp?.json()).toEqual({ m: 'GET' });
        expect(await postResp?.json()).toEqual({ m: 'POST' });
    });

    it('retorna null pra rota não-registrada', async () => {
        const r = new Router();
        r.on('GET', '/api/x', async () => jsonResp({}));
        const resp = await r.dispatch(
            new Request('https://x.test/api/y'),
            fakeEnv,
        );
        expect(resp).toBeNull();
    });

    it('retorna null pra método não-registrado na rota', async () => {
        const r = new Router();
        r.on('GET', '/api/x', async () => jsonResp({}));
        const resp = await r.dispatch(
            new Request('https://x.test/api/x', { method: 'DELETE' }),
            fakeEnv,
        );
        expect(resp).toBeNull();
    });

    it('não casa quando há trecho extra após :param', async () => {
        const r = new Router();
        r.on('GET', '/api/checks/:id', async () => jsonResp({}));
        const resp = await r.dispatch(
            new Request('https://x.test/api/checks/1/extra'),
            fakeEnv,
        );
        expect(resp).toBeNull();
    });

    it('on() retorna this pra chaining', () => {
        const r = new Router();
        const chained = r
            .on('GET', '/a', async () => jsonResp({}))
            .on('POST', '/b', async () => jsonResp({}));
        expect(chained).toBe(r);
    });
});
