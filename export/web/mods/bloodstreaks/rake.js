// Rake traps on every map (2026-11-22): Nuketown's rake (the model cut out of the map files by
// .tools/build_nuketown_rake.py into the git-ignored maps/nuketown/rake/), shared by Nuketown's rake stations
// (nuketown/buildables.js: one in the hand) and the Rake Trap Bloodstreak (mod.js: three in the hand).
//   - Rakes in your hand are placed with the claymore key: the head goes ahead of you and the handle lies back toward
//     your feet, so a zombie coming at you steps on it. It dies with its head off, the handle swings up and falls back;
//     after `uses` hits the rake breaks. A placed rake can be picked up again (F, on maps with interactions).
//   - At most five of your rakes down at once. The host runs the zombies; every change goes through the co-op sync
//     (der-eisendrache/sync.js), and each rake carries its owner's research augments (rake.*, research.json) from the
//     moment it is placed, so a teammate's rake works the same on every client.
// window.kino.rakes: {ready, hand, give(n, quiet?), mineOut(), down(), reset(), list}
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { binds } from '../../settings.js';
import { createSync } from '../der-eisendrache/sync.js';

const DIR = new URL('../maps/nuketown/', import.meta.url).href;
export const RAKE_URL = DIR + 'rake/rake.glb', RAKE_ICON = DIR + 'rake/icon.webp';
export const RAKE = { perPlayer: 5, pool: 16, uses: 20, reach: 40, swing: .14, fall: .55, angle: 1.15, length: 71.3, sweep: 70, shock: 140, bleed: 120 };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export async function setupRakes(api) {
  const { host, session, player, enemies, scene, world, features, toast, audio } = api;
  const kino = window.kino;
  let sync = null;
  const me = () => sync?.me ?? 'solo';
  const aug = k => kino.equipAug?.('rake.' + k) ?? 0;

  // a Nuketown sound through the game's mixer, fading with distance (as the Zombie Shield does)
  function pop(name, at, gain = .8, range = 1100) {
    const d = at.distanceTo(player.getFeetPosition()); if (d >= range) return;
    const a = new Audio(DIR + 'sounds/' + name + '.ogg'), g = gain * (1 - d / range) ** 2;
    try {
      const ctx = audio?.ctx, master = audio?.master;
      if (ctx && master) { const n = ctx.createGain(); n.gain.value = g; ctx.createMediaElementSource(a).connect(n).connect(master); }
      else a.volume = Math.min(1, g * .42);
    } catch { a.volume = Math.min(1, g * .42); }
    a.play().catch(() => {});
  }

  // ---- the model: handle end at the origin, head along +z; the instances pivot on the head, handle along -z
  const parts = [];
  try {
    const root = await loadModel(RAKE_URL); root.updateMatrixWorld(true);
    root.traverse(m => { if (m.isMesh) parts.push({ g: m.geometry.clone().applyMatrix4(m.matrixWorld).translate(0, 0, -RAKE.length), material: m.material }); });
  } catch (e) { console.warn('[rakes] no rake model (run .tools/build_nuketown_rake.py)', e?.message ?? e); }

  const R = { ready: parts.length > 0, hand: 0, list: [] };
  const keyName = () => (binds().claymore ?? 'Digit4').replace(/^(Digit|Key)/, '');
  const paint = () => R.onHand?.();   // the rakes in hand show on the Bloodstreak HUD (bloodstreaks/mod.js); the centre-screen reminder went (user, 2026-11-26)
  R.keyName = keyName;

  const mineOut = () => R.list.filter(r => r.on && r.by === me()).length;
  if (R.ready) for (let i = 0; i < RAKE.pool; i++) {
    const r = { i, id: 0, on: false, by: null, uses: 0, t: -1, wait: 0, a: {}, group: new THREE.Group(), tilt: new THREE.Group(), head: new THREE.Vector3() };
    for (const q of parts) { const m = new THREE.Mesh(q.g, q.material); m.frustumCulled = false; r.tilt.add(m); }
    r.group.add(r.tilt); r.group.visible = false; r.group.userData.noVisCull = true; scene.add(r.group); R.list.push(r);
    world.addInteraction?.({ position: r.head, hidden: () => !r.on || r.by !== me(), text: () => 'Pick up Rake',
      use() { sync?.act('rakeTake', { id: r.id }); return true; } });
  }
  if (R.ready) host.warmObjects?.push?.(R.list[0].group);
  const setTilt = (r, a) => { r.tilt.rotation.x = a; r.tilt.updateMatrix(); r.tilt.updateMatrixWorld(true); };
  const off = r => { r.on = false; r.group.visible = false; r.t = -1; };

  // the kills a rake of yours made a moment ago: the Bloodstreak meter doesn't count them (a teammate host's kill for you
  // comes back as a plain kill event after the hit event, in the same order)
  let pending = 0, pendingAt = 0;
  R.takeTrapKill = () => { if (pending > 0 && performance.now() - pendingAt < 1500) { pending--; return true; } pending = 0; return false; };

  function connect(s) {
    sync = s;
    s.on('rakePlace', (d, ctx) => {
      const r = R.list.find(x => !x.on) ?? R.list[0]; if (!r) return;
      const a = d.a ?? {};
      Object.assign(r, { on: true, id: d.id, by: ctx.by, uses: Math.round(RAKE.uses * (1 + (a.uses ?? 0))), t: -1, wait: 0, a });
      r.group.position.fromArray(d.at); r.group.rotation.y = d.yaw; r.group.visible = true; setTilt(r, 0);
      r.group.updateMatrix(); r.group.updateMatrixWorld(true);
      r.head.copy(r.group.position).add(V(0, 12, 0));
      pop('rake_fall', r.head);
    });
    s.on('rakeTake', (d, ctx) => {
      const r = R.list.find(x => x.on && x.id === d.id); if (!r) return;
      off(r);
      if (ctx.mine) { R.hand++; paint(); }
    });
    s.on('rakeHit', d => {
      const r = R.list.find(x => x.on && x.id === d.id); if (!r) return;
      r.t = 0; r.uses--; pop('rake_hit_0' + (d.n % 3), r.head);
      if (r.by !== me()) return;
      const k = d.k ?? 1; pending += k; pendingAt = performance.now();
      kino.armory?.kill?.('rake_trap', k);
      if (r.a.blood) kino.bloodstreaks?.add?.(k * r.a.blood, 'rake');
    });
  }
  (host.syncWaiters ??= []).push(connect);
  host.on('ready', () => { if (sync) return; createSync(api); sync?.ready?.(); });

  function place() {
    if (!player.grounded) { toast?.('Stand on the ground to place the rake', 2); return false; }
    if (mineOut() >= RAKE.perPlayer) { toast?.(`${RAKE.perPlayer} rakes down: pick one up first`, 2); return false; }
    const f = player.getFeetPosition(), d = (api.mods?.camera ?? api.camera)?.getWorldDirection?.(V(0, 0, 0)) ?? V(0, 0, -1);
    const yaw = Math.atan2(d.x, d.z), head = f.clone().addScaledVector(d.setY(0).normalize(), RAKE.length * .8);
    const ground = world.raycast?.(new THREE.Ray(head.clone().add(V(0, 30, 0)), V(0, -1, 0)), 0, 70);
    if (world.raycast && !ground) { toast?.('No room for the rake here', 2); return false; }
    if (ground) head.y += 30 - ground.distance; else head.y = f.y;
    R.hand--; paint();
    // the placer's augments travel with the rake
    const a = Object.fromEntries(['reach', 'sweep', 'uses', 'shock', 'reset', 'blood', 'bleed'].map(k => [k, aug(k)]).filter(([, v]) => v));
    sync?.act('rakePlace', { id: Math.floor(Math.random() * 1e9), at: [head.x, head.y + 1, head.z], yaw, a });
    return true;
  }
  if (features) { const orig = features.placeClaymore; features.placeClaymore = (...args) => (R.hand > 0 && session.phase !== 'reviving' ? place() : orig?.call(features, ...args)); }

  const near = (z, at, r) => !z.rising && !z.dead && z.health > 0 && Math.abs(z.root.position.y - at.y) < 50 && (z.root.position.x - at.x) ** 2 + (z.root.position.z - at.z) ** 2 < r * r;
  host.on('update', dt => {
    for (const r of R.list) {
      if (!r.on) continue;
      r.wait -= dt;
      if (r.t >= 0) {
        r.t += dt;
        const k = r.t < RAKE.swing ? r.t / RAKE.swing : Math.max(0, 1 - (r.t - RAKE.swing) / RAKE.fall);
        setTilt(r, RAKE.angle * k * (2 - k));
        if (r.t > RAKE.swing + RAKE.fall) { r.t = -1; setTilt(r, 0); if (r.uses <= 0) { pop('zombie_shield_break', r.head); off(r); } }
      }
      if (!sync?.isHost || r.t >= 0 || r.wait > 0) continue;
      const a = r.a, reach = RAKE.reach * (1 + (a.reach ?? 0));
      const z = enemies.list.find(q => near(q, r.head, reach)); if (!z) continue;
      // Whiplash: the swinging handle takes others standing round the head with it
      const kills = [z, ...(a.sweep ? enemies.list.filter(q => q !== z && near(q, r.head, RAKE.sweep)).slice(0, a.sweep) : [])];
      r.wait = (RAKE.swing + RAKE.fall) * (1 - (a.reset ?? 0));
      sync.act('rakeHit', { id: r.id, n: Math.floor(Math.random() * 3), k: kills.length });
      const at = z.root.position.clone();
      for (const q of kills) sync.hurt(q, 1e7, { by: r.by }, { head: true, cause: 'trap' });
      const fx = kino.equipFx;
      if (fx && (a.shock || a.bleed)) for (const q of enemies.list) {
        if (q.health <= 0 || q.dead) continue;
        const dd = q.root.position.distanceTo(at);
        if (a.shock && dd < RAKE.shock) { fx.stun(q, a.shock); kino.fx?.strike?.([q.root.position.x, q.root.position.y + 30, q.root.position.z], { scale: .35, color: 0x9fd0ff }); }   // Live Wire
        if (a.bleed && dd < RAKE.bleed) fx.bleed(q, a.bleed, 4);   // Tetanus
      }
    }
  });

  R.give = (n, quiet) => {
    if (!R.ready) return false;
    R.hand += n; paint();
    if (!quiet) toast?.(`Rake${n > 1 ? ' ×' + n : ''}: press ${keyName()} to place ${n > 1 ? 'them' : 'it'}`, 4);
    return true;
  };
  R.mineOut = mineOut;
  R.down = () => R.list.filter(r => r.on).length;
  R.reset = () => { R.hand = 0; pending = 0; paint(); for (const r of R.list) off(r); };
  host.on('reset', R.reset);
  kino.rakes = R;
  return R;
}
