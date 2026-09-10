import { test, expect } from './fixtures/hass';
import { BUNDLE_NAME, resources, useDashboard } from './helpers/homeassistant';

const DUPLICATE_MARKER = 'e2e-duplicate';

test.describe('Lovelace resource registration', () => {
  test('has exactly one resource for the card bundle', async () => {
    // This repository ships no integration, so the resource is declared by hand
    // in test-env/config/configuration.yaml. Two of them load the bundle twice,
    // and the second customElements.define() throws.
    const ours = (await resources()).filter((resource) => resource.url.split('?')[0].endsWith(`/${BUNDLE_NAME}`));

    expect(ours).toHaveLength(1);
    expect(ours[0].url).toBe(`/local/dist/${BUNDLE_NAME}`);
  });

  test('serves the bundle and defines card and editor without a clash', async ({ page, consoleErrors }) => {
    const urlPath = await useDashboard('resources', { views: [{ title: 'Empty', cards: [] }] });

    await page.goto(`/${urlPath}/0`);
    await page.waitForFunction(() => customElements.get('radar-card') !== undefined, {
      timeout: 60_000,
    });

    // The editor is a separate element in the same bundle: asking the card for
    // its config element is what opening the editor does, and it is where a
    // duplicate define() would blow up.
    await page.evaluate(async () => {
      const constructor = customElements.get('radar-card') as unknown as {
        getConfigElement(): Promise<HTMLElement>;
      };
      await constructor.getConfigElement();
    });
    await expect.poll(() => page.evaluate(() => !!customElements.get('radar-card-editor'))).toBe(true);

    expect(consoleErrors.filter((text) => /has already been used/i.test(text))).toEqual([]);
  });

  test('survives the bundle being registered a second time', async ({ page, consoleErrors }) => {
    // A duplicate Lovelace resource entry is a real support case, and until
    // `fix(card): survive a second load of the bundle` it took the card down:
    // the second evaluation of the module called customElements.define() again
    // and threw "the name radar-card has already been used".
    //
    // The second registration has to be made in the browser rather than through
    // `lovelace/resources/create`: test-env runs with `resource_mode: yaml`, so
    // the resource collection is read-only and Home Assistant answers that
    // command with `unknown_command`. Appending a module script for the bundle
    // is byte for byte what the frontend's resource loader does for a `module`
    // resource, so the browser sees exactly the duplicate-resource situation.
    const urlPath = await useDashboard('resources-duplicate', { views: [{ title: 'Empty', cards: [] }] });

    await page.goto(`/${urlPath}/0`);
    await page.waitForFunction(() => customElements.get('radar-card') !== undefined, { timeout: 60_000 });

    try {
      await page.evaluate(
        async ([bundle, marker]) => {
          const script = document.createElement('script');
          script.type = 'module';
          // A query string is what makes it a second module: same file, second
          // evaluation - the effect a second resource entry has.
          script.src = `/local/dist/${bundle}?${marker}`;
          script.dataset.e2eDuplicate = 'true';
          await new Promise<void>((resolve, reject) => {
            script.addEventListener('load', () => resolve());
            script.addEventListener('error', () => reject(new Error('the duplicate resource failed to load')));
            document.head.append(script);
          });
        },
        [BUNDLE_NAME, DUPLICATE_MARKER],
      );

      // The guard is what keeps this true; without it the define() above throws
      // and the console carries the clash.
      expect(consoleErrors.filter((text) => /has already been used/i.test(text))).toEqual([]);
      expect(consoleErrors.filter((text) => /radar-card/i.test(text))).toEqual([]);

      // The card is still the element the first load registered, and the card
      // picker still lists it once - the second half of that same fix.
      await expect
        .poll(() =>
          page.evaluate(() => {
            const registry = (window as unknown as { customCards?: { type: string }[] }).customCards ?? [];
            return registry.filter((card) => card.type === 'radar-card').length;
          }),
        )
        .toBe(1);

      // And it still works: the editor resolves after the second load too.
      await page.evaluate(async () => {
        const constructor = customElements.get('radar-card') as unknown as {
          getConfigElement(): Promise<HTMLElement>;
        };
        await constructor.getConfigElement();
      });
      await expect.poll(() => page.evaluate(() => !!customElements.get('radar-card-editor'))).toBe(true);
    } finally {
      // Leave the page as we found it, so nothing downstream inherits a
      // double-loaded frontend.
      await page.evaluate(() => {
        document.querySelectorAll('script[data-e2e-duplicate]').forEach((script) => script.remove());
      });
    }
  });
});
