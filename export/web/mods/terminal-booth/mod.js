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
    const g=new THREE.BoxGeometry(44,100,30).translate(0,50,15).applyMatrix4(root.matrixWorld);
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
      else if(n==='sign_glow'){b.sign=sign(cfg.sign??'TERMINAL');o.material=b.sign.material;o.castShadow=false;}
      else if(/^glass/.test(n)||/glass/.test(m.name)){o.material=m.clone();Object.assign(o.material,{transparent:true,depthWrite:false,opacity:.18,roughness:.08,metalness:0});o.material.color.set('#1a2828');o.renderOrder=2;o.castShadow=false;}
      else if(/^coolant/.test(n)){o.material=m.clone();const t=flowTexture();o.material.emissiveMap=t;o.material.emissive.set('#2ef2ff');o.material.emissiveIntensity=2.2;o.castShadow=false;b.coolant.push({mat:o.material,tex:t});}
      else if(/^led_/.test(n)){o.material=m.clone();o.castShadow=false;b.leds.push(ledFor(n,o.material));}
      else if(/^wire_/.test(n)&&LIVE.test(n)&&WIRE_COLOR[m.name]){
        o.material=m.clone();const t=pulseTexture().clone();t.repeat.set(4+Math.random()*4,1);t.offset.x=Math.random();
        o.material.emissive.set(WIRE_COLOR[m.name]);o.material.emissiveMap=t;o.material.emissiveIntensity=1.8;
        const w={mat:o.material,tex:t,speed:.8+Math.random()*1.2};b.wires.push(w);if(/^wire_cut/.test(n))b.cut[+n.slice(8)]=w;}
    });
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
        while(lines.length>10)lines.shift();
      }
      cursor+=dt;roll=(roll+dt*.18)%1.3;
      drawAcc+=dt;if(drawAcc<1/15)return;drawAcc=0;draw(power);
      // tube flicker
      material.emissiveIntensity=(power?1.25:.35)*(.96+Math.random()*.06);
    }
    function draw(power){
      const w=c.width,h=c.height;
      g.fillStyle=power?'#031208':'#010402';g.fillRect(0,0,w,h);
      g.font='bold 20px "Courier New", monospace';g.textBaseline='top';
      g.shadowColor='#3dff8a';g.shadowBlur=power?10:4;g.fillStyle=power?'#6bff9e':'#1f6b3a';
      const all=[...lines];if(power&&(typed||cursor%1<.55))all.push(typed+(cursor%1<.55?'█':''));
      all.slice(-12).forEach((l,i)=>g.fillText(l,40,30+i*27));
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
  function sign(text){
    const c=document.createElement('canvas');c.width=1024;c.height=128;const g=c.getContext('2d');
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.flipY=false;tex.anisotropy=4;
    const material=new THREE.MeshStandardMaterial({color:0x000000,emissive:0xffffff,emissiveMap:tex,emissiveIntensity:1.6,roughness:.4});
    let off=0;
    function set(t){text=t;
      g.fillStyle='#120804';g.fillRect(0,0,1024,128);
      g.font='bold 78px "Arial Narrow", Arial, sans-serif';g.textAlign='center';g.textBaseline='middle';
      const spaced=[...String(t).toUpperCase()].join('  ');
      g.shadowColor='#ff7a1a';g.shadowBlur=26;g.fillStyle='#ffb45c';g.fillText(spaced,512,68);
      g.shadowBlur=6;g.fillStyle='#fff0d8';g.fillText(spaced,512,68);g.shadowBlur=0;
      g.fillStyle='rgba(255,140,40,.55)';g.fillRect(40,14,944,3);g.fillRect(40,111,944,3);
      tex.needsUpdate=true;}
    set(text);
    function update(dt,power){
      // an old tube: now and then it stutters
      off-=dt;let k=power?1:.12;
      if(off<0){if(off<-.35)off=3+Math.random()*9;else k*=Math.random()<.5?.25:1;}
      material.emissiveIntensity=1.6*k;
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
    const base=mat.emissiveIntensity||4;mat.emissiveIntensity=base*.6;
    const mode=/power|strip/.test(name)?'steady':/kb/.test(name)?'busy':/jbox/.test(name)?'blink':/lamp/.test(name)?'lamp':'slow';
    return {mat,base:base*.6,mode,t:Math.random()*3,on:true};
  }
  function updateLed(l,dt,power){
    l.t+=dt;let k=1;
    if(l.mode==='busy'){if(Math.random()<dt*9)l.on=!l.on;k=l.on?1:.08;}
    else if(l.mode==='blink')k=l.t%1<.5?1:.05;
    else if(l.mode==='slow')k=.55+.45*Math.sin(l.t*2.2);
    else if(l.mode==='lamp')k=.92+Math.random()*.08;
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
      b.screen?.update(dt,power);b.sign?.update(dt,power);
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
