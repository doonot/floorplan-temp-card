/* Floorplan Temp Card
 * Renders a floor plan as SVG from config (rects/polygons) and colors each room
 * by its temperature entity. Shows value + trend (change over the last N hours,
 * fetched client-side via the history/history_during_period WebSocket API).
 * No dependencies, no build step. MIT.
 */

const VERSION = '0.15.1';

// Sichtbarkeits-Ebenen: global über alle Karten synchron (localStorage +
// Custom-Event), umgeschaltet über die Legende unter dem Kartenkopf.
const LAYERS = [
  ['temp', 'Temperatur'],
  ['light', 'Licht'],
  ['cover', 'Storen'],
  ['ac', 'Klima'],
  ['camera', 'Video'],
  ['wifi', 'WLAN'],
  ['decor', 'Grün'],
  ['other', 'Geräte'],
];
const LAYER_STORE_KEY = 'floorplan-temp-card-layers';
const DEVICE_LAYER = {
  light: 'light', cover: 'cover', ac: 'ac', camera: 'camera', ap: 'wifi',
  switch: 'other', mower: 'other', sprinkler: 'other',
};

// Device icons placed on the plan (24×24 mdi paths)
const DEVICE_ICONS = {
  light: 'M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2M9,21A1,1 0 0,0 10,22H14A1,1 0 0,0 15,21V20H9V21Z',
  cover: 'M3,4H21V8H19V20H17V8H7V20H5V8H3V4M8,9H16V11H8V9M8,12H16V14H8V12M8,15H16V17H8V15M8,18H16V20H8V18Z',
  switch: 'M16,7V3H14V7H10V3H8V7C8,7 7,8 7,9V14.5L10.5,18V21H13.5V18L17,14.5V9C17,8 16,7 16,7Z',
  mower: 'M1 14V5H13C18.5 5 23 9.5 23 15V17H20.83C20.42 18.17 19.31 19 18 19C16.69 19 15.58 18.17 15.17 17H10C9.09 18.21 7.64 19 6 19C3.24 19 1 16.76 1 14M6 11C4.34 11 3 12.34 3 14C3 15.66 4.34 17 6 17C7.66 17 9 15.66 9 14C9 12.34 7.66 11 6 11M15 10V12H20.25C19.92 11.27 19.5 10.6 19 10H15Z',
  sprinkler: 'M10 10H14V22H10V10M7 9H9V7H7V9M4 8H6V6H4V8M4 11H6V9H4V11M1 13H3V11H1V13M1 7H3V5H1V7M1 10H3V8H1V10M18 11H20V9H18V11M21 10H23V8H21V10M21 5V7H23V5H21M21 13H23V11H21V13M15 9H17V7H15V9M18 8H20V6H18V8M10 7H10.33L11 9H13L13.67 7H14V6H10V7Z',
  ac: 'M6.59,0.66C8.93,-1.15 11.47,1.06 12.04,4.5C12.47,4.5 12.89,4.62 13.27,4.84C13.79,4.24 14.25,3.42 14.07,2.5C13.65,0.35 16.06,-1.39 18.35,1.58C20.16,3.92 17.95,6.46 14.5,7.03C14.5,7.46 14.39,7.89 14.16,8.27C14.76,8.78 15.58,9.24 16.5,9.06C18.63,8.64 20.38,11.04 17.41,13.34C15.07,15.15 12.53,12.94 11.96,9.5C11.53,9.5 11.11,9.37 10.74,9.15C10.22,9.75 9.75,10.58 9.93,11.5C10.35,13.64 7.94,15.39 5.65,12.42C3.83,10.07 6.05,7.53 9.5,6.97C9.5,6.54 9.63,6.12 9.85,5.74C9.25,5.23 8.43,4.76 7.5,4.94C5.37,5.36 3.62,2.96 6.59,0.66M5,16H7A2,2 0 0,1 9,18V24H7V22H5V24H3V18A2,2 0 0,1 5,16M5,18V20H7V18H5M12.93,16H15L12.07,24H10L12.93,16M18,16H21V18H18V22H21V24H18A2,2 0 0,1 16,22V18A2,2 0 0,1 18,16Z',
  camera: 'M6.03 12.03L8.03 15.5L5.5 18.68L2 12.62L6.03 12.03M17 18V15.29C17.88 14.9 18.5 14.03 18.5 13C18.5 12.43 18.3 11.9 17.97 11.5L19.94 10.35C20.95 9.76 21.3 8.47 20.71 7.46L19.33 5.06C18.74 4.05 17.45 3.7 16.44 4.28L8.31 9C7.36 9.53 7.03 10.75 7.58 11.71L9.08 14.31C9.63 15.26 10.86 15.59 11.81 15.04L13.69 13.96C13.94 14.55 14.41 15.03 15 15.29V18C15 19.1 15.9 20 17 20H22V18H17Z',
  ap: 'M4.93,4.93C3.12,6.74 2,9.24 2,12C2,14.76 3.12,17.26 4.93,19.07L6.34,17.66C4.89,16.22 4,14.22 4,12C4,9.79 4.89,7.78 6.34,6.34L4.93,4.93M19.07,4.93L17.66,6.34C19.11,7.78 20,9.79 20,12C20,14.22 19.11,16.22 17.66,17.66L19.07,19.07C20.88,17.26 22,14.76 22,12C22,9.24 20.88,6.74 19.07,4.93M7.76,7.76C6.67,8.85 6,10.35 6,12C6,13.65 6.67,15.15 7.76,16.24L9.17,14.83C8.45,14.11 8,13.11 8,12C8,10.89 8.45,9.89 9.17,9.17L7.76,7.76M16.24,7.76L14.83,9.17C15.55,9.89 16,10.89 16,12C16,13.11 15.55,14.11 14.83,14.83L16.24,16.24C17.33,15.15 18,13.65 18,12C18,10.35 17.33,8.85 16.24,7.76M12,10A2,2 0 0,0 10,12A2,2 0 0,0 12,14A2,2 0 0,0 14,12A2,2 0 0,0 12,10Z',
};

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

// Derive a designed pair from one accent color. Light mode: soft pastel fill +
// deep value color. Dark mode: a muted deep-toned fill (like amber-brown for
// warm rooms) + a bright value color that reads on near-black.
function shades([h, s], dark, lit) {
  const H = Math.round(h * 360);
  if (dark) {
    // muted deep fills (mock: warm brown ~hsl(38,43%,16%)) + strong warm value
    // colors — pastel/green reads wrong on near-black. Lit rooms glow brighter.
    return {
      fill: lit
        ? `hsl(${H},${Math.round(Math.min(1, s * 0.52) * 100)}%,24%)`
        : `hsl(${H},${Math.round(Math.min(1, s * 0.42) * 100)}%,15%)`,
      text: `hsl(${H},65%,${lit ? 66 : 60}%)`,
    };
  }
  return {
    fill: `hsl(${H},${Math.round(Math.min(1, s * 0.85) * 100)}%,${lit ? 84 : 88}%)`,
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

// Even-odd point-in-polygon across all loops of a room (matches the rendering).
function pointInLoops(pt, loops) {
  let inside = false;
  for (const loop of loops) {
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const [xi, yi] = loop[i], [xj, yj] = loop[j];
      if ((yi > pt[1]) !== (yj > pt[1])
        && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
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
    if (config.devices !== undefined) {
      if (!Array.isArray(config.devices)) throw new Error('floorplan-temp-card: "devices" must be a list');
      for (const dv of config.devices) {
        const okType = ['light', 'cover', 'switch', 'mower', 'sprinkler', 'ac', 'camera', 'ap'].includes(dv.type);
        const hasAt = Array.isArray(dv.at) && dv.at.length === 2;
        const hasSegment = Array.isArray(dv.from) && dv.from.length === 2
          && Array.isArray(dv.to) && dv.to.length === 2;
        // covers are wall segments (from/to); the rest are points (at).
        // APs sind rein informativ — Entity optional (Kabel-Label reicht).
        if (!okType || (!dv.entity && dv.type !== 'ap') || !(dv.type === 'cover' ? hasSegment || hasAt : hasAt)) {
          throw new Error('floorplan-temp-card: device needs type, entity and at:[x,y] (cover: from/to:[x,y])');
        }
      }
    }
    if (config.decor !== undefined) {
      if (!Array.isArray(config.decor)) throw new Error('floorplan-temp-card: "decor" must be a list');
      for (const dc of config.decor) {
        const point = Array.isArray(dc.at) && dc.at.length === 2;
        const seg = Array.isArray(dc.from) && Array.isArray(dc.to);
        if (!['tree', 'hedge', 'plant'].includes(dc.type) || !(dc.type === 'hedge' ? seg : point)) {
          throw new Error('floorplan-temp-card: decor needs type tree/plant (at:[x,y]) or hedge (from/to)');
        }
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
      devices: config.devices || [],
      decor: config.decor || [],
      // zusätzliche Entities, die "🌙 Schlafen" mit ausschaltet (z. B. Hue-Lampen
      // ohne Platzierung auf dem Plan)
      sleep_extra: Array.isArray(config.sleep_extra) ? config.sleep_extra : [],
      // true | false | 'auto' (follows the HA dark mode)
      dark: config.dark === undefined ? 'auto' : config.dark,
    };
    this._lastDeltaFetch = 0;
    this._deltas.clear();
    this._createStructure();
    if (this._hass) this._updateAll();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    const dark = this._config.dark === 'auto'
      ? !!(hass.themes && hass.themes.darkMode)
      : !!this._config.dark;
    if (dark !== this._isDark) {
      this._isDark = dark;
      const card = this.shadowRoot.querySelector('ha-card');
      if (card) card.classList.toggle('dark', dark);
    }
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
      ha-card { overflow: hidden; --fp-neutral: var(--secondary-background-color, #eef1f4); }
      /* dark appearance: near-black panel, light wall lines, deep-toned room fills */
      ha-card.dark { --fp-neutral: #182031; background: #111826; }
      .dark .title { color: #e6ecf3; }
      .dark .wall { stroke: #93a7c0; }
      .dark .room-name { fill: #94a1b0; }
      .dark .outline { stroke: #5d6c80; }
      .dark .delta-up { fill: #c87f5e; }
      .dark .delta-down { fill: #6ba6e8; }
      .dark .device .device-bg { fill: #223046; stroke: #3c4a61; }
      .dark .device .device-icon { fill: #aab6c5; }
      .dark .cover-border { stroke: #61708a; }
      .dark .cover-track { stroke: #26303f; }
      .dark .cover-fill { stroke: #a9bdd8; }
      .header {
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; flex-wrap: wrap; padding: 14px 18px 0;
      }
      .title {
        font-size: 1.15em; font-weight: 700;
        color: var(--primary-text-color);
      }
      .dark .title { color: #e6ecf3; }
      .shortcuts { display: flex; gap: 6px; margin-left: auto; }
      .sc-btn {
        border: 1px solid var(--divider-color, #d5dbe2); background: transparent;
        border-radius: 999px; padding: 4px 11px; font: inherit; font-size: 12px;
        color: var(--secondary-text-color, #6b7480); cursor: pointer; line-height: 1.4;
      }
      .sc-btn:active { transform: scale(0.95); }
      .dark .sc-btn { border-color: #3c4a61; color: #aab6c5; }
      svg { display: block; width: 100%; height: auto; touch-action: manipulation; }
      .room-hit { cursor: pointer; }
      .wall { stroke: ${c.wall_color || 'var(--primary-text-color, #2b3542)'}; stroke-width: 2.5;
              stroke-linejoin: miter; opacity: 0.85; }
      .neutral { fill: var(--fp-neutral); }
      .neutral.lit { fill: #f3ecd9; }
      .dark .neutral.lit { fill: #272f42; }
      /* surface types: garden lawn, paver pattern, stair stripes — also on outlines */
      .garden, .outline.garden { fill: #b5d5a7; }
      .garden.lit, .outline.garden.lit { fill: #c4e0b6; }
      .dark .garden, .dark .outline.garden { fill: #1d3325; }
      .dark .garden.lit, .dark .outline.garden.lit { fill: #27422f; }
      .paving, .outline.paving { fill: url(#fp-paving); }
      .stairs, .outline.stairs { fill: url(#fp-stairs); }
      .pav-bg { fill: #dde1e6; } .pav-line { stroke: #c3c9d1; stroke-width: 1.5; }
      .dark .pav-bg { fill: #212936; } .dark .pav-line { stroke: #303b4d; }
      .stair-bg { fill: var(--fp-neutral); } .stair-line { stroke: #b9c1cb; stroke-width: 2; }
      .dark .stair-line { stroke: #37435a; }
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
      /* live sensor: gentle breathing; green tint only in light mode (on dark
         the warm per-threshold value colors stay) */
      .room-value.live { fill: hsl(158, 55%, 32%) !important; }
      .room-value.pulse { animation: fp-livepulse 2.4s ease-in-out infinite; }
      @keyframes fp-livewave {
        0%, 70%, 100% { opacity: 0.25; }
        20%, 45% { opacity: 1; }
      }
      @keyframes fp-livepulse {
        0%, 100% { opacity: 1; }
        45% { opacity: 0.62; }
      }
      @media (prefers-reduced-motion: reduce) {
        .live-icon .w1, .live-icon .w2, .room-value.pulse { animation: none; }
      }
      /* layer visibility (classes toggled on ha-card by the legend) */
      ${LAYERS.map(([k]) => `.hide-${k} [data-layer="${k}"] { display: none; }`).join('\n      ')}
      .hide-temp path.wall:not(.garden):not(.paving):not(.stairs) { fill: var(--fp-neutral); }
      /* devices (lights, covers, sockets) placed on the plan */
      .device { cursor: pointer; touch-action: none; }
      .dim-ring { fill: none; stroke: #f0b429; stroke-width: 3; stroke-linecap: round;
                  pointer-events: none; opacity: 0.95; }
      /* big invisible touch target — icons stay elegant, fingers still hit them */
      .device .device-hit { fill: transparent; stroke: none; }
      .device .device-bg {
        fill: var(--card-background-color, #fff); stroke: var(--divider-color, #d5dbe2);
        stroke-width: 1.5; filter: drop-shadow(0 1px 2px rgba(16, 24, 40, 0.18));
      }
      .device .device-icon { fill: var(--secondary-text-color, #8a94a0); pointer-events: none; }
      .device.on .device-bg { fill: #f7c948; stroke: #e0a80c; }
      .device.on .device-icon { fill: #6b4e00; }
      .device.cover.closed .device-bg { fill: #46566b; stroke: #2b3542; }
      .device.cover.closed .device-icon { fill: #e8edf4; }
      .device.moving .device-bg { animation: fp-livepulse 1.2s ease-in-out infinite; }
      .device.unavail { opacity: 0.4; }
      .device.unavail .device-bg { stroke-dasharray: 3 3; }
      .light-glow { pointer-events: none; transition: opacity 0.6s ease; }
      /* decor greenery — light + dark tuned, non-interactive */
      .decor-tree, .decor-plant, .decor-hedge { pointer-events: none; }
      .decor-tree .canopy, .decor-plant .canopy { fill: #7fae7c; stroke: #5d8f5b; stroke-width: 1.5; }
      .decor-tree .canopy-hi, .decor-plant .canopy-hi { fill: #9cc498; opacity: 0.7; }
      .decor-hedge { stroke: #7fae7c; stroke-linecap: round; opacity: 0.9; }
      .dark .decor-tree .canopy, .dark .decor-plant .canopy { fill: #274733; stroke: #3e7052; }
      .dark .decor-tree .canopy-hi, .dark .decor-plant .canopy-hi { fill: #35604a; opacity: 0.8; }
      .dark .decor-hedge { stroke: #2e5340; }
      /* garden: mowing = green, watering = blue, both gently pulsing */
      .device.active .device-bg { fill: #3aa981; stroke: #1f7a5c; animation: fp-livepulse 1.6s ease-in-out infinite; }
      .device.active .device-icon { fill: #0d3327; }
      .device.watering .device-bg { fill: #3a9bdc; stroke: #1f6ea8; animation: fp-livepulse 1.6s ease-in-out infinite; }
      .device.watering .device-icon { fill: #0b2f4a; }
      /* AC: cool-blue airflow streaming into the room while running */
      .device.cooling .device-bg { fill: #7fd0f7; stroke: #2b8ac2; }
      .device.cooling .device-icon { fill: #0b3a55; }
      .ac-flow path {
        fill: none; stroke: #5db8ff; stroke-width: 3.2; stroke-linecap: round;
        stroke-dasharray: 10 13; opacity: 0.75;
        animation: fp-acflow 1.1s linear infinite;
      }
      .ac-flow { pointer-events: none; transition: opacity 0.5s ease; }
      /* camera: view cone + inline video overlay */
      .cam-cone { fill: rgba(93, 184, 255, 0.10); stroke: rgba(93, 184, 255, 0.35);
                  stroke-width: 1; pointer-events: none; }
      .device.camera .device-icon { fill: #5d8fb8; }
      .cam-video { cursor: pointer; }
      /* WLAN-AP: cyan coverage + expanding ripple rings */
      .wifi-cover { pointer-events: none; }
      .wifi-cover .wifi-fill { fill: url(#fp-wifi); }
      .wifi-cover .wifi-edge {
        fill: none; stroke: #35c3d0; stroke-width: 1.5;
        stroke-dasharray: 5 6; opacity: 0.4;
      }
      .wifi-cover .wifi-ring {
        fill: none; stroke: #35c3d0; stroke-width: 2; opacity: 0;
        transform-box: fill-box; transform-origin: center;
        animation: fp-wifi-ripple 3.6s ease-out infinite;
      }
      @keyframes fp-wifi-ripple {
        0% { transform: scale(0.2); opacity: 0.65; }
        70% { opacity: 0.18; }
        100% { transform: scale(1); opacity: 0; }
      }
      .device.ap .device-icon { fill: #2b9aa8; }
      .device.ap.off .device-icon { fill: var(--secondary-text-color, #8a94a0); }
      .device-label {
        text-anchor: middle; pointer-events: none; font-weight: 700;
        fill: var(--secondary-text-color, #77808c);
      }
      .dark .device-label { fill: #8fdbe2; }
      /* Legende: Ebenen ein-/ausblenden (global über alle Stockwerk-Karten) */
      .legend { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 18px 0; }
      .lg-chip {
        display: inline-flex; align-items: center; gap: 6px;
        border: 1px solid var(--divider-color, #d5dbe2); border-radius: 999px;
        padding: 3px 10px; font: inherit; font-size: 11.5px; line-height: 1.4;
        color: var(--secondary-text-color, #6b7480); cursor: pointer; background: transparent;
      }
      .lg-chip .dot { width: 8px; height: 8px; border-radius: 50%; }
      .lg-chip.off { opacity: 0.45; }
      .lg-chip.off .lg-label { text-decoration: line-through; }
      .dark .lg-chip { border-color: #3c4a61; color: #aab6c5; }
      @media (prefers-reduced-motion: reduce) { .wifi-cover .wifi-ring { animation: none; } }
      @keyframes fp-acflow { to { stroke-dashoffset: -23; } }
      @media (prefers-reduced-motion: reduce) {
        .ac-flow path, .device.active .device-bg, .device.watering .device-bg { animation: none; }
      }
      path.wall, path.wall.neutral { transition: fill 0.5s ease; }
      /* covers drawn as real blinds: a bar along the window, filled by closed fraction */
      .cover-border { stroke: #7d8b9d; stroke-linecap: round; }
      .cover-track { stroke: #f2f5f9; stroke-linecap: round; }
      .cover-fill { stroke: #46566b; stroke-linecap: butt; }
      .device.moving .cover-fill { animation: fp-livepulse 1.2s ease-in-out infinite; }
      .cover-hit { stroke: transparent; stroke-linecap: round; cursor: pointer; }
    `;
    this.shadowRoot.appendChild(style);

    const card = document.createElement('ha-card');
    if (this._isDark) card.classList.add('dark');
    // header: title + per-floor shortcuts (all lights on/off, all covers open/close)
    const lightIds = [...new Set(c.devices.filter((d) => d.type === 'light').map((d) => d.entity))];
    const coverIds = [...new Set(c.devices.filter((d) => d.type === 'cover').map((d) => d.entity))];
    if (c.title || lightIds.length || coverIds.length) {
      const header = document.createElement('div');
      header.className = 'header';
      if (c.title) {
        const t = document.createElement('div');
        t.className = 'title';
        t.textContent = c.title;
        header.appendChild(t);
      }
      const sc = document.createElement('div');
      sc.className = 'shortcuts';
      const btn = (label, title, fn) => {
        const b = document.createElement('button');
        b.className = 'sc-btn';
        b.textContent = label;
        b.title = title;
        b.addEventListener('click', fn);
        sc.appendChild(b);
      };
      if (lightIds.length) {
        btn('💡 An', 'Alle Lichter einschalten', () =>
          this._hass && this._hass.callService('light', 'turn_on', { entity_id: lightIds }));
        btn('💡 Aus', 'Alle Lichter ausschalten', () =>
          this._hass && this._hass.callService('light', 'turn_off', { entity_id: lightIds }));
      }
      if (coverIds.length) {
        btn('▲ Auf', 'Alle Storen öffnen', () =>
          this._hass && this._hass.callService('cover', 'open_cover', { entity_id: coverIds }));
        btn('▼ Zu', 'Alle Storen schliessen', () =>
          this._hass && this._hass.callService('cover', 'close_cover', { entity_id: coverIds }));
      }
      if (lightIds.length || coverIds.length || c.sleep_extra.length) {
        btn('🌙 Schlafen', 'Alle Storen zu, alle Lichter aus', () => {
          if (!this._hass) return;
          if (coverIds.length) this._hass.callService('cover', 'close_cover', { entity_id: coverIds });
          if (lightIds.length) this._hass.callService('light', 'turn_off', { entity_id: lightIds });
          if (c.sleep_extra.length) this._hass.callService('homeassistant', 'turn_off', { entity_id: c.sleep_extra });
        });
      }
      if (sc.children.length) header.appendChild(sc);
      card.appendChild(header);
    }
    // Legende: nur Ebenen anbieten, die auf diesem Stockwerk vorkommen
    if (c.legend !== false) {
      const present = new Set();
      if (c.rooms.some((r) => r.entity && !r.outline && !r.surface)) present.add('temp');
      for (const dvc of c.devices) present.add(DEVICE_LAYER[dvc.type]);
      if (c.decor.length) present.add('decor');
      const dots = {
        temp: '#e39a4d', light: '#f0b429', cover: '#7d8b9d', ac: '#5db8ff',
        camera: '#5d8fb8', wifi: '#35c3d0', decor: '#7fae7c', other: '#9aa7b4',
      };
      const chips = LAYERS.filter(([k]) => present.has(k));
      if (chips.length > 1) {
        const legend = document.createElement('div');
        legend.className = 'legend';
        for (const [key, label] of chips) {
          const chip = document.createElement('button');
          chip.className = 'lg-chip';
          chip.dataset.key = key;
          chip.title = `Ebene „${label}" ein-/ausblenden (alle Stockwerke)`;
          const dot = document.createElement('span');
          dot.className = 'dot';
          dot.style.background = dots[key];
          const lb = document.createElement('span');
          lb.className = 'lg-label';
          lb.textContent = label;
          chip.append(dot, lb);
          chip.addEventListener('click', () => {
            const st = this._layerState();
            this._setLayer(key, st[key] === false);
          });
          legend.appendChild(chip);
        }
        card.appendChild(legend);
      }
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
      // surface: garden | paving | stairs (garden: true bleibt als Alias)
      const surface = room.surface || (room.garden ? 'garden' : '');
      if (room.outline) {
        shape.setAttribute('class', 'outline' + (surface ? ' ' + surface : ''));
      } else if (surface) {
        shape.setAttribute('class', 'wall ' + surface);
      } else {
        shape.setAttribute('class', room.entity ? 'wall' : 'wall neutral');
        // Neutral until the first hass update paints the derived shade.
        if (room.entity) shape.setAttribute('fill', 'var(--fp-neutral)');
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
      if (liveIcon) liveIcon.setAttribute('data-layer', 'temp');
      if (showLabel && room.entity) {
        valueText = svgEl('text', { x: lx, y: ly + fsValue * 0.45, class: 'room-value', 'data-layer': 'temp' });
        valueText.textContent = '–';
        g.appendChild(valueText);
        // Trend on its own line below the value: regular weight, no halo.
        deltaText = svgEl('text', { x: lx, y: ly + fsValue * 0.45 + fsName * 1.6, class: 'delta', 'data-layer': 'temp' });
        g.appendChild(deltaText);
      }
      if (room.entity) {
        g.classList.add('room-hit');
        g.addEventListener('click', () => this._openMoreInfo(room.entity));
      }
      svg.appendChild(g);
      this._refs.set(room.id, { room, shape, valueText, deltaText, liveIcon, loops, lightIds: [] });
    }

    // decor: trees, hedges, plants — purely visual, under the devices
    for (const dc of c.decor) {
      if (dc.type === 'hedge') {
        const bw = dc.size || 14;
        svg.appendChild(svgEl('line', {
          x1: dc.from[0], y1: dc.from[1], x2: dc.to[0], y2: dc.to[1],
          class: 'decor-hedge', 'stroke-width': bw, 'data-layer': 'decor',
        }));
      } else {
        const r = dc.size || (dc.type === 'tree' ? 24 : 10);
        const g = svgEl('g', { class: 'decor-' + dc.type, 'data-layer': 'decor' });
        g.appendChild(svgEl('circle', { cx: dc.at[0], cy: dc.at[1], r, class: 'canopy' }));
        g.appendChild(svgEl('circle', {
          cx: dc.at[0] - r * 0.25, cy: dc.at[1] - r * 0.25, r: r * 0.55, class: 'canopy-hi',
        }));
        svg.appendChild(g);
      }
    }

    // warm glow under the device icons for lights that are on
    const defs = svgEl('defs');
    const grad = svgEl('radialGradient', { id: 'fp-glow' });
    grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#f7c948', 'stop-opacity': '0.45' }));
    grad.appendChild(svgEl('stop', { offset: '55%', 'stop-color': '#f0b429', 'stop-opacity': '0.16' }));
    grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#f0b429', 'stop-opacity': '0' }));
    defs.appendChild(grad);
    const wgrad = svgEl('radialGradient', { id: 'fp-wifi' });
    wgrad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#35c3d0', 'stop-opacity': '0.30' }));
    wgrad.appendChild(svgEl('stop', { offset: '60%', 'stop-color': '#35c3d0', 'stop-opacity': '0.10' }));
    wgrad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#35c3d0', 'stop-opacity': '0' }));
    defs.appendChild(wgrad);
    // surface patterns (CSS-classed contents → theme-aware)
    const pav = svgEl('pattern', { id: 'fp-paving', patternUnits: 'userSpaceOnUse', width: 36, height: 24 });
    pav.appendChild(svgEl('rect', { width: 36, height: 24, class: 'pav-bg' }));
    // Läuferverband: Horizontalfugen + versetzte Stossfugen
    pav.appendChild(svgEl('path', { d: 'M0,0 H36 M0,12 H36 M9,0 V12 M27,12 V24', class: 'pav-line', fill: 'none' }));
    defs.appendChild(pav);
    const stair = svgEl('pattern', { id: 'fp-stairs', patternUnits: 'userSpaceOnUse', width: 24, height: 14 });
    stair.appendChild(svgEl('rect', { width: 24, height: 14, class: 'stair-bg' }));
    stair.appendChild(svgEl('path', { d: 'M0,7 H24', class: 'stair-line', fill: 'none' }));
    defs.appendChild(stair);
    // per-room clip paths so the glow stays inside the room
    for (const [id, ref] of this._refs) {
      const cp = svgEl('clipPath', { id: `fp-clip-${id}` });
      cp.appendChild(svgEl('path', { d: loopsToPath(ref.loops), 'clip-rule': 'evenodd' }));
      defs.appendChild(cp);
    }
    svg.appendChild(defs);
    const glowLayer = svgEl('g');
    svg.appendChild(glowLayer);

    // devices on top of the rooms
    this._devRefs = [];
    const devR = Math.max(13, w * 0.027);
    for (const dev of c.devices) {
      if (dev.type === 'cover' && dev.from && dev.to) {
        // real blind: bar along the window, fill grows with closed fraction
        const g = svgEl('g', { class: 'device cover-bar', 'data-layer': 'cover' });
        const tip = svgEl('title');
        tip.textContent = dev.name || dev.entity;
        g.appendChild(tip);
        const bw = dev.width || Math.max(7, w * 0.013);
        const [x1, y1] = dev.from, [x2, y2] = dev.to;
        g.appendChild(svgEl('line', { x1, y1, x2, y2, class: 'cover-border', 'stroke-width': bw + 3 }));
        g.appendChild(svgEl('line', { x1, y1, x2, y2, class: 'cover-track', 'stroke-width': bw }));
        const fill = svgEl('line', { x1, y1, x2: x1, y2: y1, class: 'cover-fill', 'stroke-width': bw });
        g.appendChild(fill);
        const hit = svgEl('line', { x1, y1, x2, y2, class: 'cover-hit', 'stroke-width': bw + 28 });
        g.appendChild(hit);
        hit.addEventListener('click', (ev) => { ev.stopPropagation(); this._openMoreInfo(dev.entity); });
        svg.appendChild(g);
        this._devRefs.push({ dev, g, fill });
        continue;
      }
      const g = svgEl('g', {
        class: `device ${dev.type}`,
        'data-layer': DEVICE_LAYER[dev.type] || 'other',
        transform: `translate(${dev.at[0]}, ${dev.at[1]})`,
      });
      const tip = svgEl('title');
      tip.textContent = dev.name || dev.entity;
      g.appendChild(tip);
      g.appendChild(svgEl('circle', { r: devR + 16, class: 'device-hit' }));
      let ring = null, glow = null, flow = null, wifiCover = null;
      if (dev.type === 'ap') {
        // WLAN-Abdeckung: cyan Glow + auslaufende Funkwellen, an den Raum geclippt
        const range = dev.range || 110;
        wifiCover = svgEl('g', { class: 'wifi-cover', 'data-layer': 'wifi' });
        wifiCover.appendChild(svgEl('circle', { cx: dev.at[0], cy: dev.at[1], r: range, class: 'wifi-fill' }));
        // sichtbare Radius-Grenze (konfigurierter range)
        wifiCover.appendChild(svgEl('circle', { cx: dev.at[0], cy: dev.at[1], r: range, class: 'wifi-edge' }));
        for (let i = 0; i < 3; i++) {
          const rp = svgEl('circle', { cx: dev.at[0], cy: dev.at[1], r: range, class: 'wifi-ring' });
          rp.style.animationDelay = `${i * 1.2}s`;
          wifiCover.appendChild(rp);
        }
        for (const [roomId, ref] of this._refs) {
          if (pointInLoops(dev.at, ref.loops)) {
            wifiCover.setAttribute('clip-path', `url(#fp-clip-${roomId})`);
            break;
          }
        }
        glowLayer.appendChild(wifiCover);
      }
      if (dev.type === 'camera') {
        // Blickkegel: direction (°, 0=Ost) ± fov/2, Radius = range
        const fov = dev.fov || 70, range = dev.range || 130;
        const mid = ((dev.direction || 0) * Math.PI) / 180;
        const a1 = mid - (fov * Math.PI) / 360, a2 = mid + (fov * Math.PI) / 360;
        const p1 = [dev.at[0] + range * Math.cos(a1), dev.at[1] + range * Math.sin(a1)];
        const p2 = [dev.at[0] + range * Math.cos(a2), dev.at[1] + range * Math.sin(a2)];
        glowLayer.appendChild(svgEl('path', {
          d: `M${dev.at[0]},${dev.at[1]} L${p1[0]},${p1[1]} A${range},${range} 0 0,1 ${p2[0]},${p2[1]} Z`,
          class: 'cam-cone',
          'data-layer': 'camera',
        }));
      }
      if (dev.type === 'ac') {
        // airflow streams pointing in `direction` (degrees, 0 = right/east)
        flow = svgEl('g', {
          class: 'ac-flow',
          'data-layer': 'ac',
          transform: `translate(${dev.at[0]}, ${dev.at[1]}) rotate(${dev.direction || 0})`,
        });
        for (const sd of [
          'M24,-14 q18,-8 36,0 t36,0 t36,0',
          'M26,0 q18,-8 36,0 t36,0 t36,0 t36,0',
          'M24,14 q18,-8 36,0 t36,0 t36,0',
        ]) flow.appendChild(svgEl('path', { d: sd }));
        flow.style.opacity = '0';
        glowLayer.appendChild(flow);
      }
      if (dev.type === 'light') {
        // room lights up: soft radial glow + the containing room brightens
        glow = svgEl('circle', {
          cx: dev.at[0], cy: dev.at[1], r: devR * 5.5, class: 'light-glow',
          fill: 'url(#fp-glow)', 'data-layer': 'light',
        });
        glow.style.opacity = '0';
        glowLayer.appendChild(glow);
        for (const [roomId, ref] of this._refs) {
          if (pointInLoops(dev.at, ref.loops)) {
            ref.lightIds.push(dev.entity);
            glow.setAttribute('clip-path', `url(#fp-clip-${roomId})`);
            break;
          }
        }
      }
      if (dev.type === 'light') {
        // brightness ring, starts at 12 o'clock; doubles as live preview while dimming
        ring = svgEl('circle', { r: devR + 5, class: 'dim-ring', transform: 'rotate(-90)' });
        ring.style.display = 'none';
        g.appendChild(ring);
      }
      g.appendChild(svgEl('circle', { r: devR, class: 'device-bg' }));
      const is = (devR * 1.35) / 24;
      g.appendChild(svgEl('path', {
        d: DEVICE_ICONS[dev.type],
        transform: `translate(${-12 * is}, ${-12 * is}) scale(${is})`,
        class: 'device-icon',
      }));
      if (dev.type === 'ap' && dev.cable) {
        // Kabel-Nummer (z. B. B12) direkt unter dem AP
        const cable = svgEl('text', { x: 0, y: devR + 15, class: 'device-label' });
        cable.style.fontSize = `${Math.max(9, devR * 0.62)}px`;
        cable.textContent = dev.cable;
        g.appendChild(cable);
      }
      // tap = toggle · long-press = more-info · vertical drag on dimmable light = dim
      const ringC = 2 * Math.PI * (devR + 5);
      const setRing = (pct) => {
        if (!ring) return;
        ring.style.display = pct > 0 ? '' : 'none';
        ring.setAttribute('stroke-dasharray', `${(ringC * pct) / 100} ${ringC}`);
      };
      this._devRefs.push({ dev, g, setRing, glow, flow, wifiCover });
      let pressTimer = null, longPressed = false, moved = false, dimming = false;
      let startY = 0, startPct = 0, lastSent = 0;
      g.addEventListener('pointerdown', (ev) => {
        longPressed = false; moved = false; dimming = false;
        startY = ev.clientY;
        const st = this._hass && this._hass.states[dev.entity];
        startPct = st && st.attributes && st.attributes.brightness
          ? Math.round(st.attributes.brightness / 2.55) : 0;
        try { g.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }
        pressTimer = setTimeout(() => { longPressed = true; this._openMoreInfo(dev.entity); }, 550);
      });
      g.addEventListener('pointermove', (ev) => {
        if (longPressed) return;
        const dy = ev.clientY - startY;
        if (!moved && Math.abs(dy) > 7) { moved = true; clearTimeout(pressTimer); }
        if (!moved || dev.type !== 'light' || !this._hass) return;
        const st = this._hass.states[dev.entity];
        const dimmable = st && Array.isArray(st.attributes.supported_color_modes)
          && st.attributes.supported_color_modes.some((m) => m !== 'onoff');
        if (!dimmable) return;
        dimming = true;
        // ziehen nach oben = heller (~0.55 %/px)
        this._dimPct = Math.max(0, Math.min(100, Math.round(startPct - dy * 0.55)));
        setRing(this._dimPct);
        const now = Date.now();
        if (now - lastSent > 200) {
          lastSent = now;
          this._callDim(dev.entity, this._dimPct);
        }
      });
      const cancel = () => clearTimeout(pressTimer);
      g.addEventListener('pointercancel', cancel);
      g.addEventListener('pointerup', () => {
        cancel();
        if (longPressed) return;
        if (dimming) { this._callDim(dev.entity, this._dimPct); return; }
        if (moved) return;
        if (dev.type === 'camera') {
          this._toggleCamVideo(dev);
        } else if (dev.type === 'ap') {
          if (dev.entity) this._openMoreInfo(dev.entity); // ohne Entity rein informativ
        } else if (dev.type === 'cover' || dev.type === 'mower' || dev.type === 'ac') {
          this._openMoreInfo(dev.entity); // Mäher/Klima: Steuern bewusst nur im Dialog
        } else if (dev.type === 'sprinkler') {
          this._toggleSprinkler(dev.entity);
        } else {
          this._hass && this._hass.callService(dev.type, 'toggle', { entity_id: dev.entity });
        }
      });
      g.addEventListener('click', (ev) => ev.stopPropagation()); // don't trigger the room below
      svg.appendChild(g);
    }

    card.appendChild(svg);
    this.shadowRoot.appendChild(card);
    this._svg = svg;
    this._camOverlay = null;
    this._applyLayers();

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

  _shadesFor(temp, lit) {
    const c = this._config;
    if (c.color_mode === 'gradient') {
      const g = c.gradient;
      const t = Math.min(1, Math.max(0, (temp - g.min) / (g.max - g.min)));
      return shades(mixHsl(g.min_color, g.max_color, t), this._isDark, lit);
    }
    let color = c.thresholds[c.thresholds.length - 1].color;
    for (const th of c.thresholds) {
      if (th.below === undefined || temp < th.below) { color = th.color; break; }
    }
    return shades(rgbToHsl(hexToRgb(color)), this._isDark, lit);
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
    for (const { dev, g, fill, setRing, glow, flow, wifiCover } of this._devRefs || []) {
      const st = this._hass.states[dev.entity];
      const s = st ? st.state : 'unavailable';
      g.classList.toggle('unavail', !!dev.entity && (s === 'unavailable' || s === 'unknown'));
      if (dev.type === 'ap') {
        // ohne Entity gilt der AP als aktiv (Kabel gesteckt); mit Entity zählt deren Zustand
        const active = !dev.entity || !['off', 'unavailable', 'unknown', 'not_home'].includes(s);
        g.classList.toggle('off', !active);
        if (wifiCover) wifiCover.style.display = active ? '' : 'none';
        continue;
      }
      if (setRing) {
        setRing(s === 'on' && st.attributes && st.attributes.brightness
          ? Math.round(st.attributes.brightness / 2.55) : 0);
      }
      if (glow) glow.style.opacity = s === 'on' ? '1' : '0';
      if (dev.type === 'ac') {
        const on = !['off', 'unavailable', 'unknown'].includes(s);
        g.classList.toggle('cooling', on);
        if (flow) flow.style.opacity = on ? '1' : '0';
      } else if (dev.type === 'mower') {
        g.classList.toggle('active', ['mowing', 'cleaning', 'edgecut', 'returning'].includes(s));
      } else if (dev.type === 'sprinkler') {
        g.classList.toggle('watering', s === 'on' || s === 'open');
      } else if (dev.type === 'cover') {
        g.classList.toggle('closed', s === 'closed');
        g.classList.toggle('moving', s === 'opening' || s === 'closing');
        if (fill) {
          // closed fraction: HA position 100 = offen, 0 = zu
          const pos = st && st.attributes && typeof st.attributes.current_position === 'number'
            ? st.attributes.current_position
            : (s === 'closed' ? 0 : 100);
          const f = Math.min(1, Math.max(0, 1 - pos / 100));
          const [x1, y1] = dev.from, [x2, y2] = dev.to;
          fill.setAttribute('x2', x1 + (x2 - x1) * f);
          fill.setAttribute('y2', y1 + (y2 - y1) * f);
          fill.style.display = f < 0.02 ? 'none' : '';
        }
      } else {
        g.classList.toggle('on', s === 'on');
      }
    }
    for (const { room, shape, valueText, deltaText, liveIcon, lightIds } of this._refs.values()) {
      const lit = (lightIds || []).some((e) => {
        const ls = this._hass.states[e];
        return ls && ls.state === 'on';
      });
      shape.classList.toggle('lit', lit); // brightens rooms without a sensor via CSS
      if (!room.entity || room.outline || room.surface || room.garden) continue;
      const st = this._hass.states[room.entity];
      const temp = st ? parseFloat(st.state) : NaN;
      if (liveIcon) {
        // grey + static while the sensor is unavailable
        liveIcon.classList.toggle('off', !Number.isFinite(temp));
      }
      const isLive = room.entity.split('.')[0] === 'sensor';
      if (Number.isFinite(temp)) {
        const sh = this._shadesFor(temp, lit);
        shape.setAttribute('fill', sh.fill);
        if (valueText) {
          valueText.textContent = this._fmt(temp) + this._config.unit;
          valueText.style.fill = sh.text; // inline style wins over the class fill
          valueText.classList.toggle('live', isLive && !this._isDark); // green tint (light mode only)
          valueText.classList.toggle('pulse', isLive);
        }
      } else {
        shape.setAttribute('fill', 'var(--fp-neutral)');
        if (valueText) { valueText.textContent = '–'; valueText.style.fill = ''; valueText.classList.remove('live', 'pulse'); }
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

  // ---------- layer visibility ----------

  connectedCallback() {
    this._onLayersChanged = () => this._applyLayers();
    window.addEventListener('fp-layers-changed', this._onLayersChanged);
    window.addEventListener('storage', this._onLayersChanged);
    this._applyLayers();
  }

  disconnectedCallback() {
    window.removeEventListener('fp-layers-changed', this._onLayersChanged);
    window.removeEventListener('storage', this._onLayersChanged);
  }

  _layerState() {
    try { return JSON.parse(localStorage.getItem(LAYER_STORE_KEY)) || {}; } catch (e) { return {}; }
  }

  _setLayer(key, visible) {
    const st = this._layerState();
    st[key] = visible;
    try { localStorage.setItem(LAYER_STORE_KEY, JSON.stringify(st)); } catch (e) { /* egal */ }
    window.dispatchEvent(new CustomEvent('fp-layers-changed')); // informiert auch die anderen Stockwerk-Karten
  }

  _applyLayers() {
    const card = this.shadowRoot && this.shadowRoot.querySelector('ha-card');
    if (!card) return;
    const st = this._layerState();
    for (const [k] of LAYERS) {
      const hidden = st[k] === false;
      card.classList.toggle(`hide-${k}`, hidden);
      if (k === 'camera' && hidden) this._closeCamVideo();
    }
    for (const chip of this.shadowRoot.querySelectorAll('.lg-chip')) {
      chip.classList.toggle('off', st[chip.dataset.key] === false);
    }
  }

  _closeCamVideo() {
    if (this._camOverlay) {
      this._camOverlay.el.remove();
      this._camOverlay = null;
    }
  }

  _toggleCamVideo(dev) {
    if (this._camOverlay && this._camOverlay.entity === dev.entity) { this._closeCamVideo(); return; }
    this._closeCamVideo();
    if (!this._hass || !this._svg) return;
    const st = this._hass.states[dev.entity];
    if (!st) return;
    const token = st.attributes && st.attributes.access_token;
    const src = `/api/camera_proxy_stream/${dev.entity}${token ? `?token=${token}` : ''}`;
    // Video in den Raum legen, in dem die Kamera steht (an die Raumform geclippt);
    // sonst in die Kegel-Umgebung.
    let bbox = null, clipRoom = null;
    for (const [roomId, ref] of this._refs) {
      if (pointInLoops(dev.at, ref.loops)) {
        clipRoom = roomId;
        const pts = ref.loops.flat();
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
        break;
      }
    }
    if (!bbox) {
      const range = dev.range || 130;
      bbox = [dev.at[0] - range, dev.at[1] - range, range * 2, range * 2];
    }
    const fo = svgEl('foreignObject', {
      x: bbox[0], y: bbox[1], width: bbox[2], height: bbox[3], class: 'cam-video', 'data-layer': 'camera',
    });
    if (clipRoom) fo.setAttribute('clip-path', `url(#fp-clip-${clipRoom})`);
    const img = document.createElement('img');
    img.src = src;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    img.alt = dev.name || dev.entity;
    fo.appendChild(img);
    fo.addEventListener('click', (ev) => { ev.stopPropagation(); this._closeCamVideo(); });
    this._svg.appendChild(fo);
    this._camOverlay = { entity: dev.entity, el: fo };
  }

  _toggleSprinkler(entity) {
    if (!this._hass) return;
    const st = this._hass.states[entity];
    const domain = entity.split('.')[0];
    if (domain === 'valve') {
      const svc = st && (st.state === 'open' || st.state === 'opening') ? 'close_valve' : 'open_valve';
      this._hass.callService('valve', svc, { entity_id: entity });
    } else {
      this._hass.callService(domain, 'toggle', { entity_id: entity });
    }
  }

  _callDim(entity, pct) {
    if (!this._hass) return;
    if (pct <= 0) this._hass.callService('light', 'turn_off', { entity_id: entity });
    else this._hass.callService('light', 'turn_on', { entity_id: entity, brightness_pct: pct });
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
