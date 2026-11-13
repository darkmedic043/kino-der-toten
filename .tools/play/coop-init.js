(() => {
  const h = new Map();
  const net = { id: null, hostId: null, remotes: new Map(), sent: [], on(t, f) { if (!h.has(t)) h.set(t, []); h.get(t).push(f); }, emit(t, ...a) { for (const f of h.get(t) ?? []) f(...a); },
    send(to, m) { this.sent.push([to, m?.t, m?.type]); }, get isHost() { return !!this.id && this.id === this.hostId; } };
  let v; Object.defineProperty(window, 'kino', { configurable: true, get: () => v, set: x => { v = x; if (x && !x.coop) x.coop = net; } });
})();
