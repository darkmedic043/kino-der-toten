// First-person weapon motion in the style of Black Ops 6/7, layered on top of
// the viewmodel after the game's own update (view.update sets the pivot fresh
// every frame, then this adds to it):
// - look inertia: the gun lags a little behind fast mouse turns;
// - movement: strafe roll, jump lift and a springy landing dip;
// - slide: gun canted and pulled in; dive: tucked down and rolled;
// - wall jump: a sharp kick;
// - mantle: the gun drops away to the right while the left hand reaches out
//   and plants on the ledge (two-bone IK on the viewmodel's left arm), then
//   the gun comes back up. BO1 has no traversal animations, so all of this is
//   procedural.
import * as THREE from 'three';

export function setupFirstPerson(api,state){
  const {host,view,camera,player,session}=api;
  if(!view)return;
  const spring=(k,c)=>({x:0,v:0,step(target,dt){this.v+=((target-this.x)*k-this.v*c)*dt;this.x+=this.v*dt;return this.x;}});
  const s={yawLag:spring(90,14),pitchLag:spring(90,14),roll:spring(60,11),lift:spring(70,9),slide:0,dive:0,mantle:0,kick:0};
  let lastYaw=camera.rotation.y,lastPitch=camera.rotation.x,wasGrounded=true,lastVy=0;
  host.on('walljump',()=>{s.kick=1;});
  window.kino.fpMotion={s,reachLeft};
  host.on('diveLand',()=>{s.lift.v-=40;});

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
  function reachLeft(target,weight){
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
    for(const b of handBones(root)){const bind=bindLocal(b);if(bind)b.quaternion.slerp(bind,weight);}
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

  host.on('update',dt=>{
    if(!dt||!view.pivot||!view.ready)return;
    const aim=view.aim??0,hip=1-aim*.85;   // aiming keeps the gun steady
    // look inertia
    let dy=camera.rotation.y-lastYaw,dx=camera.rotation.x-lastPitch;lastYaw=camera.rotation.y;lastPitch=camera.rotation.x;
    if(dy>Math.PI)dy-=Math.PI*2;if(dy<-Math.PI)dy+=Math.PI*2;
    const yl=s.yawLag.step(THREE.MathUtils.clamp(-dy/dt*.012,-.09,.09),dt),pl=s.pitchLag.step(THREE.MathUtils.clamp(-dx/dt*.01,-.07,.07),dt);
    // strafe roll
    const v=player.velocity,right=v.x*Math.cos(camera.rotation.y)-v.z*Math.sin(camera.rotation.y);
    const rl=s.roll.step(THREE.MathUtils.clamp(-right/285*.06,-.07,.07),dt);
    // jump lift and landing dip
    const grounded=player.onFloor;
    if(!grounded&&wasGrounded&&v.y>50)s.lift.v-=10;          // takeoff: gun sinks
    if(grounded&&!wasGrounded&&lastVy<-200)s.lift.v-=Math.min(45,-lastVy*.09);   // landing
    wasGrounded=grounded;lastVy=v.y;
    const lf=s.lift.step(0,dt);
    // stance blends
    const ease=(x,to,rate)=>x+(to-x)*Math.min(1,dt*rate);
    s.slide=ease(s.slide,state.sliding?1:0,state.sliding?12:6);
    s.dive=ease(s.dive,state.diving?1:0,state.diving?10:5);
    const mt=state.mantling,mk=mt?Math.sin(Math.min(1,mt.t)*Math.PI):0;   // up and back down over the climb
    s.mantle=ease(s.mantle,mt?1:0,mt?14:7);
    s.kick=Math.max(0,s.kick-dt*3.5);

    const P=view.pivot.position,R=view.pivot.rotation;
    P.x+=yl*4*hip;P.y+=pl*4*hip+lf*.06;
    R.y+=yl*hip;R.x+=pl*hip+lf*-.004;R.z+=rl*hip;
    // slide: cant the gun, pull it in and down
    P.x+=-.5*s.slide;P.y+=-.4*s.slide;P.z+=.8*s.slide;R.z+=.38*s.slide;R.x+=.06*s.slide;
    // dive: tuck down and roll
    P.y+=-1.4*s.dive;P.x+=.5*s.dive;R.z+=.5*s.dive;R.x+=-.15*s.dive;
    // wall jump kick
    const k=s.kick*s.kick;R.x+=.22*k;R.z+=-.25*k;P.y+=-.8*k;
    // mantle: gun drops away to the right
    // (pitched down around the camera rather than moved, so the left shoulder stays in reach of the ledge)
    const g=Math.max(s.mantle*.85,mk);P.x+=1.2*g;P.y+=-1.2*g;R.x+=-.95*g;R.z+=-.35*g;R.y+=.18*g;
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
