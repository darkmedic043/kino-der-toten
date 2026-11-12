// A map's detail.json (.tools/map-detail.mjs, next to its GLB): sharper textures without rebuilding the map.
//   hd    old texture uri -> a larger copy, swapped in by a URL redirect on the shared loader (before the map loads).
//         Follows Settings -> HD textures; phones and Low graphics keep the small ones.
//   tile  material name -> repeat for its colour map: BO3's tiling "micro" detail maps, which the port stretched once
//         over a whole prop (a boulder: 256 texels across 1,000 units). Costs nothing (the copies share one GPU texture).
// A map mod calls prepareDetail(dir) from its prepare() and applyDetail(root) in its setup (before the warm-up).
import { assetManager } from './runtime-assets.js';
import { settings } from './settings.js';

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
