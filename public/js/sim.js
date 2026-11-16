// Simulation core: agents with needs/health/genes, movement, actions & transactions, planning prompts,
// conversations, director events, persistence & save migration. Social and knowledge systems are mixins.
import { World, newId, generateTown, addGatheringGrounds, FURN } from './world.js';
import { findPath } from './pathfind.js';
import { AI, parseJSON } from './ai.js';
import { randomColors } from './sprites.js';
import {
  NEEDS, NEED_KEYS, AFFORD, MENUS, JOBS, INV_LIMIT, freshNeeds, mood, clampSatisfies, satisfiesText,
  randomGenes, genesText, freshLearn, warnAt,
} from './needs.js';
import { News, Logger } from './services.js';
import { Society } from './society.js';
import { Knowledge } from './knowledge.js';
import { Economy, RES, EXCHANGE } from './economy.js';
import { Commissions } from './commissions.js';

export const GAME_MIN_PER_SEC = 2; // at 1x speed
const MAX_MEMORIES = 60;
const MAX_CONVO_LINES = 6;
const MAX_WORLD_ITEMS = 200;
const BREAKABLE = ['tv', 'arcade', 'plant', 'crate', 'easel', 'chair', 'table', 'bench', 'lamp', 'whiteboard'];

export const DEFAULT_AGENTS = [
  { name: 'Mira Chen', gender: 'female', age: 34, home: 'Chen House', money: 60, genes: { sociability: 0.85, passion: 0.7 }, persona: 'Cheerful owner of Hilltop Cafe. Knows everyone, loves hosting events, dreams of starting a poetry night. Hopeless romantic.', goal: 'Organize a poetry night at the cafe this week' },
  { name: 'Leo Rossi', gender: 'male', age: 52, home: 'Rossi House', money: 80, genes: { greed: 0.75, honesty: 0.45, sociability: 0.8 }, persona: 'Practical grocer who owns the Corner Market. Notorious gossip, a bit greedy, secretly writes detective novels.' },
  { name: 'Theo Barnes', gender: 'male', age: 71, home: 'Barnes Cottage', money: 150, genes: { caution: 0.3, greed: 0.15, faith: 0.6 }, persona: 'Retired sailor with endless sea stories. Feeds ducks at Willow Park. Slightly forgetful, generous with money.', inventory: [{ name: 'Old compass', emoji: '🧭', desc: 'From his sailing days' }] },
  { name: 'Priya Nair', gender: 'female', age: 26, home: "Priya's Apartment", money: 25, genes: { curiosity: 0.95, ambition: 0.6 }, persona: 'Curious history grad student researching the town at the Town Library. Asks lots of questions. Broke but resourceful.', goal: 'Find out who founded the town and why' },
  { name: 'Sana Okafor', gender: 'female', age: 29, home: "Sana's Apartment", money: 15, genes: { passion: 0.75, curiosity: 0.7, greed: 0.2 }, persona: 'Painter searching for inspiration. Dreamy, observant, kind. Sells her paintings when short on money.', inventory: [{ name: 'Paint set', emoji: '🎨', desc: 'Brushes and paints' }] },
  { name: 'Felix Wagner', gender: 'male', age: 23, home: "Felix's Workshop", money: 10, genes: { curiosity: 0.9, caution: 0.25 }, persona: 'Young inventor building a mysterious machine. Enthusiastic, secretive, impulsive; sometimes breaks things by accident.', goal: 'Find spare parts to finish the machine' },
  { name: 'Juno Park', gender: 'female', age: 31, home: "Juno's Apartment", money: 50, genes: { ambition: 0.9, honesty: 0.6 }, persona: "Ambitious assistant to the mayor at the Town Hall. Quietly plans to run for mayor and wants people's support." },
  { name: 'Omar Haddad', gender: 'male', age: 40, home: "Omar's Apartment", money: 20, genes: { passion: 0.85, sociability: 0.7 }, persona: 'Musician who plays piano at Hilltop Cafe. Warm, funny, a little lonely and looking for love.' },
  { name: 'Grace Kim', gender: 'female', age: 58, home: 'Kim Residence', money: 120, genes: { ambition: 0.7, honesty: 0.8, caution: 0.7 }, persona: 'The long-serving Mayor of Willowbrook. Pragmatic, diplomatic, fond of order and fair laws, worried about losing the next election.' },
  { name: 'Aisha Rahman', gender: 'female', age: 38, home: 'Bell Apartment', money: 90, genes: { caution: 0.9, honesty: 0.85 }, persona: 'The town doctor at Willow Clinic. Calm, rational, overworked. Married to Sheriff Marcus Bell, but lately feels their marriage has grown cold.' },
  { name: 'Marcus Bell', gender: 'male', age: 42, home: 'Bell Apartment', money: 60, genes: { honesty: 0.75, passion: 0.8 }, persona: 'Town sheriff who enforces the law, reports crimes and patrols at night. Protective, stubborn and easily jealous. Married to Dr. Aisha Rahman.' },
  { name: 'Elena Volkova', gender: 'female', age: 33, home: "Elena's Apartment", money: 70, genes: { curiosity: 0.95, ambition: 0.75 }, persona: 'AI researcher at the Willowbrook Institute studying how societies of agents self-organise. Reads the latest papers, writes her own, very direct.', goal: 'Publish a paper about the social dynamics of Willowbrook' },
  { name: 'Kenji Sato', gender: 'male', age: 27, home: "Kenji's Apartment", money: 40, genes: { curiosity: 0.9, sociability: 0.35 }, persona: 'Shy physicist at the Willowbrook Institute. Brilliant, awkward, secretly admires Elena. Loves thought experiments.' },
  { name: 'Rosa Delgado', gender: 'female', age: 49, home: 'Delgado Farmhouse', money: 55, genes: { caution: 0.75, faith: 0.75, greed: 0.3 }, persona: 'Farmer who runs Sunny Farm and sells fresh produce. Hard-working, devout, suspicious of city ideas, generous to the poor.' },
  { name: "Danny O'Neil", gender: 'male', age: 30, home: "Danny's Apartment", money: 35, genes: { honesty: 0.15, greed: 0.85, passion: 0.7, caution: 0.3 }, persona: 'Charming owner of The Rusty Anchor tavern. Gambler, smooth talker and petty thief when money runs low. Has a crush on Dr. Aisha.' },
  { name: 'Victor Hale', gender: 'male', age: 36, home: 'Hale Manor', money: 300, genes: { ambition: 0.95, greed: 0.85, honesty: 0.35 }, persona: 'Wealthy entrepreneur who wants to modernise and buy up the town. Plans to run for mayor. Generous when it buys influence.' },
];
const SEED_RELS = [
  ['Grace Kim', 'Juno Park', 30], ['Juno Park', 'Grace Kim', 25], ['Elena Volkova', 'Kenji Sato', 25, 15], ['Kenji Sato', 'Elena Volkova', 30, 40],
  ['Marcus Bell', "Danny O'Neil", -20], ["Danny O'Neil", 'Marcus Bell', -15], ["Danny O'Neil", 'Aisha Rahman', 20, 45],
  ['Victor Hale', 'Juno Park', -25], ['Juno Park', 'Victor Hale', -20], ['Rosa Delgado', 'Theo Barnes', 35], ['Theo Barnes', 'Rosa Delgado', 35, 10],
  ['Mira Chen', 'Omar Haddad', 30, 25], ['Omar Haddad', 'Mira Chen', 35, 40], ['Leo Rossi', 'Mira Chen', 25], ['Mira Chen', 'Leo Rossi', 20],
  ['Aisha Rahman', 'Marcus Bell', 40, 45], ['Marcus Bell', 'Aisha Rahman', 65, 70],
];

const pad = (n) => String(n).padStart(2, '0');
export function fmtTime(min) {
  const d = Math.floor(min / 1440) + 1, m = Math.floor(((min % 1440) + 1440) % 1440);
  return { day: d, hh: Math.floor(m / 60), mm: m % 60, str: `Day ${d} · ${pad(Math.floor(m / 60))}:${pad(m % 60)}` };
}
function partOfDay(h) {
  if (h < 5) return 'night'; if (h < 9) return 'early morning'; if (h < 12) return 'morning';
  if (h < 14) return 'midday'; if (h < 18) return 'afternoon'; if (h < 22) return 'evening'; return 'night';
}
const firstEmoji = (s) => {
  if (!s) return null;
  const m = String(s).match(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/u);
  return m ? m[0] : null;
};
const clean = (s, n = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const val = (x) => (x == null || x === false || (typeof x === 'string' && ['null', 'none', '', 'no', 'false', 'nothing', 'n/a'].includes(x.toLowerCase().trim())) ? null : x);
const byName = (list, name) => {
  if (!val(name)) return null;
  const n = String(name).toLowerCase().replace(/^(a|an|the|my|some)\s+/, '').trim();
  return list.find((i) => i.name.toLowerCase() === n) || list.find((i) => i.name.toLowerCase().includes(n) || n.includes(i.name.toLowerCase()));
};
const USE_ALIASES = {
  television: 'tv', telly: 'tv', bath: 'shower', bathroom: 'shower', kitchen: 'stove', oven: 'stove', cook: 'stove',
  bookshelf: 'shelf', books: 'shelf', book: 'shelf', computer: 'desk', laptop: 'desk', fountain: 'water', pond: 'water', lake: 'water',
  'arcade machine': 'arcade', game: 'arcade', couch: 'sofa', canvas: 'easel', paint: 'easel', tools: 'workbench',
  refrigerator: 'fridge', tap: 'sink', faucet: 'sink', keyboard: 'piano', pew: 'bench', board: 'whiteboard', shrine: 'altar',
};
const normUse = (u) => {
  if (!val(u)) return null;
  const s = String(u).toLowerCase().trim();
  if (AFFORD[s]) return s;
  for (const [k, v] of Object.entries(USE_ALIASES)) if (s.includes(k)) return v;
  return Object.keys(AFFORD).find((k) => s.includes(k)) || null;
};
const sym = (a) => (a.gender === 'female' ? '♀' : a.gender === 'male' ? '♂' : '');

export class Sim {
  constructor() {
    this.world = generateTown();
    this.agents = [];
    this.convos = [];
    this.time = 7 * 60;
    this.speed = 1;
    this.now = 0;
    this.lore = 'Willowbrook is a small town surrounded by forest, with a lake to the south-east.';
    this.logs = [];
    this.onLog = null;
    this.maxConvos = 4;
    this.weather = { kind: 'sunny', until: 7 * 60 + 360 };
    this.director = { enabled: true, nextAt: 9 * 60, busy: false };
    this.powerOutUntil = 0;
    this.townFund = 0;
    this.chapelFund = 0;
    this.mortality = true;
    this.popTarget = 16; this.popCap = 28;
    this.graveyard = [];
    this.genStats = { births: 0 };
    this._scanTimer = 0; this._tickAt = 0;
    this.initLibrary();
    this.initEconomy();
    this.initCommissions();
    News.onNew = (items, firstLoad) => {
      this.addJournals(items);
      for (const it of items.slice(0, firstLoad ? 3 : 8)) this.log('news', `${it.cat === 'ai-research' ? '🧪' : '📰'} [${it.source}] ${it.title}`);
      if (!firstLoad) for (const a of this.agents) if (this.usingTV(a)) this.watchNews(a);
    };
    if (News.items.length) this.addJournals(News.items);
  }

  // ---------------- setup ----------------
  seed() {
    for (const d of DEFAULT_AGENTS) this.addAgent(d);
    for (const [x, y, s, at = 0] of SEED_RELS) {
      const a = this.agentByName(x), b = this.agentByName(y);
      if (a && b) { const r = this.bump(a, b, s, at); r.met = true; }
    }
    const ai = this.agentByName('Aisha Rahman'), mb = this.agentByName('Marcus Bell');
    if (ai && mb) this.setCouple(ai, mb, 'married');
    this.setupShops();
    this.initGov();
    this.addItem({ name: 'Old town map', emoji: '🗺️', desc: 'A faded map signed "E. Willow, 1852" showing a hidden spring in the park.', x: 33, y: 30 });
    this.addItem({ name: 'Box of gears', emoji: '⚙️', desc: 'A dusty box of brass gears and springs.', x: 49, y: 35 });
    this.addItem({ name: 'Lost locket', emoji: '📿', desc: 'A silver locket with a photo of a young sailor inside.', x: 17, y: 30, hidden: true });
    this.addItem({ name: 'Lost wallet', emoji: '👛', desc: 'A wallet with $30 inside and no ID.', x: 9, y: 24, cash: 30 });
    this.addItem({ name: 'Strange meteorite', emoji: '☄️', desc: 'A glowing rock that fell near the lake. Hums faintly. Scientists would love it.', x: 90, y: 50 });
    this.popTarget = this.agents.length;
    this.log('system', 'Welcome to Willowbrook. You are the god of this town.');
  }
  setupShops() {
    for (const l of this.world.locations) if (MENUS[l.kind] && !l.shop) l.shop = MENUS[l.kind].map((m) => ({ ...m }));
    const owners = { 'Corner Market': 'Leo Rossi', 'Hilltop Cafe': 'Mira Chen', 'The Rusty Anchor': "Danny O'Neil", 'Sunny Farm': 'Rosa Delgado', 'Willow Clinic': 'Aisha Rahman' };
    for (const [ln, on] of Object.entries(owners)) { const l = this.world.findLocation(ln); if (l && !l.owner) l.owner = on; }
  }

  addAgent(d) {
    const home = this.world.findLocation(d.home);
    const spot = d.x != null ? { x: d.x, y: d.y } : home ? this.world.randomSpotIn(home) : this.world.nearestWalkable(30, 20);
    const job = d.job && d.job.title !== 'Unemployed' ? d.job : JOBS[d.name] || d.job || { title: 'Unemployed', place: '', wage: 0 };
    const a = {
      id: d.id || newId('a'), name: clean(d.name, 40) || 'Stranger', age: d.age || 30, gender: d.gender || null,
      persona: clean(d.persona, 600), home: home?.name || 'Guest House', goal: clean(d.goal, 300), aspiration: d.aspiration || '', question: '',
      tier: d.tier || null, colors: d.colors || randomColors(),
      x: spot.x + 0.5, y: spot.y + 0.5, path: [], dir: 'down', moving: false,
      action: null, thought: '', memories: [], bank: [],
      inventory: (d.inventory || []).map((i) => ({ carry: true, satisfies: {}, ...i })), knownItems: [],
      needs: d.needs || freshNeeds(), health: d.health ?? 100, money: d.money ?? 30, job, rel: {},
      genes: { ...randomGenes(), ...(d.genes || {}) }, learn: d.learn || freshLearn(), fitness: null, generation: d.generation || 1, parents: d.parents || [],
      romance: { partner: null, status: null }, exes: [], record: { crimes: 0, fines: 0 }, jailedUntil: 0,
      seenNews: [], readBooks: [], recentSaid: [], recentActs: [], punishedAt: {},
      thinking: false, convoId: null, talkTarget: null, talkTopic: null, talkPurpose: null, pendingGive: null, pendingPay: 0,
      lastTalk: {}, say: null, sayUntil: 0, asleep: false, failCount: 0, retryAt: 0, critAt: {}, lastCreateAt: -1e9, lastReflectAt: this.time - Math.random() * 400,
      stats: { earned: 0, spent: 0, created: 0, destroyed: 0, talks: 0, stolen: 0, donated: 0, papers: 0, prayers: 0, read: 0, searches: 0, hospital: 0, punished: 0 },
    };
    if (a.goal) this.remember(a, `My goal: ${a.goal}`, 5);
    this.addBank(a, `I am ${a.name}, ${a.age}${a.gender ? `, ${a.gender}` : ''}. ${a.persona}`, 5, 'core');
    this.agents.push(a);
    return a;
  }

  addItem(d) {
    const it = {
      id: newId('it'), name: clean(d.name, 40) || 'Thing', emoji: firstEmoji(d.emoji) || '🎁',
      desc: clean(d.desc, 300), x: d.x, y: d.y, hidden: !!d.hidden, knownBy: [],
      carry: d.carry !== false, satisfies: clampSatisfies(d.satisfies), cash: Math.max(0, Number(d.cash) || 0), madeBy: d.madeBy || null,
    };
    this.world.items.push(it);
    return it;
  }

  agent(id) { return this.agents.find((a) => a.id === id); }
  agentByName(name) {
    if (!val(name) || typeof name !== 'string') return null;
    const n = name.toLowerCase().replace(/^(dr\.?|mayor|sheriff)\s+/, '').trim();
    return this.agents.find((a) => a.name.toLowerCase() === n) ||
      this.agents.find((a) => a.name.toLowerCase().split(' ')[0] === n.split(' ')[0]) ||
      this.agents.find((a) => n.length > 3 && a.name.toLowerCase().split(' ').slice(-1)[0] === n.split(' ').slice(-1)[0]);
  }
  locOf(a) { return this.world.locationAt(a.x | 0, a.y | 0); }
  locName(a) { return this.locOf(a)?.name || 'outdoors'; }
  at(a) { const l = this.locOf(a); return l ? `at ${l.name}` : 'outdoors'; }
  witnesses(a, r = 5) { return this.agents.filter((b) => b !== a && !b.asleep && Math.hypot(b.x - a.x, b.y - a.y) < r); }

  remember(a, text, imp = 1) {
    a.memories.push({ t: this.time, text: clean(text, 700), imp });
    if (imp >= 5) this.addBank(a, text, imp, 'core');
    if (a.memories.length > MAX_MEMORIES) {
      let idx = 0, best = Infinity;
      for (let i = 0; i < a.memories.length - 12; i++) { const s = a.memories[i].imp * 10 + i * 0.1; if (s < best) { best = s; idx = i; } }
      a.memories.splice(idx, 1);
    }
  }
  log(type, text, ids = []) {
    const e = { t: this.time, type, text, ids };
    this.logs.push(e);
    if (this.logs.length > 4000) this.logs.splice(0, 800);
    Logger.push(fmtTime(this.time).str, type, text);
    this.onLog?.(e);
  }

  // ---------------- god powers ----------------
  setGoal(a, goal) {
    a.goal = clean(goal, 300);
    if (a.goal) this.remember(a, `New goal (a strong inner calling): ${a.goal}`, 5);
    this.log('god', `🎯 ${a.name}'s goal: ${a.goal || '(cleared)'}`, [a.id]);
    this.interrupt(a);
  }
  whisper(a, text) {
    this.remember(a, `A sudden thought: ${text}`, 5);
    this.log('god', `✨ Whispered to ${a.name}: "${clean(text, 160)}"`, [a.id]);
    this.interrupt(a);
  }
  broadcast(text, type = 'event') {
    for (const a of this.agents) {
      this.remember(a, `Town news: ${text}`, 4);
      if (!a.convoId && !a.asleep && type === 'event') this.interrupt(a, Math.random() * 20);
    }
    this.log(type, `📣 ${text}`);
  }
  giveMoney(a, amt) {
    a.money = Math.round((a.money + amt) * 100) / 100;
    this.remember(a, amt >= 0 ? `I mysteriously found $${amt}!` : `I mysteriously lost $${-amt}.`, 3);
    this.log('money', `${amt >= 0 ? '💸' : '🕳️'} God ${amt >= 0 ? 'gave' : 'took'} $${Math.abs(amt)} ${amt >= 0 ? 'to' : 'from'} ${a.name} (now $${a.money})`, [a.id]);
  }
  setWeather(kind, hours = 6) {
    this.weather = { kind, until: this.time + hours * 60 };
    const txt = { sunny: '☀️ The sun is out.', cloudy: '☁️ Clouds roll in.', rain: '🌧️ It started raining.', storm: '⛈️ A thunderstorm hits the town!', snow: '❄️ It is snowing!' }[kind];
    for (const a of this.agents) this.remember(a, `Weather: ${txt}`, 1);
    this.log('weather', txt);
  }
  interrupt(a, delayMin = 0) {
    if (a.convoId || a.action?.forced) return;
    if (a.action?.gather && a.action.started && !a.action.completed) this.finishGather(a, this.time - (a.action.until - a.action.minutes));
    a.path = [];
    a.talkTarget = null;
    if (a.action) { a.action.started = true; a.action.completed = true; a.action.until = this.time + delayMin; }
    a.retryAt = 0;
    a.asleep = false;
  }
  removeAgent(a) {
    if (a.convoId) this.endConvo(this.convos.find((c) => c.id === a.convoId), true);
    this.agents = this.agents.filter((x) => x !== a);
    const P = this.partnerOf(a); if (P) P.romance = { partner: null, status: null };
    this.log('god', `💨 ${a.name} vanished from town.`);
  }

  // ---------------- main loop ----------------
  update(dt) {
    if (this.speed <= 0) return;
    this.now += dt;
    const dGame = dt * GAME_MIN_PER_SEC * this.speed;
    this.time += dGame;
    const walkSpeed = 3.5 * Math.min(this.speed, 4);
    for (const a of [...this.agents]) { this.updateNeeds(a, dGame); if (!a.dead) this.updateAgent(a, dt, walkSpeed); }
    for (const cv of [...this.convos]) this.updateConvo(cv);
    this._scanTimer -= dt;
    if (this._scanTimer <= 0) { this._scanTimer = 0.5; this.scan(); }
    if (this.time >= this._tickAt) { this._tickAt = this.time + 10; this.tick(); }
    if (this.time > this.weather.until) {
      const r = Math.random();
      this.setWeather(r < 0.45 ? 'sunny' : r < 0.7 ? 'cloudy' : r < 0.92 ? 'rain' : 'storm', 3 + Math.random() * 8);
    }
    if (this.director.enabled && !this.director.busy && this.time > this.director.nextAt) this.runDirector();
  }

  // every 10 game minutes
  tick() {
    const tm = fmtTime(this.time);
    for (const a of [...this.agents]) this.survive(a);
    if (this._econHour !== Math.floor(this.time / 60)) {
      this._econHour = Math.floor(this.time / 60);
      for (const a of this.agents) this.updateFitness(a);
      this.economyHour();
      this.exportsHour(); this.expireOrders(); this.reassignHomes();
      if (this._econHour % 2 === 0) this.shopContracts();
      if (tm.hh === 17) this.chapelService();
      if (tm.hh === 7) this.jobOffice();
    }
    if (this.gov && this.time >= this.gov.nextElection) this.holdElection();
    if (this.gov && !this.leader() && this.agents.length) this.makeLeader([...this.agents].sort((x, y) => (y.genes.ambition || 0) - (x.genes.ambition || 0))[0]);
    if (tm.hh === 6 && this._birthDay !== tm.day) { this._birthDay = tm.day; this.dailyBirths(); }
    const curfew = this.lawFor('curfew');
    if (curfew && (tm.hh >= 23 || tm.hh < 6)) {
      for (const a of this.agents) {
        if (a.asleep || a.curfewDay === tm.day || !this.outdoors(a)) continue;
        const seen = this.witnesses(a, 6);
        if (seen.length) { a.curfewDay = tm.day; this.crime(a, 'curfew', seen); }
      }
    }
    if (AI.stats.queued < 3) {
      const r = this.agents.find((a) => !a.thinking && !a.convoId && !a.asleep && !a.reflecting && this.time - a.lastReflectAt > 480);
      if (r) this.reflect(r);
    }
  }

  usingObj(a) {
    const ac = a.action;
    if (!ac?.obj || !ac.started || ac.completed || this.time >= ac.until || a.convoId) return null;
    const s = ac.obj.stand;
    return Math.hypot(s.x + 0.5 - a.x, s.y + 0.5 - a.y) < 1.6 ? ac.obj : null;
  }
  usingTV(a) { return this.usingObj(a)?.type === 'tv'; }
  outdoors(a) { const l = this.locOf(a); return !l || (['park', 'plaza', 'farm', 'custom'].includes(l.kind) && !l.walls); }

  updateNeeds(a, dGame) {
    const h = dGame / 60, n = a.needs;
    const slow = a.convoId || a.thinking ? 0.2 : 1;
    const starving = n.hunger <= 0 || n.thirst <= 0;
    for (const k of NEED_KEYS) {
      let d = NEEDS[k].decay * h * slow;
      if (a.asleep && (k === 'hunger' || k === 'thirst' || k === 'fun')) d *= 0.4;
      if (k === 'energy' && a.asleep) d = 0;
      if (k === 'energy' && starving) d *= 3;
      if (k === 'social' && a.convoId) d = 0;
      if (k === 'romance' && a.romance?.partner) d *= 0.5;
      n[k] -= d;
    }
    const o = this.usingObj(a);
    if (o) {
      const aff = AFFORD[o.type];
      if (aff.instant && !a.action.instantDone) { a.action.instantDone = true; if (a.action.noFood) { /* empty fridge */ } else for (const [k, v] of Object.entries(aff.instant)) n[k] += v; }
      const tvDead = o.type === 'tv' && this.time < this.powerOutUntil;
      for (const k of NEED_KEYS) if (aff[k] && !tvDead && !(a.action.noFood && (k === 'hunger' || k === 'thirst') && (o.type === 'fridge' || o.type === 'stove'))) n[k] += aff[k] * h;
      if (o.type === 'tv' && !tvDead && this.time >= (a.action.nextNewsAt || 0)) { a.action.nextNewsAt = this.time + 50; this.watchNews(a); }
    } else if (a.asleep) n.energy += 8 * h;
    if (a.action?.work && a.action.started && !a.action.completed && this.time < a.action.until && !a.convoId && this.locName(a) === a.job.place) {
      const prod = 0.4 + 0.6 * mood(n).score / 100;
      const gross = a.job.wage ? this.payWage(a, a.job.wage * h * prod) : 0;
      const tax = gross * (this.gov?.taxRate || 0);
      a.money += gross - tax; if (this.gov) this.gov.treasury += tax;
      a.action.earned = (a.action.earned || 0) + gross - tax; a.stats.earned += gross - tax;
      n.fun -= 2 * h; n.energy -= 1.5 * h;
    }
    if (!a.asleep && this.outdoors(a) && (this.weather.kind === 'rain' || this.weather.kind === 'storm')) { n.fun -= 4 * h; n.energy -= 1 * h; }
    for (const k of NEED_KEYS) n[k] = Math.max(0, Math.min(100, n[k]));
    a.money = Math.round(a.money * 100) / 100;
    this.updateHealth(a, h);
    if (a.dead) return;

    if (n.energy <= 0 && !a.asleep && !a.convoId && !a.action?.forced) {
      a.path = []; a.talkTarget = null;
      a.action = { text: 'Passed out from exhaustion', emoji: '😵', minutes: 150, started: true, until: this.time + 150, passedOut: true, forced: true };
      a.asleep = true;
      this.remember(a, 'I passed out from exhaustion in public. How embarrassing!', 4);
      for (const w of this.witnesses(a)) this.remember(w, `I saw ${a.name} collapse from exhaustion ${this.at(a)}!`, 4);
      this.log('need', `😵 ${a.name} passed out from exhaustion ${this.at(a)}!`, [a.id]);
      return;
    }
  }

  updateAgent(a, dt, walkSpeed) {
    if (a.say && this.now > a.sayUntil) a.say = null;
    if (a.convoId) { a.moving = false; return; }

    if (a.path.length) {
      const nd = a.path[0];
      const tx = nd.x + 0.5, ty = nd.y + 0.5;
      const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
      const step = walkSpeed * dt * (a.needs.energy < 15 || a.health < 30 ? 0.6 : 1);
      if (Math.abs(dx) > Math.abs(dy)) a.dir = dx > 0 ? 'right' : 'left'; else if (d > 0.01) a.dir = dy > 0 ? 'down' : 'up';
      if (d <= step) { a.x = tx; a.y = ty; a.path.shift(); } else { a.x += (dx / d) * step; a.y += (dy / d) * step; }
      a.moving = true;
      if (a.talkTarget && a.path.length) {
        const b = this.agent(a.talkTarget);
        if (b && Math.hypot(b.x - a.x, b.y - a.y) < 1.5) a.path = [];
      }
      return;
    }
    a.moving = false;

    if (a.talkTarget) {
      const b = this.agent(a.talkTarget);
      if (!b || this.now > a.talkGiveUpAt) {
        if (b) this.remember(a, `I tried to find ${b.name} but couldn't reach them.`, 1);
        a.talkTarget = null; a.talkPurpose = null;
        if (a.action) { a.action.started = true; a.action.until = this.time; }
        return;
      }
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist < 1.8 && !b.convoId) {
        const purpose = a.talkPurpose;
        a.talkTarget = null; a.talkPurpose = null;
        if (purpose === 'steal') { this.steal(a, b, a.stealWhat); if (a.action) { a.action.started = true; a.action.until = this.time + 5; } return; }
        if (purpose === 'rob') { this.rob(a, b); if (!b.asleep && !b.action?.forced) this.startConvo(b, a, `${a.name} just robbed you!`, 'confront'); return; }
        if (this.convos.length >= this.maxConvos + 2) return;
        if (b.asleep && !b.action?.forced) {
          b.asleep = false; if (b.action) b.action.until = this.time;
          this.remember(b, `${a.name} woke me up!`, 2);
          this.log('action', `⏰ ${a.name} woke up ${b.name}`, [a.id, b.id]);
        }
        if (purpose === 'breakup' && a.romance?.partner === b.id) this.breakUp(a, b, `${a.name} ended it.`);
        if (purpose === 'beg') this.crime(a, 'beg', [b, ...this.witnesses(a, 5)]);
        this.startConvo(a, b, a.talkTopic, purpose);
        return;
      }
      if (!b.convoId && (!a._repathAt || this.now > a._repathAt)) {
        a._repathAt = this.now + 1;
        a.path = findPath(this.world, a.x, a.y, b.x, b.y) || [];
      }
      return;
    }

    if (a.action && !a.action.started) {
      a.action.started = true;
      a.action.until = this.time + a.action.minutes;
      this.onArrive(a);
    }
    if (a.action?.started && !a.action.completed && this.time >= a.action.until) {
      a.action.completed = true;
      this.onComplete(a);
    }
    const ac = a.action;
    a.asleep = !!(ac?.started && !ac.completed && this.time < ac.until && (ac.passedOut || ac.hospital || (ac.obj?.type === 'bed' && /sleep|nap|rest|bed/i.test(ac.text)) || /\bsleep|\bnap\b/i.test(ac.text) || ac.emoji === '😴'));

    if (!a.thinking && this.now >= a.retryAt && (!a.action || this.time >= a.action.until)) this.decide(a);
  }

  // ---------------- actions & transactions ----------------
  onArrive(a) {
    const ac = a.action, loc = this.locOf(a);
    const o = ac.obj;
    if (o && (o.type === 'fridge' || o.type === 'stove')) {
      const kitchen = o.loc || loc;
      let ok;
      if (kitchen?.kind === 'home') {
        if (this.canUseHome(a, kitchen)) {
          const st = (kitchen.storage ||= {});
          for (const k of ['crops', 'fish']) { const q = this.resCount(a, k); if (q > 0) { this.takeRes(a, k, q); st[k] = (st[k] || 0) + q; } }
        }
        const hasStove = this.world.furniture.some((f) => f.type === 'stove' && this.world.locationAt(f.x, f.y) === kitchen);
        ok = o.type === 'stove' ? this.pantryCook(kitchen, a) : this.pantryEat(kitchen) || (hasStove && this.pantryCook(kitchen, a));
      }
      else if (kitchen && (kitchen.owner === a.name || a.job.place === kitchen.name)) { ok = this.market.stock.crops >= 1 || this.market.stock.fish >= 1; if (ok) { if (this.market.stock.crops >= 1) this.market.stock.crops--; else this.market.stock.fish--; } }
      else ok = false;
      if (!ok) {
        ac.noFood = true; ac.until = Math.min(ac.until, this.time + 5);
        if (kitchen?.kind !== 'home') this.remember(a, `I can't just eat from the kitchen at ${kitchen?.name} – I should buy food there or eat at home.`, 2); else this.remember(a, `The pantry at ${kitchen.name} is EMPTY – no food at home! I must gather food (berries, fish, crops), buy some, and "store" it at home.`, 4);
        this.log('econ', kitchen?.kind === 'home' ? `🧊 ${a.name} found the pantry empty at ${kitchen.name}` : `🚫 ${a.name} isn't allowed to cook in ${kitchen?.name}'s kitchen`, [a.id]);
      }
    }
    if (o) {
      const cost = AFFORD[o.type].cost || 0;
      if (cost) {
        if (a.money < cost) { this.remember(a, `I couldn't afford the ${o.type} ($${cost}).`, 2); ac.obj = null; }
        else { a.money -= cost; a.stats.spent += cost; this.townFund += cost; }
      }
      if (loc?.kind === 'home' && loc.name !== a.home) {
        const owners = this.agents.filter((b) => b.home === loc.name && b !== a);
        const partnerHome = owners.some((b) => b.id === a.romance?.partner);
        if (owners.length && !partnerHome) {
          this.log('action', `🫣 ${a.name} is using ${owners[0].name.split(' ')[0]}'s ${FURN[o.type]?.label?.toLowerCase() || o.type} without asking`, [a.id]);
          const present = owners.filter((ow) => this.locOf(ow) === loc);
          for (const ow of present) { this.remember(ow, `${a.name} came into my home and used my ${o.type} without asking!`, 3); this.bump(ow, a, -6); }
          this.crime(a, 'trespass', present);
        }
      }
    }
    if (ac.take) this.takeFromStorage(a, ac.take, ac.qty);
    // shop owners restock their own business with inputs they carry
    if (loc?.owner === a.name && loc.shop?.length) {
      const needed = new Set(loc.shop.flatMap((m) => Object.keys(this.shopPrice(m).inp)));
      const moved = [];
      for (const k of needed) { const q = this.resCount(a, k); if (q > 0) { this.takeRes(a, k, q); this.market.stock[k] += q; moved.push(`${q} ${k}`); for (const o of this.market.orders) if (o.by === a.id && o.res === k && o.forShop) { const c = Math.min(o.qty, q); o.qty -= c; a.money += c * o.price; } } }
      this.market.orders = this.market.orders.filter((o) => o.qty > 0);
      if (moved.length) { this.updatePrices(); this.log('econ', `🏪 ${a.name} restocked ${loc.name} with ${moved.join(', ')}`, [a.id]); }
    }
    if (ac.buy) this.buy(a, ac.buy, loc, ac.qty);
    if (ac.order) { if (this.atExchange(a)) this.postOrder(a, ac.order); else this.remember(a, 'I need to be at the exchange to post an order.', 1); }
    if (ac.sell) this.sellToMarket(a, ac.sell.item, ac.sell.qty);
    if (ac.consume) this.consume(a, ac.consume);
    if (ac.pickUp) this.tryPickUp(a, ac.pickUp);
    if (ac.drop) this.drop(a, ac.drop);
    if (ac.destroy) this.destroy(a, ac.destroy);
    if (ac.donate) this.donate(a, ac.donate.to, ac.donate.amount);
    if (ac.read) this.read(a, ac.read);
    if (ac.search) this.search(a, ac.search);
    if (ac.pray) this.pray(a, ac.pray);
  }

  onComplete(a) {
    const ac = a.action;
    if (ac.commission) this.doCommission(a, ac.commission);
    if (ac.gather) this.finishGather(a, ac.minutes);
    if (ac.store) this.store(a, ac.store);
    if (ac.craft) this.craft(a, ac.craft);
    if (ac.create) this.create(a, ac.create);
    if (ac.write) this.write(a, ac.write);
    if (ac.earned > 0.5) {
      this.log('money', `💼 ${a.name} earned $${ac.earned.toFixed(0)} (after ${Math.round((this.gov?.taxRate || 0) * 100)}% tax) working at ${a.job.place}`, [a.id]);
      this.remember(a, `I worked and earned $${ac.earned.toFixed(0)}.`, 1);
    }
    if (a.jailedUntil && this.time >= a.jailedUntil) { a.jailedUntil = 0; this.log('law', `🔓 ${a.name} was released from jail`, [a.id]); }
  }

  invFull(a) { return a.inventory.length >= INV_LIMIT; }

  buy(a, name, loc, qty = 1) {
    const rk = this.resName(name);
    if (rk && (loc?.name === EXCHANGE || loc?.kind === 'shop') && !(loc?.shop || []).some((m) => m.name.toLowerCase() === String(name).toLowerCase())) return this.buyFromMarket(a, rk, qty);
    const shop = loc?.shop?.length ? loc : null;
    if (!shop) { this.remember(a, `I wanted to buy ${name}, but there's no shop here.`, 1); return; }
    const m = byName(shop.shop, name);
    if (!m) { this.remember(a, `${shop.name} doesn't sell "${name}".`, 1); return; }
    const sp = this.shopPrice(m);
    if (!this.shopHasInputs(sp.inp)) {
      this.remember(a, `${shop.name} is SOLD OUT of ${m.name} – the exchange has no ${Object.keys(sp.inp).join('/')}. Someone needs to gather and sell some!`, 3);
      this.log('econ', `🚫 ${m.emoji} ${m.name} sold out at ${shop.name} (no ${Object.keys(sp.inp).map((k) => RES[k].emoji).join('')} at the exchange)`, [a.id]);
      return;
    }
    const price = shop.saleUntil > this.time ? Math.ceil(sp.price / 2) : sp.price;
    if (a.money < price) {
      this.remember(a, `I couldn't afford ${m.emoji} ${m.name} ($${price}) – I only have $${a.money.toFixed(0)}.`, 2);
      this.log('money', `😬 ${a.name} couldn't afford ${m.emoji} ${m.name} at ${shop.name}`, [a.id]);
      return;
    }
    if (this.invFull(a)) { this.remember(a, `My bag is full (${INV_LIMIT} items), I couldn't buy ${m.name}.`, 2); return; }
    a.money -= price; a.stats.spent += price;
    a.inventory.push({ name: m.name, emoji: m.emoji, desc: m.desc || `Bought at ${shop.name}`, satisfies: { ...m.satisfies }, carry: true });
    const owner = this.agentByName(shop.owner);
    for (const [k, q] of Object.entries(sp.inp)) this.market.stock[k] -= q;
    this.gov.treasury += sp.cost;
    const margin = price - sp.cost;
    if (owner && owner !== a) { owner.money += margin; owner.stats.earned += margin; } else this.townFund += margin;
    this.updatePrices();
    this.recordTrade(shop.name, a.name, m.name, price);
    this.remember(a, `I bought ${m.emoji} ${m.name} for $${price} at ${shop.name}.`, 1);
    this.log('buy', `🛍️ ${a.name} bought ${m.emoji} ${m.name} for $${price} at ${shop.name}${owner && owner !== a ? ` (→ ${owner.name.split(' ')[0]})` : ''}`, [a.id]);
  }

  consume(a, name) {
    const it = byName(a.inventory, name) || a.inventory.find((i) => i.res && i.res === this.resName(name));
    if (!it) {
      const here = this.locOf(a);
      if (/meal|food|bread|breakfast|lunch|dinner|snack|leftover/i.test(String(name)) && this.canUseHome(a, here) && this.pantryEat(here)) {
        a.needs.hunger = Math.min(100, a.needs.hunger + 45);
        this.log('consume', `😋 ${a.name} ate a stored meal at ${here.name}`, [a.id]);
      }
      return;
    }
    const sat = it.satisfies || {};
    if (it.res && Object.keys(sat).length) {
      const [key, per] = Object.entries(sat).sort((x, y) => y[1] - x[1])[0];
      const units = Math.max(1, Math.min(this.resCount(a, it.res), Math.ceil((85 - a.needs[key]) / per)));
      this.takeRes(a, it.res, units);
      for (const [k, v] of Object.entries(sat)) a.needs[k] = Math.max(0, Math.min(100, a.needs[k] + v * units));
      this.remember(a, `I ate ${units} ${it.res}.`, 1);
      this.log('consume', `😋 ${a.name} ate ${units} ${it.emoji} ${it.res} (${key} now ${Math.round(a.needs[key])})`, [a.id]);
      return;
    }
    const healing = /medicine|bandage/i.test(it.name) || it.heal;
    if (!Object.keys(sat).length && !/lottery/i.test(it.name) && !healing) { this.remember(a, `I can't eat or use up ${it.name}.`, 1); return; }
    for (const [k, v] of Object.entries(sat)) a.needs[k] = Math.max(0, Math.min(100, a.needs[k] + v));
    if (healing) a.health = Math.min(100, a.health + (it.heal || (/medicine/i.test(it.name) ? 25 : 10)));
    if (it.res) this.takeRes(a, it.res, 1); else a.inventory = a.inventory.filter((i) => i !== it);
    let extra = '';
    if (/lottery/i.test(it.name)) {
      if (Math.random() < 0.12) { a.money += 75; extra = ' and WON $75! 🎉'; this.remember(a, 'I won $75 on a lottery ticket!!', 4); for (const w of this.witnesses(a)) this.remember(w, `${a.name} won the lottery!`, 3); }
      else extra = ' – no luck';
    }
    this.remember(a, `I used up ${it.emoji} ${it.name}${extra}.`, 1);
    this.log('consume', `😋 ${a.name} consumed ${it.emoji} ${it.name} ${satisfiesText(sat)}${healing ? ' ❤️‍🩹' : ''}${extra}`, [a.id]);
  }

  tryPickUp(a, name) {
    const near = this.world.items.filter((i) => Math.hypot(i.x + 0.5 - a.x, i.y + 0.5 - a.y) < 6);
    const it = byName(near, name);
    if (!it) return;
    if (!it.carry) { this.remember(a, `${it.name} is too big to carry.`, 1); return; }
    if (it.cash) {
      a.money += it.cash;
      this.log('money', `💰 ${a.name} found $${it.cash} in ${it.emoji} ${it.name}`, [a.id]);
      this.remember(a, `I found $${it.cash} in ${it.name}.`, 3);
      it.cash = 0;
    }
    if (this.invFull(a)) { this.remember(a, `My bag is full, I couldn't pick up ${it.name}.`, 2); this.log('item', `🎒 ${a.name}'s bag is full – left ${it.emoji} ${it.name}`, [a.id]); return; }
    this.world.items = this.world.items.filter((i) => i !== it);
    a.inventory.push({ name: it.name, emoji: it.emoji, desc: it.desc, satisfies: it.satisfies || {}, carry: true, madeBy: it.madeBy });
    this.remember(a, `I picked up ${it.emoji} ${it.name}.`, 3);
    for (const w of this.witnesses(a)) this.remember(w, `I saw ${a.name} pick up ${it.emoji} ${it.name}.`, 2);
    this.log('item', `🤲 ${a.name} picked up ${it.emoji} ${it.name}`, [a.id]);
  }

  drop(a, name) {
    const it = byName(a.inventory, name);
    if (!it) return;
    a.inventory = a.inventory.filter((i) => i !== it);
    const spot = this.world.nearestWalkable(a.x | 0, a.y | 0);
    const w = this.addItem({ ...it, x: spot.x, y: spot.y });
    w.knownBy.push(a.id);
    this.log('item', `⬇️ ${a.name} left ${it.emoji} ${it.name} ${this.at(a)}`, [a.id]);
  }

  destroy(a, name) {
    const why = a.action?.text || '';
    let target = byName(a.inventory, name), what, ownedByOther = false;
    if (target) { a.inventory = a.inventory.filter((i) => i !== target); what = `${target.emoji} ${target.name}`; }
    else {
      const near = this.world.items.filter((i) => Math.hypot(i.x + 0.5 - a.x, i.y + 0.5 - a.y) < 4);
      target = byName(near, name);
      if (target) { this.world.items = this.world.items.filter((i) => i !== target); what = `${target.emoji} ${target.name}`; ownedByOther = !!target.madeBy && target.madeBy !== a.name; }
      else {
        const t = normUse(name) || String(name).toLowerCase();
        const f = this.world.furniture.find((q) => q.type === t && BREAKABLE.includes(t) && Math.hypot(q.x + 0.5 - a.x, q.y + 0.5 - a.y) < 3.5);
        if (!f) return;
        this.world.furniture = this.world.furniture.filter((q) => q !== f);
        this.world.dirty = true; this.world.rebuildBlocked();
        what = `the ${FURN[f.type].label.toLowerCase()}`; ownedByOther = true;
      }
    }
    a.stats.destroyed++;
    const wit = this.witnesses(a);
    this.remember(a, `I destroyed ${what} (${why}).`, 3);
    for (const w of wit) this.remember(w, `I watched ${a.name} destroy ${what} ${this.at(a)}!`, 3);
    this.log('destroy', `💥 ${a.name} destroyed ${what} ${this.at(a)} – "${why}"`, [a.id]);
    if (ownedByOther) this.crime(a, 'destroy', wit);
  }

  create(a, spec) {
    if (typeof spec === 'string') spec = { name: spec };
    const name = clean(spec?.name, 40);
    if (!name) return;
    if (this.recipeFor(name) && this.world.furniture.some((f) => f.type === this.recipeFor(name)[1].at && Math.hypot(f.x + 0.5 - a.x, f.y + 0.5 - a.y) < 2.5)) return this.craft(a, name);
    if (this.time - a.lastCreateAt < 60) { this.remember(a, `I'm too tired to make another thing so soon.`, 1); return; }
    if (this.world.items.length >= MAX_WORLD_ITEMS) { this.remember(a, 'The town is too cluttered to make anything new.', 1); return; }
    a.lastCreateAt = this.time;
    a.needs.energy = Math.max(0, a.needs.energy - 5);
    a.stats.created++;
    const item = { name, emoji: firstEmoji(spec.emoji) || '✨', desc: clean(spec.desc || `Made by ${a.name}`, 240), satisfies: clampSatisfies(spec.satisfies), carry: spec.carry !== false, madeBy: a.name, value: Math.round((4 + Math.random() * 6 + (a.genes?.curiosity ?? 0.5) * 6) * 100) / 100 };
    if (item.carry && !this.invFull(a)) a.inventory.push(item);
    else { const spot = this.world.nearestWalkable(a.x | 0, a.y | 0); const w = this.addItem({ ...item, x: spot.x, y: spot.y }); w.knownBy.push(a.id); }
    this.remember(a, `I created ${item.emoji} ${item.name}: ${item.desc}`, 3);
    for (const w of this.witnesses(a)) this.remember(w, `I saw ${a.name} make ${item.emoji} ${item.name}.`, 2);
    a.say = `✨${item.emoji}`; a.sayUntil = this.now + 3;
    this.log('create', `✨ ${a.name} created ${item.emoji} ${item.name}${Object.keys(item.satisfies).length ? ` [${satisfiesText(item.satisfies)}]` : ''} – ${item.desc}`, [a.id]);
  }

  watchNews(a) {
    if (this.time < this.powerOutUntil) return;
    const n = News.pickFor(a);
    if (!n) return;
    this.remember(a, `On TV (${n.source}${n.cat === 'ai-research' ? ', AI research' : ''}): "${n.title}"${n.desc ? ` – ${n.desc.slice(0, 160)}` : ''}`, 3);
    a.say = '📺'; a.sayUntil = this.now + 2;
    this.log('tv', `📺 ${a.name} saw on TV: ${n.title} (${n.source})`, [a.id]);
  }

  scan() {
    for (const a of this.agents) {
      if (a.asleep) continue;
      for (const it of this.world.items) {
        if (it.knownBy.includes(a.id)) continue;
        const r = it.hidden ? 1.6 : 4.5;
        if (Math.hypot(it.x + 0.5 - a.x, it.y + 0.5 - a.y) <= r) this.discover(a, it);
      }
    }
    if (this.convos.length >= this.maxConvos) return;
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      if (!this.free(a)) continue;
      for (let j = i + 1; j < this.agents.length; j++) {
        const b = this.agents[j];
        if (!this.free(b)) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) > 2.2) continue;
        const last = Math.max(a.lastTalk[b.id] ?? -1e9, b.lastTalk[a.id] ?? -1e9);
        if (this.time - last < 180) continue;
        const chance = ((a.genes.sociability + b.genes.sociability) / 2) * ((a.needs.social < 40 || b.needs.social < 40) ? 0.4 : 0.15);
        if (Math.random() < chance) { this.startConvo(a, b, null, 'chat'); return; }
      }
    }
  }
  free(a) { return !a.convoId && !a.asleep && !a.talkTarget && !a.action?.forced; }

  discover(a, it) {
    it.knownBy.push(a.id);
    const where = this.world.locationAt(it.x, it.y)?.name || 'outdoors';
    this.remember(a, `I discovered ${it.emoji} "${it.name}" at ${where}: ${it.desc}${it.carry ? '' : ' (too big to carry)'}`, 4);
    a.say = `❗${it.emoji}`; a.sayUntil = this.now + 2.5;
    this.log('discover', `🔎 ${a.name} discovered ${it.emoji} ${it.name} at ${where}`, [a.id]);
    if (a.action && !a.convoId && !a.action.completed && !a.action.forced) a.action.until = Math.min(a.action.until ?? this.time, this.time + 10);
  }

  // ---------------- planning ----------------
  memoryContext(a, nRecent = 8) {
    return a.memories.slice(-nRecent).map((m) => `- [${fmtTime(m.t).str}] ${m.text}`).join('\n') || '- (nothing yet)';
  }
  needsText(a) {
    return NEED_KEYS.map((k) => {
      const v = Math.round(a.needs[k]), w = warnAt(a, k);
      return `${NEEDS[k].label} ${v}${v < w * 0.6 ? ' ⚠️URGENT' : v < w ? ' (act soon)' : ''}`;
    }).join(', ');
  }
  invText(a) {
    return a.inventory.map((i) => `${i.emoji} ${i.name}${Object.keys(i.satisfies || {}).length ? ` [${satisfiesText(i.satisfies)}]` : ''}`).join(', ') || 'empty';
  }
  peopleText(a) {
    return this.agents.filter((b) => b !== a).map((b) => {
      const close = Math.hypot(b.x - a.x, b.y - a.y) < 6 ? ' NEAR YOU' : '';
      const r = a.rel[b.id];
      return `${b.name}${sym(b)} [${this.relType(a, b)}${r ? ` ${Math.round(r.score)}${r.attraction > 10 ? `, attraction ${Math.round(r.attraction)}` : ''}` : ''}] at ${this.locName(b)}${close}: ${b.asleep ? 'sleeping' : b.convoId ? 'chatting' : b.action?.text || 'idle'}`;
    }).join('; ');
  }
  placesList() {
    return this.world.locations.map((l) => {
      const owners = this.agents.filter((x) => x.home === l.name).map((x) => x.name.split(' ')[0]);
      const n = this.agents.filter((x) => this.locOf(x) === l).length;
      return `${l.name}${owners.length ? `(home:${owners.join('/')})` : ''}${n ? `[${n}]` : ''}`;
    }).join('; ');
  }
  shopsText() {
    return this.world.locations.filter((l) => l.shop?.length).map((l) => {
      const sale = l.saleUntil > this.time;
      return `${l.name}${sale ? ' (50% SALE)' : ''}${l.owner ? ` [owner ${l.owner}]` : ''}: ` + l.shop.map((m) => { const sp = this.shopPrice(m); return `${m.name} ${this.shopHasInputs(sp.inp) ? `$${sale ? Math.ceil(sp.price / 2) : sp.price}` : 'SOLD OUT'}`; }).join(', ');
    }).join(' | ') || 'none';
  }

  async decide(a) {
    if (this.workRoutine(a)) return;
    a.thinking = true;
    const prev = a.action;
    const tm = fmtTime(this.time);
    try {
      if (!AI.enabled) throw new Error('offline');
      const md = mood(a.needs);
      const known = this.world.items.filter((i) => i.knownBy.includes(a.id))
        .map((i) => `${i.emoji} ${i.name} at ${this.world.locationAt(i.x, i.y)?.name || 'outdoors'}`).slice(-8).join('; ');
      const here = this.locOf(a);
      const g = this.gov;
      const isLeader = g?.leaderId === a.id;
      const P = this.partnerOf(a);
      const sys = `You control ${a.name}${a.gender ? ` (${a.gender}, ${a.age})` : ` (${a.age})`} in an open-ended society simulation. Persona: ${a.persona} Home: ${a.home}. Job: ${a.job.title}${a.job.place ? ` at ${a.job.place} ($${a.job.wage}/h)` : ''}.` +
        ` Innate temperament (genes): ${genesText(a.genes)}.` + (this.lore ? ` World facts: ${this.lore}` : '') +
        ' All residents are consenting adults (18+). This is a mature life simulation: crime, conflict, desire and romance are allowed; keep intimacy off-screen.' +
        ' Behave like a vivid, believable human with desires, flaws, morals and initiative. Avoid repeating yourself – try new things, ideas and people. Reply with ONLY one compact JSON object.';
      const user = `${(tm.hh >= 23 || tm.hh < 6) ? `⚠️ Late night – unless urgent, go home to ${a.home} and sleep (use bed) 360-480 min.\n` : ''}Time: Day ${tm.day}, ${pad(tm.hh)}:${pad(tm.mm)} (${partOfDay(tm.hh)}). Weather: ${this.weather.kind}.${this.time < this.powerOutUntil ? ' POWER OUTAGE.' : ''}
You are at ${here?.name || 'outdoors'}. Last activity: ${prev?.text || 'just woke up'}. Recent activities (don't repeat): ${(a.recentActs || []).slice(-5).join('; ') || 'none'}.
HEALTH ${Math.round(a.health)}/100 – needs at 0 damage health; below 15 you collapse (clinic bill $30)${this.mortality ? ' and you may DIE' : ''}. Mood ${md.face} ${md.score}. Money $${a.money.toFixed(0)}${a.money < 0 ? ' (IN DEBT)' : ''}.
Needs (100=fine): ${this.needsText(a)}
Inventory (${a.inventory.length}/${INV_LIMIT}): ${this.invText(a)}
Usable here: ${here ? this.world.objectsIn(here).filter((t) => AFFORD[t]).join(', ') || 'none' : 'none'}
Shops: ${this.shopsText()}
Places: ${this.placesList()}
People: ${this.peopleText(a)}
Romance: ${P ? `${this.relType(a, P)} ${P.name}` : 'single'}. Criminal record: ${a.record.crimes} offences.
Government: ${g ? `${g.title} ${this.leader()?.name || 'vacant'}${isLeader ? ' (YOU)' : ''}; laws: ${this.lawsText()}; tax ${Math.round(g.taxRate * 100)}%; treasury $${Math.round(g.treasury)}; election in ${((g.nextElection - this.time) / 1440).toFixed(1)} days; candidates: ${g.candidates.map((id) => this.agent(id)?.name).filter(Boolean).join(', ') || 'none'}` : 'none'}
${this.commissionsText(a) ? this.commissionsText(a) + '\n' : ''}🔎 You can search the internet ANYTIME from your phone with "search" – use it to learn new things, research prices, science, news, or for commissions.
Economy: ${this.economyText(a)}${!a.job.wage || /unemploy|retired/i.test(a.job.title) ? '\nYou have no wage – earn money by gathering resources and selling them at the exchange, crafting goods, trading, or finding a job/business.' : ''}${a.money < 10 ? '\n⚠️ You are nearly broke! Gather & sell, work, trade, beg, or… other options.' : ''}
Library: ${this.libraryText(a)}
Items you know: ${known || 'none'}
Goal: ${a.goal || '(none)'}. Aspiration: ${a.aspiration || '(none yet)'}.${a.question ? ` Research question: ${a.question}.` : ''}
Memory bank (important, long-term):
${this.bankText(a, 8)}
Recent memories:
${this.memoryContext(a, 8)}
Something on your mind: ${this.spark(a)}

Needs: hunger→fridge/stove at home or buy food then consume; thirst→sink/water/drinks; energy→bed; social→talk_to; fun→tv, arcade, piano, shelf, easel, whiteboard, read; hygiene→shower; romance→flirt, gifts, dates, intimacy (purpose "intimacy" with a willing adult you are attracted to - affairs have consequences). Earn money: work at your job place.
Reply JSON; include only keys you use:
{"thought":"","action":"max 8 words","emoji":"","destination":"exact place name","minutes":15-240,"use":"object","work":true,
"talk_to":"name","purpose":"chat|beg|propose|breakup|steal|rob|intimacy","steal_what":"money or item","give":"item","pay":0,
"buy":"menu item","consume":"item","pick_up":"item","drop":"item","destroy":"item/object",
"donate":{"to":"name|town|chapel","amount":0},"create":{"name":"","emoji":"","desc":"","carry":true,"satisfies":{"hunger":20}},
"write":{"kind":"paper|essay|poem|story|letter|manifesto","title":"","content":"2-4 sentences"},"read":"title or any","search":"internet query","pray":"prayer to God","run_for_office":true${isLeader ? ',\n"law":{"text":"","bans":"steal|rob|beg|destroy|trespass|curfew|none","fine":0},"repeal":"law number","tax":0-40,"grant":{"to":"name","amount":0}' : ''}}
Work keys: "work_on":"commission id" (paid real-world work for God).
Economy keys: "gather":"wood|stone|ore|crops|fish|berries|herbs" (go to a gathering ground), "craft":"recipe name", "sell":{"item":"","qty":0} (at the exchange; fills best buy orders first), "buy" + "qty" for raw resources at the exchange,
"post_order":{"side":"buy|sell","item":"resource","qty":5,"price":3} (set YOUR price; buys are delivered to your home storage), "store":"item|all" / "take":"item" (home storage – hoard when prices are low, sell when high),
"trade":{"with":"name","item":"","qty":1,"price":0}, "change_job":{"title":"Fisher|Lumberjack|Miner|Farmer|Forager|Herbalist|any","place":""}, "hire":{"who":"name","title":"","wage":6} (if you own a business).
God (the player) watches this world, reads every prayer and sometimes answers or intervenes – pray when desperate, grateful, guilty, curious about meaning, or before big decisions.
Stealing/robbing/begging may be illegal and punished; theft can still be tempting when desperate. You can research, publish papers, invent, campaign, form alliances, date, marry, worship, trade.`;
      const res = await AI.chat(this.tierFor(a), [{ role: 'system', content: sys }, { role: 'user', content: user }], 420, 0.95, 'decide');
      const j = parseJSON(res.content);
      if (!j || !j.action) throw new Error('bad json');
      a.failCount = 0;
      this.applyDecision(a, j, res.model);
    } catch (e) {
      a.failCount++;
      this.fallbackDecision(a);
      if (e.message !== 'offline') a.retryAt = this.now + Math.min(30, 2 ** a.failCount);
    } finally {
      a.thinking = false;
    }
  }

  applyDecision(a, j, model) {
    if (!this.agents.includes(a) || a.convoId || (a.action?.forced && this.time < a.action.until)) return;
    if (model !== 'instinct' && a.action?.instinct && !a.action.completed) return;
    let loc = this.world.findLocation(j.destination) || this.locOf(a) || this.world.findLocation(a.home);
    if (j.work === true && a.job.place) loc = this.world.findLocation(a.job.place) || loc;
    let minutes = Math.round(Number(j.minutes) || 45);
    let useType = normUse(j.use);
    const sleepy = /sleep|bed|nap/i.test(j.action);
    if (sleepy && !useType) useType = 'bed';
    if (sleepy && useType === 'bed' && (!val(j.destination) || /home|bed/i.test(j.destination))) loc = this.world.findLocation(a.home) || loc;
    if (val(j.read) && !useType) { useType = 'shelf'; if (!val(j.destination)) loc = this.world.findLocation('Town Library') || loc; }
    if (val(j.search) && !useType && !['library', 'lab', 'hall', 'cafe'].includes(loc?.kind)) useType = 'desk';
    if (val(j.pray) && !useType && loc?.kind === 'temple') useType = 'altar';
    minutes = Math.max(10, Math.min(sleepy ? 540 : 240, minutes));
    a.thought = clean(j.thought, 300);
    const create = val(j.create) && (typeof j.create === 'object' ? j.create.name : j.create) ? j.create : null;
    const write = val(j.write) && typeof j.write === 'object' && j.write.title ? j.write : (typeof j.write === 'string' && j.write.length > 4 ? { title: j.write } : null);
    const donate = val(j.donate) && typeof j.donate === 'object' && Number(j.donate.amount) > 0 ? j.donate : null;
    const str = (x) => (x && typeof x === 'object' ? x.item || x.name || x.title || x.query || x.text || '' : x);
    for (const k of ['buy', 'consume', 'pick_up', 'drop', 'destroy', 'read', 'search', 'pray', 'store', 'take', 'give', 'talk_to', 'steal_what']) if (j[k] && typeof j[k] === 'object' && !Array.isArray(j[k]) && !['steal', 'trade'].includes(k)) j[k] = str(j[k]);
    if (Array.isArray(j.consume)) j.consume = j.consume[0];
    if (/^(craft|consume|search|cook|eat|go to \w+|use \w+|work|gather|sell|buy)$/i.test(String(j.action || '').trim()) && j.thought) j.action = clean(j.thought, 60);
    a.action = {
      text: clean(j.action, 80), emoji: firstEmoji(j.emoji) || '💭', dest: loc?.name, minutes, started: false, until: this.time, model,
      work: j.work === true && !!a.job.place,
      buy: val(j.buy) && clean(j.buy, 40), consume: val(j.consume) && clean(j.consume, 40), pickUp: val(j.pick_up) && clean(j.pick_up, 40),
      drop: val(j.drop) && clean(j.drop, 40), destroy: val(j.destroy) && clean(j.destroy, 40), create, write, donate,
      read: val(j.read) && clean(j.read, 90), search: val(j.search) && clean(j.search, 100), pray: val(j.pray) && clean(j.pray, 400),
      qty: Number(j.qty) || 1, craft: val(j.craft) && clean(typeof j.craft === 'object' ? j.craft.name || j.craft.recipe : j.craft, 40),
      sell: val(j.sell) ? (typeof j.sell === 'object' && !val(j.sell.to) ? { item: j.sell.item, qty: j.sell.qty } : typeof j.sell === 'string' ? { item: j.sell, qty: j.qty } : null) : null,
    };
    if (a.action.sell && !val(j.destination) && !this.atExchange(a)) { loc = this.world.findLocation(EXCHANGE); a.action.dest = loc?.name; }
    const wo = val(j.work_on);
    if (wo) {
      const c = this.findCommission(typeof wo === 'object' ? wo.id : wo);
      if (c && c.status === 'open' && (!c.assignees.length || c.assignees.includes(a.id))) {
        a.action.commission = c.id; a.action.minutes = Math.max(60, minutes);
        if (!c.workers.includes(a.id)) c.workers.push(a.id);
        if (!useType) useType = 'desk';
        this.log('commission', `✍️ ${a.name} started working on commission "${c.title}"`, [a.id]);
      }
    }
    a.action.store = val(j.store) && clean(j.store, 40);
    a.action.take = val(j.take) && clean(j.take, 40);
    a.action.order = val(j.post_order) && typeof j.post_order === 'object' && val(j.post_order.item) ? j.post_order : null;
    if (a.action.order && !val(j.destination) && !this.atExchange(a)) { loc = this.world.findLocation(EXCHANGE); a.action.dest = loc?.name; }
    if ((a.action.store || a.action.take) && !val(j.destination)) { loc = this.world.findLocation(a.home) || loc; a.action.dest = loc?.name; }
    const cj = val(j.change_job);
    const cjTitle = typeof cj === 'object' && cj ? cj.title || cj.job || cj.profession || cj.name : cj;
    if (cjTitle && cjTitle !== true) this.setJob(a, cjTitle, typeof cj === 'object' ? cj.place : '');
    let gk = val(j.gather) ? this.resName(typeof j.gather === 'object' ? j.gather.resource || j.gather.type : j.gather) : null;
    if (!gk && j.work === true && this.professionRes(a)) gk = this.professionRes(a);
    const actionTxt = String(j.action || '').toLowerCase();
    if (!a.action.sell && /\bsell/.test(actionTxt)) { const rk = this.resName(actionTxt); if (rk && this.resCount(a, rk) > 0) a.action.sell = { item: rk, qty: Number(j.qty) || this.resCount(a, rk) }; }
    if (a.action.sell && !['shop'].includes(loc?.kind) && loc?.name !== EXCHANGE) { loc = this.world.findLocation(EXCHANGE) || loc; a.action.dest = loc?.name; }
    if (a.action.sell) gk = null;
    if (!gk && !useType && !val(j.talk_to) && !a.action.sell && !a.action.consume && !a.action.buy && !a.action.store && !a.action.take && !/\b(eat|eating|consume|drink|sell|selling|buy|buying|cook|bake|store|deliver|trade)\b/.test(actionTxt)
      && /\b(gather\w*|collect\w*|pick\w*|harvest\w*|forag\w*|chop\w*|fishing|fish|mine|mining|quarry\w*|lumber\w*|woodcut\w*|farming)\b/.test(actionTxt)) {
      const txt = actionTxt;
      const m = txt.match(/\b(fish(ing)?|chop|lumber|woodcut|wood|log|quarry|mine|mining|ore|stone|harvest|farm(ing)?|crops|forage|foraging|berries|berry|pick herbs|herbs)\b/);
      const destRes = loc?.resource?.[0];
      if (m) gk = this.resName(m[0] === 'mine' || m[0] === 'mining' ? 'ore' : m[0]);
      else if (destRes) gk = destRes;
    }
    if (gk && gk === 'stone' && /ore|iron|mine|mining/.test(String(j.action).toLowerCase())) gk = 'ore';
    if (gk && j.work === true && this.professionRes(a) && a.job.place) loc = this.world.findLocation(a.job.place) || loc;
    if (gk) {
      const node = this.findNode(gk, a, loc?.resource?.includes(gk) ? loc : this.world.findLocation(j.destination));
      if (node) { a.action.gather = { res: gk, key: node.key }; a.action.obj = null; a.action.gatherStand = node.stand; a.action.minutes = Math.max(30, minutes); }
      else this.remember(a, `I couldn't find any ${gk} to gather right now – the sources are depleted.`, 2);
    }
    if (a.action.craft) { const r = this.recipeFor(a.action.craft); if (r && !useType) useType = r[1].at; }
    const tr = val(j.trade) && typeof j.trade === 'object' && val(j.trade.with || j.trade.to) ? j.trade : null;
    if (tr) { j.talk_to = tr.with || tr.to; j.purpose = 'trade'; a.pendingTrade = { item: clean(tr.item, 40), qty: Math.max(1, Math.round(Number(tr.qty) || 1)), price: Math.max(0, Math.round(Number(tr.price) || 0)) }; }
    const hire = val(j.hire) && typeof j.hire === 'object' && val(j.hire.who || j.hire.name) ? j.hire : null;
    if (hire) { j.talk_to = hire.who || hire.name; j.purpose = 'hire'; a.pendingHire = { title: clean(hire.title || 'Assistant', 40), wage: Math.max(1, Math.min(30, Math.round(Number(hire.wage) || 6))) }; }
    if (typeof j.sell === 'object' && val(j.sell?.to) && !/market|exchange/i.test(j.sell.to)) { j.talk_to = j.sell.to; j.purpose = 'trade'; a.pendingTrade = { item: clean(j.sell.item, 40), qty: Math.max(1, Math.round(Number(j.sell.qty) || 1)), price: Math.max(0, Math.round(Number(j.sell.price) || 0)) }; }
    if (j.run_for_office === true && this.gov) this.declareCandidacy(a);
    if (this.gov?.leaderId === a.id) this.decree(a, j);

    let purpose = val(j.purpose) ? String(j.purpose).toLowerCase() : 'chat';
    let targetName = val(j.talk_to);
    if (purpose === 'trade' && !a.pendingTrade) purpose = 'chat';
    if (purpose === 'hire' && !a.pendingHire) purpose = 'chat';
    for (const k of ['steal', 'rob', 'beg', 'propose', 'breakup', 'intimacy']) {
      const v = val(j[k]);
      if (!v || v === true) continue;
      purpose = k;
      targetName = typeof v === 'object' ? v.from || v.to || v.name || targetName : v;
      if (typeof v === 'object' && v.what) j.steal_what = v.what;
    }
    if (!['chat', 'beg', 'propose', 'breakup', 'steal', 'rob', 'trade', 'hire', 'intimacy'].includes(purpose)) purpose = 'chat';
    let target = null;
    if (useType) {
      const o = this.world.findObject(useType, loc, a.x, a.y);
      if (o) { a.action.obj = o; target = o.stand; if (o.loc) { loc = o.loc; a.action.dest = loc.name; } }
    }
    const who = targetName ? this.agentByName(String(targetName)) : null;
    if (who && who !== a) {
      a.talkTarget = who.id;
      a.talkTopic = a.action.text;
      a.talkPurpose = purpose;
      a.stealWhat = val(j.steal_what) || 'money';
      a.talkGiveUpAt = this.now + 60;
      a.pendingGive = val(j.give) ? clean(j.give, 40) : null;
      a.pendingPay = Math.max(0, Math.min(Math.max(0, a.money), Number(j.pay) || 0));
      a.path = findPath(this.world, a.x, a.y, who.x, who.y) || [];
    } else if (a.action.gatherStand) {
      a.path = findPath(this.world, a.x, a.y, a.action.gatherStand.x, a.action.gatherStand.y) || [];
    } else if (target) {
      a.path = findPath(this.world, a.x, a.y, target.x, target.y) || [];
    } else if (loc) {
      const cur = this.locOf(a);
      const spot = this.world.randomSpotIn(loc);
      a.path = cur === loc && Math.random() < 0.5 ? [] : (findPath(this.world, a.x, a.y, spot.x, spot.y) || []);
    }
    const A = a.action;
    const extras = [A.work && '💼work', A.obj && `use ${A.obj.type}`, A.buy && `buy ${A.buy}`, A.consume && `consume ${A.consume}`,
      A.create && `create ${A.create.name || A.create}`, A.write && `write "${A.write.title || A.write}"`, A.destroy && `destroy ${A.destroy}`,
      A.gather && `gather ${A.gather.res}`, A.craft && `craft ${A.craft}`, A.sell && `sell ${A.sell.qty || ''} ${A.sell.item}`, a.pendingTrade && purpose === 'trade' && `sell ${a.pendingTrade.qty} ${a.pendingTrade.item} for $${a.pendingTrade.price}`,
      A.read && `read ${A.read}`, A.search && `search "${A.search}"`, A.pray && 'pray', A.donate && `donate $${A.donate.amount}`,
      who && `${purpose === 'chat' ? 'talk to' : purpose} ${who.name.split(' ')[0]}`].filter(Boolean).join(', ');
    this.noteAct(a, A.text);
    this.remember(a, `I decided to: ${A.text} (${A.dest}). Thought: ${a.thought}`, 1);
    this.log('action', `${A.emoji} ${a.name}: ${A.text} @ ${A.dest}${extras ? ` (${extras})` : ''}`, [a.id]);
    if (a.thought) this.log('thought', `💭 ${a.name}: ${a.thought}`, [a.id]);
  }

  fallbackDecision(a) {
    const h = fmtTime(this.time).hh;
    const home = this.world.findLocation(a.home);
    const n = a.needs;
    const worst = NEED_KEYS.filter((k) => k !== 'romance' && k !== 'social').sort((x, y) => n[x] - n[y])[0];
    let loc = null, text, emoji, minutes = 30 + Math.floor(Math.random() * 60), use = null, work = false;
    if (h >= 23 || h < 7 || n.energy < 20) { loc = home; text = 'Sleeping'; emoji = '😴'; minutes = 300; use = 'bed'; }
    else if (n[worst] < 35) {
      const map = { hunger: ['fridge', 'Having a snack', '🍽️'], thirst: ['sink', 'Drinking water', '💧'], fun: ['tv', 'Watching TV', '📺'], hygiene: ['shower', 'Taking a shower', '🚿'], energy: ['bed', 'Napping', '😴'] };
      [use, text, emoji] = map[worst]; loc = home;
    } else if (a.money < 15 || this.pantryFood(home) < 1) {
      const r = Math.random() < 0.5 ? ['berries', 'Foraging berries', '🫐', 'Berry Grove'] : ['fish', 'Fishing', '🎣', 'Fishing Dock'];
      return this.applyDecision(a, { action: r[1], emoji: r[2], destination: r[3], minutes: 90, gather: r[0] }, 'offline');
    } else if (a.job.place && h >= 9 && h < 17 && Math.random() < 0.6) {
      loc = this.world.findLocation(a.job.place); text = `Working as ${a.job.title}`; emoji = '💼'; work = true; minutes = 120;
    } else {
      const pool = this.world.locations.filter((l) => l.kind !== 'home' || l === home);
      loc = pool[Math.floor(Math.random() * pool.length)];
      const acts = { cafe: ['Having a coffee', '☕'], library: ['Reading a book', '📖'], shop: ['Browsing the market', '🛒'], park: ['Walking in the park', '🚶'], plaza: ['Relaxing by the fountain', '⛲'], workshop: ['Tinkering', '🔧'], home: ['Relaxing at home', '🏠'], hall: ['Visiting the Town Hall', '🏛️'], temple: ['Praying quietly', '🙏'], lab: ['Thinking about science', '🔬'], bar: ['Having a drink', '🍺'], farm: ['Looking at the crops', '🌾'], clinic: ['Getting a checkup', '🩺'] };
      [text, emoji] = acts[loc.kind] || ['Wandering around', '🚶'];
    }
    this.applyDecision(a, { action: text, emoji, destination: loc?.name, minutes, use, work }, 'offline');
  }

  // ---------------- director ----------------
  async runDirector() {
    this.director.busy = true;
    this.director.nextAt = this.time + 150 + Math.random() * 120;
    try { if (AI.enabled && Math.random() < 0.6) await this.aiEvent(); else this.presetEvent(); } catch { this.presetEvent(); }
    this.director.busy = false;
  }
  randomPlace(kinds) {
    const pool = this.world.locations.filter((l) => !kinds || kinds.includes(l.kind));
    return pool[Math.floor(Math.random() * pool.length)];
  }
  spawnAt(loc, spec) { const s = this.world.randomSpotIn(loc); return this.addItem({ ...spec, x: s.x, y: s.y }); }
  presetEvent() {
    const r = Math.floor(Math.random() * 8);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    if (r === 0) {
      const l = this.randomPlace(['park', 'plaza', 'farm']);
      const it = this.spawnAt(l, pick([
        { name: 'Stray puppy', emoji: '🐶', desc: 'A muddy, adorable puppy with no collar.', satisfies: { fun: 20, social: 10 } },
        { name: 'Lost wallet', emoji: '👛', desc: 'A wallet stuffed with cash.', cash: 25 },
        { name: 'Mysterious egg', emoji: '🥚', desc: 'A huge speckled egg. It is warm.' },
        { name: 'Message in a bottle', emoji: '🍾', desc: 'A note inside reads: "The treasure lies under the oldest tree."' },
      ]));
      this.log('director', `🎲 Something appeared at ${l.name}: ${it.emoji} ${it.name}`);
    } else if (r === 1) {
      const l = this.randomPlace(['shop', 'cafe', 'bar']); if (!l) return;
      l.saleUntil = this.time + 240;
      this.broadcast(`${l.name} is having a 50% off sale for the next 4 hours!`, 'director');
    } else if (r === 2) {
      this.powerOutUntil = this.time + 120;
      this.broadcast('Power outage! All TVs, screens and the internet are dead for about 2 hours.', 'director');
    } else if (r === 3) this.setWeather(pick(['rain', 'storm', 'sunny', 'snow']), 4);
    else if (r === 4 && this.agents.length > 1) {
      const a = pick(this.agents), b = pick(this.agents.filter((x) => x !== a));
      this.remember(a, `You received an anonymous note: "${b.name} has a secret they're hiding from you."`, 4);
      this.log('director', `🎲 ${a.name} received an anonymous note about ${b.name}`, [a.id]);
      this.interrupt(a);
    } else if (r === 5) {
      const k = ['wood', 'stone', 'fish', 'herbs', 'crops'][Math.floor(Math.random() * 5)];
      const price = Math.round(RES[k].base * 2.5 * 100) / 100;
      this.market.orders.push({ id: 'om' + Date.now(), side: 'buy', res: k, qty: 15, price, by: 'merchant', name: 'Traveling Merchant', t: this.time, exp: this.time + 720 });
      this.broadcast(`A traveling merchant at Town Square will buy 15 ${k} at $${price} each (2.5× normal) for the next 12 hours!`, 'director');
    } else if (r === 6) {
      this.broadcast('The Willowbrook Institute offers a $50 prize for the best research paper written this week!', 'director');
    } else {
      const rich = [...this.agents].sort((x, y) => y.money - x.money)[0];
      if (rich) this.broadcast(`Rumor: ${rich.name.split(' ')[0]} is the richest person in town. Some say they hide cash at home.`, 'director');
    }
  }
  async aiEvent() {
    const recent = this.logs.filter((l) => ['action', 'line', 'create', 'destroy', 'event', 'director', 'news', 'romance', 'crime', 'law', 'knowledge', 'death', 'birth'].includes(l.type)).slice(-20).map((l) => `- ${l.text.slice(0, 200)}`).join('\n');
    const names = this.agents.map((a) => `${a.name}${sym(a)} (${a.job.title}, $${a.money.toFixed(0)}, ${mood(a.needs).face})`).join('; ');
    const tm = fmtTime(this.time);
    const res = await AI.chat(null, [
      { role: 'system', content: 'You are the mischievous narrator/director of a life-simulation town used to study emergent social dynamics. You inject small surprising events that create drama, moral dilemmas, opportunity, romance, mystery, scientific curiosity or comedy. Never repeat earlier events. Reply with ONLY compact JSON.' },
      { role: 'user', content: `Time: Day ${tm.day} ${pad(tm.hh)}:${pad(tm.mm)}, weather ${this.weather.kind}.\nLore: ${this.lore}\nGovernment: ${this.leader()?.name || 'none'}; laws: ${this.lawsText()}\nResidents: ${names}\nPlaces: ${this.world.locations.map((l) => l.name).join(', ')}\nRecent happenings:\n${recent || '- quiet day'}\n\nInvent ONE new event building on recent happenings.\nKeys: "headline" (announced to everyone, or null for secret-only), "item" ({"name","emoji","desc","place","satisfies"} or null), "target" (one resident or null), "secret" (private message only the target learns, or null).\nExample: {"headline":"A goat escaped and is eating the flowers in Willow Park!","item":{"name":"Runaway goat","emoji":"🐐","desc":"Its owner offers a $20 reward.","place":"Willow Park","satisfies":{"fun":15}},"target":null,"secret":null}\nReply with your own new event as JSON.` },
    ], 300, 1.05, 'director');
    const j = parseJSON(res.content);
    if (!j) throw new Error('bad');
    if (val(j.item) && j.item.name) {
      const l = this.world.findLocation(j.item.place) || this.randomPlace();
      if (j.item.satisfies) { delete j.item.satisfies.hunger; delete j.item.satisfies.thirst; }
      const it = this.spawnAt(l, j.item);
      this.log('director', `🎲 ${it.emoji} ${it.name} appeared at ${l.name}`);
    }
    if (val(j.headline) && String(j.headline).length > 12 && !/announcement or|null if/i.test(j.headline)) this.broadcast(clean(j.headline, 240), 'director');
    const t = this.agentByName(j.target);
    if (t && val(j.secret)) {
      this.remember(t, `Secret: ${clean(j.secret, 300)}`, 5);
      this.log('director', `🤫 Secret for ${t.name}: ${clean(j.secret, 200)}`, [t.id]);
      this.interrupt(t);
    }
  }

  // ---------------- conversations ----------------
  startConvo(a, b, topic, purpose = 'chat') {
    if (a.convoId || b.convoId) return;
    const cv = { id: newId('cv'), a: a.id, b: b.id, lines: [], turn: a.id, busy: false, nextAt: this.now + 0.4, topic, purpose, loc: this.locName(a) };
    if (purpose === 'trade' && a.pendingTrade) { cv.trade = { ...a.pendingTrade, seller: a.id, buyer: b.id }; a.pendingTrade = null; }
    if (purpose === 'hire' && a.pendingHire) { cv.hire = { ...a.pendingHire, boss: a.id }; a.pendingHire = null; }
    this.convos.push(cv);
    for (const [x, y] of [[a, b], [b, a]]) {
      x.convoId = cv.id; x.path = []; x.moving = false; x.talkTarget = null; x.asleep = false;
      const dx = y.x - x.x, dy = y.y - x.y;
      x.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      this.rel(x, y).met = true;
    }
    if (a.pendingGive) { this.transferItem(a, b, a.pendingGive); a.pendingGive = null; }
    if (a.pendingPay > 0) { this.transferMoney(a, b, a.pendingPay); a.pendingPay = 0; }
    this.log('talk', `💬 ${a.name} started ${purpose && purpose !== 'chat' ? `a "${purpose}" talk` : 'talking'} with ${b.name} at ${cv.loc}`, [a.id, b.id]);
  }

  transferItem(a, b, name) {
    const it = byName(a.inventory, name);
    if (!it) return false;
    if (this.invFull(b)) { this.remember(a, `${b.name}'s bag was full, they couldn't take ${it.name}.`, 1); return false; }
    a.inventory = a.inventory.filter((i) => i !== it);
    b.inventory.push(it);
    this.bump(b, a, 4);
    if (/flower|rose|bouquet|chocolate|ring|locket|poem/i.test(it.name)) { this.bump(b, a, 2, 5); b.needs.romance = Math.min(100, b.needs.romance + 10); }
    this.remember(a, `I gave ${it.emoji} ${it.name} to ${b.name}.`, 3);
    this.remember(b, `${a.name} gave me ${it.emoji} ${it.name}: ${it.desc}`, 4);
    this.log('item', `🎁 ${a.name} gave ${it.emoji} ${it.name} to ${b.name}`, [a.id, b.id]);
    return true;
  }
  transferMoney(a, b, amt) {
    amt = Math.round(Math.max(0, Math.min(Math.max(0, a.money), Number(amt) || 0)));
    if (!amt) return false;
    a.money -= amt; b.money += amt;
    this.remember(a, `I paid ${b.name} $${amt}.`, 3);
    this.remember(b, `${a.name} paid me $${amt}.`, 3);
    this.log('money', `💵 ${a.name} paid ${b.name} $${amt}`, [a.id, b.id]);
    return true;
  }

  updateConvo(cv) {
    if (cv.busy || this.now < cv.nextAt) return;
    if (cv.done) return this.endConvo(cv);
    const sp = this.agent(cv.turn), ls = this.agent(cv.turn === cv.a ? cv.b : cv.a);
    if (!sp || !ls) return this.endConvo(cv, true);
    cv.busy = true;
    sp.say = '…'; sp.sayUntil = this.now + 60;
    this.convoLine(cv, sp, ls).then((r) => {
      if (!this.convos.includes(cv)) return;
      const say = clean(r.say, 240) || '...';
      cv.lines.push({ who: sp.id, name: sp.name, text: say });
      this.noteSaid(sp, say);
      sp.say = say;
      const dur = Math.max(2.5, Math.min(7, say.length * 0.055));
      sp.sayUntil = this.now + dur;
      cv.nextAt = this.now + dur * 0.85;
      this.log('line', `${sp.name}: ${say}`, [sp.id, ls.id]);
      sp.needs.social = Math.min(100, sp.needs.social + 5);
      ls.needs.social = Math.min(100, ls.needs.social + 4);
      this.rel(sp, ls).talks++;
      this.applyFeelings(sp, ls, r);
      if (val(r.give)) this.transferItem(sp, ls, r.give);
      if (Number(r.pay) > 0) this.transferMoney(sp, ls, r.pay);
      if (['propose', 'trade', 'hire', 'intimacy'].includes(cv.purpose) && sp.id === cv.b && typeof r.accept === 'boolean' && cv.accept == null) cv.accept = r.accept;
      cv.turn = ls.id;
      if (r.end || cv.lines.length >= MAX_CONVO_LINES) cv.done = true;
    }).finally(() => { cv.busy = false; });
  }

  async convoLine(cv, sp, ls) {
    const n = cv.lines.length;
    if (!AI.enabled) {
      const canned = [`Hi ${ls.name.split(' ')[0]}! How's your day going?`, 'Pretty good, thanks! Busy as always.', 'Have you heard anything new around town?', "Not much, but I'll keep my ears open.", 'See you around!', 'Take care!'];
      return { say: canned[Math.min(n, canned.length - 1)], end: n >= 5, feeling: 1 };
    }
    const tm = fmtTime(this.time);
    const firstN = ls.name.split(' ')[0];
    const about = sp.memories.filter((m) => m.text.includes(firstN)).slice(-5).map((m) => `- ${m.text.slice(0, 260)}`).join('\n') || '- (you barely know them)';
    const R = this.rel(sp, ls);
    const transcript = cv.lines.map((l) => `${l.name}: ${l.text}`).join('\n');
    const looks = [ls.needs.hygiene < 20 && 'they look unwashed and smell bad', ls.needs.energy < 20 && 'they look exhausted', ls.health < 40 && 'they look sick', ls.needs.hunger < 20 && 'their stomach is growling', mood(ls.needs).score > 75 && 'they look very happy'].filter(Boolean).join(', ');
    const initiator = cv.a === sp.id;
    const purposeTxt = {
      beg: initiator ? 'You came to BEG them for money – you are desperate.' : 'They are begging you for money. Decide if you give any ("pay").',
      propose: initiator ? 'You came to PROPOSE MARRIAGE. Do it romantically.' : 'They may propose marriage. If they do, answer with "accept": true or false honestly.',
      breakup: initiator ? 'You came to END your relationship.' : 'They are breaking up with you.',
      confront: initiator ? String(cv.topic || '') : 'You just robbed them. They are confronting you.',
      intimacy: initiator ? 'You want to be intimate with them tonight (private, romantic). Be tender and ask - their consent matters.' : 'They want to be intimate with you. Decide freely based on your feelings, relationship and values. Answer with "accept": true or false.',
      hire: cv.hire ? (initiator ? `You came to HIRE them as your ${cv.hire.title} for $${cv.hire.wage}/hour (you pay from your own money).` : `They offer you a job as their ${cv.hire.title} for $${cv.hire.wage}/hour. Your current job: ${sp.job.title}${sp.job.wage ? ` ($${sp.job.wage}/h)` : ' (no wage)'}. Answer with "accept": true or false.`) : '',
      trade: cv.trade ? (initiator ? `You came to SELL them ${cv.trade.qty} ${cv.trade.item} for $${cv.trade.price}. Negotiate!` : `They offer to sell you ${cv.trade.qty} ${cv.trade.item} for $${cv.trade.price} (exchange value of resources: see prices). You have $${sp.money.toFixed(0)}. Answer with "accept": true or false.`) : '',
    }[cv.purpose] || '';
    const P1 = this.partnerOf(ls), P2 = this.partnerOf(sp);
    const sys = `You are ${sp.name}${sp.gender ? ` (${sp.gender}, ${sp.age})` : ` (${sp.age})`}. Persona: ${sp.persona} Temperament: ${genesText(sp.genes)}.` + (sp.goal ? ` Goal: ${sp.goal}.` : '') + (sp.aspiration ? ` Aspiration: ${sp.aspiration}.` : '') +
      ' All residents are consenting adults (18+); mature themes are allowed, intimacy stays implied.' +
      ' Speak naturally in 1-2 short sentences, in character, with personality and emotion. NEVER repeat things you already said; bring new information, opinions, questions, offers or ideas. Reply with ONLY JSON.';
    const user = `Time: Day ${tm.day}, ${pad(tm.hh)}:${pad(tm.mm)}. Location: ${cv.loc}. Weather: ${this.weather.kind}.
You: mood ${mood(sp.needs).face}, health ${Math.round(sp.health)}, $${sp.money.toFixed(0)}, inventory: ${this.invText(sp)}. Needs: ${this.needsText(sp)}.
Talking with ${ls.name}${sym(ls)} (${ls.age}, ${ls.job.title}), who was: ${ls.action?.text || 'around'}.${looks ? ` You notice ${looks}.` : ''}
They are your ${this.relType(sp, ls)} (score ${Math.round(R.score)}/100, attraction ${Math.round(R.attraction)}).${P1 && P1 !== sp ? ` They are with ${P1.name}.` : ''}${P2 && P2 !== ls ? ` You are with ${P2.name}.` : ''}
${purposeTxt}
Town laws: ${this.gov ? this.lawsText() : 'none'}. Leader: ${this.leader()?.name || 'none'}.
Market: ${Object.keys(RES).map((k) => `${k} $${this.market.price[k].toFixed(1)}`).join(', ')}. ${this.jobBoardText()}
What you remember about ${firstN}:
${about}
Memory bank:
${this.bankText(sp, 5)}
Recent memories:
${this.memoryContext(sp, 5)}
Lines you said recently (do NOT repeat): ${(sp.recentSaid || []).slice(-6).map((s) => `"${s.slice(0, 80)}"`).join(' ') || 'none'}
Possible fresh topic: ${this.spark(sp)}

Conversation so far:
${transcript || (initiator ? `(You start the conversation${cv.topic ? `. You came to: ${cv.topic}` : ''}.)` : '(They have not spoken yet.)')}
${n >= 4 ? 'Wrap up and say goodbye now.' : ''}
JSON: {"say":"...","end":false,"feeling":-3..3,"flirt":false,"give":"item or null","pay":0${['propose', 'trade', 'hire', 'intimacy'].includes(cv.purpose) && !initiator ? ',"accept":true/false' : ''}}`;
    try {
      let res = await AI.chat(this.tierFor(sp), [{ role: 'system', content: sys }, { role: 'user', content: user }], 220, 1.0, 'talk');
      let j = parseJSON(res.content);
      if (j?.say && (this.isRepeat(sp, j.say) || cv.lines.some((l) => this.similar(l.text, j.say) > 0.6))) {
        res = await AI.chat(this.tierFor(sp), [{ role: 'system', content: sys }, { role: 'user', content: user + `\n\nYou were about to say "${j.say}" – that REPEATS earlier talk. Say something completely different (new topic, question, joke, offer or action).` }], 220, 1.1, 'talk-retry');
        j = parseJSON(res.content) || j;
      }
      if (j?.say) return { say: j.say, end: !!j.end, feeling: j.feeling, flirt: j.flirt === true, give: j.give, pay: j.pay, accept: j.accept };
      return { say: clean(res.content.replace(/[{}"]/g, ''), 200) || 'Hmm.', end: n >= 4 };
    } catch {
      return { say: n ? 'Sorry, I need to run. See you!' : `Oh, hi ${firstN}!`, end: true };
    }
  }

  endConvo(cv, silent = false) {
    if (!cv || !this.convos.includes(cv)) return;
    this.convos = this.convos.filter((c) => c !== cv);
    const a = this.agent(cv.a), b = this.agent(cv.b);
    const transcript = cv.lines.map((l) => `${l.name.split(' ')[0]}: ${l.text}`).join(' | ');
    for (const [x, y] of [[a, b], [b, a]]) {
      if (!x) continue;
      x.convoId = null;
      if (!y) continue;
      x.lastTalk[y.id] = this.time;
      x.stats.talks++;
      if (transcript) this.remember(x, `Talked with ${y.name} at ${cv.loc}: ${transcript.slice(0, 700)}`, 2);
      if (x.action && !x.action.forced) { x.action.started = true; x.action.completed = true; x.action.until = this.time; }
    }
    if (a && b) { this.spreadGossip(a, b); this.spreadGossip(b, a); }
    if (cv.purpose === 'propose' && a && b) this.resolveProposal(a, b, cv.accept);
    if (cv.purpose === 'intimacy' && a && b) this.resolveIntimacy(a, b, cv.accept === true);
    if (cv.purpose === 'trade' && cv.trade) this.resolveTrade(cv, cv.accept === true);
    if (cv.purpose === 'hire' && cv.hire && a && b) {
      const biz = this.world.locations.find((l) => l.owner === a.name) || this.world.findLocation(a.job.place);
      if (cv.accept === true) { this.setJob(b, cv.hire.title, biz?.name || a.job.place, cv.hire.wage, a.name); this.bump(b, a, 5); this.remember(a, `I hired ${b.name} as my ${cv.hire.title} for $${cv.hire.wage}/h.`, 4); }
      else this.log('econ', `🙅 ${b.name} turned down ${a.name}'s job offer (${cv.hire.title}, $${cv.hire.wage}/h)`, [a.id, b.id]);
    }
    if (!silent && a && b) this.log('talk', `👋 ${a.name} and ${b.name} finished talking`, [a.id, b.id]);
  }

  // ---------------- persistence ----------------
  serialize() {
    return {
      v: 3, time: this.time, lore: this.lore, weather: this.weather, director: { enabled: this.director.enabled, nextAt: this.director.nextAt },
      townFund: this.townFund, chapelFund: this.chapelFund, powerOutUntil: this.powerOutUntil, mortality: this.mortality, popTarget: this.popTarget,
      gov: this.gov, library: this.library, prayers: this.prayers, market: this.market, nodes: this.nodes, commissions: this.commissions, graveyard: this.graveyard, genStats: this.genStats,
      world: this.world.serialize(),
      agents: this.agents.map((a) => ({
        ...a, path: [], convoId: null, thinking: false, reflecting: false, say: null, talkTarget: null, _invKey: null, _memRendered: null,
        action: a.action ? (a.action.forced ? { ...a.action } : { ...a.action, started: true, completed: true, until: this.time }) : null,
      })),
      logs: this.logs.slice(-500),
    };
  }
  load(d) {
    if ((d.v || 1) < 3) return this.migrate(d);
    this.world = World.deserialize(d.world);
    Object.assign(this, {
      time: d.time, lore: d.lore || '', weather: d.weather || { kind: 'sunny', until: d.time + 300 },
      townFund: d.townFund || 0, chapelFund: d.chapelFund || 0, powerOutUntil: d.powerOutUntil || 0, mortality: d.mortality ?? true,
      popTarget: d.popTarget || 16, gov: d.gov, library: d.library, prayers: d.prayers || [], graveyard: d.graveyard || [], genStats: d.genStats || { births: 0 },
      logs: d.logs || [], convos: [],
    });
    this.director = { enabled: d.director?.enabled ?? true, nextAt: d.director?.nextAt ?? this.time + 60, busy: false };
    this.agents = d.agents.map((a) => this.normalizeAgent(a));
    if (!this.gov) this.initGov();
    if (d.market) { this.market = d.market; this.nodes = d.nodes || {}; } else this.initEconomy();
    this.setupShops();
    const newGrounds = addGatheringGrounds(this.world);
    this.world.rebuildBlocked();
    if (newGrounds.length) this.log('system', `🗺️ New gathering grounds opened in town: ${newGrounds.join(', ')}`);
    this.setupResourcePlaces();
    this.reassignHomes();
    this.jobOffice();
    this.commissions = d.commissions || [];
    if (!this.library) this.initLibrary();
    if (News.items.length) this.addJournals(News.items);
  }
  normalizeAgent(a) {
    const base = {
      gender: null, health: 100, bank: [], genes: randomGenes(), learn: freshLearn(), fitness: null, generation: 1, parents: [],
      romance: { partner: null, status: null }, exes: [], record: { crimes: 0, fines: 0 }, jailedUntil: 0, readBooks: [], recentSaid: [], recentActs: [],
      punishedAt: {}, aspiration: '', question: '', lastReflectAt: this.time - Math.random() * 400, critAt: {}, lastCreateAt: -1e9, seenNews: [], lastTalk: {},
      needs: freshNeeds(), money: 30, job: JOBS[a.name] || { title: 'Unemployed', place: '', wage: 0 }, rel: {}, pendingPay: 0, inventory: [], memories: [],
    };
    const out = { ...base, ...a, retryAt: 0, sayUntil: 0, failCount: 0, thinking: false, reflecting: false, convoId: null, talkTarget: null, path: [] };
    out.stats = { earned: 0, spent: 0, created: 0, destroyed: 0, talks: 0, stolen: 0, donated: 0, papers: 0, prayers: 0, read: 0, searches: 0, hospital: 0, punished: 0, ...(a.stats || {}) };
    out.inventory = out.inventory.map((i) => ({ satisfies: {}, carry: true, ...i }));
    if (out.job && (!out.job.title || out.job.title === 'undefined')) out.job = { title: 'Unemployed', place: '', wage: 0 };
    if ((!out.job || out.job.title === 'Unemployed') && JOBS[out.name]) out.job = JOBS[out.name];
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    for (const [id, r] of Object.entries(out.rel)) {
      if (!r || typeof r !== 'object') { delete out.rel[id]; continue; }
      out.rel[id] = { score: num(r.score ?? r.friend), attraction: num(r.attraction ?? r.romance), met: r.met ?? true, talks: num(r.talks) };
    }
    for (const k of Object.keys(out.needs)) out.needs[k] = Number.isFinite(out.needs[k]) ? out.needs[k] : 50;
    if (!Number.isFinite(out.money)) out.money = 30;
    if (!Number.isFinite(out.health)) out.health = 100;
    if (!out.romance) out.romance = { partner: null, status: null };
    return out;
  }
  // v1/v2 save → v3: keep every character (incl. custom ones), move them into the new bigger town
  migrate(old) {
    this.seed();
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const convRel = (rel) => Object.fromEntries(Object.entries(rel || {}).filter(([, r]) => r && typeof r === 'object').map(([id, r]) => [id, { score: num(r.friend ?? r.score), attraction: num(r.romance ?? r.attraction), met: true, talks: 1 }]));
    for (const oa of old.agents || []) {
      const existing = this.agents.find((x) => x.name === oa.name);
      if (existing) {
        const oldId = existing.id;
        for (const k of ['memories', 'money', 'needs', 'inventory', 'goal', 'persona', 'tier', 'colors', 'seenNews', 'thought']) if (oa[k] != null) existing[k] = oa[k];
        existing.inventory = existing.inventory.map((i) => ({ satisfies: {}, carry: true, ...i }));
        existing.stats = { ...existing.stats, ...(oa.stats || {}) };
        existing.id = oa.id;
        for (const b of this.agents) {
          if (b.rel[oldId]) { b.rel[oa.id] = b.rel[oldId]; delete b.rel[oldId]; }
          if (b.romance?.partner === oldId) b.romance.partner = oa.id;
        }
        if (this.gov?.leaderId === oldId) this.gov.leaderId = oa.id;
        Object.assign(existing.rel, convRel(oa.rel));
      } else {
        const home = this.world.findLocation(oa.home);
        const fresh = this.addAgent({ name: oa.name, age: oa.age, gender: oa.gender, persona: oa.persona, goal: oa.goal, tier: oa.tier, colors: oa.colors, money: oa.money, needs: oa.needs, inventory: oa.inventory, job: oa.job, home: home && home.kind === 'home' ? home.name : 'Guest House', id: oa.id });
        fresh.memories = [...(oa.memories || []), ...fresh.memories];
        fresh.rel = convRel(oa.rel);
        fresh.stats = { ...fresh.stats, ...(oa.stats || {}) };
        this.log('system', `🧳 ${fresh.name} moved into the new town (${fresh.home}, job: ${fresh.job.title})${fresh.gender ? '' : ' – set their gender in the inspector'}`, [fresh.id]);
      }
    }
    for (const oa of old.agents || []) {
      if (!oa.partner) continue;
      const a = this.agent(oa.id), b = this.agent(oa.partner);
      if (a && b && !a.romance.partner && !b.romance.partner) this.setCouple(a, b, 'dating');
    }
    const seeded = new Set(this.world.items.map((i) => i.name));
    for (const it of old.world?.items || []) {
      if (seeded.has(it.name)) continue;
      const oldLoc = (old.world.locations || []).find((l) => it.x >= l.x && it.x < l.x + l.w && it.y >= l.y && it.y < l.y + l.h);
      const nl = (oldLoc && this.world.findLocation(oldLoc.name)) || this.world.findLocation('Town Square');
      this.spawnAt(nl, it);
    }
    this.time = old.time || this.time;
    if (old.lore) this.lore = old.lore;
    this.logs = [...(old.logs || []), ...this.logs];
    this.popTarget = this.agents.length;
    this.log('system', `🏗️ Your town was migrated to the new, bigger Willowbrook. All ${old.agents?.length || 0} of your characters were kept.`);
  }
}

Sim.prototype.chapelService = function () {
  const pastor = this.agents.find((a) => /pastor|priest/i.test(a.job.title));
  this.broadcast(`🔔 Evening service at the Chapel of Dawn at 18:00${pastor ? `, led by ${pastor.name}` : ''}. All are welcome to pray.`, 'prayer');
  for (const a of this.agents) if ((a.genes.faith ?? 0.5) > 0.55 && !a.asleep) this.remember(a, 'I feel called to attend the evening service and pray at the Chapel of Dawn.', 3);
};
Object.assign(Sim.prototype, Society, Knowledge, Economy, Commissions);
