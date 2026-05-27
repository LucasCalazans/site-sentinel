// Token storage e helpers de auth. Localstorage é OK aqui — o app só rode em
// browser, o token é HS256 e a key fica server-side. Sem XSS attack-surface
// significativa (sem 3rd-party scripts, CSP estrita).

const TOKEN_KEY = 'site-sentinel.token';
const EXPIRY_KEY = 'site-sentinel.token.expires_at';

export interface LoginResponse {
    token: string;
    expiresInSec: number;
}

export function getToken(): string | null {
    try {
        return localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

export function getExpiresAt(): number | null {
    try {
        const raw = localStorage.getItem(EXPIRY_KEY);
        if (!raw) return null;
        const n = Number.parseInt(raw, 10);
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

export function setAuth(token: string, expiresInSec: number): void {
    try {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(
            EXPIRY_KEY,
            String(Date.now() + expiresInSec * 1000),
        );
    } catch {
        // localStorage disabled ou cheio — falha silenciosa.
    }
}

export function clearAuth(): void {
    try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(EXPIRY_KEY);
    } catch {
        /* ignore */
    }
}

export function isAuthenticated(): boolean {
    const token = getToken();
    if (!token) return false;
    const exp = getExpiresAt();
    if (exp === null) return true; // sem expiry registrado, confia (server vai validar)
    return Date.now() < exp;
}
