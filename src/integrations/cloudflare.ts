// Wrappers REST da Cloudflare API. Todos retornam shapes "wire" prontos pra
// o dashboard consumir — projeção dos campos relevantes, não a resposta crua
// da CF (que é grande e instável).
//
// Auth: Bearer token. Permissions necessárias:
//   Account → Pages: Read
//   Account → Workers Scripts: Read
//   Account → D1: Read
//   Account → Account Analytics: Read
//   Zone → Analytics: Read
//
// Erros: a CF responde sempre {success: boolean, errors: [], result: ...} —
// normalizamos pra throw em !success com a mensagem do primeiro error.

const BASE = 'https://api.cloudflare.com/client/v4';

interface CfEnvelope<T> {
    success: boolean;
    errors?: Array<{ code: number; message: string }>;
    messages?: Array<{ code: number; message: string }>;
    result: T;
    result_info?: {
        page: number;
        per_page: number;
        total_pages?: number;
        count: number;
        total_count?: number;
    };
}

async function cfFetch<T>(
    path: string,
    token: string,
    fetchImpl: typeof fetch = globalThis.fetch,
): Promise<T> {
    const res = await fetchImpl(`${BASE}${path}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });
    let envelope: CfEnvelope<T>;
    try {
        envelope = (await res.json()) as CfEnvelope<T>;
    } catch (err) {
        throw new Error(`CF ${path}: response não-JSON (HTTP ${res.status})`);
    }
    if (!envelope.success) {
        const msg = envelope.errors?.[0]?.message ?? `HTTP ${res.status}`;
        throw new Error(`CF ${path}: ${msg}`);
    }
    return envelope.result;
}

// ---------- Pages ---------------------------------------------------------

export interface PagesProjectSummary {
    name: string;
    domains: string[];
    created_on: string;
    production_branch: string;
    latest_deployment?: PagesDeploymentSummary;
}

export interface PagesDeploymentSummary {
    id: string;
    short_id: string;
    environment: string;
    url: string;
    created_on: string;
    deployment_trigger?: {
        type: string;
        metadata?: { branch?: string; commit_hash?: string; commit_message?: string };
    };
    latest_stage?: { name: string; status: string };
}

interface CfPagesProject {
    name: string;
    domains?: string[];
    created_on?: string;
    production_branch?: string;
    latest_deployment?: CfPagesDeployment;
}

interface CfPagesDeployment {
    id: string;
    short_id?: string;
    environment?: string;
    url?: string;
    created_on?: string;
    deployment_trigger?: CfPagesProject['latest_deployment'] extends infer X
        ? X extends { deployment_trigger?: infer T }
            ? T
            : unknown
        : unknown;
    latest_stage?: { name?: string; status?: string };
}

function projectToWire(p: CfPagesProject): PagesProjectSummary {
    return {
        name: p.name,
        domains: p.domains ?? [],
        created_on: p.created_on ?? '',
        production_branch: p.production_branch ?? 'main',
        latest_deployment: p.latest_deployment
            ? deploymentToWire(p.latest_deployment)
            : undefined,
    };
}

function deploymentToWire(d: CfPagesDeployment): PagesDeploymentSummary {
    return {
        id: d.id,
        short_id: d.short_id ?? d.id.slice(0, 8),
        environment: d.environment ?? 'production',
        url: d.url ?? '',
        created_on: d.created_on ?? '',
        deployment_trigger: d.deployment_trigger as PagesDeploymentSummary['deployment_trigger'],
        latest_stage: d.latest_stage
            ? {
                  name: d.latest_stage.name ?? '',
                  status: d.latest_stage.status ?? '',
              }
            : undefined,
    };
}

export async function listPagesProjects(
    accountId: string,
    token: string,
    fetchImpl: typeof fetch = globalThis.fetch,
): Promise<PagesProjectSummary[]> {
    const result = await cfFetch<CfPagesProject[]>(
        `/accounts/${accountId}/pages/projects`,
        token,
        fetchImpl,
    );
    return result.map(projectToWire);
}

export async function listPagesDeployments(
    accountId: string,
    projectName: string,
    token: string,
    fetchImpl: typeof fetch = globalThis.fetch,
): Promise<PagesDeploymentSummary[]> {
    const result = await cfFetch<CfPagesDeployment[]>(
        `/accounts/${accountId}/pages/projects/${projectName}/deployments`,
        token,
        fetchImpl,
    );
    return result.map(deploymentToWire);
}

// ---------- Workers Scripts -----------------------------------------------

export interface WorkerScriptSummary {
    id: string;
    created_on: string;
    modified_on: string;
    handlers: string[];
    routes_count: number;
}

interface CfWorkerScript {
    id: string;
    created_on?: string;
    modified_on?: string;
    handlers?: string[];
    routes?: unknown[];
}

export async function listWorkers(
    accountId: string,
    token: string,
    fetchImpl: typeof fetch = globalThis.fetch,
): Promise<WorkerScriptSummary[]> {
    const result = await cfFetch<CfWorkerScript[]>(
        `/accounts/${accountId}/workers/scripts`,
        token,
        fetchImpl,
    );
    return result.map((w) => ({
        id: w.id,
        created_on: w.created_on ?? '',
        modified_on: w.modified_on ?? '',
        handlers: w.handlers ?? [],
        routes_count: Array.isArray(w.routes) ? w.routes.length : 0,
    }));
}

// ---------- D1 ------------------------------------------------------------

export interface D1DatabaseSummary {
    uuid: string;
    name: string;
    version: string;
    created_at: string;
    num_tables?: number;
    file_size?: number;
}

interface CfD1Database {
    uuid: string;
    name: string;
    version?: string;
    created_at?: string;
    num_tables?: number;
    file_size?: number;
}

export async function listD1Databases(
    accountId: string,
    token: string,
    fetchImpl: typeof fetch = globalThis.fetch,
): Promise<D1DatabaseSummary[]> {
    const result = await cfFetch<CfD1Database[]>(
        `/accounts/${accountId}/d1/database`,
        token,
        fetchImpl,
    );
    return result.map((d) => ({
        uuid: d.uuid,
        name: d.name,
        version: d.version ?? '',
        created_at: d.created_at ?? '',
        num_tables: d.num_tables,
        file_size: d.file_size,
    }));
}

export async function getD1Database(
    accountId: string,
    dbId: string,
    token: string,
    fetchImpl: typeof fetch = globalThis.fetch,
): Promise<D1DatabaseSummary> {
    const result = await cfFetch<CfD1Database>(
        `/accounts/${accountId}/d1/database/${dbId}`,
        token,
        fetchImpl,
    );
    return {
        uuid: result.uuid,
        name: result.name,
        version: result.version ?? '',
        created_at: result.created_at ?? '',
        num_tables: result.num_tables,
        file_size: result.file_size,
    };
}

// ---------- Zone analytics ------------------------------------------------

export interface ZoneAnalyticsSummary {
    sinceIso: string;
    untilIso: string;
    requests: { all: number; cached: number; uncached: number };
    bandwidth: { all: number; cached: number };
    threats: { all: number };
    pageviews: { all: number };
    uniques: { all: number };
}

interface CfZoneAnalyticsResponse {
    totals: {
        since: string;
        until: string;
        requests?: { all?: number; cached?: number; uncached?: number };
        bandwidth?: { all?: number; cached?: number };
        threats?: { all?: number };
        pageviews?: { all?: number };
        uniques?: { all?: number };
    };
}

export async function getZoneAnalytics(
    zoneId: string,
    sinceMinutes: number,
    token: string,
    fetchImpl: typeof fetch = globalThis.fetch,
): Promise<ZoneAnalyticsSummary> {
    // `since=-1440` = últimas 24h em minutos. CF aceita -30, -360, -720, -1440, -10080.
    const since = -Math.abs(sinceMinutes);
    const result = await cfFetch<CfZoneAnalyticsResponse>(
        `/zones/${zoneId}/analytics/dashboard?since=${since}&continuous=true`,
        token,
        fetchImpl,
    );
    const t = result.totals;
    return {
        sinceIso: t.since,
        untilIso: t.until,
        requests: {
            all: t.requests?.all ?? 0,
            cached: t.requests?.cached ?? 0,
            uncached: t.requests?.uncached ?? 0,
        },
        bandwidth: { all: t.bandwidth?.all ?? 0, cached: t.bandwidth?.cached ?? 0 },
        threats: { all: t.threats?.all ?? 0 },
        pageviews: { all: t.pageviews?.all ?? 0 },
        uniques: { all: t.uniques?.all ?? 0 },
    };
}
