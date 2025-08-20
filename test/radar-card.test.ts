import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/radar-card';
import type { RadarCard } from '../src/radar-card';
import { HomeAssistant, RadarCardConfig, HassEntity } from '../src/types';

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
      states: {},
      language: 'en',
      locale: {
        language: 'en',
        number_format: 'comma_decimal',
        time_format: '12',
      },
    } as HomeAssistant;

    config = {
      type: 'custom:radar-card',
      entity: 'sensor.test_radar',
    };

    element = document.createElement('radar-card') as RadarCard;
    document.body.appendChild(element);
  });

  afterEach(() => {
    document.body.removeChild(element);
  });

  it('should create the component instance', () => {
    expect(element).toBeInstanceOf(HTMLElement);
    expect(element.tagName.toLowerCase()).toBe('radar-card');
  });

  it('should throw an error if no entity is provided', () => {
    expect(() => element.setConfig({ type: 'custom:radar-card', entity: '' })).toThrow('You need to define an entity');
  });

  it('should render a title if provided', async () => {
    element.hass = hass;
    element.setConfig({ ...config, title: 'My Radar' });
    await element.updateComplete;

    const card = element.shadowRoot?.querySelector<HaCard>('ha-card');
    expect(card?.header).toBe('My Radar');
  });

  it('should render the entity state', async () => {
    hass.states['sensor.test_radar'] = {
      entity_id: 'sensor.test_radar',
      state: '123',
      attributes: {},
    } as HassEntity;
    element.hass = hass;
    element.setConfig(config);
    await element.updateComplete;

    const content = element.shadowRoot?.querySelector('.card-content');
    expect(content?.textContent).toContain('The state of sensor.test_radar is 123.');
  });
});