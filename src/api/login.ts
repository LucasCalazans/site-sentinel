// POST /api/login — verifica password com ADMIN_PASSWORD_HASH e devolve JWT.
// O frontend guarda o token em localStorage e injeta como Bearer nas reqs.

import { signJwt } from '../auth/jwt.ts';
import { verifyPassword } from '../auth/password.ts';
import { badRequest, jsonResponse, unauthorized } from './responses.ts';
import type { RouteContext } from './router.ts';

interface LoginBody {
    password?: unknown;
}

export async function loginHandler(ctx: RouteContext): Promise<Response> {
    let body: LoginBody;
    try {
        body = (await ctx.req.json()) as LoginBody;
    } catch {
        return badRequest('JSON body inválido');
    }
    if (typeof body.password !== 'string' || !body.password) {
        return badRequest('password obrigatório (string não-vazia)');
    }
    const ok = await verifyPassword(body.password, ctx.env.ADMIN_PASSWORD_HASH);
    if (!ok) {
        return unauthorized('credenciais inválidas');
    }
    const days = Number.parseInt(ctx.env.JWT_EXPIRY_DAYS || '7', 10);
    const safeDays = Number.isFinite(days) && days > 0 ? days : 7;
    const expirySec = safeDays * 86400;
    const token = await signJwt(
        { sub: 'admin' },
        ctx.env.JWT_SIGNING_KEY,
        expirySec,
    );
    return jsonResponse({ token, expiresInSec: expirySec });
}
