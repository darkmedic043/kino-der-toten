// Underbarrel flamethrower (BO1 attachment on assault rifles): press 5 to
// switch to it. A tank holds 25 bursts (BO1: 100 fuel, 4 per trigger pull) at
// 600 RPM, reaching ~12 m (475 units). Each burst scorches every zombie in a
// short cone and sets them alight; the stream stops at walls. Visuals use the
// game's own flame textures (fxt_fire_flame_*), plus a pilot light on the
// nozzle whenever the flamer is fitted.
import * as THREE from 'three';

export const RANGE=475,CONE=Math.cos(THREE.MathUtils.degToRad(22)),HIT=45,BURN_DPS=55,BURN_TIME=3;

export function flamerDef(def){
  return {...structuredClone(def),name:'Flamethrower',flamethrower:true,clipSize:25,maxAmmo:75,startAmmo:75,
    fireTime:.1,automatic:true,fireType:'Full Auto',damage:1,minDamage:1,range:40,pellets:1,headMultiplier:1,
    reloadTime:2.4,reloadEmptyTime:2.4,projectileSpeed:0,explosionRadius:0,attachment:undefined,upgrade:undefined};
}

export function setupFlamer(api){
  const {host,session,camera,scene,world,enemies,audio,view}=api;
  const load=url=>{const t=new THREE.TextureLoader().load(new URL(url,document.baseURI).href);t.colorSpace=THREE.SRGBColorSpace;return t;};
  // The BO1 flame textures are flipbooks: base = a 4×4 flame burning out,
  // lick = 16 flame-tongue variations, smoke = 8×8 fireball rolling into smoke.
  const sheets={
    base:{tex:load('textures/fxt_fire_flame_base_01.png'),cols:4,rows:4,frames:16,anim:true,add:true},
    lick:{tex:load('textures/fxt_fire_flame_lick.png'),cols:4,rows:4,frames:16,anim:false,add:true},
    smoke:{tex:load('textures/fxt_smk_flamethrower.png'),cols:8,rows:8,frames:64,anim:true,add:false},
  };

  // ---- particles ------------------------------------------------------------------
  const pool=[];
  function spawn(kind,pos,vel,life,size0,size1){
    let p=pool.find(p=>!p.alive&&p.kind===kind);
    if(!p){
      const sh=sheets[kind],t=sh.tex.clone();t.repeat.set(1/sh.cols,1/sh.rows);
      const mat=new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false,blending:sh.add?THREE.AdditiveBlending:THREE.NormalBlending});
      p={kind,sh,tex:t,sprite:new THREE.Sprite(mat),vel:new THREE.Vector3()};p.sprite.renderOrder=4;scene.add(p.sprite);pool.push(p);
    }
    p.alive=true;p.t=0;p.life=life;p.size0=size0;p.size1=size1;p.sprite.visible=true;p.stop=0;p.origin=null;
    p.sprite.position.copy(pos);p.vel.copy(vel);p.sprite.material.rotation=Math.random()*6.28;p.spin=(Math.random()-.5)*2;
    p.frame0=p.sh.anim?0:Math.floor(Math.random()*p.sh.frames);setFrame(p,p.frame0);
    return p;
  }
  function setFrame(p,f){const {cols,rows}=p.sh;f=Math.min(p.sh.frames-1,f);p.tex.offset.set((f%cols)/cols,1-(Math.floor(f/cols)+1)/rows);}
  function tickParticles(dt){
    for(const p of pool){if(!p.alive)continue;
      p.t+=dt;const u=p.t/p.life;
      if(u>=1||(p.stop&&p.sprite.position.distanceToSquared(p.origin)>p.stop*p.stop)){p.alive=false;p.sprite.visible=false;continue;}
      p.vel.multiplyScalar(Math.exp(-dt*(p.kind==='smoke'?1.2:1.6)));p.vel.y+=(p.kind==='smoke'?50:110)*dt;   // flames and smoke rise
      p.sprite.position.addScaledVector(p.vel,dt);p.sprite.material.rotation+=p.spin*dt;
      p.sprite.scale.setScalar(p.size0+(p.size1-p.size0)*Math.sqrt(u));
      if(p.sh.anim)setFrame(p,Math.floor(u*p.sh.frames));
      const m=p.sprite.material;
      m.opacity=p.kind==='smoke'?Math.min(1,(1-u)*2)*.85:Math.min(1,(1-u)*1.8)*(u<.08?u/.08:1);
    }
  }

  // Where the nozzle is on screen: the viewmodel has its own camera (FOV 51 at
  // the origin), so project the nozzle bone with it, then cast that screen
  // point into the world a short way in front of the player.
  const viewCam=new THREE.PerspectiveCamera(51,1,.01,200),nz=new THREE.Vector3();
  function nozzle(out){
    const g=view.gun,b=g&&(['tag_ft_flash','tag_flame_unit','tag_flash'].map(n=>g.getObjectByName(n)).find(b=>b&&b.scale.x>1e-3));
    viewCam.aspect=camera.aspect;viewCam.updateProjectionMatrix();
    if(b){b.getWorldPosition(nz);nz.project(viewCam);}else nz.set(.25,-.35,.5);
    nz.x=THREE.MathUtils.clamp(nz.x,-.9,.9);nz.y=THREE.MathUtils.clamp(nz.y,-.9,.9);nz.z=.5;
    nz.unproject(camera);return out.copy(camera.position).add(nz.sub(camera.position).normalize().multiplyScalar(26));
  }

  // ---- sound: a synthesized roar (the game data has no flamethrower loop) ---------
  let roar=null;
  function sound(on,dt){
    const ctx=audio?.ctx;if(!ctx||!audio.master)return;
    if(!roar){
      const buf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),d=buf.getChannelData(0);let b=0;
      for(let i=0;i<d.length;i++){b=b*.97+(Math.random()*2-1)*.3;d[i]=b+(Math.random()*2-1)*.15;}
      const src=ctx.createBufferSource();src.buffer=buf;src.loop=true;
      const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1400;
      const bp=ctx.createBiquadFilter();bp.type='peaking';bp.frequency.value=220;bp.gain.value=9;
      const g=ctx.createGain();g.gain.value=0;src.connect(lp).connect(bp).connect(g).connect(audio.master);src.start();
      roar={g,lp};
    }
    const t=ctx.currentTime;roar.g.gain.setTargetAtTime(on?.55:0,t,on?.03:.12);roar.lp.frequency.setTargetAtTime(on?1500+Math.random()*400:600,t,.05);
  }

  // ---- burning zombies --------------------------------------------------------------
  const burning=new Map();
  function ignite(z){const b=burning.get(z);if(b)b.left=BURN_TIME;else burning.set(z,{left:BURN_TIME,acc:0,fx:0});}
  function tickBurning(dt){
    for(const [z,b] of burning){
      if(!enemies.list.includes(z)||z.health<=0){burning.delete(z);continue;}
      b.left-=dt;b.acc+=dt;b.fx-=dt;
      if(b.fx<=0){b.fx=.07;const at=z.root.position.clone().add(new THREE.Vector3((Math.random()-.5)*18,15+Math.random()*50,(Math.random()-.5)*18));
        spawn('base',at,new THREE.Vector3((Math.random()-.5)*20,40+Math.random()*40,(Math.random()-.5)*20),.5,6,16);}
      if(b.acc>=.5){b.acc-=.5;if(!host.remoteDamage)enemies.hurt(z,BURN_DPS*.5,false,false,'flame');}
      if(b.left<=0)burning.delete(z);
    }
  }

  // ---- firing ---------------------------------------------------------------------------
  let lastShots=session.shots,firing=0;
  const fwd=new THREE.Vector3(),right=new THREE.Vector3(),up=new THREE.Vector3();
  let reach=RANGE;
  function aimInfo(){
    camera.getWorldDirection(fwd);right.set(1,0,0).applyQuaternion(camera.quaternion);up.set(0,1,0).applyQuaternion(camera.quaternion);
    const wall=world.raycast(new THREE.Ray(camera.position.clone(),fwd.clone()),1,RANGE);
    reach=wall?Math.max(30,wall.distance-10):RANGE;
  }
  const origin=new THREE.Vector3(),target=new THREE.Vector3();
  let emitAcc=0,endAcc=0;
  function emit(dt){
    aimInfo();nozzle(origin);
    target.copy(camera.position).addScaledVector(fwd,reach);
    const axis=target.clone().sub(origin).normalize();
    emitAcc+=dt*95;
    while(emitAcc>=1){emitAcc-=1;
      const dir=axis.clone().addScaledVector(right,(Math.random()-.5)*.1).addScaledVector(up,(Math.random()-.5)*.08).normalize();
      const lick=Math.random()<.45;
      const p=spawn(lick?'lick':'base',origin.clone().addScaledVector(dir,Math.random()*8),dir.multiplyScalar(900+Math.random()*250),lick?.45:.6+Math.random()*.15,2.5,lick?26:40+Math.random()*18);
      p.origin=origin.clone();p.stop=reach+25;
    }
    endAcc+=dt*6;
    while(endAcc>=1){endAcc-=1;
      const at=origin.clone().lerp(target,.75+Math.random()*.25).add(new THREE.Vector3((Math.random()-.5)*20,(Math.random()-.5)*14,(Math.random()-.5)*20));
      spawn('smoke',at,fwd.clone().multiplyScalar(90).add(new THREE.Vector3(0,30,0)),1.1+Math.random()*.4,12,44);
    }
  }
  const stats={scorches:0,hits:0};window.kino.flamer=stats;
  function scorch(){
    aimInfo();stats.scorches++;stats.reach=reach;
    for(const z of [...enemies.list]){
      const c=z.root.position.clone().add(new THREE.Vector3(0,40,0)),d=c.clone().sub(camera.position),dist=d.length();
      if(dist>reach+20||d.normalize().dot(fwd)<CONE||!world.lineClear(camera.position,c))continue;
      stats.hits++;if(!host.remoteDamage)enemies.hurt(z,HIT,false,false,'flame');
      if(enemies.list.includes(z))ignite(z);
    }
  }

  // ---- pilot light on the nozzle whenever the flamer is fitted ---------------------------
  const pilotTex=sheets.lick.tex.clone();pilotTex.repeat.set(.25,.25);pilotTex.offset.set(.5,.75);
  const pilotMat=new THREE.SpriteMaterial({map:pilotTex,color:0x7fb4ff,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false});
  const pilot=new THREE.Sprite(pilotMat);pilot.renderOrder=5;
  function placePilot(){
    const bone=view.gun?.getObjectByName('tag_flamer_pilot_light');
    if(bone&&bone.scale.x>1e-3){bone.add(pilot);pilot.visible=true;}else{pilot.removeFromParent();pilot.visible=false;}
  }

  host.on('update',dt=>{
    const def=session.def;
    if(session.shots!==lastShots){const fired=session.shots>lastShots;lastShots=session.shots;if(fired&&def?.flamethrower){scorch();firing=.16;}}
    firing-=dt;sound(firing>0,dt);if(firing>0)emit(dt);else emitAcc=endAcc=0;
    tickParticles(dt);tickBurning(dt);
    if(pilot.visible){const s=(.9+Math.random()*.25)/Math.max(1e-3,pilot.parent?.getWorldScale(new THREE.Vector3()).x??1);pilot.scale.setScalar(s*.9);pilotMat.opacity=.75+Math.random()*.25;}
  });
  return {placePilot};
}
