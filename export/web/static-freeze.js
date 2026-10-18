// Stops three recomputing the local and world matrices of a map's static objects every frame, and stops it walking
// their subtrees at all (not part of upstream; docs/fork/performance.md). three r185 composes every `matrixAutoUpdate`
// object's matrix and multiplies it into its world matrix each frame, and `updateMatrixWorld` visits every object in
// the scene whether or not anything changed (Der Eisendrache: 6,500 objects, 12% of the frame's CPU in that walk).
// Kino's world.js freezes its root outright; custom maps can't, because doors slide, gates move, floaters drift and
// mods animate map parts. So here (2026-10-17, the whole scene, not just the map root: Der Eisendrache's doors, placed
// props, booths and rigs sit beside it):
//   - every object under `root` except bones, cameras and lights is frozen (matrixAutoUpdate off, matrix current) and
//     its position/rotation/scale snapshotted; every frame (`every` = 1) the snapshots are compared and anything that
//     moved goes back to normal updates for good. tick() runs after the game's update and before the render, so a
//     move made by a mod this frame is drawn this frame;
//   - a frozen object whose subtree holds nothing live (no bone, light, camera, thawed object or object that manages its
//     own matrix) gets a `updateMatrixWorld` that does nothing unless it is forced (a parent moved) or flagged
//     (`matrixWorldNeedsUpdate`, as `updateMatrix()` sets it): the walk stops there. When something under it thaws or
//     a child is added, it and its ancestors go back to the normal walk.
// Mods that move a frozen node and call `updateMatrixWorld(true)` at once see it move on the next tick at the latest
// (same frame); `updateMatrix()` first makes it immediate.
import * as THREE from 'three';

const proto = THREE.Object3D.prototype.updateMatrixWorld;
function skipWalk(force) { if (force || this.matrixWorldNeedsUpdate) proto.call(this, force); }

export function createStaticFreeze(root, { every = 1 } = {}) {
  const list = [], snap = [], frozen = new Set();
  root.updateMatrixWorld(true);
  // three's updateMatrixWorld recomposes every `matrixAutoUpdate` object's matrix and then forces its whole subtree to
  // recompute, so a scene root that never moves (the root here) still forced every object under it every frame: its own
  // matrix is final, so it stops composing it (static-freeze v1 froze the objects but not the root, and gained nothing)
  if (root.matrixAutoUpdate) { root.updateMatrix(); root.matrixAutoUpdate = false; }
  // bones are frozen too (2026-10-17): a map's rigged props (wall guns, machines, Der Eisendrache's 480 fxanim rigs) never
  // animate, and their rigs were the one part of the scene the walk still had to enter every frame; a rig that does
  // animate (a mixer writes its bones' quaternions) thaws on the first compare and walks normally from then on
  const live = o => o.isCamera || o.isLight;
  // objects that manage their own matrix (matrixAutoUpdate already off) are left alone; a subtree is only skipped when
  // everything in it is frozen here or a known static mesh (batches, instance batches, merged level meshes)
  const ownMatrix = o => !o.matrixAutoUpdate && !frozen.has(o) && !(o.isBatchedMesh || o.isInstancedMesh || o.userData.merged || o.userData.static);
  root.traverse(o => {
    if (o === root || !o.matrixAutoUpdate || live(o)) return;
    o.updateMatrix(); o.matrixAutoUpdate = false; list.push(o); frozen.add(o);
    snap.push(o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w, o.scale.x, o.scale.y, o.scale.z);
  });
  // skip-walk: bottom-up, a node is skippable when none of its descendants is live, thawed or self-managed
  const skipped = new Map();   // object -> children.length when it was skipped
  let skips = 0;
  const mark = o => {
    let ok = frozen.has(o) || (!o.matrixAutoUpdate && !ownMatrix(o));
    for (const c of o.children) { if (!mark(c)) ok = false; }
    if (o === root) return false;
    if (ok && o.children.length) { o.updateMatrixWorld = skipWalk; skipped.set(o, o.children.length); skips++; }
    return ok && !live(o);
  };
  mark(root);
  // an object (and its ancestors) back on the normal walk: it, or something under it, moves or changed
  function unskip(o) {
    for (let p = o; p && p !== root; p = p.parent) {
      if (skipped.has(p)) { delete p.updateMatrixWorld; skipped.delete(p); p.userData.liveSubtree = true; }
      else if (p.userData.liveSubtree) break;   // already open up to the root
      else p.userData.liveSubtree = true;
    }
  }
  let frame = 0, thawed = 0;
  return {
    frozen: list.length, skips, get thawed() { return thawed; }, get skipped() { return skipped.size; },
    tick() {
      if (++frame % every) return;
      // half the list a frame (a moved object is noticed within two frames; thawed ones then update normally)
      const half = frame & 1, n = list.length;
      for (let i = half; i < n; i += 2) {
        const o = list[i]; if (!o || o.matrixAutoUpdate) continue;
        const p = o.position, q = o.quaternion, s = o.scale, k = i * 10;
        if (p.x !== snap[k] || p.y !== snap[k + 1] || p.z !== snap[k + 2] || q.x !== snap[k + 3] || q.y !== snap[k + 4] || q.z !== snap[k + 5] || q.w !== snap[k + 6] || s.x !== snap[k + 7] || s.y !== snap[k + 8] || s.z !== snap[k + 9]) {
          o.matrixAutoUpdate = true; o.matrixWorldNeedsUpdate = true; list[i] = null; frozen.delete(o); thawed++;   // it moves: normal updates from now on
          unskip(o);
        }
      }
      // a child added under a skipped node (a mod attaching an effect or a part): that chain walks again
      if ((frame & 3) === 0) skipped.forEach((n, o) => { if (o.children.length !== n) { unskip(o); for (const c of o.children) if (c.matrixWorldNeedsUpdate || c.matrixAutoUpdate) c.updateMatrixWorld(true); } });
    },
    // a mod can thaw a subtree it is about to animate (optional: moves are noticed anyway)
    thaw(o) { o.traverse(c => { if (frozen.has(c)) { c.matrixAutoUpdate = true; c.matrixWorldNeedsUpdate = true; frozen.delete(c); const i = list.indexOf(c); if (i >= 0) list[i] = null; thawed++; } }); unskip(o); },
  };
}
