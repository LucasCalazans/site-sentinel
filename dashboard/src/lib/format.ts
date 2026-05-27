// Helpers de formatação compartilhados pela UI.

export function humanSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let v = bytes;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i++;
    }
    return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function humanMs(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return '—';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
    return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

// Relative time tipo "5min atrás", "ontem", "há 3 dias".
export function relativeTime(unixMs: number, now: number = Date.now()): string {
    if (!Number.isFinite(unixMs)) return '—';
    const diff = now - unixMs;
    if (diff < 0) return 'no futuro';
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s atrás`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}min atrás`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h atrás`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}d atrás`;
    const mo = Math.floor(day / 30);
    if (mo < 12) return `${mo}mo atrás`;
    const yr = Math.floor(day / 365);
    return `${yr}y atrás`;
}

export function formatTimestamp(unixMs: number): string {
    if (!Number.isFinite(unixMs)) return '—';
    const d = new Date(unixMs);
    return d.toISOString().replace('T', ' ').slice(0, 19);
}

export function severityColor(severity: string): {
    bg: string;
    border: string;
    text: string;
} {
    switch (severity) {
        case 'ok':
            return {
                bg: 'bg-emerald-500/10',
                border: 'border-emerald-500/30',
                text: 'text-emerald-400',
            };
        case 'warn':
            return {
                bg: 'bg-amber-500/10',
                border: 'border-amber-500/30',
                text: 'text-amber-400',
            };
        case 'critical':
            return {
                bg: 'bg-rose-500/10',
                border: 'border-rose-500/30',
                text: 'text-rose-400',
            };
        default:
            return {
                bg: 'bg-zinc-500/10',
                border: 'border-zinc-500/30',
                text: 'text-zinc-400',
            };
    }
}
