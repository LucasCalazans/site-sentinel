import { useEffect, useState } from 'react';
import { api } from '@/lib/api.ts';
import type { WireSnapshot } from '@/lib/types.ts';
import { Card } from '@/components/ui/Card.tsx';
import { Tag } from '@/components/ui/Tag.tsx';
import { Spinner } from '@/components/ui/Spinner.tsx';
import { humanSize, relativeTime } from '@/lib/format.ts';

interface PagesProject {
    name: string;
    domains: string[];
    production_branch: string;
    latest_deployment?: {
        short_id: string;
        environment: string;
        created_on: string;
        latest_stage?: { status: string };
    };
}

interface WorkerScript {
    id: string;
    modified_on: string;
    routes_count: number;
}

interface D1Database {
    name: string;
    uuid: string;
    num_tables?: number;
    file_size?: number;
}

interface ZoneAnalytics {
    requests: { all: number; cached: number; uncached: number };
    bandwidth: { all: number };
    threats: { all: number };
    pageviews: { all: number };
    uniques: { all: number };
}

function find(snaps: WireSnapshot[], kind: string): WireSnapshot | undefined {
    return snaps.find((s) => s.kind === kind);
}

function deployTone(status: string | undefined): 'emerald' | 'rose' | 'amber' | 'zinc' {
    if (status === 'success') return 'emerald';
    if (status === 'failure') return 'rose';
    if (status === 'idle') return 'zinc';
    return 'amber';
}

export function CloudflarePage() {
    const [snaps, setSnaps] = useState<WireSnapshot[] | null>(null);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const resp = await api<{ snapshots: WireSnapshot[] }>(
                    '/api/integrations/cloudflare',
                );
                if (!cancelled) setSnaps(resp.snapshots);
            } catch (e) {
                if (!cancelled) setErr((e as Error).message);
            }
        }
        load();
        const interval = setInterval(load, 60_000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    if (err) {
        return (
            <div role="alert" className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                {err}
            </div>
        );
    }
    if (!snaps) return <Spinner />;

    const pages = (find(snaps, 'cloudflare.pages')?.payload ?? []) as PagesProject[];
    const workers = (find(snaps, 'cloudflare.workers')?.payload ?? []) as WorkerScript[];
    const d1 = (find(snaps, 'cloudflare.d1')?.payload ?? []) as D1Database[];
    const analyticsSnap = find(snaps, 'cloudflare.analytics');
    const analytics = analyticsSnap?.payload as ZoneAnalytics | undefined;

    return (
        <div className="space-y-4">
            <header>
                <h2 className="text-lg font-semibold text-zinc-100">Cloudflare</h2>
                <p className="text-xs text-zinc-500">
                    Snapshots cacheados (atualizados pelo cron horário).
                </p>
            </header>

            {analytics && (
                <Card title={`Zone analytics — últimas 24h (${analyticsSnap ? relativeTime(analyticsSnap.captured_at) : ''})`}>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                        <Stat label="requests" value={analytics.requests.all.toLocaleString()} />
                        <Stat label="cached" value={analytics.requests.cached.toLocaleString()} />
                        <Stat label="pageviews" value={analytics.pageviews.all.toLocaleString()} />
                        <Stat label="uniques" value={analytics.uniques.all.toLocaleString()} />
                        <Stat label="threats" value={analytics.threats.all.toLocaleString()} />
                    </div>
                </Card>
            )}

            <Card title="Pages projects">
                {pages.length === 0 && <p className="text-xs text-zinc-500">nenhum projeto</p>}
                <div className="space-y-2">
                    {pages.map((p) => (
                        <div key={p.name} className="rounded-md border border-zinc-800 p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-mono text-sm text-zinc-200">{p.name}</p>
                                    <p className="text-xs text-zinc-500">
                                        branch {p.production_branch} · {p.domains.join(', ')}
                                    </p>
                                </div>
                                {p.latest_deployment && (
                                    <div className="text-right">
                                        <Tag tone={deployTone(p.latest_deployment.latest_stage?.status)}>
                                            {p.latest_deployment.latest_stage?.status ?? 'unknown'}
                                        </Tag>
                                        <p className="mt-1 font-mono text-xs text-zinc-500">
                                            {p.latest_deployment.short_id}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            <Card title="Workers">
                {workers.length === 0 && <p className="text-xs text-zinc-500">nenhum worker</p>}
                <div className="space-y-1">
                    {workers.map((w) => (
                        <div
                            key={w.id}
                            className="flex items-center gap-3 rounded border-l-2 border-zinc-800 px-3 py-1.5 text-xs"
                        >
                            <span className="font-mono text-zinc-200">{w.id}</span>
                            <span className="text-zinc-500">{w.routes_count} routes</span>
                            <span className="ml-auto text-zinc-500">
                                modificado {w.modified_on ? relativeTime(new Date(w.modified_on).getTime()) : '?'}
                            </span>
                        </div>
                    ))}
                </div>
            </Card>

            <Card title="D1 databases">
                {d1.length === 0 && <p className="text-xs text-zinc-500">nenhuma database</p>}
                <div className="space-y-1">
                    {d1.map((d) => (
                        <div
                            key={d.uuid}
                            className="flex items-center gap-3 rounded border-l-2 border-zinc-800 px-3 py-1.5 text-xs"
                        >
                            <span className="font-mono text-zinc-200">{d.name}</span>
                            {d.num_tables !== undefined && (
                                <span className="text-zinc-500">{d.num_tables} tabelas</span>
                            )}
                            {d.file_size !== undefined && (
                                <span className="text-zinc-500">{humanSize(d.file_size)}</span>
                            )}
                            <span className="ml-auto font-mono text-zinc-600">{d.uuid.slice(0, 8)}</span>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
            <p className="font-mono text-lg text-zinc-100">{value}</p>
        </div>
    );
}
