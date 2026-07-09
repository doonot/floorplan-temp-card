/* Floorplan Temp Card
 * Renders a floor plan as SVG from config (rects/polygons) and colors each room
 * by its temperature entity. Shows value + trend (change over the last N hours,
 * fetched client-side via the history/history_during_period WebSocket API).
 * No dependencies, no build step. MIT.
 */

const VERSION = '0.3.0';

const DEFAULT_THRESHOLDS = [
  { below: 19, color: '#4a90d9' },   // kühl – ruhiges Blau
  { below: 21, color: '#3aa981' },   // frisch – Salbeigrün
  { below: 23.5, color: '#e39a4d' }, // angenehm – warmes Apricot
  { color: '#e25c4a' },              // warm – sanftes Coral
];

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

// Interpolate in HSL space so a blue→red temperature gradient passes through
// green/yellow (like a real temperature scale) instead of murky purple.
// Plain linear hue interpolation (no shortest-path wrap): blue(210°)→red(0°)
// passes through cyan/green/yellow.
function mixHsl(c1, c2, t) {
  const a = rgbToHsl(hexToRgb(c1));
  const b = rgbToHsl(hexToRgb(c2));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Derive a designed pair from one accent color: a soft pastel room fill and a
// deeper, saturated tone for the value text — instead of alpha-washed fills.
function shades([h, s]) {
  const H = Math.round(h * 360);
  return {
    fill: `hsl(${H},${Math.round(Math.min(1, s * 0.85) * 100)}%,88%)`,
    text: `hsl(${H},${Math.round(Math.min(1, s * 0.8) * 100)}%,34%)`,
  };
}

function centroid(points) {
  // Area-weighted polygon centroid (falls back to vertex average for degenerate shapes).
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const f = x1 * y2 - x2 * y1;
    area += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  if (Math.abs(area) < 1e-6) {
    const n = points.length;
    return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
  }
  area *= 0.5;
  return [cx / (6 * area), cy / (6 * area)];
}

class FloorplanTempCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._refs = new Map(); // room id -> {shape, nameText, valueText, deltaTspan}
    this._deltas = new Map(); // entity -> number|null
    this._lastDeltaFetch = 0;
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.rooms) || config.rooms.length === 0) {
      throw new Error('floorplan-temp-card: "rooms" (non-empty list) is required');
    }
    for (const r of config.rooms) {
      if (!r.id) throw new Error('floorplan-temp-card: every room needs an "id"');
      const hasRect = Array.isArray(r.rect) && r.rect.length === 4;
      const hasPoly = Array.isArray(r.polygon) && r.polygon.length >= 3;
      if (!hasRect && !hasPoly) {
        throw new Error(`floorplan-temp-card: room "${r.id}" needs rect:[x,y,w,h] or polygon:[[x,y],...]`);
      }
    }
    const mode = config.color_mode || 'thresholds';
    if (!['thresholds', 'gradient'].includes(mode)) {
      throw new Error('floorplan-temp-card: color_mode must be "thresholds" or "gradient"');
    }
    if (mode === 'gradient') {
      const g = config.gradient || {};
      if (!(typeof g.min === 'number' && typeof g.max === 'number' && g.max > g.min)) {
        throw new Error('floorplan-temp-card: gradient needs numeric min < max');
      }
    }
    this._config = {
      canvas: config.canvas || [100, 100],
      color_mode: mode,
      thresholds: config.thresholds || DEFAULT_THRESHOLDS,
      gradient: { min_color: '#3b9dff', max_color: '#ff4d4d', ...(config.gradient || {}) },
      delta_hours: config.delta_hours === undefined ? 1 : Number(config.delta_hours),
      unit: config.unit === undefined ? '°' : config.unit,
      trend_suffix: config.trend_suffix || '',
      wall_color: config.wall_color,
      title: config.title,
      rooms: config.rooms,
    };
    this._lastDeltaFetch = 0;
    this._deltas.clear();
    this._createStructure();
    if (this._hass) this._updateAll();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    this._updateAll();
    const dh = this._config.delta_hours;
    if (dh > 0 && Date.now() - this._lastDeltaFetch > 5 * 60 * 1000) {
      this._lastDeltaFetch = Date.now();
      this._fetchDeltas();
    }
  }

  getCardSize() {
    const [, h] = this._config ? this._config.canvas : [100, 100];
    return Math.max(3, Math.round(h / 120));
  }

  static getStubConfig() {
    return {
      canvas: [400, 300],
      rooms: [{ id: 'room1', name: 'Room', rect: [20, 20, 360, 260], entity: '' }],
    };
  }

  // ---------- structure ----------

  _createStructure() {
    const c = this._config;
    const [w, h] = c.canvas;
    // Font sizes in viewBox units, tuned relative to canvas width.
    const fsValue = Math.max(10, w * 0.034);
    const fsName = Math.max(8, w * 0.023);

    this.shadowRoot.innerHTML = '';
    const style = document.createElement('style');
    style.textContent = `
      ha-card { overflow: hidden; }
      .title {
        padding: 14px 18px 0;
        font-size: 1.15em; font-weight: 700;
        color: var(--primary-text-color);
      }
      svg { display: block; width: 100%; height: auto; }
      .room-hit { cursor: pointer; }
      .wall { stroke: ${c.wall_color || 'var(--primary-text-color, #2b3542)'}; stroke-width: 2.5;
              stroke-linejoin: miter; opacity: 0.85; }
      .neutral { fill: var(--secondary-background-color, #eef1f4); }
      .outline { fill: none; stroke: var(--secondary-text-color, #9aa7b4);
                 stroke-width: 2; stroke-dasharray: 7 6; opacity: 0.9; }
      text { font-family: var(--paper-font-body1_-_font-family, -apple-system, 'Segoe UI', Roboto, sans-serif);
             text-anchor: middle; pointer-events: none; }
      .room-name { font-size: ${fsName}px; font-weight: 600;
                   fill: var(--secondary-text-color, #77808c); }
      .room-value { font-size: ${fsValue}px; font-weight: 800; }
      .delta { font-size: ${fsName * 0.95}px; font-weight: 400; }
      .delta-up { fill: #e25c4a; } .delta-down { fill: #4a90d9; }
    `;
    this.shadowRoot.appendChild(style);

    const card = document.createElement('ha-card');
    if (c.title) {
      const t = document.createElement('div');
      t.className = 'title';
      t.textContent = c.title;
      card.appendChild(t);
    }
    const pad = 6;
    const svg = svgEl('svg', { viewBox: `${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}` });
    this._refs.clear();

    for (const room of c.rooms) {
      const g = svgEl('g');
      let shape;
      const points = room.polygon || [
        [room.rect[0], room.rect[1]],
        [room.rect[0] + room.rect[2], room.rect[1]],
        [room.rect[0] + room.rect[2], room.rect[1] + room.rect[3]],
        [room.rect[0], room.rect[1] + room.rect[3]],
      ];
      const ptStr = points.map((p) => p.join(',')).join(' ');
      shape = svgEl('polygon', { points: ptStr });
      if (room.outline) {
        shape.setAttribute('class', 'outline');
      } else {
        shape.setAttribute('class', room.entity ? 'wall' : 'wall neutral');
        // Neutral until the first hass update paints the derived shade.
        if (room.entity) shape.setAttribute('fill', 'var(--secondary-background-color, #eef1f4)');
      }
      g.appendChild(shape);

      const [lx, ly] = room.label || centroid(points);
      let valueText = null, deltaText = null;
      const showLabel = room.show_label !== false;
      if (showLabel && room.name) {
        const nameText = svgEl('text', { x: lx, y: room.entity ? ly - fsValue * 0.85 : ly, class: 'room-name' });
        nameText.textContent = room.name;
        g.appendChild(nameText);
      }
      if (showLabel && room.entity) {
        valueText = svgEl('text', { x: lx, y: ly + fsValue * 0.45, class: 'room-value' });
        valueText.textContent = '–';
        g.appendChild(valueText);
        // Trend on its own line below the value: regular weight, no halo.
        deltaText = svgEl('text', { x: lx, y: ly + fsValue * 0.45 + fsName * 1.6, class: 'delta' });
        g.appendChild(deltaText);
      }
      if (room.entity) {
        g.classList.add('room-hit');
        g.addEventListener('click', () => this._openMoreInfo(room.entity));
      }
      svg.appendChild(g);
      this._refs.set(room.id, { room, shape, valueText, deltaText });
    }

    card.appendChild(svg);
    this.shadowRoot.appendChild(card);
  }

  // ---------- state → color/labels ----------

  _shadesFor(temp) {
    const c = this._config;
    if (c.color_mode === 'gradient') {
      const g = c.gradient;
      const t = Math.min(1, Math.max(0, (temp - g.min) / (g.max - g.min)));
      return shades(mixHsl(g.min_color, g.max_color, t));
    }
    let color = c.thresholds[c.thresholds.length - 1].color;
    for (const th of c.thresholds) {
      if (th.below === undefined || temp < th.below) { color = th.color; break; }
    }
    return shades(rgbToHsl(hexToRgb(color)));
  }

  _fmt(n, digits = 1) {
    const lang = (this._hass && this._hass.locale && this._hass.locale.language) || 'en';
    return new Intl.NumberFormat(lang, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n);
  }

  _updateAll() {
    if (!this._hass || !this._config) return;
    for (const { room, shape, valueText, deltaText } of this._refs.values()) {
      if (!room.entity || room.outline) continue;
      const st = this._hass.states[room.entity];
      const temp = st ? parseFloat(st.state) : NaN;
      if (Number.isFinite(temp)) {
        const sh = this._shadesFor(temp);
        shape.setAttribute('fill', sh.fill);
        if (valueText) {
          valueText.textContent = this._fmt(temp) + this._config.unit;
          valueText.style.fill = sh.text; // inline style wins over the class fill
        }
      } else {
        shape.setAttribute('fill', 'var(--secondary-background-color, #eef1f4)');
        if (valueText) { valueText.textContent = '–'; valueText.style.fill = ''; }
      }
      if (deltaText) {
        const d = this._deltas.get(room.entity);
        // No (meaningful) trend → show nothing at all.
        if (d === null || d === undefined || !Number.isFinite(temp) || Math.abs(d) < 0.1) {
          deltaText.textContent = '';
        } else {
          const up = d > 0;
          const c = this._config;
          deltaText.setAttribute('class', `delta ${up ? 'delta-up' : 'delta-down'}`);
          deltaText.textContent =
            `${up ? '+' : '−'}${this._fmt(Math.abs(d))}${c.unit}${c.trend_suffix ? ' ' + c.trend_suffix : ''}`;
        }
      }
    }
  }

  // ---------- history delta ----------

  async _fetchDeltas() {
    const c = this._config;
    const entities = [...new Set(c.rooms.filter((r) => r.entity && !r.outline).map((r) => r.entity))];
    if (!entities.length || !this._hass) return;
    const end = new Date();
    const start = new Date(end.getTime() - c.delta_hours * 3600 * 1000);
    try {
      const resp = await this._hass.callWS({
        type: 'history/history_during_period',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        entity_ids: entities,
        include_start_time_state: true,
        significant_changes_only: false,
        minimal_response: true,
        no_attributes: true,
      });
      for (const ent of entities) {
        const list = resp[ent];
        if (!Array.isArray(list) || list.length === 0) { this._deltas.set(ent, null); continue; }
        const first = parseFloat(list[0].s !== undefined ? list[0].s : list[0].state);
        const st = this._hass.states[ent];
        const now = st ? parseFloat(st.state) : NaN;
        this._deltas.set(ent, Number.isFinite(first) && Number.isFinite(now) ? now - first : null);
      }
    } catch (e) {
      console.warn('floorplan-temp-card: history fetch failed', e);
      for (const ent of entities) this._deltas.set(ent, null);
    }
    this._updateAll();
  }

  _openMoreInfo(entityId) {
    const ev = new CustomEvent('hass-more-info', {
      bubbles: true,
      composed: true,
      detail: { entityId },
    });
    this.dispatchEvent(ev);
  }
}

customElements.define('floorplan-temp-card', FloorplanTempCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'floorplan-temp-card',
  name: 'Floorplan Temp Card',
  description: 'Floor plan with rooms colored by temperature + trend indicator',
});

console.info(
  `%c FLOORPLAN-TEMP-CARD %c v${VERSION} `,
  'background:#17b890;color:#fff;font-weight:700;border-radius:3px 0 0 3px;padding:2px 0',
  'background:#2b3542;color:#fff;border-radius:0 3px 3px 0;padding:2px 0'
);
