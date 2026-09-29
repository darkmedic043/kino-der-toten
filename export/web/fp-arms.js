// First-person arms from a character's own model (not part of upstream).
// Weapon animations only exist for the T5 viewmodel arm skeleton, so the
// character's arm mesh is re-skinned onto that skeleton once:
//   1. pose the character's arm, hand and finger bones over the T5 bind pose,
//   2. bake the arm geometry in that pose into the T5 arms' bind space,
//   3. remap every vertex's bone weights to the matching T5 bones.
// Each weapon rig then deforms the character's arms exactly like its own, so
// hands stay on grips and fingers curl with every animation.
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const FINGERS=[['thumb',/thumb/i],['index',/index/i],['mid',/mid/i],['ring',/ring/i],['pinky',/little|pinky/i]];
const pos=(o,out=new THREE.Vector3())=>o.getWorldPosition(out);
const firstChild=b=>b?.children.find(c=>c.isBone)??null;
const isT5Arms=o=>o.isSkinnedMesh&&!!o.skeleton?.getBoneByName('j_elbow_ri');

function rotateWorld(bone,delta){
  const p=bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.premultiply(p.clone().invert().multiply(delta).multiply(p)).normalize();
  bone.updateWorldMatrix(false,true);
}
const aim=(bone,from,to)=>rotateWorld(bone,new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(),to.clone().normalize()));
function handBasis(wrist,mid,index,little){
  const f=mid.clone().sub(wrist).normalize(),l=index.clone().sub(little).normalize();
  const up=new THREE.Vector3().crossVectors(f,l).normalize(),side=new THREE.Vector3().crossVectors(up,f).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f,up,side));
}

export class FirstPersonArms {
  // gltf: the character's loaded glTF; entry: its characters.json entry.
  constructor(scene,gltf,entry){this.gltf=gltf;this.entry=entry;this.attached=new WeakSet();this.ok=true;}

  // Finds the character's arm chains (+X is the character's left; they face +Z).
  rig(model,holder){
    const bones=[];model.traverse(o=>{if(o.isBone)bones.push(o);});
    const local=b=>holder.worldToLocal(pos(b));
    const arms=bones.filter(b=>/arm/i.test(b.name)&&!/fore|lower|armature/i.test(b.name)&&firstChild(b)&&firstChild(firstChild(b)));
    const pick=s=>arms.filter(b=>Math.sign(local(b).x)===s).sort((a,b)=>Math.abs(local(b).x)-Math.abs(local(a).x))[0];
    const sides={};
    for(const [t5,s] of [['ri',-1],['le',1]]){
      const arm=pick(s),fore=firstChild(arm),hand=firstChild(fore);if(!hand)return null;
      const fingers={};
      for(const base of hand.children.filter(c=>c.isBone)){
        const kind=FINGERS.find(([,re])=>re.test(base.name));if(!kind||fingers[kind[0]])continue;
        const chain=[base];while(chain.length<3&&firstChild(chain.at(-1)))chain.push(firstChild(chain.at(-1)));
        fingers[kind[0]]=chain;
      }
      sides[t5]={arm,fore,hand,fingers};
    }
    return sides;
  }

  // Builds the re-skinned geometry against a T5 hands model (any weapon's).
  build(hands){
    const ref=clone(hands);ref.updateMatrixWorld(true);
    const template=[];ref.traverse(o=>{if(isT5Arms(o))template.push(o);});
    if(!template.length)return false;
    template[0].skeleton.pose();ref.updateMatrixWorld(true);
    const T=n=>ref.getObjectByName(n),tp=n=>pos(T(n));

    const holder=new THREE.Group(),model=clone(this.gltf.scene);model.rotation.y=THREE.MathUtils.degToRad(this.entry.yaw??0);
    holder.add(model);holder.updateMatrixWorld(true);
    const sides=this.rig(model,holder);if(!sides){console.warn('[fp-arms] no arms found on',this.entry.id);return false;}
    // Size by the palm (wrist to middle knuckle) so the hands fit the guns.
    const S0=sides.ri,palm=S0.fingers.mid?pos(S0.fingers.mid[0]).distanceTo(pos(S0.hand)):0;
    const t5Palm=tp('j_wrist_ri').distanceTo(tp('j_mid_ri_0'));
    holder.scale.setScalar((palm?t5Palm/palm:1)*(this.entry.fpArmsScale??1));holder.updateMatrixWorld(true);

    // Pose each arm over the T5 bind pose, then note how far to slide it so the wrists meet.
    const shift={},boneMap=new Map();
    for(const [t5,S] of Object.entries(sides)){
      const tS=tp('j_shoulder_'+t5),tE=tp('j_elbow_'+t5),tW=tp('j_wrist_'+t5);
      aim(S.arm,pos(S.fore).sub(pos(S.arm)),tE.clone().sub(tS));
      aim(S.fore,pos(S.hand).sub(pos(S.fore)),tW.clone().sub(tE));
      const f=S.fingers,t=n=>T(`j_${n}_${t5}_0`);
      if(f.mid&&f.index&&f.pinky&&t('mid')&&t('index')&&t('pinky')){
        const want=handBasis(tW,pos(t('mid')),pos(t('index')),pos(t('pinky')));
        const have=handBasis(pos(S.hand),pos(f.mid[0]),pos(f.index[0]),pos(f.pinky[0]));
        rotateWorld(S.hand,want.multiply(have.invert()));
      }
      for(const [name,chain] of Object.entries(f))chain.forEach((bone,i)=>{
        const a=T(`j_${name}_${t5}_${i}`),b=T(`j_${name}_${t5}_${i+1}`),next=chain[i+1];
        if(a&&b&&next)aim(bone,pos(next).sub(pos(bone)),pos(b).sub(pos(a)));
      });
      shift[t5]=tW.clone().sub(pos(S.hand));
      // Character bone -> T5 bone for skin weights.
      boneMap.set(S.arm,'j_shoulder_'+t5);boneMap.set(S.fore,'j_elbow_'+t5);boneMap.set(S.hand,'j_wrist_'+t5);
      for(const [name,chain] of Object.entries(f))chain.forEach((bone,i)=>{if(T(`j_${name}_${t5}_${i}`))boneMap.set(bone,`j_${name}_${t5}_${i}`);});
      S.arm.traverse(b=>{if(b.isBone&&!boneMap.has(b)){let p=b.parent;while(p&&!boneMap.has(p))p=p.parent;if(p)boneMap.set(b,boneMap.get(p));}});
      S.t5=t5;
    }
    holder.updateMatrixWorld(true);

    // Bake: keep triangles skinned to the arms (the forearm down unless fpArmsUpper),
    // move them into the T5 mesh's bind space and point their weights at T5 bones.
    const t5Bones=template[0].skeleton.bones,t5Index=new Map(t5Bones.map((b,i)=>[b.name,i]));
    // In bind pose a skinned vertex v renders at bindMatrix * v.
    const toBind=template[0].bindMatrix.clone().invert();
    const keepBones=new Map();for(const S of Object.values(sides))(this.entry.fpArmsUpper?S.arm:S.fore).traverse(b=>{if(b.isBone)keepBones.set(b,S);});
    const parts=[];
    model.traverse(o=>{
      if(!o.isSkinnedMesh)return;
      o.skeleton.update();
      const g=o.geometry,si=g.attributes.skinIndex,sw=g.attributes.skinWeight,src=o.skeleton.bones,count=g.attributes.position.count;
      const sideOf=new Array(count),weightOf=new Float32Array(count);
      for(let v=0;v<count;v++){let best=null,w=0;for(let k=0;k<4;k++){const s=keepBones.get(src[si.getComponent(v,k)]);if(s){w+=sw.getComponent(v,k);best??=s;}}sideOf[v]=best;weightOf[v]=w;}
      const idx=g.index?g.index.array:[...Array(count).keys()],tris=[];
      for(let t=0;t<idx.length;t+=3)if(weightOf[idx[t]]>.5&&weightOf[idx[t+1]]>.5&&weightOf[idx[t+2]]>.5)tris.push(idx[t],idx[t+1],idx[t+2]);
      if(!tris.length)return;
      const used=[...new Set(tris)],remap=new Map(used.map((v,i)=>[v,i]));
      const P=new Float32Array(used.length*3),UV=g.attributes.uv?new Float32Array(used.length*2):null,SI=new Uint16Array(used.length*4),SW=new Float32Array(used.length*4),v3=new THREE.Vector3();
      used.forEach((v,i)=>{
        o.getVertexPosition(v,v3);v3.applyMatrix4(o.matrixWorld).add(shift[sideOf[v].t5]).applyMatrix4(toBind);P.set([v3.x,v3.y,v3.z],i*3);
        if(UV)UV.set([g.attributes.uv.getX(v),g.attributes.uv.getY(v)],i*2);
        const w=new Map();
        for(let k=0;k<4;k++){const weight=sw.getComponent(v,k);if(!weight)continue;const name=boneMap.get(src[si.getComponent(v,k)])??`j_shoulder_${sideOf[v].t5}`;w.set(name,(w.get(name)??0)+weight);}
        const top=[...w].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=top.reduce((s,[,x])=>s+x,0)||1;
        top.forEach(([name,weight],k)=>{SI[i*4+k]=t5Index.get(name)??0;SW[i*4+k]=weight/sum;});
      });
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.BufferAttribute(P,3));if(UV)geo.setAttribute('uv',new THREE.BufferAttribute(UV,2));
      geo.setAttribute('skinIndex',new THREE.BufferAttribute(SI,4));geo.setAttribute('skinWeight',new THREE.BufferAttribute(SW,4));
      geo.setIndex(tris.map(v=>remap.get(v)));geo.computeVertexNormals();
      // The viewmodel lights are strong; tone the arms down to sit with the gun.
      const material=[o.material].flat()[0].clone();material.color.multiplyScalar(this.entry.fpArmsTone??.8);
      parts.push({geometry:geo,material});
    });
    this.parts=parts;return parts.length>0;
  }

  // Swap the character's arms into a weapon rig (once per rig).
  attach(hands){
    if(this.attached.has(hands))return;this.attached.add(hands);
    if(!this.parts&&!this.build(hands)){this.ok=false;return;}
    let template=null;hands.traverse(o=>{if(isT5Arms(o)){o.visible=false;template??=o;}});
    for(const {geometry,material} of this.parts){
      const mesh=new THREE.SkinnedMesh(geometry,material);mesh.frustumCulled=false;mesh.name='fp_arms';
      template.parent.add(mesh);mesh.bind(template.skeleton,template.bindMatrix);
    }
  }
  // Called every frame with the active viewmodel; cheap once a rig is attached.
  sync(view){if(this.ok&&view?.hands)this.attach(view.hands);}
  dispose(){}
}
