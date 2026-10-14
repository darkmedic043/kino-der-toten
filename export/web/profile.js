// Player profile shared by the main menu and every game page (not part of
// upstream): XP, level, loadout, character and stats, saved in localStorage.
// Unlock rules come from mods/progression/progression.json.

export { cloudReady } from './cloud.js';
import { weaponClass } from './mods/weapon-levels/camo.js';
export const PROFILE_KEY='kino.mods.progression';

export function loadProfile(){
  const empty={xp:0,level:1,kills:0,games:0,bestRound:0,character:'mannequin',loadout:{primary:'m1911_zm',secondary:'',tactical:'',bonuses:[]}};
  try{const saved=JSON.parse(localStorage.getItem(PROFILE_KEY));return saved?{...empty,...saved,loadout:{...empty.loadout,...saved.loadout}}:empty;}catch{return empty;}
}
export function saveProfile(profile){try{localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));}catch{}}

export async function loadProgression(){
  const r=await fetch(new URL('mods/progression/progression.json',document.baseURI));
  if(!r.ok)throw new Error('progression.json HTTP '+r.status);
  return r.json();
}

export const xpToNext=(config,level)=>Math.round(config.levelCurve.base*level**config.levelCurve.exponent);

// Weapon unlocks (2026-10-14): the base BO1 guns (`kit: true`) are the first
// unlock kit, owned from level 1; their `gunsmith` level opens them in the
// Gunsmith. Every other gun unlocks at its `level`, Gunsmith included.
export const unlockLevel=w=>w.kit?1:w.level;
export const gunsmithLevel=(config,id)=>{const w=config.weapons.find(w=>w.id===id);return w?w.gunsmith??w.level:1;};
export const rarityOf=(config,id)=>[...config.weapons,...config.tactical??[],...config.lethal??[]].find(w=>w.id===id)?.rarity??'common';
// the one starting slot takes pistols only
export const isPistol=d=>!!d&&weaponClass(d)==='Pistol';

// weapons: ids known to the current game data (unknown unlock entries are skipped).
export function unlocks(config,level,weapons){
  return {
    weapons:config.weapons.filter(w=>unlockLevel(w)<=level&&(!weapons||weapons[w.id])).map(w=>w.id),
    bonuses:config.bonuses.filter(b=>b.level<=level).map(b=>b.id),
    bonusSlots:level>=config.secondBonusLevel?2:1,
    tactical:(config.tactical??[]).filter(t=>t.level<=level).map(t=>t.id),
    tacticalSlot:level>=(config.tacticalLevel??Infinity),
    lethal:(config.lethal??[]).filter(t=>t.level<=level).map(t=>t.id),
  };
}

// The saved loadout, minus anything the profile no longer qualifies for.
// There is one weapon slot (`primary`), pistols only: a saved SMG or a level-locked
// pistol falls back to the M1911. `secondary` is always empty (kept for old readers).
export function validLoadout(config,profile,weapons){
  const u=unlocks(config,profile.level,weapons),l=profile.loadout;
  const primary=u.weapons.includes(l.primary)&&(!weapons||isPistol(weapons[l.primary]))?l.primary:'m1911_zm';
  const bonuses=[...new Set(l.bonuses)].filter(id=>u.bonuses.includes(id)).slice(0,u.bonusSlots);
  const tactical=u.tacticalSlot&&u.tactical.includes(l.tactical)?l.tactical:'';
  return {primary,secondary:'',tactical,bonuses};
}

// ---- The Mystery Box list ---------------------------------------------------------
// Every unlocked weapon, tactical and lethal can be in your box; no tier has a cap.
// Items in the game's boxPool start switched on, the rest off; the player's toggles
// are kept as overrides (loadout.boxOn / boxOff) so newly unlocked box guns join by
// default. data: the merged game data (weapons, equipment, boxPool).
export function boxItems(config,profile,data){
  const u=unlocks(config,profile.level,data.weapons),pool=new Set(data.boxPool??[]),l=profile.loadout;
  const on=new Set(l.boxOn??[]),off=new Set(l.boxOff??[]);
  const item=(id,kind)=>({id,kind,rarity:rarityOf(config,id),on:!off.has(id)&&(pool.has(id)||on.has(id))});
  return [...u.weapons.filter(id=>!/upgraded/.test(id)).map(id=>item(id,'weapon')),
    ...u.tactical.filter(id=>data.equipment?.[id]).map(id=>item(id,'tactical')),
    ...u.lethal.filter(id=>data.equipment?.[id]).map(id=>item(id,'lethal'))];
}
// Turn one item on or off (returns the new loadout fields).
export function setBoxItem(profile,data,id,on){
  const l=profile.loadout,inPool=(data.boxPool??[]).includes(id);
  const boxOn=new Set(l.boxOn??[]),boxOff=new Set(l.boxOff??[]);
  boxOn.delete(id);boxOff.delete(id);
  if(on&&!inPool)boxOn.add(id);if(!on&&inPool)boxOff.add(id);
  l.boxOn=[...boxOn];l.boxOff=[...boxOff];
}
// What the box may roll: ids the player has switched on, plus anything the list
// doesn't know about (a map's own box items). Weighted by rarity.
export function boxFilter(config,profile,data){
  const items=boxItems(config,profile,data),known=new Set([...config.weapons,...config.tactical??[],...config.lethal??[]].map(w=>w.id));
  const on=new Set(items.filter(i=>i.on).map(i=>i.id)),weights=Object.fromEntries((config.rarities??[]).map(r=>[r.id,r.weight??1]));
  return {allowed:id=>on.has(id)||!known.has(id),weight:id=>weights[rarityOf(config,id)]??1,extra:[...on]};
}
