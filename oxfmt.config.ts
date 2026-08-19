import { defineConfig } from 'oxfmt';

export default defineConfig({
  arrowParens: 'always',
  bracketSpacing: true,
  embeddedLanguageFormatting: 'auto',
  endOfLine: 'lf',
  ignorePatterns: [
    'worker-configuration.d.ts',
    '.build/**',
    '.cloudflare/**',
    'src/client/.cloudflare/**',
    'dist/**',
  ],
  insertFinalNewline: true,
  printWidth: 100,
  quoteProps: 'as-needed',
  semi: true,
  singleQuote: true,
  sortImports: {
    groups: [
      'type-import',
      ['value-builtin', 'value-external'],
      'type-internal',
      'value-internal',
      ['type-parent', 'type-sibling', 'type-index'],
      ['value-parent', 'value-sibling', 'value-index'],
      'style',
      'side_effect',
      'unknown',
    ],
    sortSideEffects: false,
  },
  sortPackageJson: {
    sortScripts: true,
  },
  tabWidth: 2,
  trailingComma: 'all',
  useTabs: false,
});
