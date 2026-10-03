// Black Ops III weapons, built from the user's own BO3 install by
// .tools/build_bo3_weapons.py from Greyhound exports (weapons.json + models/ +
// animations/ here; git-ignored, not redistributable). Each carries its BO3
// first-person arms (def.handsModel) since BO3 animations drive BO3's rig.
//
// Wunderwaffe DG-2 (tesla_gun_zm): a shot arcs to the zombie nearest the aim
// (out to 1000) and chains from each kill to the next zombie within 300, up to
// 10 kills (Pack-a-Punched DG-3 JZ: 24, chaining 420), every arc a kill,
// a beat apart, like _zombiemode_tesla.gsc. Sounds are BO3's: the layered shot,
// flux and impact per arc, reload foley on the animation's notetracks, the idle hum.
import * as THREE from 'three';

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
  const S=built.sounds?.dg2??{},buffers=new Map();
  async function buffer(key){const ctx=audio.ctx;if(!ctx||!S[key])return null;
    if(!buffers.has(key))buffers.set(key,fetch(new URL(S[key],document.baseURI)).then(r=>r.arrayBuffer()).then(b=>ctx.decodeAudioData(b)).catch(()=>null));return buffers.get(key);}
  async function play(key,{gain=1,at=null,loop=false}={}){
    const ctx=audio.ctx,out=audio.master;if(!ctx||!out)return null;const b=await buffer(key);if(!b)return null;
    let k=gain;if(at){k*=Math.max(0,1-camera.position.distanceTo(at)/2200);if(k<=.01)return null;}
    const src=ctx.createBufferSource(),g=ctx.createGain();src.buffer=b;src.loop=loop;g.gain.value=k;src.connect(g).connect(out);src.start();return {src,g};
  }
  const flux=(gain=1,at=null)=>{for(const side of ['l','r'])play('projectile/flux/wpn_tesla_flux_'+side,{gain,at});};
  // the shot: the player layers (front, low end, rear); the engine's stand-in stays quiet
  const weaponSound=audio.weapon.bind(audio);
  audio.weapon=(kind,def,...rest)=>{
    if(kind==='shot'&&isTesla(def)){
      if((session.weapon?.mag??1)<=0)play('plr/shot/shot_last_00_f',{gain:.95});
      else{play('plr/shot/shot_00_f',{gain:.95});play('plr/shot/shot_00_lfe',{gain:.8});play('plr/shot/shot_00_rs',{gain:.6});}
      return;}
    return weaponSound(kind,def,...rest);
  };
  // reload foley rides the animation's notetracks (sndnt#wpn_tesla_switch_flip_off, ..._clip_in, ...)
  const onSound=view.onSound?.bind(view);
  view.onSound=(name,def,...rest)=>{const m=/^sndnt#wpn_(tesla_\w+)/.exec(name??'');
    if(m&&isTesla(def)){if(S['reload/plr/'+m[1]])play('reload/plr/'+m[1],{gain:.9});return;}
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

  let lastShots=session.shots;
  host.on('update',dt=>{
    setHum(isTesla(session.def)&&!(session.reloadLeft>0)&&session.phase!=='gameover');
    if(session.shots!==lastShots){const fired=session.shots>lastShots;lastShots=session.shots;if(fired&&isTesla(session.def))fire();}
    for(const p of [...pending]){p.at-=dt;if(p.at<=0){pending.splice(pending.indexOf(p),1);zap(p);}}
    for(const a of [...arcs]){a.t+=dt;const k=1-a.t/a.life;
      a.group.children.forEach(l=>{l.material.opacity=Math.max(0,k)*(.6+Math.random()*.4);});
      if(a.t>=a.life){a.group.removeFromParent();a.group.children.forEach(l=>{l.geometry.dispose();l.material.dispose();});arcs.splice(arcs.indexOf(a),1);}}
  });
  host.on('reset',()=>{pending.length=0;setHum(false);});
  window.kino.bo3={fire,arcs,pending,play,sounds:S};
}
