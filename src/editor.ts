import { LitElement, html, css, TemplateResult, unsafeCSS, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { HomeAssistant, LovelaceCardEditor, RadarCardConfig, RadarCardEntityConfig, RadarMarker } from './types';
import { HexBase } from 'vanilla-colorful/lib/entrypoints/hex';
import { localize } from './localize';
import { fireEvent } from './utils';
import editorStyles from './styles/editor.styles.scss';

// Conditionally define the hex-color-picker to avoid registration conflicts when another card also uses it.
if (!window.customElements.get('hex-color-picker')) {
  window.customElements.define('hex-color-picker', class extends HexBase {});
}

interface ValueChangedEventTarget extends HTMLElement {
  configValue?: keyof RadarCardConfig | keyof RadarCardEntityConfig;
  value?: string | number | string[] | boolean;
  checked?: boolean;
  type?: string;
  tagName: string;
  dataset: {
    index?: string;
  };
}

interface EntityPicker extends HTMLElement {
  value: string;
  index: number;
}

@customElement('radar-card-editor')
export class RadarCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config!: RadarCardConfig;
  @state() private _colorPickerOpenFor: string | null = null;
  @state() private _editingIndex: number | null = null;
  @state() private _draggedIndex: number | null = null;
  @state() private _showHelpFor: Set<string> = new Set();
  @state() private _markers: RadarMarker[] = [];

  public setConfig(config: RadarCardConfig): void {
    this._config = config;
  }
  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('click', this._handleOutsideClick, { capture: true });
    window.removeEventListener('radar-card-markers-updated', this._loadMarkers);
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._loadMarkers();
    window.addEventListener('radar-card-markers-updated', this._loadMarkers);
  }

  protected updated(changedProperties: Map<string | number | symbol, unknown>): void {
    super.updated(changedProperties);
    if (changedProperties.has('_colorPickerOpenFor')) {
      if (this._colorPickerOpenFor) {
        // Using capture to make sure we get the click before the element's own handler.
        window.addEventListener('click', this._handleOutsideClick, { capture: true });
      } else {
        window.removeEventListener('click', this._handleOutsideClick, { capture: true });
      }
    }
  }

  private _handleBooleanToggle(
    newConfig: RadarCardConfig,
    configValue: keyof RadarCardConfig,
    isChecked: boolean,
    isTrueByDefault: boolean,
  ): void {
    if (isChecked) {
      if (isTrueByDefault) delete newConfig[configValue];
      else newConfig[configValue] = true;
    } else {
      if (isTrueByDefault) newConfig[configValue] = false;
      else delete newConfig[configValue];
    }
  }
  private _valueChanged(ev: Event): void {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target as ValueChangedEventTarget;
    if (target.configValue === undefined) {
      return;
    }

    const configValue = target.configValue;
    const newConfig = { ...this._config };

    let value;
    if (ev.type === 'value-changed' || ev.type === 'color-changed') {
      value = (ev as CustomEvent).detail.value;
    } else {
      value = target.tagName === 'HA-SWITCH' ? target.checked : target.value;
    }

    // Handle boolean toggles
    const booleanToggles: (keyof RadarCardConfig)[] = [
      'auto_radar_max_distance',
      'show_grid_labels',
      'animation_enabled',
      'show_legend',
      'legend_show_distance',
    ];
    if (booleanToggles.includes(configValue as keyof RadarCardConfig)) {
      this._handleBooleanToggle(newConfig, configValue as keyof RadarCardConfig, value as boolean, true);
      if (configValue === 'auto_radar_max_distance' && value) delete newConfig.radar_max_distance;
      if (configValue === 'show_legend' && !value) {
        delete newConfig.legend_position;
        delete newConfig.legend_show_distance;
      }
    } else if (configValue === 'moving_animation_enabled' || configValue === 'enable_markers') {
      this._handleBooleanToggle(newConfig, configValue, value as boolean, false);
      if (configValue === 'moving_animation_enabled' && !value) {
        delete newConfig.moving_animation_activities;
        delete newConfig.moving_animation_attribute;
      }
    }
    // Handle specific string/select values
    else if (value === 'bottom' && configValue === 'legend_position') {
      delete newConfig.legend_position;
    } else if (configValue === 'moving_animation_activities') {
      if (typeof value === 'string' && value.trim()) {
        newConfig.moving_animation_activities = value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        delete newConfig.moving_animation_activities;
      }
    } else if (configValue === 'moving_animation_attribute') {
      if (typeof value === 'string' && value.trim()) {
        newConfig.moving_animation_attribute = value;
      } else {
        delete newConfig.moving_animation_attribute;
      }
    } else if (configValue === 'center_entity') {
      if (value) {
        newConfig.center_entity = value as string;
      } else {
        delete newConfig.center_entity;
      }
    } else if (configValue === 'center_latitude' || configValue === 'center_longitude') {
      if (value) {
        newConfig[configValue] = Number(value);
      } else {
        delete newConfig[configValue];
      }
    } else if (configValue === 'location_zone_entity') {
      if (value) {
        newConfig.location_zone_entity = value as string;
      } else {
        delete newConfig.location_zone_entity;
      }
    } else if (value === '' || value === false || value === undefined || (Array.isArray(value) && value.length === 0)) {
      delete newConfig[configValue];
    } else {
      newConfig[configValue] = target.type === 'number' ? Number(value) : value;
    }

    fireEvent(this, 'config-changed', { config: newConfig });
  }

  private _handleCenterModeChange(ev: Event): void {
    // The ha-form-radio component holds the value in the target, not the event detail
    const target = ev.target as HTMLInputElement;
    const newMode = target.value;
    const newConfig: RadarCardConfig = { ...this._config };

    if (newMode === 'static') {
      // Switching to static mode, clear moving-specific settings
      delete newConfig.center_entity;
      newConfig.location_zone_entity = newConfig.location_zone_entity || '';
    } else {
      // Switching to moving mode, clear all static settings
      newConfig.center_entity = newConfig.center_entity || '';
      delete newConfig.location_zone_entity;
    }

    fireEvent(this, 'config-changed', { config: newConfig });
  }

  private _handleOutsideClick = (e: MouseEvent): void => {
    if (!this._colorPickerOpenFor) return;

    if (e.composedPath().some((el) => el instanceof HTMLElement && el.dataset.pickerId === this._colorPickerOpenFor)) {
      // Click was inside the currently open picker's wrapper, so do nothing.
      return;
    }

    // Click was outside, close the picker.
    this._closeColorPicker();
  };

  private _loadMarkers = (): void => {
    try {
      const storedMarkers = localStorage.getItem('radar-card-markers');
      if (storedMarkers) {
        this._markers = JSON.parse(storedMarkers);
      } else {
        this._markers = [];
      }
    } catch (e) {
      console.error('RadarCard Editor: Failed to load markers from localStorage', e);
      this._markers = [];
    }
  };

  private _clearAllMarkers(): void {
    localStorage.removeItem('radar-card-markers');
    // Fire an event to notify the card to update
    window.dispatchEvent(new CustomEvent('radar-card-markers-updated'));
    this._markers = []; // Update local state
  }

  private _toggleColorPicker(pickerId: string): void {
    this._colorPickerOpenFor = this._colorPickerOpenFor === pickerId ? null : pickerId;
  }

  private _toggleHelp(key: string): void {
    if (this._showHelpFor.has(key)) {
      this._showHelpFor.delete(key);
    } else {
      this._showHelpFor.add(key);
    }
    this.requestUpdate('_showHelpFor');
  }

  private _closeColorPicker(): void {
    if (this._colorPickerOpenFor !== null) {
      this._colorPickerOpenFor = null;
    }
  }

  private _renderColorInput(
    label: string,
    configValue: keyof RadarCardConfig | keyof RadarCardEntityConfig,
    index?: number,
    isMarker = false,
  ): TemplateResult {
    const isEntityConfig = index !== undefined && !isMarker;
    const config = isEntityConfig ? this._getEntities()[index as number] : this._config;
    const value = (config ? config[configValue as keyof typeof config] : '') || '';

    // The color picker needs a concrete color value. If we have a CSS variable,
    // we resolve it to its hex value for display. The config will store the
    // variable until the user picks a new color.
    let resolvedValue = value;
    if (typeof value === 'string' && value.startsWith('var(')) {
      try {
        const varName = value.substring(4, value.length - 1);
        resolvedValue = getComputedStyle(this).getPropertyValue(varName).trim();
      } catch (e) {
        console.error('Failed to resolve CSS variable', value, e);
        resolvedValue = '#000000'; // Fallback to black
      }
    }

    const handleClear = (e: Event): void => {
      e.stopPropagation(); // Prevent the textfield click from reopening the picker
      if (isEntityConfig) {
        const entities = [...this._getEntities()];
        const newEntityConf = { ...entities[index as number] };
        delete newEntityConf[configValue as keyof RadarCardEntityConfig];
        entities[index as number] = newEntityConf;
        fireEvent(this, 'config-changed', { config: { ...this._config, entities } });
      } else {
        // It's a global config
        const newConfig = { ...this._config };
        delete newConfig[configValue as keyof RadarCardConfig];
        fireEvent(this, 'config-changed', { config: newConfig });
      }
      this._closeColorPicker();
    };

    const pickerId = isEntityConfig ? `${configValue}_${index}` : (configValue as string);
    const isPickerOpen = this._colorPickerOpenFor === pickerId;

    return html`
      <div class="color-input-wrapper" data-picker-id=${pickerId}>
        <ha-textfield
          .label=${label}
          .value=${value}
          .configValue=${configValue}
          data-index=${index}
          .placeholder=${'e.g., #ff0000'}
          @input=${isEntityConfig ? this._entityAttributeChanged : this._valueChanged}
          @click=${() => this._toggleColorPicker(pickerId)}
        >
          ${value
            ? html`<ha-icon-button
                slot="trailingIcon"
                class="clear-button"
                .label=${'Clear'}
                @click=${handleClear}
                title="Clear color"
              >
                <ha-icon icon="mdi:close"></ha-icon>
              </ha-icon-button>`
            : nothing}
        </ha-textfield>
        <div
          class="color-preview"
          style="background-color: ${resolvedValue || 'transparent'}"
          @click=${() => this._toggleColorPicker(pickerId)}
        ></div>
        ${isPickerOpen
          ? html`
              <div class="color-picker-popup ${isEntityConfig ? 'popup-top' : ''}">
                <hex-color-picker
                  .configValue=${configValue}
                  data-index=${index}
                  .color=${resolvedValue || '#000000'}
                  @color-changed=${isEntityConfig ? this._entityAttributeChanged : this._valueChanged}
                ></hex-color-picker>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private _getEntities(): RadarCardEntityConfig[] {
    return this._config.entities?.map((entity) => (typeof entity === 'string' ? { entity } : entity)) || [];
  }

  private _addEntity(): void {
    const entities = [...this._getEntities(), { entity: '' }];
    fireEvent(this, 'config-changed', { config: { ...this._config, entities } });
  }

  private _removeEntity(index: number): void {
    const entities = [...this._getEntities()];
    entities.splice(index, 1);
    fireEvent(this, 'config-changed', { config: { ...this._config, entities } });
  }

  private _entityAttributeChanged(ev: Event): void {
    if (!this._config || !this.hass || this._editingIndex === null) {
      return;
    }
    const target = ev.target as ValueChangedEventTarget;
    const index = Number(target.dataset.index);
    const configValue = target.configValue as keyof RadarCardEntityConfig;

    if (isNaN(index)) return;

    const entities = [...this._getEntities()];
    const newEntityConf = { ...entities[index] };

    let value;
    if (ev.type === 'value-changed' || ev.type === 'color-changed') {
      value = (ev as CustomEvent).detail.value;
    } else {
      value = target.value;
    }

    if (value === '' || value === undefined) {
      delete newEntityConf[configValue];
    } else {
      newEntityConf[configValue] = value;
    }

    entities[index] = newEntityConf;
    fireEvent(this, 'config-changed', { config: { ...this._config, entities } });
  }

  private _entityValueChanged(ev: CustomEvent): void {
    const target = ev.target as EntityPicker;
    const index = target.index as number;
    const entities = [...this._getEntities()];
    entities[index] = { ...entities[index], entity: target.value };
    fireEvent(this, 'config-changed', { config: { ...this._config, entities } });
  }

  private _testAnimation(): void {
    fireEvent(this, 'radar-card-test-animation');
  }

  private _editEntity(index: number): void {
    this._editingIndex = index;
    this.requestUpdate();
  }

  private _goBack(): void {
    this._editingIndex = null;
    this.requestUpdate();
  }

  private _handleDragStart(ev: DragEvent, index: number): void {
    this._draggedIndex = index;
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      // Required for Firefox to initiate drag
      ev.dataTransfer.setData('text/plain', '');
    }
    (ev.currentTarget as HTMLElement).classList.add('is-dragging');
    this.shadowRoot?.querySelector('.entities-container')?.classList.add('drag-active');
  }

  private _handleDragEnter(ev: DragEvent): void {
    ev.preventDefault();
    const target = ev.currentTarget as HTMLElement;
    if (target.dataset.index !== String(this._draggedIndex)) {
      target.classList.add('drag-over');
    }
  }

  private _handleDragOver(ev: DragEvent): void {
    ev.preventDefault(); // This is necessary to allow a drop.
  }

  private _handleDragLeave(ev: DragEvent): void {
    (ev.currentTarget as HTMLElement).classList.remove('drag-over');
  }

  private _handleDrop(ev: DragEvent, dropIndex: number): void {
    ev.preventDefault();
    (ev.currentTarget as HTMLElement).classList.remove('drag-over');

    if (this._draggedIndex === null || this._draggedIndex === dropIndex) {
      return;
    }

    const entities = [...this._getEntities()];
    const [draggedItem] = entities.splice(this._draggedIndex, 1);
    entities.splice(dropIndex, 0, draggedItem);
    fireEvent(this, 'config-changed', { config: { ...this._config, entities } });
  }

  private _handleDragEnd(): void {
    // Clean up all drag-related classes
    this.shadowRoot?.querySelectorAll('.entity-row').forEach((el) => {
      el.classList.remove('is-dragging', 'drag-over');
    });
    this.shadowRoot?.querySelector('.entities-container')?.classList.remove('drag-active');
    this._draggedIndex = null;
  }

  private _renderEntityEditor(): TemplateResult | typeof nothing {
    if (this._editingIndex === null) return nothing;

    const entityConf = this._getEntities()[this._editingIndex];
    if (!entityConf) return nothing;

    const stateObj = this.hass.states[entityConf.entity];
    const title = entityConf.name || stateObj?.attributes.friendly_name || entityConf.entity;

    return html`
      <div class="card-content card-config">
        <div class="header">
          <ha-icon-button @click=${this._goBack}>
            <ha-icon icon="mdi:arrow-left"></ha-icon>
          </ha-icon-button>
          <span class="title">${title}</span>
        </div>
        <div class="option-group">
          <ha-textfield
            .label=${localize(this.hass, 'component.radar-card.editor.name')}
            .value=${entityConf.name || ''}
            .configValue=${'name'}
            data-index=${this._editingIndex}
            @input=${this._entityAttributeChanged}
          ></ha-textfield>
          ${this._renderColorInput(
            localize(this.hass, 'component.radar-card.editor.color'),
            'color',
            this._editingIndex,
            false,
          )}
        </div>
      </div>
    `;
  }

  protected render(): TemplateResult {
    if (!this.hass || !this._config) {
      return html``;
    }

    if (this._editingIndex !== null) {
      return html`<ha-card>${this._renderEntityEditor()}</ha-card>`;
    }

    // Check for the existence of the key, not just a truthy value (since '' is falsy)
    const centerMode = 'center_entity' in this._config ? 'moving' : 'static';

    return html`
      <ha-card>
        <div class="card-content card-config">
          <div class="option-group">
            <div class="option-group-title">${localize(this.hass, 'component.radar-card.editor.data')}</div>
            <ha-textfield
              .label=${localize(this.hass, 'component.radar-card.editor.title')}
              .value=${this._config.title || ''}
              .configValue=${'title'}
              @input=${this._valueChanged}
            ></ha-textfield>
            <div class="option-row">
              <ha-switch
                .checked=${this._config.auto_radar_max_distance !== false}
                .configValue=${'auto_radar_max_distance'}
                @change=${this._valueChanged}
              ></ha-switch>
              <div class="label-with-help">
                <label class="mdc-label"
                  >${localize(this.hass, 'component.radar-card.editor.auto_radar_max_distance')}</label
                >
                <ha-icon
                  class="help-icon"
                  icon="mdi:help-circle-outline"
                  @click=${() => this._toggleHelp('auto_radar_max_distance')}
                ></ha-icon>
              </div>
            </div>
            ${this._showHelpFor.has('auto_radar_max_distance')
              ? html`
                  <div class="help-text">
                    ${localize(this.hass, 'component.radar-card.editor.auto_radar_max_distance_help')}
                  </div>
                `
              : nothing}
            ${this._config.auto_radar_max_distance !== false
              ? nothing
              : html`
                  <ha-textfield
                    .label=${localize(this.hass, 'component.radar-card.editor.radar_max_distance')}
                    type="number"
                    .value=${this._config.radar_max_distance || ''}
                    .configValue=${'radar_max_distance'}
                    @input=${this._valueChanged}
                  ></ha-textfield>
                `}
            <div class="option-sub-group">
              <div class="label-with-help">
                <label class="mdc-label"
                  >${localize(this.hass, 'component.radar-card.editor.center_coords_override')}</label
                >
                <ha-icon
                  class="help-icon"
                  icon="mdi:help-circle-outline"
                  @click=${() => this._toggleHelp('center_coords_override')}
                ></ha-icon>
              </div>
              ${this._showHelpFor.has('center_coords_override')
                ? html`
                    <div class="help-text no-indent">
                      ${localize(this.hass, 'component.radar-card.editor.center_coords_override_help')}
                    </div>
                  `
                : nothing}
              <div class="option-row">
                <ha-form-radio .name=${'centerMode'} .value=${centerMode} @change=${this._handleCenterModeChange}>
                  <label class="radio-label">
                    <ha-radio .value=${'static'} .checked=${centerMode === 'static'}></ha-radio>
                    <span>${localize(this.hass, 'component.radar-card.editor.center_modes.static')}</span>
                  </label>
                  <label class="radio-label">
                    <ha-radio .value=${'moving'} .checked=${centerMode === 'moving'}></ha-radio>
                    <span>${localize(this.hass, 'component.radar-card.editor.center_modes.moving')}</span>
                  </label>
                </ha-form-radio>
              </div>
              ${centerMode === 'static'
                ? html`<ha-entity-picker
                    .hass=${this.hass}
                    .value=${this._config.location_zone_entity || ''}
                    .configValue=${'location_zone_entity'}
                    @value-changed=${this._valueChanged}
                    .label=${localize(this.hass, 'component.radar-card.editor.location_zone_entity')}
                    .includeDomains=${['zone']}
                    allow-custom-entity
                  ></ha-entity-picker>`
                : html`<ha-entity-picker
                    .label=${localize(this.hass, 'component.radar-card.editor.center_entity')}
                    .hass=${this.hass}
                    .value=${this._config.center_entity || ''}
                    .configValue=${'center_entity'}
                    @value-changed=${this._valueChanged}
                    .includeDomains=${['device_tracker', 'person']}
                    allow-custom-entity
                  ></ha-entity-picker>`}
              ${centerMode === 'moving'
                ? html`
                    <div class="option-group-title">
                      <span>${localize(this.hass, 'component.radar-card.editor.markers')}</span>
                      <ha-icon
                        class="help-icon"
                        icon="mdi:help-circle-outline"
                        @click=${() => this._toggleHelp('markers_help')}
                      ></ha-icon>
                    </div>
                    ${this._showHelpFor.has('markers_help')
                      ? html`<div class="help-text no-indent">
                          ${localize(this.hass, 'component.radar-card.editor.markers_help')}
                        </div>`
                      : nothing}
                    <div class="option-row">
                      <ha-switch
                        .checked=${this._config.enable_markers === true}
                        .configValue=${'enable_markers'}
                        @change=${this._valueChanged}
                      ></ha-switch>
                      <label class="mdc-label"
                        >${localize(this.hass, 'component.radar-card.editor.enable_markers')}</label
                      >
                    </div>
                    ${this._config.enable_markers
                      ? html`<div class="button-row">
                          <ha-button @click=${this._clearAllMarkers} .disabled=${this._markers.length === 0}>
                            ${localize(this.hass, 'component.radar-card.editor.clear_all_markers')}
                          </ha-button>
                        </div>`
                      : nothing}
                  `
                : nothing}
            </div>
          </div>

          <div class="option-group entities">
            <div class="option-group-title">${localize(this.hass, 'component.radar-card.editor.entities')}</div>
            <div class="entities-container">
              ${this._getEntities().map(
                (entityConf, index) => html`
                  <div
                    class="entity-row"
                    data-index=${index}
                    draggable="true"
                    @dragstart=${(e: DragEvent) => this._handleDragStart(e, index)}
                    @dragenter=${this._handleDragEnter}
                    @dragover=${this._handleDragOver}
                    @dragleave=${this._handleDragLeave}
                    @drop=${(e: DragEvent) => this._handleDrop(e, index)}
                    @dragend=${this._handleDragEnd}
                  >
                    <ha-icon class="drag-handle" icon="mdi:drag"></ha-icon>
                    <ha-entity-picker
                      .hass=${this.hass}
                      .value=${entityConf.entity}
                      .configValue=${'entities'}
                      .index=${index}
                      @value-changed=${this._entityValueChanged}
                      allow-custom-entity
                    ></ha-entity-picker>
                    <ha-icon-button .label=${'Edit'} @click=${() => this._editEntity(index)}>
                      <ha-icon icon="mdi:pencil"></ha-icon>
                    </ha-icon-button>
                    <ha-icon-button .label=${'Remove'} @click=${() => this._removeEntity(index)}>
                      <ha-icon icon="mdi:close"></ha-icon>
                    </ha-icon-button>
                  </div>
                `,
              )}
            </div>
            <ha-button @click=${this._addEntity}>
              <ha-icon icon="mdi:plus" slot="icon"></ha-icon>
              ${localize(this.hass, 'component.radar-card.editor.add_entity')}
            </ha-button>
          </div>

          <div class="option-group">
            <div class="option-group-title">
              <span>${localize(this.hass, 'component.radar-card.editor.appearance')}</span>
              <ha-icon
                class="help-icon"
                icon="mdi:help-circle-outline"
                @click=${() => this._toggleHelp('appearance_help')}
              ></ha-icon>
            </div>
            ${this._showHelpFor.has('appearance_help')
              ? html`
                  <div class="help-text no-indent">
                    ${localize(this.hass, 'component.radar-card.editor.color_contrast_help')}
                  </div>
                `
              : nothing}
            <div class="side-by-side">
              ${this._renderColorInput(
                localize(this.hass, 'component.radar-card.editor.grid_color'),
                'grid_color',
                undefined,
                false,
              )}
              ${this._renderColorInput(
                localize(this.hass, 'component.radar-card.editor.font_color'),
                'font_color',
                undefined,
                false,
              )}
            </div>
            ${this._renderColorInput(
              localize(this.hass, 'component.radar-card.editor.entity_color'),
              'entity_color',
              undefined,
              false,
            )}
            <div class="option-row">
              <ha-switch
                .checked=${this._config.show_grid_labels !== false}
                .configValue=${'show_grid_labels'}
                @change=${this._valueChanged}
              ></ha-switch>
              <label class="mdc-label">${localize(this.hass, 'component.radar-card.editor.show_grid_labels')}</label>
            </div>
            <div class="option-group-title">
              <span>${localize(this.hass, 'component.radar-card.editor.legend')}</span>
              <ha-icon
                class="help-icon"
                icon="mdi:help-circle-outline"
                @click=${() => this._toggleHelp('legend_pulse_help')}
              ></ha-icon>
            </div>
            ${this._showHelpFor.has('legend_pulse_help')
              ? html`<div class="help-text no-indent">
                  ${localize(this.hass, 'component.radar-card.editor.legend_pulse_help')}
                </div>`
              : nothing}
            <div class="option-row">
              <ha-switch
                .checked=${this._config.show_legend !== false}
                .configValue=${'show_legend'}
                @change=${this._valueChanged}
              ></ha-switch>
              <label class="mdc-label">${localize(this.hass, 'component.radar-card.editor.show_legend')}</label>
            </div>
            ${this._config.show_legend !== false
              ? html`
                  <ha-select
                    .label=${localize(this.hass, 'component.radar-card.editor.legend_position')}
                    .value=${this._config.legend_position || 'bottom'}
                    .configValue=${'legend_position'}
                    @selected=${this._valueChanged}
                    @closed=${(ev: Event) => ev.stopPropagation()}
                  >
                    <mwc-list-item value="bottom"
                      >${localize(this.hass, 'component.radar-card.editor.legend_positions.bottom')}</mwc-list-item
                    >
                    <mwc-list-item value="right"
                      >${localize(this.hass, 'component.radar-card.editor.legend_positions.right')}</mwc-list-item
                    >
                    <mwc-list-item value="left"
                      >${localize(this.hass, 'component.radar-card.editor.legend_positions.left')}</mwc-list-item
                    >
                  </ha-select>
                  <div class="option-row">
                    <ha-switch
                      .checked=${this._config.legend_show_distance !== false}
                      .configValue=${'legend_show_distance'}
                      @change=${this._valueChanged}
                    ></ha-switch>
                    <label class="mdc-label"
                      >${localize(this.hass, 'component.radar-card.editor.legend_show_distance')}</label
                    >
                  </div>
                `
              : nothing}
            <div class="option-group-title">${localize(this.hass, 'component.radar-card.editor.animation')}</div>
            <div class="option-row">
              <ha-switch
                .checked=${this._config.animation_enabled !== false}
                .configValue=${'animation_enabled'}
                @change=${this._valueChanged}
              ></ha-switch>
              <label class="mdc-label">${localize(this.hass, 'component.radar-card.editor.animation_enabled')}</label>
            </div>
            ${this._config.animation_enabled !== false
              ? html`
                  <div class="duration-with-test-button">
                    <ha-textfield
                      .label=${localize(this.hass, 'component.radar-card.editor.animation_duration')}
                      type="number"
                      .value=${this._config.animation_duration || ''}
                      .configValue=${'animation_duration'}
                      @input=${this._valueChanged}
                      .suffix=${'ms'}
                    ></ha-textfield>
                    <ha-button @click=${this._testAnimation}>
                      ${localize(this.hass, 'component.radar-card.editor.test_animation')}
                    </ha-button>
                  </div>
                `
              : nothing}
            <div class="option-row">
              <ha-switch
                .checked=${this._config.moving_animation_enabled === true}
                .configValue=${'moving_animation_enabled'}
                @change=${this._valueChanged}
              ></ha-switch>
              <div class="label-with-help">
                <label class="mdc-label"
                  >${localize(this.hass, 'component.radar-card.editor.moving_animation_enabled')}</label
                >
                <ha-icon
                  class="help-icon"
                  icon="mdi:help-circle-outline"
                  @click=${() => this._toggleHelp('moving_animation_enabled')}
                ></ha-icon>
              </div>
            </div>
            ${this._showHelpFor.has('moving_animation_enabled')
              ? html`
                  <div class="help-text">
                    ${localize(this.hass, 'component.radar-card.editor.moving_animation_enabled_help')}
                  </div>
                `
              : nothing}
            ${this._config.moving_animation_enabled === true
              ? html`
                  <div class="side-by-side">
                    <ha-textfield
                      .label=${localize(this.hass, 'component.radar-card.editor.moving_animation_attribute')}
                      .value=${this._config.moving_animation_attribute || ''}
                      .configValue=${'moving_animation_attribute'}
                      .placeholder=${'activity'}
                      @input=${this._valueChanged}
                      .helper=${localize(this.hass, 'component.radar-card.editor.moving_animation_attribute_help')}
                      .helperPersistent=${true}
                    ></ha-textfield>
                    <ha-textfield
                      .label=${localize(this.hass, 'component.radar-card.editor.moving_animation_activities')}
                      .value=${(this._config.moving_animation_activities || []).join(', ')}
                      .configValue=${'moving_animation_activities'}
                      .placeholder=${'Automotive, Cycling, Walking, Driving'}
                      @input=${this._valueChanged}
                      .helper=${localize(this.hass, 'component.radar-card.editor.moving_animation_activities_help')}
                      .helperPersistent=${true}
                    ></ha-textfield>
                  </div>
                `
              : nothing}
          </div>
        </div>
      </ha-card>
    `;
  }

  static styles = css`
    ${unsafeCSS(editorStyles)}
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'radar-card-editor': RadarCardEditor;
  }
  interface WindowEventMap {
    'radar-card-markers-updated': CustomEvent;
  }
}
