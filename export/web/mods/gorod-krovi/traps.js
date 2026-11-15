// Gorod Krovi's traps (2026-11-15; scratch/gk/spec/other.md §3, positions from the map's ents and volumes): the
// flingers (zm_stalingrad_pavlov_trap: the street one in front of Dragon Command and Pavlov's two pairs), the finger trap
// (zm_stalingrad_finger_trap: the crashed robot's hand in the red brick building), the two eye beams (the clocktower
// robot head fires into the factory or the library) and the two stock electric traps (department store entrance, bunker).
// All need the power. Rules as in BO3:
//   flinger  1000, 30 s, cooldown 120 s. Every 0.5 s: zombies on its plates are thrown (and die), a player on them is
//            launched (fake_physicslaunch, speed 400) to one of two spots on Judicial Street and takes 34 % of max health
//            on landing. During a lockdown only the street flinger works (Pavlov's show "disabled").
//   finger   1500, 15 s, cooldown 90 s. The two fingers (scenes.js finger_l/finger_r, their BO3 crush clip looped) hit
//            whatever touches them along base-mid-tip (BO3: triggers linked to tag_mid_animate): 20000 damage, so a
//            player goes down unless sliding. Kills within 3 s of the player sliding through count for challenge 2_1.
//   eye beam 1500, 30 s, cooldown 60 s. Every 0.25 s kills what stands in the kill zone; a player there takes 40 every
//            0.2 s. The beam (a red cylinder from the head, sweeping the zone) is drawn while it runs.
//   electric 1000, 40 s, cooldown 60 s (zm_traps defaults, not in our dump). Arcs between the effect structs.
// Each switch box (p7_zm_sta_trap_control_box, placed by the build) gets a lamp: green when usable, red otherwise.
// gk events: 'trap:start' (id, kind), 'trap:kill' ({id, kind, z, slide}), 'trap:done' ({id, kind, kills, place}).
// The challenges (2_1, 2_3, 2_6, 3_2) and the Dragon Strike counts read these. Solo-first: each client runs its traps.
// Debug: kino.gorod.traps.{state(), use(id), force(id)}; ?gkTrapsFree makes them cost nothing.
import * as THREE from 'three';
import { makeSfx } from './dragon-sfx.js';
import { play, hold, step } from './scene-props.js';

const W = (x, y, z) => new THREE.Vector3(x, z, -y);
const box = (x0, y0, z0, x1, y1, z1) => new THREE.Box3().setFromPoints([W(x0, y0, z0), W(x1, y1, z1)]);
const JUDICIAL = [[-274, 3830, -12], [270, 3865, -12]];
const HEAD = W(2422.5, 5731.7, 2466.8);
const TRAPS = [
  { id: 'flinger_street', kind: 'flinger', cost: 1000, dur: 30, cool: 120, lockOk: true,
    uses: [[196.1, 4113.7, 38.7], [-88.7, 4652.6, 197]], boxes: [[197, 4120, 42, 270], [-88, 4648, 204, 90]],
    zones: [box(-102, 4398, 142, 102, 4550, 258)], plates: ['flinger_1'], throwYaw: 180 },
  { id: 'flinger_pavlov_right', kind: 'flinger', cost: 1000, dur: 30, cool: 120,
    uses: [[-2654.7, 21612.3, 45.9]], boxes: [[-2641, 21598, 50, 90]],
    zones: [box(-2612, 21630, -10, -2452.25, 21849, 106), box(-2612, 21360.75, -10, -2452.5, 21557, 106)], plates: ['flinger_2', 'flinger_3'], throwYaw: 270 },
  { id: 'flinger_pavlov_left', kind: 'flinger', cost: 1000, dur: 30, cool: 120,
    uses: [[-3379.5, 21356, 47.4]], boxes: [[-3384, 21342, 55, 90]],
    zones: [box(-3571, 21418, -10, -3408, 21641.25, 106), box(-3570.75, 21189.5, -10, -3408, 21417.25, 106)], plates: ['flinger_4', 'flinger_5'], throwYaw: 90 },
  { id: 'finger', kind: 'finger', cost: 1500, dur: 15, cool: 90,
    uses: [[-1403.3, 3052, 267], [-828.8, 3352.4, 220]], boxes: [[-1407, 3037, 274, 76], [-828, 3360, 227, 270]],
    zones: [box(-1260, 2860, 150, -930, 3380, 360)] },
  { id: 'eye_factory', kind: 'eye', cost: 1500, dur: 30, cool: 60,
    uses: [[-1852, 2402.1, 279.2], [-2390.8, 2554, 539.5], [-1980.8, 2961.9, 370.4]], boxes: [[-1848, 2402, 283, 180], [-2387, 2554, 543, 180], [-1985, 2962, 375, 0]],
    zones: [box(-2007, 2497.5, 238, -1836, 2798.5, 444.5)] },
  { id: 'eye_library', kind: 'eye', cost: 1500, dur: 30, cool: 60,
    uses: [[2550.8, 2336.9, -99.4], [1941, 2643, 51], [2676.2, 3049.2, 47.7]], boxes: [[2550, 2335, -98, 90], [1941, 2643, 51, 0], [2686, 3050, 54, 180]],
    zones: [box(2437.5, 2491, -190, 2698.5, 2794, 16.5)] },
  { id: 'electric_store', kind: 'electric', cost: 1000, dur: 40, cool: 60,
    uses: [[-102, 1176, 61], [127, 1130, 61]], boxes: [[-109, 1149, 67, 76.6], [126, 1135, 67, 284.4]],
    zones: [box(-90, 1118, 0, 92, 1198, 130)], arcs: [[-53.5, 1157.5, 16], [-17.5, 1157.5, 16], [18.5, 1157.5, 16], [54.5, 1157.5, 16]] },
  { id: 'electric_bunker', kind: 'electric', cost: 1000, dur: 40, cool: 60,
    uses: [[91, 2925, -115], [-156, 3041, -140]], boxes: [[96, 2925, -109, 180], [-156, 3036, -134, 90]],
    zones: [box(-105, 2965, -200, 72, 3045, -70)], arcs: [[-70.5, 3005, -180], [-34.5, 3005, -180], [1.5, 3005, -180], [37.5, 3005, -180]] },
];
const NAMES = { flinger: 'flinger', finger: 'finger trap', eye: 'eye beam', electric: 'electric trap' };
const TICK = { flinger: .5, finger: 0, eye: .25, electric: .25 };
const G = 800, FLING_SPEED = 400, FINGER_R = 46, SLIDE_GRACE = 3;

export default async function setupTraps(api, gk) {
  const { world, session, enemies, player, scene, camera } = api, host = api.host;
  const q = new URLSearchParams(location.search), free = q.has('gkTrapsFree');
  const sfx = makeSfx(api, new URL('../maps/gorod-krovi/audio/', import.meta.url).href);
  const lockdowns = new Set();
  gk.on('pap:lockdown', s => { if (s === 'start') lockdowns.add('pap'); else if (s === 'end' || s === 'fail') lockdowns.delete('pap'); });
  gk.on('gauntlet:lockdown', s => { if (s === 'start') lockdowns.add('gauntlet'); else if (s === 'end' || s === 'fail') lockdowns.delete('gauntlet'); });
  const alive = () => !player.down && !session.down && session.phase !== 'gameover' && session.phase !== 'reviving';

  // ---- looks: the switch lamps, the eye beams, the electric arcs (all made now; materials warmed while loading)
  const lampMat = c => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 2.2 });
  const green = lampMat(0x22ff44), red = lampMat(0xff2a1a);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xff2810, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff4020, transparent: true, opacity: .22, blending: THREE.AdditiveBlending, depthWrite: false });
  const arcMat = new THREE.LineBasicMaterial({ color: 0x9cc8ff, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
  const lampGeo = new THREE.BoxGeometry(5, 5, 5);
  const beamGeo = new THREE.CylinderGeometry(3, 3, 1, 8, 1, true).translate(0, .5, 0).rotateX(Math.PI / 2);   // along +z, length 1
  const glowGeo = new THREE.CylinderGeometry(12, 12, 1, 10, 1, true).translate(0, .5, 0).rotateX(Math.PI / 2);
  const root = new THREE.Group(); root.name = 'gk_traps'; root.userData.noMerge = true; scene.add(root);
  const ARC_PTS = 10;
  const T = TRAPS.map(d => {
    const t = { ...d, state: 'idle', t: 0, until: 0, ready: 0, kills: 0, acc: 0, uses: d.uses.map(u => W(...u)), lamps: [] };
    for (const [x, y, z] of d.boxes) { const m = new THREE.Mesh(lampGeo, red); m.position.copy(W(x, y, z + 26)); root.add(m); m.updateMatrixWorld(true); t.lamps.push(m); }
    t.centre = t.zones[0].getCenter(new THREE.Vector3());
    if (d.kind === 'eye') {
      const g = new THREE.Group(), core = new THREE.Mesh(beamGeo, beamMat), glow = new THREE.Mesh(glowGeo, glowMat);
      g.add(core, glow); g.visible = false; root.add(g); t.beam = g; t.sweep = Math.random() * 6;
    }
    if (d.kind === 'electric') {
      t.arcPts = d.arcs.map(a => W(...a));
      t.arcLines = [];
      for (let i = 0; i < t.arcPts.length - 1; i++) {
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_PTS * 3), 3));
        const l = new THREE.Line(geo, arcMat); l.frustumCulled = false; l.visible = false; root.add(l); t.arcLines.push(l);
      }
    }
    return t;
  });
  root.updateMatrixWorld(true);
  for (const m of [beamMat, glowMat]) { const w = new THREE.Mesh(beamGeo, m); w.scale.setScalar(.01); host.warmObjects?.push(w); }
  { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]); host.warmObjects?.push(new THREE.Line(g, arcMat)); }
  for (const m of [green, red]) { const w = new THREE.Mesh(lampGeo, m); w.scale.setScalar(.01); host.warmObjects?.push(w); }

  const usable = t => !!session.power && t.state === 'idle' && (t.kind !== 'flinger' || t.lockOk || !lockdowns.size);
  const lampsFor = t => { const m = usable(t) ? green : red; for (const l of t.lamps) if (l.material !== m) l.material = m; };

  // ---- killing
  const inZones = (t, p, pad = 0) => t.zones.some(b => p.x > b.min.x - pad && p.x < b.max.x + pad && p.y > b.min.y - pad && p.y < b.max.y + pad && p.z > b.min.z - pad && p.z < b.max.z + pad);
  const flying = [];   // thrown corpses: { z, v, t }
  function killZ(t, z, cause, slide = false, launch = null) {
    if (!enemies.list.includes(z)) return false;
    if (z.kind === 'raz' || z.boss) { enemies.hurt(z, t.kind === 'finger' ? 20000 : 2500, false, false, cause); if (enemies.list.includes(z)) return false; }
    else enemies.hurt(z, 1e9, false, false, cause);
    t.kills++; gk.emit('trap:kill', { id: t.id, kind: t.kind, z, slide });
    if (launch && z.root) flying.push({ z, v: launch.clone(), t: 0 });
    return true;
  }

  // ---- the flinger's player launch (bridge.js's fake_physicslaunch: t = dist / speed, vel = (d - drop) / t)
  let fling = null;
  function launchPlayer() {
    const from = player.getFeetPosition().clone(), to = W(...JUDICIAL[Math.random() < .5 ? 0 : 1]);
    const T_ = Math.max(.2, from.distanceTo(to) / FLING_SPEED);
    const vel = to.clone().sub(from).divideScalar(T_); vel.y += .5 * G * T_;
    fling = { from, vel, T: T_, t: 0, inv0: session.effects.invulnerable ?? 0 }; if (api.features) api.features.flight = true;
    sfx.sfx('trap_fling', .8);
  }
  const pre = world.prePlayer;
  world.prePlayer = dt => {
    if (fling) {
      const f = fling; f.t = Math.min(f.T, f.t + dt);
      const p = f.from.clone().addScaledVector(f.vel, f.t); p.y -= .5 * G * f.t * f.t;
      player.setPosition(p); session.effects.invulnerable = Math.max(session.effects.invulnerable ?? 0, session.time + .3);
      if (f.t >= f.T) {
        fling = null; if (api.features) api.features.flight = false;
        session.effects.invulnerable = f.inv0;   // what it was before the flight (a gum or the debug switch may hold it)
        if (alive()) api.damage?.(Math.round((session.maxHealth ?? 100) * .34));
        flungTimes++;
      }
      return true;
    }
    return !!pre?.(dt);
  };
  let flungTimes = 0;

  // ---- the fingers: their bones, read each tick (the damage triggers ride tag_mid_animate)
  const fingerBones = () => {
    const P = gk.scenes?.props; if (!P?.finger_l || !P?.finger_r) return null;
    return [P.finger_l, P.finger_r].map(F => ['tag_base_animate', 'tag_mid_animate', 'tag_tip_animate'].map(n => F.bones?.[n] ?? F.root.getObjectByName(n)));
  };
  const a_ = new THREE.Vector3(), b_ = new THREE.Vector3(), seg = new THREE.Line3(), close = new THREE.Vector3();
  function fingerHit(bones, p) {   // is p within FINGER_R of either finger's base-mid-tip chain?
    for (const chain of bones) for (let i = 0; i < 2; i++) {
      if (!chain[i] || !chain[i + 1]) continue;
      chain[i].getWorldPosition(a_); chain[i + 1].getWorldPosition(b_); seg.set(a_, b_);
      seg.closestPointToPoint(p, true, close); if (close.distanceTo(p) < FINGER_R) return true;
    }
    return false;
  }
  // the damage triggers: BO3 origins, half sizes guessed (their brushes are not in our dump): the corridor's width, floor to ceiling
  const TRIGS = [W(-1095, 2920, 241), W(-1081, 3314, 241)], TRIG_HALF = new THREE.Vector3(70, 95, 110);
  const mid0 = [null, null], trigBox = TRIGS.map(() => new THREE.Box3()), mtmp = new THREE.Vector3();
  function trigBoxes(bones) {
    return TRIGS.map((o, i) => {
      const m = bones?.[i]?.[1]; mtmp.copy(o);
      if (m && mid0[i]) mtmp.add(m.getWorldPosition(new THREE.Vector3()).sub(mid0[i]));
      return trigBox[i].setFromCenterAndSize(mtmp, TRIG_HALF.clone().multiplyScalar(2));
    });
  }
  let slideAt = -1e9;
  const fingerT = TRAPS.findIndex(d => d.kind === 'finger');

  // ---- running
  function use(t) {
    if (!session.power) { api.toast?.('The power must be activated'); return false; }
    if (t.kind === 'flinger' && !t.lockOk && lockdowns.size) { api.toast?.('The flinger is disabled during the lockdown'); return false; }
    if (t.state === 'active') { api.toast?.('The trap is active'); return false; }
    if (t.state === 'cooldown') { api.toast?.('The trap is cooling down'); return false; }
    if (!free && !(api.shop?.pay ? api.shop.pay(t.cost) : session.spend?.(t.cost))) return false;
    start(t); return true;
  }
  function start(t) {
    t.state = 'active'; t.t = 0; t.acc = 0; t.kills = 0; t.until = session.time + t.dur;
    sfx.sfxAt('trap_button_' + (Math.random() < .5 ? 0 : 1), t.uses[0], .8, 1200);
    if (t.kind === 'eye') t.beam.visible = true;
    if (t.kind === 'electric') { for (const l of t.arcLines) l.visible = true; t.hum = camera.position.distanceTo(t.centre) < 2500 ? sfx.loop('trap_elec_loop', .1) : null; }
    if (t.kind === 'finger') {
      const P = gk.scenes?.props, bones = fingerBones();
      ['finger_l', 'finger_r'].forEach((k, i) => { if (!P?.[k]) return; hold(P[k], 'crush'); const m = bones?.[i]?.[1]; mid0[i] = m ? m.getWorldPosition(new THREE.Vector3()) : null; play(P[k], 'crush', { loop: true }); });
      t.crushAt = 0;
    }
    gk.emit('trap:start', t.id, t.kind);
    lampsFor(t);
  }
  function stop(t, cooldown = true) {
    if (t.kind === 'eye') t.beam.visible = false;
    if (t.kind === 'electric') { for (const l of t.arcLines) l.visible = false; t.hum?.stop(); t.hum = null; sfx.sfxAt('trap_elec_stop', t.centre, .7, 1800); }
    if (t.kind === 'finger') { const P = gk.scenes?.props; for (const k of ['finger_l', 'finger_r']) if (P?.[k]) hold(P[k], 'crush'); }
    const was = t.state === 'active';
    t.state = cooldown ? 'cooldown' : 'idle'; t.ready = session.time + (cooldown ? t.cool : 0);
    if (was) gk.emit('trap:done', { id: t.id, kind: t.kind, kills: t.kills, place: t.id });
    lampsFor(t);
  }

  const feetTmp = new THREE.Vector3(), zp = new THREE.Vector3(), throwDir = new THREE.Vector3();
  function tick(t, dt) {
    t.t += dt; t.acc += dt;
    const feet = player.getFeetPosition(feetTmp), me = alive();
    if (t.kind === 'flinger') {
      if (t.acc >= TICK.flinger || t.t <= dt) {
        t.acc = 0;
        const P = gk.scenes?.props; for (const k of t.plates) if (P?.[k] && !P[k].rig.actions.fling?.isRunning()) play(P[k], 'fling');
        const yaw = THREE.MathUtils.degToRad(t.throwYaw); throwDir.set(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(300); throwDir.y = 380;
        let hit = 0;
        for (const z of [...enemies.list]) { if (z.root && inZones(t, z.root.position, 8) && killZ(t, z, 'explosion', false, throwDir)) hit++; }
        if (hit) sfx.sfxAt('trap_fling', t.centre, .55, 2000);
        if (me && !fling && inZones(t, feet, 4)) launchPlayer();
      }
    } else if (t.kind === 'finger') {
      const P = gk.scenes?.props;   // scenes.js pauses looping props over 3000 from the camera; the trap still has to sweep there
      for (const k of ['finger_l', 'finger_r']) if (P?.[k]?.origin && camera.position.distanceTo(P[k].origin) > 3000) step(P[k], dt);
      const bones = fingerBones();
      if (session.time - t.crushAt > .87) { t.crushAt = session.time; sfx.sfxAt('trap_crush_' + (Math.random() < .5 ? 0 : 1), t.centre, .8, 2200); }
      // BO3's damage triggers (finger_damage_trig_left/right, in the corridor the player slides through) are linked to the
      // fingers' tag_mid_animate: they follow the mid joint's movement from the clip's first frame. The finger meshes hit too.
      const boxes = trigBoxes(bones), slid = session.time - slideAt <= SLIDE_GRACE;
      for (const z of [...enemies.list]) {
        if (!z.root) continue; zp.copy(z.root.position); zp.y += 36;
        if (boxes.some(bx => bx.containsPoint(zp)) || (bones && (fingerHit(bones, zp) || fingerHit(bones, z.root.position)))) killZ(t, z, 'explosion', slid);
      }
      if (me && !(window.kino?.movement?.state?.sliding)) {
        zp.copy(feet); zp.y += 30;
        if (boxes.some(bx => bx.containsPoint(zp)) || (bones && fingerHit(bones, zp))) api.damage?.(20000);
      }
    } else if (t.kind === 'eye') {
      // the beam's end sweeps the zone (a slow figure across it), from the clocktower head
      t.sweep += dt; const b = t.zones[0], c = t.centre, sx = (b.max.x - b.min.x) * .38, sz = (b.max.z - b.min.z) * .38;
      zp.set(c.x + Math.sin(t.sweep * 1.3) * sx, b.min.y + 4, c.z + Math.sin(t.sweep * .9 + 1) * sz);
      const len = HEAD.distanceTo(zp);
      t.beam.position.copy(HEAD); t.beam.lookAt(zp); t.beam.scale.set(1, 1, len); t.beam.updateMatrix(); t.beam.updateMatrixWorld(true);
      if (t.acc >= TICK.eye) {
        t.acc = 0; let hit = 0;
        for (const z of [...enemies.list]) if (z.root && inZones(t, z.root.position)) { if (killZ(t, z, 'fire')) hit++; }
        if (hit) sfx.sfxAt('trap_ignite', t.centre, .6, 2000);
        t.burnAcc = (t.burnAcc ?? 0) + TICK.eye;
      }
      if (me && inZones(t, feet)) { t.pAcc = (t.pAcc ?? 0) + dt; while (t.pAcc >= .2) { t.pAcc -= .2; (gk.burn?.(40) ?? api.damage?.(40)); } } else t.pAcc = 0;
    } else if (t.kind === 'electric') {
      // the arcs: jagged lines between neighbouring effect structs, redrawn 15 times a second
      t.arcT = (t.arcT ?? 0) + dt;
      if (t.arcT > 1 / 15) {
        t.arcT = 0;
        t.arcLines.forEach((l, i) => {
          const A = t.arcPts[i], B = t.arcPts[i + 1], arr = l.geometry.attributes.position.array;
          for (let k = 0; k < ARC_PTS; k++) {
            const u = k / (ARC_PTS - 1), j = k === 0 || k === ARC_PTS - 1 ? 0 : 14;
            arr[k * 3] = A.x + (B.x - A.x) * u + (Math.random() - .5) * j;
            arr[k * 3 + 1] = A.y + (B.y - A.y) * u + 20 + Math.sin(u * Math.PI) * 30 + (Math.random() - .5) * j * 2;
            arr[k * 3 + 2] = A.z + (B.z - A.z) * u + (Math.random() - .5) * j;
          }
          l.geometry.attributes.position.needsUpdate = true; l.geometry.computeBoundingSphere();
        });
        if (Math.random() < .12) sfx.sfxAt('trap_elec_arc_' + (Math.random() < .5 ? 0 : 1), t.centre, .45, 1500);
      }
      if (t.acc >= TICK.electric) {
        t.acc = 0;
        for (const z of [...enemies.list]) if (z.root && inZones(t, z.root.position)) killZ(t, z, 'electric');
        if (me && inZones(t, feet)) { api.damage?.(25); sfx.sfx('trap_sizzle', .5); }
      }
    }
    if (session.time >= t.until) stop(t);
  }

  host.on('update', dt => {
    dt = Math.min(dt || 0, .1);
    // the slide through the finger trap (finger_trap_slide_trigger): kills up to 3 s after it count as slide kills
    const ft = T[fingerT]; if (ft && window.kino?.movement?.state?.sliding && inZones(ft, player.getFeetPosition(feetTmp))) slideAt = session.time;
    for (const t of T) {
      if (t.state === 'active') tick(t, dt);
      else if (t.state === 'cooldown' && session.time >= t.ready) { t.state = 'idle'; if (session.power) sfx.sfxAt('trap_available', t.uses[0], .5, 1200); }
      lampsFor(t);
    }
    for (let i = flying.length - 1; i >= 0; i--) {   // thrown corpses: a short ballistic arc
      const f = flying[i]; f.t += dt; const r = f.z.root;
      if (!r?.parent || f.t > 1.1) { flying.splice(i, 1); continue; }
      f.v.y -= G * dt; r.position.addScaledVector(f.v, dt); r.updateMatrixWorld(true);
    }
  });
  host.on('reset', () => {
    for (const t of T) { if (t.state === 'active') stop(t, false); t.state = 'idle'; t.ready = 0; t.kills = 0; lampsFor(t); }
    lockdowns.clear(); flying.length = 0; slideAt = -1e9; flungTimes = 0;
    if (fling) { fling = null; if (api.features) api.features.flight = false; }
  });

  const label = t => {
    if (!session.power) return 'The power must be activated';
    if (t.kind === 'flinger' && !t.lockOk && lockdowns.size) return 'The flinger is disabled during the lockdown';
    if (t.state === 'active') return 'The trap is active';
    if (t.state === 'cooldown') return 'The trap is cooling down';
    return `Activate the ${NAMES[t.kind]} · ${free ? 0 : t.cost}`;
  };
  for (const t of T) for (const u of t.uses) world.addInteraction({ position: u.clone().add(new THREE.Vector3(0, 8, 0)), sight: true, text: () => label(t), use: () => use(t) });

  const byId = id => T.find(t => t.id === id);
  const handle = {
    state: () => ({ traps: T.map(t => ({ id: t.id, state: t.state, t: +t.t.toFixed(1), kills: t.kills, ready: t.state === 'cooldown' ? +(t.ready - session.time).toFixed(1) : 0, usable: usable(t) })),
      lockdowns: [...lockdowns], flung: flungTimes, flying: !!fling, slideAgo: +(session.time - slideAt).toFixed(1), fingers: !!fingerBones() }),
    use: id => { const t = byId(id); return t ? use(t) : false; },
    force: id => { const t = byId(id); if (!t) return false; if (t.state === 'active') stop(t, false); start(t); return true; },
    stop: id => { const t = byId(id); if (t?.state === 'active') stop(t, false); },
    zones: id => byId(id)?.zones.map(b => ({ min: b.min.toArray().map(Math.round), max: b.max.toArray().map(Math.round) })),
    centre: id => byId(id)?.centre.clone(), uses: id => byId(id)?.uses.map(u => u.clone()),
    fingerHit: p => { const b = fingerBones(); return b ? fingerHit(b, p) : null; },
    fingerBoxes: () => trigBoxes(fingerBones()).map(b => ({ min: b.min.toArray().map(Math.round), max: b.max.toArray().map(Math.round) })),
  };
  gk.traps = handle; if (window.kino?.gorod) window.kino.gorod.traps = handle;
}
