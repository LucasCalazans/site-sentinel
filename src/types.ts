export type Severity = 'ok' | 'warn' | 'critical';

export interface CheckResult {
    name: string;
    severity: Severity;
    message: string;
    details?: Record<string, unknown>;
    durationMs: number;
}

export interface CheckContext {
    fetch: typeof fetch;
    now: () => number;
}

export interface Check {
    name: string;
    run(ctx: CheckContext): Promise<CheckResult>;
}
