// Gorod Krovi's sun shadows (2026-11-16, user: "i want a sun above ... i think shadows needs real shadows, go the extra mile").
// Until now the sun only reached a surface through the light bake's 48-unit sun mask (map-volume.js), so nothing cast a
// shadow you could see. Two shadow maps now, both from BO3's own sun direction (look.js KEY_DIR):
//   static   the engine's key light: one map over the whole play area the camera is in (the bake's regions), drawn once,
//            and again only when a door opens, the power comes on or the camera changes area (a 4096 map is ~3 units a
//            texel here: sharp enough with PCF, and no redraws as the player moves, so no hitches)
//   dynamic  a second directional light at intensity 0 whose map holds only the things that move (zombies, players, the
//            dragon, the props mods add, window boards), a small square around the camera redrawn every frame; the map
//            shader (map-volume.js `sunShadow`) multiplies it into the key light, so it adds shadows without adding light
// renderer.shadowMap.render is wrapped to draw each map from its own list of objects (fake roots: no reparenting), so the
// per-frame pass never walks the map's thousands of meshes. Low graphics: neither (the bake's mask as before); Medium: the
// static map at 2048; High: 4096 + dynamic 1024; Ultra: 4096 + dynamic 2048 over a wider square.
import * as THREE from 'three';
import { settings, onSettingsChange } from '../../settings.js';

const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const forced = typeof location === 'object' ? /[?&]sunQ=(\d)/.exec(location.search)?.[1] : null;   // ?sunQ=0..3: a test handle
export const sunQuality = () => forced != null ? Math.min(3, +forced) : Math.min(coarse ? 1 : 3, THREE.MathUtils.clamp(Math.round(settings.graphics ?? 2), 0, 3));   // (the lighting mod's own rule)
const STATIC = [0, 2048, 4096, 4096], DYN = [0, 0, 1024, 2048], DYN_R = [0, 0, 800, 1100];
const q = s => new RegExp(`[?&]${s}`).test(location.search);
const V = new THREE.Vector3(), V2 = new THREE.Vector3(), M = new THREE.Matrix4();

// casts a shadow: opaque, depth-writing, lit; no cut-outs (the batched texture-array materials' cut-outs aren't in the
// depth pass: a grate would cast a solid block), decals or effects
const solid = m => !!m && !m.transparent && !(m.alphaTest > 0) && !(m.blending > 1) && m.depthWrite !== false && m.colorWrite !== false && !m.polygonOffset
  && !m.isShaderMaterial && !m.isMeshBasicMaterial && !m.isSpriteMaterial && !m.isPointsMaterial && !m.isLineBasicMaterial;

export function setupSun(api, { key, dir, regions = [], sky = null }) {
  const { scene, renderer, camera, host, world, session } = api;
  if (!renderer || !key || q('noSun')) return null;
  const report = {};
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;

  // ---- the static map: the key light ----------------------------------------------------------------------------
  key.shadow.autoUpdate = false; key.shadow.intensity = .9;   // (.9: the bake's sun floor, the bounce a shaded wall still gets)
  key.shadow.radius = 1.5; key.shadow.camera.up.set(0, 1, 0);
  // the rooms: each bake region as a box (receivers), the world's bounds for the casters' depth
  const boxes = regions.map(r => new THREE.Box3(new THREE.Vector3(...r.origin), new THREE.Vector3(...r.origin).add(new THREE.Vector3(...r.dims).multiplyScalar(r.cell))));
  if (!boxes.length && world.root) boxes.push(new THREE.Box3().setFromObject(world.root));
  const all = world.root ? new THREE.Box3().setFromObject(world.root) : boxes[0];
  let area = -1, texel = 3;
  function fit(i) {
    area = i; const b = boxes[i], c = b.getCenter(new THREE.Vector3()), cam = key.shadow.camera;
    key.target.position.copy(c); key.position.copy(c).addScaledVector(dir, 30000); key.updateMatrixWorld(); key.target.updateMatrixWorld();
    cam.position.copy(key.position); cam.lookAt(c); cam.updateMatrixWorld();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 8; k++) { V.set(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).applyMatrix4(cam.matrixWorldInverse);
      x0 = Math.min(x0, V.x); x1 = Math.max(x1, V.x); y0 = Math.min(y0, V.y); y1 = Math.max(y1, V.y); }
    for (let k = 0; k < 8; k++) { V.set(k & 1 ? all.max.x : all.min.x, k & 2 ? all.max.y : all.min.y, k & 4 ? all.max.z : all.min.z).applyMatrix4(cam.matrixWorldInverse);
      z0 = Math.min(z0, V.z); z1 = Math.max(z1, V.z); }
    const pad = 64; Object.assign(cam, { left: x0 - pad, right: x1 + pad, bottom: y0 - pad, top: y1 + pad, near: Math.max(1, -z1 - 200), far: -z0 + 200 }); cam.updateProjectionMatrix();
    size(); redraw();
  }
  function size() {
    const s = STATIC[sunQuality()] || 2048, cam = key.shadow.camera;
    if (key.shadow.mapSize.x !== s) { key.shadow.mapSize.set(s, s); key.shadow.map?.dispose(); key.shadow.map = null; }
    texel = Math.max(cam.right - cam.left, cam.top - cam.bottom) / s;
    key.shadow.normalBias = texel * 1.2; key.shadow.bias = -1.5 / (cam.far - cam.near);   // (in depth units: about 1.5 world units)
  }

  // ---- the dynamic map --------------------------------------------------------------------------------------------
  const dyn = new THREE.DirectionalLight(0xffffff, 0); dyn.name = 'gk-sun-actors';
  dyn.shadow.intensity = .9; dyn.shadow.radius = 1.5;
  scene.add(dyn, dyn.target);
  const dcam = dyn.shadow.camera, DEPTH = 6000;
  M.lookAt(dir, new THREE.Vector3(), dcam.up); const INV = M.clone().invert();
  function placeDyn() {
    const R = DYN_R[sunQuality()] || 800, s = DYN[sunQuality()] || 1024;
    if (dyn.shadow.mapSize.x !== s) { dyn.shadow.mapSize.set(s, s); dyn.shadow.map?.dispose(); dyn.shadow.map = null; }
    if (dcam.right !== R) { Object.assign(dcam, { left: -R, right: R, bottom: -R, top: R, near: 1, far: DEPTH + 1500 }); dcam.updateProjectionMatrix(); }
    // a square ahead of the camera, its centre snapped to whole texels in the light's frame (a sliding map shimmers)
    camera.getWorldDirection(V2); V2.y = 0; if (V2.lengthSq() < 1e-6) V2.set(0, 0, -1); V2.normalize();
    V.copy(camera.position).addScaledVector(V2, R * .35);
    V.applyMatrix4(INV);   // into the light's frame (rotation only)
    const t = 2 * R / s; V.x = Math.round(V.x / t) * t; V.y = Math.round(V.y / t) * t; V.applyMatrix4(M);
    dyn.target.position.copy(V); dyn.position.copy(V).addScaledVector(dir, DEPTH); dyn.updateMatrixWorld(); dyn.target.updateMatrixWorld();
    dyn.shadow.normalBias = t * 1.2; dyn.shadow.bias = -1 / (dcam.far - dcam.near);
  }

  // ---- who casts --------------------------------------------------------------------------------------------------
  const staticRoot = new THREE.Object3D(), dynRoot = new THREE.Object3D();   // fake roots: children lists only (never .add: it would reparent)
  // static: the map, its batches, the doors (redrawn when one opens) and the perk machines; the rest (zombies, players,
  // the dragon, the quest props that animate, window boards) is drawn into the dynamic map near the camera
  const isStatic = c => c === world.root || /^(DOOR_|machine_|booths_|gorod-dragon-console-)/.test(c.name) || batches().has(c);
  let batchSet = null, batchList = null;
  const batches = () => { const b = globalThis.kino?.instanceCull?.batches; if (b !== batchList) { batchList = b; batchSet = new Set(b ?? []); if (b) globalThis.kino.instanceCull.cullShadowCasters?.(true); } return batchSet; };
  const seen = new WeakSet();
  function tag(root, stat) {
    root.traverse(o => { if (!o.isMesh || seen.has(o)) return; seen.add(o);
      const ms = [o.material].flat(); o.receiveShadow = true;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const r = (o.geometry.boundingSphere?.radius ?? 0) * o.getWorldScale(V).x;
      o.castShadow = ms.every(solid) && (o.isSkinnedMesh ? r > 4 : r > (stat ? 3 : 10));
      // the map's open surfaces (roofs, ground, single-sided walls) cast from both sides: three draws only back faces by
      // default, which left a roof seen from the sun casting nothing
      if (o.castShadow && stat) for (const m of ms) m.shadowSide = THREE.DoubleSide;
    });
  }
  // the map's own meshes before the engine merges and batches them (both key on castShadow/receiveShadow)
  if (world.root) tag(world.root, true);
  function refresh() {
    batches(); const st = [], dy = [];
    for (const c of scene.children) { if (c.isLight || c === sky || c === dyn.target) continue; (isStatic(c) ? st : dy).push(c); }
    staticRoot.children = st; dynRoot.children = dy;
    for (const c of st) if (!batchSet.has(c)) tag(c, true);
    for (const b of batchList ?? []) if (b.castShadow) for (const m of [b.material].flat()) m.shadowSide = THREE.DoubleSide;
    for (const c of dy) tag(c, false);
  }

  // ---- quality ----------------------------------------------------------------------------------------------------
  let lastQ = -1;
  function apply() {
    const qq = sunQuality(); if (qq === lastQ) return; lastQ = qq;
    key.castShadow = qq >= 1; dyn.castShadow = qq >= 2;   // (a change recompiles the lit shaders: settings only)
    if (area >= 0) { size(); redraw(); }
    report.quality = qq;
  }
  apply(); onSettingsChange(apply);

  // ---- redraws ----------------------------------------------------------------------------------------------------
  let again = 0, sig = '', stats = { static: 0, staticMs: 0, dyn: 0 };
  let want = false, lastStatic = -1e9;
  function redraw() { key.shadow.needsUpdate = true; want = true; }
  const regionAt = p => { for (let i = 0; i < boxes.length; i++) { const b = boxes[i]; if (p.x >= b.min.x - 500 && p.x <= b.max.x + 500 && p.z >= b.min.z - 500 && p.z <= b.max.z + 500) return i; } return area < 0 ? 0 : area; };
  fit(regionAt(camera.position));

  const sm = renderer.shadowMap, base = sm.render;
  sm.render = function (lights, scn, cam) {
    if (scn !== scene) return base.call(this, lights, scn, cam);
    if (batchList !== globalThis.kino?.instanceCull?.batches) { batches(); refresh(); }
    const rest = lights.filter(l => l !== key && l !== dyn);
    if (rest.length) base.call(this, rest, scn, cam);
    // (the engine's shader warm-up asks for every shadow map on each of its ~100 slices: the whole map was redrawn each
    // time and the load stalled; one draw compiles the depth programs, the rest are dropped unless asked for here)
    if (key.castShadow && key.shadow.needsUpdate && lights.includes(key) && !want) key.shadow.needsUpdate = false;
    if (key.castShadow && key.shadow.needsUpdate && lights.includes(key)) {
      const t0 = performance.now(), ic = globalThis.kino?.instanceCull; want = false; lastStatic = t0;
      ic?.restore?.();   // every batched prop, not just the ones the camera keeps (the map is drawn once for the whole area)
      base.call(this, [key], staticRoot, cam);
      ic?.reapply?.();   // back to what the camera keeps, before this frame's main draw
      stats.static++; stats.staticMs = Math.round(performance.now() - t0);
    }
    if (dyn.castShadow && lights.includes(dyn)) { base.call(this, [dyn], dynRoot, cam); stats.dyn++; }
  };

  let timer = 0;
  // the engine's shader warm-up draws both maps (their depth programs), with the hidden things it shows for the
  // compile: the static map is drawn again a few seconds into play
  host.on('warm', () => { batches(); refresh(); redraw(); again = 3; });
  host.on('update', dt => {
    dt = Math.min(dt || .016, .1);
    if (dyn.castShadow) placeDyn();
    if ((timer -= dt) <= 0) { timer = 1; batches(); refresh();
      const i = regionAt(camera.position); if (i !== area) fit(i);
      const s = `${session.openDoors?.size ?? 0}|${session.power ? 1 : 0}`; if (s !== sig) { if (sig) { redraw(); again = 3; } sig = s; }   // (and once more when the door's pieces have gone)
      if (again > 0 && --again === 0) redraw(); }
  });
  placeDyn(); refresh();
  const out = { key, dyn, report, stats, redraw, fit, get area() { return area; }, get texel() { return texel; } };
  if (window.kino) window.kino.gkSun = out;
  return out;
}
