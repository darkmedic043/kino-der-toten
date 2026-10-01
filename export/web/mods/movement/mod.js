// Weighty movement plus prone, slide and mantle.
// - Heavier gravity (same jump height), momentum, reduced steering in real jumps.
// - Stairs: walking off a step snaps down onto the next one (no tiny falls,
//   no lost control, no landing jolts on every step).
// - One crouch button (C): tap to crouch, hold to go prone, tap while
//   sprinting to slide. Jump stands up from crouch or prone.
// - Mantle: jump at a ledge up to chest height to climb over it.
// - First-person head bob, landing dip (real falls only) and strafe roll.
// - Black Ops 7 omnimovement: sprint and slide in any direction, dive (hold
//   crouch while sprinting), wall jump (jump into a wall while airborne).
//   First-person gun and hand animation for all of it is in fp.js.
import * as THREE from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { settings } from '../../settings.js';
import { setupFirstPerson } from './fp.js';

export default function setup(api){
  const {player,camera,host,data,session}=api,m=data.rules.movement??{};
  const set=(key,value)=>{if(value!==undefined)player[key]=value;};
  const original={groundAcceleration:player.groundAcceleration};   // the game's own (snappy) value
  set('gravity',m.gravity);set('groundAcceleration',m.groundAcceleration);set('airAcceleration',m.airAcceleration);
  if(m.gravity&&m.jumpHeight)player.jumpSpeed=Math.sqrt(2*player.gravity*m.jumpHeight);
  const base={groundAcceleration:player.groundAcceleration,airAcceleration:player.airAcceleration,crouchHeight:player.crouchHeight,crouchEyeHeight:player.crouchEyeHeight,crouchSpeed:player.crouchSpeed};
  const PRONE={height:Math.max(player.radius*2+2,30),eye:17,speed:45};
  const up=new THREE.Vector3(0,1,0),down=new THREE.Vector3(0,-1,0);
  const state={prone:false,sliding:false,mantling:null,diving:null,wallJumps:0,wallKick:0,airTime:0,jumped:false,grounded:true,stairs:0};
  window.kino.movement={player,settings:m,state};

  const ray=(origin,dir,far)=>player.worldOctree.rayIntersect?.(new THREE.Ray(origin,dir),0,far);
  const normalY=hit=>hit.normal?.y??hit.triangle?.getNormal(new THREE.Vector3()).y??1;
  const feet=()=>player.getFeetPosition().clone();
  const forwardDir=()=>new THREE.Vector3(-Math.sin(camera.rotation.y),0,-Math.cos(camera.rotation.y));
  // the direction the player is pushing (forward/strafe input), falling back to the view
  let lastInput={forward:0,strafe:0};
  const moveDir=()=>{const f=forwardDir(),r=new THREE.Vector3(-f.z,0,f.x),d=f.multiplyScalar(lastInput.forward??0).addScaledVector(r,lastInput.strafe??0);return d.lengthSq()>1e-4?d.normalize():forwardDir();};
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
  // ---- One crouch button (C / Ctrl) ------------------------------------------------------
  // Tap: toggle crouch. Hold: prone. Tap while sprinting: slide.
  // (Rebinding "Crouch" in Settings re-sends the key as KeyC, so this follows it.)
  const CROUCH_KEYS=new Set(['KeyC','ControlLeft','ControlRight']),HOLD=.35;
  const controls={crouch:false,held:false,holdTime:0,sprinting:false};
  const canAct=()=>window.kino.debug.getState().active&&!['reviving','gameover'].includes(session.phase)&&!state.mantling;
  // Hold time is counted in game time (update dt), so it matches what you see.
  addEventListener('keydown',e=>{if(!CROUCH_KEYS.has(e.code)||e.repeat||!canAct())return;controls.held=true;controls.holdTime=0;});
  addEventListener('keyup',e=>{
    if(!CROUCH_KEYS.has(e.code)||!controls.held)return;controls.held=false;
    if(!canAct()||controls.holdTime>=HOLD)return;   // a hold already went prone
    if(state.prone){setProne(false);controls.crouch=true;}
    else if(controls.sprinting&&!state.diving&&(player.onFloor||state.airTime<.25))startSlide();   // ground contact flickers on slopes
    else controls.crouch=!controls.crouch;
  });
  addEventListener('blur',()=>{controls.held=false;});

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
    // where the left hand plants: on the ledge's edge, a little left of centre
    const left=new THREE.Vector3(dir.z,0,-dir.x);
    const hand=f.clone().addScaledVector(dir,wall.distance+3).addScaledVector(left,7);hand.y=topY+.5;
    return {from:f,top:new THREE.Vector3(f.x,topY+4,f.z).addScaledVector(dir,4),target,hand,rise,t:0,duration:.34+rise/240};
  }

  // ---- Slide ------------------------------------------------------------------------------------
  // A long, smooth slide: speed eases out along a curve (not linear friction),
  // with a little steering, ending in a crouch.
  const SLIDE={duration:1.35,maxSpeed:490,endSpeed:130,steer:.18};
  const slide={t:0,dir:new THREE.Vector3(),start:0,boost:0};
  function startSlide(){
    const v=player.velocity,h=Math.hypot(v.x,v.z);if(h<160||state.prone)return;
    state.sliding=true;slide.t=0;slide.boost=0;slide.dir.set(v.x/h,0,v.z/h);slide.start=Math.min(SLIDE.maxSpeed,Math.max(h,220)*1.6);
    controls.crouch=true;host.emit('slide');
  }
  // ---- Dive (BO6/BO7): a low forward leap in the move direction, landing prone ------------
  const DIVE_HOLD=.2;
  function startDive(){
    const d=moveDir(),h=Math.hypot(player.velocity.x,player.velocity.z);
    const speed=Math.max(380,h*1.45);
    state.sliding=false;state.diving={t:0,dir:d.clone(),speed};state.jumped=true;
    player.velocity.set(d.x*speed,250,d.z*speed);player.onFloor=player.grounded=false;
    host.emit('dive');
  }
  // ---- Wall jump (BO7): jump while airborne next to a wall to kick off it --------------------
  const WALL={reach:20,max:3,cooldown:.28,out:290,up:.95};
  function tryWallJump(){
    if(state.wallJumps>=WALL.max||state.wallKick>0)return false;
    let best=null;
    for(const hgt of [22,46])for(let i=0;i<12;i++){const a=i/12*Math.PI*2,d=new THREE.Vector3(Math.cos(a),0,Math.sin(a)),f=feet().addScaledVector(up,hgt);
      const h=ray(f,d,player.radius+WALL.reach);if(!h||Math.abs(normalY(h))>.3)continue;if(!best||h.distance<best.h.distance)best={h,d};}
    if(!best)return false;
    const n=(best.h.normal?.clone()??best.h.triangle?.getNormal(new THREE.Vector3()))??best.d.clone().negate();n.y=0;n.normalize();if(n.dot(best.d)>0)n.negate();
    if(state.lastWall&&state.lastWall.dot(n)>.9&&state.wallJumps>0)return false;   // not the same wall twice in a row
    const v=player.velocity,into=v.x*n.x+v.z*n.z;
    const along=new THREE.Vector3(v.x-n.x*into,0,v.z-n.z*into).multiplyScalar(.85);
    player.velocity.set(along.x+n.x*WALL.out,player.jumpSpeed*WALL.up,along.z+n.z*WALL.out);
    state.wallJumps++;state.wallKick=WALL.cooldown;state.lastWall=n;state.jumped=true;
    host.emit('walljump',{normal:n});return true;
  }
  const slideSpeed=t=>{const u=Math.min(1,t/SLIDE.duration);return SLIDE.endSpeed+(slide.start-SLIDE.endSpeed)*(1-u)**1.7;};

  // ---- Wrapped controller update ----------------------------------------------------------
  const originalUpdate=player.update.bind(player);
  let prevJump=false;
  player.update=(dt,input)=>{
    const down_=['reviving','gameover'].includes(session.phase);
    if(down_){if(state.prone)setProne(false);state.sliding=false;state.mantling=null;controls.crouch=false;}
    // Holding crouch long enough goes prone.
    if(controls.held){controls.holdTime+=dt;
      // holding crouch while sprinting dives (a quick tap still slides)
      if(controls.sprinting&&!state.diving&&!state.mantling&&!state.prone&&controls.holdTime>=DIVE_HOLD&&(player.onFloor||state.airTime<.2)){controls.held=false;startDive();}
      else if(!state.prone&&!state.mantling&&!state.diving&&controls.holdTime>=HOLD){state.sliding=false;setProne(true);}}
    // Mantling: a short scripted climb that overrides movement.
    if(state.mantling){
      const mt=state.mantling;mt.t=Math.min(1,mt.t+dt/mt.duration);
      const k=mt.t,rise=Math.min(1,k/.6),e=rise*rise*(3-2*rise),push=Math.max(0,(k-.45)/.55);
      const pos=mt.from.clone().lerp(mt.top,e);pos.lerp(mt.target,push*push*(3-2*push));
      moveFeet(pos);player.velocity.set(0,0,0);player._syncCamera();
      if(mt.t>=1){state.mantling=null;player.onFloor=player.grounded=true;player._resolveCollisions?.();const d=forwardDir();player.velocity.set(d.x*90,0,d.z*90);}
      return player.state;
    }
    // Diving: momentum carries the player; landing ends it prone.
    if(state.diving){
      state.diving.t+=dt;
      if(input)input={...input,forward:0,strafe:0,sprint:false,jump:false,jumpPressed:false,crouch:false};
      const r=originalUpdate(dt,input);
      // the leap keeps its momentum in the air (air control would brake it toward zero input)
      if(!player.onFloor){const dv=state.diving,sp=dv.speed*Math.exp(-dv.t*.6),h=Math.hypot(player.velocity.x,player.velocity.z);if(h>1){const k=Math.min(1,sp/h);player.velocity.x=dv.dir.x*Math.max(h*k,sp);player.velocity.z=dv.dir.z*Math.max(h*k,sp);}}
      if((player.onFloor&&state.diving.t>.12)||state.diving.t>1.6){state.diving=null;setProne(true);controls.crouch=true;const v=player.velocity;v.x*=.35;v.z*=.35;host.emit('diveLand');}
      if(player.onFloor){state.airTime=0;state.jumped=false;}else state.airTime+=dt;
      return r;
    }
    state.wallKick=Math.max(0,state.wallKick-dt);
    if(input&&!down_){
      input={...input};lastInput={forward:input.forward??0,strafe:input.strafe??0};
      const jumpNow=!!(input.jump||input.jumpPressed),horizontal=Math.hypot(player.velocity.x,player.velocity.z);
      controls.sprinting=!!input.sprint&&horizontal>170;   // uphill sprinting is slower
      // Sprinting cancels a toggled crouch, as in Call of Duty.
      if(input.sprint&&controls.crouch&&!state.sliding&&Math.hypot(input.forward??0,input.strafe??0)>.01)controls.crouch=false;
      // Jump pressed near a ledge: mantle instead (also works mid-air).
      if(jumpNow&&!prevJump||(!player.onFloor&&input.jump&&input.forward>0&&state.airTime>.08)){
        const ledge=!state.prone&&findLedge();
        if(ledge){state.mantling=ledge;state.sliding=false;prevJump=jumpNow;player.velocity.set(0,0,0);return player.state;}
      }
      // Jump from prone or crouch stands up instead; a jump mid-slide becomes a slide-jump.
      if(jumpNow&&!prevJump&&(state.prone||(controls.crouch&&!state.sliding))){if(state.prone)setProne(false);controls.crouch=false;input.jump=false;input.jumpPressed=false;}
      else if(jumpNow&&!prevJump&&(player.onFloor||state.airTime<.1)){state.jumped=true;if(state.sliding){state.sliding=false;controls.crouch=false;}}
      else if(jumpNow&&!prevJump&&!player.onFloor&&state.airTime>.12&&!state.prone&&tryWallJump()){input.jump=false;input.jumpPressed=false;}
      if(state.sliding){
        slide.t+=dt;input.sprint=false;
        player.groundAcceleration=40;   // the slide curve drives the speed, not friction
        if(slide.t>=SLIDE.duration||(!player.onFloor&&state.airTime>.45))state.sliding=false;
      }
      // On stairs (ground flickering without a jump) use the game's original acceleration,
      // so every step riser doesn't cost speed.
      if(!state.sliding)player.groundAcceleration=state.stairs>0?original.groundAcceleration:base.groundAcceleration;
      // The crouch key's own state drives crouching (tap toggles, hold is prone).
      input.crouch=controls.crouch||state.prone||state.sliding;
      if(state.prone)input.sprint=false;
      prevJump=jumpNow;
    }
    // Small drops (stairs) keep full ground control; only real jumps and falls steer weakly.
    player.airAcceleration=!state.jumped&&state.airTime<.2?original.groundAcceleration:base.airAcceleration;
    const wasGrounded=player.onFloor;
    const result=originalUpdate(dt,input);
    // Slide: apply the eased speed along the slide direction, steering slightly toward input.
    if(state.sliding){
      const want=moveDir();slide.dir.lerp(want,SLIDE.steer*dt*4).normalize();
      // Follow the ground: stick to slopes (downhill would otherwise launch you
      // off the surface) and let the slope speed you up or slow you down.
      const base_=slideSpeed(slide.t),reach=player.stepHeight+4+base_*dt*1.5;
      const hit=!state.jumped&&player.velocity.y<=60?ray(feet().addScaledVector(up,4),down,reach+4):null;
      const n=hit?.triangle?.getNormal(new THREE.Vector3());
      if(hit&&n&&Math.abs(n.y)>.45){
        if(n.y<0)n.negate();
        moveFeet(feet().addScaledVector(down,Math.max(0,hit.distance-4-player.skin)));
        player.onFloor=player.grounded=true;player.velocity.y=0;player._syncCamera();state.airTime=0;
        const downhill=n.x*slide.dir.x+n.z*slide.dir.z;   // >0 going downhill
        slide.boost=THREE.MathUtils.clamp(slide.boost+downhill*player.gravity*.9*dt,-slide.start,420);
        if(downhill>.08)slide.t=Math.max(0,slide.t-dt*Math.min(.85,downhill*4));   // a downhill slide lasts longer
      }
      const speed=Math.max(0,slideSpeed(slide.t)+slide.boost),actual=Math.hypot(player.velocity.x,player.velocity.z);
      if(slide.t>.12&&(actual<speed*.35||speed<SLIDE.endSpeed*.6))state.sliding=false;   // ran into something, or stalled uphill
      else{player.velocity.x=slide.dir.x*speed;player.velocity.z=slide.dir.z*speed;}
    }
    // Stairs: stepping off an edge snaps down onto the step below.
    if(wasGrounded&&!player.onFloor&&!state.jumped&&player.velocity.y<=0){
      const hit=ray(feet().addScaledVector(up,2),down,player.stepHeight+4);
      if(hit&&normalY(hit)>.6){moveFeet(feet().addScaledVector(down,Math.max(0,hit.distance-2-player.skin)));player.onFloor=player.grounded=true;player.velocity.y=0;player._syncCamera();}
    }
    if(player.onFloor!==wasGrounded&&!state.jumped)state.stairs=.35;state.stairs=Math.max(0,state.stairs-dt);
    if(player.onFloor){state.airTime=0;state.jumped=false;state.wallJumps=0;state.lastWall=null;}else state.airTime+=dt;
    return result;
  };
  host.on('reset',()=>{setProne(false);state.sliding=false;state.mantling=null;state.diving=null;controls.crouch=false;});
  setupFirstPerson(api,state);

  // ---- Slide sound ----------------------------------------------------------------------------------
  // data.json "slideSound" (a file in this folder) if set; otherwise a synthesized dirt scrape.
  let slideBuffer=null;
  if(m.slideSound)fetch(new URL(m.slideSound,api.mod.url)).then(r=>r.ok?r.arrayBuffer():null).then(b=>{if(b)slideBuffer={bytes:b,decoded:null};}).catch(()=>{});
  host.on('slide',async()=>{
    const c=api.audio.ctx;if(!c||!api.audio.enabled||!api.audio.master)return;
    if(slideBuffer){
      try{slideBuffer.decoded??=await c.decodeAudioData(slideBuffer.bytes.slice(0));}catch{slideBuffer=null;}
      if(slideBuffer?.decoded){const s=c.createBufferSource(),g=c.createGain();s.buffer=slideBuffer.decoded;g.gain.value=1;s.connect(g).connect(api.audio.master);s.start();return;}
    }
    const t=c.currentTime,len=SLIDE.duration,b=c.createBuffer(1,Math.ceil(c.sampleRate*len),c.sampleRate),d=b.getChannelData(0);
    for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(.6+.4*Math.random());
    const src=c.createBufferSource(),bp=c.createBiquadFilter(),g=c.createGain();src.buffer=b;bp.type='bandpass';bp.Q.value=.8;
    bp.frequency.setValueAtTime(1800,t);bp.frequency.exponentialRampToValueAtTime(500,t+len);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.65,t+.04);g.gain.exponentialRampToValueAtTime(.001,t+len);
    src.connect(bp).connect(g).connect(api.audio.master);src.start(t);src.stop(t+len);
  });

  // ---- Camera feel ------------------------------------------------------------------------------
  let phase=0,dip=0,dipV=0,roll=0,wasGrounded=true,lastVy=0,bobBlend=0,fallTime=0,crouchOffset=0;
  let lastEye=player._eyeHeight,lastFeetY=player.getFeetPosition().y,stairOffset=0;
  const downRay=new THREE.Ray(new THREE.Vector3(),new THREE.Vector3(0,-1,0));
  function flatUnderfoot(){
    const col=api.world?.collision;if(!col?.raycastFirst)return false;
    downRay.origin.copy(player.getFeetPosition());downRay.origin.y+=12;
    const hit=col.raycastFirst(downRay,0,30);return !!hit?.face&&Math.abs(hit.face.normal.y)>.985;
  }
  host.on('update',dt=>{
    const eye=player._eyeHeight;if(eye!==lastEye){crouchOffset+=lastEye-eye;lastEye=eye;}
    // Stairs: each step up (or snap down) moves the feet several units in one
    // frame, which shook the camera. Absorb those jumps and ease them out.
    const feetY=player.getFeetPosition().y,jump=feetY-lastFeetY;lastFeetY=feetY;
    if(player.onFloor&&!state.mantling&&Math.abs(jump)>1.5&&Math.abs(jump)<=player.stepHeight+6)stairOffset=THREE.MathUtils.clamp(stairOffset-jump,-24,24);
    // Debris: riding over planks and rubble on flat floor moves the feet a
    // little every frame, which read as camera shake. On flat ground (a down
    // ray finds a level surface) small bumps are eased out too; on ramps they
    // pass straight through so the camera doesn't lag the slope.
    else if(player.onFloor&&!state.mantling&&Math.abs(jump)>.12&&flatUnderfoot())stairOffset=THREE.MathUtils.clamp(stairOffset-jump,-24,24);
    else if(Math.abs(jump)>player.stepHeight+6)stairOffset=0;   // teleports, mantles, big drops
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
    stairOffset+=(0-stairOffset)*Math.min(1,dt*11);
    camera.position.y+=y+dip+crouchOffset+stairOffset;
    camera.position.x+=Math.cos(camera.rotation.y)*side;camera.position.z-=Math.sin(camera.rotation.y)*side;
    camera.rotation.z=roll+Math.cos(phase)*.004*bob*bobBlend;
  });

  // ---- Dive sounds: weight on the launch and the landing --------------------------------------
  // Launch: cloth and gear rustle with an arm swing. Landing: a BO1 body fall (wood or dirt,
  // from the gun-sounds build), gear rattle and a synthesized low thump under it.
  {
    const audio=api.audio,keys=()=>Object.keys(audio?.manifest??{});
    const any=p=>{const k=keys().filter(x=>x.includes(p));return k[Math.floor(Math.random()*k.length)];};
    const play=(p,v)=>{const k=any(p);if(k)audio.play(k,v);};
    function thump(volume){
      const c=audio?.ctx,out=audio?.master;if(!c||c.state!=='running'||!out||!audio.enabled)return;const t=c.currentTime;
      const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.setValueAtTime(95,t);o.frequency.exponentialRampToValueAtTime(38,t+.18);
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.006);g.gain.exponentialRampToValueAtTime(.0001,t+.3);o.connect(g).connect(out);o.start(t);o.stop(t+.35);
      const n=c.createBufferSource(),b=c.createBuffer(1,c.sampleRate*.12,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);
      const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=900;const ng=c.createGain();ng.gain.value=volume*.6;n.buffer=b;n.connect(lp).connect(ng).connect(out);n.start(t);
    }
    host.on('dive',()=>{play('fly/gear/cloth/',.8);play('fly/melee/melee_swing/',.55);setTimeout(()=>play('fly/gear/rattle/',.45),90);});
    host.on('diveLand',()=>{
      const wood=Math.random()<.65;play(wood?'fly/bodyfall/wood/':'fly/bodyfall/dirt/',1);
      play('fly/gear/rattle/',.7);setTimeout(()=>play('fly/gear/weapon/',.55),60);thump(.9);
    });
  }
}
