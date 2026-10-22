// Der Eisendrache's low gravity (zm_castle_low_grav.gsc): the undercroft (BO3's trig_low_gravity_zone, a brush the
// dump doesn't have: here a box around the room, from the undercroft's floaters, wall-run triggers and pressure pads)
// goes low when its four pressure plates around the pyramid (grav_pad_trigger) have all been stepped on: each lights
// as you step on it and stays lit; with the fourth the gravity drops for 50 s (its last 10 s flashing), then the plates
// rest dark for 60 s before they take steps again (user, 2026-10-22: it ran on a timer from the start, the original
// is triggered by the plates). Inside while it's on (BO3 dvars:
// bg_lowGravity 300 of 800, wallrun_enabled, doublejump_enabled, wallRun_maxTimeMs_zm 10000):
//   - gravity is 3/8, so jumps carry far and falls are slow
//   - a second jump in the air (once per jump)
//   - wall-running: airborne beside a wall (left or right, within 30) and moving along it, you run on it, level, for up
//     to 10 s; Space kicks off it (away and up); landing or leaving the wall ends it
// The floating books, skulls, candles and urns (undercroft_floater_model script models) rise and drift while it's on.
import * as THREE from 'three';
import { setupLowGravFx } from './lowgrav-fx.js';

const ON = 50, COOL = 60, RUN_MAX = 10, LOW = 300 / 800;
const W = (x, y, z) => new THREE.Vector3(x, z, -y);
export const PADS = [W(-1191, 2541, 200), W(-907, 2256, 200), W(-1192, 1972, 200), W(-1476, 2257, 200)];   // grav_pad_trigger (CoD x, y, z)
// CoD box x -1750..500, y 1700..3100, z 40..560 -> world (x, z, -y)
const BOX = new THREE.Box3(new THREE.Vector3(-1750, 40, -3100), new THREE.Vector3(500, 560, -1700));
const PYRAMID = new THREE.Vector3(-1193, 200, -2256);   // the MPD (CoD -1193, 2256, 200): the pulse and the crown glow come from it

export function setupLowGrav(api) {
  const { world, session, host, player, camera, toast, announce, audio, enemies, sync } = api;
  // co-op: a plate stepped on is a team event; the host's clock times the low gravity (shared 5 times a second, with
  // when it began and the lit plates); gravity, jumps and wall-runs are each player's own; the zombies' bounds run on
  // the host (its snapshot carries their height)
  sync?.shared('lowgrav', () => ({ t: st.t, started: st.started, onAt: st.onAt, pads: [...st.pads], n: st.triggered }), s => { st.t = s.t; st.started = s.started; st.onAt = s.onAt ?? -1; st.pads = new Set(s.pads ?? []); st.triggered = s.n ?? st.triggered; });
  const floaters = []; world.root.traverse(o => { if (/^CASTLE_SM_undercroft_floater_model/.test(o.name)) floaters.push({ o, base: o.position.clone(), rot: o.rotation.clone(), ph: Math.random() * 6, rise: 30 + Math.random() * 40 }); });
  const st = { t: 0, on: false, started: false, inside: false, run: null, doubled: false, wasGrounded: true, k: 0, onAt: -1, pads: new Set(), asked: new Set(), triggered: 0, hinted: false };
  const since = () => st.t - st.onAt, lowOn = () => st.onAt >= 0 && since() < ON, resting = () => st.onAt >= 0 && since() >= ON && since() < ON + COOL;
  // the plates: a glow on each while it's lit (and on all four while the gravity is low)
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, 'rgba(255,255,255,.3)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const padGlows = PADS.map(p => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9fd8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); m.position.copy(p).add(new THREE.Vector3(0, 4, 0)); m.scale.setScalar(90); m.visible = false; api.scene?.add(m); return m; });
  const showPads = () => { const all = lowOn(); padGlows.forEach((g, k) => { g.visible = all || st.pads.has(k); }); };
  sync?.on('gravPad', d => {
    if (lowOn() || resting() || st.pads.has(d.k)) return;
    st.pads.add(d.k); audio?.play?.('buy', .4);
    if (st.pads.size < 4) toast?.(`A pressure plate sinks · ${st.pads.size}/4`, 2);
    else { st.started = true; st.onAt = st.t; st.pads.clear(); st.asked.clear(); st.triggered++; }
    showPads();
  });
  const baseGravity = player.gravity;
  let glow = null;   // a cold glow in the room while it's on (the lighting mod's pool: adding a THREE light recompiles shaders)
  const center = BOX.getCenter(new THREE.Vector3());
  const fx = setupLowGravFx(api, BOX, center, PYRAMID);   // motes, the pulse, the screen's cold cast, jump rings (lowgrav-fx.js)
  function setGlow(on) {
    const pool = window.kino.lighting?.sources; if (!pool) return;
    if (on && !glow) { glow = { position: center.clone(), color: new THREE.Color(0x7f9cff), intensity: 1.6, radius: 1400, kind: 'solid', dynamic: true, cap: 2000, weight: 1 }; pool.push(glow); }
    if (!on && glow) { const j = pool.indexOf(glow); if (j >= 0) pool.splice(j, 1); glow = null; }
  }
  const inside = () => BOX.containsPoint(player.getFeetPosition());
  const side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function wallBeside() {   // the nearest wall left or right of where you're moving (or looking), at chest height: {normal, distance}
    const v = player.velocity, f = Math.hypot(v.x, v.z) > 40 ? new THREE.Vector3(v.x, 0, v.z) : camera.getWorldDirection(new THREE.Vector3()); f.y = 0; f.normalize(); side.crossVectors(f, up).normalize();
    const from = player.getFeetPosition().add(new THREE.Vector3(0, 40, 0)); let best = null;
    for (const s of [1, -1]) {
      const dir = side.clone().multiplyScalar(s), hit = world.raycast(new THREE.Ray(from, dir), 0, 34);
      if (hit && (!best || hit.distance < best.distance)) { const n = hit.triangle.getNormal(new THREE.Vector3()); if (Math.abs(n.y) < .3) best = { normal: n.setY(0).normalize(), distance: hit.distance }; }
    }
    return best;
  }
  addEventListener('keydown', e => {
    if (e.code !== 'Space' || e.repeat || !st.on || !st.inside || !api.getState().active) return;
    if (st.run) {   // kick off the wall
      const n = st.run.normal; player.velocity.x = n.x * 260 + player.velocity.x * .6; player.velocity.z = n.z * 260 + player.velocity.z * .6; player.velocity.y = player.jumpSpeed * .9;
      st.run = null; st.doubled = false; fx.jump(player.getFeetPosition(), true); return;
    }
    if (!player.grounded && !st.doubled) { st.doubled = true; player.velocity.y = Math.max(player.velocity.y, player.jumpSpeed * .85); fx.jump(player.getFeetPosition()); }
  });
  host.on('start', () => { st.started = true; st.t = 0; });
  host.on('reset', () => { st.started = false; st.t = 0; st.onAt = -1; st.pads.clear(); st.asked.clear(); st.triggered = 0; st.hinted = false; set(false); showPads(); st.run = null; player.gravity = baseGravity; fx.reset(); });
  function set(on) {
    if (st.on === on) return; st.on = on; setGlow(on); fx.pulse(on);
    if (on && inside()) { audio?.play?.('dog_round', .3); announce?.('LOW GRAVITY', '', 2); fx.enter(); }
  }
  host.on('update', dt => {
    if (!dt) return;
    if ((sync?.isHost ?? true) && (st.started || session.round >= 1 && session.phase !== 'waiting')) { st.started = true; st.t += dt; }
    else if (st.started) st.t += dt;   // a guest runs on between the host's updates
    const on = lowOn(), cyc = since();
    set(on); showPads();
    const nowInside = inside(), lowNow = on && nowInside;
    if (nowInside !== st.inside) {
      st.inside = nowInside;
      if (lowNow) { toast?.('Low gravity · Space again in the air, run along the walls', 3); fx.enter(); }
      else if (nowInside && !on && !st.hinted) { st.hinted = true; toast?.('Four pressure plates around the pyramid · step on them all', 3); }
    }
    // my own steps on the plates (the team's event, sent once each time I step onto an unlit plate)
    const f = player.getFeetPosition();
    PADS.forEach((p, k) => {
      const onIt = Math.hypot(f.x - p.x, f.z - p.z) < 50 && Math.abs(f.y - p.y) < 40;
      if (!onIt) { st.asked.delete(k); return; }
      if (!on && !resting() && !st.pads.has(k) && !st.asked.has(k)) { st.asked.add(k); sync?.act('gravPad', { k }); }
    });
    player.gravity = lowNow ? baseGravity * LOW : baseGravity;
    // countdown: the last 10 s (BO3 flashes the lights, 7 s slow then 3 s fast)
    const blink = on && cyc > ON - 10 ? (Math.sin(st.t * (cyc > ON - 3 ? 30 : 10)) > 0 ? 1 : .25) : 1;
    if (glow) glow.weight = blink;
    // double jump resets on the ground; wall-running
    if (player.grounded) { st.doubled = false; st.run = null; }
    if (lowNow && !player.grounded) {
      const h = Math.hypot(player.velocity.x, player.velocity.z);
      if (!st.run && h > 120) { const w = wallBeside(); if (w) st.run = { normal: w.normal, t: 0 }; }
      if (st.run) {
        st.run.t += dt; const w = wallBeside();
        if (!w || st.run.t > RUN_MAX) st.run = null;
        else {
          st.run.normal = w.normal;
          const v = player.velocity, along = new THREE.Vector3(v.x, 0, v.z); along.addScaledVector(w.normal, -along.dot(w.normal));   // speed along the wall
          const sp = Math.max(260, along.length()); along.normalize().multiplyScalar(sp);
          v.x = along.x - w.normal.x * 20; v.z = along.z - w.normal.z * 20; v.y = Math.max(v.y, -15) > 30 ? v.y * .9 : -10;   // level, pressed to the wall
        }
      }
    } else st.run = null;
    // zombies in the room float too (BO3 switches them to its low-gravity locomotion): slow, high bounds as they go.
    // The AI may set their height itself, so each frame's base is whatever it left (or ours minus the last bound)
    for (const z of (sync?.isHost ?? true) ? enemies.list : []) {
      if (z.kind !== 'zombie' && z.kind !== 'dog') continue;
      const y = z.root.position.y, base = z.lgSet != null && Math.abs(y - z.lgSet) < .01 ? y - (z.lgOff ?? 0) : y;
      let off = 0;
      if (on && BOX.containsPoint(z.root.position) && z.state !== 'rising' && z.state !== 'attack' && z.state !== 'dead') { z.lgT = (z.lgT ?? Math.random() * 3) + dt; const t = z.lgT % 3.2; off = t < 1.4 ? Math.sin(t / 1.4 * Math.PI) * 38 : 0; }
      if (off || z.lgOff) { z.root.position.y = base + off; z.lgOff = off; z.lgSet = z.root.position.y; }
    }
    // floaters rise and drift while it's on, settle when it's off
    st.k = THREE.MathUtils.damp(st.k, on ? 1 : 0, 1.2, dt);
    fx.update(dt, st.k, nowInside, blink);
    if (floaters.length && (st.k > .001 || floaters[0].o.position.y !== floaters[0].base.y)) for (const f of floaters) {
      f.o.position.copy(f.base); f.o.position.y += st.k * (f.rise + Math.sin(st.t * .8 + f.ph) * 6);
      f.o.rotation.set(f.rot.x + st.k * Math.sin(st.t * .3 + f.ph) * .4, f.rot.y + st.k * st.t * .15, f.rot.z + st.k * Math.cos(st.t * .25 + f.ph) * .3);
      f.o.updateMatrixWorld(true);
    }
  });
  return { state: () => ({ on: st.on, inside: st.inside, left: lowOn() ? Math.round(ON - since()) : resting() ? Math.round(ON + COOL - since()) : null, resting: resting(), pads: [...st.pads], triggered: st.triggered,
      running: !!st.run, gravity: player.gravity, floaters: floaters.length, fx: fx.state() }), fx,
    force(on = true) { st.started = true; st.onAt = on ? st.t : -1; st.pads.clear(); st.asked.clear(); if (on) st.triggered++; } };
}
