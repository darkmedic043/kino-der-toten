// Der Eisendrache's low gravity (zm_castle_low_grav.gsc): the undercroft (BO3's trig_low_gravity_zone, a brush the
// dump doesn't have: here a box around the room, from the undercroft's floaters, wall-run triggers and pressure pads)
// cycles 50 s on (its last 10 s flashing) and 60 s off once the game starts. Inside while it's on (BO3 dvars:
// bg_lowGravity 300 of 800, wallrun_enabled, doublejump_enabled, wallRun_maxTimeMs_zm 10000):
//   - gravity is 3/8, so jumps carry far and falls are slow
//   - a second jump in the air (once per jump)
//   - wall-running: airborne beside a wall (left or right, within 30) and moving along it, you run on it, level, for up
//     to 10 s; Space kicks off it (away and up); landing or leaving the wall ends it
// The floating books, skulls, candles and urns (undercroft_floater_model script models) rise and drift while it's on.
import * as THREE from 'three';

const ON = 50, OFF = 60, RUN_MAX = 10, LOW = 300 / 800;
// CoD box x -1750..500, y 1700..3100, z 40..560 -> world (x, z, -y)
const BOX = new THREE.Box3(new THREE.Vector3(-1750, 40, -3100), new THREE.Vector3(500, 560, -1700));

export function setupLowGrav(api) {
  const { world, session, host, player, camera, toast, announce, audio, enemies } = api;
  const floaters = []; world.root.traverse(o => { if (/^CASTLE_SM_undercroft_floater_model/.test(o.name)) floaters.push({ o, base: o.position.clone(), rot: o.rotation.clone(), ph: Math.random() * 6, rise: 30 + Math.random() * 40 }); });
  const st = { t: 0, on: false, started: false, inside: false, run: null, doubled: false, wasGrounded: true, k: 0 };
  const baseGravity = player.gravity;
  let glow = null;   // a cold glow in the room while it's on (the lighting mod's pool: adding a THREE light recompiles shaders)
  const center = BOX.getCenter(new THREE.Vector3());
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
      st.run = null; st.doubled = false; return;
    }
    if (!player.grounded && !st.doubled) { st.doubled = true; player.velocity.y = Math.max(player.velocity.y, player.jumpSpeed * .85); }
  });
  host.on('start', () => { st.started = true; st.t = 0; });
  host.on('reset', () => { st.started = false; st.t = 0; set(false); st.run = null; player.gravity = baseGravity; });
  function set(on) {
    if (st.on === on) return; st.on = on; setGlow(on);
    if (on && inside()) { audio?.play?.('dog_round', .3); announce?.('LOW GRAVITY', '', 2); }
  }
  host.on('update', dt => {
    if (!dt) return;
    if (st.started || session.round >= 1 && session.phase !== 'waiting') { st.started = true; st.t += dt; }
    const cyc = st.t % (ON + OFF), on = st.started && cyc < ON;
    set(on);
    const nowInside = inside(), lowNow = on && nowInside;
    if (nowInside !== st.inside) { st.inside = nowInside; if (lowNow) toast?.('Low gravity · Space again in the air, run along the walls', 3); }
    player.gravity = lowNow ? baseGravity * LOW : baseGravity;
    // countdown: the last 10 s (BO3 flashes the lights, 7 s slow then 3 s fast)
    if (glow) glow.weight = on && cyc > ON - 10 ? (Math.sin(st.t * (cyc > ON - 3 ? 30 : 10)) > 0 ? 1 : .25) : 1;
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
    for (const z of enemies.list) {
      if (z.kind !== 'zombie' && z.kind !== 'dog') continue;
      const y = z.root.position.y, base = z.lgSet != null && Math.abs(y - z.lgSet) < .01 ? y - (z.lgOff ?? 0) : y;
      let off = 0;
      if (on && BOX.containsPoint(z.root.position) && z.state !== 'rising' && z.state !== 'attack' && z.state !== 'dead') { z.lgT = (z.lgT ?? Math.random() * 3) + dt; const t = z.lgT % 3.2; off = t < 1.4 ? Math.sin(t / 1.4 * Math.PI) * 38 : 0; }
      if (off || z.lgOff) { z.root.position.y = base + off; z.lgOff = off; z.lgSet = z.root.position.y; }
    }
    // floaters rise and drift while it's on, settle when it's off
    st.k = THREE.MathUtils.damp(st.k, on ? 1 : 0, 1.2, dt);
    if (floaters.length && (st.k > .001 || floaters[0].o.position.y !== floaters[0].base.y)) for (const f of floaters) {
      f.o.position.copy(f.base); f.o.position.y += st.k * (f.rise + Math.sin(st.t * .8 + f.ph) * 6);
      f.o.rotation.set(f.rot.x + st.k * Math.sin(st.t * .3 + f.ph) * .4, f.rot.y + st.k * st.t * .15, f.rot.z + st.k * Math.cos(st.t * .25 + f.ph) * .3);
      f.o.updateMatrixWorld(true);
    }
  });
  return { state: () => ({ on: st.on, inside: st.inside, left: Math.round((st.on ? ON : ON + OFF) - st.t % (ON + OFF)), running: !!st.run, gravity: player.gravity, floaters: floaters.length }),
    force(on = true) { st.started = true; st.t = on ? 0 : ON; } };
}
