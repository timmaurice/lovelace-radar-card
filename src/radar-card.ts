import { LitElement, TemplateResult, html, css, unsafeCSS, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  HomeAssistant,
  LovelaceCardConfig,
  LovelaceCard,
  LovelaceCardEditor,
  RadarCardConfig,
  RadarMarker,
  RadarZone,
} from './types.js';
import { max as d3Max } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { easeCubicOut } from 'd3-ease';
import { localize } from './localize.js';
import { handleAction } from 'custom-card-helpers';
import { select } from 'd3-selection';
import 'd3-transition';
import cardStyles from './styles/card.styles.scss';
import { HexBase } from 'vanilla-colorful/lib/entrypoints/hex';

if (!window.customElements.get('hex-color-picker')) {
  window.customElements.define('hex-color-picker', class extends HexBase {});
}
import { getAzimuth, getDistance, fireEvent, formatDistance } from './utils.js';

const ELEMENT_NAME = 'radar-card';
const EDITOR_ELEMENT_NAME = `${ELEMENT_NAME}-editor`;

const RADAR_CHART_WIDTH = 220;
const RADAR_CHART_HEIGHT = 220;
const RADAR_CHART_MARGIN = 20;

const MARKER_STORAGE_KEY = 'radar-card-markers';

declare global {
  interface Window {
    customCards?: {
      type: string;
      name: string;
      description: string;
      documentationURL: string;
      preview?: boolean;
    }[];
  }
}

interface LovelaceCardHelpers {
  createCardElement(config: LovelaceCardConfig): Promise<LovelaceCard>;
}

interface CustomWindow extends Window {
  loadCardHelpers?: () => Promise<LovelaceCardHelpers>;
}

export interface RadarPoint {
  distance: number;
  azimuth: number;
  name?: string;
  entity_id?: string;
  entity_picture?: string;
  color?: string;
  isMoving?: boolean;
  isMarker?: boolean;
}
export type { RadarMarker };

type LovelaceCardConstructor = {
  new (): LovelaceCard;
  getConfigElement(): Promise<LovelaceCardEditor>;
};

@customElement(ELEMENT_NAME)
export class RadarCard extends LitElement implements LovelaceCard {
  @property({ type: Boolean, reflect: true }) public editMode = false;
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config!: RadarCardConfig;
  @state() private _points: RadarPoint[] = [];
  @state() private _markers: RadarMarker[] = [];
  @state() private _zones: RadarZone[] = [];
  @state() private _tooltip: { visible: boolean; content: TemplateResult | typeof nothing; x: number; y: number } = {
    visible: false,
    content: nothing,
    x: 0,
    y: 0,
  };
  @state() private _pulsingEntityId: string | null = null;
  @state() private _error: string | null = null;
  @state() private _editingMarker: RadarMarker | null = null;
  private _hasAnimated = false;
  @state() private _isTestingAnimation = false;

  private _runTestAnimation = (): void => {
    if (this.editMode && this._config.animation_enabled !== false) {
      this._renderRadarChart(this._points, true);
      this._isTestingAnimation = true;
      const duration = this._config.animation_duration ?? 750;
      setTimeout(() => {
        this._isTestingAnimation = false;
      }, duration + 100);
    }
  };

  public setConfig(config: RadarCardConfig): void {
    if (
      !config ||
      !config.entities ||
      !Array.isArray(config.entities) ||
      (config.entities.length === 0 && !config.enable_markers)
    ) {
      throw new Error('You need to define at least one entity or enable markers');
    }
    this._config = config;
    this._loadMarkers();
  }

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    const loadHelpers = (window as CustomWindow).loadCardHelpers;
    if (!loadHelpers) {
      throw new Error('This card requires Home Assistant 2023.4+ and `loadCardHelpers` is not available.');
    }
    const helpers = await loadHelpers();
    const entitiesCard = await helpers.createCardElement({ type: 'entities', entities: [] });
    await (entitiesCard.constructor as LovelaceCardConstructor).getConfigElement();

    await import('./editor.js');
    return document.createElement(EDITOR_ELEMENT_NAME) as LovelaceCardEditor;
  }

  public static getStubConfig(): Record<string, unknown> {
    return {
      entities: ['device_tracker.your_device'],
    };
  }

  public getCardSize(): number {
    return 3;
  }

  private async _showTooltip(event: MouseEvent, point: RadarPoint, distanceUnit: string): Promise<void> {
    const content = this._getPointTooltipContent(point, distanceUnit);
    this._tooltip = { ...this._tooltip, visible: true, content };

    // Wait for the component to re-render with the tooltip visible
    await this.updateComplete;

    // Now that the tooltip is in the DOM, we can measure it and position it correctly.
    this._moveTooltip(event);
  }

  private _getPointTooltipContent(point: RadarPoint, distanceUnit: string): TemplateResult {
    const distanceStr = formatDistance(point.distance, distanceUnit);
    return html`
      <strong>${point.name || point.entity_id}</strong><br />
      ${localize(this.hass, 'component.radar-card.card.distance')}: ${distanceStr}<br />
      ${localize(this.hass, 'component.radar-card.card.azimuth')}: ${Math.round(point.azimuth)}°
    `;
  }

  private _getPointAccessibleLabel(point: RadarPoint, distanceUnit: string): string {
    const distanceStr = formatDistance(point.distance, distanceUnit);
    const name = point.name || point.entity_id;
    const distanceLabel = localize(this.hass, 'component.radar-card.card.distance');
    const azimuthLabel = localize(this.hass, 'component.radar-card.card.azimuth');

    return `${name}. ${distanceLabel}: ${distanceStr}. ${azimuthLabel}: ${Math.round(point.azimuth)}°.`;
  }

  private _moveTooltip(event: MouseEvent): void {
    if (!this._tooltip.visible) return;

    const tooltipEl = this.shadowRoot?.querySelector<HTMLElement>('.custom-tooltip');
    if (!tooltipEl) return;

    const container = this.shadowRoot?.querySelector<HTMLElement>('.radar-chart-container');
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const { clientX } = event;
    const { clientY } = event;

    const x = clientX - containerRect.left;
    const y = clientY - containerRect.top;

    // Dynamically get tooltip dimensions
    const tooltipWidth = tooltipEl.offsetWidth;
    const tooltipHeight = tooltipEl.offsetHeight;

    // Position tooltip to the left of the cursor on the right half of the card, and to the right on the left half.
    const xOffset = x > containerRect.width / 2 ? -tooltipWidth - 5 : 5;

    // Position tooltip above cursor, unless it would go off-screen from the top.
    let yOffset = -tooltipHeight - 5; // 5px buffer above
    if (y + yOffset < 0) {
      yOffset = 15; // Fallback to 15px below cursor
    }

    this._tooltip = { ...this._tooltip, x: x + xOffset, y: y + yOffset };
  }

  private _hideTooltip(): void {
    if (this._tooltip.visible) {
      this._tooltip = { ...this._tooltip, visible: false, content: nothing };
    }
  }

  private _handleLegendItemClick(point: RadarPoint): void {
    if (!point.entity_id) return;

    if (this._pulsingEntityId === point.entity_id) {
      this._pulsingEntityId = null; // Toggle off
    } else {
      this._pulsingEntityId = point.entity_id;
    }
  }

  private _loadMarkers(): void {
    try {
      const storedMarkers = localStorage.getItem(MARKER_STORAGE_KEY);
      if (storedMarkers) {
        this._markers = JSON.parse(storedMarkers);
      } else {
        this._markers = [];
      }
    } catch (e) {
      console.error('RadarCard: Failed to load markers from localStorage', e);
      this._markers = [];
    }
  }

  private _saveMarkers(newOrUpdatedMarker?: RadarMarker): void {
    try {
      const markers = [...this._markers];
      if (newOrUpdatedMarker) {
        const index = markers.findIndex((m) => m.id === newOrUpdatedMarker.id);
        if (index > -1) {
          markers[index] = newOrUpdatedMarker;
        } else {
          markers.push(newOrUpdatedMarker);
        }
        this._markers = markers;
      }
      localStorage.setItem(MARKER_STORAGE_KEY, JSON.stringify(this._markers));
      this._calculatePoints();
      this.requestUpdate();
      window.dispatchEvent(new CustomEvent('radar-card-markers-updated'));
    } catch (e) {
      console.error('RadarCard: Failed to save markers to localStorage', e);
    }
  }

  private _deleteMarker(markerId: string): void {
    this._markers = this._markers.filter((m) => m.id !== markerId);
    this._saveMarkers();
  }

  // Store the bound handler to correctly remove it later
  private _boundMarkersUpdatedHandler: () => void = () => {
    // Guard against _config or hass being undefined during event firing
    if (!this._config || !this.hass) {
      return;
    }
    this._loadMarkers();
    this._calculatePoints();
    this.requestUpdate();
  };

  private _handleMarkerClick(point: RadarPoint): void {
    if (!point.isMarker || !point.entity_id) return;
    this._editingMarker = this._markers.find((m) => `marker.${m.id}` === point.entity_id) || null;
  }

  private _handleMarkerDialogSave(): void {
    if (this._editingMarker) {
      this._saveMarkers(this._editingMarker);
      this._editingMarker = null;
    }
  }

  private _handleMarkerDialogInput(ev: Event): void {
    if (!this._editingMarker) return;

    const target = ev.target as HTMLInputElement | CustomEvent;
    const configValue = (target as HTMLInputElement).name as keyof RadarMarker;

    let value;
    if ('detail' in target) {
      value = target.detail.value;
    } else {
      value = (target as HTMLInputElement).value;
    }

    this._editingMarker = {
      ...this._editingMarker,
      [configValue]: value,
    };
  }

  private _handleMarkerDialogCancel(): void {
    this._editingMarker = null;
  }

  private _handleMarkerDialogDelete(): void {
    if (this._editingMarker) {
      this._deleteMarker(this._editingMarker.id);
      this._editingMarker = null;
    }
  }

  private _addMarker(): void {
    if (!this._config.center_entity) return;
    const centerCoords = this._getCoordsFromState(this._config.center_entity);
    if (!centerCoords) return;

    const now = new Date();
    this._editingMarker = {
      id: now.toISOString(),
      latitude: centerCoords.lat,
      longitude: centerCoords.lon,
      name: `Marker ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`,
    };
  }

  private _renderRadarChart(points: RadarPoint[], animate = false) {
    const radarContainer = this.shadowRoot?.querySelector('.radar-chart');
    if (!radarContainer) return;

    const chartRadius = Math.min(RADAR_CHART_WIDTH, RADAR_CHART_HEIGHT) / 2 - RADAR_CHART_MARGIN;
    const distanceUnit = this.hass.config.unit_system.length || 'km';
    const duration = this._config.animation_duration ?? 750;
    const autoRadar = this._config.auto_radar_max_distance !== false;
    const maxDistance = autoRadar
      ? (d3Max(points, (d) => d.distance) ?? 100)
      : (this._config.radar_max_distance ?? 100);

    const rScale = scaleLinear().domain([0, maxDistance]).range([0, chartRadius]);
    const svgRoot = select(radarContainer)
      .selectAll('svg')
      .data([null])
      .join('svg')
      .attr('viewBox', `0 0 ${RADAR_CHART_WIDTH} ${RADAR_CHART_HEIGHT}`)
      .attr('role', 'img')
      .attr('aria-describedby', 'radar-desc');

    svgRoot
      .selectAll('desc')
      .data([null])
      .join('desc')
      .attr('id', 'radar-desc')
      .text(
        `Showing ${points.length} entities. The center is your location. Entities are plotted by distance and direction.`,
      );

    const svg = svgRoot
      .selectAll('g.radar-main-group')
      .data([null])
      .join('g')
      .attr('class', 'radar-main-group')
      .attr('transform', `translate(${RADAR_CHART_WIDTH / 2}, ${RADAR_CHART_HEIGHT / 2})`);

    // Add background circles (grid)
    const gridCircles = rScale.ticks(4).slice(1);
    const gridSelection = svg
      .selectAll('.grid-circle')
      .data(gridCircles)
      .join(
        (enter) => enter.append('circle').attr('class', 'grid-circle').style('fill', 'none'),
        (update) => update,
        (exit) => exit.remove(),
      );

    if (animate) {
      gridSelection
        .attr('r', 0)
        .transition()
        .duration(duration)
        .ease(easeCubicOut)
        .attr('r', (d) => rScale(d));
    } else {
      gridSelection.attr('r', (d) => rScale(d));
    }
    gridSelection.style('stroke', this._config.grid_color ?? 'var(--primary-text-color)').style('opacity', 0.3);

    if (this._config.show_grid_labels !== false) {
      const labels = gridCircles.map((d) => formatDistance(d, distanceUnit, { removeIntegerDecimals: true }));
      const units = labels.map((l) => l.split(' ')[1]);

      // Add grid circle labels
      const gridLabelSelection = svg
        .selectAll('.grid-label') //
        .data(gridCircles)
        .join('text')
        .attr('class', 'grid-label')
        .attr('x', 4)
        .attr('dy', '-0.2em')
        .style('text-anchor', 'start')
        .style('fill', this._config.font_color ?? this._config.grid_color ?? 'var(--primary-text-color)')
        .text((d, i) => {
          const label = labels[i];
          const stripUnit = i < gridCircles.length - 1 && units[i] === units[i + 1];
          return stripUnit ? label.split(' ')[0] : label;
        });

      if (animate) {
        gridLabelSelection
          .attr('y', 0)
          .style('opacity', 0)
          .style('font-size', '0px')
          .transition()
          .duration(duration)
          .ease(easeCubicOut)
          .attr('y', (d) => -rScale(d))
          .style('opacity', 0.7)
          .style('font-size', '8px');
      } else {
        gridLabelSelection
          .attr('y', (d) => -rScale(d))
          .style('opacity', 0.7)
          .style('font-size', '8px');
      }
    } else {
      svg.selectAll('.grid-label').remove();
    }

    const cardinalPoints = [
      { label: localize(this.hass, 'component.radar-card.card.directions.N'), angle: 0 },
      { label: localize(this.hass, 'component.radar-card.card.directions.E'), angle: 90 },
      { label: localize(this.hass, 'component.radar-card.card.directions.S'), angle: 180 },
      { label: localize(this.hass, 'component.radar-card.card.directions.W'), angle: 270 },
    ];

    const cardinalLinesSelection = svg
      .selectAll('.cardinal-line')
      .data(cardinalPoints)
      .join('line')
      .attr('class', 'cardinal-line')
      .style('stroke', this._config.grid_color ?? 'var(--primary-text-color)') //
      .attr('x1', 0)
      .attr('y1', 0);

    if (animate) {
      cardinalLinesSelection
        .attr('x2', 0)
        .attr('y2', 0)
        .style('opacity', 0)
        .transition()
        .duration(duration)
        .ease(easeCubicOut)
        .attr('x2', (d) => rScale(maxDistance) * Math.cos((d.angle - 90) * (Math.PI / 180)))
        .attr('y2', (d) => rScale(maxDistance) * Math.sin((d.angle - 90) * (Math.PI / 180)))
        .style('opacity', 0.3);
    } else {
      cardinalLinesSelection
        .attr('x2', (d) => rScale(maxDistance) * Math.cos((d.angle - 90) * (Math.PI / 180)))
        .attr('y2', (d) => rScale(maxDistance) * Math.sin((d.angle - 90) * (Math.PI / 180)))
        .style('opacity', 0.3);
    }

    const cardinalLabelsSelection = svg
      .selectAll('.cardinal-label')
      .data(cardinalPoints)
      .join('text')
      .attr('class', 'cardinal-label')
      .text((d) => d.label)
      .style('text-anchor', 'middle')
      .style('dominant-baseline', 'middle')
      .style('fill', this._config.font_color ?? this._config.grid_color ?? 'var(--primary-text-color)');

    if (animate) {
      cardinalLabelsSelection
        .attr('x', 0)
        .attr('y', 0)
        .style('opacity', 0)
        .style('font-size', '0px')
        .transition()
        .duration(duration)
        .ease(easeCubicOut)
        .attr('x', (d) => (rScale(maxDistance) + 10) * Math.cos((d.angle - 90) * (Math.PI / 180)))
        .attr('y', (d) => (rScale(maxDistance) + 10) * Math.sin((d.angle - 90) * (Math.PI / 180)))
        .style('opacity', 1)
        .style('font-size', '10px');
    } else {
      cardinalLabelsSelection
        .attr('x', (d) => (rScale(maxDistance) + 10) * Math.cos((d.angle - 90) * (Math.PI / 180)))
        .attr('y', (d) => (rScale(maxDistance) + 10) * Math.sin((d.angle - 90) * (Math.PI / 180)))
        .style('opacity', 1)
        .style('font-size', '10px');
    }

    // Zone Overlays Group
    const zoneGroup = svg
      .selectAll<SVGGElement, RadarZone>('g.zone-group')
      .data(this._zones, (d) => d.entity_id)
      .join(
        (enter) =>
          enter
            .append('g')
            .attr('class', 'zone-group')
            .call((g) =>
              g
                .append('circle')
                .attr('class', 'zone-circle')
                .style('fill', 'var(--primary-color)')
                .style('fill-opacity', 0.15)
                .style('stroke', 'var(--primary-color)')
                .style('stroke-opacity', 0.5)
                .style('stroke-dasharray', '4, 4'),
            )
            .call((g) =>
              g
                .append('foreignObject')
                .attr('width', 20)
                .attr('height', 20)
                .attr('x', -10)
                .attr('y', -10)
                .style('pointer-events', 'none')
                .append('xhtml:div')
                .style('width', '100%')
                .style('height', '100%')
                .style('display', 'flex')
                .style('justify-content', 'center')
                .style('align-items', 'center')
                .style('opacity', '0.5')
                .html((d) => (d.icon ? `<ha-icon icon="${d.icon}" style="--mdc-icon-size: 16px;"></ha-icon>` : '')),
            ),
        (update) => update,
        (exit) => exit.remove(),
      );

    if (animate) {
      zoneGroup
        .select('.zone-circle')
        .attr('r', 0)
        .transition()
        .duration(duration)
        .ease(easeCubicOut)
        .attr('r', (d) => rScale(d.radius));

      zoneGroup
        .attr('transform', 'translate(0, 0)')
        .transition()
        .duration(duration)
        .ease(easeCubicOut)
        .attr(
          'transform',
          (d) =>
            `translate(${rScale(d.distance) * Math.cos((d.azimuth - 90) * (Math.PI / 180))}, ${Math.max(rScale(d.distance) * Math.sin((d.azimuth - 90) * (Math.PI / 180)), -1000)})`,
        );
    } else {
      zoneGroup.attr(
        'transform',
        (d) =>
          `translate(${rScale(d.distance) * Math.cos((d.azimuth - 90) * (Math.PI / 180))}, ${rScale(d.distance) * Math.sin((d.azimuth - 90) * (Math.PI / 180))})`,
      );
      zoneGroup.select('.zone-circle').attr('r', (d) => rScale(d.radius));
    }

    // Plot the pings for moving entities
    const entityPings = svg
      .selectAll<SVGCircleElement, RadarPoint>('circle.entity-ping')
      .data(
        points.filter((p) => p.isMoving && this._config.moving_animation_enabled === true),
        (d, i) => d.entity_id || d.name || i,
      )
      .join(
        (enter) =>
          enter
            .insert('circle', 'circle.entity-dot') // Insert before the actual entity dots
            .attr('class', 'entity-ping'),
        (update) => update,
        (exit) => exit.remove(),
      )
      .style('stroke', (d) => d.color || this._config.entity_color || 'var(--info-color)');
    entityPings.attr('transform', 'translate(0,0)');

    // Plot the entities
    const entityGroup = svg
      .selectAll<SVGGElement, RadarPoint>('g.entity-group')
      .data(points, (d, i) => d.entity_id || d.name || i)
      .join(
        (enter) =>
          enter
            .append('g')
            .attr('class', 'entity-group')
            .call((g) =>
              g
                .append((d) => document.createElementNS('http://www.w3.org/2000/svg', d.isMarker ? 'path' : 'circle'))
                .attr('class', 'entity-dot'),
            )
            .call((g) =>
              g
                .append('foreignObject')
                .attr('class', 'entity-avatar')
                .attr('width', 24)
                .attr('height', 24)
                .attr('x', -12)
                .attr('y', -12)
                .style('pointer-events', 'none')
                .append('xhtml:div')
                .style('width', '100%')
                .style('height', '100%')
                .style('border-radius', '50%')
                .style('overflow', 'hidden')
                .style('box-sizing', 'border-box')
                .style('display', 'flex')
                .style('justify-content', 'center')
                .style('align-items', 'center')
                .style('background-color', 'var(--card-background-color, #fff)')
                .append('xhtml:img')
                .style('width', '100%')
                .style('height', '100%')
                .style('object-fit', 'cover'),
            )
            // Add a title element to the circle for accessibility
            .call((g) => g.append('title')),
        (update) => update,
        (exit) => exit.remove(),
      );
    entityGroup.attr('transform', 'translate(0,0)');

    // Update title content for all dots (both new and existing)
    entityGroup.select('title').text((d) => this._getPointAccessibleLabel(d, distanceUnit));

    // Set position and tooltip for all dots (new and updated)
    entityGroup //
      .attr('tabindex', 0)
      .attr('class', (d) => `entity-group ${d.entity_id === this._pulsingEntityId ? 'pulsing' : ''}`)
      .style('fill', (d) => d.color || this._config.entity_color || 'var(--info-color)')
      .style('fill-opacity', 1)
      .attr('d', (d) => (d.isMarker ? 'M0,-4L4,4H-4Z' : '')) // Use path for markers
      .style('cursor', 'pointer')
      .on('mouseover', (event, d) => {
        this._showTooltip(event, d, distanceUnit);
      })
      .on('focus', (event, d) => {
        this._showTooltip(event, d, distanceUnit);
      })
      .on('mousemove', (event) => {
        this._moveTooltip(event);
      })
      .on('mouseout', () => this._hideTooltip())
      .on('blur', () => this._hideTooltip());

    // Bring the pulsing dot to the foreground
    entityGroup.filter('.pulsing').raise();

    const dots = entityGroup.filter((d) => d.isMarker !== true).select('.entity-dot');
    const markers = entityGroup.filter((d) => d.isMarker === true).select('.entity-dot');
    const avatars = entityGroup.filter((d) => d.isMarker !== true).select('.entity-avatar');

    dots.attr('r', 3);
    markers.attr('d', 'M0,-4L4,4H-4Z');

    dots.style('display', (d) => (d.entity_picture && this._config.show_avatars ? 'none' : 'block'));
    avatars.style('display', (d) => (d.entity_picture && this._config.show_avatars ? 'block' : 'none'));

    entityGroup
      .select('.entity-avatar div')
      .style('border', (d) => `2px solid ${d.color || this._config.entity_color || 'var(--info-color)'}`);
    entityGroup.select('.entity-avatar img').attr('src', (d) => d.entity_picture || '');

    const entityDots = entityGroup.filter((d) => !d.isMarker);
    const entityMarkers = entityGroup.filter((d) => !!d.isMarker);

    if (animate) {
      entityDots
        .attr('transform', 'translate(0,0)') // Start at center for animation
        .transition()
        .duration(duration)
        .ease(easeCubicOut)
        .attr(
          'transform',
          (d) =>
            `translate(${rScale(d.distance) * Math.cos((d.azimuth - 90) * (Math.PI / 180))}, ${rScale(d.distance) * Math.sin((d.azimuth - 90) * (Math.PI / 180))})`,
        );

      entityMarkers
        .attr('transform', 'translate(0,0)') // Start at center for animation
        .transition()
        .duration(duration)
        .ease(easeCubicOut)
        .attr(
          'transform',
          (d) =>
            `translate(${rScale(d.distance) * Math.cos((d.azimuth - 90) * (Math.PI / 180))}, ${rScale(d.distance) * Math.sin((d.azimuth - 90) * (Math.PI / 180))})`,
        );
      entityMarkers.select('.entity-dot').attr('transform', (d) => `rotate(${d.azimuth})`);

      entityPings
        .attr('cx', 0)
        .attr('cy', 0)
        .transition()
        .duration(duration)
        .ease(easeCubicOut)
        .attr('transform', () => `translate(0, 0)`)
        .attr('cx', (d) => rScale(d.distance) * Math.cos((d.azimuth - 90) * (Math.PI / 180)))
        .attr('cy', (d) => rScale(d.distance) * Math.sin((d.azimuth - 90) * (Math.PI / 180)));
    } else {
      entityDots.attr(
        'transform',
        (d) =>
          `translate(${rScale(d.distance) * Math.cos((d.azimuth - 90) * (Math.PI / 180))}, ${rScale(d.distance) * Math.sin((d.azimuth - 90) * (Math.PI / 180))})`,
      );
      entityDots.select('.entity-dot').attr('transform', null).attr('cx', null).attr('cy', null);

      entityMarkers.attr(
        'transform',
        (d) =>
          `translate(${rScale(d.distance) * Math.cos((d.azimuth - 90) * (Math.PI / 180))}, ${rScale(d.distance) * Math.sin((d.azimuth - 90) * (Math.PI / 180))})`,
      );
      entityMarkers.select('.entity-dot').attr('transform', (d) => `rotate(${d.azimuth})`);

      entityPings
        .attr('cx', (d) => rScale(d.distance) * Math.cos((d.azimuth - 90) * (Math.PI / 180)))
        .attr('cy', (d) => rScale(d.distance) * Math.sin((d.azimuth - 90) * (Math.PI / 180)));
    }

    entityGroup.on('click', (event, d) => {
      if (d.entity_id && !d.isMarker) {
        const entityConf = this._config.entities.find((e) => (typeof e === 'string' ? e : e.entity) === d.entity_id);
        const tapAction = typeof entityConf !== 'string' ? entityConf?.tap_action : undefined;

        if (tapAction && (tapAction.action as string) !== 'default') {
          handleAction(
            this,
            this.hass as unknown as Parameters<typeof handleAction>[1],
            { tap_action: tapAction, entity: d.entity_id },
            'tap',
          );
        } else {
          fireEvent(this, 'hass-more-info', { entityId: d.entity_id });
        }
      } else if (d.isMarker) {
        this._handleMarkerClick(d);
      }
    });
  }

  private _renderLegend(animate = false): TemplateResult {
    const position = this._config.legend_position ?? 'bottom';
    const showDistance = this._config.legend_show_distance !== false;
    const distanceUnit = this.hass.config.unit_system.length || 'km';
    const duration = this._config.animation_duration ?? 750;
    const style = animate ? `animation-duration: ${duration}ms; animation-delay: ${duration * 0.25}ms` : '';

    return html`
      <div class="legend ${position} ${animate ? 'fade-in' : ''}" style=${style}>
        ${this._points.map(
          (point) => html`
            <div class="legend-item-wrapper">
              <button
                type="button"
                class="legend-item ${point.entity_id === this._pulsingEntityId ? 'active' : ''}"
                aria-pressed="${point.entity_id === this._pulsingEntityId}"
                aria-label="Toggle pulse for ${point.name}"
                @click=${() => this._handleLegendItemClick(point)}
              >
                ${point.isMarker
                  ? html`<span
                      class="legend-marker"
                      style="border-bottom-color: ${point.color || this._config.entity_color || 'var(--info-color)'}"
                    ></span>`
                  : point.entity_picture && this._config.show_avatars
                    ? html`<img
                        src="${point.entity_picture}"
                        class="legend-avatar"
                        style="border: 2px solid ${point.color || this._config.entity_color || 'var(--info-color)'};"
                      />`
                    : html`<span
                        class="legend-color"
                        style="background-color: ${point.color || this._config.entity_color || 'var(--info-color)'}"
                      ></span>`}
                <div class="legend-text-container ${!showDistance ? 'no-distance' : ''}">
                  <span class="legend-name">${point.name}</span>${showDistance
                    ? html` <span class="legend-distance">(${formatDistance(point.distance, distanceUnit)})</span>`
                    : nothing}
                </div>
              </button>
              ${point.isMarker
                ? html`<ha-icon-button
                    mini
                    class="edit-marker-icon"
                    .label=${'Edit Marker'}
                    @click=${(e: Event) => {
                      e.stopPropagation(); // Prevent the legend item click from firing
                      this._handleMarkerClick(point);
                    }}
                  >
                    <ha-icon icon="mdi:pencil"></ha-icon>
                  </ha-icon-button>`
                : nothing}
            </div>
          `,
        )}
      </div>
    `;
  }

  private _renderMarkerDialog(): TemplateResult {
    if (!this._editingMarker) {
      return html``;
    }

    const name = this._editingMarker.name || '';
    const color = this._editingMarker.color || '';

    return html`
      <ha-dialog open @closed=${this._handleMarkerDialogCancel} .heading=${name} class="dialog-actions">
        <div class="dialog-content">
          <ha-textfield
            label=${localize(this.hass, 'component.radar-card.card.dialog.name')}
            name="name"
            .value=${name}
            @input=${this._handleMarkerDialogInput}
          ></ha-textfield>
          <div class="color-picker-wrapper">
            <ha-textfield
              label=${localize(this.hass, 'component.radar-card.card.dialog.color')}
              name="color"
              .value=${color}
              placeholder="e.g., #ff0000"
              @input=${this._handleMarkerDialogInput}
            ></ha-textfield>
            <hex-color-picker
              .color=${color || '#000000'}
              @color-changed=${(e: CustomEvent) => {
                this._editingMarker = { ...this._editingMarker!, color: e.detail.value };
                this.requestUpdate('_editingMarker');
              }}
            ></hex-color-picker>
          </div>
        </div>
        <mwc-button class="warning" @click=${this._handleMarkerDialogDelete} slot="secondaryAction" unelevated>
          ${localize(this.hass, 'component.radar-card.card.dialog.delete')}
        </mwc-button>
        <mwc-button @click=${this._handleMarkerDialogCancel} slot="secondaryAction" unelevated>
          ${localize(this.hass, 'component.radar-card.card.dialog.cancel')}
        </mwc-button>
        <mwc-button @click=${this._handleMarkerDialogSave} slot="primaryAction" unelevated>
          ${localize(this.hass, 'component.radar-card.card.dialog.save')}
        </mwc-button>
      </ha-dialog>
    `;
  }

  private _calculatePoints(): void {
    // Guard against _config or hass being undefined during initial setup or teardown
    if (!this._config || !this.hass || !this.hass.config) {
      return;
    }

    let centerLat: number | undefined;
    let centerLon: number | undefined;

    const centerEntityCoords =
      this._config.center_entity && typeof this._config.center_entity === 'string'
        ? this._getCoordsFromState(this._config.center_entity)
        : null;

    const zoneCoords =
      this._config.location_zone_entity && typeof this._config.location_zone_entity === 'string'
        ? this._getCoordsFromState(this._config.location_zone_entity)
        : null;

    if (centerEntityCoords) {
      centerLat = centerEntityCoords.lat;
      centerLon = centerEntityCoords.lon;
    } else if (zoneCoords) {
      centerLat = zoneCoords.lat;
      centerLon = zoneCoords.lon;
    } else if (this._config.center_latitude != null && this._config.center_longitude != null) {
      centerLat = this._config.center_latitude;
      centerLon = this._config.center_longitude;
    } else {
      centerLat = this.hass.config.latitude;
      centerLon = this.hass.config.longitude;
    }

    if (centerLat === undefined || centerLon === undefined) return;

    const home = { lat: centerLat, lon: centerLon };

    const normalizedEntities = this._config.entities.map((entity) =>
      typeof entity === 'string' ? { entity } : entity,
    );

    const entityPoints = normalizedEntities
      .map((entityConf): RadarPoint | null => {
        const entityId = entityConf.entity;
        const stateObj = this.hass.states[entityId];
        if (!stateObj || stateObj.attributes.latitude == null || stateObj.attributes.longitude == null) {
          return null;
        }
        if (this._config.hide_at_home && stateObj.state === 'home') {
          return null;
        }
        const movingActivities = this._config.moving_animation_activities || [
          'Automotive',
          'Cycling',
          'Walking',
          'Driving',
        ];
        const attribute = this._config.moving_animation_attribute || 'activity';
        const activity = stateObj.attributes[attribute];
        const isMoving =
          typeof activity === 'string' && movingActivities.map((a) => a.toLowerCase()).includes(activity.toLowerCase());

        const distance = getDistance(
          home.lat,
          home.lon,
          stateObj.attributes.latitude as number,
          stateObj.attributes.longitude as number,
          this.hass.config.unit_system.length,
        );
        const azimuth = getAzimuth(
          home.lat,
          home.lon,
          stateObj.attributes.latitude as number,
          stateObj.attributes.longitude as number,
        );

        return {
          distance: distance,
          azimuth: azimuth,
          name: entityConf.name || stateObj.attributes.friendly_name || entityId,
          entity_id: entityId,
          entity_picture: stateObj.attributes.entity_picture as string | undefined,
          color: entityConf.color,
          isMoving: isMoving,
        };
      })
      .filter((p): p is RadarPoint => p !== null);

    const markerPoints = this._config.enable_markers
      ? this._markers.map((marker): RadarPoint => {
          const distance = getDistance(
            home.lat,
            home.lon,
            marker.latitude,
            marker.longitude,
            this.hass.config.unit_system.length,
          );
          const azimuth = getAzimuth(home.lat, home.lon, marker.latitude, marker.longitude);
          return {
            distance,
            azimuth,
            name: marker.name,
            entity_id: `marker.${marker.id}`, // Prefix to avoid conflicts with real entity_ids
            color: marker.color || 'var(--warning-color)',
            isMarker: true,
          };
        })
      : [];

    this._points = [...entityPoints, ...markerPoints];

    if (this._config.show_zones) {
      const unit = this.hass.config.unit_system.length;
      const zoneEntities = Object.entries(this.hass.states)
        .filter(
          ([id, state]) =>
            id.startsWith('zone.') && state.attributes.latitude != null && state.attributes.radius != null,
        )
        .map(([id, stateObj]): RadarZone => {
          const zDistance = getDistance(
            home.lat,
            home.lon,
            stateObj.attributes.latitude as number,
            stateObj.attributes.longitude as number,
            unit,
          );
          const zAzimuth = getAzimuth(
            home.lat,
            home.lon,
            stateObj.attributes.latitude as number,
            stateObj.attributes.longitude as number,
          );
          const radiusInKm = (stateObj.attributes.radius as number) / 1000;
          const radius = unit === 'km' ? radiusInKm : radiusInKm * 0.621371;
          return {
            entity_id: id,
            name: (stateObj.attributes.friendly_name as string) || id,
            distance: zDistance,
            azimuth: zAzimuth,
            radius,
            icon: stateObj.attributes.icon as string | undefined,
          };
        });

      const maxRadarDistance = this._config.radar_max_distance || Math.max(...this._points.map((p) => p.distance), 0.1);
      this._zones = zoneEntities.filter((z) => z.distance - z.radius <= maxRadarDistance);
    } else {
      this._zones = [];
    }
  }

  private _getCoordsFromState(entityId: string): { lat: number; lon: number } | null {
    const state = this.hass.states[entityId];
    if (!state) return null;

    const lat = state.attributes.latitude;
    const lon = state.attributes.longitude;

    if (typeof lat === 'number' && typeof lon === 'number') {
      return { lat, lon };
    }

    this._error = `Radar-card: Entity '${entityId}' does not have valid latitude and longitude attributes.`;
    return null;
  }

  protected render(): TemplateResult {
    if (!this._config || !this.hass) {
      return html``;
    }

    if (this._error) {
      return html`
        <ha-card .header=${this._config.title}>
          <div class="card-content warning">${this._error}</div>
        </ha-card>
      `;
    }

    if (this._points.length === 0) {
      return html`
        <ha-card .header=${this._config.title}>
          <div class="card-content">
            <div class="no-entities">${localize(this.hass, 'component.radar-card.card.no_entities')}</div>
          </div>
        </ha-card>
      `;
    }

    const legendPosition = this._config.legend_position || 'bottom';
    const showLegend = this._config.show_legend !== false;
    const shouldAnimateOnLoad =
      this._config.animation_enabled !== false && !this.editMode && !this._hasAnimated && this._points.length > 0;
    const shouldAnimateLegend = shouldAnimateOnLoad || (this.editMode && this._isTestingAnimation);
    const legendTemplate = showLegend ? this._renderLegend(shouldAnimateLegend) : nothing;

    const isBesideLegend = ['left', 'right'].includes(legendPosition);
    const isBottomLegend = legendPosition === 'bottom';

    const showAddMarkerButton = this._config.enable_markers && this._config.center_entity;
    const duration = this._config.animation_duration ?? 750;
    const style = shouldAnimateLegend ? `animation-duration: ${duration}ms; animation-delay: ${duration * 0.25}ms` : '';

    const radarContainer = html`
      <div class="radar-chart-container" @mousemove=${this._moveTooltip}>
        <div class="radar-chart"></div>
        ${this._tooltip.visible
          ? html`<div class="custom-tooltip visible" style="left: ${this._tooltip.x}px; top: ${this._tooltip.y}px;">
              ${this._tooltip.content}
            </div>`
          : ''}
        ${showAddMarkerButton
          ? html`<ha-fab
              mini
              class="add-marker-btn ${shouldAnimateLegend ? 'fade-in' : ''}"
              style=${style}
              @click=${this._addMarker}
              title=${localize(this.hass, 'component.radar-card.card.dialog.add_marker_button')}
              role="button"
              aria-label=${localize(this.hass, 'component.radar-card.card.dialog.add_marker_button')}
            >
              <ha-icon slot="icon" icon="mdi:map-marker-plus"></ha-icon>
            </ha-fab>`
          : nothing}
      </div>
    `;

    return html`
      <ha-card .header=${this._config.title}>
        <div class="card-content ${isBesideLegend ? `flex-layout legend-${legendPosition}` : ''}">
          ${radarContainer} ${isBesideLegend || isBottomLegend ? legendTemplate : nothing}
        </div>
        ${this._renderMarkerDialog()}
      </ha-card>
    `;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._loadMarkers();
    window.addEventListener('radar-card-test-animation', this._runTestAnimation);
    window.addEventListener('radar-card-markers-updated', this._boundMarkersUpdatedHandler);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('radar-card-test-animation', this._runTestAnimation);
    window.removeEventListener('radar-card-markers-updated', this._boundMarkersUpdatedHandler);
    this._hasAnimated = false;
  }

  protected willUpdate(changedProperties: Map<string | number | symbol, unknown>): void {
    super.willUpdate(changedProperties);
    if (
      this._config &&
      this.hass &&
      this.hass.config &&
      (changedProperties.has('hass') || changedProperties.has('_config'))
    ) {
      if (
        (this._config.center_latitude != null && this._config.center_longitude == null) ||
        (this._config.center_latitude == null && this._config.center_longitude != null)
      ) {
        this._error = localize(this.hass, 'component.radar-card.card.incomplete_center_coords');
        return;
      }

      if (this._config.location_zone_entity && (this._config.center_latitude || this._config.center_longitude)) {
        this._error = localize(this.hass, 'component.radar-card.card.multiple_center_definitions');
        return;
      }

      this._error = null;
      let hasValidCenter = false;

      if (this._config.center_entity) {
        const coords = this._getCoordsFromState(this._config.center_entity);
        if (coords) {
          hasValidCenter = true;
        } else {
          // _getCoordsFromState already set this._error
          return;
        }
      } else if (this._config.location_zone_entity) {
        const coords = this._getCoordsFromState(this._config.location_zone_entity);
        if (coords) {
          hasValidCenter = true;
        } else {
          // _getCoordsFromState already set this._error
          return;
        }
      } else if (this._config.center_latitude != null && this._config.center_longitude != null) {
        hasValidCenter = true;
      } else if (this.hass.config?.latitude != null && this.hass.config?.longitude != null) {
        hasValidCenter = true;
      }

      if (!hasValidCenter) {
        this._error = localize(this.hass, 'component.radar-card.card.no_home_location');
        return;
      }

      this._calculatePoints();
    }
  }

  protected updated(changedProperties: Map<string | number | symbol, unknown>): void {
    super.updated(changedProperties);
    if (this._config && this.hass) {
      // If the only thing that changed is the testing state, don't re-render the chart.
      // The test function itself triggers the chart animation.
      if (changedProperties.size === 1 && changedProperties.has('_isTestingAnimation')) {
        return;
      }

      const shouldAnimate =
        this._config.animation_enabled !== false && !this.editMode && !this._hasAnimated && this._points.length > 0;
      this._renderRadarChart(this._points, shouldAnimate);
      if (shouldAnimate) {
        this._hasAnimated = true;
      }
    }
  }

  static styles = css`
    ${unsafeCSS(cardStyles)}
  `;
}

if (typeof window !== 'undefined') {
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: ELEMENT_NAME,
    name: 'Radar Card',
    description: 'A card to display radar data.',
    documentationURL: 'https://github.com/timmaurice/lovelace-radar-card',
    preview: true,
  });
}
