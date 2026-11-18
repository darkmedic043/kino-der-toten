// Ray Gun Mk3 (GKZ-45 Mk3; Pack-a-Punched: Maelstrom of Eris), Gorod Krovi's box wonder weapon, built by
// .tools/build_bo3_weapons.py (def.mk3). Behaviour after BO3's _zm_weap_raygun_mark3 (our own code and numbers):
// - right gun (Mark III): a fast hitscan beam (the engine's own shot, def.damage), drawn here as a bolt;
// - left gun (GKZ-45, def.clipLeft / fireTimeLeft): a slow lobbed shot. A zombie it hits is slowed (0.7 for 2 s,
//   Pack-a-Punched 0.5 for 3 s); where it lands it opens a small vortex for 3 s (a black ball in a yellow cloud) that
//   pulses every 0.5 s within 128: 50 damage (100 Pack-a-Punched), and never kills (a zombie at or under the pulse's
//   damage is only marked). It does not pull or hold zombies;
// - a right-gun beam through the vortex charges it into the black hole (a violet cloud round a white core, a flare
//   streak, embers falling in): another 3 s, pulses of 1000 (5000), and a zombie at or under that is disintegrated:
//   it floats up writhing, black, and burns away from the edges in violet ash (BO3's deathray scene and dissolve);
// - a zombie a pulse reaches turns black for 2 s (BO3's zombie_blacken) with a small vortex spinning in its chest;
// - standing within 64 of a vortex tints the screen violet (BO3's raygun_mark3_vortex visionset).
// The vortex looks are the same Pack-a-Punched or not (as in BO3). Sounds are BO3's from zm_stalingrad's bank
// (built.sounds.mod.bo3_raygun_mk3.extra). Effects are sprites, the fx mod's pooled particles and a material patch on
// the zombies (pooled clones, one program per source material, compiled at load); no lights are added (lighting.md).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const TUNE = {
  base: { direct: 1500, pulse: 50, charged: 1000, slow: .7, slowT: 2, beam: 0x7dff6a },
  pap: { direct: 3500, pulse: 100, charged: 5000, slow: .5, slowT: 3, beam: 0xff5ad2 },
};
const SMALL = { cloud: 0xffb43c, glow: 0xffe39a, spark: 0xffd070 };   // the small vortex: a yellow cloud round the black ball
const LARGE = { cloud: 0x8c3cff, cloud2: 0xc04cff, core: 0xffe0fa, flare: 0xff86e6, ember: 0xc878ff, dark: 0x0c0016 };   // the black hole
const SPEED = 1300, LIFT = 140, GRAVITY = 900, FLIGHT = 2.5;   // the lobbed shot: units/s, upward kick, fall, longest flight
const ORB_LIFE = 3, PULSE = .5, RADIUS = 128, CHARGE_HIT = 34, MAX_ORBS = 6;
const CAUGHT = 2, NEAR = 64, RISE = 42, DISS_AT = .55, DISS_T = 1.05;   // marked 2 s; screen tint; deathray lift and dissolve

export const isMk3Def = (data, def) => !!(def?.mk3 || data.weapons[def?.baseId ?? def?.id]?.mk3);

// The Gunsmith kit (mk3-kit.js, user 2026-11-18): attachment ids on def.attachments ('a+b', gunsmith.js applyStats)
const has = (def, id) => (def?.attachments ?? '').split('+').includes(id);
const kitOf = def => ({ horizon: has(def, 'mk3_horizon'), cap: has(def, 'mk3_capacitor'), dark: has(def, 'mk3_darkmatter') });
// Event Horizon Coil: vortices 40% wider, 1.5 s longer, and they drag zombies in; Overcharge Capacitor: a beam charges
// a vortex from 3x as far, a black hole pulses every 0.3 s; Dark Matter Rounds: a beam kill may leave a small vortex
const HORIZON = { radius: 1.4, life: 1.5, pull: 70, stop: 30 }, CAP = { reach: 3, pulse: .3 }, DARK = { chance: .25, gap: 1.2 };

// the zombies' patch: x = black (BO3's blacken, with a violet rim), y = dissolve (noise on the bind-pose position, a
// glowing violet edge). Uniform-gated, so one program does both and an unmarked frame costs a few ALU ops
function patchVoid(sh, u) {
  sh.uniforms.mk3V = u;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMk3P;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMk3P=position;');
  const rim = sh.fragmentShader.includes('vViewPosition') && sh.fragmentShader.includes('#include <normal_fragment_begin>');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vMk3P;uniform vec4 mk3V;
float mk3H(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
float mk3N(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(mk3H(i),mk3H(i+vec3(1,0,0)),f.x),mix(mk3H(i+vec3(0,1,0)),mk3H(i+vec3(1,1,0)),f.x),f.y),
  mix(mix(mk3H(i+vec3(0,0,1)),mk3H(i+vec3(1,0,1)),f.x),mix(mk3H(i+vec3(0,1,1)),mk3H(i+vec3(1,1,1)),f.x),f.y),f.z);}`)
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
float mk3D=mk3V.y>0.?mk3N(vMk3P*.09)*.65+mk3N(vMk3P*.33)*.35-mk3V.y*1.12:1.;
if(mk3D<0.)discard;`)
    .replace('#include <opaque_fragment>', `#include <opaque_fragment>
{float rim=${rim ? 'pow(1.-abs(dot(normalize(normal),normalize(vViewPosition))),3.)' : '0.'};
 gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.5,.18,1.)*rim*.6,mk3V.x);
 gl_FragColor.rgb+=vec3(.9,.42,1.)*(1.-smoothstep(0.,.08,mk3D))*step(.001,mk3V.y)*5.;}`);
}

export function setupMk3(api, { play, sounds }) {
  const { host, session, camera, scene, world, enemies, data, view, viewCamera } = api;
  const isMk3 = def => isMk3Def(data, def);
  const X = sounds?.extra ?? {}, now = () => session.time ?? performance.now() / 1000;
  const tune = def => (def?.upgraded || session.weapon?.upgraded) ? TUNE.pap : TUNE.base;
  const alive = z => enemies.list.includes(z) && z.health > 0;
  const fx = () => window.kino?.fx;

  // ---- textures: a soft glow, a swirl, a puffy cloud, a ragged dark wisp ------------------------------------------
  const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const blob = (g, x, y, r, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const glowTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.22, 'rgba(255,255,255,.8)'); gr.addColorStop(.55, 'rgba(255,255,255,.2)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const swirlTex = canvasTex(128, 128, (g) => { g.translate(64, 64);   // curved arms: the vortex turning
    for (let a = 0; a < 5; a++) { g.rotate(Math.PI * 2 / 5); g.beginPath(); for (let t = 0; t <= 1; t += .04) { const r = 8 + 52 * t, th = t * 2.6; g.lineTo(r * Math.cos(th), r * Math.sin(th)); }
      for (const [w, a] of [[16, .1], [10, .18], [5, .35]]) { g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = w; g.stroke(); } } });   // soft-edged arms (layered strokes)
  const cloudTex = canvasTex(128, 128, (g) => { for (let i = 0; i < 46; i++) { const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 36; blob(g, 64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 12 + rnd() * 20, .18 + rnd() * .2); } });
  const wispTex = canvasTex(128, 128, (g) => { for (let i = 0; i < 70; i++) { const a = rnd() * Math.PI * 2, d = 10 + rnd() * 44, s = a + d * .05; blob(g, 64 + Math.cos(s) * d, 64 + Math.sin(s) * d, 5 + rnd() * 9, .25 + rnd() * .3); } });

  const add = (o = {}) => ({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, ...o });
  const ballGeo = new THREE.IcosahedronGeometry(1, 2);
  const M = {
    ball: new THREE.MeshBasicMaterial({ color: 0x000000 }),   // BO3's ray_gun_ball model is a plain black sphere
    halo: new THREE.SpriteMaterial(add({ map: glowTex, color: SMALL.glow, opacity: .8 })),
    cloudS: new THREE.SpriteMaterial(add({ map: cloudTex, color: SMALL.cloud, opacity: .75 })),
    swirlS: new THREE.SpriteMaterial(add({ map: swirlTex, color: SMALL.cloud, opacity: .55 })),
    dark: new THREE.SpriteMaterial({ map: wispTex, color: LARGE.dark, transparent: true, depthWrite: false, fog: false, opacity: .8 }),
    cloudL: new THREE.SpriteMaterial(add({ map: cloudTex, color: LARGE.cloud, opacity: .65 })),
    core: new THREE.SpriteMaterial(add({ map: glowTex, color: LARGE.core })),
    flare: new THREE.SpriteMaterial(add({ map: glowTex, color: LARGE.flare, opacity: .9 })),
    swirlL: new THREE.SpriteMaterial(add({ map: swirlTex, color: LARGE.cloud2, opacity: .4 })),
    miniSwirl: new THREE.SpriteMaterial(add({ map: swirlTex, color: LARGE.cloud2, opacity: .9 })),
    miniGlow: new THREE.SpriteMaterial(add({ map: glowTex, color: LARGE.cloud, opacity: .7 })),
  };
  const spr = (m, s, order = 6, own = false) => { const o = new THREE.Sprite(own ? m.clone() : m); o.scale.setScalar(s); o.renderOrder = order; o.frustumCulled = false; return o; };
  // one vortex: the small set (the ball in a yellow cloud) and the large set (the black hole), shown by state
  function orbVisual() {
    const g = new THREE.Group(), ball = new THREE.Mesh(ballGeo, M.ball); ball.scale.setScalar(6); ball.frustumCulled = false;
    const small = { halo: spr(M.halo, 46), c1: spr(M.cloudS, 74, 6, true), c2: spr(M.cloudS, 58, 6, true), swirl: spr(M.swirlS, 62, 6, true) };
    const large = { dark: spr(M.dark, 170, 5, true), c1: spr(M.cloudL, 250, 6, true), c2: spr(M.cloudL, 200, 6, true), swirl: spr(M.swirlL, 180, 6, true), core: spr(M.core, 64, 7), flare: spr(M.flare, 1, 7) };
    large.flare.scale.set(330, 18, 1);   // a sprite keeps screen axes: a horizontal streak through the core, as in BO3
    const sg = new THREE.Group(), lg = new THREE.Group(); sg.add(...Object.values(small)); lg.add(...Object.values(large)); g.add(ball, sg, lg);
    return { g, ball, sg, lg, small, large };
  }
  const dropVisual = v => { for (const s of [...Object.values(v.small), ...Object.values(v.large)]) if (s.material !== M.halo && s.material !== M.core && s.material !== M.flare) s.material.dispose(); };
  function miniVortex() {   // BO3's blackhole_*_hit on J_SpineUpper
    const g = new THREE.Group(), ball = new THREE.Mesh(ballGeo, M.ball); ball.scale.setScalar(3.2); ball.frustumCulled = false;
    g.add(ball, spr(M.miniGlow, 26), spr(M.miniSwirl, 30)); return g;
  }
  // the beam: a thin additive box from the right gun's barrel to the hit, a short flash
  const beamGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, .5), beams = [];
  const beamMat = { base: new THREE.MeshBasicMaterial(add({ color: TUNE.base.beam, opacity: .9 })), pap: new THREE.MeshBasicMaterial(add({ color: TUNE.pap.beam, opacity: .9 })) };
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(beamGeo, beamMat.base); m.visible = false; m.frustumCulled = false; scene.add(m); beams.push({ m, t: 0 }); }

  // ---- the zombies' black/dissolve materials: pooled clones per source material ---------------------------------
  // A clone keeps no shader hooks: it calls its source's patches (the lighting mod's, applied whenever they are) and
  // then its own, and its key is the source's plus '|mk3void', so every clone of one source shares one program. Each
  // clone has its own uniform (onBeforeCompile runs per material even when the program is cached). Clones are never
  // disposed (that would free the shared program): a restored zombie gives them back to the pool.
  const pool = new Map(), owner = new WeakMap();
  function voidMat(src) {
    const free = pool.get(src); if (free?.length) return free.pop();
    const u = { value: new THREE.Vector4() }, c = src.clone();
    c.userData = { ...src.userData, mapLight: true, baked: true, mk3Void: true };   // the lighting sweeps must not patch it again
    c.onBeforeCompile = (sh, r) => { src.onBeforeCompile?.call(src, sh, r); patchVoid(sh, u); };
    c.customProgramCacheKey = () => src.customProgramCacheKey() + '|mk3void';
    owner.set(c, { src, u }); return c;
  }
  const freeMat = c => { const o = owner.get(c); o.u.value.set(0, 0, 0, 0); if (!pool.has(o.src)) pool.set(o.src, []); pool.get(o.src).push(c); };

  // warm-up: the vortex sprites, the beams and every zombie material's void copy compile while loading
  const warm = new THREE.Group(), wv = orbVisual(); warm.add(wv.g, miniVortex()); for (const k of Object.keys(TUNE)) warm.add(new THREE.Mesh(beamGeo, beamMat[k]));
  warm.traverse(o => { o.frustumCulled = false; }); host.warmObjects?.push(warm);
  const warmZ = new THREE.Group(); warm.add(warmZ);
  const clearWarmZ = () => { for (const c of [...warmZ.children]) { c.traverse(o => { if (o.isMesh) [o.material].flat().forEach(freeMat); o.skeleton?.dispose(); }); warmZ.remove(c); } };
  host.on('warm', () => Promise.resolve().then(() => {   // after the other 'warm' handlers (the lighting mod patches the templates there)
    clearWarmZ();
    const seen = new Set();
    for (const t of [enemies.templates, enemies.heads].flat()) {
      if (!t?.isObject3D) continue; let fresh = false;
      t.traverse(o => { if (o.isMesh && o.material) for (const m of [o.material].flat()) if (!seen.has(m)) { seen.add(m); fresh = true; } });
      if (!fresh) continue;
      const c = cloneSkinned(t); c.traverse(o => { if (!o.isMesh || !o.material) return; o.frustumCulled = false; o.material = Array.isArray(o.material) ? o.material.map(voidMat) : voidMat(o.material); });
      warmZ.add(c);
    }
    warm.updateMatrixWorld(true);
  }));
  host.on('start', () => { warm.removeFromParent(); clearWarmZ(); });

  // the barrel on screen (the guns have their own camera): a tag projected out into the world, 30 ahead of the eye
  const muzzle = left => {
    const g = left ? view?.leftGun : view?.gun, flash = g?.getObjectByName(left ? 'tag_flash_le' : 'tag_flash') ?? g?.getObjectByName('tag_flash');
    if (flash && viewCamera) {
      flash.updateWorldMatrix(true, false); const ndc = flash.localToWorld(new THREE.Vector3()).project(viewCamera);
      const dir = new THREE.Vector3(ndc.x, ndc.y, .5).unproject(camera).sub(camera.position).normalize();
      return camera.position.clone().addScaledVector(dir, 30);
    }
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), down = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).negate();
    return camera.position.clone().addScaledVector(right, left ? -4 : 4).addScaledVector(down, 3);
  };

  // ---- sounds (positional by distance at the start, like the mod's other sounds) ---------------------------------
  const snd = (key, o) => X[key] ? play(X[key], o) : Promise.resolve(null);
  const stop = h => h?.then(x => { try { x?.src.stop(); } catch { } });

  // ---- the direct hit's slow: one speed factor per zombie, the strongest wins, undone when it runs out ------------
  const held = new Map();   // zombie -> { f, until }
  function slow(z, f, t) {
    if (!alive(z)) return;
    const h = held.get(z), until = now() + t;
    if (!h) { z.speed *= f; held.set(z, { f, until }); return; }
    if (f < h.f) { z.speed = z.speed / h.f * f; h.f = f; }
    h.until = Math.max(h.until, until);
  }
  function release(z, h) { if (enemies.list.includes(z)) z.speed /= h.f; held.delete(z); }

  // ---- zombies a pulse reached: black, a small vortex in the chest; the charged ones disintegrate ----------------
  const caught = new Map();   // zombie -> { until, big, black, parts, us, mini, bone, dying }
  function mark(z, big) {
    let c = caught.get(z);
    if (!c) {
      const parts = [];
      z.root.traverse(o => { if (!o.isMesh || !o.material) return; const orig = o.material, list = [orig].flat().map(voidMat); o.material = Array.isArray(orig) ? list : list[0]; parts.push({ o, orig, list }); });
      c = { black: 0, parts, us: parts.flatMap(p => p.list.map(m => owner.get(m).u)), mini: miniVortex(), bone: z.root.getObjectByName('j_spineupper') ?? z.root.getObjectByName('j_spine4') ?? null, dying: null, big: false };
      scene.add(c.mini); caught.set(z, c);
    }
    c.until = now() + CAUGHT; c.big ||= big; c.mini.scale.setScalar(c.big ? 1.6 : 1);
    return c;
  }
  function unmark(z, c) {
    for (const p of c.parts) { p.o.material = p.orig; p.list.forEach(freeMat); }
    c.mini.removeFromParent(); caught.delete(z);
  }
  function disintegrate(z) {
    const c = mark(z, true);
    enemies.hurt(z, z.health + 1, false, false, 'mk3');
    if (enemies.list.includes(z)) return;
    z.life = 99;   // enemies.dead keeps the body and plays its death clip; this ends it
    c.dying = { t: 0, y0: z.root.position.y, rx: z.root.rotation.x, rz: z.root.rotation.z };
    z.rig.mixer.timeScale = .2;   // the fall slowed to a drift while it floats
    z.root.traverse(o => { if (o.isMesh) o.castShadow = false; });
  }
  const wp = new THREE.Vector3();
  function updateCaught(dt, t0) {
    for (const [z, c] of [...caught]) {
      if (!z.root.parent) { unmark(z, c); continue; }
      const d = c.dying, on = !!d || t0 < c.until;
      c.black = Math.max(0, Math.min(1, c.black + (on ? 4 : -4) * dt));   // BO3: 0.2 every 0.05 s, both ways
      let diss = 0;
      if (d) {
        d.t += dt; const k = Math.min(1, d.t / 1.1), lift = 1 - (1 - k) ** 3, r = z.root;
        r.position.y = d.y0 + RISE * lift + Math.sin(d.t * 3) * 2 * lift;
        r.rotation.x = d.rx + Math.sin(d.t * 5.1) * .07 * lift; r.rotation.z = d.rz + Math.sin(d.t * 7.3) * .09 * lift;
        diss = Math.max(0, Math.min(1, (d.t - DISS_AT) / DISS_T));
        if (diss > 0 && diss < 1) for (let i = 0, n = Math.random() < dt * 34 ? 2 : 0; i < n; i++) {
          const at = r.position.clone().add(new THREE.Vector3((Math.random() - .5) * 26, 8 + Math.random() * 62, (Math.random() - .5) * 26));
          fx()?.emit({ key: 'glow', at, vel: new THREE.Vector3((Math.random() - .5) * 40, 40 + Math.random() * 60, (Math.random() - .5) * 40), size: [5, 1], life: .7, fade: [.05, .7], additive: true, color: LARGE.ember, drag: 1 });
          fx()?.emit({ key: 'smoke', at: at.clone(), vel: new THREE.Vector3(0, 26, 0), size: [8, 26], life: .9, fade: [.1, .8], opacity: .45, color: LARGE.dark, spin: 1.2 });
        }
        if (d.t >= DISS_AT + DISS_T) { r.visible = false; z.life = .05; unmark(z, c); continue; }
      }
      for (const u of c.us) u.value.set(c.black, diss, 0, 0);
      if (c.bone) c.bone.getWorldPosition(wp); else wp.copy(z.root.position).setY(z.root.position.y + 48);
      c.mini.position.copy(wp); c.mini.visible = on && diss < .6;
      if (!on && c.black <= 0) unmark(z, c);
    }
  }

  // ---- the left gun's shot ---------------------------------------------------------------------------------------
  const shots = [], orbs = [];
  host.fireHooks ??= [];
  host.fireHooks.push((def, forward) => {
    if (!isMk3(def) || session.lastHand !== 'left') return false;   // the right gun: the engine's hitscan (beam drawn on 'shot')
    const t = tune(def), from = muzzle(true), v = forward.clone().multiplyScalar(SPEED); v.y += LIFT;
    const m = orbVisual(); m.lg.visible = false; m.g.scale.setScalar(.3); m.g.position.copy(from); scene.add(m.g);
    shots.push({ pos: from, vel: v, life: FLIGHT, t, k: kitOf(def), vis: m });
    snd('wpn_mk3_lh_act', { gain: .5 });
    return true;
  });
  const touches = (z, p, r) => {
    const tall = z.kind === 'dog' ? 34 : 72, body = z.kind === 'dog' ? 12 : 15, f = z.root.position;
    const dx = p.x - f.x, dz = p.z - f.z, dy = p.y < f.y ? f.y - p.y : p.y > f.y + tall ? p.y - f.y - tall : 0;
    return dx * dx + dz * dz + dy * dy < (r + body) ** 2;
  };
  function land(s, p, normal) {
    s.vis.g.removeFromParent(); dropVisual(s.vis);
    openOrb(p.clone().addScaledVector(normal ?? new THREE.Vector3(0, 1, 0), 32), s.t, s.k);   // like BO3: 32 off what it hit
  }
  function openOrb(at, t, k = {}) {
    if (orbs.length >= MAX_ORBS) endOrb(orbs[0]);
    const vis = orbVisual(); vis.lg.visible = false; vis.g.position.copy(at); vis.g.scale.setScalar(.01); scene.add(vis.g);
    const life = ORB_LIFE + (k.horizon ? HORIZON.life : 0), radius = RADIUS * (k.horizon ? HORIZON.radius : 1);
    const o = { at, t, k, radius, vis, life, next: PULSE, charged: false, age: 0, big: 0, spark: 0, loop: snd('wpn_mk3_orb_loop', { gain: .55, at, loop: true }) };
    orbs.push(o); snd('wpn_mk3_orb_creation_00', { gain: .8, at });
    fx()?.emit({ key: 'glow', at: at.clone(), size: [20, 120], life: .35, fade: [.02, .8], additive: true, color: SMALL.glow });
  }
  function endOrb(o) {
    const i = orbs.indexOf(o); if (i < 0) return; orbs.splice(i, 1);
    stop(o.loop); snd('wpn_mk3_orb_disappear', { gain: .7, at: o.at });
    o.vis.g.removeFromParent(); dropVisual(o.vis);
    fx()?.emit({ key: 'glow', at: o.at.clone(), size: [o.charged ? 160 : 60, 4], life: .3, fade: [.01, .9], additive: true, color: o.charged ? LARGE.cloud : SMALL.cloud });
  }
  function charge(o) {   // a right-gun beam through the vortex (BO3: type 2, the model hidden, the large effect)
    if (o.charged) return;
    o.charged = true; o.life = ORB_LIFE + (o.k.horizon ? HORIZON.life : 0) + (o.k.cap ? 1 : 0); o.next = 0; o.vis.ball.visible = false; o.vis.lg.visible = true; o.big = 0;
    stop(o.loop); o.loop = snd('wpn_mk3_orb_activated_loop', { gain: .65, at: o.at, loop: true });
    fx()?.emit({ key: 'glow', at: o.at.clone(), size: [40, 300], life: .4, fade: [.02, .8], additive: true, color: LARGE.core });
    fx()?.flash?.(o.at.clone(), { color: LARGE.cloud, intensity: 4, radius: 500, life: .5 });
  }
  function pulse(o) {   // BO3: more health than the pulse's damage: hurt; otherwise only a charged pulse kills
    const dmg = o.charged ? o.t.charged : o.t.pulse; let hit = 0;
    for (const z of [...enemies.list]) {
      const c = z.root.position.clone(); c.y += z.kind === 'dog' ? 18 : 40;
      if (c.distanceTo(o.at) > o.radius || !world.lineClear(o.at, c)) continue;
      hit++;
      if (z.health > dmg) { enemies.hurt(z, dmg, false, false, 'mk3'); if (alive(z)) mark(z, o.charged); }
      else if (o.charged) disintegrate(z);
      else mark(z, false);
    }
    if (hit) snd('wpn_orb_damage_0' + Math.floor(Math.random() * 4), { gain: o.charged ? .8 : .45, at: o.at });
  }

  // ---- the right gun: draw its beam, charge a vortex it passes through ---------------------------------------------
  host.on('shot', e => {
    if (!isMk3(e.def) || e.hand === 'left') return;
    const t = tune(e.def), from = muzzle(false), end = e.origin.clone().addScaledVector(e.direction, Math.min(e.distance, 6000));
    const b = beams.find(x => !x.m.visible) ?? beams[0];
    b.m.material = beamMat[t === TUNE.pap ? 'pap' : 'base']; b.m.position.copy(from); b.m.lookAt(end);
    b.m.scale.set(1.4, 1.4, from.distanceTo(end)); b.m.visible = true; b.t = .07;
    fx()?.emit({ key: 'glow', at: end.clone(), size: [16, 4], life: .15, fade: [.01, .9], additive: true, color: t.beam });
    const ray = new THREE.Ray(e.origin, e.direction), p = new THREE.Vector3(), k = kitOf(e.def), reach = CHARGE_HIT * (k.cap ? CAP.reach : 1);
    beamShot = { at: now(), k, t };
    for (const o of orbs) {
      const along = o.at.clone().sub(e.origin).dot(e.direction);
      if (along < 0 || along > e.distance + reach) continue;
      if (ray.closestPointToPoint(o.at, p).distanceTo(o.at) < reach) charge(o);
    }
  });

  // Dark Matter Rounds: a zombie the beam kills may fold into a small vortex where it fell (not more than one per 1.2 s)
  let beamShot = null, darkAt = -9;
  host.on('kill', e => {
    const z = e.enemy; if (!z || e.remote || host.remoteDamage || !beamShot?.k.dark || now() - beamShot.at > .06 || session.lastHand === 'left') return;
    if (now() - darkAt < DARK.gap || Math.random() >= DARK.chance) return;
    darkAt = now(); const at = z.root.position.clone(); at.y += 40;
    openOrb(at, beamShot.t, { ...beamShot.k, horizon: false });
    fx()?.emit({ key: 'glow', at: at.clone(), size: [70, 6], life: .35, fade: [.01, .9], additive: true, color: LARGE.cloud });
  });

  // ---- the screen tint near a vortex (BO3: visionset + blur overlay, 0.25 s in, held 2 s, 0.25 s out) -------------
  // A plain gradient (no CSS blur: a new blur radius is a driver shader compile mid-game, CLAUDE.md)
  const tint = document.createElement('div');
  tint.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;display:none;background:radial-gradient(ellipse at center,rgba(150,70,255,.16) 0%,rgba(110,30,200,.42) 55%,rgba(40,0,90,.78) 100%)';
  (api.renderer?.domElement?.parentNode ? api.renderer.domElement.after(tint) : document.body.append(tint));
  let tintA = 0, tintHold = 0, tintShown = -1;
  const paintTint = a => { if (Math.abs(a - tintShown) < .01) return; tintShown = a; tint.style.display = a > 0 ? '' : 'none'; tint.style.opacity = a.toFixed(3); };
  host.on('warmHud', on => paintTint(on ? .5 : tintA));

  // ---- the frame ---------------------------------------------------------------------------------------------------
  const tmp = new THREE.Vector3();
  host.on('update', dt => {
    if (!dt) return;
    const t0 = now(), f = fx();
    for (const b of beams) if (b.m.visible && (b.t -= dt) <= 0) b.m.visible = false;
    for (const s of [...shots]) {
      s.life -= dt; s.vel.y -= GRAVITY * dt;
      const step = s.vel.clone().multiplyScalar(dt), len = step.length(), dir = step.clone().divideScalar(len || 1);
      const wall = world.raycast(new THREE.Ray(s.pos.clone(), dir), 0, len + 4);
      const span = wall ? wall.distance : len; let done = false;
      for (let k = 1, n = Math.max(1, Math.ceil(span / 12)); k <= n && !done; k++) {
        const p = s.pos.clone().addScaledVector(dir, span * k / n);
        for (const z of enemies.list) if (touches(z, p, 6)) {
          enemies.hurt(z, s.t.direct, false, false, 'bullet'); slow(z, s.t.slow, s.t.slowT);
          land(s, p, dir.clone().negate().setY(.4).normalize()); done = true; break;
        }
      }
      if (!done && wall) {
        let n = wall.face?.normal && wall.object ? wall.face.normal.clone().transformDirection(wall.object.matrixWorld) : dir.clone().negate();
        if (n.dot(dir) > 0) n.negate();
        land(s, wall.position ?? wall.point ?? s.pos.clone().addScaledVector(dir, wall.distance), n); done = true;
      }
      if (done) { shots.splice(shots.indexOf(s), 1); continue; }
      s.pos.addScaledVector(dir, len);
      if (s.life <= 0) { land(s, s.pos, new THREE.Vector3(0, 0, 0)); shots.splice(shots.indexOf(s), 1); continue; }
      s.vis.g.position.copy(s.pos);   // the shot starts at the left barrel (muzzle), so it is drawn where it flies
      s.vis.small.swirl.material.rotation += dt * 9;
      if (Math.random() < .5) f?.emit({ key: 'glow', at: s.pos.clone(), size: [8, 1], life: .25, fade: [.01, .8], additive: true, color: SMALL.cloud, opacity: .6 });
    }
    let near = false;
    for (const o of [...orbs]) {
      o.age += dt; o.life -= dt;
      const v = o.vis, grow = Math.min(1, o.age / .25), wob = 1 + Math.sin(o.age * 14) * .05;
      v.g.scale.setScalar(grow * wob);
      v.small.c1.material.rotation += dt * 1.6; v.small.c2.material.rotation -= dt * 2.3; v.small.swirl.material.rotation += dt * 6;
      if (o.charged) {
        o.big = Math.min(1, o.big + dt / .3); const b = o.big * (2 - o.big), L = v.large;
        v.sg.scale.setScalar(Math.max(0, 1 - o.big * 1.5)); v.sg.visible = o.big < .67;
        v.lg.scale.setScalar(.3 + .7 * b);
        L.c1.material.rotation += dt * 1.1; L.c2.material.rotation -= dt * .8; L.swirl.material.rotation += dt * 4.5; L.dark.material.rotation -= dt * .6;
        const beat = Math.sin(o.age * 9) * .5 + .5, fade = Math.min(1, o.life / .3);
        L.core.scale.setScalar(56 + beat * 14); L.flare.material.opacity = (.65 + beat * .35) * fade; L.c1.material.opacity = .65 * fade; L.c2.material.opacity = .65 * fade;
        if (f && (o.spark += dt * 34) >= 1) for (; o.spark >= 1; o.spark--) {   // embers falling in on a spiral
          const a = Math.random() * Math.PI * 2, e = Math.random() - .5, r = 110 + Math.random() * 40, at = o.at.clone().add(tmp.set(Math.cos(a) * r, e * r * .8, Math.sin(a) * r));
          const vel = o.at.clone().sub(at).multiplyScalar(1.6).add(tmp.set(-Math.sin(a) * 140, 0, Math.cos(a) * 140));
          f.emit({ key: 'glow', at, vel, size: [7, 1], life: .62, fade: [.15, .5], additive: true, color: Math.random() < .3 ? LARGE.core : LARGE.ember, drag: .4 });
        }
        if (f && Math.random() < dt * 8) f.emit({ key: 'smoke', at: o.at.clone().add(f.jitter(50)), vel: f.jitter(30), size: [40, 90], life: .9, fade: [.2, .7], opacity: .5, color: LARGE.dark, spin: 2 });
      } else if (f && (o.spark += dt * 14) >= 1) for (; o.spark >= 1; o.spark--) {   // the small vortex: yellow motes drawn in
        const a = Math.random() * Math.PI * 2, r = 36 + Math.random() * 18, at = o.at.clone().add(tmp.set(Math.cos(a) * r, (Math.random() - .5) * 30, Math.sin(a) * r));
        f.emit({ key: 'glow', at, vel: o.at.clone().sub(at).multiplyScalar(1.8).add(tmp.set(-Math.sin(a) * 60, 0, Math.cos(a) * 60)), size: [5, 1], life: .45, fade: [.15, .5], additive: true, color: SMALL.spark });
      }
      if (o.at.distanceTo(camera.position) < NEAR + 24) near = true;   // BO3 measures 64 from the player's origin; the orb floats 32 up
      if ((o.next -= dt) <= 0) { o.next += o.charged && o.k.cap ? CAP.pulse : PULSE; pulse(o); }
      if (o.k.horizon && !host.remoteDamage) for (const z of enemies.list) {   // Event Horizon Coil: drawn in along the ground, stopping short of the core
        if (z.dead || z.state === 'dead') continue;
        tmp.copy(o.at).sub(z.root.position); tmp.y = 0; const d = tmp.length();
        if (d > o.radius || d < HORIZON.stop) continue;
        z.root.position.addScaledVector(tmp.divideScalar(d), Math.min(d - HORIZON.stop, HORIZON.pull * (o.charged ? 1.8 : 1) * dt)); z.repath = 1;
      }
      if (o.life <= 0) endOrb(o);
    }
    for (const [z, h] of held) if (h.until <= t0 || !enemies.list.includes(z)) release(z, h);
    updateCaught(dt, t0);
    M.miniSwirl.rotation += dt * 8;
    if (near) tintHold = 2;
    tintHold = Math.max(0, tintHold - dt); tintA = Math.max(0, Math.min(1, tintA + (near || tintHold > 0 ? 4 : -4) * dt)); paintTint(tintA);
  });
  if (window.kino) window.kino.mk3 = { shots, orbs, held, caught, charge, TUNE };   // for tests and the console
  host.on('reset', () => {
    for (const s of shots) { s.vis.g.removeFromParent(); dropVisual(s.vis); } shots.length = 0;
    for (const o of [...orbs]) endOrb(o);
    for (const [z, h] of [...held]) release(z, h);
    for (const [z, c] of [...caught]) unmark(z, c);
    tintA = tintHold = 0; paintTint(0);
  });
}
