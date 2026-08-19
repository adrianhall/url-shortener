import { defineProject } from 'vitest/config';

export default defineProject({
  root: new URL('../..', import.meta.url).pathname,
  test: {
    name: 'client',
    environment: 'jsdom',
    dir: 'tests/client',
    include: ['**/*.test.ts'],
  },
});
