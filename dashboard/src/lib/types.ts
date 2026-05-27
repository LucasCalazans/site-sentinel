// Tipos espelhados do backend (src/api/checks.ts, runs.ts, alerts.ts).
// Mantidos manualmente sincronizados — quando o backend mudar wire shape,
// atualize aqui também.

export type CheckType =
    | 'performance'
    | 'content_sentinel'
    | 'redirect_chain'
    | 'integrity';

export type Severity = 'ok' | 'warn' | 'critical';

export interface WireCheck {
    id: number;
    name: string;
    type: CheckType;
    config: unknown;
    enabled: boolean;
    cron_pattern: string;
    app_label: string;
    created_at: number;
    updated_at: number;
}

export interface WireRun {
    id: number;
    check_id: number;
    severity: Severity;
    message: string;
    duration_ms: number;
    details: unknown;
    ran_at: number;
}

export interface WireLatestRun extends WireRun {
    check_name: string;
}

export interface WireAlert {
    id: number;
    run_id: number;
    channel: string;
    status: string;
    error_message: string | null;
    sent_at: number;
}

export interface WireSnapshot {
    kind: string;
    captured_at: number;
    payload: unknown;
}
