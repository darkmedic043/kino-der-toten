// The Gauntlet of Siegfried (BO3 zm_stalingrad: the dragon egg quest, zm_stalingrad_egg.gsc, and
// _zm_weap_dragon_gauntlet.gsc; spec scratch/gk/spec/gauntlet.md). Assets from the BO3 files by
// .tools/build_gk_gauntlet.py into mods/maps/gorod-krovi/gauntlet/ (git-ignored: ripped): both viewmodels on Dempsey's
// arms with their clips, the whelp and its clips, the egg, the world model, the boards and incubator fxanim props with
// their clips, HUD icons and 29 sounds from the map's bank.
// The weapon itself is gauntlet-weapon.js (an operator weapon: Y), the street fire and napalm zombies gauntlet-hazard.js.
//
// The quest (solo-first: it runs on each player's own game; N = 3 + 2 per player, 5 solo):
//   0  shoot or knife the boards in Pavlov's sewer room: the egg rolls out; take it
//   1  lay it on one of the four cook spots (fountain, opera street, red brick, yellow house) and let the dragon's fire
//      burn over it (the stand-in dragon comes about 20 s later: gauntlet-hazard.js); it glows; it cools after a full
//      round; take it back (flag egg_awakened)
//   2  N napalm-zombie kills (the stand-in dragon keeps setting streets alight)
//   3  N bullet kills that pierced through another zombie (two kills on one shot)
//   4  N melee kills (the Guard of Fafnir's breath counts too)
//   5  the incubator in Pavlov's sewer: a lockdown (runners from five spots, a Valkyrie drone at a time when bosses.js
//      is there) until 7 + 6 per player kills are made around it (13 solo); it cools a full round; take it
//   6  the grave by the fountain: the gauntlet rises from it (and sinks back in 12 s); take it: the operator weapon
// The boards and the incubator are BO3's fxanims (planks and a stone block stand in without the assets); the egg's gates
// and red lights are not built (BO3's *172 gates need a gk.pavlovGates; none yet). Cheat: `gauntlet` (give, step, hazard, napalm, status).
// Debug: window.kino.gorod.gauntlet (also gk.gauntlet).
import * as THREE from 'three';
import { loadModel, loadAnimation, Rig } from '../../animation.js';
import { setupGauntletWeapon, ID } from './gauntlet-weapon.js';
import { setupHazard, AREAS, inArea } from './gauntlet-hazard.js';

const W = (x, y, z) => new THREE.Vector3(x, z, -y);
const ROOT = new URL('../../', import.meta.url), DIR = 'mods/maps/gorod-krovi/gauntlet/';
const abs = u => (typeof u === 'string' ? new URL(u, ROOT).href : u);
const BOARDS = W(-3074, 22313, 10), EGG_PICK = W(-2937, 22415, -110), EGG_REST = W(-2923.75, 22423.1, -142.1);
const COOK = { fountain: W(215, 764.25, 23.5), opera_street: W(-70, 3917.25, 29.5), red_brick: W(-890.75, 3321.25, 346.1), yellow: W(1102.25, 2837.5, 188.8) };
const COOK_NAME = { fountain: 'the fountain', opera_street: 'opera street', red_brick: 'red brick', yellow: 'the yellow house' };
const INC_PROMPT = W(-2879, 21737, -110), INC = W(-2895, 21754, -160), INC_SCORE = W(-3000, 21737, -99), INC_R = 450;
const INC_SPAWNS = [W(-2867, 22115, 0), W(-3184, 21658, 0), W(-2866, 21863, 0), W(-3475, 21223, 0), W(-3199, 21531, -160)];
const GRAVE = W(398, 385, 37), REWARD = W(365, 343, 16);
const STEPS = ['boards', 'egg', 'carry', 'placed', 'bathed', 'cooled', 'napalm', 'pierce', 'melee', 'incubate', 'lockdown', 'hot', 'collect', 'done'];
const STEP_NO = { boards: 0, egg: 0, carry: 1, placed: 1, bathed: 1, cooled: 1, napalm: 2, pierce: 3, melee: 4, incubate: 5, lockdown: 5, hot: 5, collect: 5, done: 6 };

export default async function setup(api, gk) {
  if (api.map?.id !== 'gorod-krovi') return;
  const { host, scene, viewScene, world, session, enemies, audio, player, camera, renderer } = api;
  const kino = window.kino ??= {};
  let J = null;
  try { const r = await fetch(abs(DIR + 'gauntlet.json')); if (!r.ok) throw new Error(r.status); J = await r.json(); }
  catch { console.warn('[gorod-krovi] gauntlet: no assets (python3 -I .tools/build_gk_gauntlet.py); stand-ins'); }
  if (J) {   // web-root URLs -> absolute
    for (const m of ['flame', 'punch']) { const d = J[m]; for (const k of ['model', 'worldModel', 'handsModel']) d[k] = abs(d[k]); for (const k in d.animations) d.animations[k] = abs(d.animations[k]); }
    J.whelp.model = abs(J.whelp.model); for (const k in J.whelp.animations) J.whelp.animations[k] = abs(J.whelp.animations[k]);
    J.egg = abs(J.egg); J.world = abs(J.world); for (const k in J.textures) J.textures[k] = abs(J.textures[k]); for (const k in J.sounds) J.sounds[k] = abs(J.sounds[k]);
  }

  // ---- sounds: BO3's, through the game's audio (muted with it) -------------------------------------------------------
  const key = n => 'gk_gauntlet/' + n;
  if (audio?.manifest) for (const [n, u] of Object.entries(J?.sounds ?? {})) audio.manifest[key(n)] ??= { url: u };
  const has = n => !!J?.sounds?.[n] && !!audio?.manifest;
  const live = () => audio?.enabled !== false && audio?.ctx?.state === 'running';
  const sound = (n, v = 1, at = null, range = 2500) => {
    if (at) { const d = camera.position.distanceTo(at); if (d > range) return; v *= (1 - d / range) ** 1.5; }
    if (has(n)) audio.play(key(n), v); };
  const A = {
    J, sound, soundAt: (n, p, v = 1, r = 2500) => sound(n, v, p, r),
    loop(n, v = 1) { if (!has(n) || !live()) return { stop() {} }; let src = null, dead = false;
      audio.native(key(n), v, true).then(s => { if (dead) s.stop(); else src = s; }).catch(() => {});
      return { stop() { dead = true; try { src?.stop(); } catch {} } }; },
    warmSounds() { if (audio?.ctx) for (const n of Object.keys(J?.sounds ?? {})) audio.buffer?.(key(n)).catch(() => {}); },
  };

  // ---- materials: glowing trim, the whelp's eyes, the glass (shared by every copy, so fixed once) ---------------------
  const tl = new THREE.TextureLoader(), tex = u => { const t = tl.load(u); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const glowE = J?.textures?.glow_e ? tex(J.textures.glow_e) : null;
  const fixed = new WeakSet();
  function fixMat(m) {
    if (!m || fixed.has(m)) return; fixed.add(m); const n = m.name ?? '';
    if (/gauntlet_dragon_glass/.test(n)) { m.transparent = true; m.opacity = .3; m.depthWrite = false; m.color?.set(0xffc080); }
    else if (/gauntlet_dragon_(yel|red|glo|blu1?)$/.test(n)) { m.emissiveMap = /glo$/.test(n) && glowE ? glowE : m.map; m.emissive?.set(0xffffff); m.emissiveIntensity = .9; }
    else if (/whelp_e|dragon_eye/.test(n)) { m.emissiveMap = m.map; m.emissive?.set(0xffffff); m.emissiveIntensity = 1.2; }
  }
  A.fix = (root, mode = 'flame') => root.traverse(o => {
    if (!o.isMesh) return; for (const m of [o.material].flat()) fixMat(m);
    // the punch form's model still carries the whelp on its bones (BO3 hides it): the whelp has gone out
    if ([o.material].flat().some(m => /c_zom_dlc3_dragon/.test(m?.name ?? ''))) o.visible = mode !== 'punch';
  });

  // ---- the flame's sprites (BO1's flamethrower flipbooks, as mods/weapon-levels/flamer.js), made at setup ----------
  const sheets = {
    base: { tex: tex(abs('textures/fxt_fire_flame_base_01.png')), cols: 4, rows: 4, frames: 16, anim: true, add: true },
    lick: { tex: tex(abs('textures/fxt_fire_flame_lick.png')), cols: 4, rows: 4, frames: 16, anim: false, add: true },
    smoke: { tex: tex(abs('textures/fxt_smk_flamethrower.png')), cols: 8, rows: 8, frames: 64, anim: true, add: false },
  };
  const pool = { list: [] };
  pool.frame = (p, f) => { const { cols, rows } = p.sh; f = Math.min(p.sh.frames - 1, f); p.tex.offset.set((f % cols) / cols, 1 - (Math.floor(f / cols) + 1) / rows); };
  function make(kind) {
    const sh = sheets[kind], t = sh.tex.clone(); t.repeat.set(1 / sh.cols, 1 / sh.rows);
    const mat = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: sh.add ? THREE.AdditiveBlending : THREE.NormalBlending });
    const p = { kind, sh, tex: t, sprite: new THREE.Sprite(mat), vel: new THREE.Vector3(), alive: false }; p.sprite.renderOrder = 4; pool.list.push(p); return p;
  }
  pool.spawn = (kind, pos, vel, life, s0, s1) => {
    let p = pool.list.find(p => !p.alive && p.kind === kind);
    if (!p) { if (pool.list.length > 260) return null; p = make(kind); }
    if (p.sprite.parent !== scene) scene.add(p.sprite);
    p.alive = true; p.t = 0; p.life = life; p.size0 = s0; p.size1 = s1; p.sprite.visible = true;
    p.sprite.position.copy(pos); p.vel.copy(vel); p.sprite.material.rotation = Math.random() * 6.28; p.spin = (Math.random() - .5) * 2;
    pool.frame(p, p.sh.anim ? 0 : Math.floor(Math.random() * p.sh.frames)); return p;
  };
  for (const k of ['base', 'lick', 'smoke']) for (let i = 0; i < 24; i++) make(k);
  host.warmObjects?.push(...['base', 'lick', 'smoke'].map(k => pool.list.find(p => p.kind === k).sprite));
  A.pool = pool;

  // ---- the whelp: a model per release (clips shared) -----------------------------------------------------------------
  A.whelpClips = {};
  if (J) await Promise.all(Object.entries(J.whelp.animations).map(async ([k, u]) => { try { A.whelpClips[k] = await loadAnimation(u); } catch {} }));
  A.whelpModel = async () => { if (!J) return null; const m = await loadModel(J.whelp.model); A.fix(m); m.scale.setScalar(1 / 2.54); m.traverse(o => { o.frustumCulled = false; o.castShadow = false; }); return m; };

  // ---- models in the world: the egg, the gauntlet over the grave; the viewmodels warmed hidden in the view scene -------
  const moved = o => { o.updateMatrix(); o.updateMatrixWorld(true); };
  const [eggM, worldM, whelpM, flameV, punchV, hands] = J ? await Promise.all([J.egg, J.world, J.whelp.model, J.flame.model, J.punch.model, J.flame.handsModel].map(u => loadModel(u).catch(() => null))) : [];
  const CM = 1 / 2.54;   // the world-side GLBs are in Greyhound's centimetres; the map is in inches (viewmodels stay as built)
  let egg = eggM; if (eggM) eggM.scale.setScalar(CM);
  if (!egg) egg = new THREE.Mesh(new THREE.SphereGeometry(7, 14, 10).scale(1, 1.35, 1), new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: .7 }));
  // the egg's own copy of its material: the heat glow (emissive driven by intensity only, no recompile)
  egg.traverse(o => { if (!o.isMesh) return; o.material = o.material.clone(); o.material.emissiveMap = o.material.map ?? null; o.material.emissive?.set(0xff5a10); o.material.emissiveIntensity = 0; o.castShadow = false; });
  const eggMats = []; egg.traverse(o => { if (o.isMesh) eggMats.push(o.material); });
  const glow = v => { for (const m of eggMats) m.emissiveIntensity = v; };
  egg.visible = false; scene.add(egg);
  const relic = worldM ?? new THREE.Mesh(new THREE.BoxGeometry(14, 10, 22), new THREE.MeshStandardMaterial({ color: 0x6a3a1c, metalness: .6, roughness: .5 }));
  if (worldM) { A.fix(relic); relic.scale.setScalar(CM); } relic.visible = false; relic.traverse(o => { o.castShadow = false; }); scene.add(relic);
  for (const v of [flameV, punchV, hands]) if (v) { A.fix(v); v.visible = false; viewScene?.add(v); }
  if (whelpM) { A.fix(whelpM); host.warmObjects?.push(whelpM); }
  // ---- BO3's fxanim props: the boards over the egg's hole (and the egg's roll out), the incubator (and its egg) --------
  // built in inches, Y-up; their clips are delta clips (offsets from each joint's bind pose); stand-ins without assets
  const props = {};
  const propNote = (k, n) => {
    if (n === 'sndnt#zmb_pavlov_crash_up') sound('boards_up', .9, BOARDS); else if (n === 'sndnt#zmb_pavlov_crash_down') sound('boards_down', .9, BOARDS);
    else if (n === 'sndnt#zmb_egg_roll') sound('egg_roll', .8, EGG_REST); else if (k === 'boards_egg' && n === 'egg_at_rest') eggRested();
  };
  if (J?.props) await Promise.all(Object.entries(J.props).map(async ([k, d]) => { try {
    const root = await loadModel(abs(d.model)); const rig = new Rig(root, n => propNote(k, n));
    root.traverse(o => { if (o !== root) o.userData.bindPosition = o.position.clone(); if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    for (const [a, u] of Object.entries(d.animations ?? {})) rig.add(a, await loadAnimation(abs(u)));
    props[k] = { root, rig, dur: d.durations ?? {}, t: 0, next: null };
  } catch (e) { console.warn('[gorod-krovi] gauntlet prop', k, e?.message ?? e); } }));
  const hold = (P, a) => { if (!P?.rig.actions[a]) return; P.rig.play(a, false, 0, 0); P.rig.update(0); P.next = null; };   // frame 0, still
  const playP = (P, a, then = null) => { if (!P?.rig.actions[a]) return; kino.staticFreeze?.thaw?.(P.root); P.rig.play(a, false, 1, 0); P.t = P.dur[a] ?? 0; P.next = then; };
  const BD = props.boards, BE = props.boards_egg, IN = props.incubator, IE = props.incubator_egg;
  for (const P of [BD, BE]) if (P) { P.root.position.copy(W(-3096, 22300, 0)); scene.add(P.root); hold(P, 'fall'); moved(P.root); }   // the scriptbundle's origin, no angles
  for (const P of [IN, IE]) if (P) { P.root.position.copy(INC); P.root.rotation.y = Math.PI / 4; scene.add(P.root); hold(P, 'place'); moved(P.root); }   // dragon_incubator: angles 0 45 0
  // the egg rides the roll clip's root (its frame is CoD's: undo the GLB's Z-up turn), then stays where the clip leaves it
  const eggBone = BE?.root.getObjectByName('rig_root');
  if (BE) BE.root.traverse(o => { if (o.isMesh) o.visible = false; });   // the clip's own egg is an empty stand-in
  let restQ = null, restP = null; const uprightQ = egg.quaternion.clone();
  if (eggBone && eggM) {   // where the roll ends: play it through once at load
    eggBone.add(egg); egg.position.set(0, 0, 0); egg.rotation.set(Math.PI / 2, 0, 0);
    BE.rig.play('fall', false, 1, 0); BE.rig.mixer.update(BE.dur.fall ?? 5.3333); BE.root.updateMatrixWorld(true);
    restQ = egg.getWorldQuaternion(new THREE.Quaternion()); restP = egg.getWorldPosition(new THREE.Vector3());
    scene.attach(egg); hold(BE, 'fall'); moved(BE.root);
  }
  function eggRested() { S.rolling = false; if (egg.parent !== eggBone) return; scene.attach(egg); if (restQ) egg.quaternion.copy(restQ); moved(egg); }
  // the incubator's egg glows with the carried one
  if (IE) IE.root.traverse(o => { if (!o.isMesh) return; o.material = o.material.clone(); o.material.emissiveMap = o.material.map ?? null; o.material.emissive?.set(0xff5a10); o.material.emissiveIntensity = 0; eggMats.push(o.material); });
  if (IE) IE.root.visible = false;
  // stand-ins when the props are missing: planks over the hole, a stone block for the incubator
  const wood = new THREE.MeshStandardMaterial({ color: 0x5b4127, roughness: .85 }), stone = new THREE.MeshStandardMaterial({ color: 0x5d5a55, roughness: .9 });
  const boards = new THREE.Group(); boards.position.copy(BOARDS);
  if (!BD) { for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(56, 6, 2), wood); b.position.set(0, -14 + i * 12, 0); b.rotation.z = (i - 1) * .12; boards.add(b); }
    boards.rotation.y = Math.atan2(-(EGG_PICK.z - BOARDS.z), EGG_PICK.x - BOARDS.x) + Math.PI / 2; scene.add(boards); moved(boards); }   // facing the egg's rest
  if (!IN) { const incub = new THREE.Mesh(new THREE.CylinderGeometry(16, 20, 22, 10), stone); incub.position.copy(INC).add(new THREE.Vector3(0, 11, 0)); scene.add(incub); moved(incub); }
  for (const t of [glowE, ...Object.values(sheets).map(s => s.tex)]) if (t) { const done = () => renderer?.initTexture?.(t); t.image ? done() : (host.pending ??= []).push?.(new Promise(r => { const i = setInterval(() => { if (t.image) { clearInterval(i); done(); r(); } }, 50); setTimeout(() => { clearInterval(i); r(); }, 8000); })); }

  // ---- the weapon and the fire -----------------------------------------------------------------------------------------
  const weapon = setupGauntletWeapon(api, gk, A);
  const players = () => 1 + (api.coop?.peers?.size ?? 0);
  const N = () => 3 + 2 * players();
  const S = { state: 'boards', kills: 0, spot: null, bath: null, coolRound: 0, incKills: 0, lockdown: null, lastShot: -1, relicT: 0, relicUp: false, given: false };
  const hazard = setupHazard(api, gk, {
    sound,
    want: () => (S.state === 'placed' ? { area: S.spot, every: 25 } : S.state === 'napalm' ? { spawnNapalm: true, every: 45 + Math.random() * 25 } : null),
  });

  // ---- the quest -------------------------------------------------------------------------------------------------------
  const zoneOn = () => !!world.activeZones?.(session)?.has('pavlovsb');
  function put(o, p, q = null) { if (o.parent !== scene) scene.attach(o); o.position.copy(p); if (q) o.quaternion.copy(q); moved(o); }
  function eggAtSpot(name) { const c = COOK[name], y = world.surfaceY?.(c.x, c.y + 20, c.z); return new THREE.Vector3(c.x, (y ?? c.y) + 8, c.z); }
  function refresh() {
    const s = S.state;
    boards.visible = s === 'boards';
    const inInc = ['lockdown', 'hot', 'collect'].includes(s);
    egg.visible = ['egg', 'placed', 'bathed', 'cooled'].includes(s) || (inInc && !IE);
    if (IE) IE.root.visible = inInc;
    if (BD && s !== 'boards' && !S.rolling) { for (const P of [BD, BE]) if (P.rig.current !== 'fall' || P.rig.actions.fall.timeScale === 0) { kino.staticFreeze?.thaw?.(P.root); P.rig.play('fall', false, 1, 0); P.rig.mixer.update(P.dur.fall ?? 5.3333); P.next = null; P.t = 0; } }   // a skipped step: the boards lie broken
    if (s === 'egg' && !S.rolling) put(egg, restP ?? EGG_REST, restQ);
    if (['placed', 'bathed', 'cooled'].includes(s) && S.spot) put(egg, eggAtSpot(S.spot), uprightQ);
    if (inInc && !IE) put(egg, INC.clone().add(new THREE.Vector3(0, 30, 0)), uprightQ);
    glow(s === 'bathed' || s === 'hot' ? 2.2 : s === 'lockdown' ? .4 + Math.min(1.6, S.incKills / incGoal() * 1.6) : 0);
    if (s !== 'done') { relic.visible = false; S.relicUp = false; }
    hud();
  }
  function go(s, msg = null) {
    S.state = s; if (!['napalm', 'pierce', 'melee'].includes(s)) S.kills = 0; refresh();
    if (msg) api.toast?.(msg, 3);
    gk.emit('gauntlet:step', s, STEP_NO[s]);
  }
  const incGoal = () => 7 + 6 * players();   // BO3: 13 solo, 31 with four
  function count(n = 1) {
    if (!['napalm', 'pierce', 'melee'].includes(S.state)) return;
    S.kills += n; sound('egg_roll', .35); hud();
    if (S.kills >= N()) {
      const next = { napalm: 'pierce', pierce: 'melee', melee: 'incubate' }[S.state];
      S.kills = 0; go(next, { pierce: 'The egg hungers · kill zombies with bullets that pass through', melee: 'The egg hungers · melee kills', incubate: 'The egg is ready · bring it to the incubator in Pavlov\'s sewer' }[next]);
      sound('scream' + (1 + Math.floor(Math.random() * 5)), .5);
    }
  }

  // step 0: the boards
  let target = null;
  function arm() {
    if (target || S.state !== 'boards' || !zoneOn()) return;
    world.shootTargets ??= [];
    target = world.addShootTarget({ position: BOARDS.clone(), radius: 40, gauntlet: true, hit() { target = null; breakBoards(); } });
  }
  function disarm() { if (!target) return; const l = world.shootTargets ?? [], i = l.indexOf(target); if (i >= 0) l.splice(i, 1); target = null; }
  const falling = [];
  function breakBoards() {
    if (S.state !== 'boards') return;
    S.state = 'egg'; egg.visible = true;
    if (BD) { playP(BD, 'fall'); if (eggBone && eggM) { S.rolling = true; eggBone.add(egg); egg.position.set(0, 0, 0); egg.rotation.set(Math.PI / 2, 0, 0); moved(egg); playP(BE, 'fall'); } else put(egg, EGG_REST); }   // BO3's clips: the boards crash, the egg rolls out (sounds from their notes)
    else { audio.play?.('board', .8); for (const b of boards.children) falling.push({ b, v: new THREE.Vector3((Math.random() - .5) * 60, 40 + Math.random() * 40, (Math.random() - .5) * 60), s: (Math.random() - .5) * 6 });
      S.boardsT = 1.2; put(egg, EGG_REST); sound('egg_roll', .8, EGG_REST); }
    hud();
    gk.emit('gauntlet:step', 'egg', 0);
  }
  world.addInteraction({ position: EGG_PICK.clone(), hidden: () => S.state !== 'egg' || !!S.rolling, text: () => 'Take the dragon egg',
    use() { if (S.state !== 'egg') return false; sound('egg_pickup', .8); go('carry', 'Dragon egg · lay it where the dragon\'s fire falls'); return true; } });
  for (const [name, p] of Object.entries(COOK)) world.addInteraction({ position: p.clone().add(new THREE.Vector3(0, 30, 0)),
    hidden: () => !(S.state === 'carry' || (S.state === 'cooled' && S.spot === name) || (S.state === 'placed' && S.spot === name)),
    text: () => S.state === 'carry' ? 'Place the dragon egg' : S.state === 'placed' ? 'Take the dragon egg back' : 'Take the awakened egg',
    use() {
      if (S.state === 'carry') { S.spot = name; S.bath = null; sound('egg_place', .8); go('placed', `The egg rests at ${COOK_NAME[name]} · wait for the dragon's fire`); hazard.timer = 20; return true; }
      if (S.state === 'placed' && S.spot === name) { S.spot = null; sound('egg_pickup', .8); go('carry'); return true; }
      if (S.state === 'cooled' && S.spot === name) { sound('egg_pickup', .8); gk.setFlag('egg_awakened'); go('napalm', 'The egg has awakened · kill napalm zombies'); return true; }
      return false;
    } });
  // step 1: the bath and the cooling
  gk.on('dragon:hazard', e => {
    if (S.state !== 'placed' || !e || e.area !== S.spot) return;
    if (e.on) S.bath = { t: 0, dur: e.dur ?? 10 };
    else if (S.bath && S.bath.t >= S.bath.dur - .3) { S.coolRound = session.round; go('bathed', 'The egg is red hot · it cools after a full round'); }
    else S.bath = null;
  });
  host.on('roundEnd', e => {
    const r = e?.round ?? session.round;
    if (S.state === 'bathed' && r > S.coolRound) go('cooled', `The egg has cooled at ${COOK_NAME[S.spot]} · take it`);
    else if (S.state === 'hot' && r > S.coolRound) go('collect', 'The incubator has cooled · take the egg');
  });
  // steps 2-4: kills
  host.on('beforeEnemyDamage', e => { if (e?.enemy) e.enemy.gkCause = e.cause; });
  gk.on('napalm:death', d => { if (S.state !== 'napalm' || !d?.z) return; if (d.z.root.position.distanceTo(player.getFeetPosition()) < 900) count(); });
  host.on('kill', e => {
    const z = e?.enemy; if (!z || e.remote) return;
    if (S.state === 'pierce' && (z.gkCause ?? 'bullet') === 'bullet' && !e.melee && !(session.def?.pellets > 1)) {
      if (session.shots === S.lastShot) count(); S.lastShot = session.shots;
    }
    if (S.state === 'melee' && e.melee) count();
    if (S.state === 'lockdown' && z.root.position.distanceTo(INC_SCORE) < INC_R) { S.incKills++; refresh(); if (S.incKills >= incGoal()) endLockdown(true); }
  });
  gk.on('shield:breath', b => { if (S.state === 'melee' && b?.kills) count(b.kills); });
  // step 5: the incubator lockdown
  world.addInteraction({ position: INC_PROMPT.clone(), hidden: () => !['incubate', 'collect'].includes(S.state),
    locked: () => S.state === 'incubate' && gk.pap?.state?.().state === 'active', lockedText: 'Not during the lockdown',
    text: () => S.state === 'incubate' ? 'Place the egg in the incubator' : 'Take the egg',
    use() {
      if (S.state === 'incubate') { if (gk.pap?.state?.().state === 'active') return false; startLockdown(); return true; }
      if (S.state === 'collect') { sound('inc_grab', .8); go('done', 'The egg has hatched · go to the grave by the fountain'); gk.setFlag('egg_hatched'); return true; }
      return false;
    } });
  const sewer = world.teleporters?.find(tp => /sewer/i.test(tp.name ?? ''));
  if (sewer) { const d = Object.getOwnPropertyDescriptor(sewer, 'locked'), prev = d?.get ? d.get.bind(sewer) : (() => { const v = sewer.locked; return () => v; })();
    const pt = Object.getOwnPropertyDescriptor(sewer, 'lockedText'), prevT = pt?.get ? pt.get.bind(sewer) : (() => { const v = sewer.lockedText; return () => v; })();
    Object.defineProperty(sewer, 'locked', { configurable: true, get: () => !!S.lockdown || !!prev() });
    Object.defineProperty(sewer, 'lockedText', { configurable: true, get: () => (S.lockdown ? 'The incubator holds the doors' : prevT()) }); }
  const snap = p => world.closest?.(p, { x: 200, y: 300, z: 200 }) ?? p.clone();
  function runnerWave() {
    const B = gk.bosses, pts = INC_SPAWNS.map(snap);
    const onSpawn = z => { hazard.runner(z); z.gkIncubator = true; };
    if (B?.zombieWave) return B.zombieWave({ points: pts, total: Infinity, maxAlive: () => 10 + 2 * players(), interval: 1.2, until: () => !S.lockdown, onSpawn });
    const w = { list: new Set(), t: 0, stopped: false, stop() { w.stopped = true; }, tick(dt) {   // no bosses.js: spawn ourselves
      for (const z of w.list) if (!enemies.list.includes(z)) w.list.delete(z);
      if ((w.t -= dt) > 0 || w.list.size >= 10) return; w.t = 1.2;
      const p = pts[Math.floor(Math.random() * pts.length)], z = enemies.spawn?.(p, null, 'zombie'); if (!z) return;
      session.spawned--; z.tempo = true; enemies.riseAt?.(z, p); onSpawn(z); w.list.add(z); } };
    S.local = w; return w;
  }
  function startLockdown() {
    sound('inc_open', .8); sound('egg_place', .7);
    playP(IN, 'place', 'warm'); playP(IE, 'place', 'warm');   // the egg goes in, then the incubator warms (looping) until the lockdown ends
    S.incKills = 0; S.lockdown = { waves: [], t: 0, away: 0, auto: enemies.autoSpawn };
    go('lockdown', `Defend the incubator · ${incGoal()} kills`);
    for (let i = 0; i < 4; i++) setTimeout(() => { if (S.lockdown) sound('alarm', .8); }, i * 1000);
    S.lockdown.waves.push(runnerWave());
    if (gk.bosses?.sentinelWave) S.lockdown.waves.push(gk.bosses.sentinelWave({ points: [snap(INC_SCORE).add(new THREE.Vector3(0, 160, 0))], maxAlive: 1, interval: 13, until: () => !S.lockdown }));
    gk.emit('gauntlet:lockdown', 'start');
  }
  function endLockdown(won) {
    const L = S.lockdown; if (!L) return; S.lockdown = null; for (const w of L.waves) w?.stop?.(); S.local = null;
    sound('inc_close', .8); gk.emit('gauntlet:lockdown', won ? 'end' : 'fail');
    playP(IN, 'end'); playP(IE, 'end');
    if (won) { S.coolRound = session.round; go('hot', 'The egg is incubating · it cools after a full round'); }
    else go('incubate', 'The incubator went cold · try again');
  }
  // step 6: the grave
  world.addInteraction({ position: GRAVE.clone(), hidden: () => S.state !== 'done' || weapon?.live || kino.operator?.current === ID && kino.operator?.active,
    text: () => (S.relicUp ? 'Take the Gauntlet of Siegfried' : 'Dig at the grave'),
    use() {
      if (S.state !== 'done') return false;
      if (!S.relicUp) { S.relicUp = true; S.relicT = 0; relic.visible = true; put(relic, REWARD.clone().add(new THREE.Vector3(0, 30, 0))); sound('attach', .7, REWARD); return true; }
      S.relicUp = false; relic.visible = false; give(); return true;
    } });
  function give() { if (!kino.operator?.give?.(ID, { full: true })) return false; S.given = true; sound('scream1', .6); gk.emit('gauntlet:given'); return true; }

  // ---- every frame -----------------------------------------------------------------------------------------------------
  host.on('update', dt => {
    if (!dt) return;
    if (S.state === 'boards') arm();
    for (const P of [BD, BE, IN, IE]) if (P && (P.next || P.rig.actions[P.rig.current]?.isRunning())) {   // the props' clips while they run (a once clip hands over to its next, 'warm' loops)
      P.rig.update(dt); if (P.next && (P.t -= dt) <= 0) { const n = P.next; P.next = null; if (P.rig.actions[n]) P.rig.play(n, true, 1, .2); } }
    if (falling.length) { for (const f of falling) { f.v.y -= 600 * dt; f.b.position.addScaledVector(f.v, dt); f.b.rotation.z += f.s * dt; } boards.updateMatrixWorld(true);
      if ((S.boardsT -= dt) <= 0) { boards.visible = false; for (const f of falling) { f.b.position.set(0, 0, 0); } falling.length = 0; } }
    if (S.state === 'placed' && S.bath) { S.bath.t += dt; glow(Math.min(2.2, S.bath.t / S.bath.dur * 2.2)); if (!inArea(S.spot, egg.position) && !hazard.active()) S.bath = null; }
    if (S.state === 'bathed' || S.state === 'hot') glow(1.6 + Math.sin(session.time * 3) * .5);
    if (S.lockdown) {
      S.local?.tick?.(dt);
      // left behind: the incubator goes cold after 10 s away
      if (player.getFeetPosition().distanceTo(INC) > 1400) { if ((S.lockdown.away += dt) > 10) endLockdown(false); } else S.lockdown.away = 0;
    }
    if (S.relicUp) { S.relicT += dt; const k = S.relicT / 12; relic.position.y = REWARD.y + 30 - 30 * k; relic.rotation.y += dt * .6; moved(relic);
      if (k >= 1) { S.relicUp = false; relic.visible = false; } }
  });
  host.on('reset', () => { disarm(); endLockdown(false); Object.assign(S, { state: 'boards', kills: 0, spot: null, bath: null, incKills: 0, relicUp: false, given: false, lastShot: -1 });
    for (const b of boards.children) b.position.y = -14 + boards.children.indexOf(b) * 12;
    S.rolling = false; hold(BD, 'fall'); hold(BE, 'fall'); hold(IN, 'place'); hold(IE, 'place'); refresh(); });

  // ---- HUD: the egg in the corner, filling per step (BO3's egg meter) ---------------------------------------------------
  const style = document.createElement('style');
  style.textContent = `#gk-egg{position:fixed;left:18px;bottom:150px;width:46px;height:58px;pointer-events:none;z-index:6;display:none}
#gk-egg img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}#gk-egg .n{position:absolute;left:52px;bottom:4px;font:600 13px/1 system-ui,sans-serif;color:#ffd9a8;white-space:nowrap;text-shadow:0 1px 2px #000}`;
  document.head.append(style);
  const el = document.createElement('div'); el.id = 'gk-egg';
  const eImg = new Image(), fImg = new Image(), nEl = document.createElement('div'); nEl.className = 'n';
  if (J?.textures?.egg) { eImg.src = J.textures.egg; fImg.src = J.textures.egg_fill ?? J.textures.egg; }
  el.append(eImg, fImg, nEl); document.body.append(el);
  let warmHud = false;
  function progress() { const s = S.state; return s === 'done' ? 1 : STEP_NO[s] <= 1 ? (s === 'cooled' ? .2 : 0) : STEP_NO[s] === 5 ? .8 : [0, 0, .2, .4, .6][STEP_NO[s]] + .2 * (S.kills / N()); }
  function hud() {
    const show = warmHud || (STEP_NO[S.state] >= 1 && S.state !== 'done' && S.state !== 'placed' && S.state !== 'bathed' && S.state !== 'cooled') || S.state === 'cooled';
    el.style.display = show ? 'block' : 'none'; if (!show) return;
    const f = warmHud ? .5 : progress(); fImg.style.clipPath = `inset(${Math.round((1 - f) * 100)}% 0 0 0)`;
    nEl.textContent = warmHud ? '0 / 5' : ['napalm', 'pierce', 'melee'].includes(S.state) ? `${S.kills} / ${N()}` : S.state === 'lockdown' ? `${S.incKills} / ${incGoal()}` : '';
  }
  host.on('warmHud', on => { warmHud = !!on; hud(); });

  // ---- cheat and debug -------------------------------------------------------------------------------------------------
  function step(n) {
    const s = typeof n === 'number' ? ({ 0: 'boards', 1: 'carry', 2: 'napalm', 3: 'pierce', 4: 'melee', 5: 'incubate', 6: 'done' }[n]) : n;
    if (!STEPS.includes(s)) return 'unknown step';
    if (S.lockdown && s !== 'lockdown') endLockdown(false);
    if (s === 'lockdown') { if (!S.lockdown) startLockdown(); return s; }
    if (['placed', 'bathed', 'cooled'].includes(s)) S.spot ??= 'fountain';
    disarm(); go(s); return s;
  }
  const status = () => `gauntlet: ${S.state}${['napalm', 'pierce', 'melee'].includes(S.state) ? ` ${S.kills}/${N()}` : ''}${S.lockdown ? ` ${S.incKills}/${incGoal()}` : ''}${S.spot ? ' · egg at ' + S.spot : ''}${hazard.active() ? ' · fire on ' + hazard.active().area : ''}`;
  const addCheat = (tries = 0) => {
    const ch = kino.cheats; if (!ch?.addCommand) { if (tries < 20) setTimeout(() => addCheat(tries + 1), 500); return; }
    ch.addCommand('gauntlet', { usage: 'gauntlet [give|step <0-6|name>|hazard [area]|napalm|status]', text: 'The Gauntlet of Siegfried and its egg quest', cheat: true,
      run: args => { const [c = 'give', a] = args ?? [];
        if (c === 'give') return give() ? 'Gauntlet of Siegfried given (Y)' : 'no operator weapons mod';
        if (c === 'step') return 'step: ' + step(/^\d$/.test(a ?? '') ? +a : a);
        if (c === 'hazard') { const f = player.getFeetPosition(); const n = a ?? Object.keys(AREAS).sort((x, y) => AREAS[x].distanceTo(f) - AREAS[y].distanceTo(f))[0]; return hazard.start(n, 10) ? 'fire on ' + n : 'areas: ' + Object.keys(AREAS).join(' '); }
        if (c === 'napalm') { let k = 0; for (const z of enemies.list) if (hazard.napalm(z)) k++; return k + ' napalm zombies'; }
        return status(); } });
  };
  addCheat();
  const handle = { get state() { return S.state; }, S, step, give, status, hazard, weapon, A, N, incGoal, breakBoards, count,
    spots: COOK, areas: AREAS, positions: { BOARDS, EGG_PICK, EGG_REST, INC_PROMPT, INC, GRAVE, REWARD }, egg, relic, props };
  gk.gauntlet = handle; (kino.gorod ??= {}).gauntlet = handle;
  refresh();
}
