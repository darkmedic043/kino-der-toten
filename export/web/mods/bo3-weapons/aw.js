// Advanced Warfare guns (the BO3 workshop pack, docs/fork/advanced-warfare.md): their two moving extras.
//
// - A second form on the same model (def.attachment.altForm, the OHM's shotgun): the engine's attachment toggle
//   (key 5) swaps the definition; here the change plays the gun folding open (attachInAnim on the new form's rig)
//   or shut (attachOutAnim on the LMG's) in place of the raise.
// - The XMG's lockdown (def.lockdown): aiming folds both arm guns into their braced pose. The pack has only the
//   fold-in and fold-out clips (no lockdown idle or fire), so they ride on top of whatever plays as additive
//   layers held at the blend's point, the fire clips still kicking underneath. Braced, you are rooted in place: no
//   walking, sprinting or jumping until you let go of aim.
// - Gunsmith kits (weapon-levels attachments.json: aws_* shared, aw_* per gun; lists in AW_CUSTOM, .tools/build_bo3_weapons.py).
//   Most are plain stats; the ones with behaviour live here ("hits" = the gun's bullets, or the MDL's blasts for 4 s
//   after it fires):
//   aw_bulwark    XMG: 60% less damage taken while locked down (an amber edge on the screen)
//   aw_overclock  XMG: 40% faster fire while locked down
//   aw_seismic    XMG: locked down, hits stagger like Concussive Slugs
//   aw_hotswap    OHM: a form swap fills the new form's magazine from its reserve
//   aw_arcrail    RW1: hits arc to the 2 nearest zombies for half damage
//   aw_ignition   hits burn for 40% of the hit a second, 3 s (aw_incendiary: the MDL's blasts, 30%)
//   aw_concussive hits slow zombies to half speed, 2.5 s
//   aw_lastword   Atlas 45, M1 Irons (and akimbo): the last round in a magazine hits for triple
//   aws_tracker   hits tag the zombie (a red marker) for 4 s: tagged zombies take 20% more from your hits
//   aws_scavenger a kill puts 2 free rounds back in the magazine
import * as THREE from 'three';

const ARC=0x8fb4ff,EMBER=0xff7a2a,GOLD=0xffd36a,DAZE=0xcfe4ff,MARK=0xff2a2a;

export function setupAw(api){
  const {host,session,view,player,enemies,scene,world,data}=api;
  const atts=()=>String(data.weapons[session.weapon?.id]?.attachments??'').split('+');   // the base def's (the OHM's shotgun form has none of its own)
  const has=id=>atts().includes(id);
  const now=()=>session.time??performance.now()/1000;
  const alive=z=>z&&!(z.dead||z.state==='dead'||z.health<=0)&&enemies.list.includes(z);

  const toggle=session.toggleAttachment.bind(session);
  session.toggleAttachment=(...args)=>{
    const was=session.attachmentMode,form=was?session.def.altForm:session.def.attachment?.altForm,ok=toggle(...args);
    if(ok&&form)view.raiseWith=was?'attachOutAnim':'attachInAnim';
    if(ok&&has('aw_hotswap')){const w=session.weapon,n=Math.max(0,Math.min(session.def.clipSize-w.mag,w.reserve));w.mag+=n;w.reserve-=n;}
    return ok;
  };

  let lock=0,falling=false,rig=null,acts=null,frozen=false;
  const layer=(clip,ref)=>{
    const add=THREE.AnimationUtils.makeClipAdditive(clip.clone(),0,ref,30),a=rig.mixer.clipAction(add);
    a.blendMode=THREE.AdditiveAnimationBlendMode;a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.play();a.paused=true;a.setEffectiveWeight(0);return a;
  };
  host.on('update',dt=>{
    const def=view.def;
    if(!def?.lockdown||!view.ready||!view.rig){lock=0;frozen=false;return;}
    if(view.rig!==rig){
      rig=view.rig;lock=0;falling=false;const a=rig.actions.lockdownInAnim,b=rig.actions.lockdownOutAnim;
      acts=a&&b?{in:layer(a.getClip(),a.getClip()),out:layer(b.getClip(),a.getClip())}:null;   // both measured from the fold-in's first frame (the idle grip)
    }
    if(!acts)return;
    const want=!!view.input?.ads&&['idle','fire'].includes(view.mode)&&!(session.reloadLeft>0),din=acts.in.getClip().duration,dout=acts.out.getClip().duration;
    frozen=want&&lock>0;
    if(want&&falling)falling=false;else if(!want&&!falling&&lock>0)falling=true;
    lock=THREE.MathUtils.clamp(lock+(want?dt/din:-dt/dout),0,1);
    acts.in.setEffectiveWeight(falling||lock===0?0:1);acts.out.setEffectiveWeight(falling&&lock>0?1:0);
    acts.in.time=lock*din;acts.out.time=(1-lock)*dout;
  });
  host.on('reset',()=>{lock=0;falling=false;frozen=false;for(const z of [...burning.keys()])burning.delete(z);for(const z of [...dazed])undaze(z);for(const z of [...marked.keys()])unmark(z);for(const f of fx.splice(0))dispose(f);});

  // Locked down you stay put: no speed (layered over the other speed getters, like the Siren's Soma-81), and the
  // controller input loses its move, sprint and jump. That wrap goes on at the first frame, outside every mod's
  // (the movement mod's mantle and slide read the input before passing it on).
  for(const key of ['moveSpeed','sprintSpeed']){
    if(!player)break;
    const d=Object.getOwnPropertyDescriptor(player,key);let base=player[key];
    Object.defineProperty(player,key,{configurable:true,get:()=>frozen?0:(d?.get?d.get():base),set:v=>{if(d?.set)d.set(v);else base=v;}});
  }
  let rooted=false;
  host.on('update',()=>{
    if(rooted||!player)return;rooted=true;
    const update=player.update.bind(player);
    player.update=(dt,input)=>update(dt,frozen&&input?{...input,forward:0,strafe:0,sprint:false,jump:false,jumpPressed:false}:input);
  });

  // ---- Bulwark Plating and Overclock Servos (the XMG, locked down) ----
  const braced=id=>lock>0&&!falling&&view.def?.lockdown&&has(id);
  host.on('beforeDamage',e=>{if(braced('aw_bulwark'))e.amount*=1-.6*lock;});
  const fire=session.fire.bind(session);
  session.fire=(...args)=>{const ok=fire(...args);if(ok&&lock>=1&&braced('aw_overclock'))session.fireLeft/=1.4;return ok;};
  const edge=document.createElement('div');
  edge.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2;opacity:0;box-shadow:inset 0 0 90px 18px #ffb43a88;border:2px solid #ffb43a55';
  document.body.append(edge);

  // ---- hits ----
  let blastUntil=0;   // the MDL's grenades count as its hits for a while after it fires
  (host.fireHooks??=[]).push(def=>{if((def.baseId??def.id)==='aw_mdl')blastUntil=now()+4;return false;});   // grenades skip the 'shot' event
  const hurt=enemies.hurt.bind(enemies);
  enemies.hurt=(z,damage,head,...rest)=>{
    if(host.remoteDamage||!alive(z))return hurt(z,damage,head,...rest);
    const t=now(),cause=rest[1];
    if(z.awMark?.until>t)damage*=1.2;   // Tracker
    const gunHit=cause==='bullet'||(cause==='explosion'&&t<blastUntil&&session.weapon?.id==='aw_mdl');
    if(!gunHit)return hurt(z,damage,head,...rest);
    const a=atts(),at=z.root.position.clone().add(new THREE.Vector3(0,45,0));
    if(a.includes('aw_lastword')&&session.weapon.mag===0){damage*=3;burst(at,GOLD,10,60);}
    if(a.includes('aw_ignition'))ignite(z,damage*.4);
    if(a.includes('aw_incendiary'))ignite(z,damage*.3);
    if(a.includes('aw_concussive')||(a.includes('aw_seismic')&&braced('aw_seismic')))daze(z,at);
    if(a.includes('aws_tracker'))mark(z,t);
    const r=hurt(z,damage,head,...rest);
    if(a.includes('aw_arcrail'))arc(z,at,damage*.5);
    if(a.includes('aws_scavenger')&&!alive(z)){const w=session.weapon,clip=session.def.clipSize;if(w&&w.mag<clip){w.mag=Math.min(clip,w.mag+2);burst(at,GOLD,3,30,2.5);}}
    return r;
  };
  const marked=new Map();   // zombie -> its marker sprite
  function mark(z,t){
    z.awMark={until:t+4};
    if(!marked.has(z)){const s=new THREE.Sprite(sprite.clone());s.material.color.setHex(MARK);s.scale.setScalar(7);scene.add(s);marked.set(z,s);}
  }
  function unmark(z){const s=marked.get(z);if(s){s.removeFromParent();s.material.dispose();}marked.delete(z);if(z.awMark)z.awMark=null;}
  function arc(z,from,dmg){
    const near=enemies.list.filter(o=>o!==z&&alive(o)).map(o=>({o,d:o.root.position.distanceTo(z.root.position)})).filter(({d})=>d<260).sort((x,y)=>x.d-y.d);
    let n=0;
    for(const {o} of near){
      const to=o.root.position.clone().add(new THREE.Vector3(0,42,0));
      if(!world.lineClear(from,to))continue;
      bolt(from,to,ARC);hurt(o,dmg,false,false,'explosion');if(++n>=2)break;
    }
    if(!n)for(let i=0;i<2;i++)bolt(from,from.clone().add(new THREE.Vector3(Math.random()-.5,Math.random()-.3,Math.random()-.5).normalize().multiplyScalar(50)),ARC);
  }
  const burning=new Map();
  function ignite(z,dps){const b=burning.get(z);if(b){b.left=3;b.dps=Math.max(b.dps,dps);}else burning.set(z,{left:3,dps,acc:0,fx:0});}
  const dazed=new Set();
  function daze(z,at){
    const c=z.awDaze??={k:1,scale:z.rig?.mixer?.timeScale};
    if(c.k===1){if(z.speed)z.speed*=.5;if(z.rig?.mixer&&c.scale!==undefined)z.rig.mixer.timeScale=c.scale*.5;c.k=.5;burst(at,DAZE,6,40);}
    c.until=now()+2.5;dazed.add(z);
  }
  function undaze(z){const c=z.awDaze;if(c?.k===.5){if(z.speed)z.speed/=.5;if(z.rig?.mixer&&c.scale!==undefined)z.rig.mixer.timeScale=c.scale;}z.awDaze=null;dazed.delete(z);}

  // ---- fx: arcs (additive lines) and embers (additive sprites) ----
  const glow=document.createElement('canvas');glow.width=glow.height=32;
  {const g=glow.getContext('2d'),r=g.createRadialGradient(16,16,0,16,16,16);r.addColorStop(0,'#fff');r.addColorStop(.3,'#ffffffc0');r.addColorStop(1,'#fff0');g.fillStyle=r;g.fillRect(0,0,32,32);}
  const fx=[],sprite=new THREE.SpriteMaterial({map:new THREE.CanvasTexture(glow),color:0xffffff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
  function bolt(a,b,color){
    const pts=[a.clone()];for(let i=1;i<7;i++)pts.push(a.clone().lerp(b,i/7).add(new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(18)));pts.push(b.clone());
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
    line.frustumCulled=false;scene.add(line);fx.push({obj:line,t:.25,life:.25});
  }
  function burst(at,color,n,speed,size=3.5){
    for(let i=0;i<n;i++){const s=new THREE.Sprite(sprite.clone());s.material.color.setHex(color);s.scale.setScalar(size*(1+Math.random()*.6));s.position.copy(at);scene.add(s);
      fx.push({obj:s,t:.5,life:.5,vel:new THREE.Vector3(Math.random()-.5,Math.random()*.8+.2,Math.random()-.5).multiplyScalar(speed)});}
  }
  const dispose=f=>{f.obj.removeFromParent();f.obj.material.dispose();if(!f.vel)f.obj.geometry.dispose();};   // sprites share three's geometry
  host.warmObjects?.push(new THREE.Sprite(sprite.clone()),new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,1,0)]),
    new THREE.LineBasicMaterial({color:ARC,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false})));

  host.on('update',dt=>{
    edge.style.opacity=braced('aw_bulwark')&&session.phase!=='gameover'?lock.toFixed(2):'0';
    const t=now();
    for(const [z,b] of burning){
      if(!alive(z)){burning.delete(z);continue;}
      b.left-=dt;b.acc+=dt;b.fx-=dt;
      if(b.fx<=0){b.fx=.06;burst(z.root.position.clone().add(new THREE.Vector3((Math.random()-.5)*16,20+Math.random()*45,(Math.random()-.5)*16)),EMBER,1,35,4);}
      if(b.acc>=.5){b.acc-=.5;hurt(z,b.dps*.5,false,false,'flame');}
      if(b.left<=0)burning.delete(z);
    }
    for(const z of dazed)if(!alive(z)||t>=z.awDaze.until)undaze(z);
    for(const [z,s] of marked){
      if(!alive(z)||!(z.awMark?.until>t)){unmark(z);continue;}
      s.position.copy(enemies.headPosition?.(z)??z.root.position).y+=16;s.material.opacity=.65+.35*Math.sin(t*9);
    }
    for(let i=fx.length-1;i>=0;i--){const f=fx[i];f.t-=dt;
      if(f.t<=0){dispose(f);fx.splice(i,1);continue;}
      f.obj.material.opacity=f.t/f.life;if(f.vel){f.obj.position.addScaledVector(f.vel,dt);f.vel.y+=20*dt;}}
  });
  window.kino.aw={get lock(){return lock;},get frozen(){return frozen;},burning,dazed,marked};
}
