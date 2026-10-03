// The Fortifier's action skills (see classes.json; one is equipped per loadout):
//   wall  Barricade Wall: a waist-high steel barricade (Hardpoint)
//   snare Razor Snare: a field of razor wire that slows and shreds (Teeth)
//   nest  Sandbag Nest: waist-high sandbag walls in a horseshoe around you (Bunker)
// All are permanent: they stand until broken (walls) or worn out (wire), and the
// cooldown starts when the last one is gone. Using the skill again picks them up
// and puts them down where you're facing, keeping their damage.
//
// Walls and sandbags hold zombies like a boarded window rather than a navmesh
// cut (a cut would leave zombies stalled when it seals a corridor): zombies path
// as usual, are held at the face, and claw at it with their normal attack (no
// damage to the player); every swing costs a hit. They block the player (a
// world.dynamic collider flagged window:true, so setDoors doesn't disable
// navmesh polygons under it and bullets pass through, like boards) and are low
// enough (40; eye height ~60) to see and shoot over.
import * as THREE from 'three';
import { CollisionWorld } from '../../collision-world.js';
import { zombieHealth } from '../../rules.js';

const up=new THREE.Vector3(0,1,0);
const NEAR=260;          // "near your fortifications" for the Bunker passives

// A corrugated steel sheet with hazard stripes and rivets.
function plateTexture(){
  const c=document.createElement('canvas');c.width=256;c.height=80;const g=c.getContext('2d');
  const grad=g.createLinearGradient(0,0,32,0);for(let i=0;i<=1;i+=.25)grad.addColorStop(i,i%.5?'#59636b':'#7b868d');
  g.fillStyle=grad;for(let x=0;x<256;x+=32){g.save();g.translate(x,0);g.fillRect(0,0,32,80);g.restore();}
  g.fillStyle='#00000030';for(let i=0;i<30;i++)g.fillRect(Math.random()*256,Math.random()*80,2+Math.random()*30,1+Math.random()*2);
  for(const y of [0,68]){for(let x=-12;x<256;x+=24){g.fillStyle='#e0b02c';g.beginPath();g.moveTo(x,y);g.lineTo(x+12,y);g.lineTo(x+24,y+12);g.lineTo(x+12,y+12);g.fill();g.fillStyle='#1a1a1a';g.beginPath();g.moveTo(x+12,y);g.lineTo(x+24,y);g.lineTo(x+36,y+12);g.lineTo(x+24,y+12);g.fill();}}
  g.fillStyle='#2b2f33';for(const y of [20,58])for(let x=12;x<256;x+=40){g.beginPath();g.arc(x,y,3,0,7);g.fill();}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;return t;
}
// Burlap for the sandbags.
function burlapTexture(){
  const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');g.fillStyle='#8a7a55';g.fillRect(0,0,64,64);
  for(let i=0;i<64;i+=2){g.fillStyle=i%4?'#7d6e4b':'#968660';g.fillRect(0,i,64,1);g.fillRect(i,0,1,64);}
  g.fillStyle='#00000022';for(let i=0;i<20;i++)g.fillRect(Math.random()*64,Math.random()*64,6,3);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;
}

export function setupFortifier(ctx){
  const {api,act,S,A,blast,hud,onHit,getCooldown,setCooldown}=ctx;
  const {host,session,data,scene,camera,player,enemies,world,audio}=api;
  const plateTex=plateTexture(),burlapTex=burlapTexture();
  const plateMat=new THREE.MeshStandardMaterial({map:plateTex,metalness:.55,roughness:.55});
  const frameMat=new THREE.MeshStandardMaterial({color:0x3a3f44,metalness:.6,roughness:.5});
  const bagMat=new THREE.MeshStandardMaterial({map:burlapTex,roughness:.95});
  const wireMat=new THREE.MeshStandardMaterial({color:0x8d9296,metalness:.85,roughness:.35});
  const walls=[];      // wall and sandbag segments (both hold zombies)
  const snares=[];
  const mines=[],arcs=[];
  let deployId=0;
  const full=()=>zombieHealth(session.round,data.rules);
  const ground=p=>{const hit=world.raycast(new THREE.Ray(p.clone().addScaledVector(up,60),up.clone().negate()),0,200);if(hit)p.y=hit.point?.y??hit.position?.y??p.y;return p;};

  // ---- models ----------------------------------------------------------------------------------
  function steelWall(width,height){
    const g=new THREE.Group(),plate=new THREE.Mesh(new THREE.BoxGeometry(width,height,6),plateMat.clone());plate.position.y=height/2;g.add(plate);g.userData.tint=plate.material;
    plateTex.repeat.set(width/130,1);
    for(const x of [-width*.36,width*.36]){
      const top=new THREE.Vector3(x,height*.8,-4),foot=new THREE.Vector3(x,0,-height*.42),dir=foot.clone().sub(top),len=dir.length();
      const brace=new THREE.Mesh(new THREE.BoxGeometry(4,len,4),frameMat);brace.position.copy(top).addScaledVector(dir,.5);brace.quaternion.setFromUnitVectors(up,dir.normalize().negate());g.add(brace);
      const post=new THREE.Mesh(new THREE.BoxGeometry(6,height,6),frameMat);post.position.set(x,height/2,-4);g.add(post);
      const pad=new THREE.Mesh(new THREE.BoxGeometry(10,2,10),frameMat);pad.position.copy(foot).setY(1);g.add(pad);
    }
    const rail=new THREE.Mesh(new THREE.BoxGeometry(width+8,6,9),frameMat);rail.position.y=height+1;g.add(rail);
    return g;
  }
  function sandbags(width,height){
    const g=new THREE.Group(),mat=bagMat.clone();g.userData.tint=mat;
    const bag=new THREE.CapsuleGeometry(6.5,14,4,8);bag.rotateZ(Math.PI/2);bag.scale(1,.75,1.25);
    const rows=Math.round(height/10),per=Math.max(2,Math.round(width/24)),inst=new THREE.InstancedMesh(bag,mat,rows*per),m=new THREE.Matrix4(),q=new THREE.Quaternion();let k=0;
    for(let r=0;r<rows;r++)for(let i=0;i<per;i++){
      const x=-width/2+(i+.5+(r%2)*.5)*width/per;if(x>width/2)continue;
      q.setFromAxisAngle(up,(Math.random()-.5)*.15);m.compose(new THREE.Vector3(x,5+r*9.5,(Math.random()-.5)*2),q,new THREE.Vector3(1,1,1));inst.setMatrixAt(k++,m);
    }
    inst.count=k;g.add(inst);return g;
  }
  function wireField(radius){
    const g=new THREE.Group();
    // loose coils of concertina wire lying in rings, on short stakes
    // one instanced batch of overlapping coils (concertina: each a ring stood up along the run)
    const ringR=[.3,.55,.8,1].map(k=>radius*k),per=ringR.map(r=>Math.round(r/4.5)),n=per.reduce((x,y)=>x+y,0);
    const coil=new THREE.TorusGeometry(8,.45,4,14),inst=new THREE.InstancedMesh(coil,wireMat,n),m=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler();let k=0;
    ringR.forEach((r,ri)=>{for(let i=0;i<per[ri];i++){const a=i/per[ri]*Math.PI*2+ri*.3;
      e.set((Math.random()-.5)*.5,-a,(Math.random()-.5)*.3);q.setFromEuler(e);m.compose(new THREE.Vector3(Math.cos(a)*r,7+Math.random()*1.5,Math.sin(a)*r),q,new THREE.Vector3(1,.8+Math.random()*.3,1));inst.setMatrixAt(k++,m);}});
    g.add(inst);
    // loose strands criss-crossing the field
    const pts=[];for(let i=0;i<26;i++){const a=Math.random()*Math.PI*2,b=a+Math.PI*(.5+Math.random()),r1=radius*(.2+Math.random()*.8),r2=radius*(.2+Math.random()*.8);
      pts.push(new THREE.Vector3(Math.cos(a)*r1,3+Math.random()*6,Math.sin(a)*r1),new THREE.Vector3(Math.cos(b)*r2,3+Math.random()*6,Math.sin(b)*r2));}
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x9aa0a4})));
    for(const r of [radius*.55,radius])for(let i=0;i<8;i++){const a=i/8*Math.PI*2;const stake=new THREE.Mesh(new THREE.CylinderGeometry(.9,.9,18,5),frameMat);stake.position.set(Math.cos(a)*r,8,Math.sin(a)*r);g.add(stake);}
    return g;
  }

  // ---- placing ---------------------------------------------------------------------------------
  function addSegment(kind,at,yaw,width,height,hits,group){
    const mesh=kind==='sandbag'?sandbags(width,height):steelWall(width,height);
    mesh.position.copy(at);mesh.rotation.y=yaw;mesh.scale.y=.01;mesh.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;}});scene.add(mesh);
    const geo=new THREE.BoxGeometry(width,height,kind==='sandbag'?16:10);geo.translate(0,height/2,0);geo.rotateY(yaw);geo.translate(at.x,at.y,at.z);geo.computeBoundingBox();
    const dyn={collider:new CollisionWorld(geo),box:geo.boundingBox.clone(),enabled:true,window:true,fortWall:true};world.dynamic?.push(dyn);
    const w={kind,mesh,at:at.clone(),yaw,width,height,depth:kind==='sandbag'?16:12,dyn,hits,maxHits:hits,age:0,shake:0,touched:0,group,
      // local frame: x along the wall, z out through the zombies' side
      ax:new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)),az:new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw))};
    walls.push(w);return w;
  }
  function raise(fresh){
    const a=A(),fwd=camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize(),feet=player.getFeetPosition();
    const facing=Math.atan2(fwd.x,fwd.z),side=new THREE.Vector3(fwd.z,0,-fwd.x),placed=[];
    const ahead=d=>{let at=feet.clone().addScaledVector(fwd,d);if(!world.lineClear(feet.clone().addScaledVector(up,30),at.clone().addScaledVector(up,30)))at=feet.clone().addScaledVector(fwd,d*.6);return at;};
    if(act.id==='wall'){
      const at=ahead(85);
      if(a.count>1)for(const s of [-1,1])placed.push(addSegment('steel',ground(at.clone().addScaledVector(side,s*a.width*.42).addScaledVector(fwd,-a.width*.18)),facing+s*.55,a.width,a.height,a.health,++deployId));
      else placed.push(addSegment('steel',ground(at),facing,a.width,a.height,a.health,++deployId));
    }else if(act.id==='nest'){
      // around your feet, open behind (a full ring with Ring of Steel)
      const id=++deployId,angles=a.segments>3?[0,Math.PI/2,Math.PI,-Math.PI/2]:[0,Math.PI/2,-Math.PI/2];
      for(const ang of angles){const yaw=facing+ang,dir=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
        placed.push(addSegment('sandbag',ground(feet.clone().addScaledVector(dir,a.radius)),yaw,a.width,a.height,a.health,id));}
    }else if(act.id==='snare'){
      const at=ahead(a.radius+60);
      const spots=a.count>1?[at.clone().addScaledVector(side,-a.radius*1.05),at.clone().addScaledVector(side,a.radius*1.05)]:[at];
      for(const p of spots){ground(p);const mesh=wireField(a.radius);mesh.position.copy(p);mesh.scale.setScalar(.01);scene.add(mesh);
        snares.push({mesh,at:p.clone(),radius:a.radius,wear:a.durability,maxWear:a.durability,age:0,group:++deployId,inside:new Set(),shockT:.5,tickT:a.tick});}
    }
    if(fresh&&S()['fort.claymore'])for(const w of placed)plantMine(w.at.clone().addScaledVector(w.az,55));
    return placed;
  }

  let moveT=0;
  function deploy(){
    const st=api.getState();if(!st.active||session.busy||session.phase==='reviving')return;
    // already up: pick everything up and put it down here, keeping its damage
    if(walls.length||snares.length){
      if(moveT>0){api.toast?.(`Moving in ${Math.ceil(moveT)}s`,1);return;}
      const keptW=walls.map(w=>w.hits/w.maxHits),keptS=snares.map(s=>s.wear/s.maxWear);
      for(const w of [...walls])removeWall(w,false,true);for(const s of [...snares])removeSnare(s,true);
      raise(false);
      keptW.forEach((k,i)=>{const w=walls[i];if(w)w.hits=Math.max(1,w.maxHits*k);});
      keptS.forEach((k,i)=>{const s=snares[i];if(s)s.wear=Math.max(1,s.maxWear*k);});
      moveT=3;api.toast?.(act.name+' moved',1);audio.play('buy',.4);hud();return;
    }
    if(getCooldown()>0){api.toast?.(`${act.name} ready in ${Math.ceil(getCooldown())}s`,1.2);return;}
    lastStandUsed=false;
    raise(true);audio.play('buy',.6);window.kino.fx?.knockback?.(player.getFeetPosition());hud();
  }
  const done=()=>{if(!walls.length&&!snares.length)setCooldown(A().cooldown);};   // the cooldown starts when the last one is gone (Salvage etc. in mod.js)
  function removeWall(w,broken,moving=false){
    if(!moving){
      // Shrapnel Charge: a steel wall blows when destroyed (sandbags just burst)
      if(w.kind==='steel'&&S()['fort.shrapnel'])blast(w.at.clone().addScaledVector(up,30),260,.9);
      else if(broken){window.kino.fx?.explosion?.([w.at.x,w.at.y+20,w.at.z],.25);audio.play('explosion',.25);}
    }
    w.mesh.removeFromParent();w.mesh.traverse(o=>{if(o.isMesh&&o.geometry)o.geometry.dispose();});w.mesh.userData.tint?.dispose();
    const i=world.dynamic?.indexOf(w.dyn)??-1;if(i>=0)world.dynamic.splice(i,1);
    walls.splice(walls.indexOf(w),1);if(!moving)done();hud();
  }
  function removeSnare(s,moving=false){
    for(const z of [...s.inside])release(z,s);
    s.mesh.removeFromParent();s.mesh.traverse(o=>{if(o.isMesh&&o.geometry)o.geometry.dispose();});
    snares.splice(snares.indexOf(s),1);if(!moving)done();hud();
  }

  // ---- claymores (Tripwire Line) ---------------------------------------------------------------------
  function plantMine(at){
    const m=new THREE.Group(),body=new THREE.Mesh(new THREE.BoxGeometry(10,7,3),new THREE.MeshStandardMaterial({color:0x4b5a33,roughness:.8}));body.position.y=6;m.add(body);
    for(const x of [-3,3]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,6),frameMat);leg.position.set(x,2,0);m.add(leg);}
    const led=new THREE.Mesh(new THREE.SphereGeometry(.8),new THREE.MeshBasicMaterial({color:0xff2020}));led.position.set(0,9,1.6);m.add(led);
    ground(at);m.position.copy(at);scene.add(m);mines.push({m,at,arm:.8,led});
  }
  // ---- arcs (Live Current, Electrified) ----------------------------------------------------------------
  function zap(a,b){
    const pts=[];for(let i=0;i<=8;i++){const p=a.clone().lerp(b,i/8);if(i&&i<8)p.add(new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(10));pts.push(p);}
    const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x9fd8ff,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
    scene.add(l);arcs.push({l,t:.18});
  }
  // damage scores like the turret's: no per-hit points, 50 for a kill
  // fixed-fraction damage (current, bleed) gets Ability damage; the wire's own damage already has it
  function hurt(z,dmg,mul=true){if(!enemies.list.includes(z))return;enemies.hurt(z,dmg*(mul?A().dmgMul:1),false,false,'fortify',false);const killed=!enemies.list.includes(z);onHit(z,killed);if(killed)session.addPoints?.(50);}
  const execute=z=>{const e=S()['cap.execute'];if(e&&z.health<full()*e){hurt(z,z.health+1);return true;}return false;};   // Iron Maiden

  // ---- a zombie strikes a wall or sandbags ---------------------------------------------------------
  function strike(w,z){
    const s=S();
    w.hits-=z.kind==='dog'?.5:1;w.shake=.25;w.touched=1.5;audio.play('board',.35);
    if(execute(z))return;
    const face=z.root.position.clone().addScaledVector(up,40);
    if(s['fort.shock']){zap(w.at.clone().addScaledVector(up,w.height*.8),face);hurt(z,full()*.15);
      const n=enemies.list.find(o=>o!==z&&o.root.position.distanceTo(z.root.position)<220);if(n){zap(face,n.root.position.clone().addScaledVector(up,40));hurt(n,full()*.15);}}
    if(s['fort.knock']&&enemies.list.includes(z))z.root.position.addScaledVector(w.az,Math.sign(w.az.dot(z.root.position.clone().sub(w.at)))*60);
  }

  // ---- the wire ------------------------------------------------------------------------------------
  function release(z,s){
    s.inside.delete(z);if(z.snareK){z.speed/=z.snareK;z.snareK=0;}
    if(S()['snare.bleed']&&enemies.list.includes(z))z.snareBleed={until:session.time+4,dps:full()*S()['snare.bleed'],tick:.5};
  }
  function updateSnare(s,dt){
    const a=A(),st=S();
    s.age+=dt;s.mesh.scale.setScalar(Math.min(1,s.age/.3));
    s.mesh.position.y=s.at.y-(1-s.wear/s.maxWear)*5;   // sinks into the ground as it wears out
    for(const z of enemies.list){
      if(z.state==='barricade'||z.state==='entering')continue;
      const d=Math.hypot(z.root.position.x-s.at.x,z.root.position.z-s.at.z),inside=d<s.radius&&Math.abs(z.root.position.y-s.at.y)<50;
      if(inside&&!s.inside.has(z)){s.inside.add(z);z.snareK=1-a.slow;z.speed*=z.snareK;if(st['snare.root'])z.snareRoot={until:session.time+st['snare.root'],at:z.root.position.clone()};}
      else if(!inside&&s.inside.has(z))release(z,s);
      // Reel In: drag zombies near the wire toward it
      if(!inside&&st['snare.pull']&&d<300){const to=s.at.clone().sub(z.root.position).setY(0).normalize();z.root.position.addScaledVector(to,40*dt);}
    }
    for(const z of [...s.inside])if(!enemies.list.includes(z))s.inside.delete(z);
    for(const z of s.inside)if(z.snareRoot&&session.time<z.snareRoot.until){z.root.position.x=z.snareRoot.at.x;z.root.position.z=z.snareRoot.at.z;z.stuck=0;}
    s.wear-=s.inside.size*dt;
    if((s.tickT-=dt)<=0){s.tickT=a.tick;for(const z of [...s.inside])if(!execute(z))hurt(z,full()*a.damage*a.tick,false);}
    if(st['snare.shock']&&s.inside.size&&(s.shockT-=dt)<=0){s.shockT=.5;const list=[...s.inside],z=list[Math.floor(Math.random()*list.length)],c=z.root.position.clone().addScaledVector(up,40);
      zap(s.at.clone().addScaledVector(up,8),c);hurt(z,full()*.1);const n=list.find(o=>o!==z);if(n){zap(c,n.root.position.clone().addScaledVector(up,40));hurt(n,full()*.1);}}
    if(s.wear<=0)removeSnare(s);
  }

  // ---- passives near fortifications ---------------------------------------------------------------
  const nearAny=()=>{const f=player.getFeetPosition();return walls.some(w=>w.at.distanceTo(f)<NEAR)||snares.some(s=>s.at.distanceTo(f)<NEAR);};
  const nestCenter=()=>{const g=walls.filter(w=>w.kind==='sandbag');if(!g.length)return null;return g.reduce((v,w)=>v.add(w.at),new THREE.Vector3()).divideScalar(g.length);};
  const inNest=()=>{const c=nestCenter();return !!c&&c.distanceTo(player.getFeetPosition())<(A().radius??80)+15;};
  let lastStandUsed=false;   // once per deployment (moving doesn't recharge it)
  host.on('beforeDamage',e=>{
    if((!walls.length&&!snares.length)||!S()['cap.laststand']||lastStandUsed||e.amount<session.health||!nearAny())return;
    lastStandUsed=true;e.amount=0;
    const f=player.getFeetPosition(),w=walls.find(w=>w.at.distanceTo(f)<NEAR);if(w)w.hits=Math.max(1,w.hits-10);else for(const s of snares)s.wear=Math.max(1,s.wear-15);
    api.toast?.('Last Stand: your fortification took it',1.6);audio.play('board',.7);
  });

  // ---- per frame ---------------------------------------------------------------------------------
  const L=new THREE.Vector3();let ammoT=0;
  host.on('update',dt=>{
    if(!dt)return;const s=S();moveT=Math.max(0,moveT-dt);
    for(let i=arcs.length-1;i>=0;i--){const a=arcs[i];a.t-=dt;a.l.material.opacity=Math.max(0,a.t/.18)*(.6+Math.random()*.4);if(a.t<=0){a.l.removeFromParent();a.l.geometry.dispose();a.l.material.dispose();arcs.splice(i,1);}}
    for(const z of enemies.list)if(z.snareBleed&&session.time<z.snareBleed.until&&(z.snareBleed.tick-=dt)<=0){z.snareBleed.tick=.5;hurt(z,z.snareBleed.dps*.5);}
    // in the nest: Field Medic heals, Ammo Cache refills
    if(s['nest.heal']&&inNest()&&session.health<(session.maxHealth??150))session.health=Math.min(session.maxHealth??150,session.health+s['nest.heal']*dt);
    if(s['fort.ammo']&&walls.length&&(act.id==='nest'?inNest():nearAny())&&(ammoT-=dt)<=0){ammoT=2;const wpn=session.weapon,def=session.def;
      if(wpn&&def&&!session.weaponUnavailable){const max=wpn.upgraded?(def.upgrade?.maxAmmo??def.maxAmmo):def.maxAmmo;if(max&&wpn.reserve<max)wpn.reserve=Math.min(max,wpn.reserve+Math.ceil(max*.05));}}
    for(const sn of [...snares])updateSnare(sn,dt);
    for(const w of [...walls]){
      w.age+=dt;w.touched-=dt;
      // rise out of the ground, shake when struck, darken as it's worn down
      w.mesh.scale.y=Math.min(1,w.age/.35);w.shake=Math.max(0,w.shake-dt);
      w.mesh.position.copy(w.at).addScaledVector(w.ax,Math.sin(w.age*70)*w.shake*3);
      w.mesh.userData.tint?.color.setScalar(.55+.45*Math.max(0,w.hits/w.maxHits));
      if(s['fort.regen']&&w.touched<=0&&w.hits<w.maxHits)w.hits=Math.min(w.maxHits,w.hits+2*dt);
      if(w.hits<=0){removeWall(w,true);continue;}
      // hold zombies at the face: in the wall's frame, push anything inside the slab back to the side it came from
      const half=w.width/2+14,depth=w.depth;
      for(const z of enemies.list){
        if(z.state==='dead'||z.state==='barricade'||z.state==='entering')continue;
        L.copy(z.root.position).sub(w.at);const x=L.dot(w.ax),zz=L.dot(w.az),y=z.root.position.y-w.at.y;
        if(Math.abs(x)>half||y<-40||y>w.height+20){if(z.fortWall===w)z.fortWall=null;continue;}
        const side=z.fortWall===w&&z.fortSide?z.fortSide:(Math.sign(zz)||1);
        if(Math.abs(zz)>depth+8){z.fortWall=w;z.fortSide=Math.sign(zz)||1;continue;}
        z.fortWall=w;z.fortSide=side;
        z.root.position.addScaledVector(w.az,side*(depth+6)-zz);   // back out to the face it reached
        z.stuck=0;   // being held isn't being lost (enemies.js removes zombies stuck for 36 s)
        if(z.state!=='attack'){z.state='attack';z.attackLeft=1.15;z.attackDealt=true;z.rig.play('attack',false);z.root.rotation.y=Math.atan2(side*w.az.z,-side*w.az.x);z.fortStruck=false;}
        else if(!z.fortStruck&&z.attackLeft<.62){z.fortStruck=true;strike(w,z);}
      }
    }
    for(const m of [...mines]){
      m.arm-=dt;m.led.visible=m.arm>0||Math.sin(session.time*8)>0;if(m.arm>0)continue;
      if(enemies.list.some(z=>z.root.position.distanceTo(m.at)<70)){blast(m.at.clone().addScaledVector(up,10),220,1);m.m.removeFromParent();mines.splice(mines.indexOf(m),1);}
    }
  });
  host.on('reset',()=>{
    for(const w of [...walls]){w.mesh.removeFromParent();const i=world.dynamic?.indexOf(w.dyn)??-1;if(i>=0)world.dynamic.splice(i,1);}walls.length=0;
    for(const s of [...snares]){for(const z of s.inside)if(z.snareK)z.speed/=z.snareK;s.mesh.removeFromParent();}snares.length=0;
    for(const m of mines)m.m.removeFromParent();mines.length=0;moveT=0;lastStandUsed=false;
  });

  return {deploy,walls,snares,mines,
    near:(f,r)=>walls.some(w=>w.at.distanceTo(f)<r)||snares.some(s=>s.at.distanceTo(f)<r),
    // Field Repairs (mod.js, each new round): hits back on walls and sandbags, wear back on the wire
    repair:n=>{for(const w of walls)w.hits=Math.min(w.maxHits,w.hits+n);for(const s of snares)s.wear=Math.min(s.maxWear,s.wear+n*1.5);},
    up:()=>walls.length>0||snares.length>0,
    // the HUD shows what's left: wall hits, or the wire's wear
    left:()=>walls.length?Math.ceil(walls.reduce((a,w)=>a+Math.max(0,w.hits),0)):snares.length?Math.ceil(snares.reduce((a,s)=>a+s.wear,0)):0};
}
