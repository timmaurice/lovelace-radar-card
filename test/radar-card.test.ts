import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RadarCard as RadarCardClass } from '../src/radar-card';
import type { RadarCard, RadarMarker, RadarPoint } from '../src/radar-card';
import { HaDialog, HassEntity, HomeAssistant, RadarCardConfig } from '../src/types';
import { fireEvent } from '../src/utils';
import { handleAction } from 'custom-card-helpers';
import { childrenMatching, defineHaElementStandIns, removedTags, unslottedChildren } from './ha-elements';

// The marker dialog is only meaningful against the slots HA's dialog really has.
defineHaElementStandIns();

// Mock the localize function
vi.mock('../src/localize', () => ({
  localize: (hass: HomeAssistant, key: string, placeholders: Record<string, string | number> = {}): string => {
    if (key === 'component.radar-card.card.error.entity_not_found') {
      return `Entity '${placeholders.entity}' was not found.`;
    }
    if (key === 'component.radar-card.card.a11y.toggle_pulse') {
      return `Toggle pulse for ${placeholders.name}`;
    }
    if (key === 'component.radar-card.card.a11y.description') {
      return `Showing ${placeholders.count} entities.`;
    }
    if (key === 'component.radar-card.card.beyond_range') {
      return 'Beyond range';
    }
    if (key === 'component.radar-card.card.no_entities') {
      return 'No entities to show';
    }
    if (key === 'component.radar-card.card.distance') {
      return 'Distance';
    }
    if (key === 'component.radar-card.card.azimuth') {
      return 'Azimuth';
    }
    if (key === 'component.radar-card.card.dialog.name') {
      return 'Name';
    }
    if (key === 'component.radar-card.card.dialog.color') {
      return 'Color';
    }
    if (key === 'component.radar-card.card.dialog.cancel') {
      return 'Cancel';
    }
    if (key === 'component.radar-card.card.dialog.delete') {
      return 'Delete';
    }
    return key.split('.').pop() || key;
  },
}));

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

// Mock custom-card-helpers
vi.mock('custom-card-helpers', () => ({
  handleAction: vi.fn(),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Define a minimal interface for the ha-card element to satisfy TypeScript
interface HaCard extends HTMLElement {
  header?: string;
}

describe('RadarCard', () => {
  let element: RadarCard;
  let hass: HomeAssistant;
  let config: RadarCardConfig;

  beforeEach(() => {
    // beforeEach is now fully synchronous
    vi.useFakeTimers();
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
      animation_enabled: false,
    };
  });
  afterEach(() => {
    // Most tests leave their card attached. Detaching them here is what stops a
    // half-run d3 transition from one test firing into the next one's timers.
    for (const card of Array.from(document.body.querySelectorAll('radar-card'))) card.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorageMock.clear();
  });

  describe('Initialization and Configuration', () => {
    it('should create the component instance', () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.tagName.toLowerCase()).toBe('radar-card');
      document.body.removeChild(element);
    });

    it('should throw an error if no entities are provided', () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      expect(() => element.setConfig({ type: 'custom:radar-card', entities: [] })).toThrow(
        'You need to define at least one entity or enable markers',
      );
      document.body.removeChild(element);
    });

    it('should render a title if provided', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, title: 'My Radar' });
      await element.updateComplete;

      const card = element.shadowRoot?.querySelector<HaCard>('ha-card');
      expect(card?.header).toBe('My Radar');
    });

    it('should render "no entities" message when no points are available', async () => {
      // No entity state in hass, so no points will be calculated
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const noEntities = element.shadowRoot?.querySelector('.no-entities');
      expect(noEntities).not.toBeNull();
      expect(noEntities?.textContent).toBe('No entities to show');
    });
  });

  describe('Rendering and Interaction with Data', () => {
    beforeEach(() => {
      hass.states['device_tracker.test_device'] = {
        entity_id: 'device_tracker.test_device',
        state: 'home',
        attributes: {
          latitude: 52.52,
          longitude: 13.41,
          friendly_name: 'Test Device',
        },
      } as HassEntity;
    });

    it('should render the radar chart when points are available', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const radarChart = element.shadowRoot?.querySelector('.radar-chart');
      expect(radarChart).not.toBeNull();
      const noEntities = element.shadowRoot?.querySelector('.no-entities');
      expect(noEntities).toBeNull();
    });

    it('should render the radar chart with a default entity color', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({
        ...config,
        entity_color: 'rgb(0, 255, 0)',
      });
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const entityGroup = element.shadowRoot?.querySelector<SVGGElement>('g.entity-group');
      expect(entityGroup).not.toBeNull();
      expect(entityGroup?.style.fill).toBe('rgb(0, 255, 0)');
    });

    it('should render the radar chart with a custom entity color', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({
        ...config,
        entities: [{ entity: 'device_tracker.test_device', color: 'rgb(255, 0, 0)' }],
      });
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const entityGroup = element.shadowRoot?.querySelector<SVGGElement>('g.entity-group');
      expect(entityGroup).not.toBeNull();
      expect(entityGroup?.style.fill).toBe('rgb(255, 0, 0)');
    });

    it('should fire hass-more-info when a point is clicked by default', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig(config); // points_clickable is not set, should default to true
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const entityDot = element.shadowRoot?.querySelector<SVGCircleElement>('circle.entity-dot');
      entityDot?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(fireEvent).toHaveBeenCalledWith(element, 'hass-more-info', { entityId: 'device_tracker.test_device' });
    });

    it('should show a tooltip on mouseover', async () => {
      hass.states['device_tracker.test_device'].attributes.friendly_name = 'My Test Device';
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const entityDot = element.shadowRoot?.querySelector<SVGCircleElement>('circle.entity-dot');
      entityDot?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await element.updateComplete;

      const tooltip = element.shadowRoot?.querySelector('.custom-tooltip');
      expect(tooltip?.classList.contains('visible')).toBe(true);
      expect(tooltip?.innerHTML).toContain('My Test Device');
      expect(tooltip?.innerHTML).toContain('Distance');
      expect(tooltip?.innerHTML).toContain('Azimuth');
    });

    it('should hide entities natively when hide_at_home is true and string literal tracker registers at home', async () => {
      hass.states['device_tracker.home_device'] = {
        entity_id: 'device_tracker.home_device',
        state: 'home',
        attributes: { latitude: 52.52, longitude: 13.41 },
      } as HassEntity;

      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, entities: ['device_tracker.home_device'], hide_at_home: true });
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const entityDot = element.shadowRoot?.querySelector('circle.entity-dot');
      expect(entityDot).toBeNull();
    });

    it('should execute custom tap_action routing exclusively when explicitly mapped via config dictionary', async () => {
      const customAction = { action: 'navigate' as const, navigation_path: '/lovelace' };
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({
        ...config,
        entities: [{ entity: 'device_tracker.test_device', tap_action: customAction }],
      });
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const entityDot = element.shadowRoot?.querySelector<SVGCircleElement>('circle.entity-dot');
      entityDot?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(handleAction).toHaveBeenCalledWith(
        element,
        expect.anything(),
        { tap_action: customAction, entity: 'device_tracker.test_device' },
        'tap',
      );
    });
  });

  describe('Legend Configuration', () => {
    beforeEach(() => {
      hass.states['device_tracker.test_device'] = {
        entity_id: 'device_tracker.test_device',
        state: 'home',
        attributes: {
          latitude: 52.52,
          longitude: 13.41,
          friendly_name: 'Test Device',
        },
      } as HassEntity;
    });

    it('should render a legend by default', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const legend = element.shadowRoot?.querySelector('.legend');
      expect(legend).not.toBeNull();
    });

    it('should not render a legend when show_legend is false', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, show_legend: false });
      await element.updateComplete;

      const legend = element.shadowRoot?.querySelector('.legend');
      expect(legend).toBeNull();
    });

    it('should show distance in legend by default', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config }); // show_legend and legend_show_distance are default true
      await element.updateComplete;

      const legendText = element.shadowRoot?.querySelector('.legend-text-container');
      expect(legendText?.textContent).toContain('m'); // distance is small, should be in meters
    });

    it('should not show distance in legend when legend_show_distance is false', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, legend_show_distance: false });
      await element.updateComplete;

      const legendText = element.shadowRoot?.querySelector('.legend-text-container');
      expect(legendText?.textContent).not.toContain('m');
    });

    it('should position the legend at the bottom by default', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config }); // show_legend is default true
      await element.updateComplete;

      const cardContent = element.shadowRoot?.querySelector('.card-content');
      expect(cardContent?.classList.contains('flex-layout')).toBe(false);
      const legend = element.shadowRoot?.querySelector('.legend');
      expect(legend?.classList.contains('bottom')).toBe(true);
    });

    it('should position the legend on the right', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, legend_position: 'right' }); // show_legend is default true
      await element.updateComplete;

      const cardContent = element.shadowRoot?.querySelector('.card-content');
      expect(cardContent?.classList.contains('flex-layout')).toBe(true);
      expect(cardContent?.classList.contains('legend-right')).toBe(true);
      const legend = element.shadowRoot?.querySelector('.legend');
      expect(legend?.classList.contains('right')).toBe(true);
    });

    it('should position the legend on the left', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, legend_position: 'left' }); // show_legend is default true
      await element.updateComplete;

      const cardContent = element.shadowRoot?.querySelector('.card-content');
      expect(cardContent?.classList.contains('flex-layout')).toBe(true);
      expect(cardContent?.classList.contains('legend-left')).toBe(true);
      const legend = element.shadowRoot?.querySelector('.legend');
      expect(legend?.classList.contains('left')).toBe(true);
    });

    it('should pulse a dot when its legend item is clicked', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config }); // show_legend is default true
      await element.updateComplete;

      const legendItem = element.shadowRoot?.querySelector('.legend-item') as HTMLElement;
      legendItem.click();
      await element.updateComplete;

      let group = element.shadowRoot?.querySelector('g.entity-group');
      expect(group?.classList.contains('pulsing')).toBe(true);

      legendItem.click(); // toggle off
      await element.updateComplete;

      group = element.shadowRoot?.querySelector('g.entity-group');
      expect(group?.classList.contains('pulsing')).toBe(false);
    });

    it('should render an avatar in the legend when show_avatars is true and an entity_picture exists', async () => {
      hass.states['device_tracker.test_device'].attributes.entity_picture = 'https://example.com/avatar.png';
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, show_avatars: true });
      await element.updateComplete;

      const legendAvatar = element.shadowRoot?.querySelector('.legend-avatar');
      expect(legendAvatar).not.toBeNull();
      const legendColor = element.shadowRoot?.querySelector('.legend-color');
      expect(legendColor).toBeNull();
    });

    it('should fallback to colored dot in the legend if show_avatars is disabled despite possessing an entity_picture', async () => {
      hass.states['device_tracker.test_device'].attributes.entity_picture = 'https://example.com/avatar.png';
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, show_avatars: false });
      await element.updateComplete;

      const legendAvatar = element.shadowRoot?.querySelector('.legend-avatar');
      expect(legendAvatar).toBeNull();
      const legendColor = element.shadowRoot?.querySelector('.legend-color');
      expect(legendColor).not.toBeNull();
    });
  });

  describe('Grid Labels Configuration', () => {
    beforeEach(() => {
      hass.states['device_tracker.test_device'] = {
        entity_id: 'device_tracker.test_device',
        state: 'home',
        attributes: {
          latitude: 52.52,
          longitude: 13.41,
          friendly_name: 'Test Device',
        },
      } as HassEntity;
    });

    it('should render grid labels by default', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const gridLabels = element.shadowRoot?.querySelectorAll('.grid-label');
      expect(gridLabels?.length).toBeGreaterThan(0);
    });

    it('should not render grid labels when show_grid_labels is false', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, show_grid_labels: false });
      await element.updateComplete;

      const gridLabels = element.shadowRoot?.querySelectorAll('.grid-label');
      expect(gridLabels?.length).toBe(0);
    });
  });

  describe('Radar Scaling', () => {
    it('should use radar_max_distance for scale when auto_radar_max_distance is false', async () => {
      hass.states['device_tracker.test_device'] = {
        entity_id: 'device_tracker.test_device',
        state: 'home',
        attributes: { latitude: 52.52, longitude: 13.41, friendly_name: 'Test Device' },
      } as HassEntity;
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, auto_radar_max_distance: false, radar_max_distance: 50 });
      await element.updateComplete;

      const gridLabels = element.shadowRoot?.querySelectorAll<SVGTextElement>('.grid-label');
      const lastLabel = gridLabels?.[gridLabels.length - 1];
      // With a domain of [0, 50], d3.ticks(4) will produce [0, 10, 20, 30, 40, 50].
      // The labels are for ticks.slice(1), so the last one is for 50.
      expect(lastLabel?.textContent).toContain('50');
    });

    it('should auto scale by default', async () => {
      hass.states['device_tracker.test_device_far'] = {
        entity_id: 'device_tracker.test_device_far',
        state: 'not_home',
        attributes: { latitude: 52.6, longitude: 13.5, friendly_name: 'Far Device' }, // approx 9.5km
      } as HassEntity;
      hass.states['device_tracker.test_device_close'] = {
        entity_id: 'device_tracker.test_device_close',
        state: 'home',
        attributes: { latitude: 52.52, longitude: 13.41, friendly_name: 'Close Device' }, // approx 0.3km
      } as HassEntity;

      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({
        ...config,
        entities: ['device_tracker.test_device_far', 'device_tracker.test_device_close'],
        animation_enabled: false,
      });
      await vi.runAllTimersAsync();

      const entityGroups = element.shadowRoot?.querySelectorAll<SVGGElement>('g.entity-group');
      const radii = Array.from(entityGroups!).map((group) => {
        const transform = group.getAttribute('transform');
        const match = transform?.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (match) {
          const cx = parseFloat(match[1]);
          const cy = parseFloat(match[2]);
          return Math.sqrt(cx * cx + cy * cy);
        }
        return 0;
      });

      // Far dot should be at the edge (radius 90), close dot should be near the center.
      expect(Math.max(...radii)).toBeCloseTo(90, 0);
      expect(Math.min(...radii)).toBeLessThan(10);

      // The outermost ring is the chart's edge, so the radar fills its box.
      // d3's round ticks stopped at the last step inside the domain, which left
      // a fifth of the chart empty whenever the furthest entity sat just under a
      // round number - and the haversine puts a nominal kilometre at 999.998 m.
      const ringRadii = Array.from(element.shadowRoot!.querySelectorAll('circle.grid-circle')).map((circle) =>
        parseFloat(circle.getAttribute('r') ?? '0'),
      );
      expect(ringRadii).toHaveLength(4);
      expect(Math.max(...ringRadii)).toBeCloseTo(90, 0);
      const gaps = ringRadii
        .slice()
        .sort((a, b) => a - b)
        .map((radius, index, all) => radius - (index === 0 ? 0 : all[index - 1]));
      for (const gap of gaps) expect(gap).toBeCloseTo(90 / 4, 0);
    });

    it('should still draw grid rings when the most distant entity is at distance 0', async () => {
      hass.states['device_tracker.test_device'] = {
        entity_id: 'device_tracker.test_device',
        state: 'home',
        // Exactly on the configured home coordinates, so the distance is 0.
        attributes: { latitude: 52.520008, longitude: 13.404954, friendly_name: 'Test Device' },
      } as HassEntity;

      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const gridCircles = element.shadowRoot?.querySelectorAll<SVGCircleElement>('.grid-circle');
      expect(gridCircles?.length).toBeGreaterThan(0);
      const radii = Array.from(gridCircles!).map((c) => parseFloat(c.getAttribute('r') || '0'));
      expect(Math.min(...radii)).toBeGreaterThan(0);
      expect(radii.every((r) => Number.isFinite(r))).toBe(true);
    });

    it('should place an entity at distance 0 in the center, not at half the radius', async () => {
      hass.states['device_tracker.test_device'] = {
        entity_id: 'device_tracker.test_device',
        state: 'home',
        attributes: { latitude: 52.520008, longitude: 13.404954, friendly_name: 'Test Device' },
      } as HassEntity;

      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const entityGroup = element.shadowRoot?.querySelector<SVGGElement>('g.entity-group');
      const match = entityGroup?.getAttribute('transform')?.match(/translate\(([^,]+),\s*([^)]+)\)/);
      expect(match).not.toBeNull();
      const cx = parseFloat(match![1]);
      const cy = parseFloat(match![2]);
      expect(Math.sqrt(cx * cx + cy * cy)).toBeCloseTo(0, 5);
    });

    it('should scale to its own data when every entity is only tens of metres away', async () => {
      // ~20 m and ~50 m north of the configured home coordinates.
      hass.states['device_tracker.test_device_near'] = {
        entity_id: 'device_tracker.test_device_near',
        state: 'home',
        attributes: { latitude: 52.520188, longitude: 13.404954, friendly_name: 'Near Device' },
      } as HassEntity;
      hass.states['device_tracker.test_device_edge'] = {
        entity_id: 'device_tracker.test_device_edge',
        state: 'home',
        attributes: { latitude: 52.520458, longitude: 13.404954, friendly_name: 'Edge Device' },
      } as HassEntity;

      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({
        ...config,
        entities: ['device_tracker.test_device_near', 'device_tracker.test_device_edge'],
      });
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const entityGroups = element.shadowRoot?.querySelectorAll<SVGGElement>('g.entity-group');
      const radii = Array.from(entityGroups!).map((group) => {
        const match = group.getAttribute('transform')?.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (!match) return 0;
        const cx = parseFloat(match[1]);
        const cy = parseFloat(match[2]);
        return Math.sqrt(cx * cx + cy * cy);
      });

      // The furthest entity defines the outer edge of the chart (radius 90), not a fixed 0.1
      // floor, which would bunch both dots into the inner half.
      expect(Math.max(...radii)).toBeCloseTo(90, 0);

      // ...and the rings are labelled against that same ~50 m span, not against 0.1 km.
      const gridLabels = element.shadowRoot?.querySelectorAll<SVGTextElement>('.grid-label');
      const lastLabel = gridLabels?.[gridLabels!.length - 1]?.textContent ?? '';
      const [outerValue, outerUnit] = lastLabel.trim().split(' ');
      const outerMetres = outerUnit === 'km' ? parseFloat(outerValue) * 1000 : parseFloat(outerValue);
      expect(outerMetres).toBeGreaterThan(0);
      expect(outerMetres).toBeLessThan(60);
    });
  });

  describe('Duplicate resource registration', () => {
    it('should not throw when the bundle is evaluated a second time', async () => {
      vi.resetModules();
      await expect(import('../src/radar-card')).resolves.toBeDefined();
    });

    it('should register the card in customCards only once when loaded twice', async () => {
      vi.resetModules();
      await import('../src/radar-card');

      const entries = (window.customCards ?? []).filter((card) => card.type === 'radar-card');
      expect(entries).toHaveLength(1);
    });
  });

  describe('Custom Center Coordinates', () => {
    beforeEach(() => {
      hass.states['device_tracker.test_device'] = {
        entity_id: 'device_tracker.test_device',
        state: 'home',
        attributes: {
          latitude: 52.52,
          longitude: 13.41,
          friendly_name: 'Test Device',
        },
      } as HassEntity;
    });

    it('should use custom center coordinates when provided', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, center_latitude: 48.8566, center_longitude: 2.3522 });
      await element.updateComplete;

      const error = element.shadowRoot?.querySelector('.warning');
      expect(error).toBeNull();
    });

    it('should show an error if only one coordinate is provided', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, center_latitude: 48.8566 });
      await element.updateComplete;

      const error = element.shadowRoot?.querySelector('.warning');
      expect(error).not.toBeNull();
      expect(error?.textContent).toBe('incomplete_center_coords');
    });
  });

  describe('Animation', () => {
    beforeEach(() => {
      hass.states['device_tracker.test_device'] = {
        entity_id: 'device_tracker.test_device',
        state: 'not_home',
        attributes: {
          latitude: 52.53,
          longitude: 13.42,
          friendly_name: 'Moving Device',
          activity: 'Walking',
        },
      } as HassEntity;
    });

    it('should not render a ping animation by default', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;

      const ping = element.shadowRoot?.querySelector('circle.entity-ping');
      expect(ping).toBeNull();
    });

    it('should render a ping animation when enabled and entity is moving', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, moving_animation_enabled: true });
      await element.updateComplete;

      const ping = element.shadowRoot?.querySelector('circle.entity-ping');
      expect(ping).not.toBeNull();
    });

    it('should not render a ping animation when enabled but entity is not moving', async () => {
      hass.states['device_tracker.test_device'].attributes.activity = 'Stationary';
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, moving_animation_enabled: true });
      await element.updateComplete;

      const ping = element.shadowRoot?.querySelector('.entity-ping');
      expect(ping).toBeNull();
    });

    it('should respect custom moving_animation_attribute', async () => {
      hass.states['device_tracker.test_device'].attributes.motion_state = 'running';
      delete hass.states['device_tracker.test_device'].attributes.activity;
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({
        ...config,
        moving_animation_enabled: true,
        moving_animation_attribute: 'motion_state',
        moving_animation_activities: ['running'],
      });
      await element.updateComplete;

      const ping = element.shadowRoot?.querySelector('circle.entity-ping');
      expect(ping).not.toBeNull();
    });

    it('should match activities case-insensitively', async () => {
      hass.states['device_tracker.test_device'].attributes.activity = 'DRIVING';
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, moving_animation_enabled: true }); // Default activities include 'Driving'
      await element.updateComplete;

      const ping = element.shadowRoot?.querySelector('circle.entity-ping');
      expect(ping).not.toBeNull();
    });

    it('should trigger animation when test event is fired in edit mode', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      const renderSpy = vi
        .spyOn(
          element as unknown as { _renderRadarChart: (points: RadarPoint[], animate?: boolean) => void },
          '_renderRadarChart',
        )
        .mockImplementation(() => {});

      element.hass = hass;
      element.setConfig({ ...config, animation_enabled: true });
      element.editMode = true;
      await element.updateComplete;

      renderSpy.mockClear();

      window.dispatchEvent(new CustomEvent('radar-card-test-animation'));
      expect(renderSpy).toHaveBeenCalledWith(true);
    });
  });
  describe('Zone Entity Center', () => {
    beforeEach(() => {
      hass.states['device_tracker.test_device'] = {
        entity_id: 'device_tracker.test_device',
        state: 'home',
        attributes: {
          latitude: 52.52,
          longitude: 13.41,
          friendly_name: 'Test Device',
        },
      } as HassEntity;
      hass.states['zone.work'] = {
        entity_id: 'zone.work',
        state: 'zoning',
        attributes: {
          latitude: 48.8566,
          longitude: 2.3522,
          friendly_name: 'Work',
          radius: 100,
        },
      } as HassEntity;
    });

    it('should use zone entity for center when provided', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, location_zone_entity: 'zone.work' });
      await element.updateComplete;

      const error = element.shadowRoot?.querySelector('.warning');
      expect(error).toBeNull();

      // Check if a point is rendered, which means coordinates were valid
      const entityDot = element.shadowRoot?.querySelector<SVGCircleElement>('circle.entity-dot');
      expect(entityDot).not.toBeNull();
    });

    it('should show an error if both zone and manual coordinates are provided', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, location_zone_entity: 'zone.work', center_latitude: 40, center_longitude: 40 });
      await element.updateComplete;

      const error = element.shadowRoot?.querySelector('.warning');
      expect(error).not.toBeNull();
      expect(error?.textContent).toBe('multiple_center_definitions');
    });
  });

  describe('Markers', () => {
    beforeEach(() => {
      hass.states['device_tracker.center_device'] = {
        entity_id: 'device_tracker.center_device',
        state: 'home',
        attributes: {
          latitude: 52.52,
          longitude: 13.41,
          friendly_name: 'Center Device',
        },
      } as HassEntity;
      config = {
        type: 'custom:radar-card',
        center_entity: 'device_tracker.center_device',
        animation_enabled: false, // Disable animation to prevent test timeouts with d3
        entities: [],
      };
    });

    it('should not show the add marker button by default', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      // This config is valid because it has an entity, but enable_markers is false
      element.hass = hass;
      element.setConfig({
        ...config,
        entities: ['device_tracker.center_device'],
      });
      await element.updateComplete;

      const addButton = element.shadowRoot?.querySelector('ha-icon-button.add-marker-btn');
      expect(addButton).toBeNull();
    });

    it('should show the add marker button when enabled in moving mode', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, entities: ['device_tracker.center_device'], enable_markers: true });
      await element.updateComplete;
      await vi.runAllTimersAsync(); // Ensure all async rendering is done

      const addButton = element.shadowRoot?.querySelector('ha-icon-button.add-marker-btn');
      expect(addButton).not.toBeNull();
    });

    it('should not show the add marker button when enabled in static mode', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({
        ...config,
        type: 'custom:radar-card', // Static mode (no center_entity)
        entities: [],
        enable_markers: true,
        animation_enabled: false,
      });
      await element.updateComplete;

      const addButton = element.shadowRoot?.querySelector('ha-icon-button.add-marker-btn');
      expect(addButton).toBeNull();
    });

    it('should open a dialog when the add marker button is clicked', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, entities: ['device_tracker.center_device'], enable_markers: true });
      await element.updateComplete;
      await vi.runAllTimersAsync(); // Ensure all async rendering is done

      const addButton = element.shadowRoot?.querySelector<HTMLElement>('ha-icon-button.add-marker-btn');
      addButton?.click();
      await element.updateComplete;

      const dialog = element.shadowRoot?.querySelector<HaDialog>('ha-dialog');
      expect(dialog).not.toBeNull();
      // The default name comes from the translations now, not from a hard-coded
      // English string, so the mock's key stand-in is what lands in the title.
      expect(dialog?.headerTitle).toContain('marker_default_name');
    });

    it('draws the add marker button with ha-icon-button, the way that element takes it', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, entities: ['device_tracker.center_device'], enable_markers: true });
      await element.updateComplete;

      const addButton = element.shadowRoot!.querySelector<HTMLElement & { label?: string }>(
        'ha-icon-button.add-marker-btn',
      )!;
      // ha-icon-button turns `label` into the inner button's aria-label and
      // tooltip, and takes its icon in the default slot. ha-fab's `icon` slot
      // does not exist there.
      expect(addButton.label).toBe('add_marker_button');
      expect(unslottedChildren(addButton)).toEqual([]);
      expect(addButton.querySelector('ha-icon')?.getAttribute('icon')).toBe('mdi:map-marker-plus');
    });

    it('renders no element HA has removed from its frontend, with markers on', async () => {
      localStorageMock.setItem(
        'radar-card-markers',
        JSON.stringify([{ id: '1', name: 'Marker', latitude: 52.53, longitude: 13.42 }]),
      );
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, entities: ['device_tracker.center_device'], enable_markers: true });
      await element.updateComplete;

      expect(removedTags(element.shadowRoot!)).toEqual([]);
    });

    it('should not leave an error banner behind when the gesture finds no centre', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, entities: ['device_tracker.center_device'], enable_markers: true });
      await element.updateComplete;
      await vi.runAllTimersAsync();

      // The centre entity goes away between renders. Only `willUpdate` clears
      // `_error`, and a click alone does not re-run it, so an error raised from
      // the gesture would replace the whole card with a banner nothing takes
      // down again.
      delete hass.states['device_tracker.center_device'];

      const addButton = element.shadowRoot?.querySelector<HTMLElement>('ha-icon-button.add-marker-btn');
      addButton?.click();
      await element.updateComplete;
      await vi.runAllTimersAsync();

      expect(element.shadowRoot?.querySelector('.card-content.warning')).toBeNull();
      // No centre, so no marker dialog either - it just does nothing.
      expect(element.shadowRoot?.querySelector('ha-dialog')).toBeNull();
    });

    it('should add a marker when dialog is saved', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, entities: ['device_tracker.center_device'], enable_markers: true });
      await element.updateComplete;
      await vi.runAllTimersAsync(); // Ensure all async rendering is done

      // Open and save dialog
      const addButton = element.shadowRoot?.querySelector<HTMLElement>('ha-icon-button.add-marker-btn');
      addButton?.click();
      await element.updateComplete;

      const saveButton = element.shadowRoot?.querySelector<HTMLElement>(
        'ha-dialog-footer ha-button[slot="primaryAction"]',
      );
      saveButton?.click();
      await element.updateComplete;

      // Check localStorage
      const storedMarkers = JSON.parse(localStorageMock.getItem('radar-card-markers') || '[]');
      expect(storedMarkers.length).toBe(1);
      expect(storedMarkers[0].latitude).toBe(52.52);

      // Check if marker is rendered
      const markerPath = element.shadowRoot?.querySelector('path.entity-dot');
      expect(markerPath).not.toBeNull();
    });

    it('should render a marker with a triangle in the legend', async () => {
      const marker: RadarMarker = {
        id: '1',
        name: 'Test Marker',
        latitude: 52.53,
        longitude: 13.42,
      };
      localStorageMock.setItem('radar-card-markers', JSON.stringify([marker]));

      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, enable_markers: true });
      await element.updateComplete;

      const legendItem = element.shadowRoot?.querySelector('.legend-item');
      expect(legendItem).not.toBeNull();
      const legendMarker = legendItem?.querySelector('.legend-marker');
      expect(legendMarker).not.toBeNull();
      const legendDot = legendItem?.querySelector('.legend-color');
      expect(legendDot).toBeNull();
    });

    it('should open edit dialog when a marker is clicked', async () => {
      const marker: RadarMarker = {
        id: '1',
        name: 'Editable Marker',
        latitude: 52.53,
        longitude: 13.42,
      };
      localStorageMock.setItem('radar-card-markers', JSON.stringify([marker]));

      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, enable_markers: true });
      await element.updateComplete;

      const markerGroup = element.shadowRoot?.querySelector<SVGGElement>('g.entity-group');
      markerGroup?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await element.updateComplete;

      const dialog = element.shadowRoot?.querySelector<HaDialog>('ha-dialog');
      expect(dialog).not.toBeNull();
      expect(dialog?.headerTitle).toBe('Editable Marker');
    });

    describe('Marker dialog against the ha-dialog API', () => {
      const marker: RadarMarker = {
        id: '1',
        name: 'Editable Marker',
        latitude: 52.53,
        longitude: 13.42,
        color: '#123456',
      };

      async function openDialog(): Promise<HaDialog> {
        localStorageMock.setItem('radar-card-markers', JSON.stringify([marker]));
        element = document.createElement('radar-card') as RadarCard;
        document.body.appendChild(element);
        element.hass = hass;
        element.setConfig({ ...config, enable_markers: true });
        await element.updateComplete;

        const markerGroup = element.shadowRoot?.querySelector<SVGGElement>('g.entity-group');
        markerGroup?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await element.updateComplete;
        return element.shadowRoot!.querySelector<HaDialog>('ha-dialog')!;
      }

      it('puts the title in headerTitle, not in the mwc-era heading', async () => {
        const dialog = await openDialog();

        expect(dialog.open).toBe(true);
        expect(dialog.headerTitle).toBe('Editable Marker');
        expect(dialog).not.toHaveProperty('heading');
      });

      it('gives every child of the dialog a slot the dialog really has', async () => {
        const dialog = await openDialog();

        // A child aimed at a slot the dialog does not render is not shown at all.
        // That is what happened to the buttons in `primaryAction`/`secondaryAction`.
        expect(unslottedChildren(dialog).map((el) => el.outerHTML.slice(0, 60))).toEqual([]);
        expect(childrenMatching(dialog, 'ha-dialog-footer').map((el) => el.assignedSlot?.name)).toEqual(['footer']);
      });

      it('lays out delete, cancel and save in the slots of ha-dialog-footer', async () => {
        const dialog = await openDialog();
        const [footer] = childrenMatching(dialog, 'ha-dialog-footer');

        expect(unslottedChildren(footer)).toEqual([]);
        const bySlot = (slot: string) =>
          childrenMatching(footer, `ha-button[slot="${slot}"]`).map((b) => b.textContent?.trim());
        expect(bySlot('secondaryAction')).toEqual(['Delete', 'Cancel']);
        expect(bySlot('primaryAction')).toEqual(['save']);
      });

      it('renders no element HA has removed from its frontend', async () => {
        const dialog = await openDialog();

        expect(removedTags(dialog)).toEqual([]);
      });

      it('saves what was typed into the ha-input fields', async () => {
        const dialog = await openDialog();

        const nameInput = dialog.querySelector<HTMLInputElement>('ha-input[name="name"]')!;
        const colorInput = dialog.querySelector<HTMLInputElement>('ha-input[name="color"]')!;
        // ha-input updates its own value before the input event leaves it.
        nameInput.value = 'Renamed';
        nameInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        colorInput.value = '#abcdef';
        colorInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        await element.updateComplete;

        expect(dialog.headerTitle).toBe('Renamed');
        dialog.querySelector<HTMLElement>('ha-button[slot="primaryAction"]')!.click();
        await element.updateComplete;

        const stored = JSON.parse(localStorageMock.getItem('radar-card-markers') || '[]');
        expect(stored).toEqual([expect.objectContaining({ id: '1', name: 'Renamed', color: '#abcdef' })]);
        expect(element.shadowRoot?.querySelector('ha-dialog')).toBeNull();
      });

      it('discards the edit when the dialog closes itself (Escape, scrim)', async () => {
        const dialog = await openDialog();

        const nameInput = dialog.querySelector<HTMLInputElement>('ha-input[name="name"]')!;
        nameInput.value = 'Not kept';
        nameInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        // ha-dialog fires `closed`, without detail, once its hide animation ends.
        dialog.dispatchEvent(new CustomEvent('closed', { bubbles: true, composed: true }));
        await element.updateComplete;

        expect(element.shadowRoot?.querySelector('ha-dialog')).toBeNull();
        const stored = JSON.parse(localStorageMock.getItem('radar-card-markers') || '[]');
        expect(stored).toEqual([expect.objectContaining({ name: 'Editable Marker' })]);
      });

      it('stays open when something nested inside the dialog reports closed', async () => {
        const dialog = await openDialog();

        dialog
          .querySelector('ha-input[name="name"]')!
          .dispatchEvent(new CustomEvent('closed', { bubbles: true, composed: true }));
        await element.updateComplete;

        expect(element.shadowRoot?.querySelector('ha-dialog')).not.toBeNull();
      });
    });

    it('should delete a marker from the edit dialog', async () => {
      const marker: RadarMarker = {
        id: '1',
        name: 'Deletable Marker',
        latitude: 52.53,
        longitude: 13.42,
      };
      localStorageMock.setItem('radar-card-markers', JSON.stringify([marker]));

      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, enable_markers: true });
      await element.updateComplete;

      // Open dialog
      const markerGroup = element.shadowRoot?.querySelector<SVGGElement>('g.entity-group');
      markerGroup?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await element.updateComplete;

      // Click delete
      const deleteButton = element.shadowRoot?.querySelector<HTMLElement>('ha-dialog-footer ha-button.delete');
      deleteButton?.click();
      await element.updateComplete;

      const storedMarkers = JSON.parse(localStorageMock.getItem('radar-card-markers') || '[]');
      expect(storedMarkers.length).toBe(0);
      const markerPath = element.shadowRoot?.querySelector('path.entity-dot');
      expect(markerPath).toBeNull();
    });
  });

  describe('Entity Avatars Configuration', () => {
    beforeEach(() => {
      hass.states['device_tracker.avatar_device'] = {
        entity_id: 'device_tracker.avatar_device',
        state: 'home',
        attributes: {
          latitude: 52.52,
          longitude: 13.41,
          friendly_name: 'Avatar Device',
          entity_picture: 'https://example.com/profile.jpg',
        },
      } as HassEntity;
    });

    it('should build avatar image node when show_avatars is set', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, entities: ['device_tracker.avatar_device'], show_avatars: true });
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const avatarBlock = element.shadowRoot?.querySelector('.entity-avatar');
      expect(avatarBlock).not.toBeNull();
      const img = avatarBlock?.querySelector('img');
      expect(img?.getAttribute('src')).toBe('https://example.com/profile.jpg');
    });

    it('should not display the native target dot when a valid avatar is active', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, entities: ['device_tracker.avatar_device'], show_avatars: true });
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const entityDot = element.shadowRoot?.querySelector<SVGCircleElement>('circle.entity-dot');
      expect(entityDot?.style.display).toBe('none');
    });

    it.each([true, false])('should never show an avatar frame for a marker (show_avatars: %s)', async (showAvatars) => {
      const marker: RadarMarker = { id: '1', name: 'Avatarless Marker', latitude: 52.53, longitude: 13.42 };
      localStorageMock.setItem('radar-card-markers', JSON.stringify([marker]));

      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, enable_markers: true, show_avatars: showAvatars });
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const markerGroup = element.shadowRoot?.querySelector('path.entity-dot')?.closest('g.entity-group');
      const avatar = markerGroup?.querySelector<SVGForeignObjectElement>('.entity-avatar');
      expect(avatar?.style.display).toBe('none');
      // An empty src still makes the browser draw its broken-image icon.
      expect(avatar?.querySelector('img')?.hasAttribute('src')).toBe(false);
    });

    it('should display the fallback map dot when an avatar is not physically available', async () => {
      delete hass.states['device_tracker.avatar_device'].attributes.entity_picture;
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, entities: ['device_tracker.avatar_device'], show_avatars: true });
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const entityDot = element.shadowRoot?.querySelector<SVGCircleElement>('circle.entity-dot');
      expect(entityDot?.style.display).toBe('block');
    });
  });

  describe('Entities beyond a fixed maximum distance', () => {
    const config130km = (): RadarCardConfig => ({
      ...config,
      entities: ['device_tracker.near', 'device_tracker.far'],
      auto_radar_max_distance: false,
      radar_max_distance: 1,
    });

    beforeEach(() => {
      hass.states['device_tracker.near'] = {
        entity_id: 'device_tracker.near',
        state: 'not_home',
        // Roughly half a kilometre north, comfortably inside the 1 km radar.
        attributes: { latitude: 52.524506, longitude: 13.404954, friendly_name: 'Near Device' },
      } as HassEntity;
      hass.states['device_tracker.far'] = {
        entity_id: 'device_tracker.far',
        state: 'not_home',
        // Over a hundred kilometres away - far outside a 1 km radar.
        attributes: { latitude: 53.6, longitude: 13.404954, friendly_name: 'Far Device' },
      } as HassEntity;
    });

    const radiusOf = (group: SVGGElement): number => {
      const match = group.getAttribute('transform')?.match(/translate\(([^,]+),\s*([^)]+)\)/);
      if (!match) return 0;
      return Math.hypot(parseFloat(match[1]), parseFloat(match[2]));
    };

    it('should clamp an entity beyond the maximum onto the rim instead of off-canvas', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig(config130km());
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const groups = Array.from(element.shadowRoot!.querySelectorAll<SVGGElement>('g.entity-group'));
      expect(groups).toHaveLength(2);
      const far = groups.find((group) => group.querySelector('title')?.textContent?.startsWith('Far Device'))!;
      const near = groups.find((group) => group.querySelector('title')?.textContent?.startsWith('Near Device'))!;

      // The bug: translate(5970, -10049) on a 220x220 viewBox - drawn, but
      // nowhere a reader could see it.
      expect(radiusOf(far)).toBeCloseTo(90, 0);
      expect(radiusOf(near)).toBeCloseTo(45, 0);
    });

    it('should mark the clamped entity as out of range rather than pass it off as on the rim', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig(config130km());
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const groups = Array.from(element.shadowRoot!.querySelectorAll<SVGGElement>('g.entity-group'));
      const far = groups.find((group) => group.querySelector('title')?.textContent?.startsWith('Far Device'))!;
      const near = groups.find((group) => group.querySelector('title')?.textContent?.startsWith('Near Device'))!;

      expect(far.classList.contains('out-of-range')).toBe(true);
      expect(near.classList.contains('out-of-range')).toBe(false);
      // Hollow, so it does not read as an entity sitting exactly on the ring.
      expect(far.style.fillOpacity).toBe('0');
      expect(near.style.fillOpacity).toBe('1');
      expect(far.querySelector('title')?.textContent).toContain('Beyond range');
    });

    it('should say in the legend that an entity is beyond the radar', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig(config130km());
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const items = Array.from(element.shadowRoot!.querySelectorAll('.legend-item'));
      const far = items.find((item) => item.textContent?.includes('Far Device'))!;
      const near = items.find((item) => item.textContent?.includes('Near Device'))!;
      expect(far.classList.contains('out-of-range')).toBe(true);
      expect(near.classList.contains('out-of-range')).toBe(false);
      expect(far.querySelector('ha-icon.legend-beyond-range')?.getAttribute('title')).toBe('Beyond range');
      expect(near.querySelector('ha-icon.legend-beyond-range')).toBeNull();
    });

    /**
     * Beyond the maximum every distance collapses onto the rim, so trackers on
     * one bearing are drawn at pixel-identical positions and only the topmost
     * group can receive a `mouseover`. Keyboard users reach each of them
     * through its own `tabindex`; the mouse tooltip has to name the whole pile.
     */
    it('should name every entity piled up on the same point of the rim', async () => {
      const northAt = { 10: 52.60994, 50: 52.969669, 200: 54.318651 };
      for (const [label, latitude] of Object.entries(northAt)) {
        hass.states[`device_tracker.pile_${label}`] = {
          entity_id: `device_tracker.pile_${label}`,
          state: 'not_home',
          attributes: { latitude, longitude: 13.404954, friendly_name: `Pile ${label}` },
        } as HassEntity;
      }

      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({
        ...config,
        entities: ['device_tracker.pile_10', 'device_tracker.pile_50', 'device_tracker.pile_200'],
        auto_radar_max_distance: false,
        radar_max_distance: 1,
      });
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const groups = Array.from(element.shadowRoot!.querySelectorAll<SVGGElement>('g.entity-group'));
      expect(groups).toHaveLength(3);
      // All three really are on the same point - that is the premise.
      const positions = new Set(groups.map((group) => group.getAttribute('transform')));
      expect(positions.size).toBe(1);

      // Only the last group drawn can be hovered, so that one must speak for all.
      groups[groups.length - 1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await element.updateComplete;

      const tooltip = element.shadowRoot!.querySelector('.custom-tooltip')!;
      expect(tooltip.classList.contains('visible')).toBe(true);
      for (const label of Object.keys(northAt)) expect(tooltip.textContent).toContain(`Pile ${label}`);
      // Nearest first, so the ordering the clamp destroyed is readable again.
      const order = Array.from(tooltip.querySelectorAll('.tooltip-stack-item strong')).map((el) => el.textContent);
      expect(order).toEqual(['Pile 10', 'Pile 50', 'Pile 200']);
    });

    it('should keep the tooltip to one entity when nothing shares its point', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig(config130km());
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const groups = Array.from(element.shadowRoot!.querySelectorAll<SVGGElement>('g.entity-group'));
      const far = groups.find((group) => group.querySelector('title')?.textContent?.startsWith('Far Device'))!;
      far.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await element.updateComplete;

      const tooltip = element.shadowRoot!.querySelector('.custom-tooltip')!;
      expect(tooltip.textContent).toContain('Far Device');
      expect(tooltip.textContent).not.toContain('Near Device');
      expect(tooltip.querySelectorAll('.tooltip-stack-item')).toHaveLength(0);
    });

    it('should leave an auto-scaled radar without any out-of-range entity', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, entities: ['device_tracker.near', 'device_tracker.far'] });
      await element.updateComplete;
      await vi.runAllTimersAsync();

      expect(element.shadowRoot!.querySelectorAll('g.entity-group.out-of-range')).toHaveLength(0);
    });
  });

  describe('Entities the radar cannot plot', () => {
    beforeEach(() => {
      hass.states['device_tracker.ok'] = {
        entity_id: 'device_tracker.ok',
        state: 'not_home',
        attributes: { latitude: 52.53, longitude: 13.41, friendly_name: 'Fine Device' },
      } as HassEntity;
      hass.states['device_tracker.nocoords'] = {
        entity_id: 'device_tracker.nocoords',
        state: 'not_home',
        attributes: { friendly_name: 'No Coords' },
      } as HassEntity;
      hass.states['device_tracker.unavail'] = {
        entity_id: 'device_tracker.unavail',
        state: 'unavailable',
        // Stale coordinates outlive the state - it must not be plotted as live.
        attributes: { latitude: 52.6, longitude: 13.5, friendly_name: 'Gone Device' },
      } as HassEntity;
    });

    const setup = async (entities: string[], extra: Partial<RadarCardConfig> = {}): Promise<void> => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, entities, ...extra });
      await element.updateComplete;
      await vi.runAllTimersAsync();
    };

    it('should list a missing, a coordinate-less and an unavailable entity with a reason', async () => {
      await setup([
        'device_tracker.ok',
        'device_tracker.does_not_exist',
        'device_tracker.nocoords',
        'device_tracker.unavail',
      ]);

      // Only the healthy one is on the radar, and the other three are named.
      expect(element.shadowRoot!.querySelectorAll('g.entity-group')).toHaveLength(1);
      const skipped = Array.from(element.shadowRoot!.querySelectorAll('.skipped-entity')).map((entry) =>
        entry.textContent?.replace(/\s+/g, ' ').trim(),
      );
      expect(skipped).toHaveLength(3);
      expect(skipped[0]).toBe('device_tracker.does_not_exist (not_found)');
      expect(skipped[1]).toBe('No Coords (no_location)');
      expect(skipped[2]).toBe('Gone Device (unavailable)');
    });

    it('should not plot an unavailable entity from its stale coordinates', async () => {
      await setup(['device_tracker.unavail']);

      expect(element.shadowRoot!.querySelectorAll('g.entity-group')).toHaveLength(0);
      expect(element.shadowRoot!.querySelector('.no-entities')).not.toBeNull();
      // Even with nothing to draw, the reason has to reach the reader.
      expect(element.shadowRoot!.querySelectorAll('.skipped-entity')).toHaveLength(1);
    });

    it('should say nothing about an entity hide_at_home deliberately hides', async () => {
      hass.states['device_tracker.at_home'] = {
        entity_id: 'device_tracker.at_home',
        state: 'home',
        attributes: { latitude: 52.520008, longitude: 13.404954, friendly_name: 'Home Device' },
      } as HassEntity;
      await setup(['device_tracker.ok', 'device_tracker.at_home'], { hide_at_home: true });

      expect(element.shadowRoot!.querySelectorAll('.skipped-entity')).toHaveLength(0);
    });

    it('should keep quiet when every entity is fine', async () => {
      await setup(['device_tracker.ok']);

      expect(element.shadowRoot!.querySelector('.skipped-entities')).toBeNull();
    });

    it('should name a center entity that does not exist instead of claiming there is nothing to show', async () => {
      await setup(['device_tracker.ok'], { center_entity: 'device_tracker.nope' });

      const error = element.shadowRoot?.querySelector('.warning');
      expect(error).not.toBeNull();
      expect(error?.textContent).toContain("Entity 'device_tracker.nope' was not found.");
      expect(element.shadowRoot?.querySelector('.no-entities')).toBeNull();
    });

    it('should name a missing center zone the same way', async () => {
      await setup(['device_tracker.ok'], { location_zone_entity: 'zone.nope' });

      const error = element.shadowRoot?.querySelector('.warning');
      expect(error?.textContent).toContain("Entity 'zone.nope' was not found.");
    });
  });

  describe('Lovelace API surface', () => {
    it('should pick a locatable entity for the card picker preview', () => {
      hass.states['sensor.temperature'] = {
        entity_id: 'sensor.temperature',
        state: '21',
        attributes: {},
      } as HassEntity;
      hass.states['device_tracker.no_gps'] = {
        entity_id: 'device_tracker.no_gps',
        state: 'home',
        attributes: {},
      } as HassEntity;
      hass.states['person.tim'] = {
        entity_id: 'person.tim',
        state: 'home',
        attributes: { latitude: 52.52, longitude: 13.41 },
      } as HassEntity;

      // The placeholder id nobody owns rendered the preview as "No entities to show".
      expect(RadarCardClass.getStubConfig(hass)).toEqual({ entities: ['person.tim'] });
    });

    it('should skip an entity the card refuses to plot when picking the preview', () => {
      // Coordinates outlive the state, but `_calculatePoints` will not plot an
      // unavailable or unknown tracker from them - so picking one puts the
      // preview right back to "No entities to show".
      hass.states['device_tracker.gone'] = {
        entity_id: 'device_tracker.gone',
        state: 'unavailable',
        attributes: { latitude: 52.52, longitude: 13.41 },
      } as HassEntity;
      hass.states['device_tracker.hazy'] = {
        entity_id: 'device_tracker.hazy',
        state: 'unknown',
        attributes: { latitude: 52.52, longitude: 13.41 },
      } as HassEntity;

      expect(RadarCardClass.getStubConfig(hass)).toEqual({ entities: ['device_tracker.your_device'] });

      hass.states['person.tim'] = {
        entity_id: 'person.tim',
        state: 'home',
        attributes: { latitude: 52.52, longitude: 13.41 },
      } as HassEntity;
      expect(RadarCardClass.getStubConfig(hass)).toEqual({ entities: ['person.tim'] });
    });

    it('should fall back to the placeholder when nothing can be located', () => {
      expect(RadarCardClass.getStubConfig(hass)).toEqual({ entities: ['device_tracker.your_device'] });
      expect(RadarCardClass.getStubConfig()).toEqual({ entities: ['device_tracker.your_device'] });
    });

    it('should offer grid options so a sections dashboard can size the card', () => {
      element = document.createElement('radar-card') as RadarCard;
      expect(element.getGridOptions()).toEqual({ columns: 6, rows: 'auto', min_columns: 4, min_rows: 4 });
    });

    it('should grow its card size with a legend below the chart', async () => {
      for (const index of [0, 1, 2, 3]) {
        hass.states[`device_tracker.size_${index}`] = {
          entity_id: `device_tracker.size_${index}`,
          state: 'not_home',
          attributes: { latitude: 52.53 + index / 100, longitude: 13.41, friendly_name: `Size ${index}` },
        } as HassEntity;
      }
      const entities = [0, 1, 2, 3].map((index) => `device_tracker.size_${index}`);

      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, entities });
      await element.updateComplete;
      await vi.runAllTimersAsync();

      // Four entities wrap onto two legend rows below the 3-row chart.
      expect(element.getCardSize()).toBe(5);

      element.setConfig({ ...config, entities, show_legend: false });
      await element.updateComplete;
      expect(element.getCardSize()).toBe(3);

      element.setConfig({ ...config, entities, legend_position: 'right' });
      await element.updateComplete;
      expect(element.getCardSize()).toBe(3);
    });
  });

  describe('Localized texts', () => {
    beforeEach(() => {
      hass.states['device_tracker.test_device'] = {
        entity_id: 'device_tracker.test_device',
        state: 'not_home',
        attributes: { latitude: 52.53, longitude: 13.41, friendly_name: 'Test Device' },
      } as HassEntity;
    });

    it('should localize the chart description and the legend toggle instead of hard-coding English', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;
      await vi.runAllTimersAsync();

      expect(element.shadowRoot?.querySelector('desc')?.textContent).toBe('Showing 1 entities.');
      expect(element.shadowRoot?.querySelector('.legend-item')?.getAttribute('aria-label')).toBe(
        'Toggle pulse for Test Device',
      );
    });

    it("should write the distance the way the reader's language writes it", async () => {
      hass.language = 'de';
      hass.locale = { ...hass.locale, language: 'de' };
      hass.states['device_tracker.test_device'].attributes.latitude = 52.5317;

      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;
      await vi.runAllTimersAsync();

      // toFixed writes a decimal point whatever the language, so this legend
      // used to read "1.34 km" on a German card.
      expect(element.shadowRoot?.querySelector('.legend-distance')?.textContent).toBe('(1,34 km)');
    });
  });

  describe('Teardown', () => {
    beforeEach(() => {
      hass.states['device_tracker.test_device'] = {
        entity_id: 'device_tracker.test_device',
        state: 'not_home',
        attributes: { latitude: 52.53, longitude: 13.41, friendly_name: 'Test Device' },
      } as HassEntity;
    });

    it('should not wake up on a detached element after the animation test', async () => {
      element = document.createElement('radar-card') as RadarCard;
      element.editMode = true;
      document.body.appendChild(element);
      // jsdom has no SVG transform interpolation, so the chart itself is not
      // what this test is about - the timeout the test animation leaves behind is.
      vi.spyOn(
        element as unknown as { _renderRadarChart: (points: RadarPoint[], animate?: boolean) => void },
        '_renderRadarChart',
      ).mockImplementation(() => {});
      element.hass = hass;
      element.setConfig({ ...config, animation_enabled: true, animation_duration: 500 });
      await element.updateComplete;

      window.dispatchEvent(new Event('radar-card-test-animation'));
      await element.updateComplete;

      element.remove();
      const requestUpdate = vi.spyOn(element, 'requestUpdate');
      // The pending timeout used to survive the teardown and set state on the
      // detached card once its duration was up.
      await vi.runAllTimersAsync();
      expect(requestUpdate).not.toHaveBeenCalled();
    });

    it('should interrupt the running entry animation when the card is detached', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, animation_enabled: true });
      await element.updateComplete;

      // d3 parks a schedule on every node it animates; an interrupted node loses it.
      const svg = element.shadowRoot!.querySelector('.radar-chart svg')!;
      const animating = (): Element[] => Array.from(svg.querySelectorAll('*')).filter((node) => '__transition' in node);
      expect(animating().length).toBeGreaterThan(0);

      element.remove();
      expect(animating()).toHaveLength(0);
      // And nothing is left to tick against the detached nodes.
      await vi.runAllTimersAsync();
    });
  });

  describe('Zone Entity Overlay Configuration', () => {
    beforeEach(() => {
      // Mocking zone object
      hass.states['zone.park'] = {
        entity_id: 'zone.park',
        state: 'zoning',
        attributes: {
          latitude: 52.53,
          longitude: 13.43,
          friendly_name: 'Park Zone',
          radius: 400,
        },
      } as HassEntity;
    });

    it('should parse and map standard boundary zones when explicitly requested', async () => {
      // Inject device_tracker mock to prevent early return block
      hass.states['device_tracker.tester'] = {
        entity_id: 'device_tracker.tester',
        state: 'home',
        attributes: { latitude: 52.52, longitude: 13.41 },
      } as HassEntity;

      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      // Expanding boundary bounds massively to guarantee the mock park zone natively penetrates constraints
      element.setConfig({
        ...config,
        entities: ['device_tracker.tester'],
        show_zones: true,
        auto_radar_max_distance: false,
        radar_max_distance: 1000,
      });
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const zoneOverlays = element.shadowRoot?.querySelectorAll('circle.zone-circle');
      expect(zoneOverlays?.length).toBe(1);

      // Asserts scale maps radius dynamically
      const radius = parseFloat(zoneOverlays?.[0].getAttribute('r') || '0');
      expect(radius).toBeGreaterThan(0);
    });

    it('should filter zones against the auto-scaled radius, not a stale radar_max_distance', async () => {
      // Auto scaling is on (the default), so the chart scales to the furthest entity (~0.3 km here)
      // and the leftover radar_max_distance must be ignored. The park zone sits ~2 km out, well
      // outside the auto-scaled radar, so it must not be drawn.
      hass.states['device_tracker.tester'] = {
        entity_id: 'device_tracker.tester',
        state: 'home',
        attributes: { latitude: 52.52, longitude: 13.41 },
      } as HassEntity;

      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({
        ...config,
        entities: ['device_tracker.tester'],
        show_zones: true,
        auto_radar_max_distance: true,
        radar_max_distance: 5,
      });
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const zoneOverlays = element.shadowRoot?.querySelectorAll<SVGCircleElement>('circle.zone-circle');
      expect(zoneOverlays?.length).toBe(0);
    });

    /**
     * A zone is kept when its near edge reaches inside the radar, so its centre
     * may well sit outside it. Clamping the scale the way a point position is
     * clamped saturated both the centre and the radius at the rim, which drew
     * the zone from the rim down to the centre - a circle blanketing the whole
     * radar, including the reader's own position.
     */
    describe('a zone centred beyond the maximum', () => {
      const NORTH_2KM = 52.537994;
      const NORTH_5KM = 52.564974;

      beforeEach(() => {
        // The only zone in play here is the distant one, so the assertions can
        // read the single drawn overlay.
        delete hass.states['zone.park'];
        hass.states['device_tracker.tester'] = {
          entity_id: 'device_tracker.tester',
          state: 'not_home',
          attributes: { latitude: NORTH_2KM, longitude: 13.404954, friendly_name: 'Tester' },
        } as HassEntity;
        // Centred 5 km north with a 4 km radius: 5 - 4 = 1 km reaches inside
        // either radar below, so the zone is kept and must be drawn.
        hass.states['zone.far_park'] = {
          entity_id: 'zone.far_park',
          state: 'zoning',
          attributes: {
            latitude: NORTH_5KM,
            longitude: 13.404954,
            friendly_name: 'Far Park',
            radius: 4000,
          },
        } as HassEntity;
      });

      const drawnZone = (): { y: number; r: number } => {
        const group = element.shadowRoot!.querySelector<SVGGElement>('g.zone-group')!;
        const circle = group.querySelector<SVGCircleElement>('circle.zone-circle')!;
        const match = group.getAttribute('transform')!.match(/translate\(([^,]+),\s*([^)]+)\)/)!;
        return { y: parseFloat(match[2]), r: parseFloat(circle.getAttribute('r')!) };
      };

      it('should keep the centre and the radius unclamped in auto-scale mode', async () => {
        element = document.createElement('radar-card') as RadarCard;
        document.body.appendChild(element);
        element.hass = hass;
        element.setConfig({
          ...config,
          entities: ['device_tracker.tester'],
          show_zones: true,
          auto_radar_max_distance: true,
        });
        await element.updateComplete;
        await vi.runAllTimersAsync();

        // Auto maximum is the 2 km tracker, so 90 chart units are 2 km.
        const { y, r } = drawnZone();
        expect(y).toBeCloseTo(-225, 0);
        expect(r).toBeCloseTo(180, 0);
        // The bug: translate(0, -90) with r=90 put the inner edge at the centre.
        expect(Math.abs(y) - r).toBeCloseTo(45, 0);
      });

      it('should keep the centre and the radius unclamped in fixed mode', async () => {
        element = document.createElement('radar-card') as RadarCard;
        document.body.appendChild(element);
        element.hass = hass;
        element.setConfig({
          ...config,
          entities: ['device_tracker.tester'],
          show_zones: true,
          auto_radar_max_distance: false,
          radar_max_distance: 3,
        });
        await element.updateComplete;
        await vi.runAllTimersAsync();

        // 90 chart units are 3 km here, so the inner edge lands on the 1 km ring.
        const { y, r } = drawnZone();
        expect(y).toBeCloseTo(-150, 0);
        expect(r).toBeCloseTo(120, 0);
        expect(Math.abs(y) - r).toBeCloseTo(30, 0);
      });
    });

    it('should ignore home assistant zones natively when explicitly deactivated', async () => {
      // Inject device_tracker mock to prevent early return block
      hass.states['device_tracker.tester'] = {
        entity_id: 'device_tracker.tester',
        state: 'home',
        attributes: { latitude: 52.52, longitude: 13.41 },
      } as HassEntity;

      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, entities: ['device_tracker.tester'], show_zones: false });
      await element.updateComplete;
      await vi.runAllTimersAsync();

      const zoneOverlays = element.shadowRoot?.querySelectorAll<SVGCircleElement>('circle.zone-circle');
      expect(zoneOverlays?.length).toBe(0);
    });
  });
});
