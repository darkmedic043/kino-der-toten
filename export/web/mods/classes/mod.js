// Classes in game: the selected class earns its own XP (kills, headshots,
// rounds), its skill trees apply passives, and Z uses its action skill.
// The Engineer's action skill is a deployable Sentry Turret (BO1's auto
// turret model) whose augments come from the trees. Each tree has its own
// action skill (classes.js loadout): the Engineer's drone and mortar are in
// engineer.js, the Fortifier's wall, snare and nest in fortifier.js. Data: classes.json,
// rules: classes.js, menu UI: tree-view.js.
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { zombieHealth } from '../../rules.js';
import { binds } from '../../settings.js';
import { loadClasses, loadClassProfile, saveClassProfile, classById, grantClassXp, xpToNext, stats as treeStats, actionStats, actionOf } from './classes.js';
import { cloudReady } from '../../profile.js';
import { setupFortifier } from './fortifier.js';
import { setupEngineer } from './engineer.js';

const up=new THREE.Vector3(0,1,0);

export default async function setup(api){
  const {host,session,data,scene,camera,player,enemies,world,audio,features}=api;
  await cloudReady;
  const cfg=await loadClasses();
  let prof=loadClassProfile(cfg);
  const cls=classById(cfg,prof.selected)??cfg.classes[0];if(!cls)return;
  const state=()=>prof.classes[cls.id];
  const act=actionOf(cls,state());   // the equipped action skill (its tree's), fixed for this game
  let S=treeStats(cls,state()),A=actionStats(cls,state());
  const refresh=()=>{S=treeStats(cls,state());A=actionStats(cls,state());};
  // the menu may have changed points in another tab
  // xp/level are earned here; points are spent in the menu: merge the two
  const merged=()=>{const fresh=loadClassProfile(cfg),mine=state(),theirs=fresh.classes[cls.id];
    if(mine.level>theirs.level||mine.level===theirs.level&&mine.xp>theirs.xp){theirs.level=mine.level;theirs.xp=mine.xp;}return fresh;};
  addEventListener('focus',()=>{prof=merged();refresh();hud();});

  // ---- XP -------------------------------------------------------------------------------
  let saveTimer=null;
  const save=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>{prof=merged();saveClassProfile(prof);refresh();},800);};
  function gain(n){
    const ups=grantClassXp(cfg,state(),n);
    if(ups){audio.play('buy',.5);api.announce?.(cls.name.toUpperCase()+' LEVEL '+state().level,'+'+ups+' SKILL POINT'+(ups>1?'S':''),2.5);}
    save();hud();
  }
  host.on('kill',e=>{if(!e.remote)gain(cfg.xp.kill+(e.head?cfg.xp.headshot:0));});   // turret kills included
  let lastRound=session.round;
  host.on('update',()=>{if(session.round>lastRound){lastRound=session.round;gain(cfg.xp.round);onRound();}else if(session.round<lastRound)lastRound=session.round;});
  addEventListener('beforeunload',()=>{clearTimeout(saveTimer);saveClassProfile(merged());});

  // ---- passives ---------------------------------------------------------------------------
  const turretUp=()=>turrets.length>0;
  let lastBlast={t:-9,at:new THREE.Vector3()};
  host.on('effect',e=>{if(e.count>=12)lastBlast={t:session.time,at:e.position.clone()};});
  host.on('beforeDamage',e=>{
    let k=1-(S['player.armor']??0);
    if(nearAbility())k*=1-Math.min(.6,S['player.armorNear']??0);
    if(session.time-lastBlast.t<.15&&lastBlast.at.distanceTo(camera.position)<320)k*=1-Math.min(.9,S['player.blastResist']??0);
    e.amount*=Math.max(.1,k);
  });
  host.on('beforePoints',e=>{if(e.amount>0)e.amount=Math.round(e.amount*(1+(S['player.points']??0)));});
  host.on('beforeEnemyDamage',e=>{
    if(e.melee)e.amount*=1+(S['player.melee']??0);
    if(e.cause==='explosion'){e.amount*=1+(S['player.explosive']??0);
      if(e.enemy&&e.amount>=e.enemy.health&&Math.random()<(S['player.chainBlast']??0)){const at=e.enemy.root.position.clone();setTimeout(()=>blast(at,160,.5),120);}}
  });
  const reload=session.reload.bind(session);
  session.reload=(...a)=>{const r=reload(...a);const m=(1-Math.min(.6,S['player.reload']??0))*(nearAbility()?1-Math.min(.5,S['player.reloadNear']??0):1);if(r&&m<1){session.reloadLeft*=m;session.reloadDuration*=m;}return r;};
  function onRound(){
    const n=Math.round(S['player.grenades']??0);if(n)session.grenades=Math.min(4+n,session.grenades+n);
    // Field Repairs: hits back on a standing fortification, otherwise seconds off the cooldown
    const r=S['ability.repair'];if(r){if(other?.repair&&other.up())other.repair(r);else cooldown=Math.max(0,cooldown-r);}
  }

  // ---- the Sentry Turret --------------------------------------------------------------------
  const model=await loadModel('models/weapon_zombie_auto_turret.glb').catch(()=>null);
  const turrets=[];let cooldown=0;
  const tracerMat=new THREE.LineBasicMaterial({color:0xffe2a0,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false});
  const tracers=[];
  function tracer(a,b){const g=new THREE.BufferGeometry().setFromPoints([a,b]);const l=new THREE.Line(g,tracerMat.clone());scene.add(l);tracers.push({l,t:.06});}
  function blast(at,radius,healthFrac){
    window.kino.fx?.explosion?.([at.x,at.y,at.z],radius/260);audio.play('explosion',.6);
    const dmg=zombieHealth(session.round,data.rules)*healthFrac;
    for(const z of [...enemies.list]){const d=z.root.position.distanceTo(at);if(d<radius&&world.lineClear(at.clone().addScaledVector(up,20),z.root.position.clone().addScaledVector(up,30)))enemies.hurt(z,dmg*(1-.5*d/radius),false,false,'explosion');}
  }
  function deploy(){
    const st=api.getState();
    if(!st.active||cooldown>0||session.busy||session.phase==='reviving'||!model){if(cooldown>0)api.toast?.(`${act.name} ready in ${Math.ceil(cooldown)}s`,1.2);return;}
    const fwd=camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize(),side=new THREE.Vector3(-fwd.z,0,fwd.x),feet=player.getFeetPosition();
    const spots=A.count>1?[side.clone().multiplyScalar(-45),side.clone().multiplyScalar(45)]:[new THREE.Vector3()];
    for(const off of spots){
      let at=feet.clone().addScaledVector(fwd,70).add(off);
      if(!world.lineClear(feet.clone().addScaledVector(up,30),at.clone().addScaledVector(up,30)))at=feet.clone().add(off.multiplyScalar(.5));
      const ground=world.raycast(new THREE.Ray(at.clone().addScaledVector(up,60),up.clone().negate()),0,200);if(ground)at.y=ground.point?.y??ground.position?.y??at.y;
      const mesh=cloneSkinned(model);/* skinned: a plain clone renders nothing */mesh.position.copy(at);mesh.scale.setScalar(.01);mesh.rotation.y=Math.atan2(-fwd.z,fwd.x);   // the barrel (tag_flash) points down +X
      mesh.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});scene.add(mesh);
      turrets.push({mesh,at,muzzle:at.clone().addScaledVector(up,30),life:A.duration,age:0,fire:.4,yaw:mesh.rotation.y,baseYaw:mesh.rotation.y,pitch:0,grenade:S['turret.grenade']??0});
    }
    audio.play('buy',.6);window.kino.fx?.knockback?.(feet.clone().addScaledVector(fwd,70));
    startCooldown(A.cooldown);hud();
  }
  function remove(t){
    if(S['cap.finale'])blast(t.at.clone().addScaledVector(up,20),280,.9);   // Final Payload: the turret self-destructs
    t.mesh.removeFromParent();turrets.splice(turrets.indexOf(t),1);
  }
  // The Fortifier's Barricade Wall instead of the turret
  // The other action skills: the Fortifier's (wall, snare, nest) and the Engineer's drone and mortar
  // ---- generic ability effects (passives work with every action skill) ----------------------------
  // The cooldown starts shorter with Salvage, and kills during the ability (Recycler) are banked
  // for skills whose cooldown only starts when they end.
  let banked=0;
  function startCooldown(v){cooldown=Math.max(0,v*(1-Math.min(.6,S['ability.salvage']??0))-banked);banked=0;}
  // Every skill reports each zombie it damages here: slow, mark, toll points, kill cooldown cuts.
  function onHit(z,killed){
    if(S['ability.toll'])session.addPoints?.(Math.round(S['ability.toll']));
    if(killed){const c=S['ability.killCdr']??0;if(c){if(actionUp())banked+=c;else cooldown=Math.max(0,cooldown-c);}
      if(S['ability.killHeal'])session.health=Math.min(session.maxHealth??150,session.health+S['ability.killHeal']);
      if(S['ability.killPoints'])session.addPoints?.(Math.round(S['ability.killPoints']));
      return;}
    if(S['ability.stun']&&Math.random()<S['ability.stun'])staggered.set(z,{until:session.time+.6,at:z.root.position.clone()});
    if(S['ability.mark'])z.abilityMark=session.time+3;
    if(A.slow&&!slowed.has(z)){z.turretSlowK=1-A.slow;z.speed*=z.turretSlowK;slowed.add(z);}
    if(slowed.has(z))z.turretSlowUntil=session.time+1.5;
  }
  // Spotter: marked zombies take more damage from the player
  host.on('beforeEnemyDamage',e=>{const m=S['ability.mark'];if(m&&e.enemy?.abilityMark>session.time&&!['turret','explosion','fortify'].includes(e.cause))e.amount*=1+m;
    if(!e.melee&&!['turret','explosion','fortify'].includes(e.cause)&&nearAbility())e.amount*=1+(S['player.damageNear']??0);});
  const NEAR=260;
  function nearAbility(){const f=player.getFeetPosition();return turrets.some(t=>t.at.distanceTo(f)<NEAR)||!!other?.near?.(f,NEAR);}
  const actx={api,act,S:()=>S,A:()=>A,blast,hud:()=>hud(),onHit,getCooldown:()=>cooldown,setCooldown:v=>startCooldown(v)};
  const fort=['wall','snare','nest'].includes(act.id)?setupFortifier(actx):null;
  const eng=['drone','mortar'].includes(act.id)?setupEngineer(actx):null;
  const other=fort??eng;
  const actionUp=()=>turrets.length>0||!!other?.up();
  addEventListener('keydown',e=>{if(e.code==='KeyZ'&&!e.repeat)(other?other.deploy:deploy)();});   // game-menu re-sends a rebound key as the default KeyZ
  // Lockdown augment: zombies go for the turret for its first seconds
  const lure=enemies.lureTarget?.bind(enemies);
  enemies.lureTarget=z=>{const t=turrets.find(t=>t.age<(S['turret.lure']??0));if(t&&z.kind!=='dog'&&z.root.position.distanceTo(t.at)<1536)return t.at;return lure?lure(z):null;};

  const slowed=new Set(),staggered=new Map();   // staggered zombies are pinned in place for 0.6 s
  host.on('update',dt=>{
    if(!dt)return;
    if(cooldown>0&&!actionUp()){cooldown=Math.max(0,cooldown-dt);if(cooldown===0){audio.play('buy',.35);api.toast?.(act.name+' ready',1.2);}}
    for(let i=tracers.length-1;i>=0;i--){const t=tracers[i];t.t-=dt;t.l.material.opacity=Math.max(0,t.t/.06);if(t.t<=0){t.l.removeFromParent();t.l.geometry.dispose();t.l.material.dispose();tracers.splice(i,1);}}
    for(const [z,s] of staggered){if(!enemies.list.includes(z)||session.time>s.until){staggered.delete(z);continue;}z.root.position.x=s.at.x;z.root.position.z=s.at.z;z.stuck=0;}
    for(const z of [...slowed]){if(!enemies.list.includes(z)||session.time>z.turretSlowUntil){if(enemies.list.includes(z))z.speed/=z.turretSlowK;slowed.delete(z);}}
    for(const z of enemies.list)if(z.turretBurn&&session.time<z.turretBurn.until&&(z.turretBurn.tick-=dt)<=0){z.turretBurn.tick=.5;enemies.hurt(z,z.turretBurn.dps*.5,false,false,'turret',false);window.kino.fx?.burn?.(z.root.position.clone().addScaledVector(up,40));}
    const feet=player.getFeetPosition();
    // World-space yaw (about up, relative to the base) and pitch (about the gun's right axis), turned
    // into the gun mount's local frame on top of its rest pose. mg01 carries the gun (skinned to
    // tag_aim_animated under it); the tripod is skinned to bi_base and stays put. (tag_aim is an
    // unskinned tag: turning it moved nothing.)
    function aimGun(t){
      t.aim??=t.mesh.getObjectByName('mg01');if(!t.aim)return;t.aimRest??=t.aim.quaternion.clone();
      t.aim.quaternion.copy(t.aimRest);t.mesh.updateMatrixWorld(true);
      const P=t.aim.parent.getWorldQuaternion(new THREE.Quaternion()),fwd=new THREE.Vector3(Math.cos(t.yaw),0,-Math.sin(t.yaw)),right=new THREE.Vector3().crossVectors(fwd,up).normalize();
      const R=new THREE.Quaternion().setFromAxisAngle(right,t.pitch).multiply(new THREE.Quaternion().setFromAxisAngle(up,t.yaw-t.baseYaw));
      t.aim.quaternion.premultiply(P.clone().invert().multiply(R).multiply(P));
    }
    for(const t of [...turrets]){
      t.age+=dt;t.life-=dt;t.mesh.scale.setScalar(Math.min(1,t.age/.3));
      if(t.life<=0){remove(t);if(!turrets.length)hud();continue;}
      if(S['turret.heal']&&feet.distanceTo(t.at)<220)session.health=Math.min(session.maxHealth??150,session.health+20*dt);
      const targets=enemies.list.filter(z=>z.root.position.distanceTo(t.at)<A.range&&world.lineClear(t.muzzle,z.root.position.clone().addScaledVector(up,35)))
        .sort((a,b)=>a.root.position.distanceToSquared(t.at)-b.root.position.distanceToSquared(t.at));
      const z=targets[0];if(!z)continue;
      const to=z.root.position.clone().addScaledVector(up,35),want=Math.atan2(-(to.z-t.at.z),to.x-t.at.x);
      let d=want-t.yaw;d=Math.atan2(Math.sin(d),Math.cos(d));t.yaw+=Math.sign(d)*Math.min(Math.abs(d),dt*9);
      // Only the gun turns; the base keeps the yaw it was placed with.
      const wantPitch=Math.atan2(to.y-t.muzzle.y,Math.hypot(to.x-t.at.x,to.z-t.at.z));t.pitch+=(wantPitch-t.pitch)*Math.min(1,dt*8);
      aimGun(t);
      if(Math.abs(d)>.25)continue;
      if(t.grenade&&(t.grenadeT=(t.grenadeT??t.grenade)-dt)<=0){t.grenadeT=t.grenade;blast(z.root.position.clone(),200,.6*A.dmgMul);}
      if((t.fire-=dt)>0)continue;t.fire=1/A.rate;
      const base=zombieHealth(session.round,data.rules)*A.damage+20;
      const fresh=z.health>zombieHealth(session.round,data.rules)*.5?1+(S['turret.fresh']??0):1;
      // from the model's own muzzle bone, so tracers leave the barrel whatever its orientation
      t.flash??=t.mesh.getObjectByName('tag_flash');t.mesh.updateMatrixWorld(true);
      const muzzle=t.flash?t.flash.getWorldPosition(new THREE.Vector3()):t.muzzle.clone();
      tracer(muzzle,to);audio.weapon('shot',data.weapons.hk21_zm);window.kino.fx?.muzzle?.(muzzle);
      hit(z,base*fresh,t);
      if(S['turret.chain']){let from=to;for(const n of targets.filter(o=>o!==z&&o.root.position.distanceTo(z.root.position)<240).slice(0,S['turret.chain'])){const c=n.root.position.clone().addScaledVector(up,35);tracer(from,c);from=c;hit(n,base*.5,t);}}   // Arc Welder
    }
  });
  function hit(z,dmg,t){
    if(S['turret.burn'])z.turretBurn={until:session.time+3,dps:dmg*.6,tick:z.turretBurn?.tick??.5};
    const alive=enemies.list.includes(z);enemies.hurt(z,dmg,false,false,'turret',false);
    const killed=alive&&!enemies.list.includes(z);if(alive)onHit(z,killed);
    if(killed){session.addPoints?.(50);if(t&&S['cap.killExtend'])t.life+=S['cap.killExtend'];}
  }
  host.on('reset',()=>{for(const t of [...turrets])t.mesh.removeFromParent();turrets.length=0;cooldown=0;banked=0;slowed.clear();staggered.clear();lastRound=session.round;hud();});

  // ---- HUD: the action skill icon, its cooldown and the class level ------------------------
  const ICON_PATHS={"turret": "M5 20h14M8 20l2-6h4l2 6M12 14V9M7 9h10v-3H7zM17 7.5h4", "wall": "M3 6h18v12H3zM3 10h18M3 14h18M9 6v4M15 10v4M9 14v4", "drone": "M9 10h6v4H9zM4 6h4M16 6h4M4 18h4M16 18h4M6 6l3 4M18 6l-3 4M6 18l3-4M18 18l-3-4", "mortar": "M5 20h14M8 20l3-10h2l3 10M10 7l2-4 2 4M12 3v-1", "snare": "M3 15c2-3 4 3 6 0s4 3 6 0 4 3 6 0M3 10c2-3 4 3 6 0s4 3 6 0 4 3 6 0M6 6v12M18 6v12", "nest": "M4 19V11a8 8 0 0 1 16 0v8M4 15h4M16 15h4M4 11h4M16 11h4M8 7l2 3M16 7l-2 3"};
  const ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="'+(ICON_PATHS[act.icon]??ICON_PATHS.turret)+'"/></svg>';
  const style=document.createElement('style');style.textContent=`
    #class-skill{position:relative;width:52px;height:58px;color:${cls.color};pointer-events:none;margin-right:6px}
    #class-skill .hex{position:absolute;inset:0;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);background:${cls.color}}
    #class-skill .hex::after{content:'';position:absolute;inset:2px;clip-path:inherit;background:#0d0d0de6}
    #class-skill .cd{position:absolute;inset:2px;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);background:conic-gradient(#000c var(--p),transparent 0)}
    #class-skill svg{position:absolute;left:13px;top:15px;width:26px;height:26px}
    #class-skill.cooling{color:#8b857a}#class-skill.cooling .hex{background:#5b574f}
    #class-skill.active .hex{box-shadow:0 0 14px ${cls.color};background:#fff}
    #class-skill b{position:absolute;left:0;right:0;top:18px;text-align:center;font:700 14px/1 Arial,sans-serif;color:#eee;text-shadow:0 1px 3px #000}
    #class-skill kbd{position:absolute;left:50%;top:-11px;transform:translateX(-50%);font:600 8px/1 Arial,sans-serif;letter-spacing:1px;color:#b5ac98aa}
    #class-skill small{position:absolute;left:50%;bottom:-12px;transform:translateX(-50%);white-space:nowrap;font:600 8px/1 Arial,sans-serif;letter-spacing:1px;color:${cls.color}aa}
    body.menu-open #class-skill{visibility:hidden}
    #class-skill.free{position:fixed;right:250px;bottom:24px;z-index:3}`;
  document.head.append(style);
  const el=document.createElement('div');el.id='class-skill';el.innerHTML=`<span class="hex"></span><span class="cd"></span>${ICON}<b></b><kbd></kbd><small></small>`;
  const place=()=>{const cluster=document.getElementById('equip-hud');if(cluster){cluster.prepend(el);el.classList.remove('free');}else{document.body.append(el);el.classList.add('free');}};
  place();setTimeout(place,500);
  function hud(){
    const cool=cooldown>0&&!actionUp();
    el.classList.toggle('cooling',cool);el.classList.toggle('active',actionUp());
    el.style.setProperty('--p',cool?Math.round(cooldown/A.cooldown*100)+'%':'0%');
    el.querySelector('.cd').style.background=cool?`conic-gradient(#000c ${Math.round(cooldown/A.cooldown*360)}deg,transparent 0)`:'none';
    const num=cool?Math.ceil(cooldown):other?.up()?other.left():turrets.length?Math.ceil(Math.max(...turrets.map(t=>t.life))):'';
    el.querySelector('b').textContent=num;el.querySelector('svg').style.opacity=num===''?1:.18;
    el.querySelector('kbd').textContent=(binds().ability??'KeyZ').replace(/^Key/,'');
    el.querySelector('small').textContent=`${cls.name.toUpperCase()} ${state().level}`;
  }
  let hudT=0;host.on('update',dt=>{if((hudT-=dt)<=0){hudT=.2;hud();}});
  hud();
  window.kino.classes={get state(){return state();},cls,stats:()=>S,action:()=>A,act,deploy:other?other.deploy:deploy,get cooldown(){return cooldown;},gain,turrets,fort,eng};
}
