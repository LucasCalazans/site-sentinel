import {
    defineWorkersConfig,
    readD1Migrations,
} from '@cloudflare/vitest-pool-workers/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));

// Pool-workers executa cada teste dentro do workerd runtime, expondo
// bindings reais (D1, KV, secrets) via cloudflare:test.env. Isso permite
// testar handlers/scheduled de ponta-a-ponta sem mockar D1.
export default defineWorkersConfig({
    test: {
        poolOptions: {
            workers: {
                wrangler: { configPath: './wrangler.toml' },
                miniflare: {
                    bindings: {
                        // Secrets fake — substitui .dev.vars em testes.
                        JWT_SIGNING_KEY:
                            'test-jwt-signing-key-do-nao-use-em-prod-1234567890abcdef',
                        // Placeholder — testes de auth chamam handlers
                        // diretamente passando env mock com hash gerado em
                        // runtime via hashPassword(). Isso evita ter que
                        // pré-computar e hardcodar o hash aqui.
                        ADMIN_PASSWORD_HASH: 'placeholder-not-used-by-tests',
                        DISCORD_WEBHOOK_URL:
                            'https://discord.com/api/webhooks/0/test-webhook',
                        CF_API_TOKEN: 'test-cf-token',
                        GITHUB_TOKEN: 'test-gh-token',
                        // Migrations pré-carregadas pra applyD1Migrations()
                        // em test-helpers.ts.
                        TEST_MIGRATIONS: migrations,
                    },
                },
            },
        },
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: [
                'src/**/*.test.ts',
                'src/**/*.spec.ts',
                'src/**/types.ts',
                'src/test-helpers.ts',
                'src/index.ts',
            ],
            reporter: ['text', 'html', 'lcov'],
            thresholds: {
                statements: 90,
                branches: 90,
                functions: 90,
                lines: 90,
            },
        },
    },
});
