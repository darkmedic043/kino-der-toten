// The Gardener's rules, kept pure so test/gardener.test.mjs can balance them: what a recipe makes, how plants age, what
// a kill drops. Numbers live in classes.json (cls.gardener); the world side is gardener.js, the menu garden-bench.js.
export const DEFAULT_RECIPE={seed:'thorn',adds:[]};

// Which seeds a loadout has: each tree's starter, every seed node with a point, and the slotted capstone's seed.
export function gardenSeeds(cls,state){
  const nodes=cls.trees.flatMap(t=>t.nodes);
  return [...cls.trees.map(t=>t.seed),
    ...nodes.filter(n=>n.type==='game'&&n.seed&&state.points?.[n.id]>0).map(n=>n.seed),
    ...nodes.filter(n=>n.type==='capstone'&&n.seed&&state.loadout?.capstone===n.id&&state.points?.[n.id]>0).map(n=>n.seed)];
}

// Every plant a loadout can make: seeds, the hybrids of each hybrid node (both parents needed), and Legendaries whose whole
// recipe is within reach.
export function gardenAdds(G,cls,state){
  const on=cls.trees.flatMap(t=>t.nodes).filter(n=>n.additive&&state.points?.[n.id]>0).map(n=>n.additive);
  return Object.keys(G.additives).filter(a=>!G.additives[a].gated||on.includes(a));
}
export function gardenKnown(G,cls,state){
  const seeds=gardenSeeds(cls,state),adds=gardenAdds(G,cls,state),out=[...seeds];
  for(const n of cls.trees.flatMap(t=>t.nodes))for(const h of n.hybrids??[])if(state.points?.[n.id]>0&&G.plants[h].parents.every(x=>seeds.includes(x)))out.push(h);
  for(const [id,p] of Object.entries(G.plants))if(p.recipe?.every(x=>seeds.includes(x)||adds.includes(x)))out.push(id);
  return out;
}

// What a mix at the bench makes: an exact Legendary recipe wins and uses its additives up without their effects; two seeds
// that don't cross make nothing (null). {id, adds: the additives that act on the plant, cost: what is used up}.
export function resolve(G,seed,seed2,adds=[]){
  const key=a=>[...a].sort().join('+'),all=key([seed,seed2,...adds].filter(Boolean));
  for(const [id,p] of Object.entries(G.plants))if(p.recipe&&key(p.recipe)===all)return {id,adds:[],cost:[...adds]};
  if(!seed2)return {id:seed,adds:[...adds],cost:[...adds]};
  const pair=key([seed,seed2]);
  for(const [id,p] of Object.entries(G.plants))if(p.parents&&key(p.parents)===pair)return {id,adds:[...adds],cost:[...adds]};
  return null;
}

export function plotsFor(G,S){return G.plots+(S['garden.plots']??0);}
export function slotsFor(G,S){return G.slots+(S['garden.slots']??0);}
export function bloomCost(G,S){return Math.max(0,G.bloomCost+(S['garden.bloomCost']??0));}

// A recipe's numbers before growth: seed + additives + the trees. sun = current Sunlight.
export function recipe(G,S,seed,adds=[],sun=0){
  const p=G.plants[seed];if(!p)return null;
  const sum=k=>adds.reduce((n,a)=>n+(G.additives[a]?.[k]??0),0),count=a=>adds.filter(x=>x===a).length;
  const sunMul=1+sun*.002*(1+(S['garden.sunPower']??0));
  const cap=Math.min(S['garden.stageCap']?4:3,G.life[p.life].cap+sum('cap')+(S['garden.stageCap']??0));   // 4 = Primordial, only with Overgrowth
  return {
    id:seed,name:p.name,rarity:p.rarity,life:p.life,def:p,adds:[...adds],
    plots:(p.plots??1)+sum('plots'),
    grow:p.grow*(1-Math.min(.9,S['garden.growth']??0))*Math.pow(.5,count('dew')),
    hits:p.hits*(1+(S['garden.hits']??0))*(1+sum('hits')),
    range:p.range*(1+(S['garden.range']??0))*(1+sum('range')),
    power:(1+(S['garden.power']??0))*(1+sum('power'))*sunMul,
    ageRate:(1+(S['garden.age']??0))*(1+sum('age')),
    slow:sum('slow')*(1+(S['garden.slowMul']??0)),
    uses:p.uses?Math.round(p.uses*(1+sum('uses')))+(S['garden.wiltUses']??0):0,
    fx:Object.fromEntries(['mulch','bone','frost','ember','static','blood','moon'].map(k=>[k,sum(k)]).filter(e=>e[1])),
    cap};
}

// stage: 0 sprout, then 1 Grown, 2 Mature, 3 Ancient. age counts from the moment it's Grown.
export function stageAt(G,age,cap){let s=1;for(let i=2;i<=Math.min(G.stages.length-1,cap);i++)if(age>=G.stages[i].age)s=i;return s;}
export function stagePower(G,S,stage){return G.stages[stage].power*(stage>=2?1+(S['garden.stagePower']??0):1);}
export function stageHits(G,stage){return G.stages[stage].hits;}

// Seconds until the bench is ready again after planting this seed.
export function plantCooldown(G,seed,base){return base*(G.cooldownMul[G.plants[seed]?.rarity]??1);}

// Can this recipe go in the ground? null, or why not (the bench says it).
export function plantBlock(G,S,seed,adds,{known,inv,used,garden,cost=adds}){
  const p=G.plants[seed];if(!p||!known.includes(seed))return 'locked';
  const need=G.rarity[p.rarity].needs;
  if(need&&(inv[need]??0)<1)return need;
  const counts={};for(const a of cost)counts[a]=(counts[a]??0)+1;
  for(const a in counts)if((inv[a]??0)<counts[a])return 'ingredient';
  if(p.limit&&garden.filter(x=>x===seed).length>=p.limit)return 'limit';
  if(p.legend&&garden.filter(x=>G.plants[x]?.legend).length>=G.legends+(S['garden.legends']??0))return 'legend';
  const r=recipe(G,S,seed,adds);
  if(used+r.plots>plotsFor(G,S))return 'plots';
  return null;
}

// The fraction of a zombie's health a plant deals per second with the given number of zombies in reach, at a stage: the
// figure the stat sheet shows and the balance test holds to its budget.
export function plantDps(r,G,S,stage,targets=3){
  const p=r.def,k=r.power*stagePower(G,S,stage);
  const reach=n=>Math.min(n,targets);
  switch(r.id){
    case 'pod':case 'royalty':return Math.min(p.replay,8)*p.cap/p.every*k;
    case 'choir':return Math.min(p.replay,8)*p.cap*Math.min(p.fan,reach(p.fan))*.5/p.every*k;
    case 'thorn':return p.dps*reach(p.targets)*k;
    case 'burr':return p.dps*reach(5)*k;
    case 'rider':return (p.dps+p.trail*Math.max(0,reach(5)-1))*reach(3)*k;
    case 'bloodweb':return p.bleed*reach(p.ties)*k;
    case 'vine':return 0;
    case 'revenant':return p.raisePower*2/p.every*k;
    case 'solar':return p.dps*reach(5)*.35*k;
    case 'thornmaw':{const cycle=p.every*p.full+p.digest;return (p.bite+p.spit)*p.full/cycle*k;}
    case 'catapult':{const n=p.swallow;return p.land*(1+p.perZombie*n)*(n+reach(5))/60*k;}
    case 'pitcher':return 1/p.melt*.5*k;
    case 'patriarch':return p.lob*(1+2*p.split+4*p.split*p.split)*reach(5)/p.every*k;
    case 'gourmand':{const cycle=p.every*p.full+p.digest;return p.bite*p.full/cycle*k;}
    case 'grave':return (p.dps*reach(p.targets)+p.raisePower/p.raiseEvery)*k;
    case 'lily':return p.dps*(1+(p.ramp-1)*.6)*k;
    case 'flower':return p.dps*reach(p.targets)*k;
    case 'maw':{const cycle=p.every*p.full+p.digest;return p.bite*p.full/cycle*k;}
    case 'melon':return p.lob*reach(5)/p.every*k;
    case 'gourd':{const n=p.swallow,cycle=60;return (p.burst*(1+p.perZombie*n)*(n*p.inner+reach(5)))/cycle*k;}
    default:return 0;
  }
}

// What a kill drops. ev: {melee,head,near,chewing,special,round}. inv: the player's stock. pity: {packet,rare} kills since
// the last one, mutated. Returns item ids. Fertilizer and friends only ever cost a roll, never a slot.
export function dropsFor(G,S,ev,rng,inv,pity,known,adds){
  const D=G.drops,mul=1+(S['garden.drop']??0),rare=1+(S['garden.rare']??0),out=[];
  const roll=(id,chance)=>{if((inv[id]??0)<D.cap&&rng()<chance*mul)out.push(id);};
  if(ev.melee)roll('fertilizer',D.melee);
  if(ev.head)roll('dew',D.head);
  if(ev.near)roll('pollen',D.pollen);
  if(ev.chewing)roll('sap',D.sap);
  if(ev.special)roll('mutagen',D.mutagen);
  const gated=(id,chance)=>{if(adds?.includes(id))roll(id,chance);};
  if(ev.crawler)roll('mulch',D.mulch);
  if(ev.head)gated('bone',D.bone);
  if(ev.slowed)gated('frost',D.frost);
  if(ev.burning)gated('ember',D.ember);
  if(ev.electric)gated('static',D.static);
  if(ev.moon)roll('moon',D.moon);
  const plants=known.map(k=>G.plants[k]).filter(Boolean);
  const paper=(id,cfg,chance)=>{
    if(ev.round<cfg.from||!plants.some(p=>G.rarity[p.rarity].needs===id)||(inv[id]??0)>=D.cap)return;
    pity[id]=(pity[id]??0)+1;
    if(rng()<chance*rare||pity[id]>=cfg.pity/rare){pity[id]=0;out.push(id);}
  };
  paper('packet',D.packet,D.packet.rate);
  paper('rare',D.rare,ev.special?D.rare.special:D.rare.rate);
  return out;
}
