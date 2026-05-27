// Router minimal sem dependência. Converte path patterns tipo `/api/checks/:id`
// pra regex e roteia por (method, path). Suficiente pro escopo do site-sentinel.

import type { Env } from './env.ts';

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS';

export interface RouteContext {
    req: Request;
    env: Env;
    params: Record<string, string>;
    url: URL;
}

export type Handler = (ctx: RouteContext) => Promise<Response>;

interface Route {
    method: Method;
    pattern: RegExp;
    paramNames: string[];
    handler: Handler;
}

export class Router {
    private readonly routes: Route[] = [];

    on(method: Method, path: string, handler: Handler): this {
        const paramNames: string[] = [];
        const regexSource = path.replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, (m) => {
            paramNames.push(m.slice(1));
            return '([^/]+)';
        });
        const pattern = new RegExp(`^${regexSource}$`);
        this.routes.push({ method, pattern, paramNames, handler });
        return this;
    }

    async dispatch(req: Request, env: Env): Promise<Response | null> {
        const url = new URL(req.url);
        for (const route of this.routes) {
            if (route.method !== req.method) continue;
            const match = url.pathname.match(route.pattern);
            if (!match) continue;
            const params: Record<string, string> = {};
            for (let i = 0; i < route.paramNames.length; i++) {
                const name = route.paramNames[i];
                const value = match[i + 1];
                if (name && value !== undefined) {
                    params[name] = decodeURIComponent(value);
                }
            }
            return route.handler({ req, env, params, url });
        }
        return null;
    }
}
