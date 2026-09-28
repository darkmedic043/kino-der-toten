// Player characters (not part of upstream), used by the main menu preview and
// the third-person view. Registry: mods/characters/characters.json.
//   type "mannequin": built-in placeholder figure ({color})
//   type "gltf":      any .glb/.gltf ({model, height, yaw}); animation clips whose
//                     names contain idle / walk / run|sprint are used automatically
//   type "t5":        a body/head pair from game-data characters ({body, head, walk, run})
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { Rig, loadModel, loadAnimation } from './animation.js';

export async function loadCharacterRegistry(){
  const url=new URL('mods/characters/characters.json',document.baseURI);
  const list=await fetch(url).then(r=>r.ok?r.json():{characters:[]}).catch(()=>({characters:[]}));
  const base=new URL('./',url);
  return list.characters.map(c=>({...c,type:c.type??(c.model?'gltf':'mannequin'),url:c.model?new URL(c.model,base).href:null,image:c.image?new URL(c.image,base).href:null}));
}

// First-person arms. They must be rigged to the T5 viewmodel skeleton, so a
// character picks one of the game's arm sets (or a compatible file) and
// recolours it: handsTint maps material-name fragments ("sleeve", "glove",
// or "*" for all) to colours; handsFlat drops the texture for solid colours.
export const ARM_SETS={pow:'models/viewmodel_usa_pow_arms.glb',usmc:'models/viewhands_usmc.glb',pressure_suit:'moon/models/viewmodel_zom_pressure_suit_arms.glb'};
export function armsUrl(entry){const h=entry?.hands;if(!h)return null;return ARM_SETS[h]??new URL(h,new URL('mods/characters/',document.baseURI)).href;}
export async function tintArms(entry){
  const url=armsUrl(entry);if(!url)return;
  // Clones share materials, so recolouring the cached source recolours every
  // copy. Originals are kept so another character can restore them.
  const root=await loadModel(url),tint=entry.handsTint??{},keys=Object.keys(tint).sort((a,b)=>b.length-a.length);
  root.traverse(o=>{if(!o.isMesh)return;for(const m of [o.material].flat()){
    m.userData.original??={color:m.color.clone(),map:m.map,roughness:m.roughness};
    m.color.copy(m.userData.original.color);m.map=m.userData.original.map;m.roughness=m.userData.original.roughness;m.needsUpdate=true;
    const name=(m.name??'').toLowerCase(),k=keys.find(k=>k!=='*'&&name.includes(k.toLowerCase()))??(keys.includes('*')?'*':null);if(!k)continue;
    m.color.set(entry.handsTint[k]);if(entry.handsFlat){m.map=null;m.roughness=.65;}m.needsUpdate=true;}});
}

const gltfCache=new Map();
export function loadCharacterGltf(entry){return loadGltf(entry.url);}
// Records textures or buffers that fail to load (common with .gltf files whose
// side files were not copied along, or textures not embedded in a .glb).
function loadGltf(url){
  if(!gltfCache.has(url)){const manager=new THREE.LoadingManager(),missing=[];manager.onError=u=>missing.push(u.split('/').pop());
    gltfCache.set(url,new GLTFLoader(manager).loadAsync(url).then(g=>{g.missing=missing;return g;}));}
  return gltfCache.get(url);
}

function fitHeight(root,height){
  root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3());
  if(size.y>0)root.scale.multiplyScalar(height/size.y);
  root.updateMatrixWorld(true);
  const fitted=new THREE.Box3().setFromObject(root);root.position.y-=fitted.min.y;
}

// Returns {root, update(dt, speed), dispose()}. The root stands on y=0 facing +Z.
export async function createCharacter(entry,data){
  const holder=new THREE.Group();holder.name='character_'+entry.id;
  if(entry.type==='gltf'){
    const gltf=await loadGltf(entry.url),model=clone(gltf.scene);
    model.rotation.y=THREE.MathUtils.degToRad(entry.yaw??0);
    const inner=new THREE.Group();inner.add(model);
    if(entry.scale)inner.scale.setScalar(entry.scale);else fitHeight(inner,entry.height??72);
    if(entry.scale){inner.updateMatrixWorld(true);inner.position.y-=new THREE.Box3().setFromObject(inner).min.y;}
    holder.add(inner);
    model.traverse(o=>{if(o.isMesh){o.frustumCulled=false;o.castShadow=true;}});
    // A rigged model with no animation clips is animated procedurally.
    if(!gltf.animations.length&&entry.procedural!==false){
      let skinned=false;model.traverse(o=>{if(o.isSkinnedMesh)skinned=true;});
      const rig=skinned?proceduralRig(model,holder,entry):null;
      if(rig)return {root:holder,hand:rig.hand,procedural:true,clips:[],matched:{idle:'procedural',walk:'procedural',run:'procedural'},missing:gltf.missing??[],
        hold:rig.hold,update:rig.update,dispose(){holder.removeFromParent();}};
    }
    const mixer=new THREE.AnimationMixer(model),pick=re=>gltf.animations.find(a=>re.test(a.name));
    const clips={idle:pick(/idle/i),walk:pick(/walk/i),run:pick(/run|sprint/i)};
    const actions=Object.fromEntries(Object.entries(clips).filter(([,c])=>c).map(([k,c])=>[k,mixer.clipAction(c)]));
    if(!Object.keys(actions).length&&gltf.animations[0])actions.idle=mixer.clipAction(gltf.animations[0]);
    let current=null;
    const play=key=>{const a=actions[key]??actions.walk??actions.idle;if(!a||a===current)return;a.reset().fadeIn(.2).play();current?.fadeOut(.2);current=a;};
    let hand=null;model.traverse(o=>{if(!hand&&/(right.?hand|hand.?r(ight)?$|hand_r$|r_hand)/i.test(o.name))hand=o;});
    if(entry.handBone)hand=model.getObjectByName(entry.handBone)??hand;
    return {root:holder,hand,clips:gltf.animations.map(a=>a.name),missing:gltf.missing??[],matched:Object.fromEntries(Object.entries(clips).map(([k,c])=>[k,c?.name??null])),
      update(dt,speed=0){play(speed>230?'run':speed>20?'walk':'idle');mixer.update(dt);},dispose(){mixer.stopAllAction();holder.removeFromParent();}};
  }
  if(entry.type==='t5'){
    const chars=data.characters,body=await loadModel(chars[entry.body]),head=entry.head?await loadModel(chars[entry.head]):null;
    const root=new THREE.Group();root.add(body);
    if(head){root.add(head);root.updateMatrixWorld(true);const mount=body.getObjectByName('j_spine4'),anchor=head.getObjectByName('j_spine4');if(mount&&anchor){head.matrixAutoUpdate=false;head.matrix.copy(anchor.matrixWorld).invert();mount.add(head);anchor.userData.animationAnchor=true;}}
    // T5 models face +X; turn them to the shared +Z convention.
    root.rotation.y=-Math.PI/2;holder.add(root);
    const rig=new Rig(root);
    // T5 characters only have zombie animations; idle holds the first frame of
    // `idle` (default: the walk), which for ai_zombie_walk_v1 is a neutral stance.
    for(const [key,name] of [['idle',entry.idle??entry.walk],['walk',entry.walk],['run',entry.run]])if(name&&data.animations[name])rig.add(key,await loadAnimation(data.animations[name]),true);
    rig.play('idle');rig.update(0);
    root.traverse(o=>{if(o.isMesh)o.frustumCulled=false;});
    const hand=body.getObjectByName(entry.handBone??'j_wrist_ri');
    return {root:holder,hand,update(dt,speed=0){
      const key=speed>230&&rig.actions.run?'run':speed>20?'walk':'idle';rig.play(key);
      const a=rig.actions[key];if(a)a.timeScale=key==='idle'?0:key==='walk'?THREE.MathUtils.clamp(speed/170,.6,1.4):1;
      if(key==='idle'&&a)a.time=(entry.idleTime??0);rig.update(dt);
    },dispose(){holder.removeFromParent();}};
  }
  return mannequin(entry,holder);
}

// Procedural animation for a rigged humanoid that ships without clips. Bones
// are found from the skeleton's shape (not names): legs hang below the hips,
// arms are the "arm" chains, sides come from rest positions (+X is the
// character's left, since characters face +Z). Each bone is aimed along a
// direction in character space, which works for any bone axis convention.
function proceduralRig(model,holder,entry){
  holder.updateMatrixWorld(true);
  const bones=[];model.traverse(o=>{if(o.isBone)bones.push(o);});
  // Positions in character space (the holder moves in game, so always use its current matrix).
  const local=b=>holder.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
  const firstChild=b=>b?.children.find(c=>c.isBone)??null;
  const hips=bones.find(b=>/hips|pelvis/i.test(b.name))??bones.find(b=>b.children.filter(c=>c.isBone).length>=3);
  if(!hips)return null;
  const hipY=local(hips).y;
  const legs=hips.children.filter(c=>c.isBone&&firstChild(c)&&local(firstChild(c)).y<hipY-2&&!/tail/i.test(c.name));
  const arms=bones.filter(b=>/arm/i.test(b.name)&&!/fore|lower|armature/i.test(b.name)&&firstChild(b)&&firstChild(firstChild(b)));
  const side=b=>local(b).x>0?1:-1;   // +1 left, -1 right
  const limb=(list,s)=>list.filter(b=>side(b)===s).sort((a,b)=>Math.abs(local(b).x)-Math.abs(local(a).x))[0];
  const L={arm:limb(arms,1),leg:limb(legs,1)},R={arm:limb(arms,-1),leg:limb(legs,-1)};
  if(!L.arm||!R.arm||!L.leg||!R.leg){console.warn('[character] could not find arms and legs for procedural animation');return null;}
  for(const S of [L,R]){S.fore=firstChild(S.arm);S.hand=firstChild(S.fore);S.shin=firstChild(S.leg);S.foot=firstChild(S.shin);}
  const spine=hips.children.find(c=>c.isBone&&/spine|chest/i.test(c.name))??hips.children.find(c=>c.isBone&&local(firstChild(c)??c).y>hipY);
  const tail=bones.filter(b=>/tail/i.test(b.name));
  const rest=new Map(bones.map(b=>[b,b.quaternion.clone()]));
  const height=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y||1;
  const inner=model.parent,baseY=inner.position.y;
  const hq=new THREE.Quaternion(),pq=new THREE.Quaternion(),q=new THREE.Quaternion(),v=new THREE.Vector3(),w=new THREE.Vector3();
  const parentQ=b=>{holder.getWorldQuaternion(hq).invert();b.parent.getWorldQuaternion(pq);return hq.multiply(pq);};
  // Rotate `bone` (in character space) so the bone->child segment points along `dir`.
  function aim(bone,child,dir){
    bone.updateWorldMatrix(true,true);
    v.copy(local(child)).sub(local(bone)).normalize();w.copy(dir).normalize();
    q.setFromUnitVectors(v,w);const P=parentQ(bone);
    bone.quaternion.premultiply(P.clone().invert().multiply(q).multiply(P)).normalize();
  }
  function turn(bone,axis,angle){bone.updateWorldMatrix(true,false);const P=parentQ(bone);q.setFromAxisAngle(axis,angle);bone.quaternion.premultiply(P.clone().invert().multiply(q).multiply(P));}
  const X=new THREE.Vector3(1,0,0),Y=new THREE.Vector3(0,1,0),dir=(x,a)=>new THREE.Vector3(x,-Math.cos(a),Math.sin(a));
  let phase=0,blend=0,breath=0,holding=false;
  return {hand:R.hand,hold(value){holding=value;},update(dt,speed=0){
    const target=Math.min(1.4,speed/190);blend+=(target-blend)*Math.min(1,dt*8);breath+=dt;
    const run=Math.max(0,blend-1)/.4,moving=Math.min(1,blend);
    if(moving>.02)phase+=dt*(5+speed/34);
    const swing=Math.sin(phase)*(.5+.25*run)*moving;
    for(const [b,r] of rest)b.quaternion.copy(r);
    if(spine)turn(spine,X,.03+.18*run);
    for(const [S,s] of [[L,1],[R,-1]]){
      const legSwing=swing*s,knee=Math.max(0,Math.sin(phase+(s>0?0:Math.PI)+.9))*(.7+.6*run)*moving;
      aim(S.leg,S.shin,dir(0,legSwing));aim(S.shin,S.foot,dir(0,legSwing-knee));
      if(holding&&s<0){aim(S.arm,S.fore,new THREE.Vector3(-.12,-.18,1));aim(S.fore,S.hand,new THREE.Vector3(.05,-.05,1));}
      else if(holding){aim(S.arm,S.fore,new THREE.Vector3(-.3,-.35,.9));aim(S.fore,S.hand,new THREE.Vector3(-.85,-.02,.55));}
      else{const a=-legSwing*.8,sway=.12+.02*Math.sin(breath*1.3);aim(S.arm,S.fore,dir(s*sway,a));aim(S.fore,S.hand,dir(s*.08,a+.15+(.2+.9*run)*moving));}
    }
    tail.forEach((b,i)=>turn(b,Y,Math.sin(breath*2.2-i*.6)*(.08+.06*moving)));
    inner.position.y=baseY+Math.abs(Math.cos(phase))*height*.02*moving;
  }};
}

// A jointed placeholder figure with procedural idle, walk and run cycles.
// Faces +Z (the visor side), feet on y=0, about 72 units tall.
function mannequin(entry,holder){
  const mat=(color,rough=.6,metal=0)=>new THREE.MeshStandardMaterial({color:new THREE.Color(color),roughness:rough,metalness:metal});
  const skin=mat(entry.color??'#8d8a80',.55),accent=mat(entry.accent??'#932e25',.6),dark=mat('#2a2d2c',.8),boot=mat('#161817',.7),visor=mat('#0c0d0d',.25,.6);
  const mesh=(geometry,material,parent,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;};
  const joint=(parent,x,y,z=0)=>{const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;};
  // Capsule hanging down from a joint: length is joint-to-joint.
  const bone=(parent,length,r0,r1,material)=>{const g=new THREE.CylinderGeometry(r0,r1,length,14,1);g.translate(0,-length/2,0);mesh(g,material,parent);mesh(new THREE.SphereGeometry(r0,14,10),material,parent);return joint(parent,0,-length);};

  const hips=joint(holder,0,37.5);
  const pelvis=mesh(new THREE.CylinderGeometry(7.4,6.6,7,16),dark,hips,0,-1);pelvis.scale.z=.72;
  const spine=joint(hips,0,2.5);
  const torso=mesh(new THREE.CylinderGeometry(9.6,7.2,21,18),accent,spine,0,10.5);torso.scale.z=.6;
  mesh(new THREE.CylinderGeometry(7.5,7.5,1.6,16),dark,spine,0,1).scale.z=.66;           // belt
  const chest=joint(spine,0,21);
  const neck=joint(chest,0,.5);mesh(new THREE.CylinderGeometry(2.4,2.8,5,12),skin,neck,0,2.5);
  const head=joint(neck,0,5);
  const skull=mesh(new THREE.SphereGeometry(5.5,20,16),skin,head,0,4.6);skull.scale.set(.9,1.1,.98);
  const v=mesh(new THREE.SphereGeometry(5.6,20,12,Math.PI*.14,Math.PI*.72,Math.PI*.36,Math.PI*.22),visor,head,0,4.8,.1);v.scale.set(.93,1.1,1.02);
  const limbs={};
  for(const side of [-1,1]){
    const shoulder=joint(chest,side*10.4,-1.5);mesh(new THREE.SphereGeometry(3.4,14,10),accent,shoulder);
    const elbow=bone(shoulder,12.5,2.8,2.4,skin),wrist=bone(elbow,11,2.3,1.9,skin);
    mesh(new THREE.BoxGeometry(3.2,4.6,2),skin,wrist,0,-2.2).rotation.x=.1;
    const hip=joint(hips,side*4.4,-2.5),knee=bone(hip,16.5,3.9,3.1,dark),ankle=bone(knee,16,3,2.4,dark);
    mesh(new THREE.BoxGeometry(4.2,3,9.5),boot,ankle,0,-1.2,2.4);
    limbs[side]={shoulder,elbow,wrist,hip,knee};
  }
  let phase=0,blend=0,breath=0,holding=false;
  // The figure faces +Z, so its right hand is on the -X side.
  const right=limbs[-1],left=limbs[1];
  return {root:holder,hand:right.wrist,hold(value){holding=value;},update(dt,speed=0){
    const target=Math.min(1.4,speed/190);blend+=(target-blend)*Math.min(1,dt*8);breath+=dt;
    const run=Math.max(0,blend-1)/.4,moving=Math.min(1,blend);
    phase+=dt*(5+speed/34)*(moving>.02?1:0);
    const swing=Math.sin(phase)*(.55+.25*run)*moving;
    for(const side of [-1,1]){
      const l=limbs[side],s=side===1?1:-1,legSwing=swing*s;
      l.hip.rotation.x=legSwing;
      l.knee.rotation.x=Math.max(0,Math.sin(phase*1+ (s>0?0:Math.PI)+.9))*(.7+.6*run)*moving;
      l.shoulder.rotation.x=-legSwing*.85;l.shoulder.rotation.z=side*(.09+.03*Math.sin(breath*1.3));
      l.elbow.rotation.x=-(.12+(.25+1.1*run)*moving);
    }
    if(holding){
      // Aim the weapon forward with both hands; the legs keep walking.
      right.shoulder.rotation.set(-1.32+.05*Math.sin(breath*1.8),0,.12);right.elbow.rotation.x=-.12;
      left.shoulder.rotation.set(-1.18,0,-.62);left.elbow.rotation.x=-.75;
    }
    spine.rotation.x=.04+.16*run;chest.scale.set(1,1+Math.sin(breath*1.8)*.006*(1-moving),1);
    hips.position.y=37.5+Math.abs(Math.cos(phase))*1.5*moving-.8*run;
    head.rotation.x=-.05*run;
  },dispose(){holder.removeFromParent();}};
}

// Third-person camera that orbits behind the gameplay (eye) camera.
export class ThirdPersonCamera {
  constructor(camera){this.camera=new THREE.PerspectiveCamera();this.source=camera;this.distance=105;this.shoulder=38;}
  update(world){
    const s=this.source,c=this.camera;c.copy(s);
    const back=new THREE.Vector3(0,0,1).applyQuaternion(s.quaternion),right=new THREE.Vector3(1,0,0).applyQuaternion(s.quaternion);
    const wanted=back.multiplyScalar(this.distance).addScaledVector(right,this.shoulder).add(new THREE.Vector3(0,10,0));
    const length=wanted.length(),hit=world?.raycast?.(new THREE.Ray(s.position.clone(),wanted.clone().normalize()),0,length+8);
    c.position.copy(s.position).addScaledVector(wanted.normalize(),hit?Math.max(8,hit.distance-10):length);
    c.updateMatrixWorld(true);return c;
  }
}
