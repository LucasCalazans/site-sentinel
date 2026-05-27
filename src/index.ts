// Worker entry point. fetch → REST API. scheduled → roda checks habilitados
// no D1 + atualiza snapshots de integrações.

import type { Env } from './api/env.ts';
import { handleRequest } from './api/handler.ts';
import { runScheduled } from './runtime/scheduled.ts';

export type { Env } from './api/env.ts';

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        return handleRequest(req, env);
    },

    async scheduled(
        event: ScheduledController,
        env: Env,
        ctx: ExecutionContext,
    ): Promise<void> {
        ctx.waitUntil(runScheduled(env, event.cron));
    },
};
