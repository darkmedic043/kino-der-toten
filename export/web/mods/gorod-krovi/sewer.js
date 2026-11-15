// Gorod Krovi: the sewer ride out of Pavlov's House (2026-11-15, user: "make sure other features work, like the
// animation for the sewer travel"). BO3 zm_stalingrad (scratch/gk/spec/pap.md §6): drop through the hole under the sewer
// gate in Pavlov's basement; at the pit's floor (trigger transport_pavlovs_to_fountain) the player is linked to a camera
// vehicle (veh_sewer_cam) that runs the spline sewer_ride_start: west, then south-west through the sewer under Pavlov's,
// 5 to 40 mph by node. At the node marked sewer_fade_out the screen fades to black (1.5 s); after the path's end the
// vehicle is on sewer_ride_exit_start under the start area and fades back in (1 s) at its first node (sewer_fade_up):
// east along the outflow pipe, up out of it and through the air, landing by the fountain at its last node. The rider
// can't be hurt (BO3: magic bullet shield; zombies head for the nearest walkable point meanwhile). Sounds from the map's bank
// (.tools/build_gorod_ambience.py writes audio/sewer_*.ogg; without them the ride is silent).
// The basement's sewer teleporter (build_bo3_map.py TELEPORT_sewer) stays as the fallback, hidden while this works. Shut
// while Pavlov's lockdown or the incubator lockdown hold the sewer (the teleporter's `locked`, pap.js / gauntlet.js): the
// gate swings down over the hole (its BO3 down/up clips and sounds) and a player-only lid makes it solid.
// Local to each player, as in BO3. Debug: kino.gorod.sewer.{state(), ride()}; ?noSewerRide.
import * as THREE from 'three';
import { settings } from '../../settings.js';
import { CollisionWorld } from '../../collision-world.js';
import { play } from './scene-props.js';

const W = (x, y, z) => new THREE.Vector3(x, z, -y);
const MPH = 17.6;   // BO3 vehicle speeds are miles an hour: 17.6 inches a second
const ACCEL = 30 * MPH;
const RIDE = [[-2862, 22374, -395, 5], [-3094, 22428, -400, 10], [-3224, 22435, -393, 30], [-3895, 22438, -412, 30], [-4185, 22441, -453, 35],
  [-4424, 22441, -462, 40], [-4756, 22438, -461, 30], [-5091, 22457, -467, 20], [-5330, 22312, -461, 40], [-6130, 21515, -461, 40, 'fade_out'],
  [-6288, 21213, -454, 30], [-6270, 20894, -454, 40], [-6270, 20237, -443, 40]];
const EXIT = [[-4864, 721, -757, 40, 'fade_up'], [-3626, 716, -754, 40], [-2224, 716, -761, 30], [-1934, 716, -755, 30], [-1760, 716, -712, 40],
  [-1086, 716, -37, 30], [-601, 716, 281, 25], [-218, 716, 232, 50], [-87, 716, 142, 50], [-8, 716, 5, 50]];
const HOLE = [-3030, -2980, 22350, 22400];   // CoD x0, x1, y0, y1 of the hole in the basement floor (-160; the pit's floor is at -420)
const FADE_OUT = 1.5, FADE_IN = 1, BLACK_MIN = .5, LAND_INVULN = 2;

function track(nodes, from) {
  const pts = nodes.map(n => W(n[0], n[1], n[2]));
  if (from) pts[0] = from.clone();   // start where the player dropped in (the first node is a few steps east of the hole)
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), per = 40, lens = curve.getLengths((pts.length - 1) * per);
  return { curve, length: lens[lens.length - 1], at: nodes.map((n, i) => ({ s: lens[i * per], speed: n[3] * MPH, note: n[4] })) };
}

export default async function setup(api, gk) {
  const { world, session, player, camera } = api;
  const q = new URLSearchParams(location.search);
  const tp = world.teleporters?.find(t => /sewer/i.test(t.name ?? ''));
  if (q.has('noSewerRide') || !tp) return;
  const BASE = new URL('../maps/gorod-krovi/audio/', import.meta.url).href;
  const level = v => (api.audio?.enabled === false ? 0 : Math.max(0, Math.min(1, v * (settings.volume ?? 1))));
  const sfx = (name, vol, loop = false) => { const a = new Audio(BASE + name + '.ogg'); a.loop = loop; a.volume = level(vol); a.play().catch(() => {}); return a; };

  // the lid: a thin player-only slab over the hole while the sewer is shut
  const [x0, x1, y0, y1] = HOLE, a = W(x0 - 5, y0 - 5, -160), b = W(x1 + 5, y1 + 5, -146);
  const box = new THREE.Box3().setFromPoints([a, b]), lidGeo = new THREE.BoxGeometry(...box.getSize(new THREE.Vector3()).toArray()).translate(...box.getCenter(new THREE.Vector3()).toArray());
  const lid = { collider: new CollisionWorld(lidGeo.toNonIndexed()), box, enabled: false, window: true };
  world.dynamic.push(lid);
  const shut = () => !!tp.locked;
  // the gate (scenes.js's sewer_gate): BO3 plays its down bundle when a lockdown seals the sewer, up when it ends
  const gateAt = W(-3005, 22406, -159);
  let wasShut = false;
  function gate(down) {
    const g = gk.scenes?.props?.sewer_gate; if (g) play(g, down ? 'down' : 'up');
    const d = camera.position.distanceTo(gateAt); if (d < 1500) sfx(down ? 'sewer_close' : 'sewer_open', .7 * (1 - d / 1500));
  }

  // the screen fade (a plain black layer: no blur, nothing for the driver to compile)
  const veil = document.createElement('div');
  veil.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:9000;display:none';
  document.body.appendChild(veil);
  const fade = v => { veil.style.opacity = v.toFixed(3); veil.style.display = v > 0 ? 'block' : 'none'; };

  let R = null, working = true, rides = 0, last = null;
  for (const e of world.interactions) if (e.kind === 'teleport' && world.teleporters[e.teleporter] === tp) e.hidden = () => working;

  const inHole = f => {
    const cx = f.x, cy = -f.z;   // scene -> CoD
    return cx > x0 - 10 && cx < x1 + 10 && cy > y0 - 10 && cy < y1 + 10 && f.y < -280;
  };
  const yawOf = d => Math.atan2(-d.x, -d.z), pitchOf = d => Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
  const tan = new THREE.Vector3(), pos = new THREE.Vector3();

  function start(from) {
    if (R) return false;
    R = { leg: 0, path: track(RIDE, from), s: 0, v: RIDE[0][3] * MPH, next: 1, fade: 0, fadeDir: 0, black: 0, lastYaw: null, lastPitch: null, t: 0 };
    R.path.curve.getTangentAt(0, tan); camera.rotation.y = yawOf(tan);   // face down the sewer
    R.rush = sfx('sewer_rush_start', .55); R.loop = null; R.loopAt = 4.5;
    rides++; gk.emit('sewer:ride', 'start');
    return true;
  }
  function finish(ok = true) {
    const end = R.path.curve.getPointAt(1);
    if (R.lastPitch != null) camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - R.lastPitch, -1.5, 1.5);   // the track's tilt off the view
    player.setPosition(end.clone().add(new THREE.Vector3(0, 2, 0)));
    session.effects.invulnerable = Math.max(session.effects.invulnerable ?? 0, session.time + LAND_INVULN);
    if (!session.flags.has('zone:start')) session.flags.add('zone:start');
    for (const s of [R.rush, R.loop]) if (s) { s.pause(); s.src = ''; }
    fade(0); last = { end: end.toArray().map(Math.round), secs: +R.t.toFixed(1), ok }; R = null;
    gk.emit('sewer:ride', 'end');
  }

  function step(dt) {
    R.t += dt;
    const P = R.path, at = P.at;
    // speed: toward the speed of the last node passed (BO3: a node's speed holds until the next)
    while (R.next < at.length && R.s >= at[R.next].s) {
      const n = at[R.next];
      if (n.note === 'fade_out') R.fadeDir = 1;
      R.next++;
    }
    const want = at[Math.max(0, R.next - 1)].speed;
    R.v += THREE.MathUtils.clamp(want - R.v, -ACCEL * dt, ACCEL * dt);
    R.s = Math.min(P.length, R.s + R.v * dt);
    const u = R.s / P.length;
    P.curve.getPointAt(u, pos); P.curve.getTangentAt(u, tan);
    // the screen: out over 1.5 s at sewer_fade_out, black until the exit path is reached (and at least BLACK_MIN), in over 1 s
    if (R.fadeDir > 0) R.fade = Math.min(1, R.fade + dt / FADE_OUT);
    else if (R.fadeDir < 0) { R.fade = Math.max(0, R.fade - dt / FADE_IN); if (!R.fade) R.fadeDir = 0; }
    if (R.fade >= 1) R.black += dt;
    fade(R.fade);
    // the camera: turns with the track, the player still looks around on top of it
    const yaw = yawOf(tan), pitch = pitchOf(tan) * .6;
    if (R.lastYaw != null) { let d = yaw - R.lastYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); camera.rotation.y += d; camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x + pitch - R.lastPitch, -1.5, 1.5); }
    R.lastYaw = yaw; R.lastPitch = pitch;
    player.setPosition(pos);
    session.effects.invulnerable = Math.max(session.effects.invulnerable ?? 0, session.time + 1);
    if (R.loop == null && R.t >= R.loopAt) R.loop = sfx('sewer_rush', .45, true);
    if (R.s >= P.length) {
      if (R.leg === 0) {   // the end of the sewer: on to the exit path, still black
        if (R.fade < 1 || R.black < BLACK_MIN) return;
        R.leg = 1; R.path = track(EXIT); R.s = 0; R.next = 1; R.v = EXIT[0][3] * MPH; R.lastYaw = null; R.fadeDir = -1;
        R.path.curve.getTangentAt(0, tan); camera.rotation.y = yawOf(tan); camera.rotation.x = 0;
      } else finish();
    }
  }

  const pre = world.prePlayer;
  world.prePlayer = dt => {
    const sh = shut(); lid.enabled = sh;
    if (sh !== wasShut) { wasShut = sh; gate(sh); }
    if (R) {
      if (session.phase === 'gameover') { finish(false); return !!pre?.(dt); }
      try { step(Math.min(dt, .1)); } catch (e) { console.error('[gorod-krovi] sewer', e); working = false; finish(false); }
      return true;
    }
    if (working && !shut() && session.phase !== 'reviving' && session.phase !== 'gameover' && inHole(player.getFeetPosition())) { start(player.getFeetPosition()); return true; }
    return !!pre?.(dt);
  };

  const handle = {
    state: () => ({ riding: !!R, leg: R?.leg ?? null, s: R ? Math.round(R.s) : null, length: R ? Math.round(R.path.length) : null, speed: R ? Math.round(R.v / MPH) : null,
      fade: R ? +R.fade.toFixed(2) : 0, t: R ? +R.t.toFixed(1) : null, shut: shut(), lid: lid.enabled, working, rides, last }),
    ride: () => start(player.getFeetPosition()),
    hole: () => W((x0 + x1) / 2, (y0 + y1) / 2, -150),
  };
  gk.sewer = handle; if (window.kino?.gorod) window.kino.gorod.sewer = handle;
}
