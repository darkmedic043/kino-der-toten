// Placed props drawn piece by piece (2026-10-17): the builder places BO3 models as a node per prop whose glTF mesh has
// one primitive per material (a launch-pad shell is 42 draws, a Wunderfizz 23, a sliding door 20...), and the engine's
// scene merge leaves `CASTLE_` and door subtrees alone (mods find and move those nodes by name). Here the direct child
// meshes of every node under such a subtree that share a material are merged into one mesh of that node, so a prop
// that moves or hides as a whole (floaters, gates, Pack-a-Punch parts, landing pads) still does, with a draw per
// material instead of per piece. Skipped: skinned, instanced and batched meshes, hidden subtrees (a mod shows them
// later), the gondola rigs (the mod reads their car meshes by name), and pieces with their own `move` (door slides).
// Worst view: 2,357 -> see docs/fork/performance.md.
import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/jsm/utils/BufferGeometryUtils.js';

const TOP = /^(CASTLE_(?!TRAM)|DOOR_|machine_)/i;
export function mergeProps(root, scene = null) {
  const parents = new Set();
  for (const top of [...root.children, ...(scene?.children ?? [])]) {
    if (!TOP.test(top.name) || !top.visible || top.userData.hidden) continue;
    top.traverse(o => { if (o.visible && !o.userData.hidden && o.children.length > 1) parents.add(o); });
  }
  let merged = 0, made = 0;
  for (const parent of parents) {
    const groups = new Map();
    for (const o of parent.children) {
      if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.isBatchedMesh || !o.visible || Array.isArray(o.material) || o.morphTargetInfluences?.length || o.children.length || o.userData.move || o.userData.hidden) continue;
      const g = o.geometry; if (!g.index || Object.values(g.attributes).some(a => a.isInterleavedBufferAttribute)) continue;
      const layout = Object.keys(g.attributes).sort().map(k => `${k}:${g.attributes[k].itemSize}${g.attributes[k].normalized ? 'n' : ''}`).join(',');
      const key = [o.material.uuid, layout, o.castShadow, o.receiveShadow, o.renderOrder, o.layers.mask].join('|');
      (groups.get(key) ?? groups.set(key, []).get(key)).push(o);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map(o => { const g = o.geometry.clone(); o.updateMatrix(); g.applyMatrix4(o.matrix); return g; });
      const geo = mergeGeometries(geos, false); for (const g of geos) g.dispose();
      if (!geo) continue;
      const first = list[0], mesh = new THREE.Mesh(geo, first.material);
      mesh.name = 'merged_' + (first.name || first.material.name); for (const p of ['castShadow', 'receiveShadow', 'renderOrder', 'frustumCulled']) mesh[p] = first[p]; mesh.layers.mask = first.layers.mask;
      mesh.userData = { merged: list.length }; geo.computeBoundingSphere(); geo.computeBoundingBox();
      for (const o of list) { parent.remove(o); o.geometry.dispose(); merged++; }
      parent.add(mesh); mesh.updateMatrixWorld(true); made++;
    }
  }
  return { merged, made };
}

// Repeated meshes (2026-10-17): the 15 undercroft floaters, the 4 launch-pad shells, the 5 Wunderfizz machines, the
// debris walls, the pads, the 174 window boards... are copies of one model (or one box), each piece drawn on its own
// (a floater is 16 draws, a shell 32). Every mesh under a placed prop that shares its geometry and material with another becomes an instance of one InstancedMesh (boxes share a unit cube, their size in the instance matrix);
// the originals stay in place on no render layer, and the instances follow them: a node a mod moves (floaters, gates,
// flying Pack-a-Punch parts, sliding doors) or shows and hides (the pads' blue variants, torn boards) is mirrored the
// next frame. Worst view 2,016 -> ~1,100 draws.
const SKIP = /^CASTLE_(TRAM|EE|BQ|PART|DRAGON|PAPPART)/i;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), M = new THREE.Matrix4(), S = new THREE.Matrix4();
export function instanceProps(root, scene, host) {
  const groups = new Map(), unit = new THREE.BoxGeometry(1, 1, 1);
  const consider = top => top.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.isBatchedMesh || Array.isArray(o.material) || o.morphTargetInfluences?.length || o.layers.mask === 0) return;
    const box = o.geometry.type === 'BoxGeometry' ? o.geometry.parameters : null;
    const key = [box ? 'box' : o.geometry.uuid, o.material.uuid, o.castShadow, o.receiveShadow, o.renderOrder, o.layers.mask].join('|');
    (groups.get(key) ?? groups.set(key, []).get(key)).push({ o, box, last: new Float32Array(16).fill(NaN), vis: null });
  });
  for (const top of root.children) if (/^(CASTLE_|DOOR_)/i.test(top.name) && !SKIP.test(top.name)) consider(top);
  for (const top of scene.children) if (/^window_boards$/.test(top.name)) consider(top);
  const visible = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const matrix = e => { e.o.updateWorldMatrix?.(false, false); return e.box ? M.multiplyMatrices(e.o.matrixWorld, S.makeScale(e.box.width, e.box.height, e.box.depth)) : e.o.matrixWorld; };
  const sets = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;   // even a pair halves its draws (the floaters are several models used 2-3 times each)
    const first = g[0].o, im = new THREE.InstancedMesh(first.geometry.type === 'BoxGeometry' ? unit : first.geometry, first.material, g.length);
    im.name = 'instanced_' + (first.name || first.material.name || 'box').replace(/_\d+$/, '');
    for (const k of ['castShadow', 'receiveShadow', 'renderOrder']) im[k] = first[k]; im.layers.mask = first.layers.mask; im.frustumCulled = true; im.userData.noCull = true;
    g.forEach((e, k) => { const vis = visible(e.o); e.vis = vis; e.last.set(e.o.matrixWorld.elements); im.setMatrixAt(k, vis ? matrix(e) : ZERO); e.o.layers.mask = 0; });
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); scene.add(im);
    sets.push({ g, im });
  }
  host?.on('update', () => {
    for (const { g, im } of sets) {
      let dirty = false;
      g.forEach((e, k) => {
        const w = e.o.matrixWorld.elements, vis = visible(e.o); let same = vis === e.vis;
        for (let i = 0; same && i < 16; i++) if (w[i] !== e.last[i]) same = false;
        if (same) return;
        e.last.set(w); e.vis = vis; dirty = true; im.setMatrixAt(k, vis ? matrix(e) : ZERO);
      });
      if (dirty) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
    }
  });
  return { groups: sets.length, instances: sets.reduce((a, s) => a + s.g.length, 0), meshes: sets.length, hidden: sets.reduce((a, s) => a + s.g.length, 0) };
}
