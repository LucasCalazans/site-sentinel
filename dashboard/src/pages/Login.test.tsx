import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from './Login.tsx';
import { getToken } from '@/lib/auth.ts';

const originalFetch = globalThis.fetch;

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    globalThis.fetch = originalFetch;
});

function mockFetch(handler: (init?: RequestInit) => Response | Promise<Response>): void {
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        return handler(init);
    }) as typeof fetch;
}

function renderWithRouter() {
    return render(
        <MemoryRouter initialEntries={['/login']}>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/" element={<div data-testid="home">home</div>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('LoginPage', () => {
    it('renderiza form com input de senha', () => {
        renderWithRouter();
        expect(screen.getByLabelText(/senha admin/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument();
    });

    it('submete e redireciona pra / em sucesso', async () => {
        mockFetch(() =>
            new Response(JSON.stringify({ token: 'abc', expiresInSec: 3600 }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        const user = userEvent.setup();
        renderWithRouter();
        await user.type(screen.getByLabelText(/senha/i), 'minha-senha');
        await user.click(screen.getByRole('button', { name: /entrar/i }));
        await waitFor(() => {
            expect(screen.getByTestId('home')).toBeInTheDocument();
        });
        expect(getToken()).toBe('abc');
    });

    it('mostra erro pra senha incorreta (401)', async () => {
        mockFetch(() =>
            new Response(JSON.stringify({ error: 'credenciais inválidas' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        const user = userEvent.setup();
        renderWithRouter();
        await user.type(screen.getByLabelText(/senha/i), 'errada');
        await user.click(screen.getByRole('button', { name: /entrar/i }));
        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent(/senha incorreta/i);
        });
        expect(getToken()).toBeNull();
    });

    it('mostra erro genérico pra 500', async () => {
        mockFetch(() => new Response('', { status: 500 }));
        const user = userEvent.setup();
        renderWithRouter();
        await user.type(screen.getByLabelText(/senha/i), 'x');
        await user.click(screen.getByRole('button', { name: /entrar/i }));
        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent(/HTTP 500/);
        });
    });

    it('botão desabilita com senha vazia', () => {
        renderWithRouter();
        expect(screen.getByRole('button', { name: /entrar/i })).toBeDisabled();
    });

    it('mostra "entrando…" durante loading', async () => {
        let resolve!: (r: Response) => void;
        mockFetch(
            () =>
                new Promise<Response>((r) => {
                    resolve = r;
                }),
        );
        const user = userEvent.setup();
        renderWithRouter();
        await user.type(screen.getByLabelText(/senha/i), 'x');
        await user.click(screen.getByRole('button', { name: /entrar/i }));
        await waitFor(() =>
            expect(screen.getByRole('button')).toHaveTextContent(/entrando/),
        );
        // Resolve a request pra completar o teste.
        resolve(
            new Response(JSON.stringify({ token: 't', expiresInSec: 1 }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
    });
});
