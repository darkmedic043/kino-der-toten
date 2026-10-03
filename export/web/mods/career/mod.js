// Lifetime career stats (not part of upstream), stored under kino.mods.career (synced with
// signed-in progress by cloud.js) and shown in the main menu's CAREER tab (home.js).
//   {total:{...}, maps:{[mapId]:{...}}, weapons:{[weaponId]:{...}}}
// Kills are credited to what dealt the killing blow: the gun in hand for bullets, the knife,
// grenades, the Sentry Turret, traps, the Gersh device... Cheat games and teammates' kills
// don't count.
import { loadCareer, CAREER_KEY } from './career.js';

export default function setup(api){
  const {host,session}=api;
  const map=location.pathname.endsWith('zombies.html')?new URLSearchParams(location.search).get('map')??'custom':'kino';
  const cheating=()=>!!window.kino?.cheats?.used;
  let career=loadCareer(),dirty=false,saveT=0;
  const T=()=>career.total,M=()=>career.maps[map]??={},W=id=>career.weapons[id]??={};
  const add=(o,k,n=1)=>{o[k]=(o[k]??0)+n;dirty=true;};
  const max=(o,k,n)=>{if(n>(o[k]??0)){o[k]=n;dirty=true;}};
  const save=()=>{if(!dirty)return;dirty=false;
    // merge into what's stored (another tab or the cloud may have written meanwhile): never lose a count
    try{localStorage.setItem(CAREER_KEY,JSON.stringify(career));}catch{}};
  const base=id=>(id??'').replace(/_upgraded(_zm)?$/,'_zm');
  const gun=()=>base(session.def?.baseId??session.weapon?.id);
  const LAUNCHER=/china_lake|m72_law|crossbow|ray_gun|m1911_upgraded|rpg/;
  // What dealt each enemy's last damage, for kill credit.
  const lastCause=new WeakMap();
  host.on('beforeEnemyDamage',e=>{
    const c=e.cause;let who;
    if(c==='melee')who='knife';
    else if(c==='turret')who='sentry_turret';
    else if(c==='gersh')who='black_hole_bomb';
    else if(c==='electric')who='trap';
    else if(c==='explosion')who=LAUNCHER.test(gun())||session.def?.projectile?gun():'frag_grenade_zm';
    else who=gun();
    if(e.enemy)lastCause.set(e.enemy,who);
  });
  host.on('kill',({enemy,kind,head,melee,remote})=>{
    if(remote||cheating())return;
    const who=(enemy&&lastCause.get(enemy))??(melee?'knife':gun());
    for(const o of [T(),M(),W(who)]){add(o,'kills');if(head)add(o,'headshots');}
    if(melee)add(T(),'meleeKills');if(kind==='dog')add(T(),'dogKills');
  });
  host.on('beforePoints',e=>{if(e.amount>0&&!cheating()){add(T(),'points',e.amount);add(M(),'points',e.amount);}});
  host.on('start',()=>{if(cheating())return;career=loadCareer();add(T(),'games');add(M(),'games');save();});
  // highest round = the round reached (CoD's meaning): the next one once a round is survived
  host.on('roundEnd',({round})=>{if(cheating())return;for(const o of [T(),M()]){add(o,'rounds');max(o,'bestRound',round+1);}save();});
  host.on('gameOver',({round})=>{if(cheating())return;for(const o of [T(),M()]){add(o,'deaths');max(o,'bestRound',round);}save();});
  // Shots, time played and time with each gun, perks drunk, Pack-a-Punches.
  let shots=session.shots??0,drinking=false,packing=false;
  host.on('update',dt=>{
    if(cheating()||!dt)return;
    const g=gun(),s=session.shots??0;if(s>shots){add(T(),'shots',s-shots);add(W(g),'shots',s-shots);}shots=s;
    add(T(),'time',dt);add(M(),'time',dt);if(!session.weaponUnavailable)add(W(g),'time',dt);
    if(session.drinking&&!drinking)add(T(),'perks');drinking=!!session.drinking;
    if(session.pack&&!packing){add(T(),'packs');add(W(base(session.pack.weapon?.id)),'packs');}packing=!!session.pack;
    if((saveT+=dt)>5){saveT=0;save();}
  });
  host.on('reset',()=>{shots=session.shots??0;});
  addEventListener('pagehide',save);
  (window.kino??={}).career={get stats(){return career;},save};
}
