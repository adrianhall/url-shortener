/**
 * @file Tests for the public `GET /l/:linkId` redirect route.
 */
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import app from '../../../src/worker/index';

const EXISTING_LINK_ID = '8Gk2pZqM';
const EMPTY_DESTINATION_LINK_ID = 'emptyDst';
const DESTINATION = 'https://example.com/articles/edge-routing';
const RedirectStatusCode = 302;
const NotFoundStatusCode = 404;
const ProblemDetailsContentType = 'application/problem+json';

describe('GET /l/:linkId', () => {
  beforeEach(async () => {
    await env.LINKS.put(EXISTING_LINK_ID, DESTINATION);
  });

  it('redirects to the stored destination for a known link ID', async () => {
    const response = await app.request(`https://brief.ly/l/${EXISTING_LINK_ID}`, undefined, env);

    expect(response.status).toBe(RedirectStatusCode);
    expect(response.headers.get('location')).toBe(DESTINATION);
  });

  it('returns a 404 problem-details response for a well-formed but unknown link ID', async () => {
    const response = await app.request('https://brief.ly/l/ZZZZZZZZ', undefined, env);

    expect(response.status).toBe(NotFoundStatusCode);
    expect(response.headers.get('content-type')).toContain(ProblemDetailsContentType);
  });

  it('returns the same 404 problem-details response for a malformed link ID', async () => {
    const response = await app.request('https://brief.ly/l/not-a-valid-id', undefined, env);

    expect(response.status).toBe(NotFoundStatusCode);
    expect(response.headers.get('content-type')).toContain(ProblemDetailsContentType);
  });

  it('returns 404 rather than redirecting when the stored destination is empty', async () => {
    await env.LINKS.put(EMPTY_DESTINATION_LINK_ID, '');

    const response = await app.request(
      `https://brief.ly/l/${EMPTY_DESTINATION_LINK_ID}`,
      undefined,
      env,
    );

    expect(response.status).toBe(NotFoundStatusCode);
  });
});
