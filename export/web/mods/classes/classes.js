// Classes (shared by the main menu and the game): definitions in classes.json,
// progress in its own localStorage key so the profile's other savers can't
// overwrite it. Cloud-synced (cloud.js TRACKED).
//   kino.mods.classes = {selected, classes:{[id]:{level, xp, points:{[nodeId]:rank}}}}
export const CLASSES_KEY='kino.mods.classes';

export async function loadClasses(base=import.meta.url){
  const r=await fetch(new URL('classes.json',base));if(!r.ok)throw new Error('classes.json HTTP '+r.status);return r.json();
}
export function loadClassProfile(cfg){
  let p;try{p=JSON.parse(localStorage.getItem(CLASSES_KEY));}catch{}
  p??={};p.classes??={};p.selected??=cfg?.classes?.[0]?.id??null;
  for(const c of cfg?.classes??[])p.classes[c.id]??={level:1,xp:0,points:{}};
  // renamed nodes keep their points (Fortifier: Extra Bolts -> Field Repairs when the wall became permanent)
  const pts=p.classes.fortifier?.points;if(pts?.bolts){pts.repairs=(pts.repairs??0)+pts.bolts;delete pts.bolts;}
  return p;
}
export function saveClassProfile(p){try{localStorage.setItem(CLASSES_KEY,JSON.stringify(p));}catch{}}

export const classById=(cfg,id)=>cfg.classes.find(c=>c.id===id)??null;
export const xpToNext=(cfg,level)=>Math.round(cfg.xp.base*Math.pow(cfg.xp.growth,level-1));
export const nodes=cls=>cls.trees.flatMap(t=>t.nodes.map(n=>({...n,tree:t.id})));
export const totalPoints=(state)=>state.level;                       // one point per level, the first at level 1
export const spent=(state)=>Object.values(state.points??{}).reduce((a,b)=>a+b,0);
export const available=(state)=>totalPoints(state)-spent(state);
export const treeSpent=(cls,state,treeId)=>cls.trees.find(t=>t.id===treeId).nodes.reduce((a,n)=>a+(state.points?.[n.id]??0),0);
// points needed in the tree before a tier opens
export const tierNeed=(cfg,tier)=>(tier-1)*cfg.tierPoints;

// Can one more point go into `node`?
export function canAdd(cfg,cls,state,node){
  const rank=state.points?.[node.id]??0;
  return available(state)>0&&rank<node.ranks&&treeSpent(cls,state,node.tree)>=tierNeed(cfg,node.tier);
}
// Can a point come out of `node` without stranding points in higher tiers?
export function canRemove(cfg,cls,state,node){
  const rank=state.points?.[node.id]??0;if(rank<=0)return false;
  const tree=cls.trees.find(t=>t.id===node.tree);
  const left=treeSpent(cls,state,node.tree)-1;
  // every invested node above tier 1 must still have enough points below it
  for(const n of tree.nodes){
    if(!(state.points?.[n.id]>0)||n.tier<=1)continue;
    const below=tree.nodes.filter(m=>m.tier<n.tier).reduce((a,m)=>a+(state.points?.[m.id]??0)-(m.id===node.id?1:0),0);
    if(below<tierNeed(cfg,n.tier))return false;
  }
  return left>=0;
}
export function grantClassXp(cfg,state,amount){
  if(state.level>=cfg.xp.maxLevel)return 0;
  state.xp+=amount;let ups=0;
  while(state.level<cfg.xp.maxLevel&&state.xp>=xpToNext(cfg,state.level)){state.xp-=xpToNext(cfg,state.level);state.level++;ups++;}
  if(state.level>=cfg.xp.maxLevel)state.xp=0;
  return ups;
}
// Summed effects of every invested node: {'turret.damage':0.24, ...}
export function stats(cls,state){
  const out={};
  for(const n of nodes(cls)){const r=state.points?.[n.id]??0;if(!r)continue;for(const [k,v] of Object.entries(n.effects??{}))out[k]=(out[k]??0)+v*r;}
  return out;
}
// The action skill's numbers with the trees applied
export function actionStats(cls,state){
  const s=stats(cls,state),b=cls.action.base;
  if(cls.action.id==='wall'){   // Fortifier's Barricade Wall
    const two=!!s['fort.double'];
    return {
      cooldown:b.cooldown*Math.max(.3,1-(s['fort.cooldown']??0)),
      repair:s['fort.roundRepair']??0,
      health:Math.round(b.health*(1+(s['fort.health']??0))*(two?.75:1)),
      width:b.width*(1+(s['fort.width']??0)),height:b.height,
      spikes:s['fort.spikes']??0,count:two?2:1,
    };
  }
  const double=!!s['turret.double'];
  return {
    cooldown:b.cooldown*Math.max(.3,1-(s['turret.cooldown']??0)),
    duration:(b.duration+(s['turret.duration']??0))*(double?.75:1),
    damage:b.damage*(1+(s['turret.damage']??0)),
    rate:b.rate*(1+(s['turret.rate']??0)),
    range:b.range*(1+(s['turret.range']??0)),
    count:double?2:1,
  };
}
// The action card's stat lines: [label, value, improved-over-base]
export function actionRows(cls,a){
  const b=cls.action.base,up=(x,y)=>Math.abs(x-y)>1e-6;
  if(cls.action.id==='wall')return [
    ['COOLDOWN',a.cooldown.toFixed(0)+'s',up(a.cooldown,b.cooldown)],['LASTS','UNTIL BROKEN',false],
    ['HITS',String(a.health),a.health!==b.health],['REPAIR / ROUND',a.repair?String(a.repair):'—',a.repair>0],['WIDTH',String(Math.round(a.width)),up(a.width,b.width)],
    ['SPIKES',a.spikes?Math.round(a.spikes*100)+'%':'—',a.spikes>0],['WALLS',String(a.count),a.count>1]];
  return [
    ['COOLDOWN',a.cooldown.toFixed(0)+'s',up(a.cooldown,b.cooldown)],['DURATION',a.duration.toFixed(0)+'s',up(a.duration,b.duration)],
    ['DAMAGE',Math.round(a.damage*100)+'%',up(a.damage,b.damage)],['FIRE RATE',a.rate.toFixed(1)+'/s',up(a.rate,b.rate)],
    ['RANGE',String(Math.round(a.range)),up(a.range,b.range)],['TURRETS',String(a.count),a.count>1]];
}
export function describe(node,rank){
  const k=Object.keys(node.effects??{})[0],per=node.effects?.[k]??0,v=per*Math.max(1,rank);
  const txt=node.fmt==='s'?+v.toFixed(1):node.fmt==='n'?Math.round(v):Math.round(v*100);
  return node.desc.replace('{v}',txt);
}
