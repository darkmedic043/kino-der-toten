// Nuketown's Zombie Shield: the car door on a dolly, planted as in BO2 (user, 2026-10-30). The original map only wears and swings
// it. In the hands it's the Rocket Shield's code (give(alt): raise, bash, blocking, Carpenter, HUD) with the map's own viewmodel and
// riot shield clips (.tools/build_nuketown_shield.py); right mouse stands it on the ground in front of you. Standing, it's solid,
// zombies stop at its face and tear at it (the fortifier wall's hold, mods/classes/fortifier.js), 35 hits as in the original, and
// its owner picks it up with what health it has left. The host runs the zombies; every change goes through sync.
import * as THREE from 'three';
import { CollisionWorld } from '../../collision-world.js';
import { loadModel } from '../../animation.js';

// the world model as it stands at the first station: entity origin and yaw, to bring its baked geometry back to model space.
// Its dolly's wheels are 26.1 under the origin; the door is thin along x
const STAND = { origin: [-1462.81, 1768.4, -291.373], yaw: 340, floor: 26.1 };
const PLANT = { pool: 4, ahead: 46, hit: 1500 / 35, band: 14, reach: 20, strikeAt: .62 };
const NAME = 'Zombie Shield';

export function setupShield(c, craft, pop) {
  const { api, world, session, host, sync, V, toast, player } = c;
  const { enemies, scene, viewScene } = api;
  const rs = () => globalThis.kino?.rocketShield;
  const stands = [], L = new THREE.Vector3();

  const alt = { def: null, name: NAME, label: 'ZOMBIE SHIELD', hint: 'Take another from a shield station', plant, broke() { pop('zombie_shield_break', player.getFeetPosition()); } };
  host.pending?.push?.(fetch(new URL('../maps/nuketown/shield/shield.json', import.meta.url)).then(r => r.ok ? r.json() : null).then(async d => {
    alt.def = d; if (!d) return;
    const m = await loadModel(d.model); m.visible = false; viewScene?.add(m);   // warmed with the view scene, its first raise is mid-game
  }).catch(e => console.warn('[nuketown] shield', e)));

  // ---- the standing shield: the station's baked meshes, rebased as the rake's are
  const { origin: o, yaw: oy, floor } = STAND, parts = [], bounds = new THREE.Box3();
  for (const n of craft.hidden[0]) n.traverse(m => {
    if (!m.isMesh) return;
    const g = m.geometry.clone().translate(-o[0], -o[1], -o[2]).rotateY(-oy * Math.PI / 180).translate(0, floor, 0);
    g.computeBoundingBox(); bounds.union(g.boundingBox); parts.push({ g, material: m.material });
  });
  const size = bounds.getSize(new THREE.Vector3()), mid = bounds.getCenter(new THREE.Vector3());
  for (let i = 0; i < PLANT.pool; i++) {
    const s = { id: 0, on: false, by: null, health: 0, dyn: null, group: new THREE.Group(), spot: new THREE.Vector3(), at: new THREE.Vector3(), ax: new THREE.Vector3(), az: new THREE.Vector3() };
    for (const q of parts) { const m = new THREE.Mesh(q.g, q.material); m.frustumCulled = false; s.group.add(m); }
    s.group.visible = false; scene.add(s.group); stands.push(s);
    world.addInteraction({ position: s.spot, nuketown: true, hidden: () => !s.on || s.by !== sync.me || rs()?.state?.().owned,
      text: () => `Pick up the Shield · ${Math.ceil(s.health / maxHealth() * 100)}%`, use() { sync.act('ntShieldTake', { id: s.id }); return true; } });
  }
  if (stands.length) host.warmObjects?.push?.(stands[0].group);
  const maxHealth = () => rs()?.state?.().max ?? 1500;
  const off = s => {
    s.on = false; s.group.visible = false;
    const i = s.dyn ? world.dynamic.indexOf(s.dyn) : -1; if (i >= 0) world.dynamic.splice(i, 1); s.dyn = null;
  };
  const clear = s => { for (const z of enemies.list) if (z.ntShield === s) z.ntShield = null; off(s); };

  sync.on('ntShieldPlant', (d, ctx) => {
    const s = stands.find(x => !x.on) ?? stands[0]; if (s.on) clear(s);
    Object.assign(s, { on: true, id: d.id, by: ctx.by, health: d.health });
    s.group.position.fromArray(d.at); s.group.rotation.y = d.yaw; s.group.visible = true;
    s.group.updateMatrix(); s.group.updateMatrixWorld(true);
    s.at.copy(s.group.position).add(mid.clone().setY(0).applyAxisAngle(V(0, 1, 0), d.yaw));
    s.ax.set(0, 0, 1).applyAxisAngle(V(0, 1, 0), d.yaw); s.az.set(1, 0, 0).applyAxisAngle(V(0, 1, 0), d.yaw);
    s.spot.copy(s.at).add(V(0, size.y * .6, 0));
    // solid for players, on its yaw
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z).translate(mid.x, mid.y, mid.z).rotateY(d.yaw).translate(...d.at);
    s.dyn = { collider: new CollisionWorld(geo), box: new THREE.Box3().setFromBufferAttribute(geo.attributes.position), enabled: true, window: true, nuketown: true };
    world.dynamic.push(s.dyn);
    pop('rake_fall', s.spot);
  });
  sync.on('ntShieldTake', (d, ctx) => {
    const s = stands.find(x => x.on && x.id === d.id); if (!s) return;
    const health = s.health; clear(s);
    if (ctx.mine) rs()?.give(alt, health);
  });
  sync.on('ntShieldHit', (d, ctx) => {
    const s = stands.find(x => x.on && x.id === d.id); if (!s) return;
    s.health -= PLANT.hit;
    if (s.health > 0) { pop('shield_hit_00', s.spot, .6); return; }
    pop('zombie_shield_break', s.spot); const mine = s.by === sync.me; clear(s);
    if (mine) toast(`Your ${NAME} broke · ${alt.hint.toLowerCase()}`, 4);
  });
  sync.on('ntShieldFix', () => { for (const s of stands) if (s.on) s.health = maxHealth(); });
  const powerups = api.powerups;
  if (powerups?.onCollect) {   // a Carpenter mends the standing ones too
    const collect = powerups.onCollect;
    powerups.onCollect = (type, at) => { const r = collect(type, at); if (type === 'carpenter' && sync.isHost) sync.act('ntShieldFix'); return r; };
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
  const tick = () => {
    if (!sync.isHost) return;
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
  };
  return {
    tick,
    held: () => !!rs()?.state?.().alt,
    planted: () => stands.some(s => s.on && s.by === sync.me),
    damaged() { const s = rs()?.state?.(); return !!s?.alt && s.health < s.max; },
    repair() { rs()?.heal(Infinity); },
    give() { if (!alt.def) { toast('The shield model is missing', 2); return false; } rs()?.give(alt); return true; },
    reset() { for (const s of stands) clear(s); },
    stands,
  };
}
