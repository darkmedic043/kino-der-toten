// First-person arms from a character's own model (not part of upstream).
// Weapon animations only exist for the T5 viewmodel arm skeleton, so that rig
// keeps running (hidden) and the character's arm bones are posed onto it each
// frame: shoulder/elbow/wrist directions, the wrist position (so the hands stay
// on the gun), the palm orientation and every finger segment. The rest of the
// character's body is collapsed out of view.
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const FINGERS=[['thumb',/thumb/i],['index',/index/i],['mid',/mid/i],['ring',/ring/i],['pinky',/little|pinky/i]];
const _a=new THREE.Vector3(),_b=new THREE.Vector3(),_q=new THREE.Quaternion(),_p=new THREE.Quaternion();
const pos=(o,out=new THREE.Vector3())=>o.getWorldPosition(out);
const firstChild=b=>b?.children.find(c=>c.isBone)??null;

// Rotate `bone` (a world-space delta) so its segment direction `from` becomes `to`.
function rotateWorld(bone,delta){
  bone.parent.getWorldQuaternion(_p);
  bone.quaternion.premultiply(_p.clone().invert().multiply(delta).multiply(_p)).normalize();
  bone.updateWorldMatrix(false,true);
}
function aim(bone,childDir,to){rotateWorld(bone,_q.setFromUnitVectors(childDir.normalize(),_a.copy(to).normalize()));}
function handBasis(wrist,mid,index,little){
  const f=_a.copy(mid).sub(wrist).normalize(),l=_b.copy(index).sub(little).normalize();
  const up=new THREE.Vector3().crossVectors(f,l).normalize(),side=new THREE.Vector3().crossVectors(up,f).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.clone(),up,side));
}

export class FirstPersonArms {
  // gltf: the loaded character (from characters.js); entry: its registry entry.
  constructor(scene,gltf,entry){
    this.scene=scene;this.holder=new THREE.Group();this.holder.name='fp_arms_'+entry.id;
    const model=clone(gltf.scene);model.rotation.y=THREE.MathUtils.degToRad(entry.yaw??0);this.holder.add(model);
    scene.add(this.holder);this.holder.updateMatrixWorld(true);
    model.traverse(o=>{if(o.isMesh){o.frustumCulled=false;o.renderOrder=1;}});
    const bones=[];model.traverse(o=>{if(o.isBone)bones.push(o);});
    const local=b=>this.holder.worldToLocal(pos(b));
    const arms=bones.filter(b=>/arm/i.test(b.name)&&!/fore|lower|armature/i.test(b.name)&&firstChild(b)&&firstChild(firstChild(b)));
    const pick=s=>arms.filter(b=>Math.sign(local(b).x)===s).sort((a,b)=>Math.abs(local(b).x)-Math.abs(local(a).x))[0];
    this.hips=bones.find(b=>/hips|pelvis/i.test(b.name))??bones[0];
    this.sides={};
    // Characters face +Z, so their right side is -X; T5 bones use _ri / _le.
    for(const [t5,s] of [['ri',-1],['le',1]]){
      const arm=pick(s);if(!arm)continue;
      const fore=firstChild(arm),hand=firstChild(fore);if(!hand)continue;
      const fingers={};
      for(const base of hand.children.filter(c=>c.isBone)){
        const kind=FINGERS.find(([,re])=>re.test(base.name));if(!kind||fingers[kind[0]])continue;
        const chain=[base];while(chain.length<3&&firstChild(chain.at(-1)))chain.push(firstChild(chain.at(-1)));
        fingers[kind[0]]=chain;
      }
      this.sides[t5]={arm,fore,hand,fingers};
    }
    this.ok=!!(this.sides.ri&&this.sides.le);
    if(!this.ok){console.warn('[fp-arms] could not find both arms on',entry.id);return;}
    // Detach each arm chain so the rest of the body can collapse without it.
    this.root=new THREE.Group();scene.add(this.root);
    for(const S of Object.values(this.sides)){
      this.root.attach(S.arm);
      S.restPos=S.arm.position.clone();S.restScale=S.arm.scale.clone();
      S.rest=new Map();S.arm.traverse(b=>{if(b.isBone)S.rest.set(b,b.quaternion.clone());});
      S.forearm=pos(S.hand).distanceTo(pos(S.fore));S.palm=S.fingers.mid?pos(S.fingers.mid[0]).distanceTo(pos(S.hand)):0;
      // The last bone of each finger has no child; remember which way it points.
      for(const chain of Object.values(S.fingers)){const leaf=chain.at(-1),prev=chain.at(-2);
        if(prev)chain.leafDir=pos(leaf).sub(pos(prev)).applyQuaternion(leaf.getWorldQuaternion(new THREE.Quaternion()).invert());}
    }
    this.hips.scale.setScalar(1e-3);
    this.hidden=new WeakSet();this.visible=true;
  }
  // view: the active ViewWeapon (its hidden T5 hands drive the pose).
  sync(view,visible=true){
    if(!this.ok)return;
    const hands=view?.hands,show=visible&&!!hands&&view.pivot.visible&&view.ready;
    this.root.visible=show;this.holder.visible=show;if(!show)return;
    if(!this.hidden.has(hands)){this.hidden.add(hands);hands.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton?.getBoneByName('j_elbow_ri'))o.visible=false;});}
    view.root.updateWorldMatrix(true,true);
    const T=name=>hands.getObjectByName(name),shoulders=[];
    for(const [t5,S] of Object.entries(this.sides)){
      const sh=T('j_shoulder_'+t5),el=T('j_elbow_'+t5),wr=T('j_wrist_'+t5);if(!sh||!el||!wr)continue;
      const tS=pos(sh),tE=pos(el),tW=pos(wr);shoulders.push(tS);
      // Size by the palm (wrist to middle knuckle) so the hands match the gun;
      // cartoon proportions then only change how long the arm looks.
      const tM=T(`j_mid_${t5}_0`);S.k??=S.palm&&tM?tW.distanceTo(pos(tM))/S.palm:tW.distanceTo(tE)/S.forearm;
      for(const [b,q] of S.rest)b.quaternion.copy(q);
      S.arm.position.copy(tS);S.arm.scale.copy(S.restScale).multiplyScalar(S.k);S.arm.updateWorldMatrix(true,true);
      aim(S.arm,pos(S.fore).sub(pos(S.arm)),tE.clone().sub(tS));
      aim(S.fore,pos(S.hand).sub(pos(S.fore)),tW.clone().sub(tE));
      // Keep the wrist exactly on the T5 wrist (the grip), whatever the arm lengths.
      S.arm.position.add(tW.clone().sub(pos(S.hand)));S.arm.updateWorldMatrix(false,true);
      const f=S.fingers,tf=n=>T(`j_${n}_${t5}_0`);
      if(f.mid&&f.index&&f.pinky&&tf('mid')&&tf('index')&&tf('pinky')){
        const want=handBasis(tW,pos(tf('mid')),pos(tf('index')),pos(tf('pinky')));
        const have=handBasis(pos(S.hand),pos(f.mid[0]),pos(f.index[0]),pos(f.pinky[0]));
        rotateWorld(S.hand,want.multiply(have.invert()));
      }
      for(const [name,chain] of Object.entries(f)){
        for(let i=0;i<chain.length;i++){
          const a=T(`j_${name}_${t5}_${i}`),b=T(`j_${name}_${t5}_${i+1}`);if(!a||!b)break;
          const bone=chain[i],next=chain[i+1];
          const dir=next?pos(next).sub(pos(bone)):chain.leafDir?.clone().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()));
          if(dir)aim(bone,dir,pos(b).sub(pos(a)));
        }
      }
    }
    // Collapse the unused body between the shoulders, below the view.
    if(shoulders.length===2){const c=shoulders[0].add(shoulders[1]).multiplyScalar(.5);this.hips.position.copy(this.hips.parent.worldToLocal(c));}
  }
  dispose(){this.root?.removeFromParent();this.holder.removeFromParent();}
}
