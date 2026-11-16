// UI: tools, panels, inspector, modals, input handling.
import { T, TILE_INFO, FURN, LOCATION_KINDS } from './world.js';
import { AI } from './ai.js';
import { fmtTime } from './sim.js';
import { findPath } from './pathfind.js';
import { randomColors } from './sprites.js';
import { NEEDS, NEED_KEYS, INV_LIMIT, CRITICAL, MENUS, mood, satisfiesText, clampSatisfies } from './needs.js';
import { News } from './services.js';
import { setupPanels } from './ui2.js';
import { GENE_KEYS, warnAt } from './needs.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ITEM_PRESETS = [
  ['🗺️', 'Treasure map', 'A map marking a spot with a big red X.'],
  ['📜', 'Mysterious letter', 'A sealed letter addressed to "whoever finds this".'],
  ['🔑', 'Old key', 'A heavy iron key. It must open something in town.'],
  ['💎', 'Glowing gem', 'A gem that glows faintly at night.'],
  ['💰', 'Bag of coins', 'A small bag full of old coins.'],
  ['📕', 'Lost diary', 'Someone\'s diary full of secrets.'],
  ['🎸', 'Guitar', 'A well-loved acoustic guitar.'],
  ['📦', 'Package', 'A package with no return address.'],
  ['⚙️', 'Spare parts', 'Gears, springs and wires.'],
  ['🍰', 'Cake', 'A delicious-looking cake with a note: "for the town".'],
  ['🌹', 'Rose', 'A single red rose.'],
  ['🔮', 'Crystal ball', 'It seems to show glimpses of the future.'],
  ['🐱', 'Stray cat', 'A friendly orange cat looking for a home.'],
  ['📻', 'Old radio', 'Plays strange broadcasts at midnight.'],
  ['🧭', 'Compass', 'Always points toward the park, not north.'],
  ['🥚', 'Golden egg', 'A shiny golden egg. Warm to the touch.'],
  ['🍕', 'Pizza', 'A hot, cheesy pizza.', { hunger: 55, fun: 5 }],
  ['💧', 'Water jug', 'Fresh spring water.', { thirst: 50 }],
  ['🍎', 'Basket of apples', 'Crisp red apples.', { hunger: 25 }],
  ['💸', 'Pile of cash', 'Someone dropped a lot of money!', null, { cash: 50 }],
  ['🗿', 'Giant statue', 'A mysterious stone statue. Far too heavy to carry.', null, { carry: false }],
  ['📺', 'Portable TV', 'A small TV. Shows the news.', { fun: 15 }],
];
const TILE_EMOJI = {
  [T.GRASS]: '🟩', [T.PATH]: '🟨', [T.WATER]: '🟦', [T.TREE]: '🌲', [T.WALL]: '🧱', [T.WOOD]: '🟫', [T.TILE]: '⬜',
  [T.DOOR]: '🚪', [T.FLOWER]: '🌸', [T.FENCE]: '🚧', [T.BUSH]: '🌿', [T.CARPET]: '🟥', [T.STONE]: '⬛', [T.SAND]: '🏖️', [T.CROP]: '🌱',
};
const FURN_EMOJI = {
  table: '🍽️', chair: '🪑', bed: '🛏️', shelf: '📚', counter: '🧾', stove: '🍳', fridge: '🧊', sofa: '🛋️', plant: '🪴',
  piano: '🎹', bench: '🪵', desk: '💻', rug: '🟪', stand: '🍎', register: '💵', workbench: '🛠️', crate: '📦', easel: '🎨', lamp: '💡',
  tv: '📺', shower: '🚿', sink: '🚰', arcade: '🕹️', altar: '⛪', whiteboard: '📋',
};
const HINTS = {
  select: 'Click an agent, item or place to inspect · drag to pan · scroll to zoom · Space = pause',
  agent: 'Click on the map to create a new agent there',
  item: 'Pick an item above, then click the map to place it — agents nearby will discover it',
  build: 'Drag a rectangle to build a new place (with or without walls)',
  paint: 'Pick a terrain above, then click / drag to paint',
  furniture: 'Pick furniture above, then click to place it',
  erase: 'Click / drag to remove items, furniture or terrain',
};

export function setupUI({ sim, renderer, save, load, exportJSON, importJSON, reset, serverSave, serverList, serverLoad, serverDelete }) {
  const ui = renderer.ui;
  const state = { tool: 'select', paintTile: T.PATH, furnType: 'table', itemPreset: 0, follow: false, logFilter: new Set(['line', 'action', 'discover', 'money', 'craft', 'romance', 'need', 'news', 'god', 'law', 'knowledge', 'life', 'prayer']), logSearch: '' };
  const canvas = $('#game');

  // ---------- toasts / modal ----------
  function toast(msg, err = false) {
    const d = document.createElement('div');
    d.className = 'toast' + (err ? ' err' : '');
    d.textContent = msg;
    $('#toasts').appendChild(d);
    setTimeout(() => d.remove(), 3500);
  }
  function modal(title, html, onSubmit, submitLabel = 'OK') {
    const card = $('#modalCard');
    card.innerHTML = `<h2>${title}</h2>${html}<div class="btns" style="justify-content:flex-end;margin-top:14px">
      <button type="button" id="mCancel">Cancel</button><button type="submit" class="primary">${submitLabel}</button></div>`;
    $('#modal').classList.remove('hidden');
    const close = () => { $('#modal').classList.add('hidden'); card.onsubmit = null; };
    $('#mCancel').onclick = close;
    card.onsubmit = (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(card).entries());
      for (const cb of card.querySelectorAll('input[type=checkbox]')) fd[cb.name] = cb.checked;
      if (onSubmit(fd, card) !== false) close();
    };
    setTimeout(() => card.querySelector('input,textarea,select')?.focus(), 30);
    return card;
  }
  let bannerTimer;
  function banner(text) {
    const b = $('#banner');
    b.textContent = text; b.classList.remove('hidden');
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.add('hidden'), 5000);
  }
  const tierOptions = (sel, includeDefault) =>
    (includeDefault ? `<option value="">Town default (${esc(AI.tierLabel(AI.defaultTier))})</option>` : '') +
    AI.tiers.map((t) => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${t.premium ? '⭐ ' : ''}${esc(t.label)}</option>`).join('');
  const locOptions = (sel) => sim.world.locations.map((l) => `<option ${l.name === sel ? 'selected' : ''}>${esc(l.name)}</option>`).join('');

  const panels = setupPanels({ sim, renderer, modal, toast, select: (s) => select(s), api: { save, load, serverSave, serverList, serverLoad, serverDelete, afterLoad: () => afterLoad() } });
  // ---------- top bar ----------
  $('#defaultTier').innerHTML = tierOptions(AI.defaultTier);
  $('#defaultTier').onchange = (e) => {
    AI.defaultTier = e.target.value; localStorage.setItem('tt_defaultTier', AI.defaultTier);
    const n = sim.setGlobalModel();
    const pinned = sim.agents.filter((a) => a.pinned).map((a) => a.name);
    sim.log('god', `🧠 Global model → ${AI.tierLabel(AI.defaultTier)} for ${n} agents; personal models & premium mix reset${pinned.length ? ` (pinned kept: ${pinned.join(', ')})` : ''}`);
    toast(`🧠 ${n} agents now use ${AI.tierLabel(AI.defaultTier).split(' (')[0]}${pinned.length ? ` · 📌 kept: ${pinned.join(', ')}` : ''}`);
    renderInspector();
  };
  $('#btnModels').onclick = () => {
    const pinned = sim.agents.filter((a) => a.pinned);
    const mixed = sim.agents.filter((a) => a.mix?.enabled && !a.pinned).length;
    const card = modal('⚙️ Global model settings', `
      <label>Model for everyone</label><select id="gmTier">${tierOptions(AI.defaultTier)}</select>
      <div class="btns"><button type="button" id="gmReset" class="primary">♻️ Reset ALL agents to this model</button></div>
      <p class="muted" style="margin:4px 0 0">Clears personal model choices and turns premium mix off (pinned agents are kept).</p>
      <label style="margin-top:12px">🎲 Premium mix for everyone (${mixed} agents currently mixed)</label>
      <div class="row"><select id="gmPrem">${tierOptions('haiku')}</select><span class="muted" style="flex:0 0 auto">1 in</span><input id="gmEvery" type="number" min="2" value="11" style="flex:0 0 56px" /></div>
      <div class="btns"><button type="button" id="gmMixOn" class="primary">Turn ON for all</button><button type="button" id="gmMixOff">Turn OFF for all</button></div>
      <label style="margin-top:12px">📌 Pinned agents (never changed by global settings)</label>
      ${pinned.map((a) => `<div class="slotrow"><span>${esc(a.name)} <small class="muted">${esc(AI.tierLabel(a.tier || AI.defaultTier))}</small></span><button type="button" data-unpin="${a.id}">Unpin</button></div>`).join('') || '<p class="muted">None. Pin an agent from its inspector (🧠 Model card) or in <code>config/agent-models.json</code>.</p>'}`,
    () => true, 'Close');
    card.querySelector('#gmReset').onclick = () => { $('#defaultTier').value = card.querySelector('#gmTier').value; $('#defaultTier').onchange({ target: $('#defaultTier') }); };
    card.querySelector('#gmMixOn').onclick = () => {
      const prem = card.querySelector('#gmPrem').value, every = card.querySelector('#gmEvery').value;
      const n = sim.setGlobalMix(true, prem, every);
      sim.log('god', `🎲 Premium mix ON for ${n} agents: ~1 in ${every} calls use ${AI.tierLabel(prem)}`); toast(`🎲 ${n} agents: 1 in ${every} calls → ${AI.tierLabel(prem).split(' (')[0]}`); renderInspector();
    };
    card.querySelector('#gmMixOff').onclick = () => { const n = sim.setGlobalMix(false, 'haiku', 11); sim.log('god', `🎲 Premium mix OFF for ${n} agents`); toast('🎲 Premium mix off for everyone'); renderInspector(); };
    for (const b of card.querySelectorAll('[data-unpin]')) b.onclick = () => { const a = sim.agent(b.dataset.unpin); a.pinned = false; b.closest('.slotrow').remove(); toast(`📌 ${a.name} unpinned (note: config/agent-models.json re-pins on reload)`); };
  };
  for (const b of document.querySelectorAll('#speedBtns button')) b.onclick = () => setSpeed(Number(b.dataset.speed));
  let lastSpeed = 1;
  function setSpeed(s) {
    if (s > 0) lastSpeed = s;
    sim.speed = s;
    for (const b of document.querySelectorAll('#speedBtns button')) b.classList.toggle('on', Number(b.dataset.speed) === s);
  }
  $('#btnSave').onclick = () => panels.openSave();
  $('#btnLoad').onclick = () => panels.openLoad();
  $('#btnExport').onclick = exportJSON;
  $('#btnImport').onclick = () => $('#fileInput').click();
  $('#fileInput').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { importJSON(JSON.parse(await f.text())); afterLoad(); toast('⬆️ Imported'); } catch { toast('Invalid file', true); }
    e.target.value = '';
  };
  $('#btnReset').onclick = () => modal('♻️ New town?', '<p class="muted">This discards the current town (unsaved changes are lost).</p>', () => reset(), 'Start over');
  $('#weatherSel').onchange = (e) => sim.setWeather(e.target.value, 6);
  const dirBtn = $('#btnDirector');
  dirBtn.onclick = () => { sim.director.enabled = !sim.director.enabled; dirBtn.textContent = `🎲 ${sim.director.enabled ? "on" : "off"}`; dirBtn.classList.toggle('on', sim.director.enabled); sim.log('god', `🎲 Director ${sim.director.enabled ? 'enabled' : 'disabled'}`); };
  dirBtn.classList.toggle('on', sim.director.enabled); dirBtn.textContent = `🎲 ${sim.director.enabled ? "on" : "off"}`;
  let tickIdx = 0;
  setInterval(() => {
    if (!News.items.length) return;
    const n = News.items[tickIdx++ % News.items.length];
    $('#tickerText').textContent = `${n.title} — ${n.source}`;
  }, 7000);
  $('#btnExportLog').onclick = () => {
    const txt = sim.logs.map((e) => `${fmtTime(e.t).str}\t${e.type}\t${e.text}`).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = 'tiny-town-log.txt'; a.click();
  };
  $('#logSearch').oninput = (e) => { state.logSearch = e.target.value.toLowerCase(); applyLogFilter(); };
  function afterLoad() { sim.applyPins(AI.pins); ui.selected = null; renderInspector(); rebuildLog(); }

  // ---------- tools ----------
  for (const b of document.querySelectorAll('#tools [data-tool]')) b.onclick = () => setTool(b.dataset.tool);
  function setTool(t) {
    state.tool = t;
    for (const b of document.querySelectorAll('#tools [data-tool]')) b.classList.toggle('on', b.dataset.tool === t);
    canvas.classList.toggle('paint', t !== 'select');
    $('#hint').textContent = HINTS[t];
    ui.ghost = null; ui.buildRect = null;
    renderPalette();
  }
  function renderPalette() {
    const p = $('#palette');
    const t = state.tool;
    let html = '';
    if (t === 'paint') {
      html = Object.entries(TILE_INFO).map(([id, i]) => `<button data-v="${id}" class="${Number(id) === state.paintTile ? 'on' : ''}">${TILE_EMOJI[id]} ${i.name}</button>`).join('');
    } else if (t === 'furniture') {
      html = Object.entries(FURN).map(([id, f]) => `<button data-v="${id}" class="${id === state.furnType ? 'on' : ''}">${FURN_EMOJI[id]} ${f.label}</button>`).join('');
      ui.ghost = { w: FURN[state.furnType].w, h: FURN[state.furnType].h };
    } else if (t === 'item') {
      html = ITEM_PRESETS.map(([e, n], i) => `<button data-v="${i}" class="${i === state.itemPreset ? 'on' : ''}" title="${esc(n)}">${e} ${esc(n)}</button>`).join('') +
        `<button data-v="-1" class="${state.itemPreset === -1 ? 'on' : ''}">✏️ Custom…</button>`;
      ui.ghost = { emoji: state.itemPreset >= 0 ? ITEM_PRESETS[state.itemPreset][0] : '❔' };
    }
    p.innerHTML = html;
    p.classList.toggle('hidden', !html);
    for (const b of p.querySelectorAll('button')) b.onclick = () => {
      if (t === 'paint') state.paintTile = Number(b.dataset.v);
      if (t === 'furniture') state.furnType = b.dataset.v;
      if (t === 'item') state.itemPreset = Number(b.dataset.v);
      renderPalette();
    };
  }

  $('#btnEvent').onclick = () => modal('📣 World event',
    `<p class="muted">Everyone in town hears about this and may react.</p>
     <label>What happens?</label><textarea name="text" required placeholder="A traveling circus arrives at Town Square tonight at 19:00!"></textarea>
     <label>Ideas</label><div class="btns">${['A storm is coming tonight — stay indoors!', 'The mayor announces an election next week.', 'Rumor: treasure is buried somewhere in Willow Park.', 'A festival will be held at Town Square tomorrow at noon.']
      .map((s) => `<button type="button" class="idea">${esc(s)}</button>`).join('')}</div>`,
    (fd) => { if (!fd.text.trim()) return false; sim.broadcast(fd.text.trim()); banner('📣 ' + fd.text.trim()); }, 'Broadcast');
  document.addEventListener('click', (e) => { if (e.target.classList?.contains('idea')) $('#modalCard textarea').value = e.target.textContent; });

  $('#btnGoalAll').onclick = () => modal('🎯 Goal for everyone',
    '<label>Goal</label><textarea name="goal" required placeholder="Prepare a surprise birthday party for Theo"></textarea>',
    (fd) => { for (const a of sim.agents) sim.setGoal(a, fd.goal); banner('🎯 New goal for all: ' + fd.goal); }, 'Set goal');

  $('#btnLore').onclick = () => modal('📜 World facts / lore',
    `<p class="muted">Included in every agent's mind. Define how the world works, its history, rules, secrets...</p>
     <textarea name="lore" rows="7">${esc(sim.lore)}</textarea>`,
    (fd) => { sim.lore = fd.lore.slice(0, 1500); toast('📜 Lore updated'); }, 'Save');

  // ---------- tabs ----------
  for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => showTab(b.dataset.tab);
  function showTab(name) {
    for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === name);
    for (const s of document.querySelectorAll('.tab')) s.classList.toggle('hidden', s.id !== 'tab-' + name);
    state.tab = name;
    if (name === 'agents') renderAgents();
    if (name === 'town') panels.renderTown();
    if (name === 'library') panels.renderLibrary();
    if (name === 'prayers') panels.renderPrayers();
    if (name === 'matrix') panels.renderMatrix();
    if (name === 'economy') panels.renderEconomy();
    if (name === 'work') panels.renderWork();
    if (name === 'log') { const l = $('#logList'); l.scrollTop = l.scrollHeight; }
  }

  // ---------- inspector ----------
  function select(sel) { ui.selected = sel; state.follow = false; renderInspector(); showTab('inspect'); }

  function renderInspector() {
    const box = $('#tab-inspect');
    const s = ui.selected;
    if (!s) {
      box.innerHTML = `<div class="card"><h3>👋 You are the god of this town</h3>
        <p class="muted">Click an agent to read their mind, set goals, whisper thoughts or swap their model.
        Use the tools on the left to create agents, items and new places. Broadcast events to stir things up.</p>
        <div class="kv"><b>Agents</b><span>${sim.agents.length}</span><b>Places</b><span>${sim.world.locations.length}</span><b>Items</b><span>${sim.world.items.length}</span></div></div>
        <div class="card"><h3>📍 Places</h3>${sim.world.locations.map((l) => `<div class="agentRow" data-loc="${l.id}">${l.emoji} ${esc(l.name)}</div>`).join('')}</div>`;
      for (const r of box.querySelectorAll('[data-loc]')) r.onclick = () => { const l = sim.world.locations.find((q) => q.id === r.dataset.loc); renderer.centerOn(l.x + l.w / 2, l.y + l.h / 2); select({ kind: 'location', id: l.id }); };
      return;
    }
    if (s.kind === 'agent') return renderAgentInspector(box, sim.agent(s.id));
    if (s.kind === 'item') return renderItemInspector(box, sim.world.items.find((i) => i.id === s.id));
    if (s.kind === 'location') return renderLocationInspector(box, sim.world.locations.find((l) => l.id === s.id));
  }

  function renderAgentInspector(box, a) {
    if (!a) { ui.selected = null; return renderInspector(); }
    const others = sim.agents.filter((b) => b !== a);
    box.innerHTML = `
      <div class="card">
        <h3>${esc(a.name)} <span class="muted">${a.gender === 'female' ? '♀' : a.gender === 'male' ? '♂' : '⚠️'} ${a.age} · gen ${a.generation || 1}</span> <span class="badge ${AI.tiers.find((t) => t.id === (a.tier || AI.defaultTier))?.premium ? 'prem' : ''}">${esc(AI.tierLabel(a.tier || AI.defaultTier).split(' (')[0])}</span></h3>
        ${a.gender ? '' : '<div class="card" style="border-color:var(--accent)">⚠️ Gender not set – choose one below in Identity.</div>'}
        <div class="gene"><span>❤️ Health</span><div class="bar"><div id="aHealthBar" style="width:0"></div></div><span id="aHealth"></span></div>
        <div id="dynStatus"></div>
        <div class="btns">
          <button id="aBless">🌟 Bless</button>
          <button id="aSmite">⚡ Smite</button>
          <button id="aFollow">${state.follow ? '🎥 Following' : '🎥 Follow'}</button>
          <button id="aThink">🧠 Think now</button>
          <button id="aDelete" class="danger">🗑️ Remove</button>
        </div>
      </div>
      <div class="card"><h3>❤️ Needs <span class="muted" id="aMood"></span></h3>
        ${NEED_KEYS.map((k) => `<div class="need"><span>${NEEDS[k].emoji}</span><span>${NEEDS[k].label}</span><input type="range" min="0" max="100" data-need="${k}" /><span data-needv="${k}"></span></div>`).join('')}
        <p class="muted" style="margin:4px 0 0">God mode: drag a slider to change a need.</p>
      </div>
      <div class="card"><h3>💰 Money & job</h3>
        <div class="row"><div class="money" id="aMoney"></div><button id="aMoneyPlus" style="flex:none">+$20</button><button id="aMoneyMinus" style="flex:none">−$20</button></div>
        <div class="row" style="margin-top:6px"><div><label>Job title</label><input id="aJobTitle" value="${esc(a.job.title)}" /></div><div style="flex:0 0 64px"><label>$/hour</label><input id="aJobWage" type="number" value="${a.job.wage}" /></div></div>
        <label>Workplace</label><select id="aJobPlace"><option value="">(none)</option>${locOptions(a.job.place)}</select>
        <div class="btns"><button id="aSaveJob">Save job</button></div>
        <div class="muted" id="aStats" style="margin-top:6px"></div>
      </div>
      <div class="card"><h3>🎒 Inventory <span class="muted" id="aInvCount"></span></h3>
        <div class="inv" id="aInv"></div>
        <label>Give them an item</label>
        <div class="row"><select id="aGiveSel">${ITEM_PRESETS.map(([e, n], i) => `<option value="${i}">${e} ${esc(n)}</option>`).join('')}</select><button id="aGiveBtn" style="flex:none">🎁 Give</button></div>
      </div>
      <div class="card"><h3>👥 Relationships</h3><div id="aRel"></div></div>
      <div class="card"><h3>🧬 Genes & learning</h3>
        ${GENE_KEYS.map((k) => `<div class="gene"><span>${k}</span><div class="bar"><div style="width:${(a.genes?.[k] || 0) * 100}%;background:#c0a0ff"></div></div><input data-gene="${k}" type="number" step="0.05" min="0" max="1" value="${a.genes?.[k] ?? 0.5}" style="padding:1px 3px" /></div>`).join('')}
        <label>Learned urgency thresholds (grow when neglect hurts them)</label><div id="aLearn" class="muted" style="font-size:12px"></div>
        <div class="kv" style="margin-top:6px"><b>Fitness</b><span id="aFit"></span><b>Record</b><span id="aRec"></span><b>Aspiration</b><span id="aAsp"></span><b>Question</b><span id="aQ"></span></div>
      </div>
      <div class="card"><h3>🏦 Memory bank <span class="muted" id="bankCount"></span></h3><div id="aBank"></div>
        <div class="row" style="margin-top:6px"><input id="aBankAdd" placeholder="Implant a core memory…" /><button id="aBankBtn" style="flex:none">Add</button></div></div>
      <div class="card"><h3>🎯 Goal</h3>
        <textarea id="aGoal" placeholder="e.g. Find out who stole the cake">${esc(a.goal)}</textarea>
        <div class="btns"><button id="aSetGoal" class="primary">Set goal</button><button id="aClearGoal">Clear</button></div>
      </div>
      <div class="card"><h3>✨ Whisper a thought</h3>
        <div class="row"><input id="aWhisper" placeholder="You suddenly remember you left the oven on" /><button id="aSendWhisper" style="flex:none">Send</button></div>
        <label>Make them talk to…</label>
        <div class="row"><select id="aTalkTo">${others.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select><button id="aGoTalk" style="flex:none">💬 Go</button></div>
      </div>
      <div class="card"><h3>🧠 Model</h3>
        <select id="aTier">${tierOptions(a.tier, true)}</select>
        <label style="display:flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" id="aPin" style="width:auto" ${a.pinned ? 'checked' : ''}/> 📌 Pin this model (global changes won't touch it)</label>
        <label style="display:flex;gap:6px;align-items:center;margin-top:4px"><input type="checkbox" id="aMixOn" style="width:auto" ${a.mix?.enabled ? 'checked' : ''}/> 🎲 Mixed brain: occasionally use a premium model</label>
        <div class="row"><select id="aMixPrem">${tierOptions(a.mix?.premium || 'haiku')}</select><span style="flex:0 0 auto" class="muted">1 in</span><input id="aMixEvery" type="number" min="2" value="${a.mix?.every || 11}" style="flex:0 0 56px" /></div>
        <div class="muted" style="font-size:12px;margin-top:4px" id="aMixStats"></div>
        <p class="muted" style="margin:6px 0 0">Give key characters a smarter model (e.g. Claude Haiku 5.5) for richer behaviour.</p>
      </div>
      <div class="card"><h3>🪪 Identity</h3>
        <div class="row"><div><label>Name</label><input id="aName" value="${esc(a.name)}" /></div><div style="flex:0 0 70px"><label>Age</label><input id="aAge" type="number" value="${a.age}" /></div></div>
        <label>Gender</label><select id="aGender"><option value="">(not set)</option><option value="female" ${a.gender === 'female' ? 'selected' : ''}>♀ Female</option><option value="male" ${a.gender === 'male' ? 'selected' : ''}>♂ Male</option></select>
        <label>Home</label><select id="aHome">${locOptions(a.home)}</select>
        <label>Persona</label><textarea id="aPersona" rows="4">${esc(a.persona)}</textarea>
        <div class="btns"><button id="aSaveId">Save identity</button><button id="aRecolor">🎨 New look</button></div>
      </div>
      <div class="card"><h3>📚 Memories <span class="muted" id="memCount"></span></h3><div id="dynMem"></div></div>`;
    $('#aFollow').onclick = () => { state.follow = !state.follow; $('#aFollow').textContent = state.follow ? '🎥 Following' : '🎥 Follow'; };
    $('#aThink').onclick = () => { sim.interrupt(a); toast(`🧠 ${a.name} is reconsidering`); };
    $('#aDelete').onclick = () => modal(`Remove ${esc(a.name)}?`, '<p class="muted">They will vanish from town.</p>', () => { sim.removeAgent(a); select(null); }, 'Remove');
    $('#aSetGoal').onclick = () => { sim.setGoal(a, $('#aGoal').value); toast('🎯 Goal set'); };
    $('#aClearGoal').onclick = () => { $('#aGoal').value = ''; sim.setGoal(a, ''); };
    const whisper = () => { const v = $('#aWhisper').value.trim(); if (v) { sim.whisper(a, v); $('#aWhisper').value = ''; toast('✨ Whispered'); } };
    $('#aSendWhisper').onclick = whisper;
    $('#aWhisper').onkeydown = (e) => { if (e.key === 'Enter') whisper(); };
    $('#aGoTalk').onclick = () => {
      const b = sim.agent($('#aTalkTo').value); if (!b) return;
      sim.interrupt(a);
      a.talkTarget = b.id; a.talkTopic = 'something on your mind'; a.talkGiveUpAt = sim.now + 90;
      a.path = findPath(sim.world, a.x, a.y, b.x, b.y) || [];
      a.action = { text: `Going to talk to ${b.name}`, emoji: '💬', minutes: 10, started: true, until: sim.time + 30 };
      sim.log('god', `💬 ${a.name} feels the urge to talk to ${b.name}`, [a.id, b.id]);
    };
    const saveMix = () => {
      a.mix = { ...(a.mix || {}), enabled: $('#aMixOn').checked, premium: $('#aMixPrem').value, every: Math.max(2, Number($('#aMixEvery').value) || 11), base: a.tier || null };
      sim.log('god', `🎲 ${a.name}'s brain: ${a.mix.enabled ? `${AI.tierLabel(a.mix.base || AI.defaultTier)} + 1 in ${a.mix.every} calls ${AI.tierLabel(a.mix.premium)}` : 'single model'}`, [a.id]);
      toast(a.mix.enabled ? `🎲 ${a.name}: ~1 in ${a.mix.every} calls uses ${AI.tierLabel(a.mix.premium)}` : 'Mixed brain off');
    };
    $('#aPin').onchange = (e) => { a.pinned = e.target.checked; sim.log('god', `📌 ${a.name} ${a.pinned ? 'pinned to' : 'unpinned from'} ${AI.tierLabel(a.tier || AI.defaultTier)}`, [a.id]); };
    $('#aMixOn').onchange = saveMix; $('#aMixPrem').onchange = saveMix; $('#aMixEvery').onchange = saveMix;
    $('#aTier').onchange = (e) => { a.tier = e.target.value || null; if (a.mix) a.mix.base = a.tier; toast(`🧠 ${a.name} now uses ${AI.tierLabel(a.tier || AI.defaultTier)}`); renderInspector(); };
    $('#aSaveId').onclick = () => {
      a.name = $('#aName').value.trim() || a.name; a.age = Number($('#aAge').value) || a.age;
      a.home = $('#aHome').value; a.persona = $('#aPersona').value.trim().slice(0, 600); a.gender = $('#aGender').value || null;
      toast('🪪 Saved'); renderInspector();
    };
    $('#aRecolor').onclick = () => { a.colors = randomColors(); };
    $('#aBless').onclick = () => { sim.bless(a); toast(`🌟 Blessed ${a.name}`); };
    $('#aSmite').onclick = () => { sim.smite(a); toast(`⚡ Smote ${a.name}`); };
    $('#aGender').onchange = (e) => { a.gender = e.target.value || null; sim.log('god', `⚧ ${a.name} is ${a.gender || 'unspecified'}`, [a.id]); };
    for (const r of document.querySelectorAll('[data-gene]')) r.onchange = () => { a.genes[r.dataset.gene] = Math.max(0, Math.min(1, Number(r.value) || 0)); sim.log('god', `🧬 God edited ${a.name}'s ${r.dataset.gene} gene → ${a.genes[r.dataset.gene]}`, [a.id]); renderInspector(); };
    $('#aBankBtn').onclick = () => { const v = $('#aBankAdd').value.trim(); if (!v) return; sim.addBank(a, v, 5, 'implanted'); sim.log('god', `🧠 God implanted a memory in ${a.name}: "${v}"`, [a.id]); $('#aBankAdd').value = ''; a._bankN = -1; };
    for (const r of document.querySelectorAll('[data-need]')) r.oninput = () => { a.needs[r.dataset.need] = Number(r.value); };
    for (const r of document.querySelectorAll('[data-need]')) r.onchange = () => sim.log('god', `🎛️ God set ${a.name}'s ${NEEDS[r.dataset.need].label.toLowerCase()} to ${r.value}`, [a.id]);
    $('#aMoneyPlus').onclick = () => sim.giveMoney(a, 20);
    $('#aMoneyMinus').onclick = () => sim.giveMoney(a, -Math.min(20, a.money));
    $('#aSaveJob').onclick = () => {
      a.job = { title: $('#aJobTitle').value.trim() || 'Unemployed', place: $('#aJobPlace').value, wage: Math.max(0, Number($('#aJobWage').value) || 0) };
      sim.remember(a, `My job is now: ${a.job.title}${a.job.place ? ` at ${a.job.place} ($${a.job.wage}/h)` : ''}.`, 4);
      sim.log('god', `💼 ${a.name} is now ${a.job.title}${a.job.place ? ` at ${a.job.place}` : ''}`, [a.id]); toast('💼 Job saved');
    };
    $('#aGiveBtn').onclick = () => {
      if (a.inventory.length >= INV_LIMIT) return toast(`${a.name}'s bag is full (${INV_LIMIT})`, true);
      const [e, n, d, sat] = ITEM_PRESETS[Number($('#aGiveSel').value)];
      a.inventory.push({ name: n, emoji: e, desc: d, satisfies: clampSatisfies(sat), carry: true });
      sim.remember(a, `${e} ${n} mysteriously appeared in my bag: ${d}`, 4);
      sim.log('god', `🎁 God put ${e} ${n} in ${a.name}'s bag`, [a.id]);
    };
    a._memRendered = -1; a._invKey = null; a._bankN = -1;
    refreshDynamic();
  }

  function renderItemInspector(box, it) {
    if (!it) { ui.selected = null; return renderInspector(); }
    const where = sim.world.locationAt(it.x, it.y)?.name || 'outdoors';
    box.innerHTML = `<div class="card"><h3>${it.emoji} ${esc(it.name)}</h3>
      <div class="kv"><b>Where</b><span>${esc(where)} (${it.x}, ${it.y})</span>
      <b>Known by</b><span>${it.knownBy.map((id) => esc(sim.agent(id)?.name)).filter(Boolean).join(', ') || 'nobody yet'}</span></div></div>
      <div class="card"><label>Emoji</label><input id="iEmoji" value="${esc(it.emoji)}" />
      <label>Name</label><input id="iName" value="${esc(it.name)}" />
      <label>Description (what agents learn on discovery)</label><textarea id="iDesc">${esc(it.desc)}</textarea>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="iHidden" style="width:auto" ${it.hidden ? 'checked' : ''}/> Hidden (only found when standing right next to it)</label>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="iCarry" style="width:auto" ${it.carry ? 'checked' : ''}/> Carriable</label>
      <div class="kv"><b>Effects</b><span>${satisfiesText(it.satisfies) || '—'}</span><b>Cash</b><span>$${it.cash || 0}</span><b>Made by</b><span>${esc(it.madeBy || '—')}</span></div>
      <div class="btns"><button id="iSave" class="primary">Save</button><button id="iForget">Make everyone forget</button><button id="iDel" class="danger">🗑️ Delete</button></div></div>`;
    $('#iSave').onclick = () => { it.emoji = $('#iEmoji').value.trim() || it.emoji; it.name = $('#iName').value.trim() || it.name; it.desc = $('#iDesc').value.trim(); it.hidden = $('#iHidden').checked; it.carry = $('#iCarry').checked; toast('Saved'); renderInspector(); };
    $('#iForget').onclick = () => { it.knownBy = []; renderInspector(); };
    $('#iDel').onclick = () => { sim.world.items = sim.world.items.filter((i) => i !== it); select(null); };
  }

  function renderLocationInspector(box, l) {
    if (!l) { ui.selected = null; return renderInspector(); }
    const here = sim.agents.filter((a) => sim.world.locationAt(a.x | 0, a.y | 0) === l);
    const items = sim.world.items.filter((i) => sim.world.locationAt(i.x, i.y) === l);
    box.innerHTML = `<div class="card"><h3>${l.emoji} ${esc(l.name)}</h3>
      <div class="kv"><b>People</b><span>${here.map((a) => esc(a.name)).join(', ') || 'nobody'}</span>
      <b>Items</b><span>${items.map((i) => i.emoji + ' ' + esc(i.name)).join(', ') || 'none'}</span>
      <b>Residents</b><span>${sim.agents.filter((a) => a.home === l.name).map((a) => esc(a.name)).join(', ') || '—'}</span></div></div>
      <div class="card"><label>Name</label><input id="lName" value="${esc(l.name)}" />
      <label>Kind</label><select id="lKind">${Object.entries(LOCATION_KINDS).map(([k, e]) => `<option value="${k}" ${k === l.kind ? 'selected' : ''}>${e} ${k}</option>`).join('')}</select>
      <label>Description (optional, agents see it via lore)</label><textarea id="lDesc">${esc(l.desc || '')}</textarea>
      <label>Owner (receives sales money)</label><select id="lOwner"><option value="">(town)</option>${sim.agents.map((a) => `<option ${a.name === l.owner ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
      <div class="btns"><button id="lSave" class="primary">Save</button><button id="lDel" class="danger">🗑️ Remove place</button></div></div>
      <div class="card"><h3>🛒 Shop menu ${l.saleUntil > sim.time ? '<span class="badge prem">50% SALE</span>' : ''}</h3>
        ${(l.shop || []).map((m, i) => `<div class="relrow"><span>${m.emoji} ${esc(m.name)} <small class="muted">${satisfiesText(m.satisfies)}</small></span><span>$${m.price} <button data-mrm="${i}" style="padding:0 5px">✕</button></span></div>`).join('') || '<p class="muted">Not a shop. Add items to make it one.</p>'}
        <div class="row" style="margin-top:6px"><input id="mEmoji" placeholder="🍩" style="flex:0 0 44px" /><input id="mName" placeholder="Donut" /><input id="mPrice" type="number" placeholder="$" style="flex:0 0 54px" /></div>
        <div class="row" style="margin-top:4px"><select id="mNeed">${NEED_KEYS.map((k) => `<option value="${k}">${NEEDS[k].emoji} ${NEEDS[k].label}</option>`).join('')}</select><input id="mAmt" type="number" placeholder="+30" style="flex:0 0 60px" /><button id="mAdd" style="flex:none">Add</button></div>
        <div class="btns">${l.shop?.length ? '<button id="lSale">🏷️ Start 50% sale (4h)</button>' : ''}<button id="lDefMenu">Use default ${esc(l.kind)} menu</button></div>
      </div>`;
    $('#lSave').onclick = () => {
      const old = l.name;
      l.name = $('#lName').value.trim() || l.name; l.kind = $('#lKind').value; l.emoji = LOCATION_KINDS[l.kind]; l.desc = $('#lDesc').value.trim();
      for (const a of sim.agents) if (a.home === old) a.home = l.name;
      if (l.desc) sim.lore = sim.lore.replace(new RegExp(`\\n?${old}: .*`, 'g'), '') + `\n${l.name}: ${l.desc}`;
      toast('Saved'); renderInspector();
    };
    $('#lOwner').onchange = (e) => { l.owner = e.target.value || null; sim.log('god', `🔑 ${l.name} is now owned by ${l.owner || 'the town'}`); };
    for (const b of document.querySelectorAll('[data-mrm]')) b.onclick = () => { l.shop.splice(Number(b.dataset.mrm), 1); renderInspector(); };
    $('#mAdd').onclick = () => {
      const name = $('#mName').value.trim(); if (!name) return;
      (l.shop ||= []).push({ name, emoji: $('#mEmoji').value.trim() || '📦', price: Math.max(0, Number($('#mPrice').value) || 1), satisfies: clampSatisfies({ [$('#mNeed').value]: Number($('#mAmt').value) || 0 }) });
      sim.log('god', `🛒 ${l.name} now sells ${name}`); renderInspector();
    };
    if ($('#lSale')) $('#lSale').onclick = () => { l.saleUntil = sim.time + 240; sim.broadcast(`${l.name} is having a 50% off sale for the next 4 hours!`); renderInspector(); };
    $('#lDefMenu').onclick = () => { l.shop = (MENUS[l.kind] || MENUS.shop).map((m) => ({ ...m })); renderInspector(); };
    $('#lDel').onclick = () => { sim.world.locations = sim.world.locations.filter((q) => q !== l); select(null); toast('Place removed (walls stay — use Erase to remove them)'); };
  }

  function refreshDynamic() {
    const s = ui.selected;
    if (s?.kind !== 'agent') return;
    const a = sim.agent(s.id);
    const st = $('#dynStatus');
    if (!a || !st) return;
    const act = a.convoId ? '💬 In a conversation' : a.thinking ? '💭 Thinking…' : a.action ? `${a.action.emoji} ${esc(a.action.text)}` : '…';
    st.innerHTML = `<div class="kv"><b>Doing</b><span>${act}</span><b>At</b><span>${esc(sim.locName(a))}${a.action?.dest && a.path.length ? ` → ${esc(a.action.dest)}` : ''}</span>
      <b>Thought</b><span><i>${esc(a.thought || '—')}</i></span><b>Inventory</b><span>${a.inventory.map((i) => i.emoji + ' ' + esc(i.name)).join(', ') || 'empty'}</span>
      <b>Home</b><span>${esc(a.home)}</span><b>Last model</b><span class="muted">${esc(a.action?.model || '—')}</span></div>`;
    const md = mood(a.needs);
    $('#aMood').textContent = `${md.face} mood ${md.score}`;
    for (const r of document.querySelectorAll('[data-need]')) {
      const v = a.needs[r.dataset.need];
      if (document.activeElement !== r) r.value = v;
      r.className = v < CRITICAL ? 'crit' : v < 40 ? 'low' : '';
      document.querySelector(`[data-needv="${r.dataset.need}"]`).textContent = Math.round(v);
    }
    $('#aMoney').textContent = `$${a.money.toFixed(0)}`;
    $('#aStats').textContent = `Earned $${a.stats.earned.toFixed(0)} · spent $${a.stats.spent.toFixed(0)} · created ${a.stats.created} · destroyed ${a.stats.destroyed} · chats ${a.stats.talks}`;
    const invKey = a.inventory.map((i) => i.name).join('|');
    if (a._invKey !== invKey) {
      a._invKey = invKey;
      $('#aInvCount').textContent = `(${a.inventory.length}/${INV_LIMIT})`;
      $('#aInv').innerHTML = a.inventory.map((i, idx) => `<span class="slot" title="${esc(i.desc)}${i.madeBy ? ` — made by ${esc(i.madeBy)}` : ''}">${i.emoji} ${esc(i.name)} <small class="muted">${satisfiesText(i.satisfies)}</small><button data-rm="${idx}" title="Delete">✕</button></span>`).join('') +
        Array.from({ length: Math.max(0, INV_LIMIT - a.inventory.length) }, () => '<span class="slot empty">empty</span>').join('');
      for (const b of document.querySelectorAll('[data-rm]')) b.onclick = () => {
        const [it] = a.inventory.splice(Number(b.dataset.rm), 1);
        sim.log('god', `🧹 God removed ${it.emoji} ${it.name} from ${a.name}'s bag`, [a.id]);
      };
    }
    const relRows = Object.entries(a.rel).map(([id, r]) => [sim.agent(id), r]).filter(([b, r]) => b && r.met).sort((x, y) => Math.abs(y[1].score) + y[1].attraction - Math.abs(x[1].score) - x[1].attraction);
    $('#aRel').innerHTML = relRows.map(([b, r]) => { const t = sim.relType(a, b); return `<div class="relrow"><span>${/wife|husband|spouse/.test(t) ? '💍 ' : /friend$|girlfriend|boyfriend|partner/.test(t) && a.romance?.partner === b.id ? '💕 ' : ''}${esc(b.name)} <small class="muted">${esc(t)}</small></span><span>${r.score >= 0 ? '😊' : '😠'} ${Math.round(r.score)} · 💘 ${Math.round(r.attraction)}</span></div>`; }).join('') || '<p class="muted">Hasn\'t met anyone yet.</p>';
    $('#aHealth').textContent = Math.round(a.health);
    if ($('#aMixStats')) $('#aMixStats').textContent = a.mix?.enabled ? `Calls so far: ${a.mix.baseCalls || 0} base · ${a.mix.premiumCalls || 0} premium · last used: ${AI.tierLabel(a.lastTierUsed || a.tier || AI.defaultTier).split(' (')[0]}` : '';
    $('#aHealthBar').style.width = a.health + '%'; $('#aHealthBar').style.background = a.health < 30 ? '#ff7a7a' : a.health < 60 ? '#ffb14a' : '#6fe39a';
    $('#aLearn').textContent = NEED_KEYS.map((k) => `${NEEDS[k].emoji} <${Math.round(warnAt(a, k))}`).join('  ');
    $('#aFit').textContent = (a.fitness ?? 0).toFixed(1);
    $('#aRec').textContent = `${a.record.crimes} crimes, $${a.record.fines} fines${a.jailedUntil > sim.time ? ' · ⛓️ JAILED' : ''}`;
    $('#aAsp').textContent = a.aspiration || '—'; $('#aQ').textContent = a.question || '—';
    if (a._bankN !== a.bank.length) {
      a._bankN = a.bank.length;
      $('#bankCount').textContent = `(${a.bank.length})`;
      $('#aBank').innerHTML = [...a.bank].reverse().map((m) => `<div class="mem i${m.imp}"><small>${fmtTime(m.t).str} · ${esc(m.kind)}</small>${esc(m.text)}</div>`).join('') || '<p class="muted">Empty.</p>';
    }
    if (a._memRendered !== a.memories.length) {
      a._memRendered = a.memories.length;
      $('#memCount').textContent = `(${a.memories.length})`;
      $('#dynMem').innerHTML = [...a.memories].reverse().map((m) => `<div class="mem i${m.imp}"><small>${fmtTime(m.t).str}</small>${esc(m.text)}</div>`).join('') || '<p class="muted">No memories yet.</p>';
    }
  }

  // ---------- agents tab ----------
  function renderAgents() {
    const box = $('#tab-agents');
    box.innerHTML = sim.agents.map((a) => {
      const prem = AI.tiers.find((t) => t.id === (a.tier || AI.defaultTier))?.premium;
      const status = a.convoId ? '💬 talking' : a.thinking ? '💭 thinking' : a.asleep ? '😴 sleeping' : `${a.action?.emoji || ''} ${esc(a.action?.text || '')}`;
      return `<div class="agentRow" data-id="${a.id}"><div class="av" style="background:${a.colors.shirt}">${a.action?.emoji || '🙂'}</div>
        <div class="meta"><div><b>${esc(a.name)}</b> ${mood(a.needs).face} <span class="muted">${a.gender === 'female' ? '♀' : a.gender === 'male' ? '♂' : ''}</span> <span class="badge">$${a.money.toFixed(0)}</span> <span class="badge">❤️${Math.round(a.health)}</span> ${a.romance?.partner ? (a.romance.status === 'married' ? '💍' : '💕') : ''} ${sim.gov?.leaderId === a.id ? '👑' : ''} ${prem ? '<span class="badge prem">⭐</span>' : ''}</div><div>${status} · ${esc(sim.locName(a))}</div></div></div>`;
    }).join('') + '<p class="muted">Tip: use the 🧑 tool to add more agents.</p>';
    for (const r of box.querySelectorAll('.agentRow')) r.onclick = () => { const a = sim.agent(r.dataset.id); renderer.centerOn(a.x, a.y); select({ kind: 'agent', id: a.id }); };
  }

  // ---------- log ----------
  const logEl = $('#logList');
  const TYPE_KEY = { talk: 'line', line: 'line', action: 'action', thought: 'thought', discover: 'discover', item: 'discover', consume: 'discover',
    money: 'money', buy: 'money', create: 'craft', destroy: 'craft', romance: 'romance', need: 'need', news: 'news', tv: 'news',
    econ: 'money', commission: 'god', law: 'law', crime: 'law', knowledge: 'knowledge', reflect: 'knowledge', death: 'life', birth: 'life', prayer: 'prayer' };
  const typeKey = (t) => TYPE_KEY[t] || 'god';
  const visible = (d) => state.logFilter.has(d.dataset.k) && (!state.logSearch || d.textContent.toLowerCase().includes(state.logSearch));
  function applyLogFilter() { for (const d of logEl.children) d.style.display = visible(d) ? '' : 'none'; }
  function logEntryEl(e) {
    const d = document.createElement('div');
    d.className = 'log ' + e.type;
    d.dataset.k = typeKey(e.type);
    const tm = fmtTime(e.t).str.split(' · ')[1];
    if (e.type === 'line') {
      const i = e.text.indexOf(': ');
      d.innerHTML = `<small>${tm}</small><b>${esc(e.text.slice(0, i))}</b>: ${esc(e.text.slice(i + 2))}`;
    } else d.innerHTML = `<small>${tm}</small>${esc(e.text)}`;
    if (!visible(d)) d.style.display = 'none';
    return d;
  }
  function appendLog(e) {
    const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40;
    logEl.appendChild(logEntryEl(e));
    while (logEl.children.length > 600) logEl.firstChild.remove();
    if (atBottom) logEl.scrollTop = logEl.scrollHeight;
    if (e.type === 'event' || e.type === 'director' || e.type === 'death' || e.type === 'birth' || (e.type === 'law' && e.text.startsWith('📣'))) banner(e.text);
    if (e.type === 'romance' && e.text.startsWith('💕')) banner(e.text);
  }
  function rebuildLog() { logEl.innerHTML = ''; for (const e of sim.logs) logEl.appendChild(logEntryEl(e)); logEl.scrollTop = logEl.scrollHeight; }
  for (const cb of document.querySelectorAll('.logfilters input')) cb.onchange = () => {
    cb.checked ? state.logFilter.add(cb.dataset.f) : state.logFilter.delete(cb.dataset.f);
    applyLogFilter();
  };
  sim.onLog = appendLog;
  rebuildLog();

  // ---------- canvas input ----------
  let drag = null;
  const tileAt = (e) => {
    const r = canvas.getBoundingClientRect();
    const w = renderer.screenToWorld(e.clientX - r.left, e.clientY - r.top);
    return { x: Math.floor(w.x), y: Math.floor(w.y), sx: e.clientX - r.left, sy: e.clientY - r.top };
  };
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p = tileAt(e);
    const pan = e.button === 1 || e.button === 2 || state.tool === 'select';
    drag = { sx: e.clientX, sy: e.clientY, cx: renderer.cam.x, cy: renderer.cam.y, pan, moved: false, start: p };
    if (e.button !== 0) return;
    const t = state.tool;
    if (t === 'build') { ui.buildRect = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; drag.pan = false; }
    else if (t === 'paint' || t === 'erase') applyBrush(p);
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = tileAt(e);
    ui.hover = state.tool === 'select' ? null : { x: p.x, y: p.y };
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.pan) {
      renderer.cam.x = drag.cx - dx / renderer.cam.zoom;
      renderer.cam.y = drag.cy - dy / renderer.cam.zoom;
      if (drag.moved) state.follow = false;
    } else if (ui.buildRect) { ui.buildRect.x1 = p.x; ui.buildRect.y1 = p.y; }
    else if ((state.tool === 'paint' || state.tool === 'erase') && e.buttons & 1) applyBrush(p);
  });
  canvas.addEventListener('pointerup', (e) => {
    const d = drag; drag = null;
    if (!d || e.button !== 0) return;
    const p = tileAt(e);
    const t = state.tool;
    if (t === 'select' && !d.moved) {
      const a = renderer.agentAt(p.sx, p.sy);
      if (a) return select({ kind: 'agent', id: a.id });
      const it = sim.world.items.find((i) => i.x === p.x && i.y === p.y);
      if (it) return select({ kind: 'item', id: it.id });
      const l = sim.world.locationAt(p.x, p.y);
      select(l ? { kind: 'location', id: l.id } : null);
    } else if (t === 'agent') openAddAgent(p);
    else if (t === 'item') openAddItem(p);
    else if (t === 'furniture') placeFurniture(p);
    else if (t === 'build' && ui.buildRect) openBuild();
  });
  canvas.addEventListener('pointerleave', () => { ui.hover = null; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    renderer.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input,textarea,select')) return;
    if (!$('#modal').classList.contains('hidden')) { if (e.key === 'Escape') $('#mCancel')?.click(); return; }
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); setSpeed(sim.speed > 0 ? 0 : lastSpeed); }
    else if (k === 'escape') { setTool('select'); select(null); }
    else if ('1234567'.includes(k) && k) setTool(['select', 'agent', 'item', 'build', 'paint', 'furniture', 'erase'][Number(k) - 1]);
    else if (k === '+' || k === '=') renderer.zoomAt(renderer.vw / 2, renderer.vh / 2, 1.15);
    else if (k === '-') renderer.zoomAt(renderer.vw / 2, renderer.vh / 2, 1 / 1.15);
    else keys.add(k);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  // ---------- god actions on map ----------
  function applyBrush(p) {
    const W = sim.world;
    if (!W.inBounds(p.x, p.y)) return;
    if (state.tool === 'paint') {
      if (W.get(p.x, p.y) === state.paintTile) return;
      W.set(p.x, p.y, state.paintTile);
    } else {
      const it = W.items.find((i) => i.x === p.x && i.y === p.y);
      if (it) { W.items = W.items.filter((i) => i !== it); return; }
      const f = W.furnitureAt(p.x, p.y);
      if (f) { W.furniture = W.furniture.filter((q) => q !== f); W.dirty = true; }
      else if (W.get(p.x, p.y) !== T.GRASS) W.set(p.x, p.y, T.GRASS);
      else return;
    }
    W.rebuildBlocked();
  }

  function placeFurniture(p) {
    const W = sim.world, d = FURN[state.furnType];
    for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) {
      if (!W.inBounds(p.x + i, p.y + j) || W.furnitureAt(p.x + i, p.y + j) || W.get(p.x + i, p.y + j) === T.WALL) return toast('No room there', true);
    }
    W.addFurniture(state.furnType, p.x, p.y, state.furnType === 'bed' || state.furnType === 'sofa' || state.furnType === 'rug' ? { color: randomColors().shirt } : {});
    W.rebuildBlocked();
  }

  function openAddAgent(p) {
    if (!sim.world.walkable(p.x, p.y)) return toast('Pick a walkable spot', true);
    modal('🧑 Create agent', `
      <div class="row"><div><label>Name</label><input name="name" required placeholder="Ada Lovelace" /></div><div style="flex:0 0 80px"><label>Age</label><input name="age" type="number" value="30" /></div></div>
      <label>Gender</label><select name="gender" required><option value="">– choose –</option><option value="female">♀ Female</option><option value="male">♂ Male</option></select>
      <label>Persona</label><textarea name="persona" rows="3" required placeholder="A traveling merchant who just arrived in town, selling curious trinkets. Charming but secretive."></textarea>
      <label>Goal (optional)</label><input name="goal" placeholder="Sell the crystal ball to someone" />
      <label>Home</label><select name="home">${locOptions('Town Square')}</select>
      <label>Brain (model)</label><select name="tier">${tierOptions(null, true)}</select>`,
    (fd) => {
      if (!fd.gender) { toast('Choose a gender', true); return false; }
      const a = sim.addAgent({ name: fd.name, age: Number(fd.age) || 30, gender: fd.gender, persona: fd.persona, goal: fd.goal, home: fd.home, tier: fd.tier || null, x: p.x, y: p.y });
      sim.remember(a, `I just arrived in town. I've never met anyone here.`, 3);
      sim.log('god', `✨ ${a.name} was created at ${sim.locName(a)}`, [a.id]);
      select({ kind: 'agent', id: a.id });
    }, 'Create');
  }

  function openAddItem(p) {
    const pre = state.itemPreset >= 0 ? ITEM_PRESETS[state.itemPreset] : ['❔', '', ''];
    const sat = pre[3] || {}, ex = pre[4] || {};
    modal('🎁 Place item', `
      <div class="row"><div style="flex:0 0 70px"><label>Emoji</label><input name="emoji" value="${pre[0]}" /></div><div><label>Name</label><input name="name" required value="${esc(pre[1])}" /></div></div>
      <label>Description — what agents learn when they find it</label><textarea name="desc" rows="3">${esc(pre[2])}</textarea>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="hidden" style="width:auto" /> Hidden (must be right next to it)</label>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="carry" style="width:auto" ${ex.carry === false ? '' : 'checked'} /> Carriable (fits in a bag)</label>
      <label>Effects when consumed (need points, e.g. hunger +40)</label>
      <div class="row" style="flex-wrap:wrap">${NEED_KEYS.map((k) => `<div style="flex:0 0 70px"><small>${NEEDS[k].emoji} ${NEEDS[k].label}</small><input name="sat_${k}" type="number" value="${sat[k] || ''}" /></div>`).join('')}</div>
      <label>Cash inside ($, given to whoever picks it up)</label><input name="cash" type="number" value="${ex.cash || 0}" />`,
    (fd) => {
      const satisfies = {};
      for (const k of NEED_KEYS) if (Number(fd['sat_' + k])) satisfies[k] = Number(fd['sat_' + k]);
      const it = sim.addItem({ ...fd, satisfies, cash: Number(fd.cash) || 0, x: p.x, y: p.y });
      sim.log('god', `🎁 Placed ${it.emoji} ${it.name} at ${sim.world.locationAt(p.x, p.y)?.name || 'outdoors'}`);
    }, 'Place');
  }

  function openBuild() {
    const br = ui.buildRect;
    const x = Math.min(br.x0, br.x1), y = Math.min(br.y0, br.y1);
    const w = Math.abs(br.x1 - br.x0) + 1, h = Math.abs(br.y1 - br.y0) + 1;
    if (w < 2 || h < 2) { ui.buildRect = null; return toast('Drag a bigger rectangle', true); }
    const canWall = w >= 4 && h >= 4;
    const card = modal(`🏗️ New place (${w}×${h})`, `
      <label>Name</label><input name="name" required placeholder="Moonlight Bakery" />
      <label>Kind</label><select name="kind">${Object.entries(LOCATION_KINDS).map(([k, e]) => `<option value="${k}">${e} ${k}</option>`).join('')}</select>
      <label>Floor</label><select name="floor">
        <option value="${T.WOOD}">🟫 Wood</option><option value="${T.TILE}">⬜ Tile</option><option value="${T.CARPET}">🟥 Carpet</option>
        <option value="${T.STONE}">⬛ Stone</option><option value="${T.SAND}">🏖️ Sand</option><option value="keep">Keep terrain</option></select>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="walls" style="width:auto" ${canWall ? 'checked' : 'disabled'} /> Walls (building)</label>
      <label>Door side</label><select name="door"><option>bottom</option><option>top</option><option>left</option><option>right</option></select>
      <label>Description (optional – added to lore)</label><input name="desc" placeholder="Sells bread at dawn; the owner is never seen" />`,
    (fd) => {
      const W = sim.world;
      const floor = fd.floor === 'keep' ? null : Number(fd.floor);
      if (fd.walls) {
        W.furniture = W.furniture.filter((f) => !(f.x >= x && f.x < x + w && f.y >= y && f.y < y + h));
        const door = {
          bottom: { x: x + (w >> 1), y: y + h - 1 }, top: { x: x + (w >> 1), y },
          left: { x, y: y + (h >> 1) }, right: { x: x + w - 1, y: y + (h >> 1) },
        }[fd.door];
        W.building(x, y, w, h, floor ?? T.WOOD, door);
        const out = { bottom: [0, 1], top: [0, -1], left: [-1, 0], right: [1, 0] }[fd.door];
        const ox = door.x + out[0], oy = door.y + out[1];
        if (W.inBounds(ox, oy) && !TILE_INFO[W.get(ox, oy)].walk) W.set(ox, oy, T.PATH);
        var nl = W.addLocation(fd.name.trim(), x + 1, y + 1, w - 2, h - 2, fd.kind); nl.walls = true;
      } else {
        if (floor != null) W.fill(x, y, w, h, floor);
        var nl = W.addLocation(fd.name.trim(), x, y, w, h, fd.kind);
      }
      if (MENUS[fd.kind]) nl.shop = MENUS[fd.kind].map((m) => ({ ...m }));
      if (fd.desc) sim.lore += `\n${fd.name.trim()}: ${fd.desc}`;
      W.rebuildBlocked();
      sim.broadcast(`A new place has appeared in town: ${fd.name.trim()}${fd.desc ? ` – ${fd.desc}` : ''}.`);
      ui.buildRect = null;
    }, 'Build');
    card.querySelector('#mCancel').addEventListener('click', () => { ui.buildRect = null; });
  }

  // ---------- periodic ----------
  let tick = 0;
  function frameUpdate(dt) {
    const sp = 400 * dt / renderer.cam.zoom;
    if (keys.has('w') || keys.has('arrowup')) renderer.cam.y -= sp;
    if (keys.has('s') || keys.has('arrowdown')) renderer.cam.y += sp;
    if (keys.has('a') || keys.has('arrowleft')) renderer.cam.x -= sp;
    if (keys.has('d') || keys.has('arrowright')) renderer.cam.x += sp;
    if (state.follow && ui.selected?.kind === 'agent') {
      const a = sim.agent(ui.selected.id);
      if (a) renderer.centerOn(a.x, a.y);
    }
    tick += dt;
    if (tick > 0.4) {
      tick = 0;
      $('#clock').textContent = `${fmtTime(sim.time).str} ${sim.speed === 0 ? '⏸' : ''}`;
      const s = AI.stats;
      const st = $('#aiStatus');
      st.classList.toggle('off', !AI.enabled);
      st.textContent = AI.enabled
        ? `AI ✓ · 🆓${s.free} 💲${s.paid} · ${(s.tokens / 1000).toFixed(1)}k tok${s.inflight + s.queued ? ` · ⏳${s.inflight + s.queued}` : ''}${s.errors ? ` · ⚠️${s.errors}` : ''}`
        : 'AI offline (scripted mode)';
      st.title = `Free-model calls: ${s.free}, paid (fallback/premium): ${s.paid}. Last model: ${s.lastModel}.${s.lastError ? ` Last error: ${s.lastError}` : ''} If paid climbs fast, OpenRouter's daily free quota is used up.`;
      if (document.activeElement !== $('#weatherSel')) $('#weatherSel').value = sim.weather.kind;
      refreshDynamic();
      if (!$('#tab-agents').classList.contains('hidden')) renderAgents();
      state.slowTick = (state.slowTick || 0) + 1;
      if (state.slowTick % 5 === 0 && !document.activeElement?.matches?.('input,textarea,select')) {
        if (state.tab === 'town') panels.renderTown();
        if (state.tab === 'matrix') panels.renderMatrix();
        if (state.tab === 'economy') panels.renderEconomy();
      }
    }
  }

  setTool('select');
  renderInspector();
  if (!AI.enabled) toast('AI is offline — agents follow simple scripts. Set OPENROUTER_API_KEY on the server.', true);
  return { frameUpdate, toast, select };
}
