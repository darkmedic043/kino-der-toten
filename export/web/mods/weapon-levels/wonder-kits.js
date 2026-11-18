// The wonder weapons' own Gunsmith kits (user 2026-11-18: "build custom attachments for all the wonder weapons besides
// the bows? make sure their camo challenges are unique also"). Five attachments per gun (attachments.json rg_ / tg_ /
// wh_ / dg_ / wv_), no generic padding; the parts come from .tools/build_wonder_attachments.py (parts/wonder_attachments.glb,
// placed in each gun's tag_weapon space, listed in wonder-mounts.json: {gun or "gun:upgrade": {attachment: [mounts]}}).
// The Zap Guns wear the Wave Gun's list (gunsmith.js applyAttachments, def.progressAs). Each gun's effects live with its
// own code (engine.js and mods/thundergun: Thundergun; mods/wonder-weapons: Winter's Howl; mods/bo3-weapons: DG-2;
// mods/moon-weapons: Wave Gun), which also counts the gun's own camo challenges (camos.json alt) through
// kino.camoTally. The Ray Gun has no mod of its own, so its effects and challenges are here.
import * as THREE from 'three';

const PARTS='mods/weapon-levels/parts/wonder_attachments.glb';
const KITS={
  ray_gun_zm:{ids:['rg_canister','rg_accelerator','rg_lens','rg_coil','rg_venom'],slots:{mag:'Canister',barrel:'Emitter',muzzle:'Lens',stock:'Coil',ammo:'Payload'}},
  thundergun_zm:{ids:['tg_chamber','tg_turbine','tg_choke','tg_bellows','tg_static'],slots:{mag:'Air Chamber',barrel:'Turbine',muzzle:'Choke',stock:'Bellows',ammo:'Charge'}},
  freezegun_zm:{ids:['wh_tank','wh_coil','wh_nozzle','wh_compressor','wh_frostbite'],slots:{mag:'Cryo Tank',barrel:'Coil',muzzle:'Nozzle',stock:'Compressor',ammo:'Payload'}},
  tesla_gun_zm:{ids:['dg_rack','dg_conductor','dg_prongs','dg_coil','dg_cells'],slots:{mag:'Bulb Rack',barrel:'Conductor',muzzle:'Prongs',stock:'Coil',ammo:'Cells'}},
  microwavegun_zm:{ids:['wv_cells','wv_magnetron','wv_dish','wv_capacitor','wv_pressure'],slots:{mag:'Ion Cells',barrel:'Magnetron',muzzle:'Dish',stock:'Capacitor',ammo:'Payload'}},
  microwavegundw_zm:{as:'microwavegun_zm'},
};
// attachment ids are on def.attachments ('a+b', gunsmith.js applyStats), the Pack-a-Punched def's too
export const kitHas=(def,id)=>(def?.attachments??'').split('+').includes(id);

export async function applyWonderKits(data){
  let placed={},v='';
  try{const r=await fetch(new URL('wonder-mounts.json',import.meta.url));if(r.ok){placed=await r.json();v=placed._v??'';}}catch{}
  const model=PARTS+(v?'?v='+v:'');
  const mountsOf=m=>Object.fromEntries(Object.entries(m??{}).filter(([a])=>!a.startsWith('_')).map(([a,list])=>[a,[list].flat().map(p=>
    ({model,tag:'tag_weapon',at:[0,0,0],...p,node:p.node.startsWith('part_')?p.node:'part_'+p.node}))]));
  for(const [id,k] of Object.entries(KITS)){
    const d=data.weapons?.[id];if(!d)continue;const kit=KITS[k.as]??k;
    for(const x of [d,d.upgrade]){if(!x)continue;
      // the Pack-a-Punched gun: its own placements when it has its own model (Ray Gun, DG-2), else the base gun's
      const m=x===d?placed[id]:placed[id+':upgrade']??(!x.model||x.model===d.model?placed[id]:null);
      Object.assign(x,{statAttachments:kit.ids,gunsmithPad:false,mounts:mountsOf(m),slotNames:kit.slots});}
  }
}

// ---- the Ray Gun's effects, and its challenges -----------------------------------------------------------------------
export function setupWonderKits(api){
  const {host,enemies,scene}=api,up=new THREE.Vector3(0,1,0);
  const tally=(key,n=1)=>window.kino.camoTally?.('ray_gun_zm',key,n);
  const isRay=def=>(def?.baseId??def?.id)==='ray_gun_zm';
  // a bolt fired in mid-air: the last Ray Gun shot's state, read when its bolt lands
  let airShot=false;
  (host.fireHooks??=[]).push(def=>{if(isRay(def))airShot=!api.player?.isGrounded;return false;});
  // Venom Rounds: a green pool where the splash landed, 3 s, every half second 8% of a standing zombie's health
  // (40% of the bolt's outer splash damage at least)
  const poolMat=new THREE.MeshBasicMaterial({color:0x5dff3a,transparent:true,opacity:.4,depthWrite:false,blending:THREE.AdditiveBlending});
  const poolGeo=new THREE.CircleGeometry(90,28);poolGeo.rotateX(-Math.PI/2);
  {const w=new THREE.Mesh(poolGeo,poolMat);w.visible=false;(host.warmObjects??=[]).push(w);}
  let pools=[];
  const blastHooks=window.kino.blastHooks??=[];
  blastHooks.push(({position,def,caught,direct})=>{
    if(!isRay(def)||host.remoteDamage)return;
    const killed=caught.filter(z=>!enemies.list.includes(z)),directKill=!!direct&&!enemies.list.includes(direct);
    const splash=killed.filter(z=>z!==direct),all=splash.length+(directKill?1:0);
    if(splash.length)tally('rg_splash',splash.length);
    if(all>=3)tally('rg_triple');
    if(all&&airShot)tally('rg_air',all);
    const d=position.distanceTo(api.player.getFeetPosition());   // the bolt's landing point: a dead zombie's root may already be moved off
    if(all&&d>=1500)tally('rg_far',all);else if(all&&d<=120)tally('rg_close',all);
    if(kitHas(def,'rg_venom')){
      const mesh=new THREE.Mesh(poolGeo,poolMat.clone());mesh.position.copy(position);
      const floor=api.world?.raycast?.(new THREE.Ray(position.clone().addScaledVector(up,10),up.clone().negate()),0,200);
      if(floor)mesh.position.y=floor.position.y;mesh.position.y+=1.5;scene.add(mesh);
      pools.push({mesh,t:0,tick:0,dmg:def.explosionOuterDamage??300});
    }
  });
  const clear=()=>{for(const p of pools){p.mesh.removeFromParent();p.mesh.material.dispose();}pools=[];};
  host.on('reset',clear);
  host.on('update',dt=>{
    if(!dt||!pools.length)return;
    pools=pools.filter(p=>{
      p.t+=dt;if(p.t>=3){p.mesh.removeFromParent();p.mesh.material.dispose();return false;}
      p.mesh.material.opacity=.4*Math.min(1,(3-p.t)/.8)*(.85+Math.random()*.15);p.mesh.scale.setScalar(Math.min(1,.4+p.t*3));
      if((p.tick-=dt)<=0){p.tick=.5;
        for(const z of [...enemies.list])if(z.health>0&&z.root.position.distanceTo(p.mesh.position)<90){
          enemies.hurt(z,Math.max(p.dmg*.4,(z.maxHealth??z.health)*.08),false,false,'explosion');
          if(!enemies.list.includes(z))tally('rg_splash');}
        const fx=window.kino.fx;if(fx?.emit)fx.emit({key:'smoke',at:p.mesh.position.clone().add(fx.jitter(40)).setY(p.mesh.position.y+8),vel:new THREE.Vector3(0,30,0),size:[16,50],life:.9,fade:[.1,.7],color:0x6dff4a,opacity:.25,drag:1.5});}
      return true;});
  });
}
