import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/radar-card';
import type { RadarCard } from '../src/radar-card';
import { HassEntity, HomeAssistant, RadarCardConfig } from '../src/types';
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

  describe('Initialization and Configuration', () => {
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
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;

      const radarChart = element.shadowRoot?.querySelector('.radar-chart');
      expect(radarChart).not.toBeNull();
      const noEntities = element.shadowRoot?.querySelector('.no-entities');
      expect(noEntities).toBeNull();
    });

    it('should render the radar chart with a default entity color', async () => {
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
      element.hass = hass;
      element.setConfig(config); // points_clickable is not set, should default to true
      await element.updateComplete;

      const entityDot = element.shadowRoot?.querySelector<SVGCircleElement>('circle.entity-dot');
      entityDot?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(fireEvent).toHaveBeenCalledWith(element, 'hass-more-info', { entityId: 'device_tracker.test_device' });
    });

    it('should NOT fire hass-more-info when a point is clicked and points_clickable is false', async () => {
      element.hass = hass;
      element.setConfig({ ...config, points_clickable: false });
      await element.updateComplete;

      const entityDot = element.shadowRoot?.querySelector<SVGCircleElement>('circle.entity-dot');
      entityDot?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(fireEvent).not.toHaveBeenCalled();
    });

    it('should show a tooltip on mouseover', async () => {
      hass.states['device_tracker.test_device'].attributes.friendly_name = 'My Test Device';
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
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;

      const legend = element.shadowRoot?.querySelector('.legend');
      expect(legend).not.toBeNull();
    });

    it('should not render a legend when show_legend is false', async () => {
      element.hass = hass;
      element.setConfig({ ...config, show_legend: false });
      await element.updateComplete;

      const legend = element.shadowRoot?.querySelector('.legend');
      expect(legend).toBeNull();
    });

    it('should show distance in legend by default', async () => {
      element.hass = hass;
      element.setConfig({ ...config }); // show_legend and legend_show_distance are default true
      await element.updateComplete;

      const legendText = element.shadowRoot?.querySelector('.legend-text-container');
      expect(legendText?.textContent).toContain('m'); // distance is small, should be in meters
    });

    it('should not show distance in legend when legend_show_distance is false', async () => {
      element.hass = hass;
      element.setConfig({ ...config, legend_show_distance: false });
      await element.updateComplete;

      const legendText = element.shadowRoot?.querySelector('.legend-text-container');
      expect(legendText?.textContent).not.toContain('m');
    });

    it('should position the legend at the bottom by default', async () => {
      element.hass = hass;
      element.setConfig({ ...config }); // show_legend is default true
      await element.updateComplete;

      const cardContent = element.shadowRoot?.querySelector('.card-content');
      expect(cardContent?.classList.contains('flex-layout')).toBe(false);
      const legend = element.shadowRoot?.querySelector('.legend');
      expect(legend?.classList.contains('bottom')).toBe(true);
    });

    it('should position the legend on the right', async () => {
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
      element.hass = hass;
      element.setConfig({ ...config }); // show_legend is default true
      await element.updateComplete;

      const legendItem = element.shadowRoot?.querySelector('.legend-item') as HTMLElement;
      legendItem.click();
      await element.updateComplete;

      let dot = element.shadowRoot?.querySelector('circle.entity-dot');
      expect(dot?.classList.contains('pulsing')).toBe(true);

      legendItem.click(); // toggle off
      await element.updateComplete;

      dot = element.shadowRoot?.querySelector('circle.entity-dot');
      expect(dot?.classList.contains('pulsing')).toBe(false);
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
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;

      const gridLabels = element.shadowRoot?.querySelectorAll('.grid-label');
      expect(gridLabels?.length).toBeGreaterThan(0);
    });

    it('should not render grid labels when show_grid_labels is false', async () => {
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
      element.hass = hass;
      element.setConfig({ ...config, center_latitude: 48.8566, center_longitude: 2.3522 });
      await element.updateComplete;

      const error = element.shadowRoot?.querySelector('.warning');
      expect(error).toBeNull();
    });

    it('should show an error if only one coordinate is provided', async () => {
      element.hass = hass;
      element.setConfig({ ...config, center_latitude: 48.8566 });
      await element.updateComplete;

      const error = element.shadowRoot?.querySelector('.warning');
      expect(error).not.toBeNull();
      expect(error?.textContent).toBe('incomplete_center_coords');
    });
  });
});
