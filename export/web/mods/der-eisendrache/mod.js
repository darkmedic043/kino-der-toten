// Der Eisendrache (a BO3 map ported by .tools/build_bo3_map.py; see docs/fork/waw-ports.md). Does nothing elsewhere.
import * as THREE from 'three';
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
  const gondola = setupGondola(api), pads = setupPads(api), pap = setupPap(api);
  setupRocketPad(api); setupDogRounds(api);
  window.kino ??= {}; window.kino.castle = { flags: () => [...flags(session)], zones: () => [...world.activeZones(session)], gondola, pads, pap };
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
  const gates = []; root.traverse(o => { if (o.name === 'CASTLE_TRAMGATE' && o.userData.open) gates.push({ o, shut: o.getWorldPosition(new THREE.Vector3()), open: new THREE.Vector3(...o.userData.open) }); });
  // the fuse: a glowing cylinder (BO3's fuse model wasn't exported)
  const fuseMesh = new THREE.Group();
  fuseMesh.add(new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 14, 12), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: .6, roughness: .4 })));
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 10, 12), new THREE.MeshBasicMaterial({ color: 0x66ccff })); glow.scale.set(1.05, 1, 1.05); fuseMesh.add(glow);
  fuseMesh.rotation.z = Math.PI / 2; fuseMesh.visible = false; api.scene.add(fuseMesh);
  const st = { phase: 'intro', t0: 0, fuseOnGround: false, held: false, item: null, gate: 0, ray: false };
  const phase = (p) => { st.phase = p; st.t0 = session.time; };
  const placeFuse = p => { fuseMesh.position.copy(p).y += 30; fuseMesh.visible = true; st.fuseOnGround = true; };
  const reset = () => {
    Object.assign(st, { phase: 'intro', t0: 0, fuseOnGround: false, held: false, item: null, gate: 0, started: false });
    fuseMesh.visible = false; car1.pose('called_a', 99); car2.pose('start', 0); setGates(0);
  };
  const setGates = k => { st.gate = k; for (const g of gates) moveNode(g.o, g.shut.clone().lerp(g.open, k)); };
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
        const away = !inside || feet.distanceTo(inside) > 90;
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
const POOL = 10, LAMP = { color: 0xffb877, on: 2600, off: 1700, range: 600, decay: 1.4 };
function setupLook({ scene, world, session, host, camera }) {
  const kids = scene.children;
  const ambient = kids.find(o => o.isAmbientLight), hemi = kids.find(o => o.isHemisphereLight);
  const [key, fill] = kids.filter(o => o.isDirectionalLight && !o.castShadow).sort((a, b) => b.intensity - a.intensity);
  const lamps = []; world.root?.traverse(o => { if (/^CASTLE_LAMP_/.test(o.name)) lamps.push(o.getWorldPosition(new THREE.Vector3())); });
  const pool = Array.from({ length: Math.min(POOL, lamps.length) }, () => { const l = new THREE.PointLight(LAMP.color, 0, LAMP.range, LAMP.decay); l.position.set(0, -1e5, 0); scene.add(l); return l; });
  let last = performance.now(), timer = 0;
  host.on('update', () => {
    const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now;
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
    parts[k] = []; root.traverse(o => { if (o.name === 'CASTLE_PAPPART_' + k) parts[k].push(o); });
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
