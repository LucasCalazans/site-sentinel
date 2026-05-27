import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    title?: ReactNode;
    children: ReactNode;
}

export function Card({ title, children, className = '', ...rest }: CardProps) {
    return (
        <div
            className={`rounded-md border border-zinc-800 bg-zinc-900/40 ${className}`}
            {...rest}
        >
            {title ? (
                <div className="border-b border-zinc-800 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {title}
                </div>
            ) : null}
            <div className="p-4">{children}</div>
        </div>
    );
}
