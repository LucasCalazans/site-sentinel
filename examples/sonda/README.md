# Exemplo: monitorando o projeto Sonda

Caso real usado pra desenvolver/validar o site-sentinel. Monitora a landing estática (`sonda-recover.com`), o Worker de licenciamento (`api.sonda-recover.com`) e o binário Windows distribuído via GitHub Releases.

## Checks ativados

| Check | Frequência | Detecta |
|---|---|---|
| `sonda.performance` | a cada 5 min | latência ou status != 200 nas 4 URLs (3 idiomas da landing + health do Worker) |
| `sonda.download_redirect_chain` | a cada 5 min | DNS hijack / Worker comprometido — segue o redirect do download e valida que todo hop está numa whitelist (`sonda-recover.com → api.sonda-recover.com → github.com → *.githubusercontent.com`) |
| `sonda.landing_defacement` | a cada 5 min | desaparecimento de strings obrigatórias do HTML da home + padrões de defacement comum |
| `sonda.security_txt` | a cada 5 min | sumiço de `/.well-known/security.txt` (mailto + canonical) |
| `sonda.download_integrity` | a cada 1 h | troca de binário — baixa o `.exe` inteiro via URL pública e compara SHA-256 com `assets[].digest` do GitHub Release mais recente |

## Como ativar

1. Cole o conteúdo de [`wrangler.example.toml`](./wrangler.example.toml) no seu `wrangler.toml` na raiz.
2. Em `src/index.ts`, registre o app:

    ```ts
    import { buildSondaChecks } from '../examples/sonda/config.ts';

    const APPS: AppConfig[] = [
        { name: 'sonda', buildChecks: buildSondaChecks },
    ];
    ```

3. `npm run secret put DISCORD_WEBHOOK_URL` (cole o webhook do canal de alerts).
4. `npm run secret put GITHUB_TOKEN` — opcional mas **recomendado** se `sonda.download_integrity` está ativo. Sem token, a chamada a `api.github.com` esbarra no limite de 60 req/h por IP, que Workers compartilham entre tenants e estoura mesmo com 1 req/h nossa. Use um fine-grained PAT com permissão `Contents: Read` apenas no repo de releases (read-only).
5. `npm run deploy`.

## Adaptando pro seu projeto

Use esse arquivo como template:

-   troque `SONDA_*` pelas vars do seu app (mantenha o prefixo único pra não colidir);
-   ajuste `allowedHosts` do redirect chain pros hostnames que o seu download de fato visita;
-   substitua os sentinels do `landing_defacement` por strings que existam no seu HTML e não mudem em deploys normais (URLs de mailto, links de footer, etc. funcionam bem — texto de marketing muda demais).
