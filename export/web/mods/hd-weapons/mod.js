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

// Weapon preloading: a gun's first equip loaded its first-person model,
// animations and (HD) textures and compiled its shaders in one frame, about
// 0.4 s of freeze when taking it from the box. The box picks its weapon when a
// spin starts, so everything is fetched, uploaded and compiled during the
// spin; wall guns are preloaded while you stand near their wall.
import * as THREE from 'three';
import { loadModel, loadAnimation } from '../../animation.js';

export default async function setup(api){
  const {data,renderer,viewScene,camera,host,mysteryBox,world}=api;
  if(!renderer||!viewScene)return;
  const done=new Set(),uploaded=new Set();let busy=null;
  // Fetch models and animations, then compile with the weapon scene's own
  // lights (out of sight) and upload textures, in one batch.
  // upload=false (the load-time batch) skips texture uploads: every gun's HD
  // textures at once filled video memory and slowed everything down.
  async function preload(ids,upload=true){
    ids=ids.filter(id=>data.weapons[id]&&!(upload?uploaded:done).has(id));for(const id of ids){done.add(id);if(upload)uploaded.add(id);}if(!ids.length)return;
    const defs=ids.flatMap(id=>{const d=data.weapons[id];return [d,d.upgrade?{...d,...d.upgrade}:null].filter(Boolean);});
    const models=[...new Set(defs.flatMap(d=>[d.model,d.leftModel]).filter(Boolean))];
    const anims=[...new Set(defs.flatMap(d=>Object.values({...d.animations,...(d.leftAnimations??{})})))];
    const [roots]=await Promise.all([Promise.all(models.map(u=>loadModel(u).catch(()=>null))),...anims.map(u=>loadAnimation(u).catch(()=>null))]);
    const holder=new THREE.Group();holder.position.set(0,-5000,0);for(const r of roots)if(r)holder.add(r);
    viewScene.add(holder);
    try{await renderer.compileAsync(viewScene,camera);
      if(upload)holder.traverse(o=>{for(const m of [o.material].flat())if(m)for(const k of ['map','normalMap','emissiveMap','alphaMap'])if(m[k])renderer.initTexture(m[k]);});}
    catch(e){console.warn('[preload]',ids,e);}
    viewScene.remove(holder);
  }
  const queue=id=>{busy=(busy??Promise.resolve()).then(()=>preload([id]));};
  // The box: its weapon is chosen when the spin starts.
  let lastRoll=null;
  const wallbuys=[...(data.entities??[]).filter(e=>e.targetname==='weapon_upgrade'&&e.zombie_weapon_upgrade).map(e=>({p:new THREE.Vector3(...e.position),id:e.zombie_weapon_upgrade})),
    ...(world.interactions??[]).filter(e=>e.kind==='wallbuy'&&e.weapon).map(e=>({p:new THREE.Vector3(...(e.position?.toArray?.()??e.position??[0,0,0])),id:e.weapon}))];
  // During loading: prepare every weapon you can get on this map (loadout, wall
  // guns, box), so taking one never loads or compiles anything mid-game.
  // Phones skip this (memory); they still preload per spin and near walls.
  const coarse=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;
  if(!coarse){
    const t0=performance.now();
    const ids=[...new Set([...(api.session.inventory??[]).map(w=>w.id),...wallbuys.map(w=>w.id),...(data.boxPool??Object.keys(mysteryBox?.models??{}))])].filter(id=>data.weapons[id]);
    await preload(ids,false);
    console.info('[preload] prepared',ids.length,'weapons in',Math.round(performance.now()-t0),'ms');
  }
  let timer=0;
  host.on('update',dt=>{
    for(const b of mysteryBox?.boxes?.values()??[]){const r=b.roll;if(r&&r!==lastRoll&&!r.teddy){lastRoll=r;queue(r.weapon);}}
    if((timer-=dt)>0)return;timer=.5;
    for(const w of wallbuys)if(!uploaded.has(w.id)&&w.p.distanceTo(camera.position)<260)queue(w.id);
  });
}
