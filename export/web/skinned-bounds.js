// Fast bounds for rigged (skinned) models (not part of upstream). three.js measures a SkinnedMesh by running every
// vertex through its bones with generic per-vertex calls (SkinnedMesh.computeBoundingBox / getVertexPosition), which
// cost about 2 s of a Kino load for the mystery box guns alone. This does the same maths in one tight loop over the raw
// arrays: per bone, A = bindMatrixInverse · bone.matrixWorld · boneInverse · bindMatrix, then each vertex is
// Σ weight · A · position. Same result as three's (it includes bones scaled to ~0, e.g. hidden attachments).
//   skinnedBox(mesh, box?)     the mesh's posed box in its own space (what mesh.computeBoundingBox() gives)
//   objectBox(root, box?)      like new THREE.Box3().setFromObject(root), with skinned meshes measured this way
//   fitSkinnedBounds(root)     sets mesh.boundingBox / boundingSphere on every skinned mesh, so the renderer's culling
//                              and sorting never compute them the slow way
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _box = new THREE.Box3();
export function skinnedBox(mesh, box = new THREE.Box3()) {
  box.makeEmpty();
  const g = mesh.geometry, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, sk = mesh.skeleton;
  if (!P) return box;
  if (!SI || !SW || !sk) { if (!g.boundingBox) g.computeBoundingBox(); return box.copy(g.boundingBox); }
  const bones = sk.bones, inv = sk.boneInverses, A = new Float32Array(bones.length * 16);
  for (let b = 0; b < bones.length; b++) {
    if (!bones[b]) { _m.identity(); } else _m.multiplyMatrices(bones[b].matrixWorld, inv[b]);
    _m.premultiply(mesh.bindMatrixInverse).multiply(mesh.bindMatrix);
    A.set(_m.elements, b * 16);
  }
  const morphed = g.morphAttributes.position?.length && mesh.morphTargetInfluences?.some(x => x);
  if (morphed) { // rare on box guns: fall back to three's (it handles morphs)
    mesh.computeBoundingBox(); return box.copy(mesh.boundingBox);
  }
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0, n = P.count; i < n; i++) {
    const px = P.getX(i), py = P.getY(i), pz = P.getZ(i);
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 4; k++) {
      const w = SW.getComponent(i, k); if (!w) continue;
      const o = SI.getComponent(i, k) * 16, e = A;
      x += w * (e[o] * px + e[o + 4] * py + e[o + 8] * pz + e[o + 12]);
      y += w * (e[o + 1] * px + e[o + 5] * py + e[o + 9] * pz + e[o + 13]);
      z += w * (e[o + 2] * px + e[o + 6] * py + e[o + 10] * pz + e[o + 14]);
    }
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  if (x0 <= x1) box.set(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
  return box;
}
export function objectBox(root, box = new THREE.Box3()) {
  box.makeEmpty();
  root.updateWorldMatrix(false, true);
  root.traverse(o => {
    if (!o.geometry?.attributes?.position) return;
    if (o.isSkinnedMesh) skinnedBox(o, _box);
    else { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); _box.copy(o.geometry.boundingBox); }
    if (!_box.isEmpty()) box.union(_box.applyMatrix4(o.matrixWorld));
  });
  return box;
}
export function fitSkinnedBounds(root) {
  root.updateWorldMatrix(false, true);
  root.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const b = skinnedBox(o, new THREE.Box3());
    o.boundingBox = b; o.boundingSphere = b.getBoundingSphere(new THREE.Sphere());
  });
}
