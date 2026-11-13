// Weapon stickers (2026-11-06, user: "you can freely place 3 stickers on the weapon, having it wrap around it accordingly,
// you can also resize the stickers abit"). Up to three per gun, placed with a click on the Gunsmith's gun.
//
// A sticker is a decal projected in the gun's *bind pose* (the vertex positions before skinning), so it bends over curved
// parts like a box projection does and travels with a moving part (bolt, mag). It is drawn by the gun's own material:
// a patch adds the projection to whatever material the gun has (plain or camo'd), so no extra geometry or draw calls.
// One program suffix ('|stk') for any number of stickers, all images packed into one atlas texture.
//
// Saved per gun under kino.mods.stickers: {on:{[gun base id]:[{id, k, p, n, t, s, m, r}]}}
//   id  sticker id (stickers.json)          k  mesh key (name#n) of the part it was placed on
//   p   centre, n normal, t right axis (unit), all in that mesh's geometry space
//   s   half size in geometry units at 1x  m  size multiplier (0.5..2)   r  rotation (degrees)
// A sticker shows on every mesh that shares the placed mesh's vertex buffer (a BO1 gun is one buffer), so it carries
// across part seams there; on an imported gun whose parts are separate it stays on the part it was placed on.
import * as THREE from 'three';

export const MAX_STICKERS=3;
const KEY='kino.mods.stickers';
let catalogue=null;
export function loadStickers(){
  return catalogue??=fetch(new URL('./stickers.json',import.meta.url)).then(r=>r.json())
    .then(c=>{c.stickers??=[];return c;}).catch(()=>({stickers:[]}));
}
export function loadStickerState(){try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');s.on??={};return s;}catch{return {on:{}};}}
export function saveStickerState(s){localStorage.setItem(KEY,JSON.stringify(s));}

const devSoon=()=>{try{return localStorage.getItem('kino.dev.soon')==='1';}catch{return false;}};
const shopOwned=k=>{try{const o=JSON.parse(localStorage.getItem('kino.mods.shop')||'{}')?.owned;return Array.isArray(o)?o.includes(k):!!o?.[k];}catch{return false;}};
// as charms: soon = built but not out, unlock = a shop key (a Melon Pass reward), otherwise free
export function stickerOwned(s){if(!s)return false;if(s.soon&&!devSoon())return false;return !s.unlock||devSoon()||shopOwned(s.unlock);}
export function stickerLock(s){return !s||stickerOwned(s)?'':s.soon?'SOON':s.pass?'PASS':'LOCKED';}
// the placed stickers on a gun that the player still owns
export function stickersFor(cat,state,gunId){return (state?.on?.[gunId]??[]).filter(x=>stickerOwned(cat?.stickers.find(s=>s.id===x.id))).slice(0,MAX_STICKERS);}
export const stickerImage=s=>new URL(s.image,new URL('./',import.meta.url)).href;

// ---- the atlas: every sticker in one texture (cells of 256 with a clear border, so mipmaps don't bleed) --------------
const CELL=256,PAD=12;
let atlas=null;
export function stickerAtlas(cat){
  return atlas??=(async()=>{
    const list=cat.stickers,cols=Math.max(1,Math.ceil(Math.sqrt(list.length))),side=Math.min(4096,THREE.MathUtils.ceilPowerOfTwo(cols*CELL));
    const cv=document.createElement('canvas');cv.width=cv.height=side;const g=cv.getContext('2d');const rect={},shine={};
    for(const s of list)shine[s.id]=s.shine==='gold'?1:0;
    await Promise.all(list.map((s,i)=>new Promise(res=>{const im=new Image();im.onload=()=>{
      const x=(i%cols)*CELL,y=Math.floor(i/cols)*CELL,W=CELL-2*PAD,k=W/Math.max(im.naturalWidth,im.naturalHeight,1),w=im.naturalWidth*k,h=im.naturalHeight*k;
      g.drawImage(im,x+PAD+(W-w)/2,y+PAD+(W-h)/2,w,h);   // kept in proportion, centred in its square
      rect[s.id]=new THREE.Vector4((x+PAD)/side,1-(y+CELL-PAD)/side,(CELL-2*PAD)/side,(CELL-2*PAD)/side);res();};   // flipY: v up
      im.onerror=()=>{console.warn('[stickers] image',s.image);res();};im.src=stickerImage(s);})));
    const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;tex.generateMipmaps=true;
    tex.minFilter=THREE.LinearMipmapLinearFilter;return {tex,rect,shine};
  })();
}

// ---- meshes: stable keys, shared vertex buffers -----------------------------------------------------------------------
// Attachment models mounted on the gun (weapon-levels mounts.js, userData.mountId) get keys of their own, '@<attachment>/<name>#n':
// the gun's own keys don't move when one is fitted or removed, and a sticker on an attachment shows only while it is fitted.
export function meshKeys(root){const keys=new Map(),seen={};
  const walk=(o,pre)=>{if(o!==root&&o.userData?.mountId!=null)pre='@'+o.userData.mountId+'/';
    if(o.isMesh){const n=pre+(o.name||'mesh');seen[n]=(seen[n]??-1)+1;keys.set(o,n+'#'+seen[n]);}
    for(const c of o.children)walk(c,pre);};
  walk(root,'');return keys;}
// the attachment a placed sticker sits on (null: on the gun itself): a mounted model's, or `a`, a BO1 viewmodel's built-in part
// (its tag bone, set by the Gunsmith on placing)
export const stickerMount=x=>x?.k?.startsWith('@')?x.k.slice(1,x.k.indexOf('/')):x?.a??null;
const bufOf=o=>o.geometry?.attributes?.position?.array;

// ---- the material patch -------------------------------------------------------------------------------------------------
const SKIP=/reflex_red_dot|scope_pka_crosshair|clan_tag|player_icon|lens|glass|reticle|_dot\b/i;
// a material a sticker can go on: textured, or an opaque lit one (the Blender-built attachments are plain colours)
export const stickerPaintable=m=>!!m&&!SKIP.test(m.name??'')&&(!!m.map||!!m.isMeshStandardMaterial&&!m.transparent);
const matCache=new Map();   // base material uuid + vertex buffer + gun → sticker material (its uniforms are updated in place)
const stkTime={value:0};   // shared by every sticker material, set as one draws (onBeforeRender)
let bufIds=new WeakMap(),bufN=0;const bufId=a=>{if(!bufIds.has(a))bufIds.set(a,++bufN);return bufIds.get(a);};
// Material.clone deep-copies userData through JSON.stringify: a camo material's userData holds the original material, whose
// textures then serialise to data URLs (and throw on ImageBitmaps texture-memory.js has closed). Clone with userData set aside.
export function cloneMaterial(src){const ud=src.userData;src.userData={};try{return src.clone();}finally{src.userData=ud;}}
function stickerMaterial(base,group,gunKey,shared){
  const key=base.uuid+'|'+group+'|'+gunKey;let m=matCache.get(key);if(m)return m;
  m=cloneMaterial(base);m.userData={...base.userData,stickerOf:base,camoOf:base.userData?.camoOf??base};
  const V=()=>[0,1,2].map(()=>new THREE.Vector3());
  const u={stkAtlas:shared.atlas,stkCount:{value:0},stkO:{value:V()},stkT:{value:V()},stkB:{value:V()},stkZ:{value:V()},stkR:{value:[0,1,2].map(()=>new THREE.Vector4())},stkF:{value:[0,0,0]},stkTime};
  m.userData.stk=u;
  const prev=base.onBeforeCompile,prevR=base.onBeforeRender;
  m.onBeforeRender=function(...a){stkTime.value=performance.now()/1000;return prevR.apply(this,a);};
  m.onBeforeCompile=(shader,renderer)=>{prev?.call(m,shader,renderer);Object.assign(shader.uniforms,u);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vStkP;varying vec3 vStkN;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvStkP=position;vStkN=normal;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform sampler2D stkAtlas;uniform float stkCount;uniform float stkF[3];uniform float stkTime;float stkG=0.;vec2 stkGuv=vec2(0.);uniform vec3 stkO[3];uniform vec3 stkT[3];uniform vec3 stkB[3];uniform vec3 stkZ[3];uniform vec4 stkR[3];
varying vec3 vStkP;varying vec3 vStkN;float stkA=0.;
// one sticker: the box projection (x,y across, z along the normal, all -1..1 inside), faded where the surface turns away
vec4 stkOne(int i,vec3 o,vec3 t,vec3 b,vec3 z,vec4 r,float f){
  vec3 d=vStkP-o,l=vec3(dot(d,t),dot(d,b),dot(d,z));vec2 uv=clamp(l.xy*.5+.5,0.,1.);
  vec4 c=texture2D(stkAtlas,r.xy+uv*r.zw);   // sampled outside the test: derivatives stay valid for the mipmaps
  float facing=dot(normalize(vStkN),normalize(z));
  float in_=step(abs(l.x),1.)*step(abs(l.y),1.)*step(abs(l.z),1.)*smoothstep(.08,.3,facing)*step(float(i)+.5,stkCount);
  c.a*=in_;
  // gold ink (stickers with shine:"gold"): saturated, warm texels (r>=g>b); the paper and stains around it stay plain
  float mx=max(c.r,max(c.g,c.b)),sat=(mx-min(c.r,min(c.g,c.b)))/max(mx,1e-3);
  float g=f*c.a*smoothstep(.38,.62,sat)*smoothstep(-.02,.02,c.r-c.g)*smoothstep(-.02,.02,c.g-c.b);
  stkGuv=mix(stkGuv,uv,step(stkG,g));stkG=max(stkG,g);
  return c;}
float stkHash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
`).replace('#include <color_fragment>',`#include <color_fragment>
{ vec4 s0=stkOne(0,stkO[0],stkT[0],stkB[0],stkZ[0],stkR[0],stkF[0]),s1=stkOne(1,stkO[1],stkT[1],stkB[1],stkZ[1],stkR[1],stkF[1]),s2=stkOne(2,stkO[2],stkT[2],stkB[2],stkZ[2],stkR[2],stkF[2]);
  diffuseColor.rgb=mix(diffuseColor.rgb,s0.rgb,s0.a);diffuseColor.rgb=mix(diffuseColor.rgb,s1.rgb,s1.a);diffuseColor.rgb=mix(diffuseColor.rgb,s2.rgb,s2.a);
  stkA=max(s0.a,max(s1.a,s2.a)); }`)
      // vinyl: not metal, a little rough, no glow through it (a camo's own glow included)
      .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor*(1.-stkA),.55,stkG);')
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(mix(roughnessFactor,.5,stkA),.28,stkG);')
      .replace('#include <lights_fragment_begin>',`totalEmissiveRadiance*=1.-stkA;
// gold-pen glimmer: a soft sheen that sweeps across the ink every few seconds and slides as the gun turns (view-space
// normal), plus a few flecks that twinkle on their own
if(stkG>0.){
  float ph=dot(stkGuv,vec2(.62,.38))+dot(normal.xy,vec2(.55,.35))-stkTime*.16;
  float band=1.-smoothstep(0.,.075,abs(fract(ph)-.5));
  vec2 cell=floor(stkGuv*64.);float h=stkHash(cell);
  vec2 fc=fract(stkGuv*64.)-.5;float sp=smoothstep(.45,0.,length(fc))+.6*smoothstep(.12,0.,min(abs(fc.x),abs(fc.y)))*smoothstep(.5,.1,length(fc));
  float tw=step(.86,h)*sp*pow(max(0.,sin(stkTime*(1.3+h*2.2)+h*37.)),28.);
  totalEmissiveRadiance+=(diffuseColor.rgb*1.7+vec3(.2,.15,.04))*stkG*(band*.75+tw*2.2+.05);
}
#include <lights_fragment_begin>`);
  };
  m.customProgramCacheKey=()=>(base.customProgramCacheKey?.()??'')+'|stk2';
  m.needsUpdate=true;matCache.set(key,m);return m;
}

// the projector axes of one placed sticker (geometry space): right/up scaled to 1/half size, normal to 1/depth
const _t=new THREE.Vector3(),_b=new THREE.Vector3(),_n=new THREE.Vector3(),_q=new THREE.Quaternion();
function axes(x,o,t,b,z){
  _n.fromArray(x.n).normalize();_t.fromArray(x.t);_t.addScaledVector(_n,-_t.dot(_n)).normalize();
  _t.applyQuaternion(_q.setFromAxisAngle(_n,THREE.MathUtils.degToRad(x.r??0)));_b.crossVectors(_n,_t);
  const h=Math.max(1e-4,x.s*(x.m??1));o.fromArray(x.p);t.copy(_t).divideScalar(h);b.copy(_b).divideScalar(h);
  z.copy(_n).divideScalar(h*1.1);   // the box reaches about as deep as the sticker is wide: enough to wrap a barrel
}

// Put `list` (placed stickers, see the top) on the gun `root`; [] or null takes them off. gunKey keeps two guns that share a
// model apart. Waits for the atlas the first time. applyCamo calls restick() after changing materials, so a camo change
// keeps the stickers.
export async function applyStickers(root,list,gunKey='gun'){
  if(!root)return;
  root.userData.kinoStickers=list?.length?{list:list.slice(0,MAX_STICKERS),gunKey}:null;   // set now: the latest call wins
  if(list?.length&&!lastAtlas)await stickerAtlas(await loadStickers()).then(a=>{lastAtlas=a;});
  restick(root);
}
let lastAtlas=null;
export function restick(root){
  const st=root?.userData?.kinoStickers,at=lastAtlas;if(!root)return;
  const keys=meshKeys(root),byKey=new Map([...keys].map(([o,k])=>[k,o]));
  root.traverse(o=>{
    if(!o.isMesh)return;
    const list=Array.isArray(o.material)?o.material:[o.material];
    const mine=st&&at?st.list.filter(x=>{const src=byKey.get(x.k);return src&&bufOf(src)===bufOf(o)&&at.rect[x.id];}):[];
    const next=list.map(m=>{const base=m?.userData?.stickerOf??m;if(!stickerPaintable(base))return base;
      if(!mine.length)return base;
      const sm=stickerMaterial(base,bufId(bufOf(o)),st.gunKey,{atlas:{value:at.tex}}),u=sm.userData.stk;
      u.stkCount.value=mine.length;mine.forEach((x,i)=>{axes(x,u.stkO.value[i],u.stkT.value[i],u.stkB.value[i],u.stkZ.value[i]);u.stkR.value[i].copy(at.rect[x.id]);u.stkF.value[i]=at.shine?.[x.id]??0;});
      return sm;});
    o.material=Array.isArray(o.material)?next:next[0];
  });
}

// ---- placing: a ray hit on the (skinned, posed) gun → a sticker in that mesh's geometry space -----------------------------
const _A=new THREE.Vector3(),_B=new THREE.Vector3(),_C=new THREE.Vector3(),_P=new THREE.Vector3(),_bc=new THREE.Vector3();
// hit: a three.js intersection with a mesh of `root`; camera: whose screen "right" becomes the sticker's right;
// worldSize: the sticker's width in world units at 1x
export function stickerFromHit(root,hit,camera,worldSize){
  const o=hit.object,g=o.geometry,f=hit.face;if(!o.isMesh||!f)return null;
  const key=meshKeys(root).get(o);if(!key)return null;
  const pos=g.attributes.position,nor=g.attributes.normal;
  // the posed triangle in world space and the hit's barycentric coordinates on it
  const wA=o.getVertexPosition(f.a,new THREE.Vector3()).applyMatrix4(o.matrixWorld),wB=o.getVertexPosition(f.b,new THREE.Vector3()).applyMatrix4(o.matrixWorld),wC=o.getVertexPosition(f.c,new THREE.Vector3()).applyMatrix4(o.matrixWorld);
  THREE.Triangle.getBarycoord(hit.point,wA,wB,wC,_bc);
  _A.fromBufferAttribute(pos,f.a);_B.fromBufferAttribute(pos,f.b);_C.fromBufferAttribute(pos,f.c);
  const p=new THREE.Vector3().addScaledVector(_A,_bc.x).addScaledVector(_B,_bc.y).addScaledVector(_C,_bc.z);
  const gE1=_B.clone().sub(_A),gE2=_C.clone().sub(_A);let n=new THREE.Vector3().crossVectors(gE1,gE2);
  if(nor){const sn=new THREE.Vector3().fromBufferAttribute(nor,f.a).multiplyScalar(_bc.x).add(_P.fromBufferAttribute(nor,f.b).multiplyScalar(_bc.y)).add(_P.fromBufferAttribute(nor,f.c).multiplyScalar(_bc.z));
    if(n.dot(sn)<0)n.negate();if(sn.lengthSq()>1e-8)n=sn;}
  n.normalize();
  // the camera's right in world → the triangle's edge basis → the same combination of the geometry edges
  const wE1=wB.clone().sub(wA),wE2=wC.clone().sub(wA),wN=new THREE.Vector3().crossVectors(wE1,wE2);
  const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);
  const M=new THREE.Matrix3().set(wE1.x,wE2.x,wN.x,wE1.y,wE2.y,wN.y,wE1.z,wE2.z,wN.z);
  if(Math.abs(M.determinant())<1e-12)return null;
  const c=right.clone().applyMatrix3(M.invert());
  const t=gE1.clone().multiplyScalar(c.x).addScaledVector(gE2,c.y);t.addScaledVector(n,-t.dot(n));
  if(t.lengthSq()<1e-10)t.set(1,0,0).addScaledVector(n,-n.x);
  t.normalize();
  // geometry units per world unit, from the triangle's edges
  const k=(gE1.length()+gE2.length())/Math.max(1e-6,wE1.length()+wE2.length());
  const r3=v=>v.toArray().map(x=>+x.toFixed(4));
  return {k:key,p:r3(p),n:r3(n),t:r3(t),s:+(worldSize*.5*k).toFixed(4),m:1,r:0};
}
