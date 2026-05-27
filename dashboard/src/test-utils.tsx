import { ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

export interface RouteHarness {
    path: string;
    initialPath?: string;
    children: ReactNode;
}

// Renderiza componente dentro de Router com uma rota específica. Útil pra
// páginas que usam useParams/useNavigate.
export function renderWithRouter(
    { path, initialPath, children }: RouteHarness,
    options?: RenderOptions,
) {
    return render(
        <MemoryRouter initialEntries={[initialPath ?? path]}>
            <Routes>
                <Route path={path} element={children} />
                <Route path="*" element={<div data-testid="catchall" />} />
            </Routes>
        </MemoryRouter>,
        options,
    );
}

// Mock global fetch retornando handlers programados em ordem por URL.
export interface MockFetchHandler {
    match: string | RegExp;
    response: (init?: RequestInit) => Response | Promise<Response>;
}

export function installFetchMock(handlers: MockFetchHandler[]): () => void {
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        for (const h of handlers) {
            const matches = typeof h.match === 'string' ? url.includes(h.match) : h.match.test(url);
            if (matches) return h.response(init);
        }
        return new Response(JSON.stringify({ error: `unmocked: ${url}` }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }) as typeof fetch;
    return () => {
        globalThis.fetch = original;
    };
}

export function jsonResp<T>(body: T, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
