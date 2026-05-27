import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    ListChecks,
    Github,
    Cloud,
    Bell,
    LogOut,
} from 'lucide-react';
import { clearAuth } from '@/lib/auth.ts';

const NAV = [
    { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/checks', label: 'Checks', icon: ListChecks, end: false },
    { to: '/github', label: 'GitHub', icon: Github, end: true },
    { to: '/cloudflare', label: 'Cloudflare', icon: Cloud, end: true },
    { to: '/alerts', label: 'Alerts', icon: Bell, end: true },
];

export function Sidebar() {
    function logout() {
        clearAuth();
        window.location.href = '/login';
    }

    return (
        <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
            <div className="border-b border-zinc-800 px-5 py-4">
                <h1 className="font-mono text-sm font-semibold text-cyan-400">site-sentinel</h1>
                <p className="font-mono text-[10px] text-zinc-500">v0.2 dashboard</p>
            </div>
            <nav className="flex-1 space-y-0.5 px-3 py-4">
                {NAV.map((item) => {
                    const Icon = item.icon;
                    return (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) =>
                                `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                                    isActive
                                        ? 'bg-cyan-500/10 text-cyan-300'
                                        : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
                                }`
                            }
                        >
                            <Icon size={16} strokeWidth={1.75} />
                            {item.label}
                        </NavLink>
                    );
                })}
            </nav>
            <div className="border-t border-zinc-800 px-3 py-3">
                <button
                    type="button"
                    onClick={logout}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                >
                    <LogOut size={16} strokeWidth={1.75} />
                    Sair
                </button>
            </div>
        </aside>
    );
}
