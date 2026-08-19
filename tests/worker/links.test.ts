import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/worker/index';
import { resolveLinkRedirect } from '../../src/worker/routes/links';

describe('resolveLinkRedirect', () => {
  it('redirects a known eight-character base62 link ID', async () => {
    const response = await resolveLinkRedirect(
      { get: async () => 'https://example.com/articles/edge-routing' },
      '8Gk2pZqM',
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://example.com/articles/edge-routing');
  });

  it('returns 404 without querying KV for malformed link IDs', async () => {
    let queried = false;
    const response = await resolveLinkRedirect(
      {
        get: async () => {
          queried = true;
          return null;
        },
      },
      'invalid-id',
    );

    expect(response.status).toBe(404);
    expect(queried).toBe(false);
  });
});

describe('link route', () => {
  beforeEach(async () => {
    await env.LINKS.put('8Gk2pZqM', 'https://example.com/articles/edge-routing');
  });

  it('uses the configured KV binding for redirects', async () => {
    const response = await app.request('https://brief.ly/l/8Gk2pZqM', undefined, env);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://example.com/articles/edge-routing');
  });
});
