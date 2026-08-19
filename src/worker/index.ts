import { Hono } from 'hono';
import { resolveLinkRedirect } from './routes/links';

const app = new Hono<{ Bindings: Env }>();

app.get('/l/:linkId', (context) =>
  resolveLinkRedirect(context.env.LINKS, context.req.param('linkId')),
);

app.notFound((context) => context.text('Not found', 404));

export default app;
