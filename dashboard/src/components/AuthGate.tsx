import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { isAuthenticated } from '@/lib/auth.ts';

interface Props {
    children: ReactNode;
}

export function AuthGate({ children }: Props) {
    if (!isAuthenticated()) {
        return <Navigate to="/login" replace />;
    }
    return <>{children}</>;
}
