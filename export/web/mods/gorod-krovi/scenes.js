// Gorod Krovi's scene props (BO3 zm_stalingrad's scriptbundle_scene entities and the fxanim script models the map
// script drives), from .tools/build_gk_scenes.py (git-ignored, ripped). Each sits in its scene's init pose (frame 0 of
// its clip) where BO3 puts it:
//   the library's two chandeliers and chains (idle sway, looping while a player is near), its ceiling debris and the
//   five library banners; the department store wall, bookcase and bits; the fountain and judicial (opera street)
//   wreckage and the judicial wires; the A and R letters over the street and the truck debris under them; the five
//   flinger traps; Pavlov's generator tarp; the drone window; the Raz cage; the robot arm's two aperture doors; the
//   sewer gate and its switch.
// Dragon hazards (BO3 zm_stalingrad_dragon: the dragon lands on a hazard and sets these off): on 'dragon:hazard'
// {area, on} (gauntlet-hazard.js) or a map-dragon fire pass ('dragon:fire' {origin}, dragon.js) near an area:
//   library -> the first time chandelier 1 breaks and falls with the ceiling debris, after that chandelier 2 rocks
//   (dragon_lands) and goes back to its idle; department_store -> the wall crashes in (once); fountain and
//   opera_street -> the wreckage sways (gusty); red_brick / yellow (barracks, armory) -> the A and R letters fall (once).
// Power on: the robot arm's aperture doors open (front, then the back one 0.66 s later). Visual only: no collision
// changes, no sounds (their notetracks are BO3 sound aliases), no fx. Left out: the elevator trap (script-played),
// the dogfight dragons, tracer fire, the pickups blob/nuke. Debug: window.kino.gorod.scenes (also gk.scenes).
import { sceneData, makeProp, place, hold, play, running, step, W } from './scene-props.js';
import { AREAS } from './gauntlet-hazard.js';

const LIB = [2100, 2328, 304];
const SCENES = [   // [key, prop, origin, angles, init clip]
  ['chand_01', 'chand_01', LIB, null, 'idle'], ['chain_01', 'chain_01', LIB, null, 'idle'],
  ['chand_02', 'chand_02', LIB, null, 'idle'], ['chain_02', 'chain_02', LIB, null, 'idle'],
  ['ceiling_debris', 'ceiling_debris', LIB, null, 'break'],
  ...[[2311.35, 2187.29, 303.341, 0], [2029.2, 2187.29, 303.341, 0], [2601.25, 2187.29, 303.341, 0], [2025.34, 3198.55, 303.341, 180], [2314.06, 3189.67, 303.341, 180]]
    .map(([x, y, z, yaw], i) => [`library_banner_${i + 1}`, 'library_banner', [x, y, z], [0, yaw, 0], null]),
  ['dept', 'dept', [-500, 1500, 600], null, 'crash'], ['dept_bits', 'dept_bits', [-500, 1500, 600], null, 'crash'],
  ['dept_bookcase', 'dept_bookcase', [-500, 1500, 600], null, 'crash'],
  ['fountain', 'fountain', [-200, 825, 0], null, 'gust'],
  ['judicial', 'judicial', [600, 4000, 0], null, 'gust'], ['judicial_wires', 'judicial_wires', [600, 4000, 0], null, null],
  ['letters_a', 'letters_a', [666, 1815, 670], null, 'fall'], ['letters_a_truck', 'letters_a_truck', [666, 1815, 670], null, 'fall'],
  ['letters_r', 'letters_r', [666, 1815, 670], null, 'fall'],
  ...[[0.0299196, 4402.03, 144.7, 180], [-2453.19, 21458.8, 3.06, 270], [-2453.19, 21752.2, 3.06, 270], [-3568.03, 21311.6, 3.06, 90], [-3568.03, 21523.5, 3.06, 90]]
    .map(([x, y, z, yaw], i) => [`flinger_${i + 1}`, 'flinger', [x, y, z], [0, yaw, 0], 'fling']),
  ['finger_l', 'finger_l', [-1015, 3150, 200], null, 'crush'], ['finger_r', 'finger_r', [-1015, 3150, 200], null, 'crush'],   // the finger trap (traps.js)
  ['tarp', 'tarp', [-2705, 21705, -87], null, 'start'],
  ['drone_window', 'drone_window', [-2230, 3000, 370], null, 'break'],
  ['raz_cage', 'raz_cage', [-510.175, 4998.86, 428.926], null, 'grab'],
  ['aperture', 'aperture', [-1799.9, 3249.58, 370.633], [13.975, 343.048, -5.02706], 'open'],
  ['aperture_front', 'aperture_front', [-1429.74, 3136.47, 274.191], [13.975, 343.048, -5.02706], 'open'],
  ['sewer_gate', 'sewer_gate', [-3005, 22406, -159], [0, 179.999, 0], 'down'],
  ['sewer_switch', 'sewer_switch', [-4741, 22440, -380.999], [0, 180, -90], 'flip'],
];
const LOOP_NEAR = 3000;   // looping idles only step while a player is this close (inches)
const AREA_R = 700;

export default async function setup(api, gk) {
  if (api.map?.id !== 'gorod-krovi') return;
  const { host, scene, session, camera } = api;
  const J = await sceneData();
  if (!J?.props) { console.warn('[gorod-krovi] scenes: assets missing (run .tools/build_gk_scenes.py)'); return; }
  const P = {};
  await Promise.all(SCENES.map(async ([key, prop, origin, angles, init]) => {
    const p = await makeProp(J, prop); if (!p) return;
    p.init = init; p.origin = W(...origin); place(p, origin, angles ?? [0, 0, 0]); scene.add(p.root); P[key] = p;
  }));
  const idle = p => { if (p?.rig.actions.idle) play(p, 'idle', { loop: true }); };
  function initAll() {
    for (const p of Object.values(P)) hold(p, p.init);
    for (const k of ['chand_01', 'chain_01', 'chand_02', 'chain_02']) idle(P[k]);
  }
  initAll();
  const S = { libraryBroken: false, deptDown: false, lettersDown: false, apertureOpen: false, apertureAt: 0, played: [] };
  const fire = (k, a, then = null) => { if (play(P[k], a, { then })) S.played.push(`${k}:${a}`); };

  function hazard(area) {
    if (area === 'library') {
      if (!S.libraryBroken) { S.libraryBroken = true; fire('chand_01', 'break'); fire('chain_01', 'break'); fire('ceiling_debris', 'break'); }
      else { fire('chand_02', 'lands', 'idle'); fire('chain_02', 'lands', 'idle'); }
    } else if (area === 'department_store') {
      if (!S.deptDown) { S.deptDown = true; for (const k of ['dept', 'dept_bits', 'dept_bookcase']) fire(k, 'crash'); }
    } else if (area === 'fountain') { if (!running(P.fountain)) fire('fountain', 'gust'); }
    else if (area === 'opera_street') { if (!running(P.judicial)) fire('judicial', 'gust'); }
    else if (area === 'red_brick' || area === 'yellow') {
      if (!S.lettersDown) { S.lettersDown = true; for (const k of ['letters_a', 'letters_a_truck', 'letters_r']) fire(k, 'fall'); }
    }
  }
  const areaNear = p => {
    let best = null, bd = AREA_R;
    for (const [n, c] of Object.entries(AREAS)) { const d = Math.hypot(p.x - c.x, p.z - c.z); if (d < bd) { bd = d; best = n; } }
    return best;
  };
  gk.on('dragon:hazard', e => { if (e?.on && e.area) hazard(e.area); });
  gk.on('dragon:fire', e => { const a = e?.origin && areaNear(e.origin); if (a) hazard(a); });

  host.on('update', dt => {
    dt = Math.min(dt || 1 / 60, .1);
    if (session.power && !S.apertureOpen) { S.apertureOpen = true; S.apertureAt = session.time + .66; fire('aperture_front', 'open'); }
    if (S.apertureAt && session.time >= S.apertureAt) { S.apertureAt = 0; fire('aperture', 'open'); }
    const cam = camera.position;
    for (const p of Object.values(P)) {
      if (!running(p)) continue;
      if (p.loop && !p.next && cam.distanceTo(p.origin) > LOOP_NEAR) continue;   // an idle out of sight: paused
      step(p, dt);
    }
  });
  host.on('reset', () => { Object.assign(S, { libraryBroken: false, deptDown: false, lettersDown: false, apertureOpen: false, apertureAt: 0, played: [] }); initAll(); });

  gk.scenes = { props: P, S, hazard };
  if (window.kino?.gorod) window.kino.gorod.scenes = gk.scenes;
  console.info(`[gorod-krovi] scenes: ${Object.keys(P).length} of ${SCENES.length} props placed`);
}
