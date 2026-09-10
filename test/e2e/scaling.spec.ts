import { test, expect } from './fixtures/hass';
import { removeState, setState, useDashboard } from './helpers/homeassistant';
import { CHART_RADIUS, gridRadii, plottedPoints } from './helpers/radar';

/**
 * The two ends of `fix(card): scale the radar when every entity is at the same
 * distance`.
 *
 * With the furthest entity at distance 0 the d3 scale got a zero-width domain:
 * `ticks()` returned nothing, so the card drew no rings at all and the dots sat
 * at half the radius. The obvious repair - a blanket lower bound on the radar's
 * outer distance - trades that bug for a quieter one: a radar whose entities are
 * only tens of metres away then scales to the bound instead of to its own data,
 * and the outer rings become permanent dead space. Both have to hold, so both
 * are asserted here.
 */
const AT_CENTER = ['device_tracker.e2e_scale_center_a', 'device_tracker.e2e_scale_center_b'];
const CLOSE = ['device_tracker.e2e_scale_close_near', 'device_tracker.e2e_scale_close_far'];
const ENTITIES = [...AT_CENTER, ...CLOSE];

const CENTER_LAT = 52.0;
const CENTER_LON = 5.0;
// 80 m due north and 40 m due east - well inside the 0.1 unit fallback, so a
// blanket minimum would show up as a plot squashed into the middle.
const CLOSE_FAR_LAT = 52.0007195;
const CLOSE_NEAR_LON = 5.0005843;

let urlPath: string;

const tracker = (name: string, latitude: number, longitude: number) => ({
  friendly_name: name,
  latitude,
  longitude,
  gps_accuracy: 5,
  source_type: 'gps',
});

test.beforeAll(async () => {
  // Both of these sit exactly on the centre: distance 0, the degenerate case.
  await setState(AT_CENTER[0], 'home', tracker('E2E Center A', CENTER_LAT, CENTER_LON));
  await setState(AT_CENTER[1], 'home', tracker('E2E Center B', CENTER_LAT, CENTER_LON));
  await setState(CLOSE[0], 'not_home', tracker('E2E Near', CENTER_LAT, CLOSE_NEAR_LON));
  await setState(CLOSE[1], 'not_home', tracker('E2E Far', CLOSE_FAR_LAT, CENTER_LON));

  const common = {
    type: 'custom:radar-card',
    center_latitude: CENTER_LAT,
    center_longitude: CENTER_LON,
    animation_enabled: false,
  };

  urlPath = await useDashboard('scaling', {
    views: [
      {
        title: 'Collapsed',
        cards: [{ ...common, title: 'Everything at distance zero', entities: AT_CENTER }],
      },
      {
        title: 'Close',
        cards: [{ ...common, title: 'Tens of metres away', entities: CLOSE }],
      },
    ],
  });
});

test.afterAll(async () => {
  for (const entity of ENTITIES) await removeState(entity);
});

test.describe('Scaling the radar', () => {
  test('still draws rings when every entity is at distance zero', async ({ page, consoleErrors }) => {
    await page.goto(`/${urlPath}/0`);

    const card = page.locator('radar-card');
    await expect(card.locator('ha-card')).toBeVisible({ timeout: 60_000 });
    await expect(card.locator('g.entity-group')).toHaveCount(2);

    // The bug: no rings whatsoever, on a card that otherwise looked fine.
    const rings = await gridRadii(card);
    expect(rings.length, 'a zero-width domain must not swallow the grid').toBeGreaterThan(0);
    expect(rings[0]).toBeGreaterThan(0);
    expect(rings[rings.length - 1]).toBeCloseTo(CHART_RADIUS, 0);

    // And the dots belong in the middle, not at half the radius the collapsed
    // scale used to hand them.
    for (const point of await plottedPoints(card)) {
      expect(point.radius, `${point.label} sits at the centre`).toBeLessThan(0.5);
    }

    await expect(card.locator('.legend-distance').first()).toHaveText('(0 m)');
    expect(consoleErrors).toEqual([]);
  });

  test('scales to its own data when everything is only tens of metres away', async ({ page, consoleErrors }) => {
    await page.goto(`/${urlPath}/1`);

    const card = page.locator('radar-card');
    await expect(card.locator('ha-card')).toBeVisible({ timeout: 60_000 });
    await expect(card.locator('g.entity-group')).toHaveCount(2);

    const points = await plottedPoints(card);
    const far = points.find((point) => point.label === 'E2E Far');
    const near = points.find((point) => point.label === 'E2E Near');
    expect(far, 'the further tracker is plotted').toBeDefined();
    expect(near, 'the nearer tracker is plotted').toBeDefined();

    // 80 m is the whole radar here. If the outer distance were clamped to the
    // 0.1 unit fallback, this would come out around 72 instead.
    expect(far!.radius).toBeCloseTo(CHART_RADIUS, 0);
    expect(far!.bearing).toBe(0);
    // 40 m is half of 80, and the ratio is what a clamp would leave intact -
    // so the absolute radius above is the assertion that matters.
    expect(near!.radius).toBeCloseTo(CHART_RADIUS / 2, 0);
    expect(near!.bearing).toBe(90);

    // The rings are labelled in metres, not in a tenth of a kilometre.
    await expect(card.locator('text.grid-label').last()).toHaveText('80 m');
    expect(consoleErrors).toEqual([]);
  });
});
