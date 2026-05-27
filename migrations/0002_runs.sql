-- Histórico de execuções. Cada cron tick que roda um check insere uma row.
-- Retenção: por enquanto sem cleanup automático. Quando passar de ~6 meses,
-- adicionar trigger ou cron de limpeza (DELETE WHERE ran_at < now - 90d).

CREATE TABLE runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    check_id     INTEGER NOT NULL,
    severity     TEXT    NOT NULL CHECK (severity IN ('ok', 'warn', 'critical')),
    message      TEXT    NOT NULL,
    duration_ms  INTEGER NOT NULL,
    -- JSON com detalhes específicos do check (ex.: SHA-256 esperado/atual
    -- pro integrity, chain de redirects pro redirect_chain). NULL quando ok.
    details_json TEXT,
    ran_at       INTEGER NOT NULL,
    FOREIGN KEY (check_id) REFERENCES checks(id) ON DELETE CASCADE
);

-- Hot path do dashboard: "últimos N runs de um check específico".
CREATE INDEX idx_runs_check_id_ran_at ON runs(check_id, ran_at DESC);
-- Hot path da página /alerts: "todos os runs não-ok das últimas 24h".
CREATE INDEX idx_runs_severity_ran_at ON runs(severity, ran_at DESC);
