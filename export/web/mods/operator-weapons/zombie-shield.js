// The Zombie Shield: Nuketown's car door on a dolly, planted as in BO2 (user, 2026-10-30), on every map since the Armory sells it
// (user, 2026-11-01). In the hands it's the Rocket Shield's code (give(alt): raise, bash, blocking, Carpenter, HUD) with its own
// viewmodel and riot shield clips (.tools/build_nuketown_shield.py); right mouse stands it on the ground in front of you. Standing,
// it's solid, zombies stop at its face and tear at it (the fortifier wall's hold, mods/classes/fortifier.js), 35 hits as in the
// original, and its owner picks it up with what health it has left. The host runs the zombies; every change goes through sync.
// The models and sounds are Nuketown's git-ignored ones: without them the Armory won't sell it. Moon's world has no dynamic
// colliders, so there a planted shield stops zombies but not players.
// window.kino.zombieShield: {give(), held(), planted(), damaged(), repair(), reset(), stands, ready}
import * as THREE from 'three';
import { CollisionWorld } from '../../collision-world.js';
import { loadModel } from '../../animation.js';
import { createSync } from '../der-eisendrache/sync.js';

const DIR = new URL('../maps/nuketown/', import.meta.url).href;
// the world model's dolly wheels are 26.1 under its origin; the door is thin along x
const MODEL = { url: DIR + 'shield/world.glb', floor: 26.1 };
const PLANT = { pool: 4, ahead: 46, hit: 1500 / 35, band: 14, reach: 20, strikeAt: .62, pickup: 110 };
const NAME = 'Zombie Shield';
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function setupZombieShield(api) {
  const { session, host, player, toast, enemies, scene, viewScene, world, audio } = api;
  const rs = () => globalThis.kino?.rocketShield;
  const home = api.map?.id === 'nuketown';
  const stands = [], L = new THREE.Vector3(), size = new THREE.Vector3(), mid = new THREE.Vector3();
  let sync = null, built = false;
  const maxHealth = () => rs()?.state?.().max ?? 1500;
  const me = () => sync?.me ?? 'solo';

  // a Nuketown sound through the game's mixer, fading with distance
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

  const alt = { def: null, name: NAME, label: 'ZOMBIE SHIELD', hint: home ? 'Take another from a shield station' : "Buy another at a terminal's ARMORY", plant, broke() { pop('zombie_shield_break', player.getFeetPosition()); } };

  // ---- the standing shield: the world model, loaded on every map because a teammate may plant one. The view model too, warmed
  // with the view scene: its first raise is mid-game
  (host.pending ??= []).push?.((async () => {
    const r = await fetch(DIR + 'shield/shield.json'); if (!r.ok) return;
    const d = await r.json(), view = await loadModel(d.model), root = await loadModel(MODEL.url);
    // the glass goes transparent before the warm: three keeps the opaque program of a warmed material that changes later
    view.traverse(o => { for (const m of [o.material].flat()) if (m && /glass/.test(m.name)) { m.transparent = true; m.opacity = .12; m.depthWrite = false; } });
    view.visible = false; viewScene?.add(view);
    const parts = [], bounds = new THREE.Box3();
    root.updateMatrixWorld(true);
    root.traverse(m => {
      if (!m.isMesh) return;
      const g = m.geometry.clone().translate(0, MODEL.floor, 0); g.computeBoundingBox(); bounds.union(g.boundingBox);
      if (/glass/.test(m.material.name)) { m.material.transparent = true; m.material.depthWrite = false; }
      parts.push({ g, material: m.material });
    });
    bounds.getSize(size); bounds.getCenter(mid);
    for (let i = 0; i < PLANT.pool; i++) {
      const s = { id: 0, on: false, by: null, health: 0, dyn: null, group: new THREE.Group(), spot: new THREE.Vector3(), at: new THREE.Vector3(), ax: new THREE.Vector3(), az: new THREE.Vector3() };
      for (const q of parts) { const m = new THREE.Mesh(q.g, q.material); m.frustumCulled = false; s.group.add(m); }
      s.group.visible = false; scene.add(s.group); stands.push(s);
    }
    host.warmObjects?.push?.(stands[0].group);
    alt.def = d; built = true;
  })().catch(e => console.warn('[zombie-shield]', e)));

  const off = s => {
    s.on = false; s.group.visible = false;
    const i = s.dyn ? world.dynamic.indexOf(s.dyn) : -1; if (i >= 0) world.dynamic.splice(i, 1); s.dyn = null;
  };
  const clear = s => { for (const z of enemies.list) if (z.ntShield === s) z.ntShield = null; off(s); };

  // F picks up your own, on any map (only CustomWorld has addInteraction)
  let near = null;
  (host.prompts ??= []).push({
    find(camera) {
      near = null; if (rs()?.state?.().owned) return null;
      let best = PLANT.pickup;
      for (const s of stands) if (s.on && s.by === me()) { const d = s.spot.distanceTo(camera.position); if (d < best) { best = d; near = s; } }
      return near && { text: `Pick up the Shield · ${Math.ceil(near.health / maxHealth() * 100)}%`, distance: best };
    },
    use() { if (!near) return false; sync.act('ntShieldTake', { id: near.id }); return true; },
  });

  function connect(s) {
    if (sync) return; sync = s;
    s.on('ntShieldPlant', (d, ctx) => {
      if (!built) return;
      const s = stands.find(x => !x.on) ?? stands[0]; if (s.on) clear(s);
      Object.assign(s, { on: true, id: d.id, by: ctx.by, health: d.health });
      s.group.position.fromArray(d.at); s.group.rotation.y = d.yaw; s.group.visible = true;
      s.group.updateMatrix(); s.group.updateMatrixWorld(true);
      s.at.copy(s.group.position).add(mid.clone().setY(0).applyAxisAngle(V(0, 1, 0), d.yaw));
      s.ax.set(0, 0, 1).applyAxisAngle(V(0, 1, 0), d.yaw); s.az.set(1, 0, 0).applyAxisAngle(V(0, 1, 0), d.yaw);
      s.spot.copy(s.at).add(V(0, size.y * .6, 0));
      // solid for players, on its yaw
      if (world.dynamic) {
        const geo = new THREE.BoxGeometry(size.x, size.y, size.z).translate(mid.x, mid.y, mid.z).rotateY(d.yaw).translate(...d.at);
        s.dyn = { collider: new CollisionWorld(geo), box: new THREE.Box3().setFromBufferAttribute(geo.attributes.position), enabled: true, window: true, nuketown: true };
        world.dynamic.push(s.dyn);
      }
      pop('rake_fall', s.spot);
    });
    s.on('ntShieldTake', (d, ctx) => {
      const s = stands.find(x => x.on && x.id === d.id); if (!s) return;
      const health = s.health; clear(s);
      if (ctx.mine) rs()?.give(alt, health);
    });
    s.on('ntShieldHit', d => {
      const s = stands.find(x => x.on && x.id === d.id); if (!s) return;
      s.health -= PLANT.hit;
      if (s.health > 0) { pop('shield_hit_00', s.spot, .6); return; }
      pop('zombie_shield_break', s.spot); const mine = s.by === me(); clear(s);
      if (mine) toast(`Your ${NAME} broke · ${alt.hint.toLowerCase()}`, 4);
    });
    s.on('ntShieldFix', () => { for (const s of stands) if (s.on) s.health = maxHealth(); });
  }
  // the map's sync if it has one, connected before it asks for the event log; on other maps made here, after the multiplayer mod
  (host.syncWaiters ??= []).push(connect);
  host.on('ready', () => { if (sync) return; createSync(api); sync?.ready(); });

  const powerups = api.powerups;
  if (powerups?.onCollect) {   // a Carpenter mends the standing ones too
    const collect = powerups.onCollect;
    powerups.onCollect = (type, at) => { const r = collect(type, at); if (type === 'carpenter' && sync?.isHost) sync.act('ntShieldFix'); return r; };
  }

  function plant() {
    if (!player.grounded) { toast('Stand on the ground to plant the shield', 2); return false; }
    const f = player.getFeetPosition(), d = (api.mods?.camera ?? api.camera).getWorldDirection(V(0, 0, 0)).setY(0).normalize();
    const blocked = world.raycast?.(new THREE.Ray(f.clone().add(V(0, 30, 0)), d), 0, PLANT.ahead + size.x);
    const at = f.clone().addScaledVector(d, PLANT.ahead), ground = world.raycast?.(new THREE.Ray(at.clone().add(V(0, 30, 0)), V(0, -1, 0)), 0, 70);
    if (blocked || !ground) { toast('No room for the shield here', 2); return false; }
    at.y += 30 - ground.distance;
    sync.act('ntShieldPlant', { id: Math.floor(Math.random() * 1e9), at: at.toArray(), yaw: Math.atan2(-d.z, d.x), health: rs().take() });
    return true;
  }

  // the zombies: hold each at the face it reached and let it tear at the shield, with the hit at the swing's midpoint
  host.on('update', () => {
    if (!sync?.isHost) return;
    for (const s of stands) {
      if (!s.on) continue;
      const half = size.z / 2 + PLANT.band, depth = size.x / 2;
      for (const z of enemies.list) {
        if (z.state === 'dead' || z.state === 'barricade' || z.state === 'entering' || z.state === 'rising' || z.rising) continue;
        L.copy(z.root.position).sub(s.at); const x = L.dot(s.ax), d = L.dot(s.az), y = z.root.position.y - s.at.y;
        if (Math.abs(x) > half || Math.abs(y) > 50) { if (z.ntShield === s) z.ntShield = null; continue; }
        if (Math.abs(d) > depth + PLANT.reach) { z.ntShield = s; z.ntShieldSide = Math.sign(d) || 1; continue; }
        const side = z.ntShield === s && z.ntShieldSide ? z.ntShieldSide : Math.sign(d) || 1;
        z.ntShield = s; z.ntShieldSide = side;
        z.root.position.addScaledVector(s.az, side * (depth + PLANT.reach - 2) - d);
        z.stuck = 0;   // being held isn't being lost (enemies.js removes zombies stuck for 36 s)
        if (z.state !== 'attack') { z.state = 'attack'; z.attackLeft = 1.15; z.attackDealt = true; z.rig.play('attack', false); z.root.rotation.y = Math.atan2(side * s.az.z, -side * s.az.x); z.ntStruck = false; }
        else if (!z.ntStruck && z.attackLeft < PLANT.strikeAt) { z.ntStruck = true; sync.act('ntShieldHit', { id: s.id }); if (!s.on) break; }
      }
    }
  });
  const reset = () => { for (const s of stands) clear(s); };
  host.on('reset', reset);

  return {
    held: () => !!rs()?.state?.().alt,
    planted: () => stands.some(s => s.on && s.by === me()),
    damaged() { const s = rs()?.state?.(); return !!s?.alt && s.health < s.max; },
    repair() { rs()?.heal(Infinity); },
    give() { if (!alt.def) { toast('The shield model is missing', 2); return false; } rs()?.give(alt); return true; },
    reset, stands,
    get ready() { return built; },
  };
}
