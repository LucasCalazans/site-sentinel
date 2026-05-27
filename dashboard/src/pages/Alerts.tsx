import { useEffect, useState } from 'react';
import { api } from '@/lib/api.ts';
import type { WireAlert } from '@/lib/types.ts';
import { Card } from '@/components/ui/Card.tsx';
import { Tag } from '@/components/ui/Tag.tsx';
import { Spinner } from '@/components/ui/Spinner.tsx';
import { relativeTime } from '@/lib/format.ts';

const STATUS_TONE = {
    sent: 'emerald',
    failed: 'rose',
    skipped: 'zinc',
} as const;

export function AlertsPage() {
    const [alerts, setAlerts] = useState<WireAlert[] | null>(null);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const resp = await api<{ alerts: WireAlert[] }>('/api/alerts?limit=100');
                if (!cancelled) setAlerts(resp.alerts);
            } catch (e) {
                if (!cancelled) setErr((e as Error).message);
            }
        }
        load();
    }, []);

    return (
        <div className="space-y-4">
            <header>
                <h2 className="text-lg font-semibold text-zinc-100">Alerts</h2>
                <p className="text-xs text-zinc-500">
                    Histórico de webhooks Discord. <code>skipped</code> = check falhou
                    mas webhook não estava configurado.
                </p>
            </header>
            {err && (
                <div role="alert" className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                    {err}
                </div>
            )}
            {alerts === null && !err && <Spinner />}
            <Card>
                {alerts && alerts.length === 0 && (
                    <p className="text-sm text-zinc-500">nenhum alerta ainda</p>
                )}
                <div className="space-y-1">
                    {alerts?.map((a) => {
                        const tone = (STATUS_TONE as Record<string, 'emerald' | 'rose' | 'zinc'>)[a.status] ?? 'zinc';
                        return (
                            <div
                                key={a.id}
                                data-testid={`alert-${a.id}`}
                                className="flex items-center gap-3 rounded border-l-2 border-zinc-800 px-3 py-1.5 text-xs"
                            >
                                <Tag tone={tone}>{a.status}</Tag>
                                <span className="text-zinc-500">{relativeTime(a.sent_at)}</span>
                                <span className="font-mono text-zinc-400">{a.channel}</span>
                                <span className="text-zinc-500">run #{a.run_id}</span>
                                {a.error_message && (
                                    <span className="flex-1 truncate text-rose-400">
                                        {a.error_message}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </Card>
        </div>
    );
}
