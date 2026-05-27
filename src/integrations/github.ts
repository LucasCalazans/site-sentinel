// Wrappers REST da GitHub API. Todos retornam shapes "wire" projetados pro
// dashboard — campos comuns que cabem em cards.
//
// Auth: Bearer token (fine-grained PAT). Permissions necessárias:
//   Contents: Read         pra repo metadata + releases
//   Actions: Read          pra workflow runs
//   Issues: Read           pra open issues
//   Pull requests: Read    pra open PRs
//   Metadata: Read         (implícito pelos demais)

const BASE = 'https://api.github.com';
const USER_AGENT = 'site-sentinel/0.2';

async function ghFetch<T>(
    path: string,
    token: string,
    fetchImpl: typeof fetch = globalThis.fetch,
): Promise<T> {
    const res = await fetchImpl(`${BASE}${path}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': USER_AGENT,
            'X-GitHub-Api-Version': '2022-11-28',
        },
    });
    if (!res.ok) {
        let detail = '';
        try {
            const body = (await res.json()) as { message?: string };
            detail = body.message ?? '';
        } catch {
            /* ignore */
        }
        throw new Error(`GH ${path}: HTTP ${res.status}${detail ? ` — ${detail}` : ''}`);
    }
    return (await res.json()) as T;
}

// ---------- Repo metadata -------------------------------------------------

export interface RepoMetaSummary {
    full_name: string;
    description: string | null;
    stars: number;
    forks: number;
    open_issues: number;
    default_branch: string;
    pushed_at: string | null;
    visibility: string;
    html_url: string;
}

interface CfRepoMeta {
    full_name: string;
    description: string | null;
    stargazers_count?: number;
    forks_count?: number;
    open_issues_count?: number;
    default_branch?: string;
    pushed_at?: string;
    visibility?: string;
    html_url: string;
}

export async function getRepoMeta(
    repo: string,
    token: string,
    fetchImpl: typeof fetch = globalThis.fetch,
): Promise<RepoMetaSummary> {
    const r = await ghFetch<CfRepoMeta>(`/repos/${repo}`, token, fetchImpl);
    return {
        full_name: r.full_name,
        description: r.description,
        stars: r.stargazers_count ?? 0,
        forks: r.forks_count ?? 0,
        open_issues: r.open_issues_count ?? 0,
        default_branch: r.default_branch ?? 'main',
        pushed_at: r.pushed_at ?? null,
        visibility: r.visibility ?? 'private',
        html_url: r.html_url,
    };
}

// ---------- Releases ------------------------------------------------------

export interface ReleaseAssetSummary {
    name: string;
    size: number;
    download_count: number;
    digest: string | null;
    browser_download_url: string;
}

export interface ReleaseSummary {
    tag_name: string;
    name: string;
    published_at: string | null;
    prerelease: boolean;
    html_url: string;
    assets: ReleaseAssetSummary[];
}

interface CfRelease {
    tag_name: string;
    name?: string;
    published_at?: string;
    prerelease?: boolean;
    html_url: string;
    assets?: Array<{
        name: string;
        size?: number;
        download_count?: number;
        digest?: string;
        browser_download_url: string;
    }>;
}

export async function getLatestRelease(
    repo: string,
    token: string,
    fetchImpl: typeof fetch = globalThis.fetch,
): Promise<ReleaseSummary | null> {
    try {
        const r = await ghFetch<CfRelease>(
            `/repos/${repo}/releases/latest`,
            token,
            fetchImpl,
        );
        return releaseToWire(r);
    } catch (err) {
        // Repo pode não ter release publicada (404). Diferencia 404 de outros erros.
        if ((err as Error).message.includes('HTTP 404')) return null;
        throw err;
    }
}

function releaseToWire(r: CfRelease): ReleaseSummary {
    return {
        tag_name: r.tag_name,
        name: r.name ?? r.tag_name,
        published_at: r.published_at ?? null,
        prerelease: r.prerelease ?? false,
        html_url: r.html_url,
        assets:
            r.assets?.map((a) => ({
                name: a.name,
                size: a.size ?? 0,
                download_count: a.download_count ?? 0,
                digest: a.digest ?? null,
                browser_download_url: a.browser_download_url,
            })) ?? [],
    };
}

// ---------- Actions runs --------------------------------------------------

export interface ActionsRunSummary {
    id: number;
    name: string;
    head_branch: string;
    head_sha: string;
    event: string;
    status: string;
    conclusion: string | null;
    workflow_id: number;
    run_number: number;
    created_at: string;
    updated_at: string;
    html_url: string;
}

interface CfActionsRunsResponse {
    total_count: number;
    workflow_runs: Array<{
        id: number;
        name?: string;
        head_branch?: string;
        head_sha?: string;
        event?: string;
        status?: string;
        conclusion?: string;
        workflow_id: number;
        run_number?: number;
        created_at?: string;
        updated_at?: string;
        html_url: string;
    }>;
}

export async function getActionsRuns(
    repo: string,
    token: string,
    fetchImpl: typeof fetch = globalThis.fetch,
    perPage = 10,
): Promise<ActionsRunSummary[]> {
    const r = await ghFetch<CfActionsRunsResponse>(
        `/repos/${repo}/actions/runs?per_page=${perPage}`,
        token,
        fetchImpl,
    );
    return r.workflow_runs.map((w) => ({
        id: w.id,
        name: w.name ?? '',
        head_branch: w.head_branch ?? '',
        head_sha: w.head_sha ?? '',
        event: w.event ?? '',
        status: w.status ?? '',
        conclusion: w.conclusion ?? null,
        workflow_id: w.workflow_id,
        run_number: w.run_number ?? 0,
        created_at: w.created_at ?? '',
        updated_at: w.updated_at ?? '',
        html_url: w.html_url,
    }));
}

// ---------- Open issues ---------------------------------------------------

export interface IssueSummary {
    number: number;
    title: string;
    state: string;
    created_at: string;
    updated_at: string;
    html_url: string;
    user: string;
    labels: string[];
    is_pull_request: boolean;
}

interface CfIssue {
    number: number;
    title: string;
    state: string;
    created_at: string;
    updated_at: string;
    html_url: string;
    user: { login: string } | null;
    labels: Array<{ name: string } | string>;
    pull_request?: unknown;
}

export async function getOpenIssues(
    repo: string,
    token: string,
    fetchImpl: typeof fetch = globalThis.fetch,
    perPage = 20,
): Promise<IssueSummary[]> {
    const r = await ghFetch<CfIssue[]>(
        `/repos/${repo}/issues?state=open&per_page=${perPage}`,
        token,
        fetchImpl,
    );
    return r.map((i) => ({
        number: i.number,
        title: i.title,
        state: i.state,
        created_at: i.created_at,
        updated_at: i.updated_at,
        html_url: i.html_url,
        user: i.user?.login ?? 'unknown',
        labels: i.labels.map((l) =>
            typeof l === 'string' ? l : l.name,
        ),
        is_pull_request: i.pull_request !== undefined,
    }));
}
