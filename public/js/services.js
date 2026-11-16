// Real-world news feed (scraped hourly by the server) + event log shipping to the server.
export const News = {
  items: [], updated: 0, known: new Set(), onNew: null,
  async poll() {
    try {
      const r = await fetch('/api/news');
      const d = await r.json();
      if (!d.items?.length) return;
      const fresh = d.items.filter((i) => !this.known.has(i.id));
      for (const i of d.items) this.known.add(i.id);
      const first = !this.items.length;
      this.items = d.items; this.updated = d.updated;
      if (fresh.length && this.onNew) this.onNew(fresh, first);
    } catch { /* offline */ }
  },
  start() { this.poll(); setInterval(() => this.poll(), 5 * 60 * 1000); },
  // a headline this agent hasn't seen yet
  pickFor(a) {
    if (!this.items.length) return null;
    a.seenNews ||= [];
    const unseen = this.items.filter((i) => !a.seenNews.includes(i.id));
    const it = (unseen.length ? unseen : this.items)[Math.floor(Math.random() * Math.min(8, (unseen.length || this.items.length)))];
    a.seenNews.push(it.id);
    if (a.seenNews.length > 60) a.seenNews.shift();
    return it;
  },
};

export const Logger = {
  session: Math.random().toString(36).slice(2, 10),
  queue: [],
  push(game, type, text) { this.queue.push({ game, type, text }); if (this.queue.length > 2000) this.queue.splice(0, 500); },
  async flush() {
    if (!this.queue.length) return;
    const events = this.queue.splice(0, 400);
    try {
      const r = await fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: this.session, events }) });
      if (!r.ok) throw new Error();
    } catch { this.queue.unshift(...events); }
  },
  start() {
    setInterval(() => this.flush(), 8000);
    window.addEventListener('beforeunload', () => {
      if (this.queue.length) navigator.sendBeacon('/api/log', new Blob([JSON.stringify({ session: this.session, events: this.queue.slice(0, 400) })], { type: 'application/json' }));
    });
  },
};
