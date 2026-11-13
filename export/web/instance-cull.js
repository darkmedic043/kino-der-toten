// Static instanced props: batched per material and culled per instance (not part of upstream; docs/fork/performance.md).
// Ported maps place props as InstancedMeshes split per model per map cell (The Giant: 3,737 meshes, 40,000 instances,
// 17M triangles; an I-beam bracket alone is placed 1,570 times). The cells' bounding spheres are huge, so three's
// frustum culling kept nearly all of them, every instance was drawn at full detail, and the frame was CPU-bound on
// ~3,500 prop draws. Here every such mesh goes into a THREE.BatchedMesh per material and vertex layout (one multi-draw
// call for many different models), with world matrices baked in and the originals taken out of the scene (kept in `detached`). When the
// camera moves, turns or zooms enough, instances outside a widened view frustum or covering fewer than `pixels` on
// screen (bounding radius over distance, scaled by the projection) are switched off with setVisibleAt. Raycasts don't see these props any more;
// collision and bullets use the world's own colliders.
import * as THREE from 'three';
import { MeshoptSimplifier } from './vendor/meshopt_simplifier.js';
import { imageOf, dropImage, hasImage, restoreImages } from './texture-memory.js';

// three r185 bug: WebGLRenderer.setProgram tests `object.colorTexture` on a BatchedMesh, but the class keeps it in
// `_colorsTexture`; for a batch without colours `undefined !== null` held, so every batched draw looked its program up
// again (getProgram/getParameters ~15% of a Giant frame). Give the class the name the renderer reads.
if(!('colorTexture' in THREE.BatchedMesh.prototype))Object.defineProperty(THREE.BatchedMesh.prototype,'colorTexture',{configurable:true,get(){return this._colorsTexture;}});

const M=new THREE.Matrix4(),W=new THREE.Matrix4(),C=new THREE.Vector3(),S=new THREE.Vector3(),Q=new THREE.Quaternion(),COL=new THREE.Color();
const F=new THREE.Frustum(),PV=new THREE.Matrix4(),DIR=new THREE.Vector3(),LAST_DIR=new THREE.Vector3();
const MARGIN=.18;   // radians of slack around the view (about 10°): culling re-runs after a 4° turn, so edges never show gaps

// Distance LODs: each prop model over LOD_MIN triangles gets simplified copies (meshoptimizer, vendored, MIT) at these
// index fractions and relative errors; an instance uses LOD0 while it covers at least LOD_PX[0] pixels, LOD1 down to
// LOD_PX[1], then LOD2. Only the vertices a LOD uses are kept.
const LOD_MIN=200,LODS=[[.25,.02],[.08,.06]],LOD_PX=[110,40];
function lodsOf(g){
  if(!g.index||g.index.count/3<LOD_MIN)return [];
  const pos=g.attributes.position,n=pos.count,P=new Float32Array(n*3);for(let i=0;i<n;i++){P[i*3]=pos.getX(i);P[i*3+1]=pos.getY(i);P[i*3+2]=pos.getZ(i);}
  const src=new Uint32Array(g.index.array),out=[];let prev=src.length;
  for(const [frac,err] of LODS){
    const target=Math.max(3,Math.floor(src.length*frac/3)*3);
    let [idx]=MeshoptSimplifier.simplify(src,P,3,target,err,[]);
    if(idx.length<3||idx.length>prev*.8)break;   // no real saving
    prev=idx.length;
    // compact: keep only the vertices this LOD uses
    const map=new Int32Array(n).fill(-1),order=[];for(let i=0;i<idx.length;i++){const v=idx[i];if(map[v]<0){map[v]=order.length;order.push(v);}idx[i]=map[v];}
    const lg=new THREE.BufferGeometry();
    for(const [name,a] of Object.entries(g.attributes)){const T=a.array.constructor,arr=new T(order.length*a.itemSize);
      for(let i=0;i<order.length;i++)for(let c=0;c<a.itemSize;c++)arr[i*a.itemSize+c]=a.array[order[i]*a.itemSize+c];
      lg.setAttribute(name,new THREE.BufferAttribute(arr,a.itemSize,a.normalized));}
    lg.setIndex(new THREE.BufferAttribute(order.length>65535?idx:new Uint16Array(idx),1));out.push(lg);
  }
  return out;
}

// Texture arrays (map entry `textureArrays`: the layer size in px, e.g. 256; Der Eisendrache). Batching per material
// leaves one draw per material, and a ported BO3 map has thousands (Der Eisendrache: ~2,200 batches, 28 FPS looking
// over the castle; each draw costs ~10 µs of three.js work whatever its size). With arrays, opaque and cut-out
// MeshStandardMaterials that differ only by their colour/normal maps and colour share one batch: their maps become
// layers of two DataArrayTextures (filled on the GPU from the decoded images, resized to the layer size), and each
// instance carries its layers (a float texture read through gl_DrawID, as three reads its matrices) and its colour
// (the material's colour x the instance's, BatchedMesh colours).
const NO_ARRAY_MAPS=['lightMap','aoMap','emissiveMap','roughnessMap','metalnessMap','alphaMap','bumpMap','displacementMap','envMap','specularMap'];
const plainUv=t=>!t||(t.offset.x===0&&t.offset.y===0&&t.repeat.x===1&&t.repeat.y===1&&t.rotation===0&&t.channel===0&&t.wrapS===THREE.RepeatWrapping&&t.wrapT===THREE.RepeatWrapping);
// GPU-compressed (KTX2) maps go into compressed arrays instead (2026-10-17): their blocks can't be resized, so those
// batches split by map size, format and mip count, and the map and normal map must both be compressed or both not.
const packed=t=>!!t?.isCompressedTexture&&t.mipmaps?.length>0&&t.mipmaps.every(l=>l.data);
const texKey=t=>!t?'':packed(t)?`c${t.image.width}x${t.image.height}:${t.format}:${t.mipmaps.length}`:'i';
// (2026-10-17) a map whose decoded image texture-memory.js already released (uploaded during loading) still qualifies:
// fillArray gets it back from its file. Transparent materials qualify too (prop decals and glass: ~130 draws a view on
// Der Eisendrache), grouped by their blend state; a batch of them draws in instance order, which for overlays with a
// polygon offset is as stable as the per-material order they had
// (2026-11-13) two more kinds join: a colour map tiled evenly (map-detail.js sets `repeat` on 328 of Der Eisendrache's
// materials: each had fallen back to a batch of its own), its repeat carried per instance next to the layers, and
// materials with no colour map at all (418 on Der Eisendrache), which share a batch that samples no map array.
// Tiled maps join only as compressed textures (layers at their own size and mip chain): an image is resized to the
// array's size, which blurs a larger one and puts a seam at every repeat of a smaller one.
// The arrays filter as sharply as their sharpest member (map-materials raises the maps to 16x: at a fixed 4x a
// floor in a batch went soft along a corridor).
const tiledUv=t=>t.offset.x===0&&t.offset.y===0&&t.repeat.x===t.repeat.y&&t.rotation===0&&t.channel===0&&t.wrapS===THREE.RepeatWrapping&&t.wrapT===THREE.RepeatWrapping;
const arrayable=m=>m.isMeshStandardMaterial&&!m.isMeshPhysicalMaterial&&!NO_ARRAY_MAPS.some(k=>m[k])&&plainUv(m.normalMap)&&(m.map
  ?hasImage(m.map.source)&&tiledUv(m.map)&&(m.map.isCompressedTexture?packed(m.map)&&(!m.normalMap||packed(m.normalMap)):plainUv(m.map)&&!m.normalMap?.isCompressedTexture)
  :!m.normalMap||(m.normalMap.isCompressedTexture?packed(m.normalMap):hasImage(m.normalMap.source)));
const arrayKey=m=>[texKey(m.map),texKey(m.normalMap),m.side,m.alphaTest,m.transparent,m.opacity,m.depthWrite,m.depthTest,m.blending,m.polygonOffset,m.polygonOffsetFactor,m.polygonOffsetUnits,m.forceSinglePass,!!m.normalMap,m.normalMap?m.normalScale.toArray().join():'',m.roughness,m.metalness,m.emissive.getHex(),m.emissiveIntensity,m.flatShading,m.vertexColors,m.fog,m.map?.colorSpace,m.map?'':texKey(m.normalMap),m.customProgramCacheKey()].join(',');
// Followers (2026-11-13): a plain mesh a mod marks `userData.batchFollow` joins a texture-array batch but stays in the
// scene graph on no render layer, and its instance copies its world matrix and visibility every frame (doors, crates,
// panels, scripted models: on Der Eisendrache ~600 draws a view were such pieces, one per material). A piece whose
// material, geometry, colour, opacity or glow a mod changes goes back to drawing itself.
export const canFollow=o=>!!o.isMesh&&!o.isInstancedMesh&&!o.isSkinnedMesh&&!o.isBatchedMesh&&!Array.isArray(o.material)&&!o.morphTargetInfluences?.length&&arrayable(o.material)
  &&!Object.values(o.geometry.attributes).some(a=>a.isInterleavedBufferAttribute)&&!Object.keys(o.geometry.morphAttributes).length;
function arrayMaterial(base,mapArray,normalArray,layerTex){
  const m=base.clone();m.name='array_'+base.name;m.color.set(1,1,1);
  if(mapArray){const dummy=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);dummy.needsUpdate=true;dummy.colorSpace=base.map.colorSpace;m.map=dummy;}
  if(normalArray){const dn=new THREE.DataTexture(new Uint8Array([128,128,255,255]),1,1);dn.needsUpdate=true;m.normalMap=dn;}
  const prev=base.onBeforeCompile,prevKey=base.customProgramCacheKey.bind(base);
  m.onBeforeCompile=(sh,r)=>{prev?.call(m,sh,r);if(!layerTex)return;   // no maps at all: colours only, three's own batching shader
    sh.uniforms.layerTex={value:layerTex};if(mapArray)sh.uniforms.mapArray={value:mapArray};if(normalArray)sh.uniforms.normalArray={value:normalArray};
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nuniform highp sampler2D layerTex;\nflat varying vec2 vLayer;')
      .replace('#include <batching_vertex>','#include <batching_vertex>\n{ int li = int( getIndirectIndex( gl_DrawID ) ), ls = textureSize( layerTex, 0 ).x; vec4 lt = texelFetch( layerTex, ivec2( li % ls, li / ls ), 0 ); vLayer = lt.rg;'+(mapArray?' vMapUv *= lt.b;':'')+' }');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>'+(mapArray?'\nuniform highp sampler2DArray mapArray;':'')+(normalArray?'\nuniform highp sampler2DArray normalArray;':'')+'\nflat varying vec2 vLayer;')
      .replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )','texture( mapArray, vec3( vMapUv, vLayer.x ) )'))
      .replace('#include <normal_fragment_maps>',THREE.ShaderChunk.normal_fragment_maps.replaceAll('texture2D( normalMap, vNormalMapUv )','texture( normalArray, vec3( vNormalMapUv, vLayer.y ) )'));
  };
  // (replaceAll, 2026-11-13: the chunk samples the normal map in two branches, object space first; a plain replace
  // patched only that one, so every array batch had been lit with the flat stand-in normal map since 2026-10-17)
  m.customProgramCacheKey=()=>prevKey()+(layerTex?'|texture-array2'+(mapArray?'m':'')+(normalArray?'n':''):'');
  return m;
}
// a DataArrayTexture with one layer per source, filled on the GPU (no copy of the pixels in RAM)
async function fillArray(renderer,sources,size,colorSpace,anisotropy=4){
  const t=new THREE.DataArrayTexture(null,size,size,sources.length);t.source.dataReady=false;
  Object.assign(t,{format:THREE.RGBAFormat,type:THREE.UnsignedByteType,colorSpace,generateMipmaps:false,minFilter:THREE.LinearMipmapLinearFilter,magFilter:THREE.LinearFilter,wrapS:THREE.RepeatWrapping,wrapT:THREE.RepeatWrapping,anisotropy});
  t.mipmaps=[];t.needsUpdate=true;renderer.initTexture(t);
  const gl=renderer.getContext(),wt=renderer.properties.get(t).__webglTexture;
  // decoded (a released image comes back from its file) and resized 32 at a time: one by one took ~175 ms each
  let next=0;
  await Promise.all(Array.from({length:Math.min(32,sources.length)},async()=>{
    while(next<sources.length){
      const i=next++,img=await imageOf(sources[i]);if(!img)continue;
      const fit=img.width===size&&img.height===size?img:await createImageBitmap(img,{resizeWidth:size,resizeHeight:size,resizeQuality:'high'});
      gl.bindTexture(gl.TEXTURE_2D_ARRAY,wt);gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,i,size,size,1,gl.RGBA,gl.UNSIGNED_BYTE,fit);
      if(fit!==img)fit.close();if(img!==sources[i].data)img.close?.();
    }
  }));
  gl.bindTexture(gl.TEXTURE_2D_ARRAY,wt);gl.generateMipmap(gl.TEXTURE_2D_ARRAY);renderer.resetState();
  return t;
}

// a CompressedArrayTexture from same-sized compressed textures: each mip level holds every layer's blocks back to back.
// Its own copy of the blocks is dropped once uploaded (the engine reloads the page after a context loss anyway).
function compressedArray(textures,colorSpace,anisotropy=4){
  const first=textures[0],levels=first.mipmaps.map((l,i)=>{const size=l.data.byteLength,data=new Uint8Array(size*textures.length);
    textures.forEach((t,k)=>data.set(new Uint8Array(t.mipmaps[i].data.buffer,t.mipmaps[i].data.byteOffset,size),k*size));return {data,width:l.width,height:l.height};});
  const t=new THREE.CompressedArrayTexture(levels,first.image.width,first.image.height,textures.length,first.format,first.type);
  Object.assign(t,{colorSpace,generateMipmaps:false,minFilter:levels.length>1?THREE.LinearMipmapLinearFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,wrapS:THREE.RepeatWrapping,wrapT:THREE.RepeatWrapping,anisotropy});
  t.onUpdate=()=>{for(const l of t.mipmaps)l.data=new Uint8Array(0);};t.needsUpdate=true;
  return t;
}

// meshes: also batch plain (non-instanced, non-skinned) meshes whose material can go into a texture array, one instance
// each and without distance LODs (Kino's map shell: 753 meshes, 416 materials, 6.7 ms of a 21 ms frame).
export async function createInstanceCuller(root,{exclude=o=>o.userData.noCull,target=root,renderer=null,arrays=0,meshes=false}={}){
  await MeshoptSimplifier.ready;const t0=performance.now();
  const groups=new Map();
  const maxLayers=renderer&&arrays?renderer.getContext().getParameter(renderer.getContext().MAX_ARRAY_TEXTURE_LAYERS):0,chunks=new Map();   // array groups split when they'd pass the layer limit
  root.updateMatrixWorld(true);
  const visit=o=>{
    const plainMesh=o.isMesh&&!o.isInstancedMesh&&!o.isSkinnedMesh&&!o.isBatchedMesh,follow=maxLayers>0&&plainMesh&&!!o.userData.batchFollow,single=plainMesh&&(meshes||follow);
    if(!(o.isInstancedMesh&&o.count>0||single)||!follow&&!o.visible||exclude(o)||Array.isArray(o.material)||o.morphTargetInfluences?.length)return;
    if(!follow)for(let p=o.parent;p;p=p.parent)if(!p.visible)return;   // a follower may be hidden now and shown later
    const g=o.geometry;if(Object.values(g.attributes).some(a=>a.isInterleavedBufferAttribute)||Object.keys(g.morphAttributes).length)return;
    const layout=Object.keys(g.attributes).sort().map(k=>`${k}:${g.attributes[k].itemSize}${g.attributes[k].normalized?'n':''}:${g.attributes[k].array.constructor.name}`).join(',');
    const arr=maxLayers&&arrayable(o.material),rest=[layout,!!g.index,o.castShadow,o.receiveShadow,arr&&o.material.transparent?Math.floor(o.renderOrder/1000):o.renderOrder,o.layers.mask,follow?'f':''].join('|');
    if(single&&!arr)return;   // a plain mesh only joins a texture-array batch (per-material batching saves it nothing)
    let key=[o.material.uuid,rest].join('|');
    if(arr){const base='arr|'+arrayKey(o.material)+'|'+rest;let c=chunks.get(base);
      if(!c)chunks.set(base,c={k:0,maps:new Set(),normals:new Set()});
      const m=o.material,grow=(!m.map||c.maps.has(m.map.source)?0:1),growN=(m.normalMap&&!c.normals.has(m.normalMap.source)?1:0);
      if(c.maps.size+grow>maxLayers||c.normals.size+growN>maxLayers){c.k++;c.maps=new Set();c.normals=new Set();}
      if(m.map)c.maps.add(m.map.source);if(m.normalMap)c.normals.add(m.normalMap.source);key=base+'|'+c.k;}
    let e=groups.get(key);if(!e)groups.set(key,e={sources:[],n:0,color:false,geos:new Map(),arr,follow});
    e.sources.push(o);e.n+=single?1:o.count;if(o.instanceColor)e.color=true;if(single)(e.single??=new Set()).add(g);
    if(!e.geos.has(g)){g.boundingSphere||g.computeBoundingSphere();e.geos.set(g,null);}
  };
  root.traverse(visit);
  // followers outside the root (a custom map's door parts are moved to the scene): marked pieces anywhere under the target
  if(maxLayers>0&&target!==root){const inRoot=o=>{for(let p=o;p;p=p.parent)if(p===root)return true;return false;};
    target.traverse(o=>{if(o.userData.batchFollow&&!inRoot(o)){o.updateWorldMatrix(true,false);visit(o);}});}
  // A material drawn both by a batch (USE_BATCHING) and by a plain mesh flips three's program on every draw
  // (getProgram/getParameters ~14% of a frame), so such batches get their own copy (textures shared).
  const plain=new Set();root.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh)for(const m of [o.material].flat())plain.add(m);});
  const list=[],detached=[],arraySources=[],followers=[];
  const tInv=target.matrixWorld.equals(new THREE.Matrix4())?null:new THREE.Matrix4().copy(target.matrixWorld).invert();
  let lastYield=performance.now();
  for(const e of groups.values()){
    if(performance.now()-lastYield>40){await new Promise(r=>setTimeout(r,0));lastYield=performance.now();}   // keep the page painting
    const lods=new Map();for(const g of e.geos.keys())lods.set(g,e.single?.has(g)?[]:lodsOf(g));   // walls don't get LODs
    let verts=0,index=0;for(const g of e.geos.keys())for(const x of [g,...lods.get(g)]){verts+=x.attributes.position.count;index+=x.index?x.index.count:0;}
    const first=e.sources[0];let mat,layerOf=null,layerTex=null;
    if(e.arr){   // texture-array batch: layers per map source, a layer pair per instance
      const maps=new Map(),normals=new Map();for(const o of e.sources){const m=o.material;if(m.map&&!maps.has(m.map.source))maps.set(m.map.source,maps.size);if(m.normalMap&&!normals.has(m.normalMap.source))normals.set(m.normalMap.source,normals.size);}
      let mapArray=null,normalArray=null;const cs=first.material.map?.colorSpace,an=k=>e.sources.reduce((a,o)=>Math.max(a,o.material[k]?.anisotropy??1),4);
      if((first.material.map??first.material.normalMap)?.isCompressedTexture){   // the textures behind each source, in layer order
        const tex=src=>{const out=[];for(const s of src.keys())out.push(e.sources.map(o=>o.material).flatMap(m=>[m.map,m.normalMap]).find(t=>t?.source===s));return out;};
        if(maps.size)mapArray=compressedArray(tex(maps),cs,an('map'));if(normals.size)normalArray=compressedArray(tex(normals),THREE.NoColorSpace,an('normalMap'));
      }else{if(maps.size)mapArray=await fillArray(renderer,[...maps.keys()],arrays,cs,an('map'));normalArray=normals.size?await fillArray(renderer,[...normals.keys()],arrays,THREE.NoColorSpace,an('normalMap')):null;}
      // per instance: colour layer, normal layer, colour map repeat (none of it for a batch with no maps)
      if(maps.size||normals.size){const ls=Math.ceil(Math.sqrt(e.n));layerTex=new THREE.DataTexture(new Float32Array(ls*ls*4),ls,ls,THREE.RGBAFormat,THREE.FloatType);}
      mat=arrayMaterial(first.material,mapArray,normalArray,layerTex);mat.userData={...first.material.userData,textureArray:{maps:maps.size,normals:normals.size}};
      layerOf=m=>[m.map?maps.get(m.map.source):0,m.normalMap?normals.get(m.normalMap.source):0,m.map?m.map.repeat.x:1];e.color=true;arraySources.push(...maps.keys(),...normals.keys());
    }else{mat=plain.has(first.material)?first.material.clone():first.material;
      // clone() keeps userData (the lighting mod's `baked` flag) but not onBeforeCompile, so the copy lost Kino's baked
      // light patch for good and those props rendered near black (2026-10-15 to -17): carry the shader hooks over
      if(mat!==first.material){mat.userData={...first.material.userData,batchCopyOf:first.material};mat.onBeforeCompile=first.material.onBeforeCompile;mat.customProgramCacheKey=first.material.customProgramCacheKey;}}
    const batch=new THREE.BatchedMesh(e.n,verts,index||undefined,mat);
    batch.name='batch_'+(first.material.name||first.name);// three's own per-instance culling and sorting run on every render over every instance (~40,000: slower than the
    // draws they save); culling is done here instead, only when the camera has moved or turned enough
    batch.sortObjects=false;batch.perObjectFrustumCulled=false;
    // plain map meshes (walls) cast shadows, so the culler leaves them unculled; three's own per-instance culling is cheap
    // at their counts and culls against each camera, the shadow cameras included (BatchedMesh.onBeforeShadow)
    if(e.single)batch.perObjectFrustumCulled=true;
    // followers move: no batch-level bounds test; culled here by the mask (shadow casters by three, per camera)
    if(e.follow){batch.frustumCulled=false;batch.perObjectFrustumCulled=first.castShadow;}
    for(const p of ['castShadow','receiveShadow','renderOrder'])batch[p]=first[p];batch.layers.mask=first.layers.mask;
    if(e.arr&&first.material.transparent)batch.renderOrder=Math.min(...e.sources.map(o=>o.renderOrder));
    for(const g of e.geos.keys())e.geos.set(g,[batch.addGeometry(g),...lods.get(g).map(l=>{const id=batch.addGeometry(l);l.dispose();return id;})]);   // [LOD0, LOD1, LOD2]
    const n=e.n,pos=new Float32Array(n*3),rad=new Float32Array(n),ids=new Int32Array(n),geo=[],lod=new Uint8Array(n),fl=[];let k=0;
    for(const o of e.sources){
      const gids=e.geos.get(o.geometry),gid=gids[0],bs=o.geometry.boundingSphere,count=o.isInstancedMesh?o.count:1;
      for(let i=0;i<count;i++,k++){
        if(o.isInstancedMesh){M.fromArray(o.instanceMatrix.array,i*16);W.multiplyMatrices(o.matrixWorld,M);}else W.copy(o.matrixWorld);
        const id=batch.addInstance(gid);batch.setMatrixAt(id,W);ids[k]=id;geo[k]=gids;
        if(e.color){if(o.instanceColor)COL.fromArray(o.instanceColor.array,i*3);else COL.setRGB(1,1,1);if(e.arr)COL.multiply(o.material.color);batch.setColorAt(id,COL);}
        if(layerTex){const [lc,ln,rp]=layerOf(o.material),d=layerTex.image.data;d[id*4]=lc;d[id*4+1]=ln;d[id*4+2]=rp;}
        C.copy(bs.center).applyMatrix4(W);pos[k*3]=C.x;pos[k*3+1]=C.y;pos[k*3+2]=C.z;
        W.decompose(C,Q,S);rad[k]=bs.radius*Math.max(Math.abs(S.x),Math.abs(S.y),Math.abs(S.z));
      }
      if(e.follow){fl.push({o,k:k-1,id:ids[k-1],m:o.material,g:o.geometry,layers:o.layers.mask});o.layers.mask=0;}else{detached.push([o,o.parent]);o.parent.remove(o);}
      o.userData.batchedInto=batch;
    }
    if(layerTex)layerTex.needsUpdate=true;
    batch.matrixAutoUpdate=false;target.add(batch);
    if(!target.matrixWorld.equals(new THREE.Matrix4())){   // matrices above are world space: undo the target's transform
      const inv=new THREE.Matrix4().copy(target.matrixWorld).invert();for(let i=0;i<n;i++){batch.getMatrixAt(ids[i],M);batch.setMatrixAt(ids[i],M.premultiply(inv));}}
    batch.computeBoundingSphere();batch.computeBoundingBox();
    const entry={mesh:batch,n,pos,rad,ids,geo,lod,mask:new Uint8Array(n).fill(1),kept:n,frustum:!batch.castShadow};list.push(entry);
    if(fl.length){entry.alive=new Uint8Array(n).fill(1);for(const f of fl){const m=f.m;followers.push(Object.assign(f,{e:entry,vis:true,off:false,last:new Float64Array(f.o.matrixWorld.elements),mv:m.version,op:m.opacity,ei:m.emissiveIntensity,cr:m.color.r,cg:m.color.g,cb:m.color.b,er:m.emissive.r,eg:m.emissive.g,eb:m.emissive.b}));}}   // shadow casters: size only, so off-screen props keep their shadows
  }
  // empty per-cell group nodes left behind go too
  for(const [,parent] of [...detached]){let q=parent;while(q&&q!==root&&!q.children.length&&q.parent&&!q.isMesh&&!q.userData.keep){const up=q.parent;up.remove(q);detached.push([q,up]);q=up;}}
  // the batches hold their own copies: free the originals' GPU buffers unless something left in the scene still uses them
  {const used=new Set();target.traverse(o=>{if(o.isMesh&&!o.isBatchedMesh)used.add(o.geometry);});
    for(const [o] of detached)if(o.isMesh&&o.geometry&&!used.has(o.geometry)){o.geometry.dispose();used.add(o.geometry);}}
  // maps now held in arrays: their decoded images go unless something still in the scene draws them
  if(arraySources.length){const used=new Set();target.traverse(o=>{if(!o.material||o.material.userData?.textureArray||o.userData.batchedInto)return;for(const m of [o.material].flat())for(const k in m)if(m[k]?.isTexture)used.add(m[k].source);});
    for(const s of new Set(arraySources))if(!used.has(s))dropImage(s);
    // compressed maps now in compressed arrays: free the originals' GPU copies too (a later draw would upload them again)
    for(const o of [...detached.map(d=>d[0]),...followers.map(f=>f.o)])for(const m of [o.material].flat())for(const k of ['map','normalMap']){const t=m?.[k];if(t?.isCompressedTexture&&!used.has(t.source))t.dispose();}}
  const buildMs=Math.round(performance.now()-t0);
  const instances=list.reduce((a,e)=>a+e.n,0),sources=[...groups.values()].reduce((a,g)=>a+g.sources.length,0);
  let lastPos=null,lastKey='',drawn=instances;
  // followers, every frame: visibility of the piece and its parent chain (once per parent per frame), its world matrix,
  // and a look at what a mod may have changed on it
  let frame=0,released=0,top=target;while(top.parent)top=top.parent;
  const parVis=new Map();
  const chain=o=>{for(let p=o;;p=p.parent){if(!p.visible)return false;if(!p.parent)return p===top;}};
  const visOf=par=>{let v=parVis.get(par);if(!v)parVis.set(par,v={f:-1,on:true});if(v.f!==frame){v.f=frame;v.on=chain(par);}return v.on;};
  const show=(f,on)=>{const e=f.e;e.alive[f.k]=on;if(on!==e.mask[f.k]){e.mask[f.k]=on;e.mesh.setVisibleAt(f.id,!!on);e.kept+=on?1:-1;e.mesh.visible=e.kept>0;}};
  function release(f){f.off=true;show(f,0);f.o.layers.mask=f.layers;delete f.o.userData.batchedInto;restoreImages(f.o);released++;}
  function sync(){
    frame++;
    for(const f of followers){
      if(f.off)continue;
      const o=f.o,m=o.material;
      if(m!==f.m||o.geometry!==f.g||m.version!==f.mv||m.opacity!==f.op||m.emissiveIntensity!==f.ei||m.color.r!==f.cr||m.color.g!==f.cg||m.color.b!==f.cb||m.emissive.r!==f.er||m.emissive.g!==f.eg||m.emissive.b!==f.eb){release(f);continue;}
      const vis=o.visible&&!!o.parent&&visOf(o.parent),w=o.matrixWorld.elements,l=f.last;let moved=false;
      for(let j=0;j<15;j++)if(w[j]!==l[j]){moved=true;break;}
      if(moved){
        const e=f.e,bs=f.g.boundingSphere;l.set(w);W.copy(o.matrixWorld);
        C.copy(bs.center).applyMatrix4(W);e.pos[f.k*3]=C.x;e.pos[f.k*3+1]=C.y;e.pos[f.k*3+2]=C.z;e.rad[f.k]=bs.radius*W.getMaxScaleOnAxis();
        if(tInv)W.premultiply(tInv);e.mesh.setMatrixAt(f.id,W);
      }
      if(vis!==f.vis||moved&&vis){f.vis=vis;show(f,vis?1:0);}   // a moved piece is drawn until the next culling pass
    }
  }

  return {
    meshes:list.length,sources,instances,detached,buildMs,batches:list.map(e=>e.mesh),
    get drawn(){return drawn;},followers:followers.length,get released(){return released;},get shown(){let n=0;for(const f of followers)if(f.vis&&!f.off)n++;return n;},
    // camera: the render camera; height: drawing-buffer height in px; pixels: the smallest instance kept (0 = all)
    update(camera,height,pixels,force=false){
      if(!list.length)return false;
      if(followers.length)sync();
      camera.updateMatrixWorld();const p=camera.getWorldPosition(C),dir=camera.getWorldDirection(DIR);
      const k=height/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2))*(camera.zoom??1),key=pixels+'|'+Math.round(k)+'|'+camera.aspect.toFixed(2);
      if(!force&&lastPos&&key===lastKey&&lastPos.distanceToSquared(p)<12*12&&dir.dot(LAST_DIR)>.9976)return false;   // < 12 units, < 4°
      lastPos=(lastPos??new THREE.Vector3()).copy(p);LAST_DIR.copy(dir);lastKey=key;drawn=0;
      PV.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);F.setFromProjectionMatrix(PV);
      const planes=F.planes,f=pixels>0?k/pixels:Infinity,slack=Math.sin(MARGIN);
      for(const e of list){
        const {mesh,n,pos,rad,ids,mask,geo,lod}=e;let kept=0;
        for(let i=0;i<n;i++){
          const x=pos[i*3],y=pos[i*3+1],z=pos[i*3+2],dx=x-p.x,dy=y-p.y,dz=z-p.z,d2=dx*dx+dy*dy+dz*dz,r=rad[i];
          let on=(!e.alive||e.alive[i])&&d2<=r*r*f*f?1:0;   // radius*k/d >= pixels
          if(on&&e.frustum){const m=r+Math.sqrt(d2)*slack;for(let j=0;j<6;j++){const pl=planes[j];if(pl.normal.x*x+pl.normal.y*y+pl.normal.z*z+pl.constant<-m){on=0;break;}}}
          if(on!==mask[i]){mask[i]=on;mesh.setVisibleAt(ids[i],!!on);}
          if(on&&geo[i].length>1){   // distance LOD by on-screen size (px = radius*k/d)
            const px2=r*r*k*k/(d2||1),want=px2>=LOD_PX[0]*LOD_PX[0]?0:px2>=LOD_PX[1]*LOD_PX[1]?1:2,l=Math.min(want,geo[i].length-1);
            if(l!==lod[i]){lod[i]=l;mesh.setGeometryIdAt(ids[i],geo[i][l]);}}
          kept+=on;
        }
        e.kept=kept;drawn+=kept;mesh.visible=kept>0;   // an empty batch still costs a trip through the renderer (~10 µs; Der Eisendrache has ~2,900)
      }
      return true;
    },
    // every instance back on (e.g. before a bake that renders the whole map)
    restore(){for(const e of list){for(let i=0;i<e.n;i++)if(!e.mask[i]&&(!e.alive||e.alive[i])){e.mask[i]=1;e.mesh.setVisibleAt(e.ids[i],true);}e.kept=e.n;e.mesh.visible=true;}lastPos=null;drawn=instances;},
  };
}
