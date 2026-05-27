import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api.ts';
import type { WireLatestRun } from '@/lib/types.ts';
import { Card } from '@/components/ui/Card.tsx';
import { SeverityBadge } from '@/components/ui/SeverityBadge.tsx';
import { Spinner } from '@/components/ui/Spinner.tsx';
import { humanMs, relativeTime } from '@/lib/format.ts';

export function OverviewPage() {
    const [runs, setRuns] = useState<WireLatestRun[] | null>(null);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const resp = await api<{ runs: WireLatestRun[] }>('/api/runs/latest');
                if (!cancelled) setRuns(resp.runs);
            } catch (e) {
                if (!cancelled) setErr((e as Error).message);
            }
        }
        load();
        const interval = setInterval(load, 30_000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    return (
        <div className="space-y-4">
            <header className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-100">Overview</h2>
                <p className="text-xs text-zinc-500">refresh a cada 30s</p>
            </header>
            {err && (
                <div role="alert" className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                    {err}
                </div>
            )}
            {runs === null && !err && (
                <div className="flex items-center gap-2 text-zinc-500">
                    <Spinner /> carregando…
                </div>
            )}
            {runs && runs.length === 0 && (
                <p className="text-sm text-zinc-500">
                    Nenhum check rodou ainda. Os checks habilitados rodam a cada cron tick.
                </p>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {runs?.map((r) => (
                    <Link
                        key={r.id}
                        to={`/checks/${r.check_id}`}
                        className="block"
                        data-testid={`overview-card-${r.check_id}`}
                    >
                        <Card className="transition-colors hover:border-cyan-500/30">
                            <div className="flex items-start justify-between gap-2">
                                <div className="space-y-1">
                                    <p className="font-mono text-sm text-zinc-200">
                                        {r.check_name}
                                    </p>
                                    <p className="text-xs text-zinc-500">
                                        {relativeTime(r.ran_at)} · {humanMs(r.duration_ms)}
                                    </p>
                                </div>
                                <SeverityBadge severity={r.severity} />
                            </div>
                            <p className="mt-2 line-clamp-2 text-xs text-zinc-400">
                                {r.message}
                            </p>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}
