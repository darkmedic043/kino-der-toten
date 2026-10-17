// GPU-compressed textures (not part of upstream; docs/fork/materials.md, "KTX2 textures"). .tools/build-ktx2.mjs
// encodes the game's textures as KTX2 (UASTC + zstd, full mip chains) into ktx2/<path>.ktx2 and lists them in
// ktx2/manifest.json. Every glTF loaded through assetManager (the Kino map, weapons, characters, zombies, custom maps
// with external textures) asks this handler for its images: a listed image comes from its KTX2 copy, transcoded in a
// worker to what the GPU reads natively (BC7 on desktop), anything else loads as before. A BC7 texture takes a quarter
// of the video memory of the RGBA image, uploads without a decode or mipmap pass, and isn't kept as a bitmap in RAM.
// The result is handed over exactly like GLTFLoader's own image path (colour space none; GLTFLoader then sets sRGB on
// colour slots), so materials see no difference. Phones keep their own handler (-mobile copies) for now.
// ?noKtx2 turns it off (A/B).
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { assetManager, runtimeProfile } from './runtime-assets.js';

const stats = { ktx2: 0, uses: 0, images: 0, failed: 0, bytes: 0 };
let loader = null, files = null, ready = null;
// one transcode per file: every model that uses it gets a clone sharing its data and its GPU copy (three keys GPU
// textures by source). Without this each glTF loaded its own copy (Kino: 1,658 loads, JS heap 585 MB -> 1.4 GB).
const cache = new Map();
function compressed(key, entry) {
  if (!cache.has(key)) {
    const p = loader.loadAsync(urlOf(key, entry[0])).then(t => { stats.ktx2++; stats.bytes += entry[3]; t.colorSpace = THREE.NoColorSpace; t.name = key; return t; });
    cache.set(key, p); p.catch(() => cache.delete(key));
  }
  stats.uses++;
  return cache.get(key).then(t => t.clone());   // a clone as an image texture would be: its own settings, shared pixels
}

// manifest key: the path under the site root, decoded (sources have names such as ~-geb_art_ceiling_metal01_c.png)
const keyOf = url => { try { return decodeURIComponent(new URL(url, document.baseURI).pathname).replace(/^\/+/, ''); } catch { return null; } };
const urlOf = (key, stamp) => 'ktx2/' + key.split('/').map(encodeURIComponent).join('/') + '.ktx2?v=' + stamp;

export function setupKtx2(renderer) {
  const q = new URLSearchParams(location.search);
  if (ready || runtimeProfile.mobile || q.has('noKtx2')) return ready;
  // its own manager: assetManager's URL modifier (hd-weapons) applies to the image path, not to ktx2/ paths
  loader = new KTX2Loader(new THREE.LoadingManager()).setTranscoderPath(new URL('vendor/jsm/libs/basis/', document.baseURI).href).detectSupport(renderer);
  ready = fetch('ktx2/manifest.json').then(r => r.ok ? r.json() : null).then(m => { files = m?.files ?? null; }).catch(() => {});
  const images = new THREE.ImageBitmapLoader(new THREE.LoadingManager());   // what GLTFLoader would have used
  const image = (url, onLoad, onProgress, onError) => { stats.images++; images.load(url, bitmap => { const t = new THREE.Texture(bitmap); t.needsUpdate = true; onLoad(t); }, onProgress, onError); };
  assetManager.addHandler(/\.(?:png|webp|jpe?g)(?:\?.*)?$/i, {
    load(url, onLoad, onProgress, onError) {
      const resolved = assetManager.resolveURL(url);   // e.g. hd-weapons' redirect to the HD copy
      ready.then(() => {
        const key = keyOf(resolved), entry = key && files?.[key];
        if (!entry) return image(resolved, onLoad, onProgress, onError);
        // colour space none, as an image texture starts; GLTFLoader sets sRGB where it belongs
        compressed(key, entry).then(onLoad, error => { stats.failed++; console.warn('[ktx2] falling back to the image for', key, error); image(resolved, onLoad, onProgress, onError); });
      });
    },
  });
  return ready;
}
// For code that loads textures itself (map-materials' normal maps and HD swaps): the KTX2 copy of url as a texture, or
// null (not listed, KTX2 off or failed) so the caller loads the image as before. Colour space none, like an image.
export function ktx2Texture(url) {
  if (!loader) return Promise.resolve(null);
  return ready.then(() => {
    const key = keyOf(url), entry = key && files?.[key];
    if (!entry) return null;
    return compressed(key, entry).catch(error => { stats.failed++; console.warn('[ktx2] falling back to the image for', key, error); return null; });
  });
}
export const ktx2Stats = () => ({ ...stats, enabled: !!loader, listed: files ? Object.keys(files).length : 0, mb: Math.round(stats.bytes / 1e6) });
