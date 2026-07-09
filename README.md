# Floorplan Temp Card

A lightweight Home Assistant Lovelace card that renders a floor plan as clean SVG
and colors each room by its temperature sensor — with a configurable trend indicator
(temperature change over the last N hours) fetched client-side from the recorder
history. No build step, no dependencies.

![thresholds mode](https://raw.githubusercontent.com/doonot/floorplan-temp-card/main/docs/preview.png)

## Features

- **Rooms drawn from config** (rects or polygons) — no background image required,
  crisp at any size, light/dark theme aware.
- **Fill color by temperature** — two modes:
  - `thresholds`: discrete bands (e.g. 🔵 <19° · 🟢 19–21° · 🟠 21–23.5° · 🔴 ≥23.5°)
  - `gradient`: continuous interpolation between two colors
- **Trend indicator**: change over the last `delta_hours` (default 1 h), e.g. `▲0.4`,
  computed client-side via the `history/history_during_period` WebSocket API.
- **Tap a room → more-info** dialog (adjust target temp for `input_number`/`climate`).
- Rooms without an entity render as neutral (unheated); `outline: true` renders
  dashed outlines (balconies, terraces).
- Multiple floors = one card per floor.

## Installation (HACS)

1. HACS → Custom repositories → `doonot/floorplan-temp-card` (type: Dashboard).
2. Install "Floorplan Temp Card". The Lovelace resource is registered automatically.

## Configuration

```yaml
type: custom:floorplan-temp-card
title: Erdgeschoss
canvas: [645, 1160]          # coordinate space [width, height]
color_mode: thresholds        # thresholds | gradient
thresholds:                   # evaluated top-down, first match wins
  - {below: 19,   color: '#3b9dff'}
  - {below: 21,   color: '#17b890'}
  - {below: 23.5, color: '#e08b1a'}
  - {color: '#ff4d4d'}        # fallback (no "below")
gradient: {min: 17, max: 26, min_color: '#3b9dff', max_color: '#ff4d4d'}
delta_hours: 1                # trend window; 0 disables the history fetch
fill_opacity: 0.4             # room fill opacity (0–1)
rooms:
  - {id: living, name: Living room, rect: [30, 30, 400, 300], entity: sensor.living_temp}
  - {id: hall,   name: Hall, polygon: [[450,30],[600,30],[600,330],[450,330]], entity: sensor.hall_temp, show_label: false}
  - {id: garage, name: Garage, rect: [30, 350, 400, 250]}          # no entity → neutral
  - {id: patio,  name: Patio,  rect: [450, 350, 150, 250], outline: true}
```

### Room options

| Option | Description |
|---|---|
| `id` | unique id (required) |
| `name` | label text |
| `rect: [x, y, w, h]` | rectangle geometry (this or `polygon`) |
| `polygon: [[x,y], ...]` | polygon geometry |
| `entity` | temperature entity; omit for unheated rooms |
| `show_label: false` | color the room but hide its label (e.g. a hallway sharing another room's sensor) |
| `label: [x, y]` | override label anchor (default: shape centroid) |
| `outline: true` | dashed outline, no fill (balcony/terrace) |

### Card options

| Option | Default | Description |
|---|---|---|
| `canvas` | `[100, 100]` | coordinate space `[w, h]` |
| `color_mode` | `thresholds` | `thresholds` or `gradient` |
| `thresholds` | blue/green/amber/red as above | list of `{below, color}`, last entry = fallback |
| `gradient` | — | `{min, max, min_color, max_color}` |
| `delta_hours` | `1` | trend window in hours, `0` = off |
| `fill_opacity` | `0.4` | heated-room fill opacity |
| `unit` | `°` | unit suffix in labels |
| `wall_color` | theme text color | wall stroke color |

## Editor

A standalone visual editor (draw rooms over a reference image, assign entities,
export ready-to-paste YAML) ships with this repo:
**https://doonot.github.io/floorplan-temp-card/**

The reference image stays in your browser — only geometry is exported.

## License

MIT
