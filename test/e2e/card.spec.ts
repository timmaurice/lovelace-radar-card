import { test, expect } from './fixtures/hass';
import { removeState, setState, useDashboard } from './helpers/homeassistant';
import { CHART_RADIUS, gridRadii, plottedPoints } from './helpers/radar';

/**
 * The card plots anything that carries `latitude` and `longitude` attributes -
 * that is all `_calculatePoints` looks at, plus `friendly_name` for the label
 * and `entity_picture` for the avatar. These are device trackers because that
 * is what the card is for, but the shape is the only thing that matters.
 */
const NORTH = 'device_tracker.e2e_card_north';
const EAST = 'device_tracker.e2e_card_east';
const ENTITIES = [NORTH, EAST];

/**
 * The centre is pinned in the card config rather than taken from the instance's
 * own home coordinates, so the geometry below is a fixed expectation and not a
 * property of whatever `core.config` happens to say.
 */
const CENTER_LAT = 52.0;
const CENTER_LON = 5.0;
// 1 km due north and 500 m due east of that centre, on the WGS84 sphere the
// card's haversine uses.
const NORTH_LAT = 52.0089932;
const EAST_LON = 5.0073037;

let urlPath: string;

test.beforeAll(async () => {
  await setState(NORTH, 'not_home', {
    friendly_name: 'E2E North',
    latitude: NORTH_LAT,
    longitude: CENTER_LON,
    gps_accuracy: 5,
    source_type: 'gps',
  });
  await setState(EAST, 'not_home', {
    friendly_name: 'E2E East',
    latitude: CENTER_LAT,
    longitude: EAST_LON,
    gps_accuracy: 5,
    source_type: 'gps',
  });

  urlPath = await useDashboard('card', {
    views: [
      {
        title: 'Radar',
        cards: [
          {
            type: 'custom:radar-card',
            title: 'E2E radar',
            entities: [
              { entity: NORTH, name: 'E2E North' },
              { entity: EAST, name: 'E2E East' },
            ],
            center_latitude: CENTER_LAT,
            center_longitude: CENTER_LON,
            // The plot is asserted on its final position, so the fly-out
            // transition would only add a race.
            animation_enabled: false,
          },
        ],
      },
      { title: 'Elsewhere', cards: [{ type: 'markdown', content: 'nothing here' }] },
    ],
  });
});

test.afterAll(async () => {
  for (const entity of ENTITIES) await removeState(entity);
});

test.describe('The card on a real dashboard', () => {
  test('draws the rings and puts each tracker where its coordinates say', async ({ page, consoleErrors }) => {
    await page.goto(`/${urlPath}/0`);

    // Assert on what the card paints, not on the custom element itself: the
    // host has no box of its own, so Playwright rightly calls it hidden.
    const card = page.locator('radar-card');
    await expect(card.locator('ha-card')).toBeVisible({ timeout: 60_000 });
    await expect(card.locator('g.entity-group')).toHaveCount(2);

    // Four rings, evenly spaced, and the outermost one on the chart's edge -
    // that ring is the radar's range, so it has to reach the rim rather than
    // stop at the last round number below it.
    const rings = await gridRadii(card);
    expect(rings).toHaveLength(4);
    expect(rings[rings.length - 1]).toBeCloseTo(CHART_RADIUS, 0);
    const gaps = rings.slice(1).map((radius, index) => radius - rings[index]);
    for (const gap of gaps) expect(gap).toBeCloseTo(rings[0], 1);

    // The outer label is the range. Grid labels drop the decimals of a whole
    // number, so a kilometre reads "1 km" here and "1.00 km" in the legend.
    await expect(card.locator('text.grid-label').last()).toHaveText('1 km');

    // The furthest tracker defines the scale, so it lands on the outer ring,
    // and due north means straight up. The nearer one is at half the distance
    // and due east - both read straight off the SVG, not off the card's own
    // arithmetic.
    const points = await plottedPoints(card);
    const north = points.find((point) => point.label === 'E2E North');
    const east = points.find((point) => point.label === 'E2E East');
    expect(north, 'the northern tracker is plotted').toBeDefined();
    expect(east, 'the eastern tracker is plotted').toBeDefined();

    expect(north!.radius).toBeCloseTo(CHART_RADIUS, 0);
    expect(north!.bearing).toBe(0);
    expect(north!.y).toBeLessThan(0);
    expect(Math.abs(north!.x)).toBeLessThan(0.5);

    expect(east!.radius).toBeCloseTo(CHART_RADIUS / 2, 0);
    expect(east!.bearing).toBe(90);
    expect(east!.x).toBeGreaterThan(0);

    // The legend is the same data in words.
    await expect(card.locator('.legend-name')).toHaveText(['E2E North', 'E2E East']);
    // The haversine puts a nominal kilometre at 999.998 m, which rounds to
    // 1000 m - so formatDistance shows kilometres rather than flipping unit at
    // an invisible fraction of a metre.
    await expect(card.locator('.legend-distance').first()).toHaveText('(1.00 km)');
    await expect(card.locator('.legend-distance').nth(1)).toHaveText('(500 m)');
    await expect(card.locator('.no-entities')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('comes back after leaving the view and returning', async ({ page }) => {
    // Views are torn out of the DOM on a switch, and the chart is drawn by d3
    // into a container Lit owns. A card that does not redraw on the way back
    // comes back as an empty box, and no unit test sees that.
    await page.goto(`/${urlPath}/0`);
    const card = page.locator('radar-card');
    await expect(card.locator('g.entity-group')).toHaveCount(2, { timeout: 60_000 });

    await page.getByRole('tab', { name: 'Elsewhere' }).click();
    await expect(page.locator('radar-card')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Radar' }).click();
    await expect(card.locator('g.entity-group')).toHaveCount(2, { timeout: 30_000 });
    expect(await gridRadii(card)).toHaveLength(4);

    const points = await plottedPoints(card);
    expect(points.find((point) => point.label === 'E2E North')!.radius).toBeCloseTo(CHART_RADIUS, 0);
  });
});
