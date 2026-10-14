// Research in a match (roadmap Phase 5): research XP for the active research, and the equipped perk and ammo mod
// augments. The equipped set is read once when the match starts (and again on a new game), so a match is predictable.
// Perk augments work while you own that perk; ammo mod augments while that mod is on the gun in hand (they edit the
// mod's numbers through the ammo-mods events: 'ammoModTune', 'ammoModProc', 'ammoModFired').
import * as THREE from 'three';
import { zombieHealth } from '../../rules.js';
import { loadProfile, unlockLvl, cloudReady } from '../../profile.js';
import { loadResearchConfig, loadResearch, saveResearch, grantResearchXp, equippedAugments, researchOpen } from './research.js';

const up=new THREE.Vector3(0,1,0);

export default async function setup(api){
  const {host,session,enemies,player,data,mod}=api;
  if(!enemies)return;
  await cloudReady;
  const cfg=await loadResearchConfig(mod.url);
  const full=()=>zombieHealth(session.round,data.rules);
  const has=id=>!!session.perks?.has(id);

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

  // ---- research XP ------------------------------------------------------------------------------------------------
  const isActive=item=>has(item)||session.weapon?.ammoMod?.id===item;
  // in memory during the match (saved every 1.5 s of quiet and on unload); re-read when a match starts
  let R=loadResearch(),saveT=null;
  host.on('start',()=>{R=loadResearch();});
  function earn(xp){
    if(!R.active||!researchOpen(cfg,unlockLvl(loadProfile())))return;
    const done=grantResearchXp(cfg,R,xp,isActive);
    clearTimeout(saveT);
    if(done){saveResearch(R);api.announce?.(done.name,`${done.kind.toUpperCase()} AUGMENT RESEARCHED · ${done.itemName.toUpperCase()}`,3);api.toast?.('Equip it in Armory → Research',4);}
    else saveT=setTimeout(()=>saveResearch(R),1500);
  }
  addEventListener('beforeunload',()=>{clearTimeout(saveT);saveResearch(R);});
  host.on('kill',e=>{if(!e.remote)earn(cfg.xp.kill+(e.head?cfg.xp.headshot:0));});
  host.on('roundEnd',({round})=>earn(round*cfg.xp.roundPerRound));

  // ---- perk augments -----------------------------------------------------------------------------------------------
  const QR='specialty_quickrevive',JUG='specialty_armorvest',SC='specialty_fastreload',DT='specialty_rof',SU='specialty_longersprint',DS='specialty_deadshot',MK='specialty_additionalprimaryweapon';
  let dyingUsed=false,untouchable=-1,firstHit=true,headCount=0,boostUntil=-1,slideUsed=false;
  host.on('roundEnd',()=>{dyingUsed=false;firstHit=true;});
  host.on('reset',()=>{dyingUsed=false;firstHit=true;untouchable=-1;headCount=0;boostUntil=-1;});

  host.on('beforeDamage',e=>{
    if(!(e.amount>0))return;
    if(session.time<untouchable){e.amount=0;return;}
    if(stat('jug.thickSkin')&&firstHit){e.amount*=1-stat('jug.thickSkin');}
    firstHit=false;
    if(stat('jug.armor'))e.amount*=1-stat('jug.armor');
    // Dying Wish: once a round, a downing hit leaves you on 1 health and untouchable
    if(stat('qr.dyingWish')&&!dyingUsed&&e.amount>=session.health){dyingUsed=true;e.amount=Math.max(0,session.health-1);untouchable=session.time+stat('qr.dyingWish');api.toast?.('DYING WISH',1.5);}
  });
  // Probiotic / Reinforced: max health on top of whatever defines it (player-health)
  {const proto=Object.getOwnPropertyDescriptor(session,'maxHealth')??Object.getOwnPropertyDescriptor(Object.getPrototypeOf(session),'maxHealth');
    if(proto?.get)Object.defineProperty(session,'maxHealth',{configurable:true,get(){return proto.get.call(this)+stat('jug.health');}});}
  // Stamin-Up / Mule Kick speeds on top of the getters perks-plus defined
  for(const [key,bonus] of [['moveSpeed',()=>stat('su.walk')+(session.time<boostUntil?stat('su.freeFaller'):0)+((session.inventory?.filter(w=>!w.lost).length??0)>=3?stat('mk.speed'):0)],
    ['sprintSpeed',()=>stat('su.sprint')+(session.time<boostUntil?stat('su.freeFaller'):0)+((session.inventory?.filter(w=>!w.lost).length??0)>=3?stat('mk.speed'):0)]]){
    const d=Object.getOwnPropertyDescriptor(player,key);let base=player[key];
    const get=d?.get?()=>d.get.call(player):()=>base,set=d?.set?v=>d.set.call(player,v):v=>{base=v;};
    Object.defineProperty(player,key,{configurable:true,get:()=>get()*(1+bonus()),set});
  }
  host.on('fall',e=>{if(stat('su.freeFaller')){e.amount=0;boostUntil=session.time+3;}});
  // Supercharged: the classes mod multiplies its charge by this
  window.kino.chargeMul=()=>1+stat('sc.charge');
  // Fast Hands
  const reload=session.reload.bind(session);
  session.reload=(...a)=>{const r=reload(...a);const k=1-stat('sc.reload');if(r&&k<1){session.reloadLeft*=k;session.reloadDuration*=k;}return r;};
  // PhD: wider blasts, an echo, Flash Point (the class skill), PhD Slider
  window.kino.phdScale=()=>1+stat('phd.radius');
  host.on('phdBlast',e=>{const k=stat('phd.echo');if(k&&!e.echo)setTimeout(()=>window.kino.phd?.flop(e.at,{power:k,echo:true}),1000);});
  host.on('abilityUsed',()=>{if(stat('phd.flash'))window.kino.phd?.flop(player.getFeetPosition());});

  // your bullets
  host.on('beforeEnemyDamage',e=>{
    const z=e.enemy;if(!z||host.remoteDamage||e.cause!=='bullet')return;
    let k=1;
    if(e.head){k+=stat('dt.head')+stat('ds.head');
      if(stat('dt.headPoints'))session.addPoints?.(stat('dt.headPoints'));
      if(stat('ds.mark'))z.dsMark=session.time+3;
      if(stat('ds.crit')&&++headCount%stat('ds.crit')===0)k*=3;}
    k+=stat('dt.dmg');
    if(z.dsMark>session.time)k+=stat('ds.mark');
    if(stat('mk.third')&&session.inventory?.[2]&&session.inventory[2]===session.weapon)k+=stat('mk.third');
    if(stat('dt.double')&&Math.random()<stat('dt.double'))k*=2;
    e.amount*=k;
  });
  host.on('kill',e=>{
    if(e.remote)return;const z=e.enemy,cause=z?.lastCause;
    if(stat('qr.killHeal'))session.health=Math.min(session.maxHealth,session.health+stat('qr.killHeal'));
    if(stat('sc.quickMag')&&session.reloadLeft>0)session.reloadLeft*=1-stat('sc.quickMag');
    if(stat('mk.scav')&&Math.random()<stat('mk.scav')){const w=session.weapon,d=w&&data.weapons[w.id];if(d){const max=w.upgraded?d.upgrade?.maxAmmo??d.maxAmmo:d.maxAmmo;w.reserve=Math.min(max,w.reserve+Math.ceil(max*.1));}}
    // Dead Head: a headshot kill bursts
    if(stat('ds.deadHead')&&e.head&&cause==='bullet'&&z){const at=z.root.position.clone(),dmg=full()*stat('ds.deadHead');
      setTimeout(()=>{for(const o of [...enemies.list])if(o.root.position.distanceTo(at)<110)enemies.hurt(o,dmg,false,false,'explosion',false);window.kino.fx?.explosion?.(at.clone().addScaledVector(up,40),.35,0xd0e4ff);},0);}
  });

  // per frame: regen, Phantom Reload, Ammo Mule, Hot Foot, PhD Slider
  const stowed=new WeakMap();let muleT=10;
  host.on('update',dt=>{
    if(!dt||!api.getState?.().active)return;const t=session.time;
    // Durable Heal / Quick Recovery (the base regen starts 2 s after a hit with Quick Revive)
    if(has(QR)&&session.health<session.maxHealth&&session.phase!=='reviving'){const since=t-session.damageTime,start=2-stat('qr.delay');let k=0;
      if(since>start&&since<=2)k+=1;if(since>start)k+=stat('qr.regenMul');if(k)session.health=Math.min(session.maxHealth,session.health+dt*session.maxHealth*.25*k);}
    if(stat('sc.phantom'))for(const w of session.inventory??[]){if(w===session.weapon||w.lost){stowed.delete(w);continue;}
      const since=stowed.get(w)??t;stowed.set(w,since);const d=data.weapons[w.id];if(!d||t-since<stat('sc.phantom'))continue;
      const clip=w.upgraded?d.upgrade?.clipSize??d.clipSize:d.clipSize,need=Math.min(clip-w.mag,w.reserve);if(need>0){w.mag+=need;w.reserve-=need;}}
    if(stat('mk.ammo')&&(muleT-=dt)<=0){muleT=10;for(const w of session.inventory??[]){const d=data.weapons[w.id];if(!d||w.lost)continue;const max=w.upgraded?d.upgrade?.maxAmmo??d.maxAmmo:d.maxAmmo;w.reserve=Math.min(max,w.reserve+Math.ceil(max*stat('mk.ammo')));}}
    const feet=player.getFeetPosition();
    if(stat('su.hotFoot')&&player.input?.sprint)for(const z of [...enemies.list]){if(z.root.position.distanceTo(feet)>75)continue;
      if((z.hotT=(z.hotT??0)-dt)<=0){z.hotT=.5;enemies.hurt(z,full()*stat('su.hotFoot')*.5,false,false,'fire',false);window.kino.fx?.burn?.(z.root.position.clone().addScaledVector(up,40));}}
    const sliding=!!window.kino.movement?.state?.sliding;
    if(stat('phd.slider')&&sliding&&!slideUsed&&enemies.list.some(z=>z.root.position.distanceTo(feet)<70)){slideUsed=true;window.kino.phd?.flop(feet);}
    if(!sliding)slideUsed=false;
  });

  // ---- ammo mod augments -----------------------------------------------------------------------------------------
  host.on('ammoModTune',e=>{
    for(const fx of ammoFx[e.id]??[]){const p=e.params;
      for(const [k,v] of Object.entries(fx.set??{}))p[k]=v;
      for(const [k,v] of Object.entries(fx.add??{}))p[k]=(p[k]??0)+v;
      for(const [k,v] of Object.entries(fx.mul??{}))p[k]=(p[k]??0)*v;
      for(const [k,v] of Object.entries(fx.max??{}))p[k]=Math.max(p[k]??0,v);}
  });
  host.on('ammoModProc',e=>{for(const fx of ammoFx[e.id]??[])if(fx.chance)e.chance*=fx.chance;});
  host.on('ammoModFired',e=>{
    for(const fx of ammoFx[e.id]??[]){
      // Ice Cloud / Wildfire: the proc spreads to neighbours
      if(fx.spread){const at=e.enemy.root.position;for(const z of enemies.list.filter(o=>o!==e.enemy&&o.root.position.distanceTo(at)<fx.spread.r).slice(0,fx.spread.n))window.kino.ammoMods?.trigger(e.id,z,e.tier);}
      // Ammo Theorem: refill part of the magazine
      if(fx.refill){const w=session.weapon,d=w&&data.weapons[w.id];if(d){const clip=w.upgraded?d.upgrade?.clipSize??d.clipSize:d.clipSize,add=Math.min(Math.ceil(clip*fx.refill),clip-w.mag,w.reserve);if(add>0){w.mag+=add;w.reserve-=add;}}}
    }
  });

  // ---- pause menu: the active research and the augments locked in for this match ------------------------------------
  const panel=document.createElement('div');panel.id='research-panel';
  const css=document.createElement('style');css.textContent='#research-panel{margin:8px 0;font-size:11px;letter-spacing:.06em;line-height:1.6;color:#b9b2a3}#research-panel b{color:#f0c060;font-weight:600}#research-panel span{color:#e8dcc0}';document.head.append(css);
  let lastPanel='';
  function renderPanel(){
    const anchor=document.getElementById('gunsmith-panel')??document.getElementById('loadout-panel')??document.querySelector('#menu .menu-controls');
    if(anchor&&anchor.nextElementSibling!==panel)anchor.after(panel);
    const a=R.active&&cfg.items.flatMap(i=>i.augments.map(x=>({...x,item:i}))).find(x=>x.id===R.active);
    const html=(a?`<div><b>RESEARCHING</b> ${a.name} · ${a.item.name} · ${Math.floor(R.progress[a.id]??0).toLocaleString()} / ${(cfg.cost[a.kind]).toLocaleString()} XP</div>`:'')+
      (list.length?`<div><b>AUGMENTS</b> ${list.map(x=>`<span>${x.name}</span> (${x.itemName})`).join(' · ')}</div>`:'');
    if(html!==lastPanel){lastPanel=html;panel.innerHTML=html;}
  }
  let panelT=0;host.on('update',dt=>{if((panelT-=dt||.016)<=0){panelT=1;renderPanel();}});
  addEventListener('keydown',e=>{if(e.code==='Escape')setTimeout(renderPanel,0);});
  renderPanel();

  window.kino.research={get equipped(){return list.map(a=>a.id);},get state(){return R;},stat,lockIn,earn};
}
