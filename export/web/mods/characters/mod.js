// Player character + third-person view (T). The character is chosen in the
// main menu and stored in the shared profile.
import { createCharacter, loadCharacterRegistry, ThirdPersonCamera, armsUrl, tintArms } from '../../characters.js';
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
}
