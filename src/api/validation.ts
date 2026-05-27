// Validators leves pra parse de input. Sem dep externa — type guards e
// helpers compostos. Suficiente pro shape esperado pelos endpoints.

import type { CheckType } from '../db/types.ts';

const VALID_CHECK_TYPES: ReadonlyArray<CheckType> = [
    'performance',
    'content_sentinel',
    'redirect_chain',
    'integrity',
];

export function isValidCheckType(value: unknown): value is CheckType {
    return (
        typeof value === 'string' &&
        (VALID_CHECK_TYPES as ReadonlyArray<string>).includes(value)
    );
}

export function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
    );
}

export interface CreateCheckPayload {
    name: string;
    type: CheckType;
    config: Record<string, unknown>;
    enabled?: boolean;
    cron_pattern: string;
    app_label: string;
}

export interface ValidationError {
    error: string;
    field?: string;
}

export type ValidationResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: ValidationError };

export function parseCreateCheck(input: unknown): ValidationResult<CreateCheckPayload> {
    if (!isPlainObject(input)) return { ok: false, error: { error: 'body deve ser objeto JSON' } };
    if (!isNonEmptyString(input.name)) return { ok: false, error: { error: 'name obrigatório', field: 'name' } };
    if (!isValidCheckType(input.type)) {
        return {
            ok: false,
            error: { error: `type inválido (esperado: ${VALID_CHECK_TYPES.join(', ')})`, field: 'type' },
        };
    }
    if (!isPlainObject(input.config)) {
        return { ok: false, error: { error: 'config obrigatório (objeto)', field: 'config' } };
    }
    if (!isNonEmptyString(input.cron_pattern)) {
        return { ok: false, error: { error: 'cron_pattern obrigatório', field: 'cron_pattern' } };
    }
    if (!isNonEmptyString(input.app_label)) {
        return { ok: false, error: { error: 'app_label obrigatório', field: 'app_label' } };
    }
    if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
        return { ok: false, error: { error: 'enabled deve ser boolean', field: 'enabled' } };
    }
    return {
        ok: true,
        value: {
            name: input.name,
            type: input.type,
            config: input.config,
            cron_pattern: input.cron_pattern,
            app_label: input.app_label,
            enabled: input.enabled as boolean | undefined,
        },
    };
}

export interface UpdateCheckPayload {
    name?: string;
    type?: CheckType;
    config?: Record<string, unknown>;
    enabled?: boolean;
    cron_pattern?: string;
    app_label?: string;
}

export function parseUpdateCheck(input: unknown): ValidationResult<UpdateCheckPayload> {
    if (!isPlainObject(input)) return { ok: false, error: { error: 'body deve ser objeto JSON' } };
    const out: UpdateCheckPayload = {};
    if (input.name !== undefined) {
        if (!isNonEmptyString(input.name)) return { ok: false, error: { error: 'name inválido', field: 'name' } };
        out.name = input.name;
    }
    if (input.type !== undefined) {
        if (!isValidCheckType(input.type)) return { ok: false, error: { error: 'type inválido', field: 'type' } };
        out.type = input.type;
    }
    if (input.config !== undefined) {
        if (!isPlainObject(input.config)) return { ok: false, error: { error: 'config inválido', field: 'config' } };
        out.config = input.config;
    }
    if (input.enabled !== undefined) {
        if (typeof input.enabled !== 'boolean') return { ok: false, error: { error: 'enabled inválido', field: 'enabled' } };
        out.enabled = input.enabled;
    }
    if (input.cron_pattern !== undefined) {
        if (!isNonEmptyString(input.cron_pattern)) {
            return { ok: false, error: { error: 'cron_pattern inválido', field: 'cron_pattern' } };
        }
        out.cron_pattern = input.cron_pattern;
    }
    if (input.app_label !== undefined) {
        if (!isNonEmptyString(input.app_label)) {
            return { ok: false, error: { error: 'app_label inválido', field: 'app_label' } };
        }
        out.app_label = input.app_label;
    }
    return { ok: true, value: out };
}

export function parsePositiveInt(value: string | null, fallback: number, max?: number): number {
    if (value === null) return fallback;
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n < 0) return fallback;
    if (max !== undefined && n > max) return max;
    return n;
}
