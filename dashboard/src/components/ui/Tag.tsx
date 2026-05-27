import type { ReactNode } from 'react';

type Tone = 'cyan' | 'amber' | 'rose' | 'emerald' | 'zinc';

const TONES: Record<Tone, string> = {
    cyan: 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30',
    amber: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
    rose: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
    zinc: 'bg-zinc-500/15 text-zinc-300 ring-zinc-500/30',
};

interface TagProps {
    tone?: Tone;
    children: ReactNode;
    className?: string;
}

export function Tag({ tone = 'zinc', children, className = '' }: TagProps) {
    return (
        <span
            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]} ${className}`}
        >
            {children}
        </span>
    );
}
