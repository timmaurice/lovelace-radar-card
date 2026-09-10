import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

/**
 * `npm run test:e2e` leaves generated, minified JavaScript behind in
 * `playwright-report/` (the trace viewer bundles the HTML reporter copies in)
 * and in `test-results/`. Git ignores both, but ESLint keeps its own list, so
 * without them there `npm run lint` - and the pre-commit hook that runs it -
 * failed with thousands of errors after every end-to-end run.
 */
describe('ESLint configuration', () => {
  const eslint = new ESLint();

  it.each([
    'playwright-report/trace/assets/index-abc123.js',
    'playwright-report/index.js',
    'test-results/.last-run.json',
    'test-results/range-Entities-chromium/trace.js',
    'dist/radar-card.js',
  ])('should ignore the generated file %s', async (path) => {
    await expect(eslint.isPathIgnored(path)).resolves.toBe(true);
  });

  it.each(['src/radar-card.ts', 'test/radar-card.test.ts', 'test/e2e/range.spec.ts', 'eslint.config.mjs'])(
    'should still lint %s',
    async (path) => {
      await expect(eslint.isPathIgnored(path)).resolves.toBe(false);
    },
  );
});
