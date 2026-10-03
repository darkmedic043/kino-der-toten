// The Engineer's Drone Ops and Demolitions action skills (the Sentry Turret lives in mod.js):
//   drone   Hunter Drone: orbits the player and shoots the nearest zombie it can see
//   mortar  Mortar Beacon: shells fall on zombies around a beacon until the barrage ends
// Capstones work with either: cap.double (two of them, 25% shorter), cap.killExtend
// (kills add time), cap.finale (drones dive into the crowd, the barrage ends in a carpet).
import * as THREE from 'three';
import { zombieHealth } from '../../rules.js';

const up=new THREE.Vector3(0,1,0);

export function setupEngineer(ctx){
  const {api,act,S,A,blast,hud,onHit,getCooldown,setCooldown}=ctx;
  const {host,session,data,scene,camera,player,enemies,world,audio}=api;
  const full=()=>zombieHealth(session.round,data.rules);
  const drones=[],beacons=[],marks=[],fires=[],tracers=[],arcs=[];
  const tracerMat=new THREE.LineBasicMaterial({color:0x9ff3ff,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false});
  const darkMat=new THREE.MeshStandardMaterial({color:0x2c3136,metalness:.6,roughness:.45});
  const accentMat=new THREE.MeshStandardMaterial({color:0x6fc3c9,metalness:.3,roughness:.4,emissive:0x2a6f75,emissiveIntensity:.6});
  const center=z=>z.root.position.clone().addScaledVector(up,z.kind==='dog'?20:40);
  function tracer(a,b,color){const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),tracerMat.clone());if(color)l.material.color.set(color);scene.add(l);tracers.push({l,t:.06});}
  function zap(a,b){
    const pts=[];for(let i=0;i<=8;i++){const p=a.clone().lerp(b,i/8);if(i&&i<8)p.add(new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(10));pts.push(p);}
    const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x9fd8ff,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));scene.add(l);arcs.push({l,t:.16});
  }
  // kills by the action skill: 50 points (like the turret's) and Perpetual Motion time
  function hurt(z,dmg,owner){
    if(!enemies.list.includes(z))return false;enemies.hurt(z,dmg,false,false,'turret',false);
    const killed=!enemies.list.includes(z);onHit(z,killed);if(!killed)return false;
    session.addPoints?.(50);const ext=S()['cap.killExtend'];if(ext&&owner)owner.life+=ext;return true;
  }
  function boom(at,radius,frac,owner){   // blast() and credit its kills to the owner
    const hitz=enemies.list.filter(z=>z.root.position.distanceTo(at)<radius);blast(at,radius,frac*A().dmgMul);
    const ext=S()['cap.killExtend'];for(const z of hitz){const killed=!enemies.list.includes(z);onHit(z,killed);if(killed&&ext&&owner)owner.life+=ext;}
  }

  // ---- Hunter Drone ------------------------------------------------------------------------------
  function droneModel(){
    const g=new THREE.Group(),body=new THREE.Mesh(new THREE.BoxGeometry(12,4,12),darkMat);g.add(body);
    const top=new THREE.Mesh(new THREE.CylinderGeometry(4,5,3,8),accentMat);top.position.y=3;g.add(top);
    const gun=new THREE.Mesh(new THREE.CylinderGeometry(1,1,8,6),darkMat);gun.rotation.z=Math.PI/2;gun.position.set(6,-3,0);g.add(gun);
    const rotors=[];for(const [x,z] of [[9,9],[9,-9],[-9,9],[-9,-9]]){
      const arm=new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x,z),1.5,1.5),darkMat);arm.position.set(x/2,0,z/2);arm.rotation.y=-Math.atan2(z,x);g.add(arm);
      const r=new THREE.Mesh(new THREE.CylinderGeometry(5,5,.4,12),new THREE.MeshBasicMaterial({color:0x9aa4ab,transparent:true,opacity:.35,depthWrite:false}));r.position.set(x,1.5,z);g.add(r);rotors.push(r);}
    const led=new THREE.Mesh(new THREE.SphereGeometry(1),new THREE.MeshBasicMaterial({color:0x7ff7ff}));led.position.set(6.5,0,0);g.add(led);
    g.traverse(o=>{if(o.isMesh)o.castShadow=true;});g.userData.rotors=rotors;return g;
  }
  function launchDrones(){
    const a=A();
    for(let i=0;i<a.count;i++){const mesh=droneModel();mesh.position.copy(player.getFeetPosition()).addScaledVector(up,40);scene.add(mesh);
      drones.push({mesh,phase:i/a.count*Math.PI*2,life:a.duration,fire:.3,dive:null});}
  }
  function densest(from,range){
    let best=null,score=0;for(const z of enemies.list){if(z.root.position.distanceTo(from)>range)continue;const n=enemies.list.filter(o=>o.root.position.distanceTo(z.root.position)<200).length;if(n>score){score=n;best=z;}}return best;
  }
  function endDrone(d){
    // Kamikaze / Final Payload: dive into the biggest crowd and explode
    if((S()['drone.kamikaze']||S()['cap.finale'])&&!d.dive){const z=densest(d.mesh.position,900);if(z){d.dive={from:d.mesh.position.clone(),to:z.root.position.clone().addScaledVector(up,20),t:0};return;}}
    d.mesh.removeFromParent();drones.splice(drones.indexOf(d),1);
    if(!drones.length&&!beacons.length)setCooldown(A().cooldown);hud();
  }
  function updateDrones(dt){
    const a=A(),s=S(),feet=player.getFeetPosition();
    for(const d of [...drones]){
      for(const r of d.mesh.userData.rotors)r.rotation.y+=dt*40;
      if(d.dive){d.dive.t+=dt/.6;d.mesh.position.lerpVectors(d.dive.from,d.dive.to,Math.min(1,d.dive.t));
        if(d.dive.t>=1){boom(d.dive.to,240,1.2,null);d.mesh.removeFromParent();drones.splice(drones.indexOf(d),1);if(!drones.length&&!beacons.length)setCooldown(a.cooldown);hud();}continue;}
      d.life-=dt;if(d.life<=0){endDrone(d);continue;}
      d.phase+=dt*1.1;
      const goal=feet.clone().add(new THREE.Vector3(Math.cos(d.phase)*55,72+Math.sin(d.phase*2.3)*5,Math.sin(d.phase)*55));
      d.mesh.position.lerp(goal,Math.min(1,dt*4));
      if(s['drone.heal']&&session.health<(session.maxHealth??150))session.health=Math.min(session.maxHealth??150,session.health+s['drone.heal']*dt/drones.length);
      const p=d.mesh.position,targets=enemies.list.filter(z=>z.root.position.distanceTo(p)<a.range&&world.lineClear(p,center(z))).sort((x,y)=>x.root.position.distanceToSquared(p)-y.root.position.distanceToSquared(p));
      const z=targets[0];if(!z){d.mesh.rotation.y+=dt;continue;}
      const to=center(z);d.mesh.rotation.y=Math.atan2(-(to.z-p.z),to.x-p.x);
      if((d.fire-=dt)>0)continue;d.fire=1/a.rate;
      tracer(p.clone(),to);audio.weapon('shot',data.weapons.m1911_zm??Object.values(data.weapons)[0]);
      const dmg=full()*a.damage+15;
      hurt(z,dmg,d);
      if(s['drone.chain']){let from=to;for(const n of targets.filter(o=>o!==z&&o.root.position.distanceTo(z.root.position)<240).slice(0,s['drone.chain'])){const c=center(n);zap(from,c);from=c;
        n.droneStun=session.time+.4;hurt(n,dmg*.6,d);}z.droneStun=session.time+.4;}
    }
  }
  // Shock Rounds stun: hold the zombie in place briefly
  const stunned=new Map();

  // ---- Mortar Beacon -----------------------------------------------------------------------------
  function beaconModel(){
    const g=new THREE.Group(),base=new THREE.Mesh(new THREE.CylinderGeometry(5,6,6,8),darkMat);base.position.y=3;g.add(base);
    const mast=new THREE.Mesh(new THREE.CylinderGeometry(.6,.6,26,6),darkMat);mast.position.y=18;g.add(mast);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(2.2,10,8),new THREE.MeshBasicMaterial({color:0xff3a1a}));lamp.position.y=32;g.add(lamp);g.userData.lamp=lamp;
    return g;
  }
  function ground(p){const hit=world.raycast(new THREE.Ray(p.clone().addScaledVector(up,80),up.clone().negate()),0,300);if(hit)p.y=hit.point?.y??hit.position?.y??p.y;return p;}
  function plantBeacons(){
    const a=A(),fwd=camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize(),side=new THREE.Vector3(fwd.z,0,-fwd.x),feet=player.getFeetPosition();
    const follow=!!S()['mortar.follow'],count=a.count??1;
    for(let i=0;i<count;i++){
      const at=follow?feet.clone():ground(feet.clone().addScaledVector(fwd,160).addScaledVector(side,count>1?(i?1:-1)*170:0));
      const mesh=beaconModel();mesh.position.copy(at);scene.add(mesh);
      beacons.push({mesh,at,life:a.duration,next:.6,follow,carpet:!!S()['cap.finale']});
    }
  }
  function shell(b,at,frac,radius,delay=.7){
    // a red ring marks where it lands, then it hits
    const ring=new THREE.Mesh(new THREE.RingGeometry(radius*.8,radius*.88,32),new THREE.MeshBasicMaterial({color:0xff4020,transparent:true,opacity:.0,depthWrite:false,side:THREE.DoubleSide}));
    ring.rotation.x=-Math.PI/2;ring.position.copy(at).addScaledVector(up,2);scene.add(ring);
    marks.push({ring,at:at.clone(),t:delay,delay,frac,radius,owner:b});
  }
  function updateBeacons(dt){
    const a=A(),s=S();
    for(const b of [...beacons]){
      if(b.follow)b.at.copy(player.getFeetPosition());b.mesh.position.copy(b.at);
      b.mesh.userData.lamp.visible=Math.sin(session.time*10)>0;
      b.life-=dt;
      if(b.life<=0){
        // Final Payload: walk a line of eight shells across the area
        if(b.carpet){const fwd=camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();for(let i=0;i<8;i++){const p=ground(b.at.clone().addScaledVector(fwd,-280+i*80));shell(b,p,a.damage,a.radius,.5+i*.12);}}
        b.mesh.removeFromParent();beacons.splice(beacons.indexOf(b),1);if(!drones.length&&!beacons.length)setCooldown(a.cooldown);hud();continue;
      }
      if((b.next-=dt)>0)continue;b.next=a.interval;
      const near=enemies.list.filter(z=>z.root.position.distanceTo(b.at)<a.range);
      const z=near.length?near[Math.floor(Math.random()*near.length)]:null;
      const at=z?z.root.position.clone():ground(b.at.clone().add(new THREE.Vector3((Math.random()-.5)*a.range,0,(Math.random()-.5)*a.range)));
      if(s['mortar.cluster']){shell(b,at,a.damage*.6,a.radius*.7);for(let i=0;i<s['mortar.cluster'];i++){const o=new THREE.Vector3((Math.random()-.5)*140,0,(Math.random()-.5)*140);shell(b,ground(at.clone().add(o)),a.damage*.45,a.radius*.55,.9+i*.1);}}
      else shell(b,at,a.damage,a.radius);
    }
    for(const m of [...marks]){
      m.t-=dt;m.ring.material.opacity=Math.min(.8,(1-m.t/m.delay)*1.2);m.ring.scale.setScalar(1+Math.sin(session.time*20)*.03);
      if(m.t>0)continue;m.ring.removeFromParent();m.ring.geometry.dispose();m.ring.material.dispose();marks.splice(marks.indexOf(m),1);
      boom(m.at.clone().addScaledVector(up,10),m.radius,m.frac,m.owner);
      if(S()['mortar.napalm']){const disc=new THREE.Mesh(new THREE.CircleGeometry(110,24),new THREE.MeshBasicMaterial({color:0xff6a1a,transparent:true,opacity:.35,depthWrite:false,blending:THREE.AdditiveBlending}));
        disc.rotation.x=-Math.PI/2;disc.position.copy(m.at).addScaledVector(up,1.5);scene.add(disc);fires.push({disc,at:m.at.clone(),t:4,tick:.5});}
    }
    for(const f of [...fires]){
      f.t-=dt;f.disc.material.opacity=Math.min(.35,f.t*.2)*(.8+Math.random()*.3);
      if((f.tick-=dt)<=0){f.tick=.5;for(const z of [...enemies.list])if(z.root.position.distanceTo(f.at)<110){hurt(z,full()*.08*A().dmgMul,null);window.kino.fx?.burn?.(center(z));}}
      if(f.t<=0){f.disc.removeFromParent();f.disc.geometry.dispose();f.disc.material.dispose();fires.splice(fires.indexOf(f),1);}
    }
  }

  // ---- shared -----------------------------------------------------------------------------------
  function deploy(){
    const st=api.getState();if(!st.active||session.busy||session.phase==='reviving')return;
    if(act.id==='drone'&&drones.length){   // Kamikaze: Z again sends them in
      if(S()['drone.kamikaze'])for(const d of [...drones])endDrone(d);else api.toast?.(act.name+' is up',1);return;}
    if(act.id==='mortar'&&beacons.length){api.toast?.('Barrage in progress',1);return;}
    if(getCooldown()>0){api.toast?.(`${act.name} ready in ${Math.ceil(getCooldown())}s`,1.2);return;}
    if(act.id==='drone')launchDrones();else plantBeacons();
    audio.play('buy',.6);hud();
  }
  host.on('update',dt=>{
    if(!dt)return;
    for(let i=tracers.length-1;i>=0;i--){const t=tracers[i];t.t-=dt;t.l.material.opacity=Math.max(0,t.t/.06);if(t.t<=0){t.l.removeFromParent();t.l.geometry.dispose();t.l.material.dispose();tracers.splice(i,1);}}
    for(let i=arcs.length-1;i>=0;i--){const a=arcs[i];a.t-=dt;a.l.material.opacity=Math.max(0,a.t/.16)*(.6+Math.random()*.4);if(a.t<=0){a.l.removeFromParent();a.l.geometry.dispose();a.l.material.dispose();arcs.splice(i,1);}}
    // stunned zombies stay put
    for(const z of enemies.list)if(z.droneStun>session.time){if(!stunned.has(z))stunned.set(z,z.root.position.clone());const p=stunned.get(z);z.root.position.x=p.x;z.root.position.z=p.z;}else stunned.delete(z);
    updateDrones(dt);updateBeacons(dt);
  });
  host.on('reset',()=>{for(const d of drones)d.mesh.removeFromParent();drones.length=0;for(const b of beacons)b.mesh.removeFromParent();beacons.length=0;
    for(const m of marks)m.ring.removeFromParent();marks.length=0;for(const f of fires)f.disc.removeFromParent();fires.length=0;stunned.clear();});
  return {deploy,drones,beacons,
    near:(f,r)=>drones.length>0||beacons.some(b=>b.at.distanceTo(f)<r),
    up:()=>drones.length>0||beacons.length>0,
    left:()=>Math.ceil(Math.max(0,...drones.map(d=>d.life),...beacons.map(b=>b.life)))};
}
