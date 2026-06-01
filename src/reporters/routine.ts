import type { CheckResult } from '../types.ts';

// Dispara uma rotina Claude Code (claude.ai/code/routines) via API de fire.
// Canal de notificação event-driven: quando um check TRANSICIONA pra falha,
// o scheduled handler chama isto pra acordar a rotina que investiga e abre PR.
//
// Auth é um token POR-ROTINA (prefixo `sk-ant-oat01-`), gerado uma vez na UI
// da rotina (Add trigger → API → Generate token), NÃO a API key da conta.
// Docs: https://platform.claude.com/docs/en/api/claude-code/routines-fire

// Versão dated do beta header. Breaking changes saem em headers novos; as duas
// versões anteriores continuam válidas, então há margem pra migrar.
const BETA_HEADER = 'experimental-cc-routine-2026-04-01';
const API_VERSION = '2023-06-01';
const MAX_TEXT = 65_536; // limite do campo `text` na API.

export interface FireResult {
    status: number;
    sessionUrl?: string;
}

// Monta o contexto freeform passado pra rotina junto do prompt salvo dela.
// Não é parseado pela API — vira string literal no input da sessão.
//
// IMPORTANTE: o ambiente remoto da rotina NÃO tem acesso de rede ao worker
// (host fora da allowlist de saída). Então este payload é a ÚNICA fonte de
// verdade que a rotina recebe — incluímos message + details de cada check
// pra ela conseguir agir sem refazer o /run.
export function buildFireText(items: Array<{ app: string; result: CheckResult }>): string {
    const blocks = items.map(({ app, result }) => {
        const head = `### [${result.severity.toUpperCase()}] ${app} / ${result.name}\n${result.message}`;
        const details = result.details
            ? `\ndetails: ${JSON.stringify(result.details)}`
            : '';
        return head + details;
    });
    const text =
        `O site-sentinel detectou ${items.length} check(s) entrando em falha agora. ` +
        `ESTES SÃO OS DADOS REAIS E AUTORITATIVOS — use exclusivamente o que está abaixo ` +
        `(o ambiente remoto não acessa o monitor; não tente buscar /run e não invente outros checks):\n\n` +
        blocks.join('\n\n');
    return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT - 3) + '...' : text;
}

export async function fireRoutine(
    fireUrl: string,
    token: string,
    text: string,
): Promise<FireResult> {
    const res = await fetch(fireUrl, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'anthropic-version': API_VERSION,
            'anthropic-beta': BETA_HEADER,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '<unreadable>');
        throw new Error(`routine fire returned ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = (await res.json().catch(() => ({}))) as {
        claude_code_session_url?: string;
    };
    return { status: res.status, sessionUrl: data.claude_code_session_url };
}
