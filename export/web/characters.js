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

const gltfCache=new Map();
function loadGltf(url){if(!gltfCache.has(url))gltfCache.set(url,new GLTFLoader().loadAsync(url));return gltfCache.get(url);}

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
    return {root:holder,update(dt,speed=0){play(speed>230?'run':speed>20?'walk':'idle');mixer.update(dt);},dispose(){mixer.stopAllAction();holder.removeFromParent();}};
  }
  if(entry.type==='t5'){
    const chars=data.characters,body=await loadModel(chars[entry.body]),head=entry.head?await loadModel(chars[entry.head]):null;
    const root=new THREE.Group();root.add(body);
    if(head){root.add(head);root.updateMatrixWorld(true);const mount=body.getObjectByName('j_spine4'),anchor=head.getObjectByName('j_spine4');if(mount&&anchor){head.matrixAutoUpdate=false;head.matrix.copy(anchor.matrixWorld).invert();mount.add(head);anchor.userData.animationAnchor=true;}}
    // T5 models face +X; turn them to the shared +Z convention.
    root.rotation.y=-Math.PI/2;holder.add(root);
    const rig=new Rig(root);
    for(const [key,name] of [['walk',entry.walk],['run',entry.run]])if(name&&data.animations[name])rig.add(key,await loadAnimation(data.animations[name]),true);
    rig.play('walk');rig.update(.01);
    root.traverse(o=>{if(o.isMesh)o.frustumCulled=false;});
    return {root:holder,update(dt,speed=0){rig.play(speed>230&&rig.actions.run?'run':'walk');const a=rig.actions[rig.current];if(a)a.timeScale=speed>20?1:0;rig.update(dt);},dispose(){holder.removeFromParent();}};
  }
  return mannequin(entry,holder);
}

// A jointed placeholder figure with a procedural walk cycle.
function mannequin(entry,holder){
  const skin=new THREE.MeshStandardMaterial({color:new THREE.Color(entry.color??'#8d8a80'),roughness:.65}),dark=new THREE.MeshStandardMaterial({color:0x2c2f2e,roughness:.8});
  const accent=new THREE.MeshStandardMaterial({color:new THREE.Color(entry.accent??'#932e25'),roughness:.6});
  const part=(geometry,material,parent,x,y,z)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m;};
  const limb=(parent,x,y,length,radius,material)=>{const pivot=new THREE.Group();pivot.position.set(x,y,0);parent.add(pivot);part(new THREE.CapsuleGeometry(radius,length,4,10),material,pivot,0,-length/2-radius*.5,0);return pivot;};
  const body=new THREE.Group();holder.add(body);
  part(new THREE.CapsuleGeometry(8.5,18,4,12),accent,body,0,46,0).scale.set(1,1,.62);
  part(new THREE.CylinderGeometry(7.5,8,6,12),dark,body,0,33,0).scale.set(1,1,.7);
  part(new THREE.SphereGeometry(6.2,16,12),skin,body,0,65,0);
  part(new THREE.BoxGeometry(9,2.4,3),dark,body,0,66,4.8);
  const legs=[limb(body,-4.2,33,24,3.6,dark),limb(body,4.2,33,24,3.6,dark)];
  const arms=[limb(body,-11,55,18,2.8,skin),limb(body,11,55,18,2.8,skin)];
  arms.forEach((a,i)=>a.rotation.z=(i?-1:1)*.12);
  let phase=0;
  return {root:holder,update(dt,speed=0){
    const moving=Math.min(1,speed/190);phase+=dt*(4+speed/40);
    const swing=Math.sin(phase)*.65*moving;
    legs[0].rotation.x=swing;legs[1].rotation.x=-swing;arms[0].rotation.x=-swing*.8;arms[1].rotation.x=swing*.8;
    body.position.y=Math.abs(Math.cos(phase))*1.6*moving+Math.sin(phase*.4)*.3*(1-moving);
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
