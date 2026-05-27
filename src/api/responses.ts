// JSON Response helpers. Centraliza Content-Type, status codes e formato
// de erro pra a UI consumir consistentemente.

export function jsonResponse(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
    const headers = new Headers(extraHeaders);
    headers.set('Content-Type', 'application/json; charset=utf-8');
    return new Response(JSON.stringify(body), { status, headers });
}

export function badRequest(message: string): Response {
    return jsonResponse({ error: message }, 400);
}

export function unauthorized(message = 'unauthorized'): Response {
    return jsonResponse({ error: message }, 401);
}

export function notFound(message = 'not found'): Response {
    return jsonResponse({ error: message }, 404);
}

export function serverError(message = 'internal server error'): Response {
    return jsonResponse({ error: message }, 500);
}

export function methodNotAllowed(message = 'method not allowed'): Response {
    return jsonResponse({ error: message }, 405);
}
