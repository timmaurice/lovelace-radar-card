# Radar Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg?style=flat-square)](https://github.com/hacs/integration)
![GitHub release (latest by date)](https://img.shields.io/github/v/release/timmaurice/lovelace-radar-card?style=flat-square)
[![GH-downloads](https://img.shields.io/github/downloads/timmaurice/lovelace-radar-card/total?style=flat-square)](https://github.com/timmaurice/lovelace-radar-card/releases)
[![GH-last-commit](https://img.shields.io/github/last-commit/timmaurice/lovelace-radar-card.svg?style=flat-square)](https://github.com/timmaurice/lovelace-radar-card/commits/master)
[![GH-code-size](https://img.shields.io/github/languages/code-size/timmaurice/lovelace-radar-card.svg?color=red&style=flat-square)](https://github.com/timmaurice/lovelace-radar-card)
![GitHub](https://img.shields.io/github/license/timmaurice/lovelace-radar-card?style=flat-square)

## Features

![Radar Card Screenshot](https://raw.githubusercontent.com/timmaurice/lovelace-radar-card/main/screenshot.png)

- Plot multiple `device_tracker` entities on a polar chart.
- Automatically scales the radar distance to fit all entities.
- Manually set a fixed maximum radar distance.
- Customizable colors for the grid, fonts, and a default for all entities.
- Per-entity customization for name and color.
- Interactive points on the radar:
  - Hover to see a tooltip with distance and azimuth.
  - Click to open the entity's more-info dialog (can be disabled).

## Installation

### HACS (Recommended)

This card is available in the [Home Assistant Community Store (HACS)](https://hacs.xyz/).

<a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=timmaurice&repository=lovelace-radar-card&category=plugin" target="_blank" rel="noreferrer noopener"><img src="https://my.home-assistant.io/badges/hacs_repository.svg" alt="Open your Home Assistant instance and open a repository inside the Home Assistant Community Store." /></a>

### Manual Installation

1.  Download the `radar-card.js` file from the latest release.
2.  Place it in your `config/www` directory.
3.  Add the resource reference to your Lovelace configuration under `Settings` -> `Dashboards` -> `...` -> `Resources`.
    - URL: `/local/radar-card.js`
    - Resource Type: `JavaScript Module`

You can now add the card to your dashboard.

## Configuration

### Main Configuration

| Name                      | Type    | Default                     | Description                                                                                              |
| ------------------------- | ------- | --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `type`                    | string  | **Required**                | `custom:radar-card`                                                                                      |
| `title`                   | string  | `''`                        | The title of the card.                                                                                   |
| `entities`                | array   | **Required**                | A list of entity objects to display on the radar.                                                        |
| `auto_radar_max_distance` | boolean | `false`                     | Automatically adjust the maximum radar distance based on the furthest entity.                            |
| `radar_max_distance`      | number  | `100`                       | The maximum distance shown on the radar (in km or mi). Ignored if `auto_radar_max_distance` is `true`.   |
| `grid_color`              | string  | `var(--primary-text-color)` | Color for the radar grid lines and cardinal points.                                                      |
| `font_color`              | string  | `var(--primary-text-color)` | Color for the cardinal point labels (N, E, S, W).                                                        |
| `entity_color`            | string  | `var(--info-color)`         | Default color for the entity points on the radar.                                                        |
| `show_grid_labels`        | boolean | `true`                      | If `true`, shows distance labels on the grid circles.                                                    |
| `points_clickable`        | boolean | `true`                      | If `true`, clicking an entity point opens the more-info dialog. Set to `false` to disable this behavior. |
| `show_legend`             | boolean | `false`                     | Show a legend with entity colors and names below the radar.                                              |
| `legend_position`         | string  | `bottom`                    | Position of the legend. Can be `bottom`, `right`, or `left`.                                             |
| `legend_show_distance`    | boolean | `false`                     | If `true`, shows the entity's distance in the legend.                                                    |
| `center_latitude`         | number  | (from Home Assistant)       | Override the latitude of the center location of the radar. Requires `center_longitude`.                  |
| `center_longitude`        | number  | (from Home Assistant)       | Override the longitude of the center location of the radar. Requires `center_latitude`.                  |

### Entity Configuration

Each entry in the `entities` list can be a simple string or an object with more options.

| Name     | Type   | Default                | Description                                           |
| -------- | ------ | ---------------------- | ----------------------------------------------------- |
| `entity` | string | **Required**           | The ID of the `device_tracker` entity.                |
| `name`   | string | (entity friendly name) | An override for the entity name shown in the tooltip. |
| `color`  | string | (from `entity_color`)  | An override for the entity point color.               |

### Examples

```yaml
type: custom:radar-card
title: Device Locations
auto_radar_max_distance: true
show_legend: true
legend_show_distance: true
entity_color: 'var(--accent-color)'
entities:
  - entity: device_tracker.person1
    name: Person 1
    color: '#ff0000'
  - device_tracker.person2 # You can also use a simple string
  - entity: device_tracker.car
    color: 'blue'
```

## Development

To contribute to the development, you'll need to set up a build environment.

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/timmaurice/lovelace-radar-card.git
    cd lovelace-radar-card
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Start the development server:**
    This command will watch for changes in the `src` directory and automatically rebuild the card.

    ```bash
    npm run watch
    ```

4.  In your Home Assistant instance, you will need to configure Lovelace to use the local development version of the card from `dist/radar-card.js`.

---

For further assistance or to [report issues](https://github.com/timmaurice/lovelace-radar-card/issues), please visit the [GitHub repository](https://github.com/timmaurice/lovelace-radar-card).
