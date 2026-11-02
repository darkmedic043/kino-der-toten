// The Gardener's action skill, the Potting Bench (classes mod): Z opens the bench (garden-bench.js), a recipe goes in the
// ground where you aim, and the plant grows from Sprout to Grown to Mature to Ancient for as long as it survives. Kills
// close by and a melee pat age it faster; zombies stop to chew whatever they walk into. Ingredients drop from kills and
// are collected by walking near them. Rules and balance are in garden-rules.js, numbers in classes.json (cls.gardener),
// the models and pictures come from .tools/build_garden_plants.py. Co-op: damage goes through enemies.hurt as every other
// skill's does; chewing, slows, swallowing and lures move zombies, so they only run on the host (a guest's plants are
// seen, and they deal damage, but don't hold anyone).
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { zombieHealth } from '../../rules.js';
import { setupBench } from './garden-bench.js';
import { gardenSeeds, recipe, stageAt, stagePower, stageHits, plantCooldown, plantBlock, plotsFor, bloomCost, dropsFor } from './garden-rules.js';

const up=new THREE.Vector3(0,1,0),down=new THREE.Vector3(0,-1,0);
const ITEMS=['fertilizer','dew','compost','pollen','sap','mutagen','packet','rare'];
const asset=f=>new URL('garden/'+f,import.meta.url).href;
let protos=null;

// Every class loads the plants: a teammate's garden shows up in co-op. One solid and one unlit material, so the whole
// garden costs two programs, both built at load with the rest of the warm-up.
export async function loadGarden(host){
  if(protos)return protos;
  const root=await loadModel(asset('plants.glb')).catch(()=>null);if(!root)return null;
  const solid=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.62,metalness:0,side:THREE.DoubleSide}),glow=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide});
  root.traverse(o=>{if(o.isMesh){o.material=/glow/.test(o.material?.name??'')?glow:solid;o.frustumCulled=false;}});
  protos=Object.fromEntries(root.children.map(c=>[c.name,c]));
  const all=new THREE.Group();for(const c of Object.values(protos))all.add(c.clone());
  host.warmObjects?.push(all);
  return protos;
}
export const plantModel=name=>protos?.[name]?.clone()??null;

export function setupGardener(ctx){
  const {api,cls}=ctx,{host,session,data,scene,camera,player,enemies,world,audio}=api;
  const G=cls.gardener,S=()=>ctx.S(),sk=()=>ctx.skills?.(),P=G.plants;
  const zh=()=>zombieHealth(session.round,data.rules);
  const sun=()=>sk()?.res?.value??0;
  const guest=()=>!!window.kino.coop?.id&&!window.kino.coop.isHost;
  const alive=z=>enemies.list.includes(z)&&z.state!=='dead';
  const feet=()=>player.getFeetPosition();
  const say=(t,s=1.4)=>api.toast?.(t,s);
  const known=()=>gardenSeeds(cls,ctx.state());
  const plants=[],inv={},pity={},shots=[],drops=[],burred=new Map();
  let tick=0,rushUntil=-1,placing=null,sunBank=0;
  const emptyInv=()=>{for(const k of ITEMS)inv[k]=0;if(S()['garden.stock']){inv.packet=1;inv.fertilizer=1;}};
  emptyInv();

  // ---- pooled effects, all built at load -----------------------------------------------------------------------------
  const FLAT=(color,o=1)=>new THREE.MeshBasicMaterial({color,transparent:true,opacity:o,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
  const beamGeo=new THREE.CylinderGeometry(1,1,1,5,1,true);beamGeo.translate(0,.5,0);beamGeo.rotateX(Math.PI/2);
  const beams=Array.from({length:14},()=>{const m=new THREE.Mesh(beamGeo,FLAT(0xffffff));m.frustumCulled=false;m.life=0;host.warmObjects?.push(m);return m;});
  function beam(a,b,color,life=.09,width=1.2){
    const m=beams.find(x=>x.life<=0);if(!m)return;
    m.life=m.span=life;m.material.color.set(color);m.material.opacity=.9;m.position.copy(a);m.lookAt(b);m.scale.set(width,width,a.distanceTo(b));m.updateMatrix();m.updateMatrixWorld(true);scene.add(m);
  }
  const ringGeo=new THREE.RingGeometry(.96,1,48);ringGeo.rotateX(-Math.PI/2);
  const rings=Array.from({length:8},()=>{const m=new THREE.Mesh(ringGeo,FLAT(0xffffff));m.frustumCulled=false;m.life=0;host.warmObjects?.push(m);return m;});
  function pulse(at,r,color,life=.6){const m=rings.find(x=>x.life<=0);if(!m)return;m.life=m.span=life;m.reach=r;m.material.color.set(color);m.position.copy(at).addScaledVector(up,3);scene.add(m);}
  const flights=[];
  const melons=Array.from({length:6},()=>null),burrs=[];
  melons.forEach((_,i)=>{melons[i]=plantModel('melon_ball');});
  for(let i=0;i<10;i++){const b=plantModel('burr_ball');if(b)burrs.push(b);}
  const ghostMat=new THREE.MeshBasicMaterial({color:0x9fe06a,transparent:true,opacity:.42,depthWrite:false,side:THREE.DoubleSide});
  const reachRing=new THREE.Mesh(ringGeo,FLAT(0x9fe06a,.7));reachRing.frustumCulled=false;host.warmObjects?.push(reachRing);
  {const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),ghostMat);host.warmObjects?.push(m);}
  // ingredients lying on the ground
  const spriteMat={};
  for(const id of ITEMS){
    let t;host.pending?.push?.(new Promise(done=>{t=new THREE.TextureLoader().load(asset(`icons/${id}.webp`),()=>{api.renderer?.initTexture?.(t);done();},undefined,done);}));
    t.colorSpace=THREE.SRGBColorSpace;
    spriteMat[id]=new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false});
    const s=new THREE.Sprite(spriteMat[id]);host.warmObjects?.push(s);
  }
  const dropAt=(id,at)=>{
    const s=new THREE.Sprite(spriteMat[id]);s.scale.setScalar(26);s.position.copy(at).addScaledVector(up,24);scene.add(s);
    drops.push({id,s,life:G.drops.life,y:s.position.y});
  };

  // ---- power and damage ----------------------------------------------------------------------------------------------
  const sunMul=()=>1+sun()*cls.resource.per.plant*(1+(S()['garden.sunPower']??0));
  function power(p){
    const s=S();let k=p.r.power*stagePower(G,s,Math.max(1,p.stage))*sunMul()*(1+(p.spikes??0)+(p.fed??0));
    if(s['garden.variety'])k*=1+s['garden.variety']*new Set(plants.map(x=>x.r.id)).size;
    if(session.time<rushUntil)k*=1+G.fixtures.bloomRage.power;
    return k;
  }
  function raw(p,z,dmg){
    if(!alive(z))return false;
    enemies.hurt(z,dmg,false,false,'fortify',false);
    const killed=!alive(z);
    ctx.onHit?.(z,killed);
    if(killed)session.addPoints?.(50);
    else if(S()['garden.rootSlow']&&!guest())z.rootUntil=session.time+2;
    return killed;
  }
  function hit(p,z,frac){
    const s=S();let d=frac*zh()*power(p);
    if(s['garden.execute']&&z.health<zh()*.5)d*=1+s['garden.execute'];
    return raw(p,z,d);
  }
  const free=z=>alive(z)&&!z.swallowed;
  const within=(p,r,kinds=true)=>enemies.list.filter(z=>free(z)&&z.root.position.distanceTo(p.at)<r&&(kinds||z.kind!=='dog'));
  const nearest=(p,list)=>list.sort((a,b)=>a.root.position.distanceToSquared(p.at)-b.root.position.distanceToSquared(p.at));
  const chest=z=>z.root.position.clone().addScaledVector(up,42);
  const tip=p=>p.at.clone().addScaledVector(up,p.top);
  function use(p){if(--p.uses<=0)kill(p);}

  // ---- what each plant does (p.stage >= 1; a plant's own numbers are p.r.def) -------------------------------------------
  const BEH={
    pod(p,dt,d){
      if((p.t-=dt)>0)return;
      const list=shots.filter(h=>session.time-h.t<d.window).slice(-d.replay*(p.stage>=3?2:1));
      const ts=nearest(p,within(p,p.r.range)).filter(z=>world.lineClear(tip(p),chest(z)));
      if(!list.length||!ts.length){p.t=.4;return;}
      p.t=d.every;const from=tip(p),k=power(p);
      list.forEach((h,i)=>{const z=ts[i%ts.length];if(!alive(z))return;beam(from,chest(z),0xffd978,.09,.9);raw(p,z,Math.min(h.amount*d.share*k,d.cap*zh()*k));});
      audio.play('buy',.12);use(p);
    },
    thorn(p,dt,d){
      if((p.t-=dt)>0)return;p.t=.5;
      const mark=session.time+(p.stage>=3?3:.8);
      for(const z of nearest(p,within(p,p.r.range)).slice(0,d.targets)){z.thornMark=mark;z.thornK=d.mark+(S()['garden.markBonus']??0);hit(p,z,d.dps*.5);}
    },
    bulb(){},   // Sunlight and shade are in the shared tick below
    burr(p,dt,d){
      if((p.t-=dt)>0)return;
      const z=nearest(p,within(p,p.r.range)).find(z=>!burred.has(z));if(!z){p.t=.25;return;}
      p.t=d.every;beam(tip(p),chest(z),0xe8cf8a,.12,.8);stick(p,z,d.hops);use(p);
    },
    bean(p,dt,d){
      if((p.t-=dt)>0)return;
      const f=feet(),flat=Math.hypot(f.x-p.at.x,f.z-p.at.z);
      if(flat<p.r.range&&Math.abs(f.y-p.at.y)<50){
        player.velocity.y=d.launch*(p.stage>=3?1.25:1);player.grounded=false;p.spring=1;p.t=d.rest;audio.play('teleport',.5);pulse(p.at,70,0xb7e06a);use(p);return;
      }
      const zs=within(p,p.r.range);if(!zs.length){p.t=.1;return;}
      p.spring=1;p.t=d.rest;pulse(p.at,70,0xb7e06a);
      for(const z of zs){hit(p,z,d.toss);if(alive(z)&&!guest())ctx.stagger?.(z,d.stun);}
      use(p);
    },
    mint(){},   // fed by the kill handler, emptied by a pat
    gourd(p,dt,d){
      if(guest()){if(within(p,p.r.range).length){p.fuse=(p.fuse??2)-dt;if(p.fuse<=0)burst(p);}return;}
      const cap=d.swallow+(S()['garden.gourdCap']??0);p.inside??=[];
      if((p.t-=dt)<=0&&p.inside.length<cap){
        const z=nearest(p,within(p,p.r.range,false)).find(z=>z.kind==='zombie'&&!['barricade','entering','rising'].includes(z.state));
        if(z){p.t=d.gulp;release(z);z.swallowed=p;z.root.visible=false;p.inside.push(z);p.fuse??=d.fuse;pulse(p.at,60,0xff7a2a,.3);audio.play('buy',.1);}
      }
      if(p.inside.length&&(p.fuse-=dt)<=0)burst(p);
    },
    lily(p,dt,d){
      const nearDial=plants.some(o=>o.r.id==='bulb'&&o.stage>0&&o.at.distanceTo(p.at)<d.sundialRange);
      const reach=z=>free(z)&&z.root.position.distanceTo(p.at)<p.r.range;
      const clear=z=>world.lineClear(tip(p),chest(z));
      if((p.look-=dt)<=0||!p.z||!reach(p.z)){
        p.look=.25;
        if(!p.z||!reach(p.z)||!clear(p.z)){p.z=nearest(p,within(p,p.r.range)).find(clear)??null;p.heat=0;}
        p.z2=p.stage>=3?nearest(p,within(p,p.r.range)).find(z=>z!==p.z&&clear(z))??null:null;
      }
      if(!p.z)return;
      p.heat=Math.min(1,(p.heat??0)+dt/d.rampTime);p.acc=(p.acc??0)+dt;
      const from=tip(p);beam(from,chest(p.z),0x8fe8ff,.05,1+p.heat*1.6);if(p.z2&&reach(p.z2))beam(from,chest(p.z2),0x8fe8ff,.05,1);
      if(p.acc>=.25){
        const dps=d.dps*(1+(d.ramp-1)*p.heat)*(nearDial?1+d.sundial:1),two=p.z2;p.acc=0;
        hit(p,p.z,dps*.25);if(two&&reach(two))hit(p,two,d.dps*.25);
      }
    },
    flower(p,dt,d){
      if((p.gas=(p.gas??.5)-dt)<=0){p.gas=.5;for(const z of nearest(p,within(p,p.r.range)).slice(0,d.targets))hit(p,z,d.dps*.5);}
      if((p.t-=dt)>0||guest())return;
      p.t=d.lureEvery;p.luring=session.time+d.lureFor;
      p.lured=new Set(nearest(p,within(p,d.lureRange,false)).filter(z=>z.kind!=='dog').slice(0,p.stage>=3?20:d.lure));
      if(p.lured.size){pulse(p.at,220,0x58ff6a,1.1);audio.play('round',.25);}
    },
    maw(p,dt,d){
      if((p.t-=dt)>0)return;
      const z=nearest(p,within(p,p.r.range))[0];if(!z){p.t=.2;return;}
      const to=z.root.position;p.node.rotation.y=Math.atan2(-(to.z-p.at.z),to.x-p.at.x);p.snap=1;audio.knife?.('hit',false);
      const by=p.stage>=3?within({at:to.clone()},80).filter(o=>o!==z):[];
      if(hit(p,z,d.bite))p.fed=Math.min(d.feedMax,(p.fed??0)+d.feed);
      for(const o of by)hit(p,o,d.bite*.5);
      p.bites=(p.bites??0)+1;
      if(p.bites>=d.full){p.bites=0;p.t=d.digest;}else p.t=d.every;
    },
    melon(p,dt,d){
      if((p.t-=dt)>0)return;
      const list=within(p,p.r.range);if(!list.length){p.t=.3;return;}
      let best=null,n=-1;for(const z of list){const c=list.filter(o=>o.root.position.distanceTo(z.root.position)<d.radius).length;if(c>n){n=c;best=z;}}
      p.t=d.every;lob(p,best.root.position.clone(),d.lob);
      if(p.stage>=3)for(const q of [1.2,4.3])lob(p,best.root.position.clone().add(new THREE.Vector3(Math.cos(q)*130,0,Math.sin(q)*130)),d.lob*.4);
    }
  };
  function lob(p,to,frac){
    const m=melons.find(x=>x&&!x.parent);const k=frac*power(p),d=p.r.def;
    const f={from:tip(p),to,t:0,dur:Math.max(.5,p.at.distanceTo(to)/700),m,k,radius:d.radius};
    if(m){m.position.copy(f.from);scene.add(m);}flights.push(f);audio.play('buy',.12);
  }
  // Burrs ride a zombie, make it take more damage and bleed it; when it dies the burr hops on.
  function stick(p,z,hops){
    const m=burrs.find(b=>!b.parent);if(m){m.position.set(4,46,3);z.root.add(m);}
    burred.set(z,{p,k:power(p),until:session.time+p.r.def.last,hops,tick:.5,m,range:p.r.def.hopRange*(p.stage>=3?2:1),bonus:p.r.def.bonus,dps:p.r.def.dps});
  }
  function unstick(z){const b=burred.get(z);b?.m?.removeFromParent();burred.delete(z);return b;}

  // ---- the life of a plant -------------------------------------------------------------------------------------------
  function setStage(p,stage){
    const name=stage===0?'sprout':`${p.r.id}_${Math.min(3,stage)}`;
    const before=stageHits(G,p.stage),m=plantModel(name);p.stage=stage;
    if(m&&name!==p.model){p.mesh?.removeFromParent();p.mesh=m;p.node.add(m);p.model=name;p.pop=0;}
    const max=p.r.hits*stageHits(G,stage);p.hits=Math.min(max,p.hits*(stageHits(G,stage)/before));p.maxHits=max;
    p.top=stage===0?14:(p.r.id==='bean'?28:42+stage*11);
  }
  function kill(p,opts={}){
    const i=plants.indexOf(p);if(i<0)return;plants.splice(i,1);
    p.node.removeFromParent();
    for(const z of p.chewers)release(z);p.chewers.clear();
    if(p.inside?.length){const list=p.inside;p.inside=[];for(const z of list)free2(z);}
    if(opts.uproot)return;
    if(S()['garden.deathBlast']&&p.stage>0)ctx.blast?.(p.at.clone().addScaledVector(up,20),160,G.fixtures.deathBlast,true);
    if(!opts.silent)dropAt('compost',p.at);
    bench.refresh();
  }
  function free2(z){z.swallowed=null;if(enemies.list.includes(z)){z.root.visible=true;z.attackLeft=.01;}}
  function release(z){const p=z.chewing;if(p){p.chewers.delete(z);z.chewing=null;z.chewNext=session.time+G.chew.rest;}}
  function burst(p){
    const d=p.r.def,list=p.inside??[],n=list.length,k=power(p),at=p.at.clone().addScaledVector(up,24);
    const frac=d.burst*(1+d.perZombie*n)*k,radius=d.radius*(p.stage>=3?1.3:1);
    for(const z of list)free2(z);p.inside=[];
    for(const z of list)if(alive(z))raw(p,z,frac*(d.inner-1)*zh());
    ctx.blast?.(at,radius,frac,true);pulse(p.at,radius,0xff7a2a,.5);
    kill(p,{silent:true});dropAt('compost',p.at);
  }
  function grow(p,dt){
    if(p.hits<=0){kill(p);return;}
    if(p.stage===0){p.grow-=dt;if(p.grow<=0){setStage(p,1);p.age=0;pulse(p.at,50,0x9fe06a);bench.refresh();}return;}
    p.age+=dt*p.r.ageRate;
    const st=stageAt(G,p.age,p.r.cap);
    if(st!==p.stage){setStage(p,st);pulse(p.at,90,0xffe27a);audio.play('buy',.25);if(st>=2)say(`${p.r.name} is ${G.stages[st].name}`);bench.refresh();}
    const regen=(p.r.life==='perennial'?G.regen:0)+(S()['garden.regen']??0)/10;
    if(regen)p.hits=Math.min(p.maxHits,p.hits+regen*dt);
    BEH[p.r.id]?.(p,dt,p.r.def);
  }
  function bite(p,z){
    const s=S();if(s['garden.chewHurt'])hit(p,z,s['garden.chewHurt']);
    if(s['garden.dodge']&&Math.random()<s['garden.dodge'])return;
    p.hits-=1;p.shake=1;if(p.hits<=0)kill(p);
  }
  // zombies stop to chew what they walk into (held as fortifier.js holds them at a wall; the host decides)
  const RESTLESS=['dead','barricade','entering','rising'];
  function chew(){
    if(guest())return;
    for(const z of enemies.list){
      if(z.swallowed){
        z.root.position.x=z.swallowed.at.x;z.root.position.z=z.swallowed.at.z;z.stuck=0;
        z.state='attack';z.attackLeft=1.15;z.attackDealt=true;continue;
      }
      if(z.kind==='dog'||z.kind==='nova'||RESTLESS.includes(z.state))continue;
      const p=z.chewing;
      if(p){
        if(!plants.includes(p)){release(z);continue;}
        z.root.position.x=z.chewAt.x;z.root.position.z=z.chewAt.z;z.stuck=0;
        if(z.state!=='attack'){z.state='attack';z.attackLeft=1.15;z.attackDealt=true;z.rig.play('attack',false);z.chewBit=false;z.root.rotation.y=Math.atan2(p.at.x-z.chewAt.x,p.at.z-z.chewAt.z);}
        else if(!z.chewBit&&z.attackLeft<.62){z.chewBit=true;bite(p,z);}
        continue;
      }
      if(session.time<(z.chewNext??0))continue;
      for(const q of plants){
        if(q.chewers.size>=G.chew.attackers||z.root.position.distanceTo(q.at)>G.chew.reach)continue;
        z.chewing=q;z.chewAt=z.root.position.clone();q.chewers.add(z);break;
      }
    }
  }
  // Shade, sap and Root Snare share one multiplier on each zombie's speed.
  function shade(){
    if(guest())return;
    const s=S(),mul=1+(s['garden.slowMul']??0);
    for(const z of enemies.list){
      let k=1;
      if(z.state!=='dead')for(const p of plants){
        if(p.stage===0||z.root.position.distanceTo(p.at)>p.r.range)continue;
        let slow=p.r.slow;if(p.r.id==='bulb')slow+=(p.stage>=3?.4:p.r.def.slow)*mul;
        k=Math.min(k,1-Math.min(.8,slow));
      }
      if(s['garden.rootSlow']&&z.rootUntil>session.time)k*=1-s['garden.rootSlow'];
      if(k!==(z.gardenK??1)){z.speed*=k/(z.gardenK??1);z.gardenK=k;}
    }
  }

  // ---- ingredients and kills -----------------------------------------------------------------------------------------
  host.on('beforeEnemyDamage',e=>{
    const z=e.enemy;if(!z)return;
    if(e.cause==='bullet'){
      shots.push({t:session.time,amount:e.amount});if(shots.length>40)shots.shift();
      if(z.thornMark>session.time)e.amount*=1+(z.thornK??0);
      if(z.swallowed)queueMicrotask(()=>{const p=z.swallowed;if(p&&plants.includes(p))burst(p);});
    }
    const b=burred.get(z);if(b)e.amount*=1+b.bonus;
  });
  host.on('kill',e=>{
    if(e.remote)return;
    const z=e.enemy,s=S(),at=z?.root?.position;if(!at)return;
    const close=plants.filter(p=>p.at.distanceTo(at)<G.drops.near);
    gainSun(G.sunPerKill);
    for(const p of close){
      if(p.stage>0)p.age+=G.ageKill*p.r.ageRate;
      if(p.r.id==='thorn'&&p.at.distanceTo(at)<p.r.range)p.spikes=Math.min(p.r.def.spikeMax,(p.spikes??0)+p.r.def.spike);
      if(p.r.id==='mint'&&p.stage>0&&p.at.distanceTo(at)<p.r.range){
        const more=1+(s['garden.coin']??0),two=p.stage>=3?2:1;
        p.bank=Math.min(p.r.def.bank*more*two,(p.bank??0)+p.r.def.coin*p.r.power*more*two);
      }
    }
    if(close.length&&s['garden.killCd'])ctx.trimCooldown?.(s['garden.killCd']);
    const got=dropsFor(G,s,{melee:!!e.melee,head:!!e.head,near:close.length>0,chewing:!!z.chewing,special:z.kind==='dog'||z.kind==='nova',round:session.round},Math.random,inv,pity,known());
    got.forEach((id,i)=>dropAt(id,at.clone().add(new THREE.Vector3(i*16,0,i*-12))));
    if(z.chewing)release(z);
  });
  function gainSun(n){sk()?.gain?.(n*(1+(S()['garden.sun']??0)));}
  function collect(dt){
    const f=feet();
    for(let i=drops.length-1;i>=0;i--){
      const d=drops[i];d.life-=dt;d.s.position.y=d.y+Math.sin(session.time*3+i)*3;
      const near=d.s.position.distanceTo(f)<G.drops.reach+24;
      if(!near&&d.life>0)continue;
      d.s.removeFromParent();drops.splice(i,1);
      if(near){inv[d.id]=Math.min(G.drops.cap,(inv[d.id]??0)+1);say('+1 '+(G.additives[d.id]?.name??G.items[d.id]?.name),1.1);audio.play('buy',.2);bench.refresh();}
    }
  }

  // ---- planting ------------------------------------------------------------------------------------------------------
  const usedPlots=()=>plants.reduce((n,p)=>n+p.r.plots,0);
  const block=(seed,adds)=>plantBlock(G,S(),seed,adds,{known:known(),inv,used:usedPlots(),garden:plants.map(p=>p.r.id)});
  function place(seed,adds,at,yaw){
    const r=recipe(G,S(),seed,adds);
    const need=G.rarity[r.rarity].needs;if(need)inv[need]-=1;for(const a of adds)inv[a]-=1;
    const node=new THREE.Group();node.position.copy(at);node.rotation.y=yaw;scene.add(node);
    const big=adds.includes('fertilizer');
    const p={r,at:at.clone(),yaw,node,stage:0,grow:r.grow,age:0,hits:r.hits*stageHits(G,0),maxHits:r.hits*stageHits(G,0),uses:r.uses,t:0,top:14,chewers:new Set(),size:big?1.3:1,pop:0,shake:0,look:0,model:null,mesh:null,planted:session.time};
    setStage(p,0);plants.push(p);
    ctx.setCooldown?.(plantCooldown(G,seed,ctx.A().cooldown));
    audio.play('buy',.5);pulse(at,60,0x9fe06a);bench.refresh();
    return p;
  }
  function aimPoint(){
    const o=camera.getWorldPosition(new THREE.Vector3()),dir=camera.getWorldDirection(new THREE.Vector3()),f=feet();
    const h=world.raycast(new THREE.Ray(o,dir),0,G.reach+200);
    const pt=(h?.point?.clone?.())??(h?.distance!=null?o.clone().addScaledVector(dir,h.distance):o.clone().addScaledVector(dir,160));
    pt.addScaledVector(dir,-6);
    const flat=Math.hypot(pt.x-f.x,pt.z-f.z);
    if(flat>G.reach){const k=G.reach/flat;pt.x=f.x+(pt.x-f.x)*k;pt.z=f.z+(pt.z-f.z)*k;}
    pt.y=Math.max(pt.y,f.y)+50;
    const g=world.raycast(new THREE.Ray(pt.clone(),down),0,400);
    if(!g)return null;
    const y=g.point?.y??g.position?.y??pt.y-(g.distance??0);
    const at=new THREE.Vector3(pt.x,y,pt.z),gap=Math.hypot(at.x-f.x,at.z-f.z);
    const ok=gap>=G.minReach&&gap<=G.reach+1&&Math.abs(y-f.y)<140&&!plants.some(p=>p.at.distanceTo(at)<G.spacing)&&world.lineClear(f.clone().addScaledVector(up,40),at.clone().addScaledVector(up,30));
    return {at,ok};
  }
  function startPlacing(seed,adds){
    const r=recipe(G,S(),seed,adds);
    const ghost=plantModel(`${seed}_1`)??new THREE.Group();ghost.traverse(o=>{if(o.isMesh)o.material=ghostMat;});
    ghost.scale.setScalar(adds.includes('fertilizer')?1.3:1);
    scene.add(ghost);reachRing.scale.setScalar(Math.min(r.range,900));scene.add(reachRing);
    placing={seed,adds,ghost,ok:false,at:null};window.kino.lookHold=false;bench.close();bench.placing(true);
  }
  function stopPlacing(){if(!placing)return;placing.ghost.removeFromParent();reachRing.removeFromParent();placing=null;bench.placing(false);}
  function confirmPlace(){
    if(!placing)return;
    if(!placing.ok){say('Can’t plant there',.9);return;}
    const {seed,adds,at}=placing,f=feet();
    if(block(seed,adds)){say('Can’t plant that any more',1.1);stopPlacing();return;}
    place(seed,adds,at,Math.atan2(-(f.z-at.z),f.x-at.x));stopPlacing();
  }
  const aiming=()=>!!placing;
  addEventListener('mousedown',e=>{if(!placing)return;e.preventDefault();e.stopImmediatePropagation();if(e.button===0)confirmPlace();else if(e.button===2)stopPlacing();},true);
  addEventListener('keydown',e=>{if(!placing||e.repeat)return;if(e.code==='KeyQ'){e.stopImmediatePropagation();stopPlacing();}},true);
  let padWas=[false,false];
  function padPlace(){
    const gp=[...(navigator.getGamepads?.()??[])].find(g=>g?.connected);if(!gp)return;
    const a=!!gp.buttons[0]?.pressed,b=!!gp.buttons[1]?.pressed;
    if(a&&!padWas[0])confirmPlace();if(b&&!padWas[1])stopPlacing();padWas=[a,b];
  }

  // ---- bloom, uproot, pat --------------------------------------------------------------------------------------------
  function bloom(){
    const s=S(),cost=bloomCost(G,s);
    if(sun()<cost)return false;
    sk()?.spend?.(cost);
    for(const p of plants){
      if(p.stage===0)p.grow=0;else p.age+=G.bloomAge;
      if(s['garden.bloomHeal'])p.hits=p.maxHits;
      pulse(p.at,110,0xffe27a,.8);
    }
    if(s['garden.bloomRage'])rushUntil=session.time+G.fixtures.bloomRage.time;
    audio.play('round',.3);say('BLOOM',1.2);bench.refresh();return true;
  }
  function uproot(p){
    const s=S();
    if(s['garden.refund']){const need=G.rarity[p.r.rarity].needs;if(need)inv[need]=Math.min(G.drops.cap,(inv[need]??0)+1);ctx.trimCooldown?.((ctx.getCooldown?.()??0)*.5);}
    kill(p,{uproot:true});bench.refresh();
  }
  // A pat is any melee swing, seen from the session: mods/melee replaces view.melee after this mod loads.
  let swinging=false,patAt=0;
  function pat(){
    const f=feet(),look=camera.getWorldDirection(new THREE.Vector3());let best=null,bd=115;
    for(const p of plants){
      const v=p.at.clone().sub(f);const d=Math.hypot(v.x,v.z);if(d>=bd)continue;
      v.y=0;if(d>30&&v.normalize().dot(look.clone().setY(0).normalize())<.25)continue;
      best=p;bd=d;
    }
    if(!best||session.time<(best.patNext??0))return;
    const p=best,s=S();p.patNext=session.time+G.patCooldown;
    p.hits=Math.min(p.maxHits,p.hits+G.patHeal+(s['garden.pat']??0));if(p.stage>0)p.age+=G.agePat;
    p.snap=.6;pulse(p.at,46,0x9fe06a,.35);
    if(p.bank>=1){const n=Math.floor(p.bank);p.bank=0;session.addPoints?.(n);say(`+${n} from the ${p.r.name}`,1.2);audio.play('buy',.4);}
  }

  // ---- every frame -----------------------------------------------------------------------------------------------------
  host.on('update',dt=>{
    if(!dt)return;
    chew();
    const swing=session.meleeLeft>0;if(swing&&!swinging)patAt=session.time+.18;swinging=swing;
    if(patAt&&session.time>=patAt){patAt=0;pat();}
    let sunRate=0;
    for(const p of [...plants]){
      grow(p,dt);
      if(p.r.id==='bulb'&&p.stage>0)sunRate+=p.r.def.sun*stagePower(G,S(),p.stage);
      // growing in, flinching, a bite or a bounce: only the plant's own node moves
      p.pop=Math.min(1,p.pop+dt*2.6);p.shake=Math.max(0,p.shake-dt*4);p.snap=Math.max(0,(p.snap??0)-dt*3.2);p.spring=Math.max(0,(p.spring??0)-dt*3);
      const pop=1-Math.pow(1-p.pop,3),k=p.size*(.3+.7*pop);
      p.node.scale.set(k*(1+p.snap*.18),k*(1-p.snap*.14+p.spring*.4),k*(1+p.snap*.18));
      if(p.mesh)p.mesh.rotation.z=Math.sin(session.time*40)*.05*p.shake;
    }
    if(sunRate){sunBank+=Math.min(P.bulb.sunCap,sunRate)*dt;if(sunBank>=1){const n=Math.floor(sunBank);sunBank-=n;gainSun(n);}}
    if((tick-=dt)<=0){tick=.25;shade();}
    for(const [z,b] of burred){
      if(!alive(z)){
        unstick(z);
        if(b.hops>0){const n=enemies.list.find(o=>free(o)&&!burred.has(o)&&o.root.position.distanceTo(z.root.position)<b.range);if(n){const m=burrs.find(x=>!x.parent);if(m){m.position.set(4,46,3);n.root.add(m);}burred.set(n,{...b,hops:b.hops-1,m,tick:.5,until:session.time+b.p.r.def.last});}}
        continue;
      }
      if(session.time>b.until){unstick(z);continue;}
      if((b.tick-=dt)<=0){b.tick=.5;raw(b.p,z,b.dps*.5*zh()*b.k);}
    }
    for(let i=flights.length-1;i>=0;i--){
      const f=flights[i];f.t+=dt/f.dur;const t=Math.min(1,f.t);
      if(f.m){f.m.position.lerpVectors(f.from,f.to,t);f.m.position.y+=4*t*(1-t)*180;f.m.rotation.x+=dt*5;}
      if(t>=1){f.m?.removeFromParent();flights.splice(i,1);ctx.blast?.(f.to.clone().addScaledVector(up,16),f.radius,f.k,true);pulse(f.to,f.radius,0x9fe06a,.45);}
    }
    for(const m of beams)if(m.life>0){m.life-=dt;m.material.opacity=Math.max(0,m.life/m.span);if(m.life<=0)m.removeFromParent();}
    for(const m of rings)if(m.life>0){m.life-=dt;const t=1-m.life/m.span;m.scale.setScalar(m.reach*(.15+.85*t));m.material.opacity=1-t;if(m.life<=0)m.removeFromParent();}
    collect(dt);
    if(placing){
      if(session.phase==='reviving'||session.phase==='gameover'){stopPlacing();}
      else{
        const a=aimPoint();placing.ok=!!a?.ok;
        if(a){placing.at=a.at;placing.ghost.position.copy(a.at);reachRing.position.copy(a.at).addScaledVector(up,3);}
        placing.ghost.visible=!!a;ghostMat.color.set(placing.ok?0x9fe06a:0xe0604a);reachRing.material.color.set(placing.ok?0x9fe06a:0xe0604a);
        padPlace();
      }
    }
    bench.update(dt);
  });
  // Corpse Flower's stench
  const lure=enemies.lureTarget?.bind(enemies);
  enemies.lureTarget=z=>{for(const p of plants)if(p.lured?.has(z)&&session.time<p.luring)return p.at;return lure?lure(z):null;};
  host.on('roundEnd',()=>{for(const p of [...plants])if(p.r.life==='annual'){if(p.inside?.length)burst(p);else kill(p);}});
  host.on('reset',()=>{
    for(const p of [...plants])kill(p,{silent:true,uproot:true});
    stopPlacing();bench.close();for(const z of [...burred.keys()])unstick(z);
    for(const d of drops)d.s.removeFromParent();drops.length=0;
    for(const f of flights)f.m?.removeFromParent();flights.length=0;shots.length=0;
    for(const k in pity)delete pity[k];
    emptyInv();rushUntil=-1;sunBank=0;
  });

  const bench=setupBench({api,cls,G,ctl:{S,inv,plants,known,sun,block,bloom,uproot,startPlacing,aiming,stopPlacing,confirmPlace,usedPlots,
    cooldown:()=>ctx.getCooldown?.()??0,base:()=>ctx.A().cooldown,power:p=>power(p)}});
  function deploy(){
    if(placing){confirmPlace();return;}
    if(bench.isOpen()){bench.confirm();return;}
    bench.open();
  }
  return {deploy,up:()=>false,always:true,plants,inv,bench,stage:p=>p.stage,near:(f,d)=>plants.some(p=>p.at.distanceTo(f)<d),bloom,uproot,place,block};
}
