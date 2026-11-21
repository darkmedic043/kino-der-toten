// Actors (zombies, dogs, bosses, their bodies) cost only what the player can see (2026-11-21, not part of upstream).
// Before this, every zombie was drawn, skinned and animated every frame wherever it stood: enemies.js turns frustum
// culling off for their meshes (a skinned mesh's own bounds are its bind pose), so 20 zombies behind the player cost as
// much as 20 in front of them (The Giant, High: 7 ms a frame without them, 12-14 ms with them, either way round).
//   cull      each frame the actor's bounds are taken from its bones (their box, plus the farthest a vertex sits from
//             its bone) and written into every skinned mesh's own boundingSphere, and frustum culling is switched back
//             on: three then skips the draws, the skeleton update and the bone-texture upload per camera and per
//             shadow map, natively
//   throttle  an actor outside the view (with a margin) animates at `hz` (30) a second instead of every frame, with the
//             time it missed handed to its rig in one go (notetracks and clip time keep their totals), and its bones'
//             matrices are left alone in between; the frame it comes into view it is walked again at once
//   once      an actor's matrix walk runs once a frame, here, not once per render call of the composer
//   rest      a rig whose clip has ended (a body on the floor) is not evaluated again until something plays
// The engine calls update(camera, dt) after the game step and before the draw. Each switch is live:
// kino.rigLod.cull / throttle / once / rest / enabled, `?noRigLod` for none of it; kino.rigLod.stats() counts.
// A mod that wants an actor left alone sets z.noRigLod = true.
import * as THREE from 'three';
import { shareSkeletons } from './still-skeletons.js';

const walk = THREE.Object3D.prototype.updateMatrixWorld;
const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _c = new THREE.Vector3(), _v = new THREE.Vector3(), _sphere = new THREE.Sphere();
// geometry -> { r: the farthest a vertex sits from the bones that move it (in bone space), used: the bones that move a
// vertex at all }. Only those bones bound the mesh: a zombie's tag_weapon_right sits 300 units from its body.
const reachOf = new WeakMap();

function geometryReach(mesh) {
  const g = mesh.geometry; let out = reachOf.get(g); if (out) return out;
  let r = 24, used = null;
  const P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, inv = mesh.skeleton?.boneInverses;
  if (P?.array && SI?.array && SW?.array && inv) {
    let best = 0; const n = P.count, step = Math.max(1, Math.floor(n / 1500)), m = new THREE.Matrix4();   // a sample of the vertices: once per geometry, a fraction of a millisecond
    const cache = new Map(), of = b => { let e = cache.get(b); if (!e) { e = inv[b] ? m.multiplyMatrices(inv[b], mesh.bindMatrix).elements.slice() : null; cache.set(b, e); } return e; };
    // a skinned vertex is the weighted mean of where each of its bones would put it, so it sits no farther from the
    // bones' box than the weighted mean of its distances to those bones
    try {
      const u = new Uint8Array(inv.length); let any = false;
      for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) if (SW.getComponent(i, k) > 0) { const b = SI.getComponent(i, k); if (b < u.length) { u[b] = 1; any = true; } }
      if (any) used = u;
      for (let i = 0; i < n; i += step) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i); let sum = 0, tot = 0;
        for (let k = 0; k < 4; k++) {
          const w = SW.getComponent(i, k); if (!(w > 0)) continue;
          const e = of(SI.getComponent(i, k)); if (!e) continue;
          const a = e[0] * x + e[4] * y + e[8] * z + e[12], b = e[1] * x + e[5] * y + e[9] * z + e[13], c = e[2] * x + e[6] * y + e[10] * z + e[14];
          sum += w * Math.sqrt(a * a + b * b + c * c); tot += w;
        }
        if (tot > 0 && sum / tot > best) best = sum / tot;
      }
      if (best > 0 && Number.isFinite(best)) r = best * (step > 1 ? 1.15 : 1);
    } catch { r = 24; used = null; }
  }
  out = { r, used }; reachOf.set(g, out); return out;
}
const scaleOf = m => { const e = m.elements; return Math.sqrt(Math.max(e[0] * e[0] + e[1] * e[1] + e[2] * e[2], e[4] * e[4] + e[5] * e[5] + e[6] * e[6], e[8] * e[8] + e[9] * e[9] + e[10] * e[10])); };

export function createRigLod({ enemies, share = true }) {
  const states = new Map();   // actor root -> state
  const owned = new WeakMap();   // skinned mesh -> its sphere (meshes this module switched culling on for)
  const count = { rigSkips: 0, rigRuns: 0, walks: 0, selfWalks: 0, collects: 0 };
  let frame = 0, lastCull = true;
  const api = {
    enabled: true, cull: true, throttle: true, once: true, rest: true,
    hz: 30,        // animation rate of an actor outside the view
    margin: 48,    // how far outside the view (world units) an actor starts being throttled
    states,
    stats() { let seen = 0, meshes = 0; for (const st of states.values()) { if (st.vis) seen++; meshes += st.meshes.length; } return { actors: states.size, inView: seen, meshes, frame, ...count }; },
    update, prepare,
  };

  // a rig at rest: its clip has ended (clamped or switched off) or its mixer is stopped
  const atRest = rig => { const a = rig.actions?.[rig.current]; return !!a && (a.paused || !a.enabled) || rig.mixer?.timeScale === 0; };
  function wrapRig(st, rig) {
    st.rig = rig; if (!rig || rig.__lod) return;
    const up = rig.update; rig.__lod = true;
    rig.update = function (dt) {
      const s = this.__lodState;
      if (s && api.enabled && !s.off) {
            if (api.rest && s.restT > .5 && atRest(this)) {   // time at rest is not owed to the next clip: only a slow beat
          if ((s.beat += dt) < .5) { count.rigSkips++; return; }
          s.beat = 0;
        } else if (api.throttle && !s.vis && s.acc + dt < 1 / api.hz - .002) { s.acc += dt; count.rigSkips++; return; }
        dt += s.acc; s.acc = 0; s.ran = true; count.rigRuns++;
      }
      return up.call(this, dt);
    };
  }

  // the actor's skinned meshes and bones (again every half second: mods swap models, add pieces, tear limbs off)
  function collect(st) {
    count.collects++;
    const root = st.root; if (share) shareSkeletons(root);
    const meshes = [], bones = new Set(); let reach = 0, n = 0;
    root.traverse(o => {
      n++;
      if (!o.isSkinnedMesh || !o.skeleton?.bones?.length) return;
      let sphere = owned.get(o);
      if (!sphere) { if (o.frustumCulled) return; sphere = new THREE.Sphere(); owned.set(o, sphere); }   // a mesh somebody else already culls is theirs
      o.boundingSphere = sphere; o.frustumCulled = api.cull && api.enabled;
      const sk = o.skeleton, b0 = sk.bones.find(Boolean), g = geometryReach(o);
      meshes.push(o); for (let i = 0; i < sk.bones.length; i++) if (sk.bones[i] && (!g.used || g.used[i])) bones.add(sk.bones[i]);
      reach = Math.max(reach, g.r * (b0 ? scaleOf(b0.matrixWorld) : 1));
    });
    for (const m of st.meshes) if (!meshes.includes(m)) { let p = m.parent; while (p && p !== root) p = p.parent; if (!p) m.frustumCulled = false; }   // a piece that left the actor draws as it did before
    st.meshes = meshes; st.bones = [...bones]; st.reach = reach; st.nodes = n; st.sig = signature(st); st.scan = frame + 15 + (st.id % 15);
    st.fresh = false;
  }
  const signature = st => st.root.children.length * 1000 + (st.z.body?.children.length ?? 0);
  function release(st) {
    for (const m of st.meshes) m.frustumCulled = false;
    if (Object.hasOwn(st.root, 'updateMatrixWorld')) delete st.root.updateMatrixWorld;
    if (st.rig) st.rig.__lodState = null;
  }
  let serial = 0;
  function adopt(z) {
    const root = z.root, st = { z, root, id: serial++, rig: null, meshes: [], bones: [], reach: 0, r: -1, ox: 0, oy: 0, oz: 0, vis: true, ran: true, acc: 0, beat: 0, restT: 0, fresh: false, scan: 0, sig: -1, seen: 0, off: false, nodes: 0 };
    root.updateMatrixWorld = function (force) { if (force || !api.enabled || !api.once || st.off) walk.call(this, force); };
    states.set(root, st); return st;
  }
  // the bones' box after a full walk: the centre as an offset from the root, the radius with the meshes' reach
  function measure(st) {
    const bones = st.bones; if (!bones.length) { st.r = -1; return; }
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < bones.length; i++) { const e = bones[i].matrixWorld.elements, x = e[12], y = e[13], z = e[14]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2, r = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + st.reach + 2;
    if (!Number.isFinite(r)) { st.r = -1; return; }
    const e = st.root.matrixWorld.elements; st.ox = cx - e[12]; st.oy = cy - e[13]; st.oz = cz - e[14]; st.r = r;
    for (const m of st.meshes) {
      const s = m.boundingSphere, k = scaleOf(m.matrixWorld) || 1;
      s.center.set(cx, cy, cz).applyMatrix4(_inv.copy(m.matrixWorld).invert()); s.radius = r / k;
      if (_inv.elements[15] === 0 || !Number.isFinite(s.center.x + s.center.y + s.center.z + s.radius)) { s.center.set(0, 0, 0); s.radius = Infinity; }   // a mesh scaled flat: never culled
    }
  }
  function step(st, dt) {
    const z = st.z, root = st.root;
    if (z.rig !== st.rig) wrapRig(st, z.rig);
    if (st.rig && st.rig.__lodState !== st) st.rig.__lodState = st;
    st.off = !!z.noRigLod;
    if (frame >= st.scan || signature(st) !== st.sig) collect(st);
    st.restT = st.rig && !st.off && atRest(st.rig) ? st.restT + dt : 0;
    // the root's own matrices, always
    if (root.matrixAutoUpdate) root.updateMatrix();
    if (root.parent) root.matrixWorld.multiplyMatrices(root.parent.matrixWorld, root.matrix); else root.matrixWorld.copy(root.matrix);
    const e = root.matrixWorld.elements;
    let vis = true;
    if (st.r >= 0 && root.visible) { _sphere.center.set(e[12] + st.ox, e[13] + st.oy, e[14] + st.oz); _sphere.radius = st.r + api.margin; vis = _frustum.intersectsSphere(_sphere); }
    st.vis = vis;
    // walked in full when its rig ran, and whenever it is in view (a mod may pose bones itself); out of view and not
    // animated this frame, only the root above was brought up to date
    if (st.ran || vis || !st.fresh || st.off) {
      walk.call(root, true); st.fresh = true; count.walks++;
      if (st.meshes.length) measure(st);
    } else count.selfWalks++;
    st.ran = false;
  }
  function update(camera, dt) {
    frame++;
    const on = api.enabled && api.cull;
    if (on !== lastCull) { lastCull = on; for (const st of states.values()) for (const m of st.meshes) m.frustumCulled = on; }
    if (!api.enabled) return;
    if (camera.parent === null && camera.matrixWorldAutoUpdate) camera.updateMatrixWorld();
    _frustum.setFromProjectionMatrix(_pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (const z of enemies.list) { if (!z?.root) continue; const st = states.get(z.root) ?? adopt(z); st.z = z; st.seen = frame; step(st, dt); }
    for (const z of enemies.dead) { if (!z?.root) continue; const st = states.get(z.root) ?? adopt(z); st.z = z; st.seen = frame; step(st, dt); }
    if (states.size > enemies.list.length + enemies.dead.length) for (const [root, st] of states) if (st.seen !== frame) { release(st); states.delete(root); }
  }
  // at load: the reach of a model's meshes, so a first spawn measures nothing
  function prepare(root) { root?.traverse?.(o => { if (o.isSkinnedMesh && o.skeleton) geometryReach(o); }); }
  return api;
}
