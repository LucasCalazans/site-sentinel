-- Tabela de checks. Cada row é uma definição declarativa de algo a monitorar.
-- O scheduled handler lê os enabled+cron_pattern matching o tick atual e
-- instancia via src/checks/factory.ts (discriminated union por `type`).

CREATE TABLE checks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL UNIQUE,
    -- Discriminator. Suportados em factory.ts: 'performance',
    -- 'content_sentinel', 'redirect_chain', 'integrity'.
    type         TEXT    NOT NULL,
    -- JSON serializado com a config específica do tipo (URLs, thresholds,
    -- sentinels). Schema validado em src/checks/factory.ts.
    config_json  TEXT    NOT NULL,
    -- Soft-disable: row continua mas o scheduled skip. 1=enabled, 0=disabled.
    enabled      INTEGER NOT NULL DEFAULT 1,
    -- Padrão cron exato — match comparado ao event.cron do scheduled handler.
    -- Hoje os triggers fixos são '*/5 * * * *' e '0 * * * *'.
    cron_pattern TEXT    NOT NULL,
    -- Agrupador lógico por app monitorado (ex.: 'sonda', 'myapp'). Permite
    -- filtrar lista no dashboard e isolar uma app inteira.
    app_label    TEXT    NOT NULL,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);

-- Hot path do scheduled handler: WHERE enabled = 1 AND cron_pattern = ?.
CREATE INDEX idx_checks_enabled_cron ON checks(enabled, cron_pattern);
-- Filtro no dashboard.
CREATE INDEX idx_checks_app_label ON checks(app_label);
