// Der Eisendrache (a BO3 map ported by .tools/build_bo3_map.py; see docs/fork/waw-ports.md). Does nothing elsewhere.
import * as THREE from 'three';
import { setupCraftables } from './craftables.js';
import { setupLowGrav } from './lowgrav.js';
import { setupBows } from './bows.js';
import { setupEE } from './ee.js';
import { setupSide } from './side.js';
import { setupSide2 } from './side2.js';
import { useGameAudio } from './castle-audio.js';
import { createSync } from './sync.js';
import { setupTab } from './tab.js';
import { setupWeather } from './weather.js';
import { mergeProps, instanceProps } from './merge-props.js';
import { loadModel, loadAnimation, Rig } from '../../animation.js';
import { CollisionWorld } from '../../collision-world.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { PERKS, perkUnlocked } from '../terminal-booth/desktop.js';
// Zones: BO3's zone manager links pairs of zones by a flag (zm_castle_zones.gsc add_adjacent_zone) and some flags set
// others (add_zone_flags). The build gives every door and debris pile its whole flag as its zone
// (connect_start_to_subclocktower -> connectstarttosubclocktower) and every spawner its BO3 zone without underscores;
// world.activeZones is replaced here: an open door sets its flag, the power sets power_on and opens the electric doors
// (connect_start_to_undercroft has no pieces in the map, so the power sets it here), and both zones of every pair whose
// flag is set are active.
const ADJ = [["v10pad","v10paddoor","castleteleporterused"],["v10paddoor","v10padexterior","castleteleporterused"],["start","tramhigh","alwayson"],["start","tramtogatehouse","connectstarttotram2gatehouse"],["tramhigh","tramtosubclocktowerbot","connectstarttosubclocktower"],["tramhigh","undercroftjail","connectstarttoundercroft"],["tramtosubclocktower","tramtosubclocktowertop","activatetramtosubclocktower"],["tramtosubclocktower","tramtosubclocktowerbot","activatetramtosubclocktower"],["tramtosubclocktowertop","courtyard","connectsubclocktowertocourtyard"],["clocktower","courtyardedge","activatecourtyard"],["clocktower","clocktowerrooftop","activatecourtyard"],["courtyard","courtyardedge","activatecourtyard"],["courtyard","clocktowerrooftop","activatecourtyard"],["courtyard","greathall","connectgreathalltocourtyard"],["courtyardedge","greathallupperleft","connectcourtyardtogreathallupper"],["courtyard","greathallupper","connectcourtyardtogreathallupper"],["gatehouse","lowergatehouse","buyabledropdowngatehousetolowercourtyard"],["tramtogatehouse","lowergatehouse","connectgatehousearea"],["gatehouse","lowercourtyardupper","connectlowercourtyard"],["lowercourtyard","lowercourtyardupper","connectlowercourtyard"],["lowercourtyardupper","ramparts","poweron"],["lowercourtyard","lowergatehouse","connectgatehousetolowercourtyard"],["lowercourtyardupper","livingquarters","connectlowercourtyardtolivingquarters"],["lowercourtyardupper","lowercourtyardback","connectlowercourtyard"],["lowercourtyard","lowercourtyardback","connectlowercourtyard"],["lowercourtyardback","undercroftpaphall","connectlowercourtyardtoundercroft"],["greathallupper","armory","connectgreathalltoarmory"],["greathall","greathallupperleft","activategreathall"],["greathall","greathallupper","activategreathall"],["armory","armoryback","activatearmory"],["armory","livingquarters","connectarmorytolivingquarters"],["rooftop","ramparts","poweron"],["rooftop","clocktowerrooftop","poweron"],["rooftop","armoryback","poweron"],["undercroftchapel","greathall","connectgreathalltoundercroft"],["undercroft","undercroftlab","connectundercrofttoundercroftlab"],["undercroft","undercroftchapel","activateundercroft"],["undercroft","undercroftjail","activateundercroft"],["undercroft","undercroftpap","activateundercroft"],["undercroftjail","undercroftpap","activateundercroft"],["undercroftpap","undercroftpaphall","activateundercroft"]];
const DERIVED = {"activatecourtyard":["connectsubclocktowertocourtyard","connectcourtyardtogreathallupper","connectcourtyardtorooftop","connectgreathalltocourtyard","connectarmorytorooftop"],"activatetramtosubclocktower":["connectstarttosubclocktower","connectsubclocktowertocourtyard"],"connectgatehousearea":["connectstarttotram2gatehouse","connectgatehousetolowercourtyard","buyabledropdowngatehousetolowercourtyard"],"connectlowercourtyard":["connectgatehousetolowercourtyard","connectlowercourtyardtolivingquarters","connectlowercoutryardtorooftop","connectlowercourtyardtoundercroft"],"activategreathall":["connectgreathalltoarmory","connectgreathalltoundercroft","connectcourtyardtogreathallupper"],"activatearmory":["connectarmorytolivingquarters","connectgreathalltoarmory"],"activateundercroft":["connectlowercourtyardtoundercroft","connectgreathalltoundercroft"]};
const POWER_FLAGS = ['poweron', 'connectstarttoundercroft'];

export default async function setup(api) {
  if (api.map?.id !== 'der-eisendrache') return;
  const { world, session } = api;
  const flags = s => {
    const f = new Set(['alwayson']);
    for (const d of world.doors.values()) if (d.zone && world.isOpen(d, s)) f.add(d.zone);
    if (s.power) for (const p of POWER_FLAGS) f.add(p);
    for (const x of s.flags) if (x.startsWith('castle:flag:')) f.add(x.slice(12));   // set by later scripts (castleteleporterused)
    for (const [g, from] of Object.entries(DERIVED)) if (from.some(x => f.has(x))) f.add(g);
    return f;
  };
  world.activeZones = s => {
    const f = flags(s), zones = new Set(['start']);
    for (const [a, b, flag] of ADJ) if (f.has(flag)) { zones.add(a); zones.add(b); }
    for (const x of s.flags) if (x.startsWith('zone:')) zones.add(x.slice(5));
    return zones;
  };
  if (world.root && !/[?&]noMergeProps/.test(location.search)) { const r = mergeProps(world.root, api.scene), i = instanceProps(world.root, api.scene, api.host); console.info('[der-eisendrache] prop pieces merged:', r.merged, 'into', r.made, '; instanced:', i.hidden, 'meshes of', i.instances, 'props into', i.meshes); }
  setupLook(api);
  const weather = setupWeather(api);   // snow outdoors, flames on the fixtures (weather.js)
  // Der Eisendrache's own zombies (BO3's c_zom_der_zombie_body1-3 + head1-3, .tools/build_castle_zombies.py; git-ignored,
  // ripped), driven by BO1's zombie clips. The clips set each joint's local rotation in BO1's joint frames; BO3's joints
  // sit in other frames (the ankles and balls most: feet turned backwards, user), so every skeleton is re-bound first:
  // each joint takes BO1's rest rotation, keeps its own position, and the skin is re-bound to that pose (rebindTo).
  // ?bo1Zombies keeps the BO1 ones.
  if (!new URLSearchParams(location.search).has('bo1Zombies') && api.enemies) {
    const Z = n => loadModel(new URL(`zombies/${n}.glb`, import.meta.url).href).catch(() => null);
    Promise.all([Promise.all([1, 2].map(k => Z('c_zom_der_zombie_body' + k)))   /* body3's tank top and arms are Shadows of Evil textures, not in this map */, Promise.all([1, 2, 3].map(k => Z('c_zom_der_zombie_head' + k)))]).then(([bodies, heads]) => {
      const e = api.enemies, refB = e.templates[0], refH = e.heads?.[0];
      const ref = new Map(); for (const r of [refB, refH]) r?.traverse(o => { if (o.isBone && !ref.has(o.name)) ref.set(o.name, o.quaternion.clone()); });
      const ok = bodies.filter(Boolean), okH = heads.filter(Boolean);
      if (!ok.length || !okH.length || !ref.size) return;
      // the body's j_spine4 bind matrix before re-binding: the heads are modelled in that joint's own space
      const j4 = new Map(ok.map(m => { m.updateMatrixWorld(true); return [m, m.getObjectByName('j_spine4').matrixWorld.clone()]; }));
      for (const m of ok) rebindTo(m, ref);
      // the heads' root joint (j_spine4) takes the re-bound body's world orientation there, so the head lines up when
      // enemies.js mounts it on the body's j_spine4 (same local rotation alone left them turned ~90°, user)
      ok[0].updateMatrixWorld(true);
      const rootWorld = new Map([['j_spine4', ok[0].getObjectByName('j_spine4').getWorldQuaternion(new THREE.Quaternion())]]);
      // (heads aren't re-bound: they take the body's bind matrices below)
      // each head's meshes bound to its body's own bones (a separate head rig mounted on j_spine4 drifted off the neck
      // under animation, user): one template per body x head; the head's face joints follow the body's j_head
      const combos = [];
      bodies.forEach((body, i) => { if (!body) return;
        for (const head of okH) {
          const t = cloneSkinned(body); t.userData.gibSet = 'castle' + (i + 1);
          const bones = new Map(); t.traverse(o => { if (o.isBone && !bones.has(o.name)) bones.set(o.name, o); });
          // the body's own inverse bind matrices for each bone (heads and bodies share BO3's bind space, so the head's
          // vertices sit right with them; the head rig's own re-bound frames left the face turned backwards, user)
          let bodySkin = null; const inv = new Map();
          t.traverse(o => { if (!o.isSkinnedMesh) return; bodySkin ??= o; o.skeleton.bones.forEach((b, k) => { if (!inv.has(b)) inv.set(b, o.skeleton.boneInverses[k]); }); });
          const h = cloneSkinned(head), meshes = []; h.updateMatrixWorld(true); h.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
          // head space (its j_spine4 at the origin) -> the body's bind space: body j4 x inverse(head j4)
          const toBody = j4.get(body).clone().multiply(h.getObjectByName('j_spine4').matrixWorld.clone().invert());
          for (const m of meshes) {
            m.geometry = m.geometry.clone().applyMatrix4(toBody.clone().multiply(m.matrixWorld));
            m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1);
            const mapped = m.skeleton.bones.map(b => bones.get(b.name) ?? bones.get('j_head'));
            m.bind(new THREE.Skeleton(mapped, mapped.map(b => (inv.get(b) ?? new THREE.Matrix4().copy(b.matrixWorld).invert()).clone())), bodySkin.bindMatrix);
            m.userData.headMesh = true; m.removeFromParent(); t.add(m);   // dismemberment: kept when the body splits, hidden when beheaded
          }
          combos.push(t);
        }
      });
      e.templates = combos; e.heads = [];
      // their own gib pieces for the dismemberment mod (same keys as BO1's), re-bound the same way
      const KEYS = { upclean: 'upclean', lowclean: 'lowclean', behead: 'behead', larmoff_1: 'larmoff', rarmoff_1: 'rarmoff', llegoff_1: 'llegoff', rlegoff_1: 'rlegoff', legsoff_1: 'blegsoff' };
      const sets = (window.kino.gibSets ??= {});
      [1, 2].forEach(k => Promise.all(Object.entries(KEYS).map(async ([key, g]) => [key, await Z(`c_zom_der_zombie_body${k}_g_${g}`)])).then(list => {
        const set = {}; for (const [key, m] of list) if (m) { rebindTo(m, ref); set[key] = m; }
        sets['castle' + k] = set;
      }));
    });
  }
  // co-op (sync.js): every system below shares its events and state through api.sync
  const sync = api.sync = createSync(api);
  // personal events: a weapon or points for one player
  sync.on('give', d => { if (d.to === sync.me && d.weapon) { session.giveWeapon?.(d.weapon); api.equipView?.(); } });
  sync.on('points', d => { if (d.to === sync.me) session.points += d.n; });
  sync.on('msg', d => { if (!d.to || d.to === sync.me) api.toast?.(d.text, d.s ?? 3); });
  const gondola = setupGondola(api), pads = setupPads(api), pap = setupPap(api), bow = setupBow(api), panzer = setupPanzer(api), fizz = setupFizz(api), traps = setupTraps(api);
  const craft = setupCraftables(api, { traps }), lowgrav = setupLowGrav(api), bows = setupBows(api, { lowgrav, pads, traps }), ee = setupEE(api, { bows, traps }), side2 = setupSide2(api, { bows }), side = setupSide(api, { lowgrav, side2 });
  useGameAudio(api.audio);
  setupRocketPad(api); setupDogRounds(api);
  setupTab(api, { craft, gondola, bow, bows, pap, ee, side, side2 });   // the Tab scoreboard's tiles
  const bounds = setupBounds(api, { lowgrav });   // after the pads: it watches their flights
  await bows?.ready;   // the spirit wolves too
  await bow?.ready;   // the dragon heads join the scene while the map loads (added mid-game, they whited out the frame at times)
  sync.ready();   // a guest catches up on the game's events so far
  window.kino ??= {}; window.kino.castle = { flags: () => [...flags(session)], zones: () => [...world.activeZones(session)], gondola, pads, pap, bow, panzer, fizz, traps, craft, lowgrav, bows, ee, side, side2, sync, bounds, weather };
}

// ---- BO3 fxanim rigs (CASTLE_<name> from the builder's fxanim_rig): bones carry extras.anims[key] = {rot, loc} runs,
// the rig node extras.anims[key] = {frames, fps, notes}. The map's matrices are frozen, so posing updates them itself.
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), off = new THREE.Vector3();
function sample(run, n, f, out) {   // run: [frame, c0..c(n-1), ...]; linear between keys, quaternions slerped
  const stride = n + 1, count = run.length / stride; if (!count) return false;
  let i = 0; while (i < count - 1 && run[(i + 1) * stride] <= f) i++;
  const f0 = run[i * stride], j = Math.min(count - 1, i + 1), f1 = run[j * stride], t = f1 > f0 ? Math.min(1, Math.max(0, (f - f0) / (f1 - f0))) : 0;
  if (n === 4) { qa.fromArray(run, i * stride + 1); qb.fromArray(run, j * stride + 1); out.slerpQuaternions(qa, qb, t); }
  else out.set(...[0, 1, 2].map(k => run[i * stride + 1 + k] * (1 - t) + run[j * stride + 1 + k] * t));
  return true;
}
function rig(root, name) {
  const node = root.getObjectByName('CASTLE_' + name); if (!node) return null;
  const bones = []; node.traverse(o => { if (o.userData?.anims && o !== node) bones.push({ o, anims: o.userData.anims, base: o.position.clone(), q0: o.quaternion.clone() }); });
  const meta = node.userData.anims ?? {};
  return {
    node, meta, length: key => (meta[key]?.frames ?? 0) / (meta[key]?.fps ?? 30),
    pose(key, seconds) {   // seconds into animation `key` (clamped to its end)
      const m = meta[key]; if (!m) return;
      const f = Math.min(m.frames, Math.max(0, seconds * (m.fps ?? 30)));
      for (const b of bones) {
        const k = b.anims[key];
        if (!k || !sample(k.rot, 4, f, b.o.quaternion)) b.o.quaternion.copy(b.q0);
        b.o.position.copy(b.base); if (k && sample(k.loc, 3, f, off)) b.o.position.add(off);
      }
      node.traverse(o => o.updateMatrix()); node.updateMatrixWorld(true);
    },
  };
}
const at = (root, name) => { const o = root.getObjectByName(name); return o ? o.getWorldPosition(new THREE.Vector3()) : null; };
const moveNode = (o, p) => { o.position.copy(o.parent ? o.parent.worldToLocal(p.clone()) : p); o.updateMatrix(); o.updateMatrixWorld(true); };

// ---- The gondola (zm_castle_tram.gsc). Car 1 starts docked and leaves 12 s in while car 2 comes up from the bottom.
// A fuse (one at the station at the start; zombies drop more, one on the ground at a time) put in the console calls
// car 2: it docks (8 s), the gates open and it leaves a power-up (a Ray Gun 1 time in 100 from round 5; fire sale or
// 500 bonus points 1 in 5 from round 5; otherwise double points, insta-kill, max ammo or, from round 5, a nuke). Once
// it's taken (or gone) and nobody is inside, the car goes back (16 s), then 8 s of cooldown.
const FUSE_DROP = .025, FUSE_PICKUP = 48;
// Co-op: the host runs the phases and the rewards (its state goes to everyone 5 times a second); the fuse is one
// player's at a time (picked up and used through events); the car waits for every player to be out.
function setupGondola(api) {
  const { world, session, host, player, toast, announce, audio, sync } = api, root = world.root;
  const car1 = rig(root, 'TRAM01'), car2 = rig(root, 'TRAM02');
  const drop = at(root, 'CASTLE_TRAMDROP'), tokenAt = at(root, 'CASTLE_TRAMTOKEN'), inside = at(root, 'CASTLE_TRAMINSIDE'), lever = at(root, 'CASTLE_TRAMLEVER');
  if (!car1 || !car2 || !drop || !lever) { console.warn('[der-eisendrache] gondola pieces missing (rebuild the map)'); return null; }
  // GLTFLoader makes repeated node names unique (CASTLE_TRAMGATE, CASTLE_TRAMGATE_1...): match by prefix. Each gate also
  // collides (a scripted mover following it: shut it blocks the platform edge, as BO3's tram_clip; open it's out of the way)
  const gates = []; root.traverse(o => { if (/^CASTLE_TRAMGATE(_\d+)?$/.test(o.name) && o.userData.open) gates.push({ o, shut: o.getWorldPosition(new THREE.Vector3()), open: new THREE.Vector3(...o.userData.open) }); });
  for (const g of gates) { const meshes = []; g.o.updateMatrixWorld(true); g.o.traverse(c => { if (c.isMesh) meshes.push(c); }); g.col = world.addScriptedMover?.(meshes, { exact: true }); }
  // the fuse: a glowing cylinder (BO3's fuse model wasn't exported)
  const fuseMesh = new THREE.Group();
  fuseMesh.add(new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 14, 12), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: .6, roughness: .4 })));
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 10, 12), new THREE.MeshBasicMaterial({ color: 0x66ccff })); glow.scale.set(1.05, 1, 1.05); fuseMesh.add(glow);
  fuseMesh.rotation.z = Math.PI / 2; fuseMesh.visible = false; api.scene.add(fuseMesh);
  let carBox = null;
  const st = { phase: 'intro', t0: 0, fuseOnGround: false, held: false, heldBy: null, item: null, gate: 0, ray: false, caller: null };
  const phase = (p) => { if (!sync.isHost) return; st.phase = p; st.t0 = session.time; };   // the host decides
  sync.shared('gondola', () => ({ phase: st.phase, t: session.time - st.t0, started: !!st.started, fuse: st.fuseOnGround ? sync.a(fuseMesh.position) : null, heldBy: st.heldBy }), s => {
    if (s.phase !== st.phase || Math.abs(session.time - s.t - st.t0) > .5) { st.phase = s.phase; st.t0 = session.time - s.t; }
    st.started = s.started; st.heldBy = s.heldBy; st.held = s.heldBy === sync.me;
    if (s.fuse) { if (!st.fuseOnGround) { fuseMesh.position.copy(sync.v(s.fuse)); fuseMesh.visible = true; st.fuseOnGround = true; } } else if (st.fuseOnGround) { fuseMesh.visible = false; st.fuseOnGround = false; }
  });
  sync.on('fusePick', (d, ctx) => { if (!st.fuseOnGround) return; fuseMesh.visible = false; st.fuseOnGround = false; st.heldBy = ctx.by; st.held = ctx.mine; if (ctx.mine) { audio?.play?.('powerup'); toast?.('Fuse · take it to the gondola console', 3); } });
  sync.on('gondolaCall', (d, ctx) => { if (busy() || st.heldBy !== ctx.by) return; st.heldBy = null; st.held = false; st.caller = ctx.by; if (ctx.mine) { audio?.play?.('buy'); toast?.('Gondola called', 2); } phase('arriving'); if (!sync.isHost) { st.phase = 'arriving'; st.t0 = session.time; } });
  const placeFuse = p => { fuseMesh.position.copy(p).y += 30; fuseMesh.visible = true; st.fuseOnGround = true; };
  const reset = () => {
    Object.assign(st, { phase: 'intro', t0: 0, fuseOnGround: false, held: false, heldBy: null, item: null, gate: 0, started: false, caller: null });
    fuseMesh.visible = false; car1.pose('called_a', 99); car2.pose('start', 0); setGates(0);
  };
  const setGates = k => { st.gate = k; for (const g of gates) { const p = g.shut.clone().lerp(g.open, k); moveNode(g.o, p); g.col?.move(p.sub(g.shut)); } };
  function reward() {   // the host: for whoever called it
    const r = Math.floor(Math.random() * 100), round = session.round ?? 1, to = st.caller ?? sync.me;
    if (r === 1 && round >= 5) { sync.act('give', { to, weapon: 'ray_gun_zm' }); announce?.('THE GONDOLA', 'RAY GUN', 3); return null; }
    if (r <= 20 && round >= 5) {
      if (Math.random() < .5) return api.powerups?.spawn('fire_sale', drop);
      sync.act('points', { to, n: 500 }); sync.act('msg', { to, text: 'Gondola · +500 bonus points' }); return null;
    }
    const pool = ['double_points', 'insta_kill', 'full_ammo', ...(round >= 5 ? ['nuke'] : [])];
    return api.powerups?.spawn(pool[Math.floor(Math.random() * pool.length)], drop);
  }
  const busy = () => st.phase !== 'idle';
  world.addInteraction({
    position: lever,
    text: () => st.phase === 'intro' ? 'The gondola is arriving' : st.phase === 'docked' ? 'The gondola is docked' : st.phase === 'cooldown' ? 'The gondola is cooling down'
      : busy() ? 'The gondola is moving' : st.held ? 'Use the fuse to call the gondola' : 'Requires a fuse',
    use() {
      if (busy() || !st.held) return false;
      sync.act('gondolaCall'); return true;
    },
  });
  host.on('kill', ({ enemy }) => {   // the host's zombies drop fuses
    if (!sync.isHost || st.fuseOnGround || st.heldBy || Math.random() > FUSE_DROP || !enemy?.root) return;
    placeFuse(enemy.root.position.clone());
  });
  let picking = false;
  host.on('update', () => {
    const t = session.time - st.t0;
    if (fuseMesh.visible) {
      fuseMesh.rotation.y += .03; fuseMesh.position.y += Math.sin(session.time * 3) * .05;
      const feet = player.getFeetPosition();
      const near = Math.hypot(feet.x - fuseMesh.position.x, feet.z - fuseMesh.position.z) < FUSE_PICKUP && Math.abs(feet.y + 30 - fuseMesh.position.y) < 80;
      if (near && !picking) sync.act('fusePick');
      picking = near;
    }
    switch (st.phase) {
      case 'intro':
        if (!st.started) { if (!sync.isHost) return; st.started = true; st.t0 = session.time; if (tokenAt) placeFuse(tokenAt); return; }   // the first fuse waits at the station
        if (t < 12) return;
        car1.pose('return_a', t - 12); car2.pose('start', t - 12);
        if (t - 12 >= Math.max(car1.length('return_a'), car2.length('start'))) phase('cooldown');
        return;
      case 'arriving':
        car2.pose('called_a', t); car1.pose('called_b', t);
        if (t >= car2.length('called_a') && sync.isHost) { phase('docked'); st.item = reward(); }
        return;
      case 'docked': {
        if (st.gate < 1) setGates(Math.min(1, t / 1.5));
        const items = api.powerups?.items ?? [];
        // nobody in the car (its whole docked box, as BO3's docked_tram_car_interior volume; every player, zombies too)
        const box = carBox?.(), occupied = p => box ? box.containsPoint(p) : p.distanceTo(inside) < 90;
        const away = !inside || (!sync.players().some(q => occupied(q.pos.clone().setY(q.pos.y + 30))) && !(api.enemies?.list ?? []).some(z => occupied(z.root.position.clone().setY(z.root.position.y + 30))));
        if (t > 2 && (!st.item || !items.includes(st.item)) && away) phase('leaving');
        return;
      }
      case 'leaving':
        if (st.gate > 0) setGates(Math.max(0, 1 - t / .5));
        car2.pose('return_a', t); car1.pose('return_b', t);
        if (t >= car2.length('return_a')) phase('cooldown');
        return;
      case 'cooldown':
        if (t >= 8) phase('idle');
        return;
    }
  });
  host.on('reset', reset);
  reset();
  // Collision for the cars (user: players should be able to stand in them): their meshes as posed now (the doors left
  // out: they open while docked), moved each frame by their tag_origin bone's offset (the swing isn't followed)
  const carCol = [car1, car2].map(c => {
    if (!world.addScriptedMover) return null;
    c.pose('called_a', 99);   // built in the docked pose (the cars tilt on the cable elsewhere; only docked do players get in)
    // floor, walls and windows; not the doors (they open while docked) nor the bits that wedged the player (decals,
    // snow, icicles, lights, the roof's cable gear above the cabin)
    const meshes = []; c.node.traverse(o => { if (!o.isMesh || /decal|snow|icicle|ice|light|bulb|roller|rubber|wheel|cable/i.test([o.material].flat()[0]?.name ?? '')) return; for (let p = o; p && p !== c.node; p = p.parent) if (/door|wheel/i.test(p.name)) return; meshes.push(o); });
    const ref = c.node.getObjectByName(c.node.name + '_tag_origin') ?? c.node.children[0];
    const m = world.addScriptedMover(meshes, { exact: true });
    const out = m && ref ? { m, ref, base: ref.getWorldPosition(new THREE.Vector3()) } : null;
    return out;
  }).filter(Boolean);
  reset();   // back to the starting poses
  const v = new THREE.Vector3();
  host.on('update', () => { for (const c of carCol) c.m.move(c.ref.getWorldPosition(v).sub(c.base)); });
  // Each station (car 2's on the left, car 1's on the right) as zm_castle_tram.gsc: its gates slide to their open structs
  // while its car is docked (1.5 s; 0.5 s back). BO3's tram_clip: the gate models are low, so an invisible wall closes
  // each gate gap while the car is away; docked, a slab bridges car and platform and solid boxes stand in for the car
  // (its own panels are single-sided: from inside the collision pushed you out through them): floor, both ends, both
  // sides open only at the doors. A gate side with no floor beyond it keeps its wall. Car 1 is docked for the first 12 s.
  const box = (min, max) => { const b = new THREE.Box3(min, max), size = b.getSize(new THREE.Vector3()), geo = new THREE.BoxGeometry(size.x, size.y, size.z); geo.translate(...b.getCenter(new THREE.Vector3()).toArray()); const d = { collider: new CollisionWorld(geo), box: b, enabled: false, window: true }; world.dynamic.push(d); return d; };
  for (const c of carCol) c.m.disabled = true;
  const pGates = []; root.traverse(o => { if (/^CASTLE_PTRAMGATE(_\d+)?$/.test(o.name) && o.userData.open) pGates.push({ o, shut: o.getWorldPosition(new THREE.Vector3()), open: new THREE.Vector3(...o.userData.open) }); });
  for (const g of pGates) { const meshes = []; g.o.updateMatrixWorld(true); g.o.traverse(c => { if (c.isMesh) meshes.push(c); }); g.col = world.addScriptedMover?.(meshes, { exact: true }); }
  const carOf = name => carCol.find(c => c.ref.name.startsWith(name));
  function station(gs, car, docked, gateK) {
    if (!gs.length || !car) return () => {};
    const pairs = []; for (const g of gs) { const pr = pairs.find(p => p[0].shut.distanceTo(g.shut) < 140); if (pr) pr.push(g); else pairs.push([g]); }
    const floorY = Math.min(...gs.map(g => g.shut.y)), cb = car.m.box.clone(), carC = cb.getCenter(new THREE.Vector3());
    const walls = pairs.map(pr => { const a = pr[0].shut, b = (pr[1] ?? pr[0]).shut, lo = a.clone().min(b), hi = a.clone().max(b); lo.x -= 12; lo.z -= 12; hi.x += 12; hi.z += 12; lo.y = floorY; hi.y = floorY + 110; return box(lo, hi); });
    for (const [i, pr] of pairs.entries()) {
      const mid = pr[0].shut.clone().add((pr[1] ?? pr[0]).shut).multiplyScalar(.5), out = mid.clone().sub(carC).setY(0).normalize();
      const probe = mid.clone().addScaledVector(out, 60); probe.y = floorY + 20;
      walls[i].noFloor = !world.raycast(new THREE.Ray(probe, new THREE.Vector3(0, -1, 0)), 0, 80);
    }
    const span = new THREE.Box3(); for (const g of gs) span.expandByPoint(g.shut);
    const T = 8, H = 110, top = floorY - 6.5, door = [span.min.z - 4, span.max.z + 4], boxes = [];
    boxes.push(box(new THREE.Vector3(span.min.x - 10, floorY - 16, span.min.z - 30), new THREE.Vector3(span.max.x + 10, top, span.max.z + 30)));   // slab
    boxes.push(box(new THREE.Vector3(cb.min.x, top - 12, cb.min.z), new THREE.Vector3(cb.max.x, top, cb.max.z)));   // floor
    for (const z of [cb.min.z, cb.max.z]) boxes.push(box(new THREE.Vector3(cb.min.x, top, z - T / 2), new THREE.Vector3(cb.max.x, top + H, z + T / 2)));
    for (const x of [cb.min.x, cb.max.x]) {
      boxes.push(box(new THREE.Vector3(x - T / 2, top, cb.min.z), new THREE.Vector3(x + T / 2, top + H, door[0])));
      boxes.push(box(new THREE.Vector3(x - T / 2, top, door[1]), new THREE.Vector3(x + T / 2, top + H, cb.max.z)));
    }
    return () => { const d = docked(), k = gateK(); for (const w of walls) w.enabled = w.noFloor || !d || k < .5; for (const b of boxes) b.enabled = d; };
  }
  let pK = 1, lastT = performance.now();
  const car1Docked = () => st.phase === 'intro' && (!st.started || session.time - st.t0 < 12);
  const upd = [station(gates, carOf('CASTLE_TRAM02') ?? carCol[1], () => st.phase === 'docked', () => st.gate), station(pGates, carOf('CASTLE_TRAM01') ?? carCol[0], car1Docked, () => pK)];
  host.on('update', () => {
    const now = performance.now(), dt = Math.min(.1, (now - lastT) / 1000); lastT = now;
    const want = car1Docked() ? 1 : 0; pK = want > pK ? Math.min(1, pK + dt / 1.5) : Math.max(0, pK - dt / .5);
    for (const g of pGates) { const p = g.shut.clone().lerp(g.open, pK); moveNode(g.o, p); g.col?.move(p.sub(g.shut)); }
    for (const u of upd) u();
  });
  host.on('reset', () => { pK = 1; });
  carBox = () => { const c = carOf('CASTLE_TRAM02') ?? carCol[1]; return c ? c.m.box.clone().expandByScalar(12) : null; };
  return { state: () => ({ ...st, item: !!st.item }), giveFuse: () => { st.held = true; }, cars: () => carCol.map(c => c.m?.box).filter(Boolean) };   // cars: the docked car boxes (the snow stays out of them)
}

// ---- Landing pads (zm_castle_flingers.gsc). Switch a landing pad on (free; its model turns blue), then its launch pad
// flings whoever stands on it for 500 points along BO3's flight path (Catmull-Rom through the vehicle nodes, at their
// speeds) to the landing pad; zombies on the launch pad are thrown off (killed), as are those on the landing pad when
// you land. 15 s before the launch pad works again.
const PAD_COST = 500, PAD_COOLDOWN = 15, PAD_RADIUS = 64;
// Co-op: switching a landing pad on is a team flag; a launch is the launcher's flight, the pad's cooldown everyone's,
// and the zombies it throws off die on the host.
function setupPads(api) {
  const { world, session, host, player, toast, audio, enemies, sync } = api, root = world.root;
  const pads = [];
  root.traverse(o => {
    const m = /^CASTLE_FLINGER_(.+)$/.exec(o.name); if (!m || !o.userData.path) return;
    const flag = m[1], landing = root.getObjectByName('CASTLE_LANDING_' + flag);
    const path = o.userData.path.map(p => new THREE.Vector3(...p)), curve = new THREE.CatmullRomCurve3(path, false, 'centripetal');
    pads.push({ flag, base: o, on: root.getObjectByName('CASTLE_FLINGERON_' + flag), landing, landingOn: root.getObjectByName('CASTLE_LANDINGON_' + flag),
      volume: new THREE.Vector3(...o.userData.volume), curve, length: curve.getLength(), speeds: o.userData.speeds, spots: (landing?.userData.spots ?? []).map(p => new THREE.Vector3(...p)), readyAt: 0 });
  });
  for (const o of [...pads.flatMap(p => [p.on, p.landingOn])]) if (o) o.visible = false;
  if (!pads.length) { console.warn('[der-eisendrache] landing pads missing (rebuild the map)'); return null; }
  const active = p => session.flags.has('castle:pad:' + p.flag);
  const show = () => { for (const p of pads) { const a = active(p); if (p.on) { p.on.visible = a; p.base.visible = !a; } if (p.landingOn && p.landing) { p.landingOn.visible = a; p.landing.visible = !a; } } };
  let flight = null;
  const killNear = (c, r, ctx) => { if (!sync.isHost) return; for (const z of [...enemies.list]) if (z.root.position.distanceTo(c) < r) sync.hurt(z, 1e9, ctx, { cause: 'explosive' }); };
  const padOf = flag => pads.find(p => p.flag === flag);
  sync.on('padOn', d => { session.flags.add('castle:pad:' + d.flag); show(); });
  sync.on('padLaunch', (d, ctx) => { const p = padOf(d.flag); if (!p) return; p.readyAt = session.time + PAD_COOLDOWN; killNear(p.volume, PAD_RADIUS + 20, ctx); if (ctx.mine) { audio?.play?.('teleport'); flight = { pad: p, d: 0 }; if (api.features) api.features.flight = true; } });
  sync.on('padLand', (d, ctx) => { const p = padOf(d.flag); if (p) killNear(p.spots[0] ?? p.curve.getPoint(1), 90, ctx); });
  for (const p of pads) {
    if (p.landing) world.addInteraction({
      position: p.landing.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 30, 0)),
      hidden: () => active(p),
      text: () => 'Activate the landing pad',
      use() { sync.act('padOn', { flag: p.flag }); audio?.play?.('buy'); toast?.('Landing pad activated', 2); return true; },
    });
    world.addInteraction({
      position: p.volume.clone(),
      hidden: () => !active(p),
      text: () => flight ? 'In flight' : session.time < p.readyAt ? 'The launch pad is recharging' : `Launch · ${PAD_COST}`,
      use() {
        if (flight || session.time < p.readyAt || !active(p)) return false;
        if (session.points < PAD_COST) { toast?.('Not enough points', 2); return false; }
        session.points -= PAD_COST; p.readyAt = session.time + PAD_COOLDOWN;
        sync.act('padLaunch', { flag: p.flag });
        return true;
      },
    });
  }
  // the flight takes the player over (custom.js prePlayer -> world.prePlayer)
  world.prePlayer = dt => {
    if (!flight) return false;
    const p = flight.pad, u = Math.min(1, flight.d / p.length), i = Math.min(p.speeds.length - 1, Math.floor(u * (p.speeds.length - 1)));
    flight.d += (p.speeds[i] ?? 1500) * dt;
    if (flight.d >= p.length) {
      const spot = p.spots[0] ?? p.curve.getPoint(1);
      player.setPosition(spot.clone().add(new THREE.Vector3(0, 2, 0))); sync.act('padLand', { flag: p.flag });
      flight = null; if (api.features) api.features.flight = false; audio?.play?.('land', .7);
      return true;
    }
    player.setPosition(p.curve.getPointAt(Math.min(1, flight.d / p.length)));
    return true;
  };
  host.on('reset', () => { flight = null; if (api.features) api.features.flight = false; for (const p of pads) p.readyAt = 0; show(); });
  show();
  return { pads: () => pads.map(p => ({ flag: p.flag, active: active(p), length: Math.round(p.length), ready: session.time >= p.readyAt })), flying: () => !!flight };
}

// ---- Look: a bright overcast Alpine day (the engine's default lights are retuned every frame, as for The Giant) and a
// pool of warm point lights on the lit fixtures nearest the camera (CASTLE_LAMP_<n>: candles, torches, sconces, lamp
// cages... from the static models), so the castle's halls and the undercroft aren't black. More with the power on.
const POOL = 6, LAMP = { color: 0xffac62, bulb: 0xffd9a8, on: 3000, off: 2000, range: 620, decay: 1.4 };   // 6: each point light is paid per pixel on every material (10 cost ~5 FPS)
function setupLook({ scene, world, session, host, camera }) {
  const kids = scene.children;
  const ambient = kids.find(o => o.isAmbientLight), hemi = kids.find(o => o.isHemisphereLight);
  const [key, fill] = kids.filter(o => o.isDirectionalLight && !o.castShadow).sort((a, b) => b.intensity - a.intensity);
  // lamps carry extras.kind since map v=29 ('fire': candles, torches, fire pits, chandeliers; 'electric'): a fire's light
  // flickers and sits warmer; a bulb's is steady and paler
  const lamps = [], fireAt = new Map(); world.root?.traverse(o => { if (/^CASTLE_LAMP_/.test(o.name)) { const p = o.getWorldPosition(new THREE.Vector3()); lamps.push(p); if (o.userData.kind !== 'electric') fireAt.set(p, Math.random() * 6.2832); } });
  const pool = Array.from({ length: Math.min(POOL, lamps.length) }, () => { const l = new THREE.PointLight(LAMP.color, 0, LAMP.range, LAMP.decay); l.position.set(0, -1e5, 0); l.userData.fire = null; scene.add(l); return l; });
  // the sky: BO3's skybox model isn't exported (a flat grey background showed through the castle's breaches): a dome at
  // the far plane with an overcast gradient, a soft sun glow and drifting cloud bands; the fog takes its horizon colour
  const HORIZON = new THREE.Color(0xd9dfe6);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x6f86a6) }, horizon: { value: HORIZON }, bottom: { value: new THREE.Color(0xaeb6bf) }, sunDir: { value: new THREE.Vector3(.45, .55, .3).normalize() }, time: { value: 0 } },
    vertexShader: 'varying vec3 vDir;\nvoid main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 top, horizon, bottom, sunDir; uniform float time; varying vec3 vDir;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int k = 0; k < 5; k++) { v += a * n(p); p = m * p; a *= 0.5; } return v; }   // rotated octaves: no grid-aligned blocks
      void main(){
        vec3 d = normalize(vDir); float y = d.y;
        vec3 c = y > 0.0 ? mix(horizon, top, pow(min(1.0, y * 1.6), 0.7)) : mix(horizon, bottom, min(1.0, -y * 4.0));
        float s = max(0.0, dot(d, sunDir)); c += vec3(1.0, 0.94, 0.82) * (pow(s, 48.0) * 0.6 + pow(s, 6.0) * 0.12);
        if (y > 0.0) { vec2 uv = d.xz / (y + 0.35) * 1.2 + vec2(time * 0.004, time * 0.002);
          float cl = smoothstep(0.42, 0.78, fbm(uv)) * smoothstep(0.02, 0.3, y);
          c = mix(c, vec3(0.92, 0.93, 0.95), cl * 0.45); }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.frustumCulled = false; sky.renderOrder = -1000; sky.scale.setScalar(1000); scene.add(sky);
  // BO3's own skybox (skybox_zm_castle: the moonlit Alps; sky/ in the map folder, git-ignored, exported with Greyhound):
  // its panorama is stored dim (BO3 brightens it in game), so it's drawn at SKY_GAIN; the procedural dome stays as the
  // fallback. The fog then takes a colour from the panorama's horizon.
  const SKY_GAIN = 3.4, FOG = 0x4f5e78, dir = world.entry?.dir ?? 'mods/maps/der-eisendrache/';
  if (scene.fog) scene.fog.density = Math.max(scene.fog.density, .00023);   // BO3's valley haze (the map entry's .00018 read thin)
  // sampled per pixel by view direction on the sky sphere (BO3's 96-vertex box interpolated its UVs linearly and warped
  // it, user; an equirectangular scene.background turned every map material white here)
  if (!/[?&]noSky/.test(location.search)) new THREE.TextureLoader().loadAsync(dir + 'sky/skybox.webp').then(tex => {
    tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.wrapS = THREE.RepeatWrapping;
    sky.material = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { map: { value: tex }, gain: { value: SKY_GAIN }, haze: { value: new THREE.Color(FOG) } },
      vertexShader: sky.material.vertexShader,
      fragmentShader: `uniform sampler2D map; uniform float gain; uniform vec3 haze; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); vec2 uv = vec2(atan(d.x, -d.z) / 6.2831853 + 0.5, 1.0 - acos(clamp(d.y, -1.0, 1.0)) / 3.1415927);
          // the panorama's horizon band is a mirrored strip of painted peaks with black cut-outs (BO3 draws its vista
          // models over it; here it showed as a ring of upside-down blue mountains, 2026-10-17): the real vista models
          // stand at the horizon, so below ~10° the sky fades into the fog's haze
          vec3 c = texture2D(map, uv).rgb * gain; float band = smoothstep(0.55, 0.69, uv.y);
          c = mix(haze, mix(c, vec3(dot(c, vec3(0.3, 0.5, 0.2))), 0.25), band);   // a little less saturated: BO3's storm sky is grey-blue
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    if (scene.fog) scene.fog.color.set(FOG); scene.background = new THREE.Color(FOG);
  }).catch(() => {});
  let skyModel = null;
  if (scene.fog) scene.fog.color.copy(HORIZON);
  scene.background = HORIZON.clone();
  let last = performance.now(), timer = 0;
  host.on('update', () => {
    const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now;
    sky.position.copy(camera.position); if (sky.material.uniforms.time) sky.material.uniforms.time.value += dt; skyModel?.position.copy(camera.position);
    // BO3's castle sits under a grey-blue storm sky: cool, slightly dimmer daylight than before (2026-10-17; it read as
    // bright white noon under a night sky), the warmth coming from the lamp pool and the flames
    if (ambient) { ambient.color.setHex(0x8e9db6); ambient.intensity = .8; }
    if (hemi) { hemi.color.setHex(0xc3d0e4); hemi.groundColor.setHex(0x4c4a48); hemi.intensity = 1.0; }
    if (key) { key.color.setHex(0xe9eef7); key.intensity = 1.25; key.position.set(.45, 1, .3); }
    if (fill) { fill.color.setHex(0x74889f); fill.intensity = .4; }
    if ((timer -= dt) <= 0 && pool.length) {
      timer = .5;
      const eye = camera.position, near = lamps.map(p => ({ p, d: p.distanceToSquared(eye) })).sort((a, b) => a.d - b.d).slice(0, pool.length);
      const free = pool.filter(l => !near.some(n => n.p.equals(l.position)));
      for (const n of near) if (!pool.some(l => l.position.equals(n.p))) { const l = free.shift(); if (l) { l.position.copy(n.p); l.intensity = 0; l.userData.fire = fireAt.has(n.p) ? fireAt.get(n.p) : null; l.color.setHex(fireAt.has(n.p) ? LAMP.color : LAMP.bulb); } }
    }
    if (timer > .49 && world.wallGuns) for (const g of world.wallGuns) g.visible = g.position.distanceToSquared(camera.position) < 1800 * 1800;
    const want = session.power ? LAMP.on : LAMP.off, T = performance.now() / 1000;
    for (const l of pool) {
      l.userData.level = (l.userData.level ?? 0) + (want - (l.userData.level ?? 0)) * Math.min(1, dt * 2.5);
      const f = l.userData.fire; l.intensity = l.userData.level * (f == null ? 1 : .86 + .09 * Math.sin(T * 9.1 + f) + .05 * Math.sin(T * 23.7 + f * 2.0));   // a flame's flicker
    }
  });
}

// ---- Pack-a-Punch (zm_castle_pap_quest.gsc). The machine starts hidden (the PAP marker is BO3's storage spot under the
// map). Activate two of its three spots (undercroft, rocket pad, roof: CASTLE_PAPTP_<spot>; their scattered parts,
// CASTLE_PAPPART_<spot>, fly off); it re-forms at the third (CASTLE_PAPLOC_<spot>) once you look at it from within 400.
// After its first use it moves on to the next spot every 2-3 rounds (at the end of a round, never mid-upgrade).
const PAP_ORDER = ['under', 'rocket', 'roof'], PAP_NAME = { under: 'the undercroft', rocket: 'the rocket pad', roof: 'the rooftop' };
// Co-op: each step is an event (anyone's look re-forms it); the host picks when it moves on.
function setupPap(api) {
  const { world, session, host, player, camera, toast, announce, audio, sync } = api, root = world.root;
  const locs = {}, tps = {}, parts = {};
  for (const k of PAP_ORDER) {
    const l = root.getObjectByName('CASTLE_PAPLOC_' + k), t = root.getObjectByName('CASTLE_PAPTP_' + k);
    if (l) locs[k] = { pos: l.getWorldPosition(new THREE.Vector3()), yaw: l.userData.yaw ?? 0 };
    if (t) tps[k] = t.getWorldPosition(new THREE.Vector3());
    parts[k] = []; root.traverse(o => { if (new RegExp('^CASTLE_PAPPART_' + k + '(_\\d+)?$').test(o.name)) parts[k].push(o); });
  }
  if (Object.keys(locs).length < 3 || !world.movePap) { console.warn('[der-eisendrache] Pack-a-Punch spots missing (rebuild the map)'); return null; }
  const st = { active: new Set(), reformAt: null, reformed: false, at: null, used: false, nextMove: 0 };
  const showParts = (k, v) => { for (const o of parts[k]) o.visible = v; };
  const machineVisible = v => { if (world.papMachine) world.papMachine.visible = v; };
  const reset = () => {
    Object.assign(st, { active: new Set(), reformAt: null, reformed: false, at: null, used: false, nextMove: 0 });
    for (const k of PAP_ORDER) showParts(k, true);
    world.papLocked = true; world.papLockedText = 'Pack-a-Punch hasn\'t re-formed';
  };
  const place = k => { st.at = k; world.movePap(locs[k].pos, locs[k].yaw); machineVisible(true); };
  sync.on('papAct', d => { const k = d.k; if (st.active.has(k) || st.reformAt != null) return;
      st.active.add(k); showParts(k, false); audio?.play?.('teleport', .6);
      if (st.active.size >= 2) {
        st.reformAt = PAP_ORDER.find(x => !st.active.has(x));
        announce?.('PACK-A-PUNCH', `RE-FORMING AT ${PAP_NAME[st.reformAt].toUpperCase()}`, 4);
      } else toast?.('Pack-a-Punch part sent away · one more', 3);
  });
  sync.on('papReform', () => { if (st.reformed || !st.reformAt) return; st.reformed = true; showParts(st.reformAt, false); place(st.reformAt); world.papLocked = false; audio?.play?.('teleport'); announce?.('PACK-A-PUNCH', 'RE-FORMED', 3); });
  sync.on('papUsed', (d, ctx) => { if (st.used) return; st.used = true; st.nextMove = (session.round ?? 1) + 2 + Math.floor(ctx.rand() * 2); });
  sync.on('papMove', (d, ctx) => { place(d.k); st.nextMove = (session.round ?? 1) + 2 + Math.floor(ctx.rand() * 2); toast?.(`Pack-a-Punch moved to ${PAP_NAME[d.k]}`, 4); });
  for (const k of PAP_ORDER) if (tps[k]) world.addInteraction({
    position: tps[k],
    hidden: () => st.active.has(k) || st.reformAt != null,
    text: () => 'Activate the Pack-a-Punch',
    use() { sync.act('papAct', { k }); return true; },
  });
  let reformAsked = false;
  const look = new THREE.Vector3(), to = new THREE.Vector3();
  host.on('update', () => {
    if (!st.reformed) machineVisible(false);
    if (st.reformAt && !st.reformed) {
      const l = locs[st.reformAt], feet = player.getFeetPosition();
      camera.getWorldDirection(look); to.copy(l.pos).add(new THREE.Vector3(0, 50, 0)).sub(camera.position).normalize();
      if (feet.distanceTo(l.pos) < 400 && look.dot(to) > Math.cos(Math.PI / 4) && !reformAsked) { reformAsked = true; sync.act('papReform'); }
    }
    if (st.reformed && !st.used && session.pack && !st.usedAsked) { st.usedAsked = true; sync.act('papUsed'); }
  });
  host.on('roundEnd', () => {   // the host moves it (not while anyone's weapon is in it: its own; teammates' aren't known here)
    if (!sync.isHost || !st.used || session.pack || (session.round ?? 0) < st.nextMove) return;
    sync.act('papMove', { k: PAP_ORDER[(PAP_ORDER.indexOf(st.at) + 1) % 3] });
  });
  host.on('reset', () => { reset(); reformAsked = false; st.usedAsked = false; });
  reset();
  return { state: () => ({ active: [...st.active], reformAt: st.reformAt, reformed: st.reformed, at: st.at, nextMove: st.nextMove }) };
}

// ---- The rocket pad: its zones open once someone has taken the teleporter (castle_teleporter_used)
function setupRocketPad({ world, session, host, player, sync }) {
  const tp = world.teleporters?.find(t => t.name === 'rocketpad'), dest = tp?.to?.position;
  if (!dest) { console.warn('[der-eisendrache] rocket pad teleporter missing (rebuild the map)'); return; }
  host.on('update', () => { if (!session.flags.has('castle:flag:castleteleporterused') && player.getFeetPosition().distanceTo(dest) < 900) sync.flag('castle:flag:castleteleporterused'); });
}

// ---- Dog rounds as zm_castle_dogs.gsc: the first 4-5 rounds in, then every 7-13 rounds
function setupDogRounds({ session, host, sync }) {   // the host runs the rounds (guests take dogRound from its snapshot)
  let seen = 0;
  const first = () => { session.nextDogRound = 1 + 4 + Math.floor(Math.random() * 2); seen = 0; };
  host.on('reset', first); first();
  host.on('update', () => { if (sync.isHost && session.dogRound && session.round !== seen) { seen = session.round; session.nextDogRound = session.round + 7 + Math.floor(Math.random() * 7); } });
}

// Re-binds a skinned model so each named joint's rest local rotation is `ref`'s (BO1's), every joint staying where it
// is: positions are re-expressed in the new parent frames, and each skin's inverse bind matrices are recomputed from the
// new pose, so the mesh doesn't move but animation clips authored for `ref`'s joint frames now pose it correctly.
function rebindTo(model, ref, rootWorld = null) {
  model.updateMatrixWorld(true);
  const bones = []; model.traverse(o => { if (o.isBone) bones.push(o); });
  const world = new Map(bones.map(b => [b, b.getWorldPosition(new THREE.Vector3())]));
  for (const b of bones) {   // traverse order: parents before children
    if (rootWorld?.has(b.name) && !b.parent.isBone) b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rootWorld.get(b.name)));
    else b.quaternion.copy(ref.get(b.name) ?? new THREE.Quaternion());   // joints BO1 lacks (j_neck2...): parent's orientation, else BO1's head rotation lands off by theirs
    b.parent.updateWorldMatrix(true, false);
    b.position.copy(b.parent.worldToLocal(world.get(b).clone()));
    b.updateMatrixWorld(true);
  }
  model.traverse(o => { if (o.isSkinnedMesh) { o.skeleton.calculateInverses(); o.bindMatrix.copy(o.matrixWorld); o.bindMatrixInverse.copy(o.matrixWorld).invert(); } });
}

// ---- Wrath of the Ancients (zm_castle_weap_quest.gsc). Three dragon heads (undercroft, lower courtyard, great hall)
// each eat 8 zombies killed in front of them (CASTLE_DRAGONZONE_<head>: a sphere where BO3 has a volume); a fed zombie
// is pulled into the mouth. With all three fed the bow waits at the pedestal behind the castle (CASTLE_BOWPICKUP), free
// to each player once. The bow: bo3_wrath_ancients (.tools/build_bo3_weapons.py, from BO3's wpn_t7_zmb_bow_base_*).
const SOULS = 8, BOW = 'bo3_wrath_ancients';
// Co-op: the host's kills feed the dragons (kill events: every client counts and animates them; the corpse is dragged
// in on the host, where the bodies are); each player takes their own bow.
function setupBow(api) {
  const { world, session, host, toast, announce, audio, scene, enemies, sync } = api, root = world.root;
  const heads = [];
  root.traverse(o => { const m = /^CASTLE_DRAGONZONE_(.+)$/.exec(o.name); if (m) heads.push({ id: m[1], c: o.getWorldPosition(new THREE.Vector3()), r: o.userData.radius ?? 220, mouth: new THREE.Vector3(...(o.userData.mouth ?? o.position.toArray())), n: 0, model: root.getObjectByName('CASTLE_DRAGON_' + m[1]) }); });
  const pick = root.getObjectByName('CASTLE_BOWPICKUP');
  if (heads.length < 3 || !pick) { console.warn('[der-eisendrache] bow quest markers missing (rebuild the map)'); return null; }
  const spot = pick.getWorldPosition(new THREE.Vector3());
  // the bow on the pedestal: its world model, slowly turning in a red glow
  const shown = new THREE.Group(); shown.position.copy(spot).add(new THREE.Vector3(0, 45, 0)); shown.visible = false; scene.add(shown);
  const glow = new THREE.PointLight(0xff5a1a, 0, 220, 1.6); shown.add(glow);
  const def = api.data?.weapons?.[BOW];
  if (def?.worldModel) import('../../animation.js').then(({ loadModel }) => loadModel(def.worldModel)).then(m => { if (m) { m.rotation.z = Math.PI / 2; shown.add(m); } }).catch(() => {});
  const taken = () => session.flags.has('castle:bow:taken:' + sync.me), charged = () => heads.every(h => h.n >= SOULS);
  // animated heads (BO3's c_zom_dragonhead and its o_zm_dlc1_dragonhead_* clips, .tools/build_castle_panzer.py; dragon/,
  // git-ignored) replace the static props: idle (now and then a roar), an eating clip from the side a soul came from,
  // and the outro once full
  const DR = new URL('dragon/', import.meta.url).href;
  const dragonsReady = /[?&]noDragons/.test(location.search) ? null : Promise.all([loadModel(DR + 'c_zom_dragonhead.glb').catch(() => null), fetch(DR + 'anims.json').then(r => r.json()).catch(() => null)]).then(async ([model, index]) => {
    if (!model || !index) return;
    const clips = {}; await Promise.all(Object.keys(index).map(async k => { clips[k] = await loadAnimation(DR + 'anims/' + k + '.json').catch(() => null); }));
    for (const h of heads) {
      if (!h.model) continue;
      h.model.updateWorldMatrix(true, false);
      const m = cloneSkinned(model); h.model.matrixWorld.decompose(m.position, m.quaternion, m.scale); m.scale.setScalar(1);
      m.traverse(o => { if (o.isBone) o.userData.bindPosition = o.position.clone(); if (o.isMesh) { o.frustumCulled = false; o.castShadow = o.receiveShadow = false; } });
      const rig = new Rig(m); for (const [k, d] of Object.entries(clips)) if (d) rig.add(k, d);
      scene.add(m); h.model.visible = false; h.anim = { m, rig, index, until: 0, next: 'idle' }; rig.play('idle');
    }
  });
  const dragonPlay = (h, k, then = 'idle') => { const a = h.anim; if (!a || !a.rig.actions[k]) return; a.rig.play(k, false, 1, .2); a.until = t + (a.index[k]?.duration ?? 2); a.next = then; };
  const flying = [], corpses = [];
  const lastDead = new Map();   // the host: a kill's body, for the drag into the mouth
  host.on('kill', ({ enemy }) => { if (enemy?.root) lastDead.set(enemy.root.position.toArray().map(x => Math.round(x * 10) / 10).join(), enemy); });
  sync.on('kill', d => {
    const p = sync.v(d.p), enemy = lastDead.get(d.p.join()) ?? null; lastDead.clear();
    const h = heads.find(h => h.n < SOULS && p.distanceTo(h.c) < h.r);
    if (!h) return;
    h.n++;
    { const side = new THREE.Vector3().subVectors(p, h.mouth).setY(0), m = h.anim?.m; let k = 'f';
      if (m) { const right = new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion); const d = side.normalize().dot(right); k = d > .35 ? 'r' : d < -.35 ? 'l' : 'f'; }
      if (h.anim) { dragonPlay(h, 'consume_pre_eat_' + k, 'consume_align_' + k); h.anim.after = h.n >= SOULS ? 'outtro' : 'idle'; } }
    // the soul: a glowing orb from the body into the mouth
    const orb = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff7a3a })); orb.position.copy(p).add(new THREE.Vector3(0, 40, 0)); scene.add(orb);
    flying.push({ orb, to: h.mouth.clone(), t: 0, from: orb.position.clone() });
    // the corpse is dragged up into the mouth while the head lunges (BO3's consume clips), then gone
    if (enemy?.root) { const body = enemy.root; enemy.life = Math.max(enemy.life ?? 0, 4);
      corpses.push({ o: body, from: body.position.clone(), to: h.mouth.clone().add(new THREE.Vector3(0, -10, 0)), t: -.6, s0: body.scale.x }); }
    audio?.play?.('powerup', .5);
    if (h.n === SOULS) {
      const left = heads.filter(x => x.n < SOULS).length;
      announce?.('A DRAGON IS FED', left ? `${left} TO GO` : 'THE BOW AWAITS BEHIND THE CASTLE', 4);
      if (!left) shown.visible = true;
    }
  });
  world.addInteraction({ position: spot.clone().add(new THREE.Vector3(0, 30, 0)), hidden: () => !charged() || taken(), text: () => 'Take Wrath of the Ancients',
    use() { if (!def) return false; session.flags.add('castle:bow:taken:' + sync.me); session.giveWeapon(BOW); api.equipView?.(); announce?.('WRATH OF THE ANCIENTS', '', 3); audio?.play?.('box'); return true; } });
  let t = 0;
  host.on('update', dt => {
    dt = dt || 1 / 60; t += dt;
    for (const f of [...flying]) { f.t = Math.min(1, f.t + dt * 1.4); f.orb.position.lerpVectors(f.from, f.to, f.t).y += Math.sin(f.t * Math.PI) * 60; if (f.t >= 1) { f.orb.removeFromParent(); flying.splice(flying.indexOf(f), 1); } }
    for (const c of [...corpses]) { c.t += dt / 1.3; const k = Math.max(0, Math.min(1, c.t)), e = k * k;
      c.o.position.lerpVectors(c.from, c.to, e); c.o.position.y += Math.sin(k * Math.PI) * 25; c.o.scale.setScalar(c.s0 * (1 - .85 * Math.max(0, k - .6) / .4));
      if (k >= 1) { c.o.visible = false; corpses.splice(corpses.indexOf(c), 1); } }
    for (const h of heads) { const a = h.anim; if (!a) continue; a.rig.update(dt);
      if (a.until && t >= a.until) { const k = a.next; a.until = 0;
        if (k === 'idle') { a.rig.play('idle', true, 1, .3); } else if (k === 'outtro') dragonPlay(h, 'outtro', 'done'); else if (k === 'done') {} else dragonPlay(h, k, a.after ?? 'idle'); }
      else if (!a.until && a.rig.current === 'idle' && Math.random() < dt / 25) dragonPlay(h, 'idle_twitch_roar'); }
    shown.visible = charged() && !taken();
    if (shown.visible) { shown.rotation.y += dt * .6; shown.position.y = spot.y + 45 + Math.sin(t * 1.5) * 3; glow.intensity = 900 + Math.sin(t * 3) * 200; }
  });
  host.on('reset', () => { for (const h of heads) { h.n = 0; if (h.anim) { h.anim.until = 0; h.anim.rig.play('idle'); } } shown.visible = false; for (const f of flying) f.orb.removeFromParent(); flying.length = 0; });
  return { ready: dragonsReady, state: () => ({ souls: heads.map(h => [h.id, h.n]), charged: charged(), taken: taken() }), feed: (k = 0) => { for (const h of heads) h.n = SOULS; shown.visible = true; } };
}

// ---- The Panzersoldat (zm_castle_mechz.gsc + BO3's mechz behaviour). Assets: .tools/build_castle_panzer.py (BO3's
// c_zom_mech_body and its ai_zm_dlc1_soldat_* clips; panzer/, git-ignored). It joins enemies.list (every weapon,
// explosion, insta-kill, kill event and the round count work on it) with z.ai: this script drives it.
//   Rounds: the first on round 12, then every 5-6 rounds (one in solo), 5 s into the round, at a random CASTLE_MECHZ_
//   spawn point in an active zone; it drops in on its jetpack. Health 3500 + 500 a round (max 17,500).
//   Attacks: flamethrower sweep within 260 (a cone, ~70 damage/s), the arm cannon from 300 to 1,100 (bursts),
//   a claw melee within 95. Armour: body hits do a quarter; head hits go to the faceplate first; when it breaks it
//   flies off, the Panzer is stunned, then goes berserk (sprints) and takes double damage to the head. Hits on its
//   back go to the power-supply cap; when it breaks the Panzer reels and its core takes double damage.
const PZ_DIR = new URL('panzer/', import.meta.url).href;
// Co-op: the host spawns and runs it (it hunts the nearest standing player; its hits reach teammates through
// sync.hitPlayer); guests build a copy when the host's snapshot names a 'panzer' (enemies.spawn below), animated
// by the snapshot's states. Armour applies on the host only (a guest's hit would be cut twice).
function setupPanzer(api) {
  const clawHat = () => (window.kino?.castle?.clawHat ? .5 : 1);   // the claw hat (side2.js): BO3 halves its melee, fire and splash
  const { world, session, host, scene, enemies, player, announce, audio, sync } = api, root = world.root;
  const spots = []; root.traverse(o => { if (/^CASTLE_MECHZ_\d+$/.test(o.name)) spots.push({ p: o.getWorldPosition(new THREE.Vector3()), zone: o.userData.zone, yaw: o.userData.yaw ?? 0 }); });
  const A = {};
  let assets = null;
  const ready = (async () => {
    const [body, barrel, face, cap, index] = await Promise.all(['c_zom_mech_body', 'c_zom_mech_gun_barrel', 'c_zom_mech_faceplate', 'c_zom_mech_powersupply_cap'].map(n => loadModel(PZ_DIR + n + '.glb').catch(() => null)).concat(fetch(PZ_DIR + 'anims.json').then(r => r.json()).catch(() => null)));
    if (!body || !index) return null;
    await Promise.all(Object.keys(index).map(async k => { A[k] = await loadAnimation(PZ_DIR + 'anims/' + k + '.json').catch(() => null); }));
    assets = { body, barrel, face, cap, index }; return assets;
  })();
  const st = { next: 12, list: [] };
  const V = () => new THREE.Vector3();
  // a part model (built around its own root joint) skinned onto the body's bones, in the body's bind space
  function attachPart(body, part, rootName) {
    body.updateMatrixWorld(true); part.updateMatrixWorld(true);
    const bones = new Map(); body.traverse(o => { if (o.isBone && !bones.has(o.name)) bones.set(o.name, o); });
    let bodySkin = null; const inv = new Map(); body.traverse(o => { if (!o.isSkinnedMesh) return; bodySkin ??= o; o.skeleton.bones.forEach((b, k) => { if (!inv.has(b)) inv.set(b, o.skeleton.boneInverses[k]); }); });
    const pr = part.getObjectByName(rootName), br = bones.get(rootName); if (!pr || !br || !bodySkin) return [];
    const toBody = br.matrixWorld.clone().multiply(pr.matrixWorld.clone().invert()), meshes = [];
    part.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
    for (const m of meshes) {
      m.geometry = m.geometry.clone().applyMatrix4(toBody.clone().multiply(m.matrixWorld));
      const mapped = m.skeleton.bones.map(b => bones.get(b.name) ?? br);
      m.bind(new THREE.Skeleton(mapped, mapped.map(b => (inv.get(b) ?? b.matrixWorld.clone().invert()).clone())), bodySkin.bindMatrix);
      m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1); m.frustumCulled = false; body.add(m);
    }
    return meshes;
  }
  // a guest's copy of the host's Panzer
  const spawnZombie = enemies.spawn.bind(enemies);
  enemies.spawn = (p, b, kind, ...rest) => kind === 'panzer' && !sync.isHost ? (spawn(p, true) ?? spawnZombie(p, b, 'zombie', ...rest)) : spawnZombie(p, b, kind, ...rest);
  function spawn(at = null, mirror = false) {
    if (!assets) return null;
    const zones = world.activeZones(session), pool = spots.filter(s => zones.has(s.zone));
    const sp = at ? { p: at, yaw: 0 } : (pool.length ? pool[Math.floor(Math.random() * pool.length)] : spots[0]);
    if (!sp) return null;
    const ground = world.closest(sp.p, { x: 200, y: 300, z: 200 }) ?? sp.p;
    const rootG = new THREE.Group(), body = cloneSkinned(assets.body); rootG.add(body);
    body.traverse(o => { if (o.isBone) o.userData.bindPosition = o.position.clone(); if (o.isMesh) o.frustumCulled = false; });
    if (assets.barrel) attachPart(body, cloneSkinned(assets.barrel), 'j_elbow_le');
    const faceMeshes = []; body.traverse(o => { if (o.isMesh && /faceplate/i.test([o.material].flat()[0]?.name ?? '')) faceMeshes.push(o); });
    const rig = new Rig(rootG);
    for (const [k, d] of Object.entries(A)) if (d) rig.add(k, d);
    if (A.death) rig.add('death', A.death);
    rig.add('walk', A.walk_basic); rig.add('attack', A.melee_a);
    const round = session.round ?? 1, health = Math.min(17500, 3500 + 500 * round);
    const z = { id: ++enemies.serial, kind: 'panzer', root: rootG, rig, speed: 0, health, maxHealth: health, state: 'arrive', path: [], pathIndex: 0, repath: 0,
      hit: { r: 26, h: 92, head: 15 }, face: Math.round(health * .6), cap: Math.round(health * .3), berserk: false, capOff: false,
      t: 0, act: 'hover', cool: { ft: 2, gun: 4, melee: 0 }, faceMeshes, ground: ground.clone(), lastPosition: V() };
    rootG.position.copy(ground).add(new THREE.Vector3(0, mirror ? 0 : 700, 0)); rootG.rotation.y = sp.yaw ?? 0;
    z.lastPosition.copy(rootG.position);
    if (mirror) { scene.add(rootG); rig.play('walk'); enemies.list.push(z); st.list.push(z); return z; }
    scene.add(rootG); rig.play('hover_loop'); z.ai = (dt, pl) => think(z, dt, pl);
    enemies.list.push(z); session.total = (session.total ?? 0) + 1; session.spawned = (session.spawned ?? 0) + 1;
    st.list.push(z); audio?.play?.('dog_round', .8); announce?.('PANZERSOLDAT', '', 3);
    return z;
  }
  const face = (z, to) => { z.root.rotation.y = Math.atan2(-(to.z - z.root.position.z), to.x - z.root.position.x); };   // CoD models face +X
  const fwd = z => new THREE.Vector3(1, 0, 0).applyQuaternion(z.root.quaternion).setY(0).normalize();
  function play(z, k, loop = true) { if (z.act === k) return; z.act = k; z.rig.play(k, loop); }
  function think(z, dt, pl) {
    z.t += dt; for (const k in z.cool) z.cool[k] -= dt;
    // the nearest standing player (repicked every second) is the one it hunts and hits
    if (!z.target || (z.retarget = (z.retarget ?? 0) - dt) <= 0) { z.retarget = 1; z.target = sync.nearest(z.root.position) ?? { id: sync.me, pos: pl }; }
    const tgt = sync.players().find(q => q.id === z.target.id) ?? { id: sync.me, pos: pl };
    const damage = n => sync.hitPlayer(tgt.id, n);
    const pos = z.root.position, tp = tgt.pos, dist = pos.distanceTo(tp);
    if (z.state === 'arrive') {   // drop in on the jetpack
      const k = Math.min(1, z.t / 2.2); pos.lerpVectors(z.ground.clone().add(new THREE.Vector3(0, 700, 0)), z.ground, 1 - (1 - k) ** 2); face(z, tp);
      if (k >= 1 && z.act !== 'hover_land') { play(z, 'hover_land', false); z.landAt = z.t; }
      if (z.act === 'hover_land' && z.t - z.landAt > (assets.index.hover_land?.duration ?? 1.3)) { z.state = 'chase'; z.repath = 0; }
      return;
    }
    if (z.state === 'busy') { if (z.t >= z.busyUntil) { z.state = 'chase'; z.repath = 0; } else { z.busy?.(dt); return; } }
    const eye = tp.clone().add(new THREE.Vector3(0, 40, 0)), from = pos.clone().add(new THREE.Vector3(0, 70, 0)), seen = world.lineClear(from, eye);
    face(z, tp);
    // attacks
    if (seen && dist < 95 && z.cool.melee <= 0) return busy(z, Math.random() < .5 ? 'melee_a' : 'melee_b', null, { at: .55, hit: () => { if (pos.distanceTo(tp) < 110) damage(70 * clawHat()); } }, 1.8);
    if (seen && dist < 260 && z.cool.ft <= 0) return busy(z, 'ft_sweep', dt2 => { const to = tp.clone().sub(pos).setY(0).normalize(); if (pos.distanceTo(tp) < 300 && to.dot(fwd(z)) > .7) damage(70 * dt2 * clawHat()); flame(z); }, null, 4.5);
    if (seen && dist > 300 && dist < 1100 && z.cool.gun <= 0) return busy(z, 'chaingun_fire', dt2 => { z.gunT = (z.gunT ?? 0) - dt2; if (z.gunT <= 0) { z.gunT = .12; tracer(z, eye); if (Math.random() < .3) damage(6); } }, null, 7, 2.2);
    // move along the navmesh
    z.repath -= dt;
    if (z.repath <= 0) { z.repath = .5; z.path = world.path(pos, tp) ?? []; z.pathIndex = 1; }
    const goal = z.path[z.pathIndex] ?? tp, d = goal.clone().sub(pos); d.y = 0;
    if (d.length() < 12 && z.pathIndex < z.path.length - 1) z.pathIndex++;
    const k = z.berserk ? 'sprint' : dist > 700 ? 'run' : 'walk_basic';
    play(z, k); const speed = (assets.index[k]?.speed || 40) * (z.berserk ? 1 : 1);
    if (d.length() > 1) { d.normalize(); pos.addScaledVector(d, Math.min(speed * dt, goal.distanceTo(pos))); face(z, goal); }
    const y = world.surfaceY?.(pos.x, pos.y + 40, pos.z); if (y != null && Math.abs(y - pos.y) < 60) pos.y += (y - pos.y) * Math.min(1, dt * 10);
  }
  function busy(z, k, each, note, cool, len) {
    z.state = 'busy'; play(z, k, !!len); const dur = len ?? assets.index[k]?.duration ?? 2; z.busyUntil = z.t + dur;
    const t0 = z.t; let fired = false;
    z.busy = dt => { each?.(dt); if (note && !fired && z.t - t0 >= note.at * dur) { fired = true; note.hit(); } };
    const key = k.startsWith('ft') ? 'ft' : k.startsWith('chain') ? 'gun' : 'melee'; z.cool[key] = cool + dur;
    z.act = k;
  }
  // effects: flame particles from the right arm, tracers from the arm cannon
  const flameMat = new THREE.SpriteMaterial({ color: 0xff7a2a, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false });
  const fx = [];
  function flame(z) {
    const tag = z.root.getObjectByName('tag_flamethrower_fx') ?? z.root.getObjectByName('j_wrist_ri'); if (!tag) return;
    const p = tag.getWorldPosition(V()), dir = fwd(z);
    for (let i = 0; i < 2; i++) { const sp = new THREE.Sprite(flameMat); sp.position.copy(p); sp.scale.setScalar(14); scene.add(sp); fx.push({ o: sp, v: dir.clone().multiplyScalar(420 + Math.random() * 120).add(new THREE.Vector3((Math.random() - .5) * 90, (Math.random() - .3) * 50, (Math.random() - .5) * 90)), life: .55, grow: 90 }); }
  }
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: .9 });
  function tracer(z, to) {
    const tag = z.root.getObjectByName('tag_gun_barrel1') ?? z.root.getObjectByName('j_wrist_le'); if (!tag) return;
    const a = tag.getWorldPosition(V()), b = to.clone().add(new THREE.Vector3((Math.random() - .5) * 40, (Math.random() - .5) * 30, (Math.random() - .5) * 40));
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), tracerMat); scene.add(l); fx.push({ o: l, life: .06 });
    audio?.play?.('shot', .25);
    const spin = z.root.getObjectByName('tag_gun_spin'); if (spin) spin.rotateX(.9);
  }
  // debris: the faceplate or the power-supply cap flying off
  function launch(z, model, boneName) {
    if (!model) return;
    const bone = z.root.getObjectByName(boneName), p = bone ? bone.getWorldPosition(V()) : z.root.position.clone().add(new THREE.Vector3(0, 80, 0));
    const o = cloneSkinned(model); o.position.copy(p); scene.add(o); fx.push({ o, v: fwd(z).multiplyScalar(160).add(new THREE.Vector3(0, 260, 0)), spin: 6, life: 5, gravity: 900 });
  }
  host.on('update', dt => {
    dt = dt || 1 / 60;
    for (const f of [...fx]) {
      f.life -= dt;
      if (f.v) { if (f.gravity) f.v.y -= f.gravity * dt; f.o.position.addScaledVector(f.v, dt); }
      if (f.spin) f.o.rotation.x += f.spin * dt;
      if (f.grow) { f.o.scale.setScalar(f.o.scale.x + f.grow * dt); f.o.material.opacity = Math.max(0, f.life / .55) * .8; }
      if (f.life <= 0) { f.o.removeFromParent(); fx.splice(fx.indexOf(f), 1); }
    }
    for (const z of [...st.list]) if (!enemies.list.includes(z)) st.list.splice(st.list.indexOf(z), 1);
  });
  // armour
  host.on('beforeEnemyDamage', e => {
    const z = e.enemy; if (z?.kind !== 'panzer' || !sync.isHost) return;
    if (z.state === 'arrive') { e.amount = 0; return; }
    let amount = e.amount * (e.cause === 'explosion' ? .5 : 1);
    if (e.head && z.face > 0) {
      z.face -= amount; e.amount = 0;
      if (z.face <= 0) {   // faceplate off: stunned, then berserk
        for (const m of z.faceMeshes) m.visible = false; launch(z, assets.face, 'j_faceplate'); audio?.play?.('explosion', .5);
        z.state = 'busy'; play(z, 'head_stun_intro', false); z.busyUntil = z.t + 4; z.busy = () => { if (z.t > z.busyUntil - 2.6 && z.act === 'head_stun_intro') play(z, 'head_stun_loop'); };
        z.berserk = true;
      }
      return;
    }
    if (e.head) { e.amount = amount * 2; return; }
    // back: the power-supply cap
    const back = !e.melee && e.cause === 'bullet' && player?.getFeetPosition && fwd(z).dot(player.getFeetPosition().clone().sub(z.root.position).setY(0).normalize()) < -.3;
    if (back && !z.capOff) { z.cap -= amount; e.amount = amount * .25; if (z.cap <= 0) { z.capOff = true; launch(z, assets.cap, 'tag_powersupply'); z.state = 'busy'; play(z, 'powercore_pain', false); z.busyUntil = z.t + (assets.index.powercore_pain?.duration ?? 2); z.busy = null; } return; }
    e.amount = amount * (back && z.capOff ? 2 : .25);
  });
  // rounds
  let lastRound = 0;
  host.on('update', () => {
    if (!sync.isHost || !assets || !spots.length || session.phase !== 'fighting') return;
    if (session.round !== lastRound) { lastRound = session.round; st.due = null;
      if (session.round >= st.next && !session.dogRound) { st.due = session.time + 5; st.next = session.round + 5 + Math.floor(Math.random() * 2); } }
    if (st.due != null && session.time >= st.due) { st.due = null; spawn(); }
  });
  host.on('reset', () => { st.next = 12; st.due = null; lastRound = 0; for (const f of fx) f.o.removeFromParent(); fx.length = 0; });
  return { spawn: p => spawn(p), state: () => ({ next: st.next, alive: st.list.map(z => ({ hp: Math.round(z.health), face: Math.round(z.face), cap: Math.round(z.cap), state: z.state, act: z.act })) }), ready };
}

// ---- Der Wunderfizz (BO3's random perk machine, zm_perk_random). Five machines (CASTLE_FIZZ_<n>); one is lit at a
// time, starting at one of the two start spots, with the power on. 1500 points: the ball spins (3 s) and lands on a
// random perk you don't have (pass-locked ones only once owned), which you take within 10 s. After 3-6 uses it moves
// on (another machine lights up).
const FIZZ_COST = 1500;
// Co-op: the machine (where it is, its spin) is shared; the perk is the buyer's (their own missing perks, sent with the
// purchase); the host lets an untaken spin lapse and moves it with the shared random stream.
function setupFizz(api) {
  const { world, session, host, scene, toast, announce, audio, sync } = api, root = world.root;
  const machines = []; root.traverse(o => { if (/^CASTLE_FIZZ_\d+$/.test(o.name)) machines.push({ o, p: o.getWorldPosition(new THREE.Vector3()), start: !!o.userData.start }); });
  if (!machines.length) { console.warn('[der-eisendrache] Wunderfizz missing (rebuild the map)'); return null; }
  const light = new THREE.PointLight(0x7ab8ff, 0, 260, 1.6); scene.add(light);
  const st = { at: 0, uses: 0, left: 4, spin: null };
  // the host picks the starting machine (an event: guests get it, late ones from the log)
  sync.on('fizzStart', d => { Object.assign(st, { at: d.at, uses: 0, left: d.left, spin: null }); });
  const pickStart = () => { st.spin = null; if (!sync.isHost) return; const s = machines.filter(m => m.start); sync.act('fizzStart', { at: machines.indexOf(s.length ? s[Math.floor(Math.random() * s.length)] : machines[0]), left: 3 + Math.floor(Math.random() * 4) }); };
  pickStart();
  const pool = () => PERKS.filter(p => !session.perks?.has(p.id) && perkUnlocked(p));
  const give = p => { if (api.perkInfo && !api.perkInfo[p.id]) api.perkInfo[p.id] = { name: p.name, price: p.price, color: p.color, icon: p.badge }; session.perks.add(p.id); session.markBought?.(p.id); session.health = session.maxHealth; };
  const byId = id => PERKS.find(p => p.id === id);
  sync.on('fizzBuy', (d, ctx) => { if (st.spin || !d.pool?.length) return; st.spin = { by: ctx.by, perk: byId(d.pool[Math.floor(ctx.rand() * d.pool.length)]), t: session.time, ready: false }; if (ctx.mine) audio?.play?.('box', .7); });
  sync.on('fizzTake', (d, ctx) => { if (!st.spin || st.spin.by !== ctx.by) return; if (ctx.mine) { give(st.spin.perk); audio?.play?.('perk', .8); toast?.(st.spin.perk.name, 3); } st.spin = null; if (++st.uses >= st.left) move(ctx.rand); });
  sync.on('fizzLapse', (d, ctx) => { if (!st.spin) return; st.spin = null; if (++st.uses >= st.left) move(ctx.rand); });
  for (const [i, m] of machines.entries()) world.addInteraction({
    position: m.p.clone().add(new THREE.Vector3(0, 45, 0)),
    hidden: () => i !== st.at,
    text: () => !session.power ? 'The power must be activated' : st.spin ? (st.spin.by !== sync.me ? 'Der Wunderfizz is in use' : st.spin.ready ? `Take ${st.spin.perk.name}` : 'Der Wunderfizz is spinning…') : pool().length ? `Der Wunderfizz · ${FIZZ_COST}` : 'You have every perk',
    use() {
      if (!session.power) return false;
      if (st.spin) { if (!st.spin.ready || st.spin.by !== sync.me) return false; sync.act('fizzTake'); return true; }
      const list = pool(); if (!list.length) return false;
      if (session.points < FIZZ_COST) { toast?.('Not enough points', 2); return false; }
      session.points -= FIZZ_COST; sync.act('fizzBuy', { pool: list.map(p => p.id) });
      return true;
    },
  });
  function move(rand = Math.random) { let n = st.at; while (machines.length > 1 && n === st.at) n = Math.floor(rand() * machines.length); st.at = n; st.uses = 0; st.left = 3 + Math.floor(rand() * 4); announce?.('DER WUNDERFIZZ', 'HAS MOVED', 3); }
  host.on('update', () => {
    const m = machines[st.at]; light.position.copy(m.p).add(new THREE.Vector3(0, 80, 0));
    light.intensity = session.power ? (st.spin && !st.spin.ready ? 2600 + Math.sin(session.time * 20) * 900 : 1400) : 0;
    if (st.spin && !st.spin.ready && session.time - st.spin.t > 3) { st.spin.ready = true; if (st.spin.by === sync.me) toast?.(`Der Wunderfizz · ${st.spin.perk.name}`, 3); }
    if (st.spin?.ready && session.time - st.spin.t > 13 && sync.isHost && !st.spin.lapsing) { st.spin.lapsing = true; sync.act('fizzLapse'); }   // not taken in time
  });
  host.on('reset', pickStart);
  return { state: () => ({ at: st.at, uses: st.uses, left: st.left, spin: st.spin ? { perk: st.spin.perk.id, ready: st.spin.ready } : null, machines: machines.length }) };
}

// ---- Traps.
//   Death Ray (zm_castle_death_ray_trap.gsc): the lever on the rooftop (CASTLE_DEATHRAY), 1000, power. For 15 s the two
//   Tesla coils (CASTLE_BOLT_<n>) strike every zombie in the coil zone (CASTLE_TESLAZONE, ~380 x 130 around it): killed
//   by lightning; a player in the zone loses a quarter of their max health every 2 s. Cooldown 60 s or to the round's end.
//   Masher (zm_castle_masher_trap.gsc): three buttons (CASTLE_MASHBTN_<n>), 1500, power and the masher gate bought (the
//   gatehouse door: connect_gatehouse_to_lowercourtyard). For 20 s the gate slams down (116 in 0.25 s, back up, 0.25 s
//   pause), crushing whatever is under it (CASTLE_MASHZONE). Cooldown 60 s.
//   Rocket test fire (zm_castle_rocket_trap.gsc): not bought. 60 s after the teleporter is first used, then every 30-240
//   s (later 90-300): 7 s of warning, 3 s more, then 20 s of exhaust that kills anything on the pad (CASTLE_ROCKETBLAST,
//   radius 430, and the ring of CASTLE_ROCKETFLAME_ vents); the teleporter is locked meanwhile.
// Co-op: switching a trap on is an event (the switcher pays); its kills run on the host, each player takes its damage
// on their own client; the host schedules the rocket's test fires (its state goes to everyone).
function setupTraps(api) {
  const { world, session, host, scene, enemies, player, toast, announce, audio, damage, sync } = api, root = world.root;
  const at = n => { const o = root.getObjectByName(n); return o ? o.getWorldPosition(new THREE.Vector3()) : null; };
  const fx = [];
  const boltMat = new THREE.LineBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: .95, blending: THREE.AdditiveBlending });
  function bolt(a, b) {   // a jagged lightning line, gone in a tenth of a second
    const pts = [a.clone()], n = 9;
    for (let i = 1; i < n; i++) { const t = i / n; pts.push(a.clone().lerp(b, t).add(new THREE.Vector3((Math.random() - .5) * 40, (Math.random() - .5) * 40, (Math.random() - .5) * 40))); }
    pts.push(b.clone()); const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), boltMat); scene.add(l); fx.push({ o: l, life: .1 });
  }
  const flameMat = new THREE.SpriteMaterial({ color: 0xff8a2a, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false });
  const feet = () => player.getFeetPosition();
  // Death Ray
  const lever = at('CASTLE_DEATHRAY'), zone = at('CASTLE_TESLAZONE'), bolts = [at('CASTLE_BOLT_0'), at('CASTLE_BOLT_1')].filter(Boolean);
  const ray = { on: 0, cool: 0, hurtAt: 0 };
  const inTesla = p => zone && Math.abs(p.x - zone.x) < 380 && Math.abs(p.z - zone.z) < 130 && p.y > zone.y - 140 && p.y < zone.y + 160;
  if (lever && zone && bolts.length) world.addInteraction({
    position: lever, text: () => !session.power ? 'The power must be activated' : ray.on > session.time ? '' : ray.cool > session.time ? 'The Death Ray is cooling down' : 'Activate the Death Ray · 1000',
    use() { if (!session.power || ray.on > session.time || ray.cool > session.time) return false; if (session.points < 1000) { toast?.('Not enough points', 2); return false; }
      session.points -= 1000; sync.act('rayOn'); return true; },
  });
  sync.on('rayOn', () => { if (ray.on > session.time) return; ray.on = session.time + 15; ray.cool = ray.on + 60; audio?.play?.('buy'); announce?.('DEATH RAY', '', 2); });
  host.on('roundEnd', () => { if (ray.on < session.time) ray.cool = 0; });
  // Masher
  const btns = []; root.traverse(o => { if (/^CASTLE_MASHBTN_\d+$/.test(o.name)) btns.push(o.getWorldPosition(new THREE.Vector3())); });
  const mashZone = at('CASTLE_MASHZONE'), mashDoor = [...world.doors.values()].find(d => /connectgatehousetolowercourtyard/.test(d.name));
  const mash = { on: 0, cool: 0, t: 0 };
  const gate = mashDoor?.parts?.[0]?.slides?.[0];
  for (const b of btns) world.addInteraction({
    position: b, text: () => !session.power ? 'The power must be activated' : !(mashDoor && world.isOpen(mashDoor, session)) ? 'Open the gate to use the masher' : mash.on > session.time ? '' : mash.cool > session.time ? 'The masher is cooling down' : 'Activate the masher · 1500',
    use() { if (!session.power || !(mashDoor && world.isOpen(mashDoor, session)) || mash.on > session.time || mash.cool > session.time) return false;
      if (session.points < 1500) { toast?.('Not enough points', 2); return false; }
      session.points -= 1500; sync.act('mashOn'); return true; },
  });
  sync.on('mashOn', () => { if (mash.on > session.time) return; mash.on = session.time + 20; mash.cool = mash.on + 60; mash.t = 0; audio?.play?.('buy'); });
  // Rocket test fire
  const blast = at('CASTLE_ROCKETBLAST'), vents = []; root.traverse(o => { if (/^CASTLE_ROCKETFLAME_\d+$/.test(o.name)) vents.push(o.getWorldPosition(new THREE.Vector3())); });
  const rocket = { armed: null, next: null, phase: null, t0: 0 }, tp = world.teleporters?.find(t => t.name === 'rocketpad');
  const rocketLight = new THREE.PointLight(0xff7a2a, 0, 1600, 1.4); if (blast) { rocketLight.position.copy(blast).add(new THREE.Vector3(0, 200, 0)); scene.add(rocketLight); }
  const onPad = p => blast && (Math.hypot(p.x - blast.x, p.z - blast.z) < 430 || vents.some(v => Math.hypot(p.x - v.x, p.z - v.z) < 90)) && Math.abs(p.y - blast.y) < 260;
  let zap = 0;
  host.on('update', dt => {
    dt = dt || 1 / 60; const now = session.time;
    for (const f of [...fx]) { f.life -= dt; if (f.v) { f.o.position.addScaledVector(f.v, dt); f.o.scale.setScalar(f.o.scale.x + 120 * dt); f.o.material.opacity = Math.max(0, f.life / .7) * .85; } if (f.life <= 0) { f.o.removeFromParent(); fx.splice(fx.indexOf(f), 1); } }
    // death ray
    if (ray.on > now) {
      zap -= dt;
      if (zap <= 0) { zap = .12;
        for (const z of [...enemies.list]) { const p = z.root.position; if (!inTesla(p)) continue; const src = bolts[Math.floor(Math.random() * bolts.length)]; bolt(src, p.clone().add(new THREE.Vector3(0, 45, 0))); if (sync.isHost) enemies.hurt(z, z.kind === 'panzer' ? 2000 : 1e9, false, false, 'electric'); }
        if (Math.random() < .5) bolt(bolts[0], bolts[bolts.length - 1]);
      }
      const f = feet(); if (inTesla(f) && now - ray.hurtAt > 2) { ray.hurtAt = now; bolt(bolts[0], f.clone().add(new THREE.Vector3(0, 40, 0))); damage(session.maxHealth / 4); audio?.play?.('teslaHit'); }
    }
    // masher: down 0.25 s, up 0.25 s, 0.25 s pause
    if (gate && mash.on > now) {
      mash.t = (mash.t + dt) % .75; const k = mash.t < .25 ? mash.t / .25 : mash.t < .5 ? 1 - (mash.t - .25) / .25 : 0;
      mashDoor.parts[0].object.visible = gate.object.visible = true; gate.object.position.copy(gate.base).addScaledVector(gate.move, 1 - k); gate.object.updateMatrixWorld(true);
      if (k > .85 && mashZone) {
        if (sync.isHost) for (const z of [...enemies.list]) { const p = z.root.position; if (Math.abs(p.x - mashZone.x) < 70 && Math.abs(p.z - mashZone.z) < 45 && Math.abs(p.y - (mashZone.y - 90)) < 120) enemies.hurt(z, z.kind === 'panzer' ? 3000 : 1e9, false, false, 'explosion'); }
        const f = feet(); if (Math.abs(f.x - mashZone.x) < 60 && Math.abs(f.z - mashZone.z) < 35 && Math.abs(f.y - (mashZone.y - 90)) < 100) damage(session.maxHealth);
      }
    } else if (gate && mash.on && mash.on <= now) { gate.object.position.copy(gate.base).add(gate.move); gate.object.updateMatrixWorld(true); mashDoor.parts[0].object.visible = false; mash.on = 0; }
    // rocket
    if (!blast) return;
    if (sync.isHost && rocket.next == null && session.flags.has('castle:flag:castleteleporterused')) rocket.next = now + 60 + 30 + Math.random() * 210;
    if (sync.isHost && rocket.phase == null && rocket.next != null && now >= rocket.next) { rocket.phase = 'warn'; rocket.t0 = now; }
    if (rocket.phase && !rocket.warned) { rocket.warned = true; if (tp) tp.locked = true; announce?.('ROCKET TEST FIRE', 'CLEAR THE LAUNCH PAD', 4); audio?.play?.('dog_round', .6); }
    if (rocket.phase) {
      const t = now - rocket.t0;
      rocket.phase = t >= 10 ? 'fire' : 'warn';
      if (t >= 10 && t < 30) {
        rocketLight.intensity = 9000 + Math.random() * 3000;
        if (Math.random() < .7) for (const v of [blast, ...vents]) { const sp = new THREE.Sprite(flameMat); sp.position.copy(v).add(new THREE.Vector3((Math.random() - .5) * 60, 20, (Math.random() - .5) * 60)); sp.scale.setScalar(70); scene.add(sp); fx.push({ o: sp, v: new THREE.Vector3((Math.random() - .5) * 60, 260 + Math.random() * 200, (Math.random() - .5) * 60), life: .7 }); }
        if (sync.isHost) for (const z of [...enemies.list]) if (onPad(z.root.position)) enemies.hurt(z, z.kind === 'panzer' ? 1500 * dt : 1e9, false, false, 'fire');
        if (onPad(feet())) damage(session.maxHealth * 2 * dt);
      } else rocketLight.intensity = 0;
      if (t >= 30 && sync.isHost) { rocket.phase = null; rocket.next = now + 90 + Math.random() * 210; }
    }
    if (!rocket.phase && rocket.warned) { rocket.warned = false; if (tp) tp.locked = false; }
  });
  // the rocket: the host's schedule
  sync.shared('rocket', () => ({ next: rocket.next == null ? null : rocket.next - session.time, phase: rocket.phase, t: rocket.phase ? session.time - rocket.t0 : 0 }),
    s => { rocket.next = s.next == null ? null : session.time + s.next; if (s.phase) { if (!rocket.phase) rocket.t0 = session.time - s.t; rocket.phase = s.phase; } else rocket.phase = null; });
  host.on('reset', () => { ray.on = ray.cool = 0; mash.on = mash.cool = 0; rocket.next = rocket.phase = null; rocket.warned = false; rocketLight.intensity = 0; if (tp) tp.locked = false; for (const f of fx) f.o.removeFromParent(); fx.length = 0; });
  return { state: () => ({ ray: { on: ray.on > session.time, cool: Math.max(0, Math.round(ray.cool - session.time)) }, mash: { on: mash.on > session.time, gate: !!gate, buttons: btns.length }, rocket: { next: rocket.next && Math.round(rocket.next - session.time), phase: rocket.phase } }),
    fireRocket: () => { rocket.next = session.time; } };
}

// ---- Out of bounds (2026-10-17). BO3 rings the castle with kill triggers below its walls and over the valley; the
// port's outer edges are open drops (the collision stops at the playable area). A player who falls out of the castle
// comes back to where they last stood on the navmesh a few seconds earlier, with a share of their health gone, instead
// of falling for ever (BO3 downs you outright; solo that would be the game).
function setupBounds({ world, player, host, session, damage, toast, audio }, { lowgrav }) {
  const safe = [];   // grounded navmesh spots, one every 0.5 s, the last 8 (~4 s back: before the step off the edge)
  let t = 0, air = 0, flying = false, fallen = 0;
  const pre = world.prePlayer; world.prePlayer = dt => (flying = !!pre?.(dt));   // the landing pads' flights
  const floor = (world.bounds?.min.y ?? 0) - 200;
  host.on('update', dt => {
    if (!dt || session.phase === 'gameover' || session.phase === 'preparing') return;
    const feet = player.getFeetPosition();
    if (flying) { air = 0; return; }
    if (player.onFloor) {
      air = 0;
      if ((t += dt) >= .5) { t = 0; const p = world.closest(feet, { x: 40, y: 80, z: 40 }); if (p && Math.abs(p.y - feet.y) < 60 && p.distanceTo(feet) < 56) { safe.push(feet.clone()); if (safe.length > 8) safe.shift(); } }
    } else air += dt;
    // a long free fall (low gravity jumps last ~1.2 s, a wall-run holds you level) or well under the lowest floor
    const slow = lowgrav?.state?.().inside;
    const lost = feet.y < floor || (air > (slow ? 5 : 3.2) && player.velocity.y < -700);
    if (!lost || !safe.length) return;
    const back = safe[0];
    player.setPosition(back.clone().add(new THREE.Vector3(0, 4, 0))); player.velocity.set(0, 0, 0); air = 0; safe.length = 0; safe.push(back);
    damage(Math.round(session.maxHealth * .45)); toast('You fell from the castle', 3);
    fallen++;
  });
  host.on('reset', () => { safe.length = 0; air = 0; t = 0; });
  return { state: () => ({ safe: safe.length, air: Math.round(air * 10) / 10, floor, fallen }) };
}
