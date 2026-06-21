import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/editor';
import type { RadarCardEditor } from '../src/editor';
import { HomeAssistant, RadarCardConfig } from '../src/types';

// Mock the localize function
vi.mock('../src/localize', () => ({
  localize: (hass: HomeAssistant, key: string): string => key.split('.').pop() || key,
}));

interface SwitchEl extends HTMLElement {
  checked: boolean;
}

function getSwitchByConfigValue(root: ShadowRoot, configValue: string): SwitchEl {
  const switches = Array.from(root.querySelectorAll('ha-switch')) as (HTMLElement & {
    configValue?: string;
  })[];
  const match = switches.find((s) => s.configValue === configValue);
  if (!match) {
    throw new Error(`No ha-switch found with configValue="${configValue}"`);
  }
  return match as SwitchEl;
}

function toggleSwitch(root: ShadowRoot, configValue: string, checked: boolean): void {
  const el = getSwitchByConfigValue(root, configValue);
  el.checked = checked;
  el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

describe('RadarCardEditor', () => {
  let element: RadarCardEditor;
  let hass: HomeAssistant;

  beforeEach(() => {
    hass = {
      localize: (key: string) => key,
      entities: {},
      callWS: vi.fn(),
      states: {},
      language: 'en',
      locale: { language: 'en', number_format: 'comma_decimal', time_format: '12' },
      config: {
        latitude: 52.52,
        longitude: 13.4,
        elevation: 30,
        unit_system: { length: 'km' },
        time_zone: 'Europe/Berlin',
      },
    } as unknown as HomeAssistant;

    element = document.createElement('radar-card-editor') as RadarCardEditor;
    document.body.appendChild(element);
    element.hass = hass;
  });

  afterEach(() => {
    document.body.removeChild(element);
    vi.restoreAllMocks();
  });

  it('clears animation_duration when animation_enabled is turned off', async () => {
    element.setConfig({
      type: 'custom:radar-card',
      entities: ['device_tracker.test'],
      animation_enabled: true,
      animation_duration: 1234,
    });
    await element.updateComplete;

    const configChangedSpy = vi.fn();
    element.addEventListener('config-changed', configChangedSpy);

    toggleSwitch(element.shadowRoot!, 'animation_enabled', false);

    expect(configChangedSpy).toHaveBeenCalledTimes(1);
    const newConfig = (configChangedSpy.mock.calls[0][0] as CustomEvent).detail.config as RadarCardConfig;

    expect(newConfig.animation_enabled).toBe(false);
    expect(newConfig.animation_duration).toBeUndefined();
  });

  it('clears radar_max_distance when auto_radar_max_distance is turned back on', async () => {
    element.setConfig({
      type: 'custom:radar-card',
      entities: ['device_tracker.test'],
      auto_radar_max_distance: false,
      radar_max_distance: 75,
    });
    await element.updateComplete;

    const configChangedSpy = vi.fn();
    element.addEventListener('config-changed', configChangedSpy);

    toggleSwitch(element.shadowRoot!, 'auto_radar_max_distance', true);

    expect(configChangedSpy).toHaveBeenCalledTimes(1);
    const newConfig = (configChangedSpy.mock.calls[0][0] as CustomEvent).detail.config as RadarCardConfig;

    expect(newConfig.auto_radar_max_distance).toBeUndefined(); // true is the default, key removed
    expect(newConfig.radar_max_distance).toBeUndefined();
  });

  it('clears legend_position and legend_show_distance when show_legend is turned off', async () => {
    element.setConfig({
      type: 'custom:radar-card',
      entities: ['device_tracker.test'],
      legend_position: 'left',
      legend_show_distance: true,
    });
    await element.updateComplete;

    const configChangedSpy = vi.fn();
    element.addEventListener('config-changed', configChangedSpy);

    toggleSwitch(element.shadowRoot!, 'show_legend', false);

    expect(configChangedSpy).toHaveBeenCalledTimes(1);
    const newConfig = (configChangedSpy.mock.calls[0][0] as CustomEvent).detail.config as RadarCardConfig;

    expect(newConfig.show_legend).toBe(false);
    expect(newConfig.legend_position).toBeUndefined();
    expect(newConfig.legend_show_distance).toBeUndefined();
  });
});