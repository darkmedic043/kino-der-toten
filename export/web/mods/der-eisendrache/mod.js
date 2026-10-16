// Der Eisendrache (a BO3 map ported by .tools/build_bo3_map.py; see docs/fork/waw-ports.md). Does nothing elsewhere.
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { CollisionWorld } from '../../collision-world.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
// Zones: BO3's zone manager links pairs of zones by a flag (zm_castle_zones.gsc add_adjacent_zone) and some flags set
// others (add_zone_flags). The build gives every door and debris pile its whole flag as its zone
// (connect_start_to_subclocktower -> connectstarttosubclocktower) and every spawner its BO3 zone without underscores;
// world.activeZones is replaced here: an open door sets its flag, the power sets power_on and opens the electric doors
// (connect_start_to_undercroft has no pieces in the map, so the power sets it here), and both zones of every pair whose
// flag is set are active.
const ADJ = [["v10pad","v10paddoor","castleteleporterused"],["v10paddoor","v10padexterior","castleteleporterused"],["start","tramhigh","alwayson"],["start","tramtogatehouse","connectstarttotram2gatehouse"],["tramhigh","tramtosubclocktowerbot","connectstarttosubclocktower"],["tramhigh","undercroftjail","connectstarttoundercroft"],["tramtosubclocktower","tramtosubclocktowertop","activatetramtosubclocktower"],["tramtosubclocktower","tramtosubclocktowerbot","activatetramtosubclocktower"],["tramtosubclocktowertop","courtyard","connectsubclocktowertocourtyard"],["clocktower","courtyardedge","activatecourtyard"],["clocktower","clocktowerrooftop","activatecourtyard"],["courtyard","courtyardedge","activatecourtyard"],["courtyard","clocktowerrooftop","activatecourtyard"],["courtyard","greathall","connectgreathalltocourtyard"],["courtyardedge","greathallupperleft","connectcourtyardtogreathallupper"],["courtyard","greathallupper","connectcourtyardtogreathallupper"],["gatehouse","lowergatehouse","buyabledropdowngatehousetolowercourtyard"],["tramtogatehouse","lowergatehouse","connectgatehousearea"],["gatehouse","lowercourtyardupper","connectlowercourtyard"],["lowercourtyard","lowercourtyardupper","connectlowercourtyard"],["lowercourtyardupper","ramparts","poweron"],["lowercourtyard","lowergatehouse","connectgatehousetolowercourtyard"],["lowercourtyardupper","livingquarters","connectlowercourtyardtolivingquarters"],["lowercourtyardupper","lowercourtyardback","connectlowercourtyard"],["lowercourtyard","lowercourtyardback","connectlowercourtyard"],["lowercourtyardback","undercroftpaphall","connectlowercourtyardtoundercroft"],["greathallupper","armory","connectgreathalltoarmory"],["greathall","greathallupperleft","activategreathall"],["greathall","greathallupper","activategreathall"],["armory","armoryback","activatearmory"],["armory","livingquarters","connectarmorytolivingquarters"],["rooftop","ramparts","poweron"],["rooftop","clocktowerrooftop","poweron"],["rooftop","armoryback","poweron"],["undercroftchapel","greathall","connectgreathalltoundercroft"],["undercroft","undercroftlab","connectundercrofttoundercroftlab"],["undercroft","undercroftchapel","activateundercroft"],["undercroft","undercroftjail","activateundercroft"],["undercroft","undercroftpap","activateundercroft"],["undercroftjail","undercroftpap","activateundercroft"],["undercroftpap","undercroftpaphall","activateundercroft"]];
const DERIVED = {"activatecourtyard":["connectsubclocktowertocourtyard","connectcourtyardtogreathallupper","connectcourtyardtorooftop","connectgreathalltocourtyard","connectarmorytorooftop"],"activatetramtosubclocktower":["connectstarttosubclocktower","connectsubclocktowertocourtyard"],"connectgatehousearea":["connectstarttotram2gatehouse","connectgatehousetolowercourtyard","buyabledropdowngatehousetolowercourtyard"],"connectlowercourtyard":["connectgatehousetolowercourtyard","connectlowercourtyardtolivingquarters","connectlowercoutryardtorooftop","connectlowercourtyardtoundercroft"],"activategreathall":["connectgreathalltoarmory","connectgreathalltoundercroft","connectcourtyardtogreathallupper"],"activatearmory":["connectarmorytolivingquarters","connectgreathalltoarmory"],"activateundercroft":["connectlowercourtyardtoundercroft","connectgreathalltoundercroft"]};
const POWER_FLAGS = ['poweron', 'connectstarttoundercroft'];

export default function setup(api) {
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
  setupLook(api);
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
  const gondola = setupGondola(api), pads = setupPads(api), pap = setupPap(api), bow = setupBow(api);
  setupRocketPad(api); setupDogRounds(api);
  window.kino ??= {}; window.kino.castle = { flags: () => [...flags(session)], zones: () => [...world.activeZones(session)], gondola, pads, pap, bow };
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
function setupGondola(api) {
  const { world, session, host, player, toast, announce, audio } = api, root = world.root;
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
  const st = { phase: 'intro', t0: 0, fuseOnGround: false, held: false, item: null, gate: 0, ray: false };
  const phase = (p) => { st.phase = p; st.t0 = session.time; };
  const placeFuse = p => { fuseMesh.position.copy(p).y += 30; fuseMesh.visible = true; st.fuseOnGround = true; };
  const reset = () => {
    Object.assign(st, { phase: 'intro', t0: 0, fuseOnGround: false, held: false, item: null, gate: 0, started: false });
    fuseMesh.visible = false; car1.pose('called_a', 99); car2.pose('start', 0); setGates(0);
  };
  const setGates = k => { st.gate = k; for (const g of gates) { const p = g.shut.clone().lerp(g.open, k); moveNode(g.o, p); g.col?.move(p.sub(g.shut)); } };
  function reward() {
    const r = Math.floor(Math.random() * 100), round = session.round ?? 1;
    if (r === 1 && round >= 5) { session.giveWeapon?.('ray_gun_zm'); announce?.('THE GONDOLA', 'RAY GUN', 3); return null; }
    if (r <= 20 && round >= 5) {
      if (Math.random() < .5) return api.powerups?.spawn('fire_sale', drop);
      session.points += 500; toast?.('Gondola · +500 bonus points', 3); return null;
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
      st.held = false; audio?.play?.('buy'); toast?.('Gondola called', 2); phase('arriving'); return true;
    },
  });
  host.on('kill', ({ enemy }) => {
    if (st.fuseOnGround || st.held || Math.random() > FUSE_DROP || !enemy?.root) return;
    placeFuse(enemy.root.position.clone());
  });
  host.on('update', () => {
    const t = session.time - st.t0;
    if (fuseMesh.visible) {
      fuseMesh.rotation.y += .03; fuseMesh.position.y += Math.sin(session.time * 3) * .05;
      const feet = player.getFeetPosition();
      if (Math.hypot(feet.x - fuseMesh.position.x, feet.z - fuseMesh.position.z) < FUSE_PICKUP && Math.abs(feet.y + 30 - fuseMesh.position.y) < 80) {
        fuseMesh.visible = false; st.fuseOnGround = false; st.held = true; audio?.play?.('powerup'); toast?.('Fuse · take it to the gondola console', 3);
      }
    }
    switch (st.phase) {
      case 'intro':
        if (!st.started) { st.started = true; st.t0 = session.time; if (tokenAt) placeFuse(tokenAt); return; }   // the first fuse waits at the station
        if (t < 12) return;
        car1.pose('return_a', t - 12); car2.pose('start', t - 12);
        if (t - 12 >= Math.max(car1.length('return_a'), car2.length('start'))) phase('cooldown');
        return;
      case 'arriving':
        car2.pose('called_a', t); car1.pose('called_b', t);
        if (t >= car2.length('called_a')) { phase('docked'); st.item = reward(); }
        return;
      case 'docked': {
        if (st.gate < 1) setGates(Math.min(1, t / 1.5));
        const items = api.powerups?.items ?? [], feet = player.getFeetPosition();
        // nobody in the car (its whole docked box, as BO3's docked_tram_car_interior volume; zombies too)
        const box = carBox?.(), occupied = p => box ? box.containsPoint(p) : p.distanceTo(inside) < 90;
        const away = !inside || (!occupied(feet.clone().setY(feet.y + 30)) && !(api.enemies?.list ?? []).some(z => occupied(z.root.position.clone().setY(z.root.position.y + 30))));
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
  return { state: () => ({ ...st, item: !!st.item }), giveFuse: () => { st.held = true; } };
}

// ---- Landing pads (zm_castle_flingers.gsc). Switch a landing pad on (free; its model turns blue), then its launch pad
// flings whoever stands on it for 500 points along BO3's flight path (Catmull-Rom through the vehicle nodes, at their
// speeds) to the landing pad; zombies on the launch pad are thrown off (killed), as are those on the landing pad when
// you land. 15 s before the launch pad works again.
const PAD_COST = 500, PAD_COOLDOWN = 15, PAD_RADIUS = 64;
function setupPads(api) {
  const { world, session, host, player, toast, audio, enemies } = api, root = world.root;
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
  const killNear = (c, r) => { for (const z of [...enemies.list]) if (z.root.position.distanceTo(c) < r) enemies.hurt(z, 1e9, false, false, 'explosive'); };
  for (const p of pads) {
    if (p.landing) world.addInteraction({
      position: p.landing.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 30, 0)),
      hidden: () => active(p),
      text: () => 'Activate the landing pad',
      use() { session.flags.add('castle:pad:' + p.flag); show(); audio?.play?.('buy'); toast?.('Landing pad activated', 2); return true; },
    });
    world.addInteraction({
      position: p.volume.clone(),
      hidden: () => !active(p),
      text: () => flight ? 'In flight' : session.time < p.readyAt ? 'The launch pad is recharging' : `Launch · ${PAD_COST}`,
      use() {
        if (flight || session.time < p.readyAt || !active(p)) return false;
        if (session.points < PAD_COST) { toast?.('Not enough points', 2); return false; }
        session.points -= PAD_COST; p.readyAt = session.time + PAD_COOLDOWN;
        killNear(p.volume, PAD_RADIUS + 20); audio?.play?.('teleport');
        flight = { pad: p, d: 0 }; if (api.features) api.features.flight = true;
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
      player.setPosition(spot.clone().add(new THREE.Vector3(0, 2, 0))); killNear(spot, 90);
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
const POOL = 6, LAMP = { color: 0xffb877, on: 2600, off: 1700, range: 600, decay: 1.4 };   // 6: each point light is paid per pixel on every material (10 cost ~5 FPS)
function setupLook({ scene, world, session, host, camera }) {
  const kids = scene.children;
  const ambient = kids.find(o => o.isAmbientLight), hemi = kids.find(o => o.isHemisphereLight);
  const [key, fill] = kids.filter(o => o.isDirectionalLight && !o.castShadow).sort((a, b) => b.intensity - a.intensity);
  const lamps = []; world.root?.traverse(o => { if (/^CASTLE_LAMP_/.test(o.name)) lamps.push(o.getWorldPosition(new THREE.Vector3())); });
  const pool = Array.from({ length: Math.min(POOL, lamps.length) }, () => { const l = new THREE.PointLight(LAMP.color, 0, LAMP.range, LAMP.decay); l.position.set(0, -1e5, 0); scene.add(l); return l; });
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
  const SKY_GAIN = 3.2, dir = world.entry?.dir ?? 'mods/maps/der-eisendrache/';
  // sampled per pixel by view direction on the sky sphere (BO3's 96-vertex box interpolated its UVs linearly and warped
  // it, user; an equirectangular scene.background turned every map material white here)
  if (!/[?&]noSky/.test(location.search)) new THREE.TextureLoader().loadAsync(dir + 'sky/skybox.webp').then(tex => {
    tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.wrapS = THREE.RepeatWrapping;
    sky.material = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { map: { value: tex }, gain: { value: SKY_GAIN } },
      vertexShader: sky.material.vertexShader,
      fragmentShader: `uniform sampler2D map; uniform float gain; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); vec2 uv = vec2(atan(d.x, -d.z) / 6.2831853 + 0.5, 1.0 - acos(clamp(d.y, -1.0, 1.0)) / 3.1415927);
          gl_FragColor = vec4(texture2D(map, uv).rgb * gain, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    if (scene.fog) scene.fog.color.set(0x5d6f8c); scene.background = new THREE.Color(0x5d6f8c);
  }).catch(() => {});
  let skyModel = null;
  if (scene.fog) scene.fog.color.copy(HORIZON);
  scene.background = HORIZON.clone();
  let last = performance.now(), timer = 0;
  host.on('update', () => {
    const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now;
    sky.position.copy(camera.position); if (sky.material.uniforms.time) sky.material.uniforms.time.value += dt; skyModel?.position.copy(camera.position);
    if (ambient) { ambient.color.setHex(0xa4afc0); ambient.intensity = .95; }
    if (hemi) { hemi.color.setHex(0xe2e9f3); hemi.groundColor.setHex(0x625a50); hemi.intensity = 1.15; }
    if (key) { key.color.setHex(0xfff2e0); key.intensity = 1.5; key.position.set(.45, 1, .3); }
    if (fill) { fill.color.setHex(0x8da2c2); fill.intensity = .45; }
    if ((timer -= dt) <= 0 && pool.length) {
      timer = .5;
      const eye = camera.position, near = lamps.map(p => ({ p, d: p.distanceToSquared(eye) })).sort((a, b) => a.d - b.d).slice(0, pool.length);
      const free = pool.filter(l => !near.some(n => n.p.equals(l.position)));
      for (const n of near) if (!pool.some(l => l.position.equals(n.p))) { const l = free.shift(); if (l) { l.position.copy(n.p); l.intensity = 0; } }
    }
    const want = session.power ? LAMP.on : LAMP.off;
    for (const l of pool) l.intensity += (want - l.intensity) * Math.min(1, dt * 2.5);
  });
}

// ---- Pack-a-Punch (zm_castle_pap_quest.gsc). The machine starts hidden (the PAP marker is BO3's storage spot under the
// map). Activate two of its three spots (undercroft, rocket pad, roof: CASTLE_PAPTP_<spot>; their scattered parts,
// CASTLE_PAPPART_<spot>, fly off); it re-forms at the third (CASTLE_PAPLOC_<spot>) once you look at it from within 400.
// After its first use it moves on to the next spot every 2-3 rounds (at the end of a round, never mid-upgrade).
const PAP_ORDER = ['under', 'rocket', 'roof'], PAP_NAME = { under: 'the undercroft', rocket: 'the rocket pad', roof: 'the rooftop' };
function setupPap(api) {
  const { world, session, host, player, camera, toast, announce, audio } = api, root = world.root;
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
  for (const k of PAP_ORDER) if (tps[k]) world.addInteraction({
    position: tps[k],
    hidden: () => st.active.has(k) || st.reformAt != null,
    text: () => 'Activate the Pack-a-Punch',
    use() {
      st.active.add(k); showParts(k, false); audio?.play?.('teleport', .6);
      if (st.active.size >= 2) {
        st.reformAt = PAP_ORDER.find(x => !st.active.has(x));
        announce?.('PACK-A-PUNCH', `RE-FORMING AT ${PAP_NAME[st.reformAt].toUpperCase()}`, 4);
      } else toast?.('Pack-a-Punch part sent away · one more', 3);
      return true;
    },
  });
  const look = new THREE.Vector3(), to = new THREE.Vector3();
  host.on('update', () => {
    if (!st.reformed) machineVisible(false);
    if (st.reformAt && !st.reformed) {
      const l = locs[st.reformAt], feet = player.getFeetPosition();
      camera.getWorldDirection(look); to.copy(l.pos).add(new THREE.Vector3(0, 50, 0)).sub(camera.position).normalize();
      if (feet.distanceTo(l.pos) < 400 && look.dot(to) > Math.cos(Math.PI / 4)) {
        st.reformed = true; showParts(st.reformAt, false); place(st.reformAt); world.papLocked = false;
        audio?.play?.('teleport'); announce?.('PACK-A-PUNCH', 'RE-FORMED', 3);
      }
    }
    if (st.reformed && !st.used && session.pack) { st.used = true; st.nextMove = (session.round ?? 1) + 2 + Math.floor(Math.random() * 2); }
  });
  host.on('roundEnd', () => {
    if (!st.used || session.pack || (session.round ?? 0) < st.nextMove) return;
    const next = PAP_ORDER[(PAP_ORDER.indexOf(st.at) + 1) % 3];
    place(next); st.nextMove = (session.round ?? 1) + 2 + Math.floor(Math.random() * 2);
    toast?.(`Pack-a-Punch moved to ${PAP_NAME[next]}`, 4);
  });
  host.on('reset', reset);
  reset();
  return { state: () => ({ active: [...st.active], reformAt: st.reformAt, reformed: st.reformed, at: st.at, nextMove: st.nextMove }) };
}

// ---- The rocket pad: its zones open once someone has taken the teleporter (castle_teleporter_used)
function setupRocketPad({ world, session, host, player }) {
  const tp = world.teleporters?.find(t => t.name === 'rocketpad'), dest = tp?.to?.position;
  if (!dest) { console.warn('[der-eisendrache] rocket pad teleporter missing (rebuild the map)'); return; }
  host.on('update', () => { if (!session.flags.has('castle:flag:castleteleporterused') && player.getFeetPosition().distanceTo(dest) < 900) session.flags.add('castle:flag:castleteleporterused'); });
}

// ---- Dog rounds as zm_castle_dogs.gsc: the first 4-5 rounds in, then every 7-13 rounds
function setupDogRounds({ session, host }) {
  let seen = 0;
  const first = () => { session.nextDogRound = 1 + 4 + Math.floor(Math.random() * 2); seen = 0; };
  host.on('reset', first); first();
  host.on('update', () => { if (session.dogRound && session.round !== seen) { seen = session.round; session.nextDogRound = session.round + 7 + Math.floor(Math.random() * 7); } });
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
function setupBow(api) {
  const { world, session, host, toast, announce, audio, scene } = api, root = world.root;
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
  const taken = () => session.flags.has('castle:bow:taken'), charged = () => heads.every(h => h.n >= SOULS);
  const flying = [];
  host.on('kill', ({ enemy }) => {
    if (!enemy?.root) return;
    const p = enemy.root.position;
    const h = heads.find(h => h.n < SOULS && p.distanceTo(h.c) < h.r);
    if (!h) return;
    h.n++;
    // the soul: a glowing orb from the body into the mouth
    const orb = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff7a3a })); orb.position.copy(p).add(new THREE.Vector3(0, 40, 0)); scene.add(orb);
    flying.push({ orb, to: h.mouth.clone(), t: 0, from: orb.position.clone() });
    audio?.play?.('powerup', .5);
    if (h.n === SOULS) {
      const left = heads.filter(x => x.n < SOULS).length;
      announce?.('A DRAGON IS FED', left ? `${left} TO GO` : 'THE BOW AWAITS BEHIND THE CASTLE', 4);
      if (!left) shown.visible = true;
    }
  });
  world.addInteraction({ position: spot.clone().add(new THREE.Vector3(0, 30, 0)), hidden: () => !charged() || taken(), text: () => 'Take Wrath of the Ancients',
    use() { if (!def) return false; session.flags.add('castle:bow:taken'); session.giveWeapon(BOW); api.equipView?.(); shown.visible = false; announce?.('WRATH OF THE ANCIENTS', '', 3); audio?.play?.('box'); return true; } });
  let t = 0;
  host.on('update', dt => {
    dt = dt || 1 / 60; t += dt;
    for (const f of [...flying]) { f.t = Math.min(1, f.t + dt * 1.4); f.orb.position.lerpVectors(f.from, f.to, f.t).y += Math.sin(f.t * Math.PI) * 60; if (f.t >= 1) { f.orb.removeFromParent(); flying.splice(flying.indexOf(f), 1); } }
    if (shown.visible) { shown.rotation.y += dt * .6; shown.position.y = spot.y + 45 + Math.sin(t * 1.5) * 3; glow.intensity = 900 + Math.sin(t * 3) * 200; }
  });
  host.on('reset', () => { for (const h of heads) h.n = 0; shown.visible = false; for (const f of flying) f.orb.removeFromParent(); flying.length = 0; });
  return { state: () => ({ souls: heads.map(h => [h.id, h.n]), charged: charged(), taken: taken() }), feed: (k = 0) => { for (const h of heads) h.n = SOULS; shown.visible = true; } };
}
