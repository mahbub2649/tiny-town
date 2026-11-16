// World: tile map, furniture, locations, items + procedural town generator.
export const TS = 16; // pixels per tile (before zoom)

export const T = {
  GRASS: 0, PATH: 1, WATER: 2, TREE: 3, WALL: 4, WOOD: 5, TILE: 6, DOOR: 7,
  FLOWER: 8, FENCE: 9, BUSH: 10, CARPET: 11, STONE: 12, SAND: 13, CROP: 14,
};

export const TILE_INFO = {
  [T.GRASS]: { name: 'Grass', walk: true },
  [T.PATH]: { name: 'Path', walk: true },
  [T.WATER]: { name: 'Water', walk: false },
  [T.TREE]: { name: 'Tree', walk: false },
  [T.WALL]: { name: 'Wall', walk: false },
  [T.WOOD]: { name: 'Wood floor', walk: true },
  [T.TILE]: { name: 'Tile floor', walk: true },
  [T.DOOR]: { name: 'Door', walk: true },
  [T.FLOWER]: { name: 'Flowers', walk: true },
  [T.FENCE]: { name: 'Fence', walk: false },
  [T.BUSH]: { name: 'Bush', walk: false },
  [T.CARPET]: { name: 'Carpet', walk: true },
  [T.STONE]: { name: 'Plaza stone', walk: true },
  [T.SAND]: { name: 'Sand', walk: true },
  [T.CROP]: { name: 'Crops', walk: true },
};

// Furniture catalog: size in tiles and whether it blocks walking.
export const FURN = {
  table: { w: 2, h: 1, block: true, label: 'Table' },
  chair: { w: 1, h: 1, block: false, label: 'Chair' },
  bed: { w: 1, h: 2, block: true, label: 'Bed' },
  shelf: { w: 2, h: 1, block: true, label: 'Bookshelf' },
  counter: { w: 1, h: 1, block: true, label: 'Counter' },
  stove: { w: 1, h: 1, block: true, label: 'Stove' },
  fridge: { w: 1, h: 1, block: true, label: 'Fridge' },
  sofa: { w: 2, h: 1, block: true, label: 'Sofa' },
  plant: { w: 1, h: 1, block: true, label: 'Plant' },
  piano: { w: 2, h: 1, block: true, label: 'Piano' },
  bench: { w: 2, h: 1, block: false, label: 'Bench' },
  desk: { w: 2, h: 1, block: true, label: 'Desk' },
  rug: { w: 3, h: 2, block: false, label: 'Rug' },
  stand: { w: 2, h: 1, block: true, label: 'Produce stand' },
  register: { w: 1, h: 1, block: true, label: 'Register' },
  workbench: { w: 2, h: 1, block: true, label: 'Workbench' },
  crate: { w: 1, h: 1, block: true, label: 'Crate' },
  easel: { w: 1, h: 1, block: true, label: 'Easel' },
  lamp: { w: 1, h: 1, block: true, label: 'Street lamp' },
  tv: { w: 1, h: 1, block: true, label: 'Television' },
  shower: { w: 1, h: 1, block: true, label: 'Shower' },
  sink: { w: 1, h: 1, block: true, label: 'Sink' },
  arcade: { w: 1, h: 1, block: true, label: 'Arcade machine' },
  altar: { w: 2, h: 1, block: true, label: 'Altar' },
  whiteboard: { w: 2, h: 1, block: true, label: 'Whiteboard' },
  rock: { w: 1, h: 1, block: true, label: 'Boulder' },
  dock: { w: 1, h: 1, block: false, label: 'Dock post' },
};

export const LOCATION_KINDS = {
  home: '🏠', cafe: '☕', library: '📚', shop: '🛒', park: '🌳', plaza: '⛲', workshop: '🔧',
  school: '🏫', hall: '🏛️', bar: '🍺', clinic: '🏥', farm: '🌾', temple: '⛪', lab: '🔬', woods: '🌲', grove: '🫐', garden: '🥕', dock: '🎣', quarry: '⛏️', custom: '📍',
};

let uid = 1;
export const newId = (p = 'id') => `${p}${Date.now().toString(36)}${(uid++).toString(36)}`;

export class World {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.tiles = new Uint8Array(w * h);
    this.furniture = [];
    this.locations = [];
    this.items = [];
    this.dirty = true;
    this.blocked = new Uint8Array(w * h);
  }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.inBounds(x, y) ? this.tiles[y * this.w + x] : T.TREE; }
  set(x, y, t) { if (this.inBounds(x, y)) { this.tiles[y * this.w + x] = t; this.dirty = true; } }
  fill(x, y, w, h, t) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, t); }

  rebuildBlocked() {
    for (let i = 0; i < this.tiles.length; i++) this.blocked[i] = TILE_INFO[this.tiles[i]]?.walk ? 0 : 1;
    for (const f of this.furniture) {
      const d = FURN[f.type];
      if (!d?.block) continue;
      for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) {
        if (this.inBounds(f.x + i, f.y + j)) this.blocked[(f.y + j) * this.w + f.x + i] = 1;
      }
    }
  }
  walkable(x, y) { return this.inBounds(x, y) && !this.blocked[y * this.w + x]; }

  addFurniture(type, x, y, extra = {}) {
    const f = { id: newId('f'), type, x, y, ...extra };
    this.furniture.push(f);
    this.dirty = true;
    return f;
  }
  furnitureAt(x, y) {
    return this.furniture.find((f) => {
      const d = FURN[f.type];
      return x >= f.x && x < f.x + d.w && y >= f.y && y < f.y + d.h;
    });
  }

  // Neighbouring walkable tile from which an agent can use furniture f.
  standTileFor(f, fromX = 0, fromY = 0) {
    const d = FURN[f.type];
    if (!d.block) return { x: f.x, y: f.y };
    let best = null, bd = Infinity;
    for (let j = -1; j <= d.h; j++) for (let i = -1; i <= d.w; i++) {
      const inside = i >= 0 && j >= 0 && i < d.w && j < d.h;
      const corner = (i === -1 || i === d.w) && (j === -1 || j === d.h);
      if (inside || corner) continue;
      const x = f.x + i, y = f.y + j;
      if (!this.walkable(x, y)) continue;
      const dist = Math.hypot(x - fromX, y - fromY);
      if (dist < bd) { bd = dist; best = { x, y }; }
    }
    return best;
  }
  // Find the best object of a type: prefer one inside preferLoc, else nearest.
  findObject(type, preferLoc, fromX, fromY) {
    let best = null, bs = Infinity;
    if (type === 'water') {
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== T.WATER) continue;
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          if (!this.walkable(x + dx, y + dy)) continue;
          const loc = this.locationAt(x + dx, y + dy);
          const sc = (preferLoc && loc === preferLoc ? 0 : 500) + Math.hypot(x - fromX, y - fromY);
          if (sc < bs) { bs = sc; best = { type, x, y, stand: { x: x + dx, y: y + dy }, loc }; }
        }
      }
      return best;
    }
    for (const f of this.furniture) {
      if (f.type !== type) continue;
      const loc = this.locationAt(f.x, f.y);
      const sc = (preferLoc && loc === preferLoc ? 0 : 500) + Math.hypot(f.x - fromX, f.y - fromY);
      if (sc >= bs) continue;
      const stand = this.standTileFor(f, fromX, fromY);
      if (!stand) continue;
      bs = sc; best = { type, fid: f.id, x: f.x, y: f.y, stand, loc };
    }
    return best;
  }
  objectsIn(loc) {
    const types = new Set();
    for (const f of this.furniture) if (this.locationAt(f.x, f.y) === loc) types.add(f.type);
    for (let y = loc.y - 1; y <= loc.y + loc.h; y++) for (let x = loc.x - 1; x <= loc.x + loc.w; x++) if (this.get(x, y) === T.WATER) { types.add('water'); y = 1e9; break; }
    return [...types];
  }
  // count of walkable tiles reachable from (sx,sy) inside rect
  _reach(loc, sx, sy) {
    const seen = new Set([sy * this.w + sx]), q = [[sx, sy]];
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = ny * this.w + nx;
        if (seen.has(k) || nx < loc.x || ny < loc.y || nx >= loc.x + loc.w || ny >= loc.y + loc.h || !this.walkable(nx, ny)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return seen.size;
  }
  // Place a 1x1 object against a wall without cutting the room in two.
  placeAgainstWall(loc, type, extra = {}) {
    this.rebuildBlocked();
    const cands = [];
    for (let y = loc.y; y < loc.y + loc.h; y++) for (let x = loc.x; x < loc.x + loc.w; x++) {
      if (!this.walkable(x, y) || this.furnitureAt(x, y)) continue;
      const n4 = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => this.get(x + dx, y + dy));
      if (n4.includes(T.DOOR) || !n4.includes(T.WALL)) continue;
      cands.push({ x, y });
    }
    const start = this.randomSpotIn(loc);
    const before = this._reach(loc, start.x, start.y);
    for (const c of cands.sort(() => Math.random() - 0.5)) {
      const f = this.addFurniture(type, c.x, c.y, extra);
      this.rebuildBlocked();
      const s2 = start.x === c.x && start.y === c.y ? this.randomSpotIn(loc) : start;
      if (this._reach(loc, s2.x, s2.y) === before - 1) return f;
      this.furniture = this.furniture.filter((q) => q !== f);
      this.rebuildBlocked();
    }
    return null;
  }

  addLocation(name, x, y, w, h, kind = 'custom', extra = {}) {
    const loc = { id: newId('loc'), name, x, y, w, h, kind, emoji: LOCATION_KINDS[kind] || '📍', ...extra };
    this.locations.push(loc);
    return loc;
  }
  locationAt(x, y) {
    let best = null;
    for (const l of this.locations) {
      if (x >= l.x && x < l.x + l.w && y >= l.y && y < l.y + l.h) {
        if (!best || l.w * l.h < best.w * best.h) best = l;
      }
    }
    return best;
  }
  findLocation(name) {
    if (!name) return null;
    const n = String(name).toLowerCase().replace(/[^a-z0-9' ]/g, '').trim();
    return (
      this.locations.find((l) => l.name.toLowerCase() === n) ||
      this.locations.find((l) => l.name.toLowerCase().includes(n) || n.includes(l.name.toLowerCase())) ||
      this.locations.find((l) => n.split(' ').some((w) => w.length > 3 && l.name.toLowerCase().includes(w)))
    );
  }
  randomSpotIn(loc, rng = Math.random) {
    for (let k = 0; k < 80; k++) {
      const x = loc.x + Math.floor(rng() * loc.w);
      const y = loc.y + Math.floor(rng() * loc.h);
      if (this.walkable(x, y) && this.get(x, y) !== T.DOOR) return { x, y };
    }
    return this.nearestWalkable(loc.x + (loc.w >> 1), loc.y + (loc.h >> 1));
  }
  nearestWalkable(x, y) {
    for (let r = 0; r < 20; r++) {
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        if (this.walkable(x + i, y + j)) return { x: x + i, y: y + j };
      }
    }
    return { x, y };
  }

  // Builds walls around rect, floor inside, door at given tile.
  building(x, y, w, h, floor, door) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      const edge = i === x || j === y || i === x + w - 1 || j === y + h - 1;
      this.set(i, j, edge ? T.WALL : floor);
    }
    if (door) this.set(door.x, door.y, T.DOOR);
  }
  pathLine(x1, y1, x2, y2, t = T.PATH) {
    const sx = Math.sign(x2 - x1), sy = Math.sign(y2 - y1);
    let x = x1, y = y1;
    this.set(x, y, t);
    while (x !== x2) { x += sx; this.set(x, y, t); }
    while (y !== y2) { y += sy; this.set(x, y, t); }
  }

  serialize() {
    return {
      w: this.w, h: this.h,
      tiles: Array.from(this.tiles),
      furniture: this.furniture, locations: this.locations, items: this.items,
    };
  }
  static deserialize(d) {
    const W = new World(d.w, d.h);
    W.tiles = Uint8Array.from(d.tiles);
    W.furniture = d.furniture || [];
    W.locations = d.locations || [];
    W.items = d.items || [];
    W.rebuildBlocked();
    return W;
  }
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Public gathering grounds + exchange stalls. Safe to run on existing saves: anything already present
// is left alone, and a ground is skipped if the player has built on its spot. Returns the names added.
export function addGatheringGrounds(W) {
  const added = [];
  const has = (n) => W.locations.some((l) => l.name === n);
  const clear = (x, y, w, h, ignore = []) => {
    if (W.locations.some((l) => !ignore.includes(l.name) && x < l.x + l.w && x + w > l.x && y < l.y + l.h && y + h > l.y)) return false;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (W.get(i, j) === T.WALL || W.get(i, j) === T.DOOR || W.furnitureAt(i, j)) return false;
    return true;
  };
  if (!W.furniture.some((f) => f.type === 'stand' && f.x >= 24 && f.x <= 38 && f.y >= 17 && f.y <= 24)) {
    for (const x of [25, 36]) if (!W.furnitureAt(x, 20) && !W.furnitureAt(x + 1, 20) && W.get(x, 20) === T.STONE && W.get(x + 1, 20) === T.STONE) W.addFurniture('stand', x, 20);
  }
  if (!has('Old Quarry') && clear(3, 54, 18, 4)) {
    W.fill(3, 54, 18, 4, T.STONE);
    W.pathLine(12, 45, 12, 53);
    W.addLocation('Old Quarry', 3, 54, 18, 4, 'quarry', { resource: ['stone', 'ore'] });
    for (const [x, y] of [[4, 55], [7, 56], [9, 54], [14, 55], [16, 57], [19, 55], [5, 57], [18, 54]]) W.addFurniture('rock', x, y);
    added.push('Old Quarry');
  }
  if (!has('Lumber Woods') && clear(24, 38, 17, 5)) {
    W.fill(24, 38, 17, 5, T.GRASS);
    for (let x = 25; x <= 39; x += 2) { W.set(x, 39, T.TREE); W.set(x + 1, 41, T.TREE); }
    W.addLocation('Lumber Woods', 24, 38, 17, 5, 'woods', { resource: ['wood'] });
    added.push('Lumber Woods');
  }
  if (!has('Berry Grove') && clear(42, 39, 20, 4)) {
    W.fill(42, 39, 20, 4, T.GRASS);
    for (let x = 43; x <= 60; x += 2) { W.set(x, 40, T.BUSH); W.set(x + 1, 42, T.FLOWER); W.set(x, 42, T.FLOWER); }
    W.addLocation('Berry Grove', 42, 39, 20, 4, 'grove', { resource: ['berries', 'herbs'] });
    added.push('Berry Grove');
  }
  if (!has('Community Garden') && clear(80, 40, 13, 3)) {
    W.fill(80, 40, 13, 3, T.GRASS);
    for (let x = 81; x <= 91; x++) if (x !== 86) W.set(x, 41, T.CROP);
    W.addLocation('Community Garden', 80, 40, 13, 3, 'garden', { resource: ['crops'] });
    added.push('Community Garden');
  }
  if (!has('Fishing Dock') && has('Silver Lake') && clear(76, 45, 6, 5, ['Silver Lake'])) {
    for (let y = 46; y <= 49; y++) { W.set(78, y, T.WOOD); W.set(79, y, T.WOOD); }
    W.pathLine(78, 45, 78, 45);
    W.addFurniture('dock', 78, 49); W.addFurniture('dock', 79, 49);
    W.addLocation('Fishing Dock', 76, 45, 6, 5, 'dock', { resource: ['fish'] });
    added.push('Fishing Dock');
  }
  W.dirty = true;
  return added;
}

// ------------------------------------------------------------------
// Default town (96 x 60)
// ------------------------------------------------------------------
export function generateTown() {
  const W = new World(96, 60);
  const rng = mulberry32(1234);
  W.fill(0, 0, W.w, W.h, T.GRASS);
  for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) {
    if (x < 2 || y < 2 || x >= W.w - 2 || y >= W.h - 2) W.set(x, y, rng() < 0.85 ? T.TREE : T.BUSH);
  }
  // roads
  W.fill(2, 15, 92, 2, T.PATH);      // main road
  W.fill(2, 43, 92, 2, T.PATH);      // south road
  W.fill(22, 17, 2, 26, T.PATH);     // west avenue
  W.fill(62, 17, 2, 26, T.PATH);     // east avenue
  W.pathLine(63, 29, 91, 29);        // institute lane

  const home = (name, x, y, w, h, door, floor, furnish) => {
    W.building(x, y, w, h, floor, door);
    const loc = W.addLocation(name, x + 1, y + 1, w - 2, h - 2, 'home');
    furnish?.(loc);
    return loc;
  };

  // ---- north row ----
  home('Chen House', 3, 3, 9, 9, { x: 7, y: 11 }, T.WOOD, () => {
    W.addFurniture('bed', 4, 4, { color: '#e07a8a' }); W.addFurniture('shelf', 7, 4); W.addFurniture('plant', 10, 4);
    W.addFurniture('rug', 6, 6, { color: '#7a9be0' }); W.addFurniture('table', 5, 9); W.addFurniture('chair', 4, 9); W.addFurniture('chair', 7, 9);
    W.addFurniture('stove', 10, 9); W.addFurniture('fridge', 10, 8);
  });
  W.pathLine(7, 12, 7, 14);
  home('Rossi House', 13, 3, 9, 9, { x: 17, y: 11 }, T.WOOD, () => {
    W.addFurniture('bed', 20, 4, { color: '#6fbf73' }); W.addFurniture('sofa', 14, 4, { color: '#c98a4a' }); W.addFurniture('rug', 15, 6, { color: '#c95a5a' });
    W.addFurniture('table', 14, 9); W.addFurniture('chair', 16, 9); W.addFurniture('stove', 20, 9); W.addFurniture('plant', 17, 4);
  });
  W.pathLine(17, 12, 17, 14);

  W.building(24, 3, 14, 10, T.WOOD, { x: 30, y: 12 });
  W.pathLine(30, 13, 30, 14);
  W.addLocation('Hilltop Cafe', 25, 4, 12, 8, 'cafe');
  for (let x = 26; x <= 32; x++) W.addFurniture('counter', x, 5);
  W.addFurniture('register', 33, 5); W.addFurniture('stove', 26, 4); W.addFurniture('fridge', 27, 4);
  W.addFurniture('piano', 34, 8); W.addFurniture('plant', 36, 4); W.addFurniture('plant', 25, 11);
  for (const [tx, ty] of [[26, 8], [29, 8], [26, 10], [32, 10]]) {
    W.addFurniture('table', tx, ty);
    W.addFurniture('chair', tx - 1 < 25 ? tx + 2 : tx - 1, ty);
    W.addFurniture('chair', tx + 2 <= 36 ? tx + 2 : tx - 1, ty);
  }

  const apartments = (x, y, w, rooms, floor) => {
    W.building(x, y, w, 9, floor, null);
    rooms.forEach((r, i) => {
      if (i > 0) for (let yy = y + 1; yy < y + 8; yy++) W.set(r.x0 - 1, yy, T.WALL);
      const dx = r.x0 + (r.door ?? 1);
      W.set(dx, y + 8, T.DOOR);
      W.pathLine(dx, y + 9, dx, 14);
      W.addLocation(r.name, r.x0, y + 1, r.x1 - r.x0 + 1, 7, 'home');
      W.addFurniture('bed', r.x0, y + 1, { color: r.bed });
      W.addFurniture('desk', r.x0 + 2, y + 1);
      W.addFurniture('plant', r.x1, y + 6);
    });
  };
  apartments(40, 3, 22, [
    { name: "Priya's Apartment", x0: 41, x1: 44, bed: '#9b7be0' }, { name: "Sana's Apartment", x0: 46, x1: 49, bed: '#e0b84a' },
    { name: "Juno's Apartment", x0: 51, x1: 54, bed: '#4ab8e0' }, { name: "Omar's Apartment", x0: 56, x1: 60, bed: '#e07a4a' },
  ], T.TILE);
  W.addFurniture('easel', 48, 8);
  apartments(64, 3, 30, [
    { name: 'Bell Apartment', x0: 65, x1: 69, bed: '#5ac8a0', door: 2 }, { name: "Elena's Apartment", x0: 71, x1: 75, bed: '#a05ae0', door: 2 },
    { name: "Kenji's Apartment", x0: 77, x1: 81, bed: '#e0d05a', door: 2 }, { name: 'Spare Apartment', x0: 83, x1: 87, bed: '#5a6ae0', door: 2 },
    { name: "Danny's Apartment", x0: 89, x1: 92, bed: '#e05a5a' },
  ], T.WOOD);

  // ---- middle band ----
  W.fill(24, 17, 15, 8, T.STONE);
  W.fill(30, 19, 3, 3, T.WATER);
  W.addLocation('Town Square', 24, 17, 15, 8, 'plaza');
  for (const [x, y] of [[26, 18], [35, 18], [26, 23], [35, 23]]) W.addFurniture('bench', x, y);
  for (const [x, y] of [[24, 17], [38, 17], [24, 24], [38, 24]]) W.addFurniture('lamp', x, y);

  W.addLocation('Willow Park', 4, 20, 16, 18, 'park');
  for (let x = 3; x <= 20; x++) { W.set(x, 19, T.FENCE); W.set(x, 38, T.FENCE); }
  for (let y = 19; y <= 38; y++) { W.set(3, y, T.FENCE); W.set(20, y, T.FENCE); }
  W.set(11, 19, T.PATH); W.set(12, 19, T.PATH); W.set(20, 30, T.PATH); W.set(21, 30, T.PATH);
  W.pathLine(11, 17, 11, 18); W.pathLine(12, 17, 12, 18);
  W.pathLine(11, 20, 11, 26); W.pathLine(12, 20, 12, 26);
  W.pathLine(5, 27, 18, 27); W.pathLine(5, 26, 5, 34); W.pathLine(18, 27, 18, 35); W.pathLine(18, 30, 19, 30);
  for (let y = 29; y <= 35; y++) for (let x = 7; x <= 16; x++) {
    const dx = (x - 11.5) / 5, dy = (y - 32) / 3.5;
    if (dx * dx + dy * dy < 1) W.set(x, y, T.WATER);
  }
  for (let k = 0; k < 60; k++) {
    const x = 4 + Math.floor(rng() * 16), y = 20 + Math.floor(rng() * 18);
    if (W.get(x, y) === T.GRASS) W.set(x, y, rng() < 0.55 ? T.FLOWER : (rng() < 0.5 ? T.TREE : T.BUSH));
  }
  W.addFurniture('bench', 7, 25); W.addFurniture('bench', 14, 25); W.addFurniture('bench', 16, 36);

  W.building(40, 18, 11, 7, T.TILE, { x: 45, y: 24 });
  W.set(45, 18, T.DOOR);
  W.pathLine(45, 17, 45, 17);
  W.addLocation('Town Hall', 41, 19, 9, 5, 'hall');
  W.addFurniture('desk', 42, 19); W.addFurniture('chair', 42, 20); W.addFurniture('desk', 47, 19); W.addFurniture('chair', 48, 20);
  W.addFurniture('plant', 49, 23); W.addFurniture('plant', 41, 23);

  W.building(54, 19, 8, 8, T.WOOD, { x: 57, y: 19 });
  W.pathLine(57, 18, 57, 17);
  W.addLocation("Felix's Workshop", 55, 20, 6, 6, 'workshop');
  W.addFurniture('workbench', 55, 20); W.addFurniture('workbench', 58, 20); W.addFurniture('crate', 60, 24); W.addFurniture('crate', 60, 25);
  W.addFurniture('bed', 55, 24, { color: '#8a8a8a' });

  W.building(64, 18, 12, 10, T.WOOD, { x: 69, y: 18 });
  W.pathLine(69, 17, 69, 17);
  W.addLocation('Chapel of Dawn', 65, 19, 10, 8, 'temple');
  W.addFurniture('altar', 69, 25);
  for (const [x, y] of [[66, 21], [72, 21], [66, 23], [72, 23]]) W.addFurniture('bench', x, y);
  W.addFurniture('plant', 65, 25); W.addFurniture('plant', 74, 25);

  W.building(78, 18, 13, 9, T.TILE, { x: 84, y: 18 });
  W.pathLine(84, 17, 84, 17);
  W.addLocation('Willow Clinic', 79, 19, 11, 7, 'clinic');
  for (const x of [79, 81, 87, 89]) W.addFurniture('bed', x, 19, { color: '#e8eef5' });
  W.addFurniture('desk', 79, 24); W.addFurniture('plant', 89, 25);

  // ---- south band ----
  W.building(24, 27, 13, 11, T.CARPET, { x: 30, y: 27 });
  W.pathLine(30, 26, 30, 25);
  W.addLocation('Town Library', 25, 28, 11, 9, 'library');
  for (const y of [29, 31]) for (const x of [26, 28, 32, 34]) W.addFurniture('shelf', x, y);
  W.addFurniture('desk', 26, 34); W.addFurniture('chair', 26, 35); W.addFurniture('desk', 33, 34); W.addFurniture('chair', 34, 35);
  W.addFurniture('counter', 29, 34); W.addFurniture('counter', 31, 34); W.addFurniture('plant', 35, 36);

  W.building(39, 27, 13, 11, T.TILE, { x: 45, y: 27 });
  W.pathLine(45, 26, 45, 25);
  W.addLocation('Corner Market', 40, 28, 11, 9, 'shop');
  for (const y of [30, 33]) for (const x of [41, 44, 48]) W.addFurniture('stand', x, y);
  W.addFurniture('counter', 41, 28); W.addFurniture('register', 42, 28); W.addFurniture('fridge', 50, 28); W.addFurniture('fridge', 50, 29);
  W.addFurniture('crate', 50, 36); W.addFurniture('crate', 49, 36);

  home('Barnes Cottage', 54, 30, 8, 9, { x: 57, y: 30 }, T.WOOD, () => {
    W.addFurniture('bed', 60, 31, { color: '#4a7ae0' }); W.addFurniture('sofa', 55, 31, { color: '#7a5a9a' });
    W.addFurniture('table', 55, 35); W.addFurniture('chair', 57, 35); W.addFurniture('plant', 60, 37);
  });
  W.pathLine(57, 29, 53, 29); W.pathLine(53, 29, 53, 17);

  W.building(64, 30, 16, 11, T.TILE, { x: 71, y: 30 });
  W.addLocation('Willowbrook Institute', 65, 31, 14, 9, 'lab');
  for (const x of [65, 68, 74, 77]) W.addFurniture('desk', x, 31);
  for (const x of [65, 69, 74, 78]) W.addFurniture('chair', x, 32);
  W.addFurniture('whiteboard', 66, 35); W.addFurniture('whiteboard', 75, 35);
  W.addFurniture('workbench', 66, 38); W.addFurniture('workbench', 75, 38); W.addFurniture('shelf', 70, 39);

  W.building(82, 30, 11, 10, T.WOOD, { x: 87, y: 30 });
  W.addLocation('The Rusty Anchor', 83, 31, 9, 8, 'bar');
  for (const x of [89, 90, 91]) W.addFurniture('counter', x, 31);
  for (const [tx, ty] of [[84, 34], [88, 34], [84, 37]]) { W.addFurniture('table', tx, ty); W.addFurniture('chair', tx, ty + 1); W.addFurniture('chair', tx + 1, ty + 1); }
  W.addFurniture('piano', 89, 37);

  // ---- far south ----
  home('Kim Residence', 3, 45, 9, 8, { x: 7, y: 45 }, T.CARPET, () => {
    W.addFurniture('bed', 4, 46, { color: '#c0a0e0' }); W.addFurniture('desk', 9, 46); W.addFurniture('sofa', 4, 50, { color: '#a05a5a' }); W.addFurniture('stove', 10, 50);
  });
  home('Delgado Farmhouse', 13, 45, 9, 8, { x: 17, y: 45 }, T.WOOD, () => {
    W.addFurniture('bed', 14, 46, { color: '#e0a05a' }); W.addFurniture('table', 18, 49); W.addFurniture('chair', 20, 49); W.addFurniture('stove', 20, 46); W.addFurniture('crate', 14, 50);
  });
  home('Hale Manor', 25, 45, 11, 9, { x: 30, y: 45 }, T.CARPET, () => {
    W.addFurniture('bed', 26, 46, { color: '#2a2a4a' }); W.addFurniture('sofa', 32, 46, { color: '#5a2a2a' }); W.addFurniture('piano', 26, 51);
    W.addFurniture('rug', 30, 49, { color: '#b08a3a' }); W.addFurniture('desk', 32, 51);
  });
  home('Guest House', 37, 45, 9, 8, { x: 41, y: 45 }, T.WOOD, () => {
    W.addFurniture('bed', 38, 46, { color: '#8ac0e0' }); W.addFurniture('bed', 44, 46, { color: '#e08ac0' }); W.addFurniture('table', 39, 50); W.addFurniture('chair', 41, 50);
  });

  // Sunny Farm
  for (let x = 47; x <= 61; x++) { W.set(x, 45, T.FENCE); W.set(x, 57, T.FENCE); }
  for (let y = 45; y <= 57; y++) { W.set(47, y, T.FENCE); W.set(61, y, T.FENCE); }
  W.set(54, 45, T.PATH); W.set(55, 45, T.PATH);
  W.addLocation('Sunny Farm', 48, 46, 13, 11, 'farm');
  for (let y = 49; y <= 55; y += 2) for (let x = 49; x <= 59; x++) if (x !== 54 && x !== 55) W.set(x, y, T.CROP);
  W.pathLine(54, 46, 54, 56); W.pathLine(55, 46, 55, 56);
  W.addFurniture('stand', 49, 46); W.addFurniture('stand', 57, 46); W.addFurniture('crate', 60, 56);

  // Silver Lake
  W.fill(64, 46, 29, 11, T.SAND);
  for (let y = 46; y <= 56; y++) for (let x = 64; x <= 92; x++) {
    const dx = (x - 78) / 11.5, dy = (y - 51.5) / 4.5;
    if (dx * dx + dy * dy < 1) W.set(x, y, T.WATER);
  }
  W.addLocation('Silver Lake', 64, 46, 29, 11, 'park');
  W.addFurniture('bench', 66, 47); W.addFurniture('bench', 89, 47); W.addFurniture('bench', 66, 55); W.addFurniture('bench', 88, 55);
  W.pathLine(70, 45, 70, 46);

  addGatheringGrounds(W);

  // scatter trees/flowers on open grass, away from structures
  const near = (x, y) => {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const t = W.get(x + i, y + j);
      if (t !== T.GRASS && t !== T.TREE && t !== T.BUSH && t !== T.FLOWER) return true;
    }
    return !!W.locationAt(x, y);
  };
  for (let y = 2; y < W.h - 2; y++) for (let x = 2; x < W.w - 2; x++) {
    if (W.get(x, y) !== T.GRASS || near(x, y)) continue;
    const r = rng();
    if (r < 0.05) W.set(x, y, T.TREE); else if (r < 0.08) W.set(x, y, T.FLOWER); else if (r < 0.09) W.set(x, y, T.BUSH);
  }

  W.rebuildBlocked();
  for (const loc of W.locations) {
    if (loc.kind === 'home') for (const t of ['tv', 'shower', 'sink']) W.placeAgainstWall(loc, t);
    if (loc.kind === 'home' && !W.furniture.some((f) => f.type === 'fridge' && W.locationAt(f.x, f.y) === loc)) W.placeAgainstWall(loc, 'fridge');
    if (loc.kind === 'cafe') { W.placeAgainstWall(loc, 'tv'); W.placeAgainstWall(loc, 'sink'); W.placeAgainstWall(loc, 'arcade'); }
    if (loc.kind === 'bar') { W.placeAgainstWall(loc, 'tv'); W.placeAgainstWall(loc, 'arcade'); W.placeAgainstWall(loc, 'arcade'); W.placeAgainstWall(loc, 'sink'); }
    if (loc.kind === 'hall' || loc.kind === 'lab') W.placeAgainstWall(loc, 'tv');
    if (['workshop', 'clinic', 'lab'].includes(loc.kind)) W.placeAgainstWall(loc, 'sink');
  }
  W.rebuildBlocked();
  return W;
}
