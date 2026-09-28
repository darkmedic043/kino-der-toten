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
    const mixer=new THREE.AnimationMixer(model),pick=re=>gltf.animations.find(a=>re.test(a.name));
    const clips={idle:pick(/idle/i),walk:pick(/walk/i),run:pick(/run|sprint/i)};
    const actions=Object.fromEntries(Object.entries(clips).filter(([,c])=>c).map(([k,c])=>[k,mixer.clipAction(c)]));
    if(!Object.keys(actions).length&&gltf.animations[0])actions.idle=mixer.clipAction(gltf.animations[0]);
    let current=null;
    const play=key=>{const a=actions[key]??actions.walk??actions.idle;if(!a||a===current)return;a.reset().fadeIn(.2).play();current?.fadeOut(.2);current=a;};
    return {root:holder,clips:gltf.animations.map(a=>a.name),missing:gltf.missing??[],matched:Object.fromEntries(Object.entries(clips).map(([k,c])=>[k,c?.name??null])),
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
    return {root:holder,update(dt,speed=0){
      const key=speed>230&&rig.actions.run?'run':speed>20?'walk':'idle';rig.play(key);
      const a=rig.actions[key];if(a)a.timeScale=key==='idle'?0:key==='walk'?THREE.MathUtils.clamp(speed/170,.6,1.4):1;
      if(key==='idle'&&a)a.time=(entry.idleTime??0);rig.update(dt);
    },dispose(){holder.removeFromParent();}};
  }
  return mannequin(entry,holder);
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
    limbs[side]={shoulder,elbow,hip,knee};
  }
  let phase=0,blend=0,breath=0;
  return {root:holder,update(dt,speed=0){
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
