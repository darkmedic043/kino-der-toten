// Gorod Krovi's sky dogfights: BO3 zm_stalingrad's 19 animated static models p7_fxanim_zm_stal_dogfight_01_smod (12)
// and _02_smod (7), each an FW 190 and a LaGG-3 chasing each other (bodies and propellers on smod_bone0..3). BO3 loops
// them with a clip its linker bakes into the map; that clip is not in the game's xanim pool, so Greyhound can't export
// it (2026-11-15). Stand-in: the two planes of every placement fly a banked circle, the chaser on the leader's track
// one gap behind (their bind-pose gap and headings), props spinning, with a random phase per placement.
// The static map build places them as instanced nodes `prop_p7_fxanim_zm_stal_dogfight_0N_smod_<cell>`; those are
// hidden here at setup, before instance-cull builds its batches (it skips hidden sources), and every plane piece
// (per material and plane) is drawn as one InstancedMesh over all placements of that model, from the map's own
// geometry and materials: 12 draws in all, ~130 matrix products a frame, no skinning, no shadows.
// Debug: window.kino.gorod.dogfight (also gk.dogfight): { kinds, meshes, hidden, lap }.
import * as THREE from 'three';

const RE = /^prop_p7_fxanim_zm_stal_dogfight_0([12])_smod_/;
const LAP = 18;          // seconds per circle
const BANK = 28 * Math.PI / 180;
const BOB = 70;          // inches of slow climb and dip
const SPIN = 45;         // propeller rad/s

export default async function setup(api, gk) {
  if (api.map?.id !== 'gorod-krovi') return;
  const { host, scene, world } = api;
  const root = world?.root ?? world?.mapRoot ?? scene;
  const byKind = new Map();
  root.traverse(o => { const m = RE.exec(o.name); if (m && !RE.test(o.parent?.name ?? '')) (byKind.get(m[1]) ?? byKind.set(m[1], []).get(m[1])).push(o); });
  if (!byKind.size) { console.warn('[gorod-krovi] dogfight: no dogfight nodes in the map'); return; }

  const kinds = [], meshes = [], hidden = [];
  const v = new THREE.Vector3();
  for (const [kind, nodes] of byKind) {
    // the instanced primitives of one node give the model; every node's instances give the placements
    const prims = []; nodes[0].traverse(o => { if (o.isInstancedMesh) prims.push(o); });
    if (!prims.length) continue;
    const placements = [];
    for (const n of nodes) {
      n.updateWorldMatrix(true, true);
      const ims = []; n.traverse(o => { if (o.isInstancedMesh) ims.push(o); });
      const im = ims[0]; if (!im) continue;
      for (let i = 0; i < im.count; i++) { const m = new THREE.Matrix4(); im.getMatrixAt(i, m); placements.push(m.premultiply(im.matrixWorld)); }
    }
    // two planes: seeds = the vertex farthest from the mean, then the one farthest from that
    const all = [];
    for (const p of prims) { const a = p.geometry.attributes.position; for (let i = 0; i < a.count; i++) all.push(new THREE.Vector3().fromBufferAttribute(a, i)); }
    const mean = all.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(all.length);
    const far = from => all.reduce((b, p) => (p.distanceToSquared(from) > b.distanceToSquared(from) ? p : b), all[0]);
    const s0 = far(mean), s1 = far(s0), seeds = [s0, s1];
    const near = p => (p.distanceToSquared(seeds[0]) <= p.distanceToSquared(seeds[1]) ? 0 : 1);
    // split each primitive's triangles by plane
    const pieces = [], sum = [new THREE.Vector3(), new THREE.Vector3()], cnt = [0, 0], propSum = [new THREE.Vector3(), new THREE.Vector3()], propCnt = [0, 0];
    for (const p of prims) {
      const g = p.geometry, a = g.attributes.position, idx = g.index ? g.index.array : [...Array(a.count).keys()];
      // the propeller discs: BO3's corsair_prop card, which the map build swapped for a stand-in material
      // (mtl_p7_fan_large_ventilation_housing_01, 2 triangles a plane): anything not a veh_ material
      const isProp = /prop/i.test(p.material?.name ?? '') || !/veh_/.test(p.material?.name ?? '');
      const lists = [[], []];
      for (let t = 0; t < idx.length; t += 3) {
        v.set(0, 0, 0); for (let k = 0; k < 3; k++) v.add(new THREE.Vector3().fromBufferAttribute(a, idx[t + k])); v.divideScalar(3);
        const w = near(v); lists[w].push(idx[t], idx[t + 1], idx[t + 2]);
        sum[w].add(v); cnt[w]++; if (isProp) { propSum[w].add(v); propCnt[w]++; }
      }
      lists.forEach((l, w) => {
        if (!l.length) return;
        const pg = new THREE.BufferGeometry();
        for (const [k, attr] of Object.entries(g.attributes)) pg.setAttribute(k, attr);
        pg.setIndex(l); pg.computeBoundingSphere();
        pieces.push({ plane: w, prop: isProp, geometry: pg, material: p.material, src: p });
      });
    }
    const planes = [0, 1].map(w => {
      const c = sum[w].clone().divideScalar(Math.max(1, cnt[w]));
      const pc = propCnt[w] ? propSum[w].clone().divideScalar(propCnt[w]) : null;
      const h = (pc ? pc.clone().sub(c) : seeds[1 - w].clone().sub(c)); h.y = 0; h.normalize();
      return { c, pc, h, axis: pc ? pc.clone().sub(c).normalize() : h.clone() };
    });
    // the chaser flies toward the other plane
    const toward = w => planes[1 - w].c.clone().sub(planes[w].c).setY(0).normalize().dot(planes[w].h);
    const ch = toward(0) >= toward(1) ? 0 : 1, ld = 1 - ch, L = planes[ld];
    const gap = Math.hypot(L.c.x - planes[ch].c.x, L.c.z - planes[ch].c.z);
    const r = THREE.MathUtils.clamp(gap * .65, 1200, 4000);
    let n = new THREE.Vector3(-L.h.z, 0, L.h.x);
    const C1 = L.c.clone().addScaledVector(n, r), C2 = L.c.clone().addScaledVector(n, -r);
    const C = Math.hypot(C1.x, C1.z) <= Math.hypot(C2.x, C2.z) ? C1 : C2;
    const th0 = Math.atan2(L.c.z - C.z, L.c.x - C.x);
    const s = Math.sign(-Math.sin(th0) * L.h.x + Math.cos(th0) * L.h.z) || 1;
    planes[ld].th0 = th0; planes[ch].th0 = th0 - s * gap / r;
    planes[ld].ph = 0; planes[ch].ph = 2.1;
    const K = { kind, nodes: nodes.length, placements, planes, pieces, C, r, s, phase: placements.map(() => Math.random() * LAP), leader: ld };

    for (const pc of pieces) {
      const im = new THREE.InstancedMesh(pc.geometry, pc.material, placements.length);
      im.name = `gk_dogfight_${kind}_${pc.plane}_${pc.prop ? 'prop' : pc.material?.name ?? ''}`;
      im.frustumCulled = false; im.castShadow = false; im.userData.noCull = true; im.receiveShadow = !!pc.src.receiveShadow;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.matrixAutoUpdate = false; im.updateMatrix(); im.updateMatrixWorld(true);
      pc.mesh = im; scene.add(im); meshes.push(im);
    }
    for (const nd of nodes) { nd.visible = false; hidden.push(nd.name); }
    kinds.push(K);
  }

  // a plane's model-space matrix at time t (body; the propeller adds its spin about its own centre)
  const T = new THREE.Matrix4(), Q = new THREE.Quaternion(), Qb = new THREE.Quaternion(), d = new THREE.Vector3();
  const tmp = new THREE.Matrix4(), out = new THREE.Matrix4(), body = [new THREE.Matrix4(), new THREE.Matrix4()], prop = [new THREE.Matrix4(), new THREE.Matrix4()];
  function planeAt(K, w, t, M, P) {
    const p = K.planes[w], th = p.th0 + K.s * (2 * Math.PI / LAP) * t;
    d.set(-Math.sin(th), 0, Math.cos(th)).multiplyScalar(K.s);
    Q.setFromUnitVectors(p.h, d);
    const inward = v.set(K.C.x - (K.C.x + K.r * Math.cos(th)), 0, K.C.z - (K.C.z + K.r * Math.sin(th))).normalize();
    const side = -d.z * inward.x + d.x * inward.z;   // (d x up) . inward
    Qb.setFromAxisAngle(d, side >= 0 ? BANK : -BANK);
    Q.premultiply(Qb);
    M.makeTranslation(-p.c.x, -p.c.y, -p.c.z).premultiply(tmp.makeRotationFromQuaternion(Q))
      .premultiply(T.makeTranslation(K.C.x + K.r * Math.cos(th), p.c.y + BOB * Math.sin(.35 * t + p.ph), K.C.z + K.r * Math.sin(th)));
    if (p.pc) {
      P.makeTranslation(-p.pc.x, -p.pc.y, -p.pc.z).premultiply(tmp.makeRotationAxis(p.axis, (t * SPIN) % (2 * Math.PI)))
        .premultiply(T.makeTranslation(p.pc.x, p.pc.y, p.pc.z)).premultiply(M);
    } else P.copy(M);
  }
  let clock = 0;
  function pose(dt) {
    clock += dt;
    for (const K of kinds) {
      K.placements.forEach((W, i) => {
        const t = clock + K.phase[i];
        planeAt(K, 0, t, body[0], prop[0]); planeAt(K, 1, t, body[1], prop[1]);
        for (const pc of K.pieces) pc.mesh.setMatrixAt(i, out.multiplyMatrices(W, (pc.prop ? prop : body)[pc.plane]));
      });
      for (const pc of K.pieces) pc.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  pose(0);
  host.on('update', dt => pose(Math.min(dt || 1 / 60, .1)));

  gk.dogfight = { kinds, meshes, hidden, lap: LAP, pose, planeAt };
  if (window.kino?.gorod) window.kino.gorod.dogfight = gk.dogfight;
  console.info(`[gorod-krovi] dogfight: ${kinds.map(K => `${K.kind}: ${K.placements.length} placements, ${K.pieces.length} pieces`).join('; ')}`);
}
