// First-person weapon motion in the style of Black Ops 6/7, layered on top of the viewmodel after the game's own update
// (view.update sets the pivot fresh every frame, then this adds to it). Everything is procedural (BO1 has no traversal
// or motion clips) and spring-driven, so nothing pops: every input is a target a damped spring chases, and the springs'
// stiffness and the motion's size follow the weapon's weight (a pistol snaps, an LMG lags and settles slowly).
// Adaptive layer (2026-10-19, user: "adaptive first person animations like bo7 ... super fluid, move with the player,
// giving it weight"):
// - look inertia: the gun lags behind fast turns, and banks a little into them;
// - movement inertia: acceleration in the camera's frame pushes the gun the other way (a sprint start pulls it back
//   and down, a stop swings it forward, strafes swing it sideways and roll it); airborne the gun floats up while falling
//   and sinks on the way up;
// - bob: a figure-8 driven by distance travelled, so its pace follows the real speed (walk, sprint, crouch) instead of
//   switching on and off; sprinting widens it and rocks the gun fore and aft;
// - breathing: a slow idle sway that grows and quickens with exertion after sprinting, then calms down;
// - weight events: landing dip and pitch (by fall speed), crouch and stand dips, stair steps, a fire kick that overshoots
//   and settles, an aim settle when the sights come up;
// - stances: slide cant, dive tuck, wall-jump kick, mantle (gun drops away, left hand reaches the ledge with two-bone IK).
// Aiming damps nearly all of it (snipers keep a trace of breathing). Settings → Gameplay → Weapon motion scales it.
import * as THREE from 'three';
import { settings } from '../../settings.js';
import { weaponClass } from '../weapon-levels/camo.js';

// weight by class: scales amplitudes by weight^0.6 and lag (spring softness) by weight^0.4
const WEIGHT={'Pistol':.45,'Submachine gun':.7,'Rifle':1,'Shotgun':1.15,'Sniper rifle':1.35,'Light machine gun':1.55,'Launcher':1.4,'Wonder weapon':1.2,'Death Machine':1.7,'Special':1.1,'Bow':1.05,'Melee':.5};
export function weaponWeight(def){
  if(!def)return 1;if(Number.isFinite(def.weight))return def.weight;   // a weapon may say its own
  let w=WEIGHT[weaponClass(def)]??1;if(def.dualWield)w*=.8;if(def.weapon?.upgraded)w*=1.05;return w;
}

export function setupFirstPerson(api,state){
  const {host,view,camera,player,session}=api;
  if(!view)return;
  const spring=(k,c)=>({x:0,v:0,k,c,step(target,dt){this.v+=((target-this.x)*this.k-this.v*this.c)*dt;this.x+=this.v*dt;return this.x;}});
  const s={yawLag:spring(90,14),pitchLag:spring(90,14),roll:spring(60,11),lift:spring(70,9),
    swayX:spring(80,12),swayY:spring(70,11),swayZ:spring(70,11),kickP:spring(150,15),kickY:spring(150,15),kickZ:spring(120,14),settle:spring(120,13),dip:spring(90,12),
    bobPhase:0,bobAmp:0,sprintBlend:0,exert:0,breathT:0,slide:0,dive:0,mantle:0,kick:0,weight:1};
  const base={yawLag:[90,14],pitchLag:[90,14],roll:[60,11],lift:[70,9],swayX:[80,12],swayY:[70,11],swayZ:[70,11],kickP:[150,15],kickY:[150,15],kickZ:[120,14],settle:[120,13],dip:[90,12]};
  // Framing (2026-10-19, from the BO7 reference footage: the gun sits a little lower and further right, and a touch
  // further away, than BO1's hip pose). BO1 rigs get that shift; an imported BO3 rig (its own arms, about 2.2x the
  // scale) is measured once at idle and its grip moved to BO1's rifle grip position (scaled), which replaces the
  // authored corner offsets: every gun then frames alike. Gone in ADS, like the engine's own viewOffset.
  const FRAME={bo7:new THREE.Vector3(.5,-.7,-1.3),grip:new THREE.Vector3(2.6,-4.6,-8.2),wrists:12.5};
  const frame={id:null,target:new THREE.Vector3(),cur:new THREE.Vector3(),tries:0};
  const measureFrame=()=>{   // once per weapon, at idle (the pivot carries the engine's offset: we read world positions)
    const root=view.root,vc=api.viewCamera;if(!root||!vc)return false;vc.updateMatrixWorld(true);const inv=vc.matrixWorldInverse;
    const at=n=>{const o=root.getObjectByName(n);return o?o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv):null;};
    const grip=at('j_gun')??at('tag_weapon'),wr=at('j_wrist_ri'),wl=at('j_wrist_le');if(!grip||!wr||!wl)return false;
    const rig=wr.distanceTo(wl)/FRAME.wrists,imported=rig>1.6;
    if(imported){const T=FRAME.grip.clone().add(FRAME.bo7).multiplyScalar(rig);frame.target.copy(T).sub(grip);frame.target.z=THREE.MathUtils.clamp(frame.target.z,-6,6);}
    else frame.target.copy(FRAME.bo7);
    return true;};
  let lastYaw=camera.rotation.y,lastPitch=camera.rotation.x,wasGrounded=true,lastVy=0,lastRight=0,lastFwd=0,accR=0,accF=0,lastEye=player._eyeHeight,lastFeetY=player.getFeetPosition().y,lastRecoil=0,lastAim=0,lastDef=null;
  host.on('walljump',()=>{s.kick=1;});
  window.kino.fpMotion={s,reachLeft,weight:()=>s.weight};
  host.on('diveLand',()=>{s.lift.v-=40;s.kickP.v+=3;});
  view.bobScale=0;   // the engine's on/off bob is replaced by the distance-driven one below

  // ---- two-bone IK on the left arm --------------------------------------------------
  const tmp={s:new THREE.Vector3(),e:new THREE.Vector3(),w:new THREE.Vector3(),q:new THREE.Quaternion(),pq:new THREE.Quaternion()};
  function aimBone(bone,from,to,childNow,childWant){
    // rotate `bone` (world space) so its child moves from childNow toward childWant around `from`
    const a=childNow.clone().sub(from).normalize(),b=childWant.clone().sub(from).normalize();
    if(a.lengthSq()<1e-8||b.lengthSq()<1e-8)return;
    const rot=new THREE.Quaternion().setFromUnitVectors(a,b);
    bone.getWorldQuaternion(tmp.q);const world=rot.multiply(tmp.q);
    bone.parent.getWorldQuaternion(tmp.pq);bone.quaternion.copy(tmp.pq.invert().multiply(world));
    bone.updateMatrixWorld(true);
  }
  // open: ease the hand to its relaxed bind pose (a ledge); false keeps the animation's grip (holding a part)
  function reachLeft(target,weight,open=true){
    const root=view.root;if(!root||weight<=0)return;
    const sh=root.getObjectByName('j_shoulder_le'),el=root.getObjectByName('j_elbow_le'),wr=root.getObjectByName('j_wrist_le');
    if(!sh||!el||!wr)return;
    root.updateMatrixWorld(true);
    sh.getWorldPosition(tmp.s);el.getWorldPosition(tmp.e);wr.getWorldPosition(tmp.w);
    const a=tmp.s.distanceTo(tmp.e),b=tmp.e.distanceTo(tmp.w);
    // blend the target from where the hand is now, so it eases in and out
    const T=tmp.w.clone().lerp(target,weight);
    const d=Math.min(a+b-.01,Math.max(Math.abs(a-b)+.01,tmp.s.distanceTo(T)));
    const dir=T.clone().sub(tmp.s).normalize();
    // keep the elbow bending the way it already does (down and out)
    const pole=tmp.e.clone().sub(tmp.s);pole.addScaledVector(dir,-pole.dot(dir));
    if(pole.lengthSq()<1e-6)pole.set(0,-1,0);pole.normalize();
    const along=(a*a-b*b+d*d)/(2*d),h=Math.sqrt(Math.max(0,a*a-along*along));
    const elbowWant=tmp.s.clone().addScaledVector(dir,along).addScaledVector(pole,h);
    aimBone(sh,tmp.s,null,tmp.e.clone(),elbowWant);
    el.getWorldPosition(tmp.e);wr.getWorldPosition(tmp.w);
    aimBone(el,tmp.e,null,tmp.w.clone(),tmp.s.clone().addScaledVector(dir,d));
    // open the hand: wrist and fingers ease toward the model's relaxed bind pose
    if(open)for(const b of handBones(root)){const bind=bindLocal(b);if(bind)b.quaternion.slerp(bind,weight);}
    root.updateMatrixWorld(true);
  }
  // The rig's animations don't key every arm bone every frame, so IK edits would
  // pile up: remember what the animation left, and put it back next frame.
  const touched=new Map();   // bone → {anim, ik}
  function restoreArm(){for(const [b,r] of touched){if(b.quaternion.equals(r.ik))b.quaternion.copy(r.anim);}touched.clear();}
  function remember(bones){for(const b of bones)touched.set(b,{anim:b.quaternion.clone(),ik:null});}
  function sealArm(){for(const [b,r] of touched)r.ik=b.quaternion.clone();}
  let handCache=null;
  function handBones(root){
    if(handCache?.root===root)return handCache.list;
    const list=[];root.traverse(o=>{if(o.isBone&&/^j_(wrist|wristtwist|index|mid|ring|pinky|pinkypalm|ringpalm|thumb|webbing)(_le)(_\d)?$/.test(o.name))list.push(o);});
    handCache={root,list};return list;
  }
  const bindCache=new WeakMap();
  function bindLocal(bone){
    if(bindCache.has(bone))return bindCache.get(bone);
    let skel=null;view.root.traverse(o=>{if(!skel&&o.isSkinnedMesh&&o.skeleton.bones.includes(bone))skel=o.skeleton;});
    let q=null;
    if(skel){const i=skel.bones.indexOf(bone),pi=skel.bones.indexOf(bone.parent);
      if(i>=0&&pi>=0){const w=skel.boneInverses[i].clone().invert(),pw=skel.boneInverses[pi].clone().invert();
        const local=pw.invert().multiply(w),pos=new THREE.Vector3(),sc=new THREE.Vector3();q=new THREE.Quaternion();local.decompose(pos,q,sc);}}
    bindCache.set(bone,q);return q;
  }

  const clamp=THREE.MathUtils.clamp;
  host.on('update',dtRaw=>{
    if(!dtRaw||!view.pivot||!view.ready)return;
    const dt=Math.min(dtRaw,.05);
    const def=session.def;if(def!==lastDef){lastDef=def;s.weight=weaponWeight(def);}
    const str=settings.gunMotion??1,w=s.weight,amp=Math.pow(w,.6)*str,lag=Math.pow(w,.4);
    // springs soften with weight: a heavy gun lags more and settles later
    for(const k in base){const [kk,cc]=base[k];s[k].k=kk/lag;s[k].c=cc/Math.sqrt(lag);}
    const aim=view.aim??0,hip=1-aim*.85,hipR=1-aim*.9;   // aiming keeps the gun steady
    const sprint=view.mode==='sprint'||view.mode==='sprintIn';
    // ---- look inertia and bank
    let dy=camera.rotation.y-lastYaw,dx=camera.rotation.x-lastPitch;lastYaw=camera.rotation.y;lastPitch=camera.rotation.x;
    if(dy>Math.PI)dy-=Math.PI*2;if(dy<-Math.PI)dy+=Math.PI*2;
    const yawRate=dy/dtRaw,pitchRate=dx/dtRaw;
    const yl=s.yawLag.step(clamp(-yawRate*.018*amp,-.13*amp,.13*amp),dt),pl=s.pitchLag.step(clamp(-pitchRate*.015*amp,-.1*amp,.1*amp),dt);
    // ---- velocity and acceleration in the camera's frame (right, forward)
    const v=player.velocity,yaw=camera.rotation.y;
    const right=v.x*Math.cos(yaw)-v.z*Math.sin(yaw),fwd=-(v.x*Math.sin(yaw)+v.z*Math.cos(yaw));
    const aR=(right-lastRight)/dtRaw,aF=(fwd-lastFwd)/dtRaw;lastRight=right;lastFwd=fwd;
    accR+=(clamp(aR,-3000,3000)-accR)*Math.min(1,dt*18);accF+=(clamp(aF,-3000,3000)-accF)*Math.min(1,dt*18);
    const grounded=player.onFloor;
    const rl=s.roll.step(clamp(-right/285*.05*amp,-.06,.06)+clamp(yawRate*.01,-.025,.025)*amp,dt);   // strafe roll + bank into turns
    const sx=s.swayX.step(clamp(-accR/3000,-1,1)*1.6*amp,dt);            // strafe starts swing the gun the other way
    const sz=s.swayZ.step(clamp(accF/3000,-1,1)*1.3*amp,dt);              // a sprint start pulls it back, a stop throws it forward
    const sy=s.swayY.step(grounded?0:clamp(-v.y/900,-1,1)*.5*amp,dt);     // airborne: sinks going up, floats coming down
    // ---- weight events: takeoff, landing, crouch, steps, aim, fire
    if(!grounded&&wasGrounded&&v.y>50)s.lift.v-=10*amp;                                   // takeoff: gun sinks
    if(grounded&&!wasGrounded&&lastVy<-200){const f=Math.min(1,-lastVy/900);s.lift.v-=Math.min(50,-lastVy*.09)*amp;s.kickP.v+=4*f*amp;s.kickY.v+=(Math.random()-.5)*2.5*f*amp;}   // landing: dip and a nod
    wasGrounded=grounded;lastVy=v.y;
    const eye=player._eyeHeight;if(eye!==lastEye){s.dip.v-=(eye-lastEye)*.9*amp;lastEye=eye;}    // crouching dips the gun, standing lifts it
    const feetY=player.getFeetPosition().y,stepUp=feetY-lastFeetY;lastFeetY=feetY;
    if(grounded&&state.stairs>0&&Math.abs(stepUp)>1.5&&Math.abs(stepUp)<=14)s.lift.v-=clamp(stepUp,-8,8)*.9*amp;   // a step: a small bump
    if(aim>.5&&lastAim<=.5)s.settle.v+=3.5*amp;if(aim<.5&&lastAim>=.5)s.settle.v-=2*amp;lastAim=aim;              // sights up: overshoot and settle
    const recoil=view.recoil??0;
    if(recoil>lastRecoil+.05){const k=(.6+w*.5)*str;s.kickP.v+=5*k;s.kickY.v+=(Math.random()-.5)*4*k;s.kickZ.v+=4*k;}   // a shot: kick back and up, settle by weight
    lastRecoil=recoil;
    const lf=s.lift.step(0,dt),dp=s.dip.step(0,dt),kp=s.kickP.step(0,dt),ky=s.kickY.step(0,dt),kz=s.kickZ.step(0,dt),st=s.settle.step(0,dt);
    // ---- bob: a figure-8 paced by distance travelled
    const speed=Math.hypot(v.x,v.z),moving=speed>15&&grounded&&!state.sliding&&!state.mantling&&view.mode!=='melee';
    const stride=player.crouched?36:sprint?52:44;
    if(moving)s.bobPhase+=speed*dt*(Math.PI*2/stride);
    const want=moving?Math.min(1,speed/190)*(sprint?1.35:1)*(player.crouched?.55:1):0;
    s.bobAmp+=(want-s.bobAmp)*Math.min(1,dt*(want>s.bobAmp?6:9));
    s.sprintBlend+=((sprint?1:0)-s.sprintBlend)*Math.min(1,dt*5);
    const bA=s.bobAmp*amp*(1-aim*.9),ph=s.bobPhase;
    const bobX=Math.sin(ph)*.26*bA*(1+.7*s.sprintBlend),bobY=Math.cos(ph*2)*.15*bA,bobZ=Math.sin(ph*2)*.07*bA*s.sprintBlend;
    const bobRoll=Math.sin(ph)*.022*bA,bobPitch=Math.cos(ph*2)*.009*bA,bobYaw=-Math.sin(ph)*.012*bA*s.sprintBlend;
    // ---- breathing and exertion
    s.exert+=((sprint&&speed>200?1:0)-s.exert)*Math.min(1,dt*(sprint?.35:.12));
    s.breathT+=dt*(1.1+s.exert*1.5);
    const bAmp=(.06+s.exert*.14)*amp*(aim?.3:1);
    const brX=Math.sin(s.breathT*.7)*bAmp*.5,brY=Math.sin(s.breathT)*bAmp,brP=Math.sin(s.breathT)*bAmp*.02;
    // ---- stance blends
    const ease=(x,to,rate)=>x+(to-x)*Math.min(1,dt*rate);
    s.slide=ease(s.slide,state.sliding?1:0,state.sliding?12:6);
    s.dive=ease(s.dive,state.diving?1:0,state.diving?10:5);
    const mt=state.mantling,mk=mt?Math.sin(Math.min(1,mt.t)*Math.PI):0;   // up and back down over the climb
    s.mantle=ease(s.mantle,mt?1:0,mt?14:7);
    s.kick=Math.max(0,s.kick-dt*3.5);

    const P=view.pivot.position,R=view.pivot.rotation;
    // framing: measured once per weapon at idle, eased in over a quarter second
    if(frame.id!==view.currentId){if(view.mode==='idle'&&++frame.tries>2&&measureFrame()){frame.id=view.currentId;frame.tries=0;}}
    frame.cur.lerp(frame.id===view.currentId?frame.target:frame.cur,Math.min(1,dt*8));
    P.addScaledVector(frame.cur,1-aim);
    // look lag, bank, airborne float, landing and steps
    P.x+=yl*4*hip;P.y+=pl*4*hip+lf*.06+dp*.04+sy*.5*hip;P.z+=0;
    R.y+=yl*hipR;R.x+=pl*hipR+lf*-.004+sy*-.02*hipR;R.z+=rl*hipR;
    // movement inertia
    P.x+=sx*.9*hip;P.z+=sz*.8*hip;P.y+=-Math.abs(sz)*.12*hip;R.z+=-sx*.09*hipR;R.x+=-sz*.05*hipR;R.y+=-sx*.03*hipR;
    // sprint pose (BO7: the gun drops to the right and tilts, muzzle up and left) over BO1's sprint clip
    const sb=s.sprintBlend;P.x+=.7*sb;P.y+=-.45*sb;R.z+=-.2*sb;R.y+=.12*sb;R.x+=.06*sb;
    // bob and breathing
    P.x+=bobX+brX*hip;P.y+=bobY+brY*hip;P.z+=bobZ;R.z+=bobRoll*hipR;R.x+=bobPitch*hipR+brP*hip;R.y+=bobYaw*hipR;
    // fire kick (over the engine's own recoil) and the aim settle
    R.x+=kp*.014;R.y+=ky*.005;P.z+=kz*.06;P.y+=st*.03;R.x+=st*.005;
    // slide: cant the gun, pull it in and down
    P.x+=-.5*s.slide;P.y+=-.4*s.slide;P.z+=.8*s.slide;R.z+=.38*s.slide;R.x+=.06*s.slide;
    // dive: tuck down and roll
    P.y+=-1.4*s.dive;P.x+=.5*s.dive;R.z+=.5*s.dive;R.x+=-.15*s.dive;
    // wall jump kick
    const k=s.kick*s.kick;R.x+=.22*k;R.z+=-.25*k;P.y+=-.8*k;
    // mantle: gun drops away to the right
    // (pitched down around the camera rather than moved, so the left shoulder stays in reach of the ledge)
    const g=Math.max(s.mantle*.85,mk);P.x+=1.2*g;P.y+=-1.2*g;R.x+=-.95*g;R.z+=-.35*g;R.y+=.18*g;
    if(!Number.isFinite(P.x+P.y+P.z+R.x+R.y+R.z)){for(const k in base){s[k].x=0;s[k].v=0;}s.bobAmp=0;s.exert=0;P.set(0,0,0);R.set(0,0,0);}   // never let a bad frame stick
    view.root?.updateMatrixWorld(true);
    // mantle: left hand reaches for the ledge and stays planted while climbing
    restoreArm();
    if(mt?.hand&&s.mantle>.01){
      const r=view.root;remember(['j_shoulder_le','j_elbow_le'].map(n=>r.getObjectByName(n)).filter(Boolean).concat(handBones(r)));
      const local=camera.worldToLocal(mt.hand.clone());   // the viewmodel lives in camera space
      // keep the planted hand in view (bottom left), as BO7 does: the real ledge is often below the frame
      local.z=THREE.MathUtils.clamp(local.z,-16,-12);const depth=-local.z;   // within the arm's reach (about 22 from the shoulder)
      local.y=THREE.MathUtils.clamp(local.y,-Math.tan(.33)*depth,-Math.tan(.12)*depth);
      local.x=THREE.MathUtils.clamp(local.x,-Math.tan(.45)*depth,-Math.tan(.08)*depth);
      reachLeft(local,Math.min(1,s.mantle*1.15)*(mt.t>.82?Math.max(0,(1-mt.t)/.18):1));
      sealArm();
    }
  });
}
