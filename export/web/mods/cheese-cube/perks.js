// Cheese Cube's two extra perks (the map's own _zombiemode_perks.gsc), bought like the standard ones once the power is on:
//   PhD Flopper, 1000 here (the map's price; 2000 elsewhere): the game-wide perk (specialty_flakjacket, perks-plus does
//     the dive explosion and explosive immunity). The map's script called it specialty_detectexplosive, as WaW had no PhD.
//   Double-Dew, 4000: a perk with no effect of its own, as in the original.
// Their machines: PHD is the map's own model (`ENT_vending_phd_flopper`); Double-Dew's is geometry behind its door.
export async function setupPerks({api,world,session,host,toast,named,center,beep,sound}){
  const info=world.perkInfo;   // the engine's perk table (the HUD icons); added to by the map module
  const PERKS=[
    {id:'specialty_flakjacket',name:'PhD Flopper',cost:1000,color:'#be83da',icon:'PhD',sting:'phd_sting',at:[-9,473,140]},
    {id:'specialty_shades',name:'Double-Dew',cost:4000,color:'#d0b020',icon:'DD',sting:'dd_sting',at:[-144,1186,-5]},
  ];
  for(const p of PERKS){
    if(info)info[p.id]={name:p.name,price:p.cost,color:p.color,icon:p.icon};
    const trig=named('zombie_vending').find(e=>Math.hypot(e.origin[0]-p.at[0],e.origin[1]-p.at[1],e.origin[2]-p.at[2])<8);
    if(!trig)continue;
    const e=world.addInteraction({position:center(trig),sight:true,perk:p.id,
      text:()=>session.perks.has(p.id)?`${p.name} equipped`:`${p.name} · ${p.cost}`,
      hidden:()=>false,
      use(){
        if(session.perks.has(p.id))return false;
        if(session.points<p.cost){toast('Not enough points',2);return false;}
        session.spend(p.cost);session.perks.add(p.id);beep();sound?.(p.sting,{volume:.8});toast(`${p.name}!`,3);return true;
      }});
    e.locked=()=>!session.power&&!session.perks.has(p.id);e.lockedText='The power must be activated';
  }
  window.kino.cheeseCube.perks=()=>({phd:session.perks.has('specialty_flakjacket'),dd:session.perks.has('specialty_shades')});
}
