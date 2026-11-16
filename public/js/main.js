// Bootstrap: load AI config, create/restore/migrate the town, save slots, run the game loop.
import { AI } from './ai.js';
import { Sim } from './sim.js';
import { Renderer } from './render.js';
import { setupUI } from './ui.js';
import { News, Logger } from './services.js';

const SAVE_KEY = 'tt_save_v3';
const OLD_KEYS = ['tt_save_v2', 'tt_save_v1'];

await AI.init();
News.start();
Logger.start();
const sim = new Sim();

async function serverSave(name, data) {
  const r = await fetch(`/api/saves?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'save failed');
  return true;
}

const fresh = sessionStorage.getItem('tt_fresh');
sessionStorage.removeItem('tt_fresh');
let restored = '';
if (!fresh) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) { sim.load(JSON.parse(raw)); restored = 'local'; }
    else {
      const oldKey = OLD_KEYS.find((k) => localStorage.getItem(k));
      if (oldKey) {
        const old = JSON.parse(localStorage.getItem(oldKey));
        // back up the old save on the server before migrating (old key is left untouched too)
        try { await serverSave(`backup-${oldKey}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`, old); } catch (e) { console.warn('backup failed', e); }
        sim.load(old);
        restored = 'migrated';
      }
    }
  } catch (e) { console.warn('Could not restore save', e); }
}
if (!restored) sim.seed();

sim.applyPins(AI.pins);
// keep a server-side backup of any pre-v3 browser save (re-created if it was ever removed)
(async () => {
  try {
    const list = (await (await fetch('/api/saves')).json()).saves || [];
    for (const k of OLD_KEYS) {
      const raw = localStorage.getItem(k);
      if (raw && !list.some((x) => x.name.startsWith(`backup-${k}`))) await serverSave(`backup-${k}-restored-${new Date().toISOString().slice(0, 10)}`, JSON.parse(raw));
    }
  } catch (e) { console.warn('backup check failed', e); }
})();
const renderer = new Renderer(document.getElementById('game'), sim);
renderer.centerOn(40, 22);

const saveLocal = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(sim.serialize())); } catch (e) { console.warn('local save failed', e); } };
const ui = setupUI({
  sim, renderer, save: saveLocal,
  load: () => { const raw = localStorage.getItem(SAVE_KEY); if (!raw) return false; sim.load(JSON.parse(raw)); return true; },
  serverSave: (name) => serverSave(name, sim.serialize()),
  serverList: async () => (await (await fetch('/api/saves')).json()).saves || [],
  serverLoad: async (name) => { const r = await fetch(`/api/saves?name=${encodeURIComponent(name)}`); if (!r.ok) throw new Error('not found'); sim.load(await r.json()); },
  serverDelete: async (name) => fetch(`/api/saves?name=${encodeURIComponent(name)}`, { method: 'DELETE' }),
  exportJSON: () => {
    const blob = new Blob([JSON.stringify(sim.serialize(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `tiny-town-day${Math.floor(sim.time / 1440) + 1}.json`; a.click();
    URL.revokeObjectURL(a.href);
  },
  importJSON: (d) => { if (!d?.world || !Array.isArray(d.agents)) throw new Error('bad'); sim.load(d); },
  reset: () => { localStorage.removeItem(SAVE_KEY); for (const k of OLD_KEYS) localStorage.removeItem(k); sessionStorage.setItem('tt_fresh', '1'); location.reload(); },
});
if (restored === 'local') ui.toast('📂 Restored your last town (♻️ to start over)');
if (restored === 'migrated') ui.toast('🏗️ Your old town was migrated to the new bigger map – all characters kept. A backup is in the server saves.');
if (restored === 'migrated') saveLocal();

window.addEventListener('resize', () => renderer.resize());
setInterval(saveLocal, 30000);
setInterval(() => serverSave('autosave', sim.serialize()).catch(() => {}), 5 * 60 * 1000);
window.addEventListener('beforeunload', () => { if (!sessionStorage.getItem('tt_fresh')) saveLocal(); });

let last = performance.now();
function frame(ts) {
  const dt = Math.min(0.1, (ts - last) / 1000);
  last = ts;
  sim.update(dt);
  ui.frameUpdate(dt);
  renderer.draw(ts / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.tinyTown = { sim, renderer, AI };

// tell the player when the server has newer code (prevents running a stale tab)
let bootVersion = null;
async function checkVersion() {
  try {
    const { version } = await (await fetch('/api/version', { cache: 'no-store' })).json();
    if (!bootVersion) bootVersion = version;
    else if (version !== bootVersion && !document.getElementById('updBar')) {
      const d = document.createElement('div');
      d.id = 'updBar';
      d.innerHTML = '🆕 A new version of Tiny Town is available. <button id="updBtn" class="primary">Save & reload</button>';
      d.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:40;background:#ffcf4a;color:#222;padding:8px 14px;border-radius:10px;font-weight:700;box-shadow:0 6px 20px rgba(0,0,0,.4)';
      document.body.appendChild(d);
      document.getElementById('updBtn').onclick = () => { saveLocal(); location.reload(); };
    }
  } catch { /* offline */ }
}
checkVersion();
setInterval(checkVersion, 60000);
