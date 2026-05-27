import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    children: ReactNode;
}

const VARIANTS = {
    primary:
        'bg-cyan-500/10 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/20',
    secondary:
        'bg-zinc-900/50 border-zinc-800 text-zinc-200 hover:border-zinc-700',
    danger:
        'bg-rose-500/10 border-rose-500/40 text-rose-300 hover:bg-rose-500/20',
    ghost: 'border-transparent text-zinc-400 hover:text-zinc-100',
};

export function Button({
    variant = 'secondary',
    className = '',
    children,
    ...rest
}: ButtonProps) {
    return (
        <button
            type="button"
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
            {...rest}
        >
            {children}
        </button>
    );
}
