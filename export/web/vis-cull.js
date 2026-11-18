// Visibility culler for loose props (not part of upstream, 2026-11-17). Frame time on every map follows the number of
// separate draws (about 13 µs each on the user's PC, performance.md), and most of them are small props at rest that sit
// behind a wall: wall-buy guns, window boards, rigged quest props drawn one surface at a time. The map's own geometry is
// merged into batches with their own culler (instance-cull.js); this module looks after everything else.
//
//   groups     a prop (or a cluster of loose single meshes) no bigger than MAX units across, found by walking the scene
//              at load and by watching new top-level scene children; mods can also add(root) one of any size.
//   rest       a group whose nodes and bones haven't moved for three checks is "at rest": its rigged meshes get their
//              posed bounds (skinned-bounds.js) and are frustum-culled like any mesh (a rigged model otherwise loads
//              with culling off and is drawn from anywhere, and again in every shadow pass). When a node moves again the
//              group wakes: always drawn until it rests again. Zombies and players never rest, so are never touched.
//   occlusion  a resting group in view is tested with a GPU occlusion query: the front faces of its bounding box, drawn
//              with no colour or depth writes right after the opaque pass. Two hidden results in a row hide the group's
//              meshes from the main view only (shadow passes and other cameras still draw them); one visible result
//              shows it again. Hidden groups in view are tested every frame, so a prop comes back one frame after its
//              box does (the box is larger than the prop). A camera jump shows everything.
//
// The probes are raw GL draws from one driver mesh's onAfterRender (one tiny program, one VAO, compiled at creation):
// they don't count in renderer.info and cost about a microsecond each. They go through three's state object for
// everything three caches (program, masks, depth, culling); the VAO binding is put back.
//
//   kino.visCull.add(root)      one group for this root, whatever its size (over TEST_MAX: rest + frustum only)
//   kino.visCull.wake(node)     a clip is about to move it: drawn from this frame on
//   kino.visCull.exclude(node)  never touch this subtree (or set userData.noVisCull before load)
//   kino.visCull.stats()        { groups, resting, hidden, hiddenMeshes, inView, tested }
//   kino.visCull.enabled        false = everything drawn (the flags are cleared)
//   ?noVisCull                  off for the session
import * as THREE from 'three';
import { skinnedBox } from './skinned-bounds.js';

const MAX = 450;        // a discovered group's largest diagonal
const TEST_MAX = 1600;  // above this a group is never occlusion-tested
const CELL = 200;       // loose single meshes under one parent are grouped by this grid
const SIG_NODES = 400;  // nodes sampled for the rest signature
const HIDE_AFTER = 2, VISIBLE_BUDGET = 64, HIDDEN_BUDGET = 512, JUMP = 100, STALE_MOVE = 48;

let main = false;       // true while the world scene is drawn with the main camera
let skipBaked = false;   // set around a shadow pass by its owner (api.skipBaked)
const baseIntersects = THREE.Frustum.prototype.intersectsObject;
THREE.Frustum.prototype.intersectsObject = function (o) { return (main && o.userData.occluded === true) || (skipBaked && o.userData.shadowBaked === true) ? false : baseIntersects.call(this, o); };

const _b = new THREE.Box3(), _v = new THREE.Vector3(), _pv = new THREE.Matrix4(), _fr = new THREE.Frustum(), _m16 = new Float32Array(16);
// (a mesh with its own render callbacks is left alone: it may do its work there, and would stop when hidden)
const NOOP_BEFORE = THREE.Object3D.prototype.onBeforeRender, NOOP_AFTER = THREE.Object3D.prototype.onAfterRender;
const drawable = o => o.isMesh === true && !o.isBatchedMesh && !o.isInstancedMesh && o.layers.mask !== 0 && !o.userData.batchFollow && !!o.geometry?.attributes?.position
  && o.onBeforeRender === NOOP_BEFORE && o.onAfterRender === NOOP_AFTER;
const diag = b => Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);

export function createVisCull(renderer, scene) {
  const groups = [], known = new WeakSet(), taken = new WeakSet(), byNode = new WeakMap(), firstSeen = new WeakMap(), explicit = [];
  let started = false, enabled = true, mainCam = null, flips = 0, frame = 0, issued = -1, at = 0, vAt = 0, hAt = 0, scanAt = 0;
  let lx = NaN, ly = 0, lz = 0, inView = 0, tested = 0;
  const tests = [];

  // ---- the main-view flag ---------------------------------------------------------------------------------------
  const baseRender = renderer.render;
  renderer.render = function (scn, cam) {
    const was = main; main = started && enabled && scn === scene && cam === mainCam;
    try { return baseRender.apply(this, arguments); } finally { main = was; }
  };
  const sm = renderer.shadowMap, baseShadow = sm.render;
  sm.render = function () { const was = main; main = false; try { return baseShadow.apply(this, arguments); } finally { main = was; } };

  // ---- probes (raw GL) ------------------------------------------------------------------------------------------
  let gl = renderer.getContext(), prog = null, vao = null, loc = null, target = 0;
  const free = [], pq = [], pg = [], pe = []; let ph = 0;
  function initGl() {
    gl = renderer.getContext(); target = gl.ANY_SAMPLES_PASSED_CONSERVATIVE;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, '#version 300 es\nin vec3 p;uniform mat4 m;void main(){gl_Position=m*vec4(p,1.);}'));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, '#version 300 es\nprecision lowp float;out vec4 c;void main(){c=vec4(0.);}'));
    gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('[vis-cull] probe program failed:', gl.getProgramInfoLog(p)); enabled = false; return false; }
    loc = gl.getUniformLocation(p, 'm'); prog = p;
    const prev = gl.getParameter(gl.VERTEX_ARRAY_BINDING); vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const pos = new Float32Array(24); for (let i = 0; i < 8; i++) { pos[i * 3] = (i & 1) - .5; pos[i * 3 + 1] = (i >> 1 & 1) - .5; pos[i * 3 + 2] = (i >> 2 & 1) - .5; }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());   // (outward faces counter-clockwise: only front faces are drawn)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([1, 3, 7, 1, 7, 5, 0, 6, 2, 0, 4, 6, 2, 6, 7, 2, 7, 3, 0, 5, 4, 0, 1, 5, 4, 5, 7, 4, 7, 6, 0, 3, 1, 0, 2, 3]), gl.STATIC_DRAW);
    gl.bindVertexArray(prev); gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return true;
  }
  function glState() {
    const st = renderer.state;
    st.useProgram(prog); st.buffers.color.setMask(false); st.buffers.depth.setMask(false); st.buffers.depth.setTest(true); st.buffers.depth.setFunc(THREE.LessEqualDepth);
    st.setFlipSided(false); st.setCullFace(THREE.CullFaceBack); st.setPolygonOffset(false);
  }
  function warmGl() {   // one draw while loading, so the driver compiles the program before the first played frame
    if (!prog && !initGl()) return;
    glState(); const prev = gl.getParameter(gl.VERTEX_ARRAY_BINDING); gl.bindVertexArray(vao);
    _m16.fill(0); _m16[0] = _m16[5] = _m16[10] = 1e-3; _m16[15] = 1; gl.uniformMatrix4fv(loc, false, _m16); gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(prev);
  }
  function issue(cam) {
    if (!tests.length || gl.isContextLost() || !prog && !initGl()) return;
    const e = _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements, m = _m16;
    glState(); const prev = gl.getParameter(gl.VERTEX_ARRAY_BINDING); gl.bindVertexArray(vao);
    for (let i = 0; i < tests.length; i++) {
      const g = tests[i], b = g.box, sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z, cx = (b.max.x + b.min.x) / 2, cy = (b.max.y + b.min.y) / 2, cz = (b.max.z + b.min.z) / 2;
      for (let r = 0; r < 4; r++) { m[r] = e[r] * sx; m[4 + r] = e[4 + r] * sy; m[8 + r] = e[8 + r] * sz; m[12 + r] = e[r] * cx + e[4 + r] * cy + e[8 + r] * cz + e[12 + r]; }
      const q = free.pop() ?? gl.createQuery();
      gl.uniformMatrix4fv(loc, false, m); gl.beginQuery(target, q); gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0); gl.endQuery(target);
      pq.push(q); pg.push(g); pe.push(g.epoch);
    }
    gl.bindVertexArray(prev); tested = tests.length; tests.length = 0;
  }
  function poll() {
    while (ph < pq.length) {
      const q = pq[ph]; if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const vis = gl.getQueryParameter(q, gl.QUERY_RESULT) !== 0, g = pg[ph], ep = pe[ph]; free.push(q); pg[ph] = null; ph++;
      if (g.epoch !== ep || !g.rest) continue;
      g.rx = lx; g.ry = ly; g.rz = lz;
      if (vis) { g.strikes = 0; if (g.hidden) show(g); } else if (!g.hidden && ++g.strikes >= HIDE_AFTER) hide(g);
    }
    if (ph > 1024 || ph === pq.length) { pq.splice(0, ph); pg.splice(0, ph); pe.splice(0, ph); ph = 0; }
    if (pq.length > 8192) dropQueries();   // (results never arriving: a lost context)
  }
  function dropQueries() { for (let i = ph; i < pq.length; i++) gl.deleteQuery(pq[i]); pq.length = pg.length = pe.length = 0; ph = 0; }   // (entries before ph are already back in `free`: deleting those too handed out dead queries)
  renderer.domElement.addEventListener('webglcontextrestored', () => { prog = vao = null; free.length = 0; pq.length = pg.length = pe.length = 0; ph = 0; showAll(); });

  // the driver: first thing after the opaque pass, so the depth buffer holds every solid surface
  const driver = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3)),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, transparent: true, fog: false, toneMapped: false }));
  driver.name = 'vis-cull-probes'; driver.frustumCulled = false; driver.renderOrder = -1e9; driver.userData.noVisCull = true; driver.matrixAutoUpdate = false;
  driver.onAfterRender = (r, s, cam) => { if (main && issued !== frame) { issued = frame; issue(cam); } };
  scene.add(driver);
  try { warmGl(); } catch (err) { console.warn('[vis-cull]', err); enabled = false; }

  // ---- groups ---------------------------------------------------------------------------------------------------
  function meshesOf(node, out) {
    if (node.userData.noVisCull) return out;
    if (drawable(node) && !taken.has(node)) out.push(node);
    for (const c of node.children) meshesOf(c, out);
    return out;
  }
  function roughBox(ms, box) {   // cheap: a rigged mesh is measured by its bones
    box.makeEmpty();
    for (const o of ms) {
      if (o.isSkinnedMesh && o.skeleton) { for (const bn of o.skeleton.bones) if (bn) box.expandByPoint(_v.setFromMatrixPosition(bn.matrixWorld)); box.expandByScalar(20); continue; }
      const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
      if (!g.boundingBox.isEmpty()) box.union(_b.copy(g.boundingBox).applyMatrix4(o.matrixWorld));
    }
    return box;
  }
  const finite = b => !b.isEmpty() && Number.isFinite(b.min.x + b.min.y + b.min.z + b.max.x + b.max.y + b.max.z);
  function register(roots, meshes, isExplicit = false) {
    const set = new Set(roots);
    for (const m of meshes) { set.add(m); taken.add(m); if (m.isSkinnedMesh && m.skeleton) for (const bn of m.skeleton.bones) if (bn) set.add(bn); }
    let nodes = [...set]; if (nodes.length > SIG_NODES) { const k = nodes.length / SIG_NODES; nodes = Array.from({ length: SIG_NODES }, (_, i) => nodes[Math.floor(i * k)]); }
    const g = { roots, meshes, nodes, explicit: isExplicit, rest: false, still: 0, sig: NaN, hidden: false, strikes: 0, epoch: 0, box: new THREE.Box3(), pad: 0, occl: false, inFr: false,
      fc: [], rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0, vis: true };
    groups.push(g); for (const r of roots) { known.add(r); byNode.set(r, g); } for (const m of meshes) byNode.set(m, g);
    return g;
  }
  function discover(node) {
    if (node.userData.noVisCull || known.has(node) || node.isLight || node.isCamera) return;
    known.add(node);
    const ms = meshesOf(node, []); if (!ms.length) return;
    const box = roughBox(ms, new THREE.Box3());
    if (finite(box) && diag(box) <= MAX) { register([node], ms); return; }
    const cells = new Map();
    for (const c of node.children) {
      if (drawable(c) && !taken.has(c) && !c.userData.noVisCull && !c.children.some(k => meshesOf(k, []).length)) {
        const cb = roughBox([c], _b); if (!finite(cb) || diag(cb) > MAX) continue;
        cb.getCenter(_v); const key = Math.floor(_v.x / CELL) + ',' + Math.floor(_v.y / CELL) + ',' + Math.floor(_v.z / CELL);
        (cells.get(key) ?? cells.set(key, []).get(key)).push(c);
      } else discover(c);
    }
    for (const list of cells.values()) register(list, list);
  }
  function signature(g) {
    let s = 0; const n = g.nodes;
    for (let i = 0; i < n.length; i++) { const e = n[i].matrixWorld.elements; s += (e[12] + e[13] * 1.7 + e[14] * 2.3 + e[0] * 31 + e[5] * 37 + e[10] * 41) * (1 + i % 13); }
    for (let i = 0; i < g.meshes.length; i++) { const p = g.meshes[i].geometry.attributes.position; s += (p.version ?? p.data?.version ?? 0) * 7; }   // (a mesh redrawn by rewriting its vertices)
    return s;
  }
  function show(g) { if (!g.hidden) return; flips++; g.hidden = false; g.strikes = 0; for (const m of g.meshes) m.userData.occluded = false; }
  function hide(g) { flips++; g.hidden = true; const r = g.roots[0]; g.px = r.position.x; g.py = r.position.y; g.pz = r.position.z; g.vis = r.visible; for (const m of g.meshes) m.userData.occluded = true; }
  function settle(g) {   // at rest: posed bounds for the rigged meshes, the box the probes draw
    const box = g.box.makeEmpty();
    for (const o of g.meshes) {
      if (o.isSkinnedMesh) {
        const b = skinnedBox(o, o.boundingBox ?? new THREE.Box3()); o.boundingBox = b;
        const sp = b.getBoundingSphere(o.boundingSphere ?? new THREE.Sphere()); sp.radius = sp.radius * 1.15 + 12; o.boundingSphere = sp;
        if (!o.frustumCulled) { o.frustumCulled = true; g.fc.push(o); }
        if (!b.isEmpty()) box.union(_b.copy(b).applyMatrix4(o.matrixWorld));
      } else { const gb = o.geometry.boundingBox ?? (o.geometry.computeBoundingBox(), o.geometry.boundingBox); if (!gb.isEmpty()) box.union(_b.copy(gb).applyMatrix4(o.matrixWorld)); }
    }
    const d = finite(box) ? diag(box) : Infinity;
    g.occl = d <= TEST_MAX; g.pad = 24; if (g.occl) box.expandByScalar(10 + d * .08);
    g.rest = true; g.still = 0; g.strikes = 0; g.inFr = false; g.epoch++;
  }
  function wakeGroup(g) {
    g.epoch++; g.still = 0; g.sig = NaN; show(g);
    if (g.rest) { g.rest = false; for (const o of g.fc) o.frustumCulled = false; g.fc.length = 0; }
  }
  function attached(o) { for (let i = 0; o && i < 40; i++, o = o.parent) if (o === scene) return true; return false; }
  function drop(i) { const g = groups[i]; wakeGroup(g); for (const r of g.roots) { known.delete(r); byNode.delete(r); } for (const m of g.meshes) { taken.delete(m); byNode.delete(m); } groups[i] = groups[groups.length - 1]; groups.pop(); }
  function check(i, budget) {   // one group's rest check; returns true when it used the frame's fitting budget
    const g = groups[i];
    if (!attached(g.roots[0])) { drop(i); return false; }
    const s = signature(g);
    if (s !== g.sig) { g.sig = s; if (g.rest || g.hidden) wakeGroup(g), g.sig = s; g.still = 0; return false; }
    if (g.rest || ++g.still < 3) return false;
    const rigged = g.meshes.some(m => m.isSkinnedMesh); if (rigged && !budget) { g.still = 2; return false; }
    settle(g); return rigged;
  }
  function showAll() { for (const g of groups) { g.epoch++; g.strikes = 0; g.inFr = false; show(g); } }

  function start() {
    if (started) return; const t0 = performance.now();
    for (const root of explicit) if (!known.has(root) && attached(root)) { const ms = meshesOf(root, []); if (ms.length) register([root], ms, true); else known.add(root); }
    explicit.length = 0;
    for (const c of scene.children) discover(c);
    let meshes = 0; for (const g of groups) { g.sig = signature(g); settle(g); meshes += g.meshes.length; }   // everything starts at rest: what is moving wakes at its first check
    started = true;
    console.info('[vis-cull]', groups.length, 'groups,', meshes, 'meshes,', Math.round(performance.now() - t0), 'ms');
  }

  function update(camera) {
    if (!started) return;
    mainCam = camera; frame++; tests.length = 0; inView = 0;
    if (!enabled || gl.isContextLost()) return;
    poll();
    // rest checks: every group about every six frames; new top-level objects once a second (seen twice before use)
    let budget = true;
    for (let k = Math.max(8, Math.ceil(groups.length / 6)); k > 0 && groups.length; k--) { at = (at + 1) % groups.length; if (check(at, budget)) budget = false; }
    const now = performance.now();
    if (now - scanAt > 1000) { scanAt = now; for (const c of scene.children) { if (known.has(c)) continue; if (firstSeen.has(c)) { firstSeen.delete(c); discover(c); } else firstSeen.set(c, 1); } }
    camera.updateMatrixWorld(); const ce = camera.matrixWorld.elements, cx = ce[12], cy = ce[13], cz = ce[14];
    if (!(Math.hypot(cx - lx, cy - ly, cz - lz) < JUMP)) showAll();
    lx = cx; ly = cy; lz = cz;
    _fr.setFromProjectionMatrix(_pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let nv = 0, nh = 0; const n = groups.length, v0 = vAt, h0 = hAt;
    for (let i = 0; i < n; i++) {
      const g = groups[i]; if (!g.rest || !g.occl) continue;
      const r = g.roots[0];
      if (g.hidden && (r.visible !== g.vis || r.position.x !== g.px || r.position.y !== g.py || r.position.z !== g.pz)) { wakeGroup(g); continue; }
      if (!r.visible) continue;
      const b = g.box;
      if (!_fr.intersectsBox(b)) { g.inFr = false; continue; }
      inView++;
      if (!g.inFr) { g.inFr = true; if (g.hidden && Math.hypot(cx - g.rx, cy - g.ry, cz - g.rz) > STALE_MOVE) { g.epoch++; show(g); } }
      const p = g.pad;
      if (cx > b.min.x - p && cx < b.max.x + p && cy > b.min.y - p && cy < b.max.y + p && cz > b.min.z - p && cz < b.max.z + p) { if (g.hidden || g.strikes) { g.epoch++; show(g); } continue; }
      if (g.hidden) { if (nh++ >= h0 && tests.length < HIDDEN_BUDGET) tests.push(g); }
      else if (nv++ >= v0 && tests.length < HIDDEN_BUDGET + VISIBLE_BUDGET && nv - v0 <= VISIBLE_BUDGET) tests.push(g);
    }
    // round robin where a budget ran out: start further along next frame
    vAt = nv > v0 + VISIBLE_BUDGET ? v0 + VISIBLE_BUDGET : 0; hAt = nh > h0 + HIDDEN_BUDGET ? h0 + HIDDEN_BUDGET : 0;
  }

  const api = {
    start, update,
    add(root) { if (!root || known.has(root)) return; if (!started) { explicit.push(root); return; } const ms = meshesOf(root, []); if (ms.length) register([root], ms, true); },
    wake(node) { if (!node) return; let o = node; for (let i = 0; o && i < 40; i++, o = o.parent) { const g = byNode.get(o); if (g) { wakeGroup(g); break; } } node.traverse?.(c => { const g = byNode.get(c); if (g && (g.rest || g.hidden)) wakeGroup(g); }); },
    skipBaked(on) { skipBaked = !!on; },   // a shadow pass that leaves out meshes whose shadow is already in a draw-once map (userData.shadowBaked; a map's sun, gorod-krovi/sun.js)
    exclude(node) { if (!node) return; node.userData.noVisCull = true; node.traverse(c => { const g = byNode.get(c); if (g) { const i = groups.indexOf(g); if (i >= 0) drop(i); } }); },
    stats() { let resting = 0, hidden = 0, hm = 0; for (const g of groups) { resting += +g.rest; if (g.hidden) { hidden++; hm += g.meshes.length; } } return { groups: groups.length, resting, hidden, hiddenMeshes: hm, inView, tested, pending: pq.length - ph, flips }; },
    describe(limit = 40) { return groups.map(g => ({ name: g.roots[0].name || g.roots[0].parent?.name || g.roots[0].type, roots: g.roots.length, meshes: g.meshes.length, rigged: g.meshes.filter(m => m.isSkinnedMesh).length, size: Math.round(diag(g.box)), rest: g.rest, hidden: g.hidden, occl: g.occl })).sort((a, b) => b.meshes - a.meshes).slice(0, limit); },
    get enabled() { return enabled; }, set enabled(v) { enabled = !!v; if (!enabled) { showAll(); dropQueries(); } },
    get groups() { return groups; },
  };
  return api;
}
