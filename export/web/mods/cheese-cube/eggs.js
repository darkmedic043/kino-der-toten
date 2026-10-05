// Cheese Cube's smaller Easter eggs, ported from the map's script (nazi_zombie_ccube_u.gsc in the map's iwd):
//   Cap's shield: four plates; shoot the one the shield lies on and it flies to the next. After the fourth it
//     plays one of three Avengers themes (they cycle).
//   Stan Lee: shoot him and he shoots back (you go down), then he and Clementine complain.
//   The poster target, the cheese alarm 97 s in, and the PhD and Double Dip jingles once the power is on.
// The sounds are the map's own, kept in the map folder's `sounds/` (git-ignored, like the rest of the map's assets).
import * as THREE from 'three';

export function setupEggs({world,session,host,toast,named,center,boxOf,tween,tweens,nodes,now,sound,player}){
  const near=(e,r)=>{const c=center(e),p=player.getFeetPosition();return Math.hypot(p.x-c.x,p.z-c.z)<r&&Math.abs(p.y-c.y)<260;};
  const fat=(box,by)=>box.clone().expandByVector(new THREE.Vector3(by,by,by));
  const shots=new Set();   // targets we have armed (so a reset can drop them)
  const arm=(def)=>{const t=world.addShootTarget(def);shots.add(t);return t;};
  const disarm=t=>{const list=world.shootTargets??[],i=list.indexOf(t);if(i>=0)list.splice(i,1);shots.delete(t);};

  // ---- Cap's shield ----------------------------------------------------------------------------------
  const spots=[1,2,3,4].map(n=>({struct:named('cap_shield'+n)[0],plate:named(`cap_shield${n}_trig`)[0]}));
  let at=0,theme=0,musicUntil=0,shieldTarget=null,moving=0,track=null;
  const offsetOf=i=>{const a=center(spots[0].struct),b=center(spots[i].struct);return b.clone().sub(a);};
  function armShield(){
    if(shieldTarget||!spots.every(s=>s.plate&&s.struct))return;
    const plate=spots[at].plate;
    shieldTarget=arm({position:center(plate),box:fat(boxOf(plate),7),radius:10,hit(){shieldTarget=null;advance();}});
  }
  function advance(){
    const next=(at+1)%4,off=offsetOf(next);
    for(const axis of ['x','y','z'])tween('ENT_cap_shield',axis,off[axis],2.05,undefined);
    moving=now()+2.1;
    if(next===0){   // the cycle is complete: the music
      musicUntil=Infinity;
      setTimeout(()=>{theme=(theme%3)+1;toast(`Now playing ${theme} of 3 tracks`,4);
        track=sound('theme'+theme,{volume:.6});
        const done=()=>{musicUntil=0;track=null;armShield();};
        if(track){track.addEventListener('ended',done);track.addEventListener('error',done);}else done();
      },2100);
      at=0;return;
    }
    at=next;
    // the next plate can be shot once the shield has landed
    setTimeout(armShield,2100);
  }
  if(spots.every(s=>s.plate&&s.struct))armShield();

  // ---- Stan Lee ------------------------------------------------------------------------------------------
  const stan=named('stan_lee_egg')[0];
  const QUOTES=[null,
    ['Stan Lee: Hey! Knock it off down there!'],['Stan Lee: Get a job!'],['Clementine: Why are they shooting at us???'],
    ['Clementine: Stop! Stop shooting us!',2,"Stan Lee: Don't worry, Clem. I'll protect us"],
    ['Stan Lee: I think these guys are all constipated',3,'Clementine: Ewwww'],
    ['Stan Lee: Have you seen the firepower up here?',3,"You ain't got a chance, ding dongs"]];
  let stanBusy=false,stanTarget=null;
  function armStan(){
    if(!stan||stanTarget)return;
    stanTarget=arm({position:center(stan),box:boxOf(stan),radius:20,hit(){stanTarget=null;stanFires();}});
  }
  function stanFires(){
    if(stanBusy)return;stanBusy=true;
    setTimeout(()=>{if(session.phase==='fighting'){session.effects.invulnerable=0;session.damage(session.health+20);}},500);
    setTimeout(()=>{
      const q=QUOTES[Math.floor(Math.random()*7)];
      if(q){let t=0;for(let i=0;i<q.length;i++){if(typeof q[i]==='number'){t+=q[i];continue;}setTimeout(()=>toast(q[i],4),t*1000);}}
      stanBusy=false;armStan();
    },1700);
  }
  armStan();

  // ---- The poster ----------------------------------------------------------------------------------------
  const poster=named('poster_target')[0];
  const armPoster=()=>poster&&arm({position:center(poster),box:fat(boxOf(poster),4),radius:8,hit(){toast('This is just a poster you idiot',3);armPoster();}});
  armPoster();

  // ---- The cheese alarm and the perk jingles --------------------------------------------------------------
  let alarmed=false,jingleAt=0,jingle=0,current=null;
  const jingles=[{name:'jingle_phd',ent:named('sound_phd')[0],gap:90},{name:'dd_jingle',ent:named('sound_dd')[0]??named('sound_here_dd')[0],gap:80}];
  host.on('update',()=>{
    if(!alarmed&&session.time>=97&&session.phase==='fighting'){alarmed=true;sound('alarm',{volume:.7});}
    if(session.power&&session.phase==='fighting'){
      if(!jingleAt)jingleAt=now()+1;
      if(now()>=jingleAt){const j=jingles[jingle%2];jingle++;jingleAt=now()+j.gap;
        if(j.ent){current={a:sound(j.name,{volume:0}),ent:j.ent};}}
    }
    if(current?.a){   // a jingle is heard from where its machine is
      const d=Math.hypot(player.getFeetPosition().x-center(current.ent).x,player.getFeetPosition().z-center(current.ent).z);
      current.a.volume=Math.max(0,Math.min(.8,1-d/900));
      if(current.a.ended)current=null;
    }
  });

  host.on('reset',()=>{
    for(const t of [...shots])disarm(t);
    shieldTarget=null;stanTarget=null;at=0;musicUntil=0;stanBusy=false;alarmed=false;jingleAt=0;jingle=0;current=null;track?.pause();track=null;
    for(const axis of ['x','y','z'])tween('ENT_cap_shield',axis,0,.001,undefined);
    armShield();armStan();armPoster();
  });
}
