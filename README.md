# site-sentinel

Monitor de sites com dashboard. Cloudflare Worker + D1 + cron triggers + REST API + React dashboard + integrações Cloudflare/GitHub. Roda local com miniflare ou deploya pro Cloudflare Workers.

## O que faz

1. **Checks plugáveis** — performance, content sentinel (defacement), redirect chain (DNS hijack), integrity (SHA-256 do binário vs GitHub Release). Configurados via UI ou seed SQL, persistidos em D1.
2. **Histórico** — cada execução grava em D1, dashboard mostra séries temporais.
3. **Alertas Discord** — checks falhando disparam webhook; histórico de alertas auditável.
4. **Integrações** — Cloudflare (Pages, Workers, D1, Analytics) e GitHub (repos, releases, Actions runs, issues/PRs) cacheadas em D1, refrescadas pelo cron horário.
5. **Auth básico** — password único + JWT próprio (sem dependência de OAuth provider).

## Setup local (sem deploy)

```bash
git clone git@github.com:LucasCalazans/site-sentinel
cd site-sentinel

# Setup automatizado:
./scripts/setup-local.sh

# Configure as chaves no .dev.vars:
#   JWT_SIGNING_KEY        openssl rand -hex 32
#   ADMIN_PASSWORD_HASH    npm run hash:password
#   DISCORD_WEBHOOK_URL    (opcional pra dev — sem ele, alertas viram 'skipped')
#   CF_API_TOKEN           (opcional — integração Cloudflare fica vazia se ausente)
#   GITHUB_TOKEN           (opcional — integração GitHub fica vazia se ausente)
# E em wrangler.toml [vars]:
#   CF_ACCOUNT_ID, CF_ZONE_ID, GITHUB_REPOS

# Rodar (2 terminais):
npm run dev                         # Worker em :8787
(cd dashboard && npm run dev)       # Dashboard em :5173
```

Abra http://localhost:5173 e logue com a senha que gerou o hash.

## Estrutura

```
src/                      # Worker (entry point + API + cron)
├── index.ts              # exports fetch + scheduled
├── api/                  # router, endpoints, CORS, auth middleware
├── auth/                 # JWT HS256 + PBKDF2 password + middleware
├── db/                   # CRUD typed do D1 (checks, runs, alerts, integrations)
├── checks/               # primitives de check (performance, content_sentinel,
│                           redirect_chain, integrity) + factory que monta
│                           Check a partir de row do D1
├── integrations/         # wrappers REST Cloudflare/GitHub + sync periódico
├── runtime/              # scheduled handler (cron → D1)
├── reporters/            # Discord webhook
└── runner.ts             # roda checks em paralelo, captura exceptions

dashboard/                # React SPA (Vite + Tailwind)
├── src/
│   ├── pages/            # Login, Overview, ChecksList, CheckNew, CheckDetail,
│   │                       Alerts, Github, Cloudflare
│   ├── components/       # Sidebar, Layout, AuthGate + ui/
│   └── lib/              # api client, auth (localStorage), format helpers

migrations/               # D1 schema (rodadas via wrangler ou setup script)
scripts/                  # hash-password, setup-local
```

## Comandos

| Backend (raiz) | |
|---|---|
| `npm run dev` | Worker local (wrangler dev) em :8787 com D1 miniflare |
| `npm run typecheck` | tsc --noEmit |
| `npm test` | vitest run (cobertura 90% gated em vitest.config.ts) |
| `npm run test:coverage` | report HTML em `coverage/` |
| `npm run db:migrate:local` | aplica migrations no D1 SQLite local |
| `npm run db:reset:local` | apaga D1 local + reaplica migrations |
| `npm run hash:password` | gera PBKDF2 hash pra colar em `.dev.vars` |
| `npm run secret put NAME` | (pra deploy) seta secret no Worker em produção |
| `npm run deploy` | (pra deploy) `wrangler deploy` |

| Dashboard (`cd dashboard`) | |
|---|---|
| `npm run dev` | Vite dev em :5173 (proxy /api → :8787) |
| `npm run build` | produção em `dashboard/dist/` |
| `npm run typecheck` | tsc -b |
| `npm test` | vitest + RTL (cobertura 90%) |

## Deploy (quando estiver pronto)

```bash
# 1. Cria D1 remoto e cola o ID em wrangler.toml [[d1_databases]].database_id
npx wrangler d1 create site-sentinel-db

# 2. Aplica migrations remoto
npx wrangler d1 migrations apply site-sentinel-db --remote

# 3. Secrets (substitui o que estava em .dev.vars)
npx wrangler secret put JWT_SIGNING_KEY
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put DISCORD_WEBHOOK_URL
npx wrangler secret put CF_API_TOKEN
npx wrangler secret put GITHUB_TOKEN

# 4. Deploy
npm run deploy

# 5. Dashboard como Pages: build local + deploy via Pages CLI ou GitHub Action.
```

## Tipos de check

Cada check armazenado no D1 tem `type` discriminador e `config_json`:

### performance

```json
{
    "targets": [
        { "url": "https://x.com", "warnMs": 2500, "criticalMs": 8000 },
        { "url": "https://x.com/api", "warnMs": 1000, "criticalMs": 5000, "expectStatus": 200 }
    ]
}
```

Severities: latência > criticalMs ou status diferente do esperado → critical; > warnMs → warn.

### content_sentinel

```json
{
    "url": "https://x.com",
    "mustContain": [
        "literal string",
        { "pattern": "regex source", "flags": "i" }
    ],
    "mustNotContain": [
        { "pattern": "hacked by", "flags": "i" }
    ]
}
```

Severity critical quando algum mustContain falta ou algum mustNotContain aparece.

### redirect_chain

```json
{
    "startUrl": "https://x.com/download",
    "allowedHosts": ["x.com", ".githubusercontent.com"],
    "finalHost": ".githubusercontent.com",
    "expectOk": true,
    "maxHops": 10
}
```

Severity critical se algum hop sai da whitelist, destino final difere de `finalHost`, ou estoura `maxHops`.

### integrity

```json
{
    "downloadUrl": "https://x.com/app.exe",
    "releasesRepo": "owner/repo",
    "assetName": "app.exe"
}
```

Baixa o binário e compara SHA-256 com `assets[].digest` do GitHub Release `/latest`. Severity critical se diverge (= possível troca de binário). Severity warn se o release não tem digest sha256.

## Custos

Tier free do Cloudflare:
- 100k req/dia no Worker
- 5 milhões reads/mês no D1 (1 GB armazenamento)

Crons disparam:
- `*/5 * * * *` (288/dia): checks leves + alerts. ~5-10 req cada → ~3000 req/dia.
- `0 * * * *` (24/dia): integrity (baixa ~2.5MB) + sync de integrações (12 endpoints CF + 4×N endpoints GH). ~50 req/dia.

Total bem dentro do tier free.

## Auth model

Single-user (você). Password único gera JWT HS256 com 7 dias de validade (configurável via `JWT_EXPIRY_DAYS`). Token vai no `Authorization: Bearer` de toda request privada. 401 do backend dispara redirect pra `/login` no frontend.

`ADMIN_PASSWORD_HASH` em PBKDF2-SHA256 (100k iterations + salt 16 bytes). Gere com `npm run hash:password`.

## Decisões / quirks

- **Sem deduplicação de alertas**: cada cron tick que falha dispara webhook. Propositadamente — prefiro alerta repetido a alerta perdido.
- **Snapshots de integrações são cacheados**: dashboard nunca bate direto na CF/GH API, só lê do D1 cacheado pelo cron. Resolve rate limits + dá visibilidade quando a API externa cai.
- **GraphQL CF não usado**: usamos só REST. Workers Analytics seria GraphQL mas v1 fica com listar scripts + routes_count.
- **Cadastro via UI é typed**: as 4 tipos têm form com defaults JSON; usuário edita JSON. Sem editor de check arbitrário em código (decisão consciente — evita eval/sandbox).

## Licença

MIT.
