// S.O.P.H.I.A. (BO3 zm_stalingrad: the computer in the Dragon Command room, judicial street, and her eye screen above
// it; zm_stalingrad_ee_main / the client's sophia_eye functions). Assets by .tools/build_gk_scenes.py (git-ignored,
// ripped): the computer (230 joints) on its base, the eye, and the five pairs of tape reels around the map.
// What runs here: the computer and base in their init pose (code_door_open frame 0, the decoder slot and green button
// hidden as BO3 does), the eye asleep (pitched 325) with its flatline showing; 3 s after the power comes on the eye
// rises to level in 2 s and its screen lights; from then on it follows the nearest player's head within 750 units
// every 0.1 s, clamped as BO3 does (yaw +-27 deg, pitch up to 27 deg), and settles back to level in 0.5 s when nobody
// is near. Not built: the Easter egg (pneumatic tube terminals, the code rings, the drawer, the weapon cores, her voice
// lines, the ending scene with sophia_anim / trap doors / eye_idle); the clips for those are in the json already.
// Debug: window.kino.gorod.sophia (also gk.sophia): props, S (state), wake(), sleep().
import * as THREE from 'three';
import { sceneData, makeProp, place, hold, hidePart, moved, W } from './scene-props.js';

const COMPUTER = [340, 4854, 144.5], EYE = [354, 4854.5, 282], EYE_SLEEP = 325;
const REELS = [   // [tape_02 origin, angles, tape_01 origin] (the radio recorder reel pairs, sophia's recordings)
  [[161.26, 3378.52, -129], [0, 247.197, 0], [173.354, 3373.33, -129]],
  [[-3112.53, 21091.5, 46.1751], [0.803, 113.682, -1.832], [-3124.61, 21086.3, 45.7533]],
  [[2520.25, 3363.99, 42.5], [0, 187.897, 0], [2521.96, 3350.94, 42.5]],
  [[373.074, 5364.24, 358.5], [0, 36.3979, 0], [365.336, 5374.89, 358.5]],
  [[-2816.93, 2418.24, 170], [0, 36.3979, 0], [-2824.66, 2428.89, 170]],
];
const TRACK_R = 750, D = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = a => ((a % 360) + 360) % 360;
const delta = (a, b) => ((b - a + 540) % 360) - 180;   // shortest turn from a to b, degrees

export default async function setup(api, gk) {
  if (api.map?.id !== 'gorod-krovi') return;
  const { host, scene, session, camera } = api;
  const J = await sceneData();
  if (!J?.props?.sophia) { console.warn('[gorod-krovi] sophia: scene assets missing (run .tools/build_gk_scenes.py)'); return; }
  const [PC, PB, PE] = await Promise.all(['sophia', 'sophia_base', 'sophia_eye'].map(k => makeProp(J, k)));
  const tapes = await Promise.all(REELS.flatMap(() => [makeProp(J, 'tape_02'), makeProp(J, 'tape_01')]));
  const props = { computer: PC, base: PB, eye: PE, tapes: tapes.filter(Boolean) };

  for (const P of [PC, PB]) if (P) { place(P, COMPUTER); scene.add(P.root); }
  hold(PC, 'code_door_open'); hidePart(PC, 'slot_decoder_jnt'); hidePart(PC, 'button_green_jnt');   // scene::init + hidepart
  hold(PB, 'trap_door_open');
  REELS.forEach(([o2, a, o1], i) => {
    const t2 = tapes[i * 2], t1 = tapes[i * 2 + 1];
    if (t2) { place(t2, o2, a); scene.add(t2.root); }
    if (t1) { place(t1, o1, a); scene.add(t1.root); }
  });

  // the eye: the screen's background card lights when she wakes (an emissive ramp: the map is set at load, so turning
  // it on is a uniform change, no program rebuild); the flatline/wave cards are BO3 shader-only (blacktransparent) and
  // not in the model, so hiding wave_jnt only matters if a later build brings them in
  const screens = [];
  if (PE) {
    place(PE, EYE, [EYE_SLEEP, 0, 0]); scene.add(PE.root); hidePart(PE, 'wave_jnt');
    PE.root.traverse(o => {
      if (!o.isMesh || !/eye_screen_bg|sophia_eye/.test(o.material?.name ?? '')) return;
      o.material = o.material.clone(); const m = o.material;
      if (m.map && !m.emissiveMap) m.emissiveMap = m.map;
      m.emissive = new THREE.Color(0, 0, 0); m.emissiveIntensity = 1; screens.push(m);
    });
  }
  const S = { awake: false, wakeAt: 0, rise: 0, pitch: EYE_SLEEP - 360, yaw: 0, lit: 0, tracking: false, next: 0 };
  const lightScreen = k => { S.lit = k; for (const m of screens) m.emissive.setRGB(.55 * k, .75 * k, .7 * k); };
  const poseEye = () => { if (!PE) return; PE.root.rotation.set(0, S.yaw * D, -S.pitch * D, 'YZX'); moved(PE.root); };
  const wake = () => { if (S.awake || S.wakeAt) return; S.wakeAt = session.time + 3; };
  const sleep = () => { Object.assign(S, { awake: false, wakeAt: 0, rise: 0, pitch: EYE_SLEEP - 360, yaw: 0, tracking: false }); lightScreen(0); poseEye(); };
  lightScreen(0);

  // the nearest head within TRACK_R (this player; co-op teammates' heads when the co-op mod lists them)
  const eyeAt = W(...EYE), head = new THREE.Vector3();
  function nearestHead() {
    let best = null, bd = TRACK_R;
    const cands = [camera.position, ...(globalThis.kino?.coop?.players?.() ?? []).map(p => p?.head ?? p?.position).filter(Boolean)];
    for (const c of cands) { const d = c.distanceTo(eyeAt); if (d < bd) { bd = d; best = c; } }
    return best && head.copy(best);
  }
  // BO3: angles = vectortoangles(eye - head); pitch over 200 clamped to 333..360, yaw over 200 to 333..360, else 0..27
  function aimAt(h) {
    const cx = eyeAt.x - h.x, cy = -(eyeAt.z - h.z), cz = eyeAt.y - h.y;   // three -> CoD axes
    let yaw = wrap(Math.atan2(cy, cx) / D), pitch = wrap(-Math.atan2(cz, Math.hypot(cx, cy)) / D);
    if (pitch > 200) pitch = clamp(pitch, 333, 360);
    yaw = yaw > 200 ? clamp(yaw, 333, 360) : clamp(yaw, 0, 27);
    return [pitch > 180 ? pitch - 360 : pitch, yaw > 180 ? yaw - 360 : yaw];
  }

  host.on('update', dt => {
    if (!PE) return;
    dt = Math.min(dt || 1 / 60, .1);
    if (!S.awake && !S.wakeAt && session.power) wake();
    if (S.wakeAt && session.time >= S.wakeAt) { S.wakeAt = 0; S.awake = true; S.rise = 0; S.from = S.pitch; globalThis.kino?.staticFreeze?.thaw?.(PE.root); }
    if (!S.awake) return;
    if (S.rise < 2) {   // rotateto((0,0,0), 2, .5, .5): ease in and out
      S.rise = Math.min(2, S.rise + dt); const k = S.rise / 2, e = k * k * (3 - 2 * k);
      S.pitch = S.from * (1 - e); lightScreen(e); poseEye(); return;
    }
    const h = nearestHead();
    let tp = 0, ty = 0, T = .5;
    if (h) { [tp, ty] = aimAt(h); T = .1; }
    const k = Math.min(1, dt / T);
    const np = S.pitch + (tp - S.pitch) * k, ny = S.yaw + delta(S.yaw, ty) * k;
    if (Math.abs(np - S.pitch) + Math.abs(ny - S.yaw) > 1e-3) { S.pitch = np; S.yaw = ny; poseEye(); }
    S.tracking = !!h;
  });
  host.on('reset', () => { sleep(); });

  gk.sophia = { props, S, wake: () => { S.wakeAt = session.time; }, sleep };
  if (window.kino?.gorod) window.kino.gorod.sophia = gk.sophia;
  console.info(`[gorod-krovi] sophia: computer ${!!PC}, base ${!!PB}, eye ${!!PE}, ${props.tapes.length} tape reels`);
}
