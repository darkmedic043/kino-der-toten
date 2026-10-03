// Spring bones (not part of upstream): dangling chains such as a coat's tails swing with
// the body, sag under gravity and are pushed out of the legs, like the VRChat physbones the
// models ship with. Configured per character in characters.json:
//   "springBones": {
//     "chains": ["Coat_Back_L_0", ...],        // first simulated bone of each chain
//     "stiffness": .08, "drag": .12,          // pull back to the animated pose / velocity loss per 60 Hz step
//     "gravity": .5,                          // m/s² × 9.8 in the model's own units
//     "maxAngle": 60, "radius": .05,          // degrees from the animated pose; joint radius (model units)
//     "mode": "drag",                        // a heavy rope instead of a spring: each joint just trails the one before it,
//                                             // sags at "sag" m/s and lies on the floor (a tail dragging on the ground)
//     "drive": {"legs": ["Left leg", "Right leg"], "weights": {"Coat_Front": .7, ...}}
//                                             // a chain's rest shape turns with its nearest thigh (by chain-name prefix):
//                                             // the leg carries a coat panel instead of passing through it
//     "floor": true,                          // keep the chain above the character's feet (a tail dragging on the ground)
//     "follow": .85,                          // share of the body's own movement/turning the chains just ride along with
//                                             // (0 = full world inertia: snap turns and sprint starts fling them)
//     "colliders": [{"bone": "Left leg", "to": "Left knee", "radius": .16}, ...]   // capsules on the body;
//                                             // each is capped per joint at that joint's rest distance, so it
//                                             // stops the chain sinking into the body but never pushes it out
//   }
// Positions are simulated in world space, so running, turning and jumping all drag the chains.
import * as THREE from 'three';

const STEP=1/60;
const distToSegment=(p,a,b)=>{if(!b)return p.distanceTo(a);const ab=b.clone().sub(a),t=THREE.MathUtils.clamp(p.clone().sub(a).dot(ab)/Math.max(1e-6,ab.lengthSq()),0,1);return p.distanceTo(a.clone().addScaledVector(ab,t));};

export class SpringBones {
  constructor(model,config){
    this.model=model;this.config=config;this.joints=[];this.colliders=[];this.time=0;this.ready=false;
    // three's glTF loader renames nodes ("Left leg" → "Left_leg"): accept either spelling. Leg colliders
    // named with spaces used to be silently dropped, so the coat never collided with the legs.
    const byName=n=>model.getObjectByName(n)??model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(n));
    const next=b=>b.children.find(c=>c.isBone&&(config.childMatch?new RegExp(config.childMatch).test(c.name):true))??b.children.find(c=>c.isBone);
    for(const name of config.chains??[]){
      let b=byName(name);
      while(b){const c=next(b);if(!c)break;this.joints.push({anchor:byName(name).parent,bone:b,child:c,rest:b.quaternion.clone(),childLocal:c.position.clone(),p:new THREE.Vector3(),prev:new THREE.Vector3()});b=c;}
    }
    // Leg drive: each chain whose root name matches a weight follows the nearest listed leg.
    const dv=config.drive,legs=(dv?.legs??[]).map(byName).filter(Boolean);
    if(legs.length){model.updateMatrixWorld(true);const wq=o=>o.getWorldQuaternion(new THREE.Quaternion()),wp=o=>o.getWorldPosition(new THREE.Vector3());
      const byRoot=new Map();
      for(const name of config.chains??[]){const root=byName(name);if(!root)continue;
        const w=Object.entries(dv.weights??{}).find(([k])=>name.startsWith(k))?.[1];if(!w)continue;
        const leg=legs.slice().sort((a,b)=>wp(a).distanceTo(wp(root))-wp(b).distanceTo(wp(root)))[0];
        byRoot.set(root,{leg,hips:leg.parent,weight:w,rel0:wq(leg.parent).invert().multiply(wq(leg))});}
      for(const j of this.joints){let r=j.bone;while(r&&!byRoot.has(r))r=r.parent;if(r)j.drive=byRoot.get(r);}
    }
    for(const c of config.colliders??[]){const a=byName(c.bone),b=c.to?byName(c.to):null;if(a)this.colliders.push({a,b,radius:c.radius??.1});}
  }
  // Model units → world units (the model is resized to fit the character's height).
  scale(){return this.model.getWorldScale(new THREE.Vector3()).y;}
  reset(){
    for(const j of this.joints){j.bone.quaternion.copy(j.rest);j.bone.updateWorldMatrix(true,false);j.child.updateWorldMatrix(false,false);
      j.child.getWorldPosition(j.p);j.prev.copy(j.p);}
    // Per-joint collider radii: no more than the joint's distance from the capsule at rest.
    const s=this.scale(),radius=(this.config.radius??.05)*s;
    for(const j of this.joints)j.reach=this.colliders.map(c=>{const a=c.a.getWorldPosition(new THREE.Vector3()),b=c.b?c.b.getWorldPosition(new THREE.Vector3()):null;
      return Math.min(c.radius*s+radius,distToSegment(j.p,a,b)*.97);});
    this.ready=true;
  }
  update(dt){
    if(!this.joints.length)return;
    this.model.parent?.updateWorldMatrix(true,false);this.model.updateMatrixWorld(true);   // after the rig posed the body
    if(!this.ready)return this.reset();
    // Teleports and long hitches would fling the chains; start over instead.
    const root=this.joints[0].bone.getWorldPosition(new THREE.Vector3());
    if(this.last&&root.distanceTo(this.last)>this.scale()*2){this.last=root;return this.reset();}
    this.last=root;
    this.time=Math.min(this.time+dt,STEP*3);
    while(this.time>=STEP){this.time-=STEP;this.step();}
  }
  step(){
    const cfg=this.config,s=this.scale(),stiff=cfg.stiffness??.08,drag=cfg.drag??.12,radius=(cfg.radius??.05)*s;
    const gravity=new THREE.Vector3(0,-(cfg.gravity??.5)*9.8*s*STEP*STEP,0),maxAngle=THREE.MathUtils.degToRad(cfg.maxAngle??60);
    const head=new THREE.Vector3(),restTail=new THREE.Vector3(),dir=new THREE.Vector3(),want=new THREE.Vector3();
    // Floor: the character root (holder) sits at the feet.
    const holder=this.model.parent?.parent,floorY=cfg.floor&&holder?holder.getWorldPosition(new THREE.Vector3()).y+radius:null;
    const ground=this.ground;   // optional (x,y,z) => ground height under that point (the level), else the feet plane
    const caps=this.colliders.map(c=>({a:c.a.getWorldPosition(new THREE.Vector3()),b:c.b?c.b.getWorldPosition(new THREE.Vector3()):null,r:c.radius*s}));
    const pq=new THREE.Quaternion(),q=new THREE.Quaternion(),seg=new THREE.Vector3(),cp=new THREE.Vector3();
    // Carry the simulated points along with the body (the chain's anchor bone) by `follow`.
    const follow=cfg.follow??.85,moved=new Map();
    for(const j of this.joints){
      let D=moved.get(j.anchor);
      if(D===undefined){const now=j.anchor.matrixWorld.clone();D=j.anchor.userData.springLast?now.clone().multiply(j.anchor.userData.springLast.clone().invert()):null;j.anchor.userData.springLast=now;moved.set(j.anchor,D);}
      // followY: the share of vertical body motion carried (stairs, jumps); 1 = it never flings the chain up
      if(D&&(follow>0||cfg.followY)){const fy=cfg.followY??follow;for(const v of [j.p,j.prev]){const m=v.clone().applyMatrix4(D);v.x+=(m.x-v.x)*follow;v.z+=(m.z-v.z)*follow;v.y+=(m.y-v.y)*fy;}}
    }
    for(const j of this.joints){
      // The animated (rest) pose under the current parent: where the tail would be.
      j.bone.quaternion.copy(j.rest);j.bone.updateWorldMatrix(false,false);
      j.bone.getWorldPosition(head);restTail.copy(j.childLocal).applyMatrix4(j.bone.matrixWorld);
      const len=restTail.distanceTo(head);
      if(j.drive){   // turn the rest shape by part of the thigh's swing (relative to the hips)
        const d=j.drive,hq=d.hips.getWorldQuaternion(new THREE.Quaternion()),rel=hq.clone().invert().multiply(d.leg.getWorldQuaternion(new THREE.Quaternion()));
        const D=hq.clone().multiply(rel.multiply(d.rel0.clone().invert())).multiply(hq.clone().invert());
        restTail.sub(head).applyQuaternion(new THREE.Quaternion().slerp(D,d.weight)).add(head);
      }
      if(cfg.mode==='drag')want.copy(j.p).y-=(cfg.sag??2)*s*STEP;   // rope: stay where it was, sink towards the floor
      // Verlet: inertia (less drag), a pull back to the animated pose, gravity.
      else want.copy(j.p).sub(j.prev).multiplyScalar(1-drag).add(j.p).addScaledVector(restTail.clone().sub(j.p),stiff).add(gravity);
      // Keep the bone length, and within maxAngle of the (leg-driven) animated direction.
      dir.copy(want).sub(head).normalize();const restDir=restTail.clone().sub(head).normalize();
      const angle=dir.angleTo(restDir);
      if(cfg.mode!=='drag'&&angle>maxAngle){const axis=new THREE.Vector3().crossVectors(restDir,dir).normalize();if(axis.lengthSq()>0)dir.copy(restDir).applyAxisAngle(axis,maxAngle);}
      want.copy(head).addScaledVector(dir,len);
      // Then the body has the last word (after the angle limit, which used to pull panels back
      // into a swinging leg): push the tip, and the segment's midpoint (twice as hard, as the tip
      // swings twice as far), out of the capsules.
      const mid=new THREE.Vector3();
      caps.forEach((c,ci)=>{const r=j.reach?.[ci]??c.r+radius;
        for(const at of [1,.5]){const q=at===1?want:mid.copy(head).lerp(want,.5);
          if(c.b){seg.copy(c.b).sub(c.a);const t=THREE.MathUtils.clamp(q.clone().sub(c.a).dot(seg)/Math.max(1e-6,seg.lengthSq()),0,1);cp.copy(c.a).addScaledVector(seg,t);}else cp.copy(c.a);
          const d=q.distanceTo(cp);if(d<r&&d>1e-6)want.addScaledVector(q.clone().sub(cp).normalize(),(r-d)/at);}
      });
      // Rest on the ground: no bounce, and friction (lose most of the sliding speed).
      const fy=floorY==null?null:ground?(ground(want.x,want.y,want.z)??floorY-radius)+radius:floorY;
      if(fy!=null&&want.y<fy){want.y=fy;j.prev.y=Math.max(j.prev.y,fy);j.prev.x+=(want.x-j.prev.x)*(cfg.friction??.6);j.prev.z+=(want.z-j.prev.z)*(cfg.friction??.6);}
      dir.copy(want).sub(head).normalize();want.copy(head).addScaledVector(dir,len);
      j.prev.copy(j.p);j.p.copy(want);
      // Turn the bone from the animated direction to the simulated one (in world space).
      q.setFromUnitVectors(restDir,dir);j.bone.parent.getWorldQuaternion(pq);
      j.bone.quaternion.premultiply(pq.clone().invert().multiply(q).multiply(pq));
      j.bone.updateWorldMatrix(false,false);
    }
    // Children of the last joints (tips) follow.
    for(const j of this.joints)j.child.updateWorldMatrix(false,true);
  }
}
