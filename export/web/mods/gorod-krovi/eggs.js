// Gorod Krovi's side Easter eggs (zm_stalingrad_audio / _vo / _timer, spec scratch/gk/spec/side-eggs.md, 2026-11-15).
//   Music (§1): gk.music. A song egg is ignored (and stays unused) while another song plays or the boss fights hold the
//     music (gk.music.override); each song unlocks in RADIO.EXE (kino.radio.heard 'gorod:<song>').
//   Dead Ended (§2): use the three vodka bottles (each hums ee_mus_lp until used). Ace of Spades (§3): use the three
//     ace cards. Pianos (§6): use, a random spooky piano, 200 s rest.
//   Sophia's tape reels (§7): logs 1-4 used while looking at them, log 5 shot; the reels roll while the log plays;
//     repeatable.
//   The dragon's street fire (BO3 dragon_strafe, §4): each idle loop of the map dragon (about 40 s here) has a 35 % chance,
//     from round 5 or once the department store's upper floor is open, to burn the area holding the player for 10 s
//     (gk.hazard: the dragon swoops in, players inside burn, zombies turn into napalm zombies). ?gkNoStrafe turns it off.
//   Samantha's music box (§4): a monkey that lands inside a burning area's fire volume counts that area; three different
//     areas wake the figure behind the fountain (step 2: use it), then five of the fourteen hidden figures one at a time,
//     each to be shot within 90 s (60/45/30 s with 2/3/4 players; a miss puts the start figure back), then the last
//     figure (use it): a skeleton arm drags it under, a Max Ammo and "Samantha's Sorrows".
//   Anthem (§5): when Nikolai's fight starts, three PA speakers play the anthem; shoot all three within 68.7 s and
//     "Ace of Spades" plays over the fight (170 s).
//   Ethereal logs (§8): after the first round end from round 14 the 935 voices speak, at the next round end again, then
//     ten blue shootable logs one after another (each speaks where it was shot); the downed lines play on the first
//     three downs from then on (character from the characters mod, Dempsey otherwise).
//   Time attack (§10): rounds 5/10/15/20 finished under the table's time (by player count) reward the melee wall buy in
//     the alley tunnel (hidden until the first reward; the chalk shows the wrench). BO3's melee weapons aren't in the port:
//     buying it (3000) multiplies your melee damage instead (wrench 2x, dagger 3x, axe 4x, sword 6x), lost on a down.
// gk events: 'egg:song' state, 'egg:sam' step, 'egg:log' name, 'timeattack' {round, n}. Host/solo only.
// Debug: kino.gorod.eggs.{state, song(name), sam(step), strafe(area), log(), timeAttack(n)}.
import * as THREE from 'three';
import { settings } from '../../settings.js';
import { sceneData, makeProp, place, moved, W } from './scene-props.js';

const D = Math.PI / 180;
const BOTTLES = [[2302, 2202.5, -121], [-85.5, 1357, 56.5], [35.5, 2542.5, -119]];
const CARDS = [[-501.5, 5647, 342], [-2481.5, 3040.5, 348], [-2861.5, 21796, 41]];
const PIANOS = [[-2870.5, 21469, 47.5], [58.5, 1636, 216.5]];
const REELS = [[161.26, 3378.52, -129], [-3112.53, 21091.5, 46.18], [2520.25, 3363.99, 42.5], [373.07, 5364.24, 358.5], [-2816.93, 2418.24, 170]];
// the dragon's burn volumes (<area>_1_damage AABBs, CoD), keyed by gauntlet-hazard's area names (BO3's "start" = fountain)
const FIRE_BOX = {
  factory: [[-2401, 2442, 149], [-1858, 2848, 561]], alley: [[-264, 2329, -148], [306, 2739, 49]],
  department_store: [[-411.6, 1402.8, 326], [401.7, 2043.6, 442]], library: [[1937, 2493, -164], [2693, 3208, 78]],
  red_brick: [[-1182, 2754, 310], [-576, 3355, 415]], fountain: [[-119.75, 628.75, -6.75], [517.25, 1277.5, 260]],
  yellow: [[585, 2567.25, 153.5], [1154.5, 3227.75, 333.5]], opera_street: [[-470.5, 3863, -3], [419.5, 4294, 120]],
};
const SAM_START = [[342.843, -226.074, -3.056], [8.555, 147.883, -70.387]], SAM_END = [[335.553, -235.839, 0.341], [0, 157.996, 0]];
const SAM_TIMED = [[251.829, 854.335, 183.659, 0], [-372.191, 1598.32, 240.659, -180], [-1748.67, 2504.83, 76.659, -180], [-3260.67, 3673.83, 495.659, 0],
  [-323.67, 2714.33, 184.659, 0], [1618.33, 3602.83, 176.159, -180], [1252.83, 2237.83, 379.159, -180], [2548.33, 2294.33, 72.659, 0],
  [3121.33, 3215.33, 0.159, 0], [51.83, 4033.83, 118.159, 0], [-772.67, 4420.33, 538.159, -180], [-129.67, 5118.33, 479.159, 0],
  [-891.17, 3065.83, 357.659, 0], [444.83, 3253.33, -137.841, 0]];
const SPEAKERS = [[[961.31, -1096.94, 283.68], [7.6, 180.5, 0]], [[-1178.39, -2039.19, 219.73], [0, 43.3, -53.2]], [[644.38, -2716.13, 355.15], [359.2, 85.57, -10.47]]];
const LOGS = [['broken_world_1', [-4530, 3266, 410]], ['broken_world_2', [-488, 1135, 55]], ['broken_world_3', [3153, 3502, 248]],
  ['maxis_maxis', [-3264, 21623, 58]], ['samantha_samantha', [306, 1748, 53]], ['multiple_versions_1', [-124, 3430, 290]],
  ['multiple_versions_2', [-738, 1453, 357]], ['multiple_versions_3', [-48, 4653, 637]], ['before_ee_complete_1', [-3095, 21612, 705]],
  ['before_ee_complete_2', [-824, 2641, -32]]];
const TALK_AFTER = 3;   // the downed lines start once the three broken-world logs are done
const CHARS = ['dempsey', 'nikolai', 'richtofen', 'takeo'];
const TIME_ATTACK = { 5: [300, 270, 250, 240], 10: [780, 720, 670, 660], 15: [1440, 1200, 1020, 960], 20: [1920, 1800, 1740, 1680], 50: [1920, 1800, 1740, 1680] };
const MELEE = [null, { name: 'Wrench', x: 2 }, { name: 'Ritual Dagger', x: 3 }, { name: 'Fire Axe', x: 4 }, { name: 'Sword', x: 6 }, { name: 'Daisho', x: 8 }];
const WALL = [[-126.25, 2878, -107], 270], WALL_COST = 3000;

export default async function setupEggs(api, gk) {
  const { world, session, player, camera, scene, enemies } = api, host = api.host;
  const q = new URLSearchParams(location.search);
  if (api.sync && api.sync.isHost === false) return;
  const J = await sceneData();
  const keys = ['figure_sam', 'skel_arm', 'arm_bone', 'arm_bone', 'speaker_pa', 'speaker_pa', 'speaker_pa', 'wrench'];
  const [fig, arm, bone1, bone2, ...rest] = J ? await Promise.all(keys.map(k => makeProp(J, k).catch(() => null))) : [];
  const speakers = rest.slice(0, 3), wrench = rest[3];

  // ---- sound --------------------------------------------------------------------------------------------------------------
  const BASE = new URL('../maps/gorod-krovi/audio/', import.meta.url).href;
  const level = v => (api.audio?.enabled === false ? 0 : Math.max(0, Math.min(1, v * (settings.volume ?? 1))));
  const sfx = (name, vol = 1, at = null, range = 3000) => {
    const d = at ? camera.position.distanceTo(at) : 0; if (d > range) return null;
    const a = new Audio(BASE + name + '.ogg'); a.volume = level(vol * (1 - d / range) ** 1.2); a.play().catch(() => {}); return a;
  };
  // 3D loops and long lines: their volume follows the distance every frame; a loop out of range pauses
  const live = new Set();
  function voice(name, { at = null, vol = 1, range = 2500, loop = false, then = null } = {}) {
    const a = new Audio(BASE + name + '.ogg'); a.loop = loop;
    const v = { a, at, vol, range, loop, fade: 0, gone: false, stop(f = 0) { if (f > 0) v.fade = f; else end(); } };
    const end = () => { if (v.gone) return; v.gone = true; a.pause(); live.delete(v); };
    a.addEventListener('ended', () => { end(); then?.(); });
    a.addEventListener('error', () => { if (!v.gone) { end(); then?.(); } });
    live.add(v); vol3(v); if (!loop || a.volume > 0) a.play().catch(() => {});
    return v;
  }
  function vol3(v, dt = 0) {
    if (v.fade > 0) { v.vol0 ??= v.vol; v.vol -= dt * v.vol0 / v.fade; if (v.vol <= 0) { v.fade = 0; v.stop(); return; } }
    const d = v.at ? camera.position.distanceTo(v.at) : 0, f = d > v.range ? 0 : (1 - d / v.range) ** 1.2;
    v.a.volume = level(v.vol * f);
    if (v.loop) { if (f === 0 && !v.a.paused) v.a.pause(); else if (f > 0 && v.a.paused) v.a.play().catch(() => {}); }
  }
  const players = () => Math.max(1, Math.min(4, api.sync?.players?.().length || 1));

  // ---- the music system (§1) ---------------------------------------------------------------------------------------------
  const M = { song: null, state: 'none', override: false };
  const busy = () => M.override || !!M.song;
  function song(state, { force = false } = {}) {
    if (!force && busy()) return false;
    stopSong();
    const v = voice('mus_' + state, { vol: .8, then: () => { if (M.song === v) { M.song = null; M.state = 'none'; } } });
    M.song = v; M.state = state;
    globalThis.kino?.radio?.heard?.('gorod:' + state);
    gk.emit('egg:song', state);
    return true;
  }
  function stopSong(fade = 0) { const v = M.song; M.song = null; M.state = 'none'; v?.stop(fade); }
  gk.music = { song, stop: stopSong, busy, get state() { return M.state; }, get override() { return M.override; }, set override(v) { M.override = !!v; } };

  // ---- small helpers ------------------------------------------------------------------------------------------------------
  const near = (at, r) => camera.position.distanceTo(at) < r + 55;   // BO3's unitrigger radius from the player's origin, from the eye here
  function use(at, r, fn, text = () => '') {   // an unmarked use spot (BO3's eggs show no hint)
    const e = world.addInteraction({ position: at, text, use: () => !!fn(), hidden: () => e.off || !near(at, r) });
    return e;
  }
  const targets = () => (world.shootTargets ??= []);
  function shootable(at, radius, hit) { const t = { position: at, radius, hit }; targets().push(t); return t; }
  const disarm = t => { const l = targets(), i = l.indexOf(t); if (i >= 0) l.splice(i, 1); };
  const lookingAt = (at, cos = .95) => { const d = at.clone().sub(camera.position).normalize(); return camera.getWorldDirection(new THREE.Vector3()).dot(d) > cos; };
  const timers = new Set();
  const later = (s, fn) => { const t = { at: session.time + s, fn }; timers.add(t); return t; };
  const S = { bottles: 0, cards: 0, songsDone: new Set(), sam: { step: 0, areas: new Set(), timed: [], i: 0, fails: 0 }, logs: { stage: 0, i: 0, downs: 0 }, ta: { t0: 0, reward: 0, bought: 0 }, strafes: 0, log: [] };
  const note = m => { S.log.push(`${(session.time ?? 0).toFixed(1)} ${m}`); if (S.log.length > 60) S.log.shift(); };

  // ---- Dead Ended: the vodka bottles (§2) -------------------------------------------------------------------------------
  const bottles = BOTTLES.map(p => {
    const at = W(...p), b = { at, hum: null, done: false };
    b.e = use(at, 64, () => {
      if (b.done || busy()) return false;
      b.done = true; b.e.off = true; b.hum?.stop(.2); sfx('ee_mus_activate', .9, at, 1500);
      if (++S.bottles === 3) { note('dead ended'); song('dead_ended', { force: true }); S.songsDone.add('dead_ended'); }
      return true;
    });
    return b;
  });
  // ---- Ace of Spades: the cards (§3) ------------------------------------------------------------------------------------
  CARDS.forEach(p => {
    const at = W(...p); let done = false; const e = use(at, 64, () => {
      if (done || busy()) return false;
      done = true; e.off = true; sfx('card_activate', .9, at, 1500);
      if (++S.cards === 3) { note('ace of spades'); song('ace_of_spades', { force: true }); S.songsDone.add('ace_of_spades'); }
      return true;
    });
  });
  // ---- the pianos (§6) --------------------------------------------------------------------------------------------------
  PIANOS.forEach(p => {
    const at = W(...p); let rest = -1;
    use(at, 50, () => { if (session.time < rest) return false; rest = session.time + 200; sfx('piano_' + Math.floor(Math.random() * 10), 1, at, 2000); return true; });
  });

  // ---- Sophia's tape reels (§7) -----------------------------------------------------------------------------------------
  const reels = REELS.map((p, i) => ({ n: i + 1, at: W(...p), playing: null, props: [] }));
  function playReel(r) {
    if (r.playing) return false;
    r.playing = voice('sophia_log_' + r.n, { at: r.at, range: 1500, then: () => { r.playing = null; if (r.n === 5) armReel5(); } });
    if (r.n === 2) sfx('sophia_log_2_sfx', .8, r.at, 1500);
    note('sophia log ' + r.n); return true;
  }
  for (const r of reels.slice(0, 4)) use(r.at, 64, () => lookingAt(r.at, .9) && playReel(r));
  let reel5 = null;
  const armReel5 = () => { if (!reel5 || !targets().includes(reel5)) reel5 = shootable(reels[4].at, 10, () => playReel(reels[4])); };
  armReel5();

  // ---- the ethereal 935 logs (§8) ----------------------------------------------------------------------------------------
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(220,240,255,1)'); r.addColorStop(.25, 'rgba(90,170,255,.8)'); r.addColorStop(1, 'rgba(20,60,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0x9fd0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const glow = new THREE.Sprite(glowMat); glow.scale.setScalar(36); glow.visible = false; glow.renderOrder = 5; scene.add(glow);
  { const w = new THREE.Sprite(glowMat); w.scale.setScalar(.01); host.warmObjects?.push?.(w); }
  let logTarget = null;
  function nextLog() {
    const L = S.logs; if (L.i >= LOGS.length) { L.stage = 4; return; }
    const [name, p] = LOGS[L.i], at = W(...p);
    glow.position.copy(at); glow.visible = true;
    logTarget = shootable(at, 16, () => {
      glow.visible = false; logTarget = null; note('log ' + name);
      later(2, () => voice('abcd_' + name, { at, range: 3500, then: () => { L.i++; if (L.i === TALK_AFTER) L.talk = true; later(1, nextLog); } }));
      gk.emit('egg:log', name);
    });
  }
  function charName() {
    const e = globalThis.kino?.characterEntry, s = `${e?.id ?? ''} ${e?.name ?? ''}`.toLowerCase();
    return CHARS.find(c => s.includes(c)) ?? (s.includes('tank') ? 'dempsey' : s.includes('nikola') ? 'nikolai' : s.includes('edward') ? 'richtofen' : s.includes('masaki') ? 'takeo' : 'dempsey');
  }
  let wasDown = false;
  function onDown() {
    const L = S.logs; if (!L.talk || L.downs >= 3) return;
    if (players() > 1 && session.perks?.has?.('quick_revive')) return;
    L.downs++; voice(`abcd_talk_${charName()}_${L.downs}`, { vol: .9 });
  }
  gk.on('ee:done', () => { if (charName() !== 'richtofen') later(6, () => voice('abcd_introduction_x', { vol: .9 })); });

  // ---- the dragon's street fire (BO3 dragon_strafe on the idle flight loop) --------------------------------------------
  const ST = { t: 40 };
  let riding = false; gk.on('dragon:ride', () => { riding = true; }); gk.on('dragon:landed', () => { riding = false; });
  function strafe(area) {
    const h = gk.hazard; if (!h || h.active()) return false;
    if (!area) {   // the area holding the most players: here the player's, else the nearest within reach
      const feet = player.getFeetPosition(); let best = null, bd = 1800;
      for (const [n, c] of Object.entries(h.areas)) { const d = h.inArea(n, feet) ? 0 : c.distanceTo(feet); if (d < bd) { bd = d; best = n; } }
      area = best;
    }
    if (!area) return false;
    S.strafes++; note('strafe ' + area);
    return h.start(area, AN.on ? 20 : 10);
  }

  // ---- Samantha's music box (§4) ----------------------------------------------------------------------------------------
  const SAM = S.sam, seen = new WeakSet();
  const inBox = (p, [a, b]) => { const x = p.x, y = -p.z, z = p.y; return x >= a[0] && x <= b[0] && y >= a[1] && y <= b[1] && z >= a[2] && z <= b[2]; };
  function monkeyLanded(m) {
    if (SAM.step !== 0) return;
    const b = gk.hazard?.active(); if (!b || !FIRE_BOX[b.area] || SAM.areas.has(b.area)) return;
    if (!inBox(m.mesh.position, FIRE_BOX[b.area])) return;
    SAM.areas.add(b.area); note('sam area ' + b.area); sfx('sam_good', .8, m.mesh.position, 2500);
    if (SAM.areas.size >= 3) { SAM.step = 1; gk.emit('egg:sam', 1); later(8, samRise); }
  }
  let samSpin = 0, samLoop = null, samTarget = null, samUse = null, samMove = null;
  const figAt = (p, a) => { if (!fig) return; place(fig, p, a); fig.root.visible = true; if (!fig.root.parent) scene.add(fig.root); moved(fig.root); };
  const figOff = () => { if (fig) fig.root.visible = false; samSpin = 0; samLoop?.stop(.3); samLoop = null; };
  function moveZ(objs, dz, dur, then) { samMove = { objs: objs.filter(Boolean).map(P => ({ P, y0: P.root.position.y })), dz, dur, t: 0, then }; }
  function samRise() {   // step 2
    sfx('sam_good', .9); const [p, a] = SAM_START;
    figAt([p[0], p[1], p[2] - 20], a); SAM.step = 2;
    moveZ([fig], 20, 2, () => { SAM.step = 3; });
  }
  function samStartUsed() {
    if (SAM.step !== 3 && SAM.step !== 5) return false;
    sfx('sam_disappear_' + (Math.random() < .5 ? 0 : 1), .9, W(...SAM_START[0]), 1500); figOff();
    SAM.timed = [...SAM_TIMED].sort(() => Math.random() - .5).slice(0, 5); SAM.i = 0; SAM.step = 4; gk.emit('egg:sam', 4); note('sam timed');
    later(1, samNext); return true;
  }
  function samNext() {
    if (SAM.step !== 4) return;
    if (SAM.i >= SAM.timed.length) { samEnd(); return; }
    const [x, y, z, roll] = SAM.timed[SAM.i], at = W(x, y, z + (roll ? -4 : 4));
    figAt([x, y, z], [0, 334.799, roll]); samSpin = 90;
    sfx('sam_good', .5, at, 2500);
    samLoop = voice('mus_musicbox_lp', { at, loop: true, range: 1800, vol: .9 });
    const n = players(), limit = n > 1 ? 90 - 15 * n : 90;
    const tm = later(limit, () => {   // missed: the start figure comes back
      disarm(samTarget); samTarget = null; sfx('sam_disappear_0', .8, at, 1500); figOff();
      sfx('ui_deny', .9); SAM.fails++; SAM.step = 5; note('sam missed ' + (SAM.i + 1));
      figAt(...SAM_START);
    });
    samTarget = shootable(at, 14, () => {
      timers.delete(tm); samTarget = null; sfx('sam_disappear_' + (SAM.i % 2), .9, at, 2000); figOff();
      SAM.i++; note('sam shot ' + SAM.i); later(1.5, samNext);
    });
  }
  function samEnd() {   // step 4: the last figure
    sfx('sam_good', .9); SAM.step = 6; figAt(...SAM_END); samSpin = 90;
    samLoop = voice('mus_musicbox_lp', { at: W(...SAM_END[0]), loop: true, range: 1800, vol: .9 }); gk.emit('egg:sam', 6);
  }
  function samEndUsed() {   // step 5: the arm
    if (SAM.step !== 6) return false;
    SAM.step = 7; samSpin = 0; samLoop?.stop(.5); samLoop = null;
    const [p, a] = SAM_END, at = W(...p);
    sfx('skel_retract', .9, at, 2000);
    if (arm) { place(arm, p, a); scene.add(arm.root); arm.root.visible = true; }
    [[bone1, [2, 0, -6.5]], [bone2, [3.5, 0, -18.5]]].forEach(([B, o]) => { if (B) { place(B, [p[0] + o[0], p[1] + o[1], p[2] + o[2]], [180, 0, 0]); scene.add(B.root); B.root.visible = true; } });
    globalThis.kino?.fx?.explosion?.(at.clone().add(new THREE.Vector3(0, 10, 0)), .3, 0x7ad0ff);
    moveZ([fig, arm, bone1, bone2], 20, .5, () => later(1, () => {
      const lp = voice('skel_retract', { at, range: 1500, vol: .6 });
      moveZ([fig, arm, bone1, bone2], -30, 1.5, () => {
        lp.stop(.2);
        for (const P of [fig, arm, bone1, bone2]) if (P) P.root.visible = false;
        api.powerups?.spawn?.('full_ammo', at.clone()) ?? globalThis.kino?.debug?.dropPowerup?.('full_ammo', at.toArray());
        SAM.step = 8; note('sam done'); gk.emit('egg:sam', 8);
        song('sam', { force: true }); S.songsDone.add('sam');
      });
    }));
    return true;
  }
  samUse = use(W(...SAM_START[0]), 40, samStartUsed); samUse.hidden = () => !((SAM.step === 3 || SAM.step === 5) && near(samUse.position, 40));
  const samEndE = use(W(...SAM_END[0]), 65, samEndUsed); samEndE.hidden = () => !(SAM.step === 6 && near(samEndE.position, 65));

  // ---- the anthem speakers in Nikolai's fight (§5) ----------------------------------------------------------------------
  const AN = { on: false, t: 0, left: 0, state: 0, targets: [], loops: [] };
  speakers.forEach((P, i) => { if (P) { place(P, ...SPEAKERS[i]); P.root.visible = false; scene.add(P.root); } });
  gk.on('nikolai:start', () => {   // state 1
    AN.on = true; AN.t = 0; AN.state = 1; M.override = true; stopSong(1);
    AN.left = 0; AN.targets = []; AN.loops = [];
    SPEAKERS.forEach(([p], i) => {
      const at = W(...p), P = speakers[i]; if (P) P.root.visible = true; AN.left++;
      later(.05 + Math.random() * .3, () => sfx('pa_anthem_start', 1, at, 4000));
      const lp = voice('mus_anthem_start', { at, loop: true, range: 2600, vol: .55 }); AN.loops.push(lp);
      AN.targets.push(shootable(at, 22, () => {
        if (AN.state !== 1) return; if (P) P.root.visible = false; lp.stop(.2);
        sfx('pa_destruct_' + (i % 2), 1, at, 4000); globalThis.kino?.fx?.explosion?.(at.clone(), .4, 0x9fd8ff);
        if (--AN.left === 0) { AN.state = 2; note('anthem'); for (const v of AN.loops) v.stop(.3); song('ace_of_spades', { force: true }); later(170, () => { if (AN.state === 2 && M.state === 'ace_of_spades') stopSong(2); }); }
      }));
    });
  });
  function anthemOff(state) { AN.state = state; for (const t of AN.targets) disarm(t); for (const v of AN.loops) v.stop(.5); for (const P of speakers) if (P) P.root.visible = false; }
  gk.on('nikolai:done', () => { AN.on = false; anthemOff(4); stopSong(2); M.override = false; });

  // ---- time attack and the melee wall buy (§10) -------------------------------------------------------------------------
  const TA = S.ta, wallAt = W(...WALL[0]);
  if (wrench) { place(wrench, WALL[0], [0, WALL[1], 0]); wrench.root.visible = false; scene.add(wrench.root); }
  world.addInteraction({
    position: wallAt, sight: true, hidden: () => !TA.reward,
    text: () => { const m = MELEE[TA.reward]; return TA.bought >= TA.reward ? `${m.name} · melee ${m.x}x (owned)` : `Buy ${m.name} · melee damage ${m.x}x · ${WALL_COST}`; },
    use: () => {
      if (!TA.reward || TA.bought >= TA.reward || session.down) return false;
      if ((session.points ?? 0) < WALL_COST) { api.toast?.('Not enough points', 1.5); return false; }
      if (session.spend) { if (!session.spend(WALL_COST)) return false; } else session.points -= WALL_COST;
      TA.bought = TA.reward; api.audio?.play?.('buy'); api.toast?.(`${MELEE[TA.reward].name} · melee does ${MELEE[TA.reward].x}x damage`, 3); return true;
    },
  });
  host.on('beforeEnemyDamage', e => { if (e?.melee && TA.bought) e.amount *= MELEE[TA.bought].x; });
  function timeAttack(r, forced = false) {
    const n = players(), tgt = TIME_ATTACK[r]?.[n - 1]; if (!tgt) return;
    const t = session.time - TA.t0; if (!forced && t >= tgt) { note(`time attack ${r}: ${t.toFixed(0)} s > ${tgt}`); return; }
    const k = { 5: 1, 10: 2, 15: 3, 20: 4, 50: 5 }[r]; TA.reward = k; if (wrench) wrench.root.visible = true;
    api.announce?.('TIME ATTACK', `Round ${r} in ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} · ${MELEE[k].name} on the alley tunnel wall`, 5);
    sfx('challenge_all', .9); note(`time attack ${r} in ${t.toFixed(0)} s`); gk.emit('timeattack', { round: r, n: k });
  }

  // ---- the game loop ----------------------------------------------------------------------------------------------------
  host.on('start', () => { TA.t0 = session.time ?? 0; });
  host.on('roundEnd', e => {
    const r = e?.round ?? session.round;
    if (TIME_ATTACK[r]) timeAttack(r);
    const L = S.logs;
    if (L.stage === 0 && r >= 14) { L.stage = 1; voice('abcd_first_contact', { vol: .9 }); note('first contact'); }
    else if (L.stage === 1) { L.stage = 2; voice('abcd_second_contact', { vol: .9, then: () => later(3, nextLog) }); note('second contact'); }
  });
  host.on('update', dt => {
    if (!dt) return;
    for (const v of [...live]) vol3(v, dt);
    for (const t of [...timers]) if (session.time >= t.at) { timers.delete(t); try { t.fn(); } catch (err) { console.error('[gorod-krovi] eggs', err); } }
    if (session.phase === 'over') return;
    // the bottles hum while unused
    for (const b of bottles) if (!b.done && !b.hum) b.hum = voice('ee_mus_lp', { at: b.at, loop: true, range: 450, vol: .7 });
    // the dragon's street fire
    if (!q.has('gkNoStrafe') && (ST.t -= dt) <= 0) {
      ST.t = 35 + Math.random() * 10;
      if ((session.round >= 5 || gk.hasFlag('departmentstoreupperopen')) && Math.random() < .35 && !riding) strafe();
    }
    // monkeys landing in the fire
    for (const p of api.features?.projectiles ?? []) if (p.monkey && p.stuck && !seen.has(p)) { seen.add(p); monkeyLanded(p); }
    // the figure spins, things rise and sink
    if (fig?.root.visible && samSpin) { fig.root.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), samSpin * D * dt); moved(fig.root); }
    if (samMove) {
      const m = samMove; m.t = Math.min(m.dur, m.t + dt);
      for (const o of m.objs) { o.P.root.position.y = o.y0 + m.dz * (m.t / m.dur); moved(o.P.root); }
      if (m.t >= m.dur) { samMove = null; m.then?.(); }
    }
    // the tape reels roll while their log plays (rotateroll -30 every 0.2 s)
    for (const r of reels) if (r.playing) for (const P of r.props) { P.root.rotateX(-150 * D * dt); moved(P.root); }
    // the anthem window
    if (AN.state === 1 && (AN.t += dt) >= 68.7) { anthemOff(3); note('anthem missed'); }
    // downs
    const down = session.phase === 'reviving'; if (down && !wasDown) onDown(); wasDown = down;
  });
  host.on('reset', () => {
    for (const v of [...live]) v.stop(); timers.clear(); M.override = false; M.song = null; M.state = 'none';
    S.bottles = S.cards = 0; for (const b of bottles) { b.done = false; b.e.off = false; b.hum = null; }
    Object.assign(SAM, { step: 0, areas: new Set(), timed: [], i: 0, fails: 0 }); figOff(); samMove = null;
    Object.assign(S.logs, { stage: 0, i: 0, downs: 0, talk: false }); glow.visible = false; if (logTarget) disarm(logTarget);
    Object.assign(TA, { reward: 0, bought: 0 }); if (wrench) wrench.root.visible = false; ST.t = 40;
  });
  // the reels: sophia.js places them; hand them to the spin once every part is up
  gk.on('parts:ready', () => {
    const tp = gk.sophia?.props?.tapes ?? [];
    reels.forEach((r, i) => { r.props = tp.slice(i * 2, i * 2 + 2).filter(Boolean); for (const P of r.props) { P.root.userData.noMerge = true; P.root.matrixAutoUpdate = true; } });
  });

  // ---- debug ------------------------------------------------------------------------------------------------------------
  const dbg = {
    get state() { return { bottles: S.bottles, cards: S.cards, songs: [...S.songsDone], music: M.state, override: M.override, sam: { ...SAM, areas: [...SAM.areas] }, logs: { ...S.logs }, timeAttack: { ...TA }, strafes: S.strafes, log: S.log.slice(-20) }; },
    song: s => song(s, { force: true }), strafe, bottle: i => bottles[i].e.use(),
    sam: step => { if (step === 1) { ['fountain', 'alley', 'yellow'].forEach(a => SAM.areas.add(a)); SAM.step = 1; samRise(); } else if (step === 3) { SAM.step = 3; samStartUsed(); } else if (step === 6) { SAM.step = 4; samEnd(); } else if (step === 7) samEndUsed(); return SAM.step; },
    shootSam: () => samTarget?.hit?.(samTarget, null, null),
    monkeyIn: area => { const [a, b] = FIRE_BOX[area]; const m = { mesh: { position: W((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2) } }; monkeyLanded(m); return [...SAM.areas]; },
    log: () => { if (S.logs.stage < 2) { S.logs.stage = 2; nextLog(); } else if (logTarget) { const t = logTarget; disarm(t); t.hit(t); } return S.logs.i; },
    timeAttack: r => timeAttack(r, true), reel: n => playReel(reels[n - 1]), anthemShoot: () => { const t = AN.targets.find(t => targets().includes(t)); if (t) { disarm(t); t.hit(t); } return AN.left; },
  };
  (globalThis.kino ??= {}).gorod ??= {}; globalThis.kino.gorod.eggs = dbg; gk.eggs = dbg;
  console.info(`[gorod-krovi] eggs: figure ${!!fig}, arm ${!!arm}, speakers ${speakers.filter(Boolean).length}, wrench ${!!wrench}`);
}
