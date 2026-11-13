// The Gardener's hybrids and Legendaries (gardener.js holds the shared plant life; numbers in classes.json cls.gardener).
// Most are a parent's behaviour with extra numbers, so they share its code: the pods read d.fan/d.pay, the gourds read
// d.melt/d.thrallFor/d.fling, the burrs read d.trail/d.thrallPower. What moves a zombie is a Z.order, as everywhere else.
import * as THREE from 'three';
import { CollisionWorld } from '../../collision-world.js';

const up=new THREE.Vector3(0,1,0);
export function moreBehaviours(BEH,x){
  const {api,G,Z,P4,plants,hit,raw,beam,pulse,within,nearest,chest,tip,use,kill,spread,alive,free,dropAt,netId,feast,lastShot,feet,ingredient}=x;
  const {session,enemies,world,player,audio}=api,P=G.plants;
  Object.assign(BEH,{choir:BEH.pod,royalty:BEH.pod,rider:BEH.burr,tick:BEH.burr,pitcher:BEH.gourd,puppet:BEH.gourd,catapult:BEH.gourd,patriarch:BEH.melon});

  const maw=BEH.maw,flower=BEH.flower;
  const risen=(p,dt,d,burn)=>{
    if(p.corpses?.length&&(p.raise=(p.raise??0)-dt)<=0){
      p.raise=d.raiseEvery*(burn&&P4(p)?.5:1);Z.raise(p.corpses.shift(),{d:d.raiseFor*(burn&&P4(p)?2:burn&&p.stage>=3?1.5:1),hits:6,power:d.raisePower,burn});pulse(p.at,70,0x58ff6a,.4);
    }
  };
  BEH.flower=(p,dt,d)=>{flower(p,dt,d);risen(p,dt,d,false);};
  // Maws: fed by kills they took part in, and those kills can leave a meal behind (the owner's kill event, so guests too)
  const meal=(p,e)=>{
    const d=p.r.def;if(session.time-(p.bitAt??-9)>1)return;
    p.fed=Math.min(d.feedMax,(p.fed??0)+d.feed);
    if(d.mealMax)feast(d.meal);else if(Math.random()<d.meal)dropAt(ingredient(e),p.at);
  };

  Object.assign(BEH,{
    gourmand:maw,
    thornmaw(p,dt,d){
      const bit=p.bitAt;maw(p,dt,d);if(p.bitAt===bit)return;
      for(const z of nearest(p,within(p,p.r.range)).slice(1,P4(p)?5:p.stage>=3?3:2)){beam(tip(p),chest(z),0xc8e070,.09,.7);hit(p,z,d.spit);}
    },
    vine(p,dt,d){
      if((p.t-=dt)>0)return;
      const list=nearest(p,within(p,p.r.range)).slice(0,p.stage>=3?8:d.ties);if(list.length<2){p.t=.4;return;}
      p.t=d.every;
      for(const z of list)Z.order('tie',z,{g:`${netId()}:${p.uid}`,share:d.share,bleed:d.bleed??0,d:d.every+1});
      list.forEach((z,i)=>{if(i)beam(chest(list[i-1]),chest(z),d.bleed?0xc23a3a:0x7fc24a,d.every*.4,.7);});
    },
    spore(p,dt,d){
      if((p.t-=dt)>0)return;
      const list=nearest(p,within(p,p.r.range,false)).filter(z=>z.kind==='zombie').slice(0,p.stage>=3?d.puff+3:d.puff);if(!list.length){p.t=.3;return;}
      p.t=d.every;for(const z of list)Z.order('thrall',z,{temp:true,d:d.turn*(P4(p)?2:1),power:d.power,hits:4});
      pulse(p.at,p.r.range,0xb48cff,.7);audio.play('buy',.12);if(!P4(p))use(p);
    },
    daydream(p,dt,d){
      if((p.t-=dt)>0)return;p.t=d.every;
      for(const z of within(p,p.r.range,false))if(z.kind==='zombie'&&session.time>(z.dozeNext??0)){const k=P4(p)?2:1;z.dozeNext=session.time+d.sleep*1.5*k;Z.order('sleep',z,{d:d.sleep*k});}
    },
    solar(p,dt,d){
      p.ang=((p.ang??0)+d.sweep*dt)%(Math.PI*2);
      const rays=P4(p)?[0,1,2,3].map(i=>p.ang+i*Math.PI/2):p.stage>=3?[p.ang,p.ang+Math.PI]:[p.ang],from=tip(p);
      for(const a of rays)beam(from,from.clone().add(new THREE.Vector3(Math.cos(a)*p.r.range,0,Math.sin(a)*p.r.range)),0xffe28a,.05,1.6);
      if((p.tick=(p.tick??.25)-dt)>0)return;p.tick=.25;
      for(const z of within(p,p.r.range)){
        const q=Math.atan2(z.root.position.z-p.at.z,z.root.position.x-p.at.x);
        if(rays.some(a=>Math.abs(Math.atan2(Math.sin(q-a),Math.cos(q-a)))<d.width)&&world.lineClear(from,chest(z)))hit(p,z,d.dps*.25);
      }
    },
    revenant(p,dt,d){
      if((p.t-=dt)>0)return;
      const z=within(p,p.r.range)[0];if(!z){p.t=.4;return;}
      p.t=P4(p)?5:p.stage>=3?9:d.every;
      Z.raise(p.at.clone().add(new THREE.Vector3(Math.random()*50-25,0,Math.random()*50-25)),{d:d.raiseFor,hits:6,power:d.raisePower*(P4(p)?2:1),replay:lastShot()*d.echo});
      pulse(p.at,70,0x58ff6a,.4);
    },
    grave(p,dt,d){
      if((p.gas=(p.gas??.5)-dt)<=0){p.gas=.5;for(const z of nearest(p,within(p,p.r.range)).slice(0,d.targets))hit(p,z,d.dps*.5);}
      risen(p,dt,d,true);
    },
    worldroot(p,dt,d){
      if((p.t-=dt)>0)return;p.t=d.every;
      for(const z of within(p,p.r.range))if(['barricade','entering'].includes(z.state)){hit(p,z,d.grab*(P4(p)?3:p.stage>=3?2:1));if(alive(z))Z.order('stagger',z,{d:d.stun});}
    },
    kudzu(p,dt,d){
      if((p.t-=dt)>0)return;
      p.kids=(p.kids??[]).filter(q=>plants.includes(q));if(p.kids.length>=d.copies*(P4(p)?2:1)){p.t=1;return;}
      const q=spread(p,d.spreads[Math.floor(Math.random()*d.spreads.length)],{k:d.copyPower,lifespan:d.copyFor});
      if(q){p.kids.push(q);p.t=P4(p)?6:p.stage>=3?12:d.every;}else p.t=1;
    },
    overbloom(p,dt,d){
      if(!p.lit){
        const z=nearest(p,within(p,p.r.range,false)).find(z=>z.kind==='zombie');if(!z)return;
        p.lit=true;p.calm=0;Z.order('thrall',z,{d:d.infectFor*(P4(p)?2.25:p.stage>=3?1.5:1),infect:true,power:d.power,hits:d.hitsThrall});pulse(p.at,160,0x7dff9a,.8);audio.play('round',.25);return;
      }
      p.calm=enemies.list.some(z=>z.thrall?.infect||z.netFlags&2)?0:p.calm+dt;
      if(p.calm>5)kill(p,{silent:true});
    },
    // Walk in and ride up: a floor that exists only while you are up there, your own. Friends see the stalk, not the nest.
    beanstalk(p,dt,d){
      if(p.nestY==null){
        const a=p.at.clone().addScaledVector(up,30),h=world.raycast(new THREE.Ray(a,up),0,d.height);
        const room=h?(h.distance??h.point?.distanceTo(a)??d.height)+30:d.height;
        p.nestY=Math.max(130,Math.min(d.height,room-100));p.fit=p.nestY/d.height;
      }
      const f=feet(),top=p.at.y+p.nestY;
      if(p.nest&&p.lift>=1){   // up there
        if((p.stay-=dt)<=0)leave(p,f,top);
        return;
      }
      if(p.lift!=null){
        p.lift=Math.min(1,p.lift+dt/2.2);const k=p.lift*p.lift*(3-2*p.lift);
        player.setPosition(new THREE.Vector3(p.at.x,p.at.y+k*p.nestY+2,p.at.z));player.velocity.set(0,0,0);
        return;
      }
      if((p.t-=dt)>0)return;
      if(Math.hypot(f.x-p.at.x,f.z-p.at.z)<p.r.range&&Math.abs(f.y-p.at.y)<50){p.lift=0;p.stay=d.stay*(P4(p)?2:1);p.nest=nestBox(p.at,top);audio.play('teleport',.5);}
      else p.t=.1;
    }
  });
  BEH.bloodweb=BEH.vine;

  function nestBox(at,y){
    const min=new THREE.Vector3(at.x-90,y-14,at.z-90),max=new THREE.Vector3(at.x+90,y,at.z+90),geo=new THREE.BoxGeometry(180,14,180);
    geo.translate(at.x,y-7,at.z);const n={collider:new CollisionWorld(geo),box:new THREE.Box3(min,max),enabled:true};world.dynamic.push(n);return n;
  }
  function leave(p,f,top){
    const n=p.nest;p.nest=null;p.lift=null;if(!n)return;
    n.enabled=false;const i=world.dynamic.indexOf(n);if(i>=0)world.dynamic.splice(i,1);world.collision?.invalidateCache?.();
    p.t=p.r.def.rest;
    if(f.y>top-120&&Math.hypot(f.x-p.at.x,f.z-p.at.z)<260)player.setPosition(new THREE.Vector3(p.at.x+40,p.at.y+2,p.at.z+40));
  }

  const ON_KILL={
    flower:(p,at)=>{(p.corpses??=[]).length<6&&p.corpses.push(at.clone());},
    grave:(p,at)=>{(p.corpses??=[]).length<6&&p.corpses.push(at.clone());},
    maw:meal,thornmaw:meal,gourmand:meal,
  };
  const END_ROUND={
    patriarch:p=>dropAt('golden',p.at),
    beanstalk:p=>{session.addPoints?.(P.beanstalk.pods*(P4(p)?3:p.stage>=3?2:1));pulse(p.at,70,0xffd978,.5);},
    worldroot:p=>{p.saves=0;},
    mint:p=>{if(P4(p)&&p.bank>=1){const n=Math.floor(p.bank);p.bank=0;session.addPoints?.(n);pulse(p.at,70,0xffd978,.5);}},   // Primordial: pays out by itself
  };
  return {ON_KILL,END_ROUND,leave:p=>leave(p,feet(),p.at.y+(p.nestY??0))};
}
