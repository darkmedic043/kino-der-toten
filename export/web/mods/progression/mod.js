// Progression & loadouts: XP from kills and rounds, levels, unlockable
// starting weapons and passive bonuses. Tuning lives in progression.json.
// Progress is saved in this browser's localStorage.
import { makeWeapon } from '../../rules.js';

const STORAGE_KEY='kino.mods.progression';

export default async function setup(api){
  const {data,session,host,mod}=api;
  const config=await fetch(new URL('progression.json',mod.url)).then(r=>r.json());
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('progression.css',mod.url).href;document.head.append(css);

  const weapons=config.weapons.filter(w=>data.weapons[w.id]);
  const bonuses=Object.fromEntries(config.bonuses.map(b=>[b.id,b]));
  const xpToNext=level=>Math.round(config.levelCurve.base*level**config.levelCurve.exponent);

  const profile=loadProfile();
  function loadProfile(){
    const empty={xp:0,level:1,kills:0,games:0,bestRound:0,loadout:{primary:'m1911_zm',secondary:'',bonuses:[]}};
    try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));return saved?{...empty,...saved,loadout:{...empty.loadout,...saved.loadout}}:empty;}catch{return empty;}
  }
  let saveTimer=0;
  function save(now=false){
    clearTimeout(saveTimer);
    const write=()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(profile));}catch{}};
    if(now)write();else saveTimer=setTimeout(write,1500);
  }
  addEventListener('pagehide',()=>save(true));

  const unlocked=level=>({
    weapons:weapons.filter(w=>w.level<=level).map(w=>w.id),
    bonuses:config.bonuses.filter(b=>b.level<=level).map(b=>b.id),
    secondary:level>=config.secondaryLevel,
    bonusSlots:level>=config.secondBonusLevel?2:1,
  });
  // Drop anything the saved loadout no longer qualifies for (mod removed, tuning changed).
  function loadout(){
    const u=unlocked(profile.level),l=profile.loadout;
    const primary=u.weapons.includes(l.primary)?l.primary:'m1911_zm';
    const secondary=u.secondary&&u.weapons.includes(l.secondary)&&l.secondary!==primary?l.secondary:'';
    const chosen=[...new Set(l.bonuses)].filter(id=>u.bonuses.includes(id)).slice(0,u.bonusSlots);
    return {primary,secondary,bonuses:new Set(chosen)};
  }
  let active=loadout();

  // ---- Applying the loadout to each new game -------------------------------
  function applyLoadout(){
    active=loadout();
    const full=active.bonuses.has('bandolier');
    session.inventory=[active.primary,active.secondary].filter(Boolean).map(id=>makeWeapon(data.weapons[id],full));
    session.slot=0;
    if(active.bonuses.has('deep_pockets'))session.points+=bonuses.deep_pockets.value;
  }
  host.on('reset',applyLoadout);
  applyLoadout();await api.equipView();

  host.on('beforeDamage',e=>{if(active.bonuses.has('iron_skin'))e.amount*=1-bonuses.iron_skin.value;});
  host.on('beforePoints',e=>{if(active.bonuses.has('scavenger')&&e.amount>0)e.amount=Math.round(e.amount*(1+bonuses.scavenger.value));});
  host.on('beforeEnemyDamage',e=>{if(active.bonuses.has('hollow_points')&&e.cause==='bullet')e.amount*=1+bonuses.hollow_points.value;});

  // ---- XP and levels --------------------------------------------------------
  let gameXp=0;
  function grant(amount){
    if(amount<=0)return;
    profile.xp+=amount;gameXp+=amount;
    const unlockedBefore=unlocked(profile.level);
    let levelled=false;
    while(profile.xp>=xpToNext(profile.level)){profile.xp-=xpToNext(profile.level);profile.level++;levelled=true;}
    if(levelled){
      const now=unlocked(profile.level);
      const news=[...now.weapons.filter(id=>!unlockedBefore.weapons.includes(id)).map(id=>data.weapons[id].name),
        ...now.bonuses.filter(id=>!unlockedBefore.bonuses.includes(id)).map(id=>bonuses[id].name),
        ...(now.secondary&&!unlockedBefore.secondary?['Second loadout weapon']:[]),
        ...(now.bonusSlots>unlockedBefore.bonusSlots?['Second bonus slot']:[])];
      api.announce('Level '+profile.level,'RANK UP',4);
      if(news.length)api.toast('Unlocked: '+news.join(', '),5);
      renderMenu();
    }
    save();renderHud();
  }
  host.on('kill',({kind,head,melee})=>{
    const xp=config.xp;
    grant(kind==='dog'?xp.hellhound:xp.kill+(head?xp.headshot:0)+(melee?xp.melee:0));
    profile.kills++;
  });
  host.on('roundEnd',({round})=>{grant(round*config.xp.roundSurvivedPerRound);profile.bestRound=Math.max(profile.bestRound,round);});
  host.on('start',()=>{gameXp=0;profile.games++;save();});
  // The game writes its results line right after this event, so append afterwards.
  host.on('gameOver',()=>{save(true);renderMenu();queueMicrotask(()=>{const r=document.getElementById('results');if(r)r.textContent+=` · +${gameXp} XP`;});});

  // ---- HUD --------------------------------------------------------------------
  const hud=document.createElement('div');hud.id='progression-hud';
  hud.innerHTML='<span class="lvl"></span><div class="bar"><i></i></div>';
  document.body.append(hud);
  function renderHud(){
    hud.querySelector('.lvl').textContent='LV '+profile.level;
    hud.querySelector('i').style.width=(100*profile.xp/xpToNext(profile.level)).toFixed(1)+'%';
  }
  renderHud();

  // ---- Menu loadout panel ----------------------------------------------------
  const panel=document.createElement('div');panel.id='loadout-panel';
  const anchor=document.querySelector('#menu .menu-controls');anchor?.before(panel);
  const option=(value,label,enabled)=>`<option value="${value}"${enabled?'':' disabled'}>${label}</option>`;
  function weaponOptions(u,allowNone){
    return (allowNone?option('','— None —',true):'')+weapons.map(w=>option(w.id,data.weapons[w.id].name+(u.weapons.includes(w.id)?'':` · LV ${w.level}`),u.weapons.includes(w.id))).join('');
  }
  function bonusOptions(u){
    return option('','— None —',true)+config.bonuses.map(b=>option(b.id,b.name+(u.bonuses.includes(b.id)?'':` · LV ${b.level}`),u.bonuses.includes(b.id))).join('');
  }
  function renderMenu(){
    const u=unlocked(profile.level),l=loadout(),need=xpToNext(profile.level);
    const bonusRows=[0,1].map(i=>{
      const locked=i>=u.bonusSlots;
      const picked=[...l.bonuses][i]??'';
      return `<label>Bonus ${i+1}<select data-bonus="${i}"${locked?' disabled':''}>${locked?option('',`Unlocks at LV ${config.secondBonusLevel}`,true):bonusOptions(u)}</select></label>`+
        (picked&&!locked?`<small>${bonuses[picked].description}</small>`:'');
    }).join('');
    panel.innerHTML=`
      <div class="head"><span class="eyebrow">LOADOUT</span><strong>LEVEL ${profile.level}</strong><span class="xp">${profile.xp} / ${need} XP</span></div>
      <div class="bar"><i style="width:${(100*profile.xp/need).toFixed(1)}%"></i></div>
      <label>Primary<select data-slot="primary">${weaponOptions(u,false)}</select></label>
      <label>Secondary<select data-slot="secondary"${u.secondary?'':' disabled'}>${u.secondary?weaponOptions(u,true):option('',`Unlocks at LV ${config.secondaryLevel}`,true)}</select></label>
      ${bonusRows}
      <p class="note"></p>
      <p class="stats">${profile.kills.toLocaleString()} kills · best round ${profile.bestRound||'—'} · ${profile.games} games</p>`;
    panel.querySelector('[data-slot=primary]').value=l.primary;
    const sec=panel.querySelector('[data-slot=secondary]');if(u.secondary)sec.value=l.secondary;
    [...l.bonuses].forEach((id,i)=>{const s=panel.querySelector(`[data-bonus="${i}"]`);if(s&&!s.disabled)s.value=id;});
  }
  panel.addEventListener('change',e=>{
    const t=e.target,l=profile.loadout;
    if(t.dataset.slot)l[t.dataset.slot]=t.value;
    if(t.dataset.bonus){const b=[...loadout().bonuses];b[+t.dataset.bonus]=t.value;l.bonuses=b.filter(Boolean);}
    if(l.secondary===l.primary)l.secondary='';
    save(true);renderMenu();
    // Before the first round the change applies right away; mid-game it waits.
    if(!api.getState().started){session.reset();api.equipView();}
    else panel.querySelector('.note').textContent='Loadout changes apply to your next game.';
  });
  // Keep menu clicks from reaching the game's click-to-start handler.
  panel.addEventListener('click',e=>e.stopPropagation());
  renderMenu();

  window.kino.progression={profile,grant,save,reset:()=>{localStorage.removeItem(STORAGE_KEY);location.reload();}};
}
