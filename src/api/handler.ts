// Entry point HTTP do Worker. Monta router, aplica CORS, exige auth nas
// rotas privadas, e devolve 404 pro que não bater.

import { requireAuth } from '../auth/middleware.ts';
import { preflight, withCors } from './cors.ts';
import type { Env } from './env.ts';
import { loginHandler } from './login.ts';
import {
    createCheckHandler,
    deleteCheckHandler,
    getCheckHandler,
    listChecksHandler,
    updateCheckHandler,
} from './checks.ts';
import { failingRunsHandler, latestRunsHandler, listRunsHandler } from './runs.ts';
import { listAlertsHandler } from './alerts.ts';
import {
    cloudflareSnapshotsHandler,
    githubSnapshotsHandler,
} from './integrations.ts';
import { jsonResponse, notFound, serverError } from './responses.ts';
import { Router, type Handler } from './router.ts';

const PUBLIC_PATHS = new Set(['/api/login', '/', '/api/health']);

// Wrap pra exigir auth: aplica requireAuth antes do handler real.
function authed(handler: Handler): Handler {
    return async (ctx) => {
        const result = await requireAuth(ctx.req, ctx.env.JWT_SIGNING_KEY);
        if (result.kind === 'unauthorized') return result.response;
        return handler(ctx);
    };
}

function buildRouter(): Router {
    const r = new Router();
    r.on('POST', '/api/login', loginHandler);
    r.on('GET', '/api/checks', authed(listChecksHandler));
    r.on('POST', '/api/checks', authed(createCheckHandler));
    r.on('GET', '/api/checks/:id', authed(getCheckHandler));
    r.on('PUT', '/api/checks/:id', authed(updateCheckHandler));
    r.on('DELETE', '/api/checks/:id', authed(deleteCheckHandler));
    r.on('GET', '/api/runs', authed(listRunsHandler));
    r.on('GET', '/api/runs/latest', authed(latestRunsHandler));
    r.on('GET', '/api/runs/failing', authed(failingRunsHandler));
    r.on('GET', '/api/alerts', authed(listAlertsHandler));
    r.on('GET', '/api/integrations/cloudflare', authed(cloudflareSnapshotsHandler));
    r.on('GET', '/api/integrations/github', authed(githubSnapshotsHandler));
    return r;
}

let router: Router | null = null;
function getRouter(): Router {
    if (!router) router = buildRouter();
    return router;
}

// Health/root endpoints públicos.
async function rootHandler(): Promise<Response> {
    return jsonResponse({
        name: 'site-sentinel',
        version: '0.2.0',
        endpoints: ['/api/login', '/api/checks', '/api/runs', '/api/alerts'],
    });
}

async function healthHandler({ env }: { env: Env }): Promise<Response> {
    // Health bate no D1 pra confirmar binding funcional.
    try {
        const row = await env.DB.prepare('SELECT 1 as ok').first<{ ok: number }>();
        return jsonResponse({ ok: true, db: row?.ok === 1 });
    } catch (err) {
        return jsonResponse({ ok: false, error: (err as Error).message }, 500);
    }
}

export async function handleRequest(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const allowedCsv = env.ALLOWED_ORIGINS;

    // CORS preflight
    if (req.method === 'OPTIONS') {
        return preflight(req, allowedCsv);
    }

    // Public endpoints
    if (url.pathname === '/' && req.method === 'GET') {
        return withCors(await rootHandler(), req, allowedCsv);
    }
    if (url.pathname === '/api/health' && req.method === 'GET') {
        return withCors(await healthHandler({ env }), req, allowedCsv);
    }

    // Rotas /api/* — passa pelo router.
    if (url.pathname.startsWith('/api/')) {
        try {
            const resp = await getRouter().dispatch(req, env);
            if (resp) return withCors(resp, req, allowedCsv);
            return withCors(notFound('rota não existe'), req, allowedCsv);
        } catch (err) {
            console.error('handler error', err);
            return withCors(serverError((err as Error).message), req, allowedCsv);
        }
    }

    return withCors(notFound('rota não existe'), req, allowedCsv);
}

// Marca paths "públicos" pra introspecção/debug (ex.: docs futuras).
export function isPublicPath(path: string): boolean {
    return PUBLIC_PATHS.has(path);
}
