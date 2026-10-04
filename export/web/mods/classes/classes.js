// Classes (shared by the main menu and the game): definitions in classes.json,
// progress in its own localStorage key so the profile's other savers can't
// overwrite it. Cloud-synced (cloud.js TRACKED).
//   kino.mods.classes = {selected, classes:{[id]:{level, xp, points:{[nodeId]:rank}, loadout:{action, augments}}}}
// BL4 style: every tree carries its own action skill. One is equipped
// (loadout.action = tree id); passives from every tree always apply; augments
// are free: one unlocks when its tree reaches its tier, and works only while
// equipped (up to cfg.augmentSlots, from the equipped skill's tree);
// one capstone (loadout.capstone, from any tree) works with whichever skill is equipped.
export const CLASSES_KEY='kino.mods.classes';

export async function loadClasses(base=import.meta.url){
  const r=await fetch(new URL('classes.json',base));if(!r.ok)throw new Error('classes.json HTTP '+r.status);return r.json();
}
export function loadClassProfile(cfg){
  let p;try{p=JSON.parse(localStorage.getItem(CLASSES_KEY));}catch{}
  p??={};p.classes??={};p.selected??=cfg?.classes?.[0]?.id??null;
  for(const c of cfg?.classes??[]){
    const s=p.classes[c.id]??={level:1,xp:0,points:{}};s.points??={};
    // renamed nodes keep their points (Fortifier: Extra Bolts -> Field Repairs)
    if(c.id==='fortifier'&&s.points.bolts){s.points.repairs=Math.min(5,(s.points.repairs??0)+s.points.bolts);delete s.points.bolts;}
    // points in nodes that no longer exist (or above a node's ranks) are refunded
    const all=new Map(nodes(c).map(n=>[n.id,n]));
    for(const [id,r] of Object.entries(s.points)){const n=all.get(id);if(!n||r<=0||n.type==='augment')delete s.points[id];else if(r>n.ranks)s.points[id]=n.ranks;}   // augments are free now: refund
    if(!s.loadout||!c.trees.some(t=>t.id===s.loadout.action)){
      // first time with action skills per tree: equip the tree with the most points and its invested augments
      const best=[...c.trees].sort((a,b)=>treeSpent(c,s,b.id)-treeSpent(c,s,a.id))[0];
      s.loadout={action:best.id,augments:best.nodes.filter(n=>n.type==='augment'&&unlocked(cfg,c,s,{...n,tree:best.id})).slice(0,cfg.augmentSlots??2).map(n=>n.id)};
    }
    if(s.loadout.capstone&&!s.points[s.loadout.capstone])s.loadout.capstone=null;
    s.loadout.capstone??=nodes(c).find(n=>n.type==='capstone'&&s.points[n.id])?.id??null;
    pruneLoadout(cfg,c,s);
  }
  return p;
}
export function saveClassProfile(p){try{localStorage.setItem(CLASSES_KEY,JSON.stringify(p));}catch{}}

export const classById=(cfg,id)=>cfg.classes.find(c=>c.id===id)??null;
export const tree=(cls,id)=>cls.trees.find(t=>t.id===id)??cls.trees[0];
export const equippedTree=(cls,state)=>tree(cls,state.loadout?.action);
export const actionOf=(cls,state)=>equippedTree(cls,state).action;
export const xpToNext=(cfg,level)=>Math.round(cfg.xp.base*Math.pow(cfg.xp.growth,level-1));
export const nodes=cls=>cls.trees.flatMap(t=>t.nodes.map(n=>({...n,tree:t.id})));
export const totalPoints=(state)=>state.level;                       // one point per level, the first at level 1
export const spent=(state)=>Object.values(state.points??{}).reduce((a,b)=>a+b,0);
export const available=(state)=>totalPoints(state)-spent(state);
export const treeSpent=(cls,state,treeId)=>cls.trees.find(t=>t.id===treeId).nodes.reduce((a,n)=>a+(state.points?.[n.id]??0),0);
// points needed in the tree before a tier opens
export const tierNeed=(cfg,tier)=>(tier-1)*cfg.tierPoints;
// Is the node's tier open in its tree? (Augments need nothing more.)
export const unlocked=(cfg,cls,state,node)=>treeSpent(cls,state,node.tree)>=tierNeed(cfg,node.tier);
// Drop equipped augments that are no longer usable (tier relocked, other tree) and a capstone without its point.
export function pruneLoadout(cfg,cls,state){
  const L=state.loadout,t=tree(cls,L.action);
  L.augments=(L.augments??[]).filter(id=>{const n=t.nodes.find(n=>n.id===id);return n&&unlocked(cfg,cls,state,{...n,tree:t.id});}).slice(0,cfg.augmentSlots??2);
  if(L.capstone&&!state.points[L.capstone])L.capstone=null;
}

// Can one more point go into `node`?
export function canAdd(cfg,cls,state,node){
  if(node.type==='augment')return false;   // free: unlocked by the tier
  const rank=state.points?.[node.id]??0;
  return available(state)>0&&rank<node.ranks&&treeSpent(cls,state,node.tree)>=tierNeed(cfg,node.tier);
}
// Can a point come out of `node` without stranding points in higher tiers?
export function canRemove(cfg,cls,state,node){
  const rank=state.points?.[node.id]??0;if(rank<=0)return false;
  const t=cls.trees.find(t=>t.id===node.tree);
  const left=treeSpent(cls,state,node.tree)-1;
  // every invested node above tier 1 must still have enough points below it
  for(const n of t.nodes){
    if(!(state.points?.[n.id]>0)||n.tier<=1)continue;
    const below=t.nodes.filter(m=>m.tier<n.tier).reduce((a,m)=>a+(state.points?.[m.id]??0)-(m.id===node.id?1:0),0);
    if(below<tierNeed(cfg,n.tier))return false;
  }
  return left>=0;
}
// ---- loadout ----------------------------------------------------------------------------------
export function equipAction(cls,state,treeId){
  state.loadout={action:treeId,augments:(state.loadout?.action===treeId?state.loadout.augments:[])??[],capstone:state.loadout?.capstone??null};
}
export const isEquipped=(state,node)=>node.type==='augment'?!!state.loadout?.augments?.includes(node.id):node.type==='capstone'?state.loadout?.capstone===node.id:true;
// Equip/unequip an unlocked augment of the equipped tree. Returns a reason when it can't.
export function toggleAugment(cfg,cls,state,node){
  const l=state.loadout,slots=cfg.augmentSlots??2;
  if(l.augments.includes(node.id)){l.augments=l.augments.filter(id=>id!==node.id);return null;}
  if(!unlocked(cfg,cls,state,node))return 'locked';
  if(node.tree!==l.action)return 'tree';
  if(l.augments.length>=slots)return 'full';
  l.augments.push(node.id);return null;
}
// Equip/unequip an unlocked capstone (one slot, any tree).
export function toggleCapstone(state,node){
  if(state.loadout.capstone===node.id){state.loadout.capstone=null;return null;}
  if(!(state.points?.[node.id]>0))return 'locked';
  state.loadout.capstone=node.id;return null;
}
export function grantClassXp(cfg,state,amount){
  if(state.level>=cfg.xp.maxLevel)return 0;
  state.xp+=amount;let ups=0;
  while(state.level<cfg.xp.maxLevel&&state.xp>=xpToNext(cfg,state.level)){state.xp-=xpToNext(cfg,state.level);state.level++;ups++;}
  if(state.level>=cfg.xp.maxLevel)state.xp=0;
  return ups;
}
// Summed effects: every passive, plus equipped augments and the equipped tree's capstone.
export function stats(cls,state){
  const out={};
  for(const n of nodes(cls)){const r=n.type==='augment'?1:state.points?.[n.id]??0;if(!r||!isEquipped(state,n))continue;for(const [k,v] of Object.entries(n.effects??{}))out[k]=(out[k]??0)+v*r;}
  return out;
}
// The equipped action skill's numbers with the trees applied. Passives are generic
// ability.* stats (damage, duration, cooldown, rate, size, slow) and land on whichever
// skill is equipped: duration is time for the turret, drone and barrage, and hits /
// wear for walls, sandbags and wire; size is range, blast radius, width or radius.
export function actionStats(cls,state){
  const s=stats(cls,state),act=actionOf(cls,state),b=act.base,k=(key,def=0)=>s[key]??def;
  const dmg=1+k('ability.damage'),dur=1+k('ability.duration'),cd=b.cooldown*Math.max(.3,1-k('ability.cooldown')),rate=1+k('ability.rate'),size=1+k('ability.size'),slow=k('ability.slow'),two=!!k('cap.double');
  const common={cooldown:cd,dmgMul:dmg,slow:Math.min(.8,slow)};
  switch(act.id){
    case 'wall':return {...common,health:Math.round(b.health*dur*(two?.75:1)),width:b.width*size,height:b.height,count:two?2:1};
    case 'snare':return {...common,radius:b.radius*size,durability:Math.round(b.durability*dur),damage:b.damage*dmg,tick:.5/rate,slow:Math.min(.85,b.slow+slow),count:two?2:1};
    case 'nest':return {...common,health:Math.round(b.health*(k('nest.ring')?4:3)*dur*(two?1.75:1)),   // one pool for the whole nest
      radius:b.radius*size,width:b.width*size,height:b.height,segments:k('nest.ring')?4:3};
    case 'drone':{const n=(1+k('drone.count'))*(two?2:1);return {...common,duration:b.duration*dur*(two?.75:1),damage:b.damage*dmg*(n>1?.7:1),rate:b.rate*rate,range:b.range*size,count:n};}
    case 'mortar':{const sus=k('mortar.sustain');return {...common,count:two?2:1,duration:b.duration*dur*(1+sus)*(two?.75:1),damage:b.damage*dmg,interval:b.interval/rate*(sus?.75:1),range:b.range*size,radius:b.radius*size};}
    default:return {...common,duration:b.duration*dur*(two?.75:1),damage:b.damage*dmg,rate:b.rate*rate,range:b.range*size,count:two?2:1};
  }
}
// The action card's stat lines: [label, value, improved-over-base]
export function actionRows(cls,state,a){
  const act=actionOf(cls,state),b=act.base,up=(x,y)=>Math.abs(x-y)>1e-6,pct=v=>Math.round(v*100)+'%',sec=v=>v.toFixed(0)+'s';
  const cdRow=['COOLDOWN',sec(a.cooldown),up(a.cooldown,b.cooldown)],slowRow=['SLOW',a.slow?pct(a.slow):'—',a.slow>0];
  switch(act.id){
    case 'wall':return [cdRow,['LASTS','UNTIL BROKEN',false],['HITS',String(a.health),a.health!==b.health],['WIDTH',String(Math.round(a.width)),up(a.width,b.width)],['DAMAGE',pct(a.dmgMul-1)==='0%'?'—':'+'+pct(a.dmgMul-1),a.dmgMul>1],['WALLS',String(a.count),a.count>1]];
    case 'snare':return [cdRow,['LASTS','UNTIL WORN',false],['WEAR',a.durability+' zombie-s',a.durability!==b.durability],['DAMAGE',pct(a.damage)+'/s',up(a.damage,b.damage)],['SLOW',pct(a.slow),up(a.slow,b.slow)],['RADIUS',String(Math.round(a.radius)),up(a.radius,b.radius)]];
    case 'nest':return [cdRow,['LASTS','UNTIL BROKEN',false],['HITS (WHOLE NEST)',String(a.health),false],['RADIUS',String(Math.round(a.radius)),up(a.radius,b.radius)],['DAMAGE',pct(a.dmgMul-1)==='0%'?'—':'+'+pct(a.dmgMul-1),a.dmgMul>1],['WALLS',String(a.segments),a.segments>3]];
    case 'drone':return [cdRow,['DURATION',sec(a.duration),up(a.duration,b.duration)],['DAMAGE',pct(a.damage),up(a.damage,b.damage)],['FIRE RATE',a.rate.toFixed(1)+'/s',up(a.rate,b.rate)],['RANGE',String(Math.round(a.range)),up(a.range,b.range)],['DRONES',String(a.count),a.count>1]];
    case 'mortar':return [cdRow,['DURATION',sec(a.duration),up(a.duration,b.duration)],['DAMAGE',pct(a.damage),up(a.damage,b.damage)],['SHELL EVERY',a.interval.toFixed(1)+'s',up(a.interval,b.interval)],['BLAST',String(Math.round(a.radius)),up(a.radius,b.radius)],['BEACONS',String(a.count),a.count>1]];
    default:return [cdRow,['DURATION',sec(a.duration),up(a.duration,b.duration)],['DAMAGE',pct(a.damage),up(a.damage,b.damage)],['FIRE RATE',a.rate.toFixed(1)+'/s',up(a.rate,b.rate)],['RANGE',String(Math.round(a.range)),up(a.range,b.range)],slowRow];
  }
}
export function describe(node,rank){
  const k=Object.keys(node.effects??{})[0],per=node.effects?.[k]??0,v=per*Math.max(1,rank);
  const txt=node.fmt==='s'?+v.toFixed(1):node.fmt==='n'?Math.round(v):Math.round(v*100);
  return node.desc.replace('{v}',txt);
}
