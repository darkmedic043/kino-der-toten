// Research in a match (roadmap Phase 5, BO7 style): research XP for the active research, and the equipped perk and ammo
// mod augments. The equipped set is read once when the match starts (and again on a new game), so a match is predictable.
// Perk augments work while you own that perk; ammo mod augments while that mod is on the gun in hand (they edit the mod
// through the ammo-mods events: 'ammoModTune', 'ammoModProc', 'ammoModFired'). Several BO7 augments act on things this
// game doesn't have (armour plates, tactical sprint, elites); research.json describes the version used here.
import * as THREE from 'three';
import { zombieHealth } from '../../rules.js';
import { loadProfile, unlockLvl, cloudReady } from '../../profile.js';
import { loadResearchConfig, loadResearch, saveResearch, grantResearchXp, equippedAugments, researchOpen, costOf } from './research.js';

const up=new THREE.Vector3(0,1,0);

export default async function setup(api){
  const {host,session,enemies,player,data,mod,camera}=api;
  if(!enemies)return;
  await cloudReady;
  const cfg=await loadResearchConfig(mod.url);
  const full=()=>zombieHealth(session.round,data.rules);
  const has=id=>!!session.perks?.has(id);
  const t=()=>session.time;
  const special=z=>z&&z.kind!=='zombie';
  const clipOf=w=>{const d=data.weapons[w?.id];return d?(w.upgraded?d.upgrade?.clipSize??d.clipSize:d.clipSize):0;};
  const maxOf=w=>{const d=data.weapons[w?.id];return d?(w.upgraded?d.upgrade?.maxAmmo??d.maxAmmo:d.maxAmmo):0;};
  const heal=n=>{session.health=Math.min(session.maxHealth,session.health+n);};

  // ---- the equipped augments (locked in at match start) -------------------------------------------------------
  let perkFx={},ammoFx={},list=[];
  function lockIn(){
    perkFx={};ammoFx={};list=equippedAugments(cfg,loadResearch());
    for(const a of list){
      if(a.itemKind==='perk'){const f=perkFx[a.item]??={};for(const [k,v] of Object.entries(a.effects))f[k]=(f[k]??0)+v;}
      else (ammoFx[a.item]??=[]).push(a.effects);
    }
  }
  lockIn();host.on('start',lockIn);
  // a perk augment's number, summed over owned perks
  const stat=k=>{let v=0;for(const [item,f] of Object.entries(perkFx))if(f[k]&&has(item))v+=f[k];return v;};

  // ---- research XP (kept in memory during the match, saved 1.5 s after the last gain, on completion and on unload) --
  const isActive=item=>has(item)||session.weapon?.ammoMod?.id===item;
  let R=loadResearch(),saveT=null;
  host.on('start',()=>{R=loadResearch();});
  function earn(xp){
    if(!R.active||!researchOpen(cfg,unlockLvl(loadProfile())))return;
    const done=grantResearchXp(cfg,R,xp,isActive);
    clearTimeout(saveT);
    if(done){saveResearch(R);
      api.announce?.(done.name,done.mastery?`${done.itemName.toUpperCase()} MASTERED · SECOND MINOR SLOT`:`${done.kind.toUpperCase()} AUGMENT RESEARCHED · ${done.itemName.toUpperCase()}`,3);
      api.toast?.(done.mastery?'Equip a second Minor augment in Armory → Research':'Equip it in Armory → Research · the next one on the track has started',4);}
    else saveT=setTimeout(()=>saveResearch(R),1500);
  }
  addEventListener('beforeunload',()=>{clearTimeout(saveT);saveResearch(R);});
  host.on('kill',e=>{if(!e.remote)earn(cfg.xp.kill+(e.head?cfg.xp.headshot:0));});
  host.on('roundEnd',({round})=>earn(round*cfg.xp.roundPerRound));

  // ---- shared state -------------------------------------------------------------------------------------------------
  const QR='specialty_quickrevive';
  let dyingLeft=3,untouchable=-1,emergencyUsed=false,boosts=[],hitCount=0,lastKillT=-9,slideUsed=false,ramT=0,wallJumps=0,wasFull=true,wasSliding=false;
  const boost=(v,dur)=>{if(v)boosts.push({v,until:t()+dur});};
  const boostNow=()=>{boosts=boosts.filter(b=>b.until>t());return boosts.reduce((a,b)=>a+b.v,0);};
  host.on('reset',()=>{dyingLeft=3;untouchable=-1;emergencyUsed=false;boosts=[];hitCount=0;});
  const ads=()=>!!api.getState?.().input?.ads;

  // ---- you get hit ----------------------------------------------------------------------------------------------------
  host.on('beforeDamage',e=>{
    if(!(e.amount>0))return;
    if(t()<untouchable){e.amount=0;return;}
    let k=1-stat('jug.armor');
    if(stat('jug.turtle')){const z=attacker();if(z){const fwd=camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize(),to=z.root.position.clone().sub(camera.position).setY(0).normalize();k*=fwd.dot(to)<0?1-stat('jug.turtle'):.9;}}
    if(stat('jug.shake')&&Math.random()<stat('jug.shake'))k*=.25;
    if(stat('jug.ironCore')&&session.health<session.maxHealth*.5)k*=1-stat('jug.ironCore');
    if(stat('su.hardTarget')&&player.input?.sprint)k*=1-stat('su.hardTarget');
    if(stat('phd.slideArmor')&&window.kino.movement?.state?.sliding)k*=1-stat('phd.slideArmor');
    e.amount*=Math.max(.1,k);
    if(stat('jug.reactive'))for(const z of [...enemies.list]){const d=z.root.position.clone().sub(camera.position).setY(0);if(d.length()>120)continue;
      z.root.position.addScaledVector(d.normalize(),60);enemies.hurt(z,full()*stat('jug.reactive'),false,false,'fortify',false);}
    // Dying Wish (3 a game) and the Emergency Medical Kit (once a game)
    if(stat('qr.dyingWish')&&dyingLeft>0&&e.amount>=session.health){dyingLeft--;e.amount=Math.max(0,session.health-1);untouchable=t()+stat('qr.dyingWish');api.toast?.(`DYING WISH · ${dyingLeft} left`,1.5);return;}
    if(stat('qr.emergency')&&!emergencyUsed&&session.health-e.amount<session.maxHealth*stat('qr.emergency')&&session.health-e.amount>0){emergencyUsed=true;setTimeout(()=>{session.health=session.maxHealth;api.toast?.('EMERGENCY MEDICAL KIT',1.5);},0);}
  });
  function attacker(){const f=camera.position;return enemies.list.filter(z=>z.state==='attack'&&z.root.position.distanceTo(f)<150).sort((a,b)=>a.root.position.distanceTo(f)-b.root.position.distanceTo(f))[0];}

  // ---- max health, speeds, reload, swap, fire rate ------------------------------------------------------------------
  {const proto=Object.getOwnPropertyDescriptor(session,'maxHealth')??Object.getOwnPropertyDescriptor(Object.getPrototypeOf(session),'maxHealth');
    if(proto?.get)Object.defineProperty(session,'maxHealth',{configurable:true,get(){return proto.get.call(this)+stat('jug.health');}});}
  const three=()=>(session.inventory?.filter(w=>!w.lost).length??0)>=3;
  const common=()=>boostNow()+(three()?stat('mk.speed'):0)+(ads()?stat('su.stalker'):0);
  for(const [key,bonus] of [['moveSpeed',()=>stat('su.walk')+common()],['sprintSpeed',()=>stat('su.sprint')+common()]]){
    const d=Object.getOwnPropertyDescriptor(player,key);let base=player[key];
    const get=d?.get?()=>d.get.call(player):()=>base,set=d?.set?v=>d.set.call(player,v):v=>{base=v;};
    Object.defineProperty(player,key,{configurable:true,get:()=>get()*(1+bonus()),set});
  }
  window.kino.chargeMul=()=>1+stat('sc.charge');   // Supercharged (read by the classes mod)
  window.kino.phdScale=()=>1+stat('phd.radius');   // EOD Technician (read by perks-plus)
  let reloadReserve=null;
  const reload=session.reload.bind(session);
  session.reload=(...a)=>{const before=session.weapon?.reserve,r=reload(...a);
    if(r){let k=1-stat('sc.reload')-(three()?stat('mk.reload3'):0);if(stat('mk.thirdReload')&&session.inventory?.[2]===session.weapon)k-=stat('mk.thirdReload');
      k=Math.max(.3,k);if(k<1){session.reloadLeft*=k;session.reloadDuration*=k;}
      boost(stat('sc.surge'),2);
      if(stat('sc.presti')&&Math.random()<stat('sc.presti'))reloadReserve={w:session.weapon,reserve:before};}   // Prestidigitation: refunded when it lands
    return r;};
  const swap=session.switchWeapon?.bind(session);
  if(swap)session.switchWeapon=(...a)=>{const r=swap(...a);if(stat('sc.swap'))session.fireLeft*=1-stat('sc.swap');return r;};
  let shots=session.shots??0;

  // ---- your bullets -------------------------------------------------------------------------------------------------
  const lastHit=new WeakMap();
  host.on('beforeEnemyDamage',e=>{
    const z=e.enemy;if(!z||host.remoteDamage||e.cause!=='bullet')return;
    let k=1;const d=z.root.position.distanceTo(camera.position),fullHp=z.health>=(z.maxHealth??z.health)-1;
    if(stat('dt.jeopardy')&&!special(z)&&z.health<(z.maxHealth??full())*stat('dt.jeopardy')){e.amount=z.health+1;return;}
    if(e.head){k+=stat('ds.head');if(stat('ds.first')&&fullHp)k*=1+stat('ds.first');
      if(stat('ds.again')&&Math.random()<stat('ds.again')&&session.weapon&&session.weapon.mag<clipOf(session.weapon))session.weapon.mag++;}
    else k+=stat('dt.standard');
    k+=stat('dt.dmg');
    if(special(z))k+=stat('ds.specials');
    if(!ads())k+=stat('ds.hip');
    if(d<150)k+=stat('ds.point');
    if(session.health<session.maxHealth*.35)k+=stat('jug.retaliation');
    if(stat('mk.third')&&session.inventory?.[2]&&session.inventory[2]===session.weapon)k+=stat('mk.third');
    if(stat('dt.impact')){const last=lastHit.get(z)??-9;if(t()-last<.5)k+=stat('dt.impact');lastHit.set(z,t());}
    if(stat('dt.dealer')&&++hitCount%stat('dt.dealer')===0)k*=2;
    if(stat('dt.gamble')){const r=Math.random();if(r<.2)k*=2;else if(r<.3)k=0;}
    if(z.shatterBrittle>t())k+=z.shatterBrittleK;
    e.amount*=k;
  });
  host.on('kill',e=>{
    if(e.remote)return;const z=e.enemy,cause=z?.lastCause,at=z?.root.position.clone();
    if(stat('qr.killHeal'))heal(stat('qr.killHeal'));
    if(stat('qr.lowKillHeal')&&session.health<session.maxHealth*.25)heal(stat('qr.lowKillHeal'));
    if(stat('qr.adrenaline')&&special(z)){heal(session.maxHealth*stat('qr.adrenaline'));session.damageTime=-100;}
    if(stat('mk.scav')&&Math.random()<stat('mk.scav')){const w=session.weapon;if(w)w.reserve=Math.min(maxOf(w),w.reserve+Math.ceil(maxOf(w)*.1));}
    if(stat('mk.grenadeScav')&&Math.random()<stat('mk.grenadeScav')&&session.grenades<4)session.grenades++;
    if(cause==='explosion')boost(stat('su.equipBoost'),3);
    if(e.head&&cause==='bullet')boost(stat('ds.headSpeed'),3);
    if(at&&at.distanceTo(camera.position)<100)boost(stat('ds.closeSpeed'),3);
    if(stat('dt.play')&&t()-lastKillT<1&&session.weapon){const w=session.weapon,add=Math.min(stat('dt.play'),clipOf(w)-w.mag);if(add>0)w.mag+=add;}
    lastKillT=t();
    // Firebomb: a burning zombie explodes
    for(const fx of ammoFx.napalm??[])if(fx.firebomb&&z?.amod?.burnUntil>t()){const dmg=full()*fx.firebomb;
      setTimeout(()=>{for(const o of [...enemies.list])if(o.root.position.distanceTo(at)<120)enemies.hurt(o,dmg,false,false,'ammo_mod',false);window.kino.fx?.explosion?.(at.clone().addScaledVector(up,30),.4,0xff7a2a);},0);}
  });
  host.on('roundEnd',()=>{
    if(stat('sc.grenade'))session.grenades=Math.min(4+stat('sc.grenade'),session.grenades+stat('sc.grenade'));
    if(stat('mk.roundRefill'))for(const w of session.inventory??[])if(!w.lost)w.reserve=Math.min(maxOf(w),w.reserve+Math.ceil(maxOf(w)*stat('mk.roundRefill')));
  });
  host.on('fall',e=>{
    if(stat('su.freeFaller')&&e.amount>0){e.amount=0;boost(stat('su.freeFaller'),3);}
    if(stat('phd.gravity')&&has('specialty_flakjacket')&&!e.dive)window.kino.phd?.flop(e.position??player.getFeetPosition());
  });
  host.on('phdBlast',e=>{const k=stat('phd.echo');if(k&&!e.echo)setTimeout(()=>window.kino.phd?.flop(e.at,{power:k,echo:true}),1000);});

  // ---- per frame ----------------------------------------------------------------------------------------------------
  const stowed=new WeakMap();let muleT=10,thermal=[],pools=[];
  host.on('update',dt=>{
    if(!dt||!api.getState?.().active)return;const now=t();
    // Double Time: a shot was fired, shorten the wait for the next one
    if((session.shots??0)!==shots){shots=session.shots??0;if(stat('dt.rate'))session.fireLeft/=1+stat('dt.rate');}
    // Prestidigitation: the reload finished, hand back the reserve it used
    if(reloadReserve&&session.reloadLeft<=0){const {w,reserve}=reloadReserve;reloadReserve=null;if(w&&reserve!=null&&w.reserve<reserve)w.reserve=reserve;}
    // Quick Revive regen (its base regen starts 2 s after a hit)
    if(has(QR)&&session.health<session.maxHealth&&session.phase!=='reviving'){const since=now-session.damageTime,start=2-stat('qr.delay');let k=0;
      if(since>start&&since<=2)k+=1;if(since>start)k+=stat('qr.regenMul');if(k)heal(dt*session.maxHealth*.25*k);}
    const isFull=session.health>=session.maxHealth;if(isFull&&!wasFull)boost(stat('qr.fullBoost'),3);wasFull=isFull;
    if(stat('sc.phantom'))for(const w of session.inventory??[]){if(w===session.weapon||w.lost){stowed.delete(w);continue;}
      const since=stowed.get(w)??now;stowed.set(w,since);if(now-since<stat('sc.phantom'))continue;const need=Math.min(clipOf(w)-w.mag,w.reserve);if(need>0){w.mag+=need;w.reserve-=need;}}
    if(stat('mk.ammo')&&(muleT-=dt)<=0){muleT=10;for(const w of session.inventory??[])if(!w.lost)w.reserve=Math.min(maxOf(w),w.reserve+Math.ceil(maxOf(w)*stat('mk.ammo')));}
    const feet=player.getFeetPosition(),sprinting=!!player.input?.sprint;
    if(stat('su.hotFoot')&&sprinting)for(const z of [...enemies.list]){if(z.root.position.distanceTo(feet)>75)continue;
      if((z.hotT=(z.hotT??0)-dt)<=0){z.hotT=.5;enemies.hurt(z,full()*stat('su.hotFoot')*.5,false,false,'fire',false);window.kino.fx?.burn?.(z.root.position.clone().addScaledVector(up,40));}}
    // DR Ram: sprinting into a zombie
    if(stat('phd.ram')&&sprinting&&(ramT-=dt)<=0){const z=enemies.list.find(z=>z.root.position.distanceTo(feet)<55);
      if(z){ramT=1;const d=z.root.position.clone().sub(feet).setY(0).normalize();z.root.position.addScaledVector(d,70);enemies.hurt(z,full()*stat('phd.ram'),false,false,'melee',false);}}
    const mv=window.kino.movement?.state,sliding=!!mv?.sliding;
    if(stat('phd.slider')&&sliding&&!slideUsed&&enemies.list.some(z=>z.root.position.distanceTo(feet)<70)){slideUsed=true;window.kino.phd?.flop(feet);}
    if(wasSliding&&!sliding)boost(stat('phd.slideBoost'),2);
    if(!sliding)slideUsed=false;wasSliding=sliding;
    if(mv&&mv.wallJumps>wallJumps&&stat('phd.stunt'))window.kino.phd?.flop(feet,{power:stat('phd.stunt'),echo:true});
    wallJumps=mv?.wallJumps??0;
    // Thermal Shock: a chill wore off
    thermal=thermal.filter(x=>{if(!enemies.list.includes(x.z))return false;if((x.z.amod?.slowUntil??0)>now)return true;enemies.hurt(x.z,(x.z.maxHealth??full())*x.k,false,false,'ammo_mod',false);return false;});
    // Petroleum pools
    pools=pools.filter(p=>{if(p.until<=now){p.mesh.removeFromParent();p.mesh.geometry.dispose();p.mesh.material.dispose();return false;}
      if((p.tick-=dt)<=0){p.tick=.5;for(const z of [...enemies.list])if(z.root.position.distanceTo(p.at)<100){enemies.hurt(z,(z.maxHealth??full())*p.k*.5,false,false,'ammo_mod',false);window.kino.fx?.burn?.(z.root.position.clone().addScaledVector(up,40));}}
      p.mesh.material.opacity=.35*Math.min(1,(p.until-now)/1)*(.85+Math.random()*.15);return true;});
  });

  // ---- ammo mod augments -----------------------------------------------------------------------------------------
  host.on('ammoModTune',e=>{
    for(const fx of ammoFx[e.id]??[]){const p=e.params;
      for(const [k,v] of Object.entries(fx.set??{}))p[k]=v;
      for(const [k,v] of Object.entries(fx.add??{}))p[k]=(p[k]??0)+v;
      for(const [k,v] of Object.entries(fx.mul??{}))p[k]=(p[k]??0)*v;
      for(const [k,v] of Object.entries(fx.max??{}))p[k]=Math.max(p[k]??0,v);}
  });
  host.on('ammoModProc',e=>{for(const fx of ammoFx[e.id]??[]){if(fx.chance)e.chance*=fx.chance;if(fx.bigGame&&special(e.enemy))e.chance=1;}});
  host.on('ammoModFired',e=>{
    const z=e.enemy,at=z.root.position.clone();
    for(const fx of ammoFx[e.id]??[]){
      if(fx.spread)for(const o of enemies.list.filter(o=>o!==z&&o.root.position.distanceTo(at)<fx.spread.r).slice(0,fx.spread.n))window.kino.ammoMods?.trigger(e.id,o,e.tier);
      if(fx.refill){const w=session.weapon;if(w){const add=Math.min(Math.ceil(clipOf(w)*fx.refill),clipOf(w)-w.mag,w.reserve);if(add>0){w.mag+=add;w.reserve-=add;}}}
      if(fx.burst&&enemies.list.includes(z))enemies.hurt(z,(z.maxHealth??full())*fx.burst,false,false,'ammo_mod',false);
      if(fx.thermal)thermal.push({z,k:fx.thermal});
      if(fx.brittle)for(const o of enemies.list)if(o.root.position.distanceTo(at)<200){o.shatterBrittle=t()+4;o.shatterBrittleK=fx.brittle;}
      if(fx.pool&&api.scene){const mesh=new THREE.Mesh(new THREE.CircleGeometry(100,24),new THREE.MeshBasicMaterial({color:0xff6a1a,transparent:true,opacity:.35,depthWrite:false,blending:THREE.AdditiveBlending}));
        mesh.rotation.x=-Math.PI/2;mesh.position.copy(at).addScaledVector(up,1.5);api.scene.add(mesh);pools.push({mesh,at,until:t()+4,tick:.5,k:fx.pool});}
    }
  });

  // ---- pause menu: the active research and the augments locked in for this match ------------------------------------
  const panel=document.createElement('div');panel.id='research-panel';
  const css=document.createElement('style');css.textContent='#research-panel{margin:8px 0;font-size:11px;letter-spacing:.06em;line-height:1.6;color:#b9b2a3}#research-panel b{color:#f0c060;font-weight:600}#research-panel span{color:#e8dcc0}';document.head.append(css);
  let lastPanel='';
  function renderPanel(){
    const anchor=document.getElementById('gunsmith-panel')??document.getElementById('loadout-panel')??document.querySelector('#menu .menu-controls');
    if(anchor&&anchor.nextElementSibling!==panel)anchor.after(panel);
    const a=R.active&&cfg.items.flatMap(i=>i.augments.map((x,ix)=>({...x,index:ix,item:i}))).find(x=>x.id===R.active);
    const html=(a?`<div><b>RESEARCHING</b> ${a.name} · ${a.item.name} ${a.index+1}/8 · ${Math.floor(R.progress[a.id]??0).toLocaleString()} / ${costOf(cfg,a).toLocaleString()} XP</div>`:'')+
      (list.length?`<div><b>AUGMENTS</b> ${list.map(x=>`<span>${x.name}</span> (${x.itemName})`).join(' · ')}</div>`:'');
    if(html!==lastPanel){lastPanel=html;panel.innerHTML=html;}
  }
  let panelT=0;host.on('update',dt=>{if((panelT-=dt||.016)<=0){panelT=1;renderPanel();}});
  addEventListener('keydown',e=>{if(e.code==='Escape')setTimeout(renderPanel,0);});
  renderPanel();

  window.kino.research={get equipped(){return list.map(a=>a.id);},get state(){return R;},stat,lockIn,earn};
}
