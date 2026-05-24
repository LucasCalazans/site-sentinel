import type { CheckResult, Severity } from '../types.ts';

const COLOR: Record<Severity, number> = {
    ok: 0x2ecc71,
    warn: 0xf1c40f,
    critical: 0xe74c3c,
};

// Discord embed limits: até 10 embeds por message, 1024 chars por field.value,
// 4096 chars por description. Truncamos com folga.
const MAX_EMBEDS = 10;
const MAX_FIELD_VALUE = 900;
const MAX_DESC = 2000;

function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max - 3) + '...' : s;
}

function formatField(value: unknown): string {
    const json = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return '```' + truncate(json, MAX_FIELD_VALUE - 7) + '```';
}

function embedFor(r: CheckResult, app: string) {
    const fields = r.details
        ? Object.entries(r.details).map(([name, value]) => ({
              name: truncate(name, 256),
              value: formatField(value),
              inline: false,
          }))
        : [];

    return {
        title: `[${r.severity.toUpperCase()}] ${app} / ${r.name}`,
        description: truncate(r.message, MAX_DESC),
        color: COLOR[r.severity],
        fields,
        footer: { text: `duração ${r.durationMs}ms` },
        timestamp: new Date().toISOString(),
    };
}

export async function postToDiscord(
    webhookUrl: string,
    app: string,
    results: CheckResult[],
): Promise<void> {
    const failing = results.filter((r) => r.severity !== 'ok');
    if (failing.length === 0) return;

    const embeds = failing.slice(0, MAX_EMBEDS).map((r) => embedFor(r, app));
    const overflow = Math.max(0, failing.length - MAX_EMBEDS);
    const content =
        `**site-sentinel** — ${failing.length} check(s) falhando em \`${app}\`` +
        (overflow > 0 ? ` (+${overflow} omitidos)` : '');

    const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, embeds }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '<unreadable>');
        throw new Error(`Discord webhook returned ${res.status}: ${truncate(body, 300)}`);
    }
}
