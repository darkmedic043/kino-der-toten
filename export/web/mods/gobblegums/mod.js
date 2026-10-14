// Gobblegums (roadmap Phase 2): you start a match with none and roll them at a terminal (the GUMS app,
// a slot-machine reel over your pack). A hand of up to three; N chews the selected one, J picks the next.
// The pack, the rarity ladder and the unlocks live in gums.js / gums.json; the pack is built in the main
// menu (Armory → Gobblegums) and is not used up. window.kino.gobblegums is what the terminal talks to.
import * as THREE from 'three';
import { loadGums, loadGumProfile, gumById, activePack } from './gums.js';
import { loadProfile, cloudReady } from '../../profile.js';
import { PERKS } from '../terminal-booth/desktop.js';

export default async function setup(api){
  const {session,host,powerups,enemies,player,mod}=api;
  await cloudReady;
  const cfg=await loadGums(mod.url),by=gumById(cfg),rarity=Object.fromEntries(cfg.rarities.map(r=>[r.id,r]));
  const pack=()=>activePack(cfg,loadProfile().level??1,loadGumProfile().pack);

  // ---- state: the hand, rolls this round, what's active ------------------------------------------
  const st={hand:[],sel:0,rolls:0,timed:{},armed:new Set()};
  const reset=()=>{st.hand=[];st.sel=0;st.rolls=0;st.timed={};st.armed.clear();hud();};
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
    if(s.full)return 'Your hand is full · chew a gum first (N)';
    if(st.rolls>=cfg.rollsPerRound)return `${cfg.rollsPerRound} gums a round · wait for the next round`;
    const pool=pack().ids.filter(id=>!st.hand.includes(id));if(!pool.length)return 'Nothing left in your pack to roll';
    if(!session.spend(s.price))return 'Not enough points';
    st.rolls++;const id=pool[Math.floor(Math.random()*pool.length)];
    return {id,commit:()=>{st.hand.push(id);st.sel=st.hand.length-1;hud();api.toast(`${by[id].name} · N to chew`,3);}};
  }

  // ---- chewing ----------------------------------------------------------------------------------------
  const feet=()=>new THREE.Vector3().copy(player.feetPosition??api.camera.position);
  const drop=(type,offset=new THREE.Vector3())=>powerups?.spawn(type,feet().add(offset));
  const perkList=()=>PERKS.filter(p=>!session.perks?.has(p.id));
  function givePerk(p){
    if(api.perkInfo&&!api.perkInfo[p.id])api.perkInfo[p.id]={name:p.name,price:p.price,color:p.color,icon:p.badge};
    session.perks.add(p.id);session.health=session.maxHealth;
  }
  function chew(){
    const id=st.hand[st.sel];if(!id)return;
    const g=by[id],st0=api.getState?.();if(st0&&(!st0.active||session.phase==='reviving'||session.phase==='gameover'))return;
    st.hand.splice(st.sel,1);st.sel=Math.min(st.sel,Math.max(0,st.hand.length-1));
    if(g.powerup)drop(g.powerup);
    if(g.powerups)g.powerups.forEach((t,i)=>{const a=i/g.powerups.length*Math.PI*2;drop(t,new THREE.Vector3(Math.cos(a)*70,0,Math.sin(a)*70));});
    if(g.points)session.points+=g.points;
    if(id==='perkaholic')for(const p of perkList())givePerk(p);
    if(g.type==='timed')st.timed[id]=session.time+g.duration;
    if(g.type==='conditional')st.armed.add(id);
    api.announce?.(g.name,rarity[g.rarity]?.name.toUpperCase()+' GOBBLEGUM',2.5);
    gumSound(g.rarity);hud();
  }
  addEventListener('keydown',e=>{
    if(e.repeat||!api.getState?.().active)return;
    if(e.code==='KeyN'){chew();}
    else if(e.code==='KeyJ'&&st.hand.length){st.sel=(st.sel+1)%st.hand.length;hud();}
  });

  // ---- the effects -------------------------------------------------------------------------------------
  host.on('beforeEnemyDamage',e=>{if(live('sword_flay')&&e.cause==='melee')e.amount*=by.sword_flay.meleeMul;});
  // Temporal Gift: picked-up timed power-ups last longer
  const powerup=session.powerup?.bind(session);
  if(powerup)session.powerup=(type,...rest)=>{const r=powerup(type,...rest);if(live('temporal_gift')&&session.effects[type]>session.time)session.effects[type]+=by.temporal_gift.extend;return r;};
  // Idle Eyes / In Plain Sight: zombies hold still (their goal becomes where they stand)
  const lure=enemies.lureTarget?.bind(enemies);
  enemies.lureTarget=z=>live('idle_eyes')||live('in_plain_sight')?z.root.position:lure?lure(z):null;
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
      ...[...st.armed].map(id=>`<span style="--c:${rarity[by[id].rarity].color}">${by[id].name} · ARMED</span>`)];
    if(!st.hand.length&&!act.length){el.innerHTML='';return;}
    el.innerHTML=`${act.length?`<div class="act">${act.join('')}</div>`:''}
      ${st.hand.length?`<div class="slots">${Array.from({length:cfg.handSize},(_,i)=>{const g=by[st.hand[i]];return `<div class="s ${g?'g':''} ${g&&i===st.sel?'on':''}" style="--c:${g?rarity[g.rarity].color:'#555'}"></div>`;}).join('')}</div>
      <div class="name" style="--c:${rarity[sel?.rarity]?.color??'#ccc'}">${sel?.name??''}</div><div class="keys">N chew · J next</div>`:''}`;
  }
  hud();

  window.kino.gobblegums={status,roll,chew,get hand(){return [...st.hand];},cfg,
    give:id=>{if(!by[id]||st.hand.length>=cfg.handSize)return false;st.hand.push(id);hud();return true;},live,armed:id=>st.armed.has(id)};
}
