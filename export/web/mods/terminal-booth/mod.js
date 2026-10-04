// Terminal booth prop: a payphone-style booth whose phone is a CRT terminal,
// built by .tools/build-terminal-booth.py. Placed per map from placements.json
// ({position, yaw, model?, scale?}; snapped to the floor and flush against the
// wall behind it), with a blocking collider, a faint white interior light, and
// zombie paths routed around its footprint (the navmesh is baked without it). Live parts: the terminal screen and roof sign are canvases, the
// live wires carry travelling pulses, LEDs blink, the coolant tubes flow, and
// the severed wires under the roof spark. Before the power is on, the booth
// idles on standby.
//
// window.kino.terminalBooth exposes the booths for other mods:
//   .booths[i].print(line)  .booths[i].setSign(text)  .booths[i].root
//   .booths[i].tapScreen.set(lines)  (the beer tap's screen: what's on tap, e.g. the Wunderfizz's perk)
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { CollisionWorld } from '../../collision-world.js';

const BASE=new URL('./',import.meta.url).href;
const LIVE=/^wire_(cab|jb|span2|side1|cut)/;
const WIRE_COLOR={wire_red:'#ff3a22',wire_yellow:'#ffc21f',wire_blue:'#3f8cff',wire_green:'#39ff6a',wire_white:'#9fc4ff'};

export default async function setup(api){
  const cfg=await fetch(BASE+'placements.json').then(r=>r.json());
  const spots=cfg.maps[api.map?.id??'kino'];
  if(!spots?.length)return;
  const {scene,world,session,camera,audio,host}=api;
  const col=world.collision;
  let pulseTex,meshes;
  const booths=[];
  for(const spot of spots)booths.push(build(await loadModel(BASE+(spot.model??'terminal_booth.glb')),spot));
  routeAround(booths);
  for(const b of booths)clearDebris(b);
  window.kino.terminalBooth={booths};
  window.kino.lighting?.tag?.(scene);

  // ------------------------------------------------------------- placement
  function snap(root,spot){
    const yaw=THREE.MathUtils.degToRad(spot.yaw??0),fwd=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
    const p=new THREE.Vector3(...spot.position),sc=spot.scale??1;
    const cast=(o,d,far)=>col?.raycastFirst?.(new THREE.Ray(o,d.clone().normalize()),0,far);
    // The visible wall can stand proud of its collision (Kino's under-stair
    // wall is 8 in front), so the back also snaps to the rendered meshes.
    const rc=new THREE.Raycaster();
    const seen=(o,d,far)=>{rc.set(o,d.clone().normalize());rc.far=far;return rc.intersectObjects(visibleMeshes(),false)[0];};
    const floor=cast(p.clone().addScaledVector(fwd,15).add(new THREE.Vector3(0,60,0)),new THREE.Vector3(0,-1,0),200);
    if(floor)p.y=floor.point.y;
    // The nearest wall surface behind, measured at a few heights and offsets.
    let back=null;const side=new THREE.Vector3(fwd.z,0,-fwd.x);
    for(const h of [20,45,70])for(const s of [-15,0,15]){
      const o=p.clone().addScaledVector(fwd,40).addScaledVector(side,s*sc);o.y=p.y+h*sc;
      for(const hit of [cast(o,fwd.clone().negate(),90),seen(o,fwd.clone().negate(),90)])if(hit&&(back===null||hit.distance<back))back=hit.distance;}
    if(back!==null)p.addScaledVector(fwd,40-back+.15);
    root.position.copy(p);root.rotation.set(0,yaw,0);root.scale.setScalar(spot.scale??1);root.updateMatrixWorld(true);
  }

  function visibleMeshes(){
    return meshes??=(()=>{const list=[];scene.traverse(o=>{if(o.isMesh&&!o.isSkinnedMesh&&o.visible&&!o.material?.transparent)list.push(o);});return list;})();
  }

  function collide(root){
    if(!world.dynamic)return;
    // The body and the keyboard ledge; the hoses on the floor are left walkable.
    // 44 wide, plus the beer tap on the left wing (out to local x −31)
    const g=new THREE.BoxGeometry(53,100,30).translate(-4.5,50,15).applyMatrix4(root.matrixWorld);
    g.computeBoundingBox();
    // window:true keeps setDoors from treating it as a door; the player still collides.
    world.dynamic.push({collider:new CollisionWorld(g),box:g.boundingBox.clone(),enabled:true,window:true,note:'terminal booth'});
  }

  // ---------------------------------------------------------------- build
  function build(root,spot){
    root.name='terminal_booth';snap(root,spot);scene.add(root);collide(root);
    const b={root,spot,leds:[],wires:[],sparks:[],cut:[],coolant:[],t:Math.random()*10};
    // A faint white light from the strip under the roof, filling the inside.
    // Added during loading and never toggled, so no shader recompiles later.
    b.light=new THREE.PointLight(0xf2f6ff,cfg.lightIntensity??700,78*(spot.scale??1),2);b.light.position.set(0,82,13);b.light.castShadow=false;root.add(b.light);
    root.traverse(o=>{
      if(o.name.startsWith('spark_')){b.sparks.push({node:o,next:2+Math.random()*5,parts:null});return;}
      if(!o.isMesh)return;
      const n=o.name,m=o.material;
      o.castShadow=o.receiveShadow=true;
      if(n==='crt_screen'){b.screen=screen(cfg.screen);o.material=b.screen.material;o.castShadow=false;}
      else if(n==='tap_screen'){b.tapScreen=tapScreen();o.material=b.tapScreen.material;o.castShadow=false;}
      else if(n==='sign_glow'){b.sign=sign(cfg.sign??'MelonTerm 2.7');o.material=b.sign.material;o.castShadow=false;}
      else if(/^glass/.test(n)||/glass/.test(m.name)){o.material=m.clone();Object.assign(o.material,{transparent:true,depthWrite:false,opacity:.18,roughness:.08,metalness:0});o.material.color.set('#1a2828');o.renderOrder=2;o.castShadow=false;}
      else if(/^coolant/.test(n)){o.material=m.clone();const t=flowTexture();o.material.emissiveMap=t;if(!/tap/.test(n))o.material.emissive.set('#2ef2ff');   // the tap's beer line keeps its amber
        o.material.emissiveIntensity=2.2;o.castShadow=false;b.coolant.push({mat:o.material,tex:t});}
      else if(/^led_/.test(n)){o.material=m.clone();o.castShadow=false;b.leds.push(ledFor(n,o.material));}
      else if(/^wire_/.test(n)&&LIVE.test(n)&&WIRE_COLOR[m.name]){
        o.material=m.clone();const t=pulseTexture().clone();t.repeat.set(4+Math.random()*4,1);t.offset.x=Math.random();
        o.material.emissive.set(WIRE_COLOR[m.name]);o.material.emissiveMap=t;o.material.emissiveIntensity=1.8;
        const w={mat:o.material,tex:t,speed:.8+Math.random()*1.2};b.wires.push(w);if(/^wire_cut/.test(n))b.cut[+n.slice(8)]=w;}
    });
    // Sharp baked textures at glancing angles (the keyboard deck, the sides).
    const aniso=api.renderer?.capabilities?.getMaxAnisotropy?.()??1;
    root.traverse(o=>{for(const m of [o.material].flat())if(m)for(const k of ['map','normalMap','roughnessMap','metalnessMap','aoMap'])if(m[k]&&m[k].anisotropy<aniso){m[k].anisotropy=aniso;m[k].needsUpdate=true;}});
    b.glow=floorGlow(root);
    b.print=line=>b.screen?.print(line);b.setSign=text=>b.sign?.set(text);
    return b;
  }

  // --------------------------------------------------------------- screen
  function screen(opts={}){
    const c=document.createElement('canvas');c.width=512;c.height=384;const g=c.getContext('2d');
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.flipY=false;tex.anisotropy=4;
    const material=new THREE.MeshStandardMaterial({color:0x000000,emissive:0xffffff,emissiveMap:tex,emissiveIntensity:1.25,roughness:.18,metalness:0});
    const boot=opts.boot??['BOOT ROM 2.14 ...... OK','MEM CHECK 640K ..... OK','COOLANT LOOP ....... OK','LINK NODE-07 .. ONLINE',''];
    const idle=opts.idle??['PWR BUS 3 ........ 118V','COOLANT ..... 4.2 L/MIN','SIGNAL ............ WEAK','CARRIER LOST. RETRYING','HANDSHAKE ........... OK','RELAY 935 .... NO REPLY','ERR 0x2F BAD SECTOR','LISTENING ...'];
    let lines=[],queue=[],typed='',acc=0,idleIn=6,cursor=0,roll=0,wasPower=null,dirty=true,drawAcc=0;
    const print=line=>queue.push(String(line).toUpperCase().slice(0,24));
    function update(dt,power){
      if(power!==wasPower){wasPower=power;lines=[];queue=[];typed='';dirty=true;
        if(power)boot.forEach(print);else lines=['','','    NO MAINS POWER','','    STANDBY_'];}
      if(power){
        acc+=dt;while(queue.length&&acc>.035){acc-=.035;const target=queue[0];
          if(typed.length<target.length)typed=target.slice(0,typed.length+1);else{lines.push(typed);typed='';queue.shift();acc-=.25;}dirty=true;}
        if(!queue.length){acc=0;idleIn-=dt;if(idleIn<=0){idleIn=4+Math.random()*7;print(idle[Math.floor(Math.random()*idle.length)]);}}
        while(lines.length>9)lines.shift();
      }
      cursor+=dt;roll=(roll+dt*.18)%1.3;
      drawAcc+=dt;if(drawAcc<1/15)return;drawAcc=0;draw(power);
      // tube flicker
      material.emissiveIntensity=(power?1.25:.35)*(.96+Math.random()*.06);
    }
    function draw(power){
      const w=c.width,h=c.height;
      g.fillStyle=power?'#031208':'#010402';g.fillRect(0,0,w,h);
      g.font='bold 22px "Courier New", monospace';g.textBaseline='top';
      g.shadowColor='#3dff8a';g.shadowBlur=power?10:4;g.fillStyle=power?'#6bff9e':'#1f6b3a';
      const all=[...lines];if(power&&(typed||cursor%1<.55))all.push(typed+(cursor%1<.55?'█':''));
      all.slice(-11).forEach((l,i)=>g.fillText(l,62,52+i*27));
      g.shadowBlur=0;
      // rolling refresh bar, scanlines, vignette
      const y=(roll-.15)*h;const bar=g.createLinearGradient(0,y,0,y+60);
      bar.addColorStop(0,'rgba(120,255,170,0)');bar.addColorStop(.5,'rgba(120,255,170,.07)');bar.addColorStop(1,'rgba(120,255,170,0)');g.fillStyle=bar;g.fillRect(0,y,w,60);
      g.fillStyle='rgba(0,0,0,.32)';for(let s=0;s<h;s+=3)g.fillRect(0,s,w,1);
      const v=g.createRadialGradient(w/2,h/2,h*.25,w/2,h/2,h*.8);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,.75)');g.fillStyle=v;g.fillRect(0,0,w,h);
      tex.needsUpdate=true;
    }
    update(1/15,!!session.power);
    return {material,update,print};
  }

  // ----------------------------------------------------------------- sign
  // The beer tap's little screen (tap_screen): vertical neon text, ready for the Wunderfizz
  // to show what's on tap. b.tapScreen.set(lines) replaces it.
  function tapScreen(){
    const c=document.createElement('canvas');c.width=128;c.height=512;const g=c.getContext('2d');
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.flipY=false;
    const material=new THREE.MeshStandardMaterial({color:0x000000,emissive:0xffffff,emissiveMap:tex,emissiveIntensity:1.3,roughness:.3});
    let lines=['ON','TAP'],t=0,scan=0;
    function draw(power){
      g.fillStyle='#07020a';g.fillRect(0,0,128,512);
      g.strokeStyle='#ff2fd055';g.lineWidth=3;g.strokeRect(6,6,116,500);
      const text=lines.join(' ').split('');g.textAlign='center';g.textBaseline='middle';
      const step=Math.min(64,440/Math.max(1,text.length));g.font=`bold ${Math.round(step*.9)}px "Arial Narrow", Arial, sans-serif`;
      text.forEach((ch,i)=>{const y=40+i*step;g.shadowColor='#ff2fd0';g.shadowBlur=18;g.fillStyle=power?'#ffd2f4':'#5a2a50';g.fillText(ch,64,y);g.shadowBlur=0;});
      g.fillStyle='#2ef2ff';g.fillRect(14,492,100*(.5+.5*Math.sin(t*1.7)),4);   // a little level bar
      g.fillStyle='rgba(255,255,255,.06)';for(let y=(scan%8);y<512;y+=8)g.fillRect(0,y,128,2);
      tex.needsUpdate=true;
    }
    draw(true);
    return {material,set:l=>{lines=[].concat(l).map(String);draw(true);},
      update:(dt,power)=>{t+=dt;scan+=dt*20;material.emissiveIntensity=(power?1.3:.35)*(.95+Math.random()*.05);if(Math.floor(t*6)!==Math.floor((t-dt)*6))draw(power);}};
  }

  function sign(text){
    // A weathered sign: chipped and scratched letters, grime and drips over the
    // face, and one failing letter that stutters on its own.
    const c=document.createElement('canvas');c.width=1024;c.height=128;const g=c.getContext('2d');
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.flipY=false;tex.anisotropy=4;
    const material=new THREE.MeshStandardMaterial({color:0x000000,emissive:0xffffff,emissiveMap:tex,emissiveIntensity:1.15,roughness:.4});
    let off=0,bad=-1,badOn=true,badT=0,layout=null,rnd;
    const seeded=str=>{let h=1779033703;for(const ch of str)h=Math.imul(h^ch.charCodeAt(0),3432918353);return ()=>{h=Math.imul(h^h>>>15,2246822507);h=Math.imul(h^h>>>13,3266489909);return ((h^=h>>>16)>>>0)/4294967296;};};
    function set(t){
      text=String(t);rnd=seeded(text);
      g.font='bold 76px "Arial Narrow", Arial, sans-serif';
      const chars=[...text],gap=9,widths=chars.map(ch=>g.measureText(ch).width),total=widths.reduce((a,w)=>a+w,0)+gap*(chars.length-1);
      let x=512-total/2;layout=chars.map((ch,i)=>{const at=x;x+=widths[i]+gap;return {ch,x:at,w:widths[i]};});
      const lit=layout.map((l,i)=>i).filter(i=>layout[i].ch.trim());bad=lit[Math.floor(rnd()*lit.length)]??-1;
      // chips, bites and scratches, fixed per text
      layout.chips=[];for(let i=0;i<90;i++)layout.chips.push([rnd()*1024,rnd()*128,.8+rnd()**3*6,rnd()]);
      for(const l of layout)if(l.ch.trim())for(let i=0,n=8+Math.floor(rnd()*10);i<n;i++)layout.chips.push([l.x+rnd()*l.w,36+rnd()*62,1.2+rnd()**2*8,rnd()]);
      layout.scratch=[];for(let i=0;i<26;i++){const x0=rnd()*1024,y0=rnd()*128;layout.scratch.push([x0,y0,x0+(rnd()-.5)*260,y0+(rnd()-.5)*50,.35+rnd()*.5]);}
      layout.dirt=[];for(let i=0;i<55;i++)layout.dirt.push([rnd()*1024,rnd()*128,8+rnd()*46,.2+rnd()*.4]);
      layout.drips=[];for(let i=0;i<14;i++)layout.drips.push([rnd()*1024,4+rnd()*20,20+rnd()*90,2+rnd()*5]);
      draw();
    }
    function draw(){
      g.globalCompositeOperation='source-over';g.fillStyle='#0f0804';g.fillRect(0,0,1024,128);
      g.font='bold 76px "Arial Narrow", Arial, sans-serif';g.textBaseline='middle';g.textAlign='left';
      layout.forEach((l,i)=>{
        const dim=i===bad?(badOn?.55:.06):1;
        g.globalAlpha=dim;g.shadowColor='#ff7a1a';g.shadowBlur=22;g.fillStyle='#e8913e';g.fillText(l.ch,l.x,68);
        g.shadowBlur=4;g.fillStyle='#f6cf9c';g.fillText(l.ch,l.x,68);});
      g.globalAlpha=1;g.shadowBlur=0;
      g.fillStyle='rgba(255,140,40,.5)';g.fillRect(40,12,944,3);g.fillRect(40,113,944,3);
      // chipped paint: bites out of the letters and trim
      g.globalCompositeOperation='destination-out';
      for(const [x,y,r,k] of layout.chips){g.globalAlpha=k<.7?1:.6;g.beginPath();
        for(let j=0;j<6;j++){const a=j/6*Math.PI*2,rr=r*(.55+((k*97+j*13)%1)*.8);g.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}g.fill();}
      g.lineCap='round';for(const [x0,y0,x1,y1,a] of layout.scratch){g.globalAlpha=a;g.lineWidth=1+a*1.5;g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();}
      g.globalAlpha=1;g.globalCompositeOperation='source-over';
      // grime blotches and rust drips from the top edge
      for(const [x,y,r,a] of layout.dirt){const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,`rgba(12,8,4,${a})`);gr.addColorStop(1,'rgba(12,8,4,0)');g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);}
      for(const [x,y,len,w] of layout.drips){const gr=g.createLinearGradient(0,y,0,y+len);gr.addColorStop(0,'rgba(70,32,10,.55)');gr.addColorStop(1,'rgba(70,32,10,0)');g.fillStyle=gr;g.fillRect(x,y,w,len);}
      const edge=g.createLinearGradient(0,0,0,128);edge.addColorStop(0,'rgba(0,0,0,.45)');edge.addColorStop(.2,'rgba(0,0,0,0)');edge.addColorStop(.8,'rgba(0,0,0,0)');edge.addColorStop(1,'rgba(0,0,0,.55)');g.fillStyle=edge;g.fillRect(0,0,1024,128);
      tex.needsUpdate=true;
    }
    set(text);
    function update(dt,power){
      // an old tube: now and then the whole sign stutters
      off-=dt;let k=power?1:.12;
      if(off<0){if(off<-.35)off=3+Math.random()*9;else k*=Math.random()<.5?.25:1;}
      material.emissiveIntensity=1.15*k;
      // the failing letter buzzes on and off by itself
      badT-=dt;if(power&&badT<=0){badOn=!badOn;badT=badOn?.4+Math.random()*2.5:.04+Math.random()*.18;draw();}
    }
    return {material,set,update};
  }

  // ------------------------------------------------------------ textures
  function pulseTexture(){
    if(pulseTex)return pulseTex;
    const c=document.createElement('canvas');c.width=128;c.height=2;const g=c.getContext('2d');
    const gr=g.createLinearGradient(0,0,128,0);
    gr.addColorStop(0,'#000');gr.addColorStop(.72,'#000');gr.addColorStop(.86,'#fff');gr.addColorStop(.9,'#666');gr.addColorStop(1,'#000');
    g.fillStyle=gr;g.fillRect(0,0,128,2);
    pulseTex=new THREE.CanvasTexture(c);pulseTex.wrapS=pulseTex.wrapT=THREE.RepeatWrapping;pulseTex.colorSpace=THREE.SRGBColorSpace;
    return pulseTex;
  }
  function flowTexture(){
    const c=document.createElement('canvas');c.width=16;c.height=256;const g=c.getContext('2d');
    g.fillStyle='#2a6f75';g.fillRect(0,0,16,256);
    for(let i=0;i<22;i++){const y=Math.random()*256,r=2+Math.random()*5,a=.35+Math.random()*.6;g.fillStyle=`rgba(255,255,255,${a})`;g.beginPath();g.arc(Math.random()*16,y,r,0,7);g.fill();}
    for(let i=0;i<5;i++){g.fillStyle='rgba(120,255,255,.35)';g.fillRect(0,Math.random()*256,16,6+Math.random()*10);}
    const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.repeat.set(1,2.5);
    return t;
  }
  function floorGlow(root){
    const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
    const gr=g.createRadialGradient(64,64,0,64,64,64);gr.addColorStop(0,'rgba(80,255,150,.9)');gr.addColorStop(.5,'rgba(60,220,130,.3)');gr.addColorStop(1,'rgba(40,200,120,0)');
    g.fillStyle=gr;g.fillRect(0,0,128,128);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.22,polygonOffset:true,polygonOffsetFactor:-4});
    const q=new THREE.Mesh(new THREE.PlaneGeometry(70,55),mat);q.rotation.x=-Math.PI/2;q.position.set(0,.3,40);q.renderOrder=3;root.add(q);
    return mat;
  }

  // ----------------------------------------------------------------- leds
  function ledFor(name,mat){
    const base=/strip/.test(name)?2:(mat.emissiveIntensity||4);mat.emissiveIntensity=base*.6;
    const mode=/tapstrip|tap_handle/.test(name)?'neon':/power|strip/.test(name)?'steady':/kb/.test(name)?'busy':/jbox/.test(name)?'blink':/lamp/.test(name)?'lamp':'slow';
    return {mat,base:base*.6,mode,t:Math.random()*3,on:true};
  }
  function updateLed(l,dt,power){
    l.t+=dt;let k=1;
    if(l.mode==='busy'){if(Math.random()<dt*9)l.on=!l.on;k=l.on?1:.08;}
    else if(l.mode==='blink')k=l.t%1<.5?1:.05;
    else if(l.mode==='slow')k=.55+.45*Math.sin(l.t*2.2);
    else if(l.mode==='lamp')k=.92+Math.random()*.08;
    else if(l.mode==='neon'){if(l.flick>0){l.flick-=dt;k=Math.random()<.5?.15:1;}else{k=.96+Math.random()*.04;if(Math.random()<dt*.08)l.flick=.15+Math.random()*.3;}}   // neon: steady, now and then a stutter
    else k=.95+Math.random()*.05;
    if(!power)k*=l.mode==='blink'||l.mode==='steady'?.6:.04;
    l.mat.emissiveIntensity=l.base*k;
  }

  // --------------------------------------------------------------- sparks
  const sparkTex=(()=>{const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d');const gr=g.createRadialGradient(16,16,0,16,16,16);
    gr.addColorStop(0,'rgba(255,255,230,1)');gr.addColorStop(.35,'rgba(255,200,90,.8)');gr.addColorStop(1,'rgba(255,120,20,0)');g.fillStyle=gr;g.fillRect(0,0,32,32);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
  function burst(s,b){
    const n=16,pos=new Float32Array(n*3),vel=[];const origin=new THREE.Vector3();s.node.getWorldPosition(origin);
    for(let i=0;i<n;i++){origin.toArray(pos,i*3);vel.push(new THREE.Vector3((Math.random()-.5)*90,(Math.random()-.2)*70,(Math.random()-.5)*90));}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const mat=new THREE.PointsMaterial({map:sparkTex,size:1.1,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,color:0xffd08a});
    const pts=new THREE.Points(geo,mat);pts.frustumCulled=false;scene.add(pts);
    const flash=new THREE.Sprite(new THREE.SpriteMaterial({map:sparkTex,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,color:0xffe0a0}));
    flash.position.copy(origin);flash.scale.setScalar(7);scene.add(flash);
    s.parts={pts,vel,flash,life:.7};
    const w=b.cut[b.sparks.indexOf(s)];if(w)w.flash=.25;
    crackle(origin);
  }
  function tickSpark(s,dt){
    const p=s.parts;p.life-=dt;const a=p.pts.geometry.attributes.position;
    for(let i=0;i<p.vel.length;i++){p.vel[i].y-=386*dt;a.setXYZ(i,a.getX(i)+p.vel[i].x*dt,a.getY(i)+p.vel[i].y*dt,a.getZ(i)+p.vel[i].z*dt);}
    a.needsUpdate=true;p.pts.material.opacity=Math.max(0,p.life/.7);
    p.flash.material.opacity=Math.max(0,(p.life-.55)/.15);p.flash.scale.setScalar(4+Math.random()*5);
    if(p.life<=0){scene.remove(p.pts,p.flash);p.pts.geometry.dispose();p.pts.material.dispose();p.flash.material.dispose();s.parts=null;}
  }
  function crackle(at){
    const ctx=audio?.ctx,out=audio?.master;if(!ctx||!out)return;
    const d=camera.position.distanceTo(at);if(d>700)return;
    const len=.16,buf=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*len),ctx.sampleRate),ch=buf.getChannelData(0);
    for(let i=0;i<ch.length;i++){const t=i/ch.length;ch[i]=(Math.random()*2-1)*(Math.random()<.18?1:.15)*(1-t)**2;}
    const src=ctx.createBufferSource();src.buffer=buf;
    const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=2600+Math.random()*1800;bp.Q.value=.8;
    const gain=ctx.createGain();gain.gain.value=.5*(1-d/700)**2;
    src.connect(bp).connect(gain).connect(out);src.start();
  }

  // ----------------------------------------------------- debris clearance
  // Loose planks and rubble in front of a booth made standing at the terminal
  // bumpy. They're part of the map's merged meshes, so the low debris
  // triangles inside the booth's front area are removed from both the
  // rendered meshes (made degenerate) and the collision (pointed at a vertex
  // far under the map, then the BVH is refit). The floor itself is untouched.
  function clearDebris(b){
    const s=b.spot.scale??1,yaw=b.root.rotation.y,c=Math.cos(yaw),sn=Math.sin(yaw),o=b.root.position,floor=o.y;
    const X=22*s+34,Z=30*s+60;
    const inArea=(x,z)=>{const dx=x-o.x,dz=z-o.z,lx=dx*c-dz*sn,lz=dx*sn+dz*c;return Math.abs(lx)<X&&lz>-4&&lz<Z;};
    const debris=(P,ia,ib,ic,m)=>{let hi=false;for(const i of [ia,ib,ic]){v.fromBufferAttribute(P,i);if(m)v.applyMatrix4(m);
      if(!inArea(v.x,v.z)||v.y<floor-1||v.y>floor+10)return false;if(v.y>floor+.8)hi=true;}return hi;};
    const v=new THREE.Vector3();let n=0,nc=0;
    const area=new THREE.Box3();for(const [lx,lz] of [[-X,-4],[X,-4],[-X,Z],[X,Z]])area.expandByPoint(new THREE.Vector3(o.x+lx*c+lz*sn,floor,o.z-lx*sn+lz*c));
    area.min.y=floor-1;area.max.y=floor+10;
    // rendered map meshes (skip geometry shared by several meshes)
    const users=new Map();scene.traverse(m=>{if(m.isMesh)users.set(m.geometry,(users.get(m.geometry)??0)+1);});
    scene.traverse(m=>{
      if(!m.isMesh||m.isSkinnedMesh||users.get(m.geometry)>1||b.root===m||isChildOf(m,b.root))return;
      const g=m.geometry;if(!g.index||!g.attributes.position)return;
      if(!g.boundingBox)g.computeBoundingBox();if(!g.boundingBox.clone().applyMatrix4(m.matrixWorld).intersectsBox(area))return;
      const I=g.index,P=g.attributes.position;let hit=false;
      for(let t=0;t<I.count;t+=3){const a=I.getX(t),bb=I.getX(t+1),cc=I.getX(t+2);if(debris(P,a,bb,cc,m.matrixWorld)){I.setX(t+1,a);I.setX(t+2,a);hit=true;n++;}}
      if(hit)I.needsUpdate=true;});
    // collision
    const cg=col?.geometry,bvh=col?.bvh;
    if(cg?.index&&bvh){const I=cg.index,P=cg.attributes.position;let far=0;
      for(let i=1;i<P.count;i++)if(P.getY(i)<P.getY(far))far=i;
      for(let t=0;t<I.count;t+=3){const a=I.getX(t),bb=I.getX(t+1),cc=I.getX(t+2);if(debris(P,a,bb,cc,null)){I.setX(t,far);I.setX(t+1,far);I.setX(t+2,far);nc++;}}
      if(nc){I.needsUpdate=true;bvh.refit();}}
    console.info('[terminal-booth] cleared debris triangles: render',n,'collision',nc);
  }
  function isChildOf(o,root){for(let p=o.parent;p;p=p.parent)if(p===root)return true;return false;}

  // ------------------------------------------------------ zombie routing
  // Zombies path on a navmesh baked without the booth. Path segments that
  // would cut through its footprint get detour points at its front corners,
  // and navmesh snaps that land inside it are pushed back out.
  function routeAround(list){
    const R=16;   // zombie radius plus a little room
    const obs=list.map(b=>{const s=b.spot.scale??1,yaw=b.root.rotation.y;
      return {p:b.root.position.clone(),c:Math.cos(yaw),s:Math.sin(yaw),X:22*s+R,Z:30*s+R,y0:b.root.position.y-40,y1:b.root.position.y+100*s};});
    const local=(o,v)=>{const x=v.x-o.p.x,z=v.z-o.p.z;return {x:x*o.c-z*o.s,z:x*o.s+z*o.c};};
    const toWorld=(o,x,z,y)=>new THREE.Vector3(o.p.x+x*o.c+z*o.s,y,o.p.z-x*o.s+z*o.c);
    const inside=(o,v)=>{if(v.y<o.y0||v.y>o.y1)return false;const l=local(o,v);return Math.abs(l.x)<o.X&&l.z<o.Z&&l.z>-60;};
    function crosses(o,a,b){   // segment vs the footprint rectangle (Liang–Barsky)
      if(Math.max(a.y,b.y)<o.y0||Math.min(a.y,b.y)>o.y1)return false;
      const A=local(o,a),B=local(o,b),dx=B.x-A.x,dz=B.z-A.z;let t0=0,t1=1;
      for(const [p,q] of [[-dx,A.x+o.X],[dx,o.X-A.x],[-dz,A.z+60],[dz,o.Z-A.z]]){
        if(p===0){if(q<0)return false;continue;}const r=q/p;if(p<0){if(r>t1)return false;if(r>t0)t0=r;}else{if(r<t0)return false;if(r<t1)t1=r;}}
      return t0<t1;
    }
    function detour(o,a,b){
      const A=local(o,a),B=local(o,b),y=(a.y+b.y)/2,cx=o.X+4,cz=o.Z+4,pts=[];
      const sa=Math.sign(A.x)||1,sb=Math.sign(B.x)||-sa;
      if(A.z<o.Z)pts.push(toWorld(o,sa*cx,cz,y));
      if(B.z<o.Z&&(sb!==sa||A.z>=o.Z))pts.push(toWorld(o,sb*cx,cz,y));
      return pts;
    }
    function pushOut(o,v){
      const l=local(o,v),front=o.Z-l.z,left=l.x+o.X,right=o.X-l.x,m=Math.min(front,left,right);
      return m===front?toWorld(o,l.x,o.Z+1,v.y):m===left?toWorld(o,-o.X-1,l.z,v.y):toWorld(o,o.X+1,l.z,v.y);
    }
    const path=world.path.bind(world),closest=world.closest.bind(world);
    world.path=(a,b)=>{
      const p=path(a,b);if(p.length<2)return p;
      const out=[p[0]];
      for(let i=1;i<p.length;i++){let q=p[i];
        for(const o of obs){if(i<p.length-1&&inside(o,q))q=pushOut(o,q);if(crosses(o,out.at(-1),q))out.push(...detour(o,out.at(-1),q));}
        out.push(q);}
      return out;
    };
    world.closest=(v,ext)=>{let r=closest(v,ext);if(!r)return r;
      for(const o of obs)if(inside(o,r)){const q=pushOut(o,r);r=closest(q,ext)??q;if(inside(o,r))r=q;}
      return r;};
  }

  // --------------------------------------------------------------- update
  host.on('update',dt=>{
    const power=!!session.power;
    for(const b of booths){
      b.t+=dt;
      b.screen?.update(dt,power);b.sign?.update(dt,power);b.tapScreen?.update(dt,power);
      for(const l of b.leds)updateLed(l,dt,power);
      for(const w of b.wires){w.tex.offset.x-=dt*w.speed*(power?1:.25);
        let k=power?1:.15;if(w.flash){w.flash-=dt;k=6;if(w.flash<=0)w.flash=0;}w.mat.emissiveIntensity=1.8*k;}
      for(const c of b.coolant){c.tex.offset.y+=dt*(power?.35:.05);c.mat.emissiveIntensity=power?2.2:.5;}
      b.glow.opacity=(power?.22:.06)*(.93+Math.random()*.07);
      b.light.intensity=(cfg.lightIntensity??700)*(.97+Math.random()*.03);
      for(const s of b.sparks){
        if(s.parts)tickSpark(s,dt);
        else if(power&&(s.next-=dt)<=0){s.next=1.5+Math.random()*6;burst(s,b);}
      }
    }
  });
  console.info('[terminal-booth] placed',booths.length);
}
