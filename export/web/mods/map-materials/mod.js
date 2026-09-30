// Kino's exported map materials lost their blend modes: glass became a 0.45
// alpha cut-out (clear panes vanished into holes, frosted ones went solid),
// multiply decals (burn marks, grime, stains: dark marks on white) drew as
// pale squares, and soft decals (blood, cracks, puddles) had their edges
// chopped off. This restores glass as blended, decals as multiply or soft
// alpha blends, and hides the editor-only HDR light portal. Kino only;
// custom maps bring their own materials.
import * as THREE from 'three';
import { CollisionWorld } from '../../collision-world.js';
import { settings, onSettingsChange } from '../../settings.js';

const GLASS=/glass/;
const MULTIPLY=/decal_(burn_scortch|burntstain|darkstain|grime|lightstain_03|wall_fillet)|eb_dec_pipe_stain|jun_dec_blast_crater/;
const SOFT=/decal_lightstain_01|glo_dec_(blood|crack|dest_plaster)|decal_(concrete_crack|drain_stain|wall_pipe|zombie_puddle)|_blend$/;
const HIDE=/hdrportal/;
const GLOW=/clothcable_glow/;

export default async function setup(api){
  if(api.map)return;
  const seen=new Set(),counts={glass:0,multiply:0,soft:0,hidden:0,glow:0};
  api.scene.traverse(o=>{
    if(!o.isMesh)return;
    const materials=[o.material].flat();
    if(materials.some(m=>HIDE.test(m?.name??''))&&materials.length===1){o.visible=false;counts.hidden++;return;}
    for(const m of materials){
      if(!m||seen.has(m))continue;seen.add(m);
      const name=m.name??'';if(name.includes(':'))continue;   // layered base:decal blends are already baked
      if(GLASS.test(name)){
        Object.assign(m,{transparent:true,alphaTest:0,depthWrite:false,roughness:.42,metalness:0});   // glossier made pin-point sun glints that bloomed into orbs
        m.opacity=1;counts.glass++;
      }else if(MULTIPLY.test(name)){
        // Dark-on-white decals darken what's under them.
        Object.assign(m,{transparent:true,alphaTest:0,depthWrite:false,blending:THREE.MultiplyBlending,premultipliedAlpha:true,
          polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
        counts.multiply++;
      }else if(SOFT.test(name)){
        Object.assign(m,{transparent:true,alphaTest:.02,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
        counts.soft++;
      }else if(GLOW.test(name)){
        // Festoon bulb strings strung across the theatre and balconies: solid cables
        // with a soft warm glow on the bulbs. (Additive at full emissive made every
        // bulb blinding, and bloom smeared the strings into white lines and rings.)
        Object.assign(m,{transparent:false,depthWrite:true,blending:THREE.NormalBlending,alphaTest:.3});
        if(m.map){m.emissive=new THREE.Color('#ffd9a6');m.emissiveMap=m.map;m.emissiveIntensity=.35;}
        counts.glow++;
      }else continue;
      m.needsUpdate=true;
    }
  });
  // Blended surfaces draw after the opaque world, farthest first.
  api.scene.traverse(o=>{if(o.isMesh&&[o.material].flat().some(m=>m?.transparent&&GLASS.test(m.name??'')))o.renderOrder=1;});
  console.info('[map-materials]',counts);

  // Sharper textures at glancing angles (floors, walls seen along a corridor).
  const aniso=api.renderer?.capabilities.getMaxAnisotropy?.()??1;
  for(const m of seen)if(m.map&&m.map.anisotropy<aniso){m.map.anisotropy=aniso;m.map.needsUpdate=true;}

  // Normal maps: the export never attached them. .tools/build-kino-normals.py
  // converts the game's (X-in-alpha) maps and lists them by material name.
  // They load in the background after the game starts.
  const normalScale=new THREE.Vector2(1,-1);   // DirectX-style green channel
  fetch(new URL('normals.json',api.mod.url)).then(r=>r.ok?r.json():{}).then(async table=>{
    const loader=new THREE.TextureLoader(),cache=new Map(),byName=new Map();
    for(const m of seen)if(table[m.name]&&!m.normalMap)(byName.get(m.name)??byName.set(m.name,[]).get(m.name)).push(m);
    let applied=0;
    for(const [name,materials] of byName){
      const url=new URL(table[name],document.baseURI).href;
      if(!cache.has(url))cache.set(url,loader.loadAsync(url).then(t=>{t.flipY=false;t.colorSpace=THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=aniso;return t;}).catch(()=>null));
      const tex=await cache.get(url);if(!tex)continue;
      for(const m of materials){m.normalMap=tex;m.normalScale=normalScale.clone().multiplyScalar(window.kino.normalStrength??1);m.needsUpdate=true;applied++;}
    }
    console.info('[map-materials] normal maps on',applied,'materials');
  }).catch(e=>console.warn('[map-materials] normal maps',e));

  // HD textures: AI-upscaled (Real-ESRGAN) copies from .tools/upscale-kino-textures.py,
  // keyed by material name in hd-materials.json. Swapped in one per frame after
  // the game starts (decoded off the main thread); Settings → HD textures
  // switches between them and the originals. Phones keep the originals.
  const coarse=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;
  fetch(new URL('hd-materials.json',api.mod.url)).then(r=>r.ok?r.json():null).then(table=>{
    if(!table)return;
    const byFile=new Map();   // hd url -> {materials, original maps, texture}
    for(const m of seen){const f=table[m.name];if(!f||!m.map)continue;const e=byFile.get(f)??byFile.set(f,{materials:[],texture:null,loading:null}).get(f);e.materials.push(m);m.userData.sdMap=m.map;}
    const loader=new THREE.ImageBitmapLoader();loader.setOptions({imageOrientation:'none',premultiplyAlpha:'none'});
    const queue=[...byFile.entries()];let want=null;
    const load=([file,e])=>e.loading??=loader.loadAsync(new URL(file,document.baseURI).href).then(bitmap=>{
      const src=e.materials[0].userData.sdMap,t=new THREE.Texture(bitmap);
      t.flipY=false;t.colorSpace=src.colorSpace;t.wrapS=src.wrapS;t.wrapT=src.wrapT;t.repeat.copy(src.repeat);t.offset.copy(src.offset);
      t.anisotropy=aniso;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.needsUpdate=true;e.texture=t;return t;}).catch(()=>null);
    function apply(on){
      want=on;let i=0;
      const step=async()=>{if(want!==on)return;
        if(!on){for(const [,e] of queue)for(const m of e.materials){if(m.map!==m.userData.sdMap){m.map=m.userData.sdMap;m.needsUpdate=true;}}return;}
        const entry=queue[i++];if(!entry){console.info('[map-materials] HD textures on',queue.length);return;}
        const t=await load(entry);if(t&&want){const sd=new Set();for(const m of entry[1].materials){sd.add(m.userData.sdMap);m.map=t;m.needsUpdate=true;}
          for(const x of sd)x.dispose();}   // frees the original's GPU copy; it re-uploads if switched back
        requestAnimationFrame(step);};
      step();
    }
    const enabled=()=>!coarse&&settings.hdTextures!==false;
    apply(enabled());
    onSettingsChange((s,key)=>{if(key==='hdTextures'||key===null)apply(enabled());});
  }).catch(e=>console.warn('[map-materials] HD textures',e));

  // The theatre chandelier's opaque slot also holds its bead and crystal cards,
  // which drew as solid dark panels. Cut them out by alpha, but only in the
  // strand half of the texture: the brass frame half has zero alpha too.
  for(const m of seen){
    if(!/chandel/.test(m.name??'')||m.alphaTest>0)continue;
    m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',
      '#include <alphatest_fragment>\n#ifdef USE_MAP\nif(fract(vMapUv.x)<.49&&diffuseColor.a<.45)discard;\n#endif');};
    m.customProgramCacheKey=()=>'chandelier-strands';m.side=THREE.DoubleSide;m.needsUpdate=true;
  }

  // The spawn-room teleporter pad's collision is its visual mesh: a bowl whose
  // rim is at ~89–92 and centre dips to ~78, so walking over it sank you in.
  // Cap the bowl with a flat, invisible floor at rim height.
  const PAD={x:2,z:1274,radius:57,top:89.4};
  if(api.world?.dynamic){
    const g=new THREE.CylinderGeometry(PAD.radius,PAD.radius,6,32).translate(PAD.x,PAD.top-3,PAD.z);
    // window:true keeps setDoors from treating it as a door (it would read
    // .box and block the navmesh under it); the player's collision still hits it.
    g.computeBoundingBox();
    api.world.dynamic.push({collider:new CollisionWorld(g),box:g.boundingBox.clone(),enabled:true,window:true,note:'spawn pad cap'});
  }
}
