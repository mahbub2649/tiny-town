// Client-side AI helper. Talks ONLY to our own server (/api/chat); the API key never reaches the browser.
export const AI = {
  enabled: false,
  tiers: [],
  defaultTier: 'free',
  stats: { calls: 0, errors: 0, tokens: 0, inflight: 0, queued: 0, lastError: '', free: 0, paid: 0, lastModel: '' },
  maxConcurrent: 5,
  _queue: [],

  async init() {
    try {
      const r = await fetch('/api/config');
      const c = await r.json();
      this.enabled = c.aiEnabled;
      this.tiers = c.tiers;
      this.defaultTier = localStorage.getItem('tt_defaultTier') || c.defaultTier;
      this.pins = c.pins || {};
    } catch {
      this.enabled = false;
    }
  },
  tierLabel(id) { return this.tiers.find((t) => t.id === id)?.label || id; },

  chat(tier, messages, maxTokens = 220, temperature = 0.85, purpose = '') {
    return new Promise((resolve, reject) => {
      this._queue.push({ tier: tier || this.defaultTier, messages, maxTokens, temperature, purpose, resolve, reject });
      this.stats.queued = this._queue.length;
      this._pump();
    });
  },
  _pump() {
    while (this.stats.inflight < this.maxConcurrent && this._queue.length) {
      const job = this._queue.shift();
      this.stats.queued = this._queue.length;
      this.stats.inflight++;
      this._run(job).finally(() => { this.stats.inflight--; this._pump(); });
    }
  },
  async _run(job) {
    this.stats.calls++;
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: job.tier, messages: job.messages, max_tokens: job.maxTokens, temperature: job.temperature, purpose: job.purpose }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      if (data.usage) this.stats.tokens += data.usage.total_tokens || 0;
      this.stats.lastModel = data.model || '';
      if (/:free$|^stealth\//.test(data.model || '') || data.usage?.cost === 0) this.stats.free++; else this.stats.paid++;
      job.resolve(data);
    } catch (e) {
      this.stats.errors++;
      this.stats.lastError = e.message;
      job.reject(e);
    }
  },
};

// Pull the first JSON object out of a model reply (handles ```json fences and chatter).
export function parseJSON(text) {
  if (!text) return null;
  const t = text.replace(/```(?:json)?/gi, '');
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s >= 0 && e > s) {
    const chunk = t.slice(s, e + 1);
    try { return JSON.parse(chunk); } catch {
      try { return JSON.parse(chunk.replace(/,\s*}/g, '}').replace(/[“”]/g, '"')); } catch { /* fall through */ }
    }
  }
  const say = t.match(/"say"\s*:\s*"([^"]+)/);
  if (say) return { say: say[1], end: /"end"\s*:\s*true/.test(t) };
  return null;
}
