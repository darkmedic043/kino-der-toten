// Player character + third-person view (T). The character is chosen in the
// main menu and stored in the shared profile.
import { createCharacter, loadCharacterRegistry, ThirdPersonCamera, armsUrl, tintArms, loadCharacterGltf, renderPortrait, holdWeapon, applyStance } from '../../characters.js';
import { FirstPersonArms } from '../../fp-arms.js';
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { loadProfile, cloudReady } from '../../profile.js';

async function selected(){
  await cloudReady;
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

  // HUD portrait: who you're playing as (3/4 view of the character's head).
  const portrait=document.createElement('div');portrait.id='hud-portrait';
  portrait.innerHTML=`<img alt=""><span>${entry.name.replace(/[&<>]/g,'')}</span>`;document.body.append(portrait);
  const style=document.createElement('style');style.textContent=`
    #hud-portrait{position:fixed;left:36px;bottom:196px;z-index:3;display:flex;align-items:center;gap:10px;pointer-events:none}
    #hud-portrait img{width:64px;height:64px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#3a2a24,#0b0c0c 75%);border:2px solid #b5372c99;box-shadow:0 0 0 1px #000a,0 4px 14px #0008;object-fit:cover}
    #hud-portrait span{font-size:10px;letter-spacing:3px;color:#c2b5a0;text-transform:uppercase;text-shadow:0 1px 2px #000}
    #hud-portrait.hurt img{border-color:#ff3b2a;box-shadow:0 0 12px #ff2a1a}
    body.menu-open #hud-portrait{visibility:hidden}
    @media(max-width:700px){#hud-portrait{left:20px;bottom:180px}#hud-portrait img{width:48px;height:48px}}`;document.head.append(style);
  renderPortrait(entry,api.data).then(url=>{portrait.querySelector('img').src=url;}).catch(e=>console.warn('portrait',e));
  let hurtTimer=0;host.on('beforeDamage',()=>{portrait.classList.add('hurt');clearTimeout(hurtTimer);hurtTimer=setTimeout(()=>portrait.classList.remove('hurt'),350);});
  const character=await createCharacter(entry,api.data);
  character.root.visible=false;scene.add(character.root);
  const view=new ThirdPersonCamera(camera);
  let third=false,last=null,lastYaw=null;
  const apply=()=>{host.camera=third?view.update(api.world):null;host.hideViewmodel=third;character.root.visible=third;};
  addEventListener('keydown',e=>{if(e.code==='KeyT'&&!e.repeat&&api.getState().active){third=!third;apply();api.toast(third?'Third person · T to switch back':'First person',2);}});
  host.on('update',dt=>{
    const feet=player.getFeetPosition(),vel=last&&dt>0?feet.clone().sub(last).divideScalar(dt):new THREE.Vector3();last=feet.clone();
    const yaw=camera.rotation.y+Math.PI,turn=lastYaw===null||dt<=0?0:Math.atan2(Math.sin(yaw-lastYaw),Math.cos(yaw-lastYaw))/dt;lastYaw=yaw;
    character.root.position.copy(feet);character.root.rotation.y=yaw;
    // Velocity in the character's frame (+Z forward, +X its left) for strafing/backpedal poses.
    const speed=Math.hypot(vel.x,vel.z),forward=vel.x*Math.sin(yaw)+vel.z*Math.cos(yaw),side=vel.x*Math.cos(yaw)-vel.z*Math.sin(yaw);
    const mv=window.kino.movement?.state,stance=mv?.prone?'prone':mv?.sliding?'slide':mv?.mantling?'mantle':'';
    character.update(dt,stance==='prone'?speed*.5:stance==='slide'?0:speed,{forward,side,vy:vel.y,grounded:player.state?.grounded??player.isGrounded??true,turn});
    applyStance(character,stance,dt);
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
  let held=null,heldKey='';
  async function syncWeapon(){
    const s=api.session,def=s.def,key=s.weaponUnavailable?'':(def.worldModel??'')+(s.weapon.upgraded?':u':'');
    if(key===heldKey)return;heldKey=key;
    held?.removeFromParent();held=null;character.hold?.(false);
    if(!key)return;
    const pivot=await holdWeapon(character,entry,def,api.data.weapons[s.weapon.id]?.hideTags);
    if(key!==heldKey){pivot?.removeFromParent();return;}held=pivot;
  }
  host.on('update',()=>{if(third)syncWeapon();});
  host.on('reset',()=>{heldKey='x';});
}
