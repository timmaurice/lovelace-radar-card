import { test, expect } from './fixtures/hass';
import { removeState, setState, useDashboard } from './helpers/homeassistant';
import { CHART_RADIUS, plottedPoints } from './helpers/radar';

/**
 * What the card does with the entities it cannot place properly.
 *
 * Both cases used to be invisible. A point beyond a fixed `radar_max_distance`
 * was translated far outside the 220x220 viewBox - drawn, but nowhere a reader
 * could see it, while the legend still listed it as if it were on the chart. An
 * entity that was missing, coordinate-less or unavailable was dropped without a
 * word, so a typo in an entity id looked exactly like a shorter card. Neither
 * shows up in a unit test's DOM assertions the way it shows up here: this is
 * the real browser, the real viewBox, and the real legend.
 */
const NEAR = 'device_tracker.e2e_range_near';
const FAR = 'device_tracker.e2e_range_far';
const OK = 'device_tracker.e2e_range_ok';
const NO_COORDS = 'device_tracker.e2e_range_nocoords';
const UNAVAILABLE = 'device_tracker.e2e_range_unavailable';
const MISSING = 'device_tracker.e2e_range_does_not_exist';
const ENTITIES = [NEAR, FAR, OK, NO_COORDS, UNAVAILABLE];

const CENTER_LAT = 52.0;
const CENTER_LON = 5.0;
// 500 m due east - half of the 1 km radar.
const NEAR_LON = 5.0073037;
// Roughly 130 km due north, well past the radar's edge.
const FAR_LAT = 53.17;

let urlPath: string;

const tracker = (name: string, latitude: number, longitude: number) => ({
  friendly_name: name,
  latitude,
  longitude,
  gps_accuracy: 5,
  source_type: 'gps',
});

test.beforeAll(async () => {
  await setState(NEAR, 'not_home', tracker('E2E Near', CENTER_LAT, NEAR_LON));
  await setState(FAR, 'not_home', tracker('E2E Far', FAR_LAT, CENTER_LON));
  await setState(OK, 'not_home', tracker('E2E Fine', CENTER_LAT, NEAR_LON));
  await setState(NO_COORDS, 'not_home', { friendly_name: 'E2E No Coords' });
  // Stale coordinates outlive the state: this one must not be plotted as live.
  await setState(UNAVAILABLE, 'unavailable', tracker('E2E Gone', FAR_LAT, CENTER_LON));

  const common = {
    type: 'custom:radar-card',
    center_latitude: CENTER_LAT,
    center_longitude: CENTER_LON,
    animation_enabled: false,
  };

  urlPath = await useDashboard('range', {
    views: [
      {
        title: 'Beyond',
        cards: [
          {
            ...common,
            title: 'Beyond the radar',
            entities: [NEAR, FAR],
            auto_radar_max_distance: false,
            radar_max_distance: 1,
          },
        ],
      },
      {
        title: 'Skipped',
        cards: [{ ...common, title: 'Cannot be plotted', entities: [OK, MISSING, NO_COORDS, UNAVAILABLE] }],
      },
    ],
  });
});

test.afterAll(async () => {
  for (const entity of ENTITIES) await removeState(entity);
});

test.describe('Entities the radar cannot place', () => {
  test('keeps an entity beyond the fixed maximum on the rim instead of off-canvas', async ({ page, consoleErrors }) => {
    await page.goto(`/${urlPath}/0`);

    const card = page.locator('radar-card');
    await expect(card.locator('ha-card')).toBeVisible({ timeout: 60_000 });
    await expect(card.locator('g.entity-group')).toHaveCount(2);

    const points = await plottedPoints(card);
    const far = points.find((point) => point.label === 'E2E Far');
    const near = points.find((point) => point.label === 'E2E Near');
    expect(far, 'the distant tracker is plotted').toBeDefined();
    expect(near, 'the nearer tracker is plotted').toBeDefined();

    // translate(5970, -10049) on a 220x220 viewBox was the bug.
    expect(far!.radius).toBeCloseTo(CHART_RADIUS, 0);
    expect(far!.bearing).toBe(0);
    expect(near!.radius).toBeCloseTo(CHART_RADIUS / 2, 0);

    // On the rim, but not pretending to sit on the outer ring.
    await expect(card.locator('g.entity-group.out-of-range')).toHaveCount(1);
    await expect(card.locator('g.entity-group.out-of-range title')).toContainText("Beyond the radar's range");
    await expect(card.locator('.legend-item.out-of-range .legend-name')).toHaveText('E2E Far');
    await expect(card.locator('.legend-item.out-of-range ha-icon.legend-beyond-range')).toHaveCount(1);
    expect(consoleErrors).toEqual([]);
  });

  test('names the entities it skips instead of quietly dropping them', async ({ page, consoleErrors }) => {
    await page.goto(`/${urlPath}/1`);

    const card = page.locator('radar-card');
    await expect(card.locator('ha-card')).toBeVisible({ timeout: 60_000 });

    // Only the healthy tracker reaches the chart - an unavailable entity keeps
    // its last coordinates, and plotting those as live is worse than not
    // plotting them at all.
    await expect(card.locator('g.entity-group')).toHaveCount(1);
    await expect(card.locator('.legend-name')).toHaveText(['E2E Fine']);

    const skipped = card.locator('.skipped-entity');
    await expect(skipped).toHaveCount(3);
    await expect(skipped.nth(0)).toContainText(MISSING);
    await expect(skipped.nth(0)).toContainText('not found');
    await expect(skipped.nth(1)).toContainText('E2E No Coords');
    await expect(skipped.nth(1)).toContainText('no location');
    await expect(skipped.nth(2)).toContainText('E2E Gone');
    await expect(skipped.nth(2)).toContainText('unavailable');
    expect(consoleErrors).toEqual([]);
  });
});
