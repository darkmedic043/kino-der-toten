// Der Eisendrache's low gravity (zm_castle_low_grav.gsc): the undercroft (BO3's trig_low_gravity_zone, a brush the
// dump doesn't have: here a box around the room, from the undercroft's floaters, wall-run triggers and pressure pads)
// goes low once its four pressure plates around the pyramid (grav_pad_trigger) are locked down. As in the game
// (2026-11-12, from the script): a plate sinks under whoever steps on it and its symbol starts to glow; stand on it
// for 3 s and it locks (stays down and lit), step off sooner and it comes back up. One player can do the four one
// after another; nothing times out. 5 s after the fourth the plate lights go out and the gravity drops for 50 s (its
// last 10 s flashing), rests 60 s, and from then on cycles by itself for the rest of the game (before: every plate lit
// at a touch, and all four had to be stepped on again for each 50 s).
// Inside while it's on (BO3 dvars:
// bg_lowGravity 300 of 800, wallrun_enabled, doublejump_enabled, wallRun_maxTimeMs_zm 10000):
//   - gravity is 3/8, so jumps carry far and falls are slow
//   - a second jump in the air (once per jump)
//   - wall-running: airborne beside a wall (left or right, within 30) and moving along it, you run on it, level, for up
//     to 10 s; Space kicks off it (away and up); landing or leaving the wall ends it
// The floating books, skulls, candles and urns (undercroft_floater_model script models) rise and drift while it's on.
import * as THREE from 'three';
import { setupLowGravFx } from './lowgrav-fx.js';
import { sfx, sfxAt, setVol } from './castle-audio.js';

const ON = 50, COOL = 60, CYC = ON + COOL, HOLD = 3, WAIT = 5, SINK = 2.5, RUN_MAX = 10, LOW = 300 / 800;
const GLYPHS = new URL('../maps/der-eisendrache/grav-glyphs.png', import.meta.url).href;   // four Keeper glyphs in a row (BO3's sheet, git-ignored)
const W = (x, y, z) => new THREE.Vector3(x, z, -y);
export const PADS = [W(-1191, 2541, 200), W(-907, 2256, 200), W(-1192, 1972, 200), W(-1476, 2257, 200)];   // grav_pad_trigger (CoD x, y, z)
// CoD box x -1750..500, y 1700..3100, z 40..560 -> world (x, z, -y)
const BOX = new THREE.Box3(new THREE.Vector3(-1750, 40, -3100), new THREE.Vector3(500, 560, -1700));
const PYRAMID = new THREE.Vector3(-1193, 200, -2256);   // the MPD (CoD -1193, 2256, 200): the pulse and the crown glow come from it

export function setupLowGrav(api) {
  const { world, session, host, player, camera, toast, announce, audio, enemies, sync } = api;
  // co-op: standing on a plate and locking it are team events; the host's clock times the low gravity (shared 5 times a second, with
  // when it began and the lit plates); gravity, jumps and wall-runs are each player's own; the zombies' bounds run on
  // the host (its snapshot carries their height)
  sync?.shared('lowgrav', () => ({ t: st.t, started: st.started, onAt: st.onAt, pads: [...st.pads], stand: [...st.stand] }), s => { st.t = s.t; st.started = s.started; st.onAt = s.onAt ?? -1; st.pads = new Set(s.pads ?? []); st.stand = new Set(s.stand ?? []); });
  const floaters = []; world.root.traverse(o => { if (/^CASTLE_SM_undercroft_floater_model/.test(o.name)) floaters.push({ o, base: o.position.clone(), rot: o.rotation.clone(), ph: Math.random() * 6, rise: 30 + Math.random() * 40 }); });
  const st = { t: 0, on: false, started: false, inside: false, run: null, doubled: false, wasGrounded: true, k: 0, onAt: -1, pads: new Set(), stand: new Set(), sent: new Set(), hold: -1, holdT: 0, ask: 0, standT: [0, 0, 0, 0], lit: [0, 0, 0, 0], down: [0, 0, 0, 0], hinted: false };
  // onAt: when the gravity first drops (5 s after the fourth plate locked); it cycles from there by itself
  const running = () => st.onAt >= 0 && st.t >= st.onAt, since = () => (st.t - st.onAt) % CYC, lowOn = () => running() && since() < ON, resting = () => running() && since() >= ON;
  const cycles = () => (running() ? Math.floor((st.t - st.onAt) / CYC) + 1 : 0);
  // The plates. Each is the map's stand-in slab (CASTLE_GRAVPAD_<n>, matched to its trigger by position), which sinks
  // SINK units in half a second under a player (the game's pad moves 2), a Keeper glyph flat on its top that glows
  // while it's stood on (brighter as the 3 s run) or locked, and a soft halo on the floor around it. The collision
  // stays where it is: the player doesn't drop the 2.5 units with the slab.
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, 'rgba(255,255,255,.3)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const slabs = []; world.root.traverse(o => { if (/^CASTLE_GRAVPAD_/.test(o.name)) { let m = o.isMesh ? o : null; o.traverse(c => { if (!m && c.isMesh) m = c; }); if (m) { m.updateWorldMatrix(true, false); m.geometry.computeBoundingBox(); slabs.push({ o, c: m.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(m.matrixWorld), y0: o.position.y }); } } });
  const GLOW = new THREE.Color(0x6fc8ff);
  const flat = (size, y, p, yaw = 0) => { const g = new THREE.PlaneGeometry(size, size); g.rotateX(-Math.PI / 2); g.rotateY(yaw); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: glowTex, color: 0x000000, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.position.set(p.x, y, p.z); m.visible = false; m.renderOrder = 3; api.scene?.add(m); m.updateMatrixWorld(true); return m; };
  const plates = PADS.map((p, k) => {
    const slab = slabs.slice().sort((a, b) => Math.hypot(a.c.x - p.x, a.c.z - p.z) - Math.hypot(b.c.x - p.x, b.c.z - p.z))[0], at = slab && Math.hypot(slab.c.x - p.x, slab.c.z - p.z) < 30 ? slab.c : p;
    return { slab: at === p ? null : slab, top: p.y + 1.3, glyph: flat(33, p.y + 1.3, at, Math.atan2(PYRAMID.x - at.x, PYRAMID.z - at.z) + Math.PI), halo: flat(120, p.y + 1.25, at), drawn: -1, sunk: -1 };
  });
  host.warmObjects?.push(...plates.flatMap(q => [q.glyph, q.halo]));
  host.pending?.push(new Promise(done => new THREE.TextureLoader().load(GLYPHS, tex => {   // (missing: the plates keep the plain glow)
    tex.anisotropy = 4; api.renderer?.initTexture?.(tex);
    plates.forEach((q, k) => { const uv = q.glyph.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, (k + uv.getX(i)) / 4); uv.needsUpdate = true; q.glyph.material.map = tex; });
    done();
  }, undefined, () => done())));
  function drawPlates(dt, on, blink) {
    plates.forEach((q, k) => {
      const locked = st.pads.has(k), stood = st.stand.has(k) && !locked;
      st.standT[k] = stood ? st.standT[k] + dt : 0;
      const want = running() ? (on ? blink : .16) : locked ? 1 : stood ? .3 + .7 * Math.min(1, st.standT[k] / HOLD) : 0;
      st.lit[k] = Math.abs(want - st.lit[k]) < .004 ? want : THREE.MathUtils.damp(st.lit[k], want, on ? 30 : 5, dt);
      const dn = locked || stood ? 1 : 0; st.down[k] = dn ? Math.min(1, st.down[k] + dt * 2) : Math.max(0, st.down[k] - dt * 2);
      if (st.down[k] !== q.sunk) {   // (a node under the map root: its matrix is ours to refresh)
        q.sunk = st.down[k]; const dy = -SINK * q.sunk;
        if (q.slab) { q.slab.o.position.y = q.slab.y0 + dy; q.slab.o.updateMatrix(); q.slab.o.updateMatrixWorld(true); }
        q.glyph.position.y = q.top + dy; q.glyph.updateMatrix(); q.glyph.updateMatrixWorld(true);
      }
      const v = st.lit[k] * (locked && !running() ? .88 + .12 * Math.sin(st.t * 3 + k) : 1);
      if (Math.abs(v - q.drawn) > .003) { q.drawn = v; q.glyph.visible = q.halo.visible = v > .01; q.glyph.material.color.copy(GLOW).multiplyScalar(v * 1.5); q.halo.material.color.copy(GLOW).multiplyScalar(v * .3); }
    });
  }
  const plateSound = (name, k) => sfxAt(name, PADS[k], camera, .8, 1200);
  sync?.on('gravStand', d => {
    if (d.on) { if (!st.stand.has(d.k) && !st.pads.has(d.k)) { st.stand.add(d.k); plateSound('grav_plate_down', d.k); } }
    else if (st.stand.delete(d.k) && !st.pads.has(d.k)) plateSound('grav_plate_up', d.k);
  });
  sync?.on('gravPad', d => {
    if (st.onAt >= 0 || st.pads.has(d.k)) return;
    st.pads.add(d.k); st.stand.delete(d.k); plateSound('grav_plate_up', d.k); audio?.play?.('buy', .3);
    if (st.pads.size < 4) toast?.(`Pressure plate locked · ${st.pads.size}/4`, 2);
    else { st.started = true; st.onAt = st.t + WAIT; toast?.('All four plates are locked', 2.5); }
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
  host.on('reset', () => { st.started = false; st.t = 0; st.onAt = -1; st.pads.clear(); st.stand.clear(); st.sent.clear(); st.hold = -1; st.holdT = 0; st.hinted = false; set(false); drawPlates(1, false, 1); st.run = null; player.gravity = baseGravity; fx.reset(); });
  let hum = null;   // the machine's loop while the gravity is low (heard in the room)
  function set(on) {
    if (st.on === on) return; st.on = on; setGlow(on); fx.pulse(on);
    if (hum) { hum.pause(); hum = null; }
    if (on) { sfxAt('grav_start', PYRAMID, camera, .7, 2600); hum = sfx('grav_loop', 0); hum.loop = true; if (inside()) { announce?.('LOW GRAVITY', '', 2); fx.enter(); } }
    else if (st.started && st.t > 1) sfxAt('grav_stop', PYRAMID, camera, .45, 2600);
  }
  host.on('update', dt => {
    if (!dt) return;
    if ((sync?.isHost ?? true) && (st.started || session.round >= 1 && session.phase !== 'waiting')) { st.started = true; st.t += dt; }
    else if (st.started) st.t += dt;   // a guest runs on between the host's updates
    const on = lowOn(), cyc = since();
    set(on);
    const nowInside = inside(), lowNow = on && nowInside;
    if (nowInside !== st.inside) {
      st.inside = nowInside;
      if (lowNow) { toast?.('Low gravity · Space again in the air, run along the walls', 3); fx.enter(); }
      else if (nowInside && st.onAt < 0 && !st.hinted) { st.hinted = true; toast?.('Four pressure plates around the pyramid · stand on each for 3 seconds', 3.5); }
    }
    // my own weight on a plate: stepping on and off are the team's events, and 3 s without leaving locks it
    const f = player.getFeetPosition(); let onK = -1;
    if (st.onAt < 0 && api.getState().active) PADS.forEach((p, k) => { if (!st.pads.has(k) && !st.sent.has(k) && Math.abs(f.x - p.x) < 27 && Math.abs(f.z - p.z) < 27 && Math.abs(f.y - p.y) < 40) onK = k; });
    if (onK !== st.hold) {
      if (st.hold >= 0 && !st.pads.has(st.hold) && !st.sent.has(st.hold)) sync?.act('gravStand', { k: st.hold, on: false });
      st.hold = onK; st.holdT = 0; st.ask = .6;
      if (onK >= 0) sync?.act('gravStand', { k: onK, on: true });
    } else if (onK >= 0) {
      st.holdT += dt;
      if (!st.stand.has(onK) && (st.ask -= dt) <= 0) { st.ask = .6; sync?.act('gravStand', { k: onK, on: true }); }   // (a teammate stepping off the same plate cleared it)
      if (st.holdT >= HOLD) { st.sent.add(onK); sync?.act('gravPad', { k: onK }); }
    }
    player.gravity = lowNow ? baseGravity * LOW : baseGravity;
    // countdown: the last 10 s (BO3 flashes the lights, 7 s slow then 3 s fast)
    const blink = on && cyc > ON - 10 ? (Math.sin(st.t * (cyc > ON - 3 ? 30 : 10)) > 0 ? 1 : .25) : 1;
    if (glow) glow.weight = blink;
    if (hum) setVol(hum, nowInside ? .32 : 0);
    drawPlates(dt, on, blink);
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
  return { state: () => ({ on: st.on, inside: st.inside, left: lowOn() ? Math.round(ON - since()) : resting() ? Math.round(CYC - since()) : null, resting: resting(), pads: [...st.pads], stand: [...st.stand], hold: st.hold >= 0 ? +st.holdT.toFixed(2) : null,
      triggered: cycles(), running: !!st.run, gravity: player.gravity, floaters: floaters.length, plates: plates.map((q, k) => ({ slab: !!q.slab, lit: +st.lit[k].toFixed(2), down: +st.down[k].toFixed(2) })), fx: fx.state() }), fx,
    level: () => st.k,   // 0..1, eased: the room's light follows it (setupLook)
    force(on = true) { st.started = true; st.onAt = on ? st.t : -1; st.pads = new Set(on ? [0, 1, 2, 3] : []); st.stand.clear(); st.sent.clear(); } };
}
