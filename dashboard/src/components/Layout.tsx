import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar.tsx';

interface LayoutProps {
    children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
    return (
        <div className="flex h-screen w-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-auto bg-zinc-950">
                <div className="mx-auto max-w-7xl px-8 py-6">{children}</div>
            </main>
        </div>
    );
}
