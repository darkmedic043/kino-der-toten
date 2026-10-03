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
import { applyVariants } from './characters.js';

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
  constructor(scene,gltf,entry){this.gltf=gltf;this.entry=entry;this.attached=new WeakSet();this.ok=true;this.builds=new Map();}

  // Finds the character's arm chains (+X is the character's left; they face +Z).
  rig(model,holder){
    const bones=[];model.traverse(o=>{if(o.isBone)bones.push(o);});
    const local=b=>holder.worldToLocal(pos(b));
    // characters.json can name the upper-arm bones (fpArmsArm, a regex) and which bones act
    // as fingers (fpArmsFingers {index,mid,ring,pinky,thumb: regex}), e.g. a paw's claws
    const armRe=this.entry.fpArmsArm?new RegExp(this.entry.fpArmsArm,'i'):null;
    const arms=bones.filter(b=>(armRe?armRe.test(b.name):/arm/i.test(b.name)&&!/fore|lower|armature/i.test(b.name))&&firstChild(b)&&firstChild(firstChild(b)));
    const fingerKinds=this.entry.fpArmsFingers?Object.entries(this.entry.fpArmsFingers).map(([k,re])=>[k,new RegExp(re,'i')]):FINGERS;
    const pick=s=>arms.filter(b=>Math.sign(local(b).x)===s).sort((a,b)=>Math.abs(local(b).x)-Math.abs(local(a).x))[0];
    const sides={};
    for(const [t5,s] of [['ri',-1],['le',1]]){
      const arm=pick(s),fore=firstChild(arm),hand=firstChild(fore);if(!hand)return null;
      const fingers={};
      for(const base of hand.children.filter(c=>c.isBone)){
        const kind=fingerKinds.find(([,re])=>re.test(base.name));if(!kind||fingers[kind[0]])continue;
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

    const holder=new THREE.Group(),model=clone(this.gltf.scene);applyVariants(model,this.entry);model.rotation.y=THREE.MathUtils.degToRad(this.entry.yaw??0);
    holder.add(model);holder.updateMatrixWorld(true);
    const sides=this.rig(model,holder);if(!sides){console.warn('[fp-arms] no arms found on',this.entry.id);return false;}
    // Size by the palm (wrist to middle knuckle) so the hands fit the guns.
    const S0=sides.ri,palm=S0.fingers.mid?pos(S0.fingers.mid[0]).distanceTo(pos(S0.hand)):0;
    const t5Palm=tp('j_wrist_ri').distanceTo(tp('j_mid_ri_0'));
    // fpArmsFit 'arm': size by shoulder→wrist length instead (paws whose claws sit right at the wrist)
    const armLen=pos(S0.arm).distanceTo(pos(S0.fore))+pos(S0.fore).distanceTo(pos(S0.hand)),t5Arm=tp('j_shoulder_ri').distanceTo(tp('j_elbow_ri'))+tp('j_elbow_ri').distanceTo(tp('j_wrist_ri'));
    const fit=this.entry.fpArmsFit==='arm'?t5Arm/armLen:palm?t5Palm/palm:1;
    holder.scale.setScalar(fit*(this.entry.fpArmsScale??1));holder.updateMatrixWorld(true);

    // Pose each arm over the T5 bind pose, then note how far to slide it so the wrists meet.
    const shift={},boneMap=new Map(),scaleBones=new Map();
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
      // fpArmsFingerScale {thumb:.6}: shrink a finger's geometry toward its base knuckle
      // (a gauntlet's long thumb plate that pokes far past the grip)
      for(const [name,k] of Object.entries(this.entry.fpArmsFingerScale??{})){const ch=f[name];if(!ch)continue;const base=pos(ch[0]);ch.forEach(b=>b.traverse(x=>{if(x.isBone)scaleBones.set(x,{base,k});}));}
      // fpArmsFingerFit: grow each (articulated) finger as a whole, thickness too, to T5's finger
      // length; thin short gauntlet fingers otherwise stretch into long noodles round the grip
      if(this.entry.fpArmsFingerFit)for(const [name,ch] of Object.entries(f)){
        if(scaleBones.has(ch[0])||(this.entry.fpArmsKeepFingers??[]).includes(name)||!ch[2]||!T(`j_${name}_${t5}_2`))continue;
        const own=pos(ch[1]).distanceTo(pos(ch[0]))+pos(ch[2]).distanceTo(pos(ch[1])),want=tp(`j_${name}_${t5}_1`).distanceTo(tp(`j_${name}_${t5}_0`))+tp(`j_${name}_${t5}_2`).distanceTo(tp(`j_${name}_${t5}_1`));
        const base=pos(ch[0]),k=want/own;ch.forEach(b=>b.traverse(x=>{if(x.isBone)scaleBones.set(x,{base,k});}));}
      S.targets=[[S.arm,'j_shoulder_'+t5],[S.fore,'j_elbow_'+t5],[S.hand,'j_wrist_'+t5]];
      // fpArmsKeepFingers (e.g. ['thumb']): those fingers keep their own segment lengths (only the
      // base knuckle is pinned); a much shorter thumb than T5's otherwise stretches ~1.6x
      const keep=new Set([...(this.entry.fpArmsKeepFingers??[]),...Object.keys(this.entry.fpArmsFingerScale??{})]);
      for(const [name,chain] of Object.entries(f))chain.forEach((bone,i)=>{if((i===0||!keep.has(name))&&T(`j_${name}_${t5}_${i}`))S.targets.push([bone,`j_${name}_${t5}_${i}`]);});
      // Character bone -> T5 bone for skin weights.
      boneMap.set(S.arm,'j_shoulder_'+t5);boneMap.set(S.fore,'j_elbow_'+t5);boneMap.set(S.hand,'j_wrist_'+t5);
      // a kept/scaled finger is bound wholly to its base knuckle: a rigid piece, since its joints no
      // longer line up with T5's and bending at T5's pivots folds it
      for(const [name,chain] of Object.entries(f))chain.forEach((bone,i)=>{const j=keep.has(name)?0:i;if(T(`j_${name}_${t5}_${j}`))boneMap.set(bone,`j_${name}_${t5}_${j}`);});
      S.arm.traverse(b=>{if(b.isBone&&!boneMap.has(b)){let p=b.parent;while(p&&!boneMap.has(p))p=p.parent;if(p)boneMap.set(b,boneMap.get(p));}});
      S.t5=t5;
    }
    holder.updateMatrixWorld(true);
    // fpArmsRetarget: keep the character's own skeleton and proportions and only copy T5's joint
    // rotations each frame (the hand pinned to T5's wrist, the forearm and upper arm hanging back
    // from it at their own lengths, the fingers at their own lengths). Stays on model, where the
    // per-joint offsets below stretch a short forearm thin and noodle short fingers.
    const rt=this.entry.fpArmsRetarget?[]:null,rtIndex=new Map();
    if(rt)for(const [t5,S] of Object.entries(sides)){
      const sh=new THREE.Matrix4().makeTranslation(shift[t5]);
      const add=(bone,info)=>{const t=info.t5&&T(info.t5);rtIndex.set(bone,rt.length);
        rt.push({...info,name:bone.name,t5:t?info.t5:null,bind:sh.clone().multiply(bone.matrixWorld),t5BindInv:t?t.matrixWorld.clone().invert():null,parent:rtIndex.get(bone.parent)??-1});};
      add(S.hand,{kind:'anchor',t5:'j_wrist_'+t5});
      add(S.fore,{kind:'back',t5:'j_elbow_'+t5,child:rtIndex.get(S.hand)});
      add(S.arm,{kind:'back',t5:'j_shoulder_'+t5,child:rtIndex.get(S.fore)});
      const finger=new Map();for(const [n,ch] of Object.entries(S.fingers))ch.forEach((b,i)=>finger.set(b,`j_${n}_${t5}_${i}`));
      S.arm.traverse(b=>{if(b.isBone&&!rtIndex.has(b))add(b,{kind:'follow',t5:finger.get(b)});});
    }
    if(rt)for(const e of rt){
      if(e.kind==='back')e.d=new THREE.Vector3().setFromMatrixPosition(e.bind.clone().invert().multiply(rt[e.child].bind));
      if(e.parent>=0)e.local=rt[e.parent].bind.clone().invert().multiply(e.bind);
    }
    // Per-joint offsets: every mapped joint (shoulder, elbow, wrist, each finger
    // knuckle) is moved exactly onto its T5 joint and the mesh between stretches,
    // so different arm and finger proportions still close around the grips.
    // Unmapped bones (twist, tips) follow their nearest mapped ancestor.
    const scaled=b=>{const p=pos(b),sc=scaleBones.get(b);return sc?p.sub(sc.base).multiplyScalar(sc.k).add(sc.base):p;};
    const offset=new Map();
    for(const S of Object.values(sides))for(const [bone,name] of S.targets)offset.set(bone,tp(name).sub(scaled(bone)));
    const offsetOf=b=>{let p=b;while(p&&!offset.has(p))p=p.parent;return p?offset.get(p):null;};
    // Finger segments stretch evenly from knuckle to knuckle: a vertex's offset blends between
    // its joint's and the next joint's by how far along the segment it sits. Rigid per-joint
    // offsets crammed a short finger's whole stretch into the thin weight-blend band at each
    // knuckle (Bondrewd's index: a 1.7x longer T5 segment).
    const seg=new Map();
    for(const S of Object.values(sides))for(const chain of Object.values(S.fingers))chain.forEach((bone,i)=>{
      const next=chain[i+1];if(!next||!offset.has(bone)||!offset.has(next))return;
      const a=scaled(bone),ab=scaled(next).sub(a);seg.set(bone,{a,ab,len2:ab.lengthSq(),oa:offset.get(bone),ob:offset.get(next)});});
    const offAt=(b,v)=>{const s=seg.get(b);if(!s)return offsetOf(b);
      const t=THREE.MathUtils.clamp(v.clone().sub(s.a).dot(s.ab)/s.len2,0,1);return s.oa.clone().lerp(s.ob,t);};

    // Bake: keep triangles skinned to the arms (the forearm down unless fpArmsUpper),
    // move them into the T5 mesh's bind space and point their weights at T5 bones.
    const t5Bones=template[0].skeleton.bones,t5Index=new Map(t5Bones.map((b,i)=>[b.name,i]));
    // In bind pose a skinned vertex v renders at bindMatrix * v.
    const toBind=template[0].bindMatrix.clone().invert();
    // The whole arm by default: forearm-only showed a severed end on long swings (knife).
    // fpArmsExclude (regex): bones left out of first person (big fur flaps, armour)
    const skip=this.entry.fpArmsExclude?new RegExp(this.entry.fpArmsExclude,'i'):null;
    const keepBones=new Map();for(const S of Object.values(sides))(this.entry.fpArmsUpper===false?S.fore:S.arm).traverse(b=>{if(b.isBone&&!(skip&&skip.test(b.name)))keepBones.set(b,S);});
    const parts=[];
    model.traverse(o=>{
      if(!o.isSkinnedMesh)return;
      o.skeleton.update();
      const g=o.geometry,si=g.attributes.skinIndex,sw=g.attributes.skinWeight,src=o.skeleton.bones,count=g.attributes.position.count;
      const sideOf=new Array(count),weightOf=new Float32Array(count);
      for(let v=0;v<count;v++){let best=null,w=0;for(let k=0;k<4;k++){const s=keepBones.get(src[si.getComponent(v,k)]);if(s){w+=sw.getComponent(v,k);best??=s;}}sideOf[v]=best;weightOf[v]=w;}
      const idx=g.index?g.index.array:[...Array(count).keys()],tris=[];
      // Upper arm: only the half nearest the elbow (enough that a long swing
      // never shows a cut end; the shoulder and its armour stay out of view).
      const keepV=new Uint8Array(count),wp=new THREE.Vector3();
      for(let v=0;v<count;v++){const S=sideOf[v];if(!S||weightOf[v]<=.5)continue;
        o.getVertexPosition(v,wp);wp.applyMatrix4(o.matrixWorld);const a=pos(S.arm),e=pos(S.fore),ax=e.clone().sub(a),t=wp.clone().sub(a).dot(ax)/ax.lengthSq();
        keepV[v]=this.entry.fpArmsUpper||t>.5?1:0;}
      for(let t=0;t<idx.length;t+=3)if(keepV[idx[t]]&&keepV[idx[t+1]]&&keepV[idx[t+2]])tris.push(idx[t],idx[t+1],idx[t+2]);
      if(!tris.length)return;
      const used=[...new Set(tris)],remap=new Map(used.map((v,i)=>[v,i]));
      const P=new Float32Array(used.length*3),UV=g.attributes.uv?new Float32Array(used.length*2):null,SI=new Uint16Array(used.length*4),SW=new Float32Array(used.length*4),v3=new THREE.Vector3();
      used.forEach((v,i)=>{
        o.getVertexPosition(v,v3);v3.applyMatrix4(o.matrixWorld);
        if(rt){v3.add(shift[sideOf[v].t5]);P.set([v3.x,v3.y,v3.z],i*3);if(UV)UV.set([g.attributes.uv.getX(v),g.attributes.uv.getY(v)],i*2);
          const w=new Map();for(let k=0;k<4;k++){const weight=sw.getComponent(v,k);if(!weight)continue;const j=rtIndex.get(src[si.getComponent(v,k)])??rtIndex.get(sideOf[v].arm);w.set(j,(w.get(j)??0)+weight);}
          const top=[...w].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=top.reduce((s,[,x])=>s+x,0)||1;top.forEach(([j,weight],k)=>{SI[i*4+k]=j;SW[i*4+k]=weight/sum;});return;}
        {const d=new THREE.Vector3();for(let k=0;k<4;k++){const w=sw.getComponent(v,k),sc=w&&scaleBones.get(src[si.getComponent(v,k)]);if(sc)d.addScaledVector(v3.clone().sub(sc.base),w*(sc.k-1));}v3.add(d);}
        const move=new THREE.Vector3();let wsum=0;
        for(let k=0;k<4;k++){const weight=sw.getComponent(v,k);if(!weight)continue;const off=offAt(src[si.getComponent(v,k)],v3);if(off){move.addScaledVector(off,weight);wsum+=weight;}}
        v3.add(wsum>0?move.divideScalar(wsum):shift[sideOf[v].t5]).applyMatrix4(toBind);P.set([v3.x,v3.y,v3.z],i*3);
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
      material.vertexColors=false;   // colours aren't baked; a material expecting them renders black
      parts.push({geometry:geo,material});
    });
    this.parts=parts;this.rt=rt;return parts.length>0;
  }

  // Swap the character's arms into a weapon rig (once per rig).
  attach(hands){
    if(this.attached.has(hands))return;this.attached.add(hands);
    // One build per hands rig (keyed by its shared geometry): BO1's arms and a BO3 weapon's own
    // arms (def.handsModel, ~2.2x the scale, another bind pose) each need theirs.
    let template=null;hands.traverse(o=>{if(!template&&isT5Arms(o))template=o;});if(!template)return;
    const key=template.geometry.uuid;
    if(!this.builds.has(key))this.builds.set(key,this.build(hands)?{parts:this.parts,rt:this.rt}:null);
    const built=this.builds.get(key);if(!built)return;   // this rig keeps its own arms
    this.parts=built.parts;this.rt=built.rt;
    hands.traverse(o=>{if(isT5Arms(o))o.visible=false;});
    const skeleton=this.rt&&this.retargetSkeleton(template.skeleton);
    for(const {geometry,material} of this.parts){
      const mesh=new THREE.SkinnedMesh(geometry,material);mesh.frustumCulled=false;mesh.name='fp_arms';
      template.parent.add(mesh);
      // retarget: solve the bones after the scene's matrices are final (before the bone texture uploads)
      if(skeleton){mesh.bind(skeleton,new THREE.Matrix4());mesh.onBeforeRender=()=>{skeleton.solve();skeleton.update();};}
      else mesh.bind(template.skeleton,template.bindMatrix);
    }
  }
  // Bones driven by a live T5 skeleton (fpArmsRetarget); their matrixWorld is set directly.
  retargetSkeleton(t5){
    const rt=this.rt,live=rt.map(e=>e.t5?t5.getBoneByName(e.t5):null);
    const bones=rt.map(e=>{const b=new THREE.Bone();b.name=e.name;b.matrixAutoUpdate=false;b.matrixWorldAutoUpdate=false;return b;});
    const skeleton=new THREE.Skeleton(bones,rt.map(e=>e.bind.clone().invert()));
    const m=new THREE.Matrix4(),p=new THREE.Vector3();
    skeleton.solve=()=>rt.forEach((e,i)=>{
      const W=bones[i].matrixWorld,t=live[i];
      if(t)W.multiplyMatrices(t.matrixWorld,e.t5BindInv).multiply(e.bind);   // T5's rotation since bind
      // forearm/upper arm: rotate like T5, then hang back from their (already solved) child joint
      if(e.kind==='back'){W.setPosition(0,0,0);p.copy(e.d).applyMatrix4(W);W.setPosition(new THREE.Vector3().setFromMatrixPosition(bones[e.child].matrixWorld).sub(p));}
      else if(e.kind==='follow'&&e.parent>=0){m.multiplyMatrices(bones[e.parent].matrixWorld,e.local);if(t)W.setPosition(p.setFromMatrixPosition(m));else W.copy(m);}
    });
    return skeleton;
  }
  // Called every frame with the active viewmodel; cheap once a rig is attached.
  sync(view){if(this.ok&&view?.hands)this.attach(view.hands);}
  dispose(){}
}
