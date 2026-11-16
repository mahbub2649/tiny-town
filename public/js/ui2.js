// Extra panels: Town (government, laws, evolution, research export), Library, Prayers, Relationship matrix, Saves.
import { CRIMES, GENE_KEYS, NEED_KEYS, mood } from './needs.js';
import { fmtTime } from './sim.js';
import { RES, RES_KEYS, RECIPES } from './economy.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const download = (name, text, type = 'application/json') => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
};
const scoreColor = (v) => {
  if (v == null) return '#1a1d30';
  const t = Math.max(-1, Math.min(1, v / 100));
  return t >= 0 ? `rgb(${Math.round(40 - 10 * t)},${Math.round(60 + 150 * t)},${Math.round(70 + 40 * t)})` : `rgb(${Math.round(60 - 170 * t)},${Math.round(50 + 10 * t)},${Math.round(60 + 10 * t)})`;
};

export function setupPanels({ sim, renderer, modal, toast, select, api }) {
  // ---------- Town ----------
  function renderTown() {
    const g = sim.gov, L = sim.leader();
    const box = $('#tab-town');
    const avgFit = sim.agents.length ? sim.agents.reduce((s, a) => s + (a.fitness || 0), 0) / sim.agents.length : 0;
    const gens = Math.max(1, ...sim.agents.map((a) => a.generation || 1));
    box.innerHTML = `
      <div class="card"><h3>🏛️ Government</h3>
        <div class="kv"><b>${esc(g.title)}</b><span>${L ? esc(L.name) : '<i>vacant</i>'}</span>
        <b>Treasury</b><span>$${Math.round(g.treasury)}</span><b>Income tax</b><span>${Math.round(g.taxRate * 100)}%</span>
        <b>Election</b><span>in ${((g.nextElection - sim.time) / 1440).toFixed(1)} days (${fmtTime(g.nextElection).str})</span>
        <b>Candidates</b><span>${g.candidates.map((id) => esc(sim.agent(id)?.name)).filter(Boolean).join(', ') || '—'}</span>
        <b>Chapel fund</b><span>$${Math.round(sim.chapelFund)}</span></div>
        <div class="row" style="margin-top:8px"><select id="gLeader">${sim.agents.map((a) => `<option value="${a.id}" ${a.id === g.leaderId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select><button id="gAppoint" style="flex:none">👑 Appoint</button></div>
        <div class="row" style="margin-top:6px"><input id="gTax" type="number" min="0" max="40" value="${Math.round(g.taxRate * 100)}" style="flex:0 0 70px" /><button id="gSetTax" style="flex:none">Set tax %</button><button id="gElect" style="flex:none">🗳️ Hold election now</button></div>
      </div>
      <div class="card"><h3>📜 Laws</h3>
        ${g.laws.map((l, i) => `<div class="law"><span>${i + 1}. ${esc(l.text)} <small class="muted">${l.bans !== 'none' ? `[${CRIMES[l.bans]}, $${l.fine}]` : ''} – ${esc(l.by)}</small></span><button data-repeal="${i}" style="padding:0 6px">✕</button></div>`).join('') || '<p class="muted">Anarchy! No laws.</p>'}
        <label>New law (decreed by god)</label><input id="lawText" placeholder="Curfew: nobody outside between 23:00 and 06:00" />
        <div class="row" style="margin-top:4px"><select id="lawBans"><option value="none">bans: (nothing – social rule)</option>${Object.entries(CRIMES).map(([k, v]) => `<option value="${k}">bans: ${v}</option>`).join('')}</select><input id="lawFine" type="number" value="25" style="flex:0 0 64px" /><button id="lawAdd" style="flex:none">Add</button></div>
      </div>
      <div class="card"><h3>🗳️ Election history</h3>${g.history.slice(-5).reverse().map((h) => `<div class="law"><span>${fmtTime(h.t).str}: <b>${esc(h.winner)}</b> <small class="muted">${esc(h.results)}</small></span></div>`).join('') || '<p class="muted">No elections yet.</p>'}</div>
      <div class="card"><h3>🧬 Evolution</h3>
        <div class="kv"><b>Population</b><span>${sim.agents.length} (target ${sim.popTarget}, cap ${sim.popCap})</span><b>Generations</b><span>${gens}</span>
        <b>Births</b><span>${sim.genStats.births}</span><b>Deaths</b><span>${sim.graveyard.length}</span><b>Avg fitness</b><span>${avgFit.toFixed(1)}</span></div>
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="gMortal" style="width:auto" ${sim.mortality ? 'checked' : ''}/> Mortality (neglected agents can die; the fittest reproduce)</label>
        <div class="gene" style="margin-top:6px"><b>Gene</b><span class="muted">population average</span><span></span></div>
        ${GENE_KEYS.map((k) => { const v = sim.agents.reduce((s, a) => s + (a.genes?.[k] || 0), 0) / Math.max(1, sim.agents.length); return `<div class="gene"><span>${k}</span><div class="bar"><div style="width:${v * 100}%;background:#7cc8ff"></div></div><span>${v.toFixed(2)}</span></div>`; }).join('')}
        <div class="btns"><button id="gBreed">🧬 Breed next generation (fittest)</button></div>
        ${sim.graveyard.length ? `<label>🪦 Graveyard</label>${sim.graveyard.slice(-6).reverse().map((d) => `<div class="law"><span>${esc(d.name)} <small class="muted">gen ${d.generation}, died of ${esc(d.cause)}, ${fmtTime(d.t).str}</small></span></div>`).join('')}` : ''}
      </div>
      <div class="card"><h3>🔬 Research data export</h3>
        <p class="muted" style="margin:0 0 6px">Snapshot of agents (genes, needs, fitness, money, relationships, stats), laws, elections and authored works – for analysing emergent social dynamics.</p>
        <div class="btns"><button id="gExportJSON">⬇️ Snapshot JSON</button><button id="gExportCSV">⬇️ Relationship matrix CSV</button><button id="gExportAgents">⬇️ Agents CSV</button></div>
      </div>`;
    $('#gAppoint').onclick = () => { const a = sim.agent($('#gLeader').value); if (a) { sim.makeLeader(a); renderTown(); } };
    $('#gSetTax').onclick = () => { g.taxRate = Math.max(0, Math.min(40, Number($('#gTax').value) || 0)) / 100; sim.log('god', `💰 God set tax to ${Math.round(g.taxRate * 100)}%`); renderTown(); };
    $('#gElect').onclick = () => { sim.holdElection(); renderTown(); };
    for (const b of box.querySelectorAll('[data-repeal]')) b.onclick = () => { const [l] = g.laws.splice(Number(b.dataset.repeal), 1); sim.broadcast(`The law "${l.text}" was abolished by divine will.`, 'law'); renderTown(); };
    $('#lawAdd').onclick = () => {
      const text = $('#lawText').value.trim(); if (!text) return;
      const bans = $('#lawBans').value;
      g.laws = g.laws.filter((l) => !(bans !== 'none' && l.bans === bans));
      g.laws.push({ id: 'law' + Date.now(), text, bans, fine: Math.max(0, Number($('#lawFine').value) || 0), by: 'God', t: sim.time });
      sim.broadcast(`📜 A divine law was decreed: "${text}"${bans !== 'none' ? ` (${CRIMES[bans]} is punished with a $${$('#lawFine').value} fine)` : ''}`, 'law');
      renderTown();
    };
    $('#gMortal').onchange = (e) => { sim.mortality = e.target.checked; sim.log('god', `💀 Mortality ${sim.mortality ? 'enabled' : 'disabled'}`); };
    $('#gBreed').onclick = async () => { const c = await sim.reproduce('god-selected'); toast(c ? `🧬 ${c.name} was born (gen ${c.generation})` : 'Population cap reached', !c); renderTown(); };
    $('#gExportJSON').onclick = () => download(`willowbrook-research-day${fmtTime(sim.time).day}.json`, JSON.stringify(researchSnapshot(), null, 1));
    $('#gExportCSV').onclick = () => {
      const A = sim.agents;
      const rows = [['from\\to', ...A.map((a) => a.name)], ...A.map((a) => [a.name, ...A.map((b) => (a === b ? '' : Math.round(a.rel[b.id]?.score ?? 0)))])];
      download('relationship-matrix.csv', rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n'), 'text/csv');
    };
    $('#gExportAgents').onclick = () => {
      const cols = ['name', 'gender', 'age', 'generation', 'job', 'money', 'health', 'fitness', 'mood', ...NEED_KEYS, ...GENE_KEYS.map((k) => 'gene_' + k), 'crimes', 'papers', 'talks', 'partner'];
      const rows = sim.agents.map((a) => [a.name, a.gender, a.age, a.generation, a.job.title, a.money.toFixed(0), Math.round(a.health), (a.fitness || 0).toFixed(1), mood(a.needs).score,
        ...NEED_KEYS.map((k) => Math.round(a.needs[k])), ...GENE_KEYS.map((k) => a.genes[k]), a.record.crimes, a.stats.papers, a.stats.talks, sim.partnerOf(a)?.name || '']);
      download('agents.csv', [cols, ...rows].map((r) => r.map((c) => `"${c ?? ''}"`).join(',')).join('\n'), 'text/csv');
    };
  }
  function researchSnapshot() {
    return {
      time: fmtTime(sim.time).str, gov: sim.gov, graveyard: sim.graveyard, genStats: sim.genStats,
      agents: sim.agents.map((a) => ({
        name: a.name, gender: a.gender, age: a.age, generation: a.generation, parents: a.parents.map((id) => sim.agent(id)?.name || id), job: a.job, money: a.money, health: a.health, fitness: a.fitness,
        needs: a.needs, genes: a.genes, learn: a.learn, record: a.record, stats: a.stats, aspiration: a.aspiration, question: a.question, romance: { partner: sim.partnerOf(a)?.name || null, status: a.romance.status },
        relationships: Object.fromEntries(Object.entries(a.rel).map(([id, r]) => [sim.agent(id)?.name || id, { ...r, type: sim.agent(id) ? sim.relType(a, sim.agent(id)) : 'gone' }])),
        memoryBank: a.bank,
      })),
      works: sim.library.books.filter((b) => b.by),
      prayers: sim.prayers,
    };
  }

  // ---------- Library ----------
  let libFilter = 'all';
  function renderLibrary() {
    const box = $('#tab-library');
    const books = sim.library.books;
    const list = books.filter((b) => libFilter === 'all' || (libFilter === 'town' ? !!b.by : b.kind === libFilter)).slice().reverse();
    box.innerHTML = `<div class="card"><h3>📚 Town Library <span class="muted">(${books.length})</span></h3>
      <div class="btns" id="libF">${[['all', 'All'], ['town', '✍️ By townsfolk'], ['journal', '🧪 AI research'], ['book', '📕 Books']].map(([k, l]) => `<button data-lf="${k}" class="${libFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <label>Add a book (any Wikipedia topic)</label><div class="row"><input id="libTopic" placeholder="Behavioral economics" /><button id="libAdd" style="flex:none">Add</button></div></div>
      <div class="card">${list.map((b) => `<div class="book"><div>${{ book: '📕', journal: '🧪', paper: '📄', essay: '📝', poem: '📜', story: '📖', manifesto: '📢' }[b.kind] || '📄'} <b>${esc(b.title)}</b> <small>${esc(b.by || b.author || '')} · read ${b.reads}×${b.t != null ? ` · ${fmtTime(b.t).str}` : ''}</small></div><div class="abs">${esc(b.abstract || (b.kind === 'book' ? `Real knowledge from Wikipedia: "${b.topic}"` : ''))}</div></div>`).join('') || '<p class="muted">Empty.</p>'}</div>`;
    for (const b of box.querySelectorAll('[data-lf]')) b.onclick = () => { libFilter = b.dataset.lf; renderLibrary(); };
    for (const b of box.querySelectorAll('.book')) b.onclick = () => b.classList.toggle('open');
    $('#libAdd').onclick = () => { const t = $('#libTopic').value.trim(); if (!t) return; books.push({ id: 'bk' + Date.now(), kind: 'book', title: t, topic: t, author: 'Donated by God', reads: 0, t: sim.time }); sim.log('god', `📕 God donated the book "${t}" to the library`); renderLibrary(); };
  }

  // ---------- Prayers ----------
  function renderPrayers() {
    const box = $('#tab-prayers');
    const list = sim.prayers.slice().reverse();
    for (const p of sim.prayers) p.read = true;
    updateBadge();
    box.innerHTML = `<div class="card"><h3>🙏 Prayers to God</h3><p class="muted" style="margin:0">Agents pray when they feel desperate, grateful or devout. Your answer goes straight into their memory bank.</p></div>` +
      (list.map((p) => `<div class="prayer ${p.answer ? 'answered' : ''}"><div><b>${esc(p.name)}</b> <small class="muted">${fmtTime(p.t).str} · ${esc(p.where)}</small></div><div>“${esc(p.text)}”</div>
        ${p.answer ? `<div style="color:var(--good);margin-top:4px">✨ You answered: “${esc(p.answer)}”</div>` : `<textarea data-ans="${p.id}" placeholder="Answer as God…"></textarea>
        <div class="btns"><button data-send="${p.id}" class="primary">✨ Answer</button><button data-bless="${p.agentId}">🌟 Bless</button><button data-smite="${p.agentId}">⚡ Smite</button><button data-goto="${p.agentId}">👁️ Look</button></div>`}</div>`).join('') || '<p class="muted">No prayers yet.</p>');
    for (const b of box.querySelectorAll('[data-send]')) b.onclick = () => {
      const p = sim.prayers.find((x) => x.id === b.dataset.send); const t = box.querySelector(`[data-ans="${p.id}"]`).value.trim();
      if (!t) return; sim.answerPrayer(p, t); toast('✨ Prayer answered'); renderPrayers();
    };
    for (const b of box.querySelectorAll('[data-bless]')) b.onclick = () => { const a = sim.agent(b.dataset.bless); if (a) { sim.bless(a); toast(`🌟 Blessed ${a.name}`); } };
    for (const b of box.querySelectorAll('[data-smite]')) b.onclick = () => { const a = sim.agent(b.dataset.smite); if (a) { sim.smite(a); toast(`⚡ Smote ${a.name}`); } };
    for (const b of box.querySelectorAll('[data-goto]')) b.onclick = () => { const a = sim.agent(b.dataset.goto); if (a) { renderer.centerOn(a.x, a.y); select({ kind: 'agent', id: a.id }); } };
  }
  function updateBadge() {
    const n = sim.prayers.filter((p) => !p.read && !p.answer).length;
    const b = $('#prayBadge');
    b.textContent = n; b.classList.toggle('hidden', !n);
  }
  sim.onPrayer = (p) => { updateBadge(); toast(`🙏 ${p.name} prays: "${p.text.slice(0, 70)}${p.text.length > 70 ? '…' : ''}"`); };

  // ---------- Matrix ----------
  function renderMatrix() {
    const A = sim.agents;
    const ini = (a) => a.name.split(/\s+/).map((s) => s[0]).join('').slice(0, 2);
    $('#tab-matrix').innerHTML = `<div class="card"><h3>🕸️ Relationship matrix</h3><p class="muted" style="margin:0 0 6px">Row → column feeling, −100 (red) … 0 … +100 (green). 💕 dating · 💍 married. Hover a cell for details.</p>
      <div style="overflow:auto"><table id="matrix"><tr><th></th>${A.map((b) => `<th title="${esc(b.name)}">${esc(ini(b))}</th>`).join('')}</tr>
      ${A.map((a) => `<tr><th title="${esc(a.name)}" style="text-align:right;padding-right:3px">${esc(ini(a))}</th>${A.map((b) => {
        if (a === b) return '<td style="background:#0d0f1e"></td>';
        const r = a.rel[b.id]; const t = sim.relType(a, b);
        const mark = a.romance?.partner === b.id ? (a.romance.status === 'married' ? '💍' : '💕') : '';
        return `<td data-a="${a.id}" data-b="${b.id}" style="background:${scoreColor(r?.met ? r.score : null)}" title="${esc(a.name)} → ${esc(b.name)}: ${t}, score ${Math.round(r?.score ?? 0)}, attraction ${Math.round(r?.attraction ?? 0)}">${mark}</td>`;
      }).join('')}</tr>`).join('')}</table></div></div>
      <div class="card" id="mxDetail"><p class="muted">Click a cell to see the pair.</p></div>
      <div class="card"><h3>📊 Relationship types</h3>${(() => {
        const counts = {};
        for (const a of A) for (const b of A) if (a !== b) { const t = sim.relType(a, b); counts[t] = (counts[t] || 0) + 1; }
        return Object.entries(counts).sort((x, y) => y[1] - x[1]).map(([t, n]) => `<div class="relrow"><span>${esc(t)}</span><span>${n}</span></div>`).join('');
      })()}</div>`;
    for (const td of document.querySelectorAll('#matrix td[data-a]')) td.onclick = () => {
      const a = sim.agent(td.dataset.a), b = sim.agent(td.dataset.b);
      const ra = a.rel[b.id] || {}, rb = b.rel[a.id] || {};
      $('#mxDetail').innerHTML = `<h3>${esc(a.name)} ⇄ ${esc(b.name)}</h3><div class="kv">
        <b>${esc(a.name.split(' ')[0])} sees</b><span>${sim.relType(a, b)} · ${Math.round(ra.score || 0)} · 💘 ${Math.round(ra.attraction || 0)} · ${ra.talks || 0} talks</span>
        <b>${esc(b.name.split(' ')[0])} sees</b><span>${sim.relType(b, a)} · ${Math.round(rb.score || 0)} · 💘 ${Math.round(rb.attraction || 0)} · ${rb.talks || 0} talks</span></div>`;
    };
  }

  // ---------- Saves ----------
  async function openSave() {
    const list = await api.serverList().catch(() => []);
    const card = modal('💾 Save game', `
      <label>Save slot name (stored on the server in <code>saves/</code>)</label>
      <input name="slot" value="${esc(`town-day${fmtTime(sim.time).day}`)}" required />
      <p class="muted">The game also auto-saves to this browser every 30 s and to the server slot "autosave" every 5 min.</p>
      <label>Existing slots</label>${list.map((s) => `<div class="slotrow"><span>${esc(s.name)} <small class="muted">${new Date(s.modified).toLocaleString()} · ${(s.size / 1024).toFixed(0)} KB</small></span><button type="button" data-ow="${esc(s.name)}">Overwrite</button></div>`).join('') || '<p class="muted">none</p>'}`,
    (fd) => { api.save(); api.serverSave(fd.slot).then(() => toast(`💾 Saved "${fd.slot}" (server + browser)`)).catch((e) => toast('Server save failed: ' + e.message, true)); }, 'Save');
    for (const b of card.querySelectorAll('[data-ow]')) b.onclick = () => { card.querySelector('[name=slot]').value = b.dataset.ow; };
  }
  async function openLoad() {
    const list = await api.serverList().catch(() => []);
    const card = modal('📂 Load game', `
      <div class="slotrow"><span>🖥️ This browser's last autosave</span><button type="button" id="ldLocal">Load</button></div>
      <label>Server save slots</label>${list.map((s) => `<div class="slotrow"><span>${esc(s.name)} <small class="muted">${new Date(s.modified).toLocaleString()} · ${(s.size / 1024).toFixed(0)} KB</small></span><button type="button" data-ld="${esc(s.name)}">Load</button><button type="button" data-del="${esc(s.name)}" class="danger">✕</button></div>`).join('') || '<p class="muted">none</p>'}`,
    () => true, 'Close');
    card.querySelector('#ldLocal').onclick = () => { if (api.load()) { api.afterLoad(); toast('📂 Loaded browser save'); $('#mCancel').click(); } else toast('No browser save', true); };
    for (const b of card.querySelectorAll('[data-ld]')) b.onclick = async () => {
      try { await api.serverLoad(b.dataset.ld); api.afterLoad(); toast(`📂 Loaded "${b.dataset.ld}"`); $('#mCancel').click(); } catch (e) { toast('Load failed: ' + e.message, true); }
    };
    for (const b of card.querySelectorAll('[data-del]')) b.onclick = async () => { await api.serverDelete(b.dataset.del); b.closest('.slotrow').remove(); };
  }

  // ---------- Economy ----------
  function renderEconomy() {
    const m = sim.market, g = sim.gov;
    const A = [...sim.agents].sort((x, y) => y.money - x.money);
    const supply = A.reduce((s, a) => s + a.money, 0);
    const box = $('#tab-economy');
    const prev = m.history.length > 1 ? m.history[Math.max(0, m.history.length - 7)].price : m.price;
    box.innerHTML = `<div class="card"><h3>📈 Exchange <span class="muted">(${esc(sim.market && 'Town Square stalls')})</span></h3>
      <table style="width:100%;font-size:12px;border-collapse:collapse"><tr class="muted"><td>Resource</td><td>Price</td><td>Stock</td><td>Trend (last 48h)</td><td></td></tr>
      ${RES_KEYS.map((k) => { const d = m.price[k] - (prev[k] ?? m.price[k]); return `<tr><td>${RES[k].emoji} ${RES[k].label}</td><td><b>$${m.price[k].toFixed(2)}</b> <span style="color:${d > 0.01 ? 'var(--bad)' : d < -0.01 ? 'var(--good)' : 'var(--muted)'}">${d > 0.01 ? '▲' : d < -0.01 ? '▼' : '•'}</span></td><td>${Math.round(m.stock[k])}</td><td><canvas data-spark="${k}" width="90" height="22"></canvas></td><td><button data-inject="${k}" title="God: drop 20 units into the exchange" style="padding:0 5px">+20</button></td></tr>`; }).join('')}
      </table>
      <div class="btns"><button id="eDrought">🌵 Drought (crops −70%)</button><button id="eBoom">🐟 Fish boom</button><button id="eFund">🏦 +$200 treasury</button></div></div>
      <div class="card"><h3>📋 Order book / job board</h3>
        ${(m.orders || []).slice().sort((x, y) => (x.side > y.side ? 1 : -1) || y.price - x.price).map((o) => `<div class="relrow"><span>${o.side === 'buy' ? '🟢 BUY' : '🔴 SELL'} ${o.qty} ${RES[o.res].emoji} ${o.res} <small class="muted">by ${esc(o.name)}${o.forShop ? ` for ${esc(o.forShop)}` : ''}</small></span><span>$${o.price}</span></div>`).join('') || '<p class="muted">No open orders. Shop owners post restock contracts when inputs run out; agents post their own buy/sell prices.</p>'}
        <div class="kv" style="margin-top:6px"><b>Exports</b><span>$${Math.round(m.exports || 0)} earned by the treasury from outside demand</span></div>
      </div>
      <div class="card"><h3>👷 Workforce</h3>
        ${(() => { const by = {}; for (const a of sim.agents) (by[a.job.title] ||= []).push(a); return Object.entries(by).sort((x, y) => y[1].length - x[1].length).map(([t, as]) => `<div class="relrow"><span>${esc(t)}</span><span class="muted">${as.map((a) => esc(a.name.split(' ')[0])).join(', ')}</span></div>`).join(''); })()}
        <div class="kv" style="margin-top:6px"><b>Gathered</b><span>${sim.agents.reduce((s2, a) => s2 + (a.stats.gathered || 0), 0)} units total</span></div>
      </div>
      <div class="card"><h3>🏠 Home pantries & storage</h3>
        ${sim.world.locations.filter((l) => l.kind === 'home').map((l) => { const food = sim.pantryFood(l); return `<div class="relrow"><span>${esc(l.name)}</span><span style="color:${food < 1 ? 'var(--bad)' : food < 3 ? '#ffb14a' : 'var(--muted)'}">${esc(sim.storageText(l))}</span></div>`; }).join('')}
        <div class="btns"><button id="eMeals">🍱 God: +5 meals in every pantry</button></div>
      </div>
      <div class="card"><h3>💰 Wealth</h3><div class="kv"><b>Money supply</b><span>$${Math.round(supply)}</span><b>Treasury</b><span>$${Math.round(g.treasury)}</span>
        <b>Gini</b><span>${sim.gini()} <small class="muted">(0 = equal, 1 = one person has everything)</small></span><b>Trades</b><span>${m.sales} ($${Math.round(m.volume)} volume)</span></div>
        <canvas id="wealthChart" width="300" height="70" style="width:100%;margin-top:6px"></canvas>
        ${A.map((a) => `<div class="gene"><span title="${esc(a.name)}">${esc(a.name.split(' ')[0])}</span><div class="bar"><div style="width:${Math.max(1, Math.min(100, (Math.max(0, a.money) / Math.max(1, A[0].money)) * 100))}%;background:${a.money < 0 ? '#ff7a7a' : '#6fe39a'}"></div></div><span>$${Math.round(a.money)}</span></div>`).join('')}
      </div>
      <div class="card"><h3>🔨 Recipes</h3>${Object.entries(RECIPES).map(([n, r]) => `<div class="relrow"><span>${r.out.emoji} ${esc(n)} <small class="muted">@${r.at}</small></span><span>${Object.entries(r.in).map(([k, q]) => `${q}${RES[k].emoji}`).join(' ') || '—'}</span></div>`).join('')}</div>
      <div class="card"><h3>🧾 Recent trades</h3>${m.trades.slice(-25).reverse().map((t) => `<div class="relrow"><span><small class="muted">${fmtTime(t.t).str.split(' · ')[1]}</small> ${esc(t.from)} → ${esc(t.to)}: ${esc(t.what)}</span><span>$${t.price.toFixed(1)}</span></div>`).join('') || '<p class="muted">No trades yet.</p>'}</div>`;
    for (const c of box.querySelectorAll('[data-spark]')) {
      const k = c.dataset.spark, ctx = c.getContext('2d');
      const pts = m.history.slice(-48).map((h) => h.price[k]);
      if (pts.length < 2) continue;
      const lo = Math.min(...pts), hi = Math.max(...pts) || 1;
      ctx.strokeStyle = '#7cc8ff'; ctx.lineWidth = 1.5; ctx.beginPath();
      pts.forEach((v, i) => { const x = (i / (pts.length - 1)) * 88 + 1, y = 20 - ((v - lo) / Math.max(0.01, hi - lo)) * 18; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
    const wc = $('#wealthChart').getContext('2d'), hist = m.history.slice(-96);
    if (hist.length > 1) {
      const vals = hist.map((h) => h.gini), lo = 0, hi = 1;
      wc.fillStyle = '#151829'; wc.fillRect(0, 0, 300, 70);
      wc.strokeStyle = '#ffcf4a'; wc.beginPath();
      vals.forEach((v, i) => { const x = (i / (vals.length - 1)) * 298 + 1, y = 68 - ((v - lo) / (hi - lo)) * 66; i ? wc.lineTo(x, y) : wc.moveTo(x, y); });
      wc.stroke(); wc.fillStyle = '#9aa0c4'; wc.font = '10px sans-serif'; wc.fillText('Gini over time', 4, 12);
    }
    for (const b of box.querySelectorAll('[data-inject]')) b.onclick = () => { m.stock[b.dataset.inject] += 20; sim.updatePrices(); sim.log('god', `🎁 God dropped 20 ${RES[b.dataset.inject].label.toLowerCase()} into the exchange`); renderEconomy(); };
    $('#eDrought').onclick = () => { m.stock.crops *= 0.3; for (const [k, n] of Object.entries(sim.nodes)) if (!k.startsWith('w')) n.stock *= 0.5; sim.updatePrices(); sim.broadcast('🌵 A terrible drought has withered the crops! Food prices are soaring.', 'director'); renderEconomy(); };
    $('#eBoom').onclick = () => { m.stock.fish += 40; sim.updatePrices(); sim.broadcast('🐟 A huge school of fish arrived – fish is cheap at the exchange!', 'director'); renderEconomy(); };
    $('#eMeals').onclick = () => { for (const l of sim.world.locations) if (l.kind === 'home') { l.storage ||= {}; l.storage.meals = (l.storage.meals || 0) + 5; } sim.log('god', '🍱 God filled every pantry with 5 meals'); renderEconomy(); };
    $('#eFund').onclick = () => { g.treasury += 200; sim.log('god', '🏦 God added $200 to the treasury'); renderEconomy(); };
  }

  // ---------- Commissions (real-world work) ----------
  const openSubs = new Set();
  function workBadge() {
    const n = sim.commissions.reduce((s2, c) => s2 + c.submissions.filter((x) => x.status === 'pending').length, 0);
    const b = $('#workBadge'); b.textContent = n; b.classList.toggle('hidden', !n);
  }
  sim.onCommission = (c, sub) => { workBadge(); toast(`📬 ${sub.name} submitted work for "${c.title}"`); if (state.tab === 'work') renderWork(); };
  const state = { tab: null };
  function renderWork() {
    state.tab = 'work';
    const box = $('#tab-work');
    const tiers = (window.tinyTown?.AI?.tiers || []);
    box.innerHTML = `<div class="card"><h3>📝 Post a commission</h3>
      <p class="muted" style="margin:0 0 6px">Real tasks for your townsfolk: writing, research summaries, code, plans, poems, product ideas… They research the web, write the deliverable with their own model and memories, and you pay them (town $) when you approve.</p>
      <label>Title</label><input id="cTitle" placeholder="Summarize this week's most important AI research in 5 bullet points" />
      <label>Details / requirements</label><textarea id="cDesc" rows="4" placeholder="Audience, length, format, constraints…"></textarea>
      <div class="row"><div><label>Reward ($)</label><input id="cReward" type="number" value="50" /></div><div><label>Model for this task</label><select id="cTier"><option value="">Agent's own brain</option>${tiers.map((t) => `<option value="${t.id}">${t.premium ? '⭐ ' : ''}${esc(t.label)}</option>`).join('')}</select></div></div>
      <label>Who may work on it? (none ticked = everyone)</label><div class="checks">${sim.agents.map((a) => `<label><input type="checkbox" data-as="${a.id}" /> ${esc(a.name)}</label>`).join('')}</div>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="cResearch" checked style="width:auto" /> Agents do web research first</label>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="cMulti" checked style="width:auto" /> Keep open after approval (several agents can earn)</label>
      <div class="btns"><button id="cPost" class="primary">📝 Post commission</button></div></div>` +
      sim.commissions.slice().reverse().map((c) => `<div class="card"><h3>#${c.id} ${esc(c.title)} <span class="badge ${c.status === 'open' ? 'prem' : ''}">${c.status}</span> <span class="muted">$${c.reward}</span></h3>
        <div class="muted" style="font-size:12px">${esc(c.desc).slice(0, 300)}${c.assignees.length ? `<br>Assigned: ${c.assignees.map((id) => esc(sim.agent(id)?.name || '?')).join(', ')}` : ''}${c.workers.length ? `<br>✍️ Working now: ${c.workers.map((id) => esc(sim.agent(id)?.name || '?')).join(', ')}` : ''}</div>
        ${c.submissions.slice().reverse().map((s) => `<div class="sub ${s.status}"><div><b>${esc(s.name)}</b> <small class="muted">${fmtTime(s.t).str} · ${esc(s.model || '')} · ${s.status}${s.rating ? ` ${'⭐'.repeat(s.rating)}` : ''}</small> <button data-tog="${s.id}" style="padding:0 6px">${openSubs.has(s.id) ? 'hide' : 'read'}</button></div>
          ${openSubs.has(s.id) ? `<pre>${esc(s.text)}</pre>` : `<div class="muted">${esc(s.text.slice(0, 160))}…</div>`}
          ${s.status === 'pending' ? `<input data-fb="${s.id}" placeholder="Feedback (optional)" /><div class="btns"><select data-rate="${s.id}" style="width:auto"><option value="0">rating</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${'⭐'.repeat(n)}</option>`).join('')}</select><button data-ok="${c.id}|${s.id}" class="primary">✅ Approve & pay $${c.reward}</button><button data-no="${c.id}|${s.id}" class="danger">❌ Reject</button></div>` : s.feedback ? `<div class="muted">Your feedback: ${esc(s.feedback)}</div>` : ''}
          <div class="btns"><button data-copy="${s.id}">📋 Copy</button><button data-dl="${c.id}|${s.id}">⬇️ .md</button></div></div>`).join('') || '<p class="muted">No submissions yet – agents will pick this up when they decide to.</p>'}
        <div class="btns">${c.status === 'open' ? `<button data-close="${c.id}">Close</button>` : `<button data-reopen="${c.id}">Reopen</button>`}<button data-del="${c.id}" class="danger">🗑️</button></div></div>`).join('');
    $('#cPost').onclick = () => {
      const title = $('#cTitle').value.trim(); if (!title) return toast('Give it a title', true);
      const assignees = [...box.querySelectorAll('[data-as]:checked')].map((x) => x.dataset.as);
      sim.postCommission({ title, desc: $('#cDesc').value, reward: $('#cReward').value, assignees, tier: $('#cTier').value || null, research: $('#cResearch').checked, multi: $('#cMulti').checked });
      toast('📝 Commission posted'); renderWork();
    };
    const find = (v) => { const [cid, sid] = v.split('|'); const c = sim.commissions.find((x) => x.id === cid); return [c, c?.submissions.find((x) => x.id === sid)]; };
    for (const b of box.querySelectorAll('[data-tog]')) b.onclick = () => { openSubs.has(b.dataset.tog) ? openSubs.delete(b.dataset.tog) : openSubs.add(b.dataset.tog); renderWork(); };
    for (const b of box.querySelectorAll('[data-ok]')) b.onclick = () => { const [c, s] = find(b.dataset.ok); sim.reviewSubmission(c, s, true, box.querySelector(`[data-fb="${s.id}"]`).value, Number(box.querySelector(`[data-rate="${s.id}"]`).value)); workBadge(); renderWork(); };
    for (const b of box.querySelectorAll('[data-no]')) b.onclick = () => { const [c, s] = find(b.dataset.no); sim.reviewSubmission(c, s, false, box.querySelector(`[data-fb="${s.id}"]`).value); workBadge(); renderWork(); };
    for (const b of box.querySelectorAll('[data-copy]')) b.onclick = () => { const s = sim.commissions.flatMap((c) => c.submissions).find((x) => x.id === b.dataset.copy); navigator.clipboard?.writeText(s.text); toast('📋 Copied'); };
    for (const b of box.querySelectorAll('[data-dl]')) b.onclick = () => { const [c, s] = find(b.dataset.dl); download(`${c.title.slice(0, 40).replace(/[^a-z0-9]+/gi, '-')}-${s.name.replace(/\s+/g, '-')}.md`, `# ${c.title}\n\n_by ${s.name} (${s.model})_\n\n${s.text}`, 'text/markdown'); };
    for (const b of box.querySelectorAll('[data-close]')) b.onclick = () => { sim.commissions.find((x) => x.id === b.dataset.close).status = 'done'; renderWork(); };
    for (const b of box.querySelectorAll('[data-reopen]')) b.onclick = () => { sim.commissions.find((x) => x.id === b.dataset.reopen).status = 'open'; renderWork(); };
    for (const b of box.querySelectorAll('[data-del]')) b.onclick = () => { sim.commissions = sim.commissions.filter((x) => x.id !== b.dataset.del); renderWork(); };
    workBadge();
  }

  return { renderTown, renderLibrary, renderPrayers, renderMatrix, renderEconomy, renderWork, workBadge, openSave, openLoad, updateBadge };
}
