/**
 * @file Tests for the validateLinkIdentity() Hono middleware.
 */
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { validateLinkIdentity } from '../../../src/worker/lib/validators';

const OkStatusCode = 200;
const NotFoundStatusCode = 404;
const ProblemDetailsContentType = 'application/problem+json';

function buildTestApp(): Hono {
  const app = new Hono();
  app.get('/:linkId', validateLinkIdentity(), (context) => context.text('ok'));
  return app;
}

describe('validateLinkIdentity', () => {
  it('calls the next handler for a well-formed 8-character base62 link ID', async () => {
    const response = await buildTestApp().request('/8Gk2pZqM');

    expect(response.status).toBe(OkStatusCode);
    expect(await response.text()).toBe('ok');
  });

  it('throws a 404 problem-details response for a malformed link ID', async () => {
    const response = await buildTestApp().request('/not-a-valid-id');

    expect(response.status).toBe(NotFoundStatusCode);
    expect(response.headers.get('content-type')).toContain(ProblemDetailsContentType);
  });
});
