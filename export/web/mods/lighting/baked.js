// Baked static lighting for Kino: a 3D grid ("irradiance volume") over the map
// holding the light every fixed lamp casts at each point (walls block it), so
// every lamp lights its area from any distance with no per-frame cost and no
// pop-in. Only a few lights (spotlights with beams, fire, the box lamp) stay
// dynamic.
//
// Made offline by .tools/bake-lighting.mjs (loads the game with ?bakeLight);
// stored as baked-light.bin plus baked-light.json (grid origin, cell size,
// dimensions, encoding scale). Per cell: RGB from always-on lamps, RGB from
// lamps that need the power, and the dominant light direction.
import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

// Must match the dynamic lights (SpotLight decay 1.3, penumbra 1) and the
// lighting shader's per-light LIGHT_CLAMP.
const DECAY=1.3,CLAMP=3.2,SCALE=8;
const encode=v=>Math.round(Math.sqrt(Math.min(1,Math.max(0,v)/SCALE))*255);

export async function bakeVolume({scene,sources,exclude,cell=32,onProgress}){
  // Occluders: the visible, opaque map (the collision mesh has no roofs or props).
  const solids=[];scene.traverse(o=>{if(!o.isMesh||o.isSkinnedMesh||!o.visible||!o.geometry?.attributes?.position)return;
    const m=[o.material].flat();if(m.some(x=>!x||x.transparent||x.blending>1||x.alphaTest>0||x.isShaderMaterial||x.isSpriteMaterial))return;solids.push(o);});
  const box=new THREE.Box3();
  for(const o of solids){o.updateWorldMatrix(true,false);if(!o.geometry.boundsTree){o.geometry.boundsTree=new MeshBVH(o.geometry);await new Promise(r=>setTimeout(r,0));}o.raycast=acceleratedRaycast;box.union(new THREE.Box3().setFromObject(o));}
  // Only where light sources are: their bounds, grown by their reach.
  const lb=new THREE.Box3();for(const s of sources)if(!exclude(s)){lb.expandByPoint(s.position.clone().addScalar(-s.radius));lb.expandByPoint(s.position.clone().addScalar(s.radius));}
  box.intersect(lb);
  const origin=box.min.clone().floor(),size=box.getSize(new THREE.Vector3());
  const dims=[Math.ceil(size.x/cell)+1,Math.ceil(size.y/cell)+1,Math.ceil(size.z/cell)+1],n=dims[0]*dims[1]*dims[2];
  const solidRGB=new Uint8Array(n*3),powerRGB=new Uint8Array(n*3),dirRGB=new Uint8Array(n*3);
  const caster=new THREE.Raycaster();caster.firstHitOnly=true;
  const lights=sources.filter(s=>!exclude(s)).map(s=>({s,I:Math.min(s.intensity*560,s.cap??Infinity),r:s.radius,c:s.color,pos:s.position,dir:(s.dir??new THREE.Vector3(0,-1,0)).clone().normalize(),cos:Math.cos(s.angle??1.3),power:s.kind==='power'}));
  const p=new THREE.Vector3(),toL=new THREE.Vector3(),acc=[new THREE.Vector3(),new THREE.Vector3()],dsum=new THREE.Vector3();
  for(let z=0;z<dims[2];z++){
    for(let y=0;y<dims[1];y++)for(let x=0;x<dims[0];x++){
      p.set(origin.x+x*cell,origin.y+y*cell,origin.z+z*cell);acc[0].set(0,0,0);acc[1].set(0,0,0);dsum.set(0,0,0);
      for(const L of lights){
        toL.copy(L.pos).sub(p);const d=toL.length();if(d>=L.r||d<1)continue;
        const cosA=-toL.dot(L.dir)/d,spot=THREE.MathUtils.smoothstep(cosA,L.cos,1);if(spot<=0)continue;
        const fall=1/Math.max(Math.pow(d,DECAY),.01)*Math.pow(THREE.MathUtils.clamp(1-Math.pow(d/L.r,4),0,1),2);
        let r=L.c.r*L.I*fall*spot,g=L.c.g*L.I*fall*spot,b=L.c.b*L.I*fall*spot;const m=Math.max(r,g,b);if(m<.002)continue;
        if(m>CLAMP){const k=CLAMP/m;r*=k;g*=k;b*=k;}
        caster.set(p,toL.clone().divideScalar(d));caster.far=Math.max(1,d-40);   // stop short of the bulb: lamps sit inside their own fixture modelif(caster.intersectObjects(solids,false).length)continue;
        acc[L.power?1:0].x+=r;acc[L.power?1:0].y+=g;acc[L.power?1:0].z+=b;dsum.addScaledVector(toL,(r+g+b)/d);
      }
      const i=((z*dims[1]+y)*dims[0]+x)*3;
      solidRGB[i]=encode(acc[0].x);solidRGB[i+1]=encode(acc[0].y);solidRGB[i+2]=encode(acc[0].z);
      powerRGB[i]=encode(acc[1].x);powerRGB[i+1]=encode(acc[1].y);powerRGB[i+2]=encode(acc[1].z);
      if(dsum.lengthSq()>0)dsum.normalize();else dsum.set(0,1,0);
      dirRGB[i]=Math.round((dsum.x*.5+.5)*255);dirRGB[i+1]=Math.round((dsum.y*.5+.5)*255);dirRGB[i+2]=Math.round((dsum.z*.5+.5)*255);
    }
    onProgress?.(z+1,dims[2]);await new Promise(r=>setTimeout(r,0));
  }
  return {meta:{origin:origin.toArray(),cell,dims,scale:SCALE,decay:DECAY},solidRGB,powerRGB,dirRGB};
}

// Runtime: load the volume into 3D textures and return the uniforms to share.
export async function loadVolume(baseUrl){
  const meta=await fetch(new URL('baked-light.json',baseUrl)).then(r=>r.ok?r.json():null).catch(()=>null);if(!meta)return null;
  // Shipped gzipped (1.5 MB instead of 17 MB; mostly empty space) and inflated in the browser.
  const res=await fetch(new URL('baked-light.bin.gz',baseUrl));if(!res.ok)return null;
  const bin=new Uint8Array(await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const [X,Y,Z]=meta.dims,n=X*Y*Z;
  const tex=(offset)=>{const rgba=new Uint8Array(n*4);for(let i=0;i<n;i++){rgba[i*4]=bin[offset+i*3];rgba[i*4+1]=bin[offset+i*3+1];rgba[i*4+2]=bin[offset+i*3+2];rgba[i*4+3]=255;}
    const t=new THREE.Data3DTexture(rgba,X,Y,Z);t.format=THREE.RGBAFormat;t.type=THREE.UnsignedByteType;t.minFilter=t.magFilter=THREE.LinearFilter;t.unpackAlignment=1;t.needsUpdate=true;return t;};
  // CPU lookup (nearest cell) for things lit outside the map shaders, like the first-person gun.
  const dec=v=>(v/255)**2*meta.scale;
  const sample=(p,powerMix,out=new THREE.Color())=>{
    const x=Math.round((p.x-meta.origin[0])/meta.cell),y=Math.round((p.y-meta.origin[1])/meta.cell),z=Math.round((p.z-meta.origin[2])/meta.cell);
    if(x<0||y<0||z<0||x>=X||y>=Y||z>=Z)return out.setRGB(0,0,0);const i=((z*Y+y)*X+x)*3;
    return out.setRGB(dec(bin[i])+dec(bin[n*3+i])*powerMix,dec(bin[i+1])+dec(bin[n*3+i+1])*powerMix,dec(bin[i+2])+dec(bin[n*3+i+2])*powerMix);};
  return {meta,sample,uniforms:{bakedSolid:{value:tex(0)},bakedPower:{value:tex(n*3)},bakedDir:{value:tex(n*6)},
    bakedOrigin:{value:new THREE.Vector3(...meta.origin)},bakedSize:{value:new THREE.Vector3(X*meta.cell,Y*meta.cell,Z*meta.cell)},bakedCell:{value:meta.cell},
    bakedScale:{value:meta.scale},bakedPowerMix:{value:0},bakedStrength:{value:.85}}};
}

// Adds the baked light to a standard material's indirect diffuse.
export function patchMaterial(m,uniforms){
  if(m.userData.baked||!(m.isMeshStandardMaterial||m.isMeshPhysicalMaterial||m.isMeshLambertMaterial||m.isMeshPhongMaterial))return false;
  m.userData.baked=true;
  const prev=m.onBeforeCompile,prevKey=m.customProgramCacheKey?.bind(m);
  m.onBeforeCompile=(shader,renderer)=>{
    prev?.call(m,shader,renderer);
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vBakedPos;')
      .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvBakedPos=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vBakedPos;uniform highp sampler3D bakedSolid,bakedPower,bakedDir;uniform vec3 bakedOrigin,bakedSize;uniform float bakedCell,bakedScale,bakedPowerMix,bakedStrength;
      vec3 bakedDecode(vec3 c){return c*c*bakedScale;}`)
      .replace('#include <lights_fragment_maps>',`#include <lights_fragment_maps>
      {vec3 wn=inverseTransformDirection(geometryNormal,viewMatrix);
       vec3 uvw=(vBakedPos+wn*bakedCell*.45-bakedOrigin)/bakedSize;   // nudged off the surface so walls don't sample their own inside
       if(all(greaterThanEqual(uvw,vec3(0.)))&&all(lessThanEqual(uvw,vec3(1.)))){
         vec3 lightIn=bakedDecode(texture(bakedSolid,uvw).rgb)+bakedDecode(texture(bakedPower,uvw).rgb)*bakedPowerMix;
         vec3 dir=normalize(texture(bakedDir,uvw).rgb*2.-1.);
         irradiance+=lightIn*mix(.45,1.,max(dot(wn,dir),0.))*bakedStrength;}}`);
  };
  m.customProgramCacheKey=()=>(prevKey?prevKey():'')+'|baked';
  m.needsUpdate=true;return true;
}
