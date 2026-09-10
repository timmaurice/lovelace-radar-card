import globals from 'globals';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import litPlugin from 'eslint-plugin-lit';
import wcPlugin from 'eslint-plugin-wc';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    // The Playwright report and the trace bundles it copies in are generated,
    // minified JavaScript. `.gitignore` already ignores both directories, but
    // ESLint has its own list, so `npm run lint` - and with it the pre-commit
    // hook - drowned in thousands of errors after any `npm run test:e2e`.
    ignores: ['dist/', 'venv/', 'playwright-report/', 'test-results/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    plugins: {
      lit: litPlugin,
      wc: wcPlugin,
    },
    rules: {
      ...litPlugin.configs.recommended.rules,
      ...wcPlugin.configs.recommended.rules,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  prettierConfig,
);
