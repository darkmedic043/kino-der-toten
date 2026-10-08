// Copy one mesh out of Moon's map glTF (export/web/moon/moon.gltf) into a standalone GLB with its
// textures embedded, in the mesh's own model space (inches, y up). Used for the PhD Flopper machine
// (zombie_vending_nuke), which Moon only has as a placed script_model inside the map.
//   node .tools/extract-moon-mesh.mjs zombie_vending_nuke export/web/moon/models/zombie_vending_nuke.glb
import fs from 'node:fs';
import path from 'node:path';

const [name, out] = process.argv.slice(2);
if (!name || !out) { console.error('usage: extract-moon-mesh.mjs <mesh name> <out.glb>'); process.exit(1); }
const dir = path.resolve(import.meta.dirname, '../export/web/moon');
const g = JSON.parse(fs.readFileSync(path.join(dir, 'moon.gltf')));
const bin = fs.readFileSync(path.join(dir, g.buffers[0].uri));
const mesh = g.meshes.find(m => m.name === name);
if (!mesh) throw new Error(`no mesh named ${name}`);

const doc = { asset: { version: '2.0', generator: 'extract-moon-mesh' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name, mesh: 0 }],
  meshes: [], materials: [], textures: [], images: [], samplers: [], accessors: [], bufferViews: [], buffers: [] };
const chunks = []; let length = 0;
const push = buf => { const offset = length; chunks.push(buf); length += buf.length; const pad = (4 - length % 4) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); length += pad; } return offset; };
const view = (bytes, target) => { doc.bufferViews.push({ buffer: 0, byteOffset: push(bytes), byteLength: bytes.length, ...(target ? { target } : {}) }); return doc.bufferViews.length - 1; };
const memo = (map, key, make) => map.has(key) ? map.get(key) : (map.set(key, make()), map.get(key));
const accs = new Map(), mats = new Map(), texs = new Map(), imgs = new Map(), samps = new Map();

function accessor(i) {
  return memo(accs, i, () => {
    const a = g.accessors[i], bv = g.bufferViews[a.bufferView];
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType];
    if (bv.byteStride && bv.byteStride !== comps * size) throw new Error('interleaved accessors are not supported');
    const start = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const bytes = bin.subarray(start, start + a.count * comps * size);
    const { bufferView, byteOffset, ...rest } = a;
    doc.accessors.push({ ...rest, bufferView: view(Buffer.from(bytes), bv.target) });
    return doc.accessors.length - 1;
  });
}
function image(i) {
  return memo(imgs, i, () => {
    const im = g.images[i], file = path.join(dir, decodeURIComponent(im.uri));
    const ext = path.extname(file).toLowerCase(), mimeType = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[ext];
    doc.images.push({ name: im.name, mimeType, bufferView: view(fs.readFileSync(file)) });
    return doc.images.length - 1;
  });
}
function texture(i) {
  return memo(texs, i, () => {
    const t = g.textures[i], out = {};
    if (t.sampler != null) out.sampler = memo(samps, t.sampler, () => { doc.samplers.push(g.samplers[t.sampler]); return doc.samplers.length - 1; });
    if (t.source != null) out.source = image(t.source);
    if (t.extensions) { out.extensions = {}; for (const [k, v] of Object.entries(t.extensions)) out.extensions[k] = { ...v, source: image(v.source) }; }
    doc.textures.push(out); return doc.textures.length - 1;
  });
}
function material(i) {
  return memo(mats, i, () => {
    const m = structuredClone(g.materials[i]);
    const fix = o => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (/Texture$/.test(k) && v?.index != null) v.index = texture(v.index); else fix(v); } };
    fix(m); doc.materials.push(m); return doc.materials.length - 1;
  });
}
doc.meshes.push({ name, primitives: mesh.primitives.map(p => ({ ...p,
  attributes: Object.fromEntries(Object.entries(p.attributes).map(([k, v]) => [k, accessor(v)])),
  indices: p.indices != null ? accessor(p.indices) : undefined, material: p.material != null ? material(p.material) : undefined })) });
const used = new Set(Object.values(doc.textures).flatMap(t => t.extensions ? Object.keys(t.extensions) : []));
if (used.size) doc.extensionsUsed = [...used];
for (const k of ['textures', 'images', 'samplers']) if (!doc[k].length) delete doc[k];

const data = Buffer.concat(chunks); doc.buffers.push({ byteLength: data.length });
let json = Buffer.from(JSON.stringify(doc)); json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + data.length, 8);
const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
fs.writeFileSync(out, Buffer.concat([header, ch(json.length, 0x4e4f534a), json, ch(data.length, 0x004e4942), data]));
console.log(`${out}: ${doc.meshes[0].primitives.length} primitives, ${doc.materials.length} materials, ${doc.images?.length ?? 0} images, ${(12 + json.length + data.length) >> 10} KB`);
