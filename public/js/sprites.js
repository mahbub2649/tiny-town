// Procedural pixel-art drawing for tiles, furniture, characters and items.
import { T, TS, FURN } from './world.js';

const hash = (x, y, s = 0) => {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
};
const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };

function grass(c, px, py, x, y) {
  R(c, px, py, TS, TS, '#8ccf5a');
  for (let k = 0; k < 4; k++) {
    const sx = Math.floor(hash(x, y, k) * 15), sy = Math.floor(hash(x, y, k + 9) * 15);
    R(c, px + sx, py + sy, 1, 1, k % 2 ? '#7bbf4b' : '#a0dc6c');
  }
  if (hash(x, y, 77) < 0.3) {
    const sx = 2 + Math.floor(hash(x, y, 78) * 11), sy = 3 + Math.floor(hash(x, y, 79) * 10);
    R(c, px + sx, py + sy, 1, 2, '#6aae3f'); R(c, px + sx + 2, py + sy + 1, 1, 2, '#6aae3f');
  }
}

export function drawTile(c, W, x, y) {
  const t = W.get(x, y), px = x * TS, py = y * TS;
  switch (t) {
    case T.GRASS: grass(c, px, py, x, y); break;
    case T.PATH:
    case T.SAND: {
      R(c, px, py, TS, TS, t === T.PATH ? '#ecd59a' : '#f3e6b5');
      for (let k = 0; k < 5; k++) {
        R(c, px + Math.floor(hash(x, y, k) * 15), py + Math.floor(hash(x, y, k + 5) * 15), 1, 1, '#d8bf7f');
      }
      // soft grass edges
      if (W.get(x, y - 1) === T.GRASS) R(c, px, py, TS, 1, '#b9d77a');
      if (W.get(x, y + 1) === T.GRASS) R(c, px, py + 15, TS, 1, '#b9d77a');
      if (W.get(x - 1, y) === T.GRASS) R(c, px, py, 1, TS, '#b9d77a');
      if (W.get(x + 1, y) === T.GRASS) R(c, px + 15, py, 1, TS, '#b9d77a');
      break;
    }
    case T.STONE: {
      R(c, px, py, TS, TS, '#d7d0c4');
      R(c, px, py + 7, TS, 1, '#bdb4a6');
      R(c, px + ((y % 2) ? 4 : 11), py, 1, 7, '#bdb4a6');
      R(c, px + ((y % 2) ? 11 : 4), py + 8, 1, 8, '#bdb4a6');
      R(c, px, py + 15, TS, 1, '#bdb4a6');
      break;
    }
    case T.WATER: {
      R(c, px, py, TS, TS, '#58a8e4');
      const o = Math.floor(hash(x, y, 3) * 8);
      R(c, px + o, py + 4, 5, 1, '#8fcdf5'); R(c, px + ((o + 7) % 11), py + 11, 4, 1, '#8fcdf5');
      if (W.get(x, y - 1) !== T.WATER) R(c, px, py, TS, 2, '#3d86c4');
      if (W.get(x - 1, y) !== T.WATER) R(c, px, py, 1, TS, '#3d86c4');
      if (W.get(x + 1, y) !== T.WATER) R(c, px + 15, py, 1, TS, '#3d86c4');
      if (W.get(x, y + 1) !== T.WATER) R(c, px, py + 15, TS, 1, '#9fd6f7');
      break;
    }
    case T.TREE: {
      grass(c, px, py, x, y);
      c.fillStyle = 'rgba(0,0,0,0.18)';
      c.beginPath(); c.ellipse(px + 8, py + 14, 6, 2, 0, 0, Math.PI * 2); c.fill();
      R(c, px + 7, py + 10, 3, 5, '#7a4f2a');
      const g = hash(x, y, 1) < 0.5;
      c.fillStyle = '#2d6b2a';
      c.beginPath(); c.arc(px + 8, py + 7, 7, 0, Math.PI * 2); c.fill();
      c.fillStyle = g ? '#3f8f3a' : '#4a9a3c';
      c.beginPath(); c.arc(px + 8, py + 7, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = g ? '#57ad4a' : '#62b84f';
      c.beginPath(); c.arc(px + 6, py + 5, 3, 0, Math.PI * 2); c.fill();
      if (hash(x, y, 2) < 0.25) { R(c, px + 10, py + 8, 2, 2, '#e8524a'); R(c, px + 5, py + 9, 2, 2, '#e8524a'); }
      break;
    }
    case T.BUSH: {
      grass(c, px, py, x, y);
      c.fillStyle = '#2f7a2c'; c.beginPath(); c.arc(px + 8, py + 9, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#4ba142'; c.beginPath(); c.arc(px + 7, py + 8, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#6cc25c'; R(c, px + 5, py + 6, 2, 2, '#6cc25c');
      break;
    }
    case T.FLOWER: {
      grass(c, px, py, x, y);
      const cols = ['#ff6b8a', '#ffd84a', '#ffffff', '#b48aff', '#ff9a3c'];
      for (let k = 0; k < 3; k++) {
        const fx = px + 2 + Math.floor(hash(x, y, k + 20) * 11), fy = py + 2 + Math.floor(hash(x, y, k + 30) * 11);
        R(c, fx, fy + 2, 1, 2, '#4f9a3a');
        R(c, fx - 1, fy, 3, 2, cols[Math.floor(hash(x, y, k + 40) * cols.length)]);
        R(c, fx, fy, 1, 1, '#ffef9a');
      }
      break;
    }
    case T.FENCE: {
      grass(c, px, py, x, y);
      const h = W.get(x - 1, y) === T.FENCE || W.get(x + 1, y) === T.FENCE;
      const v = W.get(x, y - 1) === T.FENCE || W.get(x, y + 1) === T.FENCE;
      if (h) { R(c, px, py + 6, TS, 2, '#a0703f'); R(c, px, py + 10, TS, 2, '#a0703f'); }
      if (v) { R(c, px + 7, py, 2, TS, '#a0703f'); }
      R(c, px + 6, py + 4, 4, 10, '#7a5230'); R(c, px + 6, py + 4, 4, 1, '#c08a50');
      break;
    }
    case T.WALL: {
      const below = W.get(x, y + 1);
      R(c, px, py, TS, TS, '#e3d6c2');
      R(c, px, py, TS, 1, '#6b5a48');
      if (below !== T.WALL) { R(c, px, py + 10, TS, 6, '#b09a80'); R(c, px, py + 10, TS, 1, '#8a7560'); R(c, px, py + 15, TS, 1, '#5a4a3a'); }
      if (W.get(x - 1, y) !== T.WALL) R(c, px, py, 1, TS, '#6b5a48');
      if (W.get(x + 1, y) !== T.WALL) R(c, px + 15, py, 1, TS, '#6b5a48');
      if (W.get(x, y - 1) !== T.WALL) R(c, px, py, TS, 2, '#6b5a48');
      break;
    }
    case T.WOOD:
    case T.DOOR: {
      R(c, px, py, TS, TS, '#d4a46a');
      for (let r = 0; r < 4; r++) {
        R(c, px, py + r * 4 + 3, TS, 1, '#b98a52');
        R(c, px + ((r * 5 + x * 3) % 14) + 1, py + r * 4, 1, 3, '#b98a52');
      }
      if (t === T.DOOR) { R(c, px + 2, py + 4, 12, 8, '#8a5a30'); R(c, px + 3, py + 5, 10, 6, '#a86f3d'); }
      break;
    }
    case T.TILE: {
      const a = (x + y) % 2 === 0;
      R(c, px, py, TS, TS, a ? '#efe9dc' : '#e2d9c6');
      R(c, px, py, TS, 1, '#d4cab4'); R(c, px, py, 1, TS, '#d4cab4');
      break;
    }
    case T.CARPET: {
      R(c, px, py, TS, TS, '#9c5a5a');
      R(c, px + 2, py + 2, 12, 12, '#a86464');
      if ((x + y) % 2) R(c, px + 7, py + 7, 2, 2, '#c98a6a');
      break;
    }
    case T.CROP: {
      R(c, px, py, TS, TS, '#8a5a32');
      for (let r = 0; r < 4; r++) R(c, px, py + r * 4 + 2, TS, 1, '#6e4524');
      for (let k = 0; k < 4; k++) { const cx = px + 2 + k * 4; R(c, cx, py + 3, 2, 5, '#5fae3f'); R(c, cx - 1, py + 4, 1, 2, '#7cc85a'); R(c, cx + 2, py + 5, 1, 2, '#7cc85a'); if ((x + y + k) % 3 === 0) R(c, cx, py + 2, 2, 2, '#f2c94c'); }
      break;
    }
    default: R(c, px, py, TS, TS, '#f0f');
  }
}

export function drawFurniture(c, f) {
  const d = FURN[f.type];
  const px = f.x * TS, py = f.y * TS, w = d.w * TS, h = d.h * TS;
  const shadow = () => { c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(px + 2, py + h - 3, w - 2, 3); };
  switch (f.type) {
    case 'rug': {
      R(c, px + 1, py + 1, w - 2, h - 2, f.color || '#7a9be0');
      c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1;
      c.strokeRect(px + 3.5, py + 3.5, w - 7, h - 7);
      break;
    }
    case 'table': shadow(); R(c, px + 1, py + 2, w - 2, 10, '#8b5a2b'); R(c, px + 1, py + 2, w - 2, 8, '#b07440'); R(c, px + 2, py + 3, w - 4, 2, '#c98b52'); R(c, px + 2, py + 12, 2, 3, '#6e4520'); R(c, px + w - 4, py + 12, 2, 3, '#6e4520'); break;
    case 'chair': R(c, px + 4, py + 2, 8, 4, '#8b5a2b'); R(c, px + 4, py + 6, 8, 5, '#b07440'); R(c, px + 4, py + 11, 2, 3, '#6e4520'); R(c, px + 10, py + 11, 2, 3, '#6e4520'); break;
    case 'bed': shadow(); R(c, px + 1, py + 1, w - 2, h - 2, '#7a4a2a'); R(c, px + 2, py + 2, w - 4, 7, '#ffffff'); R(c, px + 3, py + 3, w - 6, 4, '#e8eef5'); R(c, px + 2, py + 10, w - 4, h - 13, f.color || '#e07a8a'); R(c, px + 2, py + 10, w - 4, 2, 'rgba(255,255,255,0.35)'); break;
    case 'shelf': {
      R(c, px, py, w, h, '#6e4526'); R(c, px + 1, py + 1, w - 2, 6, '#4a2e18'); R(c, px + 1, py + 8, w - 2, 6, '#4a2e18');
      const cols = ['#e05a5a', '#5a8ae0', '#e0c05a', '#5ab87a', '#a05ae0', '#e08a4a'];
      for (let r = 0; r < 2; r++) for (let i = 0; i < 9; i++) {
        R(c, px + 2 + i * 3, py + 2 + r * 7, 2, 5 - ((i + r + f.x) % 2), cols[(i * 7 + r * 3 + f.x + f.y) % cols.length]);
      }
      break;
    }
    case 'counter': R(c, px, py + 2, w, h - 2, '#7d838c'); R(c, px, py + 2, w, 7, '#c4c9cf'); R(c, px, py + 2, w, 1, '#e8ebee'); break;
    case 'register': R(c, px, py + 2, w, h - 2, '#7d838c'); R(c, px, py + 2, w, 7, '#c4c9cf'); R(c, px + 3, py, 10, 7, '#3b3f46'); R(c, px + 4, py + 1, 8, 3, '#7fe09a'); break;
    case 'stove': R(c, px + 1, py + 1, 14, 14, '#4a4e55'); R(c, px + 2, py + 2, 12, 7, '#2c2f34'); R(c, px + 3, py + 3, 4, 3, '#555'); R(c, px + 9, py + 3, 4, 3, '#555'); R(c, px + 3, py + 11, 10, 2, '#888'); break;
    case 'fridge': R(c, px + 2, py, 12, 15, '#f2f4f7'); R(c, px + 2, py, 12, 1, '#c9ced6'); R(c, px + 2, py + 6, 12, 1, '#c9ced6'); R(c, px + 11, py + 2, 1, 3, '#888'); R(c, px + 11, py + 8, 1, 4, '#888'); break;
    case 'sofa': shadow(); R(c, px + 1, py + 1, w - 2, 13, '#00000030'); R(c, px + 1, py, w - 2, 6, f.color || '#6a8fd0'); R(c, px + 1, py + 5, w - 2, 8, f.color || '#6a8fd0'); R(c, px + 3, py + 6, 12, 6, 'rgba(255,255,255,0.18)'); R(c, px + 17, py + 6, 12, 6, 'rgba(255,255,255,0.18)'); break;
    case 'plant': R(c, px + 5, py + 10, 6, 5, '#c0643a'); R(c, px + 5, py + 10, 6, 1, '#e08a5a'); c.fillStyle = '#3f8f3a'; c.beginPath(); c.arc(px + 8, py + 7, 5, 0, Math.PI * 2); c.fill(); R(c, px + 6, py + 4, 2, 2, '#62b84f'); break;
    case 'piano': shadow(); R(c, px + 1, py, w - 2, 14, '#1f1f24'); R(c, px + 3, py + 8, w - 6, 4, '#f5f5f5'); for (let i = 0; i < 8; i++) R(c, px + 5 + i * 3, py + 8, 1, 2, '#1f1f24'); break;
    case 'bench': R(c, px + 1, py + 5, w - 2, 2, '#a0703f'); R(c, px + 1, py + 8, w - 2, 2, '#a0703f'); R(c, px + 1, py + 3, w - 2, 1, '#7a5230'); R(c, px + 3, py + 10, 2, 4, '#5a3a20'); R(c, px + w - 5, py + 10, 2, 4, '#5a3a20'); break;
    case 'desk': shadow(); R(c, px + 1, py + 3, w - 2, 10, '#8b5a2b'); R(c, px + 1, py + 3, w - 2, 7, '#b07440'); R(c, px + 9, py, 12, 8, '#33363c'); R(c, px + 10, py + 1, 10, 5, '#7fd0ff'); R(c, px + 4, py + 6, 4, 2, '#f0f0f0'); break;
    case 'stand': {
      shadow(); R(c, px + 1, py + 3, w - 2, 11, '#8b5a2b'); R(c, px + 2, py + 4, w - 4, 6, '#5a3a20');
      const cols = ['#e8524a', '#f2c94c', '#6fcf57', '#f2994a', '#9b51e0'];
      for (let i = 0; i < 9; i++) for (let j = 0; j < 2; j++) R(c, px + 3 + i * 3, py + 5 + j * 3, 2, 2, cols[(Math.floor(i / 3) + f.x + f.y) % cols.length]);
      break;
    }
    case 'workbench': shadow(); R(c, px + 1, py + 3, w - 2, 11, '#6a5a4a'); R(c, px + 1, py + 3, w - 2, 6, '#9a8a72'); R(c, px + 5, py + 4, 6, 2, '#c0c0c0'); R(c, px + 18, py + 4, 2, 4, '#e05a5a'); R(c, px + 22, py + 5, 5, 2, '#5a8ae0'); break;
    case 'crate': R(c, px + 2, py + 2, 12, 12, '#a0703f'); c.strokeStyle = '#6e4520'; c.lineWidth = 1; c.strokeRect(px + 2.5, py + 2.5, 11, 11); c.beginPath(); c.moveTo(px + 3, py + 3); c.lineTo(px + 13, py + 13); c.stroke(); break;
    case 'easel': R(c, px + 4, py + 6, 1, 9, '#7a5230'); R(c, px + 11, py + 6, 1, 9, '#7a5230'); R(c, px + 3, py + 1, 10, 8, '#fff'); R(c, px + 4, py + 2, 4, 3, '#5ab8e0'); R(c, px + 7, py + 5, 5, 3, '#e0a05a'); break;
    case 'tv': R(c, px + 1, py + 2, 14, 10, '#1f2228'); R(c, px + 2, py + 3, 12, 7, '#3b4a6b'); R(c, px + 3, py + 4, 4, 2, 'rgba(255,255,255,0.25)'); R(c, px + 6, py + 12, 4, 2, '#1f2228'); R(c, px + 4, py + 14, 8, 1, '#1f2228'); break;
    case 'shower': R(c, px + 1, py + 1, 14, 14, '#bfe3f5'); R(c, px + 1, py + 1, 14, 1, '#8ab8d0'); R(c, px + 2, py + 2, 12, 12, '#d8f0fb'); R(c, px + 7, py + 2, 2, 3, '#9aa0a8'); R(c, px + 5, py + 5, 6, 1, '#9aa0a8'); for (let i = 0; i < 4; i++) R(c, px + 5 + i * 2, py + 7 + (i % 2) * 2, 1, 2, '#5aa9e6'); break;
    case 'sink': R(c, px + 1, py + 4, 14, 10, '#7d838c'); R(c, px + 2, py + 4, 12, 5, '#e8ebee'); R(c, px + 4, py + 5, 8, 3, '#9fd6f7'); R(c, px + 7, py + 2, 2, 3, '#9aa0a8'); break;
    case 'arcade': R(c, px + 2, py, 12, 15, '#6a3ab0'); R(c, px + 3, py + 1, 10, 6, '#111'); R(c, px + 4, py + 2, 3, 2, '#ff5ac8'); R(c, px + 8, py + 4, 3, 2, '#5affc8'); R(c, px + 3, py + 9, 10, 3, '#3a1a70'); R(c, px + 5, py + 10, 2, 1, '#ff5a5a'); R(c, px + 9, py + 10, 1, 1, '#ffe14a'); R(c, px + 11, py + 10, 1, 1, '#5ab8ff'); break;
    case 'altar': shadow(); R(c, px + 1, py + 3, w - 2, 11, '#e8e0d0'); R(c, px + 1, py + 3, w - 2, 3, '#c9a84a'); R(c, px + 14, py, 4, 6, '#c9a84a'); R(c, px + 15, py - 2, 2, 8, '#c9a84a'); R(c, px + 13, py + 1, 6, 2, '#c9a84a'); R(c, px + 4, py + 1, 2, 3, '#fff6c8'); R(c, px + 26, py + 1, 2, 3, '#fff6c8'); break;
    case 'whiteboard': R(c, px + 1, py, w - 2, 11, '#9aa0a8'); R(c, px + 2, py + 1, w - 4, 9, '#ffffff'); R(c, px + 4, py + 3, 10, 1, '#5a8ae0'); R(c, px + 4, py + 5, 14, 1, '#e05a5a'); R(c, px + 18, py + 3, 8, 5, '#5ab87a'); R(c, px + 6, py + 11, 2, 4, '#7d838c'); R(c, px + w - 8, py + 11, 2, 4, '#7d838c'); break;
    case 'rock': c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(px + 8, py + 13, 7, 2.5, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#7d7a72'; c.beginPath(); c.ellipse(px + 8, py + 9, 7, 5.5, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#a8a497'; c.beginPath(); c.ellipse(px + 6, py + 7, 3.5, 2.5, 0, 0, Math.PI * 2); c.fill(); R(c, px + 10, py + 9, 2, 1, '#c07a4a'); break;
    case 'dock': R(c, px + 6, py + 2, 4, 13, '#6e4520'); R(c, px + 5, py + 2, 6, 2, '#8b5a2b'); break;
    case 'lamp': R(c, px + 7, py + 4, 2, 11, '#3b3f46'); R(c, px + 5, py + 1, 6, 4, '#3b3f46'); R(c, px + 6, py + 2, 4, 2, '#ffe9a0'); R(c, px + 5, py + 14, 6, 2, '#3b3f46'); break;
  }
}

// ---- characters ----
export function drawCharacter(c, a, x, y, t) {
  // x,y = feet centre in world pixels
  const col = a.colors;
  const moving = a.moving;
  const step = moving ? Math.floor(t * 8) % 4 : 0;
  const bob = moving && (step === 1 || step === 3) ? -1 : 0;
  const px = Math.round(x) - 6, py = Math.round(y) - 17 + bob;

  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.beginPath(); c.ellipse(x, y, 5, 2, 0, 0, Math.PI * 2); c.fill();

  const fem = a.gender === 'female';
  // legs
  const l = step === 1 ? 1 : 0, r = step === 3 ? 1 : 0;
  R(c, px + 3, py + 13 - l, 2, 4 + l - bob, col.pants);
  R(c, px + 7, py + 13 - r, 2, 4 + r - bob, col.pants);
  R(c, px + 3, py + 16 - bob, 2, 1, '#2b2b2b'); R(c, px + 7, py + 16 - bob, 2, 1, '#2b2b2b');
  // body
  R(c, px + 2, py + 8, 8, 6, col.shirt);
  if (fem) { R(c, px + 1, py + 12, 10, 3, col.shirt); R(c, px + 1, py + 14, 10, 1, 'rgba(0,0,0,0.25)'); }
  R(c, px + 2, py + 8, 8, 1, 'rgba(255,255,255,0.25)');
  // arms
  const sw = moving ? (step === 1 ? 1 : step === 3 ? -1 : 0) : 0;
  if (a.dir !== 'left') R(c, px + 10, py + 9 + sw, 2, 4, col.shirt), R(c, px + 10, py + 13 + sw, 2, 1, col.skin);
  if (a.dir !== 'right') R(c, px, py + 9 - sw, 2, 4, col.shirt), R(c, px, py + 13 - sw, 2, 1, col.skin);
  // head
  R(c, px + 2, py + 1, 8, 7, col.skin);
  // hair
  R(c, px + 1, py, 10, 3, col.hair);
  if (a.dir === 'up') R(c, px + 1, py, 10, 7, col.hair);
  else if (a.dir === 'left') { R(c, px + 6, py, 5, 6, col.hair); }
  else if (a.dir === 'right') { R(c, px + 1, py, 5, 6, col.hair); }
  else { R(c, px + 1, py + 2, 1, 4, col.hair); R(c, px + 10, py + 2, 1, 4, col.hair); }
  if ((fem || (a.gender !== 'male' && col.long)) && a.dir !== 'up') { R(c, px + 1, py + 3, 1, 6, col.hair); R(c, px + 10, py + 3, 1, 6, col.hair); }
  // face
  if (a.asleep) {
    R(c, px + 3, py + 4, 2, 1, '#333'); R(c, px + 7, py + 4, 2, 1, '#333');
  } else if (a.dir === 'down') {
    R(c, px + 4, py + 4, 1, 2, '#222'); R(c, px + 7, py + 4, 1, 2, '#222');
    R(c, px + 3, py + 6, 1, 1, 'rgba(255,120,120,0.5)'); R(c, px + 8, py + 6, 1, 1, 'rgba(255,120,120,0.5)');
  } else if (a.dir === 'left') {
    R(c, px + 3, py + 4, 1, 2, '#222');
  } else if (a.dir === 'right') {
    R(c, px + 8, py + 4, 1, 2, '#222');
  }
  if (a.gender === 'male' && a.dir === 'down' && col.beard) R(c, px + 3, py + 6, 6, 2, col.hair);
  if (a.dead) return;
  if (a.hat) { R(c, px + 1, py - 2, 10, 3, a.hat); R(c, px, py + 0, 12, 1, a.hat); }
}

export const PALETTES = {
  skin: ['#f5d0b0', '#e8b890', '#c98e62', '#a06a42', '#7a4e2e', '#f2c6a0'],
  hair: ['#2b1d14', '#5a3a20', '#a0602a', '#e0b050', '#c0c0c0', '#1a1a2e', '#b04a2a', '#6a4a9a'],
  shirt: ['#e05a5a', '#5a8ae0', '#f2c94c', '#5ab87a', '#a05ae0', '#e08a4a', '#4ac0c0', '#f07ab0', '#ffffff', '#3b3f46'],
  pants: ['#3b4a6b', '#4a3a2a', '#2b2b2b', '#5a6a3a', '#6a4a6a', '#8a7a5a'],
};
export function randomColors(rng = Math.random) {
  const p = (a) => a[Math.floor(rng() * a.length)];
  return { skin: p(PALETTES.skin), hair: p(PALETTES.hair), shirt: p(PALETTES.shirt), pants: p(PALETTES.pants), long: rng() < 0.4, beard: rng() < 0.3 };
}
