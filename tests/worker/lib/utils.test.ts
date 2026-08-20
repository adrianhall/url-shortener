/**
 * @file Tests for the environment-detection helpers in src/worker/lib/utils.ts.
 *
 * `environment` and `isDevelopment()` are computed once, at module load, from
 * `process.env.ENVIRONMENT`. Each test below loads a fresh copy of the module via
 * `vi.resetModules()` after setting `process.env.ENVIRONMENT`, since re-importing the cached
 * module would keep whatever value was resolved the first time it loaded.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnvironment = process.env.ENVIRONMENT;

afterEach(() => {
  process.env.ENVIRONMENT = originalEnvironment;
  vi.resetModules();
});

describe('environment detection', () => {
  it('treats "development" as a development environment', async () => {
    process.env.ENVIRONMENT = 'development';
    vi.resetModules();

    const { environment, isDevelopment } = await import('../../../src/worker/lib/utils');

    expect(environment).toBe('development');
    expect(isDevelopment()).toBe(true);
  });

  it('defaults to "production" when ENVIRONMENT is unset', async () => {
    process.env.ENVIRONMENT = '';
    vi.resetModules();

    const { environment, isDevelopment } = await import('../../../src/worker/lib/utils');

    expect(environment).toBe('production');
    expect(isDevelopment()).toBe(false);
  });

  it('does not treat other environments, such as "test", as development', async () => {
    process.env.ENVIRONMENT = 'test';
    vi.resetModules();

    const { isDevelopment } = await import('../../../src/worker/lib/utils');

    expect(isDevelopment()).toBe(false);
  });
});
