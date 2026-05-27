// Row shapes do D1 — espelha o schema SQL em migrations/. Booleans em
// SQLite vivem como INTEGER 0/1, então CheckRow.enabled é 0|1 (não bool).

export type CheckType =
    | 'performance'
    | 'content_sentinel'
    | 'redirect_chain'
    | 'integrity';

export type Severity = 'ok' | 'warn' | 'critical';

export type AlertStatus = 'sent' | 'failed' | 'skipped';

export type IntegrationType = 'cloudflare' | 'github';

export interface CheckRow {
    id: number;
    name: string;
    type: CheckType;
    config_json: string;
    enabled: 0 | 1;
    cron_pattern: string;
    app_label: string;
    created_at: number;
    updated_at: number;
}

export interface RunRow {
    id: number;
    check_id: number;
    severity: Severity;
    message: string;
    duration_ms: number;
    details_json: string | null;
    ran_at: number;
}

export interface AlertRow {
    id: number;
    run_id: number;
    channel: string;
    status: AlertStatus;
    error_message: string | null;
    sent_at: number;
}

export interface IntegrationRow {
    id: number;
    type: IntegrationType;
    config_json: string;
    last_synced_at: number | null;
}

export interface SyncSnapshotRow {
    id: number;
    integration_id: number;
    kind: string;
    payload_json: string;
    captured_at: number;
}
