// Needs, object affordances, shop menus and jobs.
// Need values run 0..100 where 100 = fully satisfied.

export const NEEDS = {
  hunger: { emoji: '🍔', label: 'Hunger', decay: 4.5 },
  thirst: { emoji: '🥤', label: 'Thirst', decay: 5.5 },
  energy: { emoji: '⚡', label: 'Energy', decay: 3.5 },
  social: { emoji: '💬', label: 'Social', decay: 4 },
  fun: { emoji: '🎉', label: 'Fun', decay: 4 },
  hygiene: { emoji: '🚿', label: 'Hygiene', decay: 2.5 },
  romance: { emoji: '💕', label: 'Romance', decay: 1.8 },
};
export const NEED_KEYS = Object.keys(NEEDS);
export const INV_LIMIT = 6;
export const CRITICAL = 20;

// What using an object does, in need points per game hour while the activity lasts.
// cost = dollars charged once when the activity starts.
export const AFFORD = {
  bed: { energy: 14, verb: 'sleep / nap' },
  sofa: { energy: 5, fun: 10, verb: 'lounge' },
  tv: { fun: 40, verb: 'watch TV (real news!)', news: true },
  fridge: { hunger: 60, thirst: 30, instant: { hunger: 35, thirst: 10 }, verb: 'eat a home snack' },
  stove: { hunger: 70, fun: 10, instant: { hunger: 45 }, verb: 'cook & eat a meal' },
  sink: { thirst: 80, hygiene: 25, instant: { thirst: 45, hygiene: 10 }, verb: 'drink water / wash' },
  shower: { hygiene: 120, instant: { hygiene: 55 }, verb: 'shower' },
  piano: { fun: 45, social: 5, verb: 'play music' },
  shelf: { fun: 30, verb: 'read a book' },
  desk: { fun: 10, verb: 'study / use computer' },
  bench: { energy: 6, fun: 8, verb: 'sit & relax' },
  workbench: { fun: 30, verb: 'tinker / build things' },
  easel: { fun: 50, verb: 'paint' },
  arcade: { fun: 75, cost: 1, verb: 'play arcade ($1)' },
  altar: { fun: 15, social: 5, verb: 'pray / worship' },
  whiteboard: { fun: 30, verb: 'brainstorm research ideas' },
  water: { thirst: 60, fun: 6, instant: { thirst: 40 }, verb: 'drink / splash in the water' },
};
// furniture types agents can be told about when listing usable objects
export const USABLE = Object.keys(AFFORD);

const m = (name, emoji, price, satisfies, desc = '') => ({ name, emoji, price, satisfies, desc });
export const MENUS = {
  shop: [
    m('Apple', '🍎', 2, { hunger: 20, thirst: 5 }), m('Bread', '🍞', 3, { hunger: 35 }), m('Sandwich', '🥪', 5, { hunger: 50 }),
    m('Water bottle', '💧', 1, { thirst: 50 }), m('Soda', '🥤', 2, { thirst: 35, fun: 5 }), m('Chocolate', '🍫', 2, { hunger: 12, fun: 12 }),
    m('Soap', '🧼', 2, { hygiene: 45 }), m('Flowers', '💐', 6, { romance: 15 }, 'A lovely bouquet – a great gift'), m('Lottery ticket', '🎟️', 3, { fun: 10 }, 'Might win big!'),
    m('Toolkit', '🧰', 12, {}, 'Useful for building and fixing things'),
  ],
  cafe: [
    m('Coffee', '☕', 3, { energy: 20, thirst: 20 }), m('Tea', '🍵', 2, { thirst: 35, energy: 5 }), m('Croissant', '🥐', 4, { hunger: 30 }),
    m('Cake slice', '🍰', 5, { hunger: 25, fun: 12 }), m('Soup', '🍲', 6, { hunger: 55, thirst: 10 }),
  ],
  bar: [m('Juice', '🧃', 3, { thirst: 40, fun: 5 }), m('Pretzel', '🥨', 3, { hunger: 25 }), m('Mocktail', '🍹', 5, { thirst: 30, fun: 20, social: 5 }),
    m('Ale', '🍺', 4, { thirst: 25, fun: 20, social: 10, energy: -5 }), m('Fish & chips', '🐟', 7, { hunger: 60 })],
  farm: [m('Fresh eggs', '🥚', 2, { hunger: 20 }), m('Carrots', '🥕', 1, { hunger: 15 }), m('Milk', '🥛', 2, { thirst: 40, hunger: 5 }), m('Corn', '🌽', 2, { hunger: 22 })],
  clinic: [m('Medicine', '💊', 10, { energy: 10 }, 'Restores 25 health when consumed'), m('Bandage', '🩹', 4, {}, 'Restores 10 health')],
};

export const JOBS = {
  'Mira Chen': { title: 'Cafe owner', place: 'Hilltop Cafe', wage: 10 },
  'Leo Rossi': { title: 'Grocer', place: 'Corner Market', wage: 10 },
  'Theo Barnes': { title: 'Retired (pension)', place: '', wage: 0 },
  'Priya Nair': { title: 'Library assistant', place: 'Town Library', wage: 8 },
  'Sana Okafor': { title: 'Painter', place: "Sana's Apartment", wage: 4 },
  'Felix Wagner': { title: 'Inventor', place: "Felix's Workshop", wage: 5 },
  'Juno Park': { title: "Mayor's assistant", place: 'Town Hall', wage: 12 },
  'Omar Haddad': { title: 'Cafe pianist', place: 'Hilltop Cafe', wage: 7 },
  'Grace Kim': { title: 'Mayor', place: 'Town Hall', wage: 14 },
  'Aisha Rahman': { title: 'Doctor', place: 'Willow Clinic', wage: 16 },
  'Marcus Bell': { title: 'Sheriff', place: 'Town Hall', wage: 11 },
  'Elena Volkova': { title: 'AI researcher', place: 'Willowbrook Institute', wage: 14 },
  'Kenji Sato': { title: 'Physicist', place: 'Willowbrook Institute', wage: 12 },
  'Rosa Delgado': { title: 'Farmer', place: 'Sunny Farm', wage: 8 },
  'Danny O\'Neil': { title: 'Tavern owner', place: 'The Rusty Anchor', wage: 9 },
  'Victor Hale': { title: 'Entrepreneur', place: '', wage: 0 },
  'Pastor Adams': { title: 'Pastor', place: 'Chapel of Dawn', wage: 6 },
};

// ---- genes: heritable temperament (0..1). Used in prompts and evolved by the genetic algorithm.
export const GENES = {
  caution: 'takes care of needs early', sociability: 'seeks company', greed: 'wants money', honesty: 'tells truth, respects property',
  ambition: 'seeks status & power', curiosity: 'seeks knowledge & novelty', faith: 'spiritual', passion: 'romantic & jealous',
};
export const GENE_KEYS = Object.keys(GENES);
export function randomGenes(rng = Math.random) {
  const g = {};
  for (const k of GENE_KEYS) g[k] = Math.round((0.2 + rng() * 0.6) * 100) / 100;
  return g;
}
export function crossover(g1, g2, rate = 0.12) {
  const g = {};
  for (const k of GENE_KEYS) {
    const base = Math.random() < 0.5 ? g1[k] : g2[k];
    const mut = (Math.random() + Math.random() + Math.random() - 1.5) * rate * 2; // ~gaussian
    g[k] = Math.round(Math.max(0, Math.min(1, base + mut)) * 100) / 100;
  }
  return g;
}
export function genesText(g) {
  const lvl = (v) => (v > 0.75 ? 'very high' : v > 0.55 ? 'high' : v > 0.4 ? 'medium' : v > 0.2 ? 'low' : 'very low');
  return GENE_KEYS.map((k) => `${k} ${lvl(g[k])}`).join(', ');
}
// learned need thresholds: start at CRITICAL, grow every time neglect hurts the agent
export const freshLearn = () => Object.fromEntries(NEED_KEYS.map((k) => [k, 1]));
export const warnAt = (a, k) => Math.min(65, CRITICAL * (a.learn?.[k] || 1) * (0.8 + (a.genes?.caution ?? 0.5) * 0.6));

export const CRIMES = { steal: 'theft', rob: 'robbery', beg: 'begging', destroy: 'vandalism', trespass: 'trespassing', curfew: 'curfew violation', fight: 'fighting' };

export function freshNeeds(rng = Math.random) {
  const n = {};
  for (const k of NEED_KEYS) n[k] = 45 + Math.floor(rng() * 50);
  return n;
}
export function mood(needs) {
  const v = NEED_KEYS.reduce((s, k) => s + needs[k], 0) / NEED_KEYS.length;
  const min = Math.min(...NEED_KEYS.map((k) => needs[k]));
  const score = v * 0.7 + min * 0.3;
  const face = score > 75 ? '😄' : score > 58 ? '🙂' : score > 42 ? '😐' : score > 25 ? '😟' : '😫';
  return { score: Math.round(score), face };
}
export function clampSatisfies(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const k of NEED_KEYS) {
    const v = Number(obj[k]);
    if (v) out[k] = Math.max(-30, Math.min(60, Math.round(v)));
  }
  return out;
}
export const satisfiesText = (s) => Object.entries(s || {}).map(([k, v]) => `${NEEDS[k]?.emoji || k}${v > 0 ? '+' : ''}${v}`).join(' ');
