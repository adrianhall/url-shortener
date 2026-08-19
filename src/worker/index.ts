import { Hono } from 'hono';

import { resolveLinkRedirect } from './routes/links';

const app = new Hono<{ Bindings: Env }>();
const notFoundStatus = 404;

app.get('/l/:linkId', (context) =>
  resolveLinkRedirect(context.env.LINKS, context.req.param('linkId')),
);

app.notFound((context) => context.text('Not found', notFoundStatus));

export default app;
