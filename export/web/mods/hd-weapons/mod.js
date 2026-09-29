// HD weapon textures: AI-upscaled (Real-ESRGAN) copies of every weapon
// model's textures, made by `.tools/upscale-kino-textures.py --weapons`.
// prepare() runs before any model loads, so a URL redirect on the shared asset
// loader swaps them in for viewmodels, world models and the box display alike.
// Follows Settings → HD textures (applies to guns loaded afterwards); phones
// keep the originals.
import { assetManager } from '../../runtime-assets.js';
import { settings } from '../../settings.js';

export async function prepare(data){
  const coarse=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;
  if(coarse)return data;
  const table=await fetch(new URL('hd.json',import.meta.url)).then(r=>r.ok?r.json():{}).catch(()=>({}));
  const root=new URL('./',document.baseURI),map=new Map();
  for(const [src,hd] of Object.entries(table))map.set(new URL(src,root).href,new URL(hd,root).href);
  if(!map.size)return data;
  const previous=assetManager.urlModifier;
  assetManager.setURLModifier(url=>{
    const resolved=previous?previous(url):url;
    if(settings.hdTextures===false)return resolved;
    return map.get(new URL(resolved,document.baseURI).href)??resolved;
  });
  return data;
}
