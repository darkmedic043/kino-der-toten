// Player collision for instanced props (map entry `propCollision`), 2026-11-12.
// The BO3 ports draw their props as instanced meshes (prop_<model>_<cell>); the builder gives only some of them
// collision, and an offline audit of The Giant (walk the collision, look for steps that pass through drawn triangles)
// found dumpsters, standing door leaves, cages, pipes, door frames and the teleporter walls walked straight through.
// A map entry lists the models that should stop the player and bullets (never the navmesh: a box in the navmesh cuts
// it into islands the zombies can't leave):
//   "propCollision": { "box": "<regex>", "mesh": "<regex>", "minHeight": 30 }
//   box:  the model's own bounding box per instance, turned and scaled with it (at least 4 thick)
//   mesh: the model's own triangles (frames, arches and curved walls a box would close)
//   minHeight: instances lower than this in the world are left out (low clutter only snags)
// Used by CustomWorld at load (propCollision) and by the offline audit (modelOf, shapeOf).
import * as THREE from 'three';

export const modelOf = name => /^prop_/.test(name ?? '') ? name.replace(/^prop_/, '').replace(/_-?\d+_-?\d+(_\d+)?$/, '') : null;
export function rulesOf(cfg) {
  if (!cfg) return null;
  const box = cfg.box ? new RegExp(cfg.box, 'i') : null, mesh = cfg.mesh ? new RegExp(cfg.mesh, 'i') : null;
  return { minHeight: cfg.minHeight ?? 30, shape: model => mesh?.test(model) ? 'mesh' : box?.test(model) ? 'box' : null };
}
const BOX = [0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3];
// local triangle soup (Float32Array, 9 numbers a triangle) of one model: its triangles, or its bounding box
export function shapeOf(positions, index, shape) {
  if (shape === 'mesh') {
    const n = index ? index.length : positions.length / 3, out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = (index ? index[i] : i) * 3; out[i * 3] = positions[v]; out[i * 3 + 1] = positions[v + 1]; out[i * 3 + 2] = positions[v + 2]; }
    return out;
  }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) { const k = i % 3; if (positions[i] < lo[k]) lo[k] = positions[i]; if (positions[i] > hi[k]) hi[k] = positions[i]; }
  for (let k = 0; k < 3; k++) if (hi[k] - lo[k] < 4) { const c = (hi[k] + lo[k]) / 2; lo[k] = c - 2; hi[k] = c + 2; }
  const out = new Float32Array(108);
  BOX.forEach((c, i) => { out[i * 3] = c & 4 ? hi[0] : lo[0]; out[i * 3 + 1] = c & 2 ? hi[1] : lo[1]; out[i * 3 + 2] = c & 1 ? hi[2] : lo[2]; });
  return out;
}
// one shape under one instance matrix (16 numbers, column-major), appended to `out` when it stands at least minHeight tall
export function placeShape(shape, e, minHeight, out) {
  const start = out.length; let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < shape.length; i += 3) {
    const x = shape[i], y = shape[i + 1], z = shape[i + 2], wy = e[1] * x + e[5] * y + e[9] * z + e[13];
    out.push(e[0] * x + e[4] * y + e[8] * z + e[12], wy, e[2] * x + e[6] * y + e[10] * z + e[14]);
    if (wy < lo) lo = wy; if (wy > hi) hi = wy;
  }
  if (hi - lo < minHeight) { out.length = start; return false; }
  return true;
}
// a mesh (not in the scene, world space) holding the collision of every matching instanced prop under `root`, or null
export function propCollision(root, cfg) {
  const rules = rulesOf(cfg); if (!rules) return null;
  const out = [], shapes = new Map(), m = new THREE.Matrix4(), im = new THREE.Matrix4(); let models = new Set(), count = 0;
  root.traverse(o => {
    if (!o.isInstancedMesh || o.userData.marker) return;
    const model = modelOf(o.name) ?? modelOf(o.parent?.name), shape = model && rules.shape(model); if (!shape) return;
    let s = shapes.get(o.geometry);
    if (!s) { const p = o.geometry.attributes.position, flat = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { flat[i * 3] = p.getX(i); flat[i * 3 + 1] = p.getY(i); flat[i * 3 + 2] = p.getZ(i); }
      shapes.set(o.geometry, s = shapeOf(flat, o.geometry.index?.array, shape)); }
    for (let k = 0; k < o.count; k++) { o.getMatrixAt(k, im); m.multiplyMatrices(o.matrixWorld, im); if (placeShape(s, m.elements, rules.minHeight, out)) { count++; models.add(model); } }
  });
  if (!out.length) return null;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3));
  const mesh = new THREE.Mesh(g); mesh.name = 'PCOL_props_entry'; mesh.updateMatrixWorld(true);
  console.info('[custom-world] prop collision:', count, 'instances of', models.size, 'models,', out.length / 9, 'triangles');
  return mesh;
}
