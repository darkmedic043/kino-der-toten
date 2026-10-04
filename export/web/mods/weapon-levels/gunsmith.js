// Weapon levels and attachments, shared by the weapon-levels mod (in game)
// and the main menu's Gunsmith. Kills with a gun earn that gun XP; each weapon
// level unlocks the next attachment the gun's model actually carries (BO1
// viewmodels ship every attachment, hidden via def.hideTags). Imported BO3 guns
// add def.mounts {attId: {model, tag}} (separate models mounted on a tag) and
// def.statAttachments [ids] (no model). The profile
// (kino.mods.progression, cloud-synced) stores
//   profile.weaponXp[id]    = {level, xp}
//   profile.attachments[id] = [attachment ids]   (one per slot)
// applyAttachments() rewrites the game's weapon definitions to match.

import { flamerDef } from './flamer.js';

export async function loadCatalog(base=import.meta.url){
  const r=await fetch(new URL('attachments.json',base));
  if(!r.ok)throw new Error('attachments.json HTTP '+r.status);
  return r.json();
}

const pristine=new WeakMap();   // def → its fields before any attachment was applied

export const xpToNext=(cat,level)=>Math.round(cat.curve.base*level**cat.curve.exponent);

// Attachments this weapon's model carries, in unlock order.
export function available(cat,def,id){
  if(!def)return [];
  // the gun's own attachment parts: its original hidden tags (applying attachments un-hides some)
  const hidden=new Set((pristine.get(def)?.hideTags)??def.hideTags??[]);
  return cat.attachments.filter(a=>{
    // guns with a built-in scope only take optics made to replace it
    if(a.slot==='optic'&&cat.builtInOptic.includes(id)!==!!a.builtIn)return false;
    // imported guns (mods/bo3-weapons): attachment models mounted on the gun's tags, and stat-only unlocks
    if(def.mounts?.[a.id]||def.statAttachments?.includes(a.id))return true;
    return a.tags.some(t=>hidden.has(t));
  });
}

export function weaponProgress(profile,id){return profile.weaponXp?.[id]??{level:1,xp:0};}
export function unlockedAttachments(cat,def,id,profile){
  const lv=weaponProgress(profile,id).level;
  return available(cat,def,id).slice(0,Math.max(0,lv-1));
}
export const maxLevel=(cat,def,id)=>available(cat,def,id).length+1;

// Equipped attachment ids, minus any the gun no longer qualifies for.
export function equipped(cat,def,id,profile){
  const ok=new Set(unlockedAttachments(cat,def,id,profile).map(a=>a.id)),seen=new Set();
  return (profile.attachments?.[id]??[]).filter(a=>{
    const at=cat.attachments.find(x=>x.id===a);if(!at||!ok.has(a)||seen.has(at.slot))return false;seen.add(at.slot);return true;
  });
}

// Equip (or unequip) one attachment; one per slot.
export function toggle(cat,def,id,profile,attId){
  const at=cat.attachments.find(a=>a.id===attId);if(!at)return;
  const cur=equipped(cat,def,id,profile);
  profile.attachments??={};
  profile.attachments[id]=cur.includes(attId)?cur.filter(a=>a!==attId):[...cur.filter(a=>cat.attachments.find(x=>x.id===a)?.slot!==at.slot),attId];
}

// Grant XP to one weapon. Returns the attachments newly unlocked (may be []).
export function grantWeaponXp(cat,def,id,profile,amount){
  profile.weaponXp??={};
  const p=profile.weaponXp[id]??={level:1,xp:0},cap=maxLevel(cat,def,id),before=unlockedAttachments(cat,def,id,profile).length;
  if(p.level>=cap)return [];
  p.xp+=amount;
  while(p.level<cap&&p.xp>=xpToNext(cat,p.level)){p.xp-=xpToNext(cat,p.level);p.level++;}
  if(p.level>=cap)p.xp=0;
  return unlockedAttachments(cat,def,id,profile).slice(before);
}

const STAT_FIELDS=['damage','minDamage','range','clipSize','maxAmmo','startAmmo','reloadTime','reloadEmptyTime','adsFov','headMultiplier','hideTags','scope','hipSpread','suppressed','attachments','attachment','mounted'];
function snapshot(obj){if(!pristine.has(obj)){const s={};for(const k of STAT_FIELDS)s[k]=obj[k]===undefined?undefined:structuredClone(obj[k]);pristine.set(obj,s);}return pristine.get(obj);}
function restore(obj){const s=snapshot(obj);for(const k of STAT_FIELDS){if(s[k]===undefined)delete obj[k];else obj[k]=structuredClone(s[k]);}}

// Tags an attachment shows on this gun: the first of its alternative tags the
// model has (the Galil carries both the Elbit and PKA reflex sights), plus
// its extra parts and, for optics, the rail mounts.
function shownTags(def,list,cat){
  const has=new Set(def.hideTags??[]),show=new Set();
  for(const a of list){
    const main=a.tags.find(t=>has.has(t));if(main)show.add(main);
    for(const t of a.extraTags??[])if(has.has(t))show.add(t);
    if(a.slot==='optic')for(const t of cat.mountTags)if(has.has(t))show.add(t);
  }
  return show;
}

function applyStats(obj,list,cat,show){
  if(!obj)return;
  for(const a of list){
    const s=a.stats??{};
    if(s.damageMul){if(obj.damage)obj.damage=Math.round(obj.damage*s.damageMul);if(obj.minDamage)obj.minDamage=Math.round(obj.minDamage*s.damageMul);}
    if(s.rangeMul&&obj.range)obj.range=Math.round(obj.range*s.rangeMul);
    if(s.clipMul&&obj.clipSize){const before=obj.clipSize;obj.clipSize=Math.round(before*s.clipMul);if(obj.maxAmmo)obj.maxAmmo+=obj.clipSize-before;}
    if(s.reloadMul){if(obj.reloadTime)obj.reloadTime=+(obj.reloadTime*s.reloadMul).toFixed(2);if(obj.reloadEmptyTime)obj.reloadEmptyTime=+(obj.reloadEmptyTime*s.reloadMul).toFixed(2);}
    if(s.adsFov)obj.adsFov=s.adsFov;else if(s.adsFovMul&&obj.adsFov)obj.adsFov=Math.round(obj.adsFov*s.adsFovMul);
    if(s.headMul&&obj.headMultiplier)obj.headMultiplier=+(obj.headMultiplier*s.headMul).toFixed(2);
    if(s.hipSpreadMul)obj.hipSpread=+(.012*s.hipSpreadMul).toFixed(4);
    if(s.suppressed)obj.suppressed=true;
    if(a.scope)obj.scope=a.scope;
  }
  if(obj.hideTags)obj.hideTags=obj.hideTags.filter(t=>!show.has(t));
  // optics that replace the stock scope hide it
  for(const a of list)for(const t of a.replaces??[])if(obj.hideTags&&!obj.hideTags.includes(t))obj.hideTags.push(t);
  obj.attachments=list.map(a=>a.id).join('+');
  // attachment models the weapon-levels mod mounts on the viewmodel's tags
  if(obj.mounts)obj.mounted=list.filter(a=>obj.mounts[a.id]).map(a=>a.id);
  return show;
}

// Underbarrel modes reuse the upstream attachment toggle (key 5): a full
// weapon definition on def.attachment. Templates come from the M16's Pack-a-
// Punch grenade launcher and the AUG's Masterkey; guns without their own
// underbarrel animations keep their normal ones.
function underbarrel(kind,def,weapons,id,shownTags){
  if(kind==='ft'){const f=flamerDef(def);f.hideTags=(def.hideTags??[]).filter(t=>!shownTags.has(t));return f;}
  const src=kind==='gl'?weapons.m16_zm?.upgrade?.attachment:weapons.aug_acog_zm?.upgrade?.attachment;
  if(!src)return undefined;
  const own=(kind==='gl'&&id==='m16_zm')||(kind==='mk'&&id==='aug_acog_zm');
  const u={...structuredClone(src),model:def.model,worldModel:def.worldModel,
    hideTags:(def.hideTags??[]).filter(t=>!shownTags.has(t)),animations:own?src.animations:def.animations};
  if(kind==='gl'){Object.assign(u,{name:'Grenade Launcher',damage:450,clipSize:1,maxAmmo:6,startAmmo:6});}
  else{Object.assign(u,{name:'Masterkey',damage:150,clipSize:4,maxAmmo:20,startAmmo:20});}
  for(const k of ['sprintOffset','sprintRotation','adsInTime','adsOutTime'])if(u[k]===undefined&&def[k]!==undefined)u[k]=def[k];
  return u;
}

// With an optic fitted, the gun's rear iron sight comes off (where that bone
// is only the rear sight; see attachments.json ironSights).
function foldIronSights(obj,list,cat,id){
  const tags=[cat.ironSights?.[id]].flat().filter(Boolean);if(!obj||!tags.length||!list.some(a=>a.slot==='optic'))return;
  obj.hideTags=[...(obj.hideTags??[]).filter(t=>!tags.includes(t)),...tags];
}

// A copy of the weapon's pristine definition with the given attachments
// applied: for stat previews in the Gunsmith (doesn't touch the game data).
export function previewDef(cat,def,id,ids){
  const base=structuredClone(pristine.has(def)?{...def,...pristine.get(def)}:def);
  const list=ids.map(a=>cat.attachments.find(x=>x.id===a)).filter(Boolean);
  applyStats(base,list,cat,shownTags(base,list,cat));
  foldIronSights(base,list,cat,id);
  return base;
}

// Rewrite weapon definitions from the profile. Safe to call repeatedly.
export function applyAttachments(cat,weapons,profile){
  for(const [id,def] of Object.entries(weapons)){
    if(!def||typeof def!=='object')continue;
    restore(def);if(def.upgrade)restore(def.upgrade);
    const ids=equipped(cat,def,id,profile);
    if(!ids.length)continue;
    const list=ids.map(a=>cat.attachments.find(x=>x.id===a));
    const shown=shownTags(def,list,cat);
    applyStats(def,list,cat,shown);foldIronSights(def,list,cat,id);
    if(def.upgrade){const keep=def.upgrade.attachment;applyStats(def.upgrade,list.filter(a=>!a.underbarrel),cat,shown);foldIronSights(def.upgrade,list,cat,id);if(keep)def.upgrade.attachment=keep;}
    const ub=list.find(a=>a.underbarrel);
    if(ub)def.attachment=underbarrel(ub.underbarrel,def,weapons,id,shown);
  }
}

// ---- UI (menu detail panel and in-game pause panel) ---------------------------
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export function renderGunsmith(el,{cat,def,id,profile,onChange,onOpen,compact=false}){
  const all=available(cat,def,id);
  if(!all.length){el.innerHTML=compact?'':'<div class="gunsmith"><span class="eyebrow">GUNSMITH</span><p class="muted">No attachments for this weapon.</p></div>';return;}
  const p=weaponProgress(profile,id),cap=maxLevel(cat,def,id),need=xpToNext(cat,p.level),on=new Set(equipped(cat,def,id,profile));
  const unlocked=new Set(unlockedAttachments(cat,def,id,profile).map(a=>a.id));
  el.innerHTML=`<div class="gunsmith${compact?' compact':''}">
    <div class="gs-head"><span class="eyebrow">GUNSMITH${compact?' · '+esc(def.name.toUpperCase()):''}</span><b>WEAPON LV ${p.level}${p.level>=cap?' · MAX':''}</b></div>
    <div class="gs-bar"><i style="width:${p.level>=cap?100:(100*p.xp/need).toFixed(1)}%"></i></div>
    <small class="muted">${p.level>=cap?'Every attachment unlocked':`${p.xp} / ${need} weapon XP · kills with this gun`}</small>
    <div class="gs-eq">${Object.keys(cat.slots).filter(s=>all.some(a=>a.slot===s)).map(s=>{const a=all.find(x=>x.slot===s&&on.has(x.id));
      return `<span><i>${esc(cat.slots[s].toUpperCase())}</i>${a?esc(a.name):'—'}</span>`;}).join('')}</div>
    <button class="gs-open">OPEN GUNSMITH  ›</button>
    <small class="muted">${unlocked.size} / ${all.length} attachments unlocked</small></div>`;
  el.querySelector('.gs-open').addEventListener('click',e=>{e.stopPropagation();onOpen?.();});
}

export const GUNSMITH_CSS=`
.gunsmith{margin-top:14px;border-top:1px solid #ffffff14;padding-top:12px}
.gunsmith .gs-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.gunsmith .gs-head b{font-size:11px;letter-spacing:2px;color:#d6a94a}
.gunsmith .gs-bar{height:4px;background:#ffffff14;margin:6px 0 4px}.gunsmith .gs-bar i{display:block;height:100%;background:#d6a94a}
.gunsmith .gs-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;margin-top:10px}
.gunsmith .gs-att{display:flex;flex-direction:column;text-align:left;padding:8px 9px;border:1px solid #776b5240;background:#0a0c0b;color:inherit;font:inherit;cursor:pointer}
.gunsmith .gs-att:hover{border-color:#776b52aa}
.gunsmith .gs-att.on{border-color:#d6a94a;background:#d6a94a14}
.gunsmith .gs-att.locked{cursor:not-allowed;opacity:.4}
.gunsmith .gs-slot{font-size:8px;letter-spacing:2px;color:#8f866f}
.gunsmith .gs-att strong{font-size:12px;margin:2px 0}
.gunsmith .gs-att small{font-size:10px;color:#9c9380;line-height:1.35}
.gunsmith .gs-eq{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin:10px 0}
.gunsmith .gs-eq span{font-size:12px}.gunsmith .gs-eq i{display:block;font-style:normal;font-size:8px;letter-spacing:2px;color:#8f866f}
.gunsmith .gs-open{display:block;width:100%;margin:6px 0 4px;padding:10px;border:1px solid #f3a33a;background:#f3a33a1a;color:#f3c27a;font:600 11px/1 system-ui,sans-serif;letter-spacing:3px;cursor:pointer}
.gunsmith .gs-open:hover{background:#f3a33a33}
`;
