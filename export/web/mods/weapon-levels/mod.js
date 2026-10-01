import * as THREE from 'three';
// Weapon levels: kills with a gun level that gun up, and each level unlocks an
// attachment the gun's model carries (sights, suppressor, mags, grip, ACOG,
// IR, and working underbarrels on key 5). Equip them in the main menu's
// Loadout → Gunsmith, or in the pause menu for the gun in hand. Rules and
// the UI are in gunsmith.js; tuning in attachments.json.
import { loadProfile, saveProfile, cloudReady } from '../../profile.js';
import { setupFlamer } from './flamer.js';
import { loadCamos, applyCamo, equippedCamo, countCamoKill, classProgress, camoTime, PAP_CAMO } from './camo.js';
import { openGunsmith } from './gunsmith-view.js';
import { previewDef } from './gunsmith.js';
import { loadCatalog, applyAttachments, grantWeaponXp, weaponProgress, xpToNext, maxLevel, available, renderGunsmith, GUNSMITH_CSS } from './gunsmith.js';

export default async function setup(api){
  const {data,session,host,view,audio}=api;
  await cloudReady;
  const cat=await loadCatalog(import.meta.url);
  const cats=await loadCamos(import.meta.url);
  const style=document.createElement('style');style.textContent=GUNSMITH_CSS+`
    #weapon-level{position:fixed;right:40px;bottom:112px;display:flex;align-items:center;gap:8px;font:600 9px/1 system-ui,sans-serif;letter-spacing:2px;color:#d6a94a;pointer-events:none;z-index:3}
    #weapon-level i{display:block;width:70px;height:3px;background:#ffffff1f}#weapon-level i b{display:block;height:100%;background:#d6a94a}
    #gunsmith-panel{margin:10px 0}`;
  document.head.append(style);

  let profile=loadProfile();
  const save=()=>{const fresh=loadProfile();fresh.weaponXp=profile.weaponXp;fresh.attachments=profile.attachments;fresh.camo=profile.camo;saveProfile(fresh);};
  // Every tag some weapon hides by default: the attachment parts.
  const attachmentTags=new Set(Object.values(data.weapons).flatMap(d=>d?.hideTags??[]));
  // What each gun hides out of the box (base and Pack-a-Punched), before any attachment
  const stockHidden=new Map(Object.entries(data.weapons).map(([id,d])=>[id,{base:new Set(d?.hideTags??[]),up:new Set(d?.upgrade?.hideTags??[])}]));
  // attachments, plus each gun's equipped camo id on its definition (read by third person, co-op and the box)
  const apply=()=>{applyAttachments(cat,data.weapons,profile);for(const [id,d] of Object.entries(data.weapons))if(d&&typeof d==='object')d.camo=equippedCamo(cats,profile,id,data.weapons)?.id;};
  const camoById=id=>cats.camos.find(c=>c.id===id)??null;
  apply();

  // Show the equipped attachment parts on the viewmodel. Viewmodels are cached
  // per weapon, so a part hidden on an earlier equip has to be shown again.
  // Pack-a-Punched guns wear the BO1 PaP camo, unless the upgrade has its own model (Ray Gun, wonder weapons).
  const papLook=w=>{const d=w?.upgraded&&data.weapons[w.id];return !!d&&(!d.upgrade?.model||d.upgrade.model===d.model);};
  host.on('update',dt=>{camoTime.value+=dt||0;});
  // Suppressed kills: one extra 1% power-up roll on top of the base 3% (about a third more
  // random drops). The per-round cap and the drop deck are the game's own, so it can't flood.
  let suppressedKill=0;
  host.on('beforeEnemyDamage',e=>{if(e.enemy&&e.amount>=e.enemy.health&&e.cause==='bullet'&&!e.melee&&session.def?.suppressed&&!session.def.attachmentActive)suppressedKill=session.time;});
  const wrapDrops=d=>{if(!d||d.suppressorWrapped)return;d.suppressorWrapped=true;const tryDrop=d.tryDrop.bind(d);
    d.tryDrop=(s,...a)=>{const r=tryDrop(s,...a);if(r||session.time-suppressedKill>.05||s.random()>=.01)return r;
      const was=d.pending;d.pending=true;const extra=tryDrop(s,...a);if(!extra)d.pending=was;return extra;};};
  host.on('update',()=>wrapDrops(session.drops));
  const equip=view.equip.bind(view);
  view.equip=async(def,...rest)=>{
    const r=await equip(def,...rest);
    const hidden=new Set(def?.hideTags??[]);
    view.gun?.traverse(o=>{if(o.isBone&&o.scale.x<1e-3&&attachmentTags.has(o.name)&&!hidden.has(o.name))o.scale.setScalar(1);});
    flamer.placePilot();
    applyCamo(view.gun,papLook(session.weapon)?PAP_CAMO:camoById(data.weapons[session.weapon?.id]?.camo));
    magFollow(def);
    return r;
  };

  // Bigger mags hang off their own bones, which the reload animations never
  // move (they animate tag_clip, the stock mag). While one is fitted, hide the
  // stock mag and drive the fitted mag's bone from tag_clip every frame,
  // keeping their rest-pose offset, so it comes out and goes back in.
  const MAG_TAGS=['tag_ext_clip','tag_extended_clip','tag_clip_extended','tag_dual_clip','tag_double_clip','tag_duel_clip','tag_drum','tag_ammo_expander'];
  let follow=null;
  const restWorld=(skel,bone)=>{const i=skel.bones.indexOf(bone);return i<0?null:skel.boneInverses[i].clone().invert();};
  function magFollow(def){
    const g=view.gun;follow=null;if(!g)return;
    const hidden=new Set(def?.hideTags??[]),clip=g.getObjectByName('tag_clip');
    // only mags an attachment added: built-in ones (the Pack-a-Punched Commando's dual
    // mag, the PM63's extended mag) have their own reload animation
    const stock=stockHidden.get(session.weapon?.id)?.[session.weapon?.upgraded?'up':'base']??new Set();
    let skel=null;g.traverse(o=>{if(o.isSkinnedMesh&&!skel)skel=o.skeleton;});
    // stock mag meshes: dominant bone tag_clip (restored when no bigger mag is fitted)
    const mag=MAG_TAGS.map(t=>g.getObjectByName(t)).find(b=>b&&!hidden.has(b.name)&&stock.has(b.name));
    // A Pack-a-Punched gun may show a bigger mag by itself (the Predator's dual
    // mag); its reload animation moves that bone, so a fitted mag follows it
    // instead of tag_clip, and the built-in mag's meshes are hidden.
    const native=MAG_TAGS.map(t=>g.getObjectByName(t)).find(b=>b&&!hidden.has(b.name)&&!stock.has(b.name));
    const ref=mag&&native?native:clip;
    g.traverse(o=>{if(!o.isSkinnedMesh)return;const gg=o.geometry,si=gg.attributes.skinIndex,sw=gg.attributes.skinWeight;if(!si||!sw)return;
      const i=gg.index?gg.index.getX(0):0;let best=0,bw=-1;for(let k=0;k<4;k++){const w=sw.getComponent(i,k);if(w>bw){bw=w;best=si.getComponent(i,k);}}
      const b=o.skeleton.bones[best];if(b===clip||(native&&b===native))o.visible=!mag||(b===native&&!mag);});
    if(!mag||!ref||!skel)return;
    const rc=restWorld(skel,ref),rm=restWorld(skel,mag);if(!rc||!rm)return;
    follow={mag,clip:ref,rel:rc.clone().invert().multiply(rm),m:new THREE.Matrix4(),p:new THREE.Matrix4()};
  }
  host.on('update',()=>{
    if(!follow||!view.gun)return;const {mag,clip,rel,m,p}=follow;
    clip.updateWorldMatrix(true,false);mag.parent.updateWorldMatrix(true,false);
    m.copy(clip.matrixWorld).multiply(rel);                 // where the fitted mag should be
    p.copy(mag.parent.matrixWorld).invert().multiply(m);     // in its parent's space
    const sc=mag.scale.clone();p.decompose(mag.position,mag.quaternion,mag.scale);mag.scale.copy(sc);
    mag.updateMatrixWorld(true);
  });

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
  const lastKill=new Map();
  host.on('kill',({enemy,head,melee,remote})=>{
    if(remote||melee||cheating()||!session.weapon)return;
    const now=performance.now()/1000,multi=now-(lastKill.get(session.weapon.id)??-9)<1.5;lastKill.set(session.weapon.id,now);
    const cause=lastCause.get(enemy);
    const launcher=session.def?.projectileSpeed>0;
    if(!(cause==='bullet'||cause==='projectile'||cause==='thunder'||cause==='flame'||cause==='freeze'||(cause==='explosion'&&launcher)))return;
    const id=session.weapon.id,def=data.weapons[id];if(!def)return;
    profile=loadProfile();
    // camo challenges (any gun)
    const mv=window.kino.movement?.state;
    const camos=countCamoKill(cats,profile,id,{head,low:!!(mv?.prone||api.player?.crouched),moving:!!(mv?.sliding||mv?.diving),multi},data.weapons);
    if(camos.length){const dia=camos.find(c=>c.classMastery),cls=window.kino.camoClass?.(id);
      api.toast(dia?`Diamond camo unlocked for every ${cls??'gun in this class'} · equip it in the Gunsmith`:`${def.name} · ${camos.map(c=>c.name).join(', ')} camo unlocked · equip it in the Gunsmith`,6);}
    if(!available(cat,def,id).length){save();return;}
    const news=grantWeaponXp(cat,def,id,profile,cat.xp.kill+(head?cat.xp.headshot:0));
    save();
    if(news.length){
      const lv=weaponProgress(profile,id).level;
      // unlocked only: equipping is the player's choice, in the Gunsmith
      api.toast(`${def.name} level ${lv} · ${news.map(a=>a.name).join(', ')} unlocked · equip it in the Gunsmith`,5);
      renderPanel();
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
    // this mod loads before progression, so its loadout card appears later: sit under it
    const lp=document.getElementById('loadout-panel');if(lp&&lp.nextElementSibling!==panel)lp.after(panel);
    const id=session.weapon?.id,def=data.weapons[id];
    if(!def||session.attachmentMode){panel.innerHTML='';return;}
    renderGunsmith(panel,{cat,def,id,profile,compact:true,onOpen:()=>openGunsmith({cat,weapons:data.weapons,profile,id,ids:[id],
      onChange:()=>{save();apply();api.equipView?.();renderHud();},onClose:renderPanel})});
  }
  // The pause menu opens when the game deactivates; refresh it then.
  new MutationObserver(()=>{if(!document.getElementById('menu')?.hidden){profile=loadProfile();apply();renderPanel();}}).observe(document.getElementById('menu'),{attributes:true,attributeFilter:['hidden']});
  addEventListener('focus',()=>{if(!api.getState().active){profile=loadProfile();apply();renderPanel();renderHud();}});
  renderPanel();

  // the box's floating display copies wear the gun's camo too
  const display=api.mysteryBox?.display?.bind(api.mysteryBox);
  if(display)api.mysteryBox.display=id=>{const g=display(id);if(g)applyCamo(g.userData.model??g,camoById(data.weapons[id]?.camo));return g;};
  window.kino.camo={cats,byId:camoById,apply:(root,id)=>applyCamo(root,camoById(id))};
  window.kino.camoClass=id=>classProgress(cats,profile,id,data.weapons)?.label?.toLowerCase().replace(/^smgs$/,'SMG').replace(/^lmgs$/,'LMG').replace(/s$/,'');
  window.kino.weaponLevels={cat,cats,get profile(){return profile;},apply,
    hideTagsFor:(id,ids)=>{const d=data.weapons[id];return d?previewDef(cat,d,id,ids).hideTags??[]:[];},
    grant:(id,amount)=>{profile=loadProfile();const n=grantWeaponXp(cat,data.weapons[id],id,profile,amount);save();apply();renderHud();renderPanel();return n.map(a=>a.id);}};
}
