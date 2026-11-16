// Commissions: real-world tasks posted by the player (God). Agents choose to work on them, produce a real deliverable
// (writing, research, code, designs, plans...) with their own model + memory + optional web research, and get paid on approval.
import { newId } from './world.js';
import { AI } from './ai.js';

const clean = (s, n = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export const Commissions = {
  initCommissions() { this.commissions ||= []; },
  postCommission({ title, desc, reward, assignees = [], tier = null, research = true, multi = true }) {
    const c = {
      id: 'c' + (this.commissions.length + 1) + Math.random().toString(36).slice(2, 4), title: clean(title, 120), desc: String(desc || '').slice(0, 2000),
      reward: Math.max(1, Math.round(Number(reward) || 30)), assignees, tier, research, multi, status: 'open', t: this.time, submissions: [], workers: [],
    };
    this.commissions.push(c);
    const who = assignees.length ? assignees.map((id) => this.agent(id)?.name).filter(Boolean).join(', ') : 'everyone';
    for (const a of this.agents) if (!assignees.length || assignees.includes(a.id)) this.remember(a, `GOD posted a paid commission "${c.title}" ($${c.reward}): ${clean(c.desc, 200)}`, 4);
    this.log('commission', `📝 God posted commission #${c.id} "${c.title}" – $${c.reward} (open to ${who})`);
    return c;
  },
  openCommissionsFor(a) {
    return this.commissions.filter((c) => c.status === 'open' && (!c.assignees.length || c.assignees.includes(a.id)));
  },
  commissionsText(a) {
    const open = this.openCommissionsFor(a);
    if (!open.length) return '';
    const mine = (c) => c.submissions.filter((s) => s.agentId === a.id);
    return `📝 PAID COMMISSIONS FROM GOD (real tasks – produce real, high-quality work; paid when God approves): ${open.map((c) => {
      const subs = mine(c), last = subs[subs.length - 1];
      return `#${c.id} "${c.title}" $${c.reward}${c.assignees.length ? ' (assigned to you)' : ''}${last ? (last.status === 'rejected' ? ` – your last attempt was REJECTED: "${clean(last.feedback, 120)}"` : ` – you submitted (${last.status})`) : ''}${c.workers.includes(a.id) ? ' – you are working on it' : ''}`;
    }).join('; ')}. To work on one: "work_on":"<id>" with ~60-180 minutes at a desk (home desk, library, institute, town hall).`;
  },
  findCommission(id) {
    const s = String(id || '').replace(/^#/, '').toLowerCase();
    return this.commissions.find((c) => c.id.toLowerCase() === s) || this.commissions.find((c) => c.status === 'open' && (c.title.toLowerCase().includes(s) || s.includes(c.id.toLowerCase())));
  },
  async doCommission(a, id) {
    const c = this.findCommission(id);
    if (!c || c.status !== 'open') { this.remember(a, `The commission ${id} is no longer open.`, 2); return; }
    if (c.assignees.length && !c.assignees.includes(a.id)) return;
    if (!AI.enabled) return;
    c.workers = c.workers.filter((w) => w !== a.id);
    let research = '';
    if (c.research) {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(c.title.slice(0, 90))}`);
        const d = await r.json();
        research = (d.results || []).slice(0, 5).map((x, i) => `${i + 1}. [${x.source}] ${x.title}: ${x.snippet}`).join('\n');
      } catch { /* offline */ }
    }
    const prev = c.submissions.filter((s) => s.agentId === a.id && s.feedback).map((s) => `- Feedback on your earlier attempt: ${s.feedback}`).join('\n');
    const knowledge = (a.bank || []).filter((m) => ['knowledge', 'reflection', 'work'].includes(m.kind)).slice(-6).map((m) => `- ${m.text}`).join('\n');
    a.thinking = true;
    try {
      const res = await AI.chat(c.tier || this.tierFor(a), [
        { role: 'system', content: `You are ${a.name}, ${a.job.title} in the town of Willowbrook. Persona: ${a.persona} You were commissioned by God (a real person) to produce real-world useful work. Deliver genuinely high-quality, accurate, complete output in Markdown. No role-play preamble, no JSON – just the deliverable.` },
        { role: 'user', content: `COMMISSION #${c.id}: ${c.title}\n\nDetails:\n${c.desc || '(none)'}\n\n${research ? `Web research results you found:\n${research}\n\n` : ''}${knowledge ? `Relevant things you know:\n${knowledge}\n\n` : ''}${prev ? `${prev}\nAddress this feedback.\n\n` : ''}Produce the full deliverable now. Sign it at the end as "– ${a.name}".` },
      ], 1500, 0.8, 'commission');
      const sub = { id: newId('sub'), agentId: a.id, name: a.name, text: String(res.content || '').slice(0, 12000), model: res.model, t: this.time, status: 'pending' };
      c.submissions.push(sub);
      a.stats.commissions = (a.stats.commissions || 0) + 1;
      this.remember(a, `I finished and submitted my work for God's commission "${c.title}". Hoping for approval and the $${c.reward}.`, 4);
      this.log('commission', `📬 ${a.name} submitted work for "${c.title}" (${sub.text.length} chars, ${res.model})`, [a.id]);
      this.onCommission?.(c, sub);
    } catch (e) {
      this.remember(a, `I couldn't finish the commission "${c.title}" – my mind went blank (${e.message}).`, 2);
    } finally { a.thinking = false; }
  },
  reviewSubmission(c, sub, approve, feedback = '', rating = 0) {
    const a = this.agent(sub.agentId);
    sub.status = approve ? 'approved' : 'rejected';
    sub.feedback = clean(feedback, 600); sub.rating = rating;
    if (approve) {
      if (a) {
        a.money += c.reward; a.stats.earned += c.reward;
        a.stats.godPay = (a.stats.godPay || 0) + c.reward;
        this.remember(a, `GOD APPROVED my work on "${c.title}" and paid me $${c.reward}!${feedback ? ` God said: "${sub.feedback}"` : ''}`, 5);
        this.addBank(a, `LESSON: God values work like my "${c.title}" submission${rating ? ` (rated ${rating}/5)` : ''}. ${sub.feedback}`, 5, 'lesson');
        for (const w of this.witnesses(a, 10)) this.remember(w, `${a.name} got paid $${c.reward} by God for real work!`, 3);
      }
      if (!c.multi) c.status = 'done';
      this.log('commission', `✅ God approved ${sub.name}'s work on "${c.title}" – paid $${c.reward}${rating ? ` (${'⭐'.repeat(rating)})` : ''}`, a ? [a.id] : []);
    } else {
      if (a) this.remember(a, `God REJECTED my work on "${c.title}". Feedback: "${sub.feedback || 'not good enough'}". I can try again.`, 5);
      this.log('commission', `❌ God rejected ${sub.name}'s work on "${c.title}"${feedback ? `: ${sub.feedback}` : ''}`, a ? [a.id] : []);
    }
  },

  // ---------- global model management ----------
  applyPins(pins = {}) {
    for (const [name, tier] of Object.entries(pins)) {
      const a = this.agents.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (!a || (a.pinned && a.tier === tier)) continue;
      a.tier = tier; a.pinned = true; if (a.mix) a.mix.enabled = false;
      this.log('god', `📌 ${a.name} is pinned to model ${tier}`, [a.id]);
    }
  },
  setGlobalModel() {
    let n = 0;
    for (const a of this.agents) { if (a.pinned) continue; a.tier = null; if (a.mix) a.mix.enabled = false; n++; }
    return n;
  },
  setGlobalMix(enabled, premium, every) {
    let n = 0;
    for (const a of this.agents) { if (a.pinned) continue; a.mix = { ...(a.mix || {}), enabled, premium, every: Math.max(2, Number(every) || 11), base: a.tier || null }; n++; }
    return n;
  },

  // per-agent "mixed brain": mostly the base tier, occasionally (random) a premium tier
  tierFor(a) {
    if (!a) return null;
    if (a.pinned) { a.lastTierUsed = a.tier; return a.tier || null; }
    const m = a.mix;
    if (m?.enabled && m.premium) {
      const every = Math.max(2, Number(m.every) || 11);
      if (Math.random() < 1 / every) { a.lastTierUsed = m.premium; m.premiumCalls = (m.premiumCalls || 0) + 1; return m.premium; }
      a.lastTierUsed = m.base || a.tier || null; m.baseCalls = (m.baseCalls || 0) + 1;
      return m.base || a.tier || null;
    }
    a.lastTierUsed = a.tier || null;
    return a.tier || null;
  },
};
