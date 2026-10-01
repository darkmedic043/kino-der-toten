// BO1 wonder weapons Kino doesn't have, built from the user's own game install
// by .tools/build_wonder_weapons.py (weapons.json + models/animations/audio
// here; not redistributable). Currently: Winter's Howl (Five), PaP Winter's
// Fury. Behaviour follows _zombiemode_weap_freezegun.gsc:
// - a shot hits every zombie in a cylinder along the view (radius 120, out to
//   600; PaP 180 / 900) for outer..inner damage by distance (500..1000; PaP
//   750..1500), behind-the-player and walled-off zombies excluded;
// - survivors slow down a step (sprint -> run -> walk);
// - kills freeze solid (the game's freeze-death animations, iced over) and
//   stand as statues: damaging one shatters it (radius 180, 500..250 damage;
//   PaP 300, 750..500), walking into one crumbles it, otherwise they crumble
//   after a while.
import * as THREE from 'three';
import { loadAnimation } from '../../animation.js';

const BASE=new URL('./',import.meta.url).href;
const TUNE={base:{radius:120,inner:60,outer:600,dmgIn:1000,dmgOut:500,shatter:180,shIn:500,shOut:250},
            pap:{radius:180,inner:120,outer:900,dmgIn:1500,dmgOut:750,shatter:300,shIn:750,shOut:500}};
const up=new THREE.Vector3(0,1,0);

let built=null;
export async function prepare(data){
  const r=await fetch(BASE+'weapons.json');if(!r.ok){console.info('[wonder-weapons] not built: run .tools/build_wonder_weapons.py');return;}
  built=await r.json();
  Object.assign(data.weapons,built.weapons);
  // Thrown items: viewmodel fields (offsets, sprint/ADS times) not in the build come from the monkey bomb's.
  const base=data.equipment?.zombie_cymbal_monkey??{};
  for(const [id,e] of Object.entries(built.equipment??{}))(data.equipment??={})[id]={...base,...e,projectileModel:e.worldModel,sounds:{}};
  data.boxPool=[...new Set([...(data.boxPool??[]),...Object.keys(built.weapons)])];
}

export default async function setup(api){
  if(!built)return;
  const {host,session,camera,scene,world,enemies,audio,view,data}=api;

  // ---- sounds ------------------------------------------------------------------------------
  const S=built.sounds.freezegun,buffers=new Map();
  async function buffer(key){const ctx=audio.ctx;if(!ctx||!S[key])return null;
    if(!buffers.has(key))buffers.set(key,fetch(new URL(S[key],document.baseURI)).then(r=>r.arrayBuffer()).then(b=>ctx.decodeAudioData(b)).catch(()=>null));return buffers.get(key);}
  async function play(key,{gain=1,at=null,rate=1}={}){
    const ctx=audio.ctx,out=audio.master;if(!ctx||!out)return;const b=await buffer(key);if(!b)return;
    const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=b;s.playbackRate.value=rate;
    let k=gain;if(at){const d=camera.position.distanceTo(at);k*=Math.max(0,1-d/1800);if(k<=.01)return;}
    g.gain.value=k;s.connect(g).connect(out);s.start();
  }
  const pick=(prefix,n)=>prefix+'_'+String(Math.floor(Math.random()*n)).padStart(2,'0');
  const isFreeze=def=>!!(def?.freeze||data.weapons[def?.baseId??def?.id]?.freeze||/^freezegun/.test(def?.id??''));
  // the shot: front and rear layers; the game's own cue lookup has nothing for it
  const weaponSound=audio.weapon.bind(audio);
  audio.weapon=(kind,def,...rest)=>{
    if(kind==='shot'&&isFreeze(def)){play('plr/shot_plr_fnt',{gain:.9});play('plr/shot_plr_rear',{gain:.7});return;}
    return weaponSound(kind,def,...rest);
  };
  // reload cues ride on the animation's notetracks (sndnt#fly_freeze_open, …)
  const onSound=view.onSound?.bind(view);
  if(onSound)view.onSound=(name,def,...rest)=>{const m=/fly_freeze_(open|twist|off|backon|finish)/.exec(name??'');if(m&&isFreeze(def)){play('reload/fly_freeze_'+m[1],{gain:.9});return;}return onSound(name,def,...rest);};

  // ---- freeze death animations --------------------------------------------------------------
  const deathData=await Promise.all((built.freezeDeaths??[]).map(u=>loadAnimation(u).catch(()=>null)));

  // ---- the blast effect ----------------------------------------------------------------------
  const frost=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);
    r.addColorStop(0,'rgba(235,250,255,1)');r.addColorStop(.35,'rgba(150,215,255,.75)');r.addColorStop(1,'rgba(90,170,255,0)');g.fillStyle=r;g.fillRect(0,0,64,64);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
  const parts=[];
  function puff(at,vel,life,s0,s1,color=0xdff4ff){
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:frost,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,color}));
    sp.position.copy(at);sp.renderOrder=4;scene.add(sp);parts.push({sp,vel,life,t:0,s0,s1});
  }
  function blastFx(origin,dir,reach,t){
    for(let i=0;i<34;i++){const d=Math.random()*reach,spread=t.radius*.55*(d/reach);
      const p=origin.clone().addScaledVector(dir,d).add(new THREE.Vector3((Math.random()-.5)*spread,(Math.random()-.5)*spread*.6,(Math.random()-.5)*spread));
      puff(p,dir.clone().multiplyScalar(220+Math.random()*200),.35+Math.random()*.35,6,30+Math.random()*30);}
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1,.08,8,40),new THREE.MeshBasicMaterial({color:0xbfe8ff,transparent:true,opacity:.75,depthWrite:false,blending:THREE.AdditiveBlending}));
    ring.position.copy(origin).addScaledVector(dir,30);ring.lookAt(ring.position.clone().add(dir));scene.add(ring);parts.push({ring,dir,life:.45,t:0});
  }

  // ---- frozen statues --------------------------------------------------------------------------
  const statues=[];
  const ice=new Map();
  function iceOver(root){root.traverse(o=>{if(!o.isMesh)return;const m=o.material;if(Array.isArray(m))return;
    if(!ice.has(m)){const c=m.clone();c.color=new THREE.Color('#cfe9ff');if(c.emissive){c.emissive=new THREE.Color('#3f7fbf');c.emissiveIntensity=.35;}c.roughness=.25;c.metalness=.1;ice.set(m,c);}
    o.userData.unfrozen=m;o.material=ice.get(m);});}
  function freeze(z){
    const clipData=deathData.filter(Boolean)[Math.floor(Math.random()*deathData.filter(Boolean).length)];
    if(clipData&&z.rig){const key='freeze_death';try{if(!z.rig.actions?.[key])z.rig.add(key,clipData);z.rig.play(key,false,1,.05);}catch(e){console.warn('[wonder-weapons]',e);}}
    iceOver(z.root);z.life=99;   // the statue stays until it shatters or crumbles
    statues.push({z,t:0,at:z.root.position.clone()});play(pick('projectile/freeze/freeze',3),{gain:.8,at:z.root.position});
  }
  function removeStatue(s,how,pap){
    statues.splice(statues.indexOf(s),1);const z=s.z,at=z.root.position.clone().addScaledVector(up,35);
    for(let i=0;i<(how==='shatter'?26:14);i++)puff(at.clone().add(new THREE.Vector3((Math.random()-.5)*30,(Math.random()-.5)*50,(Math.random()-.5)*30)),
      new THREE.Vector3((Math.random()-.5)*(how==='shatter'?420:120),Math.random()*(how==='shatter'?260:60),(Math.random()-.5)*(how==='shatter'?420:120)),.6+Math.random()*.5,8,how==='shatter'?18:12,0xcfeaff);
    z.root.visible=false;z.life=Math.min(z.life,.05);
    if(how==='shatter'){
      play(pick('zombie/shatter/shatter',3),{gain:1,at});
      const t=pap?TUNE.pap:TUNE.base;
      for(const o of [...enemies.list]){const d=o.root.position.distanceTo(z.root.position);if(d<t.shatter&&!host.remoteDamage)enemies.hurt(o,THREE.MathUtils.lerp(t.shIn,t.shOut,d/t.shatter),false,false,'explosion');}
    }else play(pick('zombie/collapse/collapse',3),{gain:.9,at});
  }

  // ---- firing ----------------------------------------------------------------------------------
  let lastShots=session.shots;
  const killedBy=new WeakMap();
  host.on('kill',({enemy})=>{if(enemy&&killedBy.get(enemy))freeze(enemy);});
  function fire(){
    const def=session.def,pap=!!session.weapon?.upgraded,t=pap?TUNE.pap:TUNE.base;
    const origin=camera.position.clone(),dir=camera.getWorldDirection(new THREE.Vector3());
    const wall=world.raycast(new THREE.Ray(origin.clone(),dir.clone()),1,t.outer);
    blastFx(origin.clone().addScaledVector(dir,25).addScaledVector(up,-6),dir,wall?Math.max(60,wall.distance):t.outer,t);
    const end=origin.clone().addScaledVector(dir,t.outer),seg=new THREE.Line3(origin,end),near=new THREE.Vector3();
    const inner2=t.inner*t.inner,outer2=t.outer*t.outer;
    // statues in the blast shatter
    for(const s of [...statues]){const c=s.z.root.position.clone().addScaledVector(up,35);seg.closestPointToPoint(c,true,near);if(near.distanceTo(c)<t.radius&&c.distanceToSquared(origin)<outer2)removeStatue(s,'shatter',pap);}
    for(const z of [...enemies.list]){
      const c=z.root.position.clone().addScaledVector(up,z.kind==='dog'?20:40),d2=c.distanceToSquared(origin);
      if(d2>outer2||c.clone().sub(origin).dot(dir)<0)continue;
      seg.closestPointToPoint(c,true,near);if(near.distanceTo(c)>t.radius)continue;
      if(!world.lineClear(origin,c))continue;
      const ratio=THREE.MathUtils.clamp((outer2-d2)/(outer2-inner2),0,1),dmg=Math.round(THREE.MathUtils.lerp(t.dmgOut,t.dmgIn,ratio));
      if(host.remoteDamage)continue;
      killedBy.set(z,true);enemies.hurt(z,dmg,false,false,'freeze');
      if(enemies.list.includes(z)){killedBy.delete(z);z.speed=Math.max(z.kind==='dog'?120:34,z.speed*.6);   // slowed a step
        for(let i=0;i<5;i++)puff(c.clone().add(new THREE.Vector3((Math.random()-.5)*24,(Math.random()-.5)*40,(Math.random()-.5)*24)),up.clone().multiplyScalar(20),.5,6,14,0xbfe6ff);}
      play(pick('projectile/impact/impact',4),{gain:.6,at:c});
    }
  }

  host.on('update',dt=>{
    if(session.shots!==lastShots){const fired=session.shots>lastShots;lastShots=session.shots;if(fired&&isFreeze(session.def))fire();}
    if(!dt)return;
    // other damage shatters statues: explosions are caught by radius, bullets by the shot ray
    const feet=api.player.getFeetPosition();
    for(const s of [...statues]){s.t+=dt;
      if(feet.distanceTo(s.z.root.position)<34){removeStatue(s,'crumple');continue;}
      if(s.t>12)removeStatue(s,'crumple');}
    for(const p of [...parts]){p.t+=dt;const u=p.t/p.life;
      if(u>=1){scene.remove(p.sp??p.ring);(p.sp??p.ring).material.dispose();p.ring?.geometry.dispose();parts.splice(parts.indexOf(p),1);continue;}
      if(p.sp){p.vel.multiplyScalar(Math.exp(-dt*3));p.sp.position.addScaledVector(p.vel,dt);p.sp.scale.setScalar(p.s0+(p.s1-p.s0)*Math.sqrt(u));p.sp.material.opacity=1-u;}
      else{p.ring.position.addScaledVector(p.dir,dt*700);p.ring.scale.setScalar(10+u*90);p.ring.material.opacity=.75*(1-u);}}
  });
  // bullets from any gun break statues they hit
  let lastAny=session.shots;
  host.on('update',()=>{
    if(session.shots===lastAny)return;const fired=session.shots>lastAny;lastAny=session.shots;
    if(!fired||isFreeze(session.def)||!statues.length)return;
    const ray=new THREE.Ray(camera.position.clone(),camera.getWorldDirection(new THREE.Vector3()));
    const wall=world.raycast(ray,1,4000);
    for(const s of [...statues]){const c=s.z.root.position.clone().addScaledVector(up,35);if(ray.distanceToPoint(c)<22&&(!wall||wall.distance>c.distanceTo(ray.origin)-30))removeStatue(s,'shatter',false);}
  });
  window.kino.wonder={statues,fire};
  console.info('[wonder-weapons] loaded',Object.keys(built.weapons).join(', '));
}
