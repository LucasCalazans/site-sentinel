import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthGate } from './AuthGate.tsx';
import { setAuth, clearAuth } from '@/lib/auth.ts';

beforeEach(() => {
    localStorage.clear();
});

function renderWith(initialPath: string) {
    return render(
        <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
                <Route
                    path="/protected"
                    element={
                        <AuthGate>
                            <div data-testid="secret">secret</div>
                        </AuthGate>
                    }
                />
                <Route path="/login" element={<div data-testid="login-page">login</div>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('AuthGate', () => {
    it('redireciona pra /login quando não autenticado', () => {
        renderWith('/protected');
        expect(screen.getByTestId('login-page')).toBeInTheDocument();
        expect(screen.queryByTestId('secret')).toBeNull();
    });

    it('renderiza children quando autenticado', () => {
        setAuth('t', 3600);
        renderWith('/protected');
        expect(screen.getByTestId('secret')).toBeInTheDocument();
    });

    it('redireciona quando token expirou', () => {
        setAuth('t', 60);
        // Força expiry pro passado.
        localStorage.setItem(
            'site-sentinel.token.expires_at',
            String(Date.now() - 1000),
        );
        renderWith('/protected');
        expect(screen.getByTestId('login-page')).toBeInTheDocument();
        clearAuth();
    });
});
