import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckDetailPage } from './CheckDetail.tsx';
import { setAuth } from '@/lib/auth.ts';
import { installFetchMock, jsonResp, renderWithRouter } from '@/test-utils.tsx';

let restore: (() => void) | null = null;
const sampleCheck = {
    id: 5,
    name: 'sonda.test',
    type: 'performance' as const,
    config: { targets: [] },
    enabled: true,
    cron_pattern: '*/5 * * * *',
    app_label: 'sonda',
    created_at: 0,
    updated_at: 0,
};

beforeEach(() => {
    localStorage.clear();
    setAuth('t', 3600);
});

afterEach(() => {
    restore?.();
    vi.restoreAllMocks();
});

describe('CheckDetailPage', () => {
    it('carrega check + runs', async () => {
        restore = installFetchMock([
            {
                match: /\/api\/checks\/5$/,
                response: () => jsonResp({ check: sampleCheck }),
            },
            {
                match: '/api/runs?check_id=5',
                response: () =>
                    jsonResp({
                        runs: [
                            {
                                id: 1,
                                check_id: 5,
                                severity: 'ok',
                                message: 'fine',
                                duration_ms: 50,
                                details: null,
                                ran_at: Date.now(),
                            },
                        ],
                    }),
            },
        ]);
        renderWithRouter({
            path: '/checks/:id',
            initialPath: '/checks/5',
            children: <CheckDetailPage />,
        });
        await waitFor(() => {
            expect(screen.getByText('sonda.test')).toBeInTheDocument();
        });
        expect(screen.getByText('fine')).toBeInTheDocument();
    });

    it('toggle enabled chama PUT', async () => {
        let putCalled = false;
        restore = installFetchMock([
            {
                match: /\/api\/checks\/5$/,
                response: (init) => {
                    if (init?.method === 'PUT') {
                        putCalled = true;
                        return jsonResp({ check: { ...sampleCheck, enabled: false } });
                    }
                    return jsonResp({ check: sampleCheck });
                },
            },
            { match: '/api/runs?check_id=5', response: () => jsonResp({ runs: [] }) },
        ]);
        const user = userEvent.setup();
        renderWithRouter({
            path: '/checks/:id',
            initialPath: '/checks/5',
            children: <CheckDetailPage />,
        });
        await waitFor(() => screen.getByText('sonda.test'));
        await user.click(screen.getByRole('button', { name: /desabilitar/i }));
        await waitFor(() => expect(putCalled).toBe(true));
        await waitFor(() =>
            expect(screen.getByRole('button', { name: /habilitar/i })).toBeInTheDocument(),
        );
    });

    it('delete confirma e chama DELETE', async () => {
        let deleted = false;
        restore = installFetchMock([
            {
                match: /\/api\/checks\/5$/,
                response: (init) => {
                    if (init?.method === 'DELETE') {
                        deleted = true;
                        return jsonResp({ deleted: true });
                    }
                    return jsonResp({ check: sampleCheck });
                },
            },
            { match: '/api/runs?check_id=5', response: () => jsonResp({ runs: [] }) },
        ]);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const user = userEvent.setup();
        renderWithRouter({
            path: '/checks/:id',
            initialPath: '/checks/5',
            children: <CheckDetailPage />,
        });
        await waitFor(() => screen.getByText('sonda.test'));
        await user.click(screen.getByRole('button', { name: /apagar/i }));
        await waitFor(() => expect(deleted).toBe(true));
    });

    it('delete não chama DELETE quando user cancela', async () => {
        let deleted = false;
        restore = installFetchMock([
            {
                match: /\/api\/checks\/5$/,
                response: (init) => {
                    if (init?.method === 'DELETE') deleted = true;
                    return jsonResp({ check: sampleCheck });
                },
            },
            { match: '/api/runs?check_id=5', response: () => jsonResp({ runs: [] }) },
        ]);
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        const user = userEvent.setup();
        renderWithRouter({
            path: '/checks/:id',
            initialPath: '/checks/5',
            children: <CheckDetailPage />,
        });
        await waitFor(() => screen.getByText('sonda.test'));
        await user.click(screen.getByRole('button', { name: /apagar/i }));
        expect(deleted).toBe(false);
    });

    it('mostra erro genérico', async () => {
        restore = installFetchMock([
            {
                match: /\/api\/checks\/5$/,
                response: () => jsonResp({ error: 'oops' }, 500),
            },
            { match: '/api/runs?check_id=5', response: () => jsonResp({ runs: [] }) },
        ]);
        renderWithRouter({
            path: '/checks/:id',
            initialPath: '/checks/5',
            children: <CheckDetailPage />,
        });
        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent('oops');
        });
    });
});
