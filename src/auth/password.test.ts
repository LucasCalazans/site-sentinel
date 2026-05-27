import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.ts';

// Iterations baixas pra rodar fast em CI — 1000 é o mínimo aceito pelo
// verifyPassword (e mais que suficiente pra exercitar o algoritmo).
const FAST = 1000;

describe('hashPassword', () => {
    it('gera hash no formato esperado: pbkdf2$<iter>$<salt>$<hash>', async () => {
        const hash = await hashPassword('senha-forte', FAST);
        const parts = hash.split('$');
        expect(parts).toHaveLength(4);
        expect(parts[0]).toBe('pbkdf2');
        expect(parts[1]).toBe(String(FAST));
        // salt b64url tem 16 bytes → 22 chars sem padding.
        expect(parts[2]?.length).toBeGreaterThanOrEqual(20);
        // hash b64url tem 32 bytes → 43 chars sem padding.
        expect(parts[3]?.length).toBeGreaterThanOrEqual(40);
    });

    it('produz hashes diferentes pra mesma senha (salt random)', async () => {
        const a = await hashPassword('mesma-senha', FAST);
        const b = await hashPassword('mesma-senha', FAST);
        expect(a).not.toBe(b);
    });

    it('rejeita senha vazia', async () => {
        await expect(hashPassword('', FAST)).rejects.toThrow(/vazia/);
    });

    it('rejeita iterations < 1000', async () => {
        await expect(hashPassword('senha', 500)).rejects.toThrow(/insegur/);
    });

    it('usa default de iterations quando omitido', async () => {
        const hash = await hashPassword('senha-default');
        // O default não deve ser tão baixo — pelo menos 10k pra produção.
        const iter = Number.parseInt(hash.split('$')[1] ?? '0', 10);
        expect(iter).toBeGreaterThanOrEqual(10_000);
    });
});

describe('verifyPassword', () => {
    it('verifica senha correta contra hash recém-criado', async () => {
        const hash = await hashPassword('correto-horse-battery-staple', FAST);
        expect(await verifyPassword('correto-horse-battery-staple', hash)).toBe(true);
    });

    it('rejeita senha errada', async () => {
        const hash = await hashPassword('senha-real', FAST);
        expect(await verifyPassword('senha-errada', hash)).toBe(false);
    });

    it('rejeita senha vazia', async () => {
        const hash = await hashPassword('algo', FAST);
        expect(await verifyPassword('', hash)).toBe(false);
    });

    it('rejeita hash vazio', async () => {
        expect(await verifyPassword('senha', '')).toBe(false);
    });

    it('rejeita hash com formato errado (sem $)', async () => {
        expect(await verifyPassword('senha', 'nao-tem-formato')).toBe(false);
    });

    it('rejeita hash com scheme diferente', async () => {
        expect(await verifyPassword('senha', 'bcrypt$10$salt$hash')).toBe(false);
    });

    it('rejeita hash com iterations não-numérico', async () => {
        expect(
            await verifyPassword('senha', 'pbkdf2$abc$saltB64$hashB64'),
        ).toBe(false);
    });

    it('rejeita hash com iterations < 1000', async () => {
        expect(
            await verifyPassword('senha', 'pbkdf2$500$saltB64$hashB64'),
        ).toBe(false);
    });

    it('rejeita hash com parts faltando', async () => {
        expect(await verifyPassword('senha', 'pbkdf2$1000$$')).toBe(false);
    });

    it('rejeita hash com base64 inválido no salt/hash', async () => {
        // '!!!' não é base64url válido — atob vai falhar.
        expect(await verifyPassword('senha', 'pbkdf2$1000$!!!$!!!')).toBe(false);
    });

    it('verifica é estável (mesma senha + mesmo hash → true repetidamente)', async () => {
        const hash = await hashPassword('estavel', FAST);
        for (let i = 0; i < 3; i++) {
            expect(await verifyPassword('estavel', hash)).toBe(true);
        }
    });
});
