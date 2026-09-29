// Weighty movement plus prone, slide and mantle.
// - Heavier gravity (same jump height), momentum, reduced steering in real jumps.
// - Stairs: walking off a step snaps down onto the next one (no tiny falls,
//   no lost control, no landing jolts on every step).
// - Prone (Z): lie down; slow crawl, low profile. Jump or Z again to get up.
// - Slide: press crouch while sprinting.
// - Mantle: jump at a ledge up to chest height to climb over it.
// - First-person head bob, landing dip (real falls only) and strafe roll.
import * as THREE from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { settings } from '../../settings.js';

export default function setup(api){
  const {player,camera,host,data,session}=api,m=data.rules.movement??{};
  const set=(key,value)=>{if(value!==undefined)player[key]=value;};
  const original={groundAcceleration:player.groundAcceleration};   // the game's own (snappy) value
  set('gravity',m.gravity);set('groundAcceleration',m.groundAcceleration);set('airAcceleration',m.airAcceleration);
  if(m.gravity&&m.jumpHeight)player.jumpSpeed=Math.sqrt(2*player.gravity*m.jumpHeight);
  const base={groundAcceleration:player.groundAcceleration,airAcceleration:player.airAcceleration,crouchHeight:player.crouchHeight,crouchEyeHeight:player.crouchEyeHeight,crouchSpeed:player.crouchSpeed};
  const PRONE={height:Math.max(player.radius*2+2,30),eye:17,speed:45};
  const up=new THREE.Vector3(0,1,0),down=new THREE.Vector3(0,-1,0);
  const state={prone:false,sliding:false,mantling:null,airTime:0,jumped:false,grounded:true,stairs:0};
  window.kino.movement={player,settings:m,state};

  const ray=(origin,dir,far)=>player.worldOctree.rayIntersect?.(new THREE.Ray(origin,dir),0,far);
  const normalY=hit=>hit.normal?.y??hit.triangle?.getNormal(new THREE.Vector3()).y??1;
  const feet=()=>player.getFeetPosition().clone();
  const forwardDir=()=>new THREE.Vector3(-Math.sin(camera.rotation.y),0,-Math.cos(camera.rotation.y));
  const moveFeet=target=>{const d=target.clone().sub(feet());player.collider.translate(d);};
  const capsuleAt=(feetPos,height)=>{const c=new Capsule(new THREE.Vector3(),new THREE.Vector3(),player.radius);
    c.start.set(feetPos.x,feetPos.y+player.radius,feetPos.z);c.end.set(feetPos.x,feetPos.y+Math.max(.01,height-2*player.radius)+player.radius,feetPos.z);return c;};
  const fits=(feetPos,height)=>{const hit=player.worldOctree.capsuleIntersect(capsuleAt(feetPos,height));return !hit||hit.depth<=player.skin*2;};

  // ---- Prone ------------------------------------------------------------------------
  function setProne(on){
    if(on===state.prone)return;
    if(on){
      state.prone=true;state.sliding=false;
      Object.assign(player,{crouchHeight:PRONE.height,crouchEyeHeight:PRONE.eye,crouchSpeed:PRONE.speed});
      if(player.crouched)player._setCapsuleHeight(PRONE.height);
    }else{
      if(!player._canUseHeight(base.crouchHeight)){api.toast('No room to get up',1.5);return;}
      state.prone=false;Object.assign(player,{crouchHeight:base.crouchHeight,crouchEyeHeight:base.crouchEyeHeight,crouchSpeed:base.crouchSpeed});
      if(player.crouched)player._setCapsuleHeight(base.crouchHeight);
    }
  }
  addEventListener('keydown',e=>{
    if(e.code!=='KeyZ'||e.repeat||!window.kino.debug.getState().active||['reviving','gameover'].includes(session.phase))return;
    if(state.mantling)return;setProne(!state.prone);
  });

  // ---- Mantle -----------------------------------------------------------------------------
  // A wall in front at waist height, a walkable top between step height and
  // chest height, and room to stand on it.
  function findLedge(){
    const f=feet(),dir=forwardDir();
    const wall=ray(f.clone().addScaledVector(up,26),dir,player.radius+32);
    if(!wall||Math.abs(normalY(wall))>.5)return null;
    const probe=f.clone().addScaledVector(dir,wall.distance+player.radius+6).addScaledVector(up,80);
    const top=ray(probe,down,80-(player.stepHeight+2));
    if(!top)return null;
    const topY=probe.y-top.distance,rise=topY-f.y;
    if(rise<=player.stepHeight+1||rise>74)return null;
    const target=new THREE.Vector3(probe.x,topY+player.skin*2,probe.z);
    if(!fits(target,player.height))return null;
    return {from:f,top:new THREE.Vector3(f.x,topY+4,f.z).addScaledVector(dir,4),target,t:0,duration:.28+rise/260};
  }

  // ---- Wrapped controller update ----------------------------------------------------------
  const originalUpdate=player.update.bind(player);
  let prevCrouch=false,prevJump=false,slideT=0;
  player.update=(dt,input)=>{
    const down_=['reviving','gameover'].includes(session.phase);
    if(down_){if(state.prone)setProne(false);state.sliding=false;state.mantling=null;}
    // Mantling: a short scripted climb that overrides movement.
    if(state.mantling){
      const mt=state.mantling;mt.t=Math.min(1,mt.t+dt/mt.duration);
      const k=mt.t,rise=Math.min(1,k/.6),e=rise*rise*(3-2*rise),push=Math.max(0,(k-.45)/.55);
      const pos=mt.from.clone().lerp(mt.top,e);pos.lerp(mt.target,push*push*(3-2*push));
      moveFeet(pos);player.velocity.set(0,0,0);player._syncCamera();
      if(mt.t>=1){state.mantling=null;player.onFloor=player.grounded=true;player._resolveCollisions?.();const d=forwardDir();player.velocity.set(d.x*90,0,d.z*90);}
      return player.state;
    }
    if(input&&!down_){
      input={...input};
      const crouch=!!input.crouch,jumpNow=!!(input.jump||input.jumpPressed),horizontal=Math.hypot(player.velocity.x,player.velocity.z);
      // Jump pressed near a ledge: mantle instead (also works mid-air).
      if(jumpNow&&!prevJump||(!player.onFloor&&input.jump&&input.forward>0&&state.airTime>.08)){
        const ledge=!state.prone&&findLedge();
        if(ledge){state.mantling=ledge;state.sliding=false;prevJump=jumpNow;player.velocity.set(0,0,0);return player.state;}
      }
      // Jump while prone stands up instead.
      if(state.prone&&jumpNow&&!prevJump){setProne(false);input.jump=false;input.jumpPressed=false;}
      else if(jumpNow&&!prevJump&&(player.onFloor||state.airTime<.1))state.jumped=true;
      // Slide: crouch pressed while sprinting on the ground.
      if(crouch&&!prevCrouch&&!state.prone&&player.onFloor&&input.sprint&&horizontal>220){
        state.sliding=true;slideT=0;const boost=Math.min(460,horizontal*1.5)/Math.max(horizontal,1);
        player.velocity.x*=boost;player.velocity.z*=boost;
      }
      if(state.sliding){
        slideT+=dt;input.sprint=false;input.crouch=true;
        // Carry momentum: low friction, little steering.
        player.groundAcceleration=260;input.forward=Math.max(0,input.forward??0);
        if(slideT>.9||horizontal<120||(!player.onFloor&&state.airTime>.3)||jumpNow){state.sliding=false;}
      }
      // On stairs (ground flickering without a jump) use the game's original acceleration,
      // so every step riser doesn't cost speed.
      if(!state.sliding)player.groundAcceleration=state.stairs>0?original.groundAcceleration:base.groundAcceleration;
      if(state.prone){input.crouch=true;input.sprint=false;}
      prevCrouch=crouch;prevJump=jumpNow;
    }
    // Small drops (stairs) keep full ground control; only real jumps and falls steer weakly.
    player.airAcceleration=!state.jumped&&state.airTime<.2?original.groundAcceleration:base.airAcceleration;
    const wasGrounded=player.onFloor;
    const result=originalUpdate(dt,input);
    // Stairs: stepping off an edge snaps down onto the step below.
    if(wasGrounded&&!player.onFloor&&!state.jumped&&player.velocity.y<=0){
      const hit=ray(feet().addScaledVector(up,2),down,player.stepHeight+4);
      if(hit&&normalY(hit)>.6){moveFeet(feet().addScaledVector(down,Math.max(0,hit.distance-2-player.skin)));player.onFloor=player.grounded=true;player.velocity.y=0;player._syncCamera();}
    }
    if(player.onFloor!==wasGrounded&&!state.jumped)state.stairs=.35;state.stairs=Math.max(0,state.stairs-dt);
    if(player.onFloor){state.airTime=0;state.jumped=false;}else state.airTime+=dt;
    return result;
  };
  host.on('reset',()=>{setProne(false);state.sliding=false;state.mantling=null;});

  // ---- Camera feel ------------------------------------------------------------------------------
  let phase=0,dip=0,dipV=0,roll=0,wasGrounded=true,lastVy=0,bobBlend=0,fallTime=0,crouchOffset=0;
  let lastEye=player._eyeHeight;
  host.on('update',dt=>{
    const eye=player._eyeHeight;if(eye!==lastEye){crouchOffset+=lastEye-eye;lastEye=eye;}
    if(!dt||['reviving','gameover'].includes(session.phase))return;
    const st=player.state,v=st.velocity,speed=Math.hypot(v.x,v.z),grounded=st.grounded;
    // Landing dip only after a real fall (not stairs).
    if(!grounded)fallTime+=dt;
    if(grounded&&!wasGrounded&&fallTime>.22&&lastVy<-260)dipV-=Math.min(260,-lastVy*.32)*(m.landingDip??1);
    if(grounded)fallTime=0;wasGrounded=grounded;lastVy=v.y;
    dipV+=(-dip*170-dipV*17)*dt;dip+=dipV*dt;
    const bob=settings.headBob===false?0:(m.headBob??1)*(state.prone?.4:state.sliding?0:1);
    bobBlend+=((grounded?Math.min(1,speed/190):0)-bobBlend)*Math.min(1,dt*6);
    if(speed>10&&grounded)phase+=dt*(4.2+speed/32)*(state.prone?.6:1);
    const step=Math.abs(Math.sin(phase));
    const y=(-((1-step)**2)*1.7+.6)*bob*bobBlend;
    const side=Math.cos(phase)*.9*bob*bobBlend;
    const right=v.x*Math.cos(camera.rotation.y)-v.z*Math.sin(camera.rotation.y);
    const targetRoll=(-right/190)*.018*bob+(state.sliding?.07:0)+(state.mantling?-.05:0);
    roll+=(targetRoll-roll)*Math.min(1,dt*7);
    // Ease the eye between standing / crouch / prone heights instead of popping.
    crouchOffset+=(0-crouchOffset)*Math.min(1,dt*10);
    camera.position.y+=y+dip+crouchOffset;
    camera.position.x+=Math.cos(camera.rotation.y)*side;camera.position.z-=Math.sin(camera.rotation.y)*side;
    camera.rotation.z=roll+Math.cos(phase)*.004*bob*bobBlend;
  });
}
