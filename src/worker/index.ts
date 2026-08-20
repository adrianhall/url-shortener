import {
  cloudflareLogger,
  cloudflareAccess,
  problemDetailsErrorHandler,
  notFoundHandler,
} from '@adrianhall/cloudflare-toolkit/hono';
/**
 * @file entry point for the Cloudflare Worker
 */
import { Hono } from 'hono';

import type { AppBindings } from './bindings';

import { isDevelopment } from './lib/utils';
import { accessPolicies } from './path-policies';
import { apiRouter, linkRedirector } from './routes';

const app = new Hono<AppBindings>();

// Adds the c.var.LOGGER as a universal logger
app.use(cloudflareLogger());

// Augments the context variables with the identity of the user
app.use(
  cloudflareAccess({
    policies: accessPolicies,
    defaultAction: 'bypass',
    enableDevTokens: isDevelopment(),
  }),
);

// Wires in the '/api' routes
app.route('/api', apiRouter);

// Wires in the '/l' routes
app.route('/l', linkRedirector);

// Turns thrown errors into RFC-9457 problem details HTTP responses
app.onError(problemDetailsErrorHandler({ includeStack: isDevelopment() }));

// Returns 404 errors as RFC-9457 problem details HTTP responses
app.notFound(notFoundHandler());

export default app;
