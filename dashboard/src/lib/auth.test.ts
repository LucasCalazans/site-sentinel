import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clearAuth,
    getExpiresAt,
    getToken,
    isAuthenticated,
    setAuth,
} from './auth.ts';

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('setAuth / getToken / getExpiresAt', () => {
    it('round-trip', () => {
        setAuth('my-token', 3600);
        expect(getToken()).toBe('my-token');
        const exp = getExpiresAt();
        expect(exp).not.toBeNull();
        expect(exp).toBeGreaterThan(Date.now());
    });

    it('expiry vazio antes de setAuth', () => {
        expect(getToken()).toBeNull();
        expect(getExpiresAt()).toBeNull();
    });
});

describe('clearAuth', () => {
    it('limpa token e expiry', () => {
        setAuth('t', 60);
        clearAuth();
        expect(getToken()).toBeNull();
        expect(getExpiresAt()).toBeNull();
    });
});

describe('isAuthenticated', () => {
    it('false sem token', () => {
        expect(isAuthenticated()).toBe(false);
    });

    it('true com token válido', () => {
        setAuth('t', 3600);
        expect(isAuthenticated()).toBe(true);
    });

    it('false com token expirado', () => {
        setAuth('t', 3600);
        // Força expiry pro passado.
        localStorage.setItem('site-sentinel.token.expires_at', String(Date.now() - 1000));
        expect(isAuthenticated()).toBe(false);
    });

    it('true quando token presente mas expiry inválido (server valida)', () => {
        localStorage.setItem('site-sentinel.token', 't');
        localStorage.setItem('site-sentinel.token.expires_at', 'not-a-number');
        expect(isAuthenticated()).toBe(true);
    });

    it('lida com expiry ausente (sem expiry registrado)', () => {
        localStorage.setItem('site-sentinel.token', 't');
        expect(isAuthenticated()).toBe(true);
    });
});

describe('localStorage exception handling', () => {
    it('getToken retorna null quando localStorage throws', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('disabled');
        });
        expect(getToken()).toBeNull();
        expect(getExpiresAt()).toBeNull();
    });

    it('setAuth falha silenciosa', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota');
        });
        expect(() => setAuth('t', 60)).not.toThrow();
    });

    it('clearAuth falha silenciosa', () => {
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
            throw new Error('x');
        });
        expect(() => clearAuth()).not.toThrow();
    });
});
