import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button.tsx';
import { Card } from './Card.tsx';
import { Tag } from './Tag.tsx';
import { Input } from './Input.tsx';
import { Spinner } from './Spinner.tsx';
import { SeverityBadge } from './SeverityBadge.tsx';

describe('Button', () => {
    it('renderiza children', () => {
        render(<Button>click me</Button>);
        expect(screen.getByRole('button', { name: 'click me' })).toBeInTheDocument();
    });
    it('chama onClick', async () => {
        const fn = vi.fn();
        const user = userEvent.setup();
        render(<Button onClick={fn}>x</Button>);
        await user.click(screen.getByRole('button'));
        expect(fn).toHaveBeenCalled();
    });
    it('aplica variant primary', () => {
        render(<Button variant="primary">x</Button>);
        expect(screen.getByRole('button').className).toMatch(/cyan/);
    });
    it('aplica variant danger', () => {
        render(<Button variant="danger">x</Button>);
        expect(screen.getByRole('button').className).toMatch(/rose/);
    });
    it('aplica variant ghost', () => {
        render(<Button variant="ghost">x</Button>);
        expect(screen.getByRole('button').className).toMatch(/transparent/);
    });
    it('disabled prop é respeitado', () => {
        render(<Button disabled>x</Button>);
        expect(screen.getByRole('button')).toBeDisabled();
    });
});

describe('Card', () => {
    it('renderiza children e title', () => {
        render(<Card title="Hello">conteúdo</Card>);
        expect(screen.getByText('Hello')).toBeInTheDocument();
        expect(screen.getByText('conteúdo')).toBeInTheDocument();
    });
    it('sem title não renderiza header', () => {
        const { container } = render(<Card>only body</Card>);
        expect(container.textContent).toBe('only body');
    });
});

describe('Tag', () => {
    it('aplica tone amber', () => {
        render(<Tag tone="amber">x</Tag>);
        expect(screen.getByText('x').className).toMatch(/amber/);
    });
    it('default zinc', () => {
        render(<Tag>x</Tag>);
        expect(screen.getByText('x').className).toMatch(/zinc/);
    });
    it('aplica cada tone', () => {
        const tones = ['cyan', 'rose', 'emerald'] as const;
        for (const tone of tones) {
            const { unmount } = render(<Tag tone={tone}>x-{tone}</Tag>);
            expect(screen.getByText(`x-${tone}`).className).toMatch(new RegExp(tone));
            unmount();
        }
    });
});

describe('Input', () => {
    it('renderiza com value/onChange', async () => {
        const fn = vi.fn();
        const user = userEvent.setup();
        render(<Input value="" onChange={fn} placeholder="hi" />);
        const el = screen.getByPlaceholderText('hi');
        await user.type(el, 'a');
        expect(fn).toHaveBeenCalled();
    });
});

describe('Spinner', () => {
    it('renderiza svg', () => {
        render(<Spinner />);
        expect(screen.getByLabelText(/carregando/i)).toBeInTheDocument();
    });
    it('respeita size', () => {
        const { container } = render(<Spinner size={32} />);
        const svg = container.querySelector('svg');
        expect(svg?.getAttribute('width')).toBe('32');
    });
});

describe('SeverityBadge', () => {
    it('emerald pra ok', () => {
        render(<SeverityBadge severity="ok" />);
        expect(screen.getByText('OK').className).toMatch(/emerald/);
    });
    it('amber pra warn', () => {
        render(<SeverityBadge severity="warn" />);
        expect(screen.getByText('WARN').className).toMatch(/amber/);
    });
    it('rose pra critical', () => {
        render(<SeverityBadge severity="critical" />);
        expect(screen.getByText('CRITICAL').className).toMatch(/rose/);
    });
    it('zinc pra unknown', () => {
        render(<SeverityBadge severity="something" />);
        expect(screen.getByText('SOMETHING').className).toMatch(/zinc/);
    });
});
