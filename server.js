// Tiny Town – God Mode server
// Serves the static game, proxies LLM calls to OpenRouter (key stays server-side), scrapes news &
// AI research hourly, offers web search / book lookups for agents, persists logs and save slots.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---- tiny .env loader (no dependencies) ----
(function loadEnv() {
  const p = path.join(__dirname, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();

const API_KEY = process.env.OPENROUTER_API_KEY || '';
const PORT = Number(process.env.PORT || 3000);
const RATE = Number(process.env.RATE_LIMIT_PER_MIN || 300);
const PREMIUM_RATE = Number(process.env.PREMIUM_LIMIT_PER_MIN || 60);
const UA = { 'User-Agent': 'TinyTown/1.0 (agent simulation)' };

// ---- model tiers (browser may only pick a tier id) ----
// Each tier is a fallback chain tried in order by the server; every chain ends in Qwen.
const QWEN = 'qwen/qwen3.6-35b-a3b';
const TIERS = {
  bestfree: { label: 'Best free (tested): Nemotron Ultra → Super → Dots → Lightning → Qwen', models: ['nvidia/nemotron-3-ultra-550b-a55b:free', 'nvidia/nemotron-3.5-super-vl:free', 'dots-studio/dots-3-note-preview:free', 'nvidia/nemotron-3.5-lightning:free', QWEN], premium: false },
  allfree: { label: 'All free models chain → Qwen', models: ['stealth/crouton-alpha', 'xingchen-agi/xing4.0-29b-a4b:free', 'google/gemma-4-31b-it:free', 'nvidia/nemotron-3.5-super-vl:free', QWEN], premium: false },
  crouton: { label: 'Crouton Alpha (stealth, free) → Qwen', models: ['stealth/crouton-alpha', QWEN], premium: false },
  xing: { label: 'Xing 4.0 29B (free) → Qwen', models: ['xingchen-agi/xing4.0-29b-a4b:free', QWEN], premium: false },
  nemotron: { label: 'Nemotron 3.5 Super VL (free) → Qwen', models: ['nvidia/nemotron-3.5-super-vl:free', QWEN], premium: false },
  gemma: { label: 'Gemma 4 31B (free) → Qwen', models: ['google/gemma-4-31b-it:free', QWEN], premium: false },
  qwen: { label: 'Qwen 3.6 35B (~$0.1/M)', models: [QWEN], premium: false },
  haiku: { label: 'Claude Haiku 5.5 → Qwen', models: ['anthropic/claude-haiku-5.5', QWEN], premium: true },
  sonnet: { label: 'Claude Sonnet 5.5 → Qwen', models: ['anthropic/claude-sonnet-5.5', QWEN], premium: true },
};
const DEFAULT_TIER = 'bestfree';

// ---- optional extra OpenAI-compatible providers with your own free keys (Groq, Gemini, Cerebras, …) ----
// .env: EXTRA1_NAME=groq EXTRA1_URL=https://api.groq.com/openai/v1 EXTRA1_KEY=... EXTRA1_MODEL=llama-3.3-70b-versatile
const EXTRA = [1, 2, 3].map((i) => ({ name: process.env[`EXTRA${i}_NAME`], url: process.env[`EXTRA${i}_URL`], key: process.env[`EXTRA${i}_KEY`], model: process.env[`EXTRA${i}_MODEL`] }))
  .filter((p) => p.name && p.url && p.key && p.model).map((p) => ({ ...p, id: `extra:${p.name}` }));
for (const p of EXTRA) {
  TIERS[p.id] = { label: `🔑 ${p.name}: ${p.model} (your free key)`, models: [p.id, QWEN], premium: false };
  TIERS.bestfree.models.splice(TIERS.bestfree.models.length - 1, 0, p.id); // before the paid Qwen fallback
}
// Google Gemini: enabled by GEMINI_API_KEY, offered as its own menu option (other chains are left unchanged)
if (process.env.GEMINI_API_KEY) {
  const gemini = { name: 'gemini', id: 'extra:gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai', key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite' };
  EXTRA.push(gemini);
  TIERS[gemini.id] = { label: `Gemini: ${gemini.model} → Qwen`, models: [gemini.id, QWEN], premium: false };
}
async function callExtra(id, messages, max_tokens, temperature, timeoutMs) {
  const p = EXTRA.find((x) => x.id === id);
  const r = await fetch(`${p.url.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', signal: AbortSignal.timeout(timeoutMs), headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: p.model, messages, max_tokens, temperature }),
  });
  const raw = await r.json().catch(() => ({}));
  const d = Array.isArray(raw) ? raw[0] || {} : raw; // Gemini wraps errors in an array
  if (!r.ok || d.error) throw Object.assign(new Error(d?.error?.message || `${p.name} ${r.status}`), { status: r.status });
  const content = String(d.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if (!content) throw new Error('Empty reply');
  return { content, model: `${p.name}/${p.model}`, usage: { total_tokens: d.usage?.total_tokens || 0, cost: 0 } };
}

// ---- local models via Ollama (free, unlimited, uncensored models possible) ----
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_PARALLEL = Number(process.env.OLLAMA_PARALLEL || 1);
const UNCENSORED = /abliterat|uncensor|dolphin|hermes|nsfw|lexi|mythomax|stheno|lumimaid/i;
let ollamaModels = [];
async function refreshOllama() {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const d = await r.json();
    ollamaModels = (d.models || []).map((m) => m.name).filter((n) => !/embed|math/i.test(n));
  } catch { ollamaModels = []; }
  for (const k of Object.keys(TIERS)) if (k.startsWith('ollama:') || k === 'localfirst' || k === 'hybrid') delete TIERS[k];
  for (const n of ollamaModels) TIERS['ollama:' + n] = { label: `🖥️ Local: ${n}${UNCENSORED.test(n) ? ' (uncensored)' : ''}`, models: ['ollama:' + n], premium: false, local: true };
  const pref = [/qwen3-abliterated/i, /hermes3/i, /abliterat/i, UNCENSORED];
  const best = pref.map((re) => ollamaModels.find((n) => re.test(n))).find(Boolean) || ollamaModels[0];
  if (best) TIERS.hybrid = {
    label: `🧩 Hybrid: talk & romance on local ${best} (uncensored), decisions on free cloud`, local: true, premium: false,
    models: TIERS.bestfree.models,
    route: { talk: ['ollama:' + best, ...TIERS.bestfree.models], 'talk-retry': ['ollama:' + best, ...TIERS.bestfree.models], birth: ['ollama:' + best, QWEN] },
  };
  for (const k of Object.keys(TIERS)) if (k === 'hybrid' && !best) delete TIERS[k];
  if (best) TIERS.localfirst = { label: `🖥️ Local ${best} → free cloud → Qwen`, models: ['ollama:' + best, 'nvidia/nemotron-3.5-super-vl:free', 'dots-studio/dots-3-note-preview:free', QWEN], premium: false, local: true };
}
refreshOllama();
setInterval(refreshOllama, 60000).unref();
// simple FIFO so the local GPU isn't overloaded
let ollamaActive = 0;
const ollamaWaiters = [];
const ollamaAcquire = () => new Promise((res) => { if (ollamaActive < OLLAMA_PARALLEL) { ollamaActive++; res(); } else ollamaWaiters.push(res); });
const ollamaRelease = () => { const n = ollamaWaiters.shift(); if (n) n(); else ollamaActive--; };
async function callOllama(model, messages, max_tokens, temperature, purpose) {
  if (ollamaWaiters.length > 12) throw Object.assign(new Error('Local model queue is full'), { status: 429 });
  await ollamaAcquire();
  try {
    const json = purpose !== 'commission';
    const r = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST', signal: AbortSignal.timeout(purpose === 'commission' ? 300000 : 120000), headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false, think: false, ...(json ? { format: 'json' } : {}), keep_alive: '30m', options: { temperature, num_predict: max_tokens, num_ctx: 8192, repeat_penalty: 1.15 } }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(d.error || `Ollama ${r.status}`);
    const content = String(d.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!content) throw new Error('Empty reply');
    return { content, model: 'ollama:' + model, usage: { total_tokens: (d.prompt_eval_count || 0) + (d.eval_count || 0), cost: 0 } };
  } finally { ollamaRelease(); }
}
// Per-model request options (reasoning control + extra token budget for mandatory reasoning)
const MODEL_OPTS = {
  'stealth/crouton-alpha': { reasoning: { effort: 'low' }, extraTokens: 700 },
  'nvidia/nemotron-3.5-super-vl:free': { reasoning: { enabled: false } },
  'nvidia/nemotron-3-ultra-550b-a55b:free': { reasoning: { enabled: false } },
  'nvidia/nemotron-3.5-lightning:free': { reasoning: { enabled: false } },
  'dots-studio/dots-3-note-preview:free': { reasoning: { enabled: false }, penalties: true },
  'xingchen-agi/xing4.0-29b-a4b:free': { reasoning: { enabled: false }, penalties: true },
  [QWEN]: { reasoning: { enabled: false }, penalties: true },
  'google/gemma-4-31b-it:free': { penalties: true },
};
const VERSION = String(Date.now()); // changes on every server restart / deploy
const cooldown = new Map(); // model -> timestamp until which we skip it after failures

// ---- persistent logs (JSONL, one file per day) ----
const LOG_DIR = path.join(__dirname, 'logs');
const SAVE_DIR = path.join(__dirname, 'saves');
fs.mkdirSync(LOG_DIR, { recursive: true });
fs.mkdirSync(SAVE_DIR, { recursive: true });
const MAX_LOG_BYTES_PER_DAY = Number(process.env.MAX_LOG_MB || 50) * 1024 * 1024;
function appendLog(kind, rows) {
  if (!rows.length) return;
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(LOG_DIR, `${kind}-${day}.jsonl`);
  try { if (fs.existsSync(file) && fs.statSync(file).size > MAX_LOG_BYTES_PER_DAY) return; } catch { /* ignore */ }
  fs.appendFile(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', () => {});
}

// ---- news + AI research, scraped hourly ----
const FEEDS = [
  ['BBC World', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'world'],
  ['NPR', 'https://feeds.npr.org/1001/rss.xml', 'world'],
  ['The Guardian', 'https://www.theguardian.com/world/rss', 'world'],
  ['BBC Tech', 'https://feeds.bbci.co.uk/news/technology/rss.xml', 'tech'],
  ['Hacker News', 'https://hnrss.org/frontpage', 'tech'],
  ['arXiv cs.AI', 'https://rss.arxiv.org/rss/cs.AI', 'ai-research'],
  ['arXiv cs.CL', 'https://rss.arxiv.org/rss/cs.CL', 'ai-research'],
  ['arXiv cs.MA', 'https://rss.arxiv.org/rss/cs.MA', 'ai-research'],
];
const news = { updated: 0, items: [] };
const decodeXml = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/\s+/g, ' ').trim();
async function fetchFeed([source, url, cat]) {
  const out = [];
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: UA });
    const xml = await r.text();
    for (const m of [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].slice(0, 10)) {
      const title = decodeXml(m[0].match(/<title>([\s\S]*?)<\/title>/)?.[1] || '');
      let desc = decodeXml(m[0].match(/<description>([\s\S]*?)<\/description>/)?.[1] || '');
      desc = desc.replace(/^arXiv:\S+\s+Announce Type:\s*\S+\s*Abstract:\s*/i, '').slice(0, 400);
      const link = decodeXml(m[0].match(/<link>([\s\S]*?)<\/link>/)?.[1] || '');
      if (title) out.push({ id: `${source}:${title}`.slice(0, 160), source, cat, title: title.slice(0, 220), desc: source === 'Hacker News' ? '' : desc, link });
    }
  } catch (e) { console.warn('Feed failed:', source, e.message); }
  return out;
}
async function fetchHFPapers() {
  try {
    const r = await fetch('https://huggingface.co/api/daily_papers?limit=10', { signal: AbortSignal.timeout(15000), headers: UA });
    const d = await r.json();
    return d.slice(0, 10).map((p) => ({
      id: `HF Papers:${p.paper.title}`.slice(0, 160), source: 'HF Daily Papers', cat: 'ai-research',
      title: p.paper.title.slice(0, 220), desc: (p.paper.summary || '').replace(/\s+/g, ' ').slice(0, 400), link: `https://huggingface.co/papers/${p.paper.id}`,
    }));
  } catch (e) { console.warn('HF papers failed', e.message); return []; }
}
async function refreshNews() {
  const lists = await Promise.all([...FEEDS.map(fetchFeed), fetchHFPapers()]);
  const all = lists.flat();
  if (!all.length) return;
  const bySrc = {};
  for (const it of all) (bySrc[it.source] ||= []).push(it);
  const mixed = [];
  for (let i = 0; i < 10; i++) for (const s of Object.keys(bySrc)) if (bySrc[s][i]) mixed.push(bySrc[s][i]);
  const fresh = mixed.filter((it) => !news.items.some((o) => o.id === it.id));
  news.items = mixed; news.updated = Date.now();
  appendLog('news', fresh.map((f) => ({ t: new Date().toISOString(), ...f })));
  console.log(`News refreshed: ${mixed.length} items (${fresh.length} new)`);
}
refreshNews();
setInterval(refreshNews, 60 * 60 * 1000).unref();

// ---- web search & books for agents (Wikipedia, arXiv, Hacker News; all free, no keys) ----
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const c = cache.get(key);
  if (c && Date.now() - c.t < ttlMs) return c.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return v;
}
async function webSearch(q) {
  const enc = encodeURIComponent(q);
  const [wiki, arxiv, hn] = await Promise.all([
    fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${enc}&format=json&srlimit=3`, { headers: UA, signal: AbortSignal.timeout(12000) })
      .then((r) => r.json()).then((d) => (d.query?.search || []).map((s) => ({ source: 'Wikipedia', title: s.title, snippet: decodeXml(s.snippet).slice(0, 220) }))).catch(() => []),
    fetch(`https://export.arxiv.org/api/query?search_query=all:${enc}&max_results=3&sortBy=relevance`, { headers: UA, signal: AbortSignal.timeout(12000) })
      .then((r) => r.text()).then((x) => [...x.matchAll(/<entry>[\s\S]*?<\/entry>/g)].map((m) => ({
        source: 'arXiv', title: decodeXml(m[0].match(/<title>([\s\S]*?)<\/title>/)?.[1] || ''), snippet: decodeXml(m[0].match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || '').slice(0, 260),
      }))).catch(() => []),
    fetch(`https://hn.algolia.com/api/v1/search?query=${enc}&hitsPerPage=3`, { signal: AbortSignal.timeout(12000) })
      .then((r) => r.json()).then((d) => (d.hits || []).filter((h) => h.title).map((h) => ({ source: 'Hacker News', title: h.title, snippet: `${h.points || 0} points` }))).catch(() => []),
  ]);
  return [...wiki.slice(0, 2), ...arxiv.slice(0, 2), ...hn.slice(0, 2)];
}
async function bookSummary(topic) {
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic.replace(/ /g, '_'))}`, { headers: UA, signal: AbortSignal.timeout(12000) });
  if (!r.ok) {
    const s = await webSearch(topic);
    return { title: topic, extract: s.map((x) => `${x.title}: ${x.snippet}`).join(' ').slice(0, 900) };
  }
  const d = await r.json();
  return { title: d.title, extract: (d.extract || '').slice(0, 1200) };
}

// ---- rate limiting (per IP + bucket, sliding 60s window) ----
const hits = new Map();
function allowed(ip, bucket, limit) {
  const now = Date.now();
  const key = ip + '|' + bucket;
  const arr = (hits.get(key) || []).filter((t) => now - t < 60000);
  if (arr.length >= limit) { hits.set(key, arr); return false; }
  arr.push(now); hits.set(key, arr);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, a] of hits) if (!a.some((t) => now - t < 60000)) hits.delete(k);
}, 60000).unref();
const ipOf = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit = 64000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function callModel(model, messages, max_tokens, temperature, timeoutMs = 40000, purpose = '') {
  if (model.startsWith('ollama:')) return callOllama(model.slice(7), messages, max_tokens, temperature, purpose);
  if (model.startsWith('extra:')) return callExtra(model, messages, max_tokens, temperature, timeoutMs);
  const o = MODEL_OPTS[model] || {};
  const payload = { model, messages, max_tokens: max_tokens + (o.extraTokens || 0), temperature };
  if (o.reasoning) payload.reasoning = o.reasoning;
  if (o.penalties) { payload.frequency_penalty = 0.4; payload.presence_penalty = 0.4; }
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://tiny-town.local', 'X-Title': 'Tiny Town God Mode' },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw Object.assign(new Error(data?.error?.message || `Upstream ${r.status}`), { status: r.status });
  let content = data.choices?.[0]?.message?.content || '';
  content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if (!content) throw new Error('Empty reply');
  return { content, model: data.model || model, usage: data.usage || null };
}

async function handleChat(req, res) {
  const ip = ipOf(req);
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'Bad request' }); }
  const tier = TIERS[body.tier] || TIERS[DEFAULT_TIER];
  if (!allowed(ip, 'chat', RATE) || (tier.premium && !allowed(ip, 'premium', PREMIUM_RATE))) return send(res, 429, { error: 'Rate limit – slow down a bit' });
  if (tier.models.every((m) => m.startsWith('ollama:')) ? false : !API_KEY && !tier.local) return send(res, 503, { error: 'Server has no OPENROUTER_API_KEY configured' });

  const msgs = Array.isArray(body.messages) ? body.messages : [];
  if (!msgs.length || msgs.length > 12) return send(res, 400, { error: 'Invalid messages' });
  const messages = [];
  for (const m of msgs) {
    if (!m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string') return send(res, 400, { error: 'Invalid message' });
    messages.push({ role: m.role, content: m.content.slice(0, 16000) });
  }
  const max_tokens = Math.min(Math.max(Number(body.max_tokens) || 250, 16), body.purpose === 'commission' ? 1600 : 600);
  const temperature = Math.min(Math.max(Number(body.temperature) || 0.8, 0), 1.3);

  let lastErr = null;
  const models = tier.route?.[body.purpose] || tier.models;
  const chain = models.filter((m, i) => i === models.length - 1 || (cooldown.get(m) || 0) < Date.now());
  for (const model of chain) {
    try {
      const out = await callModel(model, messages, max_tokens, temperature, body.purpose === 'commission' ? 120000 : 40000, body.purpose);
      appendLog('ai', [{ t: new Date().toISOString(), tier: body.tier, model: out.model, tokens: out.usage?.total_tokens, cost: out.usage?.cost, purpose: String(body.purpose || '').slice(0, 40) }]);
      return send(res, 200, { ...out, fallback: model !== tier.models[0] });
    } catch (e) {
      lastErr = e;
      const daily = /per-?day/i.test(e.message);
      cooldown.set(model, Date.now() + (model.startsWith('ollama:') ? 8000 : daily ? 3600000 : e.status === 429 ? 30000 : 90000));
      if (daily) console.warn(`Daily free quota reached for ${model} – skipping it for 1h`);
      appendLog('ai', [{ t: new Date().toISOString(), tier: body.tier, model, error: String(e.message).slice(0, 200) }]);
    }
  }
  send(res, 502, { error: lastErr?.name === 'TimeoutError' ? 'Model timed out' : (lastErr?.message || 'Upstream failed') });
}

// Game events streamed from the browser → logs/events-YYYY-MM-DD.jsonl
async function handleLog(req, res) {
  if (!allowed(ipOf(req), 'log', 40)) return send(res, 429, { error: 'slow down' });
  try {
    const body = JSON.parse(await readBody(req, 200000));
    const rows = (Array.isArray(body.events) ? body.events : []).slice(0, 600).map((e) => ({
      t: new Date().toISOString(), session: String(body.session || '').slice(0, 24),
      game: String(e.game || '').slice(0, 20), type: String(e.type || '').slice(0, 16), text: String(e.text || '').slice(0, 1500),
    }));
    appendLog('events', rows);
    send(res, 200, { ok: true, n: rows.length });
  } catch { send(res, 400, { error: 'bad log' }); }
}

// ---- save slots on disk (saves/<name>.json) ----
const slotName = (s) => String(s || '').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 40);
async function handleSaves(req, res, url) {
  const name = slotName(url.searchParams.get('name'));
  if (req.method === 'GET' && !name) {
    const list = fs.readdirSync(SAVE_DIR).filter((f) => f.endsWith('.json')).map((f) => {
      const st = fs.statSync(path.join(SAVE_DIR, f));
      return { name: f.slice(0, -5), size: st.size, modified: st.mtimeMs };
    }).sort((a, b) => b.modified - a.modified);
    return send(res, 200, { saves: list });
  }
  if (!name) return send(res, 400, { error: 'name required' });
  const file = path.join(SAVE_DIR, name + '.json');
  if (req.method === 'GET') {
    if (!fs.existsSync(file)) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return fs.createReadStream(file).pipe(res);
  }
  if (req.method === 'POST') {
    if (!allowed(ipOf(req), 'save', 20)) return send(res, 429, { error: 'slow down' });
    try {
      const raw = await readBody(req, 12 * 1024 * 1024);
      JSON.parse(raw);
      const count = fs.readdirSync(SAVE_DIR).length;
      if (!fs.existsSync(file) && count >= 60) return send(res, 400, { error: 'too many save slots' });
      fs.writeFileSync(file, raw);
      return send(res, 200, { ok: true, name });
    } catch (e) { return send(res, 400, { error: 'bad save: ' + e.message }); }
  }
  if (req.method === 'DELETE') { try { fs.unlinkSync(file); } catch { /* ignore */ } return send(res, 200, { ok: true }); }
  send(res, 405, { error: 'method' });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
function serveStatic(req, res, url) {
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/api/config' && req.method === 'GET') {
      let pins = {};
      try { pins = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'agent-models.json'), 'utf8')); delete pins._comment; } catch { /* none */ }
      for (const [k, v] of Object.entries(pins)) if (!TIERS[v]) delete pins[k];
      return send(res, 200, { pins, aiEnabled: !!API_KEY || ollamaModels.length > 0, defaultTier: TIERS.hybrid ? 'hybrid' : DEFAULT_TIER, local: ollamaModels, tiers: Object.entries(TIERS).map(([id, t]) => ({ id, label: t.label, premium: t.premium, local: !!t.local })) });
    }
    if (p === '/api/chat' && req.method === 'POST') return handleChat(req, res);
    if (p === '/api/news' && req.method === 'GET') return send(res, 200, news);
    if (p === '/api/version') return send(res, 200, { version: VERSION });
    if (p === '/api/log' && req.method === 'POST') return handleLog(req, res);
    if (p === '/api/saves') return handleSaves(req, res, url);
    if (p === '/api/search' && req.method === 'GET') {
      if (!allowed(ipOf(req), 'search', 40)) return send(res, 429, { error: 'slow down' });
      const q = String(url.searchParams.get('q') || '').slice(0, 120).trim();
      if (!q) return send(res, 400, { error: 'q required' });
      const results = await cached('s:' + q.toLowerCase(), 3600000, () => webSearch(q));
      appendLog('search', [{ t: new Date().toISOString(), q, n: results.length }]);
      return send(res, 200, { q, results });
    }
    if (p === '/api/book' && req.method === 'GET') {
      if (!allowed(ipOf(req), 'book', 40)) return send(res, 429, { error: 'slow down' });
      const topic = String(url.searchParams.get('topic') || '').slice(0, 120).trim();
      if (!topic) return send(res, 400, { error: 'topic required' });
      return send(res, 200, await cached('b:' + topic.toLowerCase(), 86400000, () => bookSummary(topic)));
    }
    if (req.method === 'GET') return serveStatic(req, res, url);
    res.writeHead(405); res.end();
  } catch {
    send(res, 500, { error: 'server error' });
  }
}).listen(PORT, () => {
  console.log(`Tiny Town running at http://localhost:${PORT}  (AI ${API_KEY ? 'enabled' : 'DISABLED – set OPENROUTER_API_KEY'})`);
});
