// Research (roadmap Phase 5, Black Ops 7 Zombies style), shared by the main menu (Armory → Research) and the game.
// Every perk and ammo mod has a linear track of 8 augments (4 Major, 4 Minor; research.json, in track order). You research
// the next augment on a track, one research at a time across all tracks; switching keeps progress. Research XP comes from
// kills and rounds (×activeMul while its item is active). The i-th augment costs trackCost[i]. Finishing a track
// (mastery) opens a second Minor slot for that item. Equip one Major and one Minor (two once mastered) per item; the
// game reads the equipped set at match start.
// Store: kino.mods.research = {active: augId | null, progress: {augId: xp}, done: [augId],
//   equip: {itemId: {major, minor, minor2}}}, cloud-synced (cloud.js TRACKED), its own key (progression saves can't touch it).
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

export const augById=cfg=>Object.fromEntries(cfg.items.flatMap(it=>it.augments.map((a,i)=>[a.id,{...a,index:i,item:it.id,itemName:it.name,itemKind:it.kind,color:it.color}])));
export const costOf=(cfg,aug)=>cfg.trackCost?.[aug.index??0]??1000;
export const researchOpen=(cfg,level)=>level>=(cfg.unlockLevel??1);
// The next augment to research on an item's track (null when the track is done).
export const nextOnTrack=(cfg,r,itemId)=>cfg.items.find(i=>i.id===itemId)?.augments.find(a=>!r.done.includes(a.id))??null;
export const mastered=(cfg,r,itemId)=>!nextOnTrack(cfg,r,itemId);

// Start (or switch to) researching an augment: only the next one on its track. Returns a reason when it can't.
export function startResearch(cfg,r,augId){
  const a=augById(cfg)[augId];if(!a)return 'Unknown augment';if(r.done.includes(augId))return 'Already researched';
  if(nextOnTrack(cfg,r,a.item)?.id!==augId)return 'Research the augments before it on this track first';
  r.active=augId;return null;
}
// Grant research XP to the active research. `isActive(itemId)` says whether its item is active in the match (×activeMul).
// Returns the augment finished by this XP (with `mastery: true` when it completed the track), or null.
export function grantResearchXp(cfg,r,amount,isActive){
  const id=r.active;if(!id||amount<=0)return null;const a=augById(cfg)[id];if(!a){r.active=null;return null;}
  r.progress[id]=(r.progress[id]??0)+amount*(isActive?.(a.item)?cfg.activeMul??1:1);
  if(r.progress[id]<costOf(cfg,a))return null;
  const over=r.progress[id]-costOf(cfg,a);delete r.progress[id];if(!r.done.includes(id))r.done.push(id);
  // carry on down the same track automatically, as BO7 does; a mastered track moves on to the next item that isn't
  // (same kind first: perk or ammo mod), so research never stalls mid-match. The XP past the cost carries over.
  const next=nextOnTrack(cfg,r,a.item),item=cfg.items.find(i=>i.id===a.item);
  const order=[...cfg.items.filter(i=>i.kind===item?.kind),...cfg.items.filter(i=>i.kind!==item?.kind)];
  const after=next??order.map(i=>nextOnTrack(cfg,r,i.id)).find(Boolean)??null;
  r.active=after?.id??null;if(after&&over>0)r.progress[after.id]=(r.progress[after.id]??0)+over;
  return {...a,mastery:!next,next:after};
}
// Equip / unequip a researched augment. A Minor goes in the first free Minor slot (the second only once mastered);
// clicking an equipped one takes it out.
export function toggleEquip(cfg,r,augId){
  const a=augById(cfg)[augId];if(!a||!r.done.includes(augId))return 'Research it first';
  const by=augById(cfg),e=r.equip[a.item]??={};
  for(const k of ['major','minor','minor2'])if(e[k]&&(!by[e[k]]||!r.done.includes(e[k])))e[k]=null;   // slots holding augments that no longer exist (older saves)
  for(const k of ['major','minor','minor2'])if(e[k]===augId){e[k]=null;return null;}
  if(a.kind==='major'){e.major=augId;return null;}
  if(!e.minor)e.minor=augId;else if(mastered(cfg,r,a.item)&&!e.minor2)e.minor2=augId;else if(mastered(cfg,r,a.item))e.minor2=augId;else e.minor=augId;
  return null;
}
// The equipped augments (researched, and a second Minor only on a mastered track).
export function equippedAugments(cfg,r){
  const by=augById(cfg),out=[];
  for(const [item,e] of Object.entries(r.equip??{}))for(const k of ['major','minor','minor2']){
    const a=by[e?.[k]];if(!a||!r.done.includes(a.id)||a.item!==item)continue;if(k==='minor2'&&!mastered(cfg,r,item))continue;
    if(!out.some(x=>x.id===a.id))out.push(a);}
  return out;
}
