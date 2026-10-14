// Gobblegum rules shared by the main menu (Armory → Gobblegums) and the in-game mod:
// unlocks, the pack minimum and the rarity ladder. Data: gums.json next to this file.
export const GUM_KEY='kino.mods.gobblegums';

export async function loadGums(base=new URL('./',import.meta.url)){
  const r=await fetch(new URL('gums.json',base));if(!r.ok)throw new Error('gums.json HTTP '+r.status);return r.json();
}
export function loadGumProfile(){try{return {pack:null,...JSON.parse(localStorage.getItem(GUM_KEY))};}catch{return {pack:null};}}
export function saveGumProfile(p){try{localStorage.setItem(GUM_KEY,JSON.stringify(p));}catch{}}

export const gumById=cfg=>Object.fromEntries(cfg.gums.map(g=>[g.id,g]));
export const tierIndex=(cfg,rarity)=>cfg.rarities.findIndex(r=>r.id===rarity);
export const unlockedGums=(cfg,level)=>cfg.gums.filter(g=>g.level<=level).map(g=>g.id);

// The ladder: the k-th gum of a tier needs base + step*(k-1) gums of lower tiers in the pack.
export function tierNeed(cfg,rarity,count){const r=cfg.rarities.find(r=>r.id===rarity);return count>0&&r?.base!=null?r.base+(r.step??0)*(count-1):0;}
// For each tier: how many it holds, how many lower gums it needs and has, and what one more would need.
export function packTiers(cfg,ids){
  const by=gumById(cfg),list=ids.map(id=>by[id]).filter(Boolean);
  return cfg.rarities.map((r,i)=>{
    const count=list.filter(g=>g.rarity===r.id).length,below=list.filter(g=>tierIndex(cfg,g.rarity)<i).length;
    return {...r,count,below,need:tierNeed(cfg,r.id,count),next:tierNeed(cfg,r.id,count+1)};
  });
}
// Problems with a pack ([] = usable).
export function packProblems(cfg,ids){
  const out=[];
  for(const t of packTiers(cfg,ids))if(t.below<t.need)out.push(`${t.count} ${t.name} need ${t.need} lower-tier gums (the pack has ${t.below})`);
  if(ids.length<cfg.packMin)out.push(`A pack needs at least ${cfg.packMin} gums (${ids.length} now)`);
  return out;
}
// Can this gum go in / come out without breaking the ladder? ('' = yes, else why not)
export function canAdd(cfg,ids,id){
  const g=gumById(cfg)[id];if(!g||ids.includes(id))return 'Already in the pack';
  const t=packTiers(cfg,ids).find(t=>t.id===g.rarity);
  return t.below>=t.next?'':`Your next ${t.name} gum needs ${t.next} lower-tier gums in the pack (you have ${t.below})`;
}
export function canRemove(cfg,ids,id){
  const rest=ids.filter(x=>x!==id),bad=packTiers(cfg,rest).find(t=>t.below<t.need);
  return bad?`${bad.name} gums need ${bad.need} lower-tier gums under them; take one of those out first`:'';
}
// The pack a player plays with: their saved one (unlocked gums only), or, if they never built one, every unlocked
// gum the ladder allows, lowest tier first. Returns {ids, ok, problems, auto}.
export function activePack(cfg,level,saved){
  const open=new Set(unlockedGums(cfg,level));
  let ids,auto=false;
  if(Array.isArray(saved)){ids=[...new Set(saved)].filter(id=>open.has(id));}
  else{auto=true;ids=[];for(const r of cfg.rarities)for(const g of cfg.gums)if(g.rarity===r.id&&open.has(g.id)&&!canAdd(cfg,ids,g.id))ids.push(g.id);}
  const problems=packProblems(cfg,ids);
  return {ids,ok:!problems.length,problems,auto};
}
