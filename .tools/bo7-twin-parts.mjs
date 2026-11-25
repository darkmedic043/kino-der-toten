// The fork's own BO7 guns wear the ripped models now (bo7-rips twins: docs/fork/weapons.md, BO7 rebuilt), but their
// attachments are the user's own Blender parts (mods/bo7-weapons/<gun>_view.glb, surf_tag_<part>, one bone each). This
// lifts those parts out of the Blender gun, fits each onto the rip (scaled about an anchor point of the part and moved
// to a point of the rip: its tag_flash, tag_reflex, mag, grip, stock...) and writes one plain GLB of nodes per gun,
// mods/bo7-weapons/<gun>_twin.glb, with <gun>_twin.json: def.mounts {attachment: {model, tag, node, at}} for
// weapon-levels/mounts.js (node path: the part's vertices are already in the bone's own space).
//   node .tools/bo7-twin-parts.mjs [gun ...]        (grimhawk siren havoc roc xm325; all by default)
//   PRINT=1 also lists each fitted part's box in the rip's gun space (x forward, y left, z up)
// Reads the rip's view model for its bone positions only (bo7-rips models are git-ignored; nothing of it is written).
// Rerun after a Blender gun or a rip is rebuilt.
import fs from 'fs';
import crypto from 'crypto';
import * as THREE from 'three';

const WEB = new URL('../export/web/', import.meta.url).pathname;
const OUT = WEB + 'mods/bo7-weapons/';

// ---- GLB in/out ---------------------------------------------------------------------------------------------------
function readGlb(f) {
  const b = fs.readFileSync(f), jl = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + jl).toString());
  return { j, bin: b.subarray(20 + jl + 8) };
}
const NC = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }, NT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function acc({ j, bin }, i) {
  const a = j.accessors[i], v = j.bufferViews[a.bufferView], n = NT[a.type], cs = NC[a.componentType], st = v.byteStride || n * cs;
  const off = (v.byteOffset || 0) + (a.byteOffset || 0), out = new Float64Array(a.count * n);
  const rd = { 5126: o => bin.readFloatLE(o), 5125: o => bin.readUInt32LE(o), 5123: o => bin.readUInt16LE(o), 5121: o => bin.readUInt8(o), 5122: o => bin.readInt16LE(o), 5120: o => bin.readInt8(o) }[a.componentType];
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
    let x = rd(off + k * st + c * cs);
    if (a.normalized) x /= a.componentType === 5121 ? 255 : a.componentType === 5123 ? 65535 : 1;
    out[k * n + c] = x;
  }
  return out;
}
function worlds(j) {
  const W = [], par = {};
  j.nodes.forEach((n, i) => (n.children || []).forEach(c => (par[c] = i)));
  const loc = i => { const n = j.nodes[i]; if (n.matrix) return new THREE.Matrix4().fromArray(n.matrix);
    return new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1]))); };
  const get = i => (W[i] ??= par[i] != null ? get(par[i]).clone().multiply(loc(i)) : loc(i));
  j.nodes.forEach((_, i) => get(i));
  return { W, par };
}
// a skinned model: each joint's inverse bind matrix (bind space -> bone space)
function ibms(G) {
  const sk = G.j.skins[0], d = acc(G, sk.inverseBindMatrices), out = new Map();
  sk.joints.forEach((ji, k) => out.set(G.j.nodes[ji].name, new THREE.Matrix4().fromArray(d.subarray(k * 16, k * 16 + 16))));
  return out;
}

// ---- the rip: bone points and part boxes in j_gun space ----------------------------------------------------------
function ripInfo(g) {
  const G = readGlb(`${WEB}mods/bo7-rips/models/bo7_${g}_view.glb`), { j } = G, { W, par } = worlds(j), I = ibms(G);
  const toGun = I.get('j_gun'), gunBind = toGun.clone().invert();
  const bone = n => I.has(n) ? toGun.clone().multiply(I.get(n).clone().invert()) : null;   // a bone's bind pose in j_gun space
  const pt = n => { const m = bone(n); return m ? new THREE.Vector3().setFromMatrixPosition(m) : null; };
  const sk = j.skins[0], heads = sk.joints.map(ji => { let i = ji; while (i != null) { const nm = j.nodes[i].name; if (nm.startsWith('b7_')) return nm.split('__')[0]; i = par[i]; } return 'rec'; });
  const box = {}, bbox = {};
  j.nodes.forEach((n, ni) => {
    if (n.mesh == null) return;
    for (const p of j.meshes[n.mesh].primitives) {
      const P = acc(G, p.attributes.POSITION), J = acc(G, p.attributes.JOINTS_0), Wt = acc(G, p.attributes.WEIGHTS_0), v = new THREE.Vector3();
      for (let k = 0; k < P.length / 3; k++) {
        let best = 0; for (let c = 1; c < 4; c++) if (Wt[k * 4 + c] > Wt[k * 4 + best]) best = c;
        v.set(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]).applyMatrix4(W[ni]).applyMatrix4(toGun);
        (box[heads[J[k * 4 + best]]] ??= new THREE.Box3()).expandByPoint(v);
        (bbox[sk.joints[J[k * 4 + best]]] ??= new THREE.Box3()).expandByPoint(v);
      }
    }
  });
  // the magazine itself (the mag head also holds its well): what the mag bone moves
  const byName = n => { const i = j.nodes.findIndex(x => x.name === n); return bbox[i]; };
  box.magBody = byName('b7_base_mag__j_mag1') ?? byName('j_mag1') ?? box.b7_base_mag;
  return { pt, bone, box, gunBind };
}

// ---- the Blender gun: each surf_tag_<part> in CoD gun space --------------------------------------------------------
function blenderInfo(gun) {
  const G = readGlb(`${OUT}${gun}_view.glb`), { j } = G, { W } = worlds(j), I = ibms(G), toGun = I.get('j_gun');
  const surf = {};
  j.nodes.forEach((n, ni) => {
    if (n.mesh == null || !n.name.startsWith('surf_tag_')) return;
    const id = n.name.slice(9), m = toGun.clone().multiply(W[ni]), prims = [], b = new THREE.Box3(), v = new THREE.Vector3();
    for (const p of j.meshes[n.mesh].primitives) {
      const P = acc(G, p.attributes.POSITION), N = acc(G, p.attributes.NORMAL), UV = p.attributes.TEXCOORD_0 != null ? acc(G, p.attributes.TEXCOORD_0) : null;
      const idx = p.indices != null ? acc(G, p.indices) : Float64Array.from({ length: P.length / 3 }, (_, i) => i);
      const pos = new Float32Array(P.length), nor = new Float32Array(N.length), nm = new THREE.Matrix3().getNormalMatrix(m), nv = new THREE.Vector3();
      for (let k = 0; k < P.length / 3; k++) {
        v.set(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]).applyMatrix4(m); pos.set([v.x, v.y, v.z], k * 3);
        nv.set(N[k * 3], N[k * 3 + 1], N[k * 3 + 2]).applyMatrix3(nm).normalize(); nor.set([nv.x, nv.y, nv.z], k * 3);
      }
      for (const i of idx) b.expandByPoint(v.fromArray(pos, i * 3));
      prims.push({ pos, nor, uv: UV && Float32Array.from(UV), idx: Uint32Array.from(idx), material: p.material });
    }
    surf[id] = { prims, box: b };
  });
  const pt = n => I.has(n) ? new THREE.Vector3().setFromMatrixPosition(toGun.clone().multiply(I.get(n).clone().invert())) : null;
  return { G, surf, pt };
}

// ---- fits --------------------------------------------------------------------------------------------------------
// A part's fit: p' = to + s * (p - from) (s a number or [x, y, z]), then into the bone's space. from/to are points or
// functions of (b = Blender gun, r = rip). Each gun's list: [attachment id, surf names, fit]; a fit may name its bone
// (j_mag1: the mag, so it follows the reload).
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const top = bx => V((bx.min.x + bx.max.x) / 2, (bx.min.y + bx.max.y) / 2, bx.max.z);
const bottom = bx => V((bx.min.x + bx.max.x) / 2, (bx.min.y + bx.max.y) / 2, bx.min.z);
const front = bx => V(bx.max.x, (bx.min.y + bx.max.y) / 2, (bx.min.z + bx.max.z) / 2);
const back = bx => V(bx.min.x, (bx.min.y + bx.max.y) / 2, (bx.min.z + bx.max.z) / 2);
const add = (p, x = 0, y = 0, z = 0) => p.clone().add(V(x, y, z));
// muzzle: the Blender gun's flash onto the rip's
// (the Blender guns' tag_flash binds are a template's, not their barrels' ends: each gun's muzzle point is given)
const muzzle = (at, s = 1, dx = 0, dz = 0) => ({ from: () => at, to: r => add(r.pt('tag_flash'), dx, 0, dz), s });
const GH_MZ = V(30.2, 0, 2.4), SR_MZ = V(22.2, 0, 2.2), HV_MZ = V(20, 0, 2), RO_MZ = V(30.6, 0, 2.2), XM_MZ = V(27.3, 0, 2.19);
// optic: the base's centre onto the rip's optic rail (tag_reflex)
const optic = (s = 1.15, dx = 0, dz = 0) => ({ from: (b, sf) => bottom(sf.box), to: r => add(r.pt('tag_reflex'), dx, 0, dz), s });
// mag: the Blender gun's own mag's top onto the rip's mag head's top; scaled to the rip mag's height, on j_mag1
const mag = (o = {}) => ({ bone: 'j_mag1', from: b => top(b.surf[o.ref ?? 'clip'].box), to: r => add(top(r.box.magBody ?? r.box.rec), o.dx ?? 0, 0, o.dz ?? 0),
  s: o.s ?? ((b, r) => { const B = b.surf[o.ref ?? 'clip'].box, R = r.box.magBody; if (!R) return 1; const c = x => Math.min(1.6, Math.max(.7, x)), k = c((R.max.z - R.min.z) / (B.max.z - B.min.z)); return [k, c((R.max.y - R.min.y) / (B.max.y - B.min.y) * 1.15), k]; }) });
const under = (s = 1.1) => ({ from: b => top(b.surf.foregrip.box), to: r => r.pt('tag_grip_attach'), s });
const laser = (o = {}) => ({ from: b => { const bx = b.surf.laser_box.box; return V((bx.min.x + bx.max.x) / 2, bx.max.y, (bx.min.z + bx.max.z) / 2); },
  to: r => add(r.pt(o.tag ?? 'tag_laser_attach'), o.dx ?? 0, o.dy ?? 0, o.dz ?? 0), s: o.s ?? 1.1 });
// grip: the Blender gun's own grip's top onto the rip's grip head's top (scaled to its height)
const grip = (ref, o = {}) => ({ from: b => top(b.surf[ref].box), to: r => add(top(r.box.b7_base_grip), o.dx ?? 0, 0, o.dz ?? 0),
  s: o.s ?? ((b, r) => { const B = b.surf[ref].box, R = r.box.b7_base_grip; const k = (R.max.z - R.min.z) / (B.max.z - B.min.z); return [k, Math.max(k, 1.2), k]; }) });

const GUNS = {
  grimhawk: { rip: 'atria', parts: [
    ['gh_rangefinder', ['gh_rangefinder'], optic(1, 0, -.6)],
    ['gh_hawkeye', ['gh_hawkeye'], optic(1.1)],
    ['gh_expanse', ['gh_expanse'], mag()],
    ['extmag', ['ext_clip'], mag()],
    ['dualmag', ['double_clip'], mag()],
    ['gh_longbarrel', ['gh_longbarrel'], muzzle(GH_MZ, 1.15)],
    ['suppressor', ['suppressor'], muzzle(V(27.4, 0, 2.4), 1.25, -1.5)],
    ['grip', ['foregrip'], under()],
    ['laser', ['laser_box'], laser()],
  ] },
  siren: { rip: 'sargas', parts: [
    ['sr_tuningfork', ['sr_reflex'], optic(1.15)],
    // sargas: the drum sits inside the mag housing, which stays (it is the well); a box mag hangs below it
    ['sr_deflect', ['sr_deflect'], mag({ dz: -1.9 })],
    ['sr_overclock', ['sr_overclock'], mag({ dz: -1.9 })],
    ['extmag', ['ext_clip'], mag({ dz: -1.9 })],
    ['dualmag', ['double_clip'], mag({ dz: -1.9 })],
    ['sr_resonance', ['sr_resonance'], muzzle(V(17.9, 0, 2.2), 1.2, -.1)],
    ['sr_baffle', ['sr_baffle'], muzzle(SR_MZ, 1.35, -.3)],
    ['sr_echo', ['sr_echo'], { from: b => V(16.7, 1.7, 2.2), to: r => V(-2, r.box.rec.max.y, .5), s: 1.1 }],
    // sargas' b7_base_grip is the whole thumbhole stock: the grip wraps the pistol grip, the stock stays
    ['sr_lancet', ['sr_lancet'], { from: b => top(b.surf.sr_grip.box), to: () => V(-9.5, 0, -.3), s: .95, rake: 2 }],
    ['sr_soma', ['sr_soma'], { from: b => top(b.surf.sr_grip.box), to: () => V(-9.5, 0, -.3), s: .95, rake: 2 }],
    ['grip', ['foregrip'], under()],
    ['laser', ['laser_box'], laser()],
  ] },
  havoc: { rip: 'nembus', parts: [
    ['hv_ballistic', ['hv_ballistic'], optic(1.1)],
    ['hv_prox', ['hv_prox'], muzzle(HV_MZ, 1.1)],
    ['hv_daisy', ['hv_daisy'], muzzle(HV_MZ, 1.1)],
    ['hv_kinetic', ['hv_kinetic'], muzzle(HV_MZ, 1.05)],
    ['hv_mortar', ['hv_mortar'], muzzle(HV_MZ, 1.05)],
    ...['hv_napalm', 'hv_cryo', 'hv_arc', 'hv_cluster', 'hv_singularity'].map(id => [id, [id], { from: b => V(-.95, 1.36, -1.3), to: r => V(-1, r.box.rec.max.y - .2, -.6), s: 1.1 }]),
    ['hv_dash', ['hv_dash'], grip('hv_grip')],
    ['hv_actuator', ['hv_actuator'], grip('hv_grip')],
    ['hv_extube', ['hv_extube'], { from: b => V(19, 0, -1), to: r => V(r.box.rec.max.x - 4, 0, -1.6), s: 1.1 }],
    ['hv_airstrike', ['hv_airstrike'], { from: b => V(19, 0, -1), to: r => V(r.box.rec.max.x - 4, 0, -1.6), s: 1.1 }],
    ['hv_tripwire', ['hv_tripwire'], { from: b => V(17.4, 0, .2), to: r => V(6.4, 0, -2.6), s: 1.1 }],
    ['hv_bandolier', ['hv_bandolier'], { from: b => V(-13.2, .72, 1.2), to: r => V(-11, r.box.rec.max.y - .3, -.8), s: 1.1 }],
    ['hv_breacher', ['hv_breacher'], { from: b => V(-15.4, 0, 0), to: r => V(r.box.rec.min.x + 2.5, 0, -1.8), s: 1.1 }],
    ['laser', ['laser_box'], laser({ tag: 'tag_laser' })],
  ] },
  roc: { rip: 'carina', parts: [
    ['ro_gunner', ['ro_gunner'], optic(1.15)],
    ['ro_reflex', ['ro_reflex'], optic(1.2)],
    ['ro_concuss', ['ro_concuss'], muzzle(RO_MZ, 1.3, -3.4)],
    ['ro_hush', ['ro_hush'], muzzle(RO_MZ, 1.3, -3.4)],
    ['ro_tungsten', ['ro_tungsten'], { from: () => V(30.2, 0, 2.1), to: r => add(r.pt('tag_flash'), -.2), s: [1.6, 1.65, 1.65] }],
    ['ro_mfs', ['ro_mfs'], mag()],
    ['extmag', ['ext_clip'], mag()],
    ['dualmag', ['double_clip'], mag()],
    ['ro_damper', ['ro_damper'], grip('ro_grip')],
    ['ro_snap', ['ro_snap'], grip('ro_grip')],
    ['ro_buffer', ['ro_buffer'], { from: b => front(b.surf.ro_stock.box), to: r => front(r.box.b7_base_stock), s: 1.2 }],
    ['ro_kick', ['ro_kick'], { from: b => front(b.surf.ro_stock.box), to: r => front(r.box.b7_base_stock), s: 1.2 }],
    ['ro_bipod', ['ro_bipod'], { from: b => V(14.4, 0, 0), to: r => V(12, 0, -2.7), s: 1.2 }],
    ...['ro_he', 'ro_sabot', 'ro_thermite', 'ro_flak', 'ro_shock', 'ro_canister', 'ro_mark'].map(id => [id, [id], { from: b => V(-.8, .9, 2.15), to: r => V(-3, r.box.rec.max.y - .2, .6), s: 1.2 }]),
    ['grip', ['foregrip'], { from: b => top(b.surf.foregrip.box), to: r => V(14, 0, -2.5), s: 1.2 }],
    ['laser', ['laser_box'], laser({ tag: 'tag_flash', dx: -20, dy: -1.8, dz: -.2 })],
  ] },
  xm325: { rip: 'zeus', parts: [
    ['xm_comp', ['xm_comp'], muzzle(XM_MZ, 1.2, -1.5)],
    ['xm_sup', ['xm_sup'], muzzle(XM_MZ, 1.3, -1.5)],
    ...['xm_chief', 'xm_fractal', 'xm_cryo'].map(id => [id, [id, 'xm_muzzle'], { from: b => V(9, 0, 2.19), to: r => add(back(r.box.b7_base_barrel), 0, 0, 0), s: (b, r) => { const k = (r.pt('tag_flash').x - r.box.b7_base_barrel.min.x) / (29.47 - 9); return [k, 1.5, 1.5]; } }]),
    ['xm_leyden', ['xm_leyden'], mag({ ref: 'clip' })],
    ['xm_fastbelt', ['xm_fastbelt'], mag({ ref: 'clip' })],
    ['xm_extbelt', ['xm_extbelt'], mag({ ref: 'clip' })],
    ['xm_titan', ['xm_titan'], mag({ ref: 'clip' })],
    ['xm_vas', ['xm_vas'], { from: b => top(b.surf.xm_vas.box), to: r => r.pt('tag_grip_attach'), s: 1.15 }],
    ['xm_reflex', ['xm_reflex'], optic(1.15)],
    ['xm_lucius', ['xm_lucius'], grip('xm_grip')],
    ['xm_aegis', ['xm_aegis'], { from: b => front(b.surf.xm_aegis.box), to: r => add(front(r.box.b7_base_stock), -.8), s: [1.15, 1.15, .8] }],   // zeus' stock is lower than the Blender one
    ['xm_mfs', ['xm_mfs'], { from: b => V(17.9, 1, 1.25), to: r => { const p = r.pt('tag_laser_attach'); return V(p.x, -p.y, p.z); }, s: 1.1 }],
  ] },
};

// ---- build -------------------------------------------------------------------------------------------------------
function build(gun) {
  const spec = GUNS[gun], b = blenderInfo(gun), r = ripInfo(spec.rip), Bj = b.G.j;
  const val = (x, ...a) => typeof x === "function" ? x(...a) : x;
  // the output, grown as parts are added
  const bins = [], views = [], accessors = [], meshes = [], nodes = [], matMap = new Map(), materials = [];
  let off = 0;
  const pushView = (buf, target) => { const pad = (4 - (off % 4)) % 4; if (pad) { bins.push(Buffer.alloc(pad)); off += pad; }
    views.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(target ? { target } : {}) }); bins.push(buf); off += buf.length; return views.length - 1; };
  const pushAcc = (arr, type, ct, target, minmax) => {
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), a = { bufferView: pushView(buf, target), componentType: ct, count: arr.length / NT[type], type };
    if (minmax) { const n = NT[type], mn = Array(n).fill(Infinity), mx = Array(n).fill(-Infinity); for (let i = 0; i < arr.length; i++) { mn[i % n] = Math.min(mn[i % n], arr[i]); mx[i % n] = Math.max(mx[i % n], arr[i]); } Object.assign(a, { min: mn, max: mx }); }
    accessors.push(a); return accessors.length - 1;
  };
  // materials: copied; lenses are glass the scopes mod knows (it centres the sight on 'reflex_lens' and patches glass
  // only at equip, before mounted parts arrive), the dot cards go (it draws the dot), a laser part's red is its beam
  const material = (mi, partId) => {
    const src = Bj.materials[mi], name = src.name;
    if (/_dot$/.test(name)) return -1;
    const laser = partId === 'laser' && /_red$/.test(name), key = laser ? mi + ':laser' : mi;
    if (matMap.has(key)) return matMap.get(key);
    const m = structuredClone(src);
    if (/_lens$/.test(name)) { m.name = 'reflex_lens ' + name; m.alphaMode = 'BLEND'; m.pbrMetallicRoughness = { ...m.pbrMetallicRoughness, baseColorFactor: [.55, .7, .75, .1] }; delete m.emissiveFactor; }
    if (laser) m.name = name + ' emit_beam_red';
    materials.push(m); matMap.set(key, materials.length - 1); return materials.length - 1;
  };
  const mounts = {}, report = [];
  for (const [id, surfs, fit] of spec.parts) {
    const main = b.surf[surfs[0]]; if (!main) { console.warn(`[${gun}] no surf_tag_${surfs[0]}`); continue; }
    const from = val(fit.from, b, main), to = val(fit.to, r), s0 = val(fit.s ?? 1, b, r), s = Array.isArray(s0) ? V(...s0) : V(s0, s0, s0);
    const rake = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), (fit.rake ?? 0) * Math.PI / 180);   // degrees about y, about `from`: + tips the bottom back
    const boneName = fit.bone ?? 'j_gun', toBone = r.bone(boneName).clone().invert();
    const prims = [], box = new THREE.Box3(), v = new THREE.Vector3(), nv = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(toBone);
    for (const sn of surfs) for (const p of b.surf[sn]?.prims ?? []) {
      const mi = material(p.material, id); if (mi < 0) continue;
      const pos = new Float32Array(p.pos.length), nor = new Float32Array(p.nor.length);
      for (let k = 0; k < p.pos.length / 3; k++) {
        v.fromArray(p.pos, k * 3).sub(from).multiply(s).applyQuaternion(rake).add(to); box.expandByPoint(v); v.applyMatrix4(toBone); v.toArray(pos, k * 3);
        nv.fromArray(p.nor, k * 3).divide(s).applyQuaternion(rake).applyMatrix3(nm).normalize(); nv.toArray(nor, k * 3);
      }
      // only the vertices this primitive's indices use
      const used = [...new Set(p.idx)].sort((a, c) => a - c), remap = new Map(used.map((o, i) => [o, i]));
      const pick = (arr, n) => { const o = new Float32Array(used.length * n); used.forEach((u, i) => o.set(arr.subarray(u * n, u * n + n), i * n)); return o; };
      const attributes = { POSITION: pushAcc(pick(pos, 3), 'VEC3', 5126, 34962, true), NORMAL: pushAcc(pick(nor, 3), 'VEC3', 5126, 34962) };
      if (p.uv) attributes.TEXCOORD_0 = pushAcc(pick(p.uv, 2), 'VEC2', 5126, 34962);
      prims.push({ attributes, indices: pushAcc(Uint32Array.from(p.idx, i => remap.get(i)), 'SCALAR', 5125, 34963), material: mi, mode: 4 });
    }
    meshes.push({ name: id, primitives: prims }); nodes.push({ name: id, mesh: meshes.length - 1 });
    mounts[id] = { model: `${gun}_twin.glb`, tag: boneName, node: id, at: [0, 0, 0] };
    report.push(`${id.padEnd(16)} ${boneName.padEnd(6)} ${box.min.toArray().map(x => x.toFixed(1)).join(',')} .. ${box.max.toArray().map(x => x.toFixed(1)).join(',')}`);
  }
  // textures, images (bytes copied), samplers: as the Blender gun has them, only if a copied material uses one
  const usesTex = materials.some(m => JSON.stringify(m).includes('"index"'));
  const images = [], textures = usesTex ? structuredClone(Bj.textures ?? []) : [], samplers = usesTex ? structuredClone(Bj.samplers ?? []) : [];
  if (usesTex) for (const im of Bj.images ?? []) { const bv = Bj.bufferViews[im.bufferView]; images.push({ ...im, bufferView: pushView(Buffer.from(b.G.bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength))) }); }
  const pad = (4 - (off % 4)) % 4; if (pad) { bins.push(Buffer.alloc(pad)); off += pad; }
  const json = { asset: { version: '2.0', generator: 'bo7-twin-parts.mjs' }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, materials, accessors, bufferViews: views, buffers: [{ byteLength: off }],
    ...(usesTex ? { textures, images, samplers } : {}), extensionsUsed: Bj.extensionsUsed, ...(usesTex && Bj.extensionsRequired ? { extensionsRequired: Bj.extensionsRequired } : {}) };
  if (!json.extensionsUsed) delete json.extensionsUsed;
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const bin = Buffer.concat(bins), head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const chunk = (buf, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(buf.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, buf]); };
  const glb = Buffer.concat([head, chunk(js, 0x4e4f534a), chunk(bin, 0x004e4942)]);
  fs.writeFileSync(`${OUT}${gun}_twin.glb`, glb);
  const v = crypto.createHash('sha1').update(glb).digest('hex').slice(0, 8);
  for (const m of Object.values(mounts)) m.model += `?v=${v}`;
  fs.writeFileSync(`${OUT}${gun}_twin.json`, JSON.stringify({ rip: `bo7_${spec.rip}`, mounts }, null, 1) + '\n');
  console.log(`${gun}: ${Object.keys(mounts).length} parts, ${(glb.length / 1024).toFixed(0)} KB -> mods/bo7-weapons/${gun}_twin.glb`);
  if (process.env.PRINT) {
    console.log('  rip boxes: ' + Object.entries(r.box).map(([h, x]) => `${h} ${x.min.toArray().map(n => n.toFixed(1))}..${x.max.toArray().map(n => n.toFixed(1))}`).join(' | '));
    for (const l of report) console.log('  ' + l);
  }
}

for (const g of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(GUNS)) build(g);
