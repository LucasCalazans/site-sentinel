// Helpers compartilhados pelos testes que tocam D1. Centraliza setup do banco
// pra cada arquivo de teste não duplicar a lógica.

import { applyD1Migrations, env } from 'cloudflare:test';

declare module 'cloudflare:test' {
    interface ProvidedEnv {
        DB: D1Database;
        JWT_SIGNING_KEY: string;
        ADMIN_PASSWORD_HASH: string;
        DISCORD_WEBHOOK_URL: string;
        CF_API_TOKEN: string;
        CF_ACCOUNT_ID: string;
        CF_ZONE_ID: string;
        GITHUB_TOKEN: string;
        GITHUB_REPOS: string;
        ALLOWED_ORIGINS: string;
        JWT_EXPIRY_DAYS: string;
        TEST_MIGRATIONS: D1Migration[];
    }
}

let migrationsApplied = false;

// Aplica migrations 1x na primeira chamada. Subsequentes são no-op porque o
// applyD1Migrations cria a tabela d1_migrations e skip o que já rodou.
export async function ensureSchema(): Promise<D1Database> {
    if (!migrationsApplied) {
        await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
        migrationsApplied = true;
    }
    return env.DB;
}

// Limpa todas as tabelas de dados sem dropar schema. Use em beforeEach pra
// isolar testes. Mantém row de integrations seed do 0004 — testes que
// precisam limpar isso fazem por conta.
export async function resetDataTables(db: D1Database): Promise<void> {
    // Ordem importa por FK. alerts → runs → checks. snapshots → integrations.
    await db.batch([
        db.prepare('DELETE FROM alerts'),
        db.prepare('DELETE FROM runs'),
        db.prepare('DELETE FROM sync_snapshots'),
        db.prepare('DELETE FROM checks'),
        db.prepare('DELETE FROM check_state'),
        // Reset sequence pra IDs determinísticos entre testes.
        db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('alerts','runs','sync_snapshots','checks')"),
    ]);
}

// Limpa também integrations (pra testes que precisam estado virgem total).
export async function resetAllTables(db: D1Database): Promise<void> {
    await resetDataTables(db);
    await db.batch([
        db.prepare('DELETE FROM integrations'),
        db.prepare("DELETE FROM sqlite_sequence WHERE name = 'integrations'"),
    ]);
}
