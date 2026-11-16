// Gorod Krovi's main Easter egg, "Love and War" (zm_stalingrad_ee_main.gsc and friends; spec scratch/gk/spec/ee.md, 2026-11-15).
//   1 Generator: a Valkyrie drone killed in Pavlov's basement charges it (a 2 s arc). It runs 360 s, then needs a use
//     after the next round starts. Its tarp scene plays start/idle/end.
//   2 Tubes: six pneumatic terminals, shuffled: [0] the source (green), [5] the jammed one (shaking). Each lever has three
//     settings (one output each, BO3's table); route the air from the source through all six to the jammed one. Levers
//     work only while the generator runs; the reached terminals light blue. Solved: the jammed tube drops the master cylinder.
//   3 Password: the cylinder into S.O.P.H.I.A. (her decoder slot), the code door opens and six rings show on her code
//     wheels. Shoot or knife a ring to turn it 45 deg. The code is BO3's, 0 6 0 7 6 4 (her line says it, since the map art
//     that gives it away isn't in the port). Wrong = locked until the next round.
//   4 Keys (six map figures, team-wide, findable any time): the blob (shoot the anomaly over the alley), the nuke (a Dragon
//     Strike on the library street puddle), the soldier (the library eye trap burns the debris off a safe), the drone (the
//     dragon shield's breath into the factory pipe), the symbol (shoot the sewer switch behind Pavlov's), the pod (the
//     Gauntlet's punch on the safe in the red brick basement). Place them on the war map's shelf (the button by the map).
//   5 Six scenarios from the map button (refused in a Valkyrie round or a lockdown), shuffled with the escort and the
//     Mangler apart, the terminal always last; a failed one is retried after the next round:
//     pod (an EE drop pod: kills in its volume, then the whelp fetches the cargo from the high ground, carry it to the
//     drawer), escort (a drone with no arms rides BO3's paths while a player is within 200; 60 s stopped or killed = fail),
//     mangler (kite it to the capture point under the cage; killed or escaped = fail), timed (six rigged buttons in the
//     order the map flashed, against the clock; wrong or late downs everyone near a button), pursue (a ray-gun ball that
//     only Pack-a-Punched guns hurt, three steps, 120 s without a hit = fail), terminal (the keycard into Pavlov's data
//     terminal, 180 s under the Mangler-only lockdown, the card back to the drawer).
//     Captures end in the cage over the map room (scenes.js raz_cage 'grab').
//   6 Weapon core: from her core door; the whelp, released in the start area, carries it to Nikolai's mech.
//   7 She leaves (within 500 of her), the hatch under her (every living player on it for 1 s) drops the team into the
//     arena; the console there starts Nikolai's fight (nikolai.js). Winning: every perk, a white flash, 'ee:done'.
//   The pause (BO3's): no spawns, every zombie killed (they go back into the round), a white flash.
// Co-op: runs on the host; uses and pickups are the host's own (guests' presses don't reach it), and the terminal asks
//   every living player to stand in its room. Subtitles are toasts in my own words (no VO).
// Debug: kino.gorod.ee.{state, skip(stage), keys(), scenario(name), log()}.
import * as THREE from 'three';
import { settings } from '../../settings.js';
import { sceneData, makeProp, place, moved, hold, play, step, hidePart, W } from './scene-props.js';
import { hideBone } from './boss-common.js';

const D = Math.PI / 180;
const box = (a, b) => new THREE.Box3().setFromPoints([W(...a), W(...b)]);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.floor(Math.random() * a.length)];

const GEN = [-2724, 21764, -116], GEN_BOX = box([-3355, 21388, -170], [-2640, 22441, -78]);
// label: [terminal, yaw, lever, use, outputs for settings 0/1/2]
const TUBES = {
  command: [[360.25, 5280, 304], 0, [360.25, 5270, 370.25], [360, 5264, 364], ['library', 'store', 'barracks']],
  library: [[1936, 2820, -160], 90, [1946, 2820, -93.75], [1954, 2820, -104], ['command', 'armory', 'factory']],
  store: [[-403.373, 1281.31, 336], 225, [-410.44, 1288.38, 402.25], [-415, 1293, 394], ['armory', 'barracks', 'command']],
  barracks: [[-568, 3013, 162], 270, [-578, 3013, 228.25], [-584, 3012, 220], ['store', 'factory', 'command']],
  factory: [[-2334, 2044, 150], 180, [-2334, 2054, 216.25], [-2334, 2060, 212], ['barracks', 'library', 'armory']],
  armory: [[496, 3398, 320], 270, [486, 3398, 386.25], [480, 3397, 380], ['library', 'factory', 'store']],
};
const LEVER_PITCH = [240, 0, 120];
const SOPHIA = [299, 4854, 186], CODE = [0, 6, 0, 7, 6, 4];
const KEYS = [   // [what, trigger, figure spot, figure angles, drop to the floor]
  { name: 'blob', at: [-77, 3575, 346], fig: [-78, 3575, 330], ang: [0, 0, 0], ground: true },
  { name: 'nuke', at: [1794, 3022, -156], fig: [1793.51, 3023.51, -212.3], ang: [0, 0, 0], ground: true },
  { name: 'soldier', at: [2664.15, 2624.27, -159], fig: [2667.5, 2612.54, -187], ang: [0, 270, 0] },
  { name: 'drone', at: [-2344, 2604, 226], fig: [-2230, 3000, 370], ang: [0, 0, 0], ground: true },
  { name: 'symbol', at: [-4744, 22440, -378], fig: [-2995.18, 21103.3, 15.92], ang: [2.16, 29.1, 16.8] },
  { name: 'pod', at: [-614, 3452, -148], fig: [-625.845, 3467.62, -139], ang: [25, 90, 104] },
];
const MAP = [-418.75, 4764, 130], MAP_BUTTON = [-398.75, 4764, 182];
const GLOWS = ['command', 'barracks', 'tank', 'armory', 'store', 'supply', 'square'];
const SC_NAMES = { pod: 'Cargo defence', escort: 'Escort the Valkyrie', mangler: 'Capture the Mangler', timed: 'Security system', pursue: 'The anomaly', terminal: 'Data download' };
const CAPTURE = [-512, 5000, 152];

// pod (§7): [pod, yaw, harassers], score volumes, fetch volumes, cargo drops
const PODS = {
  factory1: [[-3555.38, 2000.9, 174], 19, [[-4560, 1836, 160], [-4549, 3537, 171], [-2557, 3598, 160], [-2448, 1861, 160], [-4822.5, 2578.5, 160], [-3633, 3757, 171]]],
  factory2: [[-3459.99, 3484.46, 179], 0, [[-2448, 1840, 160], [-2557, 3588, 160], [-4555, 1836, 160], [-4557, 3537, 171], [-4822.5, 2581.5, 160], [-4143, 1648, 160]]],
  command1: [[-454.541, 6730.99, 54], 270, [[661.33, 7638.5, 48], [882, 6002, 56], [-919, 5999, 56], [830, 6912, 112], [469, 7817, 96], [-391, 7558, 142]]],
  command2: [[452.161, 7115.99, 54], 240, [[886, 6002, 56], [-939, 5999, 56], [-189, 7942, 48], [-876, 6852, 144], [461, 7817, 96]]],
  library1: [[4014.99, 2840.54, -306], 180, [[5720.83, 4005.5, -616], [3705.33, 1646.5, -221], [3717.33, 3294.5, -268], [6105.33, 3215.5, -640], [6243.58, 2175.43, -640]]],
  library2: [[3899.33, 2338.05, -334], 120, [[5736.83, 4005.5, -616], [3721.33, 1646.5, -221], [3733.33, 3294.5, -268], [6121.33, 3215.5, -640], [6248.36, 2169.53, -640]]],
};
const POD_VOL = { factory: box([-4772, 1728, 146], [-2528, 3670, 467]), command: box([-1028, 5880, 38], [920, 7958, 211]), library: box([3652, 2016, -638], [5600, 3950, -117]) };
const FETCH = { factory: box([-3094, 2034, 494], [-2510, 3434, 726]), command: box([-278, 5734, 302], [258, 6354, 522]), library: box([2698, 2790, -2], [3190, 2966, 162]) };
const DROP = { command: [0, 5760, 318], library: [2776, 3016, 34], factory: [-2512, 2704, 526] };
const POD_GLOW = { command: 'command', factory: 'tank', library: 'supply' };
const DRAGON_AREA = { library: 'library', factory: 'factory', judicial: 'command' };
// escort (§8)
const ESC_SPAWN = [1821.88, -255.875, 92];
const ESC = {
  entrance: [[1813.88, -257.625, 92], [1732.38, -410.625, 228], [1586.35, -450.09, 283], [1417.36, -400.02, 217], [1042.84, -363.56, 322.5], [740.84, -305.06, 112.5], [518.84, -223.06, 112.5], [412.735, -34.68, 40]],
  store: [[32, 394, 37], [11, 1160, 66.5], [-248, 1474, 72], [-359, 1587, 142], [-331, 1553, 380]],
  armory: [[-214, 1744, 448], [280, 1882, 400], [652, 2288, 400], [652, 2826, 224], [302, 2952, 128], [352, 3378, 56], [628, 3440, 56], [674, 3572, 56], [590, 3666, 56], [344, 3718, 56], [0, 4088, 72]],
  barracks: [[-394, 1744, 439], [-720.5, 2344, 398], [-739.5, 2769.5, 376], [-632, 3066, 376], [-234, 3294, 376], [-212, 3406, 376], [-328, 3534, 376], [-732, 3430, 208], [-796, 3582, 206], [-773.5, 3724, 206], [-516, 3686, 152], [-236, 3878, 48], [0, 4088, 72]],
  command: [[0, 4256, 144], [0, 4448, 216], [-6, 4906, 200], [-142, 5022, 184], [-512, 4998, 192]],
};
const ESC_HP = 1500;
// mangler (§9)
const RAZ_AT = [[[-2210.76, 3806.64, 500], 355], [[-2233.89, 1457.95, 496], 355], [[-2386.86, 3292.79, -64], 270], [[2254.09, 1755.2, -160], 180], [[2212.8, 3615.47, 0], 135]];
const RAZ_ESCAPE = [-161.5, 712.5, -11], RAZ_TRAP = [-496, 4988, 184];
// timed (§10)
const TIMED = { command: [[-552, 5280, 368], 0], tank: [[-2298, 2396, 552], 0], barracks: [[-555, 2968, 106], 180], supply: [[2396, 1996, -104], 0], store: [[-466, 1688.5, 72], 45], armory: [[1102, 3224, -104], 0] };
// pursue (§11)
const BALL = {
  store: [[586, 1388, 227], [-457, 1266.5, 65.5], [-1058.5, 1798.5, 246], [111.5, 1201, 78.5]],
  alley_bunker: [[-276, 2283, 60], [-25, 3264, -83], [682.5, 2612, 144.5], [-623, 3093.5, -103]],
  barracks: [[-209, 2845.5, 205], [-833.5, 2957, 250.5], [-622, 3159.5, 86.5]],
  armory: [[1041.5, 2753, 70.5], [279, 3292, 205], [709.5, 3365, 110.5]],
  library_street: [[1479, 3508, 61], [1734, 1869, -69.5], [1714, 2661, -62.5]],
  library: [[2449, 2194, -82.5], [2439, 3244, -99], [2620, 2684, 29]],
  factory_street: [[-1361, 1900, 261], [-1633, 2497, 58], [-1241, 2969, 58]],
  factory: [[-2057, 2868, 221], [-2656.5, 2450.5, 363.5], [-2147.5, 2080.5, 363.5]],
};
const ARRIVE = { store: [-313, 1530.5, 169.5], library: [2370, 2685, 105.5], library_street: [1530, 2765, 9.5], armory: [545.5, 3097, 78.5], alley_bunker: [36, 2631, -32], barracks: [-401, 2989.5, 117], factory_street: [-1345, 2577, 146], factory: [-2107.5, 2488.5, 427.5] };
const PRE_CAPTURE = [-104, 5000, 264];
// terminal (§12)
const TERM = [-3103, 21273, 0], TERM_USE = [-3107, 21245, 57], TERM_BOX = box([-3202, 21074, -2], [-3006, 21350, 142]);
const LOCK = [{ delay: 3.75, alive: 3, total: 6 }, { delay: 2.5, alive: 5, total: 9 }, { delay: 1.5, alive: 7, total: 14 }, { delay: 1.5, alive: 8, total: 16 }];
// the end (§13-16)
const CORE_BOX = box([-250.75, -396.75, -2], [60.75, -85.25, 106]), CORE_END = [-1518, -1033, 402];
const HATCH = [355, 4853, 149], ARENA_LAND = [54, -1340, 54], ARENA_USE = [54, -1440, 54];
const STAGES = ['generator', 'password', 'keys', 'scenarios', 'cores', 'escape', 'hatch', 'arena'];

export default async function setupEE(api, gk) {
  if (api.map?.id !== 'gorod-krovi') return;
  const { world, session, player, camera, scene, enemies } = api, host = api.host;
  if (api.sync && api.sync.isHost === false) return;
  const J = await sceneData();
  if (!J?.props) { console.warn('[gorod-krovi] ee: scene assets missing (run .tools/build_gk_scenes.py)'); return; }
  const mk = k => makeProp(J, k).catch(() => null);
  const tubeKeys = Object.keys(TUBES), timedKeys = Object.keys(TIMED);
  const [wallMap, shelf, stuck, keycard, core, ball, safeDoor, pile] = await Promise.all(['wall_map', 'map_shelf', 'tube', 'keycard', 'weapon_core', 'ray_ball', 'safe_door', 'burnt_pile'].map(mk));
  const levers = await Promise.all(tubeKeys.map(() => mk('tube_lever')));
  const rings = await Promise.all(CODE.map((_, i) => mk('code_ring_' + (i + 1))));
  const figs = await Promise.all(KEYS.map((_, i) => mk('key_' + (i + 1))));
  const buttons = await Promise.all(timedKeys.map(() => mk('rigged_button')));
  const warm = o => { host.warmObjects?.push(o); };

  // ---- sound and words ------------------------------------------------------------------------------------------------
  const BASE = new URL('../maps/gorod-krovi/audio/', import.meta.url).href;
  const level = v => (api.audio?.enabled === false ? 0 : Math.max(0, Math.min(1, v * (settings.volume ?? 1))));
  const sfx = (name, vol = 1, at = null, range = 3000) => {
    const d = at ? camera.position.distanceTo(at) : 0; if (d > range) return null;
    const a = new Audio(BASE + name + '.ogg'); a.volume = level(vol * (1 - d / range) ** 1.2); a.play().catch(() => {}); return a;
  };
  const loops = new Set();
  function loop(name, at = null, vol = .7, range = 2000) {
    const a = new Audio(BASE + name + '.ogg'); a.loop = true;
    const v = { a, at, vol, range, stop() { a.pause(); loops.delete(v); } };
    a.addEventListener('error', () => v.stop()); loops.add(v); a.volume = 0; a.play().catch(() => {}); return v;
  }
  const say = (m, s = 5) => api.toast?.('S.O.P.H.I.A.: ' + m, s);
  const tell = (m, s = 4) => api.toast?.(m, s);
  const S = { stage: 'generator', from: 0, log: [], paused: false, keys: new Set(), placed: new Set(), whelp: null, scen: null };
  const note = m => { S.log.push(`${(session.time ?? 0).toFixed(1)} ${m}`); if (S.log.length > 80) S.log.shift(); };

  // ---- a small scheduler: promises that resolve in the update loop, all dropped on reset (epoch) -----------------------
  const ABORT = new Error('ee reset');
  let epoch = 0;
  const waits = new Set(), tweens = new Set(), anims = new Set();
  const until = fn => new Promise((res, rej) => { waits.add({ fn, res, rej, e: epoch }); });
  const wait = s => { const t = session.time + s; return until(() => session.time >= t); };
  const nextRound = () => { const r = session.round; return until(() => session.round > r); };
  function tween(s, fn) { const tw = { t: 0, s, fn }; tweens.add(tw); fn(0); return until(() => !tweens.has(tw)); }
  function anim(P, clip) {   // a clip played once, held on its last frame
    if (!P || !play(P, clip)) return Promise.resolve();
    const a = { P, clip, t: P.dur[clip] ?? 1 }; anims.add(a); return until(() => !anims.has(a));
  }
  const people = () => gk.bosses?.kit?.players?.() ?? [{ id: 'solo', pos: player.getFeetPosition?.() ?? camera.position.clone(), down: false }];
  const living = () => people().filter(q => !q.down);
  const nP = () => Math.max(1, Math.min(4, people().length));
  const anyNear = (p, r) => living().some(q => q.pos.distanceTo(p) < r);
  const near = (at, r) => camera.position.distanceTo(at) < r + 55;
  const groundAt = p => gk.bosses?.kit?.ground?.(p) ?? p;
  const judicial = () => anyNear(W(...SOPHIA), 1500);

  // use spots: always registered, shown while on
  function spot(at, r = 64) {
    const s = { at, r, on: false, text: '', hit: false, onUse: null };
    world.addInteraction({ position: at, text: () => s.text, hidden: () => !s.on || !near(at, r), use: () => { if (!s.on || session.phase === 'reviving') return false; if (s.onUse) return s.onUse() !== false; s.hit = true; return true; } });
    return s;
  }
  async function press(s, text) { s.text = text; s.onUse = null; s.hit = false; s.on = true; try { await until(() => s.hit); } finally { s.on = false; } }
  const spots = [];
  const mkSpot = (at, r) => { const s = spot(at, r); spots.push(s); return s; };
  // shoot targets (a hit removes one: hit() re-arms it when it should stay)
  const targets = () => (world.shootTargets ??= []);
  const arm = t => { if (!targets().includes(t)) targets().push(t); return t; };
  const disarm = t => { const l = targets(), i = l.indexOf(t); if (i >= 0) l.splice(i, 1); };
  const armed = new Set();
  const shootable = (position, radius, hit) => { const t = { position, radius, hit, ee: true }; armed.add(t); return arm(t); };

  // ---- the pause --------------------------------------------------------------------------------------------------------
  const flashDiv = document.createElement('div');
  Object.assign(flashDiv.style, { position: 'fixed', inset: '0', background: '#fff', opacity: '0', pointerEvents: 'none', zIndex: 40, transition: 'opacity .25s' });
  document.body.appendChild(flashDiv);
  const flash = (hold = .3) => { flashDiv.style.opacity = '.9'; setTimeout(() => { flashDiv.style.transition = 'opacity 1.2s'; flashDiv.style.opacity = '0'; setTimeout(() => { flashDiv.style.transition = 'opacity .25s'; }, 1300); }, hold * 1000); };
  const PZ = { saved: null, restoreAfterLock: false };
  const lockdown = () => gk.pap?.state?.().state === 'active';
  function clearZombies() {
    for (const z of [...enemies.list]) {
      if (z.eeKeep || z.kind === 'nikolai' || z.health <= 0) continue;
      if (!z.tempo) { session.spawned = Math.max(0, session.spawned - 1); z.tempo = true; }   // back into the round
      enemies.hurt(z, 1e9, false, false, 'explosion', false);
    }
  }
  function pause(withFlash = true) {
    if (!S.paused) { S.paused = true; if (!lockdown()) PZ.saved = { spawn: enemies.autoSpawn, rounds: enemies.autoRounds }; }
    enemies.autoSpawn = false; enemies.autoRounds = false; clearZombies(); if (withFlash) flash(); note('pause');
  }
  function unpause() {
    if (!S.paused) return; S.paused = false; note('unpause');
    if (lockdown()) { PZ.restoreAfterLock = true; return; }
    enemies.autoSpawn = PZ.saved?.spawn ?? true; enemies.autoRounds = PZ.saved?.rounds ?? true; PZ.saved = null;
  }
  gk.on('pap:lockdown', s => {
    if (s !== 'end' && s !== 'fail') return;
    if (S.paused) { enemies.autoSpawn = false; enemies.autoRounds = false; }   // pap.js put back the values it saved
    else if (PZ.restoreAfterLock) { PZ.restoreAfterLock = false; enemies.autoSpawn = PZ.saved?.spawn ?? true; enemies.autoRounds = PZ.saved?.rounds ?? true; PZ.saved = null; }
  });

  // ---- models --------------------------------------------------------------------------------------------------------
  const metal = new THREE.MeshStandardMaterial({ color: 0x3b3f3a, roughness: .6, metalness: .7 });
  const lamp = c => new THREE.MeshBasicMaterial({ color: c });
  const OFF = 0x1a1a1a, GREEN = 0x33ff66, BLUE = 0x3399ff, RED = 0xff3322;
  const add = (o, visible = true) => { o.visible = visible; scene.add(o); moved(o); if (!visible) warm(o); return o; };
  const yawRot = (o, yaw) => { o.rotation.set(0, yaw * D, 0); };
  // the war map and its shelf
  if (wallMap) { place(wallMap, MAP, [0, 90, 0]); scene.add(wallMap.root); }
  if (shelf) { place(shelf, MAP, [0, 90, 0]); scene.add(shelf.root); }
  const glow = (n, on) => wallMap && hidePart(wallMap, 'tag_map_screen_glow_' + n, !on);
  const allGlows = on => { for (const g of [...GLOWS, 'text']) glow(g, on); };
  const shelfButton = c => { if (!shelf) return; hidePart(shelf, 'wall_map_shelf_button_green', c !== 'green'); hidePart(shelf, 'wall_map_shelf_button_red', c !== 'red'); };
  // the tube terminals (no model in the export: a box with a lamp, BO3's lever on it)
  const tubes = {};
  tubeKeys.forEach((k, i) => {
    const [o, yaw, lv, u, out] = TUBES[k];
    const g = new THREE.Group(); g.position.copy(W(...o)); yawRot(g, yaw);
    const body = new THREE.Mesh(new THREE.BoxGeometry(16, 80, 22), metal); body.position.y = 40; g.add(body);
    const m = lamp(OFF), bulb = new THREE.Mesh(new THREE.SphereGeometry(3.5, 12, 8), m); bulb.position.y = 86; g.add(bulb);
    add(g);
    const L = levers[i]; if (L) { scene.add(L.root); }
    tubes[k] = { k, g, m, lever: L, leverAt: lv, yaw, out, set: 0, pitch: 0, use: mkSpot(W(...u), 60), at: W(...o) };
  });
  const poseLever = t => { if (t.lever) place(t.lever, t.leverAt, [t.pitch, t.yaw, 0]); };
  if (stuck) { stuck.root.visible = false; scene.add(stuck.root); warm(stuck.root); }
  // the six rings, on her code wheels
  const PC = () => gk.sophia?.props?.computer, PB = () => gk.sophia?.props?.base;
  const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), qZ = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1);
  const ringState = rings.map(() => ({ step: 0, ang: 0, turning: false, t: null }));
  const poseRing = i => { const R = rings[i]; if (!R) return; qZ.setFromAxisAngle(zAxis, ringState[i].ang * D); R.root.quaternion.copy(qZ).multiply(qX); moved(R.root); };
  // figures, the debris, the safe door, the keycard, the core, the ball, the cargo, the terminal
  KEYS.forEach((k, i) => { const F = figs[i]; if (F) { place(F, k.fig, k.ang); F.root.visible = false; scene.add(F.root); warm(F.root); } });
  if (pile) { place(pile, [2664.15, 2624.27, -159]); pile.root.scale.multiplyScalar(.65); moved(pile.root); scene.add(pile.root); }
  if (safeDoor) { place(safeDoor, [-634, 3450, -148], [0, 90, 0]); scene.add(safeDoor.root); }
  if (keycard) { keycard.root.visible = false; scene.add(keycard.root); warm(keycard.root); }
  if (core) { core.root.scale.multiplyScalar(.75); core.root.visible = false; scene.add(core.root); warm(core.root); }
  const ballGroup = new THREE.Group();
  if (ball) ballGroup.add(ball.root);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false }));
  ballGroup.add(halo); add(ballGroup, false);
  const cargo = add(new THREE.Mesh(new THREE.BoxGeometry(14, 10, 10), metal), false);
  const term = new THREE.Group(); term.position.copy(W(...TERM)); yawRot(term, 90);
  { const b = new THREE.Mesh(new THREE.BoxGeometry(24, 70, 40), metal); b.position.y = 35; term.add(b); }
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(30, 18), lamp(RED)); screen.position.set(12.5, 55, 0); screen.rotation.y = Math.PI / 2; term.add(screen);
  const tLights = [0, 1, 2, 3].map(i => { const m = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 6), lamp(OFF)); m.position.set(12.5, 38, -9 + i * 6); term.add(m); return m; });
  add(term);
  // the rigged buttons
  timedKeys.forEach((k, i) => { const B = buttons[i]; if (B) { place(B, TIMED[k][0], [0, TIMED[k][1], 0]); scene.add(B.root); hold(B, 'extend', 0); } });

  function initModels() {
    allGlows(false); if (wallMap) hidePart(wallMap, 'tag_map_screen_on', true);
    shelfButton('off'); for (let n = 1; n <= 6; n++) shelf && hidePart(shelf, `wall_map_shelf_figure_0${n}`, true);
    if (shelf) hold(shelf, 'drawer_close', shelf.dur.drawer_close ?? .5);
    for (const t of Object.values(tubes)) { t.m.color.setHex(OFF); t.set = 0; t.pitch = LEVER_PITCH[0]; poseLever(t); }
    if (stuck) { stuck.root.visible = false; hidePart(stuck, 'cyliinder_link_jnt', false); }
    for (const R of rings) if (R) { R.root.removeFromParent(); R.root.visible = false; }
    for (const F of figs) if (F) F.root.visible = false;
    if (pile) pile.root.visible = true;
    if (safeDoor) { place(safeDoor, [-634, 3450, -148], [0, 90, 0]); }
    for (const o of [keycard?.root, core?.root, ballGroup, cargo]) if (o) o.visible = false;
    screen.material.color.setHex(RED); for (const l of tLights) l.material.color.setHex(OFF);
    buttons.forEach(B => B && hold(B, 'extend', 0));
  }

  // ---- the generator and the tubes (§3) -----------------------------------------------------------------------------
  const G = { charged: false, on: false, until: 0, loop: null, kills: false };
  const T = { order: [], solved: false, flowing: new Set(), lit: false };
  const genSpot = mkSpot(W(...GEN), 100);
  gk.on('boss:death', (kind, z) => {
    if (kind === 'sentinel' && G.kills && !G.charged && z?.root && GEN_BOX.containsPoint(z.root.position)) { G.charged = true; sfx('tube_imp', .9, W(...GEN)); note('generator charged'); }
  });
  const walk = () => { const seen = [T.order[0]]; let c = T.order[0]; for (let i = 0; i < 5; i++) { c = tubes[c].out[tubes[c].set]; if (seen.includes(c)) break; seen.push(c); } return seen; };
  const isSolved = () => { const w = walk(); return w.length === 6 && w[5] === T.order[5]; };
  function solvable() {   // some setting of the six levers solves it (3^6 tries)
    const keep = tubeKeys.map(k => tubes[k].set);
    let ok = false;
    for (let n = 0; n < 729 && !ok; n++) { let m = n; for (const k of tubeKeys) { tubes[k].set = m % 3; m = Math.floor(m / 3); } ok = isSolved(); }
    tubeKeys.forEach((k, i) => { tubes[k].set = keep[i]; });
    return ok;
  }
  function shuffleTubes() {
    do T.order = shuffle(tubeKeys); while (!solvable());
    do for (const k of tubeKeys) tubes[k].set = Math.floor(Math.random() * 3); while (isSolved());
    for (const t of Object.values(tubes)) { t.pitch = LEVER_PITCH[t.set]; poseLever(t); }
    note('tubes ' + T.order.join(' > '));
  }
  function showFlow() {
    const w = T.lit ? walk() : [];
    for (const t of Object.values(tubes)) t.m.color.setHex(!T.lit ? OFF : t.k === T.order[0] ? GREEN : w.includes(t.k) ? BLUE : OFF);
  }
  function tubesPower(on) {
    T.lit = on; showFlow();
    T.air?.stop(); T.air = on ? loop('tube_airflow', tubes[T.order[0]].at, .5, 900) : null;
    const s = tubes[T.order[5]];
    if (stuck) { if (on && !T.solved) { place(stuck, s.at.toArray ? [s.at.x, -s.at.z, s.at.y] : s.at, [0, s.yaw, 0]); stuck.root.visible = true; play(stuck, 'idle', { loop: true }); anims.add({ P: stuck, clip: 'idle', t: 1e9, loop: true }); } else { for (const a of anims) if (a.P === stuck && a.loop) anims.delete(a); } }
  }
  function pull(t) {
    if (!G.on || T.solved || t.busy) return false;
    t.busy = true; t.set = (t.set + 1) % 3; sfx('tube_lever', .8, t.at, 1200);
    const p0 = t.pitch; tween(.5, k => { t.pitch = p0 + 120 * k; poseLever(t); }).then(() => { t.pitch %= 360; t.busy = false; }, () => {});
    showFlow();
    if (isSolved()) { T.solved = true; note('tubes solved'); }
    return true;
  }
  async function stGenerator() {
    G.kills = true; tell('Something in Pavlov\'s basement hums, waiting for a charge', 4);
    await until(() => G.charged); G.kills = false;
    await wait(2); gk.setFlag('generator_charged'); shuffleTubes();
    for (const t of Object.values(tubes)) { t.use.text = 'Pull the lever'; t.use.onUse = () => pull(t); }
    const tarp = gk.scenes?.props?.tarp;
    let first = true;
    const gen = (async () => {
      while (!T.solved) {
        if (!first) { await nextRound(); if (T.solved) break; await press(genSpot, 'Start the generator'); }
        first = false;
        G.on = true; gk.setFlag('generator_on'); G.until = session.time + 360; sfx('gen_start', .9, W(...GEN)); G.loop = loop('gen_lp', W(...GEN), .6, 1500);
        if (tarp) play(tarp, 'start', { then: 'idle' });
        for (const t of Object.values(tubes)) t.use.on = true;
        tubesPower(true);
        if (!S.tubeHint) { S.tubeHint = true; say('Power to the tube network. Route the air from the green terminal through every station to the jammed one.', 7); }
        await until(() => T.solved || session.time >= G.until);
        G.on = false; gk.clearFlag('generator_on'); G.loop?.stop(); G.loop = null;
        for (const t of Object.values(tubes)) t.use.on = false;
        if (!T.solved) { sfx('gen_stop', .9, W(...GEN)); if (tarp) play(tarp, 'end'); tubesPower(false); tell('The generator winds down', 3); }
      }
    })();
    gen.catch(() => {});
    await until(() => T.solved);
    gk.setFlag('tube_puzzle_complete'); tubesPower(false); T.lit = true; showFlow();
    const s = tubes[T.order[5]];
    sfx('tube_shake', .9, s.at); await anim(stuck, 'drop'); sfx('tube_door', .9, s.at);
    tell('Something dropped out of the jammed tube', 3);
    const take = mkSpot(s.at.clone().add(new THREE.Vector3(0, 40, 0)), 80);
    await press(take, 'Take the master cylinder');
    if (stuck) hidePart(stuck, 'cyliinder_link_jnt', true);
    sfx('card_pickup', .9); gk.setFlag('ee_cylinder_acquired'); note('cylinder');
    T.lit = false; showFlow(); await gen.catch(() => {});
  }

  // ---- the password (§4) ----------------------------------------------------------------------------------------------
  const soph = mkSpot(W(...SOPHIA), 100);
  const wheel = i => PC()?.bones[`code_wheel_0${i + 1}_jnt`];
  function ringHit(i) {
    const R = ringState[i];
    if (R.turning) return;
    R.turning = true; R.step = (R.step + 1) % 8; sfx('soph_ratchet', .8, W(...SOPHIA), 1200);
    const a0 = R.ang;
    tween(.5, k => { R.ang = a0 + 45 * k; poseRing(i); }).then(() => { R.ang %= 360; R.turning = false; if (R.t) arm(R.t); }, () => {});
  }
  async function stPassword() {
    say('Authorisation required. Bring me the master cylinder.', 4);
    await press(soph, 'Insert the master cylinder');
    const P = PC();
    hidePart(P, 'slot_decoder_jnt', false); sfx('soph_slot_open', .9, W(...SOPHIA));
    say('Master cylinder accepted. Authorisation code needed.', 5);
    await anim(P, 'code_door_open'); hidePart(P, 'button_green_jnt', false); hidePart(P, 'button_red_jnt', true);
    P?.root.updateMatrixWorld(true);
    do ringState.forEach(r => { r.step = Math.floor(Math.random() * 8); }); while (ringState.every((r, i) => r.step === CODE[i]));
    rings.forEach((R, i) => {
      const b = wheel(i); if (!R || !b) return;
      ringState[i].ang = ringState[i].step * 45; b.add(R.root); R.root.position.set(0, 0, 0); R.root.visible = true; poseRing(i);
      const at = b.getWorldPosition(new THREE.Vector3());
      ringState[i].t = shootable(at, 6, () => ringHit(i));
    });
    globalThis.kino?.staticFreeze?.thaw?.(P?.root);
    sfx('soph_ring_open', .9, W(...SOPHIA));
    say(`The code is the one Doctor Groph left me: ${CODE.join(' ')}. Turn my rings, left to right, then confirm.`, 9);
    for (;;) {
      await press(soph, 'Confirm the password');
      if (ringState.every((r, i) => r.step === CODE[i] && !r.turning)) break;
      sfx('ui_deny', .9); say('Incorrect. Security lockout until the next wave.', 4); note('wrong code ' + ringState.map(r => r.step).join(''));
      await nextRound(); say('Lockout lifted.', 3);
    }
    for (const r of ringState) if (r.t) { disarm(r.t); armed.delete(r.t); r.t = null; }
    sfx('soph_ring_close', .9, W(...SOPHIA)); await anim(P, 'code_door_close');
    for (const R of rings) if (R) { R.root.removeFromParent(); R.root.visible = false; }
    pause(); say('Authorisation confirmed. Welcome back. Now find the six figures for the war map.', 6);
    await wait(.5); gk.setFlag('key_placement'); note('password');
  }

  // ---- the keys (§5) ------------------------------------------------------------------------------------------------
  const keyAt = KEYS.map(k => W(...k.at));
  const keySpots = KEYS.map((k, i) => mkSpot(W(...k.fig).add(new THREE.Vector3(0, 10, 0)), 70));
  function reveal(i) {
    const F = figs[i], k = KEYS[i];
    if (S.keys.has(i) || keySpots[i].on || S.revealed?.has(i)) return;
    (S.revealed ??= new Set()).add(i);
    if (F) { if (k.ground) { const g = groundAt(W(...k.fig)); F.root.position.copy(g).add(new THREE.Vector3(0, 4, 0)); moved(F.root); keySpots[i].at.copy(F.root.position); } F.root.visible = true; }
    sfx('key_swirl', .8, keySpots[i].at); note('figure ' + k.name);
    const s = keySpots[i]; s.text = 'Take the figure'; s.on = true;
    s.onUse = () => {
      s.on = false; if (F) F.root.visible = false; S.keys.add(i); sfx('key_imp_' + i, .9);
      tell(`War map figure ${S.keys.size} of 6`, 3);
      if (S.keys.size === 6 && gk.hasFlag('key_placement')) say('All six. Put them on my map.', 4);
      return true;
    };
  }
  function armKeys() {
    shootable(keyAt[0], 40, () => reveal(0));
    shootable(keyAt[4], 40, () => { const sw = gk.scenes?.props?.sewer_switch; if (sw) play(sw, 'flip'); sfx('key_window', .8, keyAt[4]); reveal(4); });
  }
  gk.on('strike:called', e => { if (e?.at && e.at.distanceTo(keyAt[1]) < 350) setTimeout(() => { if (S.armedKeys) reveal(1); }, 3000); });
  gk.on('trap:done', e => { if (e?.id === 'eye_library' && !S.revealed?.has(2)) { if (pile) pile.root.visible = false; reveal(2); } });
  gk.on('shield:breath', e => {
    if (!e?.origin || S.revealed?.has(3)) return;
    const to = keyAt[3].clone().sub(e.origin), d = to.length();
    if (d < 600 && (!e.dir || to.normalize().dot(e.dir) > 0)) reveal(3);
  });
  gk.on('gauntlet:melee', e => {
    if (!e?.origin || S.revealed?.has(5) || e.origin.distanceTo(keyAt[5]) > 140) return;
    sfx('key_window', .9, keyAt[5]);
    if (safeDoor) { const y0 = 90; tween(.6, k => { place(safeDoor, [-634, 3450, -148], [0, y0 + 100 * k, 0]); }).catch(() => {}); }
    reveal(5);
  });
  async function stKeys() {
    if (wallMap) hidePart(wallMap, 'tag_map_screen_on', false);
    glow('text', true); shelfButton('green'); unpause();
    const btn = mkSpot(W(...MAP_BUTTON), 64);
    btn.text = 'Place the figures'; btn.on = true;
    btn.onUse = () => {
      const fresh = [...S.keys].filter(i => !S.placed.has(i));
      if (!fresh.length) { sfx('ui_deny', .6); tell(`${S.placed.size} of 6 figures placed`, 2); return true; }
      for (const i of fresh) { S.placed.add(i); shelf && hidePart(shelf, `wall_map_shelf_figure_0${i + 1}`, false); }
      sfx(S.placed.size === 6 ? 'ui_finish_all' : 'ui_finish', .9, W(...MAP_BUTTON)); tell(`${S.placed.size} of 6 figures on the map`, 3);
      return true;
    };
    try { await until(() => S.placed.size === 6); } finally { btn.on = false; }
    gk.setFlag('keys_placed'); note('keys placed');
  }

  // ---- the scenarios (§6) -------------------------------------------------------------------------------------------
  const mapBtn = mkSpot(W(...MAP_BUTTON), 64);
  async function blink(names, n = 3) { for (let i = 0; i < n; i++) { for (const g of names) glow(g, true); sfx('ui_beep', .5, W(...MAP_BUTTON)); await wait(.4); for (const g of names) glow(g, false); await wait(.3); } }
  async function sweep() {
    const six = GLOWS.slice(0, 6);
    for (const g of [...six, ...six.slice().reverse()]) { glow(g, true); sfx('ui_beep', .3, W(...MAP_BUTTON)); await wait(.08); glow(g, false); }
  }
  async function grab(obj, kill) {   // the magnet over the map room takes it up into the cage
    const P = gk.scenes?.props?.raz_cage, at = W(...CAPTURE);
    if (!P || !play(P, 'grab')) { kill?.(); return; }
    sfx('magneto_start', .9, at); const lp = loop('magneto_loop', at, .7, 1500);
    const link = P.bones.link_jnt, v = new THREE.Vector3(), t0 = session.time, dur = P.dur.grab ?? 5.87;
    let caught = false;
    await until(() => {
      const k = (session.time - t0) / dur;
      if (link) { link.getWorldPosition(v); if (!caught && (v.distanceTo(obj.position) < 70 || k > .5)) { caught = true; sfx('magneto_grab', .9, at); } if (caught) { obj.position.copy(v); moved(obj); } }
      return k >= 1;
    });
    lp.stop(); sfx('magneto_end', .8, at); kill?.();
  }
  const killQuiet = z => { if (!z || !enemies.list.includes(z)) return; z.eeDone = true; z.eeEscort = false; z.root.visible = false; enemies.hurt(z, 1e9, false, false, 'explosion', false); };

  // pod defence (§7)
  const C = { area: null, phase: null, whelp: null, carried: false };
  async function scPod(fails) {
    if (!gk.pods?.callEE || gk.pods.busy?.()) { say('A supply pod is already down. Clear it first.', 4); return false; }
    const perched = DRAGON_AREA[gk.dragon?.state?.().site] ?? null;
    const keys = Object.keys(PODS).filter(k => !k.startsWith(perched ?? '#') && !S.podsUsed?.has(k));
    const key = pick(keys.length ? keys : Object.keys(PODS)), area = key.replace(/\d$/, ''), [o, yaw, hs] = PODS[key];
    await blink([POD_GLOW[area]]);
    say(fails ? 'The cargo drop again. Hold the pod this time.' : `Cargo drop, ${area} district. Defend the pod, then bring me what it carries.`, 6);
    const R = { done: null }, n = living().length || 1;
    const site = { id: 'ee_' + key, origin: o, harass: hs.map(p => ({ p: W(...p), yaw: 0 })) };
    const ok = gk.pods.callEE(site, { need: 25 + 5 * n, harassers: () => 2 + 4 * (living().length || 1), box: POD_VOL[area], yaw, onWin: at => { R.done = { win: true, at }; }, onLose: () => { R.done = { win: false }; } });
    if (!ok) return false;
    await until(() => R.done);
    if (!R.done.win) { say('The pod is lost.', 3); return false; }
    unpause();
    cargo.position.copy(R.done.at); cargo.rotation.set(0, 0, Math.PI / 2); cargo.visible = true; moved(cargo);
    say('Cargo recovered by the pod. Send the whelp for it from the high ground. Thirty seconds.', 6);
    C.area = area; C.phase = 'wait'; C.whelp = null;
    const until30 = session.time + 30;
    S.whelp = w => {
      if (C.phase !== 'wait' || !FETCH[area].containsPoint(camera.position)) return;
      C.phase = 'fetch'; C.whelp = w; note('whelp fetches cargo');
      const drop = W(...DROP[area]);
      w.ee = { goal: cargo.position.clone(), speed: 420, tick: (w, dt, d) => {
        if (C.phase === 'fetch' && d < 30) { C.phase = 'carry'; w.ee.goal = drop; sfx('card_pickup', .7, cargo.position); }
        if (C.phase === 'carry') { cargo.position.copy(w.g.position).add(new THREE.Vector3(0, -14, 0)); moved(cargo); if (d < 30) { C.phase = 'dropped'; w.ee = null; } }
      } };
    };
    try {
      await until(() => C.phase === 'dropped' || (C.phase === 'wait' && session.time > until30) || ((C.phase === 'fetch' || C.phase === 'carry') && C.whelp?.dead));
    } finally { S.whelp = null; }
    if (C.phase !== 'dropped') { cargo.visible = false; sfx('tube_imp', .9, cargo.position); say('The cargo is gone.', 3); C.phase = null; return false; }
    cargo.position.copy(groundAt(W(...DROP[area]))).add(new THREE.Vector3(0, 6, 0)); moved(cargo);
    const tumble = tween(1e6, () => { cargo.rotation.x += .01; cargo.rotation.y += .013; moved(cargo); });
    const take = mkSpot(cargo.position.clone(), 80);
    await press(take, 'Take the cargo');
    cargo.visible = false; sfx('card_pickup', .9); C.carried = true; tumble.catch(() => {});
    for (const tw of tweens) if (tw.s === 1e6) tweens.delete(tw);
    say('Bring it to my drawer.', 3);
    await press(soph, 'Put the cargo in the drawer');
    C.carried = false; sfx('soph_drawer_open', .9, W(...SOPHIA)); await anim(PC(), 'drawer_open'); await wait(.6);
    sfx('soph_drawer_close', .9, W(...SOPHIA)); await anim(PC(), 'drawer_close');
    (S.podsUsed ??= new Set()).add(key); pause(); say('Cargo received. Thank you.', 4);
    return true;
  }

  // escort (§8)
  async function scEscort(fails) {
    await blink(['square']);
    say(fails ? 'Another Valkyrie at the start. Keep it moving this time.' : 'One of my Valkyries is damaged. Escort it from the start to the cage over my room. Stay close or it stops.', 7);
    unpause();
    const at = W(...ESC_SPAWN), z = gk.bosses?.spawn?.('sentinel', { at, count: false, points: false, extra: { eeKeep: true, eeEscort: true } });
    if (!z) return false;
    z.root.position.copy(at); z.state = 'fly'; z.vel?.set(0, 0, 0);
    for (const b of ['tag_arm_left_01', 'tag_arm_right_01', 'tag_arm_top_01']) hideBone(z.bones?.get?.(b));
    const E = { z, hp: ESC_HP, path: [], i: 0, moving: false, stopAt: session.time, check: 0, dead: false, warned: 1 };
    const off = gk.on('boss:death', (k, d) => { if (d === z && !z.eeDone) E.dead = true; });
    const goLeg = name => { E.path = ESC[name].map(p => W(...p)); E.i = 0; };
    z.ee = (zz, dt) => {
      if (!E.path.length || E.i >= E.path.length || !E.moving) return false;
      const g = E.path[E.i]; if (zz.root.position.distanceTo(g) < 24) { E.i++; return false; }
      return { at: g, speed: 88 };
    };
    const legDone = () => E.i >= E.path.length;
    const tickHp = dt => {   // zombies near it wear it down
      let n = 0; for (const q of enemies.list) if (!q.special && q.health > 0 && q.root.position.distanceTo(z.root.position) < 90) n++;
      if (n) { E.hp -= 30 * n * dt; const f = E.hp / ESC_HP; if (f < E.warned - .25) { E.warned = f; tell(`The Valkyrie is under attack · ${Math.max(0, Math.round(f * 100))}%`, 2); } }
      if (E.hp <= 0 && !E.dead) { z.eeEscort = false; enemies.hurt(z, 1e9, false, false, 'explosion', false); E.dead = true; }
    };
    let last = session.time;
    const step1 = () => { const dt = session.time - last; last = session.time; tickHp(dt); return E.dead; };
    try {
      await until(() => step1() || anyNear(W(412.735, -34.68, 40), 900) || anyNear(at, 700));
      if (E.dead) return false;
      goLeg('entrance'); E.moving = true; tell('The Valkyrie is moving', 2);
      await until(() => step1() || legDone()); if (E.dead) return false;
      const legs = ['store', null, 'command'];
      for (let L = 0; L < legs.length; L++) {
        let name = legs[L];
        if (!name) {
          const doorOpen = zn => [...world.doors.values()].some(d => d.zone === zn && world.isOpen(d, session));
          if (!doorOpen('depttoyellow') && !doorOpen('departmentfloor3toredbrickopen')) say('Open a way on from the store: the yellow house or the red brick door.', 5);
          E.moving = false; E.stopAt = session.time;
          await until(() => step1() || doorOpen('depttoyellow') || doorOpen('departmentfloor3toredbrickopen')); if (E.dead) return false;
          const y = doorOpen('depttoyellow'), r = doorOpen('departmentfloor3toredbrickopen');
          name = !y ? 'barracks' : !r ? 'armory' : (Math.random() < .5 ? 'barracks' : 'armory');
        }
        goLeg(name); E.stopAt = session.time;
        const res = await until(() => {
          if (step1()) return 'dead';
          if (legDone()) return 'done';
          if ((E.check -= 1 / 60) <= 0) {
            E.check = 1; const was = E.moving; E.moving = anyNear(z.root.position, 200);
            if (was && !E.moving) E.stopAt = session.time;
            if (!E.moving && session.time - E.stopAt > 60) return 'timeout';
            if (!E.moving && session.time - E.stopAt > 45 && !E.nag) { E.nag = true; tell('The Valkyrie is waiting for you', 3); }
            if (E.moving) E.nag = false;
          }
          return false;
        });
        if (res !== 'done') { if (res === 'timeout') { z.eeEscort = false; enemies.hurt(z, 1e9, false, false, 'explosion', false); } return false; }
      }
      E.moving = false; z.ee = () => false; pause(false);
      await grab(z.root, () => killQuiet(z));
      say('Valkyrie secured. Well done.', 4); return true;
    } finally { off(); if (!z.eeDone && enemies.list.includes(z) && !E.dead) killQuiet(z); }
  }

  // the Mangler (§9)
  async function scMangler(fails) {
    if (!fails) say('Bring me a Mangler alive. Lead it to the trap under the cage, and do not kill it.', 6);
    else say('Another Mangler. Alive, please.', 4);
    unpause();
    const [p, yaw] = pick(RAZ_AT), z = gk.bosses?.spawn?.('raz', { at: W(...p), yaw: yaw * D, count: false, points: false, extra: { eeKeep: true } });
    if (!z) return false;
    const M = { dead: false, check: 0, hunt: true, out: false };
    const off = gk.on('boss:death', (k, d) => { if (d === z && !z.eeDone) M.dead = true; });
    const trap = W(...RAZ_TRAP), esc = W(...RAZ_ESCAPE);
    z.ee = (zz, dt) => {
      if (zz.t < 3) return null;   // its emerge
      if (M.caught) return zz.root.position.distanceTo(W(...CAPTURE)) > 20 ? { at: W(...CAPTURE) } : false;
      if (zz.root.position.distanceTo(trap) < 70 && Math.abs(zz.root.position.y - trap.y) < 120) { M.caught = true; return false; }
      if ((M.check -= dt) <= 0) { M.check = 1; M.hunt = anyNear(zz.root.position, 450); }
      if (M.hunt) return null;
      if (zz.root.position.distanceTo(esc) < 60) { M.out = true; return false; }
      return { at: esc };
    };
    try {
      await until(() => M.dead || M.out || M.caught);
      if (!M.caught) { if (M.out) { say('It got away.', 3); killQuiet(z); } return false; }
      pause(false); await wait(1.5);
      z.ee = () => false;
      await grab(z.root, () => killQuiet(z));
      say('Mangler contained. Fascinating.', 4); return true;
    } finally { off(); if (!z.eeDone && enemies.list.includes(z) && !M.dead) killQuiet(z); }
  }

  // the security system (§10)
  const timedSpots = timedKeys.map(k => mkSpot(W(...TIMED[k][0]).add(new THREE.Vector3(0, 10, 0)), 64));
  async function scTimed(fails) {
    const order = shuffle(timedKeys);
    for (let i = 0; i < 4; i++) { allGlows(true); await wait(.4); allGlows(false); await wait(.4); }
    for (let i = 0; i < 8; i++) { glow(pick(timedKeys), true); await wait(.1); allGlows(false); }
    await wait(.5);
    for (const k of order) { glow(k, true); sfx('ui_beep', .6, W(...MAP_BUTTON)); await wait(.4); glow(k, false); await wait(.3); }
    await blink(GLOWS, 3);
    const secs = [180, 120, 90, 60][nP() - 1];
    say(fails ? 'The security system again. Same rules, new order.' : `Security test. Press the six rigged buttons in the order my map showed. ${secs} seconds.`, 6);
    unpause();
    const alarms = [];
    timedKeys.forEach((k, i) => { anim(buttons[i], 'extend').catch(() => {}); alarms.push(loop('rb_alarm_lp', W(...TIMED[k][0]), .4, 900)); sfx('rb_open', .8, W(...TIMED[k][0])); });
    const st = { i: 0, bad: false }, end = session.time + secs;
    timedSpots.forEach((s, i) => { s.text = 'Press the button'; s.on = true; s.onUse = () => {
      s.on = false; alarms[i].stop();
      if (timedKeys[i] === order[st.i]) { st.i++; sfx('ui_select', .9, s.at); sfx('rb_close', .8, s.at); anim(buttons[i], 'retract').catch(() => {}); }
      else { st.bad = true; sfx('ui_deny', 1, s.at); }
      return true;
    }; });
    const tick = loop('sonar_lp', null, .25);
    let marks = new Set();
    try {
      await until(() => {
        const left = end - session.time;
        for (const m of [120, 60, 30, 10]) if (left <= m && !marks.has(m) && secs > m) { marks.add(m); tell(`${m} seconds`, 2); sfx(m === 30 ? 'cd_30s' : 'cd_click', .8); }
        if (left <= 3 && !marks.has(3)) { marks.add(3); sfx('cd_3s', .8); }
        return st.bad || st.i >= 6 || left <= 0;
      });
    } finally { tick.stop(); for (const a of alarms) a.stop(); for (const s of timedSpots) s.on = false; }
    if (st.i >= 6) { sfx('cd_stop', .8); say('Security test passed.', 4); pause(); return true; }
    sfx('cd_click_close', 1);
    const pts = timedKeys.map(k => W(...TIMED[k][0]));
    for (const q of living()) if (pts.some(p => p.distanceTo(q.pos) < 500)) gk.bosses?.kit?.hitPlayer?.(q.id, 1e4, 'ee:blast');
    for (const p of pts) sfx('tube_imp', 1, p, 1500);
    say(st.bad ? 'Wrong sequence. Countermeasures engaged.' : 'Time. Countermeasures engaged.', 4);
    await wait(1); buttons.forEach(B => anim(B, 'retract').catch(() => {}));
    return false;
  }

  // the anomaly (§11)
  async function scPursue(fails) {
    say(fails ? 'The anomaly is loose again. Only charged weapons touch it.' : 'An anomaly from Group 935\'s work. Hit it with Pack-a-Punched weapons and it will flee. Wear it down three times.', 7);
    unpause();
    const all = Object.entries(BALL).flatMap(([a, l]) => l.map(p => ({ a, p: W(...p) })));
    let pool = all.slice(), cur = pick(all), last = [cur.a];
    const pos = ballGroup.position.copy(cur.p); ballGroup.visible = true; moved(ballGroup);
    const hum = loop('gersh_lp', pos, .6, 1200);
    const hpStep = 6500 + 1000 * (living().length || 1);
    const B = { step: 0, hp: hpStep, lastHit: session.time, hit: false, warned: false, moving: false };
    const t = shootable(pos, 18, () => {
      arm(t);
      if (!session.weapon?.upgraded) { if (!B.warned) { B.warned = true; tell('Only Pack-a-Punched weapons hurt it', 3); } return; }
      B.lastHit = session.time; B.hp -= session.def?.damage ?? 100; B.hit = true;
      if (B.hp <= 0 && B.step < 3) { B.step++; B.hp = hpStep; B.stepDone = true; sfx('key_imp_3', .9, pos); tell(`The anomaly weakens · ${B.step} of 3`, 3); }
    });
    const fly = async (to, speed) => {
      B.moving = true; const from = pos.clone(), d = from.distanceTo(to), s = Math.max(.3, d / speed);
      await tween(s, k => { const e = k * k * (3 - 2 * k); pos.lerpVectors(from, to, e); moved(ballGroup); });
      B.moving = false;
    };
    const nextSpot = () => {
      let c = pool.filter(x => !last.includes(x.a) && x.p.distanceTo(pos) > 1750);
      if (!c.length) { pool = all.slice(); c = pool.filter(x => !last.includes(x.a) && x.p.distanceTo(pos) > 1750); }
      if (!c.length) c = all.filter(x => x.a !== cur.a);
      const n = pick(c); pool.splice(pool.indexOf(n), 1); last = [n.a, ...last].slice(0, 3); return n;
    };
    try {
      let first = true;
      while (B.step < 3) {
        const waitEnd = session.time + 20 + Math.random() * 10; B.hit = false;
        const r = await until(() => (session.time - B.lastHit > 120 ? 'fail' : B.hit || session.time >= waitEnd ? 'go' : false));
        if (r === 'fail') { say('The anomaly has slipped away.', 3); return false; }
        if (B.step >= 3) break;
        const n = nextSpot(), speed = B.stepDone ? 300 : first ? 188 : 148; B.stepDone = false; first = false;
        sfx('soph_takeoff', .8, pos);
        if (B.hit || speed > 148) {   // flee: to the area's arrival point, nine quick hops, then the spot
          await fly(W(...ARRIVE[n.a]), speed);
          for (let i = 0; i < 9; i++) await fly(W(...ARRIVE[n.a]).add(new THREE.Vector3((Math.random() - .5) * 400, (Math.random() - .5) * 100, (Math.random() - .5) * 400)), 1500);
        }
        await fly(n.p, speed); cur = n;
      }
      disarm(t);
      say('Splendid. It is coming home.', 4);
      await fly(W(...PRE_CAPTURE), pos.distanceTo(W(...PRE_CAPTURE)) / 12);
      await until(() => judicial());
      pause(false);
      await fly(W(...CAPTURE).add(new THREE.Vector3(0, 48, 0)), pos.distanceTo(W(...CAPTURE)) / 4 + 1);
      await grab(ballGroup, () => { ballGroup.visible = false; });
      say('Anomaly contained.', 3); return true;
    } finally { hum.stop(); disarm(t); armed.delete(t); if (!B.done) ballGroup.visible = false; sfx('gersh_off', .6, pos); }
  }

  // the data download (§12)
  const termSpot = mkSpot(W(...TERM_USE), 100);
  async function scTerminal() {
    say('Last task. Take the keycard from my shelf to the data terminal at Pavlov\'s House.', 6);
    unpause();
    if (shelf && keycard) {
      shelf.root.updateMatrixWorld(true); const door = shelf.bones.wall_map_shelf_door;
      const p = door ? door.getWorldPosition(new THREE.Vector3()) : W(...MAP); keycard.root.position.copy(p); keycard.root.rotation.set(0, Math.PI / 2, 0); keycard.root.visible = true; moved(keycard.root);
      sfx('soph_drawer_open', .8, p); await anim(shelf, 'drawer_open');
    }
    const card = mkSpot(keycard?.root.position.clone() ?? W(...MAP_BUTTON), 70);
    await press(card, 'Take the keycard');
    if (keycard) keycard.root.visible = false; sfx('card_pickup', .9); anim(shelf, 'drawer_close').catch(() => {});
    tell('Use the data terminal at Pavlov\'s House, everyone in the room', 4);
    await press(termSpot, 'Insert the keycard');
    sfx('card_activate', .9, W(...TERM)); screen.material.color.setHex(RED);
    const lit = () => { const n = living().length || 1, inside = living().filter(q => TERM_BOX.containsPoint(q.pos.clone().add(new THREE.Vector3(0, 30, 0)))).length; tLights.forEach((l, i) => l.material.color.setHex(i < 4 - n + inside ? GREEN : RED)); return inside >= n; };
    await until(() => lit());
    screen.material.color.setHex(GREEN); sfx('hack_start', .9, W(...TERM)); const hl = loop('hack_lp', W(...TERM), .5, 1500);
    say('Download started. Hold the house for three minutes.', 5);
    const n = Math.max(1, Math.min(4, living().length || 1));
    gk.pap?.start?.({ razOnly: () => ({ total: LOCK[n - 1].total, alive: LOCK[n - 1].alive, delay: LOCK[n - 1].delay }), waves: [] }, { name: 'ee' });
    const t0 = session.time; let shown = 0;
    try {
      await until(() => { const e = session.time - t0; if (Math.floor(e / 30) > shown) { shown = Math.floor(e / 30); tell(`Download ${Math.min(100, Math.round(e / 1.8))}%`, 2); } return e >= 180; });
    } finally { hl.stop(); }
    if (gk.pap?.state?.().state === 'active') gk.pap.finish();
    sfx('hack_success', .9, W(...TERM)); screen.material.color.setHex(RED); tLights.forEach(l => l.material.color.setHex(OFF));
    say('Download complete. Return my keycard to the drawer.', 5);
    await press(termSpot, 'Take the keycard');
    sfx('card_pickup', .9);
    await press(soph, 'Put the keycard in the drawer');
    sfx('soph_drawer_open', .9, W(...SOPHIA)); await anim(PC(), 'drawer_open'); await wait(.5); sfx('soph_drawer_close', .9, W(...SOPHIA)); await anim(PC(), 'drawer_close');
    pause(); say('Every task is done. I am ready.', 4);
    return true;
  }

  const SCEN = { pod: scPod, escort: scEscort, mangler: scMangler, timed: scTimed, pursue: scPursue, terminal: scTerminal };
  async function stScenarios() {
    shelfButton('off'); pause(); say('The figures are in place. Now prove yourselves: six tasks. Use the button beside the map.', 6);
    await wait(2); unpause();
    let order;
    do order = shuffle(['pod', 'escort', 'mangler', 'timed', 'pursue']); while (order.some((k, i) => (k === 'escort' && (order[i + 1] === 'mangler' || order[i - 1] === 'mangler'))));
    order.push('terminal'); S.order = order; note('scenarios ' + order.join(' '));
    let i = 0, fails = 0, prevOk = true;
    while (i < order.length) {
      shelfButton(gk.bosses?.sentinelRound?.().active || lockdown() ? 'red' : 'green');
      mapBtn.text = 'Start the next task'; mapBtn.hit = false; mapBtn.on = true;
      mapBtn.onUse = () => {
        if (gk.bosses?.sentinelRound?.().active || lockdown() || session.phase === 'reviving') { sfx('ui_deny', .8, W(...MAP_BUTTON)); tell('Not now', 2); return true; }
        mapBtn.hit = true; return true;
      };
      await until(() => { shelfButton(gk.bosses?.sentinelRound?.().active || lockdown() ? 'red' : 'green'); return mapBtn.hit; });
      mapBtn.on = false; shelfButton('off');
      const k = order[i]; S.scen = k;
      sfx('ui_select', .9, W(...MAP_BUTTON)); pause(); note('scenario ' + k + ' try ' + (fails + 1));
      if (prevOk) await sweep();
      api.announce?.(SC_NAMES[k].toUpperCase(), `Task ${i + 1} of 6`, 3); gk.setFlag('ee_round');
      let ok = false;
      try { ok = await SCEN[k](fails); } catch (e) { if (e === ABORT) throw e; console.error('[gorod-krovi] ee scenario ' + k, e); ok = false; }
      gk.clearFlag('ee_round'); S.scen = null; prevOk = ok;
      if (ok) { i++; fails = 0; sfx(i === 6 ? 'ui_finish_all' : 'ui_yay', .9); tell(`Task ${i} of 6 complete`, 3); note('done ' + k); unpause(); }
      else {
        fails++; sfx('ui_deny', 1); note('failed ' + k);
        say(['Disappointing. We will try again after the next wave.', 'Again? After the next wave, then.', 'I am losing patience. Next wave.'][Math.min(2, fails - 1)], 4);
        unpause(); await nextRound();
      }
    }
    gk.setFlag('scenarios_complete');
  }

  // ---- the core, her escape, the hatch, the arena (§13-16) ---------------------------------------------------------
  async function stCores() {
    pause(); say('You have done everything I asked. Take this weapon core to Nikolai\'s machine. Your whelp can carry it.', 7);
    const P = PC(); if (P) P.root.updateMatrixWorld(true);
    const b = P?.bones.tag_weapon_cores, at = b ? b.getWorldPosition(new THREE.Vector3()).add(W(0, 3, 2)) : W(...SOPHIA);
    if (core) { core.root.position.copy(at); core.root.visible = true; moved(core.root); }
    sfx('soph_core_door', .9, W(...SOPHIA)); await anim(P, 'core_door_open'); unpause();
    const take = mkSpot(at.clone(), 100);
    await press(take, 'Take the weapon core');
    if (core) core.root.visible = false; sfx('card_pickup', .9);
    tell('Release the whelp in the square by the start to deliver the core', 5);
    const goal = W(...CORE_END);
    const R = { phase: 'wait', w: null };
    S.whelp = w => {
      if (R.phase !== 'wait' || !CORE_BOX.containsPoint(camera.position.clone().add(new THREE.Vector3(0, -40, 0)))) return;
      R.phase = 'fly'; R.w = w; if (core) core.root.visible = true;
      w.ee = { goal, speed: 380, tick: (w, dt, d) => { if (core) { core.root.position.copy(w.g.position).add(new THREE.Vector3(0, -12, 0)); moved(core.root); } if (d < 60) { R.phase = 'done'; w.ee = null; } } };
    };
    try {
      for (;;) {
        await until(() => R.phase === 'done' || (R.phase === 'fly' && R.w?.dead));
        if (R.phase === 'done') break;
        if (core) core.root.visible = false; tell('The core fell. Try again.', 3); R.phase = 'wait';
      }
    } finally { S.whelp = null; }
    if (core) core.root.visible = false; sfx('ui_finish', .9);
    api.toast?.('Nikolai: The core is in! Now we finish this.', 5);
    gk.setFlag('weapon_cores_delivered');
  }
  async function stEscape() {
    const P = PC(); hidePart(P, 'button_green_jnt', true); hidePart(P, 'button_red_jnt', false);
    await until(() => anyNear(W(...SOPHIA), 500));
    pause(); say('Thank you. I am leaving now. Do not follow me... no, do. The hatch.', 6);
    sfx('soph_boot', .9, W(...SOPHIA)); await anim(P, 'open'); sfx('soph_slide', .9, W(...SOPHIA)); await anim(P, 'end');
    unpause(); gk.setFlag('sophia_escaped'); note('sophia left');
  }
  async function stHatch() {
    const at = W(...HATCH); let on = 0, last = session.time;
    tell('Everyone on the hatch under S.O.P.H.I.A.', 4);
    await until(() => {
      const dt = session.time - last; last = session.time;
      const L = living(), all = L.length && L.every(q => Math.hypot(q.pos.x - at.x, q.pos.z - at.z) < 120 && Math.abs(q.pos.y - at.y) < 150);
      on = all ? on + dt : 0; return on >= 1;
    });
    pause(false); sfx('soph_trap_door', 1, at); await anim(PB(), 'trap_door_open');
    sfx('sewer_rush_start', .9); flash(1); await wait(.4); sfx('sewer_rush', .9);
    player.setPosition?.(groundAt(W(...ARENA_LAND)).add(new THREE.Vector3(0, 2, 0)));
    hold(PB(), 'trap_door_open', 0); note('in the arena');
  }
  async function stArena() {
    const use = mkSpot(W(...ARENA_USE), 100);
    for (;;) {
      await press(use, 'Wake the machine');
      sfx('robohead_start', .9); const lp = loop('robohead_lp', null, .5); await wait(3); sfx('robohead_move', .9); await wait(5); lp.stop(); sfx('robohead_end', .9);
      S.fight = 'on'; gk.bosses?.nikolai?.();
      const won = await new Promise(res => { const off = gk.on('nikolai:done', w => { off(); res(w); }); until(() => S.fight === 'reset').then(() => res(false), () => res(ABORT)); });
      if (won === ABORT) throw ABORT;
      if (won) break;
      tell('Nikolai held. Try again.', 4);
    }
    await wait(1); flash(2);
    for (const e of world.interactions ?? []) if (e.kind === 'perk' && e.perk && !session.perks?.has?.(e.perk)) session.perks?.add?.(e.perk);
    session.health = session.maxHealth ?? session.health;
    unpause(); gk.setFlag('ee_complete'); gk.emit('ee:done'); note('EE complete');
    api.announce?.('LOVE AND WAR', 'S.O.P.H.I.A. is free · every perk is yours', 6); sfx('ui_finish_all', 1);
  }

  // ---- the main flow ------------------------------------------------------------------------------------------------
  const RUN = { generator: stGenerator, password: stPassword, keys: stKeys, scenarios: stScenarios, cores: stCores, escape: stEscape, hatch: stHatch, arena: stArena };
  async function main(from = 0) {
    const e = epoch;
    try {
      for (let i = from; i < STAGES.length; i++) { if (e !== epoch) return; S.stage = STAGES[i]; note('stage ' + S.stage); await RUN[S.stage](); }
      S.stage = 'done';
    } catch (err) { if (err !== ABORT) { console.error('[gorod-krovi] ee', err); S.error = String(err?.message ?? err); } }
  }
  function restart(from = 0) {
    epoch++;
    for (const w of waits) w.rej(ABORT); waits.clear(); tweens.clear(); anims.clear();
    for (const s of spots) { s.on = false; s.onUse = null; }
    for (const t of armed) disarm(t); armed.clear();
    for (const l of loops) l.a.pause(); loops.clear();
    S.whelp = null; S.scen = null; S.fight = 'reset';
    if (S.paused) { S.paused = false; if (PZ.saved) { enemies.autoSpawn = PZ.saved.spawn; enemies.autoRounds = PZ.saved.rounds; } PZ.saved = null; }
    Object.assign(G, { charged: false, on: false, kills: false }); G.loop?.stop(); G.loop = null; T.solved = false; T.lit = false; T.air?.stop();
    initModels(); S.armedKeys = true; S.revealed = new Set(); armKeys();
    main(from);
  }
  gk.on('whelp:release', w => { try { S.whelp?.(w); } catch (e) { console.error('[gorod-krovi] ee whelp', e); } });

  host.on('update', dt => {
    dt = Math.min(dt || 1 / 60, .1);
    for (const tw of tweens) { tw.t += dt; const k = Math.min(1, tw.t / tw.s); try { tw.fn(k); } catch (e) { console.error('[gorod-krovi] ee tween', e); tweens.delete(tw); } if (k >= 1) tweens.delete(tw); }
    for (const a of anims) { step(a.P, dt); if (!a.loop && (a.t -= dt) <= 0) { hold(a.P, a.clip, Math.max(0, (a.P.dur[a.clip] ?? 1) - 1e-3)); anims.delete(a); } }
    for (const w of [...waits]) {
      if (w.e !== epoch) { waits.delete(w); w.rej(ABORT); continue; }
      let r; try { r = w.fn(dt); } catch (e) { waits.delete(w); w.rej(e); continue; }
      if (r) { waits.delete(w); w.res(r); }
    }
    for (const l of loops) { const d = l.at ? camera.position.distanceTo(l.at) : 0; l.a.volume = level(l.vol * (d > l.range ? 0 : (1 - d / l.range) ** 1.2)); }
  });
  host.on('reset', () => restart(0));
  host.on('gameOver', () => { for (const l of loops) l.a.pause(); });

  const dbg = {
    get state() { return { stage: S.stage, paused: S.paused, scen: S.scen, order: S.order, keys: [...S.keys], placed: [...S.placed], generator: { ...G, loop: !!G.loop }, tubes: { order: T.order, set: Object.fromEntries(tubeKeys.map(k => [k, tubes[k].set])), flow: T.lit ? walk() : [], solved: T.solved }, rings: ringState.map(r => r.step), error: S.error, log: S.log.slice(-20) }; },
    log: () => S.log.slice(),
    skip(stage) {   // start from a stage, with what comes before it given (keys found, flags set)
      const i = STAGES.indexOf(stage); if (i < 0) return STAGES;
      const flags = ['generator_charged', 'tube_puzzle_complete', 'ee_cylinder_acquired', 'key_placement', 'keys_placed', 'scenarios_complete', 'weapon_cores_delivered', 'sophia_escaped'];
      restart(i);
      if (i >= 1) { G.charged = true; T.solved = true; } if (i >= 2) { gk.setFlag('key_placement'); KEYS.forEach((_, k) => S.keys.add(k)); }
      if (i >= 3) KEYS.forEach((_, k) => { S.placed.add(k); shelf && hidePart(shelf, `wall_map_shelf_figure_0${k + 1}`, false); });
      flags.slice(0, [0, 3, 4, 5, 6, 7, 8, 8][i]).forEach(f => gk.setFlag(f));
      return stage;
    },
    keys: () => { KEYS.forEach((_, i) => reveal(i)); return [...(S.revealed ?? [])]; },
    gen: () => { G.charged = true; return true; },
    solve: () => { if (!T.order.length) return false; let n = 0; for (; n < 729; n++) { let m = n; for (const k of tubeKeys) { tubes[k].set = m % 3; m = Math.floor(m / 3); } if (isSolved()) break; } for (const t of Object.values(tubes)) { t.pitch = LEVER_PITCH[t.set]; poseLever(t); } T.solved = true; showFlow(); return true; },
    code: () => { ringState.forEach((r, i) => { r.step = CODE[i]; r.ang = CODE[i] * 45; poseRing(i); }); return true; },
    scenario: (k, fails = 0) => SCEN[k]?.(fails).then(ok => { note(`debug ${k} ${ok}`); return ok; }, e => { if (e !== ABORT) console.error(e); return e === ABORT ? 'reset' : 'error'; }),
    pods: () => gk.pods?.busy?.() ?? null, pap: () => gk.pap?.state?.() ?? null,
    use: (text = '') => { for (const s of spots) if (s.on && s.text.includes(text)) { s.onUse ? s.onUse() : (s.hit = true); return s.text; } return null; },
    ents: () => enemies.list.filter(z => z.eeKeep).map(z => ({ kind: z.kind, state: z.state, hp: Math.round(z.health), p: z.root.position.toArray().map(Math.round) })),
    ball: () => ballGroup.visible && ballGroup.position.toArray().map(Math.round),
    me: () => people().map(q => ({ id: q.id, down: q.down, p: q.pos.toArray().map(Math.round) })),
    tp: a => { player.setPosition?.(groundAt(W(...a)).add(new THREE.Vector3(0, 2, 0))); return true; },
    spots: () => spots.filter(s => s.on).map(s => ({ text: s.text, at: s.at.toArray().map(Math.round) })),
  };
  gk.ee = dbg; (globalThis.kino ??= {}).gorod ??= {}; globalThis.kino.gorod.ee = dbg;
  initModels(); S.armedKeys = true; S.revealed = new Set(); armKeys(); main(0);
  console.info(`[gorod-krovi] ee: ${[wallMap, shelf, stuck, keycard, core, ball, safeDoor, pile].filter(Boolean).length}/8 props, ${levers.filter(Boolean).length} levers, ${rings.filter(Boolean).length} rings, ${figs.filter(Boolean).length} figures, ${buttons.filter(Boolean).length} buttons`);
}
