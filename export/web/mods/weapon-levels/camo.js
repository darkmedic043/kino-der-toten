// Weapon camos. A camo is one tileable texture (camos.json "texture", a file
// next to this module) or, until real ones are supplied, a placeholder drawn
// here ("procedural"). It is painted over a gun's body materials only (not
// sights, lenses, suppressors, underbarrels, straps, mags or hands), keeping
// the gun's own shading and wear: camo colour × the base texture's brightness.
import * as THREE from 'three';
import { loadPrestige } from '../prestige/prestige.js';
import { PRESTIGE_TABLE } from '../prestige/camo-table.js';
import { drawPrestigeArt, STYLES as PRESTIGE_STYLES, hslRgb as artRgb } from '../prestige/prestige-art.js';

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
  else if(kind==='cheese'){   // swiss cheese: pale yellow with soft olive holes (the Cheese Cube reward)
    g.fillStyle='#f6e78f';g.fillRect(0,0,S,S);
    for(let i=0;i<46;i++){const x=r()*S,y=r()*S,rad=10+r()*38;
      wrap(()=>{g.fillStyle='#e9d977';g.beginPath();g.ellipse(x,y+2,rad*1.1,rad*.95,0,0,6.283);g.fill();g.fillStyle='#d4c566';g.beginPath();g.ellipse(x,y+3,rad,rad*.88,0,0,6.283);g.fill();});}}
  else if(kind==='gold'){const gr=g.createLinearGradient(0,0,S,S);gr.addColorStop(0,'#f7d77a');gr.addColorStop(.3,'#c9952f');gr.addColorStop(.55,'#ffe9a8');gr.addColorStop(.8,'#a8761e');gr.addColorStop(1,'#f7d77a');
    g.fillStyle=gr;g.fillRect(0,0,S,S);for(let i=0;i<900;i++){g.fillStyle=`rgba(${r()<.5?'255,240,190':'120,80,20'},${.05+r()*.08})`;g.fillRect(r()*S,r()*S,1+r()*40,1);}}
  else if(SHOP_DRAW[kind])SHOP_DRAW[kind](g,S,r,wrap);
  else{g.fillStyle='#777';g.fillRect(0,0,S,S);}
  return c;
}
// ---- prestige camos (Phase 4): three per gun, drawn from a per-gun seed --------------------------------------
// pr1:<gun> Prestige I (angular shards), pr2:<gun> Prestige II (a metallic hex lattice), pr3:<gun> Prestige Master
// (dark voronoi plates whose cracks glow, pulse and shift colour, and the pattern drifts: animated in the shader).
const hashStr=str=>{let h=2166136261;for(const ch of str){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const WORDS=[[['Ashen','Cobalt','Feral','Hollow','Jagged','Molten','Phantom','Shattered','Venom','Wraith','Scarlet','Iron'],['Fang','Shard','Rift','Talon','Scale','Husk','Ember','Spine']],
  [['Gilded','Regal','Sovereign','Obsidian','Crowned','Imperial','Royal','Burnished'],['Lattice','Hive','Mosaic','Plate','Crest','Aegis']],
  [['Eternal','Undying','Ascendant','Abyssal','Celestial','Infernal','Astral','Void'],['Pulse','Nova','Current','Wake','Flux','Storm','Requiem']]];
const prestigeCache=new Map();
// pr<tier>:<gun id> → a camo entry like camos.json's. Each gun's colours, styles and names come from camo-table.js
// (.tools/build-prestige-camos.py); a gun missing there falls back to a hash of its id.
export function prestigeCamo(id){
  if(prestigeCache.has(id))return prestigeCache.get(id);
  const m=/^pr([123]):(.+)$/.exec(id??'');if(!m)return null;
  const tier=+m[1],owner=m[2],seed=hashStr(owner),T=PRESTIGE_TABLE[owner];
  const e=T??(()=>{const r=rng(seed),[a,b]=WORDS[tier-1],h=seed%360;return {cls:'special',h,h2:(h+150)%360,styles:[1,2,3].map(t=>PRESTIGE_STYLES[t][Math.floor(r()*6)]),names:[1,2,3].map(t=>WORDS[t-1][0][Math.floor(r()*WORDS[t-1][0].length)]+' '+WORDS[t-1][1][Math.floor(r()*WORDS[t-1][1].length)])};})();
  const [h,h2,tone=0]=e.pal?.[tier-1]??[e.h,e.h2],style=e.styles[tier-1],spec={tier,style,seed,h,h2,tone,cls:e.cls};   // pal: per-tier colours, spread within each design
  const c={id,name:e.names[tier-1],prestige:tier,owner,seed,style,cls:e.cls,procedural:'prestige',spec,scale:tier===3?1.6:2.2,mix:.94,
    ...(tier===2&&!['mosaic','carbon'].includes(style)?{metal:true}:{}),
    ...(tier===3?{anim:{c1:artRgb(h,1,.55),c2:artRgb(h2,1,.6)},glow:{procedural:'prestige-glow',spec,seed,tier}}:{})};
  prestigeCache.set(id,c);return c;
}
export const camoById=(cats,id)=>cats?.camos.find(c=>c.id===id)??prestigeCamo(id);
// ---- shop camos (Phase 6; camos.json entries with "shop": <catalog item id>) ------------------------------------
const SHOP_DRAW={
  ember(g,S,r,wrap){g.fillStyle='#120806';g.fillRect(0,0,S,S);for(let i=0;i<220;i++){const x=r()*S,y=r()*S,rad=4+r()*26,h=10+r()*35,l=25+r()*35;
    wrap(()=>{const gr=g.createRadialGradient(x,y,0,x,y,rad);gr.addColorStop(0,`hsla(${h},100%,${l+20}%,.95)`);gr.addColorStop(1,'hsla(10,100%,10%,0)');g.fillStyle=gr;g.beginPath();g.arc(x,y,rad,0,6.283);g.fill();});}},
  aurora(g,S,r){const gr=g.createLinearGradient(0,0,0,S);gr.addColorStop(0,'#04101a');gr.addColorStop(1,'#0a0420');g.fillStyle=gr;g.fillRect(0,0,S,S);g.globalCompositeOperation='lighter';
    for(let b=0;b<7;b++){const y0=r()*S,amp=20+r()*60,fr=1+Math.floor(r()*3),col=b%2?'rgba(80,255,170,.22)':'rgba(170,90,255,.2)';g.strokeStyle=col;g.lineWidth=18+r()*30;g.beginPath();
      for(let x=0;x<=S;x+=8){const y=y0+Math.sin(x/S*6.283*fr+b)*amp;x?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();}g.globalCompositeOperation='source-over';},
  frostbite(g,S,r){g.fillStyle='#bfe6f7';g.fillRect(0,0,S,S);g.strokeStyle='#4f8fc2';for(let i=0;i<90;i++){let x=r()*S,y=r()*S;g.lineWidth=.6+r()*2;g.beginPath();g.moveTo(x,y);
    for(let k=0;k<5;k++){x+=(r()-.5)*70;y+=(r()-.5)*70;g.lineTo(x,y);}g.stroke();}g.fillStyle='rgba(255,255,255,.35)';for(let i=0;i<300;i++)g.fillRect(r()*S,r()*S,2,2);},
  circuit(g,S,r){g.fillStyle='#0d1712';g.fillRect(0,0,S,S);g.strokeStyle='#c8873a';g.lineWidth=3;const G=32;for(let i=0;i<70;i++){let x=Math.floor(r()*S/G)*G,y=Math.floor(r()*S/G)*G;g.beginPath();g.moveTo(x,y);
    for(let k=0;k<4;k++){if(r()<.5)x+=(r()<.5?-1:1)*G*(1+Math.floor(r()*3));else y+=(r()<.5?-1:1)*G*(1+Math.floor(r()*3));g.lineTo(x,y);}g.stroke();g.fillStyle='#e8b060';g.beginPath();g.arc(x,y,5,0,6.283);g.fill();}},
  'circuit-glow'(g,S,r){g.fillStyle='#000';g.fillRect(0,0,S,S);g.strokeStyle='#fff';g.lineWidth=3;const G=32;for(let i=0;i<70;i++){let x=Math.floor(r()*S/G)*G,y=Math.floor(r()*S/G)*G;g.beginPath();g.moveTo(x,y);
    for(let k=0;k<4;k++){if(r()<.5)x+=(r()<.5?-1:1)*G*(1+Math.floor(r()*3));else y+=(r()<.5?-1:1)*G*(1+Math.floor(r()*3));g.lineTo(x,y);}g.stroke();}},
  digitalrain(g,S,r){g.fillStyle='#020a04';g.fillRect(0,0,S,S);g.font='bold 14px monospace';for(let x=0;x<S;x+=14){const len=8+Math.floor(r()*30),y0=r()*S;
    for(let k=0;k<len;k++){const y=(y0+k*15)%S;g.fillStyle=`rgba(80,255,120,${(k/len)*.9+.05})`;g.fillText(String.fromCharCode(0x30A0+Math.floor(r()*96)),x,y);}}},
  chrome(g,S){const gr=g.createLinearGradient(0,0,S,S);for(const [o,c] of [[0,'#f4f6f8'],[.25,'#8a9096'],[.45,'#ffffff'],[.6,'#5a6066'],[.8,'#d8dde2'],[1,'#f4f6f8']])gr.addColorStop(o,c);g.fillStyle=gr;g.fillRect(0,0,S,S);},
  brushed(g,S,r){g.fillStyle='#9aa0a6';g.fillRect(0,0,S,S);for(let i=0;i<2400;i++){const y=r()*S,v=140+r()*90;g.fillStyle=`rgba(${v},${v},${v+6},.18)`;g.fillRect(0,y,S,1);}},
  hazard(g,S){g.fillStyle='#f2c230';g.fillRect(0,0,S,S);g.fillStyle='#141414';for(let i=-S;i<S*2;i+=64){g.beginPath();g.moveTo(i,0);g.lineTo(i+32,0);g.lineTo(i+32-S,S);g.lineTo(i-S,S);g.fill();}},
  spectrum(g,S){for(let x=0;x<S;x++){g.fillStyle=`hsl(${x/S*360},70%,22%)`;g.fillRect(x,0,1,S);}},
  'stripes-glow'(g,S){g.fillStyle='#000';g.fillRect(0,0,S,S);g.fillStyle='#fff';for(let i=-S;i<S*2;i+=48){g.beginPath();g.moveTo(i,0);g.lineTo(i+10,0);g.lineTo(i+10-S,S);g.lineTo(i-S,S);g.fill();}},
};
// ---- swatches: small thumbnails for menus, shared by every page and generated one per frame -----------------------
// camoSwatch(camo) → the cached data URL or '' (and queues it); fillSwatches(root) fills [data-swatch] elements as they're ready.
const swatches=new Map(),swatchQueue=[];let swatchBusy=false;
export function camoSwatch(c){
  if(!c)return '';const k=c.id;if(swatches.has(k))return swatches.get(k)??'';
  swatches.set(k,null);swatchQueue.push(c);pumpSwatches();return '';
}
function pumpSwatches(){
  if(swatchBusy||!swatchQueue.length)return;swatchBusy=true;
  requestAnimationFrame(()=>{
    const c=swatchQueue.shift();
    try{const img=camoTexture(c).image;let url='';
      if(img instanceof HTMLCanvasElement){const s=document.createElement('canvas');s.width=s.height=96;s.getContext('2d').drawImage(img,0,0,96,96);url=s.toDataURL('image/jpeg',.8);}
      else url=img?.src??'';
      swatches.set(c.id,url);for(const f of swatchWaiters.splice(0))f();}catch(e){swatches.set(c.id,'');}
    swatchBusy=false;pumpSwatches();});
}
const swatchWaiters=[];
export function fillSwatches(root,lookup){
  const todo=[...root.querySelectorAll('[data-swatch]')].filter(e=>!e.dataset.filled);if(!todo.length)return;
  for(const el of todo){const c=lookup(el.dataset.swatch);const url=camoSwatch(c);if(url){el.style.backgroundImage=`url(${url})`;el.dataset.filled='1';}}
  if(todo.some(e=>!e.dataset.filled))swatchWaiters.push(()=>fillSwatches(root,lookup));
}
// shop camos the player owns (kino.mods.shop, read directly: camo.js is shared by every page)
const shopOwned=()=>{try{return new Set(JSON.parse(localStorage.getItem('kino.mods.shop'))?.owned??[]);}catch{return new Set();}};
const texCache=new Map();
export function camoTexture(camo,base=import.meta.url){
  const key=camo.texture??('proc:'+camo.procedural+(camo.spec?':'+camo.spec.seed+':'+camo.spec.tier+':'+camo.spec.style+':'+camo.spec.h+':'+(camo.spec.tone??0):''));
  if(texCache.has(key))return texCache.get(key);
  let t;
  if(camo.texture){t=new THREE.TextureLoader().load(new URL(camo.texture,base).href);}
  else if(camo.procedural==='prestige')t=new THREE.CanvasTexture(drawPrestigeArt(camo.spec));
  else if(camo.procedural==='prestige-glow')t=new THREE.CanvasTexture(drawPrestigeArt(camo.spec,true));
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
  // a model may ask for denser tiling (glTF material extras camoScale, e.g. the Grimhawk's single texture atlas)
  const uniforms={camoMap:{value:camoTexture(camo)},camoScale:{value:(camo.scale??2.5)*(orig.userData?.camoScale??1)},camoMix:{value:camo.mix??.92}};
  if(camo.glow)Object.assign(uniforms,{camoGlow:{value:camoTexture(typeof camo.glow==='string'?{texture:camo.glow}:camo.glow)},camoTime});
  if(camo.anim)Object.assign(uniforms,{camoC1:{value:new THREE.Vector3(...camo.anim.c1)},camoC2:{value:new THREE.Vector3(...camo.anim.c2)}});
  if(camo.metal){m.metalness=Math.max(m.metalness??0,.85);m.roughness=Math.min(m.roughness??1,.35);}
  const prev=orig.onBeforeCompile;
  m.onBeforeCompile=(shader,renderer)=>{prev?.call(m,shader,renderer);Object.assign(shader.uniforms,uniforms);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D camoMap;uniform float camoScale;uniform float camoMix;')
      .replace('#include <map_fragment>',`#include <map_fragment>
#ifdef USE_MAP
{ vec3 camoC=texture2D(camoMap,vMapUv*camoScale${camo.anim?'+vec2(camoTime*.025,camoTime*.01)':''}).rgb;
  float camoL=dot(diffuseColor.rgb,vec3(.299,.587,.114));
  diffuseColor.rgb=mix(diffuseColor.rgb,camoC*(.3+camoL*1.9),camoMix); }
#endif`);
    // Pack-a-Punch: the circuit traces glow, a colour wave running through them
    // Prestige Master: the cracks glow in the gun's two colours, a pulse running along them, drifting with the pattern
    if(camo.anim)shader.fragmentShader=shader.fragmentShader.replace('uniform sampler2D camoMap;','uniform sampler2D camoMap;uniform sampler2D camoGlow;uniform float camoTime;uniform vec3 camoC1;uniform vec3 camoC2;')
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
#ifdef USE_MAP
{ vec2 cu=vMapUv*camoScale+vec2(camoTime*.025,camoTime*.01);float crack=texture2D(camoGlow,cu).r;
  float w=.5+.5*sin(camoTime*3.2-(cu.x*1.3+cu.y)*8.);
  vec3 col=mix(camoC1,camoC2,.5+.5*sin(camoTime*.8+cu.x*4.+cu.y*2.));
  totalEmissiveRadiance+=col*crack*(.35+2.6*w*w); }
#endif`);
    else if(camo.glow)shader.fragmentShader=shader.fragmentShader.replace('uniform sampler2D camoMap;','uniform sampler2D camoMap;uniform sampler2D camoGlow;uniform float camoTime;')
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
#ifdef USE_MAP
{ vec2 cu=vMapUv*camoScale;float trace=smoothstep(.36,.62,texture2D(camoGlow,cu).r);
  float w=.5+.5*sin(camoTime*2.2-(cu.x+cu.y)*5.);
  vec3 col=mix(vec3(.55,.18,1.),vec3(.1,.55,1.),.5+.5*sin(camoTime*.7+cu.y*2.));
  totalEmissiveRadiance+=col*trace*(.6+2.2*w*w); }
#endif`);};
  m.customProgramCacheKey=()=>(orig.customProgramCacheKey?.()??'')+(camo.anim?'|camo-anim':camo.glow?'|camo-pap':'|camo');
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
  if(d.weaponClass)return d.weaponClass;   // imported guns say what they are (mods/bo3-weapons)
  const b=d.baseId??d.id;
  if(/ray_gun|thundergun|microwavegun|freezegun/.test(b))return 'Wonder weapon';if(/minigun/.test(b))return 'Death Machine';if(d.projectileSpeed>0||d.explosionRadius)return 'Launcher';if(d.pellets>1)return 'Shotgun';
  if(/l96|dragunov/.test(b))return 'Sniper rifle';if(/hk21|rpk/.test(b))return 'Light machine gun';if(/m1911|python|cz75/.test(b))return 'Pistol';
  if(/mp40|mp5k|mpl|pm63|ak74u|spectre|g11/.test(b))return 'Submachine gun';return 'Rifle';
}
export const CLASSES=[['ar','ASSAULT RIFLES',['Rifle']],['smg','SMGS',['Submachine gun']],['shotgun','SHOTGUNS',['Shotgun']],['lmg','LMGS',['Light machine gun']],
  ['sniper','SNIPERS',['Sniper rifle']],['pistol','PISTOLS',['Pistol']],['launcher','LAUNCHERS',['Launcher']],['special','SPECIALS',['Wonder weapon','Death Machine','Special']]];   // Special: BO7's class (the Grimhawk)
export const classOf=(weapons,id)=>{const d=weapons?.[id];return d?CLASSES.find(c=>c[2].includes(weaponClass(d)))?.[0]??'special':'special';};
export const classLabel=key=>CLASSES.find(c=>c[0]===key)?.[1]??key;
// the guns of a class that count toward Diamond (no Pack-a-Punch entries)
export function classGuns(weapons,key){return Object.keys(weapons??{}).filter(id=>!/upgraded/.test(id)&&weapons[id]?.model&&classOf(weapons,id)===key);}

// ---- challenges -------------------------------------------------------------------------------
export const camoProgress=(profile,id)=>profile.camo?.[id]?.p??{};
const baseCamos=cats=>cats.camos.filter(c=>!c.mastery&&!c.classMastery&&!c.reward&&!c.shop);   // shop camos are bought (Phase 6)   // reward camos come from a map's reward flag (profile.rewards), not a challenge
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
  for(const c of cats.camos)if(c.reward&&profile.rewards?.[c.reward])done.add(c.id);
  for(const c of loadPrestige().camos)done.add(c);   // prestige camos: earned on one gun, worn on any
  const owned=shopOwned();for(const c of cats.camos)if(c.shop&&owned.has(c.shop))done.add(c.id);   // shop camos: bought once, worn on any
  return done;
}
export function equippedCamo(cats,profile,id,weapons){
  const on=profile.camo?.[id]?.on;if(!on)return null;
  return camoUnlocked(cats,profile,id,weapons).has(on)?camoById(cats,on)??null:null;
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
