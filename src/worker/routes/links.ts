import { notFound } from '@adrianhall/cloudflare-toolkit';
/**
 * @file The Hono router for the '/l' endpoint
 */
import { Hono } from 'hono';

import type { AppBindings } from '../bindings';

import { validateLinkIdentity } from '../lib/validators';

/**
 * The Hono router for the link redirector
 */
export const linkRedirector = new Hono<AppBindings>();

const RedirectStatusCode = 302;

/*
 * HTTP Endpoint `GET /l/:linkId`
 * 302 Temporary Redirect, when link is available within the KV store
 * 404 Not Found, when the link is not available within the KV store
 * 422 Unprocessable Content, when the link is not valid
 */
linkRedirector.get('/:linkId', validateLinkIdentity(), async (context) => {
  const linkId = context.req.param('linkId');
  const destination = await context.env.LINKS.get(linkId);
  if (destination === null || destination === '') {
    throw notFound();
  }
  return Response.redirect(destination, RedirectStatusCode);
});
