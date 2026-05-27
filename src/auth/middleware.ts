// Auth middleware. Extrai Bearer token, valida JWT, retorna payload OU
// Response 401 que o handler deve devolver direto. Não atrelado a framework.

import { verifyJwt, type JwtPayload } from './jwt.ts';

export type AuthResult =
    | { kind: 'ok'; payload: JwtPayload }
    | { kind: 'unauthorized'; response: Response };

function unauthorized(reason: string): Response {
    return new Response(JSON.stringify({ error: reason }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
    });
}

export async function requireAuth(req: Request, signingKey: string): Promise<AuthResult> {
    const auth = req.headers.get('Authorization');
    if (!auth) return { kind: 'unauthorized', response: unauthorized('missing Authorization header') };
    if (!auth.startsWith('Bearer ')) {
        return { kind: 'unauthorized', response: unauthorized('expected Bearer scheme') };
    }
    const token = auth.slice('Bearer '.length).trim();
    if (!token) {
        return { kind: 'unauthorized', response: unauthorized('empty bearer token') };
    }
    const payload = await verifyJwt(token, signingKey);
    if (!payload) {
        return { kind: 'unauthorized', response: unauthorized('invalid or expired token') };
    }
    return { kind: 'ok', payload };
}
