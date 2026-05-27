import { describe, expect, it } from 'vitest';
import { b64urlDecode, b64urlEncode, constantTimeEqual } from './encoding.ts';

describe('b64url round-trip', () => {
    it('encoda + decoda bytes arbitrários', () => {
        const bytes = new Uint8Array([0, 1, 254, 255, 127, 128, 65]);
        const encoded = b64urlEncode(bytes);
        const decoded = b64urlDecode(encoded);
        expect(Array.from(decoded)).toEqual(Array.from(bytes));
    });

    it('produz output sem padding e sem + ou /', () => {
        const encoded = b64urlEncode(new Uint8Array([0xff, 0xfe, 0xfd]));
        expect(encoded).not.toContain('=');
        expect(encoded).not.toContain('+');
        expect(encoded).not.toContain('/');
    });

    it('decoda string com tamanho não-múltiplo de 4 (sem padding explícito)', () => {
        // 'AAE' = 2 bytes [0, 1]; sem padding = decode com pad implícito.
        const decoded = b64urlDecode('AAE');
        expect(Array.from(decoded)).toEqual([0, 1]);
    });

    it('round-trip de buffer vazio', () => {
        const encoded = b64urlEncode(new Uint8Array(0));
        expect(encoded).toBe('');
        expect(b64urlDecode(encoded).length).toBe(0);
    });

    it('round-trip de UTF-8 codificado', () => {
        const text = 'Olá, mundo! 🌍';
        const bytes = new TextEncoder().encode(text);
        const decoded = new TextDecoder().decode(b64urlDecode(b64urlEncode(bytes)));
        expect(decoded).toBe(text);
    });
});

describe('constantTimeEqual', () => {
    it('retorna true pra buffers iguais', () => {
        const a = new Uint8Array([1, 2, 3]);
        const b = new Uint8Array([1, 2, 3]);
        expect(constantTimeEqual(a, b)).toBe(true);
    });

    it('retorna false pra buffers diferentes no mesmo tamanho', () => {
        const a = new Uint8Array([1, 2, 3]);
        const b = new Uint8Array([1, 2, 4]);
        expect(constantTimeEqual(a, b)).toBe(false);
    });

    it('retorna false pra tamanhos diferentes', () => {
        expect(
            constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3])),
        ).toBe(false);
    });

    it('retorna true pra dois buffers vazios', () => {
        expect(constantTimeEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true);
    });

    it('detecta diferença no primeiro byte', () => {
        expect(
            constantTimeEqual(new Uint8Array([9, 2, 3]), new Uint8Array([1, 2, 3])),
        ).toBe(false);
    });

    it('detecta diferença no último byte', () => {
        expect(
            constantTimeEqual(new Uint8Array([1, 2, 9]), new Uint8Array([1, 2, 3])),
        ).toBe(false);
    });
});
