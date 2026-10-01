// Weapon camos. A camo is one tileable texture (camos.json "texture", a file
// next to this module) or, until real ones are supplied, a placeholder drawn
// here ("procedural"). It is painted over a gun's body materials only (not
// sights, lenses, suppressors, underbarrels, straps, mags or hands), keeping
// the gun's own shading and wear: camo colour × the base texture's brightness.
import * as THREE from 'three';

export async function loadCamos(base=import.meta.url){
  const r=await fetch(new URL('camos.json',base));
  if(!r.ok)throw new Error('camos.json HTTP '+r.status);
  return r.json();
}

// Not camo'd: anything that isn't the gun's body.
const SKIP=/scope|lens|crosshair|reflex|elbit|aimpoint|cobra|pka|anpvs|nsp3a|acog|redfield|hunter|colt3x20|inside|suppressor|tishina|silencer|flamer|m203|_mk|mk_|grenade|gl_ammo|clan_tag|player_icon|glow|tritium|trinium|strap|mag_wrap|hkmount|rail|mount|foregrip|attachments|iron_sight|magazines|glass|viewarm|hand|glove|sleeve|arms/;

// ---- placeholder textures --------------------------------------------------------------
function rng(seed){let h=seed>>>0||1;return ()=>{h^=h<<13;h^=h>>>17;h^=h<<5;return (h>>>0)/4294967296;};}
function draw(kind){
  const S=512,c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d'),r=rng(kind.length*7919+kind.charCodeAt(0));
  // tileable blobs: draw each shape at its 9 wrap offsets
  const wrap=(fn)=>{for(const dx of [-S,0,S])for(const dy of [-S,0,S]){g.save();g.translate(dx,dy);fn();g.restore();}};
  const blobs=(colors,n,rmin,rmax)=>{for(let i=0;i<n;i++){const x=r()*S,y=r()*S,rad=rmin+r()*(rmax-rmin),col=colors[i%colors.length],pts=7+Math.floor(r()*5),ang=r()*6.28,offs=[...Array(pts)].map(()=>.6+r()*.7);
    wrap(()=>{g.fillStyle=col;g.beginPath();for(let k=0;k<=pts;k++){const a=ang+k/pts*6.283,rr=rad*offs[k%pts];g.lineTo(x+Math.cos(a)*rr*1.4,y+Math.sin(a)*rr);}g.fill();});}};
  if(kind==='woodland'){g.fillStyle='#5b6236';g.fillRect(0,0,S,S);blobs(['#2e3320','#6e5a3a','#1d1f16','#7d8150'],70,30,80);}
  else if(kind==='urban'){g.fillStyle='#8a8d8f';g.fillRect(0,0,S,S);blobs(['#c9cbcc','#55595c','#2c2f31','#a3a6a8'],80,25,70);}
  else if(kind==='tiger'||kind==='redtiger'){
    const [bg,st]=kind==='tiger'?['#6d7a45','#1b1f14']:['#7a1f16','#120808'];g.fillStyle=bg;g.fillRect(0,0,S,S);
    for(let i=0;i<34;i++){const y=r()*S,th=6+r()*14,len=120+r()*260,x=r()*S,tilt=(r()-.5)*.5;
      wrap(()=>{g.fillStyle=st;g.beginPath();g.moveTo(x,y);for(let k=0;k<=12;k++){const t=k/12;g.lineTo(x+t*len,y+t*len*tilt+Math.sin(t*9+i)*th*.6-th*(1-Math.abs(t*2-1)));}
        for(let k=12;k>=0;k--){const t=k/12;g.lineTo(x+t*len,y+t*len*tilt+Math.sin(t*9+i)*th*.6+th*(1-Math.abs(t*2-1)));}g.fill();});}
    if(kind==='redtiger'){g.globalCompositeOperation='overlay';g.fillStyle='#ff3a20';g.globalAlpha=.25;g.fillRect(0,0,S,S);g.globalAlpha=1;g.globalCompositeOperation='source-over';}}
  else if(kind==='digital'){const cols=['#3d4a5c','#5d6b80','#22293a','#8693a6'],P=16;
    for(let y=0;y<S;y+=P)for(let x=0;x<S;x+=P){g.fillStyle=cols[Math.floor(r()*cols.length)];g.fillRect(x,y,P,P);}
    for(let i=0;i<220;i++){const x=Math.floor(r()*S/P)*P,y=Math.floor(r()*S/P)*P,w=P*(1+Math.floor(r()*4)),h=P*(1+Math.floor(r()*3));g.fillStyle=cols[i%cols.length];g.fillRect(x,y,w,h);}}
  else if(kind==='diamond'){
    // faceted crystal: light triangles in ice blue and white, with sparkles
    const cols=['#dff4ff','#9fd4f2','#6fb3e0','#f4fbff','#b8e2f7','#4f8fc2'],T=64;
    for(let y=0;y<S;y+=T)for(let x=0;x<S;x+=T){for(const tri of [[[x,y],[x+T,y],[x,y+T]],[[x+T,y],[x+T,y+T],[x,y+T]]]){g.fillStyle=cols[Math.floor(r()*cols.length)];g.beginPath();tri.forEach(([a,b],k)=>k?g.lineTo(a,b):g.moveTo(a,b));g.closePath();g.fill();}}
    g.strokeStyle='rgba(255,255,255,.35)';g.lineWidth=1;for(let i=0;i<=S;i+=T){g.beginPath();g.moveTo(i,0);g.lineTo(i,S);g.moveTo(0,i);g.lineTo(S,i);g.moveTo(i,0);g.lineTo(0,i);g.moveTo(S,i);g.lineTo(i,S);g.stroke();}
    for(let i=0;i<160;i++){const x=r()*S,y=r()*S,l=2+r()*6;g.strokeStyle=`rgba(255,255,255,${.4+r()*.6})`;g.beginPath();g.moveTo(x-l,y);g.lineTo(x+l,y);g.moveTo(x,y-l);g.lineTo(x,y+l);g.stroke();}}
  else if(kind==='gold'){const gr=g.createLinearGradient(0,0,S,S);gr.addColorStop(0,'#f7d77a');gr.addColorStop(.3,'#c9952f');gr.addColorStop(.55,'#ffe9a8');gr.addColorStop(.8,'#a8761e');gr.addColorStop(1,'#f7d77a');
    g.fillStyle=gr;g.fillRect(0,0,S,S);for(let i=0;i<900;i++){g.fillStyle=`rgba(${r()<.5?'255,240,190':'120,80,20'},${.05+r()*.08})`;g.fillRect(r()*S,r()*S,1+r()*40,1);}}
  else{g.fillStyle='#777';g.fillRect(0,0,S,S);}
  return c;
}
const texCache=new Map();
export function camoTexture(camo,base=import.meta.url){
  const key=camo.texture??('proc:'+camo.procedural);
  if(texCache.has(key))return texCache.get(key);
  let t;
  if(camo.texture){t=new THREE.TextureLoader().load(new URL(camo.texture,base).href);}
  else t=new THREE.CanvasTexture(draw(camo.procedural));
  t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;
  texCache.set(key,t);return t;
}

// ---- applying -----------------------------------------------------------------------------
// one clock for every Pack-a-Punch camo (advanced by the weapon-levels mod)
export const camoTime={value:0};
export const PAP_CAMO={id:'pap',name:'Pack-a-Punch',texture:'../../textures/camo_packapunch_c.png',glow:'../../textures/camo_packapunch_env.png',scale:2,mix:.88};
const matCache=new Map();   // original material uuid + camo id → camo material
function camoMaterial(orig,camo){
  const key=orig.uuid+'|'+camo.id;if(matCache.has(key))return matCache.get(key);
  const m=orig.clone();m.userData={...orig.userData,camoOf:orig,camo:camo.id};
  const uniforms={camoMap:{value:camoTexture(camo)},camoScale:{value:camo.scale??2.5},camoMix:{value:camo.mix??.92}};
  if(camo.glow)Object.assign(uniforms,{camoGlow:{value:camoTexture({texture:camo.glow})},camoTime});
  if(camo.metal){m.metalness=Math.max(m.metalness??0,.85);m.roughness=Math.min(m.roughness??1,.35);}
  const prev=orig.onBeforeCompile;
  m.onBeforeCompile=(shader,renderer)=>{prev?.call(m,shader,renderer);Object.assign(shader.uniforms,uniforms);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D camoMap;uniform float camoScale;uniform float camoMix;')
      .replace('#include <map_fragment>',`#include <map_fragment>
#ifdef USE_MAP
{ vec3 camoC=texture2D(camoMap,vMapUv*camoScale).rgb;
  float camoL=dot(diffuseColor.rgb,vec3(.299,.587,.114));
  diffuseColor.rgb=mix(diffuseColor.rgb,camoC*(.3+camoL*1.9),camoMix); }
#endif`);
    // Pack-a-Punch: the circuit traces glow, a colour wave running through them
    if(camo.glow)shader.fragmentShader=shader.fragmentShader.replace('uniform sampler2D camoMap;','uniform sampler2D camoMap;uniform sampler2D camoGlow;uniform float camoTime;')
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
#ifdef USE_MAP
{ vec2 cu=vMapUv*camoScale;float trace=smoothstep(.36,.62,texture2D(camoGlow,cu).r);
  float w=.5+.5*sin(camoTime*2.2-(cu.x+cu.y)*5.);
  vec3 col=mix(vec3(.55,.18,1.),vec3(.1,.55,1.),.5+.5*sin(camoTime*.7+cu.y*2.));
  totalEmissiveRadiance+=col*trace*(.6+2.2*w*w); }
#endif`);};
  m.customProgramCacheKey=()=>(orig.customProgramCacheKey?.()??'')+(camo.glow?'|camo-pap':'|camo');
  m.needsUpdate=true;matCache.set(key,m);return m;
}
export const isBody=m=>!!m&&!SKIP.test(m.name??'')&&!!m.map;
// Paint `root` with `camo` (an entry from camos.json) or restore it (null).
export function applyCamo(root,camo){
  root?.traverse(o=>{
    if(!o.isMesh)return;
    const list=Array.isArray(o.material)?o.material:[o.material];
    const next=list.map(m=>{const orig=m?.userData?.camoOf??m;if(!isBody(orig))return m;return camo?camoMaterial(orig,camo):orig;});
    o.material=Array.isArray(o.material)?next:next[0];
  });
}

// ---- weapon classes (shared with the loadout picker) -----------------------------------------
export function weaponClass(d){
  const b=d.baseId??d.id;
  if(/ray_gun|thundergun|microwavegun|freezegun/.test(b))return 'Wonder weapon';if(/minigun/.test(b))return 'Death Machine';if(d.projectileSpeed>0||d.explosionRadius)return 'Launcher';if(d.pellets>1)return 'Shotgun';
  if(/l96|dragunov/.test(b))return 'Sniper rifle';if(/hk21|rpk/.test(b))return 'Light machine gun';if(/m1911|python|cz75/.test(b))return 'Pistol';
  if(/mp40|mp5k|mpl|pm63|ak74u|spectre|g11/.test(b))return 'Submachine gun';return 'Rifle';
}
export const CLASSES=[['ar','ASSAULT RIFLES',['Rifle']],['smg','SMGS',['Submachine gun']],['shotgun','SHOTGUNS',['Shotgun']],['lmg','LMGS',['Light machine gun']],
  ['sniper','SNIPERS',['Sniper rifle']],['pistol','PISTOLS',['Pistol']],['launcher','LAUNCHERS',['Launcher']],['special','SPECIALS',['Wonder weapon','Death Machine']]];
export const classOf=(weapons,id)=>{const d=weapons?.[id];return d?CLASSES.find(c=>c[2].includes(weaponClass(d)))?.[0]??'special':'special';};
export const classLabel=key=>CLASSES.find(c=>c[0]===key)?.[1]??key;
// the guns of a class that count toward Diamond (no Pack-a-Punch entries)
export function classGuns(weapons,key){return Object.keys(weapons??{}).filter(id=>!/upgraded/.test(id)&&weapons[id]?.model&&classOf(weapons,id)===key);}

// ---- challenges -------------------------------------------------------------------------------
export const camoProgress=(profile,id)=>profile.camo?.[id]?.p??{};
const baseCamos=cats=>cats.camos.filter(c=>!c.mastery&&!c.classMastery);
// a gun has Gold (its mastery) when every challenge camo is done
export function hasMastery(cats,profile,id){const p=camoProgress(profile,id);return baseCamos(cats).every(c=>(p[c.challenge]??0)>=c.count);}
// Diamond progress for a gun's class: guns with Gold / guns in the class
export function classProgress(cats,profile,id,weapons){
  const key=classOf(weapons,id);if(!weapons||key==='special')return null;
  const guns=classGuns(weapons,key);return {key,label:classLabel(key),done:guns.filter(g=>hasMastery(cats,profile,g)).length,total:guns.length};
}
export function camoUnlocked(cats,profile,id,weapons){
  const p=camoProgress(profile,id),list=baseCamos(cats),done=new Set(list.filter(c=>(p[c.challenge]??0)>=c.count).map(c=>c.id));
  if(list.every(c=>done.has(c.id)))for(const c of cats.camos)if(c.mastery)done.add(c.id);
  const cp=classProgress(cats,profile,id,weapons);
  if(cp&&cp.total&&cp.done===cp.total)for(const c of cats.camos)if(c.classMastery)done.add(c.id);
  return done;
}
export function equippedCamo(cats,profile,id,weapons){
  const on=profile.camo?.[id]?.on;if(!on)return null;
  return camoUnlocked(cats,profile,id,weapons).has(on)?cats.camos.find(c=>c.id===on)??null:null;
}
// Count one kill. flags: {head, low, moving, multi}. Returns camos newly unlocked.
export function countCamoKill(cats,profile,id,flags,weapons){
  profile.camo??={};const e=profile.camo[id]??={p:{}};e.p??={};
  const before=camoUnlocked(cats,profile,id,weapons);
  const add=k=>{e.p[k]=(e.p[k]??0)+1;};
  add('kills');if(flags.head)add('headshots');if(flags.low)add('low');if(flags.moving)add('moving');if(flags.multi)add('multi');
  const after=camoUnlocked(cats,profile,id,weapons);
  return cats.camos.filter(c=>after.has(c.id)&&!before.has(c.id));
}
