import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/radar-card';
import type { RadarCard, RadarMarker, RadarPoint } from '../src/radar-card';
import { HaDialog, HassEntity, HomeAssistant, RadarCardConfig } from '../src/types';
import { fireEvent } from '../src/utils';

// Mock the localize function
vi.mock('../src/localize', () => ({
  localize: (hass: HomeAssistant, key: string): string => {
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
    };
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
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
        type: 'custom:radar-card',
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
      await element.updateComplete;

      const entityDots = element.shadowRoot?.querySelectorAll<SVGCircleElement>('circle.entity-dot');
      const radii = Array.from(entityDots!).map((dot) => {
        const cx = parseFloat(dot.getAttribute('cx')!);
        const cy = parseFloat(dot.getAttribute('cy')!);
        return Math.sqrt(cx * cx + cy * cy);
      });

      // Far dot should be at the edge (radius 90), close dot should be near the center.
      expect(Math.max(...radii)).toBeCloseTo(90, 0);
      expect(Math.min(...radii)).toBeLessThan(10);
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
      const renderSpy = vi.spyOn(
        element as unknown as { _renderRadarChart: (points: RadarPoint[], animate?: boolean) => void },
        '_renderRadarChart',
      );
      element.hass = hass;
      element.setConfig(config);
      element.editMode = true;
      await element.updateComplete;

      renderSpy.mockClear(); // Clear calls from initial render

      window.dispatchEvent(new CustomEvent('radar-card-test-animation'));
      await element.updateComplete;

      expect(renderSpy).toHaveBeenCalledWith(expect.anything(), true);
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

      const fab = element.shadowRoot?.querySelector('ha-fab.add-marker-btn');
      expect(fab).toBeNull();
    });

    it('should show the add marker button when enabled in moving mode', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, entities: ['device_tracker.center_device'], enable_markers: true });
      await element.updateComplete;
      await vi.runAllTimersAsync(); // Ensure all async rendering is done

      const fab = element.shadowRoot?.querySelector('ha-fab.add-marker-btn');
      expect(fab).not.toBeNull();
    });

    it('should not show the add marker button when enabled in static mode', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({
        type: 'custom:radar-card', // Static mode (no center_entity)
        entities: [],
        enable_markers: true,
      });
      await element.updateComplete;

      const fab = element.shadowRoot?.querySelector('ha-fab.add-marker-btn');
      expect(fab).toBeNull();
    });

    it('should open a dialog when the add marker button is clicked', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, entities: ['device_tracker.center_device'], enable_markers: true });
      await element.updateComplete;
      await vi.runAllTimersAsync(); // Ensure all async rendering is done

      const fab = element.shadowRoot?.querySelector<HTMLElement>('ha-fab.add-marker-btn');
      fab?.click();
      await element.updateComplete;

      const dialog = element.shadowRoot?.querySelector<HaDialog>('ha-dialog');
      expect(dialog).not.toBeNull();
      expect(dialog?.heading).toContain('Marker');
    });

    it('should add a marker when dialog is saved', async () => {
      element = document.createElement('radar-card') as RadarCard;
      document.body.appendChild(element);
      element.hass = hass;
      element.setConfig({ ...config, entities: ['device_tracker.center_device'], enable_markers: true });
      await element.updateComplete;
      await vi.runAllTimersAsync(); // Ensure all async rendering is done

      // Open and save dialog
      const fab = element.shadowRoot?.querySelector<HTMLElement>('ha-fab.add-marker-btn');
      fab?.click();
      await element.updateComplete;

      const saveButton = element.shadowRoot?.querySelector<HTMLElement>('mwc-button[slot="primaryAction"]');
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
      expect(dialog?.heading).toBe('Editable Marker');
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
      const deleteButton = element.shadowRoot?.querySelector<HTMLElement>('mwc-button.warning');
      deleteButton?.click();
      await element.updateComplete;

      const storedMarkers = JSON.parse(localStorageMock.getItem('radar-card-markers') || '[]');
      expect(storedMarkers.length).toBe(0);
      const markerPath = element.shadowRoot?.querySelector('path.entity-dot');
      expect(markerPath).toBeNull();
    });
  });
});
