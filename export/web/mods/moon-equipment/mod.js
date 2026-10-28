// The Moon's tactical wonder weapons in Kino: the Gersh Device (black hole
// bomb) and the QED (Quantum Entanglement Device). Both come from the Mystery
// Box, 3 per pickup, and share the tactical slot with Monkey Bombs (taking one
// replaces the other), thrown with X. Models, throw animations and behaviour
// come from the Moon port (moon/combat-data.json, moon-features.js):
// - Gersh: a black hole for 10 s that drags zombies in and destroys them;
//   walking into it teleports you somewhere else on the map.
// - QED: a random effect where it lands (11 outcomes, good and bad, as in BO1).
// Research augments (window.kino.equipAug, research mod): gersch.* (reach, long, collapse, twin, slow, points, safe, extra)
// and qed.* (reroll, blast, double, refund, jackpot, stable, pure, extra).
import * as THREE from 'three';
import { loadModel } from '../../animation.js';

const IDS=['zombie_black_hole_bomb','zombie_quantum_bomb'];
const up=new THREE.Vector3(0,1,0);

export async function prepare(data){
  const moon=await fetch(new URL('moon/combat-data.json',document.baseURI)).then(r=>r.json());
  data.equipment??={};
  for(const id of IDS)data.equipment[id]={...moon.equipment[id],tactical:true};
  data.boxPool=[...new Set([...(data.boxPool??[]),...IDS])];
}

export default async function setup(api){
  const {data,session,world,scene,camera,player,enemies,audio,view,host,mysteryBox}=api;
  if(!data.equipment?.zombie_black_hole_bomb)return;
  // the box needs a model per item to cycle through and show
  if(mysteryBox)for(const id of IDS)mysteryBox.models[id]=await loadModel(data.equipment[id].worldModel);
  const world_=Object.fromEntries(await Promise.all(IDS.map(async id=>[id,await loadModel(data.equipment[id].worldModel)])));

  // ---- the tactical slot ----------------------------------------------------------------
  const aug=k=>window.kino.equipAug?.(k)??0,efx=()=>window.kino.equipFx;
  const maxOf=id=>3+aug(id==='zombie_black_hole_bomb'?'gersch.extra':'qed.extra')+(window.kino.reaperPerks?.tacticalBonus?.()??0);   // Extra Device / Extra QED, Dam-A-Nade
  const tac={id:null,count:0};
  tac.max=()=>tac.id?maxOf(tac.id):0;
  window.kino.tactical=tac;
  tac.give=(id,quiet)=>{if(!IDS.includes(id))return false;tac.id=id;tac.count=maxOf(id);session.monkeys=0;session.monkeysOwned=false;if(!quiet)api.toast(`${data.equipment[id].name} · X to throw`,3);hud();return true;};
  const give=id=>{tac.id=id;tac.count=maxOf(id);session.monkeys=0;session.monkeysOwned=false;api.toast(`${data.equipment[id].name} · X to throw`,3);hud();};
  // the box hands out its prize with session.giveWeapon; these aren't guns
  const giveWeapon=session.giveWeapon.bind(session);
  session.giveWeapon=(id,...rest)=>{if(IDS.includes(id)){give(id);return true;}return giveWeapon(id,...rest);};
  const giveMonkeys=session.giveMonkeys?.bind(session);
  if(giveMonkeys)session.giveMonkeys=(...a)=>{const r=giveMonkeys(...a);if(r){tac.id=null;tac.count=0;hud();}return r;};
  // Max Ammo refills them, a new game clears them
  const powerup=session.powerup?.bind(session);
  if(powerup)session.powerup=(type,...rest)=>{if(type==='full_ammo'&&tac.id)tac.count=Math.max(tac.count,maxOf(tac.id));hud();return powerup(type,...rest);};
  host.on('reset',()=>{tac.id=null;tac.count=0;hud();});

  // Shown by the hud mod's equipment cluster (window.kino.tactical).
  function hud(){}

  // ---- throwing ----------------------------------------------------------------------------
  let throwing=false;
  addEventListener('keydown',e=>{
    if(e.code!=='KeyX'||e.repeat||!tac.id||window.kino.throwables)return;   // the throwables mod holds and throws when loaded
    e.stopImmediatePropagation();throwIt();
  },true);
  async function throwIt(){
    const st=api.getState();
    if(throwing||!st.active||tac.count<=0||session.busy||session.phase==='reviving')return;
    throwing=true;tac.count--;hud();session.cancelReload?.();session.equipmentLeft=1.1;
    const def=data.equipment[tac.id],id=tac.id;
    try{
      await view.equip(def);view.rig?.play('fireAnim',false,1,.05);
      setTimeout(()=>launch(id),380);
      await new Promise(r=>setTimeout(r,820));
    }catch(err){console.warn('[moon-equipment]',err);launch(id);}
    finally{throwing=false;await api.equipView?.();if(tac.count<=0){tac.id=null;hud();}}
  }
  const flying=[];
  tac.launch=id=>launch(id);
  function launch(id){
    const mesh=world_[id].clone(true);mesh.position.copy(camera.position);scene.add(mesh);
    const dir=camera.getWorldDirection(new THREE.Vector3());
    flying.push({id,mesh,v:dir.multiplyScalar(520).addScaledVector(up,170),settled:0,spin:new THREE.Vector3(Math.random()*8,Math.random()*8,Math.random()*8)});
  }

  // ---- effects ---------------------------------------------------------------------------------
  const holes=[];
  const glow=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),r=g.createRadialGradient(64,64,0,64,64,64);
    r.addColorStop(0,'rgba(0,0,0,1)');r.addColorStop(.32,'rgba(10,0,25,1)');r.addColorStop(.42,'rgba(170,110,255,.95)');r.addColorStop(.6,'rgba(110,60,220,.35)');r.addColorStop(1,'rgba(60,20,160,0)');
    g.fillStyle=r;g.fillRect(0,0,128,128);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
  function blackHole(at,twin=false){
    const dur=10+aug('gersch.long');   // Stable Orbit
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,transparent:true,depthWrite:false}));sp.position.copy(at).addScaledVector(up,30);sp.scale.setScalar(10);scene.add(sp);
    // Lit through the lighting mod's fixed pool: adding a THREE light to the scene
    // recompiles every lit shader (a multi-second freeze), and again on removal.
    const light={position:sp.position.clone(),color:new THREE.Color(0x9a66ff),intensity:4,radius:420,kind:'solid',dynamic:true,cap:2000,weight:0};
    window.kino.lighting?.sources.push(light);
    window.kino.fx?.gersh?.(sp.position,dur);
    holes.push({sp,light,life:dur,dur,teleported:false});audio.play('teleport');
    if(!twin&&aug('gersch.twin')){   // Twin Singularity: a second hole beside the first
      const a=Math.random()*Math.PI*2,p=at.clone().add(new THREE.Vector3(Math.cos(a)*170,0,Math.sin(a)*170)),q=world.closest?.(p,{x:80,y:120,z:80})??p;
      if(world.lineClear(at.clone().addScaledVector(up,30),q.clone().addScaledVector(up,30)))blackHole(q.clone(),true);}
  }
  // somewhere else in the active part of the map: the inside spot of a barricade window
  // safe (Safe Passage): the spot farthest from any zombie, a full magazine and 3 s untouchable
  function teleportPlayer(safe=false){
    const feet=player.getFeetPosition(),spots=(world.spawnBarriers?.(session)??world.barriers??[]).map(b=>b.inside).filter(p=>p&&p.distanceTo(feet)>300);
    const away=p=>Math.min(Infinity,...enemies.list.map(z=>z.root.position.distanceTo(p)));
    const p=safe?spots.sort((a,b)=>away(b)-away(a))[0]:spots[Math.floor(Math.random()*spots.length)];if(!p)return;
    const q=world.closest?.(p.clone(),{x:40,y:60,z:40})??p;player.setPosition(q.clone().add(new THREE.Vector3(0,3,0)));
    api.announce?.('Gersh Device',safe?'SAFE PASSAGE':'TELEPORTED',2);
    if(safe){const w=session.weapon,d=w&&data.weapons[w.id];if(d){const clip=w.upgraded?d.upgrade?.clipSize??d.clipSize:d.clipSize;w.mag=Math.max(w.mag,clip);}
      session.effects.invulnerable=Math.max(session.effects.invulnerable??0,session.time+aug('gersch.safe'));}
  }
  function qed(at){
    if(window.kino.fx?.qed)window.kino.fx.qed(at.clone().addScaledVector(up,20));else effect(at,0x83c7ff);audio.play('teleport');
    const say=t=>api.toast('QED: '+t,3),near=r=>enemies.list.filter(z=>z.root.position.distanceTo(at)<r);
    const f=efx();if(f&&aug('qed.blast'))for(const z of f.near(at,300))f.pct(z,aug('qed.blast'));   // Quantum Blast
    for(let n=0;n<(aug('qed.double')?2:1);n++)qedRoll(at,say,near);   // Superposition
  }
  const BAD=[6,7,8,9];
  function qedRoll(at,say,near){
    const pick=()=>{let r=Math.floor(Math.random()*11);if(aug('qed.stable'))while(r===7||r===8)r=Math.floor(Math.random()*11);return r;};
    let roll=pick();
    if(aug('qed.pure'))while(BAD.includes(roll))roll=pick();   // Collapse the Wave
    else if(BAD.includes(roll)&&Math.random()<aug('qed.reroll'))roll=pick();   // Loaded Dice
    const jack=1+aug('qed.jackpot');
    if(BAD.includes(roll)&&aug('qed.refund')){tac.id='zombie_quantum_bomb';tac.count=Math.min(tac.count+1,maxOf(tac.id));}   // Entanglement
    if(roll===0){window.kino.debug.collectPowerup?.('full_ammo');say('Max Ammo');}
    else if(roll===1){for(const z of near(650))enemies.hurt(z,z.health,false,false,'explosion');say('Quantum explosion');}
    else if(roll===2){const all=Object.keys(data.perkDrinks??{}).filter(p=>!session.perks.has(p));const p=all[Math.floor(Math.random()*all.length)];if(p){session.perks.add(p);session.health=session.maxHealth;if(jack>1)refillAmmo();say('Free '+(data.perkDrinks[p].name??'perk'));}else say('Nothing happened');}
    else if(roll===3){teleportPlayer();say('Teleportation');}
    else if(roll===4){session.points+=1000*jack;say(`+${1000*jack} points`);}
    else if(roll===5){window.kino.debug.collectPowerup?.('double_points');say('Double Points');}
    else if(roll===6){session.points=Math.max(0,session.points-1000);say('1000 points lost');}
    else if(roll===7){const perks=[...session.perks];if(perks.length){const p=perks[Math.floor(Math.random()*perks.length)];session.perks.delete(p);api.equipView?.();}say('Perk disruption');}
    else if(roll===8){if(session.weapon)session.weapon.mag=0;say('Magazine emptied');}
    else if(roll===9){for(let i=0;i<4;i++){const a=Math.random()*6.28;enemies.spawn?.(at.clone().add(new THREE.Vector3(Math.cos(a)*120,0,Math.sin(a)*120)),null,'zombie');}say('Reinforcements incoming');}
    else{const w=session.weapon,d=w&&data.weapons[w.id];if(d?.upgrade&&!w.upgraded){w.upgraded=true;w.mag=session.def.clipSize;w.reserve=session.def.maxAmmo;api.equipView?.();say('Weapon upgraded');}else{session.points+=500*jack;say(`+${500*jack} points`);}}
  }
  function refillAmmo(){for(const w of session.inventory??[]){const d=data.weapons[w.id];if(!d)continue;const u=w.upgraded?d.upgrade??d:d;w.mag=u.clipSize??w.mag;w.reserve=u.maxAmmo??w.reserve;}}
  const fx=[];
  function effect(at,color){
    const m=new THREE.Mesh(new THREE.SphereGeometry(1,20,12),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.7,depthWrite:false,blending:THREE.AdditiveBlending}));
    m.position.copy(at).addScaledVector(up,20);scene.add(m);fx.push({m,t:0});
  }

  host.on('update',dt=>{
    if(!dt)return;
    // projectiles: arc, bounce once, settle, then go off
    for(const f of [...flying]){
      if(f.settled){f.settled+=dt;if(f.settled>1){flying.splice(flying.indexOf(f),1);scene.remove(f.mesh);(f.id==='zombie_black_hole_bomb'?blackHole:qed)(f.mesh.position.clone());}continue;}
      f.v.y-=650*dt;const step=f.v.clone().multiplyScalar(dt),len=step.length();
      const hit=world.raycast(new THREE.Ray(f.mesh.position.clone(),step.clone().normalize()),0,len+4);
      if(hit){f.mesh.position.copy(hit.point??f.mesh.position).addScaledVector(up,3);
        if(f.v.y<-40&&Math.abs(f.v.y)>Math.hypot(f.v.x,f.v.z)*.5||f.bounced){f.settled=1e-4;f.v.set(0,0,0);}else{f.v.multiplyScalar(-.3);f.v.y=Math.abs(f.v.y);f.bounced=true;}}
      else f.mesh.position.add(step);
      f.mesh.rotation.x+=f.spin.x*dt;f.mesh.rotation.y+=f.spin.y*dt;
    }
    // black holes: grow, pull zombies in, swallow them; teleport the player who walks in
    const feet=player.getFeetPosition();
    for(const h of [...holes]){
      h.life-=dt;const grow=Math.min(1,(h.dur-h.life)/.6),fade=Math.min(1,h.life/.6),s=(90+Math.sin(h.life*9)*8)*grow*fade;
      h.sp.scale.setScalar(Math.max(1,s));h.sp.material.rotation+=dt*3;h.light.weight=grow*fade;
      // zombies walk toward it (to the nearest walkable point; it may hang over a ledge),
      // and anything close is dragged through the air into it, shrinking, and destroyed
      h.walk??=world.closest?.(h.sp.position.clone(),{x:120,y:160,z:120})??h.sp.position.clone();
      const reach=1+aug('gersch.reach'),range=650*reach,pull=220*reach,f=efx();   // Event Horizon
      if(f&&aug('gersch.slow'))for(const z of f.near(h.sp.position,range*2))f.slow(z,aug('gersch.slow'),.3);   // Gravity Well
      for(const z of [...enemies.list]){const d=z.root.position.distanceTo(h.sp.position);if(d>range||z.kind==='dog'&&d>400*reach)continue;
        if(d<pull||z.sucked){
          z.sucked??=z.root.scale.x;z.state='chase';z.repath=1;z.path=[];
          const to=h.sp.position.clone().sub(z.root.position),step=Math.min(to.length(),(160+(pull-Math.min(d,pull))*2.4/reach)*dt);
          z.root.position.addScaledVector(to.normalize(),step);z.root.rotation.y+=dt*6;
          const k=Math.max(.05,Math.min(1,d/pull));z.root.scale.setScalar(z.sucked*k);
          if(d<28&&!host.remoteDamage){z.root.scale.setScalar(z.sucked);enemies.hurt(z,z.health,false,false,'gersh');z.root.visible=false;if(aug('gersch.points'))f?.points(aug('gersch.points'));}
        }else{z.path=[z.root.position.clone(),h.walk.clone()];z.pathIndex=1;z.repath=1;}}
      if(!h.teleported&&feet.distanceTo(h.sp.position)<70){h.teleported=true;teleportPlayer(aug('gersch.safe')>0);}
      if(h.life<=0){if(f&&aug('gersch.collapse')&&!host.remoteDamage)for(const z of f.near(h.sp.position,350))f.pct(z,aug('gersch.collapse'));   // Collapse
        for(const z of enemies.list)if(z.sucked!==undefined){z.root.scale.setScalar(z.sucked);delete z.sucked;}window.kino.fx?.implode?.(h.sp.position);scene.remove(h.sp);h.sp.material.dispose();{const l=window.kino.lighting?.sources,i=l?.indexOf(h.light)??-1;if(i>=0)l.splice(i,1);}holes.splice(holes.indexOf(h),1);}
    }
    for(const e of [...fx]){e.t+=dt;e.m.scale.setScalar(20+e.t*260);e.m.material.opacity=Math.max(0,.7-e.t*1.2);if(e.t>.6){scene.remove(e.m);e.m.geometry.dispose();e.m.material.dispose();fx.splice(fx.indexOf(e),1);}}
  });
}
