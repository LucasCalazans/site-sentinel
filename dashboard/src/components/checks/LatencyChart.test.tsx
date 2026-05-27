import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { LatencyChart } from './LatencyChart.tsx';

describe('LatencyChart', () => {
    it('renderiza sem crashar com runs', () => {
        const { container } = render(
            <LatencyChart
                runs={[
                    {
                        id: 1,
                        check_id: 1,
                        severity: 'ok',
                        message: '',
                        duration_ms: 100,
                        details: null,
                        ran_at: 1_700_000_000_000,
                    },
                    {
                        id: 2,
                        check_id: 1,
                        severity: 'warn',
                        message: '',
                        duration_ms: 250,
                        details: null,
                        ran_at: 1_700_000_060_000,
                    },
                ]}
            />,
        );
        // Recharts ResponsiveContainer só renderiza no jsdom com width 0 — mas
        // o componente não deve lançar.
        expect(container.firstChild).toBeTruthy();
    });

    it('renderiza com array vazio', () => {
        const { container } = render(<LatencyChart runs={[]} />);
        expect(container.firstChild).toBeTruthy();
    });
});
