-- Integrações externas (Cloudflare, GitHub). 1 row por integração — o config
-- só guarda IDs/repos pra reuso; tokens reais ficam em wrangler secrets.
--
-- sync_snapshots cacheia respostas das APIs externas pro dashboard não bater
-- direto na rate-limit-sensitive API a cada page load. O cron horário
-- refresca os snapshots; o dashboard lê o latest snapshot por kind.

CREATE TABLE integrations (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    type           TEXT    NOT NULL UNIQUE CHECK (type IN ('cloudflare', 'github')),
    -- JSON com config específica:
    --   cloudflare: { accountId, zoneId }
    --   github:     { repos: ["owner/repo", ...] }
    config_json    TEXT    NOT NULL,
    last_synced_at INTEGER
);

CREATE TABLE sync_snapshots (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    integration_id INTEGER NOT NULL,
    -- Identificador específico do snapshot. Exemplos:
    --   'github.actions.LucasCalazans/sonda'
    --   'github.release.LucasCalazans/sonda-releases'
    --   'cloudflare.pages.sonda-recover-com'
    --   'cloudflare.workers.site-sentinel'
    --   'cloudflare.d1.sonda-license'
    --   'cloudflare.analytics.zone'
    kind           TEXT    NOT NULL,
    payload_json   TEXT    NOT NULL,
    captured_at    INTEGER NOT NULL,
    FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
);

-- Dashboard query: "último snapshot de cada kind" (LIMIT 1 ORDER BY captured_at DESC).
CREATE INDEX idx_sync_snapshots_kind_captured_at ON sync_snapshots(kind, captured_at DESC);
-- Cleanup periódico (mantém só os últimos 30 por kind, por exemplo).
CREATE INDEX idx_sync_snapshots_integration ON sync_snapshots(integration_id, captured_at DESC);

-- Seed das integrações default. Os IDs reais vivem em [vars]/[secrets] do
-- wrangler.toml — config_json aqui é só um marker que a integração existe.
INSERT INTO integrations (type, config_json, last_synced_at) VALUES
    ('cloudflare', '{"source":"wrangler-vars"}', NULL),
    ('github',     '{"source":"wrangler-vars"}', NULL);
