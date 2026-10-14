// Research (roadmap Phase 5, Black Ops 6 Zombies style), shared by the main menu (Armory → Research) and the game.
// Every perk and ammo mod has Major and Minor augments (research.json). You research one augment at a time: it earns
// research XP from kills and rounds (×activeMul while its item is active in the match). Finished augments are
// equipped one Major + one Minor per item; the game reads the equipped set once, at match start.
// Store: kino.mods.research = {active: augId | null, progress: {augId: xp}, done: [augId], equip: {itemId: {major, minor}}},
// cloud-synced (cloud.js TRACKED); never part of the progression profile, so its savers can't touch it.
export const RESEARCH_KEY='kino.mods.research';

export async function loadResearchConfig(base=import.meta.url){
  const r=await fetch(new URL('research.json',base));if(!r.ok)throw new Error('research.json HTTP '+r.status);return r.json();
}
export function loadResearch(){
  let p;try{p=JSON.parse(localStorage.getItem(RESEARCH_KEY));}catch{}
  p=p&&typeof p==='object'?p:{};
  return {active:p.active??null,progress:{...p.progress},done:Array.isArray(p.done)?p.done:[],equip:{...p.equip}};
}
export function saveResearch(r){try{localStorage.setItem(RESEARCH_KEY,JSON.stringify(r));}catch{}}

export const augById=cfg=>Object.fromEntries(cfg.items.flatMap(it=>it.augments.map(a=>[a.id,{...a,item:it.id,itemName:it.name,itemKind:it.kind,color:it.color}])));
export const costOf=(cfg,aug)=>cfg.cost[aug.kind]??1000;
export const researchOpen=(cfg,level)=>level>=(cfg.unlockLevel??1);

// Start (or switch to) researching an augment. Progress on the previous one is kept. Returns a reason when it can't.
export function startResearch(cfg,r,augId){
  const a=augById(cfg)[augId];if(!a)return 'Unknown augment';if(r.done.includes(augId))return 'Already researched';
  r.active=augId;return null;
}
// Grant research XP to the active research. `isActive(itemId)` says whether the item is active in the match (×activeMul).
// Returns the augment finished by this XP, or null.
export function grantResearchXp(cfg,r,amount,isActive){
  const id=r.active;if(!id||amount<=0)return null;const a=augById(cfg)[id];if(!a){r.active=null;return null;}
  const xp=amount*(isActive?.(a.item)?cfg.activeMul??1:1);
  r.progress[id]=(r.progress[id]??0)+xp;
  if(r.progress[id]>=costOf(cfg,a)){delete r.progress[id];if(!r.done.includes(id))r.done.push(id);r.active=null;return a;}
  return null;
}
// Equip a researched augment in its item's Major or Minor slot (same id again unequips it).
export function toggleEquip(cfg,r,augId){
  const a=augById(cfg)[augId];if(!a||!r.done.includes(augId))return 'Research it first';
  const e=r.equip[a.item]??={};e[a.kind]=e[a.kind]===augId?null:augId;return null;
}
// The equipped augments as one effects list per item: [{item, aug, effects}]
export function equippedAugments(cfg,r){
  const by=augById(cfg),out=[];
  for(const [item,e] of Object.entries(r.equip??{}))for(const k of ['major','minor']){const a=by[e?.[k]];if(a&&r.done.includes(a.id)&&a.item===item)out.push(a);}
  return out;
}
