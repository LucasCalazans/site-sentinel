// API client. Wrappa fetch com:
//   - Base URL (VITE_API_URL ou /api via proxy do vite em dev)
//   - Authorization Bearer automatic
//   - JSON serialization/parse
//   - 401 → limpa token + dispara evento global pra UI redirecionar

import { getToken, clearAuth } from './auth.ts';

const BASE = import.meta.env.VITE_API_URL?.replace(/\/+$/, '') ?? '';

export class ApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly body: unknown,
        message: string,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

export interface ApiOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    auth?: boolean; // default true
    signal?: AbortSignal;
}

function buildHeaders(opts: ApiOptions): Headers {
    const h = new Headers();
    if (opts.body !== undefined) h.set('Content-Type', 'application/json');
    if (opts.auth !== false) {
        const token = getToken();
        if (token) h.set('Authorization', `Bearer ${token}`);
    }
    return h;
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: () => void): void {
    onUnauthorized = handler;
}

export async function api<T = unknown>(
    path: string,
    opts: ApiOptions = {},
): Promise<T> {
    const url = path.startsWith('/') ? `${BASE}${path}` : `${BASE}/${path}`;
    const res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers: buildHeaders(opts),
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: opts.signal,
    });
    let body: unknown = null;
    const ct = res.headers.get('Content-Type') ?? '';
    if (ct.includes('application/json')) {
        try {
            body = await res.json();
        } catch {
            body = null;
        }
    } else {
        body = await res.text();
    }
    if (!res.ok) {
        if (res.status === 401 && opts.auth !== false) {
            clearAuth();
            onUnauthorized?.();
        }
        const message =
            (body && typeof body === 'object' && 'error' in body
                ? String((body as { error: unknown }).error)
                : null) ?? `HTTP ${res.status}`;
        throw new ApiError(res.status, body, message);
    }
    return body as T;
}
