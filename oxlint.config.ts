import { defineConfig } from 'oxlint';

const basePlugins = ['eslint', 'typescript', 'unicorn', 'oxc', 'import', 'promise'] as const;

export default defineConfig({
  categories: {
    correctness: 'error',
    nursery: 'error',
    pedantic: 'error',
    perf: 'error',
    restriction: 'error',
    style: 'error',
    suspicious: 'error',
  },
  env: {
    es2024: true,
  },
  ignorePatterns: [
    'worker-configuration.d.ts',
    '.build/**',
    '.cloudflare/**',
    'src/client/.cloudflare/**',
    'dist/**',
  ],
  options: {
    denyWarnings: true,
    reportUnusedDisableDirectives: 'error',
    respectEslintDisableDirectives: false,
    typeAware: true,
  },
  overrides: [
    {
      files: ['src/client/**/*.{js,ts,jsx,tsx}'],
      env: {
        browser: true,
      },
      rules: {
        'import/no-unassigned-import': 'off',
      },
    },
    {
      files: ['src/worker/**/*.{js,ts,jsx,tsx}'],
      env: {
        worker: true,
      },
    },
    {
      files: ['tests/client/**/*.{js,ts,jsx,tsx}'],
      plugins: [...basePlugins, 'vitest'],
      env: {
        browser: true,
        vitest: true,
      },
    },
    {
      files: ['tests/worker/**/*.{js,ts,jsx,tsx}'],
      plugins: [...basePlugins, 'vitest'],
      env: {
        worker: true,
        vitest: true,
      },
    },
    {
      files: ['*.config.ts', 'tests/**/vitest.config.ts', 'src/client/cloudflare.config.ts'],
      plugins: [...basePlugins, 'node'],
      env: {
        node: true,
      },
      rules: {
        'import/no-nodejs-modules': 'off',
      },
    },
  ],
  plugins: [...basePlugins],
  rules: {
    // These restriction rules conflict with required module APIs or modern TypeScript idioms.
    'eslint/func-style': 'off',
    'eslint/no-magic-numbers': 'off',
    'eslint/no-ternary': 'off',
    'eslint/no-undefined': 'off',
    'eslint/one-var': 'off',
    'eslint/sort-imports': 'off',
    'eslint/sort-keys': 'off',
    'import/exports-last': 'off',
    'import/no-default-export': 'off',
    'import/no-named-export': 'off',
    'import/no-relative-parent-imports': 'off',
    'import/no-cycle': 'error',
    'import/prefer-default-export': 'off',
    'oxc/no-async-await': 'off',
    'oxc/no-optional-chaining': 'off',
    'typescript/prefer-readonly-parameter-types': 'off',
    'typescript/promise-function-async': 'off',
    'unicorn/no-null': 'off',
  },
});
