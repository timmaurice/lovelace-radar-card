# Radar Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg?style=flat-square)](https://github.com/hacs/integration)
![GitHub release (latest by date)](https://img.shields.io/github/v/release/timmaurice/lovelace-radar-card?style=flat-square)
[![GH-downloads](https://img.shields.io/github/downloads/timmaurice/lovelace-radar-card/total?style=flat-square)](https://github.com/timmaurice/lovelace-radar-card/releases)
[![GH-last-commit](https://img.shields.io/github/last-commit/timmaurice/lovelace-radar-card.svg?style=flat-square)](https://github.com/timmaurice/lovelace-radar-card/commits/master)
[![GH-code-size](https://img.shields.io/github/languages/code-size/timmaurice/lovelace-radar-card.svg?color=red&style=flat-square)](https://github.com/timmaurice/lovelace-radar-card)
![GitHub](https://img.shields.io/github/license/timmaurice/lovelace-radar-card?style=flat-square)

## Features

![Radar Card Screenshot](https://raw.githubusercontent.com/timmaurice/lovelace-radar-card/main/screenshot.png)

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

| Name                      | Type    | Default      | Description                                                                                             |
| ------------------------- | ------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| `type`                    | string  | **Required** | `custom:radar-card`                                                                                  |
| `entity`                  | string  | **Required** | The entity ID of your feed sensor or event.                                                             |
| `title`                   | string  | `''`         | The title of the card.                                                                                  |

### Examples

```yaml
type: custom:radar-card
title: Home Assistant Blog
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
