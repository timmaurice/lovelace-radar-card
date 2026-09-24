import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures/hass';
import { removeState, setState, useDashboard } from './helpers/homeassistant';

/**
 * The marker dialog and the button that opens it are built from HA's own
 * elements - `ha-dialog`, `ha-dialog-footer`, `ha-input`, `ha-button`,
 * `ha-icon-button` - and those change under the card. HA 2026.3 swapped
 * `ha-dialog` for a Web Awesome dialog with other slots and no `heading`, 2026.5
 * removed `ha-textfield` and `ha-fab`, and the dialog lost its title, its
 * buttons and then its fields without a single error in the console. Only the
 * real frontend can say whether the markup still lands anywhere, so this spec
 * asks it.
 */
const CENTER = 'device_tracker.e2e_marker_center';
const STORAGE_KEY = 'radar-card-markers';
const MARKER = { id: 'e2e-marker', name: 'E2E Marker', latitude: 52.004, longitude: 5.0, color: '#ff0000' };

let urlPath: string;

test.beforeAll(async () => {
  await setState(CENTER, 'not_home', {
    friendly_name: 'E2E Centre',
    latitude: 52.0,
    longitude: 5.0,
    gps_accuracy: 5,
    source_type: 'gps',
  });

  urlPath = await useDashboard('marker-dialog', {
    views: [
      {
        title: 'Markers',
        cards: [
          {
            type: 'custom:radar-card',
            title: 'E2E markers',
            center_entity: CENTER,
            entities: [],
            enable_markers: true,
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

/** Loads the view with exactly the given markers in the card's storage. */
async function openView(page: Page, markers: unknown[]): Promise<Locator> {
  await page.goto(`/${urlPath}/0`);
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [STORAGE_KEY, JSON.stringify(markers)],
  );
  await page.reload();
  const card = page.locator('radar-card');
  await expect(card.locator('ha-card')).toBeVisible({ timeout: 60_000 });
  return card;
}

async function storedMarkers(page: Page): Promise<{ id: string; name: string; color?: string }[]> {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || '[]'), STORAGE_KEY);
}

/**
 * Custom element tags at and below `element`, through open shadow roots, that
 * nothing has defined. An undefined element throws nothing and renders with no
 * height, so this is the only place a removed HA element shows up at all.
 */
async function undefinedTags(element: Locator): Promise<string[]> {
  return element.evaluate((host) => {
    const tags = new Set<string>([host.tagName.toLowerCase()]);
    const walk = (root: ParentNode) => {
      for (const el of Array.from(root.querySelectorAll('*'))) {
        const tag = el.tagName.toLowerCase();
        if (tag.includes('-')) tags.add(tag);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(host);
    if (host.shadowRoot) walk(host.shadowRoot);
    return [...tags].filter((tag) => !customElements.get(tag));
  });
}

async function openEditDialog(card: Locator): Promise<Locator> {
  await card.locator('ha-icon-button.edit-marker-icon').click();
  const dialog = card.locator('ha-dialog');
  // The surface, not the host: the host has no box of its own.
  await expect(dialog.locator('wa-dialog [part="dialog"]').first()).toBeVisible();
  return dialog;
}

test.describe('The marker dialog in a real frontend', () => {
  test('shows its title, both fields and all three buttons', async ({ page, consoleErrors }) => {
    const card = await openView(page, [MARKER]);
    const dialog = await openEditDialog(card);

    await expect(dialog.locator('#ha-dialog-title')).toHaveText('E2E Marker');

    for (const name of ['name', 'color']) {
      const field = dialog.locator(`ha-input[name="${name}"]`);
      await expect(field.locator('input')).toBeVisible();
      expect((await field.boundingBox())!.height, `the ${name} field has a height`).toBeGreaterThan(20);
    }
    await expect(dialog.locator('ha-input[name="name"] input')).toHaveValue('E2E Marker');
    await expect(dialog.locator('ha-input[name="color"] input')).toHaveValue('#ff0000');

    for (const label of ['Delete', 'Cancel', 'Save']) {
      await expect(dialog.getByRole('button', { name: label, exact: true })).toBeVisible();
    }

    expect(await undefinedTags(dialog)).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("puts the legend's edit button inside its row", async ({ page }) => {
    const card = await openView(page, [MARKER]);
    const edit = card.locator('ha-icon-button.edit-marker-icon');
    const row = (await card.locator('.legend-item').first().boundingBox())!;

    // ha-icon-button is sized by --ha-icon-button-size. Left at its 48px default
    // inside a 16px host, the pencil was drawn centred in the overflow, below
    // and to the right of the name it belongs to.
    const inner = (await edit.locator('ha-button').boundingBox())!;
    const icon = (await edit.locator('ha-icon').boundingBox())!;
    expect(inner.width).toBeLessThanOrEqual(24);
    expect(icon.y).toBeGreaterThanOrEqual(row.y - 2);
    expect(icon.y + icon.height).toBeLessThanOrEqual(row.y + row.height + 2);
  });

  test('saves a new name and colour', async ({ page }) => {
    const card = await openView(page, [MARKER]);
    const dialog = await openEditDialog(card);

    await dialog.locator('ha-input[name="name"] input').fill('E2E Renamed');
    await dialog.locator('ha-input[name="color"] input').fill('#00ff00');
    // The title follows the name as it is typed.
    await expect(dialog.locator('#ha-dialog-title')).toHaveText('E2E Renamed');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(card.locator('ha-dialog')).toHaveCount(0);
    await expect(card.locator('.legend-name')).toHaveText(['E2E Renamed']);
    expect(await storedMarkers(page)).toEqual([expect.objectContaining({ name: 'E2E Renamed', color: '#00ff00' })]);
  });

  test('throws the edit away on Escape and on Cancel', async ({ page }) => {
    const card = await openView(page, [MARKER]);

    let dialog = await openEditDialog(card);
    await dialog.locator('ha-input[name="name"] input').fill('Not kept');
    await page.keyboard.press('Escape');
    await expect(card.locator('ha-dialog')).toHaveCount(0);

    dialog = await openEditDialog(card);
    await expect(dialog.locator('ha-input[name="name"] input')).toHaveValue('E2E Marker');
    await dialog.locator('ha-input[name="name"] input').fill('Not kept either');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(card.locator('ha-dialog')).toHaveCount(0);

    await expect(card.locator('.legend-name')).toHaveText(['E2E Marker']);
    expect(await storedMarkers(page)).toEqual([expect.objectContaining({ name: 'E2E Marker' })]);
  });

  test('adds a marker at the centre from the round button', async ({ page, consoleErrors }) => {
    // Starts from a marker that is already there, so the button floats over a
    // drawn chart; the empty state has a test of its own below.
    const card = await openView(page, [MARKER]);
    const addButton = card.locator('ha-icon-button.add-marker-btn');

    // The label is what screen readers and the tooltip get.
    const button = addButton.getByRole('button', { name: 'Add Marker at Center Point (Current Location)' });
    await expect(button).toBeVisible();
    const box = (await addButton.boundingBox())!;
    expect(Math.round(box.width)).toBe(40);
    expect(Math.round(box.height)).toBe(40);
    expect(await undefinedTags(card)).toEqual([]);

    await button.click();
    const dialog = card.locator('ha-dialog');
    await expect(dialog.locator('#ha-dialog-title')).toHaveText(/^\s*Marker /);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(card.locator('ha-dialog')).toHaveCount(0);
    await expect(card.locator('.legend-name')).toHaveText(['E2E Marker', /^Marker /]);
    expect(await storedMarkers(page)).toEqual([
      expect.objectContaining({ id: MARKER.id }),
      expect.objectContaining({ latitude: 52.0, longitude: 5.0 }),
    ]);
    expect(consoleErrors).toEqual([]);
  });

  test('creates the first marker from the empty state', async ({ page, consoleErrors }) => {
    // The centre entity is the centre, not a plotted point, so with no marker
    // yet nothing is on the radar. The button used to go with the chart, which
    // left a markers-only card with no way to create its first marker.
    const card = await openView(page, []);
    await expect(card.locator('.no-entities')).toBeVisible();

    await card
      .locator('ha-icon-button.add-marker-btn')
      .getByRole('button', { name: 'Add Marker at Center Point (Current Location)' })
      .click();
    const dialog = card.locator('ha-dialog');
    await expect(dialog.locator('#ha-dialog-title')).toHaveText(/^\s*Marker /);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(card.locator('ha-dialog')).toHaveCount(0);
    await expect(card.locator('.no-entities')).toHaveCount(0);
    await expect(card.locator('.legend-name')).toHaveText([/^Marker /]);
    expect(await storedMarkers(page)).toEqual([expect.objectContaining({ latitude: 52.0, longitude: 5.0 })]);
    expect(consoleErrors).toEqual([]);
  });

  test('deletes the marker', async ({ page }) => {
    const card = await openView(page, [MARKER]);
    const dialog = await openEditDialog(card);

    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(card.locator('ha-dialog')).toHaveCount(0);
    await expect(card.locator('.legend-name')).toHaveCount(0);
    expect(await storedMarkers(page)).toEqual([]);
  });
});
