import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { CloudflarePage } from './Cloudflare.tsx';
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

const snapshots = [
    {
        kind: 'cloudflare.pages',
        captured_at: Date.now(),
        payload: [
            {
                name: 'sonda-landing',
                domains: ['sonda-recover.com'],
                production_branch: 'master',
                latest_deployment: {
                    short_id: 'abc12345',
                    environment: 'production',
                    created_on: '2026-05-01',
                    latest_stage: { status: 'success' },
                },
            },
        ],
    },
    {
        kind: 'cloudflare.workers',
        captured_at: Date.now(),
        payload: [{ id: 'site-sentinel', modified_on: '2026-05-01', routes_count: 1 }],
    },
    {
        kind: 'cloudflare.d1',
        captured_at: Date.now(),
        payload: [
            { name: 'sonda-license', uuid: 'aaaa1111-bbbb', num_tables: 4, file_size: 1024 * 50 },
        ],
    },
    {
        kind: 'cloudflare.analytics',
        captured_at: Date.now(),
        payload: {
            requests: { all: 1000, cached: 800, uncached: 200 },
            bandwidth: { all: 50_000_000 },
            threats: { all: 0 },
            pageviews: { all: 100 },
            uniques: { all: 50 },
        },
    },
];

describe('CloudflarePage', () => {
    it('renderiza analytics, pages, workers, d1', async () => {
        restore = installFetchMock([
            {
                match: '/api/integrations/cloudflare',
                response: () => jsonResp({ snapshots }),
            },
        ]);
        renderWithRouter({ path: '/cloudflare', children: <CloudflarePage /> });
        await waitFor(() => {
            expect(screen.getByText('sonda-landing')).toBeInTheDocument();
            expect(screen.getByText('site-sentinel')).toBeInTheDocument();
            expect(screen.getByText('sonda-license')).toBeInTheDocument();
            expect(screen.getByText('1,000')).toBeInTheDocument(); // requests
        });
    });

    it('renderiza vazio se snapshots ausentes', async () => {
        restore = installFetchMock([
            {
                match: '/api/integrations/cloudflare',
                response: () => jsonResp({ snapshots: [] }),
            },
        ]);
        renderWithRouter({ path: '/cloudflare', children: <CloudflarePage /> });
        await waitFor(() => {
            expect(screen.getAllByText(/nenhum/).length).toBeGreaterThan(0);
        });
    });

    it('erro', async () => {
        restore = installFetchMock([
            {
                match: '/api/integrations/cloudflare',
                response: () => jsonResp({ error: 'down' }, 500),
            },
        ]);
        renderWithRouter({ path: '/cloudflare', children: <CloudflarePage /> });
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('down'));
    });
});
