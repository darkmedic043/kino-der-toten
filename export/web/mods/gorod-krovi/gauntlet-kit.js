// The Gauntlet of Siegfried's kit: what the weapon needs on any map (gauntlet.json, BO3's sounds, the glowing trim, the flame's
// sprite pool, the whelp, both viewmodels warmed hidden in the view scene). gauntlet.js (the egg quest, Gorod Krovi) and
// operator-weapons/gauntlet.js (other maps, for a player who has it unlocked in the Armory) build it, then setupGauntletWeapon.
// Returns A: { J (null without the BO3 files: stand-ins), sound(n, v, at, range), soundAt, loop, warmSounds, fix(root, mode),
//   pool, whelpClips, whelpModel() }
import * as THREE from 'three';
import { loadModel, loadAnimation } from '../../animation.js';

const ROOT = new URL('../../', import.meta.url), DIR = 'mods/maps/gorod-krovi/gauntlet/';
export const abs = u => (typeof u === 'string' ? new URL(u, ROOT).href : u);

export async function gauntletKit(api, { quiet = false } = {}) {
  const { host, scene, viewScene, audio, camera, renderer } = api;
  let J = null;
  try { const r = await fetch(abs(DIR + 'gauntlet.json')); if (!r.ok) throw new Error(r.status); J = await r.json(); }
  catch { if (!quiet) console.warn('[gorod-krovi] gauntlet: no assets (python3 -I .tools/build_gk_gauntlet.py); stand-ins'); }
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

  // ---- the viewmodels and the whelp, warmed at load (their first draw is mid-game) -------------------------------------
  const [whelpM, flameV, punchV, hands] = J ? await Promise.all([J.whelp.model, J.flame.model, J.punch.model, J.flame.handsModel].map(u => loadModel(u).catch(() => null))) : [];
  for (const v of [flameV, punchV, hands]) if (v) { A.fix(v); v.visible = false; viewScene?.add(v); }
  if (whelpM) { A.fix(whelpM); host.warmObjects?.push(whelpM); }
  for (const t of [glowE, ...Object.values(sheets).map(s => s.tex)]) if (t) { const done = () => renderer?.initTexture?.(t); t.image ? done() : (host.pending ??= []).push?.(new Promise(r => { const i = setInterval(() => { if (t.image) { clearInterval(i); done(); r(); } }, 50); setTimeout(() => { clearInterval(i); r(); }, 8000); })); }
  return A;
}
