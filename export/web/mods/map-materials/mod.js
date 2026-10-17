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
import { ktx2Texture } from '../../ktx2.js';   // KTX2 copies of the normal and HD maps when listed

const GLASS=/glass/;
const MULTIPLY=/decal_(burn_scortch|burntstain|darkstain|grime|lightstain_03|wall_fillet)|eb_dec_pipe_stain|jun_dec_blast_crater/;
const SOFT=/decal_lightstain_01|glo_dec_(blood|crack|dest_plaster)|decal_(concrete_crack|drain_stain|wall_pipe|zombie_puddle)|_blend$/;
const HIDE=/hdrportal/;
const GLOW=/clothcable_glow/;

export default async function setup(api){
  if(api.map&&api.map.id!=='kino')return;   // Kino's materials only
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

  // Smooth shading. The map export gave every triangle its own flat normal,
  // so rounded props (columns, rails, seats, trim) showed each polygon as a
  // facet. Vertices at the same spot now share an averaged normal when their
  // faces meet at under CREASE, so curves shade smoothly and hard edges stay hard.
  // Runs in a worker (it took ~0.5 s of the main thread at every load); the normals are swapped in when it answers,
  // well before the loading screen ends. Meshes whose attributes aren't plain arrays are done here instead.
  {const t0=performance.now(),list=[],done=new WeakSet();
    api.scene.traverse(o=>{if(!o.isMesh||o.isSkinnedMesh||done.has(o.geometry))return;const g=o.geometry;if(!g.attributes.normal||!g.attributes.position)return;done.add(g);list.push(g);});
    const plain=g=>{const P=g.attributes.position,N=g.attributes.normal;return !P.isInterleavedBufferAttribute&&!N.isInterleavedBufferAttribute&&P.itemSize===3&&N.itemSize===3&&N.array instanceof Float32Array&&!P.normalized&&!(g.index&&g.index.isInterleavedBufferAttribute);};
    const jobs=list.filter(plain),here=list.filter(g=>!plain(g));
    for(const g of here){const P=g.attributes.position,N=g.attributes.normal,pos=new Float32Array(P.count*3),nrm=new Float32Array(N.count*3);for(let i=0;i<P.count;i++){pos[i*3]=P.getX(i);pos[i*3+1]=P.getY(i);pos[i*3+2]=P.getZ(i);}for(let i=0;i<N.count;i++){nrm[i*3]=N.getX(i);nrm[i*3+1]=N.getY(i);nrm[i*3+2]=N.getZ(i);}
      const r=smoothNormals(pos,P.count,g.index?Array.from({length:g.index.count},(_,k)=>g.index.getX(k)):null,g.index?.count??0,nrm);for(let i=0;i<N.count;i++)N.setXYZ(i,r[i*3],r[i*3+1],r[i*3+2]);g.attributes.normal.needsUpdate=true;}
    if(jobs.length){
      const w=new Worker(URL.createObjectURL(new Blob([`const smoothNormals=${smoothNormals};onmessage=e=>{const out=e.data.map(j=>smoothNormals(j.p,j.p.length/3,j.i,j.i?j.i.length:0,j.n));postMessage(out,out.map(a=>a.buffer));};`],{type:'text/javascript'})));
      w.onmessage=e=>{e.data.forEach((nrm,k)=>{const N=jobs[k].attributes.normal;if(nrm.length===N.array.length){N.array.set(nrm);N.needsUpdate=true;}});w.terminate();
        console.info('[map-materials] smoothed',jobs.length+here.length,'meshes in',Math.round(performance.now()-t0),'ms (worker)');};
      w.onerror=e=>{console.warn('[map-materials] smoothing worker failed',e.message);w.terminate();};
      w.postMessage(jobs.map(g=>({p:g.attributes.position.array.slice(0,g.attributes.position.count*3),n:g.attributes.normal.array.slice(0,g.attributes.normal.count*3),i:g.index?g.index.array.slice(0,g.index.count):null})));
    }
  }

  // Sharper textures at glancing angles (floors, walls seen along a corridor).
  const aniso=api.renderer?.capabilities.getMaxAnisotropy?.()??1;
  for(const m of seen)if(m.map&&m.map.anisotropy<aniso){m.map.anisotropy=aniso;m.map.needsUpdate=true;}

  // Normal maps: the export never attached them. .tools/build-kino-normals.py
  // converts the game's (X-in-alpha) maps and lists them by material name.
  // They load during the loading screen (in parallel) so the shader recompiles
  // they cause happen before play, not as a freeze after joining.
  const normalScale=new THREE.Vector2(1,-1);   // DirectX-style green channel
  try{
    const table=await fetch(new URL('normals.json',api.mod.url)).then(r=>r.ok?r.json():{});
    // ImageBitmapLoader decodes off the main thread (TextureLoader decoded on first upload, mid-frame).
    const loader=new THREE.ImageBitmapLoader(),cache=new Map();loader.setOptions({imageOrientation:'none',premultiplyAlpha:'none',colorSpaceConversion:'none'});
    const jobs=[...seen].filter(m=>table[m.name]&&!m.normalMap).map(async m=>{
      const url=new URL(table[m.name],document.baseURI).href;
      if(!cache.has(url))cache.set(url,ktx2Texture(url).then(k=>k??loader.loadAsync(url).then(b=>new THREE.Texture(b))).then(t=>{t.needsUpdate=true;t.flipY=false;t.colorSpace=THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=aniso;return t;}).catch(()=>null));
      const tex=await cache.get(url);if(tex){m.normalMap=tex;m.normalScale=normalScale.clone().multiplyScalar(window.kino.normalStrength??1);m.needsUpdate=true;}});
    await Promise.all(jobs);console.info('[map-materials] normal maps on',jobs.length,'materials');
  }catch(e){console.warn('[map-materials] normal maps',e);}

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
    const load=([file,e])=>{const url=new URL(file,document.baseURI).href;return e.loading??=ktx2Texture(url).then(k=>k??loader.loadAsync(url).then(bitmap=>new THREE.Texture(bitmap))).then(t=>{
      const src=e.materials[0].userData.sdMap;
      t.flipY=false;t.colorSpace=src.colorSpace;t.wrapS=src.wrapS;t.wrapT=src.wrapT;t.repeat.copy(src.repeat);t.offset.copy(src.offset);
      t.anisotropy=aniso;t.generateMipmaps=!t.isCompressedTexture;t.minFilter=THREE.LinearMipmapLinearFilter;t.needsUpdate=true;e.texture=t;return t;}).catch(()=>null);};   // KTX2 copies carry their mips
    function apply(on){
      want=on;let i=0;
      const step=async()=>{if(want!==on)return;
        if(!on){for(const [,e] of queue)for(const m of e.materials){if(m.map!==m.userData.sdMap)m.map=m.userData.sdMap;}return;}
        const entry=queue[i++];if(!entry){console.info('[map-materials] HD textures on',queue.length);return;}
        const t=await load(entry);if(t&&want){const sd=new Set();for(const m of entry[1].materials){sd.add(m.userData.sdMap);m.map=t;}   // same program: no needsUpdate (it forced a rebuild per swap)
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

  // Compile every shader now, during loading (normal maps, light clamp, the
  // lighting mod's changes), instead of hitching on the first frames of play.
  try{const t0=performance.now();await api.renderer?.compileAsync?.(api.scene,api.camera);if(api.viewScene)await api.renderer?.compileAsync?.(api.viewScene,api.camera);
    // Draw one full frame too (shadow maps, post-processing targets, texture
    // uploads) so that cost lands behind the loading screen, not on joining.
    const R=api.renderer;if(R){(api.host?.renderWorld??((sc,c)=>R.render(sc,c)))(api.scene,api.camera);if(api.viewScene)R.render(api.viewScene,api.camera);}
    console.info('[map-materials] shaders precompiled and first frame drawn in',Math.round(performance.now()-t0),'ms');}catch(e){console.warn('[map-materials] precompile',e);}
}

// Smooth shading. The map export gave every triangle its own flat normal, so rounded props (columns, rails, seats,
// trim) showed each polygon as a facet. Vertices at the same spot get an averaged normal when their faces meet at
// under 50 degrees, so curves shade smoothly and hard edges stay hard. Plain arrays in (positions, index, the current
// normals), a new Float32Array of normals out; vertices with no neighbour at their spot keep their normal.
// Self-contained: its source is also run in a worker.
function smoothNormals(pos,vc,idx,ic,nrm){
  const CREASE=Math.cos(50*Math.PI/180),count=idx?ic:vc,fn=new Float32Array(count),faceOf=new Int32Array(vc).fill(-1),out=Float32Array.from(nrm);
  for(let t=0;t+2<count;t+=3){const i0=idx?idx[t]:t,i1=idx?idx[t+1]:t+1,i2=idx?idx[t+2]:t+2;
    const ax=pos[i0*3],ay=pos[i0*3+1],az=pos[i0*3+2],bx=pos[i1*3]-ax,by=pos[i1*3+1]-ay,bz=pos[i1*3+2]-az,cx=pos[i2*3]-ax,cy=pos[i2*3+1]-ay,cz=pos[i2*3+2]-az;
    fn[t]=by*cz-bz*cy;fn[t+1]=bz*cx-bx*cz;fn[t+2]=bx*cy-by*cx;   // area-weighted face normal
    if(faceOf[i0]<0)faceOf[i0]=t;if(faceOf[i1]<0)faceOf[i1]=t;if(faceOf[i2]<0)faceOf[i2]=t;}
  const groups=new Map();
  for(let i=0;i<vc;i++){if(faceOf[i]<0)continue;const k=Math.round(pos[i*3]*20)+','+Math.round(pos[i*3+1]*20)+','+Math.round(pos[i*3+2]*20);let g=groups.get(k);if(!g)groups.set(k,g=[]);g.push(i);}
  for(const verts of groups.values()){if(verts.length<2)continue;
    for(const i of verts){const f=faceOf[i];let ox=fn[f],oy=fn[f+1],oz=fn[f+2];const ol=Math.hypot(ox,oy,oz)||1;ox/=ol;oy/=ol;oz/=ol;let sx=0,sy=0,sz=0;
      for(const j of verts){const h=faceOf[j],hx=fn[h],hy=fn[h+1],hz=fn[h+2],len=Math.hypot(hx,hy,hz);if(len&&(hx*ox+hy*oy+hz*oz)/len>=CREASE){sx+=hx;sy+=hy;sz+=hz;}}
      const sl=Math.hypot(sx,sy,sz);if(sl>0){out[i*3]=sx/sl;out[i*3+1]=sy/sl;out[i*3+2]=sz/sl;}}}
  return out;
}
