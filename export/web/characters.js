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

// Shared motion model for the procedural characters. update(dt, speed, m)
// takes optional m = {forward, side, vy, grounded, turn}: velocity in the
// character's frame (+side is its left), vertical speed, and yaw rate.
function motionModel(){
  const st={phase:0,blend:0,run:0,moving:0,breath:0,air:0,land:0,lean:0,strafe:0,dirSign:1,wasGrounded:true,lastVy:0,
    speed:0,accel:0,accelV:0,landV:0,leanV:0,sway:0,swayV:0};
  // Damped spring: slight overshoot gives motion some weight and follow-through.
  const spring=(x,v,target,freq,damping,dt)=>{v+=(freq*freq*(target-x)-2*damping*freq*v)*dt;return [x+v*dt,v];};
  st.step=(dt,speed,m={})=>{
    dt=Math.min(dt,.05);st.breath+=dt;
    const target=Math.min(1.4,speed/190);st.blend+=(target-st.blend)*Math.min(1,dt*4.5);
    // Acceleration lean: forward when speeding up, back when stopping (sprung).
    const acc=THREE.MathUtils.clamp((speed-st.speed)/Math.max(dt,1e-3)/700,-1,1);st.speed=speed;
    [st.accel,st.accelV]=spring(st.accel,st.accelV,acc,7,.45,dt);
    st.run=Math.max(0,st.blend-1)/.4;st.moving=Math.min(1,st.blend);
    const f=m.forward??speed,sd=m.side??0;
    if(speed>20){st.dirSign=f<-.35*speed?-1:1;const want=THREE.MathUtils.clamp(Math.atan2(sd,Math.abs(f))*st.dirSign,-1.1,1.1);st.strafe+=(want-st.strafe)*Math.min(1,dt*5);}
    else st.strafe*=Math.max(0,1-dt*4);
    if(st.moving>.02)st.phase+=dt*(4.2+speed/32)*st.dirSign;
    const grounded=m.grounded??true;
    st.air+=((grounded?0:1)-st.air)*Math.min(1,dt*(grounded?16:7));
    // Landing: an impulse into a spring, so the crouch sinks and recovers.
    if(grounded&&!st.wasGrounded&&st.lastVy<-120)st.landV+=Math.min(9,-st.lastVy/80);
    [st.land,st.landV]=spring(st.land,st.landV,0,9,.55,dt);st.land=Math.max(-.15,Math.min(1.2,st.land));st.wasGrounded=grounded;st.lastVy=m.vy??0;
    [st.lean,st.leanV]=spring(st.lean,st.leanV,THREE.MathUtils.clamp((m.turn??0)*.09,-.28,.28),5,.6,dt);
    // Secondary sway that lags behind the body (tail).
    [st.sway,st.swayV]=spring(st.sway,st.swayV,st.lean+st.strafe*.3-st.accel*.3,4,.35,dt);
    return st;
  };
  return st;
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
  const chest=firstChild(spine)&&/chest|spine/i.test(firstChild(spine).name)?firstChild(spine):null;
  const head=bones.find(b=>/^head/i.test(b.name)),neck=bones.find(b=>/neck/i.test(b.name));
  const tail=bones.filter(b=>/tail/i.test(b.name));
  const rest=new Map(bones.map(b=>[b,b.quaternion.clone()]));
  const height=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y||1;
  const inner=model.parent,baseY=inner.position.y,baseX=inner.position.x;
  const hq=new THREE.Quaternion(),pq=new THREE.Quaternion(),q=new THREE.Quaternion(),v=new THREE.Vector3(),w=new THREE.Vector3();
  const parentQ=b=>{holder.getWorldQuaternion(hq).invert();b.parent.getWorldQuaternion(pq);return hq.multiply(pq);};
  function aim(bone,child,dir){
    bone.updateWorldMatrix(true,true);
    v.copy(local(child)).sub(local(bone)).normalize();w.copy(dir).normalize();
    q.setFromUnitVectors(v,w);const P=parentQ(bone);
    bone.quaternion.premultiply(P.clone().invert().multiply(q).multiply(P)).normalize();
  }
  function turn(bone,axis,angle){if(!bone||!angle)return;bone.updateWorldMatrix(true,false);const P=parentQ(bone);q.setFromAxisAngle(axis,angle);bone.quaternion.premultiply(P.clone().invert().multiply(q).multiply(P));}
  const X=new THREE.Vector3(1,0,0),Y=new THREE.Vector3(0,1,0),Z=new THREE.Vector3(0,0,1);
  // Pitch angle a (+ forward) plus sideways x, then rotated by the strafe heading.
  const dir=(x,a,yaw=0)=>new THREE.Vector3(x,-Math.cos(a),Math.sin(a)).applyAxisAngle(Y,yaw);
  const M=motionModel();let holding=false;
  return {hand:R.hand,hold(value){holding=value;},update(dt,speed=0,m){
    const st=M.step(dt,speed,m),{phase,run,moving,breath,air,lean,strafe,accel,sway:lag}=st,land=Math.max(0,st.land);
    for(const [b,r] of rest)b.quaternion.copy(r);
    const idle=1-moving,sway=Math.sin(breath*.55);
    // Pelvis: bob twice per stride, shift over the stance leg, twist with the stride.
    // Heavy footfalls: the body drops sharply as each foot lands and rises through the pass.
    inner.position.y=baseY+((Math.abs(Math.cos(phase))**1.8-.45)*height*(.026+.024*run)*moving-land*height*.1-air*height*.02);
    inner.position.x=baseX+Math.sin(phase)*height*.012*moving+sway*height*.006*idle;
    turn(hips,Y,Math.sin(phase)*.14*moving+strafe*.45);
    turn(hips,Z,Math.sin(phase)*.06*moving+sway*.04*idle+lean*.5);
    // Torso: counter-twist, lean into speed and turns, breathe at rest.
    const pitch=.04+.22*run+.06*moving+land*.3-air*.1+accel*.22+Math.sin(breath*1.8)*.02*idle;
    turn(spine,X,pitch*.6);turn(spine,Y,-Math.sin(phase)*.2*moving-strafe*.3);turn(spine,Z,-lean*.9);
    turn(chest,X,pitch*.4+Math.sin(breath*1.8)*.015);
    // Head: stays level, glances around when idle.
    const look=(Math.sin(breath*.37)*.28+Math.sin(breath*.13+1)*.18)*idle*(holding?.2:1);
    turn(neck,X,-pitch*.5);turn(head??neck,Y,look+Math.sin(phase)*.06*moving);turn(head??neck,X,Math.sin(breath*.29)*.08*idle-land*.15);
    for(const [S,s] of [[L,1],[R,-1]]){
      const off=s>0?0:Math.PI,thigh=Math.sin(phase+off)*(.5+.32*run)*moving;
      const knee=(Math.max(0,Math.sin(phase+off+1.1))*(.75+.9*run)+.1)*moving+.05*idle+land*1.35+air*(.9+.3*Math.sin(off));
      const tuck=air*(.55+.25*Math.sin(off))+land*.35;
      aim(S.leg,S.shin,dir(s*(.03+.02*idle),thigh+tuck,strafe));aim(S.shin,S.foot,dir(0,thigh+tuck-knee,strafe));
      turn(S.foot,X,(Math.sin(phase+off-.6)*.35*moving+air*.5)*(st.dirSign));
      if(holding){
        const bob=Math.sin(phase*2)*.03*moving+Math.sin(breath*1.8)*.015;
        if(s<0){aim(S.arm,S.fore,new THREE.Vector3(-.12,-.18+bob,1));aim(S.fore,S.hand,new THREE.Vector3(.05,-.05+bob,1));}
        else{aim(S.arm,S.fore,new THREE.Vector3(-.3,-.35+bob,.9));aim(S.fore,S.hand,new THREE.Vector3(-.85,-.02+bob,.55));}
      }else{
        const a=-thigh*(.85+.45*run)+air*.35,out=s*(.13+.03*Math.sin(breath*1.3+off)+.08*run+air*.5);
        const bend=.2+.3*moving+1.15*run+air*.6+land*.4;
        aim(S.arm,S.fore,dir(out,a,strafe*.5));aim(S.fore,S.hand,dir(out*.4,a+bend,strafe*.5));
      }
    }
    tail.forEach((b,i)=>{turn(b,Y,Math.sin(breath*2.4-i*.7)*(.1+.12*moving)-lag*(.7+i*.15));turn(b,X,Math.sin(phase*2-i*.5)*.06*moving+air*.14-accel*.12+land*.2);});
  }};
}

// A jointed placeholder figure with procedural idle, walk, run, jump and
// landing poses. Faces +Z (the visor side), feet on y=0, about 72 units tall.
function mannequin(entry,holder){
  const mat=(color,rough=.6,metal=0)=>new THREE.MeshStandardMaterial({color:new THREE.Color(color),roughness:rough,metalness:metal});
  const skin=mat(entry.color??'#8d8a80',.55),accent=mat(entry.accent??'#932e25',.6),dark=mat('#2a2d2c',.8),boot=mat('#161817',.7),visor=mat('#0c0d0d',.25,.6);
  const mesh=(geometry,material,parent,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;};
  const joint=(parent,x,y,z=0)=>{const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;};
  // Capsule hanging down from a joint: length is joint-to-joint.
  const bone=(parent,length,r0,r1,material)=>{const g=new THREE.CylinderGeometry(r0,r1,length,14,1);g.translate(0,-length/2,0);mesh(g,material,parent);mesh(new THREE.SphereGeometry(r0,14,10),material,parent);return joint(parent,0,-length);};

  const pelvisRoot=joint(holder,0,37.5),hips=joint(pelvisRoot,0,0);
  const pelvis=mesh(new THREE.CylinderGeometry(7.4,6.6,7,16),dark,hips,0,-1);pelvis.scale.z=.72;
  const spine=joint(hips,0,2.5);
  const torso=mesh(new THREE.CylinderGeometry(9.6,7.2,21,18),accent,spine,0,10.5);torso.scale.z=.6;
  mesh(new THREE.CylinderGeometry(7.5,7.5,1.6,16),dark,spine,0,1).scale.z=.66;           // belt
  const chest=joint(spine,0,21);
  const neck=joint(chest,0,.5);mesh(new THREE.CylinderGeometry(2.4,2.8,5,12),skin,neck,0,2.5);
  const head=joint(neck,0,5);head.name='head';
  const skull=mesh(new THREE.SphereGeometry(5.5,20,16),skin,head,0,4.6);skull.scale.set(.9,1.1,.98);
  const v=mesh(new THREE.SphereGeometry(5.6,20,12,Math.PI*.14,Math.PI*.72,Math.PI*.36,Math.PI*.22),visor,head,0,4.8,.1);v.scale.set(.93,1.1,1.02);
  const limbs={};
  for(const side of [-1,1]){
    const shoulder=joint(chest,side*10.4,-1.5);mesh(new THREE.SphereGeometry(3.4,14,10),accent,shoulder);
    const elbow=bone(shoulder,12.5,2.8,2.4,skin),wrist=bone(elbow,11,2.3,1.9,skin);
    mesh(new THREE.BoxGeometry(3.2,4.6,2),skin,wrist,0,-2.2).rotation.x=.1;
    const hip=joint(hips,side*4.4,-2.5),knee=bone(hip,16.5,3.9,3.1,dark),ankle=bone(knee,16,3,2.4,dark);
    mesh(new THREE.BoxGeometry(4.2,3,9.5),boot,ankle,0,-1.2,2.4);
    limbs[side]={shoulder,elbow,wrist,hip,knee,ankle};
  }
  const M=motionModel();let holding=false;
  // The figure faces +Z, so its right hand is on the -X side.
  const right=limbs[-1],left=limbs[1];
  return {root:holder,hand:right.wrist,hold(value){holding=value;},update(dt,speed=0,m){
    const st=M.step(dt,speed,m),{phase,run,moving,breath,air,lean,strafe,accel}=st,land=Math.max(0,st.land),idle=1-moving,sway=Math.sin(breath*.55);
    pelvisRoot.position.set(Math.sin(phase)*.9*moving+sway*.45*idle,37.5+(Math.abs(Math.cos(phase))**1.8-.45)*(1.9+1.7*run)*moving-land*7-air*1.4,0);
    hips.rotation.set(0,Math.sin(phase)*.14*moving+strafe*.45,Math.sin(phase)*.06*moving+sway*.04*idle+lean*.5);
    const pitch=.04+.22*run+.06*moving+land*.3-air*.1+accel*.22+Math.sin(breath*1.8)*.02*idle;
    spine.rotation.set(pitch*.6,-Math.sin(phase)*.2*moving-strafe*.3,-lean*.9);
    chest.rotation.x=pitch*.4;chest.scale.set(1,1+Math.sin(breath*1.8)*.012*idle,1+Math.sin(breath*1.8)*.02*idle);
    const look=(Math.sin(breath*.37)*.28+Math.sin(breath*.13+1)*.18)*idle*(holding?.2:1);
    neck.rotation.x=-pitch*.5;head.rotation.set(Math.sin(breath*.29)*.08*idle-land*.15,look+Math.sin(phase)*.06*moving,0);
    for(const side of [-1,1]){
      const l=limbs[side],off=side>0?0:Math.PI,thigh=Math.sin(phase+off)*(.5+.32*run)*moving;
      const knee=(Math.max(0,Math.sin(phase+off+1.1))*(.75+.9*run)+.1)*moving+.05*idle+land*1.35+air*(.9+.3*Math.sin(off));
      const tuck=air*(.55+.25*Math.sin(off))+land*.35;
      l.hip.rotation.set(-(thigh+tuck),strafe*.5,side*(.03+.02*idle));l.knee.rotation.x=knee;
      l.ankle.rotation.x=-(Math.sin(phase+off-.6)*.35*moving+air*.5)*st.dirSign;
      const armSwing=thigh*(.85+.45*run)-air*.35;   // +x swings the arm back
      l.shoulder.rotation.set(armSwing,0,side*(.13+.03*Math.sin(breath*1.3+off)+.08*run+air*.5));
      l.elbow.rotation.x=-(.2+.3*moving+1.15*run+air*.6+land*.4);
    }
    if(holding){
      // Aim the weapon forward with both hands; the legs keep walking.
      const bob=Math.sin(phase*2)*.03*moving+Math.sin(breath*1.8)*.015;
      right.shoulder.rotation.set(-1.32+bob,0,.12);right.elbow.rotation.x=-.12;
      left.shoulder.rotation.set(-1.18+bob,0,-.62);left.elbow.rotation.x=-.75;
    }
  },dispose(){holder.removeFromParent();}};
}

// Puts a weapon's world model in a character's right hand (third person and
// co-op players). Per-character "weapon": {position, rotation (deg), scale}.
const GRIPS={mannequin:{position:[0,-3.4,1.2],basis:true},t5:{position:[0,0,0],rotation:[0,0,0]},gltf:{position:[0,0,0],rotation:[0,0,0]}};
export async function holdWeapon(character,entry,def,hideTags=def?.hideTags){
  if(!character.hand||!def?.worldModel)return null;
  const model=await loadModel(def.worldModel);if(!model)return null;
  for(const tag of hideTags??[]){const bone=model.getObjectByName(tag);if(bone)bone.scale.setScalar(1e-6);}
  const grip={...GRIPS[entry.type]??GRIPS.gltf,...entry.weapon},pivot=new THREE.Group();pivot.add(model);
  if(character.procedural&&!entry.weapon?.rotation){
    // Procedural rigs: settle the aim pose, then point the barrel forward and
    // the sights up in character space, whatever the hand bone's axes are.
    character.hold(true);character.update(0,0);character.root.updateMatrixWorld(true);
    const hand=character.root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(character.hand.getWorldQuaternion(new THREE.Quaternion()));
    const want=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,0,1),new THREE.Vector3(0,1,0),new THREE.Vector3(-1,0,0)));
    pivot.quaternion.copy(hand.invert().multiply(want));
  }else if(grip.basis&&!entry.weapon?.rotation){
    // Mannequin wrist: barrel (+X) along the arm (-Y), sights up (+Z when aiming).
    pivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,-1,0),new THREE.Vector3(0,0,1),new THREE.Vector3(-1,0,0)));
  }else pivot.rotation.set(...(grip.rotation??[0,0,0]).map(THREE.MathUtils.degToRad));
  pivot.position.fromArray(grip.position??[0,0,0]);
  // Undo the hand's scale (models are resized to fit), so the gun stays true to size.
  character.root.updateMatrixWorld(true);const hs=character.hand.getWorldScale(new THREE.Vector3()),rs=character.root.getWorldScale(new THREE.Vector3());
  pivot.scale.set(rs.x/hs.x,rs.y/hs.y,rs.z/hs.z).multiplyScalar(grip.scale??1);
  character.hand.add(pivot);character.hold?.(true);return pivot;
}

// A 3/4 head-and-shoulders portrait of a character as an image URL (for the HUD).
export async function renderPortrait(entry,data,size=160){
  const c=await createCharacter(entry,data);c.hold?.(false);c.update(.016,0);
  const scene=new THREE.Scene();scene.add(c.root);c.root.updateMatrixWorld(true);
  scene.add(new THREE.HemisphereLight(0xe6ddd0,0x2a1d17,1.8));
  const key=new THREE.DirectionalLight(0xffe6c8,2.4);key.position.set(80,120,140);scene.add(key);
  const rim=new THREE.DirectionalLight(0xd04a38,1.6);rim.position.set(-120,60,-80);scene.add(rim);
  const box=new THREE.Box3().setFromObject(c.root),height=box.max.y-box.min.y;
  let head=null;c.root.traverse(o=>{if(!head&&/^(head|j_head)$|head/i.test(o.name)&&!/headtop|end/i.test(o.name))head=o;});
  const center=head?head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,height*.02,0)):new THREE.Vector3(0,box.max.y-height*.1,0);
  const span=height*(entry.portraitSpan??.15);
  const camera=new THREE.PerspectiveCamera(28,1,1,5000),dir=new THREE.Vector3(Math.sin(.62),.12,Math.cos(.62)).normalize();
  camera.position.copy(center).addScaledVector(dir,span/Math.tan(THREE.MathUtils.degToRad(14)));camera.lookAt(center);
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
  renderer.setSize(size,size);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
  renderer.render(scene,camera);const url=renderer.domElement.toDataURL('image/png');
  renderer.dispose();renderer.forceContextLoss();c.dispose();return url;
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
    // Shots travel along the eye camera's forward ray, so point this camera at
    // where that ray lands: the screen-centre crosshair then matches the shot.
    const forward=new THREE.Vector3(0,0,-1).applyQuaternion(s.quaternion);
    const wall=world?.raycast?.(new THREE.Ray(s.position.clone(),forward),1,6000);
    const aim=s.position.clone().addScaledVector(forward,Math.max(60,wall?.distance??3000));
    c.up.set(0,1,0);c.lookAt(aim);
    c.updateMatrixWorld(true);return c;
  }
}
