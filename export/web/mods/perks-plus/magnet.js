// Magnet Margarita (Reaper Collection perk, switched on 2026-10-19: Melon Pass page 10, the terminal's PERKS app).
// User, 2026-10-19: "make magnet margarita has the ability to 'store' powerups… in the new command wheel… have the powerup
// get close to them and, when close to it, pick it up with the new command, later being able to drop the powerup with the
// same command wheel… add in some augments… one of the augments allow it to hold more power ups".
//   Pull: power-ups within 1,500 drift toward you at 120/s and stop 90 short, so walking into one stays your choice.
//   Stash (command wheel, mods/command-wheel): STORE takes the nearest power-up within 140 off the ground into your stash
//     (1 slot); DROP <name> puts a stored one back down 110 in front of you with a fresh lifetime, for you or a teammate
//     to walk into (a dropped one isn't pulled back). Stored power-ups don't time out. Lose the perk and they fall out.
//     A chip above the perks shows the stash, or the wheel key when a power-up is in reach.
//   Research track (research.json, mm.*): pull (+50% speed, range 2,500), slots (+2), reach (+120), pulse (storing or
//     dropping hurts zombies within 220 for that x zh and freezes them 1.5 s), linger (power-ups within 600 don't time
//     out), bonus (kills drop a bonus power-up that often: the mod's double-buy upgrade), restock (every n-th round a
//     power-up appears in a free slot), twin (a drop comes out twice that often).
// Co-op: the host's power-ups are the real ones. Clients tell the host they pull (mmPull, with their augments) and the
// host moves the power-ups toward them and sends the positions (mmPos); storing (mmStore -> mmStored) and dropping
// (mmDrop) go through the host too.
import * as THREE from 'three';
import { binds, keyName } from '../../settings.js';

const STOP = 90, RANGE = 1500, SPEED = 120, REACH = 140, AHEAD = 110, LINGER = 600, PULSE = 220;
const BONUS = ['nuke', 'insta_kill', 'double_points', 'full_ammo'], RESTOCK = ['insta_kill', 'double_points', 'full_ammo'];

export function setupMagnet(api, h) {
  const { host, session, powerups, world, camera, data, audio } = api;
  const { has, stat, feet, now, zh, near, hurt, slow, ring, fx, chip, toast } = h;
  if (!powerups) return null;
  const stash = [];   // power-up types, oldest first
  const slots = () => 1 + stat('mm.slots');
  const name = type => data.powerups?.[type]?.name ?? type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const icon = type => data.powerups?.[type]?.icon ?? null;
  const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const net = () => { const n = window.kino?.coop; return n?.id ? n : null; };
  const client = () => { const n = net(); return !!n && !n.isHost; };
  const remotes = new Map();   // (host) teammate id -> {at, until, pull, linger}

  // ---- the pull (solo / host; clients ask the host) -------------------------------------------------------------------
  function pullers() {
    const out = [];
    if (has('magnet') && !['reviving', 'gameover'].includes(session.phase)) out.push({ at: feet(), pull: stat('mm.pull'), linger: stat('mm.linger') });
    const t = performance.now(); for (const [, r] of remotes) if (r.at && r.until > t) out.push(r);
    return out;
  }
  let posT = 0, beatT = 0;
  host.on('update', dt => {
    dt = typeof dt === 'number' && dt > 0 && dt < .25 ? dt : 1 / 60;
    const n = net(); hook(n);
    if (n && !n.isHost) {   // a client: tell the host, ease toward its positions
      if (has('magnet') && (beatT -= dt) <= 0) { beatT = 1; n.send(n.hostId, { t: 'mmPull', pull: stat('mm.pull'), linger: stat('mm.linger') }); }
      for (const p of powerups.items) if (p.mmTo) p.root.position.lerp(p.mmTo, Math.min(1, dt * 10));
    } else {
      const who = pullers(), moved = [];
      if (who.length) for (const p of powerups.items) {
        let best = null, bd = Infinity; for (const w of who) { const d = flat(w.at, p.root.position); if (d < bd) { bd = d; best = w; } }
        if (best.linger && bd < LINGER) p.age = Math.min(p.age, 14);   // Lingering: held before it starts blinking (15 s)
        if (p.mmNoPull || bd <= STOP || bd > RANGE + (best.pull ? 1000 : 0)) continue;
        const to = best.at.clone().setY(p.root.position.y).sub(p.root.position).setY(0).normalize();
        p.root.position.addScaledVector(to, Math.min(bd - STOP, dt * SPEED * (1 + best.pull))); moved.push(p);
      }
      if (n && moved.length && (posT -= dt) <= 0) { posT = 1 / 8; n.send('all', { t: 'mmPos', l: moved.map(p => [p.nid ?? 0, ...p.root.position.toArray().map(v => Math.round(v * 10) / 10)]) }); }
    }
    // lost the perk (went down, a reset of perks): what you stored falls out at your feet
    if (stash.length && !has('magnet')) { const at = feet(), n = stash.length; stash.splice(0).forEach((type, i) => { const a = Math.PI * 2 * i / n + Math.random(); place(type, at.clone().add(new THREE.Vector3(Math.cos(a) * 100, 0, Math.sin(a) * 100)), false); }); }   // 100 out: on the ground, not straight back into you
  });

  // ---- store / drop ------------------------------------------------------------------------------------------------------
  const reach = () => REACH + stat('mm.reach');
  function closest() {
    const f = feet(); let best = null, bd = reach();
    for (const p of powerups.items) { if (p.mmGone) continue; const d = flat(f, p.root.position); if (d < bd && Math.abs(p.root.position.y - 40 - f.y) < 120) { bd = d; best = p; } }
    return best;
  }
  function pulse() {
    const k = stat('mm.pulse'); if (!k) return; const f = feet();
    near(f, PULSE, z => { hurt(z, zh() * k, 'electric'); slow(z, 1.5, 1, 1.5, 0xff6a9a); });
    ring(f, PULSE, 0xff6a9a);
  }
  function store(p) {
    if (!p || !powerups.items.includes(p) || stash.length >= slots()) return false;
    const n = net();
    if (n && !n.isHost) { p.mmGone = true; p.root.visible = false; n.send(n.hostId, { t: 'mmStore', nid: p.nid ?? 0 }); return true; }   // the host confirms (mmStored)
    const at = p.root.position.clone(); powerups.remove(p); powerups.burst(at); stored(p.type);
    return true;
  }
  function stored(type) {
    stash.push(type); audio?.event?.('powerup/spawn/spawn_00', .5); fx(feet().clone().add(new THREE.Vector3(0, 40, 0)), .25, 0xff6a9a);
    toast?.(`Magnet Margarita · stored ${name(type)}`, 1.5); pulse();
  }
  // a spot in front of you on the ground, short of any wall
  function ahead() {
    const f = feet(), dir = camera.getWorldDirection(new THREE.Vector3()).setY(0); if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1); dir.normalize();
    const hit = world?.raycast?.(new THREE.Ray(f.clone().add(new THREE.Vector3(0, 30, 0)), dir), 0, AHEAD + 30);
    return f.clone().addScaledVector(dir, hit ? Math.max(0, hit.distance - 35) : AHEAD);
  }
  // put a power-up in the world (the host's in co-op); noPull: the pull leaves it alone (a drop you meant to leave there)
  function place(type, at, noPull = true) {
    const n = net();
    if (n && !n.isHost) { n.send(n.hostId, { t: 'mmDrop', type, at: at.toArray(), noPull }); return; }
    const p = powerups.spawn(type, at); if (p && noPull) p.mmNoPull = true;
  }
  function drop(i) {
    const type = stash[i]; if (!type) return false; stash.splice(i, 1);
    const at = ahead(); place(type, at);
    if (stat('mm.twin') && Math.random() < stat('mm.twin')) { const side = new THREE.Vector3().crossVectors(camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize(), new THREE.Vector3(0, 1, 0)); place(type, at.clone().addScaledVector(side, 55)); toast?.('Double Dip', 1.5); }
    audio?.event?.('powerup/spawn/spawn_00', .5); pulse();
    return true;
  }

  // ---- co-op messages (hooked once the co-op connection exists) --------------------------------------------------------
  let hooked = null;
  function hook(n) {
    if (!n || hooked === n) return; hooked = n;
    n.on('pose', (m, from) => { const r = remotes.get(from); if (r && m.p) { r.at = new THREE.Vector3(...m.p); r.dead = !!(m.d || m.x); if (r.dead) r.until = 0; } });
    n.on('mmPull', (m, from) => { if (!n.isHost) return; const r = remotes.get(from) ?? {}; Object.assign(r, { until: performance.now() + 2500, pull: +m.pull || 0, linger: +m.linger || 0 }); remotes.set(from, r); });
    n.on('left', id => remotes.delete(id));
    n.on('mmPos', m => { if (n.isHost) return; for (const [nid, x, y, z] of m.l ?? []) { const p = powerups.items.find(q => q.nid === nid); if (p) p.mmTo = new THREE.Vector3(x, y, z); } });
    n.on('mmStore', (m, from) => {
      if (!n.isHost) return; const p = powerups.items.find(q => (q.nid ?? 0) === m.nid);
      if (!p) return; const at = p.root.position.clone(); powerups.remove(p); powerups.burst(at); n.send(from, { t: 'mmStored', type: p.type });
    });
    n.on('mmStored', m => { if (!n.isHost && m.type) stored(m.type); });
    n.on('mmDrop', m => { if (!n.isHost || !data.powerups?.[m.type] || !Array.isArray(m.at)) return; const p = powerups.spawn(m.type, new THREE.Vector3(...m.at)); if (p && m.noPull) p.mmNoPull = true; });
  }

  // ---- Attraction (bonus drops) and Restock --------------------------------------------------------------------------
  host.on('kill', e => {
    if (e.remote || !has('magnet') || !stat('mm.bonus') || Math.random() >= stat('mm.bonus')) return;
    const at = e.enemy?.root?.position?.clone() ?? (client() ? ahead() : null); if (!at) return;
    place(BONUS[Math.floor(Math.random() * BONUS.length)], at, false);
  });
  let lastPhase = null;
  host.on('update', () => {
    const phase = session.phase;
    if (phase === 'fighting' && lastPhase === 'preparing' && has('magnet')) {
      const every = stat('mm.restock');
      if (every && session.round % every === 0 && stash.length < slots()) { const type = RESTOCK[Math.floor(Math.random() * RESTOCK.length)]; stash.push(type); toast?.(`Magnet Margarita · Restock: ${name(type)}`, 2.5); }
    }
    lastPhase = phase;
  });
  host.on('reset', () => { stash.length = 0; remotes.clear(); lastPhase = null; });

  // ---- the command wheel ----------------------------------------------------------------------------------------------
  const wheel = () => {
    if (!has('magnet')) return [];
    const p = closest(), full = stash.length >= slots();
    const out = [{ label: 'Store power-up', color: '#e04a6a', icon: p ? icon(p.type) : null,
      sub: full ? `Stash full (${stash.length}/${slots()})` : p ? `${name(p.type)} · ${stash.length}/${slots()}` : 'None in reach', disabled: full || !p, use: () => store(closest()) }];
    stash.forEach((type, i) => out.push({ label: 'Drop ' + name(type), sub: 'Stored', color: '#ff9ab4', icon: icon(type), use: () => drop(i) }));
    return out;
  };
  const register = () => { if (window.kino?.commandWheel) window.kino.commandWheel.add('magnet', wheel); else setTimeout(register, 300); };
  register();
  chip(() => has('magnet') && stash.length ? [`STASH ${stash.map(t => name(t).toUpperCase()).join(' · ')}`, true] : has('magnet') && closest() && stash.length < slots() ? [`${keyName(binds().wheel)} · STORE POWER-UP`, true] : null);

  return { stash, slots, store, drop, closest, reach, get remotes() { return remotes; } };
}
