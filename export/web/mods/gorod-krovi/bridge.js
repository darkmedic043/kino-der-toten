// The powered bridge (zm_stalingrad_powered_bridge.gsc, scratch/gk/spec/bridge.md): two drawbridge leaves over the gap
// between the Barracks (red brick, poweredbridgea) and the Armory (yellow, poweredbridgeb) sides. Normally raised; for
// 500 (power needed) they drop flat in 0.75 s, stay down about 6 s (the last 3 s shaking), then fling everyone on a leaf
// back to that leaf's bank on BO3's fake_physicslaunch arc (g 800, power 500 west / 400 east), kill the zombies on them,
// snap shut in 0.25 s and kill whatever is left in the gap. Usable again 12.9 s after the purchase.
// The leaves and the gate are brush models the build doesn't place, so they are stand-in boxes here (dark metal, made at
// setup, never added or removed mid-game). Collision: an invisible deck while flat, two invisible walls at the pivots
// while raised (scripted movers switched with `disabled`). Flags: activatebridge while open (spawning may use the bridge
// zones), and on the first use activateyellow / activateredbrick for good (BO3's add_zone_flags). gk events
// 'bridge:open' / 'bridge:closed'. Zombies: BO3's navmesh (map entry navFile, bo3-ports.md 1.7) runs across the gap, so
// the middle of the deck is switched off with world.navBlock while the leaves are up: zombies cross only while it is flat
// (the generated navmesh has no deck at all: there they never cross). v1 limits: no switch scene or machinery anim, the
// switch lamps are emissive boxes (no lights added).
// Co-op: solo-first (each client runs its own bridge). Debug: kino.gorod.bridge.{state, use, force(open)}.
import * as THREE from 'three';
import { makeSfx } from './dragon-sfx.js';

const W = (x, y, z) => new THREE.Vector3(x, z, -y);
const COST = 500, LEAF = 114, WIDE = 128, THICK = 8, Y0 = 3040, Y1 = 3168;
const PIVOT_L = -128, PIVOT_R = 100, MEET = -14;
const T_DOWN = .75, T_RUMBLE = 3.8, T_FLING = 6.8, T_UP = .25, T_GATE = 7.9, T_READY = 12.9;
const USES = [[-152, 3214, 368], [120, 3213, 368]], SWITCHES = [[-150, 3215, 372], [118, 3212, 373]];
const FLING = { left: { box: [-76, 3108], to: [-550, 3164, 358], power: 500 }, right: { box: [44, 3108], to: [280, 3086, 357], power: 400 } };
const HALF = [60, 64], G = 800;
const ease = k => k * k * (3 - 2 * k);

export default async function setupBridge(api, gk) {
  const { world, session, enemies, player, scene } = api, host = api.host;
  const sfx = makeSfx(api);
  const centre = W(-14, 3104, 364);

  // the banks' floor height: the deck lines up with it (BO3: deck about z 320-330)
  const floorAt = (x, y) => { if (!world.raycast) return null; const h = world.raycast(new THREE.Ray(W(x, y, 430), new THREE.Vector3(0, -1, 0)), 0, 250); return h ? 430 - h.distance : null; };
  const banks = [floorAt(PIVOT_L - 40, 3104), floorAt(PIVOT_R + 40, 3104)];
  const okBanks = banks.filter(z => z != null && z > 280 && z < 380);
  const TOP = okBanks.length ? okBanks.reduce((a, b) => a + b, 0) / okBanks.length : 324;

  // visuals: pivot groups at each leaf's outer edge; BO3's rotatepitch is a turn about three's z axis here
  const root = new THREE.Group(); root.name = 'gk_bridge'; root.userData.noMerge = true;
  const metal = new THREE.MeshStandardMaterial({ color: 0x47433d, roughness: .62, metalness: .75 });
  const rib = new THREE.MeshStandardMaterial({ color: 0x2c2a27, roughness: .7, metalness: .6 });
  const leaf = (pivotX, dir) => {
    const g = new THREE.Group(); g.position.copy(W(pivotX, 3104, TOP));
    const plate = new THREE.Mesh(new THREE.BoxGeometry(LEAF, THICK, WIDE - 4), metal); plate.position.set(dir * LEAF / 2, -THICK / 2, 0); g.add(plate);
    for (const z of [-WIDE / 2 + 6, 0, WIDE / 2 - 6]) { const r = new THREE.Mesh(new THREE.BoxGeometry(LEAF - 4, 6, 6), rib); r.position.set(dir * LEAF / 2, -THICK - 3, z); g.add(r); }
    g.userData.up = dir * Math.PI / 2; g.rotation.z = g.userData.up; root.add(g); return g;
  };
  const L = leaf(PIVOT_L, 1), R = leaf(PIVOT_R, -1);
  const gate = new THREE.Mesh(new THREE.BoxGeometry(16, 100, WIDE - 4), rib); gate.position.copy(W(MEET, 3104, 377)); root.add(gate);
  const gateUp = gate.position.y;
  const lampMat = on => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: on ? 0x22ff44 : 0xff2a1a, emissiveIntensity: 2.2 });
  const green = lampMat(true), red = lampMat(false);
  const lamps = SWITCHES.map(a => { const m = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), red); m.position.copy(W(a[0], a[1], a[2] + 26)); root.add(m); return m; });
  for (const o of [L, R]) for (const c of o.children) { c.castShadow = c.receiveShadow = true; }
  scene.add(root); root.updateMatrixWorld(true);

  // collision: an invisible deck (flat) and two walls (raised), never in the scene
  const box = (x0, x1, z0, z1) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, z1 - z0, Y1 - Y0)); m.position.copy(W((x0 + x1) / 2, (Y0 + Y1) / 2, (z0 + z1) / 2)); m.updateMatrixWorld(true); return m; };
  const deck = world.addScriptedMover?.([box(PIVOT_L, PIVOT_R, TOP - THICK, TOP)], { exact: true });
  const walls = world.addScriptedMover?.([box(PIVOT_L, PIVOT_L + THICK, TOP - THICK, TOP + LEAF), box(PIVOT_R - THICK, PIVOT_R, TOP - THICK, TOP + LEAF)], { exact: true });

  const B = { state: 'idle', t: 0, open: 0, first: !gk.hasFlag('activateyellow'), kills: 0, flung: null, landAt: 0, forced: null };
  const flat = () => B.forced ?? (B.state === 'run' && B.t >= T_DOWN && B.t < T_FLING + T_UP * .5);
  // the navmesh across the middle of the gap, off while raised (a strip: any path across has a polygon there)
  const gapNav = new THREE.Box3().setFromPoints([W(MEET - 20, Y0 - 8, TOP - 40), W(MEET + 20, Y1 + 8, TOP + 40)]);
  let navFlat = null;
  const setCollision = () => {
    const f = flat();
    if (deck) deck.disabled = !f; if (walls) walls.disabled = f;
    world.collision?.invalidateCache?.();
    if (f !== navFlat) { navFlat = f; world.navBlock?.('gk-bridge', f ? null : gapNav); }
  };
  const pose = (k, jitter = 0) => {   // k 0 = raised, 1 = flat
    for (const g of [L, R]) { g.rotation.z = g.userData.up * (1 - k); g.position.y = TOP + jitter; g.updateMatrix(); g.updateMatrixWorld(true); }
  };
  const gatePose = down => { gate.position.y = gateUp - (down ? 100 : 0); gate.updateMatrix(); gate.updateMatrixWorld(true); };
  const lampPose = on => { for (const m of lamps) m.material = on ? green : red; };   // material swap between two warmed materials
  pose(0); gatePose(false); lampPose(!!session.power); setCollision();

  const inLeaf = (p, side) => { const b = FLING[side].box; const x = p.x, y = -p.z, z = p.y; return Math.abs(x - b[0]) < HALF[0] && Math.abs(y - b[1]) < HALF[1] && z > 290 && z < 440; };
  const inGap = p => { const x = p.x, y = -p.z, z = p.y; return x > -120 && x < 100 && y > Y0 && y < Y1 && z > 280 && z < 430; };
  const kill = (test, cause = 'explosion') => {
    let n = 0; for (const z of [...enemies.list]) { const p = z.root?.position; if (p && test(p)) { enemies.hurt(z, 1e9, false, false, cause); n++; } }
    B.kills += n; return n;
  };
  // fake_physicslaunch: t = dist / power, vel = (d - drop) / t with drop = -g t^2 / 2
  const launch = side => {
    const from = player.getFeetPosition().clone(), to = W(...FLING[side].to);
    const dist = from.distanceTo(to), T = Math.max(.2, dist / FLING[side].power);
    const vel = to.clone().sub(from).divideScalar(T); vel.y += .5 * G * T;
    B.flung = { from, vel, T, t: 0 };
    if (api.features) api.features.flight = true;
  };

  const pre = world.prePlayer;
  world.prePlayer = dt => {
    if (B.flung) {
      const f = B.flung; f.t = Math.min(f.T, f.t + dt);
      const p = f.from.clone().addScaledVector(f.vel, f.t); p.y -= .5 * G * f.t * f.t;
      player.setPosition(p); session.effects.invulnerable = Math.max(session.effects.invulnerable ?? 0, session.time + .5);
      if (f.t >= f.T) { B.flung = null; B.landAt = session.time + .6; }
      return true;
    }
    return !!pre?.(dt);
  };

  function use() {
    if (!session.power) { api.toast?.('The power must be activated'); return false; }
    if (B.state !== 'idle') { api.toast?.('The bridge is in use'); return false; }
    if (!(api.shop?.pay ? api.shop.pay(COST) : session.spend?.(COST))) return false;   // pay() toasts 'Not enough points'
    B.state = 'run'; B.t = 0; B.kills = 0; B.events = new Set();
    sfx.sfxAt('bridge_start', centre, .9); lampPose(false);
    return true;
  }
  const once = (k, at, fn) => { if (B.t >= at && !B.events.has(k)) { B.events.add(k); fn(); } };
  function tick(dt) {
    if (B.landAt && session.time >= B.landAt && !B.flung) { B.landAt = 0; if (api.features) api.features.flight = false; }
    if (B.state !== 'run') { setCollision(); return; }
    B.t += dt; const t = B.t;
    once('open', 0, () => sfx.sfxAt('bridge_open', centre, .9));
    if (t < T_DOWN) pose(ease(t / T_DOWN));
    once('down', T_DOWN, () => {
      pose(1); gatePose(true);
      gk.setFlag('activatebridge'); if (B.first) { gk.setFlag('activateyellow'); gk.setFlag('activateredbrick'); B.first = false; }
      gk.emit('bridge:open');
    });
    once('rumble', T_RUMBLE, () => sfx.sfxAt('bridge_accel', centre, 1));
    if (t >= T_RUMBLE && t < T_FLING) pose(1, Math.floor(t * 20) % 2 ? -2 : 0);   // 2 units at 10 Hz
    once('fling', T_FLING, () => {
      pose(1);
      const f = player.getFeetPosition();
      if (!B.flung && session.phase !== 'gameover') { if (inLeaf(f, 'left')) launch('left'); else if (inLeaf(f, 'right')) launch('right'); }
      kill(p => inLeaf(p, 'left') || inLeaf(p, 'right'));
      sfx.sfxAt('bridge_close', centre, 1);
    });
    if (t >= T_FLING && t < T_FLING + T_UP) pose(1 - ease((t - T_FLING) / T_UP));
    once('shut', T_FLING + T_UP, () => { pose(0); sfx.sfxAt('bridge_impact' + (Math.random() < .5 ? 0 : 1), centre, 1); });
    once('gate', T_GATE, () => {
      gatePose(false); gk.clearFlag('activatebridge');
      kill(inGap);
      gk.emit('bridge:closed', B.kills);
      if (B.kills >= 10) gk.emit('bridge:achievement', B.kills);
    });
    if (t >= T_READY) { B.state = 'idle'; B.events = null; lampPose(!!session.power); }
    setCollision();
  }
  host.on('update', dt => tick(Math.min(dt || 0, .1)));
  host.on('reset', () => {
    B.state = 'idle'; B.t = 0; B.flung = null; B.landAt = 0; B.forced = null; B.first = true; B.events = null;
    pose(0); gatePose(false); lampPose(false); gk.clearFlag('activatebridge');
    if (api.features) api.features.flight = false; setCollision();
  });
  let powered = false;
  host.on('update', () => { if (!!session.power !== powered) { powered = !!session.power; if (B.state === 'idle') lampPose(powered); } });

  for (const a of USES) world.addInteraction({
    position: W(a[0], a[1], a[2] + 10), sight: true,
    text: () => (!session.power ? 'The power must be activated' : B.state !== 'idle' ? 'The bridge is in use' : 'Lower the bridge · ' + COST),
    use,
  });

  const handle = {
    state: () => ({ state: B.state, t: +B.t.toFixed(2), flat: flat(), deck: deck ? !deck.disabled : null, walls: walls ? !walls.disabled : null, flung: !!B.flung, kills: B.kills,
      flags: ['activatebridge', 'activateyellow', 'activateredbrick'].filter(f => gk.hasFlag(f)), top: TOP, banks }),
    use, force: open => { B.forced = open == null ? null : !!open; pose(open ? 1 : 0); gatePose(!!open); setCollision(); },
    leaves: [L, R], gate, inLeaf, inGap,
  };
  gk.bridge = handle; if (window.kino?.gorod) window.kino.gorod.bridge = handle;
}
