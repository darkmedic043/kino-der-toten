// Gorod Krovi's zombies (2026-11-15): BO3's Russian zombies and the spawn fixes the build can't make.
// Models: c_zom_dlc3_rus_zombies_body1-4 with heads 1-4 and their hats (helmet, officer cap, ushanka), built by
// .tools/build_gorod_zombies.py into mods/maps/gorod-krovi/zombies/ (git-ignored, ripped), driven by BO1's ai_zombie_*
// clips as Der Eisendrache's: every skeleton re-bound to BO1's rest rotations (rebindTo), the head and hat meshes bound to
// the body's own bones (heads share the body's bind space; a hat is modelled in j_head's space), one template per
// body x head x hat, glowing orange eyes (BO3's), and gib sets for the dismemberment mod (body2 has only its upper
// pieces: its legs are body1's, as in BO3). ?bo1Zombies keeps the BO1 ones.
// Spawns: the build gives a window the zone of the nearest player volume, and 20 of the 46 sit in another zone than the
// one BO3 feeds them from (the department store floors, the judicial building, the factory, red brick...): their group is
// set here from BO3's own window sets. The build also turned the window feeders (68 spawn and riser spots whose
// script_string names a window: in BO3 a zombie there walks to its window and climbs in) into free walk-in and riser
// spawns; they are switched off here, so those zombies come through the windows.
// Tables: scratch/gk/agents/zombies-tables.py from export_game/bo3/maps/zm_stalingrad/zm_stalingrad.spawns.json, in the
// map's coordinates (BO3 x, z, -y).
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { settings, onSettingsChange } from '../../settings.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const WINDOWS = [[-331,47,-1884,"departmentstore"],[278,47,-1896,"departmentstore"],[326,207,-1853,"alleyb"],[598,207,-1582,"departmentstorefloor2a"],[380,367,-1788,"departmentstorefloor3c"],[-904,207,-1981,"departmentstorefloor2b"],[-447,207,-2091,"departmentstorefloor2b"],[331,367,-1408,"departmentstorefloor3b"],[-853,367,-2031,"departmentstorefloor3a"],[841,367,-2070,"departmentstorefloor3c"],[530,47,-2245,"alleyb"],[-580,-93,-971,"start"],[543,31,-1036,"start"],[547,31,16,"start"],[11,31,396,"start"],[-691,31,16,"start"],[651,335,-5196,"judicialb"],[-651,335,-5196,"judicialb"],[-715,175,-5000,"judiciala"],[280,175,-5155,"judiciala"],[2084,-129,-1764,"librarya"],[2603,-129,-1952,"librarya"],[1888,31,-3598,"libraryb"],[-2175,527,-2001,"factoryc"],[-2432,351,-3397,"factoryb"],[-2212,191,-2647,"factorya"],[-2160,527,-3395,"factoryc"],[-2152,191,-1999,"factorya"],[-2025,371,-3377,"factoryarm"],[299,-161,-3165,"bunker"],[-185,-161,-3603,"bunker"],[-843,191,-3420,"redbrickb"],[-670,191,-2893,"redbricka"],[-257,191,-3280,"redbricka"],[-804,351,-3395,"redbrickc"],[69,31,-3131,"yellowb"],[624,191,-3267,"yellowc"],[1039,-129,-3267,"yellowa"],[827,31,-3448,"yellowb"],[-3449,31,-21470,"pavlovsb"],[-3449,31,-21294,"pavlovsb"],[-2579,31,-21694,"pavlovsb"],[-2579,31,-21470,"pavlovsb"],[-3210,191,-21027,"pavlovsb"],[-2986,191,-21027,"pavlovsb"],[-3449,191,-21386,"pavlovsb"]];
const FEEDERS = [[-4374,-69,-21455],[-4367,-48,-21345],[-4324,-72,-21954],[-4295,-72,-20836],[-4262,-72,-21191],[-4195,-72,-21744],[-3625,-70,-20025],[-3499,-72,-20093],[-3320,-62,-20175],[-3192,-72,-20030],[-2830,-72,-20154],[-2576,-70,-20005],[-2435,-64,-3284],[-2336,320,-3737],[-2321,440,-3516],[-2291,496,-1561],[-2290,160,-1679],[-2162,496,-3758],[-1920,160,-3040],[-1704,-72,-21745],[-1698,-57,-21969],[-1689,-72,-20972],[-1685,-72,-22218],[-1666,-72,-21516],[-1652,-72,-21349],[-1129,0,-3282],[-1006,180,-2178],[-988,320,-3467],[-916,336,-2270],[-889,160,-2838],[-866,176,-2352],[-866,304,-4929],[-862,144,-5278],[-788,0,-31],[-768,144,-5274],[-698,0,-152],[-698,304,-5083],[-461,-124,-1228],[-442,20,-2130],[-395,-124,-1158],[-352,-191,-3799],[-279,160,-3520],[-146,0,525],[61,8,-3269],[81,0,550],[425,16,-1768],[432,160,-3502],[466,176,-5423],[470,176,-5517],[499,-192,-3043],[517,176,-2026],[665,0,-964],[673,0,-100],[690,10,198],[708,339,-1500],[711,0,-1080],[718,304,-4962],[730,16,-2074],[770,336,-1677],[853,176,-1722],[868,304,-4934],[915,336,-1812],[927,-160,-3424],[929,0,-3279],[2100,0,-3596],[2176,-162,-1761],[2272,0,-3693],[3215,-160,-2139]];

const DIR = new URL('../maps/gorod-krovi/zombies/', import.meta.url).href, P = 'c_zom_dlc3_rus_zombies_';
const HATS = { 1: ['helmet', 'officercap', 'ushanka'], 2: ['officercap', 'ushanka'], 3: ['helmet', 'officercap', 'ushanka'], 4: ['helmet'] };
const GIBS = { upclean: 'upclean', lowclean: 'lowclean', behead: 'behead', larmoff_1: 'larmoff', rarmoff_1: 'rarmoff', llegoff_1: 'llegoff', rlegoff_1: 'rlegoff', legsoff_1: 'blegsoff' };

export default async function setup(api, gk) {
  fixSpawns(api.world);
  if (new URLSearchParams(location.search).has('bo1Zombies') || !api.enemies) return;
  await setupModels(api);   // awaited: templates and gib sets in place before the shader warm-up
}

function fixSpawns(world) {
  let regrouped = 0, off = 0;
  for (const b of world.barriers) {
    if (b.boards?.length) {
      const p = b.position; let best = null, bd = 80;
      for (const w of WINDOWS) { const d = Math.hypot(w[0] - p.x, w[1] - p.y, w[2] - p.z); if (d < bd) { bd = d; best = w; } }
      if (!best) continue;
      const zones = best[3].split('|');
      if (!zones.includes(b.group)) { b.group = zones[0]; regrouped++; }
    } else {
      const p = b.outside ?? b.position;
      if (FEEDERS.some(f => Math.hypot(f[0] - p.x, f[2] - p.z) < 40 && Math.abs(f[1] - p.y) < 90)) { b.group = 'window_feeder'; off++; }   // never active
    }
  }
  console.info(`[gorod-krovi] zombies: ${regrouped} windows moved to BO3's zone, ${off} window feeders off`);
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
