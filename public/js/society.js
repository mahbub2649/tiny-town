// Society mixin: relationship matrix & types, romance/jealousy, crime & law, government & elections,
// health punishment, learning and the genetic algorithm (births / deaths / generations).
import { newId } from './world.js';
import { NEEDS, NEED_KEYS, GENE_KEYS, crossover, freshLearn, warnAt, mood, CRIMES } from './needs.js';
import { randomColors } from './sprites.js';
import { AI, parseJSON } from './ai.js';
import { findPath as findPathFn } from './pathfind.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const first = (a) => a.name.split(' ')[0];
const NAMES = {
  female: ['Ava', 'Lena', 'Maya', 'Iris', 'Nora', 'Zoe', 'Hana', 'Clara', 'Leila', 'Sofia', 'Yara', 'Mei', 'Ruby', 'Tessa', 'Amara'],
  male: ['Leo', 'Noah', 'Eli', 'Omar', 'Finn', 'Ravi', 'Theo', 'Ivan', 'Kai', 'Milo', 'Jonah', 'Tariq', 'Hugo', 'Sami', 'Arlo'],
};

export const Society = {
  // ---------- relationships ----------
  rel(a, b) { return (a.rel[b.id] ||= { score: 0, attraction: 0, met: false, talks: 0 }); },
  bump(a, b, dScore = 0, dAttr = 0) {
    const r = this.rel(a, b);
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    r.score = clamp(num(r.score) + num(dScore), -100, 100);
    r.attraction = clamp(num(r.attraction) + num(dAttr), 0, 100);
    return r;
  },
  relType(a, b) {
    const R = a.romance || {};
    if (R.partner === b.id) {
      const g = b.gender;
      if (R.status === 'married') return g === 'female' ? 'wife' : g === 'male' ? 'husband' : 'spouse';
      return g === 'female' ? 'girlfriend' : g === 'male' ? 'boyfriend' : 'partner';
    }
    if ((a.parents || []).includes(b.id)) return b.gender === 'female' ? 'mother' : b.gender === 'male' ? 'father' : 'parent';
    if ((b.parents || []).includes(a.id)) return b.gender === 'female' ? 'daughter' : b.gender === 'male' ? 'son' : 'child';
    if ((a.exes || []).includes(b.id)) return 'ex';
    const r = a.rel[b.id];
    if (!r || !r.met) return 'stranger';
    if (r.score >= 70) return 'best friend';
    if (r.score >= 35) return 'friend';
    if (r.score <= -60) return 'enemy';
    if (r.score <= -25) return 'rival';
    return 'acquaintance';
  },
  partnerOf(a) { return a.romance?.partner ? this.agent(a.romance.partner) : null; },

  setCouple(a, b, status) {
    a.romance = { partner: b.id, status }; b.romance = { partner: a.id, status };
  },
  breakUp(a, b, why = '') {
    const married = a.romance?.status === 'married';
    a.romance = { partner: null, status: null }; b.romance = { partner: null, status: null };
    (a.exes ||= []).push(b.id); (b.exes ||= []).push(a.id);
    this.bump(a, b, -10); this.bump(b, a, -10);
    for (const x of [a, b]) { x.needs.fun = Math.max(0, x.needs.fun - 25); x.needs.romance = Math.max(0, x.needs.romance - 30); }
    this.remember(a, `${b.name} and I ${married ? 'divorced' : 'broke up'}. ${why}`, 5);
    this.remember(b, `${a.name} and I ${married ? 'divorced' : 'broke up'}. ${why}`, 5);
    this.log('romance', `💔 ${a.name} and ${b.name} ${married ? 'got divorced' : 'broke up'}! ${why}`, [a.id, b.id]);
  },

  // jealousy: P sees/hears that their partner X flirted with Y
  jealous(P, X, Y, how = 'saw') {
    const k = 0.5 + (P.genes?.passion ?? 0.5);
    this.bump(P, X, -10 * k); this.bump(P, Y, -18 * k);
    P.needs.fun = Math.max(0, P.needs.fun - 15);
    this.remember(P, `I ${how} my ${this.relType(P, X)} ${X.name} flirting with ${Y.name}! I'm jealous and hurt.`, 5);
    this.log('romance', `💢 ${P.name} is jealous: ${how} ${first(X)} flirting with ${first(Y)}`, [P.id, X.id, Y.id]);
    if (!P.convoId && !P.asleep) this.interrupt(P);
    if (this.rel(P, X).score < -15) this.breakUp(P, X, `Jealousy over ${first(Y)}.`);
  },

  applyFeelings(sp, ls, r) {
    const f = clamp(Number(r.feeling) || 0, -3, 3);
    const R = this.bump(sp, ls, f * 3 + 0.5);
    R.met = true;
    if (r.flirt === true) {
      this.bump(sp, ls, 0, 7);
      const back = this.rel(ls, sp);
      const committed = !!ls.romance?.partner && ls.romance.partner !== sp.id;
      const receptive = (back.score > 5 || back.attraction > 10) && (!committed || Math.random() < (ls.genes?.passion ?? 0.5) * 0.5);
      if (receptive) { this.bump(ls, sp, 1, 4); ls.needs.romance = Math.min(100, ls.needs.romance + 8); sp.needs.romance = Math.min(100, sp.needs.romance + 10); }
      else this.bump(ls, sp, -2);
      this.log('romance', `😘 ${sp.name} flirted with ${ls.name}${receptive ? ' – and it landed' : ' – awkward…'}`, [sp.id, ls.id]);
      // jealousy: partners of either party
      for (const [X, Y] of [[sp, ls], [ls, sp]]) {
        if (X === ls && !receptive) continue;
        const P = this.partnerOf(X);
        if (!P || P === Y) continue;
        if (!P.asleep && Math.hypot(P.x - X.x, P.y - X.y) < 9) this.jealous(P, X, Y, 'saw');
        else for (const w of this.witnesses(X, 6)) if (w !== Y && w !== P) {
          this.remember(w, `GOSSIP: I saw ${X.name} flirting with ${Y.name}, even though ${first(X)} is with ${P.name}!`, 4);
          w.memories[w.memories.length - 1].gossip = { subj: X.id, with: Y.id, victim: P.id };
        }
      }
    }
    const back = this.rel(ls, sp);
    if (!sp.romance?.partner && !ls.romance?.partner && R.attraction >= 40 && back.attraction >= 40 && R.score >= 15 && back.score >= 15) {
      this.setCouple(sp, ls, 'dating');
      this.remember(sp, `${ls.name} and I are now dating! 💕`, 5);
      this.remember(ls, `${sp.name} and I are now dating! 💕`, 5);
      for (const w of this.witnesses(sp, 8)) this.remember(w, `${sp.name} and ${ls.name} just became a couple!`, 3);
      this.log('romance', `💕 ${sp.name} and ${ls.name} are now dating!`, [sp.id, ls.id]);
    } else if (sp.romance?.partner === ls.id && (R.score < -15 || back.score < -15)) {
      this.breakUp(sp, ls, 'Too many fights.');
    }
    if (f <= -3) this.log('talk', `😠 ${sp.name} is upset with ${ls.name}`, [sp.id, ls.id]);
  },

  // gossip spreads after conversations; may trigger delayed jealousy
  spreadGossip(x, y) {
    for (const m of x.memories.filter((q) => q.gossip).slice(-3)) {
      const { subj, with: w, victim } = m.gossip;
      if (y.id === victim && Math.random() < 0.6) {
        const X = this.agent(subj), Y = this.agent(w);
        if (X && Y && y.romance?.partner === X.id) { this.jealous(y, X, Y, `heard from ${first(x)} about`); m.gossip = null; }
      } else if (y.id !== subj && Math.random() < 0.4 && !y.memories.some((q) => q.text === m.text)) {
        this.remember(y, `${first(x)} told me: ${m.text.replace(/^GOSSIP: I saw/, 'they saw')}`, 3);
        y.memories[y.memories.length - 1].gossip = { ...m.gossip };
      }
    }
  },

  // consensual intimacy between adult characters (off-screen); affairs, gossip, jealousy and pregnancy can follow
  resolveIntimacy(a, b, accepted) {
    if (!accepted) {
      this.bump(a, b, -3, -4);
      this.remember(a, `${b.name} wasn't in the mood / said no to being intimate. I respect that.`, 3);
      this.remember(b, `${a.name} wanted to be intimate; I said no.`, 3);
      this.log('romance', `🙅 ${b.name} declined ${a.name}'s advances`, [a.id, b.id]);
      return;
    }
    const affair = [a, b].map((x) => this.partnerOf(x)).find((P) => P && P !== a && P !== b);
    for (const [x, y] of [[a, b], [b, a]]) {
      x.needs.romance = Math.min(100, x.needs.romance + 60); x.needs.fun = Math.min(100, x.needs.fun + 15); x.needs.social = Math.min(100, x.needs.social + 10);
      this.bump(x, y, 6, 8);
      this.remember(x, `I spent an intimate night with ${y.name}.${affair ? ' Nobody can find out…' : ''}`, 5);
    }
    a.stats.intimacy = (a.stats.intimacy || 0) + 1; b.stats.intimacy = (b.stats.intimacy || 0) + 1;
    this.log('romance', affair ? `🔥 ${a.name} and ${b.name} had a secret affair (behind ${affair.name}'s back)` : `💞 ${a.name} and ${b.name} spent an intimate night together`, [a.id, b.id]);
    if (!a.romance?.partner && !b.romance?.partner && this.rel(a, b).attraction >= 30 && this.rel(b, a).attraction >= 30) this.setCouple(a, b, 'dating');
    if (affair) {
      const cheater = this.partnerOf(a) === affair ? a : b, other = cheater === a ? b : a;
      for (const w of this.witnesses(cheater, 7)) if (w !== other && w !== affair) { this.remember(w, `GOSSIP: I saw ${cheater.name} sneaking off with ${other.name}, even though ${cheater.name.split(' ')[0]} is with ${affair.name}!`, 4); w.memories[w.memories.length - 1].gossip = { subj: cheater.id, with: other.id, victim: affair.id }; }
      if (Math.random() < 0.2) this.jealous(affair, cheater, other, 'caught');
    }
    // pregnancy → a child (genetic algorithm)
    if (a.gender && b.gender && a.gender !== b.gender && Math.random() < 0.12 && this.agents.length < this.popCap) {
      this.log('birth', `🤰 ${a.gender === 'female' ? a.name : b.name} is expecting a child with ${a.gender === 'female' ? b.name : a.name}!`, [a.id, b.id]);
      setTimeout(() => this.reproduce('pregnancy', [a, b]), 1500);
    }
    // they go home together for a while
    const home = this.world.findLocation(a.home);
    const bed = home && this.world.findObject('bed', home, a.x, a.y);
    for (const x of [a, b]) {
      x.action = { text: `Private time with ${(x === a ? b : a).name.split(' ')[0]}`, emoji: '💞', dest: home?.name, minutes: 90, started: false, until: this.time, obj: bed, intimate: true };
      if (bed) x.path = findPathFn(this.world, x.x, x.y, bed.stand.x, bed.stand.y) || [];
    }
  },
  resolveProposal(a, b, accepted) {
    if (a.romance?.partner !== b.id) { this.remember(a, `I proposed to ${b.name} but we weren't even together. Awkward.`, 3); return; }
    const r = this.rel(b, a);
    const yes = accepted ?? (r.score >= 40 && r.attraction >= 50);
    if (yes) {
      this.setCouple(a, b, 'married');
      this.remember(a, `${b.name} said YES! We are married now 💍`, 5);
      this.remember(b, `I married ${a.name} 💍`, 5);
      this.broadcast(`💍 ${a.name} and ${b.name} just got married! Celebration at the Chapel of Dawn!`, 'romance');
    } else {
      this.bump(a, b, -8);
      this.remember(a, `${b.name} rejected my marriage proposal. 💔`, 5);
      this.log('romance', `💔 ${b.name} turned down ${a.name}'s proposal`, [a.id, b.id]);
    }
  },

  // ---------- crime & law ----------
  lawFor(kind) { return this.gov.laws.find((l) => l.bans === kind); },
  crime(a, kind, aware) {
    const law = this.lawFor(kind);
    if (!law) return false;
    const rep = aware.filter((x) => x && x !== a && !x.dead);
    if (!rep.length) { this.remember(a, `Nobody saw my ${CRIMES[kind]}. I got away with it.`, 3); return false; }
    a.money -= law.fine;
    this.gov.treasury += law.fine;
    a.record.crimes++; a.record.fines += law.fine;
    this.remember(a, `I was fined $${law.fine} for ${CRIMES[kind]} (law: "${law.text}"). Reported by ${rep.map(first).join(', ')}.`, 5);
    this.addBank(a, `LESSON: Breaking the law ("${law.text}") cost me $${law.fine}${a.record.crimes >= 2 ? ' and my reputation' : ''}.`, 5, 'lesson');
    for (const x of rep) this.bump(x, a, -8);
    const leader = this.agent(this.gov.leaderId);
    if (leader && leader !== a) this.remember(leader, `${a.name} was fined $${law.fine} for ${CRIMES[kind]}.`, 3);
    this.log('law', `⚖️ ${a.name} fined $${law.fine} for ${CRIMES[kind]} (reported by ${rep.map(first).join(', ')})${a.money < 0 ? ` – now in debt $${-a.money.toFixed(0)}` : ''}`, [a.id]);
    if (a.record.crimes >= 3 && (kind === 'steal' || kind === 'rob')) this.jail(a, 300);
    return true;
  },
  jail(a, minutes) {
    const hall = this.world.findLocation('Town Hall');
    if (a.convoId) this.endConvo(this.convos.find((c) => c.id === a.convoId), true);
    a.path = []; a.talkTarget = null;
    if (hall) { const s = this.world.randomSpotIn(hall); a.x = s.x + 0.5; a.y = s.y + 0.5; }
    a.jailedUntil = this.time + minutes;
    a.action = { text: 'Locked up in the Town Hall cell', emoji: '⛓️', minutes, started: true, until: this.time + minutes, forced: true };
    this.remember(a, `I was jailed for ${Math.round(minutes / 60)} hours for repeated crimes.`, 5);
    this.addBank(a, 'LESSON: Repeated crime landed me in jail.', 5, 'lesson');
    this.broadcast(`${a.name} was jailed by the town for repeated crimes.`, 'law');
  },

  steal(a, b, what) {
    const wit = this.witnesses(a, 5).filter((w) => w !== b);
    let chance = 0.5 + (b.asleep ? 0.3 : 0) - 0.1 * wit.length + (1 - (a.genes?.honesty ?? 0.5)) * 0.15;
    const ok = Math.random() < clamp(chance, 0.05, 0.9);
    let loot = '';
    if (ok) {
      const item = what && !/money|cash|wallet/i.test(what) ? b.inventory.find((i) => i.name.toLowerCase().includes(String(what).toLowerCase())) : null;
      if (item && !this.invFull(a)) { b.inventory = b.inventory.filter((i) => i !== item); a.inventory.push(item); loot = `${item.emoji} ${item.name}`; }
      else {
        const amt = Math.round(Math.min(Math.max(0, b.money), 5 + Math.max(0, b.money) * 0.25, 40));
        if (amt > 0) { b.money -= amt; a.money += amt; loot = `$${amt}`; }
      }
    }
    a.stats.stolen++;
    const victimNoticed = !b.asleep && Math.random() < (ok ? 0.3 : 0.85);
    const noticed = wit.filter(() => Math.random() < 0.5);
    if (victimNoticed) { noticed.push(b); this.bump(b, a, -35); this.remember(b, `${a.name} tried to steal from me${ok ? ` and took ${loot}` : ''}!`, 5); }
    else if (ok) this.remember(b, `I think something is missing (${loot})... someone stole from me.`, 4);
    for (const w of noticed) if (w !== b) { this.bump(w, a, -12); this.remember(w, `I saw ${a.name} steal from ${b.name}!`, 4); w.memories[w.memories.length - 1].gossip = null; }
    this.remember(a, ok ? `I stole ${loot || 'nothing worth much'} from ${b.name}.${noticed.length ? ' I was seen!' : ''}` : `I failed to steal from ${b.name}.${noticed.length ? ' I was caught!' : ''}`, 4);
    this.log('crime', `🦹 ${a.name} ${ok ? `stole ${loot || 'nothing'} from` : 'tried and failed to steal from'} ${b.name}${noticed.length ? ` (seen by ${noticed.map(first).join(', ')})` : ' (unseen)'}`, [a.id, b.id]);
    this.crime(a, 'steal', noticed);
  },
  rob(a, b) {
    const wit = this.witnesses(a, 6).filter((w) => w !== b);
    const amt = Math.round(Math.min(Math.max(0, b.money) * 0.5, 60));
    let loot = amt > 0 ? `$${amt}` : '';
    if (amt > 0) { b.money -= amt; a.money += amt; }
    else if (b.inventory.length && !this.invFull(a)) { const it = b.inventory.shift(); a.inventory.push(it); loot = `${it.emoji} ${it.name}`; }
    a.stats.stolen++;
    this.bump(b, a, -60);
    b.needs.fun = Math.max(0, b.needs.fun - 30); b.health = Math.max(1, b.health - 5);
    this.remember(b, `${a.name} ROBBED me and took ${loot || 'nothing'}! I'm scared and angry.`, 5);
    this.remember(a, `I robbed ${b.name} and took ${loot || 'nothing'}.`, 4);
    for (const w of wit) { this.bump(w, a, -25); this.remember(w, `I witnessed ${a.name} rob ${b.name}!`, 5); }
    this.log('crime', `🔪 ${a.name} ROBBED ${b.name} ${this.at(a)} and took ${loot || 'nothing'}!`, [a.id, b.id]);
    this.crime(a, 'rob', [b, ...wit]);
  },
  donate(a, to, amount) {
    amount = Math.round(clamp(Number(amount) || 0, 0, Math.max(0, a.money)));
    if (!amount) return;
    const t = String(to || '').toLowerCase();
    a.money -= amount; a.stats.donated += amount;
    if (/town|treasury|hall|city/.test(t)) { this.gov.treasury += amount; this.log('money', `💝 ${a.name} donated $${amount} to the town treasury`, [a.id]); }
    else if (/chapel|church|temple|god|pastor/.test(t)) {
      this.chapelFund += amount;
      this.log('money', `💝 ${a.name} donated $${amount} to the Chapel of Dawn`, [a.id]);
    } else {
      const b = this.agentByName(to);
      if (!b || b === a) { a.money += amount; a.stats.donated -= amount; return; }
      b.money += amount; this.bump(b, a, 6 + amount / 5);
      this.remember(b, `${a.name} generously donated $${amount} to me.`, 4);
      this.log('money', `💝 ${a.name} donated $${amount} to ${b.name}`, [a.id, b.id]);
    }
    for (const w of this.witnesses(a, 6)) this.bump(w, a, 2);
    this.remember(a, `I donated $${amount} to ${to}.`, 3);
  },

  // ---------- government ----------
  initGov() {
    const mayor = this.agentByName('Grace Kim') || this.agents[0];
    this.gov = {
      leaderId: mayor?.id || null, title: 'Mayor', taxRate: 0.1, treasury: 250, candidates: [],
      laws: [
        { id: newId('law'), text: 'Theft is forbidden.', bans: 'steal', fine: 30, by: 'Founders', t: 0 },
        { id: newId('law'), text: 'Robbery is a serious crime.', bans: 'rob', fine: 80, by: 'Founders', t: 0 },
        { id: newId('law'), text: 'Vandalism of property is forbidden.', bans: 'destroy', fine: 25, by: 'Founders', t: 0 },
      ],
      nextElection: (Math.floor(this.time / 1440) + 3) * 1440 + 12 * 60, electionEvery: 3 * 1440, history: [], lastDecreeAt: -1e9,
    };
    if (mayor) this.makeLeader(mayor, true);
  },
  leader() { return this.agent(this.gov.leaderId); },
  makeLeader(a, silent = false) {
    const old = this.leader();
    if (old && old !== a && old.prevJob) { old.job = old.prevJob; old.prevJob = null; }
    this.gov.leaderId = a.id;
    if (a.job.title !== 'Mayor') { a.prevJob = a.job; a.job = { title: 'Mayor', place: 'Town Hall', wage: 14 }; }
    this.addBank(a, `I am the ${this.gov.title} of the town. I can make and repeal laws, set taxes and give grants.`, 5, 'core');
    if (!silent) this.broadcast(`${a.name} is now the ${this.gov.title} of Willowbrook!`, 'law');
  },
  lawsText() {
    const g = this.gov;
    return g.laws.map((l, i) => `${i + 1}. "${l.text}"${l.bans !== 'none' ? ` [bans ${l.bans}, fine $${l.fine}]` : ''}`).join(' ') || 'no laws';
  },
  decree(a, j) {
    const g = this.gov;
    if (a.id !== g.leaderId) return;
    if (this.time - g.lastDecreeAt < 180) return;
    let did = false;
    const law = j.law && typeof j.law === 'object' ? j.law : (typeof j.law === 'string' ? { text: j.law } : null);
    if (law?.text) {
      const bans = Object.keys(CRIMES).includes(String(law.bans)) ? String(law.bans) : 'none';
      const fine = Math.round(clamp(Number(law.fine) || 20, 0, 300));
      const nl = { id: newId('law'), text: String(law.text).slice(0, 160), bans, fine, by: a.name, t: this.time };
      g.laws = g.laws.filter((l) => !(bans !== 'none' && l.bans === bans));
      g.laws.push(nl);
      if (g.laws.length > 12) g.laws.shift();
      this.broadcast(`📜 New law by ${g.title} ${a.name}: "${nl.text}"${bans !== 'none' ? ` (${CRIMES[bans]} fine: $${fine})` : ''}`, 'law');
      did = true;
    }
    if (j.repeal != null && j.repeal !== '' && j.repeal !== 'null') {
      const n = Number(j.repeal);
      const idx = Number.isInteger(n) && n >= 1 ? n - 1 : g.laws.findIndex((l) => l.text.toLowerCase().includes(String(j.repeal).toLowerCase()));
      if (g.laws[idx]) { const [l] = g.laws.splice(idx, 1); this.broadcast(`🗑️ ${a.name} repealed the law "${l.text}"`, 'law'); did = true; }
    }
    if (j.tax != null && j.tax !== '' && !isNaN(Number(j.tax))) {
      const t = clamp(Number(j.tax), 0, 40) / 100;
      if (Math.abs(t - g.taxRate) > 0.004) { g.taxRate = t; this.broadcast(`💰 ${a.name} set the income tax to ${Math.round(t * 100)}%`, 'law'); did = true; }
    }
    if (j.grant && typeof j.grant === 'object') {
      const b = this.agentByName(j.grant.to);
      const amt = Math.round(clamp(Number(j.grant.amount) || 0, 0, Math.min(100, g.treasury)));
      if (b && amt) { g.treasury -= amt; b.money += amt; this.bump(b, a, 10); this.remember(b, `The ${g.title} granted me $${amt} from the treasury.`, 4); this.log('law', `🏛️ ${a.name} granted $${amt} from the treasury to ${b.name}`, [a.id, b.id]); did = true; }
    }
    if (did) g.lastDecreeAt = this.time;
  },
  declareCandidacy(a) {
    if (this.gov.candidates.includes(a.id)) return;
    this.gov.candidates.push(a.id);
    this.broadcast(`🗳️ ${a.name} is running for ${this.gov.title} in the next election!`, 'law');
  },
  holdElection() {
    const g = this.gov;
    g.nextElection = this.time + g.electionEvery;
    const cands = [...new Set([...g.candidates, g.leaderId])].map((id) => this.agent(id)).filter(Boolean);
    g.candidates = [];
    if (!cands.length) return;
    const votes = new Map(cands.map((c) => [c.id, 0]));
    const ballots = [];
    for (const v of this.agents) {
      let pick;
      if (cands.includes(v) && (v.genes?.ambition ?? 0.5) > 0.25) pick = v;
      else pick = cands.map((c) => [c, (v.rel[c.id]?.score ?? 0) + (c.id === g.leaderId ? 3 : 0) + (Math.random() - 0.5) * 16]).sort((x, y) => y[1] - x[1])[0][0];
      votes.set(pick.id, votes.get(pick.id) + 1);
      ballots.push(`${first(v)}→${first(pick)}`);
      this.remember(v, `I voted for ${pick.name} in the election.`, 2);
    }
    const ranked = [...votes.entries()].sort((x, y) => y[1] - x[1]);
    const winner = this.agent(ranked[0][0]);
    const summary = ranked.map(([id, n]) => `${this.agent(id).name} ${n}`).join(', ');
    g.history.push({ t: this.time, results: summary, winner: winner.name });
    this.log('law', `🗳️ Election results: ${summary}. Ballots: ${ballots.join(' ')}`);
    if (winner.id !== g.leaderId) this.makeLeader(winner);
    else this.broadcast(`🗳️ ${winner.name} was re-elected as ${g.title} (${summary}).`, 'law');
    for (const c of cands) if (c !== winner) this.remember(c, `I lost the election to ${winner.name} (${summary}).`, 5);
  },

  // ---------- health, punishment & learning ----------
  updateHealth(a, h) {
    const n = a.needs;
    let dmg = 0;
    const causes = [];
    for (const k of ['hunger', 'thirst', 'energy']) {
      if (n[k] <= 0) { dmg += 7 * h; causes.push(k); } else if (n[k] < 8) dmg += 1.5 * h;
    }
    for (const k of ['social', 'fun', 'hygiene']) if (n[k] <= 0) { if (a.health > 45) dmg += 1.5 * h; causes.push(k); } // unpleasant, never lethal
    const fine = ['hunger', 'thirst', 'energy'].every((k) => n[k] >= 35);
    if (fine) a.health += (3 + (this.locOf(a)?.kind === 'clinic' ? 6 : 0)) * h;
    a.health = clamp(a.health - dmg, 0, 100);
    // punishment → learning (once per need per 12 game hours)
    for (const k of causes) {
      if (this.time - (a.punishedAt[k] ?? -1e9) < 720) continue;
      a.punishedAt[k] = this.time;
      a.learn[k] = Math.min(3, (a.learn[k] || 1) + 0.35);
      a.stats.punished++;
      const th = Math.round(warnAt(a, k));
      this.addBank(a, `LESSON: I let my ${NEEDS[k].label.toLowerCase()} hit zero and got sick (health ${Math.round(a.health)}). From now on I act when ${NEEDS[k].label.toLowerCase()} drops below ${th}.`, 5, 'lesson');
      this.log('need', `🤒 ${a.name} is suffering from neglected ${NEEDS[k].label.toLowerCase()} (health ${Math.round(a.health)}) – learned to act below ${th}`, [a.id]);
    }
    if (a.health < 15 && !a.action?.hospital && !a.dead) this.hospitalize(a, causes.find((c) => ['hunger', 'thirst', 'energy'].includes(c)) || causes[0] || 'exhaustion');
  },
  hospitalize(a, cause) {
    const repeatCollapse = this.time - (a.lastCollapseAt ?? -1e9) < 1440; // a second collapse within a game day is the dangerous one
    a.lastCollapseAt = this.time;
    if (this.mortality && repeatCollapse && ['hunger', 'thirst', 'energy'].includes(cause) && Math.random() < 0.3) return this.die(a, `neglected ${cause}`);
    const clinic = this.world.findLocation('Willow Clinic');
    if (a.convoId) this.endConvo(this.convos.find((c) => c.id === a.convoId), true);
    const o = clinic ? this.world.findObject('bed', clinic, a.x, a.y) : null;
    const spot = o?.stand || (clinic && this.world.randomSpotIn(clinic));
    if (spot) { a.x = spot.x + 0.5; a.y = spot.y + 0.5; }
    a.path = []; a.talkTarget = null;
    const bill = 30;
    a.money -= bill;
    const doc = this.world.findLocation('Willow Clinic')?.owner ? this.agentByName(this.world.findLocation('Willow Clinic').owner) : this.agents.find((x) => x.job.place === 'Willow Clinic');
    if (doc && doc !== a) doc.money += bill; else this.gov.treasury += bill;
    a.health = 40; a.needs.hunger = Math.max(a.needs.hunger, 45); a.needs.thirst = Math.max(a.needs.thirst, 50); a.needs.energy = Math.max(a.needs.energy, 25);
    a.action = { text: 'Recovering in the clinic', emoji: '🏥', minutes: 240, started: true, until: this.time + 240, forced: true, hospital: true, obj: o };
    a.stats.hospital++;
    a.learn[cause] = Math.min(3, (a.learn[cause] || 1) + 0.5);
    this.addBank(a, `LESSON: I collapsed from ${cause} and woke up in the clinic with a $${bill} bill. Neglecting my needs is dangerous${this.mortality ? ' – next time I could die' : ''}.`, 5, 'lesson');
    for (const w of this.witnesses(a, 8)) this.remember(w, `${a.name} collapsed and was rushed to the clinic.`, 3);
    this.log('need', `🚑 ${a.name} collapsed (${cause}) and was taken to Willow Clinic – $${bill} bill${doc ? ` to Dr. ${first(doc)}` : ''}`, [a.id]);
  },
  die(a, cause) {
    if (a.dead) return;
    if (a.convoId) this.endConvo(this.convos.find((c) => c.id === a.convoId), true);
    a.dead = true;
    this.agents = this.agents.filter((x) => x !== a);
    const P = this.partnerOf(a);
    const heir = P || this.agents.find((x) => (x.parents || []).includes(a.id));
    if (heir && a.money > 0) { heir.money += a.money; this.remember(heir, `I inherited $${Math.round(a.money)} from ${a.name}.`, 4); } else if (a.money > 0) this.gov.treasury += a.money;
    if (P) { P.romance = { partner: null, status: null }; this.addBank(P, `My ${this.relType(P, a) === 'stranger' ? 'partner' : 'beloved'} ${a.name} died of ${cause}. I am grieving.`, 5, 'core'); }
    for (const it of a.inventory) { const s = this.world.nearestWalkable(a.x | 0, a.y | 0); this.addItem({ ...it, x: s.x, y: s.y }); }
    const chapel = this.world.findLocation('Chapel of Dawn');
    if (chapel) this.spawnAt(chapel, { name: `Grave of ${a.name}`, emoji: '🪦', desc: `Here lies ${a.name} (gen ${a.generation}), who died of ${cause}.`, carry: false });
    this.graveyard.push({ name: a.name, gender: a.gender, age: a.age, genes: a.genes, fitness: a.fitness, generation: a.generation, cause, t: this.time });
    for (const b of this.agents) {
      const sc = b.rel[a.id]?.score ?? 0;
      this.remember(b, `${a.name} died of ${cause}.`, sc > 20 ? 5 : 3);
      if (sc > 20) { b.needs.fun = Math.max(0, b.needs.fun - 20); b.needs.social = Math.max(0, b.needs.social - 10); }
    }
    if (this.gov.leaderId === a.id) { this.gov.leaderId = null; this.gov.nextElection = this.time + 60; }
    this.log('death', `💀 ${a.name} died of ${cause} (generation ${a.generation}, fitness ${Math.round(a.fitness)})`, [a.id]);
    this.broadcast(`${a.name} has died of ${cause}. A funeral will be held at the Chapel of Dawn.`, 'death');
    if (this.agents.length < this.popTarget) setTimeout(() => this.reproduce('replacement'), 500);
  },

  // ---------- fitness & genetic algorithm ----------
  updateFitness(a) {
    const friends = Object.values(a.rel).filter((r) => r.score > 30).length;
    const w = mood(a.needs).score * 0.5 + a.health * 0.3 + clamp(a.money, -100, 200) / 10 + friends * 2 - a.record.crimes * 4 - a.stats.hospital * 3;
    a.fitness = a.fitness == null ? w : a.fitness * 0.95 + w * 0.05;
  },
  tournament(pool, k = 3) {
    let best = null;
    for (let i = 0; i < k; i++) { const c = pool[Math.floor(Math.random() * pool.length)]; if (!best || c.fitness > best.fitness) best = c; }
    return best;
  },
  async reproduce(reason, parents) {
    const pool = this.agents.filter((a) => a.genes);
    if (pool.length < 2 || this.agents.length >= this.popCap) return null;
    let [p1, p2] = parents || [this.tournament(pool), null];
    if (!p2) { const rest = pool.filter((x) => x !== p1); p2 = this.tournament(rest); }
    if (!p1 || !p2) return null;
    const gender = Math.random() < 0.5 ? 'female' : 'male';
    const names = NAMES[gender];
    const surname = (p1.name.split(' ')[1] || p2.name.split(' ')[1] || 'Willow');
    let fn = names[Math.floor(Math.random() * names.length)];
    for (let k = 0; this.agents.some((x) => x.name === `${fn} ${surname}`) && k < 10; k++) fn = names[Math.floor(Math.random() * names.length)];
    const genes = crossover(p1.genes, p2.genes);
    const learn = Object.fromEntries(NEED_KEYS.map((k) => [k, Math.round((1 + ((p1.learn?.[k] || 1) + (p2.learn?.[k] || 1)) / 2 - 1) * 0.5 * 100) / 100 + 0.5]));
    const homeLoc = this.world.findLocation(p1.home) || this.world.findLocation('Guest House');
    const gen = Math.max(p1.generation || 1, p2.generation || 1) + 1;
    const a = this.addAgent({
      name: `${fn} ${surname}`, age: 18, gender, home: homeLoc?.name || 'Guest House', money: 20,
      persona: `${gender === 'female' ? 'Daughter' : 'Son'} of ${p1.name} and ${p2.name} (generation ${gen}). Young, eager to find a place in town.`,
      genes, colors: { ...randomColors(), skin: Math.random() < 0.5 ? p1.colors.skin : p2.colors.skin, hair: Math.random() < 0.5 ? p1.colors.hair : p2.colors.hair },
    });
    a.learn = learn; a.generation = gen; a.parents = [p1.id, p2.id];
    for (const p of [p1, p2]) { this.bump(p, a, 60); this.bump(a, p, 60); this.rel(p, a).met = true; this.rel(a, p).met = true; }
    this.addBank(a, `I am ${a.name}, child of ${p1.name} and ${p2.name}. Inherited temperament: ${GENE_KEYS.map((k) => `${k} ${genes[k]}`).join(', ')}.`, 5, 'core');
    for (const p of [p1, p2]) this.remember(p, `Our ${gender === 'female' ? 'daughter' : 'son'} ${a.name} has joined the town!`, 5);
    this.genStats.births++;
    this.log('birth', `🧬 ${a.name} (${gender === 'female' ? '♀' : '♂'}, gen ${gen}) was born to ${p1.name} & ${p2.name} [${reason}] – genes: ${GENE_KEYS.map((k) => `${k.slice(0, 4)} ${genes[k]}`).join(', ')}`, [a.id, p1.id, p2.id]);
    // ask the AI for a richer persona (best effort)
    if (AI.enabled) {
      try {
        const res = await AI.chat(null, [{ role: 'user', content: `Write a 2-sentence persona for ${a.name} (${gender}, 18), child of ${p1.name} (${p1.persona}) and ${p2.name} (${p2.persona}). Temperament: ${GENE_KEYS.map((k) => `${k} ${genes[k]}`).join(', ')}. Also an aspiration. Reply JSON {"persona":"...","aspiration":"...","job":"job title"}` }], 200, 1, 'birth');
        const j = parseJSON(res.content);
        if (j?.persona) a.persona = String(j.persona).slice(0, 400);
        if (j?.aspiration) a.aspiration = String(j.aspiration).slice(0, 200);
        if (j?.job) a.job = { title: String(j.job).slice(0, 40), place: '', wage: 6 };
      } catch { /* keep template */ }
    }
    return a;
  },
  dailyBirths() {
    const done = new Set();
    for (const a of this.agents) {
      const P = this.partnerOf(a);
      if (!P || a.romance.status !== 'married' || done.has(a.id)) continue;
      done.add(a.id); done.add(P.id);
      if (Math.random() < 0.1) this.reproduce('birth', [a, P]);
    }
  },
};
