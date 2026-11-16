// Canvas renderer: cached static map layer + dynamic agents, items, bubbles and lighting.
import { TS, FURN } from './world.js';
import { drawTile, drawFurniture, drawCharacter } from './sprites.js';
import { fmtTime } from './sim.js';
import { NEEDS, NEED_KEYS, CRITICAL } from './needs.js';

export class Renderer {
  constructor(canvas, sim) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.sim = sim;
    this.cam = { x: 0, y: 0, zoom: 1.8 };
    this.staticLayer = document.createElement('canvas');
    this.dpr = 1;
    this.ui = { selected: null, hover: null, buildRect: null, ghost: null, showLocNames: true };
    this.resize();
  }

  resize() {
    const r = this.cv.parentElement.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.cv.width = Math.floor(r.width * this.dpr);
    this.cv.height = Math.floor(r.height * this.dpr);
    this.cv.style.width = r.width + 'px';
    this.cv.style.height = r.height + 'px';
    this.vw = r.width; this.vh = r.height;
  }

  buildStatic() {
    const W = this.sim.world;
    const s = this.staticLayer;
    s.width = W.w * TS; s.height = W.h * TS;
    const c = s.getContext('2d');
    for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) drawTile(c, W, x, y);
    const order = [...W.furniture].sort((a, b) => (a.type === 'rug' ? -1 : 0) - (b.type === 'rug' ? -1 : 0) || a.y - b.y);
    for (const f of order) drawFurniture(c, f);
    W.dirty = false;
  }

  centerOn(tx, ty) {
    this.cam.x = tx * TS - this.vw / 2 / this.cam.zoom;
    this.cam.y = ty * TS - this.vh / 2 / this.cam.zoom;
  }
  clampCam() {
    const W = this.sim.world, z = this.cam.zoom;
    const mw = W.w * TS, mh = W.h * TS;
    const vw = this.vw / z, vh = this.vh / z;
    this.cam.x = vw >= mw ? (mw - vw) / 2 : Math.max(0, Math.min(mw - vw, this.cam.x));
    this.cam.y = vh >= mh ? (mh - vh) / 2 : Math.max(0, Math.min(mh - vh, this.cam.y));
  }
  screenToWorld(sx, sy) { return { x: (sx / this.cam.zoom + this.cam.x) / TS, y: (sy / this.cam.zoom + this.cam.y) / TS }; }
  worldToScreen(wx, wy) { return { x: (wx * TS - this.cam.x) * this.cam.zoom, y: (wy * TS - this.cam.y) * this.cam.zoom }; }
  zoomAt(sx, sy, factor) {
    const before = this.screenToWorld(sx, sy);
    this.cam.zoom = Math.max(0.8, Math.min(6, this.cam.zoom * factor));
    this.cam.x = before.x * TS - sx / this.cam.zoom;
    this.cam.y = before.y * TS - sy / this.cam.zoom;
    this.clampCam();
  }

  agentAt(sx, sy) {
    const w = this.screenToWorld(sx, sy);
    let best = null, bd = 0.9;
    for (const a of this.sim.agents) {
      const d = Math.hypot(a.x - w.x, a.y - 0.45 - w.y);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  darkness() {
    const m = this.sim.time % 1440, h = m / 60;
    if (h >= 7 && h < 18) return 0;
    if (h >= 18 && h < 21) return ((h - 18) / 3) * 0.55;
    if (h >= 5 && h < 7) return ((7 - h) / 2) * 0.55;
    return 0.55;
  }

  draw(t) {
    const { ctx: c, sim, cam } = this;
    const W = sim.world;
    if (W.dirty) this.buildStatic();
    this.clampCam();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#244f22';
    c.fillRect(0, 0, this.cv.width, this.cv.height);

    const z = cam.zoom * this.dpr;
    c.setTransform(z, 0, 0, z, -cam.x * z, -cam.y * z);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.staticLayer, 0, 0);

    // fountain sparkle / water shimmer
    c.fillStyle = 'rgba(255,255,255,0.5)';
    for (let k = 0; k < 6; k++) {
      const p = (t * 0.7 + k * 0.37) % 1;
      c.fillRect(30 * TS + 6 + Math.sin(k * 9) * 18, 19 * TS + 24 - p * 18, 2, 2);
    }

    // items
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '11px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    for (const it of W.items) {
      const bob = Math.sin(t * 3 + it.x) * 1.2;
      c.globalAlpha = it.hidden ? 0.5 : 1;
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.beginPath(); c.ellipse(it.x * TS + 8, it.y * TS + 14, 4, 1.5, 0, 0, Math.PI * 2); c.fill();
      c.fillText(it.emoji, it.x * TS + 8, it.y * TS + 7 + bob);
      if (!it.hidden && it.knownBy.length === 0) {
        c.fillStyle = `rgba(255,240,150,${0.5 + Math.sin(t * 5) * 0.4})`;
        c.fillRect(it.x * TS + 13, it.y * TS + 1 + bob, 2, 2);
      }
      c.globalAlpha = 1;
    }

    // agents (y-sorted)
    const sorted = [...sim.agents].sort((a, b) => a.y - b.y);
    for (const a of sorted) {
      const px = a.x * TS, py = a.y * TS + 6;
      if (this.ui.selected?.kind === 'agent' && this.ui.selected.id === a.id) {
        c.strokeStyle = '#ffe14a'; c.lineWidth = 1.2;
        c.beginPath(); c.ellipse(px, py, 7, 3, 0, 0, Math.PI * 2); c.stroke();
        // path preview
        if (a.path.length) {
          c.fillStyle = 'rgba(255,225,74,0.55)';
          for (const n of a.path) c.fillRect(n.x * TS + 7, n.y * TS + 7, 2, 2);
        }
      }
      drawCharacter(c, a, px, py, t + a.x);
    }

    // TVs flicker while watched
    for (const a of sim.agents) {
      if (!sim.usingTV(a)) continue;
      const f = W.furniture.find((q) => q.id === a.action.obj.fid);
      if (!f) continue;
      const off = sim.time < sim.powerOutUntil;
      c.fillStyle = off ? '#111' : ['#7fd0ff', '#ffe14a', '#ff7ab0', '#9aff8a'][Math.floor(t * 4 + f.x) % 4];
      c.fillRect(f.x * TS + 2, f.y * TS + 3, 12, 7);
      if (!off) { c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(f.x * TS + 3 + (Math.floor(t * 9) % 9), f.y * TS + 5, 2, 3); }
    }

    // weather
    const wk = sim.weather.kind, mw = W.w * TS, mh = W.h * TS;
    if (wk === 'cloudy' || wk === 'rain' || wk === 'storm' || wk === 'snow') {
      c.fillStyle = wk === 'storm' ? 'rgba(30,35,60,0.35)' : wk === 'snow' ? 'rgba(220,230,255,0.15)' : 'rgba(60,70,90,0.18)';
      c.fillRect(0, 0, mw, mh);
    }
    if (wk === 'rain' || wk === 'storm') {
      c.strokeStyle = 'rgba(180,210,255,0.55)'; c.lineWidth = 0.8;
      c.beginPath();
      const n = wk === 'storm' ? 700 : 380;
      for (let i = 0; i < n; i++) {
        const x = ((i * 97.13) % mw + t * 40) % mw, y = ((i * 53.71) % mh + t * (wk === 'storm' ? 420 : 300)) % mh;
        c.moveTo(x, y); c.lineTo(x - 2, y + 6);
      }
      c.stroke();
      if (wk === 'storm' && Math.sin(t * 1.7) > 0.995) { c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(0, 0, mw, mh); }
    } else if (wk === 'snow') {
      c.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 400; i++) {
        const x = ((i * 97.13) % mw + Math.sin(t + i) * 6) % mw, y = ((i * 53.71) % mh + t * 30) % mh;
        c.fillRect(x, y, 1.5, 1.5);
      }
    }

    // lighting
    const dark = this.darkness();
    if (dark > 0) {
      c.fillStyle = `rgba(18,20,60,${dark})`;
      c.fillRect(0, 0, W.w * TS, W.h * TS);
      c.globalCompositeOperation = 'lighter';
      for (const f of W.furniture) {
        if (f.type !== 'lamp') continue;
        const gx = f.x * TS + 8, gy = f.y * TS + 4;
        const g = c.createRadialGradient(gx, gy, 2, gx, gy, 44);
        g.addColorStop(0, `rgba(255,200,110,${dark * 0.7})`); g.addColorStop(1, 'rgba(255,200,110,0)');
        c.fillStyle = g; c.fillRect(gx - 44, gy - 44, 88, 88);
      }
      c.globalCompositeOperation = 'source-over';
    }

    // tool previews
    const h = this.ui.hover;
    if (h) {
      c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1 / cam.zoom * 1.5;
      const gw = this.ui.ghost?.w || 1, gh = this.ui.ghost?.h || 1;
      c.strokeRect(h.x * TS, h.y * TS, gw * TS, gh * TS);
      if (this.ui.ghost?.emoji) { c.globalAlpha = 0.6; c.fillText(this.ui.ghost.emoji, h.x * TS + 8, h.y * TS + 8); c.globalAlpha = 1; }
    }
    const br = this.ui.buildRect;
    if (br) {
      const x = Math.min(br.x0, br.x1), y = Math.min(br.y0, br.y1);
      const w = Math.abs(br.x1 - br.x0) + 1, hh = Math.abs(br.y1 - br.y0) + 1;
      c.fillStyle = 'rgba(120,200,255,0.25)'; c.fillRect(x * TS, y * TS, w * TS, hh * TS);
      c.strokeStyle = '#7cc8ff'; c.lineWidth = 1 / cam.zoom * 2; c.strokeRect(x * TS, y * TS, w * TS, hh * TS);
    }
    if (this.ui.selected?.kind === 'location') {
      const l = W.locations.find((q) => q.id === this.ui.selected.id);
      if (l) { c.strokeStyle = '#ffe14a'; c.lineWidth = 1 / cam.zoom * 2; c.setLineDash([4, 3]); c.strokeRect(l.x * TS, l.y * TS, l.w * TS, l.h * TS); c.setLineDash([]); }
    }

    // ---- screen-space overlay ----
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.ui.showLocNames) {
      c.font = '600 11px system-ui,sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top';
      for (const l of W.locations) {
        const p = this.worldToScreen(l.x, l.y);
        const lvl = l.resource ? sim.resourceLevel(l) : null;
        const label = `${l.emoji} ${l.name}${lvl != null ? ` · ${l.resource.map((r) => ({ wood: '🪵', stone: '🪨', ore: '⛏️', crops: '🌾', fish: '🐟', berries: '🫐', herbs: '🌿' })[r]).join('')} ${Math.round(lvl * 100)}%` : ''}`;
        const w = c.measureText(label).width + 10;
        c.fillStyle = 'rgba(20,24,40,0.55)';
        this.round(c, p.x + 2, p.y + 2, w, 17, 5); c.fill();
        c.fillStyle = '#fff'; c.fillText(label, p.x + 7, p.y + 5);
      }
    }
    for (const a of sorted) this.drawBubble(c, a, t);
  }

  drawBubble(c, a, t) {
    const p = this.worldToScreen(a.x, a.y - 0.8);
    const initials = a.name.split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase();
    const selected = this.ui.selected?.kind === 'agent' && this.ui.selected.id === a.id;
    let text, big = false;
    if (a.say) { text = a.say; big = a.say.length > 3; }
    else if (a.thinking) text = `${initials}: ${'💭'}${'.'.repeat(1 + (Math.floor(t * 3) % 3))}`;
    else if (a.asleep) text = `${initials}: 😴${'z'.repeat(1 + (Math.floor(t * 2) % 3))}`;
    else if (a.convoId) text = `${initials}: 💬`;
    else text = `${initials}: ${a.action?.emoji || '🙂'}`;
    if (!a.say) {
      const crit = NEED_KEYS.filter((k) => k !== 'romance' && a.needs[k] < CRITICAL).map((k) => NEEDS[k].emoji).join('');
      if (crit) text += ` ${crit}❗`;
      if (a.romance?.partner) text += a.romance.status === 'married' ? '💍' : '💕';
      if (this.sim.gov?.leaderId === a.id) text += '👑';
      if (a.jailedUntil > this.sim.time) text += '⛓️';
      if (a.health < 35) text += '🤒';
    }
    if (selected && !big) text = `${a.name} · ${text.split(': ')[1] || text}`;

    c.textAlign = 'left'; c.textBaseline = 'top';
    if (big) {
      c.font = '600 12px system-ui,sans-serif';
      const lines = this.wrap(c, `${initials}: ${text}`, 210).slice(0, 4);
      const w = Math.max(...lines.map((l) => c.measureText(l).width)) + 14;
      const h = lines.length * 15 + 10;
      const x = Math.max(4, Math.min(this.vw - w - 4, p.x - w / 2)), y = Math.max(4, p.y - h - 14);
      c.fillStyle = '#ffffff'; c.strokeStyle = '#2a2f45'; c.lineWidth = 2;
      this.round(c, x, y, w, h, 8); c.fill(); c.stroke();
      const tx = Math.max(x + 8, Math.min(x + w - 8, p.x));
      c.beginPath(); c.moveTo(tx - 5, y + h); c.lineTo(tx, y + h + 8); c.lineTo(tx + 5, y + h); c.closePath(); c.fill();
      c.fillStyle = '#1d2133';
      lines.forEach((l, i) => c.fillText(l, x + 7, y + 6 + i * 15));
    } else {
      c.font = '600 11px system-ui,sans-serif';
      const w = c.measureText(text).width + 12;
      const x = p.x - w / 2, y = p.y - 30;
      c.fillStyle = selected ? '#fff6c8' : 'rgba(255,255,255,0.92)';
      c.strokeStyle = '#2a2f45'; c.lineWidth = 1.5;
      this.round(c, x, y, w, 18, 6); c.fill(); c.stroke();
      c.fillStyle = '#1d2133'; c.fillText(text, x + 6, y + 3);
    }
  }

  wrap(c, text, maxW) {
    const words = text.split(' '), lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (c.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
    }
    if (cur) lines.push(cur);
    if (lines.length > 4) lines[3] = lines[3].slice(0, -1) + '…';
    return lines;
  }
  round(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
}

export { fmtTime, FURN };
