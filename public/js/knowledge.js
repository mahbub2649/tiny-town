// Knowledge mixin: library (real books via Wikipedia, live AI-research journals, agent-written works),
// internet search, writing papers, prayers to god, reflection, memory bank and anti-repetition helpers.
import { newId } from './world.js';
import { AI, parseJSON } from './ai.js';
import { News } from './services.js';

const clean = (s, n = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const first = (a) => a.name.split(' ')[0];

export const SEED_BOOKS = [
  ['The Evolution of Cooperation', 'Evolution of cooperation'], ['Game Theory: A Primer', 'Game theory'], ["The Prisoner's Dilemma", "Prisoner's dilemma"],
  ['The Selfish Gene', 'The Selfish Gene'], ['On the Origin of Species', 'On the Origin of Species'], ['Genetic Algorithms', 'Genetic algorithm'],
  ['Social Contract Theory', 'Social contract'], ['Tragedy of the Commons', 'Tragedy of the commons'], ["Maslow's Hierarchy of Needs", "Maslow's hierarchy of needs"],
  ['Introduction to Economics', 'Economics'], ['Inflation Explained', 'Inflation'], ['Universal Basic Income', 'Universal basic income'],
  ['Democracy', 'Democracy'], ['Voting Systems', 'Electoral system'], ['The Republic (Plato)', 'Republic (Plato)'],
  ['Stoicism', 'Stoicism'], ['Utilitarianism', 'Utilitarianism'], ['Love and Attachment Theory', 'Attachment theory'],
  ['Jealousy', 'Jealousy'], ['Altruism', 'Altruism'], ["Dunbar's Number", "Dunbar's number"],
  ['Artificial Intelligence', 'Artificial intelligence'], ['Large Language Models', 'Large language model'], ['Reinforcement Learning', 'Reinforcement learning'],
  ['Multi-agent Systems', 'Multi-agent system'], ['Emergence', 'Emergence'], ['Complex Systems', 'Complex system'],
  ['Quantum Mechanics', 'Quantum mechanics'], ['Thermodynamics', 'Thermodynamics'], ['General Relativity', 'General relativity'],
  ['Agriculture', 'Agriculture'], ['Medicine', 'Medicine'], ['History of Writing', 'History of writing'],
  ['Religion', 'Religion'], ['Philosophy of Mind', 'Philosophy of mind'], ['Consciousness', 'Consciousness'],
  ['Crime and Punishment (novel)', 'Crime and Punishment'], ['Pride and Prejudice', 'Pride and Prejudice'], ['Moby-Dick', 'Moby-Dick'],
];
const WRITE_EMOJI = { paper: '📄', essay: '📝', poem: '📜', story: '📖', letter: '✉️', manifesto: '📢', law: '⚖️' };

export const Knowledge = {
  initLibrary() {
    this.library = { books: SEED_BOOKS.map(([title, topic]) => ({ id: newId('bk'), kind: 'book', title, topic, author: 'Classic', reads: 0 })) };
    this.prayers = [];
  },
  addJournals(items) {
    for (const n of items.filter((i) => i.cat === 'ai-research')) {
      if (this.library.books.some((b) => b.id === n.id)) continue;
      this.library.books.push({ id: n.id, kind: 'journal', title: n.title, abstract: n.desc, author: n.source, reads: 0, t: this.time });
    }
    const journals = this.library.books.filter((b) => b.kind === 'journal');
    if (journals.length > 60) this.library.books = this.library.books.filter((b) => b.kind !== 'journal' || journals.indexOf(b) >= journals.length - 60);
  },
  libraryText(a) {
    const works = this.library.books.filter((b) => b.by).slice(-4).map((b) => `"${b.title}" (${b.kind} by ${b.by})`).join('; ');
    const journals = this.library.books.filter((b) => b.kind === 'journal' && !a.readBooks.includes(b.id)).slice(-3).map((b) => `"${b.title.slice(0, 80)}"`).join('; ');
    return `Town-written works: ${works || 'none yet'}. New AI research journals: ${journals || 'none'}.`;
  },

  // ---------- memory bank ----------
  addBank(a, text, imp = 4, kind = 'core') {
    text = clean(text, 400);
    a.bank ||= [];
    if (a.bank.some((m) => m.text === text)) return;
    a.bank.push({ t: this.time, text, imp, kind });
    if (a.bank.length > 50) {
      let idx = -1, best = Infinity;
      a.bank.forEach((m, i) => { if (m.kind === 'lesson' && a.bank.filter((q) => q.kind === 'lesson').length < 8) return; const s = m.imp * 100 + i; if (s < best) { best = s; idx = i; } });
      if (idx >= 0) a.bank.splice(idx, 1);
    }
  },
  bankText(a, n = 10) {
    const lessons = a.bank.filter((m) => m.kind === 'lesson').slice(-4);
    const other = a.bank.filter((m) => m.kind !== 'lesson').slice(-n);
    return [...lessons, ...other].map((m) => `- (${m.kind}) ${m.text}`).join('\n') || '- (empty)';
  },

  // ---------- reading / search / writing ----------
  async read(a, title) {
    const loc = this.locOf(a);
    const books = this.library.books;
    let b = title && !/^(any|random|something|a book)$/i.test(title)
      ? books.find((x) => x.title.toLowerCase() === String(title).toLowerCase()) || books.find((x) => x.title.toLowerCase().includes(String(title).toLowerCase()) || String(title).toLowerCase().includes(x.title.toLowerCase()))
      : null;
    if (!b) {
      const unread = books.filter((x) => !a.readBooks.includes(x.id));
      const curious = a.genes?.curiosity ?? 0.5;
      const pool = unread.filter((x) => (Math.random() < curious ? x.kind !== 'book' : x.kind === 'book'));
      b = (pool.length ? pool : unread.length ? unread : books)[Math.floor(Math.random() * (pool.length || unread.length || books.length))];
    }
    if (!b) return;
    if (loc?.kind !== 'library' && b.kind === 'book' && !a.inventory.some((i) => i.name === b.title)) {
      this.remember(a, `I wanted to read "${b.title}" but books are at the Town Library.`, 1);
      return;
    }
    b.reads++;
    a.readBooks.push(b.id);
    if (a.readBooks.length > 120) a.readBooks.shift();
    let content = b.abstract || '';
    if (b.kind === 'book') {
      try { const r = await fetch(`/api/book?topic=${encodeURIComponent(b.topic)}`); const d = await r.json(); content = d.extract || ''; } catch { content = ''; }
    }
    a.stats.read++;
    a.needs.fun = Math.min(100, a.needs.fun + 8);
    this.remember(a, `I read "${b.title}" (${b.kind}${b.by ? ` by ${b.by}` : ''}): ${clean(content, 380)}`, 3);
    this.addBank(a, `Knowledge from "${b.title}": ${clean(content, 220)}`, 4, 'knowledge');
    if (b.byId && b.byId !== a.id) { const au = this.agent(b.byId); if (au) { this.bump(a, au, 3); this.remember(au, `${a.name} read my ${b.kind} "${b.title}".`, 2); } }
    this.log('knowledge', `📖 ${a.name} read "${b.title}" (${b.kind}${b.by ? ` by ${b.by}` : b.author ? `, ${b.author}` : ''})`, [a.id]);
  },
  async search(a, q) {
    q = clean(q, 100);
    if (!q) return;
    const loc = this.locOf(a);
    void loc;
    if (this.time < this.powerOutUntil) { this.remember(a, `The internet is down (power outage) – couldn't search "${q}".`, 2); return; }
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      const res = (d.results || []).slice(0, 5);
      const txt = res.map((x, i) => `${i + 1}) [${x.source}] ${x.title}: ${clean(x.snippet, 140)}`).join(' ');
      a.stats.searches++;
      this.remember(a, `I searched the internet for "${q}": ${txt || 'nothing useful found'}`, 3);
      if (res[0]) this.addBank(a, `Web knowledge on "${q}": ${clean(res.slice(0, 2).map((x) => `${x.title} – ${x.snippet}`).join('; '), 260)}`, 4, 'knowledge');
      this.log('knowledge', `🔍 ${a.name} searched "${q}" → ${res.map((x) => x.title).slice(0, 3).join(' | ') || 'no results'}`, [a.id]);
    } catch { this.remember(a, `The internet was down when I searched for "${q}".`, 1); }
  },
  write(a, spec) {
    if (!spec || typeof spec !== 'object') spec = { title: String(spec || '') };
    const title = clean(spec.title, 90);
    if (!title) return;
    const kind = WRITE_EMOJI[spec.kind] ? spec.kind : 'paper';
    const content = clean(spec.content || spec.abstract || spec.text, 700);
    const work = { id: newId('wk'), kind, title, abstract: content, by: a.name, byId: a.id, author: a.name, reads: 0, t: this.time, field: clean(spec.field, 40) };
    if (kind !== 'letter') this.library.books.push(work);
    const item = { name: title.slice(0, 40), emoji: WRITE_EMOJI[kind], desc: `${kind} by ${a.name}: ${content.slice(0, 200)}`, carry: true, satisfies: {}, madeBy: a.name };
    if (!this.invFull(a)) a.inventory.push(item);
    a.stats.papers++;
    a.needs.fun = Math.min(100, a.needs.fun + 10);
    this.remember(a, `I wrote a ${kind}: "${title}" – ${content}`, 4);
    this.addBank(a, `I authored the ${kind} "${title}": ${content.slice(0, 200)}`, 4, 'work');
    for (const w of this.witnesses(a)) this.remember(w, `${a.name} finished writing a ${kind} called "${title}".`, 2);
    this.log('knowledge', `${WRITE_EMOJI[kind]} ${a.name} wrote a ${kind}: "${title}" – ${content.slice(0, 220)}`, [a.id]);
  },

  // ---------- prayer ----------
  pray(a, text) {
    text = clean(text, 400);
    if (!text) return;
    if (this.time - (a.lastPrayAt ?? -1e9) < 120) return;
    a.lastPrayAt = this.time;
    const atChapel = this.locOf(a)?.kind === 'temple';
    const p = { id: newId('pr'), agentId: a.id, name: a.name, text, t: this.time, where: this.locName(a), answer: null, read: false };
    this.prayers.push(p);
    if (this.prayers.length > 300) this.prayers.shift();
    a.stats.prayers++;
    a.needs.fun = Math.min(100, a.needs.fun + (atChapel ? 10 : 4));
    this.remember(a, `I prayed to God: "${text}"`, 3);
    this.log('prayer', `🙏 ${a.name} prays${atChapel ? ' at the Chapel' : ''}: "${text}"`, [a.id]);
    this.onPrayer?.(p);
  },
  answerPrayer(p, text) {
    const a = this.agent(p.agentId);
    p.answer = clean(text, 500); p.answeredAt = this.time; p.read = true;
    if (!a) return;
    this.remember(a, `GOD ANSWERED MY PRAYER ("${p.text.slice(0, 80)}"): "${p.answer}"`, 5);
    this.addBank(a, `God spoke to me: "${p.answer}"`, 5, 'divine');
    a.genes.faith = Math.min(1, (a.genes.faith ?? 0.5) + 0.05);
    a.say = '✨🙏'; a.sayUntil = this.now + 4;
    this.log('god', `✨ God answered ${a.name}: "${p.answer}"`, [a.id]);
    this.interrupt(a);
  },
  bless(a) {
    for (const k of Object.keys(a.needs)) a.needs[k] = Math.min(100, a.needs[k] + 40);
    a.health = Math.min(100, a.health + 30);
    this.remember(a, 'I suddenly feel blessed – full of energy, health and joy!', 5);
    this.log('god', `🌟 God blessed ${a.name}`, [a.id]);
  },
  smite(a) {
    a.health = Math.max(1, a.health - 30);
    a.needs.fun = Math.max(0, a.needs.fun - 30);
    this.remember(a, 'A bolt of divine wrath struck me! I must have angered God.', 5);
    this.addBank(a, 'God punished me with a lightning bolt. I should reflect on my behaviour.', 5, 'divine');
    for (const w of this.witnesses(a, 8)) this.remember(w, `Lightning struck ${a.name} out of nowhere!`, 4);
    this.log('god', `⚡ God smote ${a.name}`, [a.id]);
  },

  // ---------- reflection (periodic higher-level thinking → memory bank, new aspirations) ----------
  async reflect(a) {
    if (!AI.enabled || a.reflecting) return;
    a.reflecting = true;
    a.lastReflectAt = this.time;
    try {
      const recent = a.memories.slice(-20).map((m) => `- ${m.text}`).join('\n');
      const res = await AI.chat(this.tierFor(a), [
        { role: 'system', content: `You are the inner voice of ${a.name} (${a.gender || 'person'}, ${a.age}). Persona: ${a.persona}` },
        { role: 'user', content: `Memory bank:\n${this.bankText(a, 8)}\nRecent experiences:\n${recent}\n\nReflect deeply. What patterns, social dynamics or truths have you noticed? What new idea, theory or project could you pursue (something NOT done before)? What should you change? Reply JSON {"insights":["...","..."],"aspiration":"a fresh personal ambition","lesson":"a behavioural rule for yourself or null","research_question":"a question you'd like to investigate or null"}` },
      ], 320, 1.0, 'reflect');
      const j = parseJSON(res.content);
      if (!j) return;
      for (const ins of (Array.isArray(j.insights) ? j.insights : []).slice(0, 3)) this.addBank(a, `Insight: ${ins}`, 4, 'reflection');
      if (j.lesson && j.lesson !== 'null') this.addBank(a, `LESSON: ${j.lesson}`, 4, 'lesson');
      if (j.aspiration && j.aspiration !== 'null') a.aspiration = clean(j.aspiration, 200);
      if (j.research_question && j.research_question !== 'null') a.question = clean(j.research_question, 200);
      this.log('reflect', `🪞 ${a.name} reflected: ${clean((j.insights || [])[0], 160)}${a.aspiration ? ` | new aspiration: ${a.aspiration}` : ''}`, [a.id]);
    } catch { /* ignore */ } finally { a.reflecting = false; }
  },

  // ---------- anti-repetition ----------
  spark(a) {
    const crisis = a.health < 45 || a.money < 5 || Object.values(a.needs).some((v) => v < 10) || a.memories.slice(-6).some((m) => /died|broke up|robbed|divorc|jail|fined|rejected/i.test(m.text));
    if (Math.random() < (crisis ? 0.35 : 0.06) + (a.genes?.faith ?? 0.5) * 0.12) return crisis ? 'praying to God for help with your troubles (God reads prayers)' : 'saying a prayer to God about something meaningful to you';
    const r = Math.random();
    if (r < 0.25 && News.items.length) { const n = News.items[Math.floor(Math.random() * News.items.length)]; return `a ${n.cat === 'ai-research' ? 'new AI research paper' : 'news story'}: "${n.title}"`; }
    if (r < 0.45) { const b = this.library.books[Math.floor(Math.random() * this.library.books.length)]; return `the ${b.kind} "${b.title}" at the library`; }
    if (r < 0.6 && a.question) return `your research question: ${a.question}`;
    if (r < 0.75) { const o = this.agents[Math.floor(Math.random() * this.agents.length)]; if (o && o !== a) return `what ${o.name} is up to lately (${o.action?.text || 'unknown'})`; }
    const q = ['a business idea', 'a fear you have', 'a childhood memory', 'something that annoys you about the town', 'an invention', 'a philosophical question', 'a secret crush or grudge', 'a rule the town should change', 'a scientific mystery', 'a gift for someone'];
    return q[Math.floor(Math.random() * q.length)];
  },
  similar(s1, s2) {
    const w = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter((x) => x.length > 3));
    const A = w(s1), B = w(s2);
    if (!A.size || !B.size) return 0;
    let n = 0; for (const x of A) if (B.has(x)) n++;
    return n / Math.min(A.size, B.size);
  },
  isRepeat(a, text) { return (a.recentSaid || []).some((s) => this.similar(s, text) > 0.6); },
  noteSaid(a, text) { (a.recentSaid ||= []).push(text); if (a.recentSaid.length > 14) a.recentSaid.shift(); },
  noteAct(a, text) { (a.recentActs ||= []).push(text); if (a.recentActs.length > 8) a.recentActs.shift(); },
};
export { first };
