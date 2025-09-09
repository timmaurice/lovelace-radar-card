import { LitElement, TemplateResult, html, css, unsafeCSS, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { HomeAssistant, LovelaceCardConfig, LovelaceCard, LovelaceCardEditor, RadarCardConfig } from './types.js';
import { max as d3Max } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { easeCubicOut } from 'd3-ease';
import { localize } from './localize.js';
import { select } from 'd3-selection';
import 'd3-transition';
import cardStyles from './styles/card.styles.scss';
import { getAzimuth, getDistance, fireEvent, formatDistance } from './utils.js';

const ELEMENT_NAME = 'radar-card';
const EDITOR_ELEMENT_NAME = `${ELEMENT_NAME}-editor`;

const RADAR_CHART_WIDTH = 220;
const RADAR_CHART_HEIGHT = 220;
const RADAR_CHART_MARGIN = 20;

console.info(
  `%c RADAR-CARD %c v__CARD_VERSION__ `,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray',
);

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
  color?: string;
  isMoving?: boolean;
}

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
  @state() private _tooltip: { visible: boolean; content: TemplateResult | typeof nothing; x: number; y: number } = {
    visible: false,
    content: nothing,
    x: 0,
    y: 0,
  };
  @state() private _pulsingEntityId: string | null = null;
  @state() private _error: string | null = null;
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
    if (!config || !config.entities || !Array.isArray(config.entities) || config.entities.length === 0) {
      throw new Error('You need to define at least one entity');
    }
    this._config = config;
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
      .attr('aria-labelledby', 'radar-title radar-desc');

    svgRoot
      .selectAll('title')
      .data([null])
      .join('title')
      .attr('id', 'radar-title')
      .text(this._config.title || 'Radar Chart');

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

    // Plot the entities
    const entityDots = svg
      .selectAll<SVGCircleElement, RadarPoint>('circle.entity-dot')
      .data(points, (d, i) => d.entity_id || d.name || i)
      .join(
        (enter) =>
          enter
            .append('circle')
            // Add a title element to the circle for accessibility
            .call((e) => e.append('title')),
        (update) => update,
        (exit) => exit.remove(),
      );

    // Update title content for all dots (both new and existing)
    entityDots.select('title').text((d) => this._getPointAccessibleLabel(d, distanceUnit));

    // Set position and tooltip for all dots (new and updated)
    entityDots //
      .attr('r', 3)
      .attr('tabindex', this._config.points_clickable !== false ? 0 : -1)
      .attr('class', (d) => `entity-dot ${d.entity_id === this._pulsingEntityId ? 'pulsing' : ''}`)
      .style('fill', (d) => d.color || this._config.entity_color || 'var(--info-color)')
      .style('fill-opacity', 1)
      .style('cursor', this._config.points_clickable !== false ? 'pointer' : 'default')
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

    if (animate) {
      entityDots
        .attr('cx', 0)
        .attr('cy', 0)
        .transition()
        .duration(duration)
        .ease(easeCubicOut)
        .attr('cx', (d) => rScale(d.distance) * Math.cos((d.azimuth - 90) * (Math.PI / 180)))
        .attr('cy', (d) => rScale(d.distance) * Math.sin((d.azimuth - 90) * (Math.PI / 180)));

      entityPings
        .attr('cx', 0)
        .attr('cy', 0)
        .transition()
        .duration(duration)
        .ease(easeCubicOut)
        .attr('cx', (d) => rScale(d.distance) * Math.cos((d.azimuth - 90) * (Math.PI / 180)))
        .attr('cy', (d) => rScale(d.distance) * Math.sin((d.azimuth - 90) * (Math.PI / 180)));
    } else {
      entityDots
        .attr('cx', (d) => rScale(d.distance) * Math.cos((d.azimuth - 90) * (Math.PI / 180)))
        .attr('cy', (d) => rScale(d.distance) * Math.sin((d.azimuth - 90) * (Math.PI / 180)));

      entityPings
        .attr('cx', (d) => rScale(d.distance) * Math.cos((d.azimuth - 90) * (Math.PI / 180)))
        .attr('cy', (d) => rScale(d.distance) * Math.sin((d.azimuth - 90) * (Math.PI / 180)));
    }

    if (this._config.points_clickable !== false) {
      entityDots.on('click', (event, d) => {
        if (d.entity_id) fireEvent(this, 'hass-more-info', { entityId: d.entity_id });
      });
    } else {
      entityDots.on('click', null);
    }
  }

  private _renderLegend(animate = false): TemplateResult {
    const position = this._config.legend_position ?? 'bottom';
    const showDistance = this._config.legend_show_distance !== false;
    const distanceUnit = this.hass.config.unit_system.length || 'km';
    const duration = this._config.animation_duration ?? 750;
    const style = animate ? `animation-duration: ${duration}ms; animation-delay: ${duration * 0.25}ms` : '';

    return html`
      <div class="legend ${position} ${animate ? 'fade-in' : ''}" style=${style}>
        ${this._points.map((point) => {
          return html`
            <button
              type="button"
              class="legend-item ${point.entity_id === this._pulsingEntityId ? 'active' : ''}"
              aria-pressed="${point.entity_id === this._pulsingEntityId}"
              aria-label="Toggle pulse for ${point.name}"
              @click=${() => this._handleLegendItemClick(point)}
            >
              <span
                class="legend-color"
                style="background-color: ${point.color || this._config.entity_color || 'var(--info-color)'}"
              ></span>
              <div class="legend-text-container ${!showDistance ? 'no-distance' : ''}">
                <span class="legend-name">${point.name}</span>${showDistance
                  ? html` <span class="legend-distance">(${formatDistance(point.distance, distanceUnit)})</span>`
                  : nothing}
              </div>
            </button>
          `;
        })}
      </div>
    `;
  }

  private _calculatePoints(): void {
    let centerLat: number | undefined = this.hass.config.latitude;
    let centerLon: number | undefined = this.hass.config.longitude;

    const zoneCoords =
      this._config.location_zone_entity && typeof this._config.location_zone_entity === 'string'
        ? this._getCoordsFromState(this._config.location_zone_entity)
        : null;

    if (zoneCoords) {
      centerLat = zoneCoords.lat;
      centerLon = zoneCoords.lon;
    } else if (this._config.center_latitude != null && this._config.center_longitude != null) {
      centerLat = this._config.center_latitude;
      centerLon = this._config.center_longitude;
    }

    if (centerLat === undefined || centerLon === undefined) return;

    const home = { lat: centerLat, lon: centerLon };

    const normalizedEntities = this._config.entities.map((entity) =>
      typeof entity === 'string' ? { entity } : entity,
    );

    this._points = normalizedEntities
      .map((entityConf): RadarPoint | null => {
        const entityId = entityConf.entity;
        const stateObj = this.hass.states[entityId];
        if (!stateObj || stateObj.attributes.latitude == null || stateObj.attributes.longitude == null) {
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
          color: entityConf.color,
          isMoving: isMoving,
        };
      })
      .filter((p): p is RadarPoint => p !== null);
  }

  private _getCoordsFromState(entityId: string): { lat: number; lon: number } | null {
    const state = this.hass.states[entityId];
    if (!state) return null;

    const lat = state.attributes.latitude;
    const lon = state.attributes.longitude;

    if (typeof lat === 'number' && typeof lon === 'number') {
      return { lat, lon };
    }

    console.warn(`Radar-card: Entity '${entityId}' does not have valid latitude and longitude attributes.`);
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

    const radarContainer = html`
      <div class="radar-chart-container" @mousemove=${this._moveTooltip}>
        <div class="radar-chart"></div>
        ${this._tooltip.visible
          ? html`<div class="custom-tooltip visible" style="left: ${this._tooltip.x}px; top: ${this._tooltip.y}px;">
              ${this._tooltip.content}
            </div>`
          : ''}
      </div>
    `;

    return html`
      <ha-card .header=${this._config.title}>
        <div class="card-content ${isBesideLegend ? `flex-layout legend-${legendPosition}` : ''}">
          ${radarContainer} ${isBesideLegend || isBottomLegend ? legendTemplate : nothing}
        </div>
      </ha-card>
    `;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('radar-card-test-animation', this._runTestAnimation);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('radar-card-test-animation', this._runTestAnimation);
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
      this._error = null;
      const hasCustomCoords = this._config.center_latitude != null && this._config.center_longitude != null;
      const hasCustomZone = !!this._config.location_zone_entity;
      let hasValidCustomZone = false;

      if (hasCustomZone && typeof this._config.location_zone_entity === 'string') {
        const zoneCoords = this._getCoordsFromState(this._config.location_zone_entity);
        if (zoneCoords) {
          hasValidCustomZone = true;
        }
      }

      const hasHaHome = this.hass.config?.latitude != null && this.hass.config?.longitude != null;

      if (!hasHaHome && !hasCustomCoords && !hasValidCustomZone) {
        this._error = localize(this.hass, 'component.radar-card.card.no_home_location');
        return;
      }

      if (
        (this._config.center_latitude != null && this._config.center_longitude == null) ||
        (this._config.center_latitude == null && this._config.center_longitude != null)
      ) {
        this._error = localize(this.hass, 'component.radar-card.card.incomplete_center_coords');
        return;
      }

      if (hasCustomZone && hasCustomCoords) {
        this._error = localize(this.hass, 'component.radar-card.card.multiple_center_definitions');
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
