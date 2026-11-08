// In-page part fitter for the AW guns (loaded with addScriptTag). window.fit.measure() -> the idle gun in gun space;
// fit.propose(meas, kit) -> mounts; fit.mount(mounts) -> mounted parts; fit.contact() / fit.aimBlock() checks; fit.side() ortho renders.
window.fit = (() => {
  let T; const ready = import('three').then(m => { T = m; });
  const api = () => kino.charms.api, gunObj = () => api().view.gun;
  const PARTS = 'mods/bo3-weapons/parts/aw_attachments.glb?v=6';
  const twOf = g => { let t = null; g.traverse(o => { if (!t && o.isBone && /^tag_weapon(\d|_le)?$/.test(o.name)) t = o; }); return t; };
  function restSpace(g, bone) {
    let sk = null; g.traverse(o => { if (!sk && o.isSkinnedMesh && o.skeleton.bones.includes(bone)) sk = o.skeleton; });
    const t = sk?.bones.findIndex(b => /^tag_weapon(\d|_le)?$/.test(b.name)) ?? -1;
    if (t < 0) return new T.Matrix4();
    return sk.boneInverses[sk.bones.indexOf(bone)].clone().multiply(sk.boneInverses[t].clone().invert());
  }
  const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const isMount = (g, o) => { for (let p = o; p; p = p.parent) if ((g.userData.mounts ?? []).includes(p)) return true; return false; };
  const ARM = /^j_(wrist|elbow|shoulder|clavicle|thumb|index|mid|ring|pinky|palm|wristtwist)|^j_.*_(le|ri)$/;
  let M = null;   // last measure

  // every visible gun triangle in the idle pose, in tag_weapon's live frame, with its dominant bone
  async function measure() {
    await ready; const g = gunObj(); g.updateMatrixWorld(true);
    const tw = twOf(g), inv = tw.matrixWorld.clone().invert(), tris = [], v = new T.Vector3(), meshes = [];
    g.traverse(o => {
      if (!o.isMesh || !shown(o) || isMount(g, o)) return;
      const geo = o.geometry, pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, idx = geo.index;
      const boneOf = i => { if (!si) return o.parent?.name ?? '?'; let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } } return o.skeleton.bones[best]?.name ?? '?'; };
      const cache = new Map(), P = i => { let c = cache.get(i); if (!c) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld).applyMatrix4(inv); c = [v.x, v.y, v.z, boneOf(i)]; cache.set(i, c); } return c; };
      const n = idx ? idx.count : pos.count; let arm = 0, kept = 0;
      for (let k = 0; k < n; k += 3) {
        const a = P(idx ? idx.getX(k) : k), b = P(idx ? idx.getX(k + 1) : k + 1), c = P(idx ? idx.getX(k + 2) : k + 2);
        if (ARM.test(a[3])) { arm++; continue; }
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
        const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx; if (cx * cx + cy * cy + cz * cz < 1e-8) continue;   // collapsed = hidden attachment
        tris.push([a, b, c]); kept++;
      }
      meshes.push([o.name, o.material?.name, kept, arm]);
    });
    const bones = {}; g.traverse(o => { if (o.isBone) { const p = new T.Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(inv); bones[o.name] = [p.x, p.y, p.z]; } });
    { const occ = new Set(); for (const t of tris) { const a = Math.floor(Math.min(t[0][0], t[1][0], t[2][0])), b = Math.floor(Math.max(t[0][0], t[1][0], t[2][0])); for (let x = a; x <= b && x - a < 400; x++) occ.add(x); }
      let lo = 0, hi = 0; const has = x => occ.has(x) || occ.has(x - 1) || occ.has(x + 1) || occ.has(x - 2) || occ.has(x + 2);
      while (has(lo - 1)) lo--; while (has(hi + 1)) hi++;
      const before = tris.length; for (let i = tris.length - 1; i >= 0; i--) { const c = Math.floor((tris[i][0][0] + tris[i][1][0] + tris[i][2][0]) / 3); if (c < lo - 1 || c > hi + 1) tris.splice(i, 1); }
      meshes.push(['body x', lo, hi, before - tris.length]); }
    M = { tris, bones, meshes }; grid(); return { tris: tris.length, meshes, bones: Object.keys(bones).filter(n => /^tag_|^j_(gun|clip|mag)/.test(n)).map(n => n + ' ' + bones[n].map(x => x.toFixed(1)).join(',')) };
  }
  // triangle grid for distances
  function grid() {
    const C = 2, G = new Map(); M.C = C; M.G = G;
    M.tris.forEach((t, i) => { const lo = [0, 1, 2].map(k => Math.floor(Math.min(t[0][k], t[1][k], t[2][k]) / C)), hi = [0, 1, 2].map(k => Math.floor(Math.max(t[0][k], t[1][k], t[2][k]) / C));
      for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) { const key = x + ',' + y + ',' + z; let l = G.get(key); if (!l) G.set(key, l = []); l.push(i); } });
  }
  const tri = () => new T.Triangle(), _t = { t: null, q: null, p: null };
  function dist(x, y, z, r = 1) {   // nearest gun surface within r cells; returns [d, bone]
    _t.t ??= tri(); _t.q ??= new T.Vector3(); _t.p ??= new T.Vector3(); _t.p.set(x, y, z);
    const C = M.C, cx = Math.floor(x / C), cy = Math.floor(y / C), cz = Math.floor(z / C); let best = 1e9, bone = null; const seen = new Set();
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) for (const ti of M.G.get((cx + i) + ',' + (cy + j) + ',' + (cz + k)) ?? []) {
      if (seen.has(ti)) continue; seen.add(ti); const t = M.tris[ti];
      _t.t.set(_t.q.set(...t[0]).clone(), new T.Vector3(...t[1]), new T.Vector3(...t[2])).closestPointToPoint(_t.p, _t.q); const d = _t.q.distanceTo(_t.p); if (d < best) { best = d; bone = t[0][3]; } }
    return [best, bone];
  }
  // points of the gun (triangle corners plus centroids)
  const pts = () => { if (M.pts) return M.pts; const s = []; for (const t of M.tris) { s.push(t[0], t[1], t[2]); s.push([(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3, t[0][3]]); } return M.pts = s; };
  const domBone = (q, rad = 2.5) => { const c = {}; for (const p of pts()) { const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < rad) c[p[3]] = (c[p[3]] || 0) + 1 / (d + .3); } const r = Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]; if (r) return r; let best = null, bd = 1e9; for (const p of pts()) { const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < bd) { bd = d; best = p[3]; } } return best; };

  // features -> mounts. kit: attachment ids the gun lists. Returns {mounts, notes}
  function propose(kit, o = {}) {
    const P = pts(), notes = {}, mounts = {};
    let xmin = 1e9, xmax = -1e9; for (const p of P) { if (p[0] < xmin) xmin = p[0]; if (p[0] > xmax) xmax = p[0]; }
    const fl = M.bones.tag_flash ?? [xmax, 0, 0];
    // muzzle: points near the flash axis, at the front
    const ax = o.axis ?? [fl[1], fl[2]];
    const near = P.filter(p => Math.hypot(p[1] - ax[0], p[2] - ax[1]) < (o.axisR ?? 2.2) && p[0] > Math.min(fl[0], xmax) - 20);
    let tipX = -1e9; for (const p of near) tipX = Math.max(tipX, p[0]);
    const sl = near.filter(p => p[0] > tipX - (o.tipLen ?? 1.2));
    const ylo = Math.min(...sl.map(p => p[1])), yhi = Math.max(...sl.map(p => p[1])), zlo = Math.min(...sl.map(p => p[2])), zhi = Math.max(...sl.map(p => p[2]));
    const cy = (ylo + yhi) / 2, cz = (zlo + zhi) / 2, rad = Math.min(o.maxRad ?? (o.cls === 'Pistol' ? .85 : 9), Math.max(yhi - ylo, zhi - zlo) / 2);
    notes.muzzle = { tipX: +tipX.toFixed(2), cy: +cy.toFixed(2), cz: +cz.toFixed(2), rad: +rad.toFixed(2), flash: fl.map(x => +x.toFixed(2)) };
    const s = +(o.muzzleScale ?? Math.max(.5, rad / .96)).toFixed(2);
    const mz = [+tipX.toFixed(2), +cy.toFixed(2), +cz.toFixed(2)];
    if (kit.includes('aws_silencer')) mounts.aws_silencer = { part: 'silencer', tag: domBone([tipX - 1, cy, cz]), at: mz, scale: [+(Math.min(1.3, s)).toFixed(2), s, s] };
    if (kit.includes('aws_brake')) mounts.aws_brake = { part: 'brake', tag: domBone([tipX - 1, cy, cz]), at: mz, scale: s };
    // side profile per 1-unit slice: left-most y and its z
    const slice = new Map(); for (const p of P) { const k = Math.floor(p[0]); let s2 = slice.get(k); if (!s2) slice.set(k, s2 = []); s2.push(p); }
    const at = x => slice.get(Math.floor(x)) ?? [];
    let xh = tipX; { for (let x = Math.floor(tipX); x > xmin; x--) { const w = Math.max(0, ...at(x).map(p => Math.abs(p[1] - cy))); if (w > rad + (o.hgPad ?? .7)) { xh = x + 1; break; } } }
    notes.handguard = xh;
    // laser / tracker on the left side: span [x0-.5, x0+8.8]
    if (kit.includes('aws_tracker') || kit.includes('aws_laser')) {
      if (o.cls === 'Pistol' || o.laserUnder) {   // under the frame's front, hanging (part z -3.3..0)
        const x0 = o.laserX ?? (tipX - 9.3); let z = 1e9; for (const p of P) if (p[0] > x0 - .5 && p[0] < x0 + 8.8 && Math.abs(p[1]) < 1.45) z = Math.min(z, p[2]);
        const m = { part: 'laser_tracker', tag: domBone([x0 + 4, 0, z + .5]), at: [+x0.toFixed(2), 0, +(z + .05).toFixed(2)] };
        if (kit.includes('aws_tracker')) mounts.aws_tracker = m; if (kit.includes('aws_laser')) mounts.aws_laser = { ...m, part: 'laser_sight' }; notes.laser = { x0, z, under: true };
      } else {
      const x0 = o.laserX ?? (xh - (o.laserBack ?? 9.6));
      let band = o.laserZ;   // z of the side's widest point in the middle slice
      if (band == null) { const mid = at(x0 + 4); const top = mid.reduce((a, p) => p[1] > a[1] ? p : a, [0, -1e9, 0]); band = top[1] > -1e8 ? top[2] : cz; }
      let y = -1e9; for (let x = x0 - .5; x <= x0 + 9; x += .5) for (const p of at(x)) if (Math.abs(p[2] - band) < 1.5 && p[0] >= x0 - .5 && p[0] <= x0 + 8.8) y = Math.max(y, p[1]);
      const m = { part: 'laser_tracker', tag: domBone([x0 + 4, y - .5, band]), at: [+x0.toFixed(2), +(y - .05).toFixed(2), +band.toFixed(2)], rot: [90, 0, 0] };
      if (kit.includes('aws_tracker')) mounts.aws_tracker = m; if (kit.includes('aws_laser')) mounts.aws_laser = { ...m, part: 'laser_sight' };
      notes.laser = { x0, band, y };
    } }
    if (kit.includes('aws_foregrip')) {
      const x0 = o.gripX ?? (xh - (o.gripBack ?? 6));
      let z = 1e9; for (const p of P) if (p[0] > x0 - 3.2 && p[0] < x0 + 4.1 && Math.abs(p[1]) < 1.72) z = Math.min(z, p[2]);
      mounts.aws_foregrip = { part: 'foregrip', tag: domBone([x0, 0, z + .5]), at: [+x0.toFixed(2), 0, +(z + .05).toFixed(2)] };
      notes.grip = { x0, z };
    }
    if (kit.includes('aws_stabilizer')) {
      const x0 = o.stabX ?? (xmin + 9);
      let z = -1e9, w = 0; for (const p of P) if (p[0] > x0 - 8 && p[0] < x0 + 8 && Math.abs(p[1]) < 2.6) z = Math.max(z, p[2]);
      for (const p of P) if (p[0] > x0 - 7.6 && p[0] < x0 + 7.6 && p[2] > z - 2.4) w = Math.max(w, Math.abs(p[1]));
      const sy = w > 2.55 ? +((w + .1) / 2.6).toFixed(2) : 1;
      mounts.aws_stabilizer = { part: 'stabilizer', tag: domBone([x0, 0, z - .5]), at: [+x0.toFixed(2), 0, +(z - .02).toFixed(2)], ...(sy !== 1 ? { scale: [1, sy, 1] } : {}) };
      notes.stab = { x0, z, w, xmin };
    }
    for (const m of Object.values(mounts)) m.at = live2rest(m.tag, m.at);
    return { mounts, notes, xmin: +xmin.toFixed(1), xmax: +xmax.toFixed(1) };
  }
  // a point in tag_weapon's live frame -> `at` for a part on `tag` (mounts.js places through the rest pose)
  function live2rest(tag, q) {
    const g = gunObj(), b = g.getObjectByName(tag), tw = twOf(g); if (!b || b === tw) return q;
    const m = b.matrixWorld.clone().multiply(restSpace(g, b)).invert().multiply(tw.matrixWorld);
    const r = new T.Vector3(...q).applyMatrix4(m); return [r.x, r.y, r.z].map(x => +x.toFixed(2));
  }
  function rest2live(tag, at) {   // inverse of live2rest
    const g = gunObj(), b = g.getObjectByName(tag), tw = twOf(g); if (!b || b === tw) return at;
    const m = tw.matrixWorld.clone().invert().multiply(b.matrixWorld).multiply(restSpace(g, b));
    const r = new T.Vector3(...at).applyMatrix4(m); return [r.x, r.y, r.z];
  }
  async function mount(mounts, mirror = false) {
    await ready; const g = gunObj(), def = kino.mods.api.session.def;
    const { mountParts } = await import('/mods/weapon-levels/mounts.js');
    const full = {}; for (const [k, m] of Object.entries(mounts)) full[k] = { ...m, model: PARTS, node: 'part_' + m.part };
    await mountParts(g, { ...def, mounts: full }, Object.keys(full), () => true, { mirror });
    g.updateMatrixWorld(true); return (g.userData.mounts ?? []).length;
  }
  // contact: each primitive of each part (sampled) must come within .3 of the gun or of a held piece
  function contact() {
    const g = gunObj(); g.updateMatrixWorld(true); const inv = twOf(g).matrixWorld.clone().invert(), out = [];
    for (const part of g.userData.mounts ?? []) {
      const pieces = []; const v = new T.Vector3();
      part.traverse(o => { if (!o.isMesh) return; const pos = o.geometry.attributes.position, idx = o.geometry.index, s = [];
        const n = idx ? idx.count : pos.count, get = i => v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv).toArray();
        for (let k = 0; k < n; k += 3) { const a = get(idx ? idx.getX(k) : k), b = get(idx ? idx.getX(k + 1) : k + 1), c = get(idx ? idx.getX(k + 2) : k + 2);
          s.push(a, b, c); for (const [u, w] of [[.5, .5], [.5, 0], [0, .5]]) s.push([0, 1, 2].map(j => a[j] + (b[j] - a[j]) * u + (c[j] - a[j]) * w)); }
        pieces.push({ name: o.material?.name, s }); });
      let min = 1e9; const held = pieces.map(pc => { let m = 1e9; for (const p of pc.s) m = Math.min(m, dist(p[0], p[1], p[2])[0]); min = Math.min(min, m); return m < .3; });
      for (let pass = 0; pass < 4; pass++) pieces.forEach((pc, i) => { if (held[i]) return; for (let j = 0; j < pieces.length && !held[i]; j++) if (held[j]) for (const a of pc.s) { const bb = pieces[j].bb ??= [0, 1, 2].map(k => [Math.min(...pieces[j].s.map(q => q[k])) - .3, Math.max(...pieces[j].s.map(q => q[k])) + .3]); if (bb.every((r, k) => a[k] >= r[0] && a[k] <= r[1])) { held[i] = true; break; } } });
      out.push({ part: part.name, near: +min.toFixed(2), loose: pieces.filter((p, i) => !held[i]).map(p => p.name) });
    }
    return out;
  }
  // at full ADS: does any mounted triangle cover the screen centre?
  function aimBlock() {
    const g = gunObj(), cam = api().viewCamera ?? kino.mods.api.viewCamera; g.updateMatrixWorld(true); cam.updateMatrixWorld(true);
    const hits = []; const v = [new T.Vector3(), new T.Vector3(), new T.Vector3()], c = new T.Vector3();
    for (const part of g.userData.mounts ?? []) part.traverse(o => { if (!o.isMesh || /beam/.test(o.material?.name ?? '')) return; const pos = o.geometry.attributes.position, idx = o.geometry.index, n = idx ? idx.count : pos.count;
      for (let k = 0; k < n; k += 3) { let behind = false;
        for (let j = 0; j < 3; j++) { v[j].fromBufferAttribute(pos, idx ? idx.getX(k + j) : k + j).applyMatrix4(o.matrixWorld); c.copy(v[j]).applyMatrix4(cam.matrixWorldInverse); if (c.z > -.01) behind = true; v[j].project(cam); }
        if (behind) continue; const s = (a, b) => (b.x - a.x) * (0 - a.y) - (b.y - a.y) * (0 - a.x), d1 = s(v[0], v[1]), d2 = s(v[1], v[2]), d3 = s(v[2], v[0]);
        if ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)) { hits.push(part.name); return; } } });
    return [...new Set(hits)];
  }
  // ortho views of the gun alone (arms hidden), as data URLs: left side, top, bottom
  function side(views = ['left', 'top', 'front'], size = 480, focus = null, fh = 10) {
    const g = gunObj(), r = kino.mods.api.renderer, scene = api().viewScene ?? kino.mods.api.viewScene; g.updateMatrixWorld(true);
    const tw = twOf(g), keep = new Set(); g.traverse(o => keep.add(o));
    const hidden = []; scene.traverse(o => { if (o.isMesh && o.visible && (!keep.has(o) || (o.isSkinnedMesh && [...(o.skeleton?.bones ?? [])].some(b => ARM.test(b.name)) && !o.skeleton.bones.some(b => /^tag_weapon/.test(b.name))))) { o.visible = false; hidden.push(o); } });
    const P = M ? pts() : [[0, 0, 0]]; let lo = 1e9, hi = -1e9; for (const p of P) { lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]); } lo -= 3; hi += 22; const mid = (lo + hi) / 2, half = (hi - lo) / 2;
    const out = {}, size0 = r.getSize(new T.Vector2()), pr = r.getPixelRatio(), bg = r.getClearColor(new T.Color()), ba = r.getClearAlpha();
    r.setPixelRatio(1); r.setSize(size, size * .5, false); r.setClearColor(0x506070, 1);
    for (const view of views) {
      const cam = new T.OrthographicCamera(-half, half, half * .5, -half * .5, .1, 400);
      const dir = { left: [0, 1, 0], top: [0, 0, 1], front: [1, 0, 0], right: [0, -1, 0], bottom: [0, 0, -1] }[view], up = view === 'top' || view === 'bottom' ? [0, 1, 0] : [0, 0, 1];
      const cx = view === 'front' ? 0 : mid, eye = new T.Vector3(cx + dir[0] * 150, dir[1] * 150, dir[2] * 150), tgt = new T.Vector3(cx, 0, 0);
      if (focus) { cam.left = -fh; cam.right = fh; cam.top = fh / 2; cam.bottom = -fh / 2; cam.updateProjectionMatrix(); const f = new T.Vector3(...focus); tgt.copy(f); eye.copy(f).add(new T.Vector3(...dir).multiplyScalar(150)); if (view === 'front') eye.copy(f).add(new T.Vector3(150, 0, 0)); }
      else if (view === 'front') { cam.left = -16; cam.right = 16; cam.top = 8; cam.bottom = -8; cam.updateProjectionMatrix(); eye.set(hi + 150, 0, 3); tgt.set(0, 0, 3); }
      const m = tw.matrixWorld; eye.applyMatrix4(m); tgt.applyMatrix4(m); cam.position.copy(eye); cam.up.set(...up).transformDirection(m); cam.lookAt(tgt); cam.updateMatrixWorld(true);
      r.setRenderTarget(null); r.clear(); r.render(scene, cam); out[view] = r.domElement.toDataURL('image/jpeg', .85);
    }
    r.setPixelRatio(pr); r.setSize(size0.x, size0.y, false); r.setClearColor(bg, ba);
    for (const o of hidden) o.visible = true; return out;
  }
  return { measure, propose, mount, rest2live, contact, aimBlock, side, live2rest, get M() { return M; }, dist: (...a) => dist(...a) };
})();
