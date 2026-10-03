// BO1's Pack-a-Punch knuckle crack (not part of upstream). While the machine holds your gun,
// a hands-only viewmodel (BO1's zombie_knuckle_crack: no gun, raiseAnim
// viewmodel_zombie_packopunch) plays the crack, then lowers. Assets from
// .tools/build_pap_knuckles.py (git-ignored). The characters mod puts the operator's own arms
// on it (kino.knuckles.view), as it does for perk drinks.
import { ViewWeapon } from '../../animation.js';

const CRACKS=[.55,1.2];   // the clip has no notetracks: knuckle_00/01 timed to the two hand squeezes

export default async function setup(api){
  const {host,viewScene,data,session,audio}=api;
  const base=new URL('./',import.meta.url).href,anim=base+'animations/viewmodel_zombie_packopunch.json';
  if(!(await fetch(anim,{method:'HEAD'}).catch(()=>null))?.ok){console.info('[pap-knuckles] not built: run .tools/build_pap_knuckles.py');return;}
  const bottle=Object.values(data.perkDrinks)[0];
  const def={...bottle,id:'zombie_knuckle_crack',name:'Knuckle crack',model:base+'no_model.glb',raiseTime:2.1,dropTime:.9,
    animations:{...bottle.animations,raiseAnim:anim,firstRaiseAnim:anim,quickRaiseAnim:anim}};
  const view=new ViewWeapon(viewScene,data,()=>{});
  try{await view.equip(def);}catch(e){console.warn('[pap-knuckles]',e);return;}
  view.pivot.visible=false;
  const st={active:false,played:false,t:0,cracks:0,lowered:false};
  const knuckles=(window.kino??={}).knuckles={get active(){return st.active;},view};
  const stop=()=>{st.active=false;view.pivot.visible=false;};
  host.on('update',dt=>{
    const packing=!!session.pack&&session.weaponUnavailable;
    if(!session.pack)st.played=false;                       // ready for the next upgrade
    if(packing&&!st.played){st.played=true;st.active=true;st.t=0;st.cracks=0;st.lowered=false;
      view.pivot.visible=true;view.mode='raise';view.aim=0;view.rig.play('raiseAnim',false,view.clipSpeed('raiseAnim',def.raiseTime),0);view.rig.update(0);}
    if(!st.active)return;
    if(!packing){stop();return;}                            // switched to the other gun, or took it back
    st.t+=dt;
    while(st.cracks<CRACKS.length&&st.t>=CRACKS[st.cracks]){st.cracks++;window.kino.eventSounds?.knuckle?.();}
    if(!st.lowered&&st.t>=def.raiseTime){st.lowered=true;view.rig.play('dropAnim',false,view.clipSpeed('dropAnim',def.dropTime),0);view.mode='drinkLower';}
    if(st.t>=def.raiseTime+def.dropTime){stop();return;}
    view.update(dt);
  });
  host.on('reset',stop);
}
