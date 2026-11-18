// The GKZ-45 Mk3's own Gunsmith kit (user 2026-11-18: "build a few custom attachments for the gkz ... get rid of the
// generic ones"): five attachments from .tools/build_mk3_attachments.py (mk3_attachments.glb, parts placed in each gun's
// tag_weapon space, so at = 0), no generic padding. A mount can be a list (the cells sit on both guns) and names its
// hand (weapon-levels/mounts.js: right = def.model, left = def.leftModel). The effects are in mk3.js.
const MODEL='mods/bo3-weapons/parts/mk3_attachments.glb?v=5a06935a';
const KIT={
  mk3_cells:[{node:'mk3_cell_r',hand:'right'},{node:'mk3_cell_l',hand:'left'}],
  mk3_prism:[{node:'mk3_prism',hand:'right'}],
  mk3_horizon:[{node:'mk3_horizon',hand:'left'}],
  mk3_capacitor:[{node:'mk3_capacitor',hand:'right'}],
  mk3_darkmatter:null,   // stat-only: the rounds change, not the gun
};
const SLOTS={mag:'Eris Cell',barrel:'Emitter',muzzle:'Singularity',stock:'Capacitor',ammo:'Payload'};
export function applyMk3Kit(data){
  const d=data.weapons.bo3_raygun_mk3;if(!d)return;
  const mounts={};
  for(const [id,list] of Object.entries(KIT))if(list)mounts[id]=list.map(m=>({model:MODEL,tag:'tag_weapon',at:[0,0,0],...m,node:'part_'+m.node}));
  for(const x of [d,d.upgrade])if(x)Object.assign(x,{statAttachments:Object.keys(KIT),gunsmithPad:false,mounts,slotNames:SLOTS});
}
