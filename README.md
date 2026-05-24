# site-sentinel

Monitor periódico de sites rodando em Cloudflare Worker com cron triggers. Cada execução roda um conjunto de checks plugáveis e dispara alerta no Discord se algum falhar.

Pensado como **lib reutilizável**: um único Worker pode monitorar múltiplos sites/apps — cada um expõe uma função `buildChecks(env, cron): Check[]` e é registrado em `src/index.ts`. O core (`src/`) não conhece nenhum projeto específico; configs reais vivem em `examples/` ou no seu fork.

## Por que existir

Quando você publica um binário num CDN ou tem uma landing apontando pra ele, três coisas podem te ferrar sem você perceber:

1. **Binário trocado** — atacante ganha controle do hop intermediário (CF account, GitHub, registro DNS) e serve um installer com payload diferente. Usuários baixam, instalam, ficam infectados.
2. **Redirect sequestrado** — qualquer hop da chain de download pode ser redirecionado pra outro lugar, sem você notar.
3. **Defacement parcial** — alterar uma URL no rodapé, trocar um link de contato, embedar script malicioso na home.

site-sentinel cobre os 3 cenários com checks específicos, e ainda mede latência/uptime de tabela.

## Checks disponíveis

| Check | Detecta |
|---|---|
| `integrity` | Troca de binário. Baixa o arquivo via URL pública, compara SHA-256 com `assets[].digest` do GitHub Release mais recente. |
| `redirectChain` | DNS hijack / Worker comprometido. Segue 302s manualmente, valida que todo hop pertence a uma whitelist de hosts. |
| `contentSentinel` | Defacement. Procura strings/regex obrigatórias no HTML e padrões proibidos comuns (`hacked by`, eval em script inline, etc.). |
| `performance` | Latência acima de threshold ou status != 200. Multi-URL. |

Cada check é uma factory function (`createIntegrityCheck(name, config)`, etc.) que retorna um objeto `Check`. Você pode instanciar múltiplas vezes com configs diferentes.

## Estrutura

```
src/
  index.ts                ← entry point (handler `scheduled` + `fetch` pra debug)
  runner.ts               ← orquestra checks em paralelo, captura exceções
  types.ts                ← Check, CheckResult, Severity, CheckContext
  reporters/
    discord.ts            ← POST pro webhook quando algum check ≠ 'ok'
  checks/
    integrity.ts
    redirectChain.ts
    contentSentinel.ts
    performance.ts
examples/
  sonda/                  ← exemplo completo (landing + worker + binário)
    config.ts
    wrangler.example.toml
    README.md
wrangler.example.toml     ← template — copie pra wrangler.toml (gitignored)
```

## Setup

```bash
git clone https://github.com/<seu-usuario>/site-sentinel
cd site-sentinel
npm install
cp wrangler.example.toml wrangler.toml
wrangler login
wrangler secret put DISCORD_WEBHOOK_URL   # cole o webhook do canal de alerts
npm run deploy
```

Sem nenhum app registrado, o Worker sobe mas não monitora nada (logs ficam em silêncio). Veja a próxima seção pra adicionar um.

## Adicionar um app

1. **Crie a config**, copiando [`examples/sonda/config.ts`](./examples/sonda/config.ts) como referência:

    ```ts
    // src/configs/myapp.ts (ou onde preferir)
    import type { Check } from '../types.ts';
    import type { Env } from '../index.ts';
    import { createPerformanceCheck } from '../checks/performance.ts';
    import { createContentSentinelCheck } from '../checks/contentSentinel.ts';

    export interface MyAppEnv extends Env {
        MYAPP_URL: string;
    }

    export function buildMyAppChecks(env: MyAppEnv, cron: string): Check[] {
        return [
            createPerformanceCheck('myapp.performance', [
                { url: env.MYAPP_URL, warnMs: 2500, criticalMs: 8000 },
            ]),
            createContentSentinelCheck('myapp.defacement', {
                url: env.MYAPP_URL,
                mustContain: ['MyApp', 'mailto:contact@myapp.com'],
            }),
        ];
    }
    ```

2. **Registre no `src/index.ts`**:

    ```ts
    import { buildMyAppChecks } from './configs/myapp.ts';

    const APPS: AppConfig[] = [
        { name: 'myapp', buildChecks: buildMyAppChecks },
    ];
    ```

3. **Adicione as vars** em `wrangler.toml > [vars]`.

4. `npm run deploy`.

## Cron split (leve vs pesado)

Checks que fazem só HEAD/GET pequeno (performance, redirect chain, content sentinel) rodam em todo tick `*/5 * * * *`. Checks que baixam corpos grandes (`integrity` baixa o binário inteiro) devem rodar menos — adicione o cron `0 * * * *` e filtre dentro do seu `buildChecks`:

```ts
export function buildMyAppChecks(env: MyAppEnv, cron: string): Check[] {
    const checks: Check[] = [/* leves */];

    if (cron === '0 * * * *') {
        checks.push(createIntegrityCheck('myapp.integrity', {/*…*/}));
    }

    return checks;
}
```

## Local dev

```bash
npm run typecheck         # tsc --noEmit
npm test                  # vitest (vazio por enquanto)
wrangler dev              # roda local em http://localhost:8787
                          # dispare manual: curl 'http://localhost:8787/run?cron=*/5+*+*+*+*'
```

## Custos

Free tier do Cloudflare Workers: 100k requests/dia, 10ms CPU/request (cron usa CPU-as-needed pra free, paid tier libera 30s). Com `*/5` (288 ticks/dia) + 4 checks fazendo 1-2 fetches cada → ~2300 requests/dia. Margem confortável.

Integrity baixa um payload grande (ex.: 2.5 MB) — esse é o gargalo de CPU/memória, não de quota. Roda horário (24 ticks/dia) e cabe nos 128 MB de memória do Worker.

## Decisões / quirks

-   **Sem deduplicação de alertas**: cada cron tick que falha dispara webhook. Propositadamente — prefiro alerta repetido a alerta perdido. Se virar ruído, KV pra armazenar `last_alerted_at` por check.
-   **Sem histórico/dashboard**: se quiser séries temporais, plugue Cloudflare Analytics Engine ou um D1 reporter. Por design, Discord webhook é o caso mínimo viável.
-   **`fetch` segue redirects por default**; checks que precisam observar a chain (`redirectChain`) passam `redirect: 'manual'`. Cuidado ao adicionar checks novos.
-   **GitHub API sem token**: 60 req/h por IP da edge. Integrity roda 1×/h, ok. Se adicionar mais checks que batem na API, considere `wrangler secret put GITHUB_TOKEN`.

## Licença

MIT (ver [LICENSE](./LICENSE)).
