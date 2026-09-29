// Live ammo read-outs on wonder weapons. In the original game these were
// driven by a weapon shader; the export only kept the painted-on template
// (the Zap Gun's unlit "87", the Thundergun's dashed gauge in the texture
// alpha, dithered as a checkerboard). Each display gets a small emissive canvas that lights the right
// segments for the ammo you actually have, redrawn only when it changes.
import * as THREE from 'three';
import { loadModel } from '../../animation.js';

const SIZE=512;   // emissive canvas; glow doesn't need the colour map's resolution
const SEGMENTS={0:'abcdef',1:'bc',2:'abged',3:'abgcd',4:'fgbc',5:'afgcd',6:'afgedc',7:'abc',8:'abcdefg',9:'abcdfg'};

// A material's emissive canvas, created once per material.
function glowCanvas(material,color,intensity){
  if(material.userData.glow)return material.userData.glow;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;
  const g=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);
  texture.flipY=material.map?.flipY??false;texture.colorSpace=THREE.SRGBColorSpace;
  material.emissive=new THREE.Color(color);material.emissiveIntensity=intensity;material.emissiveMap=texture;material.needsUpdate=true;
  return material.userData.glow={canvas,g,texture,layers:[]};
}
function redraw(glow){
  glow.g.fillStyle='#000';glow.g.fillRect(0,0,SIZE,SIZE);
  for(const layer of glow.layers)layer.draw(glow.g);
  glow.texture.needsUpdate=true;
}

// Two 7-segment digits in a rectangle given in UV fractions.
function digitDisplay(rect){
  let value=null;
  return {
    set(v){v=Math.max(0,Math.min(99,Math.floor(v)));if(v===value)return false;value=v;return true;},
    draw(g){
      if(value==null)return;
      const [x0,y0,x1,y1]=rect.map(n=>n*SIZE),gap=(x1-x0)*.06,w=(x1-x0-gap)/2,h=y1-y0;
      String(value).padStart(2,'0').split('').forEach((ch,i)=>{
        const x=x0+i*(w+gap),t=w*.2,on=SEGMENTS[ch];
        const seg={a:[x+t*.5,y0,w-t,t],d:[x+t*.5,y0+h-t,w-t,t],g:[x+t*.5,y0+h/2-t/2,w-t,t],
          f:[x,y0+t*.5,t,h/2-t*.5],b:[x+w-t,y0+t*.5,t,h/2-t*.5],e:[x,y0+h/2,t,h/2-t*.5],c:[x+w-t,y0+h/2,t,h/2-t*.5]};
        g.fillStyle='#fff';g.shadowColor='#fff';g.shadowBlur=6;
        for(const s of on)g.fillRect(...seg[s]);g.shadowBlur=0;
      });
    }};
}

// A dashed ring whose dashes are marked in the colour texture's alpha. The
// dashes are found once, then lit clockwise from the top.
function ringGauge(map,center,radius){
  const img=map.image,W=img.width,H=img.height;
  const [cx,cy,r]=[center[0]*W,center[1]*H,radius*W],x0=Math.floor(cx-r),y0=Math.floor(cy-r),n=Math.ceil(r*2);
  const c=document.createElement('canvas');c.width=c.height=n;const cg=c.getContext('2d',{willReadFrequently:true});
  cg.drawImage(img,x0,y0,n,n,0,0,n,n);const px=cg.getImageData(0,0,n,n).data;
  const points=[];
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const a=px[(y*n+x)*4+3];if(a<128){const dx=x+x0-cx,dy=y+y0-cy;if(dx*dx+dy*dy<=r*r)points.push({x:x+x0,y:y+y0,angle:(Math.atan2(dx,-dy)*180/Math.PI+360)%360});}}
  // Group the marked pixels into dashes by the empty gaps between them.
  const bins=new Array(360).fill(0);for(const p of points)bins[Math.floor(p.angle)]++;
  let start=bins.findIndex(v=>v===0);if(start<0)start=0;
  const dashes=[];let current=null;
  for(let i=1;i<=360;i++){const b=(start+i)%360;if(bins[b]){if(!current){current={from:b,bins:new Set()};dashes.push(current);}current.bins.add(b);}else current=null;}
  const dashOf=p=>dashes.findIndex(d=>d.bins.has(Math.floor(p.angle)));
  const order=dashes.map((d,i)=>({i,mid:[...d.bins].reduce((s,b)=>s+((b-d.from+360)%360),0)/d.bins.size+d.from})).sort((a,b)=>(a.mid%360)-(b.mid%360)).map(o=>o.i);
  const rank=new Map(order.map((d,k)=>[d,k]));
  for(const p of points)p.rank=rank.get(dashOf(p));
  let lit=null;const scale=SIZE/W;
  return {
    count:dashes.length,
    set(v){v=Math.max(0,Math.min(dashes.length,v));if(v===lit)return false;lit=v;return true;},
    draw(g){if(!lit)return;g.fillStyle='#fff';for(const p of points)if(p.rank<lit)g.fillRect(p.x*scale,p.y*scale,Math.max(1,scale)+.5,Math.max(1,scale)+.5);}};
}

export default async function setup(api){
  const {data,session}=api;
  const displays=[];   // {weapons:Set, glow, layer, value(def,weapon)}
  async function materialsOf(url,name){const root=await loadModel(url),out=new Set();root?.traverse(n=>{for(const m of [n.material].flat())if(m?.name?.endsWith(name))out.add(m);});return [...out];}

  // Zap Guns and the Wave Gun: the red rear piece carries a two-digit counter.
  const zapIds=['microwavegundw_zm','microwavegun_zm'].filter(id=>data.weapons[id]);
  const zapFiles=new Set(zapIds.flatMap(id=>[data.weapons[id].model,data.weapons[id].leftModel,data.weapons[id].upgrade?.model,data.weapons[id].upgrade?.leftModel]).filter(Boolean));
  for(const url of zapFiles)for(const m of await materialsOf(url,'mtl_raygun_moon_rear')){
    const glow=glowCanvas(m,0xb8ff5a,2.2),layer=digitDisplay([242/1024,500/1024,395/1024,617/1024]);glow.layers.push(layer);
    displays.push({weapons:new Set(zapIds),glow,layer,value:(d,w)=>w.mag});
  }
  // Thundergun: ten dashes around the rear disc show the ammo left in total.
  if(data.weapons.thundergun_zm){
    const d=data.weapons.thundergun_zm,files=new Set([d.model,d.upgrade?.model].filter(Boolean));
    for(const url of files)for(const m of await materialsOf(url,'mtl_t5_weapon_thundergun')){
      if(!m.map?.image)continue;
      const layer=ringGauge(m.map,[180/1024,372/1024],128/1024);if(!layer.count)continue;
      const glow=glowCanvas(m,0xffa040,2.4);glow.layers.push(layer);
      displays.push({weapons:new Set(['thundergun_zm']),glow,layer,value:(def,w)=>Math.ceil(layer.count*(w.mag+w.reserve)/Math.max(1,def.clipSize+def.maxAmmo))});
    }
  }
  if(!displays.length)return;

  api.host.on('update',()=>{
    const w=session.weapon;if(!w)return;const def=session.def,id=def.baseId??def.id;
    const dirty=new Set();
    for(const d of displays)if(d.weapons.has(id)&&d.layer.set(d.value(def,w)))dirty.add(d.glow);
    for(const glow of dirty)redraw(glow);
  });
}
