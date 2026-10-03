// The Fortifier's action skill: a deployable Barricade Wall (see classes.json).
//
// Waist high (base 40; eye height is ~60), so the player sees and shoots over it.
// Permanent: it stands until destroyed (the cooldown starts then); using the
// skill again picks it up and puts it down where you're facing, keeping its damage.
// The wall works like a boarded window rather than a navmesh cut (a cut would
// leave zombies stalled when it seals a corridor): zombies path as usual, are
// held at its face, and claw at it with their normal attack (no damage to the
// player); every swing costs it a hit until it breaks.
// It blocks the player (a world.dynamic collider flagged window:true, so it
// doesn't disable navmesh polygons in setDoors and bullets pass through, like
// boards). The trees add spikes, current, slowing wire, barbs, toll points,
// a shrapnel charge, regeneration, knockback, an ammo cache, claymores, and
// passives for fighting from behind it.
import * as THREE from 'three';
import { CollisionWorld } from '../../collision-world.js';
import { zombieHealth } from '../../rules.js';

const up=new THREE.Vector3(0,1,0);
const NEAR=260;          // "near your wall" for the Bunker passives
const SLOW_RANGE=150;

// A corrugated steel sheet with hazard stripes and rivets, drawn once (sized for a waist-high wall).
function plateTexture(){
  const c=document.createElement('canvas');c.width=256;c.height=80;const g=c.getContext('2d');
  const grad=g.createLinearGradient(0,0,32,0);for(let i=0;i<=1;i+=.25)grad.addColorStop(i,i%.5?'#59636b':'#7b868d');
  g.fillStyle=grad;for(let x=0;x<256;x+=32){g.save();g.translate(x,0);g.fillRect(0,0,32,80);g.restore();}
  g.fillStyle='#00000030';for(let i=0;i<30;i++)g.fillRect(Math.random()*256,Math.random()*80,2+Math.random()*30,1+Math.random()*2);
  for(const y of [0,68]){for(let x=-12;x<256;x+=24){g.fillStyle='#e0b02c';g.beginPath();g.moveTo(x,y);g.lineTo(x+12,y);g.lineTo(x+24,y+12);g.lineTo(x+12,y+12);g.fill();g.fillStyle='#1a1a1a';g.beginPath();g.moveTo(x+12,y);g.lineTo(x+24,y);g.lineTo(x+36,y+12);g.lineTo(x+24,y+12);g.fill();}}
  g.fillStyle='#2b2f33';for(const y of [20,58])for(let x=12;x<256;x+=40){g.beginPath();g.arc(x,y,3,0,7);g.fill();}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;return t;
}

export function setupFortifier(ctx){
  const {api,cls,S,A,blast,hud,getCooldown,setCooldown}=ctx;
  const {host,session,data,scene,camera,player,enemies,world,audio}=api;
  const tex=plateTexture();
  const plateMat=new THREE.MeshStandardMaterial({map:tex,metalness:.55,roughness:.55});
  const frameMat=new THREE.MeshStandardMaterial({color:0x3a3f44,metalness:.6,roughness:.5});
  const spikeMat=new THREE.MeshStandardMaterial({color:0x9aa1a6,metalness:.8,roughness:.3});
  const walls=[];const mines=[];const arcs=[];

  function build(width,height){
    const g=new THREE.Group(),plate=new THREE.Mesh(new THREE.BoxGeometry(width,height,6),plateMat.clone());plate.position.y=height/2;g.add(plate);g.userData.plate=plate.material;
    tex.repeat.set(width/130,1);
    // A-frame braces on the player's side (local -z), feet on the ground
    for(const x of [-width*.36,width*.36]){
      // a strut from high on the plate down to a foot behind it
      const top=new THREE.Vector3(x,height*.8,-4),foot=new THREE.Vector3(x,0,-height*.42),dir=foot.clone().sub(top),len=dir.length();
      const brace=new THREE.Mesh(new THREE.BoxGeometry(4,len,4),frameMat);brace.position.copy(top).addScaledVector(dir,.5);
      brace.quaternion.setFromUnitVectors(up,dir.normalize().negate());g.add(brace);
      const post=new THREE.Mesh(new THREE.BoxGeometry(6,height,6),frameMat);post.position.set(x,height/2,-4);g.add(post);
      const pad=new THREE.Mesh(new THREE.BoxGeometry(10,2,10),frameMat);pad.position.copy(foot).setY(1);g.add(pad);
    }
    const rail=new THREE.Mesh(new THREE.BoxGeometry(width+8,6,9),frameMat);rail.position.y=height+1;g.add(rail);
    // spikes on the zombies' side (+z) when the tree has them
    if((S()['fort.spikes']??0)>0){
      const cone=new THREE.ConeGeometry(2.6,16,6);cone.rotateX(Math.PI/2);cone.translate(0,0,8);
      const n=Math.round(width/22),rows=[height*.3,height*.62];
      const inst=new THREE.InstancedMesh(cone,spikeMat,n*rows.length),m=new THREE.Matrix4();let k=0;
      for(const y of rows)for(let i=0;i<n;i++){m.makeTranslation(-width/2+(i+.5)*width/n+(rows.indexOf(y)?width/n/2:0),y,3);inst.setMatrixAt(k++,m);}
      g.add(inst);
    }
    g.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;}});
    return g;
  }

  function place(at,yaw,width,height){
    const mesh=build(width,height);mesh.position.copy(at);mesh.rotation.y=yaw;mesh.scale.y=.01;scene.add(mesh);
    // the player's collider: the plate as a box, rotated into place
    const geo=new THREE.BoxGeometry(width,height,10);geo.translate(0,height/2,0);geo.rotateY(yaw);geo.translate(at.x,at.y,at.z);geo.computeBoundingBox();
    const dyn={collider:new CollisionWorld(geo),box:geo.boundingBox.clone(),enabled:true,window:true,fortWall:true};
    world.dynamic?.push(dyn);
    const w={mesh,at:at.clone(),yaw,width,height,dyn,hits:A().health,maxHits:A().health,age:0,shake:0,lastStand:false,touched:0,regenT:0,ammoT:0,
      // local frame: x along the wall, z out through the zombie side
      ax:new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)),az:new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw))};
    walls.push(w);return w;
  }

  let moveT=0;
  function deploy(){
    const st=api.getState();
    // already standing: pick it up and put it down here, keeping its damage
    if(walls.length){
      if(!st.active||session.busy||session.phase==='reviving')return;
      if(moveT>0){api.toast?.(`Moving the wall in ${Math.ceil(moveT)}s`,1);return;}
      const kept=walls.map(w=>({k:w.hits/w.maxHits,ls:w.lastStand}));for(const w of [...walls])remove(w,false,true);
      raise(false);kept.forEach((o,i)=>{const w=walls[i];if(w){w.hits=Math.max(1,w.maxHits*o.k);w.lastStand=o.ls;}});   // damage and a spent Last Stand carry over
      moveT=3;api.toast?.('Wall moved',1);return;
    }
    if(!st.active||getCooldown()>0||session.busy||session.phase==='reviving'){if(getCooldown()>0)api.toast?.(`${cls.action.name} ready in ${Math.ceil(getCooldown())}s`,1.2);return;}
    raise(true);
  }
  function raise(fresh){
    const a=A(),fwd=camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize(),feet=player.getFeetPosition();
    const yawFacing=Math.atan2(fwd.x,fwd.z);   // local +z (spikes) faces away from the player
    let at=feet.clone().addScaledVector(fwd,85);
    if(!world.lineClear(feet.clone().addScaledVector(up,30),at.clone().addScaledVector(up,30)))at=feet.clone().addScaledVector(fwd,55);
    const ground=y=>{const hit=world.raycast(new THREE.Ray(y.clone().addScaledVector(up,60),up.clone().negate()),0,200);if(hit)y.y=hit.point?.y??hit.position?.y??y.y;return y;};
    if(a.count>1){   // Fortress: two walls in a V, opening toward the player
      const side=new THREE.Vector3(fwd.z,0,-fwd.x);
      for(const s of [-1,1]){const p=ground(at.clone().addScaledVector(side,s*a.width*.42).addScaledVector(fwd,-a.width*.18));place(p,yawFacing+s*.55,a.width,a.height);}
    }else place(ground(at),yawFacing,a.width,a.height);
    if(fresh&&S()['fort.claymore'])for(const w of walls.slice(-a.count))for(const s of [-1,1])plantMine(w.at.clone().addScaledVector(w.az,60).addScaledVector(w.ax,s*w.width*.3));
    audio.play('buy',.6);window.kino.fx?.knockback?.(at);hud();
  }

  function remove(w,broken,moving=false){
    if(!moving){
      if(S()['fort.shrapnel'])blast(w.at.clone().addScaledVector(up,30),260,.9);
      else if(broken){window.kino.fx?.explosion?.([w.at.x,w.at.y+20,w.at.z],.25);audio.play('explosion',.25);}
    }
    w.mesh.removeFromParent();w.mesh.traverse(o=>{if(o.isMesh&&o.geometry)o.geometry.dispose();});w.mesh.userData.plate.dispose();
    const i=world.dynamic?.indexOf(w.dyn)??-1;if(i>=0)world.dynamic.splice(i,1);
    walls.splice(walls.indexOf(w),1);
    // the last wall down starts the cooldown (Salvage shortens it)
    if(!moving&&!walls.length)setCooldown(A().cooldown*(1-Math.min(.6,S()['fort.salvage']??0)));
    hud();
  }

  // ---- claymores (Tripwire Line augment) ----------------------------------------------------------
  function plantMine(at){
    const m=new THREE.Group(),body=new THREE.Mesh(new THREE.BoxGeometry(10,7,3),new THREE.MeshStandardMaterial({color:0x4b5a33,roughness:.8}));body.position.y=6;m.add(body);
    for(const x of [-3,3]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,6),frameMat);leg.position.set(x,2,0);m.add(leg);}
    const led=new THREE.Mesh(new THREE.SphereGeometry(.8),new THREE.MeshBasicMaterial({color:0xff2020}));led.position.set(0,9,1.6);m.add(led);
    const hit=world.raycast(new THREE.Ray(at.clone().addScaledVector(up,60),up.clone().negate()),0,200);if(hit)at.y=hit.point?.y??hit.position?.y??at.y;
    m.position.copy(at);scene.add(m);mines.push({m,at,arm:.8,led});
  }

  // ---- arcs (Live Current augment) ---------------------------------------------------------------
  function zap(a,b){
    const pts=[];for(let i=0;i<=8;i++){const p=a.clone().lerp(b,i/8);if(i&&i<8)p.add(new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(10));pts.push(p);}
    const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x9fd8ff,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
    scene.add(l);arcs.push({l,t:.18});
  }

  // ---- a zombie strikes the wall ----------------------------------------------------------------
  // wall damage scores like the turret's: no per-hit points, 50 for a kill
  function hurt(z,dmg){const alive=enemies.list.includes(z);if(!alive)return;enemies.hurt(z,dmg,false,false,'fortify',false);if(!enemies.list.includes(z))session.addPoints?.(50);}
  function strike(w,z){
    const s=S(),full=zombieHealth(session.round,data.rules);
    w.hits-=z.kind==='dog'?.5:1;w.shake=.25;w.touched=1.5;
    audio.play('board',.35);
    if(s['fort.toll'])session.addPoints?.(Math.round(s['fort.toll']));
    const face=z.root.position.clone().addScaledVector(up,40);
    if(s['fort.execute']&&z.health<full*s['fort.execute']){hurt(z,z.health+1);return;}
    if(s['fort.spikes'])hurt(z,full*s['fort.spikes']);
    if(s['fort.bleed']&&enemies.list.includes(z))z.fortBleed={until:session.time+3,dps:full*s['fort.bleed'],tick:.5};
    if(s['fort.shock']&&enemies.list.includes(z)){
      zap(w.at.clone().addScaledVector(up,w.height*.8),face);hurt(z,full*.1);
      const n=enemies.list.find(o=>o!==z&&o.root.position.distanceTo(z.root.position)<220);if(n){zap(face,n.root.position.clone().addScaledVector(up,40));hurt(n,full*.1);}
    }
    if(s['fort.knock']&&enemies.list.includes(z))z.root.position.addScaledVector(w.az,Math.sign(w.az.dot(z.root.position.clone().sub(w.at)))*40);
  }

  // ---- passives that need the wall ---------------------------------------------------------------
  const nearWall=()=>{const f=player.getFeetPosition();return walls.some(w=>w.at.distanceTo(f)<NEAR);};
  host.on('beforeDamage',e=>{
    if(!walls.length)return;
    if(nearWall())e.amount*=1-Math.min(.6,S()['player.armorWall']??0);
    if(S()['fort.laststand']&&e.amount>=session.health){const f=player.getFeetPosition(),w=walls.find(w=>!w.lastStand&&w.at.distanceTo(f)<NEAR);
      if(w){w.lastStand=true;w.hits=Math.max(1,w.hits-10);e.amount=0;api.toast?.('Last Stand: the wall took it',1.6);audio.play('board',.7);}}
  });
  host.on('beforeEnemyDamage',e=>{if(walls.length&&!e.melee&&!['turret','explosion','fortify'].includes(e.cause)&&nearWall())e.amount*=1+(S()['player.wallDamage']??0);});
  const reload=session.reload.bind(session);
  session.reload=(...a)=>{const r=reload(...a);const k=walls.length&&nearWall()?1-Math.min(.5,S()['player.reloadWall']??0):1;if(r&&k<1){session.reloadLeft*=k;session.reloadDuration*=k;}return r;};

  // ---- per frame ---------------------------------------------------------------------------------
  const slowed=new Set(),L=new THREE.Vector3();let lastRound=session.round;
  host.on('update',dt=>{
    if(!dt)return;const s=S(),feet=player.getFeetPosition();moveT=Math.max(0,moveT-dt);
    // Field Repairs: each new round patches the wall up
    if(session.round!==lastRound){if(session.round>lastRound&&s['fort.roundRepair'])for(const w of walls)w.hits=Math.min(w.maxHits,w.hits+s['fort.roundRepair']);lastRound=session.round;}
    for(let i=arcs.length-1;i>=0;i--){const a=arcs[i];a.t-=dt;a.l.material.opacity=Math.max(0,a.t/.18)*(.6+Math.random()*.4);if(a.t<=0){a.l.removeFromParent();a.l.geometry.dispose();a.l.material.dispose();arcs.splice(i,1);}}
    for(const z of enemies.list)if(z.fortBleed&&session.time<z.fortBleed.until&&(z.fortBleed.tick-=dt)<=0){z.fortBleed.tick=.5;hurt(z,z.fortBleed.dps*.5);}
    // razor wire: slow zombies near any wall
    const slow=s['fort.slow']??0;
    for(const z of [...slowed]){const keep=enemies.list.includes(z)&&slow&&walls.some(w=>w.at.distanceTo(z.root.position)<SLOW_RANGE);if(!keep){if(enemies.list.includes(z))z.speed/=z.fortSlowK;slowed.delete(z);}}
    if(slow)for(const z of enemies.list)if(!slowed.has(z)&&walls.some(w=>w.at.distanceTo(z.root.position)<SLOW_RANGE)){z.fortSlowK=1-Math.min(.6,slow);z.speed*=z.fortSlowK;slowed.add(z);}
    for(const w of [...walls]){
      w.age+=dt;w.touched-=dt;
      // rise out of the ground, shake when struck, darken as it's worn down
      w.mesh.scale.y=Math.min(1,w.age/.35);w.shake=Math.max(0,w.shake-dt);
      w.mesh.position.copy(w.at).addScaledVector(w.ax,Math.sin(w.age*70)*w.shake*3);
      w.mesh.userData.plate.color.setScalar(.55+.45*Math.max(0,w.hits/w.maxHits));
      if(s['fort.regen']&&w.touched<=0&&w.hits<w.maxHits)w.hits=Math.min(w.maxHits,w.hits+2*dt);
      if(s['fort.ammo']&&w.at.distanceTo(feet)<NEAR&&(w.ammoT-=dt)<=0){w.ammoT=2;const wpn=session.weapon,def=session.def;
        if(wpn&&def&&!session.weaponUnavailable){const max=wpn.upgraded?(def.upgrade?.maxAmmo??def.maxAmmo):def.maxAmmo;if(max&&wpn.reserve<max)wpn.reserve=Math.min(max,wpn.reserve+Math.ceil(max*.05));}}
      if(w.hits<=0){remove(w,true);continue;}
      // hold zombies at the face: in the wall's frame, push anything inside the slab back to the side it came from
      const half=w.width/2+14,depth=12;
      for(const z of enemies.list){
        if(z.state==='dead'||z.state==='barricade'||z.state==='entering')continue;
        L.copy(z.root.position).sub(w.at);const x=L.dot(w.ax),zz=L.dot(w.az),y=z.root.position.y-w.at.y;
        if(Math.abs(x)>half||y<-40||y>w.height+20){z.fortSide=null;continue;}
        const side=z.fortSide??(Math.sign(zz)||1);
        if(Math.abs(zz)>depth+8){z.fortSide=Math.sign(zz)||1;continue;}
        z.fortSide=side;
        z.root.position.addScaledVector(w.az,side*(depth+6)-zz);   // back out to the face it reached
        z.stuck=0;   // being held isn't being lost (enemies.js removes zombies stuck for 36 s)
        if(z.state!=='attack'){z.state='attack';z.attackLeft=1.15;z.attackDealt=true;z.rig.play('attack',false);z.root.rotation.y=Math.atan2(side*w.az.z,-side*w.az.x);z.fortStruck=false;}
        else if(!z.fortStruck&&z.attackLeft<.62){z.fortStruck=true;strike(w,z);}
      }
    }
    // claymores: armed after a beat, blow when a zombie walks in
    for(const m of [...mines]){
      m.arm-=dt;m.led.visible=m.arm>0||Math.sin(session.time*8)>0;if(m.arm>0)continue;
      if(enemies.list.some(z=>z.root.position.distanceTo(m.at)<70)){blast(m.at.clone().addScaledVector(up,10),220,1);m.m.removeFromParent();mines.splice(mines.indexOf(m),1);}
    }
  });
  host.on('reset',()=>{for(const w of [...walls]){w.mesh.removeFromParent();const i=world.dynamic?.indexOf(w.dyn)??-1;if(i>=0)world.dynamic.splice(i,1);}walls.length=0;
    for(const m of mines)m.m.removeFromParent();mines.length=0;moveT=0;lastRound=session.round;for(const z of slowed)if(enemies.list.includes(z))z.speed/=z.fortSlowK;slowed.clear();});

  return {deploy,walls,mines,
    up:()=>walls.length>0,
    left:()=>walls.length?Math.ceil(walls.reduce((a,w)=>a+Math.max(0,w.hits),0)):0,   // the HUD shows the hits left
    hitsLeft:()=>walls.reduce((a,w)=>a+Math.max(0,w.hits),0)};
}
