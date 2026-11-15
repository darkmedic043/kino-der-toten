// Gorod Krovi's zombies (2026-11-15): BO3's Russian zombies (their spawns: spawns.js).
// Models: c_zom_dlc3_rus_zombies_body1-4 with heads 1-4 and their hats (helmet, officer cap, ushanka), built by
// .tools/build_gorod_zombies.py into mods/maps/gorod-krovi/zombies/ (git-ignored, ripped), driven by BO1's ai_zombie_*
// clips as Der Eisendrache's: every skeleton re-bound to BO1's rest rotations (rebindTo), the head and hat meshes bound to
// the body's own bones (heads share the body's bind space; a hat is modelled in j_head's space), one template per
// body x head x hat, glowing orange eyes (BO3's), and gib sets for the dismemberment mod (body2 has only its upper
// pieces: its legs are body1's, as in BO3). ?bo1Zombies keeps the BO1 ones.
// Spawns: BO3's zone manager, spot structs and window walks, in spawns.js (2026-11-15; it replaced the window regrouping
// and the feeder switch-off this file did before).
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { settings, onSettingsChange } from '../../settings.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import setupSpawns from './spawns.js';

const DIR = new URL('../maps/gorod-krovi/zombies/', import.meta.url).href, P = 'c_zom_dlc3_rus_zombies_';
const HATS = { 1: ['helmet', 'officercap', 'ushanka'], 2: ['officercap', 'ushanka'], 3: ['helmet', 'officercap', 'ushanka'], 4: ['helmet'] };
const GIBS = { upclean: 'upclean', lowclean: 'lowclean', behead: 'behead', larmoff_1: 'larmoff', rarmoff_1: 'rarmoff', llegoff_1: 'llegoff', rlegoff_1: 'rlegoff', legsoff_1: 'blegsoff' };

export default async function setup(api, gk) {
  await setupSpawns(api, gk);   // round spawns from BO3's zones (spawns.js)
  if (new URLSearchParams(location.search).has('bo1Zombies') || !api.enemies) return;
  await setupModels(api);   // awaited: templates and gib sets in place before the shader warm-up
}

async function setupModels(api) {
  const e = api.enemies, Z = n => loadModel(DIR + P + n + '.glb').catch(() => null);
  const [bodies, heads, hats] = await Promise.all([
    Promise.all([1, 2, 3, 4].map(k => Z('body' + k))),
    Promise.all([1, 2, 3, 4].map(k => Z('head' + k))),
    Promise.all(Object.entries(HATS).map(async ([k, list]) => [k, (await Promise.all(list.map(h => Z(`head${k}_${h}`)))).filter(Boolean)])).then(Object.fromEntries),
  ]);
  const refB = e.templates[0], ref = new Map();
  for (const r of [refB, e.heads?.[0]]) r?.traverse(o => { if (o.isBone && !ref.has(o.name)) ref.set(o.name, o.quaternion.clone()); });
  if (!bodies.some(Boolean) || !heads.some(Boolean) || !ref.size) { console.warn('[gorod-krovi] zombies: models missing (.tools/build_gorod_zombies.py), BO1 zombies kept'); return; }
  // bind poses before re-binding: a head's own j_spine4 and a hat's j_head map their meshes into the body's bind space
  const bind = new Map(bodies.filter(Boolean).map(m => { m.updateMatrixWorld(true); return [m, { j4: m.getObjectByName('j_spine4').matrixWorld.clone(), jh: m.getObjectByName('j_head').matrixWorld.clone() }]; }));
  for (const m of bind.keys()) rebindTo(m, ref);
  const mount = (t, src, from, to, bones, inv, bodySkin) => {   // src's skinned meshes moved into t, bound to t's bones
    const h = cloneSkinned(src), meshes = []; h.updateMatrixWorld(true); h.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
    const M = to.clone().multiply(h.getObjectByName(from).matrixWorld.clone().invert());
    for (const m of meshes) {
      m.geometry = m.geometry.clone().applyMatrix4(M.clone().multiply(m.matrixWorld));
      m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1);
      const mapped = m.skeleton.bones.map(b => bones.get(b.name) ?? bones.get('j_head'));
      m.bind(new THREE.Skeleton(mapped, mapped.map(b => (inv.get(b) ?? new THREE.Matrix4().copy(b.matrixWorld).invert()).clone())), bodySkin.bindMatrix);
      m.userData.headMesh = true; m.removeFromParent(); t.add(m);   // dismemberment: kept when the body splits, hidden when beheaded
    }
    return { h, M };
  };
  const combos = [];
  bodies.forEach((body, i) => { if (!body) return;
    heads.forEach((head, j) => { if (!head) return;
      for (const hat of [null, ...(hats[j + 1] ?? [])]) {
        const t = cloneSkinned(body); t.userData.gibSet = 'gorod' + (i + 1);
        const bones = new Map(); t.traverse(o => { if (o.isBone && !bones.has(o.name)) bones.set(o.name, o); });
        let bodySkin = null; const inv = new Map();
        t.traverse(o => { if (!o.isSkinnedMesh) return; bodySkin ??= o; o.skeleton.bones.forEach((b, k) => { if (!inv.has(b)) inv.set(b, o.skeleton.boneInverses[k]); }); });
        const { h, M } = mount(t, head, 'j_spine4', bind.get(body).j4, bones, inv, bodySkin);
        if (hat) mount(t, hat, 'j_head', bind.get(body).jh, bones, inv, bodySkin);
        const jh = bones.get('j_head'), eyeL = h.getObjectByName('j_eyeball_le'), eyeR = h.getObjectByName('j_eyeball_ri');
        if (jh && eyeL && eyeR) { t.updateMatrixWorld(true); const glow = eyeGlow([eyeL, eyeR].map(b => b.getWorldPosition(new THREE.Vector3()).applyMatrix4(M)), jh); glow.userData.headMesh = true; jh.add(glow); }
        combos.push(t);
      }
    });
  });
  // shuffled: enemies.js picks templates[id % n], so neighbours in the list (same body and head) don't come in runs
  for (let k = combos.length - 1; k > 0; k--) { const r = (k * 7919 + 13) % (k + 1); [combos[k], combos[r]] = [combos[r], combos[k]]; }
  e.templates = combos; e.heads = [];
  const haloSet = () => { EYE_MAT.uniforms.haloOn.value = Math.round(settings.graphics ?? 2) < 1 ? 1 : 0; }; haloSet(); onSettingsChange(haloSet);
  api.host?.on('kill', ({ enemy }) => enemy?.root?.traverse(o => { if (o.name === 'gorod_zombie_eyes') o.visible = false; }));   // the eyes go out with the zombie
  // gib sets: a piece wears its body's own materials (the files carry 16 px stand-ins)
  const pieces = await Promise.all([1, 2, 3, 4].map(k => Promise.all(Object.entries(GIBS).map(async ([key, g]) => [key, await Z(`body${k}_g_${g}`)]))));
  const sets = (window.kino.gibSets ??= {}), rebound = new Set();
  pieces.forEach((list, i) => {
    const k = i + 1; if (!bodies[i]) return;
    const got = Object.fromEntries(list);
    if (k === 2) for (const key of Object.keys(GIBS)) got[key] ??= pieces[0].find(([x]) => x === key)?.[1] ?? null;   // body2's legs, neck stump: body1's (same trousers)
    const own = new Map(); for (const src of [bodies[i], ...heads]) src?.traverse(o => { if (o.isMesh && o.material?.name && !own.has(o.material.name)) own.set(o.material.name, o.material); });
    const set = {};
    for (const [key, m] of Object.entries(got)) { if (!m) continue;
      if (!rebound.has(m)) { rebindTo(m, ref); rebound.add(m); }
      m.traverse(o => { const n = o.isMesh && o.material?.name; if (!n) return; if (own.has(n)) o.material = own.get(n); else own.set(n, o.material); });
      set[key] = m;
    }
    sets['gorod' + k] = set;
  });
  console.info(`[gorod-krovi] zombies: ${combos.length} templates (${bodies.filter(Boolean).length} bodies, ${heads.filter(Boolean).length} heads, ${Object.values(hats).flat().length} hats)`);
}

// Der Eisendrache's re-bind (der-eisendrache/mod.js): each joint takes BO1's rest rotation and keeps its position
function rebindTo(model, ref) {
  model.updateMatrixWorld(true);
  const bones = []; model.traverse(o => { if (o.isBone) bones.push(o); });
  const world = new Map(bones.map(b => [b, b.getWorldPosition(new THREE.Vector3())]));
  for (const b of bones) {
    b.quaternion.copy(ref.get(b.name) ?? new THREE.Quaternion());
    b.parent.updateWorldMatrix(true, false);
    b.position.copy(b.parent.worldToLocal(world.get(b).clone()));
    b.updateMatrixWorld(true);
  }
  model.traverse(o => { if (o.isSkinnedMesh) { o.skeleton.calculateInverses(); o.bindMatrix.copy(o.matrixWorld); o.bindMatrixInverse.copy(o.matrixWorld).invert(); } });
}

// The eye glow, as Der Eisendrache's (der-eisendrache/mod.js eyeGlow) in BO3's Gorod Krovi orange: an additive dome over
// each eye, grown with distance so the pair still reads far away; a drawn halo on Low graphics (no bloom).
const EYE_R = .62, EYE_D = .4, EYE_BACK = .15, EYE_COL = [4.2, 1.5, .25], HALO_R = 2, HALO_K = .3;
const EYE_MAT = new THREE.ShaderMaterial({
  name: 'gorod_zombie_eyes', vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { grow: { value: .0019 / EYE_R }, haloOn: { value: 0 } },
  vertexShader: 'attribute vec3 eye; attribute vec3 halo; uniform float grow, haloOn; varying vec3 vCol; varying float vR;\nvoid main() {\n  vec4 c = modelViewMatrix * vec4(eye, 1.0), p = modelViewMatrix * vec4(position, 1.0);\n  float g = clamp(-c.z * grow, 1.0, 3.0);\n  p.xyz = mix(c.xyz + (p.xyz - c.xyz) * g, c.xyz + vec3(halo.xy * g * haloOn, 0.4), halo.z);\n  vCol = color * mix(1.0, haloOn, halo.z); vR = length(halo.xy) / ' + HALO_R.toFixed(2) + '; gl_Position = projectionMatrix * p;\n}',
  fragmentShader: 'varying vec3 vCol; varying float vR;\nvoid main() {\n  float f = 1.0 - vR;\n  gl_FragColor = vec4(vCol * f * f * f, 1.0);\n  #include <tonemapping_fragment>\n  #include <colorspace_fragment>\n}'
});
function eyeGlow(eyes, head) {
  const hp = head.getWorldPosition(new THREE.Vector3()), f = eyes[0].clone().add(eyes[1]).multiplyScalar(.5).sub(hp).setY(0).normalize(), up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3().crossVectors(f, up);
  const RINGS = [[0, 1], [.42, .78], [.9, .22], [Math.PI / 2, 0]], SEG = 10, toHead = head.matrixWorld.clone().invert(), pos = [], col = [], mid = [], halo = [], idx = [];
  for (const e of eyes) {
    const base = pos.length / 3, c = e.clone().addScaledVector(f, EYE_BACK), cl = c.clone().applyMatrix4(toHead);
    for (const [th, k] of RINGS) for (let s = 0; s < SEG; s++) {
      const ph = s / SEG * Math.PI * 2, p = c.clone().addScaledVector(f, EYE_D * Math.cos(th)).addScaledVector(side, Math.cos(ph) * EYE_R * Math.sin(th)).addScaledVector(up, Math.sin(ph) * EYE_R * Math.sin(th)).applyMatrix4(toHead);
      pos.push(p.x, p.y, p.z); col.push(EYE_COL[0] * k, EYE_COL[1] * k, EYE_COL[2] * k); mid.push(cl.x, cl.y, cl.z); halo.push(0, 0, 0);
    }
    for (let r = 0; r < RINGS.length - 1; r++) for (let s = 0; s < SEG; s++) { const a = base + r * SEG + s, b = base + r * SEG + (s + 1) % SEG; idx.push(a, a + SEG, b, b, a + SEG, b + SEG); }
    const hb = pos.length / 3;
    for (let s = -1; s < SEG; s++) { const ph = s / SEG * Math.PI * 2, k = HALO_K; pos.push(cl.x, cl.y, cl.z); mid.push(cl.x, cl.y, cl.z); col.push(EYE_COL[0] * k, EYE_COL[1] * k, EYE_COL[2] * k); halo.push(s < 0 ? 0 : Math.cos(ph) * HALO_R, s < 0 ? 0 : Math.sin(ph) * HALO_R, 1); }
    for (let s = 0; s < SEG; s++) idx.push(hb, hb + 1 + s, hb + 1 + (s + 1) % SEG);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('eye', new THREE.Float32BufferAttribute(mid, 3)); g.setAttribute('halo', new THREE.Float32BufferAttribute(halo, 3)); g.setIndex(idx);
  g.computeBoundingSphere(); g.boundingSphere.radius += HALO_R * 3;
  const m = new THREE.Mesh(g, EYE_MAT); m.name = 'gorod_zombie_eyes'; m.castShadow = m.receiveShadow = false; m.renderOrder = 3;
  return m;
}
