// Player character + third-person view (T). The character is chosen in the
// main menu and stored in the shared profile.
import { createCharacter, loadCharacterRegistry, ThirdPersonCamera, armsUrl, tintArms, loadCharacterGltf } from '../../characters.js';
import { FirstPersonArms } from '../../fp-arms.js';
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { loadProfile } from '../../profile.js';

async function selected(){
  const list=await loadCharacterRegistry(),id=loadProfile().character;
  return list.find(c=>c.id===id)??list[0]??{id:'mannequin',type:'mannequin'};
}

// First-person arms follow the character (an arm set plus colours; see characters.js).
export async function prepare(data){
  const url=armsUrl(await selected());
  if(url)data.characters.viewmodel_usa_pow_arms=url;
  return data;
}

export default async function setup(api){
  const {host,scene,camera,player}=api;
  const entry=await selected();await tintArms(entry);
  const character=await createCharacter(entry,api.data);
  character.root.visible=false;scene.add(character.root);
  const view=new ThirdPersonCamera(camera);
  let third=false,last=null;
  const apply=()=>{host.camera=third?view.update(api.world):null;host.hideViewmodel=third;character.root.visible=third;};
  addEventListener('keydown',e=>{if(e.code==='KeyT'&&!e.repeat&&api.getState().active){third=!third;apply();api.toast(third?'Third person · T to switch back':'First person',2);}});
  host.on('update',dt=>{
    const feet=player.getFeetPosition(),speed=last&&dt>0?Math.hypot(feet.x-last.x,feet.z-last.z)/dt:0;last=feet.clone();
    character.root.position.copy(feet);character.root.rotation.y=camera.rotation.y+Math.PI;
    character.update(dt,speed);
    if(third)view.update(api.world);
  });
  host.on('reset',()=>{third=false;apply();});

  // "fpArms": the character's own arms in first person, posed onto the hidden
  // T5 viewmodel rig (see fp-arms.js). Perk drinks use their own viewmodels.
  if(entry.fpArms&&entry.type==='gltf'&&api.viewScene){
    const fp=new FirstPersonArms(api.viewScene,await loadCharacterGltf(entry),entry);
    const active=()=>{const d=api.perkDrink;return d?.current?d.views[d.current]:api.view;};
    host.on('update',()=>fp.sync(active(),!third));
    fp.sync(active(),true);
  }

  // The current weapon, held in the character's right hand (third person only).
  // Per-character "weapon": {"position":[x,y,z],"rotation":[x,y,z] (degrees)} adjusts the grip.
  const grips={mannequin:{position:[0,-3.4,1.2],basis:true},t5:{position:[0,0,0],rotation:[0,0,0]},gltf:{position:[0,0,0],rotation:[0,0,0]}};
  let held=null,heldKey='';
  async function syncWeapon(){
    const s=api.session,def=s.def,key=s.weaponUnavailable?'':(def.worldModel??'')+(s.weapon.upgraded?':u':'');
    if(key===heldKey)return;heldKey=key;
    held?.removeFromParent();held=null;character.hold?.(false);
    if(!key||!character.hand)return;
    const model=await loadModel(def.worldModel);if(key!==heldKey||!model)return;
    for(const tag of api.data.weapons[s.weapon.id]?.hideTags??[]){const bone=model.getObjectByName(tag);if(bone)bone.scale.setScalar(1e-6);}
    const grip={...grips[entry.type]??grips.gltf,...entry.weapon},pivot=new THREE.Group();pivot.add(model);
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
    character.hand.add(pivot);held=pivot;character.hold?.(true);
  }
  host.on('update',()=>{if(third)syncWeapon();});
  host.on('reset',()=>{heldKey='x';});
}
