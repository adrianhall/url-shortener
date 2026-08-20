import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineProject } from 'vitest/config';

export default defineProject({
  root: new URL('../..', import.meta.url).pathname,
  plugins: [
    cloudflareTest({
      main: new URL('../../src/worker/index.ts', import.meta.url).pathname,
      miniflare: {
        compatibilityDate: '2026-08-18',
        compatibilityFlags: ['nodejs_compat'],
        kvNamespaces: ['LINKS'],
        d1Databases: ['DB'],
        bindings: {
          ENVIRONMENT: 'test',
        },
      },
    }),
  ],
  test: {
    name: 'worker',
    dir: 'tests/worker',
    include: ['**/*.test.ts'],
  },
});
