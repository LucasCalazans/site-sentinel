-- Auditoria de alertas enviados. Cada run não-ok gera um post no Discord
-- (ou falha tentando) — gravamos aqui pro dashboard mostrar histórico e pra
-- debug de webhooks quebrados.

CREATE TABLE alerts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id        INTEGER NOT NULL,
    channel       TEXT    NOT NULL,
    -- 'sent' quando o webhook respondeu 2xx; 'failed' caso contrário (ou
    -- exception). 'skipped' quando o webhook não está configurado.
    status        TEXT    NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
    error_message TEXT,
    sent_at       INTEGER NOT NULL,
    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX idx_alerts_sent_at ON alerts(sent_at DESC);
CREATE INDEX idx_alerts_run_id ON alerts(run_id);
