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
import { imageOf, dropImage } from './texture-memory.js';

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
const arrayable=m=>m.isMeshStandardMaterial&&!m.isMeshPhysicalMaterial&&!m.transparent&&m.map?.source?.data&&!NO_ARRAY_MAPS.some(k=>m[k])&&plainUv(m.map)&&plainUv(m.normalMap);
const arrayKey=m=>[m.side,m.alphaTest,!!m.normalMap,m.normalMap?m.normalScale.toArray().join():'',m.roughness,m.metalness,m.emissive.getHex(),m.emissiveIntensity,m.flatShading,m.vertexColors,m.fog,m.map.colorSpace,m.customProgramCacheKey()].join(',');
function arrayMaterial(base,mapArray,normalArray,layerTex){
  const m=base.clone();m.name='array_'+base.name;m.color.set(1,1,1);
  const dummy=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);dummy.needsUpdate=true;dummy.colorSpace=base.map.colorSpace;m.map=dummy;
  if(normalArray){const dn=new THREE.DataTexture(new Uint8Array([128,128,255,255]),1,1);dn.needsUpdate=true;m.normalMap=dn;}
  const prev=base.onBeforeCompile,prevKey=base.customProgramCacheKey.bind(base);
  m.onBeforeCompile=(sh,r)=>{prev?.call(m,sh,r);
    sh.uniforms.layerTex={value:layerTex};sh.uniforms.mapArray={value:mapArray};if(normalArray)sh.uniforms.normalArray={value:normalArray};
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nuniform highp sampler2D layerTex;\nflat varying vec2 vLayer;')
      .replace('#include <batching_vertex>','#include <batching_vertex>\n{ int li = int( getIndirectIndex( gl_DrawID ) ), ls = textureSize( layerTex, 0 ).x; vLayer = texelFetch( layerTex, ivec2( li % ls, li / ls ), 0 ).rg; }');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform highp sampler2DArray mapArray;'+(normalArray?'\nuniform highp sampler2DArray normalArray;':'')+'\nflat varying vec2 vLayer;')
      .replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )','texture( mapArray, vec3( vMapUv, vLayer.x ) )'))
      .replace('#include <normal_fragment_maps>',THREE.ShaderChunk.normal_fragment_maps.replace('texture2D( normalMap, vNormalMapUv )','texture( normalArray, vec3( vNormalMapUv, vLayer.y ) )'));
  };
  m.customProgramCacheKey=()=>prevKey()+'|texture-array';
  return m;
}
// a DataArrayTexture with one layer per source, filled on the GPU (no copy of the pixels in RAM)
async function fillArray(renderer,sources,size,colorSpace){
  const t=new THREE.DataArrayTexture(null,size,size,sources.length);t.source.dataReady=false;
  Object.assign(t,{format:THREE.RGBAFormat,type:THREE.UnsignedByteType,colorSpace,generateMipmaps:false,minFilter:THREE.LinearMipmapLinearFilter,magFilter:THREE.LinearFilter,wrapS:THREE.RepeatWrapping,wrapT:THREE.RepeatWrapping,anisotropy:4});
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

export async function createInstanceCuller(root,{exclude=o=>o.userData.noCull,target=root,renderer=null,arrays=0}={}){
  await MeshoptSimplifier.ready;const t0=performance.now();
  const groups=new Map();
  const maxLayers=renderer&&arrays?renderer.getContext().getParameter(renderer.getContext().MAX_ARRAY_TEXTURE_LAYERS):0,chunks=new Map();   // array groups split when they'd pass the layer limit
  root.updateMatrixWorld(true);
  root.traverse(o=>{
    if(!o.isInstancedMesh||o.count<1||!o.visible||exclude(o)||Array.isArray(o.material)||o.morphTargetInfluences?.length)return;
    for(let p=o.parent;p;p=p.parent)if(!p.visible)return;
    const g=o.geometry;if(Object.values(g.attributes).some(a=>a.isInterleavedBufferAttribute)||Object.keys(g.morphAttributes).length)return;
    const layout=Object.keys(g.attributes).sort().map(k=>`${k}:${g.attributes[k].itemSize}${g.attributes[k].normalized?'n':''}:${g.attributes[k].array.constructor.name}`).join(',');
    const arr=maxLayers&&arrayable(o.material),rest=[layout,!!g.index,o.castShadow,o.receiveShadow,o.renderOrder,o.layers.mask].join('|');
    let key=[o.material.uuid,rest].join('|');
    if(arr){const base='arr|'+arrayKey(o.material)+'|'+rest;let c=chunks.get(base);
      if(!c)chunks.set(base,c={k:0,maps:new Set(),normals:new Set()});
      const m=o.material,grow=(c.maps.has(m.map.source)?0:1),growN=(m.normalMap&&!c.normals.has(m.normalMap.source)?1:0);
      if(c.maps.size+grow>maxLayers||c.normals.size+growN>maxLayers){c.k++;c.maps=new Set();c.normals=new Set();}
      c.maps.add(m.map.source);if(m.normalMap)c.normals.add(m.normalMap.source);key=base+'|'+c.k;}
    let e=groups.get(key);if(!e)groups.set(key,e={sources:[],n:0,color:false,geos:new Map(),arr});
    e.sources.push(o);e.n+=o.count;if(o.instanceColor)e.color=true;
    if(!e.geos.has(g)){g.boundingSphere||g.computeBoundingSphere();e.geos.set(g,null);}
  });
  // A material drawn both by a batch (USE_BATCHING) and by a plain mesh flips three's program on every draw
  // (getProgram/getParameters ~14% of a frame), so such batches get their own copy (textures shared).
  const plain=new Set();root.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh)for(const m of [o.material].flat())plain.add(m);});
  const list=[],detached=[],arraySources=[];
  let lastYield=performance.now();
  for(const e of groups.values()){
    if(performance.now()-lastYield>40){await new Promise(r=>setTimeout(r,0));lastYield=performance.now();}   // keep the page painting
    const lods=new Map();for(const g of e.geos.keys())lods.set(g,lodsOf(g));
    let verts=0,index=0;for(const g of e.geos.keys())for(const x of [g,...lods.get(g)]){verts+=x.attributes.position.count;index+=x.index?x.index.count:0;}
    const first=e.sources[0];let mat,layerOf=null,layerTex=null;
    if(e.arr){   // texture-array batch: layers per map source, a layer pair per instance
      const maps=new Map(),normals=new Map();for(const o of e.sources){const m=o.material;if(!maps.has(m.map.source))maps.set(m.map.source,maps.size);if(m.normalMap&&!normals.has(m.normalMap.source))normals.set(m.normalMap.source,normals.size);}
      const mapArray=await fillArray(renderer,[...maps.keys()],arrays,first.material.map.colorSpace),normalArray=normals.size?await fillArray(renderer,[...normals.keys()],arrays,THREE.NoColorSpace):null;
      const ls=Math.ceil(Math.sqrt(e.n));layerTex=new THREE.DataTexture(new Float32Array(ls*ls*2),ls,ls,THREE.RGFormat,THREE.FloatType);
      mat=arrayMaterial(first.material,mapArray,normalArray,layerTex);mat.userData={...first.material.userData,textureArray:{maps:maps.size,normals:normals.size}};
      layerOf=m=>[maps.get(m.map.source),m.normalMap?normals.get(m.normalMap.source):0];e.color=true;arraySources.push(...maps.keys(),...normals.keys());
    }else{mat=plain.has(first.material)?first.material.clone():first.material;if(mat!==first.material)mat.userData={...first.material.userData,batchCopyOf:first.material};}
    const batch=new THREE.BatchedMesh(e.n,verts,index||undefined,mat);
    batch.name='batch_'+(first.material.name||first.name);// three's own per-instance culling and sorting run on every render over every instance (~40,000: slower than the
    // draws they save); culling is done here instead, only when the camera has moved or turned enough
    batch.sortObjects=false;batch.perObjectFrustumCulled=false;
    for(const p of ['castShadow','receiveShadow','renderOrder'])batch[p]=first[p];batch.layers.mask=first.layers.mask;
    for(const g of e.geos.keys())e.geos.set(g,[batch.addGeometry(g),...lods.get(g).map(l=>{const id=batch.addGeometry(l);l.dispose();return id;})]);   // [LOD0, LOD1, LOD2]
    const n=e.n,pos=new Float32Array(n*3),rad=new Float32Array(n),ids=new Int32Array(n),geo=[],lod=new Uint8Array(n);let k=0;
    for(const o of e.sources){
      const gids=e.geos.get(o.geometry),gid=gids[0],bs=o.geometry.boundingSphere;
      for(let i=0;i<o.count;i++,k++){
        M.fromArray(o.instanceMatrix.array,i*16);W.multiplyMatrices(o.matrixWorld,M);
        const id=batch.addInstance(gid);batch.setMatrixAt(id,W);ids[k]=id;geo[k]=gids;
        if(e.color){if(o.instanceColor)COL.fromArray(o.instanceColor.array,i*3);else COL.setRGB(1,1,1);if(e.arr)COL.multiply(o.material.color);batch.setColorAt(id,COL);}
        if(layerTex){const [lc,ln]=layerOf(o.material);layerTex.image.data[id*2]=lc;layerTex.image.data[id*2+1]=ln;}
        C.copy(bs.center).applyMatrix4(W);pos[k*3]=C.x;pos[k*3+1]=C.y;pos[k*3+2]=C.z;
        W.decompose(C,Q,S);rad[k]=bs.radius*Math.max(Math.abs(S.x),Math.abs(S.y),Math.abs(S.z));
      }
      detached.push([o,o.parent]);o.parent.remove(o);o.userData.batchedInto=batch;
    }
    if(layerTex)layerTex.needsUpdate=true;
    batch.matrixAutoUpdate=false;target.add(batch);
    if(!target.matrixWorld.equals(new THREE.Matrix4())){   // matrices above are world space: undo the target's transform
      const inv=new THREE.Matrix4().copy(target.matrixWorld).invert();for(let i=0;i<n;i++){batch.getMatrixAt(ids[i],M);batch.setMatrixAt(ids[i],M.premultiply(inv));}}
    batch.computeBoundingSphere();batch.computeBoundingBox();
    list.push({mesh:batch,n,pos,rad,ids,geo,lod,mask:new Uint8Array(n).fill(1),kept:n,frustum:!batch.castShadow});   // shadow casters: size only, so off-screen props keep their shadows
  }
  // empty per-cell group nodes left behind go too
  for(const [,parent] of [...detached]){let q=parent;while(q&&q!==root&&!q.children.length&&q.parent&&!q.isMesh&&!q.userData.keep){const up=q.parent;up.remove(q);detached.push([q,up]);q=up;}}
  // the batches hold their own copies: free the originals' GPU buffers unless something left in the scene still uses them
  {const used=new Set();target.traverse(o=>{if(o.isMesh&&!o.isBatchedMesh)used.add(o.geometry);});
    for(const [o] of detached)if(o.isInstancedMesh&&!used.has(o.geometry)){o.geometry.dispose();used.add(o.geometry);}}
  // maps now held in arrays: their decoded images go unless something still in the scene draws them
  if(arraySources.length){const used=new Set();target.traverse(o=>{if(!o.material||o.material.userData?.textureArray)return;for(const m of [o.material].flat())for(const k in m)if(m[k]?.isTexture)used.add(m[k].source);});
    for(const s of new Set(arraySources))if(!used.has(s))dropImage(s);}
  const buildMs=Math.round(performance.now()-t0);
  const instances=list.reduce((a,e)=>a+e.n,0),sources=[...groups.values()].reduce((a,g)=>a+g.sources.length,0);
  let lastPos=null,lastKey='',drawn=instances;

  return {
    meshes:list.length,sources,instances,detached,buildMs,batches:list.map(e=>e.mesh),
    get drawn(){return drawn;},
    // camera: the render camera; height: drawing-buffer height in px; pixels: the smallest instance kept (0 = all)
    update(camera,height,pixels,force=false){
      if(!list.length)return false;
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
          let on=d2<=r*r*f*f?1:0;   // radius*k/d >= pixels
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
    restore(){for(const e of list){for(let i=0;i<e.n;i++)if(!e.mask[i]){e.mask[i]=1;e.mesh.setVisibleAt(e.ids[i],true);}e.kept=e.n;e.mesh.visible=true;}lastPos=null;drawn=instances;},
  };
}
