import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['./tests/client/vitest.config.ts', './tests/worker/vitest.config.ts'],
  },
});
