import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar.tsx';
import { setAuth, getToken } from '@/lib/auth.ts';

beforeEach(() => {
    localStorage.clear();
});

describe('Sidebar', () => {
    it('renderiza todos os links', () => {
        render(
            <MemoryRouter>
                <Sidebar />
            </MemoryRouter>,
        );
        expect(screen.getByRole('link', { name: /overview/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /checks/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /github/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /cloudflare/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /alerts/i })).toBeInTheDocument();
    });

    it('marca link ativo conforme rota', () => {
        render(
            <MemoryRouter initialEntries={['/checks']}>
                <Sidebar />
            </MemoryRouter>,
        );
        const checksLink = screen.getByRole('link', { name: /checks/i });
        expect(checksLink.className).toMatch(/cyan/);
    });

    it('botão Sair limpa auth', async () => {
        setAuth('t', 60);
        expect(getToken()).toBe('t');
        // jsdom não suporta navegação real — mockamos.
        const originalHref = window.location.href;
        Object.defineProperty(window, 'location', {
            value: { ...window.location, href: originalHref },
            writable: true,
        });
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <Sidebar />
            </MemoryRouter>,
        );
        await user.click(screen.getByRole('button', { name: /sair/i }));
        expect(getToken()).toBeNull();
    });
});
