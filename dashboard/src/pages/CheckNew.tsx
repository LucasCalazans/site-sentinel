import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '@/lib/api.ts';
import type { CheckType, WireCheck } from '@/lib/types.ts';
import { Card } from '@/components/ui/Card.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Input } from '@/components/ui/Input.tsx';

const TYPES: CheckType[] = [
    'performance',
    'content_sentinel',
    'redirect_chain',
    'integrity',
];

// Defaults por tipo — facilita criar rápido.
const DEFAULT_CONFIG: Record<CheckType, Record<string, unknown>> = {
    performance: {
        targets: [{ url: 'https://example.com', warnMs: 2500, criticalMs: 8000 }],
    },
    content_sentinel: {
        url: 'https://example.com',
        mustContain: ['title'],
    },
    redirect_chain: {
        startUrl: 'https://example.com/download',
        allowedHosts: ['example.com'],
    },
    integrity: {
        downloadUrl: 'https://example.com/app.exe',
        releasesRepo: 'owner/repo',
        assetName: 'app.exe',
    },
};

export function CheckNewPage() {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [type, setType] = useState<CheckType>('performance');
    const [cron, setCron] = useState('*/5 * * * *');
    const [app, setApp] = useState('sonda');
    const [configText, setConfigText] = useState(
        JSON.stringify(DEFAULT_CONFIG.performance, null, 2),
    );
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    function pickType(t: CheckType) {
        setType(t);
        setConfigText(JSON.stringify(DEFAULT_CONFIG[t], null, 2));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setErr(null);
        let config: unknown;
        try {
            config = JSON.parse(configText);
        } catch {
            setErr('config não é JSON válido');
            return;
        }
        if (!config || typeof config !== 'object') {
            setErr('config deve ser objeto');
            return;
        }
        setLoading(true);
        try {
            const resp = await api<{ check: WireCheck }>('/api/checks', {
                method: 'POST',
                body: { name, type, config, cron_pattern: cron, app_label: app },
            });
            navigate(`/checks/${resp.check.id}`);
        } catch (e) {
            if (e instanceof ApiError) {
                setErr(e.message);
            } else {
                setErr((e as Error).message);
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="mx-auto max-w-2xl space-y-4">
            <header>
                <h2 className="text-lg font-semibold text-zinc-100">Novo check</h2>
                <p className="text-xs text-zinc-500">
                    Pick um tipo, edite a config JSON, e salva. Schema validado no
                    backend (factory) — erros voltam aqui.
                </p>
            </header>
            <Card>
                <form onSubmit={handleSubmit} className="space-y-4" aria-label="novo check">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 space-y-1.5">
                            <label htmlFor="name" className="text-xs text-zinc-400">name (único)</label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="ex: sonda.performance"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="type" className="text-xs text-zinc-400">type</label>
                            <select
                                id="type"
                                value={type}
                                onChange={(e) => pickType(e.target.value as CheckType)}
                                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100"
                            >
                                {TYPES.map((t) => (
                                    <option key={t} value={t}>
                                        {t}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="cron" className="text-xs text-zinc-400">cron_pattern</label>
                            <Input
                                id="cron"
                                value={cron}
                                onChange={(e) => setCron(e.target.value)}
                                placeholder="*/5 * * * *"
                                required
                            />
                        </div>
                        <div className="col-span-2 space-y-1.5">
                            <label htmlFor="app" className="text-xs text-zinc-400">app_label</label>
                            <Input
                                id="app"
                                value={app}
                                onChange={(e) => setApp(e.target.value)}
                                placeholder="sonda"
                                required
                            />
                        </div>
                        <div className="col-span-2 space-y-1.5">
                            <label htmlFor="config" className="text-xs text-zinc-400">config (JSON)</label>
                            <textarea
                                id="config"
                                value={configText}
                                onChange={(e) => setConfigText(e.target.value)}
                                rows={12}
                                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-100 focus:border-cyan-500/40 focus:outline-none"
                            />
                        </div>
                    </div>
                    {err && (
                        <p role="alert" className="text-xs text-rose-400">
                            {err}
                        </p>
                    )}
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={() => navigate('/checks')}>
                            cancelar
                        </Button>
                        <Button type="submit" variant="primary" disabled={loading}>
                            {loading ? 'salvando…' : 'criar'}
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
}
