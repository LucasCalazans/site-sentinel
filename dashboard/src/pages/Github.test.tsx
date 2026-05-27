import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { GithubPage } from './Github.tsx';
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
        kind: 'github.repo.a/b',
        captured_at: Date.now(),
        payload: {
            full_name: 'a/b',
            description: 'cool repo',
            stars: 42,
            forks: 5,
            open_issues: 3,
            html_url: 'https://github.com/a/b',
            pushed_at: '2026-01-01',
        },
    },
    {
        kind: 'github.release.a/b',
        captured_at: Date.now(),
        payload: {
            tag_name: 'v1.0.0',
            published_at: '2026-05-01',
            html_url: 'https://github.com/a/b/releases/v1.0.0',
            assets: [{ name: 'app.exe', size: 1024 * 1024 * 2, download_count: 100 }],
        },
    },
    {
        kind: 'github.actions.a/b',
        captured_at: Date.now(),
        payload: [
            {
                id: 1,
                name: 'CI',
                conclusion: 'success',
                status: 'completed',
                head_branch: 'master',
                run_number: 42,
                created_at: '',
                html_url: 'https://...',
            },
        ],
    },
    {
        kind: 'github.issues.a/b',
        captured_at: Date.now(),
        payload: [
            {
                number: 1,
                title: 'fix bug',
                user: 'alice',
                html_url: 'https://...',
                is_pull_request: false,
            },
            {
                number: 2,
                title: 'add feature',
                user: 'bob',
                html_url: 'https://...',
                is_pull_request: true,
            },
        ],
    },
];

describe('GithubPage', () => {
    it('renderiza cards de repo + release + actions + issues', async () => {
        restore = installFetchMock([
            {
                match: '/api/integrations/github',
                response: () => jsonResp({ snapshots }),
            },
        ]);
        renderWithRouter({ path: '/github', children: <GithubPage /> });
        await waitFor(() => {
            expect(screen.getByText('a/b')).toBeInTheDocument();
            expect(screen.getByText('cool repo')).toBeInTheDocument();
            expect(screen.getByText('v1.0.0')).toBeInTheDocument();
            // Actions e issues estão em <details>; o summary é visível.
            expect(screen.getByText(/CI/)).toBeInTheDocument();
        });
    });

    it('mensagem quando release é null', async () => {
        restore = installFetchMock([
            {
                match: '/api/integrations/github',
                response: () =>
                    jsonResp({
                        snapshots: [
                            {
                                kind: 'github.release.x/y',
                                captured_at: Date.now(),
                                payload: null,
                            },
                        ],
                    }),
            },
        ]);
        renderWithRouter({ path: '/github', children: <GithubPage /> });
        await waitFor(() =>
            expect(screen.getByText(/sem release/)).toBeInTheDocument(),
        );
    });

    it('mensagem quando 0 issues', async () => {
        restore = installFetchMock([
            {
                match: '/api/integrations/github',
                response: () =>
                    jsonResp({
                        snapshots: [
                            {
                                kind: 'github.issues.x/y',
                                captured_at: Date.now(),
                                payload: [],
                            },
                        ],
                    }),
            },
        ]);
        renderWithRouter({ path: '/github', children: <GithubPage /> });
        await waitFor(() =>
            expect(screen.getByText(/0 issues abertas/)).toBeInTheDocument(),
        );
    });

    it('erro', async () => {
        restore = installFetchMock([
            {
                match: '/api/integrations/github',
                response: () => jsonResp({ error: 'down' }, 500),
            },
        ]);
        renderWithRouter({ path: '/github', children: <GithubPage /> });
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('down'));
    });
});
