import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChecksListPage } from './ChecksList.tsx';
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

const sample = [
    {
        id: 1,
        name: 'sonda.performance',
        type: 'performance',
        config: {},
        enabled: true,
        cron_pattern: '*/5 * * * *',
        app_label: 'sonda',
        created_at: 0,
        updated_at: Date.now(),
    },
    {
        id: 2,
        name: 'sonda.integrity',
        type: 'integrity',
        config: {},
        enabled: false,
        cron_pattern: '0 * * * *',
        app_label: 'sonda',
        created_at: 0,
        updated_at: Date.now(),
    },
];

describe('ChecksListPage', () => {
    it('lista checks do backend', async () => {
        restore = installFetchMock([
            { match: '/api/checks', response: () => jsonResp({ checks: sample }) },
        ]);
        renderWithRouter({ path: '/checks', children: <ChecksListPage /> });
        await waitFor(() => {
            expect(screen.getByText('sonda.performance')).toBeInTheDocument();
            expect(screen.getByText('sonda.integrity')).toBeInTheDocument();
        });
    });

    it('filtra pelo input', async () => {
        restore = installFetchMock([
            { match: '/api/checks', response: () => jsonResp({ checks: sample }) },
        ]);
        const user = userEvent.setup();
        renderWithRouter({ path: '/checks', children: <ChecksListPage /> });
        await waitFor(() => screen.getByText('sonda.performance'));
        await user.type(screen.getByLabelText(/filtro/), 'integrity');
        expect(screen.queryByText('sonda.performance')).toBeNull();
        expect(screen.getByText('sonda.integrity')).toBeInTheDocument();
    });

    it('mensagem quando filtro não bate', async () => {
        restore = installFetchMock([
            { match: '/api/checks', response: () => jsonResp({ checks: sample }) },
        ]);
        const user = userEvent.setup();
        renderWithRouter({ path: '/checks', children: <ChecksListPage /> });
        await waitFor(() => screen.getByText('sonda.performance'));
        await user.type(screen.getByLabelText(/filtro/), 'zzzz');
        expect(screen.getByText('Nenhum check.')).toBeInTheDocument();
    });

    it('mostra erro em falha', async () => {
        restore = installFetchMock([
            { match: '/api/checks', response: () => jsonResp({ error: 'no' }, 500) },
        ]);
        renderWithRouter({ path: '/checks', children: <ChecksListPage /> });
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('no'));
    });
});
