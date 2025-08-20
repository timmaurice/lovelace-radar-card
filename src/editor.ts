import { LitElement, html, css, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { HomeAssistant, LovelaceCardEditor, RadarCardConfig } from './types';
import { localize } from './localize';
import { fireEvent } from './utils';
import editorStyles from './styles/editor.styles.scss';

interface ValueChangedEventTarget extends HTMLElement {
  configValue?: keyof RadarCardConfig;
  value?: string | number;
  checked?: boolean;
  type?: string;
  tagName: string;
}

@customElement('radar-card-editor')
export class RadarCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config!: RadarCardConfig;

  public setConfig(config: RadarCardConfig): void {
    this._config = config;
  }

  private _valueChanged(ev: Event): void {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target as ValueChangedEventTarget;
    if (!target.configValue) {
      return;
    }

    const configValue = target.configValue as keyof RadarCardConfig;
    const newConfig = { ...this._config };

    const value = target.tagName === 'HA-SWITCH' ? target.checked : target.value;

    if (value === '' || value === false || value === undefined) {
      delete newConfig[configValue];
    } else {
      newConfig[configValue] = target.type === 'number' ? Number(value) : value;
    }

    fireEvent(this, 'config-changed', { config: newConfig });
  }

  private _entityChanged(ev: CustomEvent): void {
    if (!this._config || !this.hass) {
      return;
    }
    const newConfig = {
      ...this._config,
      entity: ev.detail.value,
    };
    fireEvent(this, 'config-changed', { config: newConfig });
  }

  protected render(): TemplateResult {
    if (!this.hass || !this._config) {
      return html``;
    }

    return html`
      <ha-card>
        <div class="card-content card-config">
          <ha-textfield
            .label=${localize(this.hass, 'component.radar-card.editor.title')}
            .value=${this._config.title || ''}
            .configValue=${'title'}
            @input=${this._valueChanged}
          ></ha-textfield>
          <ha-entity-picker
            .hass=${this.hass}
            .label=${localize(this.hass, 'component.radar-card.editor.entity')}
            .value=${this._config.entity || ''}
            .includeDomains=${['sensor', 'event']}
            @value-changed=${this._entityChanged}
            allow-custom-entity
            required
          ></ha-entity-picker>
        </div>
      </ha-card>
    `;
  }

  static styles = css`
    ${unsafeCSS(editorStyles)}
  `;
}
