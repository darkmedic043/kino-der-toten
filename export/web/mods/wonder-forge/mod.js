// Wonder Forge (fork 2026-11-21, user: "for wolf bow, and any subsequent upgradable wonder weapon, there should be a new
// app in the terminal ... let you upgrade them into any respective element, giving a handful of unique challenges that can
// be completed on any map ... must have gotten the upgrade at least once before, like the relic system").
//   - FORGE.EXE (terminal booth app) lists every upgradable wonder weapon in UPGRADES. Holding its base weapon (the Wrath
//     of the Ancients) you ATTUNE it to one upgrade path; only the attuned path's challenges count. Switching keeps each
//     path's progress for the rest of the match.
//   - A path opens only when its relic is owned (mods/bo3-weapons/relics.js: the element bows earned on Der Eisendrache).
//   - Each path has its own challenges, themed on that upgrade's quest and playable on any map. When all are done, FORGE
//     swaps the base weapon in your inventory for the upgrade (once per path per match).
//   - Progress is per match and local to each player (like T.E.D.D. tasks); 'reset' clears it.
// Arrow kills are counted from bows.js's 'bowImpact' event (one per burst arrow): kills near the burst within IMPACT_MS
// belong to it. window.kino.wonderForge: {status(), act('attune'|'forge', 'weapon:path') -> true | 'reason', debug}.
import * as THREE from 'three';

const IMPACT_R = 450, IMPACT_MS = 700, TERMINAL_R = 350, PICK_R = 80, M = 40;   // M: units per metre (BO1 scale)
// ctx for kill(): {e, held (base weapon in hand), arrow (claimed by an arrow burst), bow (held || arrow), air, low, nearTerm, at, feet}
// impact(): {kills, full, k, dist (from where it was shot), near (from you when it burst)}
export const UPGRADES = [
  { base: 'bo3_wrath_ancients', name: 'Wrath of the Ancients', short: 'WRATH', paths: [
    { id: 'storm', weapon: 'bo3_bow_storm', relic: 'relic.bow_storm', name: "Storm Bow", sub: "KESTREL'S STORM", color: '#7fd0ff', give: 'storm', challenges: [
      { id: 'rod', name: 'LIGHTNING ROD', text: 'Kill 4 or more zombies with one fully drawn arrow.', goal: 3, unit: 'BOLTS', impact: i => i.full && i.kills >= 4 },
      { id: 'sky', name: 'STORMRIDER', text: 'Kill zombies with the bow while you are in the air.', goal: 12, unit: 'AIR KILLS', kill: c => c.bow && c.air },
      { id: 'cells', name: 'BATTERIES', text: 'Kill zombies with the bow within reach of a terminal: each kill charges it.', goal: 15, unit: 'CHARGES', kill: c => c.bow && c.nearTerm },
      { id: 'beacons', name: 'BEACONS', text: `Kill zombies with arrows that burst over ${Math.round(1000 / M)} metres from where you shot them.`, goal: 4, unit: 'LONG SHOTS', impact: i => i.kills > 0 && i.dist > 1000 },
    ] },
    { id: 'rune', weapon: 'bo3_bow_rune', relic: 'relic.bow_rune', name: 'Fire Bow', sub: 'RUNE OF FIRE', color: '#ff7a2e', give: 'rune', challenges: [
      { id: 'kindling', name: 'KINDLING', text: 'Kill zombies in arrow bursts.', goal: 30, unit: 'BURNED', impact: i => i.kills },
      { id: 'golf', name: 'MAGMA GOLF', text: 'Fire arrows that each kill, one after another. An arrow that kills nothing starts the run again.', goal: 6, unit: 'IN A ROW', streak: 'impact' },
      { id: 'obelisk', name: 'THE OBELISK', text: 'Kill zombies with the bow in a single round. Your best round counts.', goal: 20, unit: 'IN ONE ROUND', perRound: true },
      { id: 'circle', name: 'RUNIC CIRCLE', text: 'Kill zombies with the bow without leaving the circle your first kill draws (6 metres across). Step out and it breaks.', goal: 9, unit: 'IN THE CIRCLE', circle: 120 },
    ] },
    { id: 'wolf', weapon: 'bo3_bow_wolf', relic: 'relic.bow_wolf', name: 'Wolf Bow', sub: 'WOLF HOWL', color: '#a8dcff', give: 'wolf', challenges: [
      { id: 'bones', name: 'BONES OF THE PACK', text: 'Zombies killed with the bow sometimes leave a glowing bone. Pick them up before they fade.', goal: 6, unit: 'BONES', drop: { chance: .25, life: 20, color: 0xcfeaff } },
      { id: 'stalk', name: 'STALKER', text: 'Kill zombies with the bow while crouched, prone or sliding.', goal: 12, unit: 'LOW KILLS', kill: c => c.bow && c.low },
      { id: 'lone', name: 'LONE WOLF', text: 'Kill zombies with the bow without taking damage. Your best chain counts; a hit starts a new one.', goal: 20, unit: 'CHAIN', streak: 'hurt' },
      { id: 'hunt', name: 'THE HUNT', text: 'Kill 10 zombies with the bow within 30 seconds.', goal: 3, unit: 'HUNTS', hunt: { n: 10, s: 30 } },
    ] },
    { id: 'demon', weapon: 'bo3_bow_demon', relic: 'relic.bow_demon', name: 'Void Bow', sub: 'DEMON GATE', color: '#b97bff', give: 'demon', challenges: [
      { id: 'seal', name: 'BREAK THE SEAL', text: 'Kill zombies with melee attacks while the bow is in your hands.', goal: 8, unit: 'MELEE KILLS', kill: c => c.held && c.e.melee },
      { id: 'runes', name: 'DEMONIC RUNES', text: 'Zombies killed with the bow sometimes leave a rune. Collect them before they fade.', goal: 5, unit: 'RUNES', drop: { chance: .2, life: 12, color: 0xb06bff } },
      { id: 'maw', name: 'THE MAW', text: `Kill zombies with arrows that burst within ${Math.round(250 / M)} metres of you.`, goal: 15, unit: 'CLOSE KILLS', impact: i => i.near < 250 ? i.kills : 0 },
      { id: 'devotion', name: 'DEVOTION', text: 'Finish a round with at least 12 kills, every one of them with the bow.', goal: 1, unit: 'ROUNDS', devotion: 12 },
    ] },
  ] },
];

export default async function setup(api) {
  const { host, session, player } = api;
  const feet = () => player.getFeetPosition();
  const booths = () => window.kino.terminalBooth?.booths ?? [];
  const owned = () => { try { return JSON.parse(localStorage.getItem('kino.mods.progression'))?.rewards ?? {}; } catch { return {}; } };
  const has = id => session.inventory?.some(w => w.id === id);
  const find = key => { const [w, p] = String(key ?? '').split(':'), up = UPGRADES.find(u => u.base === w); return up && { up, path: up.paths.find(x => x.id === p) }; };
  // per match: prog[base][path][challenge] = count; attuned[base] = path id; forged[base] = Set of path ids
  let prog = {}, attuned = {}, forged = {}, impacts = [], pickups = [], round = null, hunts = {}, streaks = {}, circles = {};
  const fresh = () => { prog = {}; attuned = {}; forged = {}; impacts = []; pickups = []; round = { bow: 0, other: 0 }; hunts = {}; streaks = {}; circles = {}; };
  fresh();
  const count = (u, p, c) => prog[u.base]?.[p.id]?.[c.id] ?? 0;
  const done = (u, p) => p.challenges.every(c => count(u, p, c) >= c.goal);
  const active = () => { const out = []; for (const u of UPGRADES) { const p = u.paths.find(x => x.id === attuned[u.base]); if (p && !forged[u.base]?.has(p.id)) out.push([u, p]); } return out; };

  function bump(u, p, c, n = 1, set = false) {
    const was = count(u, p, c); if (was >= c.goal || !n) return;
    const v = Math.min(c.goal, set ? Math.max(was, n) : was + n); if (v === was) return;
    ((prog[u.base] ??= {})[p.id] ??= {})[c.id] = v;
    if (v >= c.goal) {
      if (done(u, p)) { api.announce?.(p.name.toUpperCase(), 'READY TO FORGE AT ANY TERMINAL', 3.5); api.audio?.play?.('round', .5); for (const b of booths()) b.print?.('FORGE: ' + p.name.toUpperCase() + ' READY'); }
      else { api.toast?.(`${p.name}: ${c.name} COMPLETE`, 3); api.audio?.play?.('buy', .6); }
    } else if (c.goal <= 6 || v % 5 === 0) api.toast?.(`${c.name} ${v} / ${c.goal}`, 1.6);
  }

  // ---- arrow bursts (bows.js) and the kills they claim
  host.on('bowImpact', e => {
    if (e.el !== 'base') return;   // the upgraded bows have nothing left to forge
    const f = feet(), p = new THREE.Vector3(...e.p);
    impacts.push({ t: performance.now(), p, kills: 0, full: !!e.full, k: e.k ?? 0, dist: e.from ? p.distanceTo(new THREE.Vector3(...e.from)) : 0, near: p.distanceTo(f) });
    // kills that landed just before the burst (a direct hit) move over to it
    for (const k of recent) if (performance.now() - k.t < 150 && k.at.distanceTo(p) < IMPACT_R && !k.claimed) { k.claimed = true; impacts.at(-1).kills++; }
  });
  const recent = [];   // the last moment's kills, for claiming by a burst that comes after them
  function claim(at) {
    const now = performance.now();
    for (let i = impacts.length - 1; i >= 0; i--) { const m = impacts[i]; if (now - m.t < IMPACT_MS && m.p.distanceTo(at) < IMPACT_R) { m.kills++; return true; } }
    return false;
  }
  function settle() {   // an impact's kills are final IMPACT_MS after the burst
    const now = performance.now();
    while (impacts.length && now - impacts[0].t >= IMPACT_MS) {
      const m = impacts.shift();
      for (const [u, p] of active()) for (const c of p.challenges) {
        if (c.impact) { const r = c.impact(m); if (r) bump(u, p, c, r === true ? 1 : r); }
        if (c.streak === 'impact') { const key = c.id; streaks[key] = m.kills > 0 ? (streaks[key] ?? 0) + 1 : 0; bump(u, p, c, streaks[key], true); }
      }
    }
  }

  host.on('kill', e => {
    if (e.remote) return;
    const at = e.enemy?.root?.position?.clone?.() ?? feet(), f = feet(), mv = window.kino.movement?.state;
    const held = UPGRADES.some(u => session.weapon?.id === u.base), arrow = claim(at);
    if (!arrow) recent.push({ t: performance.now(), at, claimed: false }); if (recent.length > 12) recent.shift();
    const bow = held || arrow;
    if (bow) round.bow++; else round.other++;
    const ctx = { e, held, arrow, bow, at, feet: f, air: !player.onFloor,
      low: !!(player.crouched || mv?.prone || mv?.sliding), nearTerm: booths().some(b => b.root.getWorldPosition(new THREE.Vector3()).distanceTo(f) < TERMINAL_R) };
    for (const [u, p] of active()) for (const c of p.challenges) {
      if (c.kill && c.kill(ctx)) bump(u, p, c);
      if (!bow) continue;
      if (c.streak === 'hurt') { streaks[c.id] = (streaks[c.id] ?? 0) + 1; bump(u, p, c, streaks[c.id], true); }
      if (c.perRound) bump(u, p, c, round.bow, true);
      if (c.circle) {
        const z = circles[c.id];
        if (!z || Math.hypot(f.x - z.x, f.z - z.z) > c.circle) circles[c.id] = { x: f.x, y: f.y, z: f.z, n: 1 }; else circles[c.id].n++;
        bump(u, p, c, circles[c.id].n, true);
      }
      if (c.hunt) { const h = (hunts[c.id] ??= []); h.push(session.time); while (h.length && session.time - h[0] > c.hunt.s) h.shift(); if (h.length >= c.hunt.n) { h.length = 0; bump(u, p, c); } }
      if (c.drop && count(u, p, c) < c.goal && Math.random() < c.drop.chance && pickups.filter(x => x.c === c).length < 4)
        pickups.push({ u, p, c, at: at.clone().setY(at.y + 30), until: session.time + c.drop.life, next: 0 });
    }
  });
  host.on('beforeDamage', e => { if (e.amount > 0) for (const [, p] of active()) for (const c of p.challenges) if (c.streak === 'hurt') streaks[c.id] = 0; });
  host.on('roundEnd', () => {
    for (const [u, p] of active()) for (const c of p.challenges) if (c.devotion && round.bow >= c.devotion && !round.other) bump(u, p, c);
    round = { bow: 0, other: 0 };
  });

  // ---- pickups: pooled glow sprites (mods/fx, warmed at load) pulsed in place; no new materials mid-game
  host.on('update', dt => {
    board(); settle();
    if (!pickups.length) return;
    const f = feet(), fx = window.kino.fx, now = session.time;
    for (let i = pickups.length - 1; i >= 0; i--) {
      const k = pickups[i], left = k.until - now;
      if (left <= 0 || !active().some(([, p]) => p === k.p)) { pickups.splice(i, 1); continue; }
      if (Math.hypot(f.x - k.at.x, f.z - k.at.z) < PICK_R && Math.abs(f.y + 40 - k.at.y) < 120) {
        pickups.splice(i, 1); bump(k.u, k.p, k.c); api.audio?.play?.('buy', .5);
        fx?.emit?.({ key: 'glow', at: k.at.clone(), size: [20, 90], life: .4, fade: [.02, .8], additive: true, color: k.c.drop.color });
        continue;
      }
      if ((k.next -= dt) > 0) continue; k.next = left < 3 ? .12 : .22;   // flickers as it fades
      const bob = Math.sin(now * 3 + i) * 6;
      fx?.emit?.({ key: 'glow', at: k.at.clone().setY(k.at.y + bob), size: [26, 34], life: .3, fade: [.2, .5], additive: true, color: k.c.drop.color, opacity: left < 3 ? .5 : .9 });
    }
  });
  host.on('reset', fresh);
  host.on('gameOver', () => { pickups = []; });

  // ---- actions
  function attune(key) {
    const f = find(key); if (!f?.path) return 'Unknown upgrade';
    const { up, path } = f;
    if (!owned()[path.relic]) return `Earn the ${path.name} on Der Eisendrache first`;
    if (forged[up.base]?.has(path.id)) return `${path.name} already forged this match`;
    if (attuned[up.base] === path.id) return true;
    attuned[up.base] = path.id; streaks = {}; circles = {}; hunts = {};
    api.toast?.(`${up.name.toUpperCase()} ATTUNED: ${path.name.toUpperCase()}`, 3);
    return true;
  }
  function forge(key) {
    const f = find(key); if (!f?.path) return 'Unknown upgrade';
    const { up, path } = f;
    if (!owned()[path.relic]) return `Earn the ${path.name} on Der Eisendrache first`;
    if (forged[up.base]?.has(path.id)) return `${path.name} already forged this match`;
    if (!done(up, path)) return 'Finish every challenge first';
    if (!has(up.base)) return `Bring the ${up.name} to the terminal`;
    if (session.phase === 'reviving') return 'Terminal busy';
    if (!api.data?.weapons?.[path.weapon]) return `${path.name} is not installed`;
    const bows = window.kino.castle?.bows ?? window.kino.offMapBows;
    if (path.give && bows?.give) bows.give(path.give);
    else {
      const i = session.inventory.findIndex(w => w.id === up.base); if (i >= 0) { session.slot = i; session.inventory.splice(i, 1); session.slot = Math.min(session.slot, Math.max(0, session.inventory.length - 1)); }
      session.giveWeapon(path.weapon); api.equipView?.(); api.announce?.(path.name.toUpperCase(), up.name.toUpperCase(), 3);
    }
    if (!has(path.weapon)) return 'The forge failed';
    (forged[up.base] ??= new Set()).add(path.id); if (attuned[up.base] === path.id) delete attuned[up.base];
    host.emit?.('wonderForged', { base: up.base, path: path.id, weapon: path.weapon });
    for (const b of booths()) b.print?.('FORGED: ' + path.name.toUpperCase());
    return true;
  }

  // ---- Tab board: the attuned path
  function boardState() {
    const a = active()[0]; if (!a) return null;
    const [u, p] = a, total = p.challenges.reduce((s, c) => s + c.goal, 0), got = p.challenges.reduce((s, c) => s + Math.min(c.goal, count(u, p, c)), 0);
    const next = p.challenges.find(c => count(u, p, c) < c.goal);
    return { title: p.name.toUpperCase(), when: done(u, p) ? 'FORGE AT A TERMINAL' : `${p.challenges.filter(c => count(u, p, c) >= c.goal).length} / ${p.challenges.length} DONE`, color: p.color,
      value: p.challenges.map(c => `${c.name} ${Math.min(c.goal, count(u, p, c))}/${c.goal}`).join(' · '), progress: got / total,
      detail: next ? `${next.name}: ${next.text}` : `Every challenge done: bring the ${u.name} to a terminal and forge it in FORGE.EXE.` };
  }
  let onBoard = false;
  const board = () => { if (!onBoard && window.kino.scoreboard?.addTracker) { onBoard = true; window.kino.scoreboard.addTracker({ id: 'wonder-forge', label: 'WONDER FORGE', state: boardState }); } };
  board();

  window.kino ??= {};
  window.kino.wonderForge = {
    status: () => {
      const rw = owned();
      return {
        weapons: UPGRADES.map(u => ({
          base: u.base, name: u.name, short: u.short, held: has(u.base), attuned: attuned[u.base] ?? null,
          paths: u.paths.map(p => ({ id: p.id, key: u.base + ':' + p.id, name: p.name, sub: p.sub, color: p.color, unlocked: !!rw[p.relic],
            forged: !!forged[u.base]?.has(p.id), ready: done(u, p), installed: !!api.data?.weapons?.[p.weapon],
            challenges: p.challenges.map(c => ({ id: c.id, name: c.name, text: c.text, goal: c.goal, unit: c.unit, n: Math.min(c.goal, count(u, p, c)) })) })),
        })),
        pickups: pickups.length,
      };
    },
    act: (action, key) => action === 'attune' ? attune(key) : action === 'forge' ? forge(key) : 'Unknown action',
    // tests and the cheat console: set a challenge's count, finish a path
    debug: {
      set: (key, id, n) => { const f = find(key); const c = f?.path?.challenges.find(x => x.id === id); if (c) ((prog[f.up.base] ??= {})[f.path.id] ??= {})[c.id] = Math.min(c.goal, n); },
      finish: key => { const f = find(key); if (f?.path) for (const c of f.path.challenges) ((prog[f.up.base] ??= {})[f.path.id] ??= {})[c.id] = c.goal; },
      impact: o => host.emit('bowImpact', { el: 'base', p: feet().toArray(), ...o }),
      hurt: () => host.emit('beforeDamage', { amount: 1 }),
      pickups: () => pickups.map(k => ({ c: k.c.id, at: k.at.toArray().map(Math.round), left: +(k.until - session.time).toFixed(1) })),
    },
  };
}
