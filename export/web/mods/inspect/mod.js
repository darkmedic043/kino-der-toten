// Weapon inspect: hold reload (R, or X on a controller) for 0.35 s. engine.js emits 'inspect'
// on the hold; a tap still reloads (on release; at once when the mag is empty).
// Guns with def.animations.inspectAnim (the BO3 imports, from their vm_*_inspect XAnims) play it
// in the view's own 'inspect' mode, which animation.js leaves alone (no idle/sprint/ADS changes).
// Everything else (BO1 guns have no inspect anims) turns the gun over in the hands: the view
// pivot is rotated about the gun after view.update each frame. Firing, reloading, melee,
// switching, aiming or sprinting cancels it.
import * as THREE from 'three';

// procedural pose keys: t (0..1 of the inspect), Euler [pitch, yaw, roll] (rad), lift [x, y, z] (view units)
const KEYS=[
  {t:0,r:[0,0,0],p:[0,0,0]},
  {t:.22,r:[.1,.48,.42],p:[-1.5,1.2,-1.5]},     // bring it up and turn the left side toward you
  {t:.48,r:[.13,.53,.46],p:[-1.6,1.3,-1.5]},
  {t:.68,r:[-.04,-.3,-.3],p:[-.5,.8,-1]},  // roll it over to the right side
  {t:.86,r:[-.05,-.33,-.33],p:[-.5,.9,-1]},
  {t:1,r:[0,0,0],p:[0,0,0]}];
const PROC_TIME=2.8;
const smooth=x=>x*x*(3-2*x);

export default function setup(api){
  const {host,session,view}=api;
  let insp=null;
  const busy=()=>!view.ready||session.weaponUnavailable||session.reloadLeft>0||session.meleeLeft>0||session.drinking||session.phase==='reviving'||session.phase==='gameover';

  host.on('inspect',()=>{
    if(insp||busy()||!['idle','fire'].includes(view.mode)||view.aim>.05||view.input?.sprint)return;
    const clip=!!view.rig?.actions.inspectAnim;
    insp={clip,id:view.currentId,shots:session.shots,t:0,dur:clip?(view.rig.data.inspectAnim?.duration??3):PROC_TIME};
    if(clip){view.mode='inspect';view.rig.play('inspectAnim',false,1,.12);}
  });
  const stop=()=>{if(insp?.clip&&view.mode==='inspect')view.mode='idle';insp=null;};

  const q=new THREE.Quaternion(),e=new THREE.Euler(),g=new THREE.Vector3(),off=new THREE.Vector3(),lift=new THREE.Vector3();
  host.on('update',dt=>{
    if(!insp)return;
    insp.t+=dt;
    if(view.currentId!==insp.id||session.shots!==insp.shots||busy()||view.input?.sprint||view.input?.ads||(insp.clip&&view.mode!=='inspect')||insp.t>=insp.dur){stop();return;}
    if(insp.clip)return;
    // procedural: interpolate the pose keys and rotate the pivot about the gun
    const u=insp.t/insp.dur;let i=0;while(i<KEYS.length-2&&u>KEYS[i+1].t)i++;
    const a=KEYS[i],b=KEYS[i+1],k=smooth(THREE.MathUtils.clamp((u-a.t)/(b.t-a.t),0,1));
    const lerp=(x,y)=>x.map((v,j)=>v+(y[j]-v)*k);
    const r=lerp(a.r,b.r),p=lerp(a.p,b.p);
    const gun=view.root?.getObjectByName('j_gun')??view.root?.getObjectByName('tag_weapon');if(!gun)return;
    view.pivot.updateMatrixWorld(true);view.pivot.worldToLocal(gun.getWorldPosition(g));   // gun centre in pivot space
    q.setFromEuler(e.set(r[0],r[1],r[2]));
    off.copy(g).sub(g.clone().applyQuaternion(q)).add(lift.fromArray(p)).applyQuaternion(view.pivot.quaternion);
    view.pivot.position.add(off);view.pivot.quaternion.multiply(q);
    view.pivot.updateMatrixWorld(true);
  });
  host.on('reset',()=>{insp=null;});
  window.kino.inspect={get state(){return insp&&{...insp};}};
}
