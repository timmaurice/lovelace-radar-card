import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/radar-card';
import type { RadarCard } from '../src/radar-card';
import { HassEntity, HomeAssistant, RadarCardConfig } from '../src/types';
import { fireEvent } from '../src/utils';

// Mock the fireEvent utility
vi.mock('../src/utils', async () => {
  const original = await vi.importActual('../src/utils');
  return {
    ...original,
    fireEvent: vi.fn(),
  };
});
// Mock console.info
vi.spyOn(console, 'info').mockImplementation(() => {});

// Define a minimal interface for the ha-card element to satisfy TypeScript
interface HaCard extends HTMLElement {
  header?: string;
}

describe('RadarCard', () => {
  let element: RadarCard;
  let hass: HomeAssistant;
  let config: RadarCardConfig;

  beforeEach(() => {
    hass = {
      localize: (key: string) => key,
      entities: {},
      callWS: vi.fn(),
      states: {},
      language: 'en',
      locale: {
        language: 'en',
        number_format: 'comma_decimal',
        time_format: '12',
      },
      config: {
        latitude: 52.520008,
        longitude: 13.404954,
        elevation: 30,
        unit_system: {
          length: 'km',
        },
        time_zone: 'Europe/Berlin',
        location_name: 'Home',
      },
    } as unknown as HomeAssistant;

    config = {
      type: 'custom:radar-card',
      entities: ['device_tracker.test_device'],
    };

    element = document.createElement('radar-card') as RadarCard;
    document.body.appendChild(element);
  });

  afterEach(() => {
    document.body.removeChild(element);
    vi.clearAllMocks();
  });

  it('should create the component instance', () => {
    expect(element).toBeInstanceOf(HTMLElement);
    expect(element.tagName.toLowerCase()).toBe('radar-card');
  });

  it('should throw an error if no entities are provided', () => {
    expect(() => element.setConfig({ type: 'custom:radar-card', entities: [] })).toThrow(
      'You need to define at least one entity',
    );
  });

  it('should render a title if provided', async () => {
    element.hass = hass;
    element.setConfig({ ...config, title: 'My Radar' });
    await element.updateComplete;

    const card = element.shadowRoot?.querySelector<HaCard>('ha-card');
    expect(card?.header).toBe('My Radar');
  });

  it('should render "no entities" message when no points are available', async () => {
    element.hass = hass;
    element.setConfig(config);
    await element.updateComplete;

    const noEntities = element.shadowRoot?.querySelector('.no-entities');
    expect(noEntities).not.toBeNull();
    expect(noEntities?.textContent).toBe('No entities to show');
  });

  it('should render the radar chart when points are available', async () => {
    hass.states['device_tracker.test_device'] = {
      entity_id: 'device_tracker.test_device',
      state: 'home',
      attributes: {
        latitude: 52.52,
        longitude: 13.41,
        friendly_name: 'Test Device',
      },
    } as HassEntity;
    element.hass = hass;
    element.setConfig(config);
    await element.updateComplete;

    const radarChart = element.shadowRoot?.querySelector('.radar-chart');
    expect(radarChart).not.toBeNull();
    const noEntities = element.shadowRoot?.querySelector('.no-entities');
    expect(noEntities).toBeNull();
  });

  it('should render the radar chart with a default entity color', async () => {
    hass.states['device_tracker.test_device'] = {
      entity_id: 'device_tracker.test_device',
      state: 'home',
      attributes: {
        latitude: 52.52,
        longitude: 13.41,
        friendly_name: 'Test Device',
      },
    } as HassEntity;

    element.hass = hass;
    element.setConfig({
      ...config,
      entity_color: 'rgb(0, 255, 0)',
    });
    await element.updateComplete;

    const entityDot = element.shadowRoot?.querySelector<SVGCircleElement>('circle.entity-dot');
    expect(entityDot).not.toBeNull();
    expect(entityDot?.style.fill).toBe('rgb(0, 255, 0)');
  });

  it('should render the radar chart with a custom entity color', async () => {
    hass.states['device_tracker.test_device'] = {
      entity_id: 'device_tracker.test_device',
      state: 'home',
      attributes: {
        latitude: 52.52,
        longitude: 13.41,
        friendly_name: 'Test Device',
      },
    } as HassEntity;

    element.hass = hass;
    element.setConfig({
      type: 'custom:radar-card',
      entities: [{ entity: 'device_tracker.test_device', color: 'rgb(255, 0, 0)' }],
    });
    await element.updateComplete;

    const entityDot = element.shadowRoot?.querySelector<SVGCircleElement>('circle.entity-dot');
    expect(entityDot).not.toBeNull();
    expect(entityDot?.style.fill).toBe('rgb(255, 0, 0)');
  });

  it('should fire hass-more-info when a point is clicked by default', async () => {
    hass.states['device_tracker.test_device'] = {
      entity_id: 'device_tracker.test_device',
      state: 'home',
      attributes: { latitude: 52.52, longitude: 13.41 },
    } as HassEntity;

    element.hass = hass;
    element.setConfig(config); // points_clickable is not set, should default to true
    await element.updateComplete;

    const entityDot = element.shadowRoot?.querySelector<SVGCircleElement>('circle.entity-dot');
    entityDot?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(fireEvent).toHaveBeenCalledWith(element, 'hass-more-info', { entityId: 'device_tracker.test_device' });
  });

  it('should NOT fire hass-more-info when a point is clicked and points_clickable is false', async () => {
    hass.states['device_tracker.test_device'] = {
      entity_id: 'device_tracker.test_device',
      state: 'home',
      attributes: { latitude: 52.52, longitude: 13.41 },
    } as HassEntity;

    element.hass = hass;
    element.setConfig({ ...config, points_clickable: false });
    await element.updateComplete;

    const entityDot = element.shadowRoot?.querySelector<SVGCircleElement>('circle.entity-dot');
    entityDot?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(fireEvent).not.toHaveBeenCalled();
  });

  it('should show a tooltip on mouseover', async () => {
    hass.states['device_tracker.test_device'] = {
      entity_id: 'device_tracker.test_device',
      state: 'home',
      attributes: { latitude: 52.52, longitude: 13.41, friendly_name: 'My Test Device' },
    } as HassEntity;
    element.hass = hass;
    element.setConfig(config);
    await element.updateComplete;

    const entityDot = element.shadowRoot?.querySelector<SVGCircleElement>('circle.entity-dot');
    entityDot?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await element.updateComplete;

    const tooltip = element.shadowRoot?.querySelector('.custom-tooltip');
    expect(tooltip?.classList.contains('visible')).toBe(true);
    expect(tooltip?.innerHTML).toContain('My Test Device');
    expect(tooltip?.innerHTML).toContain('Distance');
    expect(tooltip?.innerHTML).toContain('Azimuth');
  });
});
