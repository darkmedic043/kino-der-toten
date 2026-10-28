// Gobblegums (roadmap Phase 2): you start a match with none and roll them at a terminal (the GUMS app,
// a slot-machine reel over your pack). A hand of up to three; N chews the selected one, J picks the next.
// The pack, the rarity ladder and the unlocks live in gums.js / gums.json; the pack is built in the main
// menu (Armory → Gobblegums) and is not used up. window.kino.gobblegums is what the terminal talks to.
import * as THREE from 'three';
import { zombieHealth } from '../../rules.js';
import { loadGums, loadGumProfile, gumById, activePack } from './gums.js';
import { loadProfile, cloudReady, unlockLvl } from '../../profile.js';
import { PERKS, perkUnlocked } from '../terminal-booth/desktop.js';

export default async function setup(api){
  const {session,host,powerups,enemies,player,mod}=api;
  await cloudReady;
  const cfg=await loadGums(mod.url),by=gumById(cfg),rarity=Object.fromEntries(cfg.rarities.map(r=>[r.id,r]));
  const pack=()=>activePack(cfg,unlockLvl(loadProfile()),loadGumProfile().pack);

  // ---- state: the hand, rolls this round, what's active ------------------------------------------
  const st={hand:[],sel:0,rolls:0,timed:{},armed:new Set(),charges:{}};
  const reset=()=>{endEnhance();st.hand=[];st.sel=0;st.rolls=0;st.timed={};st.armed.clear();st.charges={};hud();};
  host.on('reset',reset);
  host.on('roundEnd',()=>{st.rolls=0;});
  const live=id=>(st.timed[id]??0)>session.time;

  // ---- rolling (the terminal's GUMS app) ------------------------------------------------------------
  const price=()=>cfg.rollPrices[Math.min(st.rolls,cfg.rollPrices.length-1)];
  function status(){
    const p=pack(),pool=p.ids.filter(id=>!st.hand.includes(id));
    return {pack:p.ids.map(id=>({...by[id],color:rarity[by[id].rarity]?.color})),ok:p.ok,problems:p.problems,auto:p.auto,
      hand:st.hand.map(id=>by[id].name),handSize:cfg.handSize,full:st.hand.length>=cfg.handSize,rolls:st.rolls,rollsPerRound:cfg.rollsPerRound,
      price:price(),points:session.points,pool:pool.length,rarities:cfg.rarities};
  }
  // returns {id} on success (the reel lands on it) or a reason
  function roll(){
    const s=status();
    if(!s.ok)return s.problems[0]??'No usable pack';
    if(st.rolls>=cfg.rollsPerRound)return `${cfg.rollsPerRound} gums a round · wait for the next round`;
    const pool=pack().ids.filter(id=>!st.hand.includes(id));if(!pool.length)return 'Nothing left in your pack to roll';
    if(!session.spend(s.price))return 'Not enough points';
    st.rolls++;const id=pool[Math.floor(Math.random()*pool.length)];
    // a full hand rolls too (user, 2026-10-14): the terminal then asks which held gum to swap out, or to keep the hand
    const full=st.hand.length>=cfg.handSize;
    return {id,full,commit:(slot)=>{
      if(!full){st.hand.push(id);st.sel=st.hand.length-1;}
      else if(slot!=null&&st.hand[slot]){const old=st.hand[slot];st.hand[slot]=id;st.sel=slot;api.toast(`${by[old].name} swapped for ${by[id].name}`,3);}
      else return;   // kept the hand: the rolled gum is dropped
      hud();api.toast(`${by[id].name} · N to chew`,3);}};
  }

  // ---- chewing ----------------------------------------------------------------------------------------
  // Power-up gums drop the power-up in front of you (outside the 64-unit pickup radius) so you choose when to
  // grab it: along the look direction, pulled in short of walls, then dropped onto the floor below.
  const feet=()=>new THREE.Vector3().copy(player.feetPosition??api.camera.position);
  const DROP_AHEAD=110;
  function dropPoint(angle=0){
    const f=feet(),dir=api.camera.getWorldDirection(new THREE.Vector3());dir.y=0;
    if(dir.lengthSq()<1e-6)dir.set(0,0,-1);dir.normalize().applyAxisAngle(new THREE.Vector3(0,1,0),angle);
    const eye=f.clone().add(new THREE.Vector3(0,40,0)),world=api.world;
    const wall=world?.raycast?.(new THREE.Ray(eye.clone(),dir),0,DROP_AHEAD+30);
    const p=eye.clone().addScaledVector(dir,wall?Math.max(0,wall.distance-30):DROP_AHEAD);
    const top=p.y+30,floor=world?.raycast?.(new THREE.Ray(new THREE.Vector3(p.x,top,p.z),new THREE.Vector3(0,-1,0)),0,200);
    p.y=floor&&top-floor.distance>f.y-120?top-floor.distance:f.y;
    return p;
  }
  const drop=(type,angle=0)=>powerups?.spawn(type,dropPoint(angle));
  const PERKAHOLIC=6;
  const perkList=()=>PERKS.filter(p=>!session.perks?.has(p.id)&&perkUnlocked(p));   // pass-locked perks (Widow's Wine) only once owned
  function givePerk(p){
    if(api.perkInfo&&!api.perkInfo[p.id])api.perkInfo[p.id]={name:p.name,price:p.price,color:p.color,icon:p.badge};
    session.perks.add(p.id);session.health=session.maxHealth;
  }
  function chew(){
    const id=st.hand[st.sel];if(!id)return;
    const g=by[id],st0=api.getState?.();if(st0&&(!st0.active||session.phase==='reviving'||session.phase==='gameover'))return;
    if(id==='ephemeral_enhancement'&&!canEnhance()){api.toast('Ephemeral Enhancement · the gun in hand can\'t be upgraded',3);return;}
    st.hand.splice(st.sel,1);st.sel=Math.min(st.sel,Math.max(0,st.hand.length-1));
    if(g.powerup)drop(g.powerup);
    // several power-ups fan out in an arc ahead of you
    if(g.powerups)g.powerups.forEach((t,i,a)=>drop(t,(i-(a.length-1)/2)*.42));
    if(g.points)session.points+=g.points;
    if(id==='perkaholic'){const rest=perkList();for(let i=0;i<PERKAHOLIC&&rest.length;i++)givePerk(rest.splice(Math.floor(Math.random()*rest.length),1)[0]);}   // 6 random perks you don't have (was every perk; user, 2026-10-18: more perks keep coming)
    if(g.type==='timed')st.timed[id]=session.time+g.duration;
    if(g.type==='conditional'){st.armed.add(id);if(g.charges)st.charges[id]=g.charges;}
    if(id==='on_the_house'){const rest=perkList();if(rest.length){const p=rest[Math.floor(Math.random()*rest.length)];givePerk(p);api.toast(`On the House · ${p.name}`,3);}}
    if(id==='equip_mint'){session.grenades=Math.max(session.grenades,4);if(session.claymoresOwned)session.claymores=session.claymoreMax?.()??2;if(session.monkeysOwned)session.monkeys=session.monkeyMax?.()??3;const t=window.kino.tactical;if(t?.id)t.count=Math.max(t.count,t.max?.()??3);}
    if(id==='ephemeral_enhancement')startEnhance();
    // Melon Pass Season 1 gums (pass-exclusive)
    if(id==='vine_snare'){const f=feet();for(const z of enemies.list)if(z.root.position.distanceTo(f)<g.radius)rooted.set(z,{until:session.time+g.root,at:z.root.position.clone()});window.kino.fx?.explosion?.(f.clone().add(new THREE.Vector3(0,5,0)),.5,0x5fd13a);}
    if(id==='pumpkin_bomb'){const eye=api.camera.position.clone(),dir=api.camera.getWorldDirection(new THREE.Vector3()),hit=api.world?.raycast?.(new THREE.Ray(eye.clone(),dir),0,600);
      const at=eye.addScaledVector(dir,hit?Math.max(40,hit.distance-10):600);setTimeout(()=>{const full=zombieHealth(session.round,api.data.rules)*2;
        for(const z of [...enemies.list]){const d=z.root.position.distanceTo(at);if(d<g.radius)enemies.hurt(z,full*(1-.5*d/g.radius),false,false,'explosion');}
        window.kino.fx?.explosion?.(at,1.3,0xff8a1a);api.audio?.play?.('explosion');},1000);}
    if(id==='cornucopia'){const pool=(api.data.boxPool??[]).filter(w=>api.data.weapons[w]?.upgrade&&!session.inventory.some(x=>x.id===w&&!x.lost));
      const w=pool[Math.floor(Math.random()*pool.length)];if(w){upgradeNext=w;session.giveWeapon(w);api.equipView?.();}}
    api.announce?.(g.name,rarity[g.rarity]?.name.toUpperCase()+' GOBBLEGUM',2.5);
    gumSound(g.rarity);hud();host.emit('gumChewed',{id});   // credits: challenges
  }
  addEventListener('keydown',e=>{
    if(e.repeat||!api.getState?.().active)return;
    if(e.code==='KeyN'){chew();}
    else if(e.code==='KeyJ'&&st.hand.length){st.sel=(st.sel+1)%st.hand.length;hud();}
  });

  // ---- the effects -------------------------------------------------------------------------------------
  // Melon Pass gums: kills (Bountiful Harvest, Harvest Moon, Reaper's Toll, Melon Smash), Root Rot slows, Vine Snare roots
  const rooted=new Map(),rotting=new Map();let moonKills=0;
  host.on('kill',e=>{
    if(e.remote)return;const z=e.enemy;
    if(live('bountiful_harvest'))session.points+=by.bountiful_harvest.killPoints;
    if(live('reapers_toll')){const g=by.reapers_toll,w=session.weapon,d=w&&api.data.weapons[w.id];session.health=Math.min(session.maxHealth,session.health+g.heal);
      if(d){const clip=w.upgraded?d.upgrade?.clipSize??d.clipSize:d.clipSize;w.mag=Math.min(clip,w.mag+g.bullets);}}
    if(live('harvest_moon')&&++moonKills%by.harvest_moon.every===0&&z){const types=['nuke','insta_kill','double_points','full_ammo','carpenter'];powerups?.spawn(types[Math.floor(Math.random()*types.length)],z.root.position.clone());}
    if(st.armed.has('melon_smash')&&(e.melee||z?.lastCause==='melee')&&z){const at=z.root.position.clone(),hp=zombieHealth(session.round,api.data.rules)*.6;
      setTimeout(()=>{for(const o of [...enemies.list])if(o.root.position.distanceTo(at)<by.melon_smash.radius)enemies.hurt(o,hp,false,false,'explosion',false);window.kino.fx?.explosion?.(at.clone().add(new THREE.Vector3(0,30,0)),.5,0x3fd16a);},0);spendCharge('melon_smash');}
  });
  host.on('beforeEnemyDamage',e=>{if(live('root_rot')&&e.cause==='bullet'&&e.enemy&&!rotting.has(e.enemy)){const k=1-by.root_rot.slow;e.enemy.speed*=k;rotting.set(e.enemy,{until:session.time+2,k});}else if(rotting.has(e.enemy))rotting.get(e.enemy).until=session.time+2;});
  host.on('update',()=>{const t=session.time;
    for(const [z,r] of rooted){if(!enemies.list.includes(z)||t>r.until){rooted.delete(z);continue;}z.root.position.x=r.at.x;z.root.position.z=r.at.z;z.stuck=0;}
    for(const [z,r] of rotting)if(!enemies.list.includes(z)||t>r.until){if(enemies.list.includes(z))z.speed/=r.k;rotting.delete(z);}});
  host.on('reset',()=>{rooted.clear();rotting.clear();moonKills=0;});
  // a conditional gum with charges (Pop Shocks, Burned Out) spends one; it disarms at zero
  function spendCharge(id){if(--st.charges[id]<=0){st.armed.delete(id);delete st.charges[id];}hud();}
  // kill the zombies within r of p (deferred: these run inside enemies.hurt / session.damage)
  const blast=(p,r,cause,skip)=>setTimeout(()=>{for(const z of [...enemies.list])if(z!==skip&&z.health>0&&z.root.position.distanceTo(p)<r)enemies.hurt(z,100000,false,false,cause);},0);
  host.on('beforeEnemyDamage',e=>{
    if(e.cause==='melee'&&st.armed.has('pop_shocks')&&e.enemy){blast(e.enemy.root.position.clone(),by.pop_shocks.radius,'shock',e.enemy);spendCharge('pop_shocks');}
  });
  host.on('beforeDamage',e=>{
    if(e.amount>0&&st.armed.has('burned_out')){blast(feet(),by.burned_out.radius,'fire');spendCharge('burned_out');}
  });
  // Power Vacuum: a far higher power-up drop chance (the per-round cap still applies)
  const drops=session.drops,tryDrop=drops?.tryDrop?.bind(drops);
  if(tryDrop)drops.tryDrop=(s,o)=>{let r=tryDrop(s,o);if(!r&&live('power_vacuum')&&Math.random()<by.power_vacuum.chance){drops.pending=true;r=tryDrop(s,o);}return r;};
  // Ephemeral Enhancement: Pack-a-Punch the gun in hand, put it back when the gum runs out
  let enhanced=null;
  const canEnhance=()=>{const w=session.weapon;return !!(w&&!w.upgraded&&api.data.weapons[w.id]?.upgrade);};
  function startEnhance(){
    const w=session.weapon,d=api.data.weapons[w.id];
    enhanced=w;w.upgraded=true;w.mag=d.upgrade.clipSize??d.clipSize;w.reserve=d.upgrade.maxAmmo??d.maxAmmo;api.equipView?.();
  }
  function endEnhance(){
    const w=enhanced;enhanced=null;if(!w||!w.upgraded)return;const d=api.data.weapons[w.id];
    w.upgraded=false;w.mag=Math.min(w.mag,d.clipSize);w.reserve=Math.min(w.reserve,d.maxAmmo);if(!w.lost&&session.inventory.includes(w))api.equipView?.();
  }
  host.on('beforeEnemyDamage',e=>{if(live('sword_flay')&&e.cause==='melee')e.amount*=by.sword_flay.meleeMul;});
  // Temporal Gift: picked-up timed power-ups last longer
  const powerup=session.powerup?.bind(session);
  if(powerup)session.powerup=(type,...rest)=>{const twice=st.armed.has('second_helping');if(twice){st.armed.delete('second_helping');hud();powerup(type,...rest);api.toast('Second Helping · '+type.replace('_',' '),2);}const r=powerup(type,...rest);if(twice&&session.effects[type]>session.time)session.effects[type]+=30;   // the second activation doubles a timed power-up
    if(live('temporal_gift')&&session.effects[type]>session.time)session.effects[type]+=by.temporal_gift.extend;return r;};
  // Idle Eyes / In Plain Sight: zombies hold still (their goal becomes where they stand)
  const lure=enemies.lureTarget?.bind(enemies);
  enemies.lureTarget=z=>{
    if(live('idle_eyes')||live('in_plain_sight'))return z.root.position;
    if(live('scarecrow')){const f=feet(),d=z.root.position.clone().sub(f).setY(0);if(d.length()<by.scarecrow.radius)return z.root.position.clone().addScaledVector(d.normalize(),400);}
    return lure?lure(z):null;};
  // Shopping Free: purchases succeed without taking points
  const spend=session.spend.bind(session);
  session.spend=n=>live('shopping_free')&&n>0?true:spend(n);
  // Soda Fountain: the next perk you drink brings a random second one
  let perksBefore=new Set(session.perks);
  host.on('update',()=>{
    const now=session.perks;
    if(st.armed.has('soda_fountain')&&[...now].some(p=>!perksBefore.has(p))){
      st.armed.delete('soda_fountain');const rest=perkList();
      if(rest.length){const p=rest[Math.floor(Math.random()*rest.length)];givePerk(p);api.toast(`Soda Fountain · ${p.name}`,3);}hud();
    }
    perksBefore=new Set(now);
    if(enhanced&&!live('ephemeral_enhancement'))endEnhance();
    // Free Fire: the magazine in hand stays full
    if(live('free_fire')){const w=session.weapon,d=w&&api.data.weapons[w.id];if(d){const clip=w.upgraded?d.upgrade?.clipSize??d.clipSize:d.clipSize;if(clip&&w.mag<clip)w.mag=clip;}}
    if(Object.values(st.timed).some(t=>t>session.time-1))hud();
  });
  // Crate Power / Wall Power: the next box gun / wall gun comes Pack-a-Punched
  let upgradeNext=null;
  const take=api.mysteryBox?.take?.bind(api.mysteryBox);
  if(take)api.mysteryBox.take=e=>{const id=take(e);if(id&&st.armed.has('crate_power')&&api.data.weapons[id]?.upgrade){upgradeNext=id;st.armed.delete('crate_power');hud();}return id;};
  const buyWall=api.shop?.buyWall?.bind(api.shop);
  if(buyWall)api.shop.buyWall=id=>{const owned=session.inventory.some(w=>w.id===id&&!w.lost),arm=!owned&&st.armed.has('wall_power')&&api.data.weapons[id]?.upgrade;
    if(arm)upgradeNext=id;const ok=buyWall(id);if(arm&&ok){st.armed.delete('wall_power');hud();}else if(arm)upgradeNext=null;return ok;};
  const giveWeapon=session.giveWeapon.bind(session);
  session.giveWeapon=(id,...rest)=>{const r=giveWeapon(id,...rest);
    if(id===upgradeNext){upgradeNext=null;const w=session.inventory.find(w=>w.id===id&&!w.lost);
      if(w){const d=api.data.weapons[id],u={...d,...d.upgrade};w.upgraded=true;w.mag=u.clipSize;w.reserve=u.maxAmmo;api.equipView?.();api.toast(`${d.upgrade.name??d.name} · Pack-a-Punched`,3);}}
    return r;};

  // ---- sound: a short synthesized pop, brighter for rarer gums --------------------------------------------
  function gumSound(r){
    const ctx=api.audio?.ctx,out=api.audio?.master;if(!ctx||!out)return;
    const t=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain(),f={rare:520,epic:660,legendary:780,ultra:980}[r]??520;
    o.type='triangle';o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(f*2.2,t+.12);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.25,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+.3);
    o.connect(g).connect(out);o.start(t);o.stop(t+.32);
  }

  // ---- HUD: the hand (three slots, rarity colours), timers and armed gums ------------------------------------
  const el=document.createElement('div');el.id='gum-hud';document.body.append(el);
  const css=document.createElement('style');css.textContent=`
    #gum-hud{position:fixed;left:40px;bottom:150px;display:flex;flex-direction:column;gap:6px;font:600 11px/1.2 system-ui,sans-serif;letter-spacing:1px;color:#eee;pointer-events:none;z-index:3;text-shadow:0 1px 2px #000}
    #gum-hud .slots{display:flex;gap:6px}
    #gum-hud .s{width:42px;height:42px;border-radius:50%;border:2px solid #ffffff22;background:#0008;display:grid;place-items:center;font-size:10px}
    #gum-hud .s.g{background:radial-gradient(circle at 35% 30%,#fff8,var(--c) 45%,#000 120%);border-color:var(--c)}
    #gum-hud .s.on{outline:2px solid #fff;outline-offset:2px}
    #gum-hud .name{color:var(--c)}#gum-hud .keys{color:#aaa;font-weight:400}
    #gum-hud .act{display:flex;flex-direction:column;gap:2px}#gum-hud .act span{color:var(--c)}`;
  document.head.append(css);
  function hud(){
    const sel=by[st.hand[st.sel]],act=[...Object.entries(st.timed).filter(([,t])=>t>session.time).map(([id,t])=>`<span style="--c:${rarity[by[id].rarity].color}">${by[id].name} ${Math.ceil(t-session.time)}s</span>`),
      ...[...st.armed].map(id=>`<span style="--c:${rarity[by[id].rarity].color}">${by[id].name} · ARMED${st.charges[id]?` ×${st.charges[id]}`:''}</span>`)];
    if(!st.hand.length&&!act.length){el.innerHTML='';return;}
    el.innerHTML=`${act.length?`<div class="act">${act.join('')}</div>`:''}
      ${st.hand.length?`<div class="slots">${Array.from({length:cfg.handSize},(_,i)=>{const g=by[st.hand[i]];return `<div class="s ${g?'g':''} ${g&&i===st.sel?'on':''}" style="--c:${g?rarity[g.rarity].color:'#555'}"></div>`;}).join('')}</div>
      <div class="name" style="--c:${rarity[sel?.rarity]?.color??'#ccc'}">${sel?.name??''}</div><div class="keys">N chew · J next</div>`:''}`;
  }
  hud();

  window.kino.gobblegums={status,roll,chew,get hand(){return [...st.hand];},cfg,
    give:id=>{if(!by[id]||st.hand.length>=cfg.handSize)return false;st.hand.push(id);hud();return true;},
    // a free gum from your pack (Der Eisendrache's plant): into a free slot, or over the selected one when the hand is full
    gift:()=>{const pool=(pack()?.ids??[]).filter(id=>by[id]&&!st.hand.includes(id));if(!pool.length)return null;const id=pool[Math.floor(Math.random()*pool.length)];
      if(st.hand.length<cfg.handSize){st.hand.push(id);st.sel=st.hand.length-1;}else st.hand[st.sel]=id;hud();api.toast(`${by[id].name} · N to chew`,3);return id;},live,armed:id=>st.armed.has(id)};
}
