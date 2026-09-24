// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Read from disk rather than imported: the test alias turns every `.scss`
 * import into an empty mock, `?raw` included, and a check against an empty
 * string passes whatever the sheet says. The node environment is what lets
 * `node:fs` load at all - under jsdom it fails.
 */
const sheet = (name: string): string => readFileSync(new URL(`../src/styles/${name}`, import.meta.url), 'utf8');

/**
 * `ha-button` is Web Awesome's button since HA 2026.3 and reads none of the
 * mwc-era `--mdc-button-*` properties. One left in a stylesheet looks like
 * styling and does nothing: the editor's test-animation button claimed 8px of
 * horizontal padding and was drawn with the default 16px all along.
 */
describe('Styles against the Web Awesome ha-button', () => {
  it.each(['editor.styles.scss', 'card.styles.scss'])('%s sets no --mdc-button-* property', (name) => {
    const css = sheet(name);
    expect(css).toContain('ha-button');
    expect(css).not.toMatch(/--mdc-button-/);
  });
});
