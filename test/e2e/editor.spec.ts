import { test, expect } from './fixtures/hass';
import { removeState, setState, useDashboard } from './helpers/homeassistant';

/**
 * The editor is opened the way a user opens it - edit mode, then the card's Edit
 * button - so it runs inside HA's own card editor dialog, against whatever
 * elements this frontend defines. `ha-radio` was removed in HA 2026.6, and the
 * centre mode radios it drew went with it without an error.
 */
const CENTER = 'device_tracker.e2e_editor_center';

let urlPath: string;

test.beforeAll(async () => {
  await setState(CENTER, 'not_home', {
    friendly_name: 'E2E Editor Centre',
    latitude: 52.0,
    longitude: 5.0,
    gps_accuracy: 5,
    source_type: 'gps',
  });

  urlPath = await useDashboard('editor', {
    views: [
      {
        title: 'Editor',
        cards: [
          {
            type: 'custom:radar-card',
            title: 'E2E editor',
            center_entity: CENTER,
            entities: [CENTER],
            animation_enabled: false,
          },
        ],
      },
    ],
  });
});

test.afterAll(async () => {
  await removeState(CENTER);
});

test.describe('The editor in a real frontend', () => {
  test('switches the centre mode with the radios HA draws', async ({ page, consoleErrors }) => {
    await page.goto(`/${urlPath}/0?edit=1`);
    await expect(page.locator('radar-card ha-card')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /^edit$/i }).click();

    const editor = page.locator('radar-card-editor');
    // By role from the editor down, not by our own markup: the radios are only
    // there if some element this frontend defines draws them. The options are
    // slotted into the group, so they are not its DOM descendants either.
    const moving = editor.getByRole('radio', { name: 'Moving' });
    const staticMode = editor.getByRole('radio', { name: 'Static' });
    await expect(moving).toBeVisible({ timeout: 30_000 });
    await expect(editor.getByRole('radiogroup')).toBeVisible();
    await expect(moving).toBeChecked();
    await expect(editor.getByText('Center Entity (Moving)')).toBeVisible();

    await staticMode.click();
    await expect(staticMode).toBeChecked();
    await expect(moving).not.toBeChecked();
    // The config followed: the static mode's zone picker replaced the entity one.
    await expect(editor.getByText('Center Zone (Static)')).toBeVisible();

    await moving.click();
    await expect(moving).toBeChecked();
    await expect(editor.getByText('Center Entity (Moving)')).toBeVisible();

    const undefinedTags = await editor.evaluate((host) => {
      const tags = new Set<string>();
      const walk = (root: ParentNode) => {
        for (const el of Array.from(root.querySelectorAll('*'))) {
          const tag = el.tagName.toLowerCase();
          if (tag.includes('-')) tags.add(tag);
          if (el.shadowRoot) walk(el.shadowRoot);
        }
      };
      walk(host.shadowRoot!);
      return [...tags].filter((tag) => !customElements.get(tag));
    });
    expect(undefinedTags).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
