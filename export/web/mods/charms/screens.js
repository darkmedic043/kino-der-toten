// Gun screens (2026-11-07): a small display mounted flat on the left side of a gun (the side the player sees), part of the
// charm system (Gunsmith CHARM row, SCREENS tab). Shared by the game (charms/mod.js) and the Gunsmith preview.
//
// A screen entry (charms.json `screens`) picks a housing (`housings`: a Blender model from .tools/build_gun_screens.py,
// `slab` = the screen fills the face, `field` = screen over three buttons) and a kind of content:
//   art   : a looping animation (built-in `melon`, or a sprite sheet {image, cols, rows, frames, fps})
//   kills : this gun's lifetime kills and headshots (the camo counters), live
//   buddy : a melon face that reacts to kills, headshots, reloads, getting hit and going down, and dozes off when idle
//   ammo  : mag and reserve, a round counter, low ammo / empty / reload warnings
// The picture is drawn in JS into a tiny pixel buffer (64x64 or 84x64, about 20 KB), uploaded only when it changes and at
// most 15 times a second, no mipmaps; the shader adds the LCD pixel grid, the glow and the glass. The housing's buttons
// (btn_0..2 on `field`) press with screen.press(i) and are handed to the content (`button`), for later use.
//
// Mount: found per gun model from its visible vertices in the root bone's space (x forward, y left, z up): a spot on the
// upper receiver where the housing's back is backed by the gun, clear of loose parts (mags), moving parts, the hands, the
// sights and the charm's drop; the face is tilted a little up and back toward the eye. `foot` stretches from the back
// to the gun's surface. charms.json screenMounts[gun id] = {at:[x,y,z] (model units), size, tilt, yaw} where it looks wrong.
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { charmOwned, visiblePoints, pct, LOOSE, FIDGET, gunAnchor } from './charms.js';

export function screenFor(cat,state,gunId){const s=cat?.screens?.find(x=>x.id===state?.screen?.[gunId]);return s&&charmOwned(s)?s:null;}
export const housingOf=(cat,s)=>cat?.housings?.[s?.housing]??null;

// ---- pixels ---------------------------------------------------------------------------------------------------------------
// a 3x5 font: five rows of three bits, top row first, as octal digits
const FONT={0:'75557',1:'26227',2:'71747',3:'71717',4:'55711',5:'74717',6:'74757',7:'71222',8:'75757',9:'75717',
  A:'25755',B:'65656',C:'34443',D:'65556',E:'74647',F:'74644',G:'34553',H:'55755',I:'72227',J:'11152',K:'55655',L:'44447',
  M:'57755',N:'65555',O:'25552',P:'65644',Q:'25563',R:'65655',S:'34216',T:'72222',U:'55557',V:'55552',W:'55775',X:'55255',
  Y:'55222',Z:'71247',' ':'00000','-':'00700','!':'22202','/':'11244',':':'02020','.':'00002','+':'02720','%':'51245','?':'61202',"'":'22000'};
const hex=h=>{const n=parseInt(String(h).replace('#',''),16);return [n>>16&255,n>>8&255,n&255];};
const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const scl=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];

export class Lcd{
  constructor(w,h){
    this.w=w;this.h=h;this.data=new Uint8Array(w*h*4);this.prev=0;
    this.tex=new THREE.DataTexture(this.data,w,h,THREE.RGBAFormat);
    this.tex.magFilter=this.tex.minFilter=THREE.NearestFilter;this.tex.generateMipmaps=false;this.tex.colorSpace=THREE.SRGBColorSpace;
    this.tex.needsUpdate=true;   // row 0 is the top: glTF UVs put v=0 at the image's top (rows were flipped for GL until 2026-11-07, so every screen read upside down)
  }
  px(x,y,c){x|=0;y|=0;if(x<0||y<0||x>=this.w||y>=this.h)return;const i=(y*this.w+x)*4,d=this.data;d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2];d[i+3]=255;}
  clear(c=[0,0,0]){for(let y=0;y<this.h;y++)for(let x=0;x<this.w;x++)this.px(x,y,c);}
  rect(x,y,w,h,c){for(let j=0;j<h;j++)for(let i=0;i<w;i++)this.px(x+i,y+j,c);}
  frame(x,y,w,h,c){for(let i=0;i<w;i++){this.px(x+i,y,c);this.px(x+i,y+h-1,c);}for(let j=0;j<h;j++){this.px(x,y+j,c);this.px(x+w-1,y+j,c);}}
  disc(cx,cy,r,c){for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)if(x*x+y*y<=r*r+r*.8)this.px(cx+x,cy+y,c);}
  line(x0,y0,x1,y1,c){x0|=0;y0|=0;x1|=0;y1|=0;const dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let e=dx+dy;
    for(;;){this.px(x0,y0,c);if(x0===x1&&y0===y1)break;const e2=2*e;if(e2>=dy){e+=dy;x0+=sx;}if(e2<=dx){e+=dx;y0+=sy;}}}
  textW(s,k=1){return String(s).length*4*k-k;}
  text(s,x,y,c,k=1){s=String(s).toUpperCase();for(let n=0;n<s.length;n++){const g=FONT[s[n]]??FONT['?'];
    for(let r=0;r<5;r++){const bits=+g[r];for(let b=0;b<3;b++)if(bits>>(2-b)&1)this.rect(x+(n*4+b)*k,y+r*k,k,k,c);}}return this.textW(s,k);}
  center(s,y,c,k=1){return this.text(s,Math.round((this.w-this.textW(s,k))/2),y,c,k);}
  // a little picture from rows of characters: '.' = nothing, else the colour from pal
  sprite(rows,x,y,pal,k=1){rows.forEach((r,j)=>{for(let i=0;i<r.length;i++){const c=pal[r[i]];if(c)this.rect(x+i*k,y+j*k,k,k,c);}});}
  // upload only when the picture changed
  flush(){const u=new Uint32Array(this.data.buffer);let h=2166136261;for(let i=0;i<u.length;i++)h=Math.imul(h^u[i],16777619);
    if(h!==this.prev){this.prev=h;this.tex.needsUpdate=true;return true;}return false;}
}

const ICON={
  skull:['.#####.','#######','##.#.##','#######','.##.##.','.#.#.#.'],
  cross:['...#...','..###..','.#.#.#.','#######','.#.#.#.','..###..','...#...'],
  bullet:['.#.','###','###','###','###','###'],
};
const fmt=n=>n>=1e6?(n/1e6).toFixed(n<1e7?1:0)+'M':n>=1e5?Math.round(n/1e3)+'K':String(n|0);

// ---- content --------------------------------------------------------------------------------------------------------------
// each draws one picture from the screen's state st (kills, heads, mag, reserve, clip, round, reloading, down, ...) and
// its own memory m, at time t (seconds); ev(kind) is called for every event (kill, head, reload, hurt, down, button)
const KINDS={
  art:{
    draw(L,st,t,m,e){
      const a=e.art;
      if(a&&typeof a==='object'&&m.frames?.length){const f=m.frames[Math.floor(t*(a.fps??8))%m.frames.length];L.data.set(f);return;}
      melonArt(L,t,e);
    },
  },
  kills:{
    ev(m,k){if(k==='kill'||k==='head')m.flash={k,at:m.t};},
    draw(L,st,t,m,e){
      const P=e.pal,W=L.w,H=L.h;L.clear(P.bg);
      const fl=m.flash&&t-m.flash.at<.35?m.flash.k:null;
      L.rect(0,0,W,9,P.dim);L.center('TALLY',2,P.bg);
      const row=(y,icon,val,hot)=>{L.sprite(ICON[icon],3,y+5,{'#':P.fg});
        const bx=13,bw=W-bx-3,bh=19;L.rect(bx,y,bw,bh,hot?P.fg:P.box);L.frame(bx,y,bw,bh,P.dim);
        const s=fmt(val),k=s.length>5?2:3;L.text(s,bx+bw-4-L.textW(s,k),y+Math.round((bh-5*k)/2),hot?P.bg:P.fg,k);};
      const top=Math.round((H-9-42)/2)+10;
      row(top,'skull',st.kills,fl==='kill'||fl==='head');row(top+23,'cross',st.heads,fl==='head');
    },
  },
  ammo:{
    draw(L,st,t,m,e){
      const P=e.pal,W=L.w,H=L.h;L.clear(P.bg);
      const clip=Math.max(1,st.clip|0),mag=st.mag|0,low=mag<=Math.max(1,Math.floor(clip/4)),blink=Math.floor(t*4)%2===0;
      L.text('RND '+(st.round|0),2,2,P.fg);
      const warn=st.reloading?'RELOAD':mag===0?'EMPTY':low?'LOW':'';
      if(warn&&(st.reloading||blink))L.text(warn,W-2-L.textW(warn),2,st.reloading?P.fg:P.warn);
      L.rect(0,9,W,1,P.dim);
      const s=String(mag),k=s.length>3?3:4,col=low&&!st.reloading?P.warn:P.fg;
      L.text(s,Math.round((W-L.textW(s,k))/2)-6,14,col,k);
      const r='/'+fmt(st.reserve|0);L.text(r,W-2-L.textW(r),14+5*k-5,P.dim);
      // the mag as a bar: one notch per round up to 40, a plain bar beyond
      const by=H-10,bw=W-12;L.sprite(ICON.bullet,2,by-1,{'#':P.dim});L.frame(8,by,bw+2,7,P.dim);
      if(st.reloading){const p=(t*1.6)%1;for(let i=0;i<bw;i++)if(((i/bw-p)%1+1)%1<.25)L.rect(9+i,by+1,1,5,P.fg);}
      else if(clip<=40){const n=Math.min(clip,mag),cw=bw/clip;for(let i=0;i<n;i++)L.rect(9+Math.floor(i*cw),by+1,Math.max(1,Math.floor(cw)-(cw>2?1:0)),5,col);}
      else L.rect(9,by+1,Math.round(bw*Math.min(1,mag/clip)),5,col);
    },
  },
  buddy:{
    ev(m,k){const pri={down:5,hurt:4,head:3,kill:2,reload:1,button:2};
      if(k==='down'){m.mood='down';m.until=1e9;return;}
      if(m.mood&&m.t<m.until&&(pri[m.mood]??0)>(pri[k]??0))return;
      m.mood=k==='button'?'happy':k==='kill'?'happy':k==='head'?'wow':k;m.until=m.t+(k==='reload'?1.4:k==='hurt'?.9:1.6);m.at=m.t;m.idle=m.t;},
    draw(L,st,t,m,e){
      if(st.down&&m.mood!=='down')this.ev(m,'down');if(!st.down&&m.mood==='down')m.until=0;
      if(st.reloading&&!(m.mood&&t<m.until))this.ev(m,'reload');
      let mood=m.mood&&t<m.until?m.mood:t-(m.idle??0)>25?'sleepy':'idle';
      buddyFace(L,mood,t,t-(m.at??0),e);
    },
  },
};

function melonArt(L,t,e){
  const W=L.w,H=L.h,P=e.pal;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const s=((x+y+Math.floor(t*12))>>3)&1;L.px(x,y,s?[18,34,22]:[10,22,14]);}
  const cx=W>>1,cy=(H>>1)-2+Math.round(Math.sin(t*3)*2),r=Math.min(W,H)*.34|0,tilt=Math.sin(t*1.5)*.18;
  // a melon slice: rind, white line, flesh, seeds (a half disc that rocks)
  for(let y=-r;y<=2;y++)for(let x=-r;x<=r;x++){const rx=x*Math.cos(tilt)+y*Math.sin(tilt),ry=-x*Math.sin(tilt)+y*Math.cos(tilt);
    if(ry>0||rx*rx+ry*ry>r*r)continue;const d=Math.sqrt(rx*rx+ry*ry);
    L.px(cx+x,cy+y,d>r-2.2?[60,170,60]:d>r-3.6?[230,240,210]:ry>-1.2?[255,120,140]:[245,70,95]);}
  // the rind's underside
  for(let x=-r;x<=r;x++)L.px(cx+x,cy+3,[40,120,45]);
  for(const [a,dd] of [[-.5,.5],[-1.1,.62],[-1.9,.55],[-2.6,.6],[-1.5,.3]]){const ra=a+tilt*0;const x=Math.cos(ra)*r*dd,y=Math.sin(ra)*r*dd;
    const rx=x*Math.cos(-tilt)+y*Math.sin(-tilt),ry=-x*Math.sin(-tilt)+y*Math.cos(-tilt);L.rect(cx+rx|0,cy+ry|0,1,2,[25,15,15]);}
  // twinkles
  for(let i=0;i<4;i++){const ph=(t*.9+i*.27)%1,x=(i*23+7)%(W-6)+3,y=(i*17+5)%(H-18)+3,c=ph<.5?scl([255,255,220],1-Math.abs(ph-.25)*4):null;
    if(c){L.px(x,y,c);if(ph>.15&&ph<.35){L.px(x-1,y,c);L.px(x+1,y,c);L.px(x,y-1,c);L.px(x,y+1,c);}}}
  // a scrolling name along the bottom
  const msg=(e.marquee??'MELON ZOMBIES')+'   ',w=L.textW(msg)+4,off=Math.floor(t*14)%w;L.rect(0,H-8,W,8,[0,0,0]);
  for(let k=-1;k<=Math.ceil(W/w);k++)L.text(msg,k*w-off,H-6,P.fg);
}

function buddyFace(L,mood,t,since,e){
  const P=e.pal,W=L.w,H=L.h;L.clear(P.bg);
  const down=mood==='down',sh=mood==='hurt'?Math.round(Math.sin(t*60)*1.5):0;
  const bob=mood==='happy'||mood==='wow'?Math.round(-Math.abs(Math.sin(since*9))*3):mood==='sleepy'||down?0:Math.round(Math.sin(t*2.2));
  const cx=(W>>1)+sh,cy=(H>>1)+4+bob,r=Math.min(W,H)*.36|0;
  const g=down?[95,110,100]:[70,175,70],dk=down?[70,80,75]:[40,120,45],ink=[20,28,20];
  // the head: a striped melon
  for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)if(x*x+y*y<=r*r+r*.8)L.px(cx+x,cy+y,(Math.floor((x+r)*5/(2*r))%2)?dk:g);
  L.disc(cx-r+5,cy-r+6,1,mix(g,[255,255,255],.5));
  const ey=cy-3,ex=Math.max(5,r*.42|0),blink=(t%3.7)<.14;
  const eye=(x,kind)=>{switch(kind){
    case 'dot':L.rect(x-1,ey-2,3,4,ink);L.px(x,ey-2,[220,240,220]);break;
    case 'line':L.rect(x-2,ey,5,1,ink);break;
    case 'happy':L.px(x-2,ey,ink);L.px(x-1,ey-1,ink);L.px(x,ey-2,ink);L.px(x+1,ey-1,ink);L.px(x+2,ey,ink);break;
    case 'wow':L.disc(x,ey-1,2,[240,250,240]);L.rect(x,ey-1,1,1,ink);L.frame(x-2,ey-3,5,5,ink);break;
    case 'x':L.line(x-2,ey-2,x+2,ey+2,ink);L.line(x-2,ey+2,x+2,ey-2,ink);break;
    case 'gt':L.line(x-2,ey-2,x+1,ey,ink);L.line(x+1,ey,x-2,ey+2,ink);break;
    case 'lt':L.line(x+2,ey-2,x-1,ey,ink);L.line(x-1,ey,x+2,ey+2,ink);break;
    case 'side':L.rect(x-2,ey-1,3,3,ink);break;}};
  const my=cy+5;
  switch(mood){
    case 'happy':eye(cx-ex,'happy');eye(cx+ex,'happy');L.rect(cx-4,my,9,1,ink);L.rect(cx-3,my+1,7,2,[150,30,40]);L.rect(cx-2,my+3,5,1,ink);
      L.text('+1',W-10,4-Math.min(3,since*6|0),e.pal.fg);break;
    case 'wow':eye(cx-ex,'wow');eye(cx+ex,'wow');L.disc(cx,my+1,2,ink);L.center('HEADSHOT',2,P.warm);break;
    case 'hurt':eye(cx-ex,'gt');eye(cx+ex,'lt');for(let i=-4;i<=4;i++)L.px(cx+i,my+((i&1)?1:0),ink);L.text('OW',2,2,P.warn);break;
    case 'down':eye(cx-ex,'x');eye(cx+ex,'x');L.rect(cx-3,my+1,7,1,ink);if(Math.floor(t*2)%2)L.center('HELP!',2,P.warn);break;
    case 'reload':eye(cx-ex-1,'side');eye(cx+ex-1,'side');L.rect(cx-1,my+1,3,2,ink);
      L.rect(cx+r-3,cy-r+2+Math.floor(since*8)%3,2,3,[150,200,255]);L.text('RELOAD',2,2,P.fg);break;
    case 'sleepy':eye(cx-ex,'line');eye(cx+ex,'line');L.rect(cx-1,my+1,3,1,ink);
      {const p=(t*.7)%1;L.text('Z',W-10+(p*4|0),10-(p*8|0),scl(P.fg,1-p));L.text('Z',W-14+(p*3|0),14-(p*6|0),scl(P.fg,.6*(1-p)));}break;
    default:eye(cx-ex,blink?'line':'dot');eye(cx+ex,blink?'line':'dot');L.px(cx-3,my,ink);L.rect(cx-2,my+1,5,1,ink);L.px(cx+3,my,ink);
  }
}

// ---- the display material -------------------------------------------------------------------------------------------------
const VS=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const FS=`uniform sampler2D map;uniform vec2 res;uniform float glow;uniform float power;varying vec2 vUv;
void main(){
  vec2 p=vUv*res,cell=floor(p),f=p-cell;
  vec3 c=texture2D(map,(cell+.5)/res).rgb;
  float w=max(fwidth(p.x),fwidth(p.y));
  float g=smoothstep(0.,.2,f.x)*smoothstep(1.,.8,f.x)*smoothstep(0.,.2,f.y)*smoothstep(1.,.8,f.y);
  g=mix(g,.75,clamp(w*2.-.6,0.,1.));                     // the grid fades out when the pixels are small on screen
  vec2 q=vUv-.5;float vig=1.-dot(q,q)*1.1;
  vec3 col=(c*(.3+.7*g)*glow+vec3(.003,.005,.004))*vig*power;
  float s=(1.-vUv.y)*.8+vUv.x*.45;col+=vec3(.05,.06,.065)*smoothstep(.95,1.02,s)*(1.-smoothstep(1.06,1.16,s));   // a soft glass sheen
  gl_FragColor=vec4(col,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---- the housing ----------------------------------------------------------------------------------------------------------
const housings=new Map(),trims=new Map(),arts=new Map();
function housingModel(h){
  if(!housings.has(h.model))housings.set(h.model,loadModel(new URL(h.model,import.meta.url).href).then(m=>{
    if(!m)return null;m.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=false;o.frustumCulled=false;}});return m;})
    .catch(e=>{console.warn('[screens] housing',h.model,e);return null;}));
  return housings.get(h.model);
}
// a sprite sheet's frames, scaled to the screen once (only when the art is a sheet)
function artFrames(a,w,h){
  if(!a?.image)return Promise.resolve(null);const key=a.image+'|'+w+'x'+h;
  if(!arts.has(key))arts.set(key,new Promise(res=>{const img=new Image();img.crossOrigin='anonymous';img.onerror=()=>res(null);
    img.onload=()=>{const cols=a.cols??1,rows=a.rows??1,n=a.frames??cols*rows,fw=img.width/cols,fh=img.height/rows,cv=document.createElement('canvas');
      cv.width=w;cv.height=h;const x=cv.getContext('2d',{willReadFrequently:true});x.imageSmoothingEnabled=a.smooth??true;const out=[];
      for(let i=0;i<n;i++){x.fillStyle='#000';x.fillRect(0,0,w,h);const s=Math.min(w/fw,h/fh),dw=fw*s,dh=fh*s;
        x.drawImage(img,(i%cols)*fw,Math.floor(i/cols)*fh,fw,fh,(w-dw)/2,(h-dh)/2,dw,dh);
        const d=x.getImageData(0,0,w,h).data,f=new Uint8Array(w*h*4);f.set(d);out.push(f);}
      res(out);};img.src=new URL(a.image,import.meta.url).href;}));
  return arts.get(key);
}

const palette=e=>{const fg=hex(e.tint??'#7dff8a');return {fg,dim:scl(fg,.38),box:scl(fg,.12),bg:[4,9,6],warn:hex(e.warn??'#ff5a46'),warm:[255,214,90]};};

// One screen: its model (housing + display), its picture and what it shows. update(dt, state) once a frame.
export class GunScreen{
  constructor(entry,housing,model){
    this.entry=entry;this.housing=housing;this.object=model;this.object.userData.charm=true;
    const [w,h]=housing.px??[64,64];this.lcd=new Lcd(w,h);this.kind=KINDS[entry.kind]??KINDS.art;this.m={t:0};this.t=0;this.acc=1;
    this.e={...entry,pal:palette(entry)};
    this.mat=new THREE.ShaderMaterial({name:'gun_screen',vertexShader:VS,fragmentShader:FS,
      uniforms:{map:{value:this.lcd.tex},res:{value:new THREE.Vector2(w,h)},glow:{value:entry.glow??1.35},power:{value:1}}});
    this.foot=null;this.buttons=[];this.press0=[];
    model.traverse(o=>{
      if(!o.isMesh)return;
      if(o.name==='screen'||o.material?.name==='screen')o.material=this.mat;
      else if(o.material?.name==='trim'&&entry.trim){const k=entry.trim;if(!trims.has(k)){const m=o.material.clone();m.color.setRGB(...hex(k).map(v=>v/255),THREE.SRGBColorSpace);trims.set(k,m);}o.material=trims.get(k);}
    });
    this.foot=model.getObjectByName('foot');this.arm=model.getObjectByName('arm');this.clip=model.getObjectByName('clip');
    this.hook=['clip_riser','clip_lip','clip_tip'].map(k=>model.getObjectByName(k));this.hook0=this.hook.map(o=>o?.position.y);
    for(let i=0;i<8;i++){const b=model.getObjectByName('btn_'+i);if(!b)break;this.buttons.push(b);this.press0.push(b.position.z);}
    this.presses=this.buttons.map(()=>0);
    if(entry.art?.image)artFrames(entry.art,w,h).then(f=>{this.m.frames=f;});
  }
  // how far the foot reaches back to the gun, in the housing's own units
  setFoot(d){if(!this.foot)return;this.foot.scale.z=Math.max(.001,d);this.foot.visible=d>.02;}
  // the arm's length and the clip's place on the gun (housing units), from screenMount
  setMount(m){this.mounted=m;if(this.arm)this.arm.scale.z=Math.max(.001,m.arm??0);
    if(this.clip&&m.clip){this.clip.position.fromArray(m.clip.p);this.clip.quaternion.fromArray(m.clip.q);this.clip.visible=true;}
    else if(this.clip)this.clip.visible=false;
    // the hook over the gun's top (clip units): riser up from the plate's top, the lip over the top, the tip at its end
    const [r,l,tp]=this.hook,h=m.clip?.hook;
    for(const o of this.hook)if(o)o.visible=!!h;
    if(h&&r&&l&&tp){const y0=this.hook0[0];r.scale.y=h.len+.12;l.position.y=tp.position.y=y0+h.len;l.scale.z=h.depth;tp.position.z=-h.depth;}}
  event(k){this.kind.ev?.(this.m,k);}
  press(i){if(i<0||i>=this.buttons.length)return;this.presses[i]=1;this.event('button');this.kind.button?.(this.m,i);}
  update(dt,st){
    this.t+=dt;this.m.t=this.t;
    for(let i=0;i<this.buttons.length;i++)if(this.presses[i]>0){this.presses[i]=Math.max(0,this.presses[i]-dt*5);
      this.buttons[i].position.z=this.press0[i]-.03*Math.sin(Math.min(1,this.presses[i])*Math.PI);}
    this.acc+=dt;if(this.acc<1/15)return false;this.acc=0;
    this.kind.draw(this.lcd,st,this.t,this.m,this.e);return this.lcd.flush();   // true when the picture changed
  }
  dispose(){this.object.removeFromParent();this.lcd.tex.dispose();this.mat.dispose();}
}
export async function makeScreen(cat,entry){
  const h=housingOf(cat,entry);if(!h)return null;const m=await housingModel(h);if(!m)return null;
  return new GunScreen(entry,h,m.clone());
}

// ---- where it mounts ------------------------------------------------------------------------------------------------------
// The spots are baked (2026-11-07, user: "make it consistent with the gunsmith please, no need to have it search during
// play"): .tools/bake-screen-spots.mjs runs the search below once per gun model and housing in a game page, with the
// player's arms and the view camera, and writes screen-spots.json. The Gunsmith and the game both read that, so they show
// the same spot and nothing searches in play. A model missing from it falls back to the plain search (no arms, no camera,
// the Gunsmith's typical eye), the same in both places; the game runs that at load from its warmWeapon handler.
export const spotKey=(model,housing)=>`${String(model).replace(/^[a-z]+:\/\/[^/]+\//,'')}|${String(housing?.model??'').replace(/^.*\/|\.glb.*$/g,'')}`;
// a baked spot -> the mount screenMount returns (root space; `unit` scales it to the gun's model units)
export function mountFromSpot(sp,unit=1){
  const F=frameOf(sp.tilt??20,sp.yaw??42),n=F.n,s=sp.s,t=sp.t;
  const R=new THREE.Matrix4().makeBasis(F.x,F.u,n).transpose().multiply(G_SIDE),q=new THREE.Quaternion().setFromRotationMatrix(R);
  const m=new THREE.Matrix4().makeBasis(F.x,F.u,n).scale(new THREE.Vector3().setScalar(s*unit)).setPosition(new THREE.Vector3().fromArray(sp.c).multiplyScalar(unit));
  return {matrix:m,size:s,foot:sp.depth/s,arm:t/s,clip:{p:[F.x.y*-.13,F.u.y*-.13,-t/s+n.y*-.13],q:q.toArray(),hook:sp.hook??null},along:sp.along,cost:sp.cost,spot:sp,baked:true};
}
// which arms are posed around the gun (the characters' rigs differ; their roots carry no name)
const handsSig=h=>{if(!h)return '';let n=0,v=0;h.traverse(o=>{if(o.isMesh&&o.visible){n++;v+=o.geometry?.attributes?.position?.count??0;}});return n+'.'+v;};
const mounts=new Map(),inv=new THREE.Matrix4(),_v=new THREE.Vector3(),_x=new THREE.Vector3(),_u=new THREE.Vector3(),_n=new THREE.Vector3();
// the gun's side in root space as a frame: x back, y up, z out of the left side (the clip's frame)
const G_SIDE=new THREE.Matrix4().makeBasis(new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,1,0));
const D2R=Math.PI/180,CELL=.15,_c=new THREE.Vector3(),_w=new THREE.Vector3();
// the housing's frame in root space: face normal n (tilted up and yawed back toward the eye), up u, right x
function frameOf(tilt,yaw){
  _n.set(-Math.sin(yaw*D2R)*Math.cos(tilt*D2R),Math.cos(yaw*D2R)*Math.cos(tilt*D2R),Math.sin(tilt*D2R)).normalize();
  _u.set(0,0,1).addScaledVector(_n,-_n.z).normalize();_x.crossVectors(_u,_n);
  return {n:_n.clone(),u:_u.clone(),x:_x.clone()};
}
// -> {matrix (root space, model units), size, foot (housing units)}; null when the gun has no points
export function screenMount(gun,root,{key,override,hands,camera,housing,unit=1,avoid=null,spots=null}={}){
  const baked=!override?.at&&spots?.[spotKey(key,housing)];if(baked){const k='b|'+spotKey(key,housing)+'|'+unit;if(!mounts.has(k))mounts.set(k,mountFromSpot(baked,unit));return mounts.get(k);}
  const tilt=override?.tilt??20,yaw=override?.yaw??42,F=frameOf(tilt,yaw),HW=housing.w??1.2,HH=housing.h??1.2,FT=housing.foot??[.6,.55];
  const hidden=[];gun.traverse(b=>{if(b.isBone&&b.scale.x<1e-3)hidden.push(b.name);});
  const fullKey=[key,housing.model,handsSig(hands),unit,JSON.stringify(override??''),avoid?`${avoid.x.toFixed(1)},${avoid.z.toFixed(1)}`:'',hidden.join(',')].join('|');
  if(mounts.has(fullKey))return mounts.get(fullKey);
  inv.copy(root.matrixWorld).invert();
  const pb=[],pts=visiblePoints(gun,null,gun.parent,pb,unit,inv,.6);if(pts.length<9)return null;
  const hp=hands?visiblePoints(hands,gun,hands.parent,null,unit,inv):[];
  const n=F.n,dot=(i,a)=>a[i]*n.x+a[i+1]*n.y+a[i+2]*n.z;
  // bins over (x, z): the outermost surface toward the face (max p.n), and whether loose or moving parts are there
  const loose=new Map(),kindOf=b=>{if(!b||b===root)return 0;if(!loose.has(b)){let k=2;for(let p=b;p&&p!==root&&p!==gun;p=p.parent)if(LOOSE.test(p.name)||FIDGET.test(p.name))k=1;loose.set(b,k);}return loose.get(b);};
  const bins=new Map(),bin=(x,z)=>{const k=Math.round(x/CELL)*4096+Math.round(z/CELL);let b=bins.get(k);if(!b)bins.set(k,b={max:-1e9,y:-1e9,ylo:1e9,n:0,loose:0,moving:0,hand:-1e9,hy:-1e9});return b;},get=(ix,iz)=>bins.get(ix*4096+iz);
  for(let i=0;i<pts.length;i+=3){const b=bin(pts[i],pts[i+2]),d=dot(i,pts);b.n++;if(d>b.max)b.max=d;if(pts[i+1]>b.y)b.y=pts[i+1];if(pts[i+1]<b.ylo)b.ylo=pts[i+1];const k=kindOf(pb[i/3]);if(k===1)b.loose++;else if(k===2)b.moving++;}
  for(let i=0;i<hp.length;i+=3){const b=bin(hp[i],hp[i+2]),d=dot(i,hp);if(d>b.hand)b.hand=d;if(hp[i+1]>b.hy)b.hy=hp[i+1];}
  // a flat panel has vertices only at its edges: fill gaps of up to 1.5 in between backed cells (along x, then z) with
  // the outer surface interpolated, so a plain receiver side counts as backed
  const fill=alongX=>{const lines=new Map();
    for(const [k,b] of bins){if(!b.n)continue;const ix=Math.round(k/4096),iz=k-ix*4096,key=alongX?iz:ix;let l=lines.get(key);if(!l)lines.set(key,l=[]);l.push(alongX?ix:iz);}
    for(const [key,ps] of lines){ps.sort((a,b)=>a-b);
      for(let i=1;i<ps.length;i++){const a=ps[i-1],b=ps[i];if(b-a<2||b-a>30)continue;
        const A=alongX?get(a,key):get(key,a),B=alongX?get(b,key):get(key,b);if(b-a>10&&Math.abs(A.y-B.y)>.25)continue;   // a wide gap only across a flat panel (the G11's sides)
        for(let j=a+1;j<b;j++){const c=alongX?bin(j*CELL,key*CELL):bin(key*CELL,j*CELL);if(c.n)continue;const f=(j-a)/(b-a);c.n=1;c.fill=1;c.max=A.max+(B.max-A.max)*f;c.y=A.y+(B.y-A.y)*f;c.ylo=A.ylo+(B.ylo-A.ylo)*f;}}}};
  fill(true);fill(false);
  const xmin=pct(pts,0,.01),xmax=pct(pts,0,.99),L=xmax-xmin,zTop=pct(pts,2,.97),zLow=pct(pts,2,.04);
  // where along the gun (2026-11-07, user: "more in the middle, center of focus ... its alright for smaller guns like
  // pistols and sidearms to be closer to the stock"): a target share of the length from the back, .5 on long guns (16 in
  // and over), .3 on pistols (9 in and under); the cost grows past a 7% dead band either side
  const aT=override?.along??(.3+.2*THREE.MathUtils.clamp((L-9)/7,0,1)),alongK=10,hT=override?.height;   // per-gun nudges: along / height (0 bottom .. 1 top)
  const x0=THREE.MathUtils.clamp(.1*L+1,xmin+.12*L,xmax-.3*L);
  const flash=gun.getObjectByName('tag_flash');let bore=null;
  if(flash){let ok=true;for(let p=flash;p&&p!==gun.parent;p=p.parent)if(p.scale.x<1e-3)ok=false;if(ok)bore=flash.getWorldPosition(_v).applyMatrix4(inv).z/unit;}
  bore??=zTop-.8;
  // the eye in root space (inches): the view camera in game; a typical hip eye elsewhere (the Gunsmith has no game camera)
  const eye=new THREE.Vector3();
  if(camera){camera.updateMatrixWorld();eye.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inv).divideScalar(unit);}
  else eye.set(xmin-9,3.5,zTop+1.2);
  // how much of the face the hands hide from the eye: a hand point between the eye and the face plane whose ray lands on
  // the face marks a cell of a 4x4 grid over it (the left arm crosses in front of the receiver on most guns)
  const hidden16=(c,fw,fh)=>{if(!hp.length)return 0;let m=0;const cn=c.dot(n),en=eye.dot(n)-cn;
    for(let i=0;i<hp.length;i+=3){const hx=hp[i]-eye.x,hy=hp[i+1]-eye.y,hz=hp[i+2]-eye.z,dn=hx*n.x+hy*n.y+hz*n.z;if(dn>-1e-6)continue;
      const t=-en/dn;if(t<=1)continue;   // the hand point is behind the face, not in front of it
      const qx=eye.x+hx*t-c.x,qy=eye.y+hy*t-c.y,qz=eye.z+hz*t-c.z,a=(qx*F.x.x+qy*F.x.y+qz*F.x.z)/fw+.5,b=(qx*F.u.x+qy*F.u.y+qz*F.u.z)/fh+.5;
      if(a>=0&&a<1&&b>=0&&b<1)m|=1<<((a*4|0)+4*(b*4|0));}
    let k=0;for(;m;m&=m-1)k++;return k/16;};
  // how much of the face the gun itself hides from the eye (2026-11-07: at the hip you look along a pistol's top, so its
  // left side is behind the frame): rays from 5 points of the face to the eye, marched through the bins' y extent
  const gunHid=(c,fw,fh)=>{let k=0;for(const [a,b] of [[0,0],[-.35,-.35],[.35,-.35],[-.35,.35],[.35,.35]]){
      _v.copy(c).addScaledVector(F.x,a*fw).addScaledVector(F.u,b*fh);_x.subVectors(eye,_v);const len=_x.length();_x.divideScalar(len);
      for(let d=.3;d<Math.min(len,14);d+=CELL*.7){const y=_v.y+_x.y*d,b=get(Math.round((_v.x+_x.x*d)/CELL),Math.round((_v.z+_x.z*d)/CELL));
        if(b?.n&&y<b.y-.03&&y>b.ylo+.03){k++;break;}}}
    return k/5;};
  const rect=(cx,cz,w,h,fn)=>{const ix0=Math.round((cx-w/2)/CELL),ix1=Math.round((cx+w/2)/CELL),iz0=Math.round((cz-h/2)/CELL),iz1=Math.round((cz+h/2)/CELL);
    for(let ix=ix0;ix<=ix1;ix++)for(let iz=iz0;iz<=iz1;iz++)fn(get(ix,iz),ix,iz);return (ix1-ix0+1)*(iz1-iz0+1);};
  // the clip: an arm straight back (-n) from the housing's back to the ball of a plate lying flat on the gun's side
  // (normal +y), its back on the outermost side surface under it (the bins' y, gaps filled); then a hook up the side and
  // over the gun's top when the top is within 2 in of the plate (-> null hook otherwise). Inches; null = no surface there.
  const landing=(c,s)=>{const BALL=.13*s,PW=.86*s,PH=.7*s,HW=.5*s;let t=0,px=c.x,pz=c.z,ys=0,backed=0,spread=0;
    for(let it=0;it<3;it++){let m=-1e9,sum=0,k=0;const tot=rect(px,pz,PW,PH,b=>{if(b?.n&&b.y>-1e8){k++;sum+=b.y;if(b.y>m)m=b.y;}});
      if(!k)return null;ys=m;backed=k/tot;spread=m-sum/k;t=(c.y-ys-BALL)/n.y;px=c.x-n.x*t;pz=c.z-n.z*t;}
    // the hook: rows above the plate's top whose side surface is near the plate's (a sight or a rail further in is not the top)
    const zp=pz+PH/2,ix0=Math.round((px-HW/2)/CELL),ix1=Math.round((px+HW/2)/CELL);let top=null,gap=0,ysum=0,yk=0;
    for(let iz=Math.round(zp/CELL);iz<=Math.round((zp+2.2)/CELL);iz++){let hit=false;
      for(let ix=ix0;ix<=ix1;ix++){const b=get(ix,iz);if(b?.n&&b.y>ys-1&&b.y<ys+.25){hit=true;ysum+=b.y;yk++;}}
      if(hit){top=(iz+.5)*CELL;gap=0;}else if(++gap>1)break;}
    let hook=null;
    if(top!==null&&top-zp<2){let yc=0,k=0;for(let i=0;i<pts.length;i+=3)if(Math.abs(pts[i]-px)<HW&&pts[i+2]>top-.5&&pts[i+2]<top+.3){yc+=pts[i+1];k++;}
      yc=k?yc/k:ys-.4;hook={len:Math.max(.04,top+.03-zp)/s,depth:THREE.MathUtils.clamp(ys-yc,.18,.6)/s};}
    return {t,px,pz,ys,backed,spread,hook};};
  const sizes=override?.size?[override.size]:[1.25,1.08,.93,.78];let best=null;   // a quarter bigger since 2026-11-07 (user: "just abit bigger ... the whole things"); was 1-.62
  const ndc=new THREE.Vector3();
  for(const s of sizes){
    const fw=HW*s,fh=HH*s,ffw=FT[0]*s,ffh=FT[1]*s;
    for(let cx=xmin+.08*L+fw/2;cx<=xmax-.2*L-fw/2+1e-6;cx+=.25)for(let cz=zLow+fh/2;cz<=zTop-fh/2+.15;cz+=.2){
      let cov=0,real=0,top=-1e9,lo=0,mv=0,pn=0;
      const total=rect(cx,cz,fw,fh,b=>{if(!b)return;if(b.n){cov++;if(!b.fill)real++;pn+=b.n;if(b.max>top)top=b.max;lo+=b.loose;mv+=b.moving;}});
      if(cov/total<.35||real/total<.1||lo>2)continue;   // some real surface under it, not only bridged gaps   // .45 until the clip (2026-11-07): it holds an overhanging housing on
      let fc=0,fs=0,flo=0;const ftot=rect(cx,cz,ffw,ffh,b=>{if(b?.n){fc++;fs+=b.max;flo+=b.loose;}});
      if(fc/ftot<.7||flo)continue;
      const plane=top+.03,depth=plane-fs/fc;if(depth>.9)continue;
      let hands=0,near=0;rect(cx,cz,fw+.4,fh+.4,b=>{if(b&&b.hand>plane-1.2)hands++;});   // a hand touching the housing
      rect(cx,cz,fw+1.6,fh+1,b=>{if(b&&b.hand>plane-2)near++;});   // or crowding it (the left sleeve beside the screen)
      const c=_c.set(cx,0,cz);c.y=(plane-n.x*cx-n.z*cz)/n.y;const dist=c.distanceTo(eye),facing=_w.subVectors(eye,c).dot(n)/dist;
      if(facing<.3)continue;
      const a=(cx-xmin)/L;
      let cost=(1-cov/total)*3+depth+(mv/Math.max(1,pn))*4+(hands?1.5+hands*.1:0)+Math.min(2,near*.03)
        +50*Math.max(0,.1-fw*facing/dist)   // too small to read from the eye (outweighs a deeper stand-off: the arm bridges it)
        +.5*Math.max(0,cz+fh/2-(bore+.25))+.25*Math.abs(cz-(bore-fh/2+.05))
        +alongK*Math.max(0,Math.abs(a-aT)-.07)+(hT==null?0:8*Math.max(0,Math.abs((cz-zLow)/(zTop-zLow)-hT)-.06));
      if(cost<(best?.cost??1e9)){const h=hidden16(c,fw,fh);if(h>.3)continue;const g=gunHid(c,fw,fh);if(g>.3)continue;cost+=h*8+g*6;}
      if(avoid&&cx+fw/2>avoid.x-avoid.w-.2&&cx-fw/2<avoid.x+avoid.w+.2&&cz-fh/2<avoid.z+.3&&cz+fh/2>avoid.z-avoid.drop)cost+=5;
      if(camera&&cost<(best?.cost??1e9)){let off=0;for(const [a,b] of [[-1,-1],[1,-1],[-1,1],[1,1],[0,0]]){
          _v.set(cx,0,cz).addScaledVector(F.x,a*fw/2).addScaledVector(F.u,b*fh/2);_v.y=(plane-n.x*_v.x-n.z*_v.z)/n.y;
          _v.multiplyScalar(unit).applyMatrix4(root.matrixWorld).project(camera);if(_v.z>1||Math.abs(_v.x)>.96||_v.y<-.96)off++;}
        cost+=off*2;
        // the centre of focus: a little right of and below the crosshair, where the eye already is
        ndc.copy(c).multiplyScalar(unit).applyMatrix4(root.matrixWorld).project(camera);cost+=1.2*Math.hypot(ndc.x-.12,ndc.y+.15);}
      if(cost<(best?.cost??1e9)){const l=landing(c.clone(),s);if(!l)continue;cost+=(1-l.backed)*3+Math.min(2,l.spread*2)+(l.hook?Math.max(0,l.hook.len*s-1):.4)+1.5*Math.max(0,l.t-.7);   // a long arm or a tall riser looks spindly
        if(!best||cost<best.cost)best={cost,cx,cz,s,plane,depth};}
    }
  }
  let out;
  if(override?.at){const at=new THREE.Vector3().fromArray(override.at).divideScalar(unit);best={cx:at.x,cz:at.z,s:override.size??.8,plane:at.dot(n),depth:override.foot??.15};}
  if(!best){const s=.85;best={cx:x0+1.4,cz:bore-HH*s/2,s,plane:pct(pts,1,.99)*n.y+.05,depth:.1};}
  {const s=best.s,c=new THREE.Vector3(best.cx,0,best.cz);c.y=(best.plane-n.x*c.x-n.z*c.z)/n.y;
    let l=landing(c,s);const tMin=.42*s;   // the arm shows past the bracket's collar
    if(!l)l={t:(best.depth+.2)/n.y,hook:null};
    if(l.t<tMin){c.addScaledVector(n,tMin-l.t);l.t=tMin;}   // too close: stand the housing off
    const r3=v=>Math.round(v*1000)/1000,sp={c:c.toArray().map(r3),s,t:r3(l.t),depth:r3(best.depth),hook:l.hook&&{len:r3(l.hook.len),depth:r3(l.hook.depth)},
      tilt,yaw,along:r3((best.cx-xmin)/L),cost:r3(best.cost)};
    out={...mountFromSpot(sp,unit),baked:false};}
  mounts.set(fullKey,out);return out;
}
// the charm's keep-clear zone (inches): its plain hang spot (no hands or camera, so the Gunsmith and the game agree) and a
// generous drop and width
export function charmZone(gun,root,{key,override,unit=1}){
  const a=gunAnchor(gun,root,{key,override,unit});if(!a)return null;return {x:a.at.x/unit,z:a.at.z/unit,drop:3,w:.45};
}
// put a screen on the gun: its matrix in the view = root's world matrix x the mount
export function placeScreen(sc,root,mount){
  if(sc.mounted!==mount)sc.setMount?.(mount);const o=sc.object;o.matrixAutoUpdate=false;o.matrix.multiplyMatrices(root.matrixWorld,mount.matrix);o.matrixWorldNeedsUpdate=true;
}
