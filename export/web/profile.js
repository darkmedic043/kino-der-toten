// Player profile shared by the main menu and every game page (not part of
// upstream): XP, level, loadout, character and stats, saved in localStorage.
// Unlock rules come from mods/progression/progression.json.

export { cloudReady } from './cloud.js';
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

// weapons: ids known to the current game data (unknown unlock entries are skipped).
export function unlocks(config,level,weapons){
  return {
    weapons:config.weapons.filter(w=>w.level<=level&&(!weapons||weapons[w.id])).map(w=>w.id),
    bonuses:config.bonuses.filter(b=>b.level<=level).map(b=>b.id),
    secondary:level>=config.secondaryLevel,
    bonusSlots:level>=config.secondBonusLevel?2:1,
    tactical:(config.tactical??[]).filter(t=>t.level<=level).map(t=>t.id),
    tacticalSlot:level>=(config.tacticalLevel??Infinity),
  };
}

// The saved loadout, minus anything the profile no longer qualifies for.
export function validLoadout(config,profile,weapons){
  const u=unlocks(config,profile.level,weapons),l=profile.loadout;
  const primary=u.weapons.includes(l.primary)?l.primary:'m1911_zm';
  const secondary=u.secondary&&u.weapons.includes(l.secondary)&&l.secondary!==primary?l.secondary:'';
  const bonuses=[...new Set(l.bonuses)].filter(id=>u.bonuses.includes(id)).slice(0,u.bonusSlots);
  const tactical=u.tacticalSlot&&u.tactical.includes(l.tactical)?l.tactical:'';
  return {primary,secondary,tactical,bonuses};
}
