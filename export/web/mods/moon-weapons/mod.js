// Moon's wonder weapons (original T5 assets from this project's Moon export)
// on Kino and custom maps: Zap Guns (dual wield) <-> Wave Gun (press B), and
// the Death Machine. Moon uses bespoke firing code; here they are instant-hit
// weapons whose special effects are added through mod events.
import * as THREE from 'three';
import { loadModel, loadAnimation } from '../../animation.js';

const IDS=['microwavegundw_zm','microwavegun_zm','minigun_zm'];
const UPGRADE_NAMES={microwavegundw_zm:"Porter's Zap Guns",microwavegun_zm:"Porter's Mark II Ray Gun"};
const SHOT_SOUNDS={microwavegundw_zm:'moon/wpn/microwave/dw/plr/microwave_shot',microwavegun_zm:'moon/wpn/microwave/rifle/plr/microwave_rifle_shot'};

export async function prepare(data){
  const moon=await fetch(new URL('moon/combat-data.json',document.baseURI)).then(r=>r.json());
  for(const id of IDS){
    const def=structuredClone(moon.weapons[id]);if(!def)continue;
    // Hit-scan instead of Kino's slow projectile path; effects come from setup().
    Object.assign(def,{projectileSpeed:0,explosionRadius:0});
    if(def.upgrade)Object.assign(def.upgrade,{projectileSpeed:0,explosionRadius:0,name:def.upgrade.name??UPGRADE_NAMES[id]});
    if(id==='minigun_zm'){
      Object.assign(def,{reloadTime:3,reloadEmptyTime:3});
      // Never Pack-a-Punchable in BO1/BO2 (a power-up there): our own upgrade, with a faster spin-up (see setup).
      def.upgrade??={name:'The Reaper',clipSize:750,maxAmmo:1500,startAmmo:1500,damage:900,minDamage:550,range:2200,headMultiplier:2.5,reloadTime:2.6,reloadEmptyTime:2.6};
    }
    if(id==='microwavegundw_zm')def.progressAs='microwavegun_zm';   // one gun in the menus: the Zap Guns' kills and camo are the Wave Gun's (weapon-levels)
    data.weapons[id]=def;
  }
  data.boxPool=[...new Set([...(data.boxPool??[]),'microwavegun_zm','minigun_zm'])];
  return data;
}

export default async function setup(api){
  const {host,session,enemies,world,camera,scene,audio,data}=api;
  // Moon's weapon sounds: merge just the wonder-weapon cues into this map's audio.
  try{
    const manifest=await fetch(new URL('moon/audio/manifest.json',document.baseURI)).then(r=>r.json());
    for(const [k,v] of Object.entries(manifest))if(/moon\/(wpn\/(microwave|lmg\/minigun)|fly\/gibs\/epic)/.test(k))audio.manifest[k]=v;
  }catch{}
  const minigunShot=Object.keys(audio.manifest).find(k=>/lmg\/minigun\/.*plr.*(loop|shot)/.test(k));
  const weaponSound=audio.weapon.bind(audio);
  audio.weapon=(kind,def)=>{
    const id=def?.baseId??def?.id;
    if(kind==='shot'&&SHOT_SOUNDS[id]){audio.play(SHOT_SOUNDS[id],.8);return;}
    if(kind==='shot'&&id==='minigun_zm'&&minigunShot){audio.play(minigunShot,.55);return;}
    weaponSound(kind,def);
  };
  const current=()=>session.weapon?.id;

  // Zap Guns: any hit kills.
  host.on('beforeEnemyDamage',e=>{if(current()==='microwavegundw_zm'&&e.cause==='bullet'&&e.enemy)e.amount=Math.max(e.amount,e.enemy.health+1);});

  // Wave Gun: a microwave cone that cooks every zombie in front of you.
  const waves=[];
  // As in BO1's Moon, a cooked zombie swells up and writhes on the spot, then bursts (2026-11-09). The kill and its
  // points count at the shot (cause 'wave', which weapon-levels counts); only the corpse is held, its death clip
  // waiting on the first frame. Bones are scaled uniformly (local = this region's swell / the parent's, so nothing
  // shears), the root rises as the legs lengthen, and the writhe sits on top of the clip (mods update after the mixer).
  const SWELL={j_spinelower:1.5,j_spineupper:1.85,j_spine4:1.7,j_clavicle_le:1.7,j_clavicle_ri:1.7,j_shoulder_le:1.6,j_shoulder_ri:1.6,j_elbow_le:1.45,j_elbow_ri:1.45,j_wrist_le:1.15,j_wrist_ri:1.15,
    j_hip_le:1.25,j_hip_ri:1.25,j_knee_le:1.1,j_knee_ri:1.1,j_ankle_le:1,j_ankle_ri:1};
  const WRITHE={j_spineupper:.1,j_spine4:.12,j_neck:.2,j_head:.3,j_clavicle_le:.15,j_clavicle_ri:.15,j_shoulder_le:.5,j_shoulder_ri:.5,j_elbow_le:.55,j_elbow_ri:.55,j_wrist_le:.4,j_wrist_ri:.4};
  const cooking=[];let cookSound=false,dingAt=-1;
  const v3=new THREE.Vector3(),jit=new THREE.Quaternion(),eul=new THREE.Euler();
  function cook(z,forward){
    const body=z.root.children[0];if(!body||z.kind==='dog')return;
    const death=z.rig.actions.death;if(death){death.time=.04;death.timeScale=0;}
    z.life=99;cookSound=true;
    const f=new Map(),swell=[],writhe=[],phase={};
    // the head model (enemies.spawn) hangs off j_spine4 with its own copy of the spine chain: scaling those copies would
    // pull the head off the neck, so it only swells with the chest
    const headModel=body.getObjectByName('j_spine4')?.children.find(c=>!c.isBone),inHead=b=>{for(let o=b;o&&o!==body;o=o.parent)if(o===headModel)return true;return false;};
    body.traverse(b=>{if(!b.isBone)return;const fp=f.get(b.parent)??1,fb=inHead(b)?fp:SWELL[b.name]??fp;f.set(b,fb);
      if(Math.abs(fb/fp-1)>1e-3)swell.push({b,s:fb/fp,base:b.scale.clone()});
      // the head is its own model with its own copies of the neck bones (enemies.spawn): same phase for both copies
      if(WRITHE[b.name]&&!b.userData.animationAnchor)writhe.push({b,amp:WRITHE[b.name],base:new THREE.Quaternion(),set:null,p:phase[b.name]??=[Math.random()*7,Math.random()*7]});});
    const ankles=['j_ankle_le','j_ankle_ri'].map(n=>body.getObjectByName(n)).filter(Boolean);
    z.root.updateMatrixWorld(true);
    const ankleY=()=>ankles.reduce((a,b)=>a+b.getWorldPosition(v3).y,0)/(ankles.length||1);
    const up=session.weapon.upgraded;
    cooking.push({z,t:0,D:up?.8+Math.random()*.5:1.1+Math.random()*.8,swell,writhe,ankles,ankleY,ground:ankles.length?ankleY():0,dir:forward.clone().setY(0).normalize(),steam:0});
  }
  function unswell(c){for(const s of c.swell)s.b.scale.copy(s.base);for(const w of c.writhe)if(w.set)w.b.quaternion.copy(w.base);}
  function burst(c){
    const z=c.z;unswell(c);z.root.updateMatrixWorld(true);
    const chest=(z.root.children[0].getObjectByName('j_spine4')??z.root).getWorldPosition(new THREE.Vector3()),fx=window.kino?.fx;
    if(performance.now()-dingAt>150){dingAt=performance.now();audio.play('moon/wpn/microwave/rifle/microwave_ding',.45);audio.play('moon/fly/gibs/epic/fly_gib_0'+(Math.random()*3|0),.85);}
    if(fx){fx.blood?.([chest.x,chest.y,chest.z],1.5);fx.blood?.([chest.x,chest.y+12,chest.z],1.2);
      for(let i=0;i<4;i++)fx.emit?.({key:'cloud',at:chest.clone().add(fx.jitter(10)),vel:fx.jitter(90).addScaledVector(c.dir,40),size:[14,Math.random()*20+40],life:.8+Math.random()*.5,fade:[.03,.7],color:0x7a0c08,opacity:.85,gravity:-60,drag:2.5,spin:Math.random()-.5});
      fx.emit?.({key:'smoke',at:chest.clone(),vel:new THREE.Vector3(0,25,0),size:[20,70],life:1.2,fade:[.05,.8],color:0xd8dde0,opacity:.4,drag:2});}
    window.kino?.dismemberment?.burst?.(z,c.dir);   // arms, legs and head fly off (BO1's gib models)
    z.root.visible=false;z.life=Math.min(z.life,.05);
  }
  let lastShots=session.shots;
  host.on('update',dt=>{
    if(session.shots!==lastShots){
      const fired=session.shots>lastShots;lastShots=session.shots;
      if(fired&&current()==='microwavegun_zm'){
        const forward=camera.getWorldDirection(new THREE.Vector3()),range=session.weapon.upgraded?1400:1000;
        for(const z of [...enemies.list]){
          const delta=z.root.position.clone().add(new THREE.Vector3(0,35,0)).sub(camera.position),d=delta.length();
          if(d<range&&delta.normalize().dot(forward)>.78&&world.lineClear(camera.position,enemies.headPosition(z))){enemies.hurt(z,z.health+1,false,false,'wave');if(z.state==='dead')cook(z,forward);}
        }
        if(cookSound){cookSound=false;audio.play('moon/wpn/microwave/rifle/microwave_cooking',.7);}
        const ring=new THREE.Mesh(new THREE.ConeGeometry(60,160,24,1,true),new THREE.MeshBasicMaterial({color:0xbfe8ff,transparent:true,opacity:.35,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
        ring.position.copy(camera.position).addScaledVector(forward,120);ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),forward);scene.add(ring);waves.push({ring,forward,life:.45});
      }
    }
    for(const c of [...cooking]){
      const z=c.z;if(!z.root.parent||z.life<=0){cooking.splice(cooking.indexOf(c),1);continue;}   // evicted by the corpse cap or a reset
      if(!dt)continue;c.t+=dt;const k=Math.min(1,c.t/c.D),e=1-(1-k)*(1-k);
      if(k>=1){burst(c);cooking.splice(cooking.indexOf(c),1);continue;}
      for(const s of c.swell)s.b.scale.copy(s.base).multiplyScalar(1+(s.s-1)*e);
      const amp=.25+.75*k,shake=k>.7?(k-.7)*3:0;
      for(const w of c.writhe){
        if(!w.set||!w.b.quaternion.equals(w.set))w.base.copy(w.b.quaternion);   // the clip sets bones it has; others keep their base
        const a=w.amp*amp;
        eul.set(a*.3*Math.sin(c.t*23+w.p[1])+shake*.08*Math.sin(c.t*61+w.p[0]),a*(.6*Math.sin(c.t*13+w.p[0])+.4*Math.sin(c.t*29+w.p[1])),a*(.6*Math.sin(c.t*11+w.p[1])+.4*Math.sin(c.t*31+w.p[0])));
        w.b.quaternion.copy(w.base).multiply(jit.setFromEuler(eul));(w.set??=new THREE.Quaternion()).copy(w.b.quaternion);
      }
      if(c.ankles.length){z.root.updateMatrixWorld(true);z.root.position.y+=c.ground-c.ankleY();}   // longer legs lift the body, feet stay down
      c.steam-=dt;const fx=window.kino?.fx;
      if(fx?.emit&&c.steam<=0){c.steam=.14-.07*k;const at=z.root.position.clone().add(fx.jitter(10));at.y+=40+Math.random()*25;
        fx.emit({key:'smoke',at,vel:fx.jitter(12).add(new THREE.Vector3(0,35,0)),size:[6,26+20*k],life:.7,fade:[.1,.7],color:0xdfe6ea,opacity:.22+.2*k,drag:1.5});}
    }
    for(const w of [...waves]){w.life-=dt;w.ring.position.addScaledVector(w.forward,dt*1600);w.ring.scale.multiplyScalar(1+dt*3);w.ring.material.opacity=Math.max(0,w.life*.8);
      if(w.life<=0){w.ring.removeFromParent();w.ring.geometry.dispose();w.ring.material.dispose();waves.splice(waves.indexOf(w),1);}}
  });

  // B: combine the Zap Guns into the Wave Gun, or split it back (each keeps its own ammo).
  // The native transitions live on the Zap Gun rig: altDropAnim (dw_2_combo)
  // snaps the guns together, altRaiseAnim (combo_2_dw) pulls them apart.
  const pair={microwavegundw_zm:'microwavegun_zm',microwavegun_zm:'microwavegundw_zm'};
  const {view}=api;let swap=null;
  function exchange(w,next){
    const nd=data.weapons[next],up=w.upgraded?{...nd,...nd.upgrade}:nd;
    const stash={mag:w.mag,reserve:w.reserve};
    // The first swap gives the other form the same share of its ammo as this one has left.
    const cur=session.def,left=(w.mag+w.reserve)/Math.max(1,cur.clipSize+cur.maxAmmo);
    const back=w.other??{mag:up.clipSize,reserve:Math.round(up.maxAmmo*Math.min(1,left))};
    Object.assign(w,{id:next,mag:back.mag,reserve:back.reserve,other:stash});
  }
  // Equip without the normal draw animation, then run `then` on the new rig.
  async function equipInPlace(then){
    try{await api.equipView();if(view?.ready){view.rig.play('idleAnim',true,1,0);view.mode='idle';then?.();}}
    finally{swap=null;}
  }
  // Load the other form while holding one, so the hand-over doesn't blink.
  const warmed=new Set();
  function warm(id){
    if(warmed.has(id))return;warmed.add(id);const d=data.weapons[id];if(!d)return;
    for(const url of [d.model,d.leftModel].filter(Boolean))loadModel(url).catch(()=>{});
    for(const url of Object.values({...d.animations,...(d.leftAnimations??{})}))loadAnimation(url).catch(()=>{});
  }
  const clipTime=key=>view?.rig?.data?.[key]?.duration??0;
  addEventListener('keydown',e=>{
    if(e.code!=='KeyB'||e.repeat||swap||!window.kino.debug.getState().active)return;
    const w=session.weapon,next=pair[w?.id];if(!next||session.busy||session.weaponUnavailable||!view?.ready)return;
    session.cancelReload();
    const nd=data.weapons[next];api.toast(nd.name+' · B to '+(next==='microwavegun_zm'?'split':'combine'),2.5);
    if(next==='microwavegun_zm'&&view.rig.actions.altDropAnim){
      // Combine: play the snap-together on the Zap Guns, then hand over to the Wave Gun.
      const time=clipTime('altDropAnim');
      view.mode='raise';view.aim=0;view.rig.play('altDropAnim',false,1,.08);
      audio.play('moon/wpn/microwave/reload/wpn_micro_rld_join',.8);
      session.fireLeft=Math.max(session.fireLeft,time+.1);swap={w,next,left:time};
    }else{
      // Split: switch to the Zap Guns and play the pull-apart from the combined pose.
      exchange(w,next);swap={w,next,left:Infinity};
      audio.play('moon/wpn/microwave/reload/wpn_micro_rld_separate',.8);
      equipInPlace(()=>{
        if(view.rig.actions.altRaiseAnim){const time=clipTime('altRaiseAnim');view.mode='raise';view.rig.play('altRaiseAnim',false,1,0);session.fireLeft=Math.max(session.fireLeft,time);}
      });
    }
  });
  host.on('update',dt=>{
    if(!swap||swap.left===Infinity)return;
    if(session.weapon!==swap.w||session.busy){swap=null;return;}   // switched weapons or went down mid-combine
    swap.left-=dt;if(swap.left>0)return;
    const {w,next}=swap;swap.left=Infinity;exchange(w,next);
    equipInPlace();
  });
  host.on('update',()=>{const next=pair[current()];if(next)warm(next);});
  host.on('reset',()=>{swap=null;cooking.length=0;});
  // Max Ammo also refills the form you aren't holding.
  const powerup=session.powerup.bind(session);
  session.powerup=(type,...rest)=>{
    const result=powerup(type,...rest);
    if(type==='full_ammo')for(const w of session.inventory){const next=pair[w.id];if(!next||!w.other)continue;const nd=data.weapons[next];w.other.reserve=(w.upgraded?nd.upgrade?.maxAmmo:null)??nd.maxAmmo;}
    return result;
  };
  let hinted=false;host.on('update',()=>{if(!hinted&&pair[current()]){hinted=true;api.toast('Press B to combine / split the Zap Guns',4);}});

  // ---- Death Machine: barrel wind-up and a reload -----------------------------------------
  // The barrels must spin up (about 0.75 s) before it fires, so it isn't instant
  // death on tap. Holding aim (right mouse) spins them too, to pre-spin before a
  // push. Reloading lowers it off screen with belt and latch sounds.
  const DM='minigun_zm',SPIN_UP=.75,SPIN_DOWN=1.1;
  let spin=0,lmb=false,rmb=false,tried=0,loop=null,loopToken=0,barrel=null,bind=null,angle=0,lastReload=0;
  addEventListener('mousedown',e=>{if(e.button===0)lmb=true;if(e.button===2)rmb=true;});
  addEventListener('mouseup',e=>{if(e.button===0)lmb=false;if(e.button===2)rmb=false;});
  addEventListener('blur',()=>{lmb=rmb=false;});
  const fire=session.fire.bind(session);
  session.fire=(...a)=>{if(session.weapon?.id===DM&&!session.attachmentMode){tried=session.time;if(spin<1)return false;}return fire(...a);};
  const cue=k=>Object.keys(audio.manifest).find(x=>x.endsWith(k));
  const SPIN={start:cue('dmachine/plr/wpn_minigun_start_plr')??cue('wpn_minigun_start_plr'),stop:cue('dmachine/plr/wpn_minigun_stop_plr')??cue('wpn_minigun_stop_plr'),loop:cue('wpn_minigun_loop_plr_l')};
  const RELOAD=[[.15,'fly_gear_reload_plr_00'],[.42,'lmg/rpk/reload/fly_rpk_mag_out'],[.62,'minigun/foley/fly_minigun_up'],[1.35,'lmg/hk21/reload/fly_hk21_mag_in'],[1.8,'lmg/rpk/reload/fly_rpk_futz'],[2.25,'lmg/hk21/reload/fly_hk21_pull'],[2.5,'lmg/hk21/reload/fly_hk21_release'],[2.75,'fly_gear_reload_plr_01']].map(([t,k])=>[t,cue(k)]).filter(([,k])=>k);
  function startLoop(){if(loop||!SPIN.loop||!audio.ctx||!audio.enabled)return;const token=++loopToken;loop='pending';audio.native(SPIN.loop,.35,true).then(src=>{if(token!==loopToken)src.stop();else loop=src;}).catch(()=>{loop=null;});}
  function stopLoop(){loopToken++;if(loop&&loop!=='pending')try{loop.stop();}catch{}loop=null;}
  host.on('reset',()=>{spin=0;stopLoop();});
  host.on('update',dt=>{
    if(!dt)return;
    const on=session.weapon?.id===DM&&!session.weaponUnavailable;
    if(!on){if(spin>0){spin=0;stopLoop();}barrel=null;return;}
    const reloading=session.reloadLeft>0,held=!reloading&&!session.busy&&(lmb||rmb||session.time-tried<.1);
    const before=spin;spin=held?Math.min(1,spin+dt/(session.weapon.upgraded?SPIN_UP*.6:SPIN_UP)):Math.max(0,spin-dt/SPIN_DOWN);
    if(before===0&&spin>0&&SPIN.start)audio.play(SPIN.start,.6);
    if(held&&spin>.5)startLoop();else if(loop){stopLoop();if(before>.5&&SPIN.stop)audio.play(SPIN.stop,.6);}
    // barrels: spin the j_barrel bone on top of the animation
    const root=api.view?.root;if(root&&(!barrel||!root.getObjectById(barrel.id))){barrel=root.getObjectByName('j_barrel');bind=barrel?.quaternion.clone();}
    if(barrel){angle+=dt*spin*spin*40;barrel.quaternion.copy(bind).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),angle));}
    // reload: lower it off screen and back, with sounds along the way
    if(reloading){
      const dur=session.reloadDuration||3,t=dur-session.reloadLeft;
      if(session.reloadSerial!==lastReload){lastReload=session.reloadSerial;session.reloadCues=RELOAD.slice();}
      while(session.reloadCues?.length&&session.reloadCues[0][0]<=t)audio.play(session.reloadCues.shift()[1],.65);
      const down=Math.min(1,t/.4,(dur-t)/.45),e=down*down*(3-2*down),P=api.view.pivot;
      P.position.y-=18*e;P.position.z+=4*e;P.rotation.x-=.6*e;
    }
  });
}
