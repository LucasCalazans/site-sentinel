// CORS minimal. ALLOWED_ORIGINS é CSV no wrangler.toml — split + whitelist
// estrita. Preflight responde 204 com os headers; respostas normais são
// envelopadas via withCors.

function allowedSet(csv: string): Set<string> {
    return new Set(csv.split(',').map((s) => s.trim()).filter(Boolean));
}

export function corsHeaders(originHeader: string | null, allowedCsv: string): Headers {
    const allowed = allowedSet(allowedCsv);
    const headers = new Headers();
    if (originHeader && allowed.has(originHeader)) {
        headers.set('Access-Control-Allow-Origin', originHeader);
    }
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    headers.set('Access-Control-Max-Age', '600');
    return headers;
}

export function preflight(req: Request, allowedCsv: string): Response {
    return new Response(null, {
        status: 204,
        headers: corsHeaders(req.headers.get('Origin'), allowedCsv),
    });
}

export function withCors(
    response: Response,
    req: Request,
    allowedCsv: string,
): Response {
    const cors = corsHeaders(req.headers.get('Origin'), allowedCsv);
    cors.forEach((value, key) => response.headers.set(key, value));
    return response;
}
