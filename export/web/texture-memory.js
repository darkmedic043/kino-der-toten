// Frees decoded texture images from RAM once they are on the GPU (not part of upstream; docs/fork/performance.md).
// three keeps every texture's decoded image (an ImageBitmap: width x height x 4 bytes) after uploading it, so each
// texture lived twice, in RAM and in VRAM. A loaded map held 1.3-1.7 GB of them, and the user's PC ran out of memory
// ("Not enough memory to open this page", a black Rind window). Here:
//   - createImageBitmap is wrapped: a bitmap decoded from a Blob (three's ImageBitmapLoader, GLTFLoader's embedded
//     images, anything fetched) remembers that Blob, the compressed file (WebP/PNG/JPEG, a fraction of the size).
//   - Texture.onUpdate (three calls it right after an upload) closes the bitmap; the Blob stays.
//   - Anything that would need the pixels again re-decodes from the Blob: Texture.clone() (a clone with other
//     parameters gets its own GPU copy) and needsUpdate = true. Until the decode lands that upload fails quietly (three
//     logs it), then the texture uploads again with the pixels. userData.keepImage opts a texture out.
//   - The images can't come back after a WebGL context loss: the engine reloads the page on restore (released > 0).
// Install once, before anything loads textures.
import * as THREE from 'three';

const origins = new WeakMap();   // ImageBitmap -> {blob, args}
const released = new WeakMap();  // Source -> {blob, args, pending}
const stats = { released: 0, bytes: 0, restored: 0 };
const kept = new WeakSet();   // sources whose pixels had to come back once: they stay (no free/decode loop)
let native = null;
// Only the main renderer's uploads free an image. Other renderers (the HUD portrait, gun icons, the Gunsmith preview,
// menu thumbnails) have their own WebGL contexts and upload the same textures: freeing after theirs left the main one to
// upload a closed 0x0 bitmap (Bondrewd Premium's first-person arm rendered black). `active` is the renderer drawing now.
let primary = null, active = null;
export function setPrimaryRenderer(r) { primary = r; }
const IMAGE_FETCHES = 48;

export function installTextureMemory() {
  if (globalThis.__kinoTextureMemory || typeof createImageBitmap !== 'function' || /[?&]keepTextures/.test(globalThis.location?.search ?? '')) return stats;   // ?keepTextures: off (A/B)
  globalThis.__kinoTextureMemory = stats;
  native = createImageBitmap.bind(globalThis);
  globalThis.createImageBitmap = async function (src, ...args) {
    const bmp = await native(src, ...args);
    if (src instanceof Blob) origins.set(bmp, { blob: src, args });
    return bmp;
  };
  // At most IMAGE_FETCHES image downloads at once: GLTFLoader asks for every texture of a map together, and Chromium
  // fails the excess with ERR_INSUFFICIENT_RESOURCES (Der Eisendrache has ~2,400), leaving those materials untextured
  const nativeFetch = globalThis.fetch?.bind(globalThis);
  if (nativeFetch) {
    let running = 0; const queue = [];
    const next = () => { if (running < IMAGE_FETCHES && queue.length) { running++; queue.shift()(); } };
    globalThis.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input?.url ?? String(input);
      if (!/\.(webp|png|jpe?g|ktx2)(\?|$)/i.test(url)) return nativeFetch(input, init);
      return new Promise(go => { queue.push(go); next(); }).then(() => nativeFetch(input, init)).finally(() => { running--; next(); });
    };
  }
  const RP = THREE.WebGLRenderer.prototype;
  for (const k of ['render', 'compile', 'initTexture', 'copyTextureToTexture']) {
    const f = RP[k]; if (typeof f !== 'function') continue;
    RP[k] = function (...a) { const prev = active; active = this; try { return f.apply(this, a); } finally { active = prev; } };
  }
  const proto = THREE.Texture.prototype;
  // three's constructor assigns `this.onUpdate = null`, which lands in this setter; the getter always hands three a
  // callback that runs the texture's own (if any) and then frees the image
  Object.defineProperty(proto, 'onUpdate', {
    configurable: true,
    // an upload that found the image already freed (another Texture sharing the source, with other settings, uploaded
    // and freed it first: three gives each its own GPU copy) made a 0x0 copy: decode again and re-upload this one too
    get() { return this.__onUpdateWrap ??= t => { this.__userOnUpdate?.(t); const r = released.get(t.source); if (r && !t.source.data?.width) touch(t, r); else release(t); }; },
    set(fn) { this.__userOnUpdate = fn; },
  });
  const clone = proto.clone;
  // a clone made while the image is out may upload before the decode lands: three would size its GPU copy from the
  // closed (0x0) bitmap and never resize it, so such clones are disposed when the pixels come back (re-made next draw)
  // Any texture that needs the pixels again while they're out (a clone, needsUpdate, a changed setting such as
  // anisotropy) can make three size a new GPU copy from the closed 0x0 bitmap and never resize it: black for good (it hit
  // Kino's map textures, whose anisotropy is raised after load). So every texture that touched a released source is
  // noted, and when the pixels come back all of them drop their GPU copies (dispose) and rebuild at the right size.
  const touch = (t, r) => { (r.texs ??= []).push(new WeakRef(t)); restore(t.source); };
  proto.clone = function () { const c = clone.call(this); const r = released.get(this.source); if (r) touch(c, r); return c; };
  const nu = Object.getOwnPropertyDescriptor(proto, 'needsUpdate');
  if (nu?.set) Object.defineProperty(proto, 'needsUpdate', { configurable: true, get: nu.get, set(v) { const r = v === true && released.get(this.source); if (r) touch(this, r); nu.set.call(this, v); } });
  return stats;
}

function release(tex) {
  const s = tex.source, img = s?.data;
  if (!(img instanceof ImageBitmap) || tex.userData?.keepImage || !img.width || kept.has(s)) return;
  if (!primary || (active && active !== primary)) return;   // a secondary renderer's upload (or none registered yet)
  const o = origins.get(img); if (!o) return;   // not decoded from a file we can get back
  released.set(s, { ...o, pending: null, texs: [new WeakRef(tex)] });
  stats.released++; stats.bytes += img.width * img.height * 4;
  img.close();
}

function restore(s) {
  const r = released.get(s); if (!r) return null;
  r.pending ??= native(r.blob, ...r.args).then(bmp => {
    origins.set(bmp, { blob: r.blob, args: r.args });
    s.data = bmp; s.needsUpdate = true; released.delete(s); kept.add(s); stats.restored++;
    for (const w of r.texs ?? []) w.deref()?.dispose();   // rebuilt on their next draw, sized from the real image
    return bmp;
  }).catch(e => { console.warn('[texture-memory] restore failed', e); });
  return r.pending;
}

export const textureMemoryStats = () => ({ ...stats, mb: Math.round(stats.bytes / 1e6) });
installTextureMemory();   // on import: the engine and the menu import this first

// For code that copies a texture's pixels elsewhere (instance-cull.js texture arrays): the source's image, decoded again
// from its file if it was released (the source itself is left as it is), or null if it can't be had.
export async function imageOf(source) {
  const img = source?.data;
  if (img && !(img instanceof ImageBitmap && !img.width)) return img;
  const r = released.get(source);
  return r && native ? native(r.blob, ...r.args).catch(() => null) : null;
}
// ...and drop a source's decoded image once nothing will draw it again (its file stays, as for a released texture)
export function dropImage(source) {
  const img = source?.data;
  if (!(img instanceof ImageBitmap) || !img.width || kept.has(source)) return;
  const o = origins.get(img); if (!o) return;
  released.set(source, { ...o, pending: null, texs: [] });
  stats.released++; stats.bytes += img.width * img.height * 4;
  img.close();
}
