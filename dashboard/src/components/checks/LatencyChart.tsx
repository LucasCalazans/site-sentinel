import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
} from 'recharts';
import type { WireRun } from '@/lib/types.ts';

interface Props {
    runs: WireRun[];
}

export function LatencyChart({ runs }: Props) {
    // Ordena ASC pra desenhar do mais antigo pro mais recente.
    const data = [...runs]
        .sort((a, b) => a.ran_at - b.ran_at)
        .map((r) => ({
            ts: new Date(r.ran_at).toLocaleTimeString().slice(0, 5),
            duration: r.duration_ms,
            severity: r.severity,
        }));

    return (
        <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="ts" tick={{ fontSize: 10, fill: '#71717a' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#71717a' }} unit="ms" />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#09090b',
                            border: '1px solid #27272a',
                            borderRadius: 6,
                            fontSize: 12,
                        }}
                    />
                    <Line
                        type="monotone"
                        dataKey="duration"
                        stroke="#22d3ee"
                        strokeWidth={1.5}
                        dot={{ r: 2, fill: '#22d3ee' }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
