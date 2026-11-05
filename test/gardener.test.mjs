import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, gardenKnown, recipe, stageAt, stagePower, plantDps, plantBlock, plantCooldown, dropsFor, gardenSeeds, plotsFor, bloomCost } from '../export/web/mods/classes/garden-rules.js';

const cfg=JSON.parse(await readFile(new URL('../export/web/mods/classes/classes.json',import.meta.url)));
const cls=cfg.classes.find(c=>c.id==='gardener'),G=cls.gardener,S={};
const nodes=cls.trees.flatMap(t=>t.nodes);

// the best damage a legal garden makes: fill the plots from the strongest plant per plot, honouring each plant's limit
function bestGarden(s,stage,plots,seeds=Object.keys(G.plants)){
  const list=[];
  for(const id of seeds){
    const r=recipe(G,s,id),st=Math.min(stage,r.cap);
    // a wilting plant is used up: only as many stand at once as the bench can replace in its lifetime
    const p=G.plants[id],most=p.lifespan?1:p.life==='wilting'?Math.max(1,Math.round(p.uses*(p.every??8)/40)):p.limit??plots;
    for(let i=0;i<most;i++)list.push({id,d:plantDps(r,G,s,st),plots:r.plots,legend:p.legend});
  }
  list.sort((a,b)=>b.d/b.plots-a.d/a.plots);
  let left=plots,dps=0,used=[],legends=G.legends+(s['garden.legends']??0);
  for(const x of list)if(x.plots<=left&&(!x.legend||legends-->0)){left-=x.plots;dps+=x.d;used.push(x.id);}
  return {dps,used};
}

test('every effect a node names is one the game reads',async()=>{
  const src=(await readFile(new URL('../export/web/mods/classes/gardener.js',import.meta.url),'utf8'))+(await readFile(new URL('../export/web/mods/classes/garden-rules.js',import.meta.url),'utf8'))+(await readFile(new URL('../export/web/mods/classes/garden-bench.js',import.meta.url),'utf8'));
  for(const n of nodes)for(const k of Object.keys(n.effects??{}))if(k.startsWith('garden.')&&!n.seed)assert.ok(src.includes(`'${k}'`),k);
  for(const y of cls.synergies)for(const k of Object.keys(y.effects??{}))if(k.startsWith('garden.'))assert.ok(src.includes(`'${k}'`),k);
});
test('every plant has a behaviour and all three stages of model data',()=>{
  for(const [id,p] of Object.entries(G.plants)){assert.ok(p.desc&&p.ancient&&p.grow&&p.hits&&p.range,id);assert.ok(G.life[p.life],id);assert.ok(G.rarity[p.rarity],id);}
  assert.deepEqual(new Set(cls.trees.map(t=>t.seed)).size,3);
});
test('plants get stronger as they age, and only long-lived ones reach the top',()=>{
  assert.equal(stageAt(G,0,3),1);assert.equal(stageAt(G,G.stages[2].age,3),2);assert.equal(stageAt(G,G.stages[3].age,3),3);
  assert.equal(stageAt(G,9999,G.life.wilting.cap),1);assert.equal(stageAt(G,9999,G.life.annual.cap),2);
  assert.ok(stagePower(G,S,3)>stagePower(G,S,2)&&stagePower(G,S,2)>stagePower(G,S,1));
  assert.equal(recipe(G,S,'pod',['mutagen']).cap,2);
  assert.equal(recipe(G,S,'gourd',['mutagen']).cap,3);
});
test('a garden stays inside its budget: commons about a Sentry, the best one a strong late game but not a delete key',()=>{
  const commons=Object.keys(G.plants).filter(k=>G.plants[k].rarity==='common');
  const first=bestGarden(S,1,G.plots,commons),late=bestGarden(S,3,G.plots),maxed={'garden.power':.2,'garden.stagePower':.24,'garden.plots':3,'garden.legends':1},top=bestGarden(maxed,3,plotsFor(G,maxed));
  console.log('commons',first.dps.toFixed(2),first.used.join(),'\nlate',late.dps.toFixed(2),late.used.join(),'\nmaxed',top.dps.toFixed(2),top.used.join());
  assert.ok(first.dps<=.8,`commons ${first.dps}`);
  assert.ok(late.dps<=2.2,`late ${late.dps}`);
  assert.ok(top.dps<=4.5,`maxed ${top.dps}`);
});
test('rarer plants are better per plot and cost more bench time',()=>{
  const by=rar=>{const v=Object.keys(G.plants).filter(k=>G.plants[k].rarity===rar).map(k=>{const r=recipe(G,S,k);return plantDps(r,G,S,Math.min(r.cap,3))/r.plots;});return Math.max(...v);};
  assert.ok(by('rare')>by('common'));
  assert.ok(plantCooldown(G,'melon',40)>plantCooldown(G,'gourd',40)&&plantCooldown(G,'gourd',40)>plantCooldown(G,'pod',40));
});
test('rare seeds need their item, big plants their limit, and plots run out',()=>{
  const base={known:Object.keys(G.plants),inv:{},used:0,garden:[]};
  assert.equal(plantBlock(G,S,'melon',[],base),'rare');
  assert.equal(plantBlock(G,S,'gourd',[],base),'packet');
  assert.equal(plantBlock(G,S,'pod',[],{...base,known:[]}),'locked');
  assert.equal(plantBlock(G,S,'pod',['dew'],base),'ingredient');
  assert.equal(plantBlock(G,S,'pod',[],{...base,used:6}),'plots');
  assert.equal(plantBlock(G,S,'melon',[],{...base,inv:{rare:1},garden:['melon']}),'limit');
  assert.equal(plantBlock(G,S,'melon',[],{...base,inv:{rare:1},used:5}),'plots');
  assert.equal(plantBlock(G,S,'pod',[],base),null);
});
test('drop rates: packets are regular, rare seeds an event, and pity catches bad luck',()=>{
  const run=(kills,round,special=0)=>{
    const inv={},pity={};let packet=0,rare=0,seed=1;const rng=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
    for(let i=0;i<kills;i++)for(const id of dropsFor(G,S,{near:true,round,special:rng()<special},rng,inv,pity,Object.keys(G.plants))){if(id==='packet')packet++;if(id==='rare')rare++;inv[id]=0;}
    return {packet,rare};
  };
  const a=run(4500,8),b=run(30000,12,.05);
  console.log('packets per 4500 kills',a.packet,'rare seeds per 30000 kills',b.rare);
  assert.equal(a.rare,0);
  assert.ok(a.packet>=60&&a.packet<=170,`packets ${a.packet}`);
  assert.ok(b.rare>=100&&b.rare<=220,`rare ${b.rare}`);
  assert.equal(run(1000,3).packet,0);
});
test('seeds come from the trees, the capstone only while slotted',()=>{
  const st={points:{},loadout:{}};
  assert.deepEqual(gardenSeeds(cls,st),cls.trees.map(t=>t.seed));
  const seedNode=nodes.find(n=>n.type==='game'&&n.seed),cap=nodes.find(n=>n.type==='capstone'&&n.seed);
  assert.ok(gardenSeeds(cls,{points:{[seedNode.id]:1},loadout:{}}).includes(seedNode.seed));
  assert.ok(!gardenSeeds(cls,{points:{[cap.id]:1},loadout:{}}).includes(cap.seed));
  assert.ok(gardenSeeds(cls,{points:{[cap.id]:1},loadout:{capstone:cap.id}}).includes(cap.seed));
});
test('bloom has a floor',()=>{assert.ok(bloomCost(G,{'garden.bloomCost':-20})>=0);assert.equal(bloomCost(G,S),G.bloomCost);});

test('every class can reach its capstones with one side of each either-or',()=>{
  for(const c of cfg.classes)for(const t of c.trees){
    const cap=t.nodes.find(n=>n.type==='capstone');if(!cap)continue;
    const pairs={};let spend=0;
    for(const n of t.nodes){
      if(n.type==='augment'||n.tier>=cap.tier)continue;
      if(n.excl)pairs[n.excl]=Math.max(pairs[n.excl]??0,n.ranks);else spend+=n.ranks;
    }
    spend+=Object.values(pairs).reduce((a,b)=>a+b,0);
    assert.ok(spend>=(cap.tier-1)*cfg.tierPoints,`${c.id}/${t.id}: ${spend} points reachable`);
  }
});

test('two seeds cross only into their hybrid, and a Legendary is an exact recipe',()=>{
  assert.equal(resolve(G,'pod',null,['dew']).id,'pod');
  assert.equal(resolve(G,'pod','thorn',[]),null);
  assert.equal(resolve(G,'pod','lily',['dew']).id,'choir');
  assert.deepEqual(resolve(G,'pod','lily',['dew']).adds,['dew']);
  assert.equal(resolve(G,'melon',null,['moon','mutagen']).id,'patriarch');
  assert.deepEqual(resolve(G,'melon',null,['mutagen','moon']).adds,[]);
  assert.deepEqual(resolve(G,'melon',null,['mutagen','moon']).cost.sort(),['moon','mutagen']);
  assert.equal(resolve(G,'mutagen',null,[])?.id,'mutagen');   // nothing here checks seeds: the bench only offers real ones
});
test('every hybrid and Legendary is reachable, and a Legendary has a riddle in the Catalogue',()=>{
  const all=Object.fromEntries(nodes.map(n=>[n.id,1])),caps=nodes.filter(n=>n.seed&&n.type==='capstone').map(n=>n.id);
  const known=[null,...caps].flatMap(c=>gardenKnown(G,cls,{points:all,loadout:{capstone:c}}));
  for(const [id,p] of Object.entries(G.plants)){
    assert.ok(known.includes(id),id);
    if(p.legend)assert.ok(p.riddle&&p.recipe.length===3&&p.plots===3,id);
    if(p.parents)assert.ok(p.parents.every(x=>G.plants[x]&&!G.plants[x].parents),id);
  }
  const hy=nodes.flatMap(n=>n.hybrids??[]);for(const [id,p] of Object.entries(G.plants))if(p.parents)assert.ok(hy.includes(id),id);
  const recipes=Object.values(G.plants).filter(p=>p.recipe).map(p=>[...p.recipe].sort().join());assert.equal(new Set(recipes).size,recipes.length);
  for(const p of Object.values(G.plants))for(const x of p.recipe??[])assert.ok(G.plants[x]||G.additives[x],x);
});
test('one Legendary at a time, two with the capstone',()=>{
  const base={known:Object.keys(G.plants),inv:{rare:3},used:0,garden:['patriarch']};
  assert.equal(plantBlock(G,S,'grave',[],base),'legend');
  assert.equal(plantBlock(G,{'garden.legends':1,'garden.plots':3},'grave',[],{...base,used:3}),null);
  assert.equal(plantBlock(G,S,'pod',['dew'],{...base,inv:{dew:0}}),'ingredient');
  assert.equal(plantBlock(G,S,'pod',['dew'],{...base,inv:{dew:1},cost:[]}),null);
});
