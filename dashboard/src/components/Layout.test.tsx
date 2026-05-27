import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from './Layout.tsx';

describe('Layout', () => {
    it('renderiza children no main', () => {
        render(
            <MemoryRouter>
                <Layout>
                    <div data-testid="content">conteúdo</div>
                </Layout>
            </MemoryRouter>,
        );
        expect(screen.getByTestId('content')).toBeInTheDocument();
    });

    it('renderiza sidebar', () => {
        render(
            <MemoryRouter>
                <Layout>
                    <div>x</div>
                </Layout>
            </MemoryRouter>,
        );
        expect(screen.getByRole('link', { name: /overview/i })).toBeInTheDocument();
    });
});
