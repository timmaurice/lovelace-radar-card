import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures/hass';
import { callWebsocket, getState, removeState, setState, useDashboard } from './helpers/homeassistant';

/**
 * A point's `tap_action` is whatever HA's `ui_action` selector wrote, and the
 * card hands it to the frontend to run. The card used to run it itself with a
 * helper library that predates `perform-action` and `assist`, so those two did
 * nothing at all - no error, no console line. Only the real frontend can say
 * whether an action actually reaches Home Assistant.
 */
const PERFORM = 'device_tracker.e2e_action_perform';
const MORE_INFO = 'device_tracker.e2e_action_more_info';
const ASSIST = 'device_tracker.e2e_action_assist';
const TRACKERS = [PERFORM, MORE_INFO, ASSIST];
/** A helper of our own, so the action has a visible effect and nothing else is touched. */
const HELPER_NAME = 'E2E radar action';
const HELPER_ID = 'e2e_radar_action';
const HELPER = `input_boolean.${HELPER_ID}`;

let urlPath: string;

async function deleteHelper(): Promise<void> {
  const helpers = await callWebsocket<{ id: string }[]>({ type: 'input_boolean/list' });
  for (const helper of helpers.filter((item) => item.id === HELPER_ID)) {
    await callWebsocket({ type: 'input_boolean/delete', input_boolean_id: helper.id });
  }
}

test.beforeAll(async () => {
  await deleteHelper();
  await callWebsocket({ type: 'input_boolean/create', name: HELPER_NAME });
  // A recreated helper restores the state its predecessor had, so the test only
  // asserts that the tap flipped it, not where it started.
  await expect.poll(() => getState(HELPER), { timeout: 15_000 }).toMatch(/^(on|off)$/);

  await setState(PERFORM, 'not_home', {
    friendly_name: 'E2E Perform',
    latitude: 52.0089932,
    longitude: 5.0,
    gps_accuracy: 5,
    source_type: 'gps',
  });
  await setState(MORE_INFO, 'not_home', {
    friendly_name: 'E2E More info',
    latitude: 52.0,
    longitude: 5.0073037,
    gps_accuracy: 5,
    source_type: 'gps',
  });
  await setState(ASSIST, 'not_home', {
    friendly_name: 'E2E Assist',
    latitude: 51.995,
    longitude: 4.995,
    gps_accuracy: 5,
    source_type: 'gps',
  });

  urlPath = await useDashboard('actions', {
    views: [
      {
        title: 'Actions',
        cards: [
          {
            type: 'custom:radar-card',
            title: 'E2E actions',
            center_latitude: 52.0,
            center_longitude: 5.0,
            animation_enabled: false,
            entities: [
              {
                entity: PERFORM,
                name: 'E2E Perform',
                tap_action: {
                  action: 'perform-action',
                  perform_action: 'input_boolean.toggle',
                  target: { entity_id: HELPER },
                },
              },
              {
                entity: MORE_INFO,
                name: 'E2E More info',
                tap_action: { action: 'more-info' },
              },
              {
                entity: ASSIST,
                name: 'E2E Assist',
                tap_action: { action: 'assist' },
              },
            ],
          },
        ],
      },
    ],
  });
});

test.afterAll(async () => {
  for (const entity of TRACKERS) await removeState(entity);
  await deleteHelper();
});

async function openView(page: Page): Promise<Locator> {
  await page.goto(`/${urlPath}/0`);
  const card = page.locator('radar-card');
  await expect(card.locator('g.entity-group')).toHaveCount(TRACKERS.length, { timeout: 60_000 });
  return card;
}

function dot(card: Locator, name: string): Locator {
  return card
    .locator('g.entity-group')
    .filter({ has: card.page().locator('title', { hasText: name }) })
    .locator('circle.entity-dot');
}

test.describe('Tap actions on a real dashboard', () => {
  test('perform-action calls the service it names', async ({ page, consoleErrors }) => {
    const card = await openView(page);
    const before = await getState(HELPER);

    await dot(card, 'E2E Perform').click();

    await expect.poll(() => getState(HELPER), { timeout: 15_000 }).toBe(before === 'on' ? 'off' : 'on');
    // The action replaces the default, so no more-info dialog comes up as well.
    await expect(page.locator('ha-more-info-dialog')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('more-info opens the dialog for the tapped entity', async ({ page, consoleErrors }) => {
    const card = await openView(page);

    await dot(card, 'E2E More info').click();

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
    // The heading is slotted into the inner <dialog>, so it is looked up from
    // the more-info element that owns it rather than from the dialog role.
    await expect(page.locator('ha-more-info-dialog').getByText('E2E More info', { exact: true }).first()).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('assist opens the voice assistant', async ({ page, consoleErrors }) => {
    const card = await openView(page);

    await dot(card, 'E2E Assist').click();

    await expect(page.locator('ha-voice-command-dialog').getByRole('dialog')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('ha-more-info-dialog')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});
