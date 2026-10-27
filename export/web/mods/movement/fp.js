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
const WEIGHT_ID={thundergun_zm:1.5};   // heavier than its class (the Thundergun is a tank of a wonder weapon)
export function weaponWeight(def){
  if(!def)return 1;if(Number.isFinite(def.weight))return def.weight;   // a weapon may say its own
  let w=WEIGHT_ID[def.baseId??def.id]??WEIGHT[weaponClass(def)]??1;if(def.dualWield)w*=.8;if(def.weapon?.upgraded)w*=1.05;return w;
}
// how heavy a gun sprints (2026-10-20, user: "with heavier weapons, like the minigun and the thundergun, make the sprint
// more lowered, more unique and heavy feeling"): 0 at a rifle's weight, 1 at the Death Machine's. The sprint pose drops
// deeper and cants more, swings across less, rocks more with the stride, and the gun is slower into and out of it.
const heavy=w=>THREE.MathUtils.clamp((w-1)/.7,0,1);

export function setupFirstPerson(api,state){
  const {host,view,camera,player,session}=api;
  if(!view)return;
  const spring=(k,c)=>({x:0,v:0,k,c,step(target,dt){this.v+=((target-this.x)*this.k-this.v*this.c)*dt;this.x+=this.v*dt;return this.x;}});
  const s={yawLag:spring(90,14),pitchLag:spring(90,14),roll:spring(60,11),lift:spring(70,9),
    swayX:spring(80,12),swayY:spring(70,11),swayZ:spring(70,11),kickP:spring(150,15),kickY:spring(150,15),kickZ:spring(120,14),settle:spring(120,13),dip:spring(90,12),
    bobPhase:0,bobAmp:0,sprintBlend:0,sprintSpring:spring(70,12),exert:0,breathT:0,slide:0,dive:0,mantle:0,kick:0,weight:1};
  const base={yawLag:[90,14],pitchLag:[90,14],roll:[60,11],lift:[70,9],swayX:[80,12],swayY:[70,11],swayZ:[70,11],kickP:[150,15],kickY:[150,15],kickZ:[120,14],settle:[120,13],dip:[90,12]};
  // Framing (2026-10-19, from the BO7 reference footage: the gun sits a little lower and further right, and a touch
  // further away, than BO1's hip pose). BO1 rigs get that shift; an imported BO3 rig (its own arms, about 2.2x the
  // scale) is measured once at idle and its grip moved to BO1's rifle grip position (scaled), which replaces the
  // authored corner offsets: every gun then frames alike. Gone in ADS, like the engine's own viewOffset.
  // the sprint pose: translation (view space, after the turn) and the turn (pitch up, yaw left, roll) about the grip
// (measured off the reference: the gun is held low and nearly level, swung left and canted; the steep look on the screen
// is perspective, a low gun pointing away rises toward the horizon)
const SPRINT={pos:[.3,-2,1],rot:[.15,.45,.3],dual:{pos:[0,-1.2,.6],rot:[.1,0,0]}};   // (dual wield: both guns drop and come in, no cant)
const sprintQ=new THREE.Quaternion(),tmpQ=new THREE.Quaternion(),sprintE=new THREE.Euler(),sprintG=new THREE.Vector3(),sprintT=new THREE.Vector3();
const FRAME={bo7:new THREE.Vector3(.3,.1,-2.8),grip:new THREE.Vector3(2.6,-4.6,-8.2),wrists:12.5,arm:23.7};
  const frame={id:null,target:new THREE.Vector3(),cur:new THREE.Vector3(),tries:0,rig:1,len:30,oneHanded:false};   // rig: the viewmodel's scale (BO3 rigs 2.2); len: the gun's length in BO1 units
  const measureFrame=()=>{   // once per weapon, at idle (the pivot carries the engine's offset: we read world positions)
    const root=view.root,vc=api.viewCamera;if(!root||!vc)return false;vc.updateMatrixWorld(true);const inv=vc.matrixWorldInverse;
    const at=n=>{const o=root.getObjectByName(n);return o?o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv):null;};
    const grip=at('j_gun')??at('tag_weapon'),wr=at('j_wrist_ri'),wl=at('j_wrist_le'),sh=at('j_shoulder_le'),el=at('j_elbow_le');if(!grip||!wr||!wl)return false;
    // imported rigs (BO3/BO7 viewmodels with their own hands) are told by their source, not their size: a BO1 rig with the
    // hands far apart (China Lake, Death Machine) measured as imported and lost the sprint pose
    const def=session.def,imported=!!def?.handsModel||/bo3-weapons|bo7-weapons|_vmgun/.test(def?.model||'');
    // the rig's scale from the left arm's length (a BO1 arm is 23.7; the pose-dependent wrist spacing made a one-handed
    // UZI measure tiny and sit in the camera), falling back to the wrist spacing
    const rig=sh&&el?(sh.distanceTo(el)+el.distanceTo(wl))/FRAME.arm:wr.distanceTo(wl)/FRAME.wrists;frame.rig=imported?Math.max(.5,rig):1;
    // the gun's length (view space, along the barrel): the sprint pose drops a long rifle more than a pistol
    const gb=new THREE.Box3().setFromObject(view.gun??root);frame.len=Number.isFinite(gb.max.z-gb.min.z)?(gb.max.z-gb.min.z)/frame.rig:30;
    // imported rigs keep their authored hip placement (every BO3 gun has a hand-set def.viewOffset; normalising their grip
    // onto the BO1 grip fought it and put a third of them off the screen): only the BO7 shift, in their scale
    frame.target.copy(FRAME.bo7).multiplyScalar(frame.rig);
    frame.oneHanded=gb.distanceToPoint(wl)>6*frame.rig;   // the left hand is off the gun (a one-handed BO3 pistol: the arm hangs): no hand lag (by the gun's box: by the grip's distance the Ray Gun, held at its front, counted as one-handed)
    view.sprintPose=true;   // every rig: the BO7 pose below (imported BO3 rigs' own sprint clips put the gun off the screen)
    return true;};
  // underbarrel parts the support hand holds: the attachment's shown tag, the hand's spot under the part (gun frame) and the wrist roll
  // (at(box, centre): where the wrist goes, view space at idle. A vertical grip: held at mid height from its left face, the
  // palm a hand's length ahead of the wrist wraps it with the roll. A launcher or shotgun: under its forward section.)
  const UNDER={grip:{tags:['tag_grip','tag_foregrip','tag_foregripd'],roll:1.2,at:(b,c)=>new THREE.Vector3(c.x-.9,c.y,c.z+2)},
    gl:{tags:['tag_grenade_launcher','tag_m203','tag_bouncing_grenade_launcher'],at:(b,c)=>new THREE.Vector3(c.x,c.y-1.2,b.min.z+5)},
    masterkey:{tags:['tag_masterkey'],at:(b,c)=>new THREE.Vector3(c.x,c.y-1,b.min.z+4.5)},
    flamer:{tags:['tag_flame_unit'],at:(b,c)=>new THREE.Vector3(c.x,c.y-1.2,b.min.z+5)}};
  const under={key:null,kind:null,tries:0,w:0,at:new THREE.Vector3(),tmp:new THREE.Vector3(),roll:0},rollQ=new THREE.Quaternion();
  // ---- dual wield (2026-10-20, user: "these two guns should act independently in terms of animations, swaying in their own
  // way, and sprinting should tilt and turn my arms"). Each gun and the arm holding it get their own motion over a reduced
  // share of the common pivot motion: their own lag and sway springs (the left arm's a little softer, so the two never move
  // as one), the stride pumping the arms alternately, each gun's own fire kick, their own breathing phase and a slow drift,
  // and a sprint pose per arm (out, down and in toward the player, the muzzle up and turned out, canted). The gun stays in
  // its hand: its tag (tag_weapon / tag_weapon1, under the torso on BO1 rigs, not the wrist) and the wrist take the same
  // rigid transform, the arm follows by two-bone IK, the hand keeps the clip's grip.
  const DUAL={sprint:{pos:[.9,-.5,.5],rot:[.22,.4,.3]},common:.55,
    k:{yaw:[[90,14],[70,11]],pitch:[[90,14],[74,12]],sway:[[80,12],[62,10]],kickP:[[60,9],[60,9]],kickZ:[[50,8],[50,8]]}};   // (the per-gun kicks: softer springs than the common ones, so a shot shows)
  const dual={w:0,lastShots:-1,camQ:new THREE.Quaternion(),camQi:new THREE.Quaternion(),sides:['ri','le'].map((side,i)=>({side,i,sign:i?-1:1,tag:i?'tag_weapon1':'tag_weapon',
    yaw:spring(...DUAL.k.yaw[i]),pitch:spring(...DUAL.k.pitch[i]),sway:spring(...DUAL.k.sway[i]),kickP:spring(...DUAL.k.kickP[i]),kickZ:spring(...DUAL.k.kickZ[i]),
    off:new THREE.Vector3(),rot:new THREE.Euler(),M:new THREE.Matrix4(),tmpM:new THREE.Matrix4(),tagM:new THREE.Matrix4(),q:new THREE.Quaternion(),qw:new THREE.Quaternion(),p:new THREE.Vector3(),wq:new THREE.Quaternion(),sc:new THREE.Vector3()}))};
  function measureUnder(def){   // once per weapon and attachment set, at idle: the part's extent in the gun's frame
    under.kind=null;const ids=(def?.attachments??'').split('+'),kind=Object.keys(UNDER).find(k=>ids.includes(k));if(!kind||!view.gun)return;
    const r=view.root,g=r.getObjectByName('j_gun')??r.getObjectByName('tag_weapon');if(!g)return;
    const bone=UNDER[kind].tags.map(t=>r.getObjectByName(t)).find(b=>b&&b.scale.x>.5);if(!bone)return;
    view.pivot.updateMatrixWorld(true);const p=new THREE.Vector3(),box=new THREE.Box3();let n=0;   // (view space: the gun bone's own axes are not the view's)
    view.gun.traverse(o=>{if(!o.isMesh||!o.visible||!o.isSkinnedMesh)return;const geo=o.geometry,P=geo.attributes.position,SI=geo.attributes.skinIndex,SW=geo.attributes.skinWeight,I=geo.index,count=I?I.count:P.count,bones=o.skeleton.bones;
      for(let k=0;k<count;k+=2){const i=I?I.getX(k):k;let best=0,bw=-1;for(let c=0;c<4;c++){const ww=SW.getComponent(i,c);if(ww>bw){bw=ww;best=SI.getComponent(i,c);}}let b=bones[best],ok=false;for(;b;b=b.parent)if(b===bone){ok=true;break;}if(!ok)continue;
        p.fromBufferAttribute(P,i);o.applyBoneTransform(i,p);o.localToWorld(p);if(p.lengthSq()<1e-6||Math.abs(p.x)>60)continue;box.expandByPoint(p);n++;}});
    if(n<8)return;const U=UNDER[kind],c=box.getCenter(new THREE.Vector3());
    under.at.copy(U.at(box,c)).applyMatrix4(g.matrixWorld.clone().invert());under.roll=U.roll??0;under.kind=kind;
    under.box=[box.min.toArray(),box.max.toArray()];
  }
  let lastYaw=camera.rotation.y,lastPitch=camera.rotation.x,wasGrounded=true,lastVy=0,lastRight=0,lastFwd=0,accR=0,accF=0,lastEye=player._eyeHeight,lastFeetY=player.getFeetPosition().y,lastRecoil=0,lastAim=0,lastDef=null;
  host.on('walljump',()=>{s.kick=1;});
  const cam={roll:0,pitch:0,fov:0,prev:0};   // what the camera itself does this frame (read by the movement mod's camera feel)
  const handLag={p:new THREE.Vector3(),v:new THREE.Vector3(),init:false,w:0,tmp:new THREE.Vector3(),acc:new THREE.Vector3(),off:new THREE.Vector3(),lag:new THREE.Vector3()};
  const flags={cam:true,hand:true};   // runtime switches for testing (kino.fpMotion.flags)
  window.kino.fpMotion={s,reachLeft,reachArm,weight:()=>s.weight,cam,flags,handLag,frame,under:()=>under,dual:()=>dual};
  host.on('diveLand',()=>{s.lift.v-=40;s.kickP.v+=3;});
  view.bobScale=0;   // the engine's on/off bob is replaced by the distance-driven one below
  // BO1's sprint clips held the gun flat across the bottom of the screen; BO7 lowers it to the right with the muzzle up
  // and to the left and keeps both hands on it, so every rig keeps its idle grip while sprinting and this layer poses it
  // (view.sprintPose, animation.js; the imported BO3 rigs' own sprint clips put the gun off the screen).
  view.sprintPose=true;

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
  function reachLeft(target,weight,open=true){return reachArm('le',target,weight,open);}   // (a declaration: kino.fpMotion above takes it before this line runs)
  function reachArm(side,target,weight,open=true){
    const root=view.root;if(!root||weight<=0)return;
    const sh=root.getObjectByName('j_shoulder_'+side),el=root.getObjectByName('j_elbow_'+side),wr=root.getObjectByName('j_wrist_'+side);
    if(!sh||!el||!wr)return;
    view.pivot.updateMatrixWorld(true);   // from the pivot: it carries this layer's motion and getWorldPosition no longer refreshes parents
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
    if(open)for(const b of handBones(root,side)){const bind=bindLocal(b);if(bind)b.quaternion.slerp(bind,weight);}
    view.pivot.updateMatrixWorld(true);
  }
  // The rig's animations don't key every arm bone every frame, so IK edits would
  // pile up: remember what the animation left, and put it back next frame.
  const touched=new Map();   // bone → {aq, ap: the animation's rotation (and position, when asked); iq, ip: what this layer left}
  // (rotation and position put back on their own: a clip may key one and not the other, and skipping both when the
  // position had been re-keyed let the dual-wield gun tags' turn pile up frame after frame until the guns stood vertical)
  function restoreArm(){let n=0;for(const [b,r] of touched){if(b.quaternion.equals(r.iq)){b.quaternion.copy(r.aq);n++;}if(r.ap&&b.position.equals(r.ip)){b.position.copy(r.ap);n++;}}touched.clear();return n;}
  // (once per bone per frame: the mantle reach runs after the hand lag's, and remembering the hand lag's result as the
  // animation's baked a little of it into the arm every frame; after each mantle the hand sat further off the grip)
  function remember(bones,withPos=false){for(const b of bones)if(!touched.has(b))touched.set(b,{aq:b.quaternion.clone(),ap:withPos?b.position.clone():null,iq:null,ip:null});}
  function sealArm(){for(const [b,r] of touched){r.iq=b.quaternion.clone();if(r.ap)r.ip=b.position.clone();}}
  const handCache={le:null,ri:null};
  function handBones(root,side='le'){
    if(handCache[side]?.root===root)return handCache[side].list;
    const re=new RegExp('^j_(wrist|wristtwist|index|mid|ring|pinky|pinkypalm|ringpalm|thumb|webbing)(_'+side+')(_\\d)?$');
    const list=[];root.traverse(o=>{if(o.isBone&&re.test(o.name))list.push(o);});
    handCache[side]={root,list};return list;
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
    const dt=Math.min(dtRaw,.05);s.t=(s.t??0)+dt;   // s.t: the layer's own clock (tests sample against it)
    const def=session.def;if(def!==lastDef){lastDef=def;s.weight=weaponWeight(def);}
    const str=settings.gunMotion??1,w=s.weight,amp=Math.pow(w,.6)*str,lag=Math.pow(w,.4);
    // springs soften with weight: a heavy gun lags more and settles later
    for(const k in base){const [kk,cc]=base[k];s[k].k=kk/lag;s[k].c=cc/Math.sqrt(lag);}
    const aim=view.aim??0,hip=1-aim*.85,hipR=1-aim*.9;   // aiming keeps the gun steady
    const sprint=view.mode==='sprint'||view.mode==='sprintIn';
    // ---- look inertia and bank
    let dy=camera.rotation.y-lastYaw,dx=camera.rotation.x-lastPitch-(cam.pitch-cam.prev);lastYaw=camera.rotation.y;lastPitch=camera.rotation.x;cam.prev=cam.pitch;   // minus the sway the camera feel applied last frame
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
    // one cycle of the figure-8 is two steps: at 190 u/s a walk takes about 2.5 steps a second, a 285 u/s sprint about 2.9
    // (the first version had strides of 36-52, four times the cadence: the view shook rather than bobbed)
    const stride=player.crouched?110:sprint?200:150;
    if(moving)s.bobPhase+=speed*dt*(Math.PI*2/stride);
    const want=moving?Math.min(1,speed/190)*(sprint?1.35:1)*(player.crouched?.55:1):0;
    s.bobAmp+=(want-s.bobAmp)*Math.min(1,dt*(want>s.bobAmp?6:9));
    const hv=heavy(w);s.sprintSpring.k=70/(1+hv*.9);s.sprintSpring.c=12/Math.sqrt(1+hv*.9);   // a heavy gun takes longer to drop into the sprint and to come back up
    s.sprintSpring.step(sprint&&speed>60?1:0,dt);s.sprintBlend=THREE.MathUtils.clamp(s.sprintSpring.x,-.15,1.15);
    const cm=def?.dualWield?DUAL.common:1;   // dual wield: the pivot keeps a share of the side-to-side motion, the arms get the rest each on its own
    const bA=s.bobAmp*amp*(1-aim*.9),ph=s.bobPhase;
    const bobX=Math.sin(ph)*.26*bA*(1+.3*s.sprintBlend)*cm,bobY=Math.cos(ph*2)*.15*bA,bobZ=Math.sin(ph*2)*.07*bA*s.sprintBlend;
    const bobRoll=Math.sin(ph)*.022*bA*cm,bobPitch=Math.cos(ph*2)*.009*bA,bobYaw=-Math.sin(ph)*.012*bA*s.sprintBlend*cm;
    // ---- breathing and exertion
    s.exert+=((sprint&&speed>200?1:0)-s.exert)*Math.min(1,dt*(sprint?.35:.12));
    s.breathT+=dt*(1.1+s.exert*1.5);
    const bAmp=(.06+s.exert*.14)*amp*(aim?.3:1);
    const brX=Math.sin(s.breathT*.7)*bAmp*.5*cm,brY=Math.sin(s.breathT)*bAmp*cm,brP=Math.sin(s.breathT)*bAmp*.02*cm;
    // ---- stance blends
    const ease=(x,to,rate)=>x+(to-x)*Math.min(1,dt*rate);
    s.slide=ease(s.slide,state.sliding?1:0,state.sliding?12:6);
    s.dive=ease(s.dive,state.diving?1:0,state.diving?10:5);
    s.reload=ease(s.reload??0,session.reloadLeft>0&&view.mode==='reload'&&(view.reloadHand??'both')==='both'?1:0,session.reloadLeft>0?9:6);   // reloads bring the gun in and turn it toward you (BO7); not when one of two dual guns reloads alone
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
    P.x+=sx*.9*hip*cm;P.z+=sz*.8*hip;P.y+=-Math.abs(sz)*.12*hip;R.z+=-sx*.09*hipR*cm;R.x+=-sz*.05*hipR;R.y+=-sx*.03*hipR*cm;
    // sprint pose (BO7 reference: the gun drops to the bottom of the screen, nearly centred, the muzzle swung up and to
    // the left so only the front half shows, canted, both hands on it; it swings with the stride and lags the turn).
    // The turn is about the grip (the right hand), not the camera, so the gun goes down rather than the muzzle up.
    // hip poses: gone by the time the sights are up ((1-aim)^2: before the reflex dot shows at aim .85; it used to hang in
    // the air while the gun was still swinging in from the sprint pose or the reload tilt)
    const hp=(1-aim)*(1-aim),sb=s.sprintBlend*hp,sw=s.sprintBlend*s.bobAmp*hp;
    if(sb>.001){
      const SP=def?.dualWield?SPRINT.dual:SPRINT,rig=frame.rig,lenK=THREE.MathUtils.clamp(frame.len/32,.5,1.15)*rig;   // a pistol drops less than a rifle; a 2.2x rig is 2.2x further away
      // heavy (hv): deeper, more canted, swung across less, rocking more with each stride
      sprintQ.setFromEuler(sprintE.set(SP.rot[0]*sb*(1+hv*.5)+Math.cos(ph*2)*.025*sw*(1+hv),SP.rot[1]*sb*(1-hv*.45)+Math.sin(ph)*.05*sw,SP.rot[2]*sb*(1+hv*.6)+Math.sin(ph)*.06*sw*(1+hv*.8)));
      tmpQ.setFromEuler(R);sprintG.copy(FRAME.grip).multiplyScalar(rig).add(frame.cur);sprintT.copy(sprintG).applyQuaternion(sprintQ);   // where the turn would take the grip
      P.add(sprintG.sub(sprintT).applyQuaternion(tmpQ));P.x+=SP.pos[0]*rig*sb+Math.sin(ph)*.35*sw*amp;P.y+=SP.pos[1]*lenK*sb*(1+hv*.9)-Math.abs(Math.cos(ph))*.3*sw*amp*(1+hv*.7);P.z+=SP.pos[2]*rig*sb*(1+hv*.4);
      sprintE.setFromQuaternion(sprintQ.premultiply(tmpQ));R.copy(sprintE);
    }
    // bob and breathing
    P.x+=bobX+brX*hip;P.y+=bobY+brY*hip;P.z+=bobZ;R.z+=bobRoll*hipR;R.x+=bobPitch*hipR+brP*hip;R.y+=bobYaw*hipR;
    // fire kick (over the engine's own recoil) and the aim settle
    R.x+=kp*.014;R.y+=ky*.005;P.z+=kz*.06;P.y+=st*.03;R.x+=st*.005;
    // reload: in, down and turned toward the player a little
    const rd=s.reload*hp;P.x+=.3*rd;P.y+=-.35*rd;P.z+=.4*rd;R.y+=.14*rd;R.z+=.1*rd;R.x+=.05*rd;
    // slide: cant the gun, pull it in and down
    const sl=s.slide*hp;P.x+=-.5*sl;P.y+=-.4*sl;P.z+=.8*sl;R.z+=.38*sl;R.x+=.06*sl;
    // dive: tuck down and roll
    const dv=s.dive*hp;P.y+=-1.4*dv;P.x+=.5*dv;R.z+=.5*dv;R.x+=-.15*dv;
    // wall jump kick
    const k=s.kick*s.kick,kg=k*hp;R.x+=.22*kg;R.z+=-.25*kg;P.y+=-.8*kg;
    // mantle: gun drops away to the right
    // (pitched down around the camera rather than moved, so the left shoulder stays in reach of the ledge)
    const g=Math.max(s.mantle*.85,mk)*hp;P.x+=1.2*g;P.y+=-1.2*g;R.x+=-.95*g;R.z+=-.35*g;R.y+=.18*g;
    // the camera: a share of the same motion, so the whole view sways with the gun (the movement mod applies it)
    // (the sprint's roll and nod halved on 2026-10-19, user: "screen shake seems a bit excessive")
    cam.roll=rl*.35*hipR+bobRoll*.3+.07*s.slide+.14*s.dive-.1*k+Math.sin(ph)*.005*sw-sx*.03*hipR;
    cam.pitch=lf*-.0025*hip+kp*.0045+Math.cos(ph*2)*.0018*sw+sy*.012*hip+.03*s.slide-.06*s.dive+.05*k;
    cam.fov=(5*s.sprintBlend*hp+3*s.slide+2*s.dive)*str;   // (the camera keeps the slide and dive cant while aiming; the gun is on the sights)
    if(!flags.cam)cam.roll=cam.pitch=cam.fov=0;
    if(!Number.isFinite(cam.roll+cam.pitch+cam.fov)){cam.roll=cam.pitch=cam.fov=0;}
    if(!Number.isFinite(P.x+P.y+P.z+R.x+R.y+R.z)){for(const k in base){s[k].x=0;s[k].v=0;}s.bobAmp=0;s.exert=0;P.set(0,0,0);R.set(0,0,0);}   // never let a bad frame stick
    view.pivot.updateMatrixWorld(true);
    // mantle: left hand reaches for the ledge and stays planted while climbing
    if(restoreArm())view.pivot.updateMatrixWorld(true);   // (the matrices must follow the bones put back)
    const handMode=view.mode==='idle'||view.mode==='sprint'||view.mode==='sprintIn'||view.mode==='sprintOut'||view.mode==='fire';
    // ---- dual wield: each arm's own motion (see DUAL above)
    if(def?.dualWield){const shots=session.shots??0;   // the gun that fired kicks (session.lastHand; the XMG fires both in one frame)
      // a fast automatic pair (the XMG, Titan Wield) kicks less per shot, or the soft per-gun springs pile the kicks up and
      // the guns climb and stay up while firing (2026-10-24, user); braced in the XMG's lockdown, less again
      const iv=(def.fireTime??.3)*(def.lockdown?2:1),fast=def.automatic?Math.min(1,(iv/.35)**2):1,braced=1-.7*(window.kino.aw?.lock??0);
      if(dual.lastShots>=0&&shots>dual.lastShots){const k=(.6+w*.5)*str*fast*braced;
        for(const D of shots-dual.lastShots>1?dual.sides:[dual.sides[session.lastHand==='left'?1:0]]){D.kickP.v+=18*k;D.kickZ.v+=14*k;}}
      dual.lastShots=shots;}
    else dual.lastShots=-1;
    dual.w=ease(dual.w,def?.dualWield&&flags.hand&&str>0&&handMode&&!mt&&!window.kino.inspect?.state?1:0,8);
    if(dual.w>.01){
      const r=view.root,vc=api.viewCamera;vc.getWorldQuaternion(dual.camQ);dual.camQi.copy(dual.camQ).invert();const rig=frame.rig,dw=dual.w;
      for(const D of dual.sides){
        const sh=r.getObjectByName('j_shoulder_'+D.side),el=r.getObjectByName('j_elbow_'+D.side),wr=r.getObjectByName('j_wrist_'+D.side),tag=r.getObjectByName(D.tag);if(!sh||!el||!wr||!tag)continue;
        const sg=D.sign;
        // this arm's own share of the lag and sway: what its (differently tuned) spring does beyond the common one
        const dyl=D.yaw.step(clamp(-yawRate*.018*amp,-.13*amp,.13*amp),dt)-yl,dpl=D.pitch.step(clamp(-pitchRate*.015*amp,-.1*amp,.1*amp),dt)-pl,dsx=D.sway.step(clamp(-accR/3000,-1,1)*1.6*amp,dt)-sx;
        const kp2=D.kickP.step(0,dt),kz2=D.kickZ.step(0,dt);
        const pump=sg*Math.sin(ph);   // the stride: the arms pump alternately, more when sprinting
        const nx=Math.sin(s.t*.9+D.i*2.1)*.6+Math.sin(s.t*1.7+D.i*.7)*.4,ny=Math.sin(s.t*.8+D.i*1.3)*.6+Math.sin(s.t*1.5+D.i*2.9)*.4;   // a slow drift of its own
        const br=Math.sin(s.breathT*(D.i?.93:1)+D.i*1.7)*bAmp;
        const walk=bA*(1-s.sprintBlend);   // the stride while walking: the arms swing alternately (fore and aft, up and down, a little roll)
        D.off.set((dyl*4*hip+dsx*.9*hip+sx*.9*hip*(1-cm)*(D.i?1:.8)+sg*DUAL.sprint.pos[0]*rig*sb+nx*.15*amp+Math.sin(ph)*.26*bA*(1-cm)*(D.i?.7:1))*rig,
          (dpl*4*hip+DUAL.sprint.pos[1]*rig*sb+pump*.3*sw*amp+pump*.45*walk+br*1.1+ny*.12*amp)*rig,
          (DUAL.sprint.pos[2]*rig*sb+pump*.7*sw*amp+pump*.5*walk+kz2*.2)*rig);
        D.rot.set(dpl*hipR+DUAL.sprint.rot[0]*sb+pump*.06*sw+pump*.03*walk+kp2*.06+br*.04+ny*.01*amp,dyl*hipR-sg*DUAL.sprint.rot[1]*sb-sg*pump*.04*sw+nx*.01*amp,sg*DUAL.sprint.rot[2]*sb-dsx*.09*hipR+(dsx+sx*(1-cm))*-.03+pump*.06*walk);
        D.off.multiplyScalar(dw);D.rot.x*=dw;D.rot.y*=dw;D.rot.z*=dw;
        // the rigid transform about the animated wrist, view space to the rig's world
        remember([sh,el,wr]);remember([tag],true);
        wr.getWorldPosition(D.p);wr.getWorldQuaternion(D.wq);
        D.qw.copy(dual.camQ).multiply(D.q.setFromEuler(D.rot)).multiply(dual.camQi);D.off.applyQuaternion(dual.camQ);
        D.M.makeRotationFromQuaternion(D.qw);D.M.setPosition(tmp.s.copy(D.p).add(D.off).sub(tmp.e.copy(D.p).applyQuaternion(D.qw)));
        // the gun: its tag moves rigidly
        D.tagM.multiplyMatrices(D.M,tag.matrixWorld);D.tmpM.copy(tag.parent.matrixWorld).invert().multiply(D.tagM);D.tmpM.decompose(tag.position,tag.quaternion,D.sc);
        // the arm reaches the moved wrist, the hand turns with the gun
        reachArm(D.side,tmp.w.copy(D.p).add(D.off),1,false);
        wr.parent.getWorldQuaternion(tmp.pq);wr.quaternion.copy(tmp.pq.invert().multiply(D.wq.premultiply(D.qw)));
        view.pivot.updateMatrixWorld(true);
        sealArm();
      }
    }
    // adaptive hands: the left hand trails the gun's quick moves a little (a spring in view space on the animated wrist)
    // and is put back on the grip by the two-bone IK, so the support hand reads as its own thing; off while reloading,
    // meleeing, inspecting or aiming (those clips and the sights own the hand)
    handLag.w=ease(handLag.w,flags.hand&&!mt?.hand&&handMode&&str>0&&!frame.oneHanded&&!window.kino.inspect?.state?1:0,8);   // eased in and out, so no pop at the edges; not on a hand that hangs free
    if(handLag.w>.01){
      const r=view.root,wl=r.getObjectByName('j_wrist_le');
      if(wl){const now=wl.getWorldPosition(handLag.tmp);
        if(!handLag.init||handLag.p.distanceTo(now)>6){handLag.p.copy(now);handLag.v.set(0,0,0);handLag.init=true;}
        else{handLag.acc.subVectors(now,handLag.p).multiplyScalar(170/lag).addScaledVector(handLag.v,-19/Math.sqrt(lag));handLag.v.addScaledVector(handLag.acc,dt);handLag.p.addScaledVector(handLag.v,dt);}
        const off=handLag.off.subVectors(handLag.p,now),max=.6*w*frame.rig,len=off.length();if(len>1e-6)off.multiplyScalar(max/(max+len));   // never off the gun: saturates smoothly at max (a hard clamp kinked)
        handLag.lag.copy(off);   // (kept apart: `off` becomes the absolute target below)
        const wgt=.55*Math.min(1,str)*(1-aim)*handLag.w;
        if(wgt>.01&&off.length()>.003){remember(['j_shoulder_le','j_elbow_le'].map(n=>r.getObjectByName(n)).filter(Boolean));reachLeft(off.add(now),wgt,false);sealArm();}
      }
    }else handLag.init=false;
    // ---- the support hand on an underbarrel attachment (2026-10-19, user: "do the hands also change when certain attachments
    // are used too?"): a foregrip, grenade launcher, Masterkey or flamethrower moves the left hand from the handguard onto the
    // part (two-bone IK to a point under it, measured once from the part's vertices in the gun's frame), the foregrip with
    // the wrist rolled to wrap a vertical grip. BO3 guns' Grip is a stat-only unlock with no part: nothing to hold.
    under.w=ease(under.w,under.kind&&flags.hand&&!mt?.hand&&handMode&&!frame.oneHanded&&!window.kino.inspect?.state?1:0,6);
    if(under.key!==view.currentId+'|'+(def?.attachments??'')){under.key=view.currentId+'|'+(def?.attachments??'');under.kind=null;under.tries=0;}
    if(!under.kind&&under.tries>=0&&view.mode==='idle'&&++under.tries>2){under.tries=-1;measureUnder(def);}
    if(under.kind&&under.w>.01){
      const r=view.root,g=r.getObjectByName('j_gun')??r.getObjectByName('tag_weapon'),wl=r.getObjectByName('j_wrist_le'),el=r.getObjectByName('j_elbow_le');
      const sh=r.getObjectByName('j_shoulder_le');
      if(g&&wl&&el&&sh){const target=under.tmp.copy(under.at).applyMatrix4(g.matrixWorld);if(handLag.w>.01&&handLag.init)target.add(handLag.lag);
        // within the arm's reach (a launcher's forward grip is further than a T5 arm goes: the hand holds it nearer the receiver)
        const sp=sh.getWorldPosition(tmp.s),reach=.95*(sp.distanceTo(el.getWorldPosition(tmp.e))+tmp.e.distanceTo(wl.getWorldPosition(tmp.w))),d=sp.distanceTo(target);if(d>reach)target.sub(sp).multiplyScalar(reach/d).add(sp);
        remember(['j_shoulder_le','j_elbow_le','j_wrist_le'].map(n=>r.getObjectByName(n)).filter(Boolean));
        reachLeft(target,Math.min(1,str>0?1:0)*under.w,false);
        if(under.roll){const axis=wl.getWorldPosition(tmp.w).sub(el.getWorldPosition(tmp.e)).normalize();   // roll the hand about the forearm
          rollQ.setFromAxisAngle(axis,under.roll*under.w);wl.getWorldQuaternion(tmp.q);const world=rollQ.multiply(tmp.q);wl.parent.getWorldQuaternion(tmp.pq);wl.quaternion.copy(tmp.pq.invert().multiply(world));view.pivot.updateMatrixWorld(true);}
        sealArm();}
    }
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
