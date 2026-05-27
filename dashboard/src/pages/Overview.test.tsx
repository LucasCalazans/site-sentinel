import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { OverviewPage } from './Overview.tsx';
import { setAuth } from '@/lib/auth.ts';
import { installFetchMock, jsonResp, renderWithRouter } from '@/test-utils.tsx';

let restoreFetch: (() => void) | null = null;

beforeEach(() => {
    localStorage.clear();
    setAuth('t', 3600);
});

afterEach(() => {
    restoreFetch?.();
});

describe('OverviewPage', () => {
    it('renderiza cards com runs do backend', async () => {
        restoreFetch = installFetchMock([
            {
                match: '/api/runs/latest',
                response: () =>
                    jsonResp({
                        runs: [
                            {
                                id: 1,
                                check_id: 10,
                                check_name: 'sonda.performance',
                                severity: 'ok',
                                message: '4 targets OK',
                                duration_ms: 80,
                                details: null,
                                ran_at: Date.now(),
                            },
                            {
                                id: 2,
                                check_id: 11,
                                check_name: 'sonda.integrity',
                                severity: 'critical',
                                message: 'SHA-256 mismatch',
                                duration_ms: 600,
                                details: null,
                                ran_at: Date.now(),
                            },
                        ],
                    }),
            },
        ]);
        renderWithRouter({ path: '/', children: <OverviewPage /> });
        await waitFor(() => {
            expect(screen.getByText('sonda.performance')).toBeInTheDocument();
            expect(screen.getByText('sonda.integrity')).toBeInTheDocument();
        });
        expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    });

    it('mensagem quando vazio', async () => {
        restoreFetch = installFetchMock([
            { match: '/api/runs/latest', response: () => jsonResp({ runs: [] }) },
        ]);
        renderWithRouter({ path: '/', children: <OverviewPage /> });
        await waitFor(() => {
            expect(screen.getByText(/Nenhum check rodou/)).toBeInTheDocument();
        });
    });

    it('mostra erro em falha', async () => {
        restoreFetch = installFetchMock([
            {
                match: '/api/runs/latest',
                response: () => jsonResp({ error: 'down' }, 500),
            },
        ]);
        renderWithRouter({ path: '/', children: <OverviewPage /> });
        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent('down');
        });
    });
});
