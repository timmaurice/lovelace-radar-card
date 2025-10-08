# Radar Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg?style=flat-square)](https://github.com/hacs/integration)
![GitHub release (latest by date)](https://img.shields.io/github/v/release/timmaurice/lovelace-radar-card?style=flat-square)
[![GH-downloads](https://img.shields.io/github/downloads/timmaurice/lovelace-radar-card/total?style=flat-square)](https://github.com/timmaurice/lovelace-radar-card/releases)
[![GH-last-commit](https://img.shields.io/github/last-commit/timmaurice/lovelace-radar-card.svg?style=flat-square)](https://github.com/timmaurice/lovelace-radar-card/commits/master)
[![GH-code-size](https://img.shields.io/github/languages/code-size/timmaurice/lovelace-radar-card.svg?style=flat-square)](https://github.com/timmaurice/lovelace-radar-card)
![GitHub](https://img.shields.io/github/license/timmaurice/lovelace-radar-card?style=flat-square)

## Features

### Flexible Plotting

- Plot multiple `device_tracker` entities on a polar chart.
- Set a custom center point by selecting a `device_tracker`, `person`, or `zone` entity. Uses your Home Assistant location by default.

### Dynamic Radar Display

- **Persistent Markers**: Create and manage custom points of interest (markers) directly on the radar when using a moving center point. Markers are stored locally in your browser.
- Automatically scales the radar distance to fit all entities, or set a fixed maximum distance.
- Optional, clear distance labels on the grid rings for quick reference.
- Optional "radar ping" animation for entities that are considered to be moving.

### Rich Interactivity

- Hover over points to see a detailed tooltip with distance and azimuth.
- Click entity points to open their more-info dialog.
- Display an optional legend to identify entities by color.
- Click legend items to make the corresponding dot on the radar pulse.

### Deep Customization

- Customize colors for the grid, fonts, and a default for all entities.
- Override name and color on a per-entity basis.
- Configure legend position (`bottom`, `left`, `right`) and optionally show distances within it.

![Radar Card Screenshot](https://raw.githubusercontent.com/timmaurice/lovelace-radar-card/main/screenshot.png)

## Languages

This card is available in the following languages:

- English
- German
- French
- Polish

<details>
<summary>Contributing Translations</summary>

If you would like to contribute a new translation:

1.  Fork the repository on GitHub.
2.  Copy the `src/translation/en.json` file and rename it to your language code (e.g., `es.json` for Spanish).
3.  Translate all the values in the new file.
4.  Submit a pull request with your changes.

</details>

## Installation

### HACS (Recommended)

This card is available in the [Home Assistant Community Store (HACS)](https://hacs.xyz/).

<a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=timmaurice&repository=lovelace-radar-card&category=plugin" target="_blank" rel="noreferrer noopener"><img src="https://my.home-assistant.io/badges/hacs_repository.svg" alt="Open your Home Assistant instance and open a repository inside the Home Assistant Community Store." /></a>

<details>
<summary>Manual Installation</summary>

1.  Download the `radar-card.js` file from the latest release.
2.  Place it in your `config/www` directory.
3.  Add the resource reference to your Lovelace configuration under `Settings` -> `Dashboards` -> `...` -> `Resources`.
    - URL: `/local/radar-card.js`
    - Resource Type: `JavaScript Module`

You can now add the card to your dashboard.

</details>

## Configuration

This card is fully configurable through the Lovelace UI editor.

- **Main Settings**: Configure the card's title, radar distance settings, and center coordinates.
- **Appearance**: Customize colors, toggle grid labels, and configure the legend's appearance and position.
- **Entities**: Add, remove, and reorder entities. You can easily sort your entities using drag and drop. Click the pencil icon to edit an entity's name and color individually.

For those who prefer YAML, the options are documented below.

### Main Configuration

| Name                          | Type    | Default                                           | Description                                                                                                                                               |
| ----------------------------- | ------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                        | string  | **Required**                                      | `custom:radar-card`                                                                                                                                       |
| `title`                       | string  | `''`                                              | The title of the card.                                                                                                                                    |
| `entities`                    | array   | **Required**                                      | A list of entity objects to display on the radar.                                                                                                         |
| `center_entity`               | string  | (from Home Assistant)                             | Override the center location of the radar by providing a `device_tracker` or `person` entity. Takes priority over other center configurations.            |
| `auto_radar_max_distance`     | boolean | `true`                                            | Automatically adjust the maximum radar distance based on the furthest entity.                                                                             |
| `radar_max_distance`          | number  | `100`                                             | The maximum distance shown on the radar (in km or mi). Ignored if `auto_radar_max_distance` is `true`.                                                    |
| `enable_markers`              | boolean | `false`                                           | When using a `center_entity` (moving mode), this enables the ability to add and display persistent markers on the radar.                                  |
| `grid_color`                  | string  | `var(--primary-text-color)`                       | Color for the radar grid lines and cardinal points.                                                                                                       |
| `font_color`                  | string  | `var(--primary-text-color)`                       | Color for the cardinal point labels (N, E, S, W).                                                                                                         |
| `entity_color`                | string  | `var(--info-color)`                               | Default color for the entity points on the radar.                                                                                                         |
| `show_grid_labels`            | boolean | `true`                                            | If `true`, shows distance labels on the grid circles.                                                                                                     |
| `show_legend`                 | boolean | `true`                                            | Show a legend with entity colors and names below the radar.                                                                                               |
| `legend_position`             | string  | `bottom`                                          | Position of the legend. Can be `bottom`, `right`, or `left`.                                                                                              |
| `legend_show_distance`        | boolean | `true`                                            | If `true`, shows the entity's distance in the legend.                                                                                                     |
| `location_zone_entity`        | string  | (from Home Assistant)                             | Override the center location of the radar by providing a `zone` entity.                                                                                   |
| `center_latitude`             | number  | (from Home Assistant)                             | Override the latitude of the center location of the radar. Requires `center_longitude`. Deprecated in favor of `location_zone_entity` or `center_entity`. |
| `center_longitude`            | number  | (from Home Assistant)                             | Override the longitude of the center location of the radar. Requires `center_latitude`. Deprecated in favor of `location_zone_entity` or `center_entity`. |
| `animation_enabled`           | boolean | `true`                                            | Enable the initial entry animation.                                                                                                                       |
| `animation_duration`          | number  | `750`                                             | Duration of the animation in milliseconds.                                                                                                                |
| `moving_animation_enabled`    | boolean | `false`                                           | Enable a radar-like ping animation for moving entities.                                                                                                   |
| `moving_animation_attribute`  | string  | `activity`                                        | The entity attribute to check for the moving state. Requires `moving_animation_enabled` to be `true`.                                                     |
| `moving_animation_activities` | array   | `['Automotive', 'Cycling', 'Walking', 'Driving']` | A list of values for the `moving_animation_attribute` that should trigger the animation. Case-insensitive.                                                |

### Entity Configuration (within `entities` list)

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
entity_color: 'var(--accent-color)'
entities:
  - entity: device_tracker.person1
    name: Person 1
    color: '#ff0000'
  - device_tracker.person2 # You can also use a simple string
  - entity: device_tracker.car
    color: 'blue'
```

#### Example with Moving Center

```yaml
type: custom:radar-card
title: My Surroundings
center_entity: person.me
enable_markers: true
entities:
  - device_tracker.dog_tracker
  - device_tracker.parked_car
```

#### Example with Zone Entity

```yaml
type: custom:radar-card
title: Office Area
location_zone_entity: zone.work
entities:
  - device_tracker.person1
```

## Development

<details>
<summary>To contribute to the development, you'll need to set up a build environment.</summary>

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
</details>

---

For further assistance or to [report issues](https://github.com/timmaurice/lovelace-radar-card/issues), please visit the [GitHub repository](https://github.com/timmaurice/lovelace-radar-card).

![Star History Chart](https://api.star-history.com/svg?repos=timmaurice/lovelace-radar-card&type=Date)

## ☕ Support My Work

[<img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="30" />](https://www.buymeacoffee.com/timmaurice)
