export interface FrontendLocaleData {
  language: string;
  number_format: 'comma_decimal' | 'decimal_comma' | 'space_comma' | 'system';
  time_format: '12' | '24' | 'system' | 'am_pm';
  // You can expand this with more properties if needed
}

// A basic representation of the Home Assistant object
export interface HomeAssistant {
  states: { [entity_id: string]: HassEntity };
  entities: { [entity_id: string]: HassEntityRegistryDisplayEntry };
  localize: (key: string, ...args: unknown[]) => string;
  language: string;
  locale: FrontendLocaleData;
  callWS: <T>(message: { type: string; [key: string]: unknown }) => Promise<T>;
  themes?: {
    darkMode?: boolean;
    [key: string]: unknown;
  };
  config: {
    latitude: number;
    longitude: number;
    elevation: number;
    unit_system: {
      length: string;
      [key: string]: unknown;
    };
    time_zone: string;
    [key: string]: unknown;
  };
  // You can expand this with more properties from the hass object if needed
}

// A basic representation of a Home Assistant entity state object
export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: {
    friendly_name?: string;
    unit_of_measurement?: string;
    [key: string]: unknown;
  };
}

export interface HassEntityRegistryDisplayEntry {
  entity_id: string;
  display_precision?: number;
}

// A basic representation of a Lovelace card
export interface LovelaceCard extends HTMLElement {
  hass?: HomeAssistant;
  editMode?: boolean;
  setConfig(config: LovelaceCardConfig): void;
  getCardSize?(): number | Promise<number>;
}

// A basic representation of a Lovelace card configuration
export interface LovelaceCardConfig {
  type: string;
  [key: string]: unknown;
}

export interface LovelaceCardEditor extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: LovelaceCardConfig): void;
}

export interface RadarCardEntityConfig {
  entity: string;
  name?: string;
  color?: string;
}

export type LegendPosition = 'bottom' | 'right' | 'left';

export interface RadarCardConfig extends LovelaceCardConfig {
  title?: string;
  entities: (string | RadarCardEntityConfig)[];
  auto_radar_max_distance?: boolean;
  radar_max_distance?: number;
  grid_color?: string;
  font_color?: string;
  entity_color?: string;
  points_clickable?: boolean;
  show_legend?: boolean;
  legend_position?: LegendPosition;
  legend_show_distance?: boolean;
  show_grid_labels?: boolean;
  center_latitude?: number;
  center_longitude?: number;
  animation_enabled?: boolean;
  animation_duration?: number;
}
