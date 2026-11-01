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
  let perkFx={},ammoFx={},eqFx={},list=[];
  function lockIn(){
    perkFx={};ammoFx={};eqFx={};list=equippedAugments(cfg,loadResearch());
    for(const a of list){
      if(a.itemKind==='perk'){const f=perkFx[a.item]??={};for(const [k,v] of Object.entries(a.effects))f[k]=(f[k]??0)+v;}
      else if(a.itemKind==='equipment')for(const [k,v] of Object.entries(a.effects))eqFx[k]=(eqFx[k]??0)+v;
      else (ammoFx[a.item]??=[]).push(a.effects);
    }
  }
  lockIn();host.on('start',lockIn);
  // a perk augment's number, summed over owned perks
  const stat=k=>{let v=0;for(const [item,f] of Object.entries(perkFx))if(f[k]&&has(item))v+=f[k];return v;};

  // ---- research XP (kept in memory during the match, saved 1.5 s after the last gain, on completion and on unload) --
  // equipment is active while you carry it (the lethal slot's frags or Claymores, the tactical slot's item)
  const carries=id=>id==='frag_grenade_zm'?!session.claymoresOwned&&session.grenades>0:id==='claymore_zm'?!!session.claymoresOwned
    :id==='zombie_cymbal_monkey'?!!session.monkeysOwned||session.monkeys>0:window.kino.tactical?.id===id||session.equipment===id;
  const isActive=item=>has(item)||session.weapon?.ammoMod?.id===item||carries(item);
  let R=loadResearch(),saveT=null;
  host.on('start',()=>{R=loadResearch();});
  function earn(xp){
    if(!R.active||!researchOpen(cfg,unlockLvl(loadProfile())))return;
    const done=grantResearchXp(cfg,R,xp*(window.kino.boost?.researchXp??1),isActive);   // double research XP token (pass)
    clearTimeout(saveT);
    if(done){saveResearch(R);
      api.announce?.(done.name,done.mastery?`${done.itemName.toUpperCase()} MASTERED · SECOND MINOR SLOT`:`${done.kind.toUpperCase()} AUGMENT RESEARCHED · ${done.itemName.toUpperCase()}`,3);
      const nx=done.next?cfg.items.flatMap(i=>i.augments.map(x=>({...x,itemName:i.name}))).find(x=>x.id===done.next.id):null;
      api.toast?.((done.mastery?'Second Minor slot unlocked':'Equip it in Armory → Research')+(nx?` · now researching ${nx.name}${done.mastery?' ('+nx.itemName+')':''}`:' · everything researched'),4);}
    else saveT=setTimeout(()=>saveResearch(R),1500);
  }
  addEventListener('beforeunload',()=>{clearTimeout(saveT);saveResearch(R);});
  host.on('kill',e=>{if(!e.remote)earn(cfg.xp.kill+(e.head?cfg.xp.headshot:0));});
  host.on('roundEnd',({round})=>earn(round*cfg.xp.roundPerRound));

  // ---- shared state -------------------------------------------------------------------------------------------------
  const QR='specialty_quickrevive';
  const PLATE=100,PLATE_CD=60,MK='specialty_additionalprimaryweapon';
  let dyingLeft=3,untouchable=-1,kits=0,boosts=[],hitCount=0,lastKillT=-9,slideUsed=false,ramT=0,wallJumps=0,wasFull=true,wasSliding=false,plateReady=0;
  const boost=(v,dur)=>{if(v)boosts.push({v,until:t()+dur});};
  const boostNow=()=>{boosts=boosts.filter(b=>b.until>t());return boosts.reduce((a,b)=>a+b.v,0);};
  host.on('reset',()=>{dyingLeft=3;untouchable=-1;kits=0;boosts=[];hitCount=0;plateReady=0;exchangeLeft=3;exchangeKills=null;downKit=null;reliableGun=lastThird=null;});
  const ads=()=>!!api.getState?.().input?.ads;
  const hasPlate=()=>session.health>PLATE;   // no armor plates here: Juggernog's health above 100 stands in for them
  const forward=()=>camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();

  // ---- you get hit ----------------------------------------------------------------------------------------------------
  host.on('beforeDamage',e=>{
    if(!(e.amount>0)||session.effects.invulnerable>session.time)return;   // session.damage refuses it: nothing here may be spent on it
    if(t()<untouchable){e.amount=0;return;}
    let k=1;const z=attacker();
    if(hasPlate())k-=stat('jug.armor');
    if(stat('jug.turtle')&&hasPlate()&&z){const to=z.root.position.clone().sub(camera.position).setY(0).normalize();k*=1-(forward().dot(to)<0?stat('jug.turtleBack'):stat('jug.turtle'));}
    if(stat('dp.sixth')&&z){const to=z.root.position.clone().sub(camera.position).setY(0).normalize();if(forward().dot(to)<0)k*=1-stat('dp.sixth');}
    if(stat('jug.shake')&&Math.random()<stat('jug.shake'))k*=.25;
    if(stat('su.hardTarget')&&player.input?.sprint)k*=1-stat('su.hardTarget');
    if(stat('phd.slideArmor')&&window.kino.movement?.state?.sliding){if(!z){e.amount=0;return;}k*=1-stat('phd.slideArmor');}
    e.amount*=Math.max(.1,k);
    // Emergency Medical Kit first, then Dying Wish (3 a game, and it spends Quick Revive)
    if(e.amount>=session.health){
      if(kits>0){kits--;e.amount=0;untouchable=t()+2;setTimeout(()=>{session.health=Math.max(session.health,session.maxHealth*.5);api.toast?.(`EMERGENCY MEDICAL KIT · ${kits} left`,2);},0);return;}
      if(stat('qr.dyingWish')&&dyingLeft>0){dyingLeft--;const sec=stat('qr.dyingWish');e.amount=Math.max(0,session.health-1);untouchable=t()+sec;session.perks.delete(QR);session.boughtPerks?.delete(QR);api.toast?.(`DYING WISH · ${dyingLeft} left`,2);return;}
    }
    // the plate health ran out on this hit
    if(t()>=plateReady&&hasPlate()&&session.health-e.amount<=PLATE&&session.health-e.amount>0&&(stat('jug.reactive')||stat('jug.ironCore'))){
      plateReady=t()+PLATE_CD;const sec=stat('jug.reactive'),hp=stat('jug.ironCore');
      if(sec){const at=player.getFeetPosition();window.kino.fx?.explosion?.(at.clone().addScaledVector(up,40),.3,0x9fd8ff);for(const o of enemies.list)if(!special(o)&&o.root.position.distanceTo(at)<200)stun(o,sec);}
      if(hp)setTimeout(()=>heal(hp),0);}
  });
  function attacker(){const f=camera.position;return enemies.list.filter(z=>z.state==='attack'&&z.root.position.distanceTo(f)<150).sort((a,b)=>a.root.position.distanceTo(f)-b.root.position.distanceTo(f))[0];}

  // ---- max health, speeds, reload, swap, fire rate ------------------------------------------------------------------
  {const proto=Object.getOwnPropertyDescriptor(session,'maxHealth')??Object.getOwnPropertyDescriptor(Object.getPrototypeOf(session),'maxHealth');
    if(proto?.get)Object.defineProperty(session,'maxHealth',{configurable:true,get(){return proto.get.call(this)+stat('jug.health');}});}
  const common=()=>boostNow()+(ads()?stat('su.stalker'):0);
  // Footwork: any sprint that isn't forward (the game sprints in every direction)
  const notForward=()=>{const v=player.velocity;if(!v)return false;const h=Math.hypot(v.x,v.z);return h>40&&(v.x*forward().x+v.z*forward().z)/h<.5;};
  for(const [key,bonus] of [['moveSpeed',()=>common()],['sprintSpeed',()=>stat('su.sprint')+common()+(stat('su.footwork')&&notForward()?stat('su.footwork'):0)]]){
    const d=Object.getOwnPropertyDescriptor(player,key);let base=player[key];
    const get=d?.get?()=>d.get.call(player):()=>base,set=d?.set?v=>d.set.call(player,v):v=>{base=v;};
    Object.defineProperty(player,key,{configurable:true,get:()=>get()*(1+bonus()),set});
  }
  window.kino.chargeMul=()=>1+stat('sc.charge');   // Supercharged (read by the classes mod)
  window.kino.phdScale=()=>1+stat('phd.radius');   // EOD Technician (read by perks-plus)
  // numbers other files read (they stay 1 / 0 without the augment)
  window.kino.phdDiveMul=()=>1-stat('phd.eod');      // EOD Technician: the height a PhD dive blast needs (fall-damage)
  window.kino.slideMul=()=>1+stat('phd.slide');      // Tribologist (movement)
  window.kino.hipSpreadMul=()=>1-stat('ds.spread');  // Dead Draw (engine)
  window.kino.motionSteady=()=>1-stat('ds.steady');  // Dead Set (fp.js)
  window.kino.pierceBonus=()=>stat('dt.pierce');     // Double Down (engine)
  window.kino.throwSpeed=()=>1+stat('sc.pitch');     // Fast Pitcher (throwables)
  window.kino.throwRange=()=>1+(player.input?.sprint?stat('su.quarterback'):0);   // Quarterback (throwables)
  window.kino.bleedMul=()=>1+stat('qr.bleed');       // Slow Death (read at the moment you go down, reaper-perks)
  window.kino.boxSpin=()=>1-stat('sc.roulette');     // Speedy Roulette (mystery-box)
  let reloadReserve=null;
  const reload=session.reload.bind(session);
  session.reload=(...a)=>{const before=session.weapon?.reserve,r=reload(...a);
    if(r){const k=Math.max(.3,1-stat('sc.reload'));if(k<1){session.reloadLeft*=k;session.reloadDuration*=k;}
      boost(stat('sc.surge'),2);
      if(stat('sc.presti')&&Math.random()<stat('sc.presti'))reloadReserve={w:session.weapon,reserve:before};}   // Prestidigitation: refunded when it lands
    return r;};
  const swap=session.switchWeapon?.bind(session);
  if(swap)session.switchWeapon=(...a)=>{const r=swap(...a);if(stat('sc.swap'))session.fireLeft*=1-stat('sc.swap');return r;};
  let shots=session.shots??0;

  // ---- Mule Kick ---------------------------------------------------------------------------------------------------------
  const WONDER=/ray_gun|thundergun|microwavegun|minigun|crossbow/;let reliableGun=null,lastThird=null,seen=null;
  {let p=session,d;while(p&&!(d=Object.getOwnPropertyDescriptor(p,'perkPrice')))p=Object.getPrototypeOf(p);   // Kick Back
    if(d?.get)Object.defineProperty(session,'perkPrice',{configurable:true,get(){const v=d.get.call(this),k=stat('mk.discount');return k?Math.round(v*(1-k)/10)*10:v;}});}
  window.kino.freeThrow=()=>Math.random()<stat('mk.freeThrow');   // Free Throw (throwables, the two below)
  {const use=session.useEquipment?.bind(session);
    if(use)session.useEquipment=(kind,...a)=>{const before=session[kind],r=use(kind,...a);if(r&&window.kino.freeThrow())session[kind]=before;return r;};}
  {const take=session.takePack?.bind(session);   // Multi Pack
    if(take)session.takePack=(...a)=>{const w=session.pack?.weapon,r=take(...a);if(!r||!w||!session.inventory?.includes(w)||!stat('mk.multi')||Math.random()>=stat('mk.multi'))return r;
      const o=session.inventory.find(x=>x!==w&&!x.lost&&!x.upgraded&&data.weapons[x.id]?.upgrade);
      if(o){o.upgraded=true;o.mag=clipOf(o);o.reserve=maxOf(o);api.toast?.(`MULTI PACK · ${data.weapons[o.id].upgrade.name??data.weapons[o.id].name}`,3);}
      return r;};}
  {const powerup=session.powerup?.bind(session);   // Pack Mule: Max Ammo fills the bigger reserve
    if(powerup)session.powerup=(type,...rest)=>{const r=powerup(type,...rest);if(type==='full_ammo'&&stat('mk.stock'))for(const w of session.inventory??[])if(!w.lost&&maxOf(w))w.reserve=Math.ceil(maxOf(w)*(1+stat('mk.stock')));return r;};}
  function bogo(){const tac=window.kino.tactical,rp=window.kino.reaperPerks,now={g:session.grenades??0,t:tac?.id?tac.count??0:session.monkeys??0,id:tac?.id};
    if(seen&&seen.id===now.id){if(now.g>seen.g)now.g=session.grenades=Math.min(rp?.nadeMax?.()??4,now.g+1);
      if(now.t>seen.t){const max=tac?.id?tac.max?.()??3:session.monkeyMax?.()??3,v=Math.max(now.t,Math.min(max,now.t+1));if(tac?.id)tac.count=v;else session.monkeys=v;now.t=v;}}
    seen=now;}

  // ---- your bullets -------------------------------------------------------------------------------------------------
  const lastHit=new WeakMap();
  host.on('beforeEnemyDamage',e=>{
    const z=e.enemy;if(!z||host.remoteDamage||e.cause!=='bullet')return;
    let k=1;const d=z.root.position.distanceTo(camera.position),fullHp=z.health>=(z.maxHealth??z.health)-1;
    if(stat('dt.jeopardy')&&!special(z)&&z.health<(z.maxHealth??full())*stat('dt.jeopardy')){e.amount=z.health+1;return;}
    if(e.head){k+=stat('ds.head');if(stat('ds.first')&&fullHp)k*=1+stat('ds.first');
      if(stat('ds.again')&&Math.random()<stat('ds.again')&&session.weapon&&session.weapon.mag<clipOf(session.weapon))session.weapon.mag++;}
    else k+=stat('dt.standard');
    if(special(z))k+=stat('ds.specials');
    if(d<150)k+=stat('ds.point');
    if(session.health<session.maxHealth*.35)k+=stat('jug.retaliation');
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
    if(stat('mk.plate')&&Math.random()<stat('mk.plate'))heal(15);
    // Ice Cloud: a chilled zombie died
    for(const fx of ammoFx.cryo??[])if(fx.iceCloud&&at&&z?.amod?.slowUntil>t()&&Math.random()<fx.iceCloud)addPool(at,{slow:true,r:120,sec:5});
    if(cause==='explosion')boost(stat('su.equipBoost'),3);
    if(at&&at.distanceTo(camera.position)<100)boost(stat('ds.closeSpeed'),3);
    if(stat('dt.play')&&t()-lastKillT<1&&session.weapon){const w=session.weapon,add=Math.min(stat('dt.play'),clipOf(w)-w.mag);if(add>0)w.mag+=add;}
    lastKillT=t();
    // Firebomb: a burning zombie explodes
    for(const fx of ammoFx.napalm??[])if(fx.firebomb&&z?.amod?.burnUntil>t()){const dmg=full()*fx.firebomb;
      setTimeout(()=>{for(const o of [...enemies.list])if(o.root.position.distanceTo(at)<120)enemies.hurt(o,dmg,false,false,'ammo_mod',false);window.kino.fx?.explosion?.(at.clone().addScaledVector(up,30),.4,0xff7a2a);},0);}
  });
  // Emergency Medical Kit: one every 5th round, up to 4
  host.on('roundEnd',({round})=>{const n=stat('qr.emergency');if(n&&round%n===0&&kits<4){kits++;api.toast?.(`EMERGENCY MEDICAL KIT · ${kits} carried`,2);}});

  // ---- downs and revives (co-op) ------------------------------------------------------------------------------------
  // Going down clears the perks, so these read the equipped numbers directly instead of stat().
  const fxOf=(id,k)=>perkFx[id]?.[k]??0;
  let downKit=null,exchangeLeft=3,exchangeKills=null,exchangeLast=0;
  host.on('goingDown',()=>{exchangeKills=0;exchangeLast=session.killed??0;
    downKit=fxOf(QR,'qr.emt')&&has(QR)?{perks:[...session.perks],bought:[...(session.boughtPerks??[])],third:session.inventory?.[2]??null}:null;});
  host.on('revived',m=>{exchangeKills=null;
    if(m?.swift)boost(m.swift,4);
    if(downKit){for(const p of downKit.perks)session.perks.add(p);for(const p of downKit.bought)session.boughtPerks?.add(p);
      if(downKit.third&&session.inventory?.length===2)session.inventory.push(downKit.third);
      session.health=session.maxHealth;api.toast?.('EMT · perks restored',2);}
    downKit=null;});
  host.on('reviveDone',()=>{if(stat('qr.fullBoost'))boost(stat('qr.fullBoost'),4);if(stat('qr.karmic'))session.health=session.maxHealth;});
  window.kino.reviveExtras=()=>({swift:stat('qr.fullBoost')});
  host.on('fall',e=>{
    if(stat('su.freeFaller')&&e.amount>0){e.amount=0;boost(stat('su.freeFaller'),3);}
    if(stat('phd.gravity')&&has('specialty_flakjacket')&&!e.dive)window.kino.phd?.flop(e.position??player.getFeetPosition());
  });
  host.on('phdBlast',e=>{const k=stat('phd.echo');if(k&&!e.echo)setTimeout(()=>window.kino.phd?.flop(e.at,{power:k,echo:true}),1000);});

  // ---- per frame ----------------------------------------------------------------------------------------------------
  const reserveSeen=new WeakMap(),phantom=new WeakMap();let thermal=[],pools=[];
  host.on('update',dt=>{
    if(!dt||!api.getState?.().active)return;const now=t();
    // Double Time: a shot was fired, shorten the wait for the next one
    if((session.shots??0)!==shots){shots=session.shots??0;if(stat('dt.rate'))session.fireLeft/=1+stat('dt.rate');}
    // Prestidigitation: the reload finished, hand back the reserve it used
    if(reloadReserve&&session.reloadLeft<=0){const {w,reserve}=reloadReserve;reloadReserve=null;if(w&&reserve!=null&&w.reserve<reserve)w.reserve=reserve;}
    // Quick Revive regen (its base regen starts 2 s after a hit)
    if(has(QR)&&session.health<session.maxHealth&&session.phase!=='reviving'){const since=now-session.damageTime,start=2-stat('qr.delay');let k=0;
      if(since>start&&since<=2)k+=1;if(since>start)k+=stat('qr.regenMul');if(k)heal(dt*session.maxHealth*.25*k);}
    const isFull=session.health>=session.maxHealth;if(isFull&&!wasFull)boost(stat('qr.fullBoost'),4);wasFull=isFull;
    // Phantom Reload: every gun that isn't reloading refills from its reserve
    if(stat('sc.phantom'))for(const w of session.inventory??[]){if(w.lost||(w===session.weapon&&session.reloadLeft>0))continue;
      const cap=clipOf(w);if(w.mag>=cap||w.reserve<=0){phantom.delete(w);continue;}
      const got=(phantom.get(w)??0)+cap*stat('sc.phantom')*dt,add=Math.min(Math.floor(got),cap-w.mag,w.reserve);phantom.set(w,got-Math.floor(got));if(add>0){w.mag+=add;w.reserve-=add;}}
    // Pack Mule: any refill to the normal maximum (a new gun, a Max Ammo) lands on the bigger reserve
    if(stat('mk.stock'))for(const w of session.inventory??[]){if(w.lost)continue;const max=maxOf(w),last=reserveSeen.get(w);
      if(max>0&&w.reserve===max&&(last===undefined||last<max))w.reserve=Math.ceil(max*(1+stat('mk.stock')));reserveSeen.set(w,w.reserve);}
    // Equivalent Exchange: your team's kills while you're down
    if(exchangeKills!=null&&fxOf(QR,'qr.exchange')&&exchangeLeft>0&&window.kino.coopDown?.down&&!window.kino.coopDown?.dead){const k=session.killed??0;exchangeKills+=Math.max(0,k-exchangeLast);exchangeLast=k;   // session.killed restarts each round
      if(exchangeKills>=fxOf(QR,'qr.exchange')){exchangeLeft--;exchangeKills=null;window.kino.coopGetUp?.();api.announce?.('Equivalent Exchange',`BACK UP · ${exchangeLeft} left`,3);}}
    // Ol' Reliable: remember the third gun, hand it back when Mule Kick is bought again
    if(fxOf(MK,'mk.reliable')){const third=session.inventory?.[2];
      if(has(MK)){if(third)lastThird=third;else if(reliableGun&&session.inventory?.length===2){session.inventory.push(reliableGun);reliableGun=lastThird=null;api.toast?.("OL' RELIABLE · third gun back",2);}}
      else if(lastThird&&!third){reliableGun=WONDER.test(lastThird.id)?null:lastThird;lastThird=null;}}
    // Bogo: gaining equipment gives one more
    if(stat('mk.bogo'))bogo();else seen=null;
    const feet=player.getFeetPosition(),sprinting=!!player.input?.sprint;
    // DR Ram: sprinting into a zombie
    if(stat('phd.ram')&&sprinting&&(ramT-=dt)<=0){const z=enemies.list.find(z=>z.root.position.distanceTo(feet)<55);
      if(z){ramT=1;const d=z.root.position.clone().sub(feet).setY(0).normalize();z.root.position.addScaledVector(d,70);enemies.hurt(z,full()*stat('phd.ram'),false,false,'melee',false);}}
    const mv=window.kino.movement?.state,sliding=!!mv?.sliding;
    if(stat('phd.slider')&&sliding&&!slideUsed&&enemies.list.some(z=>z.root.position.distanceTo(feet)<70)){slideUsed=true;window.kino.phd?.flop(feet);}
    if(!sliding)slideUsed=false;wasSliding=sliding;
    if(mv&&mv.wallJumps>wallJumps&&stat('phd.stunt'))window.kino.phd?.flop(feet,{power:stat('phd.stunt'),echo:true});
    wallJumps=mv?.wallJumps??0;
    // Thermal Shock: a chill wore off
    thermal=thermal.filter(x=>{if(!enemies.list.includes(x.z))return false;if((x.z.amod?.slowUntil??0)>now)return true;enemies.hurt(x.z,(x.z.maxHealth??full())*x.k,false,false,'ammo_mod',false);return false;});
    // Petroleum pools
    pools=pools.filter(p=>{if(p.until<=now){p.mesh.removeFromParent();p.mesh.geometry.dispose();p.mesh.material.dispose();return false;}
      if((p.tick-=dt)<=0){p.tick=.5;for(const z of [...enemies.list])if(z.root.position.distanceTo(p.at)<p.r){if(p.slow){slow(z,.5,1);continue;}enemies.hurt(z,(z.maxHealth??full())*p.k*.5,false,false,'ammo_mod',false);window.kino.fx?.burn?.(z.root.position.clone().addScaledVector(up,40));}}
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
  host.on('ammoModProc',e=>{for(const fx of ammoFx[e.id]??[]){if(fx.chance)e.chance*=fx.chance;if(fx.cooldown)e.cooldown=(e.cooldown??1)*fx.cooldown;if(fx.bigGame&&special(e.enemy))e.chance=1;}});
  function addPool(at,{r=100,sec=4,k=0,slow=false}){if(!api.scene)return;
    const mesh=new THREE.Mesh(new THREE.CircleGeometry(r,24),new THREE.MeshBasicMaterial({color:slow?0x9fe4ff:0xff6a1a,transparent:true,opacity:.35,depthWrite:false,blending:THREE.AdditiveBlending}));
    mesh.rotation.x=-Math.PI/2;mesh.position.copy(at).addScaledVector(up,1.5);api.scene.add(mesh);pools.push({mesh,at,r,slow,until:t()+sec,tick:.5,k});}
  host.on('ammoModFired',e=>{
    const z=e.enemy,at=z.root.position.clone();
    for(const fx of ammoFx[e.id]??[]){
      if(fx.spread)for(const o of enemies.list.filter(o=>o!==z&&o.root.position.distanceTo(at)<fx.spread.r).slice(0,fx.spread.n))window.kino.ammoMods?.trigger(e.id,o,e.tier);
      if(fx.refill){const w=session.weapon;if(w){const add=Math.min(Math.ceil(clipOf(w)*fx.refill),clipOf(w)-w.mag,w.reserve);if(add>0){w.mag+=add;w.reserve-=add;}}}
      if(fx.burst&&enemies.list.includes(z))enemies.hurt(z,(z.maxHealth??full())*fx.burst,false,false,'ammo_mod',false);
      if(fx.thermal)thermal.push({z,k:fx.thermal});
      if(fx.brittle)for(const o of enemies.list)if(o.root.position.distanceTo(at)<200){o.shatterBrittle=t()+4;o.shatterBrittleK=fx.brittle;}
      if(fx.pool)addPool(at,{k:fx.pool});
      // Lightning Strike: bolts from the sky, stunning up to n zombies
      if(fx.strike){const am=window.kino.ammoMods;for(const o of enemies.list.filter(o=>o.health>0&&o.root.position.distanceTo(at)<fx.strike.r).slice(0,fx.strike.n)){stun(o,2);
        const g=o.root.position.clone().addScaledVector(up,30);am?.bolt?.([g.clone().addScaledVector(up,500),g],0x8fd4ff);}}
    }
  });

  // ---- equipment augments (frag.*, clay.*, monkey.*, gersch.*, qed.*) ---------------------------------------------------
  // They work whenever equipped (they only act when the item is used). The code that throws or places the item reads the
  // numbers with window.kino.equipAug(key) and uses these helpers for the shared effects.
  const eq=k=>eqFx[k]??0;
  window.kino.equipAug=eq;
  const maxHp=z=>z.maxHealth??full();
  const alive=z=>enemies.list.includes(z)&&z.health>0;
  const stun=(z,sec)=>{const a=z.amod??={};a.base??=z.speed;a.stunUntil=Math.max(a.stunUntil??0,t()+sec);a.frozen=false;};   // the ammo-mods mod holds stunned zombies in place
  const slow=(z,k,sec)=>{const a=z.amod??={};a.base??=z.speed;a.slow=Math.max(a.slowUntil>t()?a.slow??0:0,k);a.slowUntil=Math.max(a.slowUntil??0,t()+sec);};
  let bleeds=[],fires=[];
  window.kino.equipFx={
    stun,slow,alive,maxHp,
    // zombies within r of at that are still standing
    near:(at,r)=>enemies.list.filter(z=>z.health>0&&z.root.position.distanceTo(at)<r),
    pct:(z,k,cause='explosion')=>{if(alive(z)&&k>0)enemies.hurt(z,maxHp(z)*k,false,false,cause);},
    bleed:(z,k,sec)=>{bleeds.push({z,k,until:t()+sec,tick:1});},
    fire:(at,k,sec,r=110)=>{if(!api.scene)return;const mesh=new THREE.Mesh(new THREE.CircleGeometry(r,24),new THREE.MeshBasicMaterial({color:0xff6a1a,transparent:true,opacity:.35,depthWrite:false,blending:THREE.AdditiveBlending}));
      mesh.rotation.x=-Math.PI/2;mesh.position.copy(at).addScaledVector(up,1.5);api.scene.add(mesh);fires.push({mesh,at:at.clone(),r,until:t()+sec,tick:.5,k});},
    drop:at=>{const types=['full_ammo','double_points','insta_kill','carpenter','nuke'];api.powerups?.spawn?.(types[Math.floor(Math.random()*types.length)],at.clone());},
    points:n=>{if(n>0)session.addPoints(Math.round(n));},
  };
  host.on('reset',()=>{bleeds=[];for(const f of fires){f.mesh.removeFromParent();f.mesh.geometry.dispose();f.mesh.material.dispose();}fires=[];});
  host.on('update',dt=>{
    if(!dt)return;const now=t();
    bleeds=bleeds.filter(b=>{if(b.until<=now||!alive(b.z))return false;if((b.tick-=dt)<=0){b.tick=1;enemies.hurt(b.z,maxHp(b.z)*b.k,false,false,'explosion');}return true;});
    fires=fires.filter(p=>{if(p.until<=now){p.mesh.removeFromParent();p.mesh.geometry.dispose();p.mesh.material.dispose();return false;}
      if((p.tick-=dt)<=0){p.tick=.5;for(const z of [...enemies.list])if(z.health>0&&z.root.position.distanceTo(p.at)<p.r){enemies.hurt(z,maxHp(z)*p.k*.5,false,false,'explosion');window.kino.fx?.burn?.(z.root.position.clone().addScaledVector(up,40));}}
      p.mesh.material.opacity=.35*Math.min(1,(p.until-now)/1)*(.85+Math.random()*.15);return true;});
  });
  // Captive Audience: zombies near a playing monkey take more damage from everything
  host.on('beforeEnemyDamage',e=>{
    const k=eq('monkey.audience'),z=e.enemy;if(!k||!z||host.remoteDamage)return;
    if((api.features?.projectiles??[]).some(p=>p.monkey&&p.stuck&&p.life>0&&p.mesh.position.distanceTo(z.root.position)<300))e.amount*=1+k;
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
