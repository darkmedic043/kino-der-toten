// Orders to zombies, and thralls. Every class loads this (a guest Gardener's host may be an Engineer): the host's zombies
// are the real ones, so whatever moves, holds or turns a zombie runs there. order(cmd,z,args) acts at once on the host or
// solo, and on a guest goes to the host as {t:'ab',op:'z',cmd,id,a} (coop.js takes it).
//
// A thrall is a zombie with z.thrall = {until,by,power,hits,...}: it walks to the nearest ordinary zombie (lureTarget, so
// it never attacks a player), bites it, can't be hurt by anyone but a zombie, and plain zombies in reach stop to fight it
// (each bite costs it a hit). When its time runs out it dies, or wakes up an enemy again if temp. raise() spawns a new one
// that doesn't count towards the round (z.tempo). Clients other than the host see them through the snapshot's flags
// (z.netFlags: 1 swallowed, 2 thrall, 4 asleep). Reusable by the Reaper and the Blood Wolf Bite / Who's Who perks.
import * as THREE from 'three';
import { zombieHealth } from '../../rules.js';
import { plantModel } from './gardener.js';

const v3=a=>new THREE.Vector3(...a),V=new THREE.Vector3();
const MAX_THRALLS=14;

export function setupThralls({api,stagger}){
  const {host,session,enemies,world,data}=api;
  const net=()=>{const n=window.kino.coop;return n?.id?n:null;};
  const guest=()=>{const n=net();return !!n&&!n.isHost;};
  const alive=z=>enemies.list.includes(z)&&z.state!=='dead';
  const zh=()=>zombieHealth(session.round,data.rules);
  const thralls=new Set(),ties=new Map(),tossed=new Set(),sleepers=new Set();
  const dist=(a,b)=>a.root.position.distanceTo(b.root.position);
  const zones=[];   // providers of {at,range,slow} (own plants, teammates' mirrors): the slowest one wins on each zombie
  const hooks={onDeath:null};   // onDeath(z,thrall): an infected thrall fell

  // damage on the host credited to a player: as a teammate's bullet would be, but without a hit's points
  function hurtFor(z,amount,by,cause){
    const n=net(),other=n&&by!=null&&by!==n.id;
    if(other){
      const p=z.root.position.toArray().map(Math.round);
      host.remoteDamage=true;host.remoteBy=by;try{enemies.hurt(z,amount,false,false,cause,false);}finally{host.remoteDamage=false;host.remoteBy=null;}
      if(!enemies.list.includes(z))n.send(by,{t:'res',killed:true,head:false,melee:false,kind:z.kind,tempo:!!z.tempo,p,tags:tags(z)});
    }else{enemies.hurt(z,amount,false,false,cause,false);if(!enemies.list.includes(z))session.addPoints?.(50);}
  }
  // what a kill says about the zombie, for the Gardener's drops (it travels in the 'res' message to a guest)
  function tags(z){
    const a=z.amod,t=session.time,slow=(z.gardenK??1)<1||a?.slowUntil>t;
    return (z.chewing||z.mirrorChew?1:0)|(slow?2:0)|(a?.burnUntil>t?4:0)|(a?.stunUntil>t||a?.fieldUntil>t?8:0)|(z.kind==='nova'?16:0);
  }
  host.killTags=tags;

  // ---- what shows on a thrall or a sleeper, on every client --------------------------------------------------------------
  const pool=[];
  function mark(z,on){
    if(!on){if(z.vineMark){z.vineMark.removeFromParent();pool.push(z.vineMark);z.vineMark=null;}return;}
    if(z.vineMark)return;
    const m=pool.pop()??plantModel('thrall_vines');if(!m)return;
    m.position.set(0,0,0);z.root.add(m);z.vineMark=m;
  }

  // ---- thralls --------------------------------------------------------------------------------------------------------
  function make(z,o){
    if(!alive(z)||z.kind!=='zombie'||z.ai||z.swallowed)return null;
    if(z.thrall){z.thrall.until=Math.max(z.thrall.until,session.time+o.d);return z.thrall;}
    if(thralls.size>=MAX_THRALLS)return null;
    z.thrall={until:session.time+o.d,by:o.by??net()?.id??null,power:o.power??.12,hits:o.hits??6,temp:!!o.temp,burn:!!o.burn,infect:!!o.infect,replay:o.replay??0,foe:null,look:0,swing:0,held:new Set(),speed:z.speed};
    z.speed=Math.max(z.speed,170);z.state='chase';z.repath=0;thralls.add(z);mark(z,true);
    return z.thrall;
  }
  function raise(at,o){
    if(thralls.size>=MAX_THRALLS)return null;
    const z=enemies.spawn(at.clone(),null,'zombie');session.spawned--;z.tempo=true;z.state='chase';z.repath=0;z.rig.play('walk');
    return make(z,o)?z:null;
  }
  function end(z,dead=false){
    const t=z.thrall;if(!t)return;
    thralls.delete(z);for(const o of t.held)if(o.heldBy===z)o.heldBy=null;
    z.thrall=null;mark(z,false);z.speed=t.speed;
    if(!alive(z)){if(t.infect)hooks.onDeath?.(z,t);return;}
    if(t.temp&&!dead){z.state='chase';z.repath=0;return;}
    if(t.infect)hooks.onDeath?.(z,t);
    if(z.tempo)enemies.remove(z);else hurtFor(z,z.health+1,t.by,'thrall');
  }
  const hostile=o=>alive(o)&&!o.thrall&&!o.swallowed&&!o.ai&&!(o.sleepUntil>session.time);
  function think(z,t,dt){
    if(session.time>=t.until||t.hits<=0){end(z,!t.temp);return;}
    if((t.look-=dt)<=0||!t.foe||!hostile(t.foe)){
      t.look=.3;let best=null,bd=900;
      for(const o of enemies.list){if(o===z||!hostile(o))continue;const d=dist(z,o);if(d<bd){bd=d;best=o;}}
      t.foe=best;
      for(const o of enemies.list)if(hostile(o)&&!o.heldBy&&t.held.size<2&&o.kind==='zombie'&&dist(z,o)<56&&!['barricade','entering','rising'].includes(o.state)){o.heldBy=z;o.heldAt=o.root.position.clone();t.held.add(o);}
    }
    if(t.burn&&(t.fire=(t.fire??.5)-dt)<=0){t.fire=.5;for(const o of enemies.list)if(hostile(o)&&dist(z,o)<80)hurtFor(o,.03*zh(),t.by,'thrall');}
    for(const o of t.held){
      if(!alive(o)||o.heldBy!==z){t.held.delete(o);if(o.heldBy===z)o.heldBy=null;continue;}
      o.root.position.x=o.heldAt.x;o.root.position.z=o.heldAt.z;o.stuck=0;
      if(o.state!=='attack'){o.state='attack';o.attackLeft=1.15;o.attackDealt=true;o.rig.play('attack',false);o.root.rotation.y=Math.atan2(z.root.position.x-o.heldAt.x,z.root.position.z-o.heldAt.z);o.heldBit=false;}
      else if(!o.heldBit&&o.attackLeft<.62){o.heldBit=true;t.hits-=1;}
    }
    if(t.swing>0&&(t.swing-=dt)<=0&&t.foe&&alive(t.foe)&&dist(z,t.foe)<80){
      if(t.infect&&t.foe.kind==='zombie')make(t.foe,{d:t.until-session.time,by:t.by,power:t.power,hits:t.hits,infect:true});
      else hurtFor(t.foe,Math.max(t.power*zh(),t.replay),t.by,'thrall');
    }
    if(t.foe&&z.state!=='attack'&&!z.hop&&dist(z,t.foe)<62){
      z.state='attack';z.vel=0;z.attackLeft=1;z.attackDealt=true;z.rig.play('attack',false);t.swing=.45;
      z.root.rotation.y=Math.atan2(t.foe.root.position.x-z.root.position.x,t.foe.root.position.z-z.root.position.z);
    }
  }

  // ---- orders ---------------------------------------------------------------------------------------------------------
  const ORDERS={
    stagger(z,a){stagger?.(z,a.d);},
    root(z,a){z.rootUntil=session.time+a.d;z.rootK=a.k;},
    swallow(z,a,by){if(z.swallowed||z.thrall||z.ai||!alive(z))return;z.swallowed={at:v3(a.at),by,pid:a.pid,until:session.time+a.d};z.root.visible=false;},
    free(z){if(!z.swallowed)return;z.swallowed=null;z.root.visible=true;z.attackLeft=.01;},
    lure(z,a){if(z.kind!=='dog'&&!z.ai)z.lure={at:v3(a.at),until:session.time+a.d};},
    thrall(z,a,by){make(z,{...a,by});},
    tie(z,a,by){
      if(z.ai)return;const g=ties.get(a.g)??{list:new Set(),by,share:a.share,bleed:a.bleed??0,until:0,tick:.5};
      ties.set(a.g,g);g.until=session.time+a.d;g.list.add(z);z.tied=g;
    },
    sleep(z,a){if(z.ai||z.thrall||z.swallowed||z.sleptNext>session.time||!alive(z))return;z.sleepUntil=session.time+a.d;z.sleptNext=session.time+a.d+a.d/2;z.sleepAt=z.root.position.clone();z.rig.mixer.timeScale=0;sleepers.add(z);},
    toss(z,a){if(z.ai||z.tossT||!alive(z))return;const to=a.to?v3(a.to):z.root.position.clone();z.tossFrom=z.root.position.clone();z.tossTo=to;z.tossH=a.h;z.tossD=a.d;z.tossT=.001;tossed.add(z);},
    raise(z,a,by){raise(v3(a.at),{...a,by});},
  };
  function order(cmd,z,a={}){
    const n=net();
    if(n&&!n.isHost){n.send('host',{t:'ab',op:'z',cmd,id:z?.id??0,a});return;}
    ORDERS[cmd]?.(z,a,n?.id??null);
  }
  const take=(cmd,z,a,by)=>{if(Object.hasOwn(ORDERS,cmd)&&(z||cmd==='raise'))ORDERS[cmd](z,a,by);};
  function wake(z){sleepers.delete(z);z.sleepUntil=0;if(z.rig?.mixer)z.rig.mixer.timeScale=1;}

  host.on('beforeEnemyDamage',e=>{
    const z=e.enemy;if(!z)return;
    if((z.thrall||z.netFlags&2)&&e.cause!=='thrall'){e.amount=0;return;}
    if(guest())return;
    if(z.sleepUntil>session.time&&e.amount>0)wake(z);
    if(z.swallowed?.by!=null&&z.swallowed.by!==net()?.id&&e.cause==='bullet')net()?.send(z.swallowed.by,{t:'ab',op:'pop',id:z.swallowed.pid});
    const g=z.tied;
    if(g&&e.cause!=='tether'&&e.amount>0&&g.list.has(z)){
      const amount=e.amount*g.share;
      queueMicrotask(()=>{for(const o of [...g.list])if(o!==z&&alive(o))hurtFor(o,amount,g.by,'tether');});
    }
  });
  // Shade and root slows: one multiplier on each zombie's speed.
  let slowClock=0;
  function shade(){
    const list=zones.flatMap(f=>f());
    for(const z of enemies.list){
      if(z.thrall)continue;
      let k=1;
      if(z.state!=='dead')for(const p of list)if(p.slow>0&&z.root.position.distanceTo(p.at)<=p.range)k=Math.min(k,1-Math.min(.8,p.slow));
      if(z.rootUntil>session.time)k*=1-(z.rootK??0);
      if(k!==(z.gardenK??1)){z.speed*=k/(z.gardenK??1);z.gardenK=k;}
    }
  }
  let flagClock=0;
  host.on('update',dt=>{
    if(!dt)return;
    if(guest()){   // marks follow the snapshot
      if((flagClock-=dt)<=0){flagClock=.2;for(const z of enemies.list)mark(z,!!(z.netFlags&2));}
      return;
    }
    for(const z of [...thralls]){if(!alive(z)){end(z,true);continue;}think(z,z.thrall,dt);}
    for(const z of enemies.list){
      if(z.swallowed){
        if(session.time>z.swallowed.until){ORDERS.free(z);continue;}
        z.root.position.x=z.swallowed.at.x;z.root.position.z=z.swallowed.at.z;z.stuck=0;
        z.state='attack';z.attackLeft=1.15;z.attackDealt=true;
      }
    }
    for(const z of [...sleepers]){
      if(!alive(z)||session.time>=z.sleepUntil){wake(z);continue;}
      z.root.position.x=z.sleepAt.x;z.root.position.z=z.sleepAt.z;z.stuck=0;z.state='attack';z.attackLeft=1.15;z.attackDealt=true;
    }
    for(const z of [...tossed]){
      if(!alive(z)){tossed.delete(z);z.tossT=0;continue;}
      z.tossT+=dt/z.tossD;const t=Math.min(1,z.tossT);
      z.root.position.lerpVectors(z.tossFrom,z.tossTo,t);z.root.position.y+=4*t*(1-t)*z.tossH;z.stuck=0;z.state='attack';z.attackLeft=.5;z.attackDealt=true;
      if(t>=1){tossed.delete(z);z.tossT=0;z.state='chase';z.repath=0;z.rig.play('walk');}
    }
    for(const [id,g] of ties){
      for(const z of g.list)if(!alive(z)){g.list.delete(z);z.tied=null;}
      if(g.bleed&&(g.tick-=dt)<=0){g.tick=.5;for(const z of [...g.list])hurtFor(z,g.bleed*.5*zh(),g.by,'tether');}
      if(session.time>g.until||!g.list.size){for(const z of g.list)z.tied=null;ties.delete(id);}
    }
    if((slowClock-=dt)<=0){slowClock=.25;shade();}
  });
  const lure0=enemies.lureTarget?.bind(enemies);
  enemies.lureTarget=z=>{
    if(z.thrall)return z.thrall.foe?.root.position??z.root.position;
    if(z.lure&&z.lure.until>session.time)return z.lure.at;
    return lure0?lure0(z):null;
  };
  function ownerLeft(id){
    for(const z of enemies.list)if(z.swallowed?.by===id)ORDERS.free(z);
    for(const z of [...thralls])if(z.thrall.by===id)end(z,true);
    for(const [k,g] of ties)if(g.by===id){for(const z of g.list)z.tied=null;ties.delete(k);}
  }
  host.on('roundEnd',()=>{for(const z of [...thralls])end(z,true);});
  host.on('reset',()=>{
    for(const z of thralls){mark(z,false);z.thrall=null;}thralls.clear();ties.clear();tossed.clear();
    for(const z of sleepers)wake(z);
  });
  const Z={order,take,raise:(at,o)=>order('raise',null,{...o,at:at.toArray().map(Math.round)}),zones,hooks,thralls,ownerLeft,tags,hurtFor,wake};
  window.kino.thralls=Z;
  return Z;
}
