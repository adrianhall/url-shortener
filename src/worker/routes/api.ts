/**
 * The API Router
 */
import { Hono } from 'hono';

import type { AppBindings } from '../bindings';

import { environment } from '../lib/utils';

export const apiRouter = new Hono<AppBindings>();

apiRouter.get('/version', (ctx) =>
  ctx.json({
    environment,
  }),
);

// TODO: Add Admin routes to this.
