// Skins the Grimhawk's Blender parts (.tools/build-grimhawk.py) onto the BO1 M16 viewmodel's own skeleton, so every
// M16 animation drives it, and writes a static world model in the M16 world model's frame.
//   node .tools/assemble-grimhawk.mjs <parts.glb> <out_view.glb> <out_world.glb>
// Each part mesh (part_<bone>) is weighted 100% to that bone. The M16's skeleton nodes and skin (with its inverse bind
// matrices) are copied as they are; its meshes are dropped. Blender's export (Z-up -> Y-up) lands the parts in the same
// space as the M16's own vertices (x forward, y up, z = -CoD y), which is the skin's bind space.
import fs from 'node:fs';
import path from 'node:path';

const [partsPath, viewOut, worldOut] = process.argv.slice(2);
const WEB = path.resolve(import.meta.dirname, '../export/web');
const DONOR = path.join(WEB, 'models/t5_weapon_viewmodel_m16a1.glb');
const MUZZLE = [30.45, 0, 2.4];          // tag_flash at the Grimhawk's brake (CoD units, j_gun space)
const WORLD_SHIFT = [-10.5, -2.55, 0];   // viewmodel gun space -> the M16 world model's (CoD (-10.5, 0, -2.55), in glTF axes)

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
  // the parts use plain factor materials (no textures)
  out.materials = src.json.materials.map(m => structuredClone(m));
}

const parts = readGlb(partsPath), donor = readGlb(DONOR);
const partMeshes = new Map();   // bone -> mesh index in parts
for (const n of parts.json.nodes) if (n.mesh !== undefined && n.name?.startsWith('part_')) partMeshes.set(n.name.slice(5), n.mesh);

// ---- viewmodel ---------------------------------------------------------------------------------------------------
{
  const out = { asset: { version: '2.0', generator: 'assemble-grimhawk' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], skins: [] };
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
  out.skins.push({ joints: sk.joints.map(j => map.get(j)), inverseBindMatrices: fromDonor(sk.inverseBindMatrices), ...(sk.skeleton !== undefined ? { skeleton: map.get(sk.skeleton) } : {}) });
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
    out.meshes.push({ name: 'grimhawk_' + bone, primitives: prims });
    out.nodes.push({ name: 'surf_' + bone, mesh: out.meshes.length - 1, skin: 0 });
    (out.nodes[rootIdx].children ??= []).push(out.nodes.length - 1);
  }
  out.scenes[0].nodes = [rootIdx];
  glb(out, w.data(), viewOut);
  console.log('[grimhawk] viewmodel', viewOut, [...partMeshes.keys()].join(', '));
}

// ---- world model: one static mesh in the M16 world model's frame (root tag_weapon, gun shifted) ------------------
{
  const out = { asset: { version: '2.0', generator: 'assemble-grimhawk' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [] };
  const w = writer(), fromParts = copier(parts, out, w);
  copyMaterials(parts, out, w);
  const prims = [];
  for (const [bone, mi] of partMeshes) for (const p of parts.json.meshes[mi].primitives)
    prims.push({ attributes: Object.fromEntries(Object.entries(p.attributes).map(([k, v]) => [k, fromParts(v)])), indices: fromParts(p.indices), material: p.material, mode: 4 });
  out.meshes.push({ name: 'grimhawk_world', primitives: prims });
  // the M16 world model's root: tag_weapon turned -90° about X (CoD Z-up); the mesh sits beside it, shifted
  out.nodes.push({ name: 'grimhawk_world_root', children: [1, 2] });
  out.nodes.push({ name: 'tag_weapon', rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] });
  out.nodes.push({ name: 'surf0', mesh: 0, translation: WORLD_SHIFT });
  glb(out, w.data(), worldOut);
  console.log('[grimhawk] world model', worldOut);
}
