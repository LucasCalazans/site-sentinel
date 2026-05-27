// Env compartilhado por todo o backend. Reflete wrangler.toml [vars] +
// .dev.vars (secrets). Single source-of-truth tipada — handlers recebem
// esse shape e o TS reclama se faltar binding.

export interface Env {
    DB: D1Database;
    // Secrets
    JWT_SIGNING_KEY: string;
    ADMIN_PASSWORD_HASH: string;
    DISCORD_WEBHOOK_URL: string;
    CF_API_TOKEN: string;
    GITHUB_TOKEN: string;
    // Vars (publicas, vivem no wrangler.toml)
    CF_ACCOUNT_ID: string;
    CF_ZONE_ID: string;
    GITHUB_REPOS: string;
    ALLOWED_ORIGINS: string;
    JWT_EXPIRY_DAYS: string;
}
