/**
 * @file Path policies for the access control
 */
import type { PathPolicy } from '@adrianhall/cloudflare-toolkit/hono';

/**
 * All the paths we expect, including those within the HTML / UI, which are
 * used by the cloudflareAccessPlugin()
 */
export const accessPolicies: PathPolicy[] = [
  // The admin UI pages
  { pattern: /^\/admin$/u, authenticate: true, redirect: true },
  { pattern: /^\/admin\//u, authenticate: true, redirect: true },

  // The HTTP API -- note that /api/version is unprotected in development
  // But it is protected in production (via access.config.ts) so that we
  // Don't leak data to an attacker, but we provide information to developers
  { pattern: /^\/api\/version/u, authenticate: false, redirect: false },
  { pattern: /^\/api/u, authenticate: true, redirect: false },

  // The link redirector
  { pattern: /^\/l\//u, authenticate: false, redirect: false },

  // Default action
  { pattern: /.*/u, authenticate: false },
];
