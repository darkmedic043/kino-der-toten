// A map's detail.json (.tools/map-detail.mjs, next to its GLB): sharper textures without rebuilding the map.
//   hd    old texture uri -> a larger copy, swapped in by a URL redirect on the shared loader (before the map loads).
//         Follows Settings -> HD textures; phones and Low graphics keep the small ones.
//   tile  material name -> repeat for its colour map: BO3's tiling "micro" detail maps, which the port stretched once
//         over a whole prop (a boulder: 256 texels across 1,000 units). Costs nothing (the copies share one GPU texture).
// A map mod calls prepareDetail(dir) from its prepare() and applyDetail(root) in its setup (before the warm-up).
import { assetManager } from './runtime-assets.js';
import * as THREE from 'three';
import { settings } from './settings.js';
import { ktx2Texture } from './ktx2.js';

let table = null;
export async function prepareDetail(dir) {
  table = await fetch(new URL(dir + 'detail.json', document.baseURI)).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!table?.hd) return;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (coarse || settings.hdTextures === false || (settings.graphics ?? 2) < 1) return;
  const root = new URL(dir, document.baseURI), map = new Map();
  for (const [src, hd] of Object.entries(table.hd)) map.set(new URL(src, root).href, new URL(hd, root).href);
  const previous = assetManager.urlModifier;
  assetManager.setURLModifier(url => { const resolved = previous ? previous(url) : url; return map.get(new URL(resolved, document.baseURI).href) ?? resolved; });
}
export function applyDetail(root) {
  const tile = table?.tile; if (!tile || !root) return 0;
  const copies = new Map(), seen = new Set(); let n = 0;
  root.traverse(o => { for (const m of [o.material].flat()) { if (!m?.map || seen.has(m)) continue; seen.add(m); const r = tile[m.name]; if (!r) continue;
    const key = m.map.uuid + ':' + r; let t = copies.get(key);
    if (!t) { t = m.map.clone(); t.repeat.set(r, r); t.needsUpdate = true; copies.set(key, t); }   // (at load: same source, so no second upload)
    m.map = t; n++; } });
  return n;
}

// A World at War port carries its textures inside the GLB, 512 px at most (build_waw_map.py), so there is no URL to
// redirect. Its hd.json (.tools/map-hd.mjs, map entry `hd: true`) names larger copies of the blurriest colour maps from
// the zone dump: each is loaded (the KTX2 copy when there is one: a 1024 px one then takes the memory the embedded
// 512 px image did) and put in the embedded texture's place by name, before anything has been drawn or uploaded.
// CustomWorld calls it right after the GLB loads. Same switches as the redirects: Settings -> HD textures, not on
// phones or Low graphics, ?noDetail for an A/B.
export async function embeddedHd(root, dir) {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (!root || coarse || settings.hdTextures === false || (settings.graphics ?? 2) < 1 || /[?&]noDetail/.test(location.search)) return 0;
  const list = await fetch(new URL(dir + 'hd.json', document.baseURI)).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!list) return 0;
  const uses = new Map();   // embedded texture -> the material slots that show it
  root.traverse(o => { for (const m of [o.material].flat()) for (const k of ['map', 'emissiveMap']) { const t = m?.[k]; if (!t?.isTexture || !list[t.name]) continue;
    let u = uses.get(t); if (!u) uses.set(t, u = new Map()); u.set(m.uuid + k, [m, k]); } });
  const byName = new Map(); for (const t of uses.keys()) byName.set(t.name, [...(byName.get(t.name) ?? []), t]);
  let n = 0;
  await Promise.all([...byName].map(async ([name, olds]) => {
    const url = new URL(dir + list[name], document.baseURI).href;
    let hd = await ktx2Texture(url).catch(() => null), image = false;
    if (!hd) { hd = await new THREE.TextureLoader().loadAsync(url).catch(() => null); image = true; }
    if (!hd) return;
    for (const [i, old] of olds.entries()) { const t = i ? hd.clone() : hd;
      t.name = old.name; t.wrapS = old.wrapS; t.wrapT = old.wrapT; t.repeat.copy(old.repeat); t.offset.copy(old.offset); t.rotation = old.rotation; t.center.copy(old.center);
      t.channel = old.channel; t.colorSpace = old.colorSpace; t.anisotropy = old.anisotropy; t.flipY = false;
      if (image) { t.minFilter = old.minFilter; t.magFilter = old.magFilter; t.generateMipmaps = old.generateMipmaps; }
      t.userData.hd = true; t.needsUpdate = true;
      for (const [m, k] of uses.get(old).values()) m[k] = t;
      old.dispose(); n++; }
  }));
  if (n) console.info('[map-detail] larger copies of', n, 'embedded textures');
  return n;
}
