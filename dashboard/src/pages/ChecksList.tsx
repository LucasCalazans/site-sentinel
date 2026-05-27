import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api.ts';
import type { WireCheck } from '@/lib/types.ts';
import { Card } from '@/components/ui/Card.tsx';
import { Tag } from '@/components/ui/Tag.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Spinner } from '@/components/ui/Spinner.tsx';
import { relativeTime } from '@/lib/format.ts';

export function ChecksListPage() {
    const [checks, setChecks] = useState<WireCheck[] | null>(null);
    const [filter, setFilter] = useState('');
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const resp = await api<{ checks: WireCheck[] }>('/api/checks');
                if (!cancelled) setChecks(resp.checks);
            } catch (e) {
                if (!cancelled) setErr((e as Error).message);
            }
        }
        load();
    }, []);

    const filtered = (checks ?? []).filter(
        (c) =>
            c.name.toLowerCase().includes(filter.toLowerCase()) ||
            c.app_label.toLowerCase().includes(filter.toLowerCase()),
    );

    return (
        <div className="space-y-4">
            <header className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-100">Checks</h2>
                <Link to="/checks/new">
                    <Button variant="primary">
                        <Plus size={14} strokeWidth={1.75} />
                        Novo check
                    </Button>
                </Link>
            </header>
            <input
                type="search"
                placeholder="filtrar por nome ou app…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="filtro"
                className="w-full max-w-md rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500/40 focus:outline-none"
            />
            {err && (
                <div role="alert" className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                    {err}
                </div>
            )}
            {checks === null && !err && <Spinner />}
            {checks && filtered.length === 0 && (
                <p className="text-sm text-zinc-500">Nenhum check.</p>
            )}
            <div className="space-y-2">
                {filtered.map((c) => (
                    <Link key={c.id} to={`/checks/${c.id}`} className="block">
                        <Card className="transition-colors hover:border-cyan-500/30">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex flex-1 items-center gap-3">
                                    <Tag tone={c.enabled ? 'cyan' : 'zinc'}>
                                        {c.enabled ? 'ON' : 'OFF'}
                                    </Tag>
                                    <div>
                                        <p className="font-mono text-sm text-zinc-100">
                                            {c.name}
                                        </p>
                                        <p className="text-xs text-zinc-500">
                                            {c.type} · {c.cron_pattern} · app:{c.app_label}
                                        </p>
                                    </div>
                                </div>
                                <p className="text-xs text-zinc-500">
                                    atualizado {relativeTime(c.updated_at)}
                                </p>
                            </div>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}
