import { describe, expect, it } from 'vitest';
import {
    isNonEmptyString,
    isPlainObject,
    isValidCheckType,
    parseCreateCheck,
    parsePositiveInt,
    parseUpdateCheck,
} from './validation.ts';

describe('type guards', () => {
    it('isValidCheckType', () => {
        expect(isValidCheckType('performance')).toBe(true);
        expect(isValidCheckType('content_sentinel')).toBe(true);
        expect(isValidCheckType('redirect_chain')).toBe(true);
        expect(isValidCheckType('integrity')).toBe(true);
        expect(isValidCheckType('other')).toBe(false);
        expect(isValidCheckType(123)).toBe(false);
        expect(isValidCheckType(null)).toBe(false);
    });

    it('isNonEmptyString', () => {
        expect(isNonEmptyString('a')).toBe(true);
        expect(isNonEmptyString('')).toBe(false);
        expect(isNonEmptyString(123)).toBe(false);
        expect(isNonEmptyString(null)).toBe(false);
    });

    it('isPlainObject', () => {
        expect(isPlainObject({})).toBe(true);
        expect(isPlainObject({ a: 1 })).toBe(true);
        expect(isPlainObject([])).toBe(false);
        expect(isPlainObject(null)).toBe(false);
        expect(isPlainObject('s')).toBe(false);
    });
});

describe('parseCreateCheck', () => {
    const valid = {
        name: 'x',
        type: 'performance',
        config: { targets: [] },
        cron_pattern: '*/5 * * * *',
        app_label: 'test',
    };

    it('aceita payload válido', () => {
        const r = parseCreateCheck(valid);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.name).toBe('x');
            expect(r.value.enabled).toBeUndefined();
        }
    });

    it('aceita enabled boolean', () => {
        const r = parseCreateCheck({ ...valid, enabled: false });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.enabled).toBe(false);
    });

    it('rejeita não-objeto', () => {
        expect(parseCreateCheck('string').ok).toBe(false);
        expect(parseCreateCheck(null).ok).toBe(false);
        expect(parseCreateCheck([]).ok).toBe(false);
    });

    it('rejeita name vazio/ausente', () => {
        const r = parseCreateCheck({ ...valid, name: '' });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.field).toBe('name');
    });

    it('rejeita type inválido', () => {
        const r = parseCreateCheck({ ...valid, type: 'xxx' });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.field).toBe('type');
    });

    it('rejeita config não-objeto', () => {
        const r = parseCreateCheck({ ...valid, config: 'string' });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.field).toBe('config');
    });

    it('rejeita cron_pattern vazio', () => {
        const r = parseCreateCheck({ ...valid, cron_pattern: '' });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.field).toBe('cron_pattern');
    });

    it('rejeita app_label vazio', () => {
        const r = parseCreateCheck({ ...valid, app_label: '' });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.field).toBe('app_label');
    });

    it('rejeita enabled não-boolean', () => {
        const r = parseCreateCheck({ ...valid, enabled: 'yes' });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.field).toBe('enabled');
    });
});

describe('parseUpdateCheck', () => {
    it('aceita payload vazio (no-op update)', () => {
        const r = parseUpdateCheck({});
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value).toEqual({});
    });

    it('aceita campos parciais', () => {
        const r = parseUpdateCheck({ enabled: true });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value).toEqual({ enabled: true });
    });

    it('rejeita não-objeto', () => {
        expect(parseUpdateCheck('s').ok).toBe(false);
    });

    it('rejeita campos individuais inválidos', () => {
        expect(parseUpdateCheck({ name: '' }).ok).toBe(false);
        expect(parseUpdateCheck({ type: 'x' }).ok).toBe(false);
        expect(parseUpdateCheck({ config: 'string' }).ok).toBe(false);
        expect(parseUpdateCheck({ enabled: 'yes' }).ok).toBe(false);
        expect(parseUpdateCheck({ cron_pattern: '' }).ok).toBe(false);
        expect(parseUpdateCheck({ app_label: '' }).ok).toBe(false);
    });

    it('aceita todos os campos juntos', () => {
        const r = parseUpdateCheck({
            name: 'x',
            type: 'integrity',
            config: { a: 1 },
            enabled: true,
            cron_pattern: '0 * * * *',
            app_label: 'a',
        });
        expect(r.ok).toBe(true);
    });
});

describe('parsePositiveInt', () => {
    it('retorna fallback pra null', () => {
        expect(parsePositiveInt(null, 100)).toBe(100);
    });

    it('parsea inteiro válido', () => {
        expect(parsePositiveInt('50', 100)).toBe(50);
    });

    it('aceita zero', () => {
        expect(parsePositiveInt('0', 100)).toBe(0);
    });

    it('retorna fallback pra string inválida', () => {
        expect(parsePositiveInt('abc', 100)).toBe(100);
    });

    it('retorna fallback pra negativo', () => {
        expect(parsePositiveInt('-5', 100)).toBe(100);
    });

    it('clampa em max', () => {
        expect(parsePositiveInt('500', 100, 200)).toBe(200);
    });

    it('não clampa quando max não passa', () => {
        expect(parsePositiveInt('5000', 100)).toBe(5000);
    });
});
