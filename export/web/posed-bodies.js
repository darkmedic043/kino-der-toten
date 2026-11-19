// Bodies in the scenery, posed (2026-11-19, user: "make sure that the zombies are posed correctly if used in the
// environment, like gorod krovi"). A BO3 map places its dead soldiers as static models, and a static model is drawn in
// its bind pose: arms out, legs straight, stiff as a shop dummy (Gorod Krovi has 252). .tools/build_posed_bodies.py
// bakes each one into a real pose (the rest frame of one of BO3's zombie death clips for a body on the ground, a limp
// hang for one that stands or leans) and writes them as plain instanced meshes to the map's `bodies.glb`.
// This loads that file at the map mod's setup, takes the map's stiff copies out and puts the posed ones in their
// place, as children of the map root: the engine then batches them like any other placed prop (instance-cull.js), so
// they cost what the stiff ones did. Call it before anything that tags or patches the map's meshes (shadows, detail).
//   await posedBodies(api, { url: 'mods/maps/<map>/bodies.glb', stiff: /^prop_<model prefix>/ })
// A posed mesh takes the map's own material of the same name when the map has one (the file then carries no textures).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function posedBodies(api, { url, stiff = null } = {}) {
  const root = api.world?.root; if (!root || /[?&]stiffBodies/.test(location.search)) return null;   // ?stiffBodies: the map as built, for an A/B
  let gltf;
  try { gltf = await new GLTFLoader().loadAsync(url); }
  catch (e) { console.warn('[posed-bodies] ' + url + ' did not load: the map keeps the bodies it has', e); return null; }
  const old = [], mats = new Map(); let like = null;
  if (stiff) root.traverse(o => { if (stiff.test(o.name) && !stiff.test(o.parent?.name ?? '')) old.push(o); });
  for (const o of old) o.traverse(c => { if (!c.isMesh) return; like ??= c; for (const m of [c.material].flat()) if (m?.name && !mats.has(m.name)) mats.set(m.name, m); });
  const group = new THREE.Group(); group.name = 'posed_bodies';
  let bodies = 0, meshes = 0; const dropped = new Set();
  const swap = m => { const mine = mats.get(m.name); if (mine && mine !== m) dropped.add(m); return mine ?? m; };
  for (const node of [...gltf.scene.children]) {
    node.traverse(c => { if (!c.isMesh) return;
      c.material = Array.isArray(c.material) ? c.material.map(swap) : swap(c.material);
      if (like) { c.castShadow = like.castShadow; c.receiveShadow = like.receiveShadow; c.layers.mask = like.layers.mask; }
      meshes++; });
    let n = 0; node.traverse(c => { if (c.isInstancedMesh) n = Math.max(n, c.count); }); bodies += n;
    group.add(node);
  }
  for (const m of dropped) { for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) m[k]?.dispose?.(); m.dispose(); }
  const parent = old[0]?.parent ?? root;
  for (const o of old) { o.removeFromParent(); o.traverse(c => c.geometry?.dispose?.()); }
  parent.add(group); group.updateMatrixWorld(true);
  const info = { group, bodies, meshes, replaced: old.length };
  (globalThis.kino ??= {}).posedBodies = info;
  return info;
}
