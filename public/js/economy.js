// Economy mixin: gatherable resources, regenerating resource nodes, a dynamic-price Exchange (supply & demand),
// shops whose goods need real inputs, crafting recipes, agent-to-agent trades and wealth statistics.
import { T } from './world.js';
import { NEEDS, AFFORD } from './needs.js';

export const RES = {
  wood: { emoji: '🪵', label: 'Wood', base: 2, target: 40, eat: null },
  stone: { emoji: '🪨', label: 'Stone', base: 2.5, target: 30, eat: null },
  ore: { emoji: '⛏️', label: 'Iron ore', base: 6, target: 15, eat: null },
  crops: { emoji: '🌾', label: 'Crops', base: 1.5, target: 60, eat: { hunger: 6 } },
  fish: { emoji: '🐟', label: 'Fish', base: 3, target: 30, eat: { hunger: 10 } },
  berries: { emoji: '🫐', label: 'Berries', base: 1, target: 30, eat: { hunger: 8, thirst: 3 } },
  herbs: { emoji: '🌿', label: 'Herbs', base: 1.5, target: 20, eat: null },
};
export const RES_KEYS = Object.keys(RES);
const STACK = 10;
// where each resource comes from
const NODE = {
  wood: { tile: T.TREE, max: 6, adj: true, per: 12, where: 'trees (forest edge, parks)' },
  crops: { tile: T.CROP, max: 4, adj: false, per: 10, where: 'crop fields at Sunny Farm (Rosa\'s)' },
  berries: { tile: T.BUSH, max: 4, adj: true, per: 10, where: 'bushes' },
  herbs: { tile: T.FLOWER, max: 3, adj: false, per: 12, where: 'flower patches (Willow Park)' },
  stone: { furn: 'rock', max: 10, adj: true, per: 15, where: 'rocks at the Old Quarry' },
  ore: { furn: 'rock', max: 10, adj: true, per: 20, where: 'rocks at the Old Quarry (rare)' },
  fish: { water: true, max: 1e9, adj: true, per: 15, where: 'Silver Lake or the park pond' },
};
// crafting recipes: object to use, inputs, output
export const RECIPES = {
  'Fish stew': { at: 'stove', in: { fish: 1, crops: 1 }, out: { emoji: '🍲', satisfies: { hunger: 60, thirst: 10 } } },
  'Fresh bread': { at: 'stove', in: { crops: 2 }, out: { emoji: '🍞', satisfies: { hunger: 35 } } },
  'Berry pie': { at: 'stove', in: { berries: 2, crops: 1 }, out: { emoji: '🥧', satisfies: { hunger: 40, fun: 15 } } },
  'Grilled fish': { at: 'stove', in: { fish: 1 }, out: { emoji: '🍣', satisfies: { hunger: 35 } } },
  'Herbal remedy': { at: 'stove', in: { herbs: 2 }, out: { emoji: '🧪', satisfies: { energy: 10 }, heal: 15 } },
  'Wooden chair': { at: 'workbench', in: { wood: 3 }, out: { emoji: '🪑', value: 1.8 } },
  'Toolkit': { at: 'workbench', in: { wood: 1, ore: 1 }, out: { emoji: '🧰', tool: true, value: 1.5 } },
  'Fishing rod': { at: 'workbench', in: { wood: 2 }, out: { emoji: '🎣', tool: 'fish', value: 1.5 } },
  'Stone sculpture': { at: 'workbench', in: { stone: 3 }, out: { emoji: '🗿', value: 2.2, satisfies: { fun: 10 } } },
  'Iron tools': { at: 'workbench', in: { ore: 2, wood: 1 }, out: { emoji: '⚒️', tool: true, value: 1.6 } },
  'Painting': { at: 'easel', in: {}, out: { emoji: '🖼️', value: 0, flat: 15, satisfies: { fun: 10 } } },
};
export const EXCHANGE = 'Town Square';
// professions: gathering jobs (paid by what they produce, no wage)
export const PROFESSIONS = {
  Lumberjack: { res: 'wood', place: 'Lumber Woods' }, Fisher: { res: 'fish', place: 'Fishing Dock' },
  Miner: { res: 'stone', place: 'Old Quarry' }, Farmer: { res: 'crops', place: 'Community Garden' },
  Forager: { res: 'berries', place: 'Berry Grove' }, Herbalist: { res: 'herbs', place: 'Berry Grove' },
};
const MENU_FOOD = new Set(['crops', 'fish', 'berries', 'herbs']);
const PUBLIC_EMPLOYERS = ['hall', 'library', 'lab', 'temple', 'clinic'];
const FOOD_VALUE = { meals: 1, fish: 1, crops: 0.5, berries: 0.5 };
// shop goods consume exchange stock (inputs); prices follow input prices
export const MENU_INPUTS = {
  Apple: { crops: 1 }, Bread: { crops: 2 }, Sandwich: { crops: 1, fish: 1 }, Chocolate: { berries: 1 }, Soap: { herbs: 1 }, Flowers: { herbs: 1 },
  Toolkit: { wood: 1, ore: 1 }, Croissant: { crops: 1 }, Tea: { herbs: 1 }, 'Cake slice': { crops: 1, berries: 1 }, Soup: { crops: 1, fish: 1 },
  Juice: { berries: 1 }, Pretzel: { crops: 1 }, Mocktail: { berries: 1 }, Ale: { crops: 1 }, 'Fish & chips': { fish: 1, crops: 1 },
  'Fresh eggs': { crops: 1 }, Milk: { crops: 1 }, Coffee: { herbs: 1 }, Soda: { berries: 1 }, Carrots: { crops: 1 }, Corn: { crops: 1 }, Medicine: { herbs: 2 },
};

export const Economy = {
  initEconomy() {
    this.market = {
      orders: [],
      stock: { wood: 25, stone: 15, ore: 6, crops: 45, fish: 15, berries: 15, herbs: 12 },
      price: {}, history: [], trades: [], volume: 0, sales: 0,
    };
    for (const k of RES_KEYS) this.market.price[k] = RES[k].base;
    this.nodes = {};
    this.setupResourcePlaces();
    this.updatePrices();
  },
  setupResourcePlaces() {
    for (const l of this.world.locations) {
      if (l.kind === 'home' && !this.world.furniture.some((f) => f.type === 'stove' && this.world.locationAt(f.x, f.y) === l)) this.world.placeAgainstWall(l, 'stove');
      if (l.kind === 'home' && !l.storage) l.storage = { meals: 2, crops: 6, fish: 2, berries: 2 }; // starting supplies only – after that food must be gathered & cooked
      if (l.kind === 'farm' && !l.resource) l.resource = ['crops'];
      if (l.name === 'Silver Lake' && !l.resource) l.resource = ['fish'];
      if (l.name === 'Willow Park' && !l.resource) l.resource = ['fish', 'berries', 'herbs'];
    }
    this.market.orders ||= [];
  },
  resourceLevel(l) {
    if (!l.resource) return null;
    if (l._lvlAt && this.now - l._lvlAt < 3) return l._lvl;
    if (l.resource.includes('fish')) { l._lvl = 1; l._lvlAt = this.now; return 1; }
    let have = 0, max = 0;
    const tiles = { wood: T.TREE, crops: T.CROP, berries: T.BUSH, herbs: T.FLOWER };
    for (let y = l.y - 1; y <= l.y + l.h; y++) for (let x = l.x - 1; x <= l.x + l.w; x++) {
      const t = this.world.get(x, y);
      const k = l.resource.find((r) => tiles[r] === t) || (l.resource.includes('stone') && this.world.furniture.some((f) => f.type === 'rock' && f.x === x && f.y === y) ? 'stone' : null);
      if (!k) continue;
      const mx = NODE[k].max, n = this.nodes[`${x},${y}`];
      max += mx; have += n ? n.stock : mx;
    }
    l._lvl = max ? have / max : 0; l._lvlAt = this.now;
    return l._lvl;
  },
  // ---------- housing: no one homeless while homes stand empty ----------
  reassignHomes() {
    const homes = this.world.locations.filter((l) => l.kind === 'home');
    const movers = [];
    for (const l of homes) {
      const res = this.agents.filter((a) => a.home === l.name);
      const keep = [];
      for (const a of res) { const p = this.partnerOf(a); if (keep.length < 2 && (!keep.length || keep.some((k) => k.id === a.romance?.partner) || !p)) keep.push(a); else movers.push(a); }
      void keep;
    }
    for (const a of this.agents) if (!homes.some((l) => l.name === a.home)) movers.push(a);
    for (const a of movers) {
      const free = homes.find((l) => !this.agents.some((b) => b.home === l.name));
      if (!free) break;
      const old = a.home;
      a.home = free.name;
      this.remember(a, `I moved into ${free.name} (it was empty). It is my home now, and whatever is in its pantry is mine.`, 4);
      this.log('econ', `🏠 ${a.name} moved from ${old} into the empty ${free.name}`, [a.id]);
    }
  },

  // ---------- labour market ----------
  // Each morning anyone with no job or workplace is matched to the gathering trade the town needs most.
  jobOffice() {
    const counts = Object.fromEntries(RES_KEYS.map((k) => [k, 0]));
    for (const a of this.agents) { const r = this.professionRes(a); if (r) counts[r]++; }
    for (const a of this.agents) {
      if (a.pinned || a.job.place || a.job.wage || a.job.employer || this.world.locations.some((l) => l.owner === a.name) || this.gov?.leaderId === a.id) continue;
      const [title, spec] = Object.entries(PROFESSIONS).map(([t, p]) => {
        const need = RES[p.res].eat || this.market.stock[p.res] < RES[p.res].target / 3 ? 1.5 : 1;
        return [t, p, (this.market.price[p.res] * 60 / NODE[p.res].per * need) / (1 + counts[p.res])];
      }).sort((x, y) => y[2] - x[2])[0];
      counts[spec.res]++;
      if (this.world.findLocation(spec.place)) this.setJob(a, title, spec.place);
    }
  },
  // Gathering professionals work regular day shifts without needing a planning call.
  workRoutine(a) {
    const k = this.professionRes(a);
    if (!k || !a.job.place || a.convoId) return false;
    const h = Math.floor(((this.time % 1440) + 1440) % 1440 / 60);
    if (h < 8 || h >= 18 || this.time - (a._shiftAt ?? -1e9) < 300) return false;
    if (['hunger', 'thirst', 'energy'].some((n) => a.needs[n] < 35)) return false;
    a._shiftAt = this.time;
    this.applyDecision(a, { action: `Working as ${a.job.title}`, emoji: RES[k].emoji, destination: a.job.place, minutes: 120, work: true }, 'routine');
    return true;
  },

  // ---------- survival instinct: hungry bodies don't wait for a plan ----------
  // Learned urgency (punishment) and the caution gene make an agent react earlier.
  instinctAt(a, k) { return Math.min(42, ({ hunger: 14, thirst: 14, energy: 10 })[k] + ((a.learn?.[k] || 1) - 1) * 10 + (a.genes?.caution ?? 0.5) * 8); },
  eatFromBag(a, key, upTo = 60) {
    for (let g = 0; g < 6 && a.needs[key] < upTo; g++) {
      const food = a.inventory.filter((i) => (i.satisfies?.[key] || 0) > 0).sort((x, y) => y.satisfies[key] - x.satisfies[key])[0];
      if (!food) break;
      this.consume(a, food.name);
    }
  },
  actionFixes(a, k) {
    const ac = a.action;
    if (!ac || ac.completed || ac.noFood) return false;
    if (ac.obj && AFFORD[ac.obj.type]?.[k]) return true;
    if (k === 'hunger') return !!(ac.buy || ac.consume || (ac.gather && RES[ac.gather.res]?.eat));
    if (k === 'thirst') return !!ac.buy;
    return false;
  },
  survive(a) {
    if (a.dead || a.convoId || a.action?.forced) return;
    const n = a.needs;
    if (a.asleep && n.hunger >= 10 && n.thirst >= 10) return; // only real hunger or thirst wakes a sleeper
    if (n.hunger < 40) this.eatFromBag(a, 'hunger');
    if (n.thirst < 40) this.eatFromBag(a, 'thirst');
    const k = ['thirst', 'hunger', 'energy'].filter((x) => n[x] < this.instinctAt(a, x)).sort((x, y) => n[x] - n[y])[0];
    if (!k || (a.action && !a.action.completed && (a.action.instinct || this.actionFixes(a, k)))) return;
    if (this.time - (a._instinctAt ?? -1e9) < 20) return;
    a._instinctAt = this.time;
    const home = this.homeOf(a)?.kind === 'home' ? this.homeOf(a) : null;
    let plan = null;
    if (k === 'thirst') {
      const sink = home && this.world.findObject('sink', home, a.x, a.y);
      const water = this.world.findObject('water', null, a.x, a.y);
      const d = (o) => (o ? Math.hypot(o.x - a.x, o.y - a.y) : Infinity);
      const best = sink?.loc === home && d(sink) <= d(water) ? sink : water;
      if (best) plan = { action: 'Desperate for water', emoji: '💧', destination: best.loc?.name, minutes: 15, use: best.type };
    } else if (k === 'energy') {
      plan = { action: 'Going to sleep, exhausted', emoji: '😴', destination: home?.name, minutes: 300, use: 'bed' };
    } else if (home && this.pantryFood(home) >= 1 && (home.storage.meals >= 1 || home.storage.berries >= 2 || home.storage.fish >= 1 || home.storage.crops >= 2)) {
      plan = { action: 'Rushing home to eat', emoji: '🍽️', destination: home.name, minutes: 25, use: home.storage.meals >= 1 ? 'fridge' : 'stove' };
    } else {
      let best = null, bd = Infinity;
      for (const l of this.world.locations.filter((x) => x.shop?.length)) for (const m of l.shop) {
        const sp = this.shopPrice(m);
        if (!(m.satisfies?.hunger > 0) || !this.shopHasInputs(sp.inp) || sp.price > a.money) continue;
        const dist = Math.hypot(l.x - a.x, l.y - a.y);
        if (dist < bd) { bd = dist; best = { l, m }; }
      }
      if (best) plan = { action: `Hurrying to get food`, emoji: '🍽️', destination: best.l.name, minutes: 15, buy: best.m.name, consume: best.m.name };
      else {
        const opts = [['berries', 'Berry Grove'], ['crops', 'Community Garden'], ['fish', 'Fishing Dock']].sort(() => Math.random() - 0.5);
        const o = opts.find(([r, p]) => this.findNode(r, a, this.world.findLocation(p)));
        if (o) plan = { action: 'Foraging, starving', emoji: '🫐', destination: o[1], minutes: 60, gather: o[0] };
      }
    }
    if (!plan) return;
    this.interrupt(a);
    this.applyDecision(a, plan, 'instinct');
    if (a.action) a.action.instinct = true;
    this.log('need', `${NEEDS[k].emoji}❗ ${a.name}: survival instinct – ${plan.action} (${NEEDS[k].label.toLowerCase()} ${Math.round(n[k])})`, [a.id]);
  },

  // ---------- home storage / pantry (hoarding) ----------
  homeOf(a) { return this.world.findLocation(a.home); },
  canUseHome(a, loc) { return loc && loc.kind === 'home' && (loc.name === a.home || this.agents.some((b) => b.home === loc.name && b.id === a.romance?.partner)); },
  pantryFood(loc) { const st = loc?.storage || {}; return Object.entries(FOOD_VALUE).reduce((s, [k, v]) => s + (st[k] || 0) * v, 0); },
  // fridge: only cooked meals (or a raw berry snack)
  pantryEat(loc) {
    const st = loc?.storage;
    if (!st) return false;
    if (st.meals >= 1) { st.meals--; return true; }
    if (st.berries >= 2) { st.berries -= 2; return true; }
    return false;
  },
  // stove: cook raw gathered ingredients into a meal (eaten now, leftovers stored)
  pantryCook(loc, a) {
    const st = loc?.storage;
    if (!st) return false;
    let made = 0;
    if (st.fish >= 1 && st.crops >= 1) { st.fish--; st.crops--; made = 2; }
    else if (st.fish >= 1) { st.fish--; made = 1; }
    else if (st.crops >= 2) { st.crops -= 2; made = 1; }
    else if (st.meals >= 1) { st.meals--; return true; }
    if (!made) return false;
    if (made > 1) st.meals = (st.meals || 0) + made - 1;
    this.log('econ', `🍳 ${a.name} cooked a meal at ${loc.name} from stored ingredients${made > 1 ? ' (+1 leftover meal)' : ''}`, [a.id]);
    return true;
  },
  storageText(loc) {
    const st = loc?.storage || {};
    const parts = Object.entries(st).filter(([k, v]) => k !== 'items' && v > 0).map(([k, v]) => `${Math.round(v)} ${k}`);
    for (const it of st.items || []) parts.push(`${it.emoji}${it.name}`);
    return parts.join(', ') || 'EMPTY';
  },
  store(a, what) {
    const loc = this.locOf(a);
    if (!this.canUseHome(a, loc)) { this.remember(a, 'I can only store things in my own home.', 1); return; }
    const st = (loc.storage ||= {});
    const all = !what || /all|everything|food|resources/i.test(what);
    const k = this.resName(what);
    let moved = [];
    for (const it of [...a.inventory]) {
      if (it.res && (all || it.res === k)) { st[it.res] = (st[it.res] || 0) + it.qty; moved.push(`${it.qty} ${it.res}`); a.inventory = a.inventory.filter((i) => i !== it); }
      else if (!it.res && (all ? (it.satisfies?.hunger >= 20) : it.name.toLowerCase().includes(String(what).toLowerCase()))) {
        if (it.satisfies?.hunger >= 20) st.meals = (st.meals || 0) + 1; else (st.items ||= []).push(it);
        moved.push(it.name); a.inventory = a.inventory.filter((i) => i !== it);
      }
    }
    if (!moved.length) return;
    this.remember(a, `I stored ${moved.join(', ')} at home (home now has: ${this.storageText(loc)}).`, 2);
    this.log('econ', `📦 ${a.name} stored ${moved.join(', ')} at ${loc.name}`, [a.id]);
  },
  takeFromStorage(a, what, qty) {
    const loc = this.locOf(a);
    if (!this.canUseHome(a, loc)) return;
    const st = loc.storage || {};
    const k = this.resName(what);
    if (k && st[k] > 0) {
      const n = Math.min(st[k], Math.max(1, Math.round(Number(qty) || st[k])), 10);
      const got = this.addRes(a, k, n); st[k] -= got;
      if (got) this.log('econ', `📤 ${a.name} took ${got} ${k} from home storage`, [a.id]);
      return;
    }
    const it = (st.items || []).find((i) => i.name.toLowerCase().includes(String(what || '').toLowerCase()));
    if (it && !this.invFull(a)) { st.items = st.items.filter((i) => i !== it); a.inventory.push(it); }
  },

  // ---------- order book (agents set their own prices) ----------
  postOrder(a, o) {
    const k = this.resName(o.item);
    if (!k) { this.remember(a, `The exchange only lists raw resources, not "${o.item}".`, 1); return; }
    const side = /sell/i.test(o.side) ? 'sell' : 'buy';
    const qty = Math.max(1, Math.min(30, Math.round(Number(o.qty) || 1)));
    const price = Math.max(0.1, Math.round((Number(o.price) || this.market.price[k]) * 100) / 100);
    if (side === 'buy') {
      if (a.money < price * qty) { this.remember(a, `I can't afford to bid ${qty} ${k} at $${price}.`, 1); return; }
      a.money -= price * qty;
    } else {
      const have = this.resCount(a, k) + (this.canUseHome(a, this.locOf(a)) ? (this.locOf(a).storage?.[k] || 0) : 0);
      if (this.resCount(a, k) < qty) { this.remember(a, `I don't have ${qty} ${k} in my bag to sell (have ${have}).`, 1); return; }
      this.takeRes(a, k, qty);
    }
    const ord = { id: 'o' + Math.random().toString(36).slice(2, 8), side, res: k, qty, price, by: a.id, name: a.name, t: this.time, exp: this.time + 1440, forShop: o.forShop || null };
    this.market.orders.push(ord);
    this.log('econ', `📋 ${a.name} posted ${side.toUpperCase()} order: ${qty} ${RES[k].emoji} ${k} @ $${price}${o.forShop ? ` (to restock ${o.forShop})` : ''}`, [a.id]);
    for (const w of this.witnesses(a, 8)) this.remember(w, `${a.name} wants to ${side} ${qty} ${k} at $${price} each.`, 2);
    this.matchOrders(k);
  },
  deliver(agent, k, qty, order) {
    if (order?.forShop) { this.market.stock[k] += qty; return; }
    const home = this.homeOf(agent);
    if (home) { (home.storage ||= {})[k] = (home.storage[k] || 0) + qty; } else this.addRes(agent, k, qty);
  },
  matchOrders(k) {
    const m = this.market;
    for (;;) {
      const buys = m.orders.filter((o) => o.side === 'buy' && o.res === k).sort((x, y) => y.price - x.price);
      const sells = m.orders.filter((o) => o.side === 'sell' && o.res === k).sort((x, y) => x.price - y.price);
      const b = buys[0], s2 = sells[0];
      if (!b || !s2 || b.price < s2.price || b.by === s2.by) break;
      const q = Math.min(b.qty, s2.qty), px = b.t < s2.t ? b.price : s2.price;
      const buyer = this.agent(b.by), seller = this.agent(s2.by);
      if (buyer) { buyer.money += (b.price - px) * q; this.deliver(buyer, k, q, b); }
      if (seller) seller.money += px * q;
      b.qty -= q; s2.qty -= q;
      m.orders = m.orders.filter((o) => o.qty > 0);
      this.recordTrade(s2.name, b.name, `${q} ${RES[k].label}`, px * q);
      this.log('econ', `🤝 Order filled: ${s2.name} → ${b.name}: ${q} ${RES[k].emoji} ${k} @ $${px}`, [b.by, s2.by]);
      if (buyer) this.remember(buyer, `My buy order filled: got ${q} ${k} from ${s2.name} at $${px} (delivered to my home storage).`, 2);
      if (seller) this.remember(seller, `My sell order filled: sold ${q} ${k} to ${b.name} at $${px}.`, 2);
    }
  },
  // a gatherer at the exchange first fills the best open BUY order (better than the house bid)
  fillBuyOrders(a, k) {
    let earned = 0, sold = 0;
    for (const b of this.market.orders.filter((o) => o.side === 'buy' && o.res === k && o.by !== a.id).sort((x, y) => y.price - x.price)) {
      if (b.price < this.market.price[k] * 0.9) break;
      const q = Math.min(b.qty, this.resCount(a, k));
      if (q <= 0) break;
      this.takeRes(a, k, q);
      b.qty -= q; earned += b.price * q; sold += q;
      const buyer = this.agent(b.by);
      if (buyer) { this.deliver(buyer, k, q, b); this.remember(buyer, `${a.name} filled my order: ${q} ${k} at $${b.price}.`, 2); this.bump(buyer, a, 2); }
      this.recordTrade(a.name, b.name, `${q} ${RES[k].label}`, b.price * q);
      this.log('econ', `📦 ${a.name} delivered ${q} ${RES[k].emoji} ${k} to ${b.name}'s order @ $${b.price}${b.forShop ? ` (for ${b.forShop})` : ''}`, [a.id, b.by]);
    }
    this.market.orders = this.market.orders.filter((o) => o.qty > 0);
    a.money += earned; a.stats.earned += earned;
    return sold;
  },
  expireOrders() {
    for (const o of this.market.orders.filter((x) => x.exp < this.time)) {
      const a = this.agent(o.by);
      if (a) { if (o.side === 'buy') a.money += o.price * o.qty; else this.deliver(a, o.res, o.qty); this.remember(a, `My ${o.side} order for ${o.qty} ${o.res} expired.`, 1); }
    }
    this.market.orders = this.market.orders.filter((x) => x.exp >= this.time);
  },
  // shop owners post restock contracts when their inputs are sold out → jobs for gatherers
  shopContracts() {
    for (const l of this.world.locations.filter((x) => x.shop?.length && x.owner)) {
      const owner = this.agentByName(l.owner);
      if (!owner || owner.money < 20) continue;
      const need = new Set();
      for (const m of l.shop) { const sp = this.shopPrice(m); for (const [k, q] of Object.entries(sp.inp)) if (this.market.stock[k] < q * 3) need.add(k); }
      for (const k of need) {
        if (this.market.orders.some((o) => o.forShop === l.name && o.res === k)) continue;
        const qty = 8, price = Math.round(Math.max(RES[k].base * 1.3, this.market.price[k] * 0.95) * 100) / 100;
        if (owner.money < qty * price) continue;
        this.postOrder(owner, { side: 'buy', item: k, qty, price, forShop: l.name });
      }
    }
  },
  jobBoardText() {
    const buys = this.market.orders.filter((o) => o.side === 'buy').sort((x, y) => y.price * y.qty - x.price * x.qty).slice(0, 15);
    const sells = this.market.orders.filter((o) => o.side === 'sell').sort((x, y) => x.price - y.price).slice(0, 10);
    return `${buys.length ? `WANTED (deliver to the exchange & "sell" to get paid): ${buys.map((o) => `${o.name} buys ${o.qty} ${o.res} @ $${o.price}`).join('; ')}.` : 'No buy orders.'}${sells.length ? ` FOR SALE: ${sells.map((o) => `${o.name} sells ${o.qty} ${o.res} @ $${o.price}`).join('; ')}.` : ''}`;
  },

  // ---------- wages: paid by a real employer or the treasury ----------
  payWage(a, amount) {
    const loc = this.world.findLocation(a.job.place);
    let payer = null;
    if (a.job.employer) payer = this.agentByName(a.job.employer);
    else if (loc?.owner && loc.owner !== a.name) payer = this.agentByName(loc.owner);
    if (loc?.owner === a.name && !a.job.employer) return 0; // owners live from profits
    if (payer && payer !== a) {
      if (payer.money < amount) { this.wageFail(a, `${payer.name} couldn't pay my wage`); return 0; }
      payer.money -= amount; return amount;
    }
    if (loc && PUBLIC_EMPLOYERS.includes(loc.kind)) {
      if (this.gov.treasury < amount) { this.wageFail(a, 'the town treasury is empty, so no wages'); return 0; }
      this.gov.treasury -= amount; return amount;
    }
    return 0;
  },
  wageFail(a, why) {
    if (this.time - (a._wageFailAt || -1e9) < 360) return;
    a._wageFailAt = this.time;
    this.remember(a, `I worked but wasn't paid: ${why}! I need another way to earn money.`, 4);
    this.log('econ', `💸❌ ${a.name} wasn't paid: ${why}`, [a.id]);
  },
  setJob(a, title, place, wage = 0, employer = null) {
    if (!title || title === 'undefined') return;
    const prof = Object.keys(PROFESSIONS).find((p) => String(title).toLowerCase().includes(p.toLowerCase()));
    const loc = this.world.findLocation(place) || (prof ? this.world.findLocation(PROFESSIONS[prof].place) : null);
    const old = a.job.title;
    a.job = { title: String(prof || title).slice(0, 40), place: loc?.name || '', wage: Math.max(0, Number(wage) || 0), employer };
    this.remember(a, `I changed my job from ${old} to ${a.job.title}${a.job.place ? ` at ${a.job.place}` : ''}${a.job.wage ? ` ($${a.job.wage}/h from ${employer || 'the town'})` : ''}.`, 4);
    this.log('econ', `💼 ${a.name} is now a ${a.job.title}${a.job.place ? ` at ${a.job.place}` : ''}${employer ? `, hired by ${employer} for $${a.job.wage}/h` : ''} (was ${old})`, [a.id]);
  },
  professionRes(a) { const p = Object.keys(PROFESSIONS).find((k) => a.job.title.toLowerCase().includes(k.toLowerCase())); return p ? PROFESSIONS[p].res : null; },

  // ---------- money flow from the outside world ----------
  exportsHour() {
    const m = this.market;
    let revenue = 0;
    for (const k of RES_KEYS) {
      const reserve = RES[k].eat || MENU_FOOD.has(k) ? RES[k].target : RES[k].target * 0.5;
      const surplus = m.stock[k] - reserve;
      if (surplus <= 0) continue;
      const q = surplus * 0.1 + 0.3 > surplus ? surplus : surplus * 0.1 + 0.3;
      m.stock[k] -= q;
      revenue += q * m.price[k] * 0.8;
      if (m.stock[k] < 1 && ['wood', 'stone', 'ore'].includes(k) && Math.random() < 0.1) m.stock[k] += 1; // rare non-food imports only
    }
    this.gov.treasury += revenue;
    m.exports = (m.exports || 0) + revenue;
  },

  // ---------- per-agent concrete opportunities (numbers drive LLM choices) ----------
  opportunities(a) {
    const m = this.market;
    const rows = RES_KEYS.filter((k) => k !== 'ore').map((k) => {
      const per = NODE[k].per;
      const yieldH = (60 / per) * (k === 'fish' ? 0.6 : 1) * (this.hasTool(a, k) ? 2 : 1);
      const bestOrder = m.orders.filter((o) => o.side === 'buy' && o.res === k).reduce((mx, o) => Math.max(mx, o.price), 0);
      const p = Math.max(m.price[k] * 0.9, bestOrder);
      return { k, perHour: yieldH * p, p };
    }).sort((x, y) => y.perHour - x.perHour);
    const place = { wood: 'Lumber Woods', crops: 'Community Garden', berries: 'Berry Grove', herbs: 'Berry Grove', stone: 'Old Quarry', fish: 'Fishing Dock' };
    const signal = RES_KEYS.map((k) => { const r = m.price[k] / RES[k].base; return r > 1.8 ? `${k} ${r.toFixed(1)}× normal (scarce – sell!)` : r < 0.6 ? `${k} ${r.toFixed(1)}× normal (cheap – buy/hoard)` : null; }).filter(Boolean);
    const carried = RES_KEYS.map((k) => [k, this.resCount(a, k)]).filter(([, q]) => q > 0);
    const carriedVal = carried.reduce((s2, [k, q]) => s2 + q * this.market.price[k] * 0.9, 0) + a.inventory.filter((i) => !i.res && i.value).reduce((s2, i) => s2 + i.value, 0);
    const carryTxt = carriedVal > 3 ? ` 💰 You are carrying goods worth ~$${carriedVal.toFixed(0)} (${carried.map(([k, q]) => `${q} ${k}`).join(', ')}${a.inventory.some((i) => !i.res && i.value) ? ', crafted items' : ''}) – sell them at ${EXCHANGE} ("sell"), fill a buy order, eat them, or "store" them at home to hoard.` : '';
    return `💡 Earning options: ${rows.slice(0, 3).map((r) => `gather ${r.k} at ${place[r.k]} ≈ $${r.perHour.toFixed(0)}/hour (sells $${r.p.toFixed(1)})`).join('; ')}. Your wage: ${a.job.wage ? `$${a.job.wage}/h (if your employer can pay)` : 'none'}.${signal.length ? ` Market signals: ${signal.join(', ')}.` : ''}${carryTxt}`;
  },
  geneEconHints(a) {
    const g = a.genes || {};
    return [g.greed > 0.6 && 'You love profit: buy low, sell high, hoard scarce goods, post orders at good prices.',
      g.caution > 0.6 && 'You like a well-stocked pantry and savings.',
      g.ambition > 0.7 && 'You want to own or grow a business and hire workers.',
      g.honesty < 0.3 && 'Shortcuts like stealing tempt you when money is tight.',
      g.sociability > 0.7 && 'You prefer trading face-to-face.'].filter(Boolean).join(' ');
  },
  updatePrices() {
    const m = this.market;
    for (const k of RES_KEYS) {
      const s = Math.max(1, m.stock[k]);
      m.price[k] = Math.round(RES[k].base * Math.max(0.3, Math.min(4, Math.pow(RES[k].target / s, 0.6))) * 100) / 100;
    }
  },
  // hourly: outside demand drains the exchange, nodes regrow, prices recorded
  economyHour() {
    const m = this.market;
    for (const n of Object.values(this.nodes)) n.stock = Math.min(n.max, n.stock + n.max / 8);
    this.updatePrices();
    m.history.push({ t: this.time, price: { ...m.price }, stock: Object.fromEntries(RES_KEYS.map((k) => [k, Math.round(m.stock[k])])), money: Math.round(this.agents.reduce((s, a) => s + a.money, 0)), gini: this.gini() });
    if (m.history.length > 240) m.history.shift();
  },
  gini() {
    const xs = this.agents.map((a) => Math.max(0, a.money)).sort((a, b) => a - b);
    const n = xs.length, sum = xs.reduce((s, x) => s + x, 0);
    if (!n || !sum) return 0;
    let acc = 0; xs.forEach((x, i) => { acc += (2 * (i + 1) - n - 1) * x; });
    return Math.round((acc / (n * sum)) * 100) / 100;
  },
  resName(s) {
    if (!s) return null;
    const t = String(s).toLowerCase();
    const direct = RES_KEYS.find((k) => t.includes(k) || t.includes(RES[k].label.toLowerCase()));
    if (direct) return direct;
    const alias = { log: 'wood', lumber: 'wood', timber: 'wood', chop: 'wood', rock: 'stone', quarry: 'stone', iron: 'ore', metal: 'ore', mine: 'ore', wheat: 'crops', vegetable: 'crops', harvest: 'crops', grain: 'crops', farm: 'crops', fishing: 'fish', berry: 'berries', herb: 'herbs', flower: 'herbs' };
    const w = Object.keys(alias).find((x) => t.includes(x));
    return w ? alias[w] : null;
  },

  // ---------- inventory stacks ----------
  resCount(a, k) { return a.inventory.filter((i) => i.res === k).reduce((s, i) => s + (i.qty || 1), 0); },
  addRes(a, k, qty) {
    let left = qty;
    for (const i of a.inventory) if (i.res === k && i.qty < STACK && left > 0) { const add = Math.min(STACK - i.qty, left); i.qty += add; left -= add; }
    while (left > 0 && a.inventory.length < 6) {
      const add = Math.min(STACK, left);
      a.inventory.push({ name: RES[k].label, emoji: RES[k].emoji, res: k, qty: add, carry: true, satisfies: RES[k].eat ? { ...RES[k].eat } : {}, desc: `Raw ${RES[k].label.toLowerCase()}` });
      left -= add;
    }
    for (const i of a.inventory) if (i.res) i.name = `${RES[i.res].label} ×${i.qty}`;
    return qty - left;
  },
  takeRes(a, k, qty) {
    if (this.resCount(a, k) < qty) return false;
    let left = qty;
    for (const i of [...a.inventory].reverse()) {
      if (i.res !== k || left <= 0) continue;
      const take = Math.min(i.qty, left); i.qty -= take; left -= take;
    }
    a.inventory = a.inventory.filter((i) => !i.res || i.qty > 0);
    for (const i of a.inventory) if (i.res) i.name = `${RES[i.res].label} ×${i.qty}`;
    return true;
  },
  hasTool(a, kind) { return a.inventory.some((i) => i.tool === true || i.tool === kind); },

  // ---------- gathering ----------
  findNode(k, a, preferLoc) {
    const spec = NODE[k];
    if (!spec) return null;
    if (spec.water) {
      const o = this.world.findObject('water', preferLoc, a.x, a.y);
      return o ? { key: `w${o.x},${o.y}`, stand: o.stand, x: o.x, y: o.y } : null;
    }
    let best = null, bs = Infinity;
    const cands = [];
    if (spec.furn) for (const f of this.world.furniture) if (f.type === spec.furn) cands.push({ x: f.x, y: f.y, f });
    if (spec.tile != null) for (let y = 2; y < this.world.h - 2; y++) for (let x = 2; x < this.world.w - 2; x++) if (this.world.get(x, y) === spec.tile) cands.push({ x, y });
    for (const c of cands) {
      const key = `${c.x},${c.y}`;
      const node = this.nodes[key];
      if (node && node.stock < 1) continue;
      let stand = { x: c.x, y: c.y };
      if (spec.adj) {
        stand = c.f ? this.world.standTileFor(c.f, a.x, a.y) : [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy })).find((p) => this.world.walkable(p.x, p.y));
        if (!stand) continue;
      }
      const loc = this.world.locationAt(stand.x, stand.y);
      const sc = Math.hypot(c.x - a.x, c.y - a.y) + (preferLoc && loc === preferLoc ? -200 : 0);
      if (sc < bs) { bs = sc; best = { key, stand, x: c.x, y: c.y }; }
    }
    return best;
  },
  finishGather(a, minutes) {
    const g = a.action?.gather;
    if (!g || g.done) return;
    g.done = true;
    const k = g.res, spec = NODE[k];
    const node = (this.nodes[g.key] ||= { stock: spec.max, max: spec.max });
    let n = Math.floor(Math.max(0, minutes) / spec.per);
    if (this.hasTool(a, k)) n *= 2;
    if (k === 'fish') n = Array.from({ length: n }, () => Math.random() < 0.6).filter(Boolean).length;
    if (k === 'ore') n = Array.from({ length: n }, () => Math.random() < 0.35).filter(Boolean).length;
    // draw from the chosen node first, then neighbouring nodes of the same kind (within 6 tiles)
    let want = n, taken = 0;
    const pool = [[g.key, node]];
    if (!spec.water) {
      const [gx, gy] = g.key.split(',').map(Number);
      const tile = spec.tile, furn = spec.furn;
      for (let y = gy - 6; y <= gy + 6; y++) for (let x = gx - 6; x <= gx + 6; x++) {
        const key = `${x},${y}`;
        if (key === g.key) continue;
        const match = tile != null ? this.world.get(x, y) === tile : this.world.furniture.some((f) => f.type === furn && f.x === x && f.y === y);
        if (match) pool.push([key, (this.nodes[key] ||= { stock: spec.max, max: spec.max })]);
      }
    }
    for (const [, nd] of pool) { if (want <= 0) break; const t2 = Math.min(want, Math.floor(nd.stock)); nd.stock -= t2; want -= t2; taken += t2; }
    n = taken;
    if (n <= 0) { this.remember(a, `I tried to gather ${RES[k].label.toLowerCase()} but the area is depleted – try another gathering ground.`, 2); return; }
    const got = this.addRes(a, k, n);
    a.needs.energy = Math.max(0, a.needs.energy - 3 - n); a.needs.hygiene = Math.max(0, a.needs.hygiene - 2 - n);
    a.stats.gathered = (a.stats.gathered || 0) + got;
    const loc = this.locOf(a);
    this.remember(a, `I gathered ${got} ${RES[k].emoji} ${RES[k].label.toLowerCase()}${got < n ? ' (bag full, lost some)' : ''} ${this.at(a)}.`, 2);
    this.log('econ', `${RES[k].emoji} ${a.name} gathered ${got} ${RES[k].label.toLowerCase()} ${this.at(a)}${this.hasTool(a, k) ? ' (with tools ×2)' : ''}`, [a.id]);
    // professional gatherers send their surplus to the exchange by cart (keeping some food for themselves)
    if (this.professionRes(a) === k) {
      const surplus = this.resCount(a, k) - (RES[k].eat ? 4 : 0);
      if (surplus > 0) this.sellToMarket(a, k, surplus, true);
    }
    // harvesting someone else's farm = theft if the owner (or anyone) sees it
    if (loc?.owner && loc.owner !== a.name && a.job.place !== loc.name) {
      const owner = this.agentByName(loc.owner);
      const seen = this.witnesses(a, 7).filter((w) => w === owner || Math.random() < 0.4);
      if (owner) this.remember(owner, seen.includes(owner) ? `${a.name} harvested crops from MY farm without paying!` : 'Some of my crops went missing...', seen.includes(owner) ? 4 : 2);
      if (seen.length) { this.bump(owner || seen[0], a, -15); this.log('crime', `🌾 ${a.name} took ${got} ${RES[k].label.toLowerCase()} from ${loc.name} without permission`, [a.id]); this.crime(a, 'steal', seen); }
    }
  },

  // ---------- exchange ----------
  atExchange(a) { const l = this.locOf(a); return l?.name === EXCHANGE || l?.kind === 'shop'; },
  sellToMarket(a, itemName, qty, viaCart = false) {
    if (!viaCart && !this.atExchange(a)) { this.remember(a, `I need to be at the ${EXCHANGE} exchange stalls (or the Corner Market) to sell.`, 1); return; }
    const k = this.resName(itemName);
    const g = this.gov;
    if (k && this.resCount(a, k)) {
      const viaOrders = this.fillBuyOrders(a, k);
      if (!this.resCount(a, k)) return;
      if (viaOrders && qty) qty = Math.max(0, qty - viaOrders);
      const m = this.market;
      const have = this.resCount(a, k);
      qty = Math.max(1, Math.min(have, Math.round(Number(qty) || have)));
      let total = 0, sold = 0;
      for (let i = 0; i < qty; i++) {
        const p = m.price[k] * 0.9;
        if (g.treasury < p) break;
        total += p; g.treasury -= p; m.stock[k] += 1; sold++;
        this.updatePrices();
      }
      if (!sold) { this.remember(a, 'The exchange has no money left to buy from me! The treasury is empty.', 3); this.log('econ', `🏦 The exchange is broke – it couldn't buy ${a.name}'s ${RES[k].label.toLowerCase()}`, [a.id]); return; }
      this.takeRes(a, k, sold);
      total = Math.round(total * 100) / 100;
      a.money += total; a.stats.earned += total;
      this.recordTrade(a.name, 'Exchange', `${sold} ${RES[k].label}`, total);
      this.remember(a, `I sold ${sold} ${RES[k].label.toLowerCase()} for $${total.toFixed(0)} at the exchange.`, 2);
      this.log('econ', `💱 ${a.name} sold ${sold} ${RES[k].emoji} ${RES[k].label.toLowerCase()} for $${total.toFixed(1)} (now $${this.market.price[k]}/unit)`, [a.id]);
      return;
    }
    // crafted goods
    const it = a.inventory.find((i) => !i.res && i.value && i.name.toLowerCase().includes(String(itemName || '').toLowerCase()));
    if (!it) { this.remember(a, `I have no "${itemName}" that the exchange would buy.`, 1); return; }
    const price = Math.round(it.value * 100) / 100;
    if (g.treasury < price) { this.remember(a, 'The exchange has no money left.', 2); return; }
    g.treasury -= price; a.money += price; a.stats.earned += price;
    a.inventory = a.inventory.filter((i) => i !== it);
    this.recordTrade(a.name, 'Exchange', it.name, price);
    this.log('econ', `💱 ${a.name} sold ${it.emoji} ${it.name} to the exchange for $${price.toFixed(0)}`, [a.id]);
  },
  buyFromMarket(a, k, qty) {
    const m = this.market;
    qty = Math.max(1, Math.min(10, Math.round(Number(qty) || 1)));
    let bought = 0, total = 0;
    for (let i = 0; i < qty; i++) {
      const p = m.price[k] * 1.1;
      if (m.stock[k] < 1 || a.money < p) break;
      a.money -= p; total += p; this.gov.treasury += p; m.stock[k] -= 1; bought++;
      this.updatePrices();
    }
    if (!bought) { this.remember(a, `I couldn't buy ${RES[k].label.toLowerCase()} (${m.stock[k] < 1 ? 'sold out' : 'too expensive'}).`, 2); return; }
    const got = this.addRes(a, k, bought);
    a.stats.spent += total;
    this.recordTrade('Exchange', a.name, `${bought} ${RES[k].label}`, total);
    this.log('econ', `🛒 ${a.name} bought ${got} ${RES[k].emoji} ${RES[k].label.toLowerCase()} for $${total.toFixed(1)} at the exchange`, [a.id]);
  },
  recordTrade(from, to, what, price) {
    this.market.trades.push({ t: this.time, from, to, what, price: Math.round(price * 100) / 100 });
    if (this.market.trades.length > 200) this.market.trades.shift();
    this.market.volume += price; this.market.sales++;
  },
  // shop item cost: inputs are drawn from the exchange stock; price tracks input prices
  shopPrice(m) {
    const inp = MENU_INPUTS[m.name] || {};
    const cost = Object.entries(inp).reduce((s, [k, q]) => s + (this.market.price[k] || 0) * q, 0);
    return { cost, price: Math.max(m.price, Math.ceil(cost * 1.35)), inp };
  },
  shopHasInputs(inp) { return Object.entries(inp).every(([k, q]) => this.market.stock[k] >= q); },

  // ---------- crafting ----------
  recipeFor(name) {
    if (!name) return null;
    const n = String(name).toLowerCase();
    const key = Object.keys(RECIPES).find((r) => r.toLowerCase() === n) || Object.keys(RECIPES).find((r) => n.includes(r.toLowerCase()) || r.toLowerCase().includes(n));
    return key ? [key, RECIPES[key]] : null;
  },
  craft(a, name) {
    const r = this.recipeFor(name);
    if (!r) return;
    const [key, rec] = r;
    const near = this.world.furniture.some((f) => f.type === rec.at && Math.hypot(f.x + 0.5 - a.x, f.y + 0.5 - a.y) < 2.5);
    if (!near) { this.remember(a, `I need a ${rec.at} to make ${key}.`, 2); return; }
    const missing = Object.entries(rec.in).filter(([k, q]) => this.resCount(a, k) < q);
    if (missing.length) { this.remember(a, `I couldn't make ${key}: missing ${missing.map(([k, q]) => `${q} ${RES[k].label.toLowerCase()}`).join(', ')}.`, 2); this.log('econ', `❌ ${a.name} lacks ${missing.map(([k]) => RES[k].emoji).join('')} to craft ${key}`, [a.id]); return; }
    for (const [k, q] of Object.entries(rec.in)) this.takeRes(a, k, q);
    const inputValue = Object.entries(rec.in).reduce((s, [k, q]) => s + this.market.price[k] * q, 0);
    const item = { name: key, emoji: rec.out.emoji, desc: `${key} crafted by ${a.name}`, carry: true, satisfies: { ...(rec.out.satisfies || {}) }, madeBy: a.name, tool: rec.out.tool, value: Math.round(((rec.out.flat || 0) + inputValue * (rec.out.value || 1.3)) * 100) / 100, heal: rec.out.heal };
    if (this.invFull(a)) { const s = this.world.nearestWalkable(a.x | 0, a.y | 0); this.addItem({ ...item, x: s.x, y: s.y }); }
    else a.inventory.push(item);
    a.stats.created++;
    this.remember(a, `I crafted ${item.emoji} ${key} (worth ~$${item.value.toFixed(0)}).`, 2);
    this.log('create', `🔨 ${a.name} crafted ${item.emoji} ${key} (worth ~$${item.value.toFixed(0)})`, [a.id]);
  },

  // ---------- trades between agents (resolved in conversation) ----------
  resolveTrade(cv, accepted) {
    const tr = cv.trade, s = this.agent(tr.seller), b = this.agent(tr.buyer);
    if (!s || !b) return;
    if (!accepted) { this.log('econ', `🤝❌ ${b.name} declined ${s.name}'s offer (${tr.qty} ${tr.item} for $${tr.price})`, [s.id, b.id]); return; }
    if (b.money < tr.price) { this.remember(b, `I wanted to buy ${tr.item} from ${s.name} but couldn't afford $${tr.price}.`, 2); return; }
    const k = this.resName(tr.item);
    let ok = false;
    if (k && this.resCount(s, k) >= tr.qty) { if (this.addRes(b, k, tr.qty) === tr.qty) { this.takeRes(s, k, tr.qty); ok = true; } }
    else {
      const it = s.inventory.find((i) => i.name.toLowerCase().includes(String(tr.item).toLowerCase()));
      if (it && !this.invFull(b)) { s.inventory = s.inventory.filter((i) => i !== it); b.inventory.push(it); ok = true; }
    }
    if (!ok) { this.remember(s, `The trade with ${b.name} fell through – I didn't have ${tr.item} or their bag was full.`, 2); return; }
    b.money -= tr.price; s.money += tr.price;
    this.bump(s, b, 3); this.bump(b, s, 3);
    this.recordTrade(s.name, b.name, `${tr.qty} ${tr.item}`, tr.price);
    this.remember(s, `I sold ${tr.qty} ${tr.item} to ${b.name} for $${tr.price}.`, 3);
    this.remember(b, `I bought ${tr.qty} ${tr.item} from ${s.name} for $${tr.price}.`, 3);
    this.log('econ', `🤝 ${s.name} sold ${tr.qty} ${tr.item} to ${b.name} for $${tr.price}`, [s.id, b.id]);
  },

  economyText(a) {
    const m = this.market;
    const prices = RES_KEYS.map((k) => `${RES[k].label} $${m.price[k].toFixed(1)}(stock ${Math.round(m.stock[k])})`).join(', ');
    const sources = RES_KEYS.map((k) => `${k}: ${NODE[k].where}`).join('; ');
    const rec = Object.entries(RECIPES).map(([n, r]) => `${n}[${r.at}: ${Object.entries(r.in).map(([k, q]) => `${q} ${k}`).join('+') || 'nothing'}]`).join(', ');
    const sold = this.world.locations.filter((l) => l.shop?.length).flatMap((l) => l.shop.filter((x) => !this.shopHasInputs(this.shopPrice(x).inp)).map((x) => `${x.name}@${l.name}`));
    const home = this.homeOf(a);
    return `${this.opportunities(a)}
${this.jobBoardText()}
🍞 FOOD CHAIN (no food appears from nowhere): gather crops/fish/berries → cook at your home stove ("use":"stove"; ingredients in your bag are used automatically; fish, or 2 crops = a meal), or eat them raw with "consume" (eats as many as you need) or "craft" Fresh bread / Fish stew / Berry pie → eat. Fridge only holds cooked meals (or berries). Shops only sell food if someone supplied the exchange.
Home pantry/storage at ${home?.name || '?'}: ${this.storageText(home)} ("store" food/resources at home, "take" to get them back).
Professions you can switch to ("change_job"): ${Object.entries(PROFESSIONS).map(([p, v]) => `${p}@${v.place}`).join(', ')}.${this.geneEconHints(a) ? ` ${this.geneEconHints(a)}` : ''}
Exchange at ${EXCHANGE} (sell for 90%, buy for 110% of price; treasury pays sellers $${Math.round(this.gov?.treasury || 0)} left): ${prices}.
Gather ("gather": resource) from ${sources}. Tools double yield.
Recipes ("craft": name, uses that object; crafted goods sell for more): ${rec}.
${sold.length ? `SOLD OUT (missing inputs at the exchange): ${sold.slice(0, 8).join(', ')}.` : ''}Your bag has ${RES_KEYS.map((k) => this.resCount(a, k) ? `${this.resCount(a, k)} ${k}` : '').filter(Boolean).join(', ') || 'no resources'}.`;
  },
};
export { NEEDS };
