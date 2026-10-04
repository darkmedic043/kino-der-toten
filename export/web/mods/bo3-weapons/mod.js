// Black Ops III weapons, built from the user's own BO3 install by
// .tools/build_bo3_weapons.py from Greyhound exports (weapons.json + models/ +
// animations/ here; git-ignored, not redistributable). Each carries its BO3
// first-person arms (def.handsModel) since BO3 animations drive BO3's rig.
//
// Weapons from the user's "CoD Online" workshop mod (bo3_mr23_tesla, bo3_aug_octopus,
// bo3_m1014_jellyfish, bo3_p90_orbit, bo3_g18_death): ordinary guns with the mod's fire and
// reload sounds and glowing parts; the MR23 Tesla's hits sometimes arc to a neighbour.
//
// Wunderwaffe DG-2 (tesla_gun_zm): a shot arcs to the zombie nearest the aim
// (out to 1000) and chains from each kill to the next zombie within 300, up to
// 10 kills (Pack-a-Punched DG-3 JZ: 24, chaining 420), every arc a kill,
// a beat apart, like _zombiemode_tesla.gsc. Its bulbs glow and go dark one per shot,
// with electricity at the prongs. Sounds are BO3's: the layered shot,
// flux and impact per arc, reload foley on the animation's notetracks, the idle hum.
import * as THREE from 'three';
import { applyGlow, tickGlow } from './glow.js';

const BASE=new URL('./',import.meta.url).href;
const TUNE={base:{first:1000,aim:70,arc:300,kills:10},pap:{first:1200,aim:90,arc:420,kills:24}};
const up=new THREE.Vector3(0,1,0);

let built=null;
export async function prepare(data){
  const r=await fetch(BASE+'weapons.json').catch(()=>null);
  if(!r?.ok){console.info('[bo3-weapons] not built: run .tools/build_bo3_weapons.py');return;}
  built=await r.json();
  Object.assign(data.weapons,built.weapons);
  data.boxPool=[...new Set([...(data.boxPool??[]),...Object.keys(built.weapons)])];
}

export default async function setup(api){
  if(!built)return;
  const {host,session,camera,scene,world,enemies,audio,data,view}=api;
  const isTesla=def=>!!(def?.tesla||data.weapons[def?.baseId??def?.id]?.tesla);

  // ---- sounds (BO3's own, from zm_common's sound bank; see the build script) ---------------------
  const S=built.sounds?.dg2??{},MS=built.sounds?.mod??{},AK=built.sounds?.audio??{},buffers=new Map();
  const isMod=def=>!!(def?.modWeapon||data.weapons[def?.baseId??def?.id]?.modWeapon),modId=def=>def?.baseId??def?.id;
  async function buffer(key){const ctx=audio.ctx,url=S[key]??AK[key];if(!ctx||!url)return null;
    if(!buffers.has(key))buffers.set(key,fetch(new URL(url,document.baseURI)).then(r=>r.arrayBuffer()).then(b=>ctx.decodeAudioData(b)).catch(()=>null));return buffers.get(key);}
  async function play(key,{gain=1,at=null,loop=false,rate=1}={}){
    const ctx=audio.ctx,out=audio.master;if(!ctx||!out)return null;const b=await buffer(key);if(!b)return null;
    let k=gain;if(at){k*=Math.max(0,1-camera.position.distanceTo(at)/2200);if(k<=.01)return null;}
    const src=ctx.createBufferSource(),g=ctx.createGain();src.buffer=b;src.loop=loop;src.playbackRate.value=rate;g.gain.value=k;src.connect(g).connect(out);src.start();return {src,g};
  }
  const flux=(gain=1,at=null)=>{for(const side of ['l','r'])play('projectile/flux/wpn_tesla_flux_'+side,{gain,at});};
  // the shot: the player layers (front, low end, rear); the engine's stand-in stays quiet
  const SHOT_GAIN={bo3_mr23_tesla:.6};let prevShot=null,shotToken=0,teslaLayers=[];
  const weaponSound=audio.weapon.bind(audio);
  audio.weapon=(kind,def,...rest)=>{
    if(kind==='shot'&&isMod(def)){   // the mod's own fire sounds: a random variant (MR23: its own last shot)
      const m=MS[modId(def)];if(m?.shots?.length){const last=(session.weapon?.mag??1)<=0&&m.last?.length;const list=last?m.last:m.shots;
        // rapid fire: each shot fades the previous one's tail out (it otherwise stacks up loud: the MR23's sample
        // rings for 1.5 s at 12 shots/s), and a small random pitch/level keeps it from sounding like one loop
        const ctx=audio.ctx;if(prevShot&&ctx){const g=prevShot.g.gain;g.cancelScheduledValues(ctx.currentTime);g.setValueAtTime(g.value,ctx.currentTime);g.linearRampToValueAtTime(0,ctx.currentTime+.12);prevShot.src.stop(ctx.currentTime+.13);prevShot=null;}
        const token=++shotToken,gain=(SHOT_GAIN[modId(def)]??.85)*(.88+Math.random()*.2);
        play(list[Math.floor(Math.random()*list.length)],{gain,rate:.96+Math.random()*.08}).then(h=>{if(h&&!last&&token===shotToken)prevShot=h;});return;}}
    // no fire sound in the mod (Tommy, RPG): the BO1 gun it's built on
    if(kind==='shot'&&isMod(def)&&def.soundAs)return weaponSound(kind,{...def,id:def.soundAs,baseId:def.soundAs},...rest);
    if(kind==='shot'&&isTesla(def)){
      // quieter than BO3's mix, a little pitch drift per shot, and the previous shot's layers fade when firing fast
      const ctx=audio.ctx,rate=.96+Math.random()*.08,v=.9+Math.random()*.15;
      if(ctx)for(const h of teslaLayers){const g=h.g.gain;g.cancelScheduledValues(ctx.currentTime);g.setValueAtTime(g.value,ctx.currentTime);g.linearRampToValueAtTime(0,ctx.currentTime+.15);h.src.stop(ctx.currentTime+.16);}
      teslaLayers=[];const keep=p=>p.then(h=>{if(h)teslaLayers.push(h);});
      if((session.weapon?.mag??1)<=0)play('plr/shot/shot_last_00_f',{gain:.7*v,rate});
      else{keep(play('plr/shot/shot_00_f',{gain:.68*v,rate}));keep(play('plr/shot/shot_00_lfe',{gain:.55*v,rate}));keep(play('plr/shot/shot_00_rs',{gain:.38*v,rate}));}
      return;}
    return weaponSound(kind,def,...rest);
  };
  // reload foley rides the animation's notetracks (sndnt#wpn_tesla_switch_flip_off, ..._clip_in, ...)
  const onSound=view.onSound?.bind(view);
  view.onSound=(name,def,...rest)=>{
    if(isMod(def)){const k=MS[modId(def)]?.notes?.[name];if(k)play(k,{gain:.8});return;}   // mod weapons: reload foley on their markers, nothing else
    const m=/^sndnt#wpn_(tesla_\w+)/.exec(name??'');
    if(isTesla(def)){if(m&&S['reload/plr/'+m[1]])play('reload/plr/'+m[1],{gain:.9});return;}   // the DG-2's markers are all ours: 'end'/'loop_end' etc. must not reach the engine's name lookup
    return onSound?.(name,def,...rest);};
  // the hum while it's in hand
  let hum=null,humWanted=false;
  function setHum(on){
    if(on===humWanted)return;humWanted=on;
    if(on)play('idle/tesla_idle_00',{gain:.22,loop:true}).then(h=>{if(!h)return;if(humWanted&&!hum)hum=h;else h.src.stop();});
    else if(hum){const h=hum;hum=null;try{h.g.gain.setTargetAtTime(0,audio.ctx.currentTime,.08);h.src.stop(audio.ctx.currentTime+.4);}catch{}}
  }

  // ---- arcs: jagged additive lines that flicker and fade ----------------------------------------
  const arcs=[];
  const arcMat=()=>new THREE.LineBasicMaterial({color:0xa8dcff,transparent:true,opacity:1,depthWrite:false,blending:THREE.AdditiveBlending});
  function bolt(a,b,life=.28){
    const group=new THREE.Group();
    for(let strand=0;strand<3;strand++){
      const n=Math.max(6,Math.round(a.distanceTo(b)/18)),pts=[];
      for(let i=0;i<=n;i++){const t=i/n,p=a.clone().lerp(b,t);if(i&&i<n)p.add(new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(14*(1-Math.abs(t-.5)*1.2)));pts.push(p);}
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),arcMat());line.renderOrder=5;group.add(line);
    }
    scene.add(group);arcs.push({group,life,t:0});
  }
  const center=z=>z.root.position.clone().addScaledVector(up,z.kind==='dog'?20:42);
  const muzzle=()=>{const d=camera.getWorldDirection(new THREE.Vector3());return camera.position.clone().addScaledVector(d,30).addScaledVector(up,-7);};

  // ---- the shot ---------------------------------------------------------------------------------
  const pending=[];   // chained kills, a beat apart
  function fire(){
    flash=1;   // the bulbs and arcs flare
    const pap=!!session.weapon?.upgraded,t=pap?TUNE.pap:TUNE.base;
    const origin=camera.position.clone(),dir=camera.getWorldDirection(new THREE.Vector3());
    flux(.7);
    // first target: the zombie nearest the aim line
    let first=null,best=Infinity;
    for(const z of enemies.list){
      const c=center(z),to=c.clone().sub(origin),along=to.dot(dir);
      if(along<0||along>t.first)continue;
      const off=to.clone().addScaledVector(dir,-along).length();if(off>t.aim+along*.06)continue;
      const score=off+along*.05;if(score<best&&world.lineClear(origin,c)){best=score;first=z;}
    }
    if(!first){const wall=world.raycast(new THREE.Ray(origin.clone(),dir.clone()),1,t.first);bolt(muzzle(),origin.clone().addScaledVector(dir,wall?wall.distance:600),.2);return;}
    const chain=[first];let from=first;
    while(chain.length<t.kills){
      const at=center(from);let next=null,nd=t.arc;
      for(const z of enemies.list){if(chain.includes(z))continue;const d=center(z).distanceTo(at);if(d<nd&&world.lineClear(at,center(z))){nd=d;next=z;}}
      if(!next)break;chain.push(next);from=next;
    }
    chain.forEach((z,i)=>pending.push({z,from:i?chain[i-1]:null,at:i*.12}));
  }
  function zap(p){
    const c=center(p.z),a=p.from?center(p.from):muzzle();bolt(a,c);
    flux(p.from?.55:.7,c);play('projectile/impact/proj_impact',{gain:.8,at:c});
    if(!host.remoteDamage&&enemies.list.includes(p.z))enemies.hurt(p.z,1e6,false,false,'tesla');
  }

  // ---- the DG-2's own lights: glowing bulbs (one goes dark per shot), pulsing tubes, the power
  // cell, and electricity crackling at the prongs and over the lit bulbs ----------------------------
  const glowTex=built.fx?.dg2?.glow?new THREE.TextureLoader().load(new URL(built.fx.dg2.glow,document.baseURI).href,t=>{t.colorSpace=THREE.SRGBColorSpace;t.flipY=false;}):null;
  let lit=null,flash=0,arcT=0;
  const dotTex=(()=>{const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d'),r=g.createRadialGradient(16,16,0,16,16,16);
    r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.3,'rgba(200,240,255,.7)');r.addColorStop(1,'rgba(120,200,255,0)');g.fillStyle=r;g.fillRect(0,0,32,32);return new THREE.CanvasTexture(c);})();
  function rigLights(gun,upgraded){
    // the viewmodel's materials are shared between copies of the model: give this one its own
    const L={gun,bulbs:[],glow:[],power:[],sparks:[],upgraded};
    const own=(o,m)=>{o.material=m.clone();o.material.emissive=new THREE.Color(1,1,1);if(glowTex)o.material.emissiveMap=glowTex;o.material.emissiveIntensity=0;return o.material;};
    gun.traverse(o=>{if(!o.isMesh)return;const n=o.material?.name??'',b=/_bulb([123])/.exec(n);
      if(b)L.bulbs[+b[1]-1]=own(o,o.material);
      else if(/_glow/.test(n))L.glow.push(own(o,o.material));
      else if(/_power/.test(n)){const m=own(o,o.material);m.emissiveMap=null;m.emissive.set(upgraded?0xff5a9a:0x5ad8ff);L.power.push(m);}});
    const arcColor=upgraded?0xff7ab0:0x9fe6ff;
    const spark=(bone,r,n)=>{const node=gun.getObjectByName(bone);if(!node)return;
      const lines=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:arcColor,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
      // WebGL lines are 1 px: soft glowing points along each arc give it body
      const dots=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({map:dotTex,color:arcColor,size:r*.55,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
      lines.frustumCulled=dots.frustumCulled=false;lines.renderOrder=dots.renderOrder=5;node.add(lines,dots);L.sparks.push({lines,dots,r,n,bone});};
    spark('tag_flash',3.2,3);                                // the prongs
    for(const b of ['tag_bulb_1','tag_bulb_2','tag_bulb_3'])spark(b,1.4,1);   // over each bulb
    return L;
  }
  function jag(r,n){   // n short jagged arcs within r of the bone
    const pts=[];for(let k=0;k<n;k++){let p=new THREE.Vector3().randomDirection().multiplyScalar(r*Math.random());
      for(let i=0;i<5;i++){const q=p.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(r*.45));pts.push(p,q);p=q;}}
    return pts;
  }
  function updateLights(dt){
    const def=view?.def,gun=view?.gun;
    if(!gun||!isTesla(def)){lit=null;return;}
    const upgraded=!!session.weapon?.upgraded;
    if(lit?.gun!==gun)lit=rigLights(gun,upgraded);
    const wpn=session.weapon,clip=upgraded?(def.upgrade?.clipSize??6):def.clipSize??3,mag=wpn?.mag??0,t=session.time;
    flash=Math.max(0,flash-dt*3);
    const on=Math.ceil(Math.max(0,mag)/clip*3);   // bulbs lit: one per shot left (two shots each on the DG-3 JZ)
    lit.bulbs.forEach((m,i)=>{if(!m)return;const want=i<on?2.4+Math.sin(t*23+i*2)*.25+Math.random()*.25+flash*3:.03;m.emissiveIntensity+=(want-m.emissiveIntensity)*Math.min(1,dt*12);});
    for(const m of lit.glow)m.emissiveIntensity=(mag>0?1.1+Math.sin(t*3.2)*.25:.25)+flash*2.5;
    for(const m of lit.power)m.emissiveIntensity=(mag>0?.6+.5*(mag/clip)+Math.sin(t*6)*.15:.08)+flash*2;
    // electricity: regenerate the arcs a few times a second, flicker them every frame
    if((arcT-=dt)<=0){arcT=.06+Math.random()*.05;
      lit.sparks.forEach(s=>{const bulb=/bulb_(\d)/.exec(s.bone);const live=mag>0&&(!bulb||+bulb[1]<=on)&&(Math.random()<(bulb?.35:.8)||flash>0);
        const pts=live?jag(s.r*(1+flash),s.n+(flash>0?3:0)):[];s.lines.geometry.dispose();s.lines.geometry=new THREE.BufferGeometry().setFromPoints(pts);
        s.dots.geometry.dispose();s.dots.geometry=new THREE.BufferGeometry().setFromPoints(pts.filter((_,i)=>i%2));});}
    for(const s of lit.sparks){s.lines.material.opacity=.55+Math.random()*.45;s.dots.material.opacity=.35+Math.random()*.4;}
  }

  // ---- mod weapons: glowing parts in each gun's colour; the MR23 Tesla's hits arc ------------------
  let modLit=null;
  function updateModGlow(){
    const def=view?.def,gun=view?.gun;if(!gun||!isMod(def)){modLit=null;return;}
    if(modLit?.gun!==gun){   // viewmodels are cached: build once per gun object
      modLit={gun,glow:applyGlow(gun,data.weapons[modId(def)]?.glow)};}
    tickGlow(modLit.glow,session.time,modFlash);
  }
  let modFlash=0;
  function modShot(){
    const def=session.def;modFlash=1;if(!data.weapons[modId(def)]?.arc)return;
    // MR23 Tesla: the zombie nearest the aim takes an arc that jumps to one neighbour (30% of a zombie's health each)
    const origin=camera.position.clone(),dir=camera.getWorldDirection(new THREE.Vector3());let target=null,best=Infinity;
    for(const z of enemies.list){const c=center(z),to=c.clone().sub(origin),along=to.dot(dir);if(along<0||along>1500)continue;const off=to.addScaledVector(dir,-along).length();if(off<50&&off<best&&world.lineClear(origin,c)){best=off;target=z;}}
    if(!target||Math.random()>.35)return;
    const n=enemies.list.find(o=>o!==target&&o.root.position.distanceTo(target.root.position)<220);if(!n)return;
    bolt(center(target),center(n),.18);const full=enemies.list.length?n.health:0;if(!host.remoteDamage)enemies.hurt(n,Math.max(60,full*.3),false,false,'bullet');
  }

  let lastShots=session.shots;
  host.on('update',dt=>{
    updateLights(dt);
    setHum(isTesla(session.def)&&!(session.reloadLeft>0)&&session.phase!=='gameover');
    updateModGlow();modFlash=Math.max(0,modFlash-dt*6);
    // RPG: the rocket (a fixed part on tag_clip) is gone once fired, back with the reload
    if(view?.def?.hideClipEmpty)for(const part of view.gun?.userData.mounts??[])if(part.parent?.name==='tag_clip')part.visible=(session.weapon?.mag??1)>0||session.reloadLeft>0;
    if(session.shots!==lastShots){const fired=session.shots>lastShots;lastShots=session.shots;if(fired&&isTesla(session.def))fire();if(fired&&isMod(session.def))modShot();}
    for(const p of [...pending]){p.at-=dt;if(p.at<=0){pending.splice(pending.indexOf(p),1);zap(p);}}
    for(const a of [...arcs]){a.t+=dt;const k=1-a.t/a.life;
      a.group.children.forEach(l=>{l.material.opacity=Math.max(0,k)*(.6+Math.random()*.4);});
      if(a.t>=a.life){a.group.removeFromParent();a.group.children.forEach(l=>{l.geometry.dispose();l.material.dispose();});arcs.splice(arcs.indexOf(a),1);}}
  });
  host.on('reset',()=>{pending.length=0;setHum(false);});
  window.kino.bo3={fire,arcs,pending,play,sounds:S};
}
