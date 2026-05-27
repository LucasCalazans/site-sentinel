#!/usr/bin/env bash
# Setup do site-sentinel pra rodar local. Faz:
#   1. Copia wrangler.example.toml → wrangler.toml (se ainda não existir)
#   2. Copia .dev.vars.example → .dev.vars (se ainda não existir)
#   3. npm install (backend)
#   4. npm install no dashboard/
#   5. Aplica migrations no D1 local (miniflare)
#
# Depois desse script, faltam só as chaves no .dev.vars (script avisa).
# Pra rodar:
#   Terminal 1: npm run dev        (Worker em http://localhost:8787)
#   Terminal 2: cd dashboard && npm run dev   (Dashboard em http://localhost:5173)

set -eu -o pipefail

cd "$(dirname "$0")/.."

red()   { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
blue()  { printf "\033[36m%s\033[0m\n" "$*"; }

blue "==> [1/5] wrangler.toml"
if [ -f wrangler.toml ]; then
    green "    já existe — pulando"
else
    cp wrangler.example.toml wrangler.toml
    green "    criado a partir do .example"
fi

blue "==> [2/5] .dev.vars"
if [ -f .dev.vars ]; then
    green "    já existe — pulando"
else
    cp .dev.vars.example .dev.vars
    green "    criado a partir do .example (preencha as chaves antes de rodar!)"
fi

blue "==> [3/5] npm install (backend)"
npm install --silent

blue "==> [4/5] npm install (dashboard)"
(cd dashboard && npm install --silent)

blue "==> [5/5] migrations no D1 local"
npm run db:migrate:local

echo
green "✓ Setup local pronto."
echo
echo "Próximos passos:"
echo "  1. Preencha .dev.vars com as chaves (veja .dev.vars.example)"
echo "  2. Gere o ADMIN_PASSWORD_HASH: npm run hash:password"
echo "  3. Rode o Worker: npm run dev"
echo "  4. (outro terminal) cd dashboard && npm run dev"
echo "  5. Abra http://localhost:5173"
