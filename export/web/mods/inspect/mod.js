// Weapon inspect: hold reload (R, or X on a controller) for 0.35 s. engine.js emits 'inspect'
// on the hold; a tap still reloads (on release; at once when the mag is empty).
// Guns with def.animations.inspectAnim (the BO3 imports, from their vm_*_inspect XAnims) play it
// in the view's own 'inspect' mode, which animation.js leaves alone (no idle/sprint/ADS changes).
// Every other gun gets an inspect of its own, put together by scripts.js from what that gun has:
// its first-raise flourish (the slide rack, cylinder spin or bolt pull BO1 authored and the game never
// played), a magazine check scrubbed out of its reload clip and back, its pump or bolt, and a set of
// poses the view pivot moves through about the gun. This file runs the plan: the pose track after
// view.update each frame, the clips scrubbed by hand (time scale 0, so their notetracks are fired
// here, mirrored when a clip runs backwards), and small extras on single bones.
// Firing, reloading, melee, switching, aiming or sprinting cancels it.
import * as THREE from 'three';
import { buildInspect } from './scripts.js';

const smooth=x=>x*x*(3-2*x);
// a clip run backwards plays the opposite sound where the gun has one (mag out → mag in)
const SWAP=[['mag_out','mag_in'],['clip_out','clip_in'],['magout','magin'],['open','close'],['pull','push'],['back','forward'],['_out','_in'],['_up','_down']];

export default function setup(api){
  const {host,session,view}=api;
  let insp=null;
  const busy=()=>!view.ready||session.weaponUnavailable||session.reloadLeft>0||session.meleeLeft>0||session.drinking||session.phase==='reviving'||session.phase==='gameover';
  const idleKey=()=>session.weapon?.mag===0&&view.rig.actions.emptyIdleAnim?'emptyIdleAnim':'idleAnim';

  // the gun's own bounds, in the space of its root bone: a pose turns the gun about its middle and sets it at a
  // distance that fits its outline to the screen
  const sizes=new WeakMap(),box=new THREE.Box3(),bb=new THREE.Box3(),m4=new THREE.Matrix4(),inv=new THREE.Matrix4();
  function measure(gun){
    if(!gun)return null;
    if(sizes.has(gun))return sizes.get(gun);
    const ref=gun.getObjectByName('j_gun')??gun.getObjectByName('j_gun1')??gun.getObjectByName('tag_weapon')??gun;
    gun.updateWorldMatrix(true,true);inv.copy(ref.matrixWorld).invert();box.makeEmpty();
    gun.traverse(o=>{
      if(!o.isMesh||!o.geometry||!o.visible||o.userData.charm)return;
      if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();
      bb.copy(o.geometry.boundingBox);
      if(o.isSkinnedMesh&&o.skeleton?.bones.length){
        let k=o.skeleton.bones.indexOf(ref);const own=k>=0;if(!own)k=0;
        bb.applyMatrix4(o.bindMatrix).applyMatrix4(o.skeleton.boneInverses[k]);
        if(!own)bb.applyMatrix4(m4.multiplyMatrices(inv,o.skeleton.bones[0].matrixWorld));
      }else bb.applyMatrix4(m4.multiplyMatrices(inv,o.matrixWorld));
      if(isFinite(bb.min.x)&&isFinite(bb.max.x))box.union(bb);
    });
    const out=box.isEmpty()?null:{ref,c:box.getCenter(new THREE.Vector3()),h:box.getSize(new THREE.Vector3()).multiplyScalar(.5)};
    sizes.set(gun,out);return out;
  }
  function begin(plan){
    const clip=!plan;
    insp={clip,plan,id:view.currentId,shots:session.shots,t:0,dur:clip?(view.rig.data.inspectAnim?.duration??3):plan.dur,beat:-1,ct:null,bones:new Map()};
    insp.size=measure(view.gun)||{ref:view.gun,c:new THREE.Vector3(),h:new THREE.Vector3(9,3,2)};insp.sizeL=view.leftGun?measure(view.leftGun):null;
    view.mode='inspect';
    if(clip)view.rig.play('inspectAnim',false,1,.12);else view.rig.play(idleKey(),true,1,.1);
  }
  host.on('inspect',()=>{
    if(insp||busy()||!['idle','fire'].includes(view.mode)||view.aim>.05||view.input?.sprint)return;
    if(view.rig?.actions.inspectAnim){begin(null);return;}
    let plan=null;try{plan=buildInspect(view,session.def??view.def);}catch(e){console.warn('[inspect]',e);}
    if(plan)begin(plan);
  });
  function stop(){
    if(!insp)return;
    for(const [b,s] of insp.bones)if(b.quaternion.equals(s.last))b.quaternion.copy(s.base);
    if(view.mode==='inspect'){view.mode='idle';if(!insp.clip)view.rig.play(idleKey(),true,1,.2);}
    insp=null;
  }
  // an extra turn on one bone, on top of whatever the clip wrote this frame (one extra per bone at a time)
  function bend(bone,q){
    let s=insp.bones.get(bone);if(!s){s={base:bone.quaternion.clone(),last:new THREE.Quaternion(9,9,9,9)};insp.bones.set(bone,s);}
    if(bone.quaternion.equals(s.last))bone.quaternion.copy(s.base);else s.base.copy(bone.quaternion);
    bone.quaternion.multiply(q);s.last.copy(bone.quaternion);
  }
  const reverseNote=(name,all)=>{for(const [a,b] of SWAP){if(name.includes(a)){const n=name.replace(a,b);if(all.has(n))return n;}if(name.includes(b)){const n=name.replace(b,a);if(all.has(n))return n;}}return name;};

  const q=new THREE.Quaternion(),qb=new THREE.Quaternion(),e=new THREE.Euler(),g=new THREE.Vector3(),g2=new THREE.Vector3(),off=new THREE.Vector3(),lift=new THREE.Vector3(),ax=new THREE.Vector3(),mid=new THREE.Vector3(),sep=new THREE.Vector3(),home=new THREE.Vector3();
  host.on('update',dt=>{
    if(!insp)return;
    insp.t+=dt;
    if(view.currentId!==insp.id||session.shots!==insp.shots||busy()||view.input?.sprint||view.input?.ads||view.mode!=='inspect'||insp.t>=insp.dur){stop();return;}
    if(insp.clip)return;
    const P=insp.plan,t=insp.t,rig=view.rig;
    // clips: the beat under the cursor is scrubbed by hand
    let bi=-1;for(let i=0;i<P.beats.length;i++)if(t>=P.beats[i].at&&t<P.beats[i].end)bi=i;
    if(bi!==insp.beat){
      if(bi>=0){const b=P.beats[bi];if(rig.current!==b.key)rig.play(b.key,false,0,b.fade??.22);else rig.actions[b.key].timeScale=0;insp.ct=null;}
      else rig.play(idleKey(),true,1,.25);
      insp.beat=bi;
    }
    if(bi>=0){
      const b=P.beats[bi],a=rig.actions[b.key];let u=t-b.at,ct=b.segs.at(-1).to;
      for(const s of b.segs){if(u<s.dur){ct=s.from+(s.to-s.from)*(s.ease?smooth(u/s.dur):u/s.dur);break;}u-=s.dur;}
      a.time=ct;
      const prev=insp.ct;
      if(prev!=null&&prev!==ct)for(const n of rig.data[b.key].notifies??[]){
        if(!n.name.startsWith('sndnt#'))continue;
        if(prev<n.time&&n.time<=ct)rig.onNotify(n.name,b.key);
        else if(ct<n.time&&n.time<=prev)rig.onNotify(reverseNote(n.name,P.notes),b.key);
      }
      insp.ct=ct;
    }
    // extras: sounds and single-bone turns
    for(const x of P.fx){
      if(x.sound){if(!x.done&&t>=x.at){x.done=true;rig.onNotify(x.sound,rig.current);}continue;}
      if(t<x.at||x.over)continue;
      x.node??=view.root.getObjectByName(x.bone)??view.leftGun?.getObjectByName(x.bone)??null;if(!x.node)continue;
      const k=Math.min(1,(t-x.at)/x.dur);
      const ang=x.swing?Math.sin(k*Math.PI*2*(x.beats??1))*x.swing*(1-k):(x.turns??1)*Math.PI*2*(x.linear?k:smooth(k));
      bend(x.node,qb.setFromAxisAngle(ax.fromArray(x.axis??[1,0,0]),ang));
      if(k>=1){x.over=true;const s=insp.bones.get(x.node);if(s&&x.node.quaternion.equals(s.last))x.node.quaternion.copy(s.base);insp.bones.delete(x.node);}
    }
    // poses: rotate the pivot about the gun (between the two guns of a pair)
    const K=P.pose;let i=0;while(i<K.length-2&&t>K[i+1].t)i++;
    const a=K[i],b=K[i+1],k=smooth(THREE.MathUtils.clamp((t-a.t)/Math.max(1e-4,b.t-a.t),0,1));
    const mix=(x,y)=>x.map((v,j)=>v+(y[j]-v)*k);
    const r=mix(a.r,b.r),at=mix(a.at,b.at),fill=a.fill+(b.fill-a.fill)*k,wgt=(a.w??1)+((b.w??1)-(a.w??1))*k;
    const S=insp.size;if(!S)return;
    const fd=S.h.x>28?1.7:1.25,far=(a.far??fd)+((b.far??fd)-(a.far??fd))*k;   // the BO3-size rigs have whole forearms: they can go further out
    view.pivot.updateMatrixWorld(true);mid.copy(S.c).applyMatrix4(S.ref.matrixWorld);sep.set(0,0,0);
    const L=view.leftGun&&insp.sizeL;
    if(L){g2.copy(L.c).applyMatrix4(L.ref.matrixWorld);sep.subVectors(mid,g2);mid.add(g2).multiplyScalar(.5);}
    // where it rests (kept from the start): a clip's own travel stays on top of the pose
    insp.home??=view.pivot.worldToLocal(mid.clone());home.copy(insp.home).applyMatrix4(view.pivot.matrixWorld);
    const d0=-home.z;
    // turn about the middle
    q.setFromEuler(e.set(r[0],r[1],r[2]));view.pivot.worldToLocal(g.copy(mid));
    off.copy(g).sub(g2.copy(g).applyQuaternion(q)).applyQuaternion(view.pivot.quaternion);
    view.pivot.position.add(off);view.pivot.quaternion.multiply(q);
    const cam=api.viewCamera,fh=2*Math.tan(THREE.MathUtils.degToRad(cam?.fov??51)/2),fw=fh*(cam?.aspect??16/9);
    if(wgt>.001&&d0>1){
      // its outline as turned, then the distance that fits it
      view.pivot.updateMatrixWorld(true);
      let dx=0,dy=0;
      for(let n=0;n<8;n++){
        g.set(S.c.x+(n&1?S.h.x:-S.h.x),S.c.y+(n&2?S.h.y:-S.h.y),S.c.z+(n&4?S.h.z:-S.h.z)).applyMatrix4(S.ref.matrixWorld);
        g2.copy(S.c).applyMatrix4(S.ref.matrixWorld);
        dx=Math.max(dx,Math.abs(g.x-g2.x));dy=Math.max(dy,Math.abs(g.y-g2.y));
      }
      if(L){sep.applyQuaternion(q);dx+=Math.abs(sep.x)/2;dy+=Math.abs(sep.y)/2;}
      let d=Math.max(2*dx/(fill*fw),2*dy/(fill*fh));
      d=THREE.MathUtils.clamp(d,d0*.85,d0*far);
      lift.set(at[0]*d*fw/2,at[1]*d*fh/2,-d).sub(home).multiplyScalar(wgt);
      view.pivot.position.add(lift);
    }
    view.pivot.updateMatrixWorld(true);
    // a clip that carries the gun out of sight (a first raise starts below the screen) is held in the frame
    mid.copy(S.c).applyMatrix4(S.ref.matrixWorld);if(L)mid.add(g2.copy(L.c).applyMatrix4(L.ref.matrixWorld)).multiplyScalar(.5);
    if(mid.z<-1){
      const hx=-mid.z*fw*.4,hy=-mid.z*fh*.31;
      g.set(THREE.MathUtils.clamp(mid.x,-hx,hx)-mid.x,THREE.MathUtils.clamp(mid.y,-hy,hy)-mid.y,0);
      (insp.keep??=new THREE.Vector3()).lerp(g,1-Math.exp(-14*dt));
      if(insp.keep.lengthSq()>1e-4){view.pivot.position.add(insp.keep);view.pivot.updateMatrixWorld(true);}
    }
  });
  host.on('reset',()=>{insp=null;});
  window.kino.inspect={get state(){return insp&&{clip:insp.clip,id:insp.id,size:insp.size&&[...insp.size.c.toArray(),...insp.size.h.toArray()].map(v=>+v.toFixed(1)),t:insp.t,dur:insp.dur,beat:insp.beat,name:insp.plan?.name};},
    plan:()=>buildInspect(view,session.def??view.def),play(plan){if(!insp&&view.ready)begin(plan);},stop};
}
