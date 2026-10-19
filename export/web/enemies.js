import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { Rig, loadModel, loadAnimation } from './animation.js';
import { zombieHealth } from './rules.js';
import { disposeSkeletons } from './runtime-assets.js';

export class Enemies {
  constructor(scene,world,data,session,{damage,kill,hit,sound}){Object.assign(this,{scene,world,data,session,onDamage:damage,onKill:kill,onHit:hit,onSound:sound});this.list=[];this.dead=[];this.nextSpawn=0;this.serial=0;this.templates=[];this.anims={};}
  async load(){
    const chars=this.data.characters;
    this.templates=await Promise.all(['c_ger_honorguard_body1','c_ger_honorguard_body2'].map(k=>loadModel(chars[k])));
    this.heads=await Promise.all(['c_ger_zombie_head1','c_ger_zombie_head2','c_ger_zombie_head3','c_ger_zombie_head4'].map(k=>loadModel(chars[k])));
    this.dog=await loadModel(chars.zombie_wolf);
    this.quad=await loadModel(chars.c_zom_quad_body);this.quadHead=await loadModel(chars.c_zom_quad_head);
    await Promise.all(Object.entries(this.data.animations).filter(([n])=>n.startsWith('ai_zombie_')||n.startsWith('zombie_dog_')).map(async([n,u])=>{this.anims[n]=await loadAnimation(u);}));
  }
  spawn(position=null,barrier=null,kind=this.session.dogRound?'dog':'zombie'){
    const id=++this.serial,root=new THREE.Group();root.name=kind+'_'+id;
    if(kind==='dog'&&this.dog)root.add(clone(this.dog));
    else{
      const body=clone(kind==='nova'?this.quad:this.templates[id%this.templates.length]);root.add(body);
      const sourceHead=kind==='nova'?this.quadHead:this.heads[id%this.heads.length];
      if(sourceHead){
        const head=clone(sourceHead);root.add(head);root.updateMatrixWorld(true);
        const mount=body.getObjectByName('j_spine4'),anchor=head.getObjectByName('j_spine4');
        if(mount&&anchor){head.matrixAutoUpdate=false;head.matrix.copy(anchor.matrixWorld).invert();mount.add(head);anchor.userData.animationAnchor=true;}
      }
    }
    root.position.copy(position??barrier.outside);this.scene.add(root);
    const rig=new Rig(root),round=this.session.round;
    const speed=kind==='dog'?230:Math.min(210,34+round*8+(id%4)*5);
    const walk=kind==='dog'?'zombie_dog_run':kind==='nova'?(speed<90?'ai_zombie_quad_crawl':'ai_zombie_quad_crawl_run'):speed<70?(id%2?'ai_zombie_walk_v1':'ai_zombie_walk_v2'):speed<110?'ai_zombie_walk_fast_v1':speed<165?'ai_zombie_run_v1':'ai_zombie_sprint_v1';
    const attack=kind==='dog'?'zombie_dog_run_attack':kind==='nova'?'ai_zombie_quad_attack':'ai_zombie_attack_v1';
    if(this.anims[walk])rig.add('walk',this.anims[walk],true);
    if(this.anims[attack])rig.add('attack',this.anims[attack],true);
    const death=kind==='nova'?'ai_zombie_quad_death':kind==='dog'?'zombie_dog_death_front':'ai_zombie_death_v1';
    if(this.anims[death])rig.add('death',this.anims[death],true);
    rig.play('walk');rig.update(.01);
    // A spawn point without boards (custom maps): climb out of the ground (BO1's riser clips, mods/zombie-rise) instead
    // of appearing in place. Fast zombies use the quicker clip; both play sped up to about 3 s.
    const riseHere=kind==='zombie'&&barrier&&!barrier.boards?.length&&!barrier.walk&&this.riseClip(speed);   // walk: a walk-in spawn point (Der Eisendrache)
    root.traverse(o=>{if(o.isMesh)o.frustumCulled=false;});
    const z={id,kind,root,rig,speed,health:kind==='dog'?([400,900,1300,1600][Math.min(3,Math.max(0,this.session.dogRounds-1))]):zombieHealth(round,this.data.rules),state:barrier?'barricade':'chase',barrier,path:[],pathIndex:0,repath:0,attackLeft:0,attackDealt:false,tearLeft:1.1,stuck:0,lastPosition:root.position.clone(),growl:3+id%7};
    if(kind==='nova')z.health=Math.trunc(z.health*.75);
    if(riseHere)this.riseAt(z,barrier.inside);
    z.maxHealth=z.health;this.list.push(z);this.session.spawned++;return z;
  }
  // The riser clip for a zombie of this speed (mods/zombie-rise), or null when the clips aren't built.
  riseClip(speed){return this.anims[speed>=110?'ai_zombie_traverse_ground_climbout_fast':'ai_zombie_traverse_ground_v1_run']??this.anims.ai_zombie_traverse_ground_climbout_fast??null;}
  // Climb out of the ground at `at` (spawn points without boards, and zombies moved to the player when stuck).
  riseAt(z,at){
    const clip=z.kind==='zombie'&&this.riseClip(z.speed);
    if(!clip){z.root.position.copy(at);return false;}
    if(!z.rig.actions.rise)z.rig.add('rise',clip,true);
    const dur=3;z.rig.play('rise',false,(clip.duration??dur)/dur,0);z.rig.update(.01);
    z.root.position.copy(at);z.rise={y:at.y,dur};z.root.position.y-=50;z.state='rising';z.riseT=0;
    return true;
  }
  update(dt,player){
    const s=this.session;
    if(this.autoSpawn!==false&&s.phase==='fighting'&&s.spawned<s.total&&this.list.length<24){
      this.nextSpawn-=dt;
      if(this.nextSpawn<=0){
        const candidates=this.world.spawnBarriers(s).filter(b=>{if(b.free)return true;const p=this.world.path(b.inside,player);return p.length>1&&p.at(-1).distanceTo(player)<150;});
        if(candidates.length){
          const b=candidates[Math.floor(s.random()*candidates.length)],nova=s.power&&!s.dogRound&&s.spawned%5===4&&['foyer_zone','foyer2_zone','theater_zone','stage_zone','dining_zone'].includes(this.world.zoneAt(player.clone().add(new THREE.Vector3(0,35,0))));
          const nz=this.spawn(s.dogRound||nova?b.inside:null,s.dogRound||nova?null:b,s.dogRound?'dog':nova?'nova':'zombie');if(b.free&&nz)nz.free=true;
          this.nextSpawn=Math.max(.35,(this.data.rules.zombie_spawn_delay??2)*Math.pow(.95,s.round-1));
        }
        else this.nextSpawn=1;
      }
    }
    // Parkour (custom maps): while the player is on a surface the navmesh lacks, zombies on that surface walk freely.
    this.freeClock=(this.freeClock??0)-dt;
    if(this.freeClock<=0){this.freeClock=.3;this.freeMode=!!(this.world.offMesh&&this.world.playerFeet&&this.world.entry?.nearbySpawns&&this.world.offMesh(this.world.playerFeet));}
    for(const z of [...this.list]){
      z.rig.update(dt);
      if(z.ai){z.ai(dt,player);continue;}   // a map script drives this one (Der Eisendrache's Panzersoldat)
      z.growl-=dt;
      if(z.growl<0){this.onSound?.('growl',z.root.position);z.growl=6+s.random()*7;}
      if(z.state==='rising'){   // up out of the ground over the clip's first three quarters, facing the player
        z.riseT+=dt;const k=Math.min(1,z.riseT/z.rise.dur),e=1-(1-Math.min(1,k/.75))**2;z.root.position.y=z.rise.y-50*(1-e);
        z.root.rotation.y=Math.atan2(-(player.z-z.root.position.z),player.x-z.root.position.x);
        if(k>=1){z.state='chase';z.repath=0;z.rig.play('walk');}
        continue;
      }
      if(z.state==='barricade'){
        z.root.rotation.y=Math.atan2(-(z.barrier.inside.z-z.root.position.z),z.barrier.inside.x-z.root.position.x);
        z.tearLeft-=dt;
        if(z.barrier.count>0){z.rig.play('attack');if(z.tearLeft<=0){this.world.setBoards(z.barrier,z.barrier.count-1);z.tearLeft=1.1;this.onSound?.('board',z.root.position);}}
        else{z.state='entering';z.enterFrom=z.root.position.clone();z.enterTime=0;z.rig.play('walk');}
        continue;
      }
      if(z.state==='entering'){
        z.enterTime+=dt;const t=Math.min(1,z.enterTime/1.2);z.root.position.lerpVectors(z.enterFrom,z.barrier.inside,t);z.root.position.y+=Math.sin(t*Math.PI)*12;
        if(t===1){z.state='chase';z.repath=0;}continue;
      }
      // targetFor (optional, co-op) picks which player this zombie chases.
      const victim=this.targetFor?.(z,player)??{position:player},tp=victim.position;
      const lure=this.lureTarget?.(z),goal=lure??tp;
      const dist=z.root.position.distanceTo(tp),at=z.root.position.clone().add(new THREE.Vector3(0,z.kind==='dog'?25:45,0)),eye=tp.clone().add(new THREE.Vector3(0,40,0));
      if(z.state==='attack'){
        z.attackLeft-=dt;
        if(!z.attackDealt&&z.attackLeft<.62){z.attackDealt=true;if(!lure&&dist<76&&this.world.lineClear(at,eye))this.onDamage(z.kind==='dog'?40:z.kind==='nova'?45:50,z,victim);}
        if(z.attackLeft<=0){z.state='chase';z.rig.play('walk');}continue;
      }
      if(!lure&&dist<62&&Math.abs(z.root.position.y-tp.y)<50&&(victim.id?!victim.down:s.phase!=='reviving')&&this.world.lineClear(at,eye)){
        z.state='attack';z.attackLeft=1.15;z.attackDealt=false;z.rig.play('attack',false);continue;
      }
      if(!this.freeMode)z.free=false;
      const freeWalk=!!(this.freeMode&&z.free);
      if(freeWalk)this.walkFree(z,goal,dt);
      else{z.repath-=dt;
      if(z.repath<=0&&!z.path[z.pathIndex]?.hop){z.path=this.world.path(z.root.position,goal);z.pathIndex=1;z.repath=.55+(z.id%5)*.07;}}   // no replanning mid-hop
      const target=freeWalk?null:z.path[z.pathIndex];
      if(target?.hop){   // a traversal (custom maps' off-mesh links: fence hops, climbs, jump-downs): straight to its end, off the navmesh
        const d=target.clone().sub(z.root.position),len=d.length();
        if(len<8){z.root.position.copy(target);z.pathIndex++;}else{z.root.position.addScaledVector(d,Math.min(1,z.speed*1.2*dt/len));z.root.rotation.y=Math.atan2(-d.z,d.x);}
        z.blockT=0;
      }else if(target){
        const delta=target.clone().sub(z.root.position),horizontal=Math.hypot(delta.x,delta.z);
        if(horizontal<10){z.pathIndex++;}
        else{
          const next=z.root.position.clone().addScaledVector(delta,Math.min(1,z.speed*dt/horizontal));
          for(const other of this.list){if(other===z||other.state==='barricade')continue;const sep=next.clone().sub(other.root.position);sep.y=0;const d=sep.length();if(d<29&&d>.01)next.addScaledVector(sep,(29-d)/d*dt*2);}
          const safe=this.world.closest(next,{x:22,y:36,z:22});
          if(safe&&safe.distanceTo(next)<38){z.root.position.copy(safe);z.blockT=0;}
          else{   // the straight step leaves the navmesh (a doorway only a few cells wide): after a moment hop to the path point
            z.blockT=(z.blockT??0)+dt;
            if(z.blockT>.5&&horizontal<130){z.root.position.copy(target);z.blockT=0;z.pathIndex++;}
          }
          z.root.rotation.y=Math.atan2(-delta.z,delta.x);
        }
      }
      // On a custom map with gaps (parkour, moving platforms) a zombie that stops making progress is put back on the
      // player's side of the gap after a few seconds instead of standing at the edge.
      if(this.world.rescuePoint&&z.state==='chase'){
        z.probeT=(z.probeT??0)+dt;
        const below=this.freeMode&&z.root.position.y<(this.world.playerFeet?.y??1e9)-150;   // fell off the parkour
        if(z.probeT>(below?1:2.5)){
          z.probeT=0;const last=z.probePos??z.root.position.clone();z.probePos=z.root.position.clone();
          if((below||last.distanceTo(z.root.position)<6)&&dist>90){const p=this.world.rescuePoint(z.root.position,this.world.playerFeet??tp);if(p){this.riseAt(z,p);z.free=!!p.free;z.path=[];z.repath=0;z.probePos=null;}}
        }
      }
      if(!freeWalk&&!target&&this.freeMode&&dist>40&&z.state==='chase')this.walkFree(z,goal,dt);   // the last stretch to a spot the navmesh does not reach
      z.stuck+=dt;
      if(z.stuck>12){const moved=z.lastPosition.distanceTo(z.root.position);z.lastPosition.copy(z.root.position);z.stuck=0;if(moved<5&&dist>100){z.path=[];z.repath=0;z.stuckCount=(z.stuckCount??0)+1;if(z.stuckCount>=3){this.remove(z);s.spawned--;}}else z.stuckCount=0;}
    }
    for(const d of [...this.dead]){d.life-=dt;d.rig.update(dt);if(d.life<2)d.root.position.y-=dt*24;if(d.life<=0){d.root.removeFromParent();d.rig.mixer.uncacheRoot(d.root);disposeSkeletons(d.root);this.dead.splice(this.dead.indexOf(d),1);}}
    if(this.autoRounds!==false&&s.phase==='fighting'&&s.spawned>=s.total&&this.list.length===0){if(s.dogRound)this.onKill?.(null,'full_ammo',this.lastDogDeath??player);s.nextRound();this.nextSpawn=0;this.lastDogDeath=null;}
  }
  // Free walking on a platform: straight toward the goal, staying on whatever surface is underfoot (moving platforms carry them).
  walkFree(z,goal,dt){
    const pos=z.root.position,dx=goal.x-pos.x,dz=goal.z-pos.z,h=Math.hypot(dx,dz);
    z.root.rotation.y=Math.atan2(-dz,dx);
    if(z.leap){   // a hop across a gap: an arc to the landing spot
      const l=z.leap;l.t+=dt/l.dur;const k=Math.min(1,l.t);
      pos.lerpVectors(l.from,l.to,k);pos.y+=Math.sin(k*Math.PI)*34;
      if(k>=1){pos.copy(l.to);z.leap=null;}
      return;
    }
    const carry=this.world.carryDelta?.(pos);
    if(carry)pos.add(carry);
    const here=this.world.surfaceY(pos.x,pos.y,pos.z);
    if(here===null)pos.y-=400*dt;   // nothing underfoot: fall
    else if(here<pos.y)pos.y=Math.max(here,pos.y-400*dt);
    else if(here-pos.y<14)pos.y=here;
    if(h<=8||here===null)return;
    const step=Math.min(h,z.speed*dt);let ux=dx/h,uz=dz/h;
    for(const o of this.list){if(o===z||o.state==='barricade')continue;const sx=pos.x-o.root.position.x,sz=pos.z-o.root.position.z,d=Math.hypot(sx,sz);if(d<29&&d>.01){ux+=sx/d*(29-d)/29*1.5;uz+=sz/d*(29-d)/29*1.5;}}
    const n=Math.hypot(ux,uz)||1;ux/=n;uz/=n;
    const probe=new THREE.Ray(new THREE.Vector3(pos.x,pos.y+30,pos.z),new THREE.Vector3()),dir=probe.direction;
    for(const [mx,mz] of [[ux,uz],[ux,0],[0,uz]]){
      const l=Math.hypot(mx,mz);if(l<.01)continue;
      dir.set(mx/l,0,mz/l);if(this.world.raycast(probe,0,step+16))continue;   // a wall or a closed door is in the way
      const nx=pos.x+mx*step,nz=pos.z+mz*step,y=this.world.surfaceY(nx,pos.y,nz);
      if(y!==null&&y>pos.y-30&&y<pos.y+14){pos.set(nx,y,nz);return;}
    }
    // The way on is a gap: leap to the nearest surface ahead (up to 150 units, a little higher or much lower), toward the goal.
    const d0=Math.hypot(dx,dz)||1,fx=dx/d0,fz=dz/d0;
    for(let r=45;r<=150;r+=15){
      const lx=pos.x+fx*r,lz=pos.z+fz*r,y=this.world.surfaceY(lx,pos.y+30,lz);
      if(y!==null&&y>pos.y-90&&y<pos.y+45){z.leap={from:pos.clone(),to:new THREE.Vector3(lx,y,lz),t:0,dur:.45+r/320};return;}
    }
  }
  remove(z){z.root.removeFromParent();z.rig.mixer.uncacheRoot(z.root);disposeSkeletons(z.root);this.list.splice(this.list.indexOf(z),1);}
  hurt(z,damage,head=false,melee=false,cause='bullet',score=true){
    if(!this.list.includes(z))return;
    z.health-=this.session.effects.insta_kill>this.session.time?Math.max(damage,z.health):damage;
    this.onHit?.(z,head);
    if(z.health<=0){
      if(z.kind==='dog')this.lastDogDeath=z.root.position.clone();
      if(score)this.session.scoreHit(true,head,melee);else{this.session.kills++;this.session.killed++;}this.list.splice(this.list.indexOf(z),1);z.state='dead';z.life=4;z.rig.play('death',false);this.dead.push(z);z.gasDeath=z.kind==='nova'&&!melee&&cause==='bullet';this.onKill?.(z);
      if(this.dead.length>12){const old=this.dead.shift();old.root.removeFromParent();old.rig.mixer.uncacheRoot(old.root);disposeSkeletons(old.root);}
    }else if(score)this.session.scoreHit(false);
  }
  rayHit(ray,far){
    let best=null;
    for(const z of this.list){
      const base=z.root.position,headPos=this.headPosition(z);
      // z.hit {r, h, head}: a bigger enemy's body box half-width, height and head radius (the Panzersoldat)
      const headPoint=ray.intersectSphere(new THREE.Sphere(headPos,z.hit?.head??(z.kind==='dog'?12:10)),new THREE.Vector3()),hr=z.hit?.r??18;
      const bodyPoint=ray.intersectBox(new THREE.Box3(base.clone().add(new THREE.Vector3(-hr,4,-hr)),base.clone().add(new THREE.Vector3(hr,z.hit?.h??(z.kind==='zombie'?58:36),hr))),new THREE.Vector3());
      let head=!!headPoint;let point=headPoint??bodyPoint;if(!point)continue;
      if(headPoint&&bodyPoint&&bodyPoint.distanceTo(ray.origin)+12<headPoint.distanceTo(ray.origin)){point=bodyPoint;head=false;}
      const distance=point.distanceTo(ray.origin);if(distance>far||best&&best.distance<distance)continue;best={z,head,point,distance};
    }return best;
  }
  headPosition(z){z.root.updateMatrixWorld(true);const bone=z.root.getObjectByName('j_head');return bone?bone.getWorldPosition(new THREE.Vector3()):z.root.position.clone().add(new THREE.Vector3(0,z.kind==='zombie'?63:28,0));}
  nuke(onDeath){for(const z of [...this.list]){this.list.splice(this.list.indexOf(z),1);this.session.kills++;this.session.killed++;if(z.kind==='dog')this.lastDogDeath=z.root.position.clone();z.state='dead';z.gasDeath=false;z.life=3;z.rig.play('death',false);this.dead.push(z);onDeath(z);this.onKill?.(z);}}
  reset(){for(const z of [...this.list,...this.dead]){z.root.removeFromParent();z.rig.mixer.uncacheRoot(z.root);disposeSkeletons(z.root);}this.list=[];this.dead=[];this.nextSpawn=0;this.lastDogDeath=null;}
  snapshot(){return this.list.map(z=>({id:z.id,kind:z.kind,health:z.health,state:z.state,position:z.root.position.toArray(),pathLength:z.path.length,animation:z.rig.current}));}
}
