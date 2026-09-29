// Kino's exported map materials lost their blend modes: glass became a 0.45
// alpha cut-out (clear panes vanished into holes, frosted ones went solid),
// multiply decals (burn marks, grime, stains: dark marks on white) drew as
// pale squares, and soft decals (blood, cracks, puddles) had their edges
// chopped off. This restores glass as blended, decals as multiply or soft
// alpha blends, and hides the editor-only HDR light portal. Kino only;
// custom maps bring their own materials.
import * as THREE from 'three';
import { CollisionWorld } from '../../collision-world.js';

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
        Object.assign(m,{transparent:true,alphaTest:0,depthWrite:false,roughness:.12,metalness:0});
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
        Object.assign(m,{transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
        if(m.map){m.emissive=new THREE.Color(1,1,1);m.emissiveMap=m.map;m.emissiveIntensity=1.2;}
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
