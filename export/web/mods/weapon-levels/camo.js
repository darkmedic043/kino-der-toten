// Weapon camos. A camo is one tileable texture (camos.json "texture", a file
// next to this module) or, until real ones are supplied, a placeholder drawn
// here ("procedural"). It is painted over a gun's body materials only (not
// sights, lenses, suppressors, underbarrels, straps, mags or hands), keeping
// the gun's own shading and wear: camo colour × the base texture's brightness.
import * as THREE from 'three';
import { restick, cloneMaterial } from '../stickers/stickers.js';
import { loadPrestige } from '../prestige/prestige.js';
import { PRESTIGE_TABLE } from '../prestige/camo-table.js';
import { drawPrestigeArt, STYLES as PRESTIGE_STYLES, hslRgb as artRgb } from '../prestige/prestige-art.js';

export async function loadCamos(base=import.meta.url){
  const r=await fetch(new URL('camos.json',base));
  if(!r.ok)throw new Error('camos.json HTTP '+r.status);
  const cats=await r.json();setWrap(cats.wrap);return cats;
}

// Per-material wrap rules (camos.json `wrap`; weapon-levels.md): the listed guns take the camo projected
// in gun space instead of through their UV islands, and keep their parts that aren't paint.
let WRAP=null;const wrapCache=new Map();
function setWrap(w){if(!w||WRAP)return;WRAP={...w,guns:new RegExp(w.guns),skip:new RegExp(w.skip),rules:w.rules.map(r=>({...r,re:new RegExp(r.match)}))};wrapCache.clear();}
export function wrapOf(name=''){
  if(!WRAP||!WRAP.guns.test(name))return null;
  let w=wrapCache.get(name);if(w)return w;
  w={skip:WRAP.skip.test(name),scale:WRAP.scale,warm:WRAP.warm,pale:null,...WRAP.rules.find(r=>r.re.test(name))};
  wrapCache.set(name,w);return w;
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
  // ---- Season 0 (Melon Harvest) camos, from the pass ----
  vinepatch(g,S,r,wrap){g.fillStyle='#1d2a12';g.fillRect(0,0,S,S);g.lineCap='round';for(let i=0;i<40;i++){const x=r()*S,y=r()*S;let a=r()*6.283;const pts=[[x,y]];for(let k=0;k<12;k++){a+=(r()-.5)*.9;pts.push([pts.at(-1)[0]+Math.cos(a)*14,pts.at(-1)[1]+Math.sin(a)*14]);}
    wrap(()=>{g.strokeStyle='#3f6a22';g.lineWidth=5;g.beginPath();pts.forEach(([px,py],k)=>k?g.lineTo(px,py):g.moveTo(px,py));g.stroke();g.fillStyle='#7cd65a';for(const [px,py] of pts.filter((_,k)=>k%3===1)){g.beginPath();g.ellipse(px,py,7,4,a,0,6.283);g.fill();}});}},
  cornfield(g,S,r){g.fillStyle='#5a4a1a';g.fillRect(0,0,S,S);for(let x=0;x<S;x+=10){const h=S;g.fillStyle=`hsl(${45+r()*12},70%,${38+r()*20}%)`;g.fillRect(x,0,6,h);}
    g.fillStyle='rgba(60,90,20,.6)';for(let i=0;i<120;i++){const x=r()*S,y=r()*S;g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+20,y-10,x+40,y+r()*20-5);g.lineTo(x,y+4);g.fill();}},
  pumpkin(g,S,r){for(let x=0;x<S;x++){const t=Math.sin(x/S*Math.PI*12);g.fillStyle=`hsl(${24+t*4},85%,${38+t*10}%)`;g.fillRect(x,0,1,S);}g.fillStyle='rgba(60,25,0,.35)';for(let i=0;i<300;i++)g.fillRect(r()*S,r()*S,2+r()*3,1);},
  fog(g,S,r,wrap){g.fillStyle='#2a2e30';g.fillRect(0,0,S,S);for(let i=0;i<70;i++){const x=r()*S,y=r()*S,rad=30+r()*80;wrap(()=>{const gr=g.createRadialGradient(x,y,0,x,y,rad);gr.addColorStop(0,'rgba(200,210,215,.22)');gr.addColorStop(1,'rgba(200,210,215,0)');g.fillStyle=gr;g.fillRect(x-rad,y-rad,rad*2,rad*2);});}
    g.strokeStyle='rgba(20,22,24,.7)';g.lineWidth=3;for(let i=0;i<14;i++){const x=r()*S,y=r()*S;g.beginPath();g.moveTo(x,y);g.lineTo(x,y-22);g.moveTo(x-8,y-14);g.lineTo(x+8,y-14);g.stroke();}},
  bloodmoon(g,S,r,wrap){g.fillStyle='#1a0505';g.fillRect(0,0,S,S);for(let i=0;i<26;i++){const x=r()*S,y=r()*S,rad=10+r()*40;wrap(()=>{const gr=g.createRadialGradient(x,y,rad*.2,x,y,rad);gr.addColorStop(0,'#7a1410');gr.addColorStop(.8,'#3a0806');gr.addColorStop(1,'rgba(200,40,30,.6)');g.fillStyle=gr;g.beginPath();g.arc(x,y,rad,0,6.283);g.fill();});}},
  harvest(g,S,r,wrap){g.fillStyle='#3a1e0a';g.fillRect(0,0,S,S);const cols=['#c8501a','#e8892a','#a8301a','#f0c060','#6a3a12'];for(let i=0;i<140;i++){const x=r()*S,y=r()*S,a=r()*6.283,l=14+r()*18,c=cols[i%5];
    wrap(()=>{g.save();g.translate(x,y);g.rotate(a);g.fillStyle=c;g.beginPath();g.moveTo(0,-l);g.quadraticCurveTo(l*.7,0,0,l);g.quadraticCurveTo(-l*.7,0,0,-l);g.fill();g.strokeStyle='rgba(40,15,0,.5)';g.beginPath();g.moveTo(0,-l);g.lineTo(0,l);g.stroke();g.restore();});}},
  harvestgold(g,S,r,wrap){const gr=g.createLinearGradient(0,0,S,S);gr.addColorStop(0,'#fff0b8');gr.addColorStop(.35,'#c9952f');gr.addColorStop(.6,'#ffe39a');gr.addColorStop(1,'#a8761e');g.fillStyle=gr;g.fillRect(0,0,S,S);
    g.strokeStyle='rgba(120,70,10,.55)';g.lineWidth=2;for(let i=0;i<30;i++){const x=r()*S,y=r()*S;wrap(()=>{for(let k=0;k<5;k++){g.beginPath();g.ellipse(x+k*9,y-k*12,6,11,.5,0,6.283);g.stroke();}g.beginPath();g.moveTo(x,y+10);g.lineTo(x+40,y-60);g.stroke();});}},
  witchfire(g,S,r){g.fillStyle='#0e0716';g.fillRect(0,0,S,S);for(let i=0;i<600;i++){g.fillStyle=`rgba(${60+r()*40},${20+r()*30},${90+r()*50},.25)`;g.fillRect(r()*S,r()*S,3,3);}},
  'flame-glow'(g,S,r,wrap){g.fillStyle='#000';g.fillRect(0,0,S,S);for(let i=0;i<46;i++){const x=r()*S,y=r()*S,h=40+r()*70,w=10+r()*16;
    wrap(()=>{const gr=g.createLinearGradient(x,y,x,y-h);gr.addColorStop(0,'rgba(255,255,255,.9)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.beginPath();g.moveTo(x-w,y);g.quadraticCurveTo(x-w*.3,y-h*.5,x,y-h);g.quadraticCurveTo(x+w*.3,y-h*.5,x+w,y);g.fill();});}},
  moonlit(g,S,r){const gr=g.createLinearGradient(0,0,0,S);gr.addColorStop(0,'#08102a');gr.addColorStop(1,'#030612');g.fillStyle=gr;g.fillRect(0,0,S,S);g.fillStyle='rgba(120,140,220,.15)';for(let i=0;i<8;i++){g.beginPath();g.arc(r()*S,r()*S,20+r()*50,0,6.283);g.fill();}},
  'star-glow'(g,S,r,wrap){g.fillStyle='#000';g.fillRect(0,0,S,S);for(let i=0;i<160;i++){const x=r()*S,y=r()*S,s=1+r()*3.5;wrap(()=>{g.fillStyle='#fff';g.beginPath();for(let k=0;k<8;k++){const a=k/8*6.283,rr=k%2?s*.35:s*2.2;g.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}g.fill();});}},
  scarecrowburlap(g,S,r){g.fillStyle='#8a6a3a';g.fillRect(0,0,S,S);for(let y=0;y<S;y+=4){g.fillStyle=`rgba(60,40,15,${.15+r()*.2})`;g.fillRect(0,y,S,2);}for(let x=0;x<S;x+=4){g.fillStyle=`rgba(200,170,110,${.08+r()*.12})`;g.fillRect(x,0,2,S);}
    g.strokeStyle='#3a2410';g.lineWidth=3;g.setLineDash([8,6]);for(let i=0;i<9;i++){const y=r()*S;g.beginPath();g.moveTo(0,y);g.lineTo(S,y+(r()-.5)*40);g.stroke();}g.setLineDash([]);
    for(let i=0;i<6;i++){const x=r()*S,y=r()*S,w=40+r()*50,h=30+r()*40;g.fillStyle=['#5a3a1a','#6a5a2a','#7a2a1a'][i%3];g.fillRect(x,y,w,h);g.strokeStyle='#2a1a08';g.setLineDash([5,4]);g.strokeRect(x,y,w,h);g.setLineDash([]);}},
  melonrind(g,S,r){for(let x=0;x<S;x++){const t=Math.sin(x/S*Math.PI*10+Math.sin(x/37)*1.5);g.fillStyle=t>.25?'#1f5a1a':t>-.2?'#2f7a22':'#8acf5a';g.fillRect(x,0,1,S);}
    g.fillStyle='rgba(10,30,8,.35)';for(let i=0;i<500;i++)g.fillRect(r()*S,r()*S,1+r()*3,1+r()*3);},
  lanternlight(g,S,r,wrap){g.fillStyle='#120a04';g.fillRect(0,0,S,S);for(let i=0;i<22;i++){const x=r()*S,y=r()*S,rad=24+r()*40;
    wrap(()=>{const gr=g.createRadialGradient(x,y,0,x,y,rad*2.2);gr.addColorStop(0,'rgba(255,200,90,.9)');gr.addColorStop(.25,'rgba(255,140,40,.5)');gr.addColorStop(1,'rgba(255,120,30,0)');g.fillStyle=gr;g.fillRect(x-rad*2.2,y-rad*2.2,rad*4.4,rad*4.4);
      g.fillStyle='#2a1406';g.fillRect(x-rad*.25,y-rad*.6,rad*.5,rad*.12);});}},
  cropcircle(g,S,r,wrap){g.fillStyle='#6a7a2a';g.fillRect(0,0,S,S);for(let x=0;x<S;x+=3){g.fillStyle=`rgba(${120+r()*40},${130+r()*30},40,.35)`;g.fillRect(x,0,2,S);}
    g.strokeStyle='rgba(230,220,150,.85)';for(let i=0;i<5;i++){const x=r()*S,y=r()*S,R=30+r()*50;wrap(()=>{g.lineWidth=5;g.beginPath();g.arc(x,y,R,0,6.283);g.stroke();g.lineWidth=3;g.beginPath();g.arc(x,y,R*.55,0,6.283);g.stroke();
      for(let k=0;k<6;k++){const a=k/6*6.283;g.beginPath();g.arc(x+Math.cos(a)*R*1.4,y+Math.sin(a)*R*1.4,R*.2,0,6.283);g.stroke();}});}},
  frostharvest(g,S,r,wrap){g.fillStyle='#c8892a';g.fillRect(0,0,S,S);for(let i=0;i<80;i++){const x=r()*S,y=r()*S,l=12+r()*16;wrap(()=>{g.fillStyle=['#a8501a','#e8a040','#7a3a12'][i%3];g.beginPath();g.ellipse(x,y,l,l*.5,r()*3,0,6.283);g.fill();});}
    g.fillStyle='rgba(230,245,255,.55)';for(let i=0;i<900;i++){const x=r()*S,y=r()*S;g.fillRect(x,y,1+r()*2,1);}g.strokeStyle='rgba(220,240,255,.6)';g.lineWidth=1;for(let i=0;i<40;i++){const x=r()*S,y=r()*S;g.beginPath();for(let k=0;k<6;k++){const a=k/6*6.283;g.moveTo(x,y);g.lineTo(x+Math.cos(a)*7,y+Math.sin(a)*7);}g.stroke();}},
  // ---- Season 1 (Storm & Toll) procedural camos ----
  counterfeit(g,S,r,wrap){const bg=g.createLinearGradient(0,0,S,S);bg.addColorStop(0,'#3f8a5a');bg.addColorStop(.5,'#5aa874');bg.addColorStop(1,'#356f4a');g.fillStyle=bg;g.fillRect(0,0,S,S);g.fillStyle='rgba(20,50,30,.3)';for(let i=0;i<900;i++)g.fillRect(r()*S,r()*S,1+r()*2,1);
    g.lineWidth=1.3;for(let j=0;j<64;j++){const y0=j*S/64,k=2+(j%3),ph=j*.37;g.strokeStyle=j%4?'rgba(200,240,200,.4)':'rgba(255,215,100,.6)';
      wrap(()=>{g.beginPath();for(let x=0;x<=S;x+=4){const y=y0+Math.sin(x/S*6.283*k+ph)*10+Math.sin(x/S*6.283*(k+3)-ph)*4;x?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();});}
    for(let i=0;i<11;i++){const x=r()*S,y=r()*S,R=34+r()*30;wrap(()=>{g.fillStyle='rgba(20,60,35,.55)';g.beginPath();g.arc(x,y,R*.98,0,6.283);g.fill();g.strokeStyle='rgba(255,215,100,.9)';g.lineWidth=2;g.beginPath();
      for(let t=0;t<=6.283*1.001;t+=.02){const rr=R*(.62+.38*Math.cos(t*9));g.lineTo(x+Math.cos(t)*rr,y+Math.sin(t)*rr);}g.stroke();
      g.strokeStyle='#ffd86a';g.lineWidth=3;g.beginPath();g.arc(x,y,R*.36,0,6.283);g.stroke();g.fillStyle='#ffd86a';g.font=`bold ${Math.round(R*.42)}px serif`;g.textAlign='center';g.textBaseline='middle';g.fillText('$',x,y+1);});}
    g.fillStyle='rgba(230,255,230,.3)';g.font='bold 9px monospace';g.textAlign='left';g.textBaseline='alphabetic';for(let y=12;y<S;y+=48)g.fillText('MELON NOTE · NOT LEGAL TENDER · MELON NOTE · NOT LEGAL TENDER · MELON NOTE · NOT LEGAL TENDER ·'.repeat(2),-((y*7)%60),y);},
  wax(g,S,r,wrap){g.fillStyle='#7a4a08';g.fillRect(0,0,S,S);const C=10,Rw=12,w=S/C,h=S/Rw,ry=h/1.5;
    for(let row=0;row<Rw;row++)for(let col=0;col<C;col++){const x=col*w+(row%2?w/2:0),y=row*h,l=40+r()*14,fill=r()<.82;
      wrap(()=>{g.beginPath();g.moveTo(x,y-ry);g.lineTo(x+w/2,y-ry/2);g.lineTo(x+w/2,y+ry/2);g.lineTo(x,y+ry);g.lineTo(x-w/2,y+ry/2);g.lineTo(x-w/2,y-ry/2);g.closePath();
        const gr=g.createRadialGradient(x-w*.12,y-ry*.3,1,x,y,ry*1.1);gr.addColorStop(0,fill?`hsl(40,95%,${l+16}%)`:'#3a1e02');gr.addColorStop(1,fill?`hsl(32,90%,${l-8}%)`:'#1e0e00');g.fillStyle=gr;g.fill();
        g.strokeStyle='#4a2604';g.lineWidth=4;g.stroke();g.strokeStyle='rgba(255,220,140,.35)';g.lineWidth=1;g.stroke();});}
    for(let i=0;i<16;i++){const x=r()*S,y=r()*S,len=30+r()*70,dw=4+r()*5;wrap(()=>{const gr=g.createLinearGradient(x,y,x,y+len);gr.addColorStop(0,'rgba(255,200,70,.85)');gr.addColorStop(1,'rgba(230,150,20,.9)');g.fillStyle=gr;
      g.beginPath();g.moveTo(x-dw,y);g.lineTo(x-dw*.6,y+len);g.arc(x,y+len,dw*.75,3.1416,0,true);g.lineTo(x+dw,y);g.fill();g.fillStyle='rgba(255,245,200,.5)';g.fillRect(x-dw*.45,y+3,1.5,len*.8);});}},
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
    swatchOf(c).catch(()=>'').then(url=>{swatches.set(c.id,url);for(const f of swatchWaiters.splice(0))f();swatchBusy=false;pumpSwatches();});});
}
async function swatchOf(c){
  if(c.swatch)return new URL(c.swatch,import.meta.url).href;
  const t=c.frames?camoFrames(c)[0]:camoTexture(c);await t.userData.loaded;const img=t.image;
  if(c.gradient){   // pattern × gradient: drawn here with the gradient's row at a head-on view
    const g=camoTexture({texture:c.gradient});await g.userData.loaded;const S=96,cv=document.createElement('canvas');cv.width=cv.height=S;const x=cv.getContext('2d',{willReadFrequently:true});
    const G=64;x.drawImage(g.image,0,0,G,G);const gr=x.getImageData(0,0,G,G).data,off=(c.sheen?.[0]??0)+(c.sheen?.[1]??.35)*.15;
    x.drawImage(img,0,0,S,S);const d=x.getImageData(0,0,S,S);for(let i=0;i<d.data.length;i+=4){const u=d.data[i+1]/255,gx=Math.min(G-1,Math.floor(u*G)),gy=Math.min(G-1,Math.floor(Math.min(1,u+off)*G)),k=(gy*G+gx)*4;d.data[i]=gr[k];d.data[i+1]=gr[k+1];d.data[i+2]=gr[k+2];}
    x.putImageData(d,0,0);return cv.toDataURL('image/jpeg',.8);
  }
  if(img instanceof HTMLCanvasElement){const s=document.createElement('canvas');s.width=s.height=96;s.getContext('2d').drawImage(img,0,0,96,96);return s.toDataURL('image/jpeg',.8);}
  return img?.src??'';
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
  const data=!!camo.gradient,key=(camo.texture?camo.texture+(data?'|data':''):null)??('proc:'+camo.procedural+(camo.spec?':'+camo.spec.seed+':'+camo.spec.tier+':'+camo.spec.style+':'+camo.spec.h+':'+(camo.spec.tone??0):''));
  if(texCache.has(key))return texCache.get(key);
  let t;
  if(camo.texture){let res;t=new THREE.TextureLoader().load(new URL(camo.texture,base).href,()=>res(),undefined,()=>res());t.userData.loaded=new Promise(r=>res=r);}
  else if(camo.procedural==='prestige')t=new THREE.CanvasTexture(drawPrestigeArt(camo.spec));
  else if(camo.procedural==='prestige-glow')t=new THREE.CanvasTexture(drawPrestigeArt(camo.spec,true));
  else t=new THREE.CanvasTexture(draw(camo.procedural));
  // a gradient camo's pattern is a lookup value (its green channel picks the gradient's column), not a colour
  t.colorSpace=data?THREE.NoColorSpace:THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;t.userData.loaded??=Promise.resolve();
  texCache.set(key,t);return t;
}
// an animated camo's frames ("frames": {dir, count, ext, fps, blend}): one texture each, swapped as a uniform (no shader change)
const frameCache=new Map();
export function camoFrames(camo,base=import.meta.url){
  const f=camo.frames,key=f.dir;if(frameCache.has(key))return frameCache.get(key);
  const list=Array.from({length:f.count},(_,i)=>camoTexture({texture:f.dir+String(i).padStart(2,'0')+'.'+(f.ext??'jpg')},base));
  frameCache.set(key,list);return list;
}
// every texture a camo draws with, loaded (the game uploads them all while loading: a frame first shown mid-match would hitch)
export function camoTextures(camo){
  if(!camo)return [];const out=camo.frames?[...camoFrames(camo)]:[camoTexture(camo)];
  if(camo.gradient)out.push(camoTexture({texture:camo.gradient}));
  if(camo.glow)out.push(camoTexture(typeof camo.glow==='string'?{texture:camo.glow}:camo.glow));
  return out;
}

// ---- applying -----------------------------------------------------------------------------
// one clock for every Pack-a-Punch camo (advanced by the weapon-levels mod)
export const camoTime={value:0};
export const PAP_CAMO={id:'pap',name:'Pack-a-Punch',texture:'../../textures/camo_packapunch_c.png',glow:'../../textures/camo_packapunch_env.png',scale:2,mix:.88};
const matCache=new Map();   // original material uuid + camo id → camo material
function camoMaterial(orig,camo){
  const key=orig.uuid+'|'+camo.id;if(matCache.has(key))return matCache.get(key);
  const m=cloneMaterial(orig);m.userData={...orig.userData,camoOf:orig,camo:camo.id};
  // a model may ask for denser tiling (glTF material extras camoScale, e.g. the Grimhawk's single texture atlas)
  const fr=camo.frames?camoFrames(camo):null,fps=camo.frames?.fps??8,fpos=()=>((camoTime.value*fps)%fr.length+fr.length)%fr.length;
  const uniforms={camoMap:fr?{get value(){return fr[Math.floor(fpos())];}}:{value:camoTexture(camo)},
    camoMapB:fr?{get value(){return fr[(Math.floor(fpos())+1)%fr.length];}}:{value:null},camoBlend:fr&&camo.frames.blend!==false?{get value(){const f=fpos();return Math.max(1e-3,f-Math.floor(f));}}:{value:0},
    camoGrad:{value:camo.gradient?camoTexture({texture:camo.gradient}):null},camoGradV:{value:new THREE.Vector3(camo.gradient?1:0,...(camo.sheen??[0,.35]))},camoEmit:{value:camo.emit??0},camoScale:{value:(camo.scale??2.5)*(orig.userData?.camoScale??1)},camoMix:{value:camo.mix??.92}};
  // uniforms rather than defines: a wrapped gun shares the programs of every other camo'd gun (no new variant to warm up)
  const wrap=wrapOf(orig.name),ramp=(r)=>r??[2,3];
  Object.assign(uniforms,{camoTri:{value:wrap?(camo.scale??2.5)*wrap.scale:0},camoKeep:{value:new THREE.Vector4(...ramp(wrap?.warm),...ramp(wrap?.pale))},camoMR:{value:new THREE.Vector2(1,1)}});
  if(camo.glow)Object.assign(uniforms,{camoGlow:{value:camoTexture(typeof camo.glow==='string'?{texture:camo.glow}:camo.glow)},camoTime});
  if(camo.anim)Object.assign(uniforms,{camoC1:{value:new THREE.Vector3(...camo.anim.c1)},camoC2:{value:new THREE.Vector3(...camo.anim.c2)}});
  if(camo.metal){m.metalness=Math.max(m.metalness??0,.85);m.roughness=Math.min(m.roughness??1,.35);uniforms.camoMR.value.set((orig.metalness??0)/m.metalness,(orig.roughness??1)/m.roughness);}   // kept parts stay as they were
  const prev=orig.onBeforeCompile;
  m.onBeforeCompile=(shader,renderer)=>{prev?.call(m,shader,renderer);Object.assign(shader.uniforms,uniforms);
    const drift=camo.anim?'vec2(camoTime*.025,camoTime*.01)':'vec2(0.)';
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vCamoP;varying vec3 vCamoN;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvCamoP=position;vCamoN=normal;');   // the bind pose: a moving part carries its pattern along
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform sampler2D camoMap;uniform float camoScale;uniform float camoMix;uniform float camoTri;uniform vec4 camoKeep;uniform vec2 camoMR;
uniform sampler2D camoMapB;uniform float camoBlend;uniform sampler2D camoGrad;uniform vec3 camoGradV;uniform float camoEmit;
varying vec3 vCamoP;varying vec3 vCamoN;float camoKept=0.;vec3 camoE=vec3(0.);
// gradient camos (BO3 style): the pattern's value is read along the gradient's diagonal, and the view angle moves the row
// (the colour shifts at glancing angles as the gun turns)
vec3 camoLook(vec3 c,float fres){ return camoGradV.x<.5?c:texture2D(camoGrad,vec2(clamp(c.g,.004,.996),clamp(c.g+camoGradV.y+camoGradV.z*fres,.004,.996))).rgb; }
vec3 camoPlanar(sampler2D t,vec2 off){ vec3 p=vCamoP*camoTri,w=abs(normalize(vCamoN+1e-5));w*=w;w*=w;w/=w.x+w.y+w.z+1e-5;
  return texture2D(t,p.zy+off).rgb*w.x+texture2D(t,p.xz+off+.37).rgb*w.y+texture2D(t,p.xy+off+.71).rgb*w.z; }
// animated camos: this frame blended into the next
vec3 camoTex(vec2 uv){ vec3 c=texture2D(camoMap,uv).rgb;return camoBlend>0.?mix(c,texture2D(camoMapB,uv).rgb,camoBlend):c; }
vec3 camoTexTri(vec2 off){ vec3 c=camoPlanar(camoMap,off);return camoBlend>0.?mix(c,camoPlanar(camoMapB,off),camoBlend):c; }`)
      .replace('#include <map_fragment>',`#include <map_fragment>
#ifdef USE_MAP
{ vec2 camoOff=${drift};float camoL=dot(diffuseColor.rgb,vec3(.299,.587,.114)),camoF=.3;
  #if defined(STANDARD)&&!defined(FLAT_SHADED)
  camoF=1.-abs(dot(normalize(vNormal),normalize(vViewPosition)));
  #endif
  if(camoTri>0.){
    // plain albedo decides what is paint: wood, leather, brass and printed colour are saturated and warm, labels are pale
    vec3 k=texture2D(map,vMapUv,1.).rgb;float top=max(k.r,k.g),lo=dot(texture2D(map,vMapUv,4.).rgb,vec3(.299,.587,.114));
    camoKept=max(smoothstep(camoKeep.x,camoKeep.y,(top-k.b)/max(top,.025))*smoothstep(.008,.03,top),smoothstep(camoKeep.z,camoKeep.w,dot(k,vec3(.333))));
    // fine detail only (the texture over its own blur), or a white gun comes out twice as bright as a black one
    vec3 cc=camoLook(camoTexTri(camoOff),camoF);camoE=cc*camoMix*(1.-camoKept);
    diffuseColor.rgb=mix(diffuseColor.rgb,cc*clamp(camoL/max(lo,.02),.6,1.3)*.85,camoMix*(1.-camoKept));
  }else{ vec3 cc=camoLook(camoTex(vMapUv*camoScale+camoOff),camoF);camoE=cc*camoMix;diffuseColor.rgb=mix(diffuseColor.rgb,cc*(.3+camoL*1.9),camoMix); } }
#endif`)
      .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=camoE*camoEmit;')   // glowing camos (camos.json emit)
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor*=mix(1.,camoMR.y,camoKept);')
      .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor*=mix(1.,camoMR.x,camoKept);');
    // Pack-a-Punch: the circuit traces glow, a colour wave running through them
    // Prestige Master: the cracks glow in the gun's two colours, a pulse running along them, drifting with the pattern
    if(camo.anim)shader.fragmentShader=shader.fragmentShader.replace('uniform sampler2D camoMap;','uniform sampler2D camoMap;uniform sampler2D camoGlow;uniform float camoTime;uniform vec3 camoC1;uniform vec3 camoC2;')
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
#ifdef USE_MAP
{ vec2 camoOff=vec2(camoTime*.025,camoTime*.01),cu=camoTri>0.?vCamoP.xy*camoTri+camoOff:vMapUv*camoScale+camoOff;float crack=camoTri>0.?camoPlanar(camoGlow,camoOff).r:texture2D(camoGlow,cu).r;
  float w=.5+.5*sin(camoTime*3.2-(cu.x*1.3+cu.y)*8.);
  vec3 col=mix(camoC1,camoC2,.5+.5*sin(camoTime*.8+cu.x*4.+cu.y*2.));
  totalEmissiveRadiance+=col*crack*(.35+2.6*w*w)*(1.-camoKept); }
#endif`);
    else if(camo.glow)shader.fragmentShader=shader.fragmentShader.replace('uniform sampler2D camoMap;','uniform sampler2D camoMap;uniform sampler2D camoGlow;uniform float camoTime;')
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
#ifdef USE_MAP
{ vec2 cu=camoTri>0.?vCamoP.xy*camoTri:vMapUv*camoScale;float trace=smoothstep(.36,.62,camoTri>0.?camoPlanar(camoGlow,vec2(0.)).r:texture2D(camoGlow,cu).r);
  float w=.5+.5*sin(camoTime*2.2-(cu.x+cu.y)*5.);
  vec3 col=mix(vec3(.55,.18,1.),vec3(.1,.55,1.),.5+.5*sin(camoTime*.7+cu.y*2.));
  totalEmissiveRadiance+=col*trace*(.6+2.2*w*w)*(1.-camoKept); }
#endif`);};
  m.customProgramCacheKey=()=>(orig.customProgramCacheKey?.()??'')+(camo.anim?'|camo-anim':camo.glow?'|camo-pap':'|camo');
  m.needsUpdate=true;matCache.set(key,m);return m;
}
export const isBody=m=>!!m&&!SKIP.test(m.name??'')&&!!m.map&&!wrapOf(m.name)?.skip;
// Paint `root` with `camo` (an entry from camos.json) or restore it (null).
export function applyCamo(root,camo){
  // charms and gun screens (userData.charm, mods/charms) hang under the gun but keep their own materials (2026-11-08: the
  // gold camo was painted over a screen's textured housing; the user saw it as a texture glitch)
  const walk=(o,fn)=>{if(o.userData?.charm)return;fn(o);for(const c of o.children)walk(c,fn);};
  if(root)walk(root,o=>{
    if(!o.isMesh)return;
    const list=Array.isArray(o.material)?o.material:[o.material];
    const next=list.map(m=>{const orig=m?.userData?.camoOf??m;if(!isBody(orig))return m;return camo?camoMaterial(orig,camo):orig;});
    o.material=Array.isArray(o.material)?next:next[0];
  });
  if(root?.userData?.kinoStickers)restick(root);   // stickers (mods/stickers) sit on top of whatever camo the gun has
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
// Stark's suit weapons (stark/armor.js copy a base gun's model) and guns that never kill don't count (2026-10-21: the
// suitcase and cloak made pistol Diamond impossible in a match)
export function classGuns(weapons,key){return Object.keys(weapons??{}).filter(id=>{const d=weapons[id];
  return !/upgraded/.test(id)&&d?.model&&!d.suitWeapon&&!d.soon&&!d.hideGun&&!/^iron_/.test(id)&&(d.damage??1)>0&&classOf(weapons,id)===key;});}

// ---- challenges -------------------------------------------------------------------------------
export const camoProgress=(profile,id)=>profile.camo?.[id]?.p??{};
// The challenge a camo asks of this gun: camos.json "alt" swaps one for guns that can't do it (2026-10-21: the
// Thundergun, Wave Gun, Winter's Howl and DG-2 can't score headshots, so their Tiger asks for crowd kills instead)
export const challengeOf=(cats,id,c)=>cats.alt?.[id]?.[c.challenge]??c.challenge;
const baseCamos=cats=>cats.camos.filter(c=>!c.mastery&&!c.classMastery&&!c.reward&&!c.shop);   // shop camos are bought (Phase 6)   // reward camos come from a map's reward flag (profile.rewards), not a challenge
// a gun has Gold (its mastery) when every challenge camo is done
export function hasMastery(cats,profile,id){const p=camoProgress(profile,id);return baseCamos(cats).every(c=>(p[challengeOf(cats,id,c)]??0)>=c.count);}
// Diamond progress for a gun's class: guns with Gold / guns in the class
export function classProgress(cats,profile,id,weapons){
  const key=classOf(weapons,id);if(!weapons||key==='special')return null;
  const guns=classGuns(weapons,key);return {key,label:classLabel(key),done:guns.filter(g=>hasMastery(cats,profile,g)).length,total:guns.length};
}
export function camoUnlocked(cats,profile,id,weapons){
  const p=camoProgress(profile,id),list=baseCamos(cats),done=new Set(list.filter(c=>(p[challengeOf(cats,id,c)]??0)>=c.count).map(c=>c.id));
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
  add('kills');if(flags.head)add('headshots');if(flags.low)add('low');if(flags.moving)add('moving');if(flags.multi)add('multi');if(flags.crowd)add('crowd');
  const after=camoUnlocked(cats,profile,id,weapons);
  return cats.camos.filter(c=>after.has(c.id)&&!before.has(c.id));
}
