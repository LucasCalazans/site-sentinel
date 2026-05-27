-- Seed: popula os 5 checks que hoje vivem em examples/sonda/config.ts.
-- A intenção é que essa seed seja a fonte de verdade depois do v2 —
-- examples/sonda/config.ts vira deprecated (ainda funcional pra forks
-- que usam a lib sem D1, mas o site-sentinel canônico lê do banco).

INSERT INTO checks (name, type, config_json, enabled, cron_pattern, app_label, created_at, updated_at) VALUES
    (
        'sonda.performance',
        'performance',
        '{"targets":[{"url":"https://sonda-recover.com","warnMs":2500,"criticalMs":8000},{"url":"https://sonda-recover.com/pt-BR","warnMs":2500,"criticalMs":8000},{"url":"https://sonda-recover.com/es","warnMs":2500,"criticalMs":8000},{"url":"https://api.sonda-recover.com/","warnMs":2500,"criticalMs":8000}]}',
        1,
        '*/5 * * * *',
        'sonda',
        CAST(strftime('%s','now') AS INTEGER) * 1000,
        CAST(strftime('%s','now') AS INTEGER) * 1000
    ),
    (
        'sonda.download_redirect_chain',
        'redirect_chain',
        '{"startUrl":"https://sonda-recover.com/downloads/sonda-setup-x64.exe","allowedHosts":["sonda-recover.com","api.sonda-recover.com","github.com",".githubusercontent.com"],"finalHost":".githubusercontent.com"}',
        1,
        '*/5 * * * *',
        'sonda',
        CAST(strftime('%s','now') AS INTEGER) * 1000,
        CAST(strftime('%s','now') AS INTEGER) * 1000
    ),
    (
        'sonda.landing_defacement',
        'content_sentinel',
        '{"url":"https://sonda-recover.com","mustContain":["Sonda","sonda-setup-x64.exe","mailto:contato@sonda-recover.com","href=\"https://sonda-recover.com/pt-BR\""],"mustNotContain":[{"pattern":"hacked by","flags":"i"},{"pattern":"pwned by","flags":"i"},{"pattern":"defaced","flags":"i"},{"pattern":"<script[^>]*>[^<]{0,200}\\\\beval\\\\s*\\\\(","flags":"i"}]}',
        1,
        '*/5 * * * *',
        'sonda',
        CAST(strftime('%s','now') AS INTEGER) * 1000,
        CAST(strftime('%s','now') AS INTEGER) * 1000
    ),
    (
        'sonda.security_txt',
        'content_sentinel',
        '{"url":"https://sonda-recover.com/.well-known/security.txt","mustContain":["security@sonda-recover.com","Canonical: https://sonda-recover.com"]}',
        1,
        '*/5 * * * *',
        'sonda',
        CAST(strftime('%s','now') AS INTEGER) * 1000,
        CAST(strftime('%s','now') AS INTEGER) * 1000
    ),
    (
        'sonda.download_integrity',
        'integrity',
        '{"downloadUrl":"https://sonda-recover.com/downloads/sonda-setup-x64.exe","releasesRepo":"LucasCalazans/sonda-releases","assetName":"sonda-setup-x64.exe"}',
        1,
        '0 * * * *',
        'sonda',
        CAST(strftime('%s','now') AS INTEGER) * 1000,
        CAST(strftime('%s','now') AS INTEGER) * 1000
    );
