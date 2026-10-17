// Co-op for Der Eisendrache. The multiplayer mod (mods/multiplayer, docs/fork/coop.md) makes the host run the zombies,
// the round, doors and power; everything this map adds rides on this layer:
//   act(type, data)       a shared event. Solo it applies at once. In a room it goes to the host, which applies it,
//                         numbers it and sends it to everyone else in that order, so every client runs the same events
//                         in the same order. Each handler gets ctx = {by, mine, host, rand}: `mine` is true on the
//                         client of the player who caused it (personal effects: weapons, teleports, toasts), `host` on
//                         the host (zombie damage), `rand()` a random stream seeded by the host (the same on every
//                         client).
//   on(type, fn)          handle an event (several handlers per type are fine)
//   fx(type, data)        a passing effect (onFx handlers): everyone shows it at once; not ordered or logged
//   shared(key, get, set) state the host owns and sends 5 times a second (timers, positions); guests apply it
//   hurt(z, amount, ctx)  zombie damage, on the host only (its zombies are the real ones), credited to ctx.by: a
//                         teammate's kill pays them (the multiplayer mod's `res` message)
//   flag(name)            a session flag for the whole team
//   players()             every player's feet {id, me, pos} (teammates from their poses)
// The host keeps the log of the game's events; a guest that joins late asks for it and replays it. Kills: the host
// relays its zombies' deaths as `kill` events ({p, kind, melee, head, by: the killer's id, bp: where the killer stood, crawler}), which the quests count
// on every client (the multiplayer mod's `dmg` sets host.remoteBy to the teammate who hit).
import * as THREE from 'three';

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function createSync(api) {
  const { host, session, enemies, player } = api;
  const net = window.kino?.coop ?? null;
  const online = () => !!net?.id;
  const me = () => (online() ? net.id : 'solo');
  const isHost = () => !online() || net.isHost;
  const handlers = new Map(), fxHandlers = new Map(), states = new Map(), log = [];
  let seq = 0, lastSeq = 0;
  function apply(type, data, by, seed, fx = false) {
    const list = (fx ? fxHandlers : handlers).get(type); if (!list) return;
    const ctx = { by, mine: by === me(), host: isHost(), rand: fx ? Math.random : mulberry(seed ?? 1), type };
    for (const fn of list) { try { fn(data ?? {}, ctx); } catch (e) { console.warn('[castle sync]', type, e); } }
  }
  function order(type, data, by) {   // the host: apply, log, send
    const seed = (Math.random() * 4294967296) >>> 0, n = ++seq;
    log.push([n, type, data, by, seed]); apply(type, data, by, seed);
    if (online()) net.send('all', { t: 'cev', n, type, data, by, seed });
  }
  function act(type, data = {}) {
    if (!online() || net.isHost) return order(type, data, me());
    net.send('host', { t: 'creq', type, data });
  }
  if (net) {
    net.on('creq', (m, from) => { if (net.isHost) order(m.type, m.data, from); });
    net.on('cev', m => { if (net.isHost || m.n <= lastSeq) return; lastSeq = m.n; log.push([m.n, m.type, m.data, m.by, m.seed]); apply(m.type, m.data, m.by, m.seed); });
    net.on('clogreq', (m, from) => { if (net.isHost) net.send(from, { t: 'clog', log }); });
    net.on('clog', m => { if (net.isHost) return; for (const [n, type, data, by, seed] of m.log ?? []) if (n > lastSeq) { lastSeq = n; log.push([n, type, data, by, seed]); apply(type, data, by, seed); } });
    net.on('cfx', (m, from) => apply(m.type, m.data, from, null, true));
    net.on('cst', m => { if (net.isHost) return; for (const [k, s] of Object.entries(m.s ?? {})) { try { states.get(k)?.set(s); } catch (e) { console.warn('[castle sync] state', k, e); } } });
    // a new host (the old one left) carries on from the log it has; numbering continues after it
    net.on('host', id => { if (id === net.id) seq = Math.max(seq, lastSeq); });
  }
  let stT = 0;
  host.on('update', dt => {
    if (!online() || !net.isHost || !dt) return; if ((stT -= dt) > 0) return; stT = .2;
    const s = {}; for (const [k, v] of states) { try { s[k] = v.get(); } catch (e) { console.warn('[castle sync] state', k, e); } }
    net.send('all', { t: 'cst', s });
  });
  // a new game: the log starts over (the multiplayer mod resets every client together)
  // A guest's own reset can land after the host's first new-game events (wiping them): it asks for the log again.
  host.on('reset', () => { log.length = 0; seq = lastSeq = 0; if (online() && !net.isHost) setTimeout(() => net.send('host', { t: 'clogreq' }), 400); });
  // the host's zombie deaths, for everyone's quest counters
  // (after the frame's other kill listeners: the dragons look up the body by its position)
  host.on('kill', e => { if (!isHost() || !e.enemy?.root) return; const p = e.enemy.root.position.toArray().map(x => Math.round(x * 10) / 10), d = { p, kind: e.enemy.kind ?? e.kind, melee: !!e.melee, head: !!e.head, by: (host.remoteDamage && host.remoteBy) || me(), crawler: !!e.enemy.crawler }, kp = d.by === me() ? player.getFeetPosition() : net?.remotes?.get(d.by)?.pos; if (kp) d.bp = [kp.x, kp.y, kp.z].map(x => Math.round(x * 10) / 10); queueMicrotask(() => act('kill', d)); });

  const on = (type, fn) => { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(fn); };
  on('flag', d => { session.flags.add(d.name); });
  return {
    act, on,
    // a passing effect (an arrow's element): applied here and sent straight to everyone, not ordered or logged (a late
    // joiner doesn't replay it); its handlers get the same ctx (rand is Math.random)
    fx(type, data = {}) { apply(type, data, me(), null, true); if (online()) net.send('all', { t: 'cfx', type, data }); },
    onFx(type, fn) { if (!fxHandlers.has(type)) fxHandlers.set(type, []); fxHandlers.get(type).push(fn); },
    shared(key, get, set) { states.set(key, { get, set }); },
    flag: name => { if (!session.flags.has(name)) act('flag', { name }); },
    get online() { return online(); }, get isHost() { return isHost(); }, get me() { return me(); }, net,
    // a guest asks for the log once its map is set up (events sent while it loaded went nowhere)
    ready() { if (online() && !net.isHost) net.send('host', { t: 'clogreq' }); },
    hurt(z, amount, ctx = {}, { head = false, melee = false, cause = 'explosion' } = {}) {
      if (!isHost() || !z || !enemies.list.includes(z)) return;
      if (!online() || !ctx.by || ctx.by === me()) return enemies.hurt(z, amount, head, melee, cause);
      host.remoteDamage = true; host.remoteBy = ctx.by;
      try { enemies.hurt(z, amount, head, melee, cause, false); } finally { host.remoteDamage = false; host.remoteBy = null; }
      if (!enemies.list.includes(z)) net.send(ctx.by, { t: 'res', killed: true, head, melee, kind: z.kind });
    },
    // damage a player: the host's own, or a teammate's through the multiplayer mod's `hit` message
    hitPlayer(id, amount) { if (!online() || id === me()) return api.damage?.(amount); net.send(id, { t: 'hit', amount }); },
    nearest(p) { let best = null, bd = Infinity; for (const q of this.players()) { if (q.down) continue; const d = q.pos.distanceTo(p); if (d < bd) { bd = d; best = q; } } return best; },
    players() {
      const out = [{ id: me(), me: true, pos: player.getFeetPosition() }];
      for (const r of net?.remotes?.values() ?? []) if (r.pos && !r.dead) out.push({ id: r.id, me: false, pos: r.pos.clone(), down: !!r.down });
      return out;
    },
    v: a => new THREE.Vector3(...a), a: v => [v.x, v.y, v.z].map(x => Math.round(x * 10) / 10),
  };
}
