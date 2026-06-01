-- Estado da última severidade por (app, check), usado pelo edge-trigger do
-- disparo de rotina no modelo runAllApps (deploy/sonda), que NÃO escreve nas
-- tabelas runs/checks. Permite acordar a rotina só na TRANSIÇÃO ok→falha, e não
-- a cada cron tick enquanto a falha persiste (senão um outage longo viraria
-- dezenas de sessões e PRs duplicados).
--
-- Em produção essa tabela vive num D1 dedicado e mínimo (site-sentinel-state),
-- criado à parte. Aqui no migrations/ ela também entra pra os testes (que
-- aplicam todas as migrations num D1 miniflare efêmero).

CREATE TABLE check_state (
    app        TEXT    NOT NULL,
    check_name TEXT    NOT NULL,
    severity   TEXT    NOT NULL CHECK (severity IN ('ok', 'warn', 'critical')),
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (app, check_name)
);
