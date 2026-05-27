import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { api, ApiError } from '@/lib/api.ts';
import { setAuth, type LoginResponse } from '@/lib/auth.ts';
import { Button } from '@/components/ui/Button.tsx';
import { Input } from '@/components/ui/Input.tsx';

export function LoginPage() {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const resp = await api<LoginResponse>('/api/login', {
                method: 'POST',
                body: { password },
                auth: false,
            });
            setAuth(resp.token, resp.expiresInSec);
            navigate('/');
        } catch (err) {
            if (err instanceof ApiError && err.status === 401) {
                setError('senha incorreta');
            } else {
                setError((err as Error).message || 'erro desconhecido');
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex h-screen w-screen items-center justify-center bg-zinc-950">
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-sm space-y-4 rounded-md border border-zinc-800 bg-zinc-900/40 p-6"
                aria-label="login"
            >
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-cyan-400">
                        <Lock size={18} strokeWidth={1.75} />
                        <h1 className="font-mono text-sm font-semibold">site-sentinel</h1>
                    </div>
                    <p className="text-xs text-zinc-500">acesso restrito</p>
                </div>
                <div className="space-y-1.5">
                    <label htmlFor="password" className="text-xs text-zinc-400">
                        senha admin
                    </label>
                    <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoFocus
                        required
                        disabled={loading}
                    />
                </div>
                {error ? (
                    <p role="alert" className="text-xs text-rose-400">
                        {error}
                    </p>
                ) : null}
                <Button
                    type="submit"
                    variant="primary"
                    disabled={loading || !password}
                    className="w-full justify-center"
                >
                    {loading ? 'entrando…' : 'entrar'}
                </Button>
            </form>
        </div>
    );
}
