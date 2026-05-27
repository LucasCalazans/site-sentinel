import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { AlertsPage } from './Alerts.tsx';
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

describe('AlertsPage', () => {
    it('lista alertas', async () => {
        restore = installFetchMock([
            {
                match: '/api/alerts',
                response: () =>
                    jsonResp({
                        alerts: [
                            {
                                id: 1,
                                run_id: 100,
                                channel: 'discord',
                                status: 'sent',
                                error_message: null,
                                sent_at: Date.now(),
                            },
                            {
                                id: 2,
                                run_id: 101,
                                channel: 'discord',
                                status: 'failed',
                                error_message: 'rate limit',
                                sent_at: Date.now(),
                            },
                        ],
                    }),
            },
        ]);
        renderWithRouter({ path: '/alerts', children: <AlertsPage /> });
        await waitFor(() => {
            expect(screen.getByText('sent')).toBeInTheDocument();
            expect(screen.getByText('failed')).toBeInTheDocument();
            expect(screen.getByText('rate limit')).toBeInTheDocument();
        });
    });

    it('mensagem quando vazio', async () => {
        restore = installFetchMock([
            { match: '/api/alerts', response: () => jsonResp({ alerts: [] }) },
        ]);
        renderWithRouter({ path: '/alerts', children: <AlertsPage /> });
        await waitFor(() => {
            expect(screen.getByText(/nenhum alerta/)).toBeInTheDocument();
        });
    });

    it('mostra erro', async () => {
        restore = installFetchMock([
            { match: '/api/alerts', response: () => jsonResp({ error: 'no' }, 500) },
        ]);
        renderWithRouter({ path: '/alerts', children: <AlertsPage /> });
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('no'));
    });
});
