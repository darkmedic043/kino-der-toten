import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { Rig, loadModel, loadAnimation } from './animation.js';
import { zombieHealth } from './rules.js';
import { disposeSkeletons } from './runtime-assets.js';

const DOWN=new THREE.Vector3(0,-1,0);
// Steering: a zombie's heading turns at a capped rate (easing in over the last few degrees) instead of snapping to
// each new direction; yaw convention atan2(-dz, dx) (forward is +X).
const wrapAngle=a=>a-Math.PI*2*Math.round(a/(Math.PI*2));
const yawTo=(from,to)=>Math.atan2(-(to.z-from.z),to.x-from.x);
function turnYaw(from,to,rate,dt){const d=wrapAngle(to-from);return from+Math.sign(d)*Math.min(Math.abs(d),rate*dt,Math.abs(d)*Math.min(1,dt*9));}
const turnRate=z=>z.kind==='dog'?9:2.4+z.speed/55;   // rad/s: a shambler about 3, a sprinter about 6
const NEAR_SPAWN=2000,FAR_CHASE=2500;   // custom maps: spawn points within this walk of the player; a chaser further away out of sight respawns
const pathLength=(p,from=0)=>{let d=0;for(let i=from+1;i<p.length;i++)d+=p[i].distanceTo(p[i-1]);return d;};
// BO1's traversal clips (mods/zombie-rise; vaults in order of preference) and their root motion (`delta`, x forward and
// z up per key, from .tools/xanim_to_json.mjs) as curves of the clip's time 0..1: f forward share, u rise share
const VAULTS=['ai_zombie_traverse_v5','ai_zombie_traverse_v7','ai_zombie_traverse_v1'];
function deltaCurve(d){
  if(d._curve)return d._curve;const {frames,values}=d.delta,n=frames.length,end=Math.max(1,frames[n-1]);
  const fwd=values[(n-1)*3]||1,up=values[(n-1)*3+2],t=[],f=[],u=[];
  for(let i=0;i<n;i++){t.push(frames[i]/end);f.push(Math.max(0,values[i*3]/fwd));u.push(Math.abs(up)>5?values[i*3+2]/up:0);}
  // where the move happens along the clip's forward travel: a drop's fall starts, a climb leaves the ground (the vault's
  // top is about half way)
  const k=u.findIndex(x=>x>.05);
  return d._curve={t,f,u,fwd,up,at:Math.abs(up)>5&&k>=0?f[k]:.45};
}
function curveAt(c,a,k){const t=c.t;let i=1;while(i<t.length-1&&t[i]<k)i++;const w=Math.min(1,Math.max(0,(k-t[i-1])/((t[i]-t[i-1])||1)));return a[i-1]+(a[i]-a[i-1])*w;}

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
  // Spawn points for the next zombie, [{b: barrier, len}]. Custom maps (2026-10-29): the ones nearest `player` by walking
  // distance (len), as BO's zones spawn around the player; all reachable points were used before, and in Nuketown's lab 56
  // qualified, most 5,000-9,000 units of walking away on the surface, so zombies took a minute or more to arrive.
  spawnChoices(player){
    const near=!!this.world.entry;let out=[];
    for(const b of this.world.spawnBarriers(this.session)){
      if(b.free){out.push({b,len:0});continue;}
      const p=this.world.path(b.inside,player);if(p.length>1&&p.at(-1).distanceTo(player)<150)out.push({b,len:near?pathLength(p):0});
    }
    if(near&&out.length>3){out.sort((a,c)=>a.len-c.len);const cap=Math.max(NEAR_SPAWN,out[0].len+1200);out=out.filter((c,i)=>i<3||c.len<=cap);}
    return out;
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
    // map entry zombieWalls (custom maps): traversals arc over what is in their way, and the shortcut steps below (the
    // headway rescue, the step off the navmesh) only go where a line at knee and chest height is clear of walls and clip
    const s=this.session,walls=!!this.world.entry?.zombieWalls;
    if(this.autoSpawn!==false&&s.phase==='fighting'&&s.spawned<s.total&&this.list.length<24){
      this.nextSpawn-=dt;
      if(this.nextSpawn<=0){
        const candidates=this.spawnChoices(player).map(c=>c.b);
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
        z.root.rotation.y=turnYaw(z.root.rotation.y,yawTo(z.root.position,player),2.5,dt);
        if(k>=1){z.state='chase';z.repath=0;z.rig.play('walk');}
        continue;
      }
      if(z.state==='barricade'){
        z.root.rotation.y=turnYaw(z.root.rotation.y,yawTo(z.root.position,z.barrier.inside),4,dt);
        z.tearLeft-=dt;
        if(z.barrier.count>0){z.rig.play('attack');if(z.tearLeft<=0){this.world.setBoards(z.barrier,z.barrier.count-1);z.tearLeft=1.1;this.onSound?.('board',z.root.position);}}
        else{z.state='entering';z.enterFrom=z.root.position.clone();z.enterTime=0;
          // over the sill with BO1's window vault when the clips are built (mods/zombie-rise), else a little hop
          const v=this.hopClip(z,0,40),rate=Math.min(1.8,Math.max(1,.85+z.speed/220));
          if(v){if(!z.rig.actions[v])z.rig.add(v,this.anims[v],true);z.rig.play(v,false,rate,.15);z.enter={c:deltaCurve(this.anims[v]),dur:this.anims[v].duration/rate};}
          else{z.enter=null;z.rig.play('walk');}}
        continue;
      }
      if(z.state==='entering'){
        const e=z.enter;z.enterTime+=dt;const t=Math.min(1,z.enterTime/(e?.dur??1.2));
        z.root.position.lerpVectors(z.enterFrom,z.barrier.inside,e?curveAt(e.c,e.c.f,t):t);if(!e)z.root.position.y+=Math.sin(t*Math.PI)*12;
        if(t===1){z.state='chase';z.repath=0;if(e)z.rig.play('walk',true,1,.2);z.enter=null;}continue;
      }
      // targetFor (optional, co-op) picks which player this zombie chases.
      const victim=this.targetFor?.(z,player)??{position:player},tp=victim.position;
      const lure=this.lureTarget?.(z),goal=lure??tp;
      const dist=z.root.position.distanceTo(tp),at=z.root.position.clone().add(new THREE.Vector3(0,z.kind==='dog'?25:45,0)),eye=tp.clone().add(new THREE.Vector3(0,40,0));
      if(z.state==='attack'){
        z.attackLeft-=dt;
        const face=yawTo(z.root.position,tp);
        if(!z.attackDealt)z.root.rotation.y=turnYaw(z.root.rotation.y,face,turnRate(z)*.6,dt);   // tracks the victim through the wind-up only: a player who circles it in time dodges the swipe
        if(!z.attackDealt&&z.attackLeft<.62){z.attackDealt=true;if(!lure&&dist<76&&Math.abs(wrapAngle(face-z.root.rotation.y))<1.3&&this.world.lineClear(at,eye))this.onDamage(z.kind==='dog'?40:z.kind==='nova'?45:50,z,victim);}
        if(z.attackLeft<=0){z.state='chase';z.rig.play('walk');}continue;
      }
      if(!lure&&!z.hop&&dist<62&&Math.abs(z.root.position.y-tp.y)<50&&(victim.id?!victim.down:s.phase!=='reviving')&&this.world.lineClear(at,eye)){
        const off=wrapAngle(yawTo(z.root.position,tp)-z.root.rotation.y);
        if(Math.abs(off)>.9){z.root.rotation.y=turnYaw(z.root.rotation.y,z.root.rotation.y+off,turnRate(z),dt);z.moveYaw=z.root.rotation.y;z.vel=(z.vel??0)*(1-Math.min(1,dt*6));continue;}   // turn to face it first
        z.state='attack';z.vel=0;z.attackLeft=1.15;z.attackDealt=false;z.rig.play('attack',false);continue;
      }
      if(!this.freeMode)z.free=false;
      const freeWalk=!!(this.freeMode&&z.free);
      if(freeWalk)this.walkFree(z,goal,dt);
      else{z.repath-=dt;
      if(z.repath<=0&&!z.hop&&!z.path[z.pathIndex]?.hop){z.path=this.world.path(z.root.position,goal);z.pathIndex=1;z.repath=.55+(z.id%5)*.07;}}   // no replanning mid-hop
      // held in place: under 12 units of headway in 1.2 s while chasing with a path (navmesh snapping keeps a zombie on its
      // own patch where the navmesh breaks into fragments, a spiral stair's steps; each replan sends it back to the first
      // corner): step to the first path point more than 25 away, if within 130 (the hotel spiral needs 118; crowds stall too: a short shuffle at worst)
      if(!freeWalk&&z.state==='chase'&&z.path.length>1){
        z.progT=(z.progT??0)+dt;z.progAt??=z.root.position.clone();
        if(z.progT>1.2){
          if(z.root.position.distanceTo(z.progAt)<12&&dist>100){const far=z.path.slice(z.pathIndex).find(p=>p.distanceTo(z.root.position)>25);
            if(far&&Math.hypot(far.x-z.root.position.x,far.z-z.root.position.z)<130){
              if(!walls||this.walkClear(z.root.position,far)){z.root.position.copy(far);z.pathIndex=z.path.indexOf(far)+1;}
              else{z.pathIndex=z.path.indexOf(far);this.hopOver(z,far,dt);}}}   // pinned against a wall the navmesh steps over: climb it
          z.progAt.copy(z.root.position);z.progT=0;
        }
      }
      const target=freeWalk?null:z.hop?.to??z.path[z.pathIndex];
      if(target?.hop||z.hop){   // a traversal (custom maps' off-mesh links: fence hops, climbs, jump-downs): straight to its end, off the navmesh
        if(walls)this.hopOver(z,target,dt);
        else{const d=target.clone().sub(z.root.position),len=d.length();
          if(len<8){z.root.position.copy(target);z.pathIndex++;}else{z.root.position.addScaledVector(d,Math.min(1,z.speed*1.2*dt/len));z.root.rotation.y=turnYaw(z.root.rotation.y,Math.atan2(-d.z,d.x),turnRate(z)*1.5,dt);}}
        z.blockT=0;z.moveYaw=z.root.rotation.y;
      }else if(target){
        const delta=target.clone().sub(z.root.position),horizontal=Math.hypot(delta.x,delta.z);
        // round corners: move on to the next path point a little early (not before a traversal, whose start must be reached)
        const after=z.path[z.pathIndex+1];
        if(horizontal<10||(after&&!after.hop&&horizontal<24)){z.pathIndex++;z.wallHits=0;}
        else{
          // steer: the walking direction turns toward the path point at a capped rate (faster than the body, so it holds the
          // navmesh), the pace drops in a sharp turn, and speed builds up and dies down instead of switching on and off
          const want=Math.atan2(-delta.z,delta.x),rate=turnRate(z);
          z.moveYaw=z.moveYaw==null?z.root.rotation.y:turnYaw(z.moveYaw,want,rate*1.7,dt);
          if(horizontal<40)z.moveYaw=want;   // close in, aim straight (no orbiting a point it can't turn onto)
          const err=Math.abs(wrapAngle(want-z.moveYaw)),pace=Math.max(.3,Math.cos(Math.min(err,1.4)));
          z.vel=(z.vel??0)+(z.speed*pace-(z.vel??0))*Math.min(1,dt*(z.vel>z.speed*pace?6:3));
          const stepLen=Math.min(horizontal,z.vel*dt),k=stepLen/horizontal;
          const next=z.root.position.clone();next.x+=Math.cos(z.moveYaw)*stepLen;next.z-=Math.sin(z.moveYaw)*stepLen;next.y+=delta.y*k;
          for(const other of this.list){if(other===z||other.state==='barricade')continue;const sep=next.clone().sub(other.root.position);sep.y=0;const d=sep.length();if(d<29&&d>.01)next.addScaledVector(sep,(29-d)/d*dt*2);}
          let safe=this.world.closest(next,{x:22,y:36,z:22});
          const gain=q=>horizontal-Math.hypot(q.x-target.x,q.z-target.z),wantStep=stepLen*Math.cos(err);
          if(safe&&wantStep>.5&&gain(safe)<wantStep*.5)   // the snap held it on the ledge it stands on (a curb 15 above the street is the nearest polygon in 3D, Nuketown's spawn_1): try the surface a step below or above
            for(const dy of [-24,24]){const q=this.world.closest({x:next.x,y:next.y+dy,z:next.z},{x:22,y:16,z:22});if(q&&gain(q)>Math.max(gain(safe),wantStep*.5)&&Math.abs(q.y-z.root.position.y)<30){safe=q;break;}}
          if(safe&&safe.distanceTo(next)<38){z.root.position.copy(safe);z.blockT=0;}
          else{   // the straight step leaves the navmesh (a doorway only a few cells wide): after a moment hop to the path point
            z.blockT=(z.blockT??0)+dt;
            const on=z.blockT>.3&&horizontal>=130&&this.world.closest(z.root.position,{x:80,y:60,z:80});   // standing off the navmesh (a spawn point beside it, Nuketown's spawn_16 34 away): walk onto it
            if(on&&Math.hypot(on.x-z.root.position.x,on.z-z.root.position.z)>8&&(!walls||this.walkClear(z.root.position,on))){const d=on.clone().sub(z.root.position);z.root.position.addScaledVector(d,Math.min(1,z.speed*dt/d.length()));}
            else if(z.blockT>.5&&horizontal<130){
              if(!walls||this.walkClear(z.root.position,target)){z.root.position.copy(target);z.pathIndex++;}
              else if((z.wallHits=(z.wallHits??0)+1)<2)z.repath=0;   // a wall between: plan again from here
              else{z.wallHits=0;this.hopOver(z,target,dt);}   // the same corner again (a low wall the navmesh steps over): climb it
              z.blockT=0;}
          }
          z.root.rotation.y=turnYaw(z.root.rotation.y,z.moveYaw,rate,dt);
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
      // a straggler (custom maps, 2026-10-29, after BO3's zombie cleanup): a chaser over FAR_CHASE units of walking from the
      // player, with the player out of its sight for 8 s (4 s once the round's last zombies are out), goes back into the
      // round's count and spawns again near the player. The last zombies used to wander the whole map toward a player in
      // Nuketown's lab or a far house while the round waited on them
      if(this.world.entry&&!freeWalk&&!lure&&!z.hop&&z.state==='chase'){
        z.farClock=(z.farClock??0)-dt;
        if(z.farClock<=0){z.farClock=1;
          const next=z.path[z.pathIndex],left=next?z.root.position.distanceTo(next)+pathLength(z.path,z.pathIndex):0;
          z.farT=left>FAR_CHASE&&!this.world.lineClear(at,eye)?(z.farT??0)+1:0;
          if(z.farT>=(s.spawned>=s.total?4:8)){z.farT=0;const near=this.spawnChoices(tp);   // only when every spawn it could take is nearer
            if(near.length&&Math.max(...near.map(c=>c.len))<left-500){this.remove(z);s.spawned--;continue;}}
        }
      }
      if(!freeWalk&&!target&&this.freeMode&&dist>40&&z.state==='chase')this.walkFree(z,goal,dt);   // the last stretch to a spot the navmesh does not reach
      z.stuck+=dt;
      if(z.stuck>12){const moved=z.lastPosition.distanceTo(z.root.position);z.lastPosition.copy(z.root.position);z.stuck=0;if(moved<5&&dist>100){z.path=[];z.repath=0;z.stuckCount=(z.stuckCount??0)+1;if(z.stuckCount>=3){this.remove(z);s.spawned--;}}else z.stuckCount=0;}
    }
    for(const d of [...this.dead]){d.life-=dt;d.rig.update(dt);if(d.life<2)d.root.position.y-=dt*24;if(d.life<=0){d.root.removeFromParent();d.rig.mixer.uncacheRoot(d.root);disposeSkeletons(d.root);this.dead.splice(this.dead.indexOf(d),1);}}
    if(this.autoRounds!==false&&s.phase==='fighting'&&s.spawned>=s.total&&this.list.length===0){if(s.dogRound)this.onKill?.(null,'full_ammo',this.lastDogDeath??player);s.nextRound();this.nextSpawn=0;this.lastDogDeath=null;}
  }
  // zombieWalls: nothing solid (map, doors, clip) on the line between two feet positions at knee or chest height
  walkClear(a,b,heights=[24,50]){
    const clip=this.world.clipCollision;
    for(const h of heights){const p=a.clone(),q=b.clone();p.y+=h;q.y+=h;if(!this.world.lineClear(p,q))return false;
      if(clip){const v=q.clone().sub(p),d=v.length();if(d>1&&clip.rayIntersect(new THREE.Ray(p,v.normalize()),0,d))return false;}}
    return true;
  }
  // zombieWalls: a traversal as an arc over whatever stands in its way (a fence, a ledge's lip) instead of a straight
  // line through it. The obstacle profile is read once per hop: the surface under points every ~3 units along it (map
  // and doors, rays down from 90 over the line); the arc clears the highest by 6 and never dips below the profile.
  // The traversal clip for a hop (dy: the far end's height over the near one, top: what is in the way, over the straight
  // line): a vault over a fence or sill, a jump down, the climb up a ledge; null for dogs and crawlers, a hop with
  // nothing to get over, or when the clips aren't built
  hopClip(z,dy,top){
    if(z.kind!=='zombie')return null;const a=this.anims,has=k=>a[k]?.delta?k:null;
    if(dy<-30)return has(-dy<56?'ai_zombie_jump_down_40':-dy<84?'ai_zombie_jump_down_72':'ai_zombie_jump_down_96');
    if(dy>40)return has('ai_zombie_jump_up_2_climb');
    if(top>10){const v=VAULTS.filter(has);return v.length?v[z.id%v.length]:null;}
    return null;
  }
  hopOver(z,target,dt){
    const pos=z.root.position;let h=z.hop;
    if(h?.to!==target){
      const from=pos.clone(),len=Math.max(1,from.distanceTo(target)),n=Math.min(60,Math.max(4,Math.ceil(len/3))),floor=[],dy=target.y-from.y;
      let arc=0,top=0,topT=.5,edgeT=null;
      const lift=(t,y,ly)=>{const k=Math.min(Math.max(t,.1),.9);if(y>ly){arc=Math.max(arc,(y-ly+6)/(4*k*(1-k)));if(y-ly>top){top=y-ly;topT=t;}}};
      for(let i=0;i<=n;i++){
        const t=i/n,p=from.clone().lerp(target,t),hit=this.world.raycast(new THREE.Ray(new THREE.Vector3(p.x,p.y+90,p.z),DOWN),0,110),y=hit?p.y+90-hit.distance:-Infinity;
        floor.push(y);if(i>0&&i<n)lift(t,y,p.y);
        if(edgeT==null&&i>0&&isFinite(y)&&(dy<-30?y<from.y-20:dy>40&&y>from.y+20))edgeT=t;
      }
      // props with no collision of their own (Nuketown's fences: full clip, far taller, stands in for them): the top the
      // builder measured across the link (extras.over), the right way round
      const tr=target.hop,o=tr?.over;
      if(o){const t=target.distanceTo(tr.to)<=target.distanceTo(tr.from)?o[0]:1-o[0];lift(t,o[1],from.y+(target.y-from.y)*t);}
      h=z.hop={to:target,from,len,arc:Math.min(arc,110),floor,t:0};
      // with a clip: walk up to the obstacle, play the clip (its own forward and up motion, stretched to fit), walk on
      const key=this.hopClip(z,dy,top);
      if(key){
        const d=this.anims[key],c=deltaCurve(d),run=Math.max(1,Math.hypot(target.x-from.x,target.z-from.z)),cf=Math.min(run,Math.max(20,c.fwd));
        const at=(dy<-30||dy>40?edgeT??(dy<0?.5:.3):topT)*run;
        const rate=Math.min(1.8,Math.max(1,.85+z.speed/220))*(dy>40?1.5:1);
        if(!z.rig.actions[key])z.rig.add(key,d,true);
        Object.assign(h,{key,c,run,cf,a:Math.min(Math.max(0,at-c.at*cf),run-cf),dur:d.duration/rate,rate,s:0,phase:0,k:0,climb:Math.max(0,top-40)});
      }
    }
    if(h.key)return this.hopClipStep(z,h,target,dt);
    h.t=Math.min(1,h.t+z.speed*1.2*dt/h.len);
    if(h.t>=1){pos.copy(target);z.pathIndex++;z.hop=null;return;}
    pos.lerpVectors(h.from,target,h.t);
    const f=h.t*(h.floor.length-1),i=Math.floor(f),under=Math.max(h.floor[i],h.floor[Math.min(i+1,h.floor.length-1)]);
    pos.y=Math.max(pos.y+4*h.arc*h.t*(1-h.t),under+1);
    z.root.rotation.y=turnYaw(z.root.rotation.y,Math.atan2(-(target.z-h.from.z),target.x-h.from.x),turnRate(z)*1.5,dt);z.moveYaw=z.root.rotation.y;
  }
  // A hop with a clip: phase 0 walks to where the clip starts (h.a along the link), 1 plays it, 2 walks off the end
  hopClipStep(z,h,target,dt){
    const pos=z.root.position,{from,run,c}=h;
    const floorAt=(s,ref)=>{const f=h.floor[Math.round(Math.min(1,s/run)*(h.floor.length-1))];return isFinite(f)&&Math.abs(f-ref)<30?f:ref;};
    if(h.phase===0){h.s=Math.min(h.a,h.s+z.speed*dt);if(h.s>=h.a){h.phase=1;h.y0=pos.y;h.y1=floorAt(h.a+h.cf,target.y);z.rig.play(h.key,false,h.rate,.15);}}
    if(h.phase===1){
      h.k=Math.min(1,h.k+dt/h.dur);const f=curveAt(c,c.f,h.k);h.s=h.a+h.cf*f;
      // a drop or climb follows the clip's own rise and fall; a vault stays level (the body clears a sill of about 40 in
      // the pose itself) and is lifted only over anything taller
      const y=Math.abs(c.up)>5?h.y0+(h.y1-h.y0)*curveAt(c,c.u,h.k):h.y0+(h.y1-h.y0)*f;
      pos.lerpVectors(from,target,h.s/run);pos.y=y+h.climb*Math.sin(Math.PI*Math.min(1,Math.max(0,(f-.1)/.8)));
      if(h.k>=1){h.phase=2;z.rig.play('walk',true,1,.2);}
    }else{
      if(h.phase===2)h.s=Math.min(run,h.s+z.speed*dt);
      pos.lerpVectors(from,target,h.s/run);pos.y=floorAt(h.s,h.phase===0?from.y:target.y);
      if(h.phase===2&&h.s>=run){pos.copy(target);z.pathIndex++;z.hop=null;}
    }
    z.root.rotation.y=turnYaw(z.root.rotation.y,Math.atan2(-(target.z-from.z),target.x-from.x),turnRate(z)*2,dt);z.moveYaw=z.root.rotation.y;
  }
  // Free walking on a platform: straight toward the goal, staying on whatever surface is underfoot (moving platforms carry them).
  walkFree(z,goal,dt){
    const pos=z.root.position,dx=goal.x-pos.x,dz=goal.z-pos.z,h=Math.hypot(dx,dz);
    z.root.rotation.y=turnYaw(z.root.rotation.y,Math.atan2(-dz,dx),turnRate(z),dt);z.moveYaw=z.root.rotation.y;
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
  rayHit(ray,far,skip){   // skip: zombies a piercing bullet has already gone through (engine.js def.pierce)
    let best=null;
    for(const z of this.list){
      if(skip?.has(z))continue;
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
