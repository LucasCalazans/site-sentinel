import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckNewPage } from './CheckNew.tsx';
import { setAuth } from '@/lib/auth.ts';
import { installFetchMock, jsonResp, renderWithRouter } from '@/test-utils.tsx';

let restore: (() => void) | null = null;

beforeEach(() => {
    localStorage.clear();
    setAuth('t', 3600);
});

afterEach(() => {
    restore?.();
});

describe('CheckNewPage', () => {
    it('renderiza form com defaults', () => {
        renderWithRouter({ path: '/checks/new', children: <CheckNewPage /> });
        expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/^type$/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/cron_pattern/i)).toBeInTheDocument();
    });

    it('troca defaults de config ao selecionar tipo', async () => {
        const user = userEvent.setup();
        renderWithRouter({ path: '/checks/new', children: <CheckNewPage /> });
        const configEl = screen.getByLabelText(/config/i) as HTMLTextAreaElement;
        expect(configEl.value).toContain('targets');
        await user.selectOptions(screen.getByLabelText(/^type$/i), 'integrity');
        expect(configEl.value).toContain('downloadUrl');
    });

    it('valida JSON antes de submeter', async () => {
        const user = userEvent.setup();
        renderWithRouter({ path: '/checks/new', children: <CheckNewPage /> });
        await user.type(screen.getByLabelText(/name/), 'x');
        const config = screen.getByLabelText(/config/) as HTMLTextAreaElement;
        await user.clear(config);
        await user.type(config, 'not-json');
        await user.click(screen.getByRole('button', { name: /criar/i }));
        expect(screen.getByRole('alert')).toHaveTextContent(/JSON/);
    });

    it('submete e cria, redirecionando pra detail', async () => {
        restore = installFetchMock([
            {
                match: '/api/checks',
                response: () =>
                    jsonResp({
                        check: {
                            id: 42,
                            name: 'x',
                            type: 'performance',
                            config: {},
                            enabled: true,
                            cron_pattern: '*/5 * * * *',
                            app_label: 'test',
                            created_at: 0,
                            updated_at: 0,
                        },
                    }, 201),
            },
            // Subsequent: detail page (mockada como vazia).
            { match: '/api/checks/42', response: () => jsonResp({ check: null }, 404) },
        ]);
        const user = userEvent.setup();
        renderWithRouter({ path: '/checks/new', children: <CheckNewPage /> });
        await user.type(screen.getByLabelText(/name/), 'x');
        await user.click(screen.getByRole('button', { name: /criar/i }));
        // Navega pra /checks/42 — fora do harness, vira catchall.
        await waitFor(() => {
            expect(screen.getByTestId('catchall')).toBeInTheDocument();
        });
    });

    it('mostra erro do backend (409 name duplicado)', async () => {
        restore = installFetchMock([
            {
                match: '/api/checks',
                response: () => jsonResp({ error: 'name já existe' }, 409),
            },
        ]);
        const user = userEvent.setup();
        renderWithRouter({ path: '/checks/new', children: <CheckNewPage /> });
        await user.type(screen.getByLabelText(/name/), 'dup');
        await user.click(screen.getByRole('button', { name: /criar/i }));
        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent(/já existe/);
        });
    });
});
