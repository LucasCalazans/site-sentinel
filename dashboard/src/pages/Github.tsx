import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { api } from '@/lib/api.ts';
import type { WireSnapshot } from '@/lib/types.ts';
import { Card } from '@/components/ui/Card.tsx';
import { Tag } from '@/components/ui/Tag.tsx';
import { Spinner } from '@/components/ui/Spinner.tsx';
import { humanSize, relativeTime } from '@/lib/format.ts';

interface RepoMeta {
    full_name: string;
    description: string | null;
    stars: number;
    forks: number;
    open_issues: number;
    html_url: string;
    pushed_at: string | null;
}

interface Release {
    tag_name: string;
    published_at: string | null;
    html_url: string;
    assets: Array<{ name: string; size: number; download_count: number }>;
}

interface ActionRun {
    id: number;
    name: string;
    conclusion: string | null;
    status: string;
    head_branch: string;
    run_number: number;
    created_at: string;
    html_url: string;
}

interface Issue {
    number: number;
    title: string;
    user: string;
    html_url: string;
    is_pull_request: boolean;
}

function bucketize(snaps: WireSnapshot[]): Record<string, WireSnapshot[]> {
    const buckets: Record<string, WireSnapshot[]> = {
        repo: [],
        release: [],
        actions: [],
        issues: [],
    };
    for (const s of snaps) {
        if (s.kind.startsWith('github.repo.')) buckets.repo!.push(s);
        else if (s.kind.startsWith('github.release.')) buckets.release!.push(s);
        else if (s.kind.startsWith('github.actions.')) buckets.actions!.push(s);
        else if (s.kind.startsWith('github.issues.')) buckets.issues!.push(s);
    }
    return buckets;
}

function repoNameFromKind(kind: string, prefix: string): string {
    return kind.slice(prefix.length);
}

function conclusionTone(conclusion: string | null): 'emerald' | 'rose' | 'amber' | 'zinc' {
    if (conclusion === 'success') return 'emerald';
    if (conclusion === 'failure') return 'rose';
    if (conclusion === 'cancelled') return 'amber';
    return 'zinc';
}

export function GithubPage() {
    const [snaps, setSnaps] = useState<WireSnapshot[] | null>(null);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const resp = await api<{ snapshots: WireSnapshot[] }>(
                    '/api/integrations/github',
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
    const buckets = bucketize(snaps);

    return (
        <div className="space-y-4">
            <header>
                <h2 className="text-lg font-semibold text-zinc-100">GitHub</h2>
                <p className="text-xs text-zinc-500">
                    Snapshots cacheados (atualizados pelo cron horário).
                </p>
            </header>

            <Card title="Repositórios">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {buckets.repo?.map((s) => {
                        const meta = s.payload as RepoMeta;
                        return (
                            <div key={s.kind} className="rounded-md border border-zinc-800 p-3">
                                <div className="flex items-start justify-between gap-2">
                                    <a
                                        href={meta.html_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-mono text-sm text-cyan-400 hover:underline"
                                    >
                                        {meta.full_name}
                                    </a>
                                    <span className="text-xs text-zinc-500">{relativeTime(s.captured_at)}</span>
                                </div>
                                {meta.description && (
                                    <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{meta.description}</p>
                                )}
                                <div className="mt-2 flex gap-3 text-xs text-zinc-500">
                                    <span>★ {meta.stars}</span>
                                    <span>⑂ {meta.forks}</span>
                                    <span>{meta.open_issues} issues</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Card>

            <Card title="Releases">
                <div className="space-y-2">
                    {buckets.release?.map((s) => {
                        const repo = repoNameFromKind(s.kind, 'github.release.');
                        const rel = s.payload as Release | null;
                        if (!rel) {
                            return (
                                <div key={s.kind} className="text-xs text-zinc-500">
                                    {repo}: sem release publicada
                                </div>
                            );
                        }
                        return (
                            <div key={s.kind} className="rounded-md border border-zinc-800 p-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-mono text-sm text-zinc-200">
                                            {repo}{' '}
                                            <span className="text-cyan-400">{rel.tag_name}</span>
                                        </p>
                                        <p className="text-xs text-zinc-500">
                                            {rel.published_at ? relativeTime(new Date(rel.published_at).getTime()) : 'sem data'}
                                        </p>
                                    </div>
                                    <a
                                        href={rel.html_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-zinc-500 hover:text-cyan-400"
                                    >
                                        <ExternalLink size={14} />
                                    </a>
                                </div>
                                <div className="mt-2 space-y-1">
                                    {rel.assets.map((a) => (
                                        <div
                                            key={a.name}
                                            className="flex items-center gap-3 text-xs text-zinc-400"
                                        >
                                            <span className="font-mono">{a.name}</span>
                                            <span className="text-zinc-600">{humanSize(a.size)}</span>
                                            <span className="text-zinc-600">
                                                {a.download_count} downloads
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Card>

            <Card title="Actions runs">
                <div className="space-y-2">
                    {buckets.actions?.map((s) => {
                        const repo = repoNameFromKind(s.kind, 'github.actions.');
                        const runs = s.payload as ActionRun[];
                        return (
                            <details key={s.kind} className="rounded-md border border-zinc-800 p-3">
                                <summary className="cursor-pointer font-mono text-sm text-zinc-200">
                                    {repo} ({runs.length} runs)
                                </summary>
                                <div className="mt-2 space-y-1">
                                    {runs.map((r) => (
                                        <a
                                            key={r.id}
                                            href={r.html_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-zinc-900"
                                        >
                                            <Tag tone={conclusionTone(r.conclusion)}>
                                                {r.conclusion ?? r.status}
                                            </Tag>
                                            <span className="font-mono text-zinc-300">{r.name}</span>
                                            <span className="text-zinc-500">#{r.run_number}</span>
                                            <span className="text-zinc-500">{r.head_branch}</span>
                                        </a>
                                    ))}
                                </div>
                            </details>
                        );
                    })}
                </div>
            </Card>

            <Card title="Open issues / PRs">
                <div className="space-y-2">
                    {buckets.issues?.map((s) => {
                        const repo = repoNameFromKind(s.kind, 'github.issues.');
                        const issues = s.payload as Issue[];
                        if (issues.length === 0) {
                            return (
                                <div key={s.kind} className="text-xs text-zinc-500">
                                    {repo}: 0 issues abertas
                                </div>
                            );
                        }
                        return (
                            <details key={s.kind} className="rounded-md border border-zinc-800 p-3">
                                <summary className="cursor-pointer text-sm text-zinc-200">
                                    {repo} ({issues.length})
                                </summary>
                                <div className="mt-2 space-y-1">
                                    {issues.map((i) => (
                                        <a
                                            key={i.number}
                                            href={i.html_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-zinc-900"
                                        >
                                            <Tag tone={i.is_pull_request ? 'cyan' : 'amber'}>
                                                {i.is_pull_request ? 'PR' : 'issue'}
                                            </Tag>
                                            <span className="font-mono text-zinc-500">#{i.number}</span>
                                            <span className="flex-1 truncate text-zinc-300">{i.title}</span>
                                            <span className="text-zinc-500">{i.user}</span>
                                        </a>
                                    ))}
                                </div>
                            </details>
                        );
                    })}
                </div>
            </Card>
        </div>
    );
}
