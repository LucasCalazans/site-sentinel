import { describe, expect, it } from 'vitest';
import {
    formatTimestamp,
    humanMs,
    humanSize,
    relativeTime,
    severityColor,
} from './format.ts';

describe('humanSize', () => {
    it('formata bytes', () => {
        expect(humanSize(500)).toBe('500 B');
        expect(humanSize(2048)).toBe('2.0 KB');
        expect(humanSize(1024 * 1024 * 5.5)).toBe('5.5 MB');
        expect(humanSize(1024 * 1024 * 1024 * 2)).toBe('2.0 GB');
    });

    it('valores grandes usam unidade alta', () => {
        const tb = 1024 ** 4 * 3;
        expect(humanSize(tb)).toBe('3.0 TB');
    });

    it('retorna — pra valor inválido', () => {
        expect(humanSize(NaN)).toBe('—');
        expect(humanSize(-1)).toBe('—');
    });

    it('omits decimal pra >= 100', () => {
        expect(humanSize(1024 * 1024 * 150)).toBe('150 MB');
    });
});

describe('humanMs', () => {
    it('< 1s = ms', () => {
        expect(humanMs(500)).toBe('500ms');
    });

    it('< 60s = decimal s', () => {
        expect(humanMs(5000)).toBe('5.00s');
        expect(humanMs(45_123)).toBe('45.12s');
    });

    it('>= 60s = min e s', () => {
        expect(humanMs(125_000)).toBe('2m 5s');
    });

    it('inválido → —', () => {
        expect(humanMs(NaN)).toBe('—');
        expect(humanMs(-1)).toBe('—');
    });
});

describe('relativeTime', () => {
    const NOW = 1_700_000_000_000;
    it('segundos', () => {
        expect(relativeTime(NOW - 5_000, NOW)).toBe('5s atrás');
    });
    it('minutos', () => {
        expect(relativeTime(NOW - 2 * 60_000, NOW)).toBe('2min atrás');
    });
    it('horas', () => {
        expect(relativeTime(NOW - 3 * 3_600_000, NOW)).toBe('3h atrás');
    });
    it('dias', () => {
        expect(relativeTime(NOW - 5 * 86_400_000, NOW)).toBe('5d atrás');
    });
    it('meses', () => {
        expect(relativeTime(NOW - 90 * 86_400_000, NOW)).toBe('3mo atrás');
    });
    it('anos', () => {
        expect(relativeTime(NOW - 800 * 86_400_000, NOW)).toBe('2y atrás');
    });
    it('futuro', () => {
        expect(relativeTime(NOW + 1000, NOW)).toBe('no futuro');
    });
    it('NaN', () => {
        expect(relativeTime(NaN, NOW)).toBe('—');
    });
});

describe('formatTimestamp', () => {
    it('ISO formatado sem T e sem ms', () => {
        const ts = Date.UTC(2026, 0, 15, 12, 30, 45);
        expect(formatTimestamp(ts)).toBe('2026-01-15 12:30:45');
    });
    it('NaN → —', () => {
        expect(formatTimestamp(NaN)).toBe('—');
    });
});

describe('severityColor', () => {
    it('ok = emerald', () => {
        expect(severityColor('ok').text).toContain('emerald');
    });
    it('warn = amber', () => {
        expect(severityColor('warn').text).toContain('amber');
    });
    it('critical = rose', () => {
        expect(severityColor('critical').text).toContain('rose');
    });
    it('unknown = zinc', () => {
        expect(severityColor('xxx').text).toContain('zinc');
    });
});
