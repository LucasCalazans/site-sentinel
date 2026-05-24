import type { Check } from '../types.ts';

export interface IntegrityConfig {
    // URL pública de download (passa pelos redirects esperados até o asset).
    downloadUrl: string;
    // Repo "owner/repo" — busca latest release pra pegar o digest do asset.
    releasesRepo: string;
    assetName: string;
    // Opcional. Sem token: 60 req/h por IP do edge — suficiente pra cron horário.
    githubToken?: string;
}

interface GitHubAsset {
    name: string;
    digest?: string;
}
interface GitHubRelease {
    tag_name?: string;
    assets?: GitHubAsset[];
}

function bufToHex(buf: ArrayBuffer): string {
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function createIntegrityCheck(name: string, cfg: IntegrityConfig): Check {
    return {
        name,
        async run(ctx) {
            const t0 = ctx.now();

            const apiUrl = `https://api.github.com/repos/${cfg.releasesRepo}/releases/latest`;
            const apiHeaders: Record<string, string> = {
                'User-Agent': 'site-sentinel/0.1',
                Accept: 'application/vnd.github+json',
            };
            if (cfg.githubToken) apiHeaders['Authorization'] = `Bearer ${cfg.githubToken}`;

            const releaseRes = await ctx.fetch(apiUrl, { headers: apiHeaders });
            if (!releaseRes.ok) {
                return {
                    name,
                    severity: 'critical',
                    message: `GitHub API ${apiUrl} retornou ${releaseRes.status}`,
                    durationMs: ctx.now() - t0,
                };
            }
            const release = (await releaseRes.json()) as GitHubRelease;
            const asset = release.assets?.find((a) => a.name === cfg.assetName);
            if (!asset) {
                return {
                    name,
                    severity: 'critical',
                    message: `asset ${cfg.assetName} não encontrado no release ${release.tag_name ?? '?'}`,
                    details: { availableAssets: release.assets?.map((a) => a.name) },
                    durationMs: ctx.now() - t0,
                };
            }
            if (!asset.digest || !asset.digest.startsWith('sha256:')) {
                return {
                    name,
                    severity: 'warn',
                    message: `asset ${cfg.assetName} sem digest sha256 no GitHub (digest=${asset.digest ?? 'null'}) — não é possível verificar integridade`,
                    durationMs: ctx.now() - t0,
                };
            }
            const expected = asset.digest.slice('sha256:'.length).toLowerCase();

            const downloadRes = await ctx.fetch(cfg.downloadUrl, { redirect: 'follow' });
            if (!downloadRes.ok) {
                return {
                    name,
                    severity: 'critical',
                    message: `download ${cfg.downloadUrl} retornou ${downloadRes.status}`,
                    durationMs: ctx.now() - t0,
                };
            }
            const bytes = await downloadRes.arrayBuffer();
            const actual = bufToHex(await crypto.subtle.digest('SHA-256', bytes));

            if (actual !== expected) {
                return {
                    name,
                    severity: 'critical',
                    message: `SHA-256 do binário entregue diverge do release ${release.tag_name ?? '?'} — POSSÍVEL TROCA DE BINÁRIO`,
                    details: {
                        expected,
                        actual,
                        release: release.tag_name,
                        downloadUrl: cfg.downloadUrl,
                        sizeBytes: bytes.byteLength,
                    },
                    durationMs: ctx.now() - t0,
                };
            }

            return {
                name,
                severity: 'ok',
                message: `integrity OK — SHA-256 bate com release ${release.tag_name ?? '?'} (${bytes.byteLength} bytes)`,
                details: { release: release.tag_name, sizeBytes: bytes.byteLength, expected },
                durationMs: ctx.now() - t0,
            };
        },
    };
}
