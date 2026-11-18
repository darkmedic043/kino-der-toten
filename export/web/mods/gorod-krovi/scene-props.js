// Shared loader for Gorod Krovi's scene props (BO3 fxanim models from scene bundles and script models), built by
// .tools/build_gk_scenes.py into the git-ignored mods/maps/gorod-krovi/scenes/ (ripped: never published).
// Used by sophia.js, scenes.js and pods.js. Not a part of its own (not in mod.js PARTS).
// A prop: { key, root, rig, dur, next, t }. Built in inches, Y-up; clips hold absolute local rotations and offsets
// from each joint's bind position (userData.bindPosition is set before the clips are made, as gauntlet.js does).
import * as THREE from 'three';
import { loadModel, loadAnimation, Rig } from '../../animation.js';
import { CollisionWorld } from '../../collision-world.js';
import { fitSkinnedBounds } from '../../skinned-bounds.js';

export const W = (x, y, z) => new THREE.Vector3(x, z, -y);
const ROOT = new URL('../../', import.meta.url), DIR = 'mods/maps/gorod-krovi/scenes/';
const abs = u => new URL(u, ROOT).href;
let data = null;
export function sceneData() {
  data ??= fetch(abs(DIR + 'scenes.json')).then(r => (r.ok ? r.json() : null)).catch(() => null);
  return data;
}

// one copy of a prop (null when its assets are missing); onNote(name, key) gets the clips' notetracks
export async function makeProp(J, key, onNote = () => {}) {
  const d = J?.props?.[key]; if (!d) return null;
  try {
    const root = await loadModel(abs(d.model)); root.name = 'gk_scene_' + key;
    const P = { key, root, rig: null, dur: d.durations ?? {}, t: 0, next: null, bones: {} };
    P.rig = new Rig(root, n => onNote(n, key));
    root.traverse(o => {
      if (o !== root) o.userData.bindPosition = o.position.clone();
      if (o.isBone || o.type === 'Object3D') P.bones[o.name] ??= o;
      if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = true; }
    });
    for (const [a, u] of Object.entries(d.animations ?? {})) P.rig.add(a, await loadAnimation(abs(u)));
    autoCull(root);
    return P;
  } catch (e) { console.warn('[gorod-krovi] scene prop', key, e?.message ?? e); return null; }
}

// ---- view culling for rigged props -------------------------------------------------------------------------------
// A rigged model loads with frustum culling off (its bounds are the bind pose's), so every scene prop on the map was
// drawn each frame from anywhere, and once more into the sun's actor shadow map (sun.js): about 450 + 600 draws a frame
// (2026-11-17). A prop at rest gets its posed bounds (skinned-bounds.js) and is culled like any mesh; when a joint
// moves again (its world matrix changed) it goes back to always drawn until it rests. cullTick runs from mod.js.
const CULL = []; let cullAt = 0;
export function autoCull(root) {
  const VC = globalThis.kino?.visCull; if (VC) { VC.add(root); return; }   // (the engine's culler does this for every map since 2026-11-17, vis-cull.js; the code below runs only with ?noVisCull)
  if (!root || CULL.some(c => c.root === root)) return;
  const nodes = []; root.traverse(o => { if (!o.isMesh) nodes.push(o); });
  CULL.push({ root, nodes, sig: NaN, still: 0, fit: false });
}
function signature(c) {
  let s = 0;
  for (let i = 0; i < c.nodes.length; i++) { const e = c.nodes[i].matrixWorld.elements; s += (e[12] + e[13] * 1.7 + e[14] * 2.3 + e[0] * 31 + e[5] * 37 + e[10] * 41) * (1 + i % 13); }
  return s;
}
const setCull = (c, on) => { c.fit = on; c.root.traverse(o => { if (o.isMesh) o.frustumCulled = on; }); };
// a clip is about to move the prop: always drawn from this frame on (the tick alone would notice up to a quarter second late)
const wake = root => { globalThis.kino?.visCull?.wake(root); const c = CULL.find(c => c.root === root); if (c) { c.sig = NaN; c.still = 0; if (c.fit) setCull(c, false); } };
export function cullTick() {
  let fitted = false;
  for (let k = Math.min(8, CULL.length); k > 0; k--) {
    const c = CULL[cullAt = (cullAt + 1) % CULL.length], s = signature(c);
    if (s !== c.sig) { c.sig = s; c.still = 0; if (c.fit) setCull(c, false); continue; }
    if (c.fit || ++c.still < 3 || fitted) continue;
    fitted = true; fitSkinnedBounds(c.root);   // (one prop a frame: the fit walks every vertex)
    c.root.traverse(o => { if (o.isSkinnedMesh && o.boundingSphere) o.boundingSphere.radius = o.boundingSphere.radius * 1.15 + 12; });
    setCull(c, true);
  }
}
export const cullState = () => { const s = globalThis.kino?.visCull?.stats(); return s ? { props: s.groups, culled: s.resting, hidden: s.hidden } : { props: CULL.length, culled: CULL.filter(c => c.fit).length }; };

// BO3 origin + angles (pitch yaw roll, degrees) -> the prop's root
const D = Math.PI / 180;
export function place(P, origin, angles = [0, 0, 0]) {
  P.root.position.copy(W(...origin));
  P.root.rotation.set(angles[2] * D, angles[1] * D, -angles[0] * D, 'YZX');
  moved(P.root);
}
export const moved = o => { o.updateMatrix(); o.updateMatrixWorld(true); };
export function hold(P, a, at = 0) {   // still on a frame of a clip (0 = the scene's init pose)
  if (!P) return; if (!P.rig.actions[a]) { moved(P.root); return; }
  wake(P.root);
  P.rig.play(a, false, 0, 0); if (at) P.rig.actions[a].time = at; P.rig.update(0); P.next = null; P.loop = false; moved(P.root);
}
export function play(P, a, { loop = false, then = null } = {}) {
  if (!P?.rig.actions[a]) return false;
  globalThis.kino?.staticFreeze?.thaw?.(P.root); wake(P.root);
  if (P.rig.current === a && !(loop && P.loop)) P.rig.current = null;   // Rig.play ignores a loop of its current clip: a held pose (time scale 0) stayed frozen
  P.rig.play(a, loop, 1, loop ? .25 : 0); P.t = P.dur[a] ?? 0; P.next = then; P.loop = loop; return true;
}
// a joint (and every joint under it) collapsed to nothing: BO3's hidepart on a skinned fxanim model
export function hidePart(P, name, hide = true) { const b = P?.bones[name]; if (!b) return false; b.scale.setScalar(hide ? 0 : 1); moved(P.root); return true; }
export const running = P => !!P && (P.loop || !!P.next || !!P.rig.actions[P.rig.current]?.isRunning());
// step a prop's clip; a once clip hands over to its `then` (looping) when it ends
export function step(P, dt) {
  P.rig.update(dt);
  if (P.next && (P.t -= dt) <= 0) { const n = P.next; P.next = null; play(P, n, { loop: true }); }
  P.root.updateMatrixWorld(true);
}

// Player collision for a placed script model (2026-11-15, user: "collision on sophia doesnt seem to work": script models
// aren't in BO3's collision export). Its posed vertices (skinned) binned on a `cell` grid; each cell becomes a solid column
// from its lowest to its highest vertex: the shape without cables and panel edges to snag on. Returns a world.dynamic entry
// (null when nothing is solid): window-type, so it never cuts the navmesh (BO3's goes round the model), but `shoot` makes
// it stop bullets too (custom-world raycast). Build it once the model holds its pose; it does not follow later movement.
export function solidOf(roots, { cell = 12, name = 'prop', shoot = true } = {}) {
  const v = new THREE.Vector3(), cols = new Map();
  for (const r of roots) {
    r.updateMatrixWorld(true);
    r.traverse(o => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i); if (o.isSkinnedMesh) o.applyBoneTransform(i, v); v.applyMatrix4(o.matrixWorld);
        const k = Math.floor(v.x / cell) + ',' + Math.floor(v.z / cell), c = cols.get(k);
        if (c) { c.count++; if (v.y < c.lo) c.lo = v.y; if (v.y > c.hi) c.hi = v.y; } else cols.set(k, { lo: v.y, hi: v.y, count: 1 });
      }
    });
  }
  const tris = [], box = new THREE.Box3();
  for (const [k, c] of cols) {
    if (c.count < 3 || c.hi - c.lo < 4) continue;   // stray points (collapsed hidden parts)
    const [i, j] = k.split(',').map(Number), b = new THREE.BoxGeometry(cell, c.hi - c.lo, cell).translate((i + .5) * cell, (c.lo + c.hi) / 2, (j + .5) * cell);
    const g = b.toNonIndexed(); tris.push(g.attributes.position.array); b.dispose();
    box.expandByPoint(new THREE.Vector3(i * cell, c.lo, j * cell)).expandByPoint(new THREE.Vector3((i + 1) * cell, c.hi, (j + 1) * cell));
  }
  if (!tris.length) return null;
  const all = new Float32Array(tris.reduce((n, a) => n + a.length, 0)); let o = 0; for (const a of tris) { all.set(a, o); o += a.length; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(all, 3));
  return { collider: new CollisionWorld(geo), box, enabled: true, window: true, shoot, name, cells: tris.length };
}
