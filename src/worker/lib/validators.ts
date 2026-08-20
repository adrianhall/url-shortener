import type { MiddlewareHandler } from 'hono';

import { notFound } from '@adrianhall/cloudflare-toolkit';
/**
 * @file Hono validation middleware for the valibot schemas
 */
import { safeParse } from 'valibot';

import { linkIdSchema } from './schema';

/**
 * Returns the validator middleware for a `:linkId` base-62 link ID.
 * @returns The valibot-based validator middleware for the linkId param.
 */
export const validateLinkIdentity = (): MiddlewareHandler => async (ctx, next) => {
  const result = safeParse(linkIdSchema, ctx.req.param('linkId'));
  if (!result.success) {
    // The linkId is invalid according to our rules, so it will never be found.
    throw notFound();
  }
  await next();
};
