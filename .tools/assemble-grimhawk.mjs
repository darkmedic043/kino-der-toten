// Skins a BO7 gun's Blender parts (.tools/build-grimhawk.py, build-siren.py, build-havoc.py) onto a BO1 donor viewmodel's own
// skeleton (the M16's; the China Lake's for the Havoc), so every donor animation drives it, and writes a static world model in
// the donor world model's frame.
//   node .tools/assemble-grimhawk.mjs <parts.glb> <out_view.glb> <out_world.glb> [--gun siren|havoc]   (default grimhawk)
// Each part mesh (part_<bone>) is weighted 100% to that bone. The donor's skeleton nodes and skin (with its inverse bind
// matrices) are copied as they are; its meshes are dropped. Blender's export (Z-up -> Y-up) lands the parts in the same
// space as the M16's own vertices (x forward, y up, z = -CoD y), which is the skin's bind space.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), gi = args.indexOf('--gun'), GUN = gi >= 0 ? args.splice(gi, 2)[1] : 'grimhawk';
const [partsPath, viewOut, worldOut] = args;
const WEB = path.resolve(import.meta.dirname, '../export/web');
// Per gun: MUZZLE = tag_flash (CoD units, j_gun space); NEW_BONES = attachment bones the M16 lacks, children of j_gun at
// these j_gun-space (CoD) positions (fitted mags sit where tag_clip does, so weapon-levels' fitted-mag follow keeps them
// with the reload); BODY = the baked material (camos tile it CAMO_SCALE times denser, the whole gun shares one atlas);
// WORLD_PARTS = the bare gun for the world model (a static mesh can't hide attachments); DONOR and WORLD_SHIFT (viewmodel gun
// space -> the donor world model's, glTF axes) default to the M16's.
const CLIP = [4.29, -0.01, 1.29];
const GUNS = {
  grimhawk: { MUZZLE: [30.45, 0, 2.4], BODY: 'gh_body',
    NEW_BONES: { tag_gh_barrel: [26, 0, 2.4], tag_gh_rangefinder: [3.5, 0, 4.5], tag_gh_hawkeye: [2.5, 0, 5.2],
      tag_gh_expanse: CLIP, tag_gh_longbarrel: [28, 0, 2.4], tag_foregrip: [16, 0, 0.5], tag_laser_box: [19.3, -1.2, 2.45] },
    WORLD_PARTS: ['j_gun', 'tag_clip', 'j_charging_handle', 'tag_iron_sight', 'tag_gh_barrel'] },
  siren: { MUZZLE: [22.4, 0, 2.2], BODY: 'sr_body',
    NEW_BONES: { tag_sr_grip: [-1.6, 0, -1.5], tag_sr_reflex: [3.8, 0, 5.2], tag_sr_deflect: CLIP, tag_sr_overclock: CLIP,
      tag_sr_resonance: [16.8, 0, 2.2], tag_sr_baffle: [24.4, 0, 2.2], tag_sr_echo: [16.6, 2.4, 2.2], tag_sr_lancet: [-1.6, 0, -1.5],
      tag_sr_soma: [-1.6, 0, -1.5], tag_foregrip: [15.2, 0, -1], tag_laser_box: [16, -2, 2.2] },
    WORLD_PARTS: ['j_gun', 'tag_clip', 'tag_iron_sight', 'tag_sr_grip'] },
  // the China Lake (EX41): its world model is shorter than the viewmodel (muzzle 8 in further back, 1.8 lower); lined up on the sights
  havoc: { DONOR: 'models/t5_weapon_ex41_viewmodel.glb', WORLD_SHIFT: [-7.5, -1.7, 0], MUZZLE: [21.0, 0, 2.0], BODY: 'hv_body',
    NEW_BONES: { tag_hv_cap: [19.4, 0, -1.05], tag_hv_grip: [-6.7, 0, -0.8], tag_hv_ballistic: [6, 0, 4.5], tag_hv_prox: [20.8, 0, 2],
      tag_hv_daisy: [21.2, 0, 2], tag_hv_kinetic: [12, 0, 2], tag_hv_mortar: [17.5, 0, 2], tag_hv_airstrike: [20, 0, -1.05],
      tag_hv_extube: [21.5, 0, -1.05], tag_hv_tripwire: [17.4, 0, -3], tag_hv_actuator: [-6.7, 0, -0.8], tag_hv_dash: [-6.7, 0, -0.8],
      tag_hv_bandolier: [-16.5, 1.2, 1.2], tag_hv_breacher: [-20.6, 0, 0], tag_hv_napalm: [-1, 2, -1.3], tag_hv_cryo: [-1, 2, -1.3],
      tag_hv_arc: [-1, 2, -1.3], tag_hv_cluster: [-1, 2, -1.3], tag_hv_singularity: [-1, 2, -1.3], tag_laser_box: [13, -2, 2.5] },
    WORLD_PARTS: ['j_gun', 'j_pump', 'tag_hv_cap', 'tag_hv_grip'] },
  // the ROC 20mm on the M16: a long cannon, its brake out at 34.9 (the shells' saddle on the receiver's left)
  roc: { MUZZLE: [34.9, 0, 2.2], BODY: 'ro_body',
    NEW_BONES: { tag_ro_grip: [-1.6, 0, -1.5], tag_ro_damper: [-1.6, 0, -1.5], tag_ro_snap: [-1.6, 0, -1.5], tag_ro_stock: [-8, 0, 1],
      tag_ro_buffer: [-8, 0, 1], tag_ro_kick: [-8, 0, 1], tag_ro_brake: [32.7, 0, 2.2], tag_ro_concuss: [32.7, 0, 2.2], tag_ro_hush: [32.7, 0, 2.2],
      tag_ro_gunner: [3, 0, 5.2], tag_ro_reflex: [3.8, 0, 5.2], tag_ro_tungsten: [25, 0, 2.2], tag_ro_mfs: CLIP,
      tag_ro_bipod: [15.5, 0, 0], tag_foregrip: [14.3, 0, -1], tag_laser_box: [12.3, -1.6, 1.85],
      ...Object.fromEntries(['he', 'sabot', 'thermite', 'flak', 'shock', 'canister', 'mark'].map(k => ['tag_ro_' + k, [-1, 1.2, 2.1]])) },
    WORLD_PARTS: ['j_gun', 'tag_clip', 'tag_iron_sight', 'tag_ro_grip', 'tag_ro_stock', 'tag_ro_brake'] },
};
const { MUZZLE, NEW_BONES, BODY, WORLD_PARTS } = GUNS[GUN];
const DONOR = path.join(WEB, GUNS[GUN].DONOR ?? 'models/t5_weapon_viewmodel_m16a1.glb');
const WORLD_SHIFT = GUNS[GUN].WORLD_SHIFT ?? [-10.5, -2.55, 0];   // the M16's: CoD (-10.5, 0, -2.55), in glTF axes
const CAMO_SCALE = 9;

function readGlb(file) {
  const b = fs.readFileSync(file), n = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + n));
  const off = 20 + n, binLen = b.readUInt32LE(off);
  return { json, bin: b.subarray(off + 8, off + 8 + binLen) };
}
function writer() {
  const chunks = []; let len = 0;
  const push = buf => { const o = len; chunks.push(buf); len += buf.length; const pad = (4 - len % 4) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); len += pad; } return o; };
  return { push, data: () => Buffer.concat(chunks) };
}
function glb(doc, data, file) {
  doc.buffers = [{ byteLength: data.length }];
  let json = Buffer.from(JSON.stringify(doc)); json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
  const h = Buffer.alloc(12); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + json.length + 8 + data.length, 8);
  const ch = (l, t) => { const c = Buffer.alloc(8); c.writeUInt32LE(l, 0); c.writeUInt32LE(t, 4); return c; };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([h, ch(json.length, 0x4e4f534a), json, ch(data.length, 0x004e4942), data]));
}
// copy an accessor (and its data) from src into the output
function copier(src, out, w) {
  const memo = new Map();
  return i => {
    if (memo.has(i)) return memo.get(i);
    const a = src.json.accessors[i], bv = src.json.bufferViews[a.bufferView];
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type], size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType];
    const start = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = bv.byteStride ?? comps * size;
    let bytes;
    if (stride === comps * size) bytes = Buffer.from(src.bin.subarray(start, start + a.count * stride));
    else { bytes = Buffer.alloc(a.count * comps * size); for (let k = 0; k < a.count; k++) src.bin.copy(bytes, k * comps * size, start + k * stride, start + k * stride + comps * size); }
    out.bufferViews.push({ buffer: 0, byteOffset: w.push(bytes), byteLength: bytes.length, ...(bv.target ? { target: bv.target } : {}) });
    const { bufferView, byteOffset, ...rest } = a;
    out.accessors.push({ ...rest, bufferView: out.bufferViews.length - 1 });
    memo.set(i, out.accessors.length - 1); return out.accessors.length - 1;
  };
}
function addRaw(out, w, bytes, acc, target) {
  out.bufferViews.push({ buffer: 0, byteOffset: w.push(bytes), byteLength: bytes.length, ...(target ? { target } : {}) });
  out.accessors.push({ ...acc, bufferView: out.bufferViews.length - 1 }); return out.accessors.length - 1;
}
function copyMaterials(src, out, w) {
  // materials with their textures (the baked atlas: base colour, ORM, normal), images embedded
  const j = src.json;
  out.samplers = structuredClone(j.samplers ?? []);
  out.images = (j.images ?? []).map(im => {
    const bv = j.bufferViews[im.bufferView], bytes = Buffer.from(src.bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength));
    out.bufferViews.push({ buffer: 0, byteOffset: w.push(bytes), byteLength: bytes.length });
    return { name: im.name, mimeType: im.mimeType, bufferView: out.bufferViews.length - 1 };
  });
  out.textures = structuredClone(j.textures ?? []);
  out.materials = j.materials.map(m => structuredClone(m));
  // the whole gun shares one atlas, so camos (tiled by UV) need denser tiling than BO1's per-part UVs (camo.js reads it)
  for (const m of out.materials) if (m.name === BODY) m.extras = { ...(m.extras ?? {}), camoScale: CAMO_SCALE };
  if (j.extensionsUsed) out.extensionsUsed = [...j.extensionsUsed];
  if (j.extensionsRequired) out.extensionsRequired = [...j.extensionsRequired];
  for (const k of ['samplers', 'images', 'textures']) if (!out[k].length) delete out[k];
}

const parts = readGlb(partsPath), donor = readGlb(DONOR);
const partMeshes = new Map();   // bone -> mesh index in parts
for (const n of parts.json.nodes) if (n.mesh !== undefined && n.name?.startsWith('part_')) partMeshes.set(n.name.slice(5), n.mesh);

// ---- viewmodel ---------------------------------------------------------------------------------------------------
{
  const out = { asset: { version: '2.0', generator: 'assemble-' + GUN }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], skins: [] };
  const w = writer(), fromParts = copier(parts, out, w), fromDonor = copier(donor, out, w);
  copyMaterials(parts, out, w);
  // the donor's skeleton (nodes without meshes), re-indexed
  const keep = donor.json.nodes.map((n, i) => n.mesh === undefined ? i : -1).filter(i => i >= 0), map = new Map(keep.map((i, k) => [i, k]));
  for (const i of keep) {
    const n = structuredClone(donor.json.nodes[i]);
    n.children = (n.children ?? []).filter(c => map.has(c)).map(c => map.get(c)); if (!n.children.length) delete n.children;
    if (n.name === 'tag_flash') n.translation = MUZZLE;
    out.nodes.push(n);
  }
  const sk = donor.json.skins[0];
  // inverse bind matrices: the donor's, plus one per new bone = T(-t) · IBM(j_gun) (a child of j_gun, no rotation)
  const ibmAcc = donor.json.accessors[sk.inverseBindMatrices], ibmBv = donor.json.bufferViews[ibmAcc.bufferView];
  const ibmStart = (ibmBv.byteOffset ?? 0) + (ibmAcc.byteOffset ?? 0);
  const ibms = Array.from({ length: ibmAcc.count }, (_, k) => Array.from({ length: 16 }, (_, e) => donor.bin.readFloatLE(ibmStart + (k * 16 + e) * 4)));
  const joints = sk.joints.map(j => map.get(j));
  const jgun = out.nodes.findIndex(n => n.name === 'j_gun'), jgunIbm = ibms[joints.indexOf(jgun)];
  const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
  for (const [name, t] of Object.entries(NEW_BONES)) {
    if (!partMeshes.has(name)) continue;
    out.nodes.push({ name, translation: t }); const ni = out.nodes.length - 1;
    (out.nodes[jgun].children ??= []).push(ni); joints.push(ni);
    ibms.push(mul([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -t[0], -t[1], -t[2], 1], jgunIbm));
  }
  const ibmBuf = Buffer.alloc(ibms.length * 64); ibms.flat().forEach((v, i) => ibmBuf.writeFloatLE(v, i * 4));
  const ibmIdx = addRaw(out, w, ibmBuf, { componentType: 5126, count: ibms.length, type: 'MAT4' });
  out.skins.push({ joints, inverseBindMatrices: ibmIdx, ...(sk.skeleton !== undefined ? { skeleton: map.get(sk.skeleton) } : {}) });
  const rootIdx = map.get(donor.json.scenes[donor.json.scene ?? 0].nodes.find(r => map.has(r)));
  const jointOf = name => { const ni = out.nodes.findIndex(n => n.name === name); const j = out.skins[0].joints.indexOf(ni); if (j < 0) throw new Error('no joint ' + name); return j; };
  for (const [bone, mi] of partMeshes) {
    const j = jointOf(bone), prims = [];
    for (const p of parts.json.meshes[mi].primitives) {
      const count = parts.json.accessors[p.attributes.POSITION].count;
      const J = Buffer.alloc(count * 4), W = Buffer.alloc(count * 16);
      for (let k = 0; k < count; k++) { J[k * 4] = j; W.writeFloatLE(1, k * 16); }
      const attributes = Object.fromEntries(Object.entries(p.attributes).map(([k, v]) => [k, fromParts(v)]));
      attributes.JOINTS_0 = addRaw(out, w, J, { componentType: 5121, count, type: 'VEC4' }, 34962);
      attributes.WEIGHTS_0 = addRaw(out, w, W, { componentType: 5126, count, type: 'VEC4' }, 34962);
      prims.push({ attributes, indices: fromParts(p.indices), material: p.material, mode: 4 });
    }
    out.meshes.push({ name: GUN + '_' + bone, primitives: prims });
    out.nodes.push({ name: 'surf_' + bone, mesh: out.meshes.length - 1, skin: 0 });
    (out.nodes[rootIdx].children ??= []).push(out.nodes.length - 1);
  }
  out.scenes[0].nodes = [rootIdx];
  glb(out, w.data(), viewOut);
  console.log(`[${GUN}] viewmodel`, viewOut, [...partMeshes.keys()].join(', '));
}

// ---- world model: one static mesh in the donor world model's frame (root tag_weapon, gun shifted) ------------------
{
  const out = { asset: { version: '2.0', generator: 'assemble-' + GUN }, scene: 0, scenes: [{ nodes: [0] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [] };
  const w = writer(), fromParts = copier(parts, out, w);
  copyMaterials(parts, out, w);
  const prims = [];
  for (const [bone, mi] of partMeshes) if (WORLD_PARTS.includes(bone)) for (const p of parts.json.meshes[mi].primitives)
    prims.push({ attributes: Object.fromEntries(Object.entries(p.attributes).map(([k, v]) => [k, fromParts(v)])), indices: fromParts(p.indices), material: p.material, mode: 4 });
  out.meshes.push({ name: GUN + '_world', primitives: prims });
  // the donor world model's root: tag_weapon turned -90° about X (CoD Z-up); the mesh sits beside it, shifted
  out.nodes.push({ name: GUN + '_world_root', children: [1, 2] });
  out.nodes.push({ name: 'tag_weapon', rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] });
  out.nodes.push({ name: 'surf0', mesh: 0, translation: WORLD_SHIFT });
  glb(out, w.data(), worldOut);
  console.log(`[${GUN}] world model`, worldOut);
}
