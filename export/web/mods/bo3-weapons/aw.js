// Advanced Warfare guns (the BO3 workshop pack, docs/fork/advanced-warfare.md): their two moving extras.
//
// - A second form on the same model (def.attachment.altForm, the OHM's shotgun): the engine's attachment toggle
//   (key 5) swaps the definition; here the change plays the gun folding open (attachInAnim on the new form's rig)
//   or shut (attachOutAnim on the LMG's) in place of the raise.
// - The XMG's lockdown (def.lockdown): aiming folds both arm guns into their braced pose. The pack has only the
//   fold-in and fold-out clips (no lockdown idle or fire), so they ride on top of whatever plays as additive
//   layers held at the blend's point, the fire clips still kicking underneath. Locked down, you barely walk.
import * as THREE from 'three';

const SLOW=.35;   // walking speed while fully locked down

export function setupAw(api){
  const {host,session,view,player}=api;

  const toggle=session.toggleAttachment.bind(session);
  session.toggleAttachment=(...args)=>{
    const was=session.attachmentMode,form=was?session.def.altForm:session.def.attachment?.altForm,ok=toggle(...args);
    if(ok&&form)view.raiseWith=was?'attachOutAnim':'attachInAnim';
    return ok;
  };

  let lock=0,falling=false,rig=null,acts=null;
  const layer=(clip,ref)=>{
    const add=THREE.AnimationUtils.makeClipAdditive(clip.clone(),0,ref,30),a=rig.mixer.clipAction(add);
    a.blendMode=THREE.AdditiveAnimationBlendMode;a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.play();a.paused=true;a.setEffectiveWeight(0);return a;
  };
  host.on('update',dt=>{
    const def=view.def;
    if(!def?.lockdown||!view.ready||!view.rig){lock=0;return;}
    if(view.rig!==rig){
      rig=view.rig;lock=0;falling=false;const a=rig.actions.lockdownInAnim,b=rig.actions.lockdownOutAnim;
      acts=a&&b?{in:layer(a.getClip(),a.getClip()),out:layer(b.getClip(),a.getClip())}:null;   // both measured from the fold-in's first frame (the idle grip)
    }
    if(!acts)return;
    const want=!!view.input?.ads&&['idle','fire'].includes(view.mode)&&!(session.reloadLeft>0),din=acts.in.getClip().duration,dout=acts.out.getClip().duration;
    if(want&&falling)falling=false;else if(!want&&!falling&&lock>0)falling=true;
    lock=THREE.MathUtils.clamp(lock+(want?dt/din:-dt/dout),0,1);
    acts.in.setEffectiveWeight(falling||lock===0?0:1);acts.out.setEffectiveWeight(falling&&lock>0?1:0);
    acts.in.time=lock*din;acts.out.time=(1-lock)*dout;
  });
  host.on('reset',()=>{lock=0;falling=false;});

  // the walk slows with the lockdown (layered over the other speed getters, like the Siren's Soma-81)
  for(const key of ['moveSpeed','sprintSpeed']){
    if(!player)break;
    const d=Object.getOwnPropertyDescriptor(player,key);let base=player[key];
    Object.defineProperty(player,key,{configurable:true,get:()=>(d?.get?d.get():base)*(1-(1-SLOW)*lock),set:v=>{if(d?.set)d.set(v);else base=v;}});
  }
  window.kino.aw={get lock(){return lock;}};
}
