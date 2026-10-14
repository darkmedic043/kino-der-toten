// Credits in a match (roadmap Phase 6): counts challenge stats, pays first-time round milestones as they happen and the
// match payout on the game-over screen. Nothing in a cheat game (the cheats mod's flag, like the best-round check) or on
// credits.json noPayoutMaps (the Sandbox). Co-op: each player is paid from their own kills and the host's round count.
import { loadCreditsConfig, loadCredits, saveCredits, change, countChallenges, matchPayout } from './credits.js';
import { classOf } from '../weapon-levels/camo.js';

export default async function setup(api){
  const {host,session,data,mod}=api;
  const cfg=await loadCreditsConfig(mod.url);
  const mapId=api.map?.id??'map',paid=()=>!window.kino.cheats?.used&&!(cfg.noPayoutMaps??[]).includes(mapId);
  let stats={},kills=0,flushT=null,perksSeen=new Set(session.perks??[]),upgraded=new WeakSet();
  const add=(k,n=1)=>{stats[k]=(stats[k]??0)+n;clearTimeout(flushT);flushT=setTimeout(flush,2000);};
  function flush(){
    clearTimeout(flushT);if(!Object.keys(stats).length)return;
    const s=stats;stats={};if(!paid())return;
    const c=loadCredits(),done=countChallenges(cfg,c,s);saveCredits(c);
    for(const ch of done)api.toast?.(`${ch.kind.toUpperCase()} CHALLENGE · +${ch.reward} credits`,4);
  }
  host.on('start',()=>{stats={};kills=0;});host.on('reset',()=>{kills=0;});
  host.on('kill',e=>{
    if(e.remote)return;kills++;const cause=e.enemy?.lastCause;add('kills');
    if(e.head){add('headshots');const w=session.weapon;if(w&&classOf(data.weapons,w.id)==='pistol')add('pistolHeadshots');}
    if(e.melee||cause==='melee')add('melee');if(cause==='explosion')add('explosive');
  });
  host.on('beforePoints',e=>{if(e.amount>0)add('points',e.amount);});
  host.on('gumChewed',()=>add('gums'));host.on('abilityUsed',()=>add('ability'));host.on('ammoModFired',()=>add('ammoProcs'));
  host.on('roundEnd',({round})=>{
    add('rounds');add('bestRound',0);stats.bestRound=Math.max(stats.bestRound??0,round+1);
    // first-time milestones on this map
    const reached=round+1,prize=cfg.milestones[String(reached)];
    if(prize&&paid()){const c=loadCredits(),m=c.milestones[mapId]??={};if(!m[reached]){m[reached]=true;change(c,prize,`first time to round ${reached} on ${mapId}`);saveCredits(c);api.announce?.(`ROUND ${reached} MILESTONE`,`+${prize} CREDITS`,3);}}
  });
  const take=api.mysteryBox?.take?.bind(api.mysteryBox);
  if(take)api.mysteryBox.take=(...a)=>{const id=take(...a);if(id)add('box');return id;};
  host.on('update',()=>{
    for(const p of session.perks??[])if(!perksSeen.has(p)){perksSeen.add(p);add('perks');}
    if(session.perks&&session.perks.size<perksSeen.size)perksSeen=new Set(session.perks);
    for(const w of session.inventory??[])if(w.upgraded&&!upgraded.has(w)){upgraded.add(w);add('pap');}
  });
  // the payout, on the game-over screen (after the game writes its results line)
  host.on('gameOver',({round})=>{
    flush();const n=paid()?matchPayout(cfg,{round,kills}):0;
    if(n){const c=loadCredits();change(c,n,`match on ${mapId}: round ${round}, ${kills} kills`);saveCredits(c);}
    queueMicrotask(()=>setTimeout(()=>{const r=document.getElementById('results');if(r)r.textContent+=paid()?` · +${n} credits`:'';},0));
  });
  addEventListener('beforeunload',flush);
  window.kino.credits={get balance(){return loadCredits().balance;},flush,stats:()=>({...stats}),cfg};
}
