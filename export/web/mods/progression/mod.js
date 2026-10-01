// Progression & loadouts: XP from kills and rounds, levels, unlockable
// starting weapons and passive bonuses. Tuning lives in progression.json; the
// profile (shared with the main menu) is in ../../profile.js.
import { makeWeapon } from '../../rules.js';
import { loadProfile, saveProfile, xpToNext as curve, unlocks as unlocksFor, validLoadout, cloudReady } from '../../profile.js';

export default async function setup(api){
  const {data,session,host,mod}=api;
  await cloudReady;
  const config=await fetch(new URL('progression.json',mod.url)).then(r=>r.json());
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('progression.css',mod.url).href;document.head.append(css);

  const bonuses=Object.fromEntries(config.bonuses.map(b=>[b.id,b]));
  const xpToNext=level=>curve(config,level);
  const unlocked=level=>unlocksFor(config,level,data.weapons);

  // The menu may have changed the profile in another tab; re-read on focus.
  let profile=loadProfile();
  addEventListener('focus',()=>{if(!api.getState().started){profile=loadProfile();renderMenu();renderHud();}});
  let saveTimer=0;
  // Weapon XP and attachments belong to the weapon-levels mod, which saves them
  // itself; take the stored ones so this (older) copy never overwrites them.
  const write=()=>{const fresh=loadProfile();profile.weaponXp=fresh.weaponXp;profile.attachments=fresh.attachments;profile.camo=fresh.camo;saveProfile(profile);};
  function save(now=false){clearTimeout(saveTimer);if(now)write();else saveTimer=setTimeout(write,1500);}
  addEventListener('pagehide',()=>save(true));

  // ---- Applying the loadout to each new game -------------------------------
  let active={primary:'m1911_zm',secondary:'',bonuses:new Set()};
  function applyLoadout(){
    const l=validLoadout(config,profile,data.weapons);active={...l,bonuses:new Set(l.bonuses)};
    const full=active.bonuses.has('bandolier');
    session.inventory=[active.primary,active.secondary].filter(Boolean).map(id=>makeWeapon(data.weapons[id],full));
    session.slot=0;
    if(active.bonuses.has('deep_pockets'))session.points+=bonuses.deep_pockets.value;
    // the loadout's tactical (Monkey Bombs, or the Gersh/QED from the moon-equipment mod)
    if(l.tactical==='zombie_cymbal_monkey')session.giveMonkeys?.();else if(l.tactical)window.kino.tactical?.give?.(l.tactical,true);
  }
  host.on('reset',applyLoadout);
  applyLoadout();await api.equipView();

  host.on('beforeDamage',e=>{if(active.bonuses.has('iron_skin'))e.amount*=1-bonuses.iron_skin.value;});
  host.on('beforePoints',e=>{if(active.bonuses.has('scavenger')&&e.amount>0)e.amount=Math.round(e.amount*(1+bonuses.scavenger.value));});
  host.on('beforeEnemyDamage',e=>{if(active.bonuses.has('hollow_points')&&e.cause==='bullet')e.amount*=1+bonuses.hollow_points.value;});

  // ---- XP and levels --------------------------------------------------------
  let gameXp=0;
  // A game where the cheat console was used earns nothing and records no stats.
  const cheating=()=>!!window.kino.cheats?.used;
  function grant(amount){
    if(amount<=0||cheating())return;
    profile.xp+=amount;gameXp+=amount;
    const before=unlocked(profile.level);
    let levelled=false;
    while(profile.xp>=xpToNext(profile.level)){profile.xp-=xpToNext(profile.level);profile.level++;levelled=true;}
    if(levelled){
      const now=unlocked(profile.level);
      const news=[...now.weapons.filter(id=>!before.weapons.includes(id)).map(id=>data.weapons[id].name),
        ...now.bonuses.filter(id=>!before.bonuses.includes(id)).map(id=>bonuses[id].name),
        ...(now.secondary&&!before.secondary?['Second loadout weapon']:[]),
        ...(now.bonusSlots>before.bonusSlots?['Second bonus slot']:[])];
      api.announce('Level '+profile.level,'RANK UP',4);
      if(news.length)api.toast('Unlocked: '+news.join(', '),5);
      renderMenu();
    }
    save();renderHud();
  }
  host.on('kill',({kind,head,melee,remote})=>{
    if(remote||cheating())return;   // a co-op teammate's kill, applied on the host; or a cheat game
    const xp=config.xp;
    grant(kind==='dog'?xp.hellhound:xp.kill+(head?xp.headshot:0)+(melee?xp.melee:0));
    profile.kills++;
  });
  host.on('roundEnd',({round})=>{if(cheating())return;grant(round*config.xp.roundSurvivedPerRound);profile.bestRound=Math.max(profile.bestRound,round);});
  host.on('start',()=>{profile=loadProfile();gameXp=0;profile.games++;save();});
  // The game writes its results line right after this event, so append afterwards.
  host.on('gameOver',()=>{save(true);renderMenu();queueMicrotask(()=>{const r=document.getElementById('results');if(r)r.textContent+=cheating()?' · cheats on, no XP or stats':` · +${gameXp} XP`;});});

  // ---- HUD --------------------------------------------------------------------
  const hud=document.createElement('div');hud.id='progression-hud';
  hud.innerHTML='<span class="lvl"></span><div class="bar"><i></i></div>';
  document.body.append(hud);
  function renderHud(){
    hud.querySelector('.lvl').textContent='LV '+profile.level;
    hud.querySelector('i').style.width=(100*profile.xp/xpToNext(profile.level)).toFixed(1)+'%';
  }
  renderHud();

  // ---- Pause/start menu summary ----------------------------------------------
  // Loadouts are edited in the main menu (/); this card shows the active one.
  const panel=document.createElement('div');panel.id='loadout-panel';
  document.querySelector('#menu .menu-controls')?.before(panel);
  function renderMenu(){
    const l=validLoadout(config,profile,data.weapons),need=xpToNext(profile.level);
    const names=[l.primary,l.secondary].filter(Boolean).map(id=>data.weapons[id].name).join(' + ');
    const perks=l.bonuses.map(id=>bonuses[id].name).join(', ')||'No bonus';
    panel.innerHTML=`
      <div class="head"><span class="eyebrow">LOADOUT</span><strong>LEVEL ${profile.level}</strong><span class="xp">${profile.xp} / ${need} XP</span></div>
      <div class="bar"><i style="width:${(100*profile.xp/need).toFixed(1)}%"></i></div>
      <p class="line"><b>${names}</b> · ${perks}</p>
      <a class="edit" href="./">Main menu · change loadout</a>`;
  }
  panel.addEventListener('click',e=>e.stopPropagation());
  renderMenu();

  window.kino.progression={get profile(){return profile;},grant,save,reset:()=>{localStorage.removeItem('kino.mods.progression');location.reload();}};
}
