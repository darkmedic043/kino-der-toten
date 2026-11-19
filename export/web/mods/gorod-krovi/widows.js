// Gorod Krovi's Der Wunderfizz and its Widow's Wine (2026-11-15; scratch/gk/spec/widows.md).
//   Der Wunderfizz (_zm_perk_random.gsc): the map has no Widow's Wine machine; Widow's Wine, Deadshot and Electric Cherry
//   come only from the Wunderfizz. Three machines (p7_zm_vending_wonder at the perk_random_machine structs, all start
//   spots, .tools/build_gk_shield.py -> mods/maps/gorod-krovi/widows/, git-ignored); one is lit, picked at random. Power on,
//   the perk price less 1,000 (1,500 for the first perk: Der Eisendrache's rule), a 5 s spin, take it within 10 s; after
//   3-6 uses it moves. The rotation is zm_stalingrad's include_perks_in_random_rotation (9 perks), with its weighting
//   (Double Tap, Deadshot, Mule Kick and Cherry each get an extra entry 1 time in 4), only perks you don't have, and the
//   pass-locked ones only once owned EXCEPT Widow's Wine, which this machine always offers (it is the map's only source;
//   WW_ALWAYS below). A copy of Der Eisendrache's setupFizz (der-eisendrache/mod.js, not exported there), with its
//   castle sounds (zm_castle's rand_perk_mach_*: Gorod's own bank isn't extracted yet).
//   Widow's Wine on this map: the fork's BO7 perk (perks-plus/bo7-perks.js: the web blast when hit, 40 s cooldown, its
//   research augments) plus what BO3's _zm_perk_widows_wine.gsc adds:
//   - the lethal becomes the widow's web grenade (throwables' fragSwap hook): it sticks, bursts after 0.8 s (or on a
//     zombie), cocoons within 100 for 16 s, slows to 250 for 12 s (light damage);
//   - melee webs what it hits half the time (BO7's 20% plus 37.5% here), a cocoon;
//   - zombies the grenade or knife webbed pay 10 points every 1.6 s cocooned, every 2 s slowed;
//   - webbed zombies you kill drop a widow's grenade 20% of the time (15% by the grenade, 25% by melee), +1 lethal, 4 s;
//   - the Mangler and the Valkyrie drones are never webbed (kino.webImmune, read by bo7-perks' hold()).
//   Not done: BO3's contact blast that spends a grenade when hit (the BO7 blast does that job here), the widow knife's
//   own model, the grenade's own viewmodel (the frag's is thrown), and the controller/touch quick throw (engine.js
//   throws a plain frag there).
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { mergeGeometries } from '../../vendor/jsm/utils/BufferGeometryUtils.js';
import { CollisionWorld } from '../../collision-world.js';
import { createSync } from '../der-eisendrache/sync.js';
import { sfxAt } from '../der-eisendrache/castle-audio.js';
import { PERKS, perkUnlocked } from '../terminal-booth/desktop.js';

const DIR = new URL('../maps/gorod-krovi/widows/', import.meta.url).href;
const C = (x, y, z) => new THREE.Vector3(x, z, -y), R = Math.PI / 180;
const SPOTS = [{ p: C(575.943, 5540.1, 304), yaw: 270 }, { p: C(-375.834, 2056.86, 336), yaw: 45 }, { p: C(1121, 2979, -160), yaw: 270 }];
const ROTATION = ['specialty_armorvest', 'specialty_quickrevive', 'specialty_fastreload', 'specialty_rof', 'specialty_longersprint', 'specialty_additionalprimaryweapon', 'specialty_deadshot', 'specialty_electriccherry', 'specialty_widowswine'];
const WEIGHTED = ['specialty_rof', 'specialty_deadshot', 'specialty_additionalprimaryweapon', 'specialty_electriccherry'];   // function_dded17b1: one more entry each, 1 time in 4
const WW = 'specialty_widowswine', WW_ALWAYS = true;
const FIZZ_DISCOUNT = 1000, FIZZ_SPIN = 5, FIZZ_TAKE = 10;
const FIZZ_SLOT = new THREE.Vector3(0, 43.6, 0);   // the bottle's foot on the tray (as on Der Eisendrache's machine)
const G = { cocoon: 100, slow: 250, cocoonDur: 16, slowDur: 12, fuse: .8, life: 3, damage: 90, melee: .375 };

// One bottle whose materials are swapped per perk (der-eisendrache/mod.js fizzBottle): every perk's pair made at load
function fizzBottle(api, perks) {
  const { host } = api;
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: .3, metalness: .9 });
  const parts = { body: new THREE.CylinderGeometry(2.2, 2.4, 7, 14).translate(0, 3.5, 0), neck: new THREE.CylinderGeometry(1, 2.2, 2.6, 14).translate(0, 8.3, 0), cap: new THREE.CylinderGeometry(1.15, 1.15, 1.1, 14).translate(0, 10.1, 0), label: new THREE.PlaneGeometry(3.8, 3.8).translate(0, 3.6, 2.42) };
  const looks = new Map(), loads = [];
  for (const p of perks) {
    const c = new THREE.Color(p.color ?? '#c0392b'), cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.MeshBasicMaterial({ map: tex, alphaTest: .4 });
    looks.set(p.id, { glass: new THREE.MeshStandardMaterial({ color: c, roughness: .18, metalness: .1, emissive: c, emissiveIntensity: .55 }), label });
    const draw = img => {
      const g = cv.getContext('2d'); g.clearRect(0, 0, 128, 128); g.fillStyle = '#' + c.clone().multiplyScalar(.45).getHexString(); g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
      g.lineWidth = 5; g.strokeStyle = '#e8d9a8'; g.stroke();
      if (img) g.drawImage(img, 12, 12, 104, 104); else { g.fillStyle = '#fff'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.badge ?? '?', 64, 66); }
      api.renderer?.initTexture(tex);
    };
    loads.push(new Promise(done => { if (!p.icon) { draw(null); done(); return; } const img = new Image(); img.onload = () => { draw(img); done(); }; img.onerror = () => { draw(null); done(); }; img.src = p.icon; }));
  }
  (host.pending ??= []).push(Promise.all(loads));
  const first = looks.values().next().value;
  const make = () => {
    const g = new THREE.Group(), glass = [new THREE.Mesh(parts.body, first.glass), new THREE.Mesh(parts.neck, first.glass)], labels = [new THREE.Mesh(parts.label, first.label), new THREE.Mesh(parts.label, first.label)];
    labels[1].rotation.y = Math.PI; g.add(...glass, ...labels, new THREE.Mesh(parts.cap, gold));
    g.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
    g.userData.set = id => { const l = looks.get(id); if (!l) return; for (const m of glass) m.material = l.glass; for (const m of labels) m.material = l.label; };
    return g;
  };
  (host.warmObjects ??= []).push(make());
  return make();
}

export default async function setup(api, gk) {
  const { host, session, world, scene, camera, player, enemies, audio, toast, announce } = api;
  const kino = window.kino ??= {};
  kino.webImmune = z => /raz|mangler|sentinel|valkyrie/.test(z?.kind ?? '');   // no_widows_wine (the Valkyrie drone is a vehicle: immune too)
  let D;
  try { const r = await fetch(DIR + 'widows.json'); if (!r.ok) throw new Error(r.status); D = await r.json(); }
  catch { console.warn('[gorod-krovi] widows: no Wunderfizz model (python3 -I .tools/build_gk_shield.py)'); }
  const sync = api.sync ?? createSync(api);
  const fizz = D ? await setupFizz(api, sync, D) : null;
  const web = setupWebs(api);
  Object.assign(kino.gorod ??= {}, { fizz, widows: web });
  void gk;
}

// ---- Der Wunderfizz ----------------------------------------------------------------------------------------------------
// The machine's GLB is skinned to one bone that never moves, so it is drawn as plain meshes, its 23 parts merged into
// one mesh per material (2026-11-19). The three machines were `model.clone()`s before, which share the first one's
// skeleton: its bone stays at the world origin, so all three were drawn there, stacked, instead of at their spots, and
// nothing culled them (66 skinned draws in the sun's shadow pass from anywhere on the map). Named `machine_...`: the
// sun (sun.js) draws its shadow once into the static map.
function plainFizz(model) {
  let rigid = true; model.updateMatrixWorld(true); model.traverse(s => { if (s.isSkinnedMesh && s.skeleton.bones.length !== 1 || s.isMesh && Array.isArray(s.material)) rigid = false; });
  if (!rigid) return model;   // a rig with real bones: its own copy from loadModel, skinned as it is
  const out = new THREE.Group(), M = new THREE.Matrix4(), by = new Map();
  model.traverse(s => { if (!s.isMesh) return;
    if (s.isSkinnedMesh) M.multiplyMatrices(s.skeleton.bones[0].matrixWorld, s.skeleton.boneInverses[0]).multiply(s.bindMatrix); else M.copy(s.matrixWorld);
    const g = s.geometry.clone(); g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight'); g.applyMatrix4(M);
    if (!by.has(s.material)) by.set(s.material, []); by.get(s.material).push(g); });
  for (const [material, list] of by) { const keys = Object.keys(list[0].attributes).filter(k => list.every(g => g.attributes[k]));
    for (const g of list) for (const k of Object.keys(g.attributes)) if (!keys.includes(k)) g.deleteAttribute(k);
    const mixed = list.some(g => !!g.index !== !!list[0].index), src = mixed ? list.map(g => g.index ? g.toNonIndexed() : g) : list;
    const one = src.length > 1 ? mergeGeometries(src, false) : src[0];
    for (const g of one ? [one] : src) { g.computeBoundingSphere(); g.computeBoundingBox(); out.add(new THREE.Mesh(g, material)); } }
  return out;
}
async function setupFizz(api, sync, D) {
  const { world, session, host, scene, toast, announce, audio, camera } = api;
  const models = await Promise.all(SPOTS.map(() => loadModel(D.fizz).catch(() => null)));
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  const machines = SPOTS.map((s, i) => {
    const p = s.p.clone(); ray.origin.copy(p).y += 40; const g = world.raycast?.(ray, 0, 120); if (g && Math.abs(g.position.y - p.y) < 40) p.y = g.position.y;   // on the floor under the struct
    const yaw = s.yaw * R, o = models[i] ? plainFizz(models[i]) : null;   // the BO3 machine GLBs face +Z: rotation.y is BO3's yaw (custom-world perkYaw -90 + FACE)
    if (o) { o.name = 'machine_wunderfizz_' + i; o.position.copy(p); o.rotation.y = yaw; o.traverse(m => { m.castShadow = true; m.receiveShadow = true; }); scene.add(o); o.updateMatrix(); o.updateMatrixWorld(true); }
    const box = new THREE.BoxGeometry(74, 110, 57).translate(0, 55, -.85).rotateY(yaw).translate(p.x, p.y, p.z);   // the machine's bounds
    world.dynamic?.push({ collider: new CollisionWorld(box), box: new THREE.Box3().setFromBufferAttribute(box.attributes.position), enabled: true, window: true });
    return { o, p, slot: FIZZ_SLOT.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(p), yaw, scale: 1, start: true };
  });
  world.collision?.invalidateCache?.();
  const perks = ROTATION.map(id => PERKS.find(p => p.id === id)).filter(Boolean);
  const light = new THREE.PointLight(0x7ab8ff, 0, 260, 1.6); scene.add(light);   // made at setup, driven by intensity
  const bottle = fizzBottle(api, perks); bottle.visible = false; scene.add(bottle);
  const fx = { loop: null, stopped: false, next: 0, i: 0 };
  const at = (m, name, vol = .9) => sfxAt(name, m.p, camera, vol, 1600);
  const endLoop = () => { if (fx.loop) { fx.loop.pause(); fx.loop = null; } };
  const st = { at: 0, uses: 0, left: 4, spin: null };
  sync.on('gkFizzStart', d => { Object.assign(st, { at: d.at, uses: 0, left: d.left, spin: null }); });
  const pickStart = () => { st.spin = null; if (!sync.isHost) return; sync.act('gkFizzStart', { at: Math.floor(Math.random() * machines.length), left: 3 + Math.floor(Math.random() * 4) }); };
  pickStart();
  const offered = p => !session.perks?.has(p.id) && (perkUnlocked(p) || (WW_ALWAYS && p.id === WW));
  const pool = () => { const l = perks.filter(offered).map(p => p.id); for (const id of WEIGHTED) if (l.includes(id) && Math.random() < .25) l.push(id); return l; };
  const fizzCost = () => Math.max(0, (session.perkPrice ?? 2500) - FIZZ_DISCOUNT);
  const give = p => { if (api.perkInfo && !api.perkInfo[p.id]) api.perkInfo[p.id] = { name: p.name, price: p.price, color: p.color, icon: p.badge }; session.perks.add(p.id); session.markBought?.(p.id); session.health = session.maxHealth; };
  const byId = id => perks.find(p => p.id === id);
  sync.on('gkFizzBuy', (d, ctx) => { if (st.spin || !d.pool?.length) return; st.spin = { by: ctx.by, perk: byId(d.pool[Math.floor(ctx.rand() * d.pool.length)]), pool: d.pool, t: session.time, ready: false };
    Object.assign(fx, { stopped: false, next: 0, i: Math.floor(Math.random() * d.pool.length) }); endLoop(); at(machines[st.at], 'rand_perk_mach_start'); });
  sync.on('gkFizzTake', (d, ctx) => { if (!st.spin || st.spin.by !== ctx.by) return; if (ctx.mine) { give(st.spin.perk); audio?.play?.('perk', .8); toast?.(st.spin.perk.name, 3); } st.spin = null; if (++st.uses >= st.left) move(ctx.rand); });
  sync.on('gkFizzLapse', (d, ctx) => { if (!st.spin) return; st.spin = null; if (++st.uses >= st.left) move(ctx.rand); });
  host.on('reset', () => { endLoop(); bottle.visible = false; });
  for (const [i, m] of machines.entries()) world.addInteraction({
    position: m.p.clone().add(new THREE.Vector3(0, 45, 0)),
    hidden: () => i !== st.at,
    text: () => !session.power ? 'The power must be activated' : st.spin ? (st.spin.by !== sync.me ? 'Der Wunderfizz is in use' : st.spin.ready ? `Take ${st.spin.perk.name}` : 'Der Wunderfizz is spinning…') : perks.some(offered) ? `Der Wunderfizz · ${fizzCost()}` : 'You have every perk',
    use() {
      if (!session.power) return false;
      if (st.spin) { if (!st.spin.ready || st.spin.by !== sync.me) return false; sync.act('gkFizzTake'); return true; }
      const list = pool(); if (!list.length) return false;
      const cost = fizzCost();
      if (session.points < cost) { toast?.('Not enough points', 2); return false; }
      session.points -= cost; sync.act('gkFizzBuy', { pool: list });
      return true;
    },
  });
  function move(rand = Math.random) {
    const from = machines[st.at]; let n = st.at; while (machines.length > 1 && n === st.at) n = Math.floor(rand() * machines.length); st.at = n; st.uses = 0; st.left = 3 + Math.floor(rand() * 4); announce?.('DER WUNDERFIZZ', 'HAS MOVED', 3);
    at(from, 'rand_perk_mach_leave'); at(machines[n], 'random_perk_strike', .7); at(machines[n], 'ball_drop');
  }
  host.on('update', () => {
    const m = machines[st.at]; light.position.copy(m.p).add(new THREE.Vector3(0, 80, 0));
    light.intensity = session.power ? (st.spin && !st.spin.ready ? 2600 + Math.sin(session.time * 20) * 900 : 1400) : 0;
    if (st.spin && !st.spin.ready && session.time - st.spin.t > FIZZ_SPIN) { st.spin.ready = true; if (st.spin.by === sync.me) toast?.(`Der Wunderfizz · ${st.spin.perk.name}`, 3); }
    if (st.spin?.ready && session.time - st.spin.t > FIZZ_SPIN + FIZZ_TAKE && sync.isHost && !st.spin.lapsing) { st.spin.lapsing = true; sync.act('gkFizzLapse'); }
    spinView(m);
  });
  function spinView(m) {
    const s = st.spin;
    if (!s) { if (bottle.visible) { bottle.visible = false; endLoop(); } return; }
    const age = session.time - s.t, k = Math.min(1, age / FIZZ_SPIN);
    if (!s.ready) {
      if (!fx.loop && !fx.stopped && age > .4) { fx.loop = at(m, 'rand_perk_mach_loop', .8); if (fx.loop) fx.loop.loop = true; }
      if (!fx.stopped && age > 1.5) { fx.stopped = true; endLoop(); at(m, 'rand_perk_mach_stop'); }
      if (age >= fx.next && s.pool.length) { fx.i = (fx.i + 1) % s.pool.length; if (s.pool.length > 1 && s.pool[fx.i] === s.perk.id && age < FIZZ_SPIN - .6) fx.i = (fx.i + 1) % s.pool.length; bottle.userData.set(s.pool[fx.i]); fx.next = age + .07 + .42 * k * k; }
    } else if (fx.landed !== s) { fx.landed = s; endLoop(); bottle.userData.set(s.perk.id); }
    const spin = s.ready ? 6 * FIZZ_SPIN * .7 + .9 * (age - FIZZ_SPIN) : 6 * age * (1 - .3 * k * k);
    bottle.position.copy(m.slot); if (s.ready) bottle.position.y += (1 - Math.cos((age - FIZZ_SPIN) * 2.2)) * .6;
    bottle.rotation.set(0, m.yaw + spin, 0); bottle.scale.setScalar(1.3); bottle.visible = true;
    bottle.updateMatrix(); bottle.updateMatrixWorld(true);
  }
  host.on('reset', pickStart);
  return { state: () => ({ at: st.at, uses: st.uses, left: st.left, spin: st.spin ? { perk: st.spin.perk.id, ready: st.spin.ready, by: st.spin.by } : null, machines: machines.map(m => m.p.toArray()), power: !!session.power }), pool: () => perks.filter(offered).map(p => p.id) };
}

// ---- Widow's Wine: BO3's additions to the BO7 perk ------------------------------------------------------------------
function setupWebs(api) {
  const { host, session, world, scene, camera, enemies, audio } = api;
  const kino = window.kino;
  const has = () => !!session.perks?.has(WW);
  const bo7 = () => kino.bo7Perks;
  const alive = z => enemies.list.includes(z);
  const chest = z => z.root.position.clone().add(new THREE.Vector3(0, 40, 0));
  // the grenade: one shared geometry and material (warmed at load), a mesh per throw, never disposed materials
  const geo = new THREE.SphereGeometry(3.2, 12, 8), mat = new THREE.MeshStandardMaterial({ color: 0x6a1426, roughness: .45, metalness: .2, emissive: 0x5a0a1a, emissiveIntensity: .8 });
  const band = new THREE.TorusGeometry(3.3, .5, 6, 16), bandMat = new THREE.MeshStandardMaterial({ color: 0xd8d2e8, roughness: .6 });
  const makeNade = () => { const g = new THREE.Group(); g.add(new THREE.Mesh(geo, mat)); const b = new THREE.Mesh(band, bandMat); b.rotation.x = Math.PI / 2; g.add(b); g.traverse(o => { o.castShadow = false; }); return g; };
  (host.warmObjects ??= []).push(makeNade());
  const nades = [], webbed = new Map(), lastCause = new WeakMap();   // webbed: z -> {until, every, next} (this player's: they pay points)
  // throwables' launch hook: while Widow's Wine is held the frag slot throws a web grenade (BO3 sticky_grenade_widows_wine)
  kino.fragSwap = () => {
    if (!has()) return false;
    const dir = camera.getWorldDirection(new THREE.Vector3()), far = kino.throwRange?.() ?? 1, mesh = makeNade();
    mesh.position.copy(camera.position).addScaledVector(dir, 12); scene.add(mesh);
    nades.push({ mesh, v: dir.multiplyScalar(560 * far).add(new THREE.Vector3(0, 150 * far, 0)), t: 0, stuck: null, fuse: G.fuse, on: null });
    return true;
  };
  function cocoon(z, by = 'grenade') { if (kino.webImmune(z)) return; bo7()?.hold?.(z, G.cocoonDur, .9, G.cocoonDur, true); webbed.set(z, { until: session.time + G.cocoonDur, every: 1.6, next: session.time + 1.6, by }); }
  function slow(z, by = 'grenade') { if (kino.webImmune(z)) return; const w = webbed.get(z); if (w && w.every === 1.6 && w.until > session.time) { cocoon(z, by); return; } bo7()?.hold?.(z, G.slowDur, .3, 0, false); webbed.set(z, { until: session.time + G.slowDur, every: 2, next: session.time + 2, by }); }   // slowing a cocooned one cocoons it again
  let lastBurst = null;   // for tests (state().lastBurst)
  function burst(at) {
    bo7()?.webBlast?.(at.clone().setY(at.y - 10), true);   // the BO7 blast's visuals and its own 8 s holds (free: no cooldown)
    const eye = at.clone(); eye.y += 20;   // a grenade stuck to the floor sits on it: test the sight lines from a little above
    lastBurst = { at: at.toArray().map(Math.round), hits: [] };
    for (const z of [...enemies.list]) {
      const d = chest(z).distanceTo(at); if (d > G.slow) continue;
      const seen = d <= G.cocoon * .5 || !world.lineClear || world.lineClear(eye, chest(z));   // point blank always counts
      lastBurst.hits.push([Math.round(d), seen]);
      if (!seen) continue;
      if (d <= G.cocoon) cocoon(z); else slow(z);
      lastCause.set(z, 'grenade');
      enemies.hurt(z, G.damage * (1 - d / G.slow * .7), false, false, 'grenade');
    }
    kino.fx?.flash?.(at.clone(), { color: 0xd8c8ff, intensity: 3, radius: 300, life: .4 });
    audio?.play?.('melee', .5);
  }
  const ray = new THREE.Ray();
  host.on('update', dt => {
    if (!dt) return;
    const t = session.time;
    for (let i = nades.length - 1; i >= 0; i--) {
      const n = nades[i]; n.t += dt;
      if (!n.stuck) {
        const step = n.v.clone().multiplyScalar(dt), len = step.length();
        n.v.y -= 800 * dt;
        const z = enemies.list.find(z => chest(z).distanceTo(n.mesh.position) < 26 && !kino.webImmune(z));
        if (z) { n.stuck = 'zombie'; n.on = z; n.fuse = Math.min(n.fuse, .3); }   // a grenade on a zombie: it bursts on it
        else if (len > 0) { ray.origin.copy(n.mesh.position); ray.direction.copy(step).normalize(); const h = world.raycast(ray, 0, len + 3); if (h) { n.mesh.position.copy(h.position).addScaledVector(ray.direction, -2); n.stuck = 'world'; audio?.play?.('hit', .2); } else n.mesh.position.add(step); }
        n.mesh.rotation.x += dt * 8;
      } else if (n.on && alive(n.on)) n.mesh.position.copy(chest(n.on));
      if (n.stuck) n.fuse -= dt;
      n.mesh.updateMatrix(); n.mesh.updateMatrixWorld(true);
      if ((n.stuck && n.fuse <= 0) || n.t > G.life) { nades.splice(i, 1); n.mesh.removeFromParent(); burst(n.mesh.position.clone()); }
    }
    for (const [z, w] of webbed) {   // the point trickle: 10 a 1.6 s cocooned, a 2 s slowed
      if (!alive(z) || t > w.until) { webbed.delete(z); continue; }
      if (t >= w.next) { w.next += w.every; session.addPoints?.(10); }
    }
  });
  // the knife webs what it hits half the time (BO7 already does 20%: 0.2 + 0.8 x 0.375 = 0.5)
  host.on('beforeEnemyDamage', e => {
    const z = e.enemy; if (!z) return;
    lastCause.set(z, e.melee ? 'melee' : e.cause);
    if (has() && e.melee && !kino.webImmune(z) && Math.random() < G.melee) queueMicrotask(() => { if (alive(z)) cocoon(z, 'melee'); });
  });
  // webbed zombies a holder kills can drop a widow's grenade (+1 lethal, 4 s on the ground, only for you)
  host.on('kill', e => {
    const z = e.enemy; if (!z || e.remote || !has()) return;
    const w = webbed.get(z) ?? (bo7()?.held?.get(z)?.web ? {} : null); if (!w) return;
    const cause = e.melee ? 'melee' : lastCause.get(z), p = cause === 'melee' ? .25 : cause === 'grenade' ? .15 : .2;
    if (Math.random() >= p) return;
    const at = z.root.position.clone(); at.y += 4;
    const loot = kino.loot; if (loot) loot.spawn('grenade', at, { life: 4, reach: 60, keep: has });
    else session.grenades = Math.min(4, (session.grenades ?? 0) + 1);
  });
  host.on('reset', () => { for (const n of nades) n.mesh.removeFromParent(); nades.length = 0; webbed.clear(); });
  return { state: () => ({ held: has(), nades: nades.length, lastBurst, webbed: [...webbed.values()].map(w => ({ left: +(w.until - session.time).toFixed(1), cocoon: w.every === 1.6 })) }), burst, throw: () => kino.fragSwap() };
}
