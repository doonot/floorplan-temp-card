/* Floorplan Temp Card
 * Renders a floor plan as SVG from config (rects/polygons) and colors each room
 * by its temperature entity. Shows value + trend (change over the last N hours,
 * fetched client-side via the history/history_during_period WebSocket API).
 * No dependencies, no build step. MIT.
 */

const VERSION = '0.5.1';

// Live badge next to the room name when the entity is a real sensor (domain
// "sensor"): a dot with two radio waves that pulse outward in sequence.
// Built from primitives (24×24 box) so each wave can animate on its own.
function liveIconEl() {
  const g = svgEl('g', { class: 'live-icon' });
  const tip = svgEl('title');
  tip.textContent = 'Echter Sensor – Live-Daten';
  g.appendChild(tip);
  g.appendChild(svgEl('circle', { cx: 12, cy: 18.2, r: 2, class: 'dot' }));
  g.appendChild(svgEl('path', { d: 'M8.6,14.6 a5,5 0 0 1 6.8,0', class: 'w1' }));
  g.appendChild(svgEl('path', { d: 'M5.6,11.4 a9.3,9.3 0 0 1 12.8,0', class: 'w2' }));
  return g;
}

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

// Union of axis-aligned rects → closed boundary loops (rectilinear polygons).
// Grid decomposition over all rect edges, then boundary tracing with the
// interior kept on the left; at pinch points prefer the sharpest left turn so
// loops don't cross. Holes come out as separate loops (evenodd handles them).
function rectUnionLoops(rects) {
  const xs = [...new Set(rects.flatMap((r) => [r[0], r[0] + r[2]]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap((r) => [r[1], r[1] + r[3]]))].sort((a, b) => a - b);
  const nx = xs.length - 1, ny = ys.length - 1;
  const cov = Array.from({ length: nx }, (_, i) => Array.from({ length: ny }, (_, j) => {
    const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
    return rects.some((r) => cx > r[0] && cx < r[0] + r[2] && cy > r[1] && cy < r[1] + r[3]);
  }));
  const at = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && cov[i][j];
  const out = new Map();
  const add = (x1, y1, x2, y2) => {
    const k = x1 + ',' + y1;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push([x2, y2]);
  };
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    if (!cov[i][j]) continue;
    if (!at(i, j - 1)) add(xs[i], ys[j], xs[i + 1], ys[j]);
    if (!at(i, j + 1)) add(xs[i + 1], ys[j + 1], xs[i], ys[j + 1]);
    if (!at(i - 1, j)) add(xs[i], ys[j + 1], xs[i], ys[j]);
    if (!at(i + 1, j)) add(xs[i + 1], ys[j], xs[i + 1], ys[j + 1]);
  }
  const loops = [];
  while (out.size) {
    let cur = out.keys().next().value.split(',').map(Number);
    let dir = null;
    const loop = [];
    for (;;) {
      const k = cur[0] + ',' + cur[1];
      const cands = out.get(k);
      if (!cands || !cands.length) break;
      let pick = 0;
      if (dir && cands.length > 1) {
        const score = ([px, py]) => {
          const nd = [Math.sign(px - cur[0]), Math.sign(py - cur[1])];
          const cross = dir[0] * nd[1] - dir[1] * nd[0];
          return cross > 0 ? 0 : cross === 0 ? 1 : 2;
        };
        pick = cands.map((c, i) => [score(c), i]).sort((a, b) => a[0] - b[0])[0][1];
      }
      const next = cands.splice(pick, 1)[0];
      if (!cands.length) out.delete(k);
      loop.push(cur);
      dir = [Math.sign(next[0] - cur[0]), Math.sign(next[1] - cur[1])];
      cur = next;
      if (cur[0] === loop[0][0] && cur[1] === loop[0][1]) break;
    }
    const simp = loop.filter((p, i) => {
      const a = loop[(i - 1 + loop.length) % loop.length], b = loop[(i + 1) % loop.length];
      return (a[0] - p[0]) * (b[1] - p[1]) - (a[1] - p[1]) * (b[0] - p[0]) !== 0;
    });
    if (simp.length >= 3) loops.push(simp);
  }
  return loops;
}

function roomLoops(room) {
  if (Array.isArray(room.rects)) return rectUnionLoops(room.rects);
  if (room.polygon) return [room.polygon];
  const [x, y, w, h] = room.rect;
  return [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]];
}

function loopsToPath(loops) {
  return loops.map((pts) => 'M' + pts.map((p) => p.join(' ')).join(' L') + ' Z').join(' ');
}

function loopArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
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
      const hasRects = Array.isArray(r.rects) && r.rects.length >= 1
        && r.rects.every((x) => Array.isArray(x) && x.length === 4);
      if (!hasRect && !hasPoly && !hasRects) {
        throw new Error(`floorplan-temp-card: room "${r.id}" needs rect:[x,y,w,h], rects:[[x,y,w,h],...] or polygon:[[x,y],...]`);
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
      .live-icon { color: #2f7fd6; pointer-events: none; }
      .live-icon .dot { fill: currentColor; }
      .live-icon .w1, .live-icon .w2 {
        fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round;
        animation: fp-livewave 2.4s ease-in-out infinite;
      }
      .live-icon .w2 { animation-delay: 0.4s; }
      .live-icon.off { color: var(--secondary-text-color, #9aa7b4); }
      .live-icon.off .w1, .live-icon.off .w2 { animation: none; opacity: 0.45; }
      @keyframes fp-livewave {
        0%, 70%, 100% { opacity: 0.25; }
        20%, 45% { opacity: 1; }
      }
      @media (prefers-reduced-motion: reduce) {
        .live-icon .w1, .live-icon .w2 { animation: none; }
      }
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
    const pendingIcons = [];

    for (const room of c.rooms) {
      const g = svgEl('g');
      const loops = roomLoops(room);
      // Label anchor: centroid of the largest boundary loop (multi-rect rooms
      // may trace holes/islands as extra loops).
      const points = loops.reduce((a, b) => (loopArea(b) > loopArea(a) ? b : a), loops[0]);
      const shape = svgEl('path', { d: loopsToPath(loops), 'fill-rule': 'evenodd' });
      if (room.outline) {
        shape.setAttribute('class', 'outline');
      } else {
        shape.setAttribute('class', room.entity ? 'wall' : 'wall neutral');
        // Neutral until the first hass update paints the derived shade.
        if (room.entity) shape.setAttribute('fill', 'var(--secondary-background-color, #eef1f4)');
      }
      g.appendChild(shape);

      // Multi-rect rooms: default label into the "roomiest" sub-rect (largest
      // short side, then area) — the loop centroid of an L/U shape can sit at
      // the concave corner, and the largest-by-area part may be a narrow strip.
      const roomier = (a, b) => {
        const ma = Math.min(a[2], a[3]), mb = Math.min(b[2], b[3]);
        return mb > ma || (mb === ma && b[2] * b[3] > a[2] * a[3]) ? b : a;
      };
      const biggest = Array.isArray(room.rects) ? room.rects.reduce(roomier) : null;
      const [lx, ly] = room.label
        || (biggest ? [biggest[0] + biggest[2] / 2, biggest[1] + biggest[3] / 2] : centroid(points));
      let valueText = null, deltaText = null, liveIcon = null;
      const showLabel = room.show_label !== false;
      if (showLabel && room.name) {
        const nameY = room.entity ? ly - fsValue * 0.85 : ly;
        const nameText = svgEl('text', { x: lx, y: nameY, class: 'room-name' });
        nameText.textContent = room.name;
        g.appendChild(nameText);
        if (room.entity && room.entity.split('.')[0] === 'sensor') {
          liveIcon = liveIconEl();
          g.appendChild(liveIcon);
          // Position right of the name once the text is laid out; fall back to
          // an estimated width if the card isn't in the DOM yet.
          pendingIcons.push({ liveIcon, nameText, lx, nameY, name: room.name });
        }
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
      this._refs.set(room.id, { room, shape, valueText, deltaText, liveIcon });
    }

    card.appendChild(svg);
    this.shadowRoot.appendChild(card);

    const iconScale = (fsName * 0.95) / 24; // mdi paths are 24×24
    requestAnimationFrame(() => {
      for (const p of pendingIcons) {
        let len = 0;
        try { len = p.nameText.getComputedTextLength(); } catch (e) { /* not rendered yet */ }
        if (!len) len = p.name.length * fsName * 0.62;
        p.liveIcon.setAttribute(
          'transform',
          `translate(${p.lx + len / 2 + fsName * 0.3}, ${p.nameY - fsName * 0.82}) scale(${iconScale})`
        );
      }
    });
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
    for (const { room, shape, valueText, deltaText, liveIcon } of this._refs.values()) {
      if (!room.entity || room.outline) continue;
      const st = this._hass.states[room.entity];
      const temp = st ? parseFloat(st.state) : NaN;
      if (liveIcon) {
        // grey + static while the sensor is unavailable
        liveIcon.classList.toggle('off', !Number.isFinite(temp));
      }
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
