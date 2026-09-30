// Weapon levels: kills with a gun level that gun up, and each level unlocks an
// attachment the gun's model carries (sights, suppressor, mags, grip, ACOG,
// IR, and working underbarrels on key 5). Equip them in the main menu's
// Loadout → Gunsmith, or in the pause menu for the gun in hand. Rules and
// the UI are in gunsmith.js; tuning in attachments.json.
import { loadProfile, saveProfile, cloudReady } from '../../profile.js';
import { setupFlamer } from './flamer.js';
import { openGunsmith } from './gunsmith-view.js';
import { loadCatalog, applyAttachments, grantWeaponXp, weaponProgress, xpToNext, maxLevel, available, renderGunsmith, GUNSMITH_CSS } from './gunsmith.js';

export default async function setup(api){
  const {data,session,host,view,audio}=api;
  await cloudReady;
  const cat=await loadCatalog(import.meta.url);
  const style=document.createElement('style');style.textContent=GUNSMITH_CSS+`
    #weapon-level{position:fixed;right:40px;bottom:112px;display:flex;align-items:center;gap:8px;font:600 9px/1 system-ui,sans-serif;letter-spacing:2px;color:#d6a94a;pointer-events:none;z-index:3}
    #weapon-level i{display:block;width:70px;height:3px;background:#ffffff1f}#weapon-level i b{display:block;height:100%;background:#d6a94a}
    #gunsmith-panel{margin:10px 0}`;
  document.head.append(style);

  let profile=loadProfile();
  const save=()=>{const fresh=loadProfile();fresh.weaponXp=profile.weaponXp;fresh.attachments=profile.attachments;saveProfile(fresh);};
  // Every tag some weapon hides by default: the attachment parts.
  const attachmentTags=new Set(Object.values(data.weapons).flatMap(d=>d?.hideTags??[]));
  const apply=()=>applyAttachments(cat,data.weapons,profile);
  apply();

  // Show the equipped attachment parts on the viewmodel. Viewmodels are cached
  // per weapon, so a part hidden on an earlier equip has to be shown again.
  const equip=view.equip.bind(view);
  view.equip=async(def,...rest)=>{
    const r=await equip(def,...rest);
    const hidden=new Set(def?.hideTags??[]);
    view.gun?.traverse(o=>{if(o.isBone&&o.scale.x<1e-3&&attachmentTags.has(o.name)&&!hidden.has(o.name))o.scale.setScalar(1);});
    flamer.placePilot();
    return r;
  };

  const flamer=setupFlamer(api);

  // Suppressed shots: the same cue, much quieter. The flamethrower has its own roar.
  const weaponSound=audio.weapon.bind(audio);
  audio.weapon=(kind,def,...rest)=>{
    if(kind==='shot'&&def?.flamethrower)return;
    if(kind!=='shot'||!def?.suppressed||def.attachmentActive)return weaponSound(kind,def,...rest);
    const play=audio.play;audio.play=(cue,volume=1,...more)=>play.call(audio,cue,volume*.28,...more);
    try{return weaponSound(kind,def,...rest);}finally{audio.play=play;}
  };

  // ---- XP -----------------------------------------------------------------------
  const cheating=()=>!!window.kino.cheats?.used;
  const lastCause=new WeakMap();
  host.on('beforeEnemyDamage',e=>{if(e.enemy)lastCause.set(e.enemy,e.cause);});
  host.on('kill',({enemy,head,melee,remote})=>{
    if(remote||melee||cheating()||!session.weapon)return;
    const cause=lastCause.get(enemy);
    const launcher=session.def?.projectileSpeed>0;
    if(!(cause==='bullet'||cause==='projectile'||cause==='thunder'||cause==='flame'||(cause==='explosion'&&launcher)))return;
    const id=session.weapon.id,def=data.weapons[id];if(!def||!available(cat,def,id).length)return;
    profile=loadProfile();
    const news=grantWeaponXp(cat,def,id,profile,cat.xp.kill+(head?cat.xp.headshot:0));
    // New attachments go straight on when their slot is free.
    for(const a of news){const cur=profile.attachments?.[id]??[];if(!cur.some(x=>cat.attachments.find(y=>y.id===x)?.slot===a.slot)){profile.attachments??={};profile.attachments[id]=[...cur,a.id];}}
    save();
    if(news.length){
      const lv=weaponProgress(profile,id).level;
      api.toast(`${def.name} level ${lv} · ${news.map(a=>a.name).join(', ')} unlocked${news.every(a=>(profile.attachments[id]??[]).includes(a.id))?' and equipped':''}`,5);
      apply();api.equipView?.();renderPanel();
    }
    renderHud();
  });

  // ---- HUD: level of the gun in hand -----------------------------------------------
  const hud=document.createElement('div');hud.id='weapon-level';hud.innerHTML='<span></span><i><b></b></i>';document.body.append(hud);
  let hudKey='';
  function renderHud(){
    const id=session.weapon?.id,def=data.weapons[id];
    if(!def||!available(cat,def,id).length){hud.style.display='none';hudKey='';return;}
    const p=weaponProgress(profile,id),cap=maxLevel(cat,def,id);
    hud.style.display='';hud.querySelector('span').textContent='WPN LV '+p.level+(p.level>=cap?' MAX':'');
    hud.querySelector('b').style.width=(p.level>=cap?100:100*p.xp/xpToNext(cat,p.level)).toFixed(1)+'%';
    hudKey=id+':'+p.level+':'+p.xp;
  }
  host.on('update',()=>{const id=session.weapon?.id;if(id&&!hudKey.startsWith(id+':'))renderHud();});
  renderHud();

  // ---- pause menu: gunsmith for the gun in hand -------------------------------------
  const panel=document.createElement('div');panel.id='gunsmith-panel';
  (document.getElementById('loadout-panel')??document.querySelector('#menu .menu-controls'))?.after(panel);
  panel.addEventListener('click',e=>e.stopPropagation());
  function renderPanel(){
    const id=session.weapon?.id,def=data.weapons[id];
    if(!def||session.attachmentMode){panel.innerHTML='';return;}
    renderGunsmith(panel,{cat,def,id,profile,compact:true,onOpen:()=>openGunsmith({cat,weapons:data.weapons,profile,id,ids:[id],
      onChange:()=>{save();apply();api.equipView?.();renderHud();},onClose:renderPanel})});
  }
  // The pause menu opens when the game deactivates; refresh it then.
  new MutationObserver(()=>{if(!document.getElementById('menu')?.hidden){profile=loadProfile();apply();renderPanel();}}).observe(document.getElementById('menu'),{attributes:true,attributeFilter:['hidden']});
  addEventListener('focus',()=>{if(!api.getState().active){profile=loadProfile();apply();renderPanel();renderHud();}});
  renderPanel();

  window.kino.weaponLevels={cat,get profile(){return profile;},apply,
    grant:(id,amount)=>{profile=loadProfile();const n=grantWeaponXp(cat,data.weapons[id],id,profile,amount);save();apply();renderHud();renderPanel();return n.map(a=>a.id);}};
}
