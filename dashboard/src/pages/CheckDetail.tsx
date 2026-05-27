import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api.ts';
import type { WireCheck, WireRun } from '@/lib/types.ts';
import { Card } from '@/components/ui/Card.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Tag } from '@/components/ui/Tag.tsx';
import { SeverityBadge } from '@/components/ui/SeverityBadge.tsx';
import { Spinner } from '@/components/ui/Spinner.tsx';
import { humanMs, relativeTime } from '@/lib/format.ts';
import { LatencyChart } from '@/components/checks/LatencyChart.tsx';

export function CheckDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [check, setCheck] = useState<WireCheck | null>(null);
    const [runs, setRuns] = useState<WireRun[] | null>(null);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const [c, r] = await Promise.all([
                    api<{ check: WireCheck }>(`/api/checks/${id}`),
                    api<{ runs: WireRun[] }>(`/api/runs?check_id=${id}&limit=100`),
                ]);
                if (!cancelled) {
                    setCheck(c.check);
                    setRuns(r.runs);
                }
            } catch (e) {
                if (!cancelled) {
                    setErr((e as Error).message);
                    if (e instanceof ApiError && e.status === 404) {
                        setTimeout(() => navigate('/checks'), 1500);
                    }
                }
            }
        }
        load();
    }, [id, navigate]);

    async function toggleEnabled() {
        if (!check) return;
        try {
            const resp = await api<{ check: WireCheck }>(`/api/checks/${check.id}`, {
                method: 'PUT',
                body: { enabled: !check.enabled },
            });
            setCheck(resp.check);
        } catch (e) {
            setErr((e as Error).message);
        }
    }

    async function deleteCheck() {
        if (!check) return;
        if (!confirm(`Apagar check "${check.name}"?`)) return;
        try {
            await api(`/api/checks/${check.id}`, { method: 'DELETE' });
            navigate('/checks');
        } catch (e) {
            setErr((e as Error).message);
        }
    }

    if (err && !check) {
        return (
            <div role="alert" className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                {err}
            </div>
        );
    }
    if (!check || !runs) return <Spinner />;

    return (
        <div className="space-y-4">
            <header className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Tag tone={check.enabled ? 'cyan' : 'zinc'}>
                            {check.enabled ? 'ON' : 'OFF'}
                        </Tag>
                        <h2 className="font-mono text-lg font-semibold text-zinc-100">
                            {check.name}
                        </h2>
                    </div>
                    <p className="text-xs text-zinc-500">
                        {check.type} · {check.cron_pattern} · app:{check.app_label}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={toggleEnabled}>
                        {check.enabled ? 'desabilitar' : 'habilitar'}
                    </Button>
                    <Button variant="danger" onClick={deleteCheck}>
                        <Trash2 size={14} strokeWidth={1.75} />
                        apagar
                    </Button>
                </div>
            </header>

            {err && (
                <div role="alert" className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                    {err}
                </div>
            )}

            <Card title="Config">
                <pre className="overflow-x-auto rounded bg-zinc-950 p-3 font-mono text-xs text-zinc-200">
                    {JSON.stringify(check.config, null, 2)}
                </pre>
            </Card>

            <Card title="Latência (últimos runs)">
                {runs.length > 0 ? (
                    <LatencyChart runs={runs} />
                ) : (
                    <p className="text-sm text-zinc-500">sem runs ainda</p>
                )}
            </Card>

            <Card title={`Histórico (${runs.length})`}>
                <div className="space-y-1">
                    {runs.length === 0 && (
                        <p className="text-sm text-zinc-500">nenhum run ainda</p>
                    )}
                    {runs.map((r) => (
                        <div
                            key={r.id}
                            data-testid={`run-${r.id}`}
                            className="flex items-center gap-3 rounded border-l-2 border-zinc-800 px-3 py-1.5 text-xs"
                        >
                            <SeverityBadge severity={r.severity} />
                            <span className="text-zinc-500">{relativeTime(r.ran_at)}</span>
                            <span className="text-zinc-400">{humanMs(r.duration_ms)}</span>
                            <span className="flex-1 truncate text-zinc-300">{r.message}</span>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
}
