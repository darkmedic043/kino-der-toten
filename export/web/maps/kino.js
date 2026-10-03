// Kino der Toten as a map of the engine (engine.js). Everything here used to live in
// upstream's game.js: the map's BO1 entities (doors, wall buys, perks, the box, Pack-a-Punch,
// power, the Bowie knife), the stage teleporter and the projection room trip, the film reels
// and hidden rooms (KinoFeatures), the electric traps, the meteor Easter egg and gas crawlers.
import { World, zoneNames } from '../world.js';
import { KinoFeatures } from '../kino-features.js';

export async function createMap(ctx,entry){
  const {THREE,scene,camera,renderer,audio,vector,shop}=ctx;
  // Kino's look: brighter exposure, a light fog, the camera far plane of the theater.
  renderer.toneMappingExposure=2.05;scene.fog=new THREE.FogExp2(0x14181b,.00032);camera.far=14000;camera.updateProjectionMatrix();
  camera.position.set(-101,168,1256);camera.lookAt(160,170,850);
  const traps=[],gasClouds=[],meteors=new Set();
  let spawn,teleportPending=0,linkUntil=0,returnAt=0,cooldownUntil=0;
  const S=()=>ctx.session,W=()=>ctx.world,F=()=>ctx.features;
  const returnToLobby=()=>{const dest=ctx.data.entities.find(e=>e.targetname==='theater_teleport_player0');ctx.moveTo(vector(dest.position),dest.yaw);cooldownUntil=S().time+90;};
  return {
    title:'Kino der Toten',announceTitle:'Kino der Toten',bestKey:'kino.best',shotRange:6000,
    async loadData(){return fetch('game-data.json').then(r=>r.json());},
    async loadWorld(progress){
      const world=new World(scene,ctx.data);await world.load(progress);
      spawn=ctx.data.entities.find(e=>e.targetname==='initial_spawn_points'&&e.script_int==='1');return world;
    },
    spawn:()=>({position:vector(spawn.position),yaw:spawn.yaw}),
    createFeatures:opts=>new KinoFeatures(opts),
    boardCount:b=>b.boards.length||6,
    barrierPoint:b=>b.position.clone().add(new THREE.Vector3(0,25,0)),
    playable:z=>!!W().zoneAt(z.root.position.clone().add(new THREE.Vector3(0,40,0))),
    blocked:()=>!!F().events.room,hideViewmodel:()=>!!F().events.room,
    findPrompt(cam){
      const s=S(),world=W(),data=ctx.data,mysteryBox=ctx.mysteryBox,features=F();let best=null,distance=115;
      for(const e of world.interactions){
        if(e.targetname?.startsWith('trigger_movie_reel_')&&!features.events.available(e.id))continue;
        if(e.targetname==='meteor_egg_trigger'&&meteors.has(e.id))continue;
        if(e.targetname==='treasure_chest_use'&&!mysteryBox.available(e))continue;
        if(e.targetname==='zombie_door'){const d=world.doors.get(e.target);if(s.openDoors.has(e.target)||(d.electric&&s.power))continue;}
        if(e.targetname==='use_elec_switch'&&s.power)continue;
        if(e.targetname==='weapon_upgrade'&&!data.weapons[e.zombie_weapon_upgrade])continue;
        const dist=cam.position.distanceTo(vector(e.position));if(dist<distance){distance=dist;best=e;}
      }
      if(!best)return null;
      const e=best;let text='';
      if(e.targetname==='zombie_door'){const d=world.doors.get(e.target);text=d.electric?'The power must be activated':'Open door · '+d.cost;}
      if(e.targetname==='weapon_upgrade')text=shop.wallPrompt(e.zombie_weapon_upgrade);
      if(e.targetname==='zombie_vending')text=shop.perkPrompt(e.script_noteworthy);
      if(e.targetname==='use_elec_switch')text='Turn on the power';
      if(e.targetname==='meteor_egg_trigger')text='Listen to the meteor fragment';
      if(e.targetname==='bowie_upgrade')text=s.bowie?'Bowie Knife equipped':'Bowie Knife · 3000';
      if(e.targetname==='treasure_chest_use')text=shop.boxPrompt(e);
      if(e.targetname==='trigger_teleport_pad_0')text=!s.power?'The power must be activated':s.teleporter==='linked'?'Teleport to the projection room':s.teleporter==='cooldown'?'Teleporter cooling down':s.teleporter==='linking'?'Link the pad in the lobby':'Initiate teleporter link';
      if(e.targetname==='pf16_auto1')text=s.teleporter==='linking'?'Link with the mainframe':'Link the teleporter on the stage first';
      if(e.targetname==='zombie_vending_upgrade')text=shop.packPrompt();
      if(e.targetname?.endsWith('_room_trap'))text=!s.power?'The power must be activated':'Activate electric trap · 1000';
      text=features.prompt(e)??text;
      return {target:e,text,distance};
    },
    interact(e){
      const s=S(),world=W(),t=e.targetname,features=F();
      if(t==='claymore_purchase'||e.script_noteworthy==='auto_turret_trigger'||t?.startsWith('trigger_movie_reel_')||t==='trigger_change_projector_reels')return features.interact(e);
      if(t==='meteor_egg_trigger'){meteors.add(e.id);audio.play('buy');ctx.toast('Meteor fragment '+meteors.size+' / 3');if(meteors.size===3){audio.playMusic('115');ctx.announce('115','MUSICAL EASTER EGG');}return true;}
      if(t==='bowie_upgrade'){if(s.bowie||!shop.pay(3000))return false;s.bowie=true;ctx.toast('Bowie Knife');return true;}
      if(t==='zombie_door'){
        const d=world.doors.get(e.target);if(d.electric){ctx.toast('Turn on the power');return false;}if(s.openDoors.has(e.target)||!shop.pay(d.cost))return false;
        s.openDoors.add(e.target);if(d.flag)s.flags.add(d.flag);world.setDoors(s);ctx.toast('Door opened');return true;
      }
      if(t==='weapon_upgrade')return shop.buyWall(e.zombie_weapon_upgrade);
      if(t==='zombie_vending')return shop.buyPerk(e.script_noteworthy);
      if(t==='use_elec_switch'&&!s.power)return shop.powerOn('THE SHOW GOES ON');
      if(t==='treasure_chest_use')return shop.useBox(e);
      if(t==='zombie_vending_upgrade')return shop.usePack();
      if(t==='trigger_teleport_pad_0'&&s.power){
        if(s.teleporter==='unlinked'){s.teleporter='linking';linkUntil=s.time+30;ctx.toast('Link the mainframe pad in the lobby',5);return true;}
        if(s.teleporter==='linked'&&!teleportPending){teleportPending=s.time+2;ctx.toast('Teleporting…');return true;}return false;
      }
      if(t==='pf16_auto1'&&s.teleporter==='linking'){s.teleporter='linked';ctx.toast('Teleporter linked',4);audio.play('buy');return true;}
      if(t?.endsWith('_room_trap')&&s.power){
        if(traps.some(tr=>tr.name===t&&tr.cooldown>s.time)){ctx.toast('Trap cooling down');return false;}if(!shop.pay(1000))return false;
        const p=vector(e.position),mesh=new THREE.Mesh(new THREE.CylinderGeometry(60,60,100,12,1,true),new THREE.MeshBasicMaterial({color:0x8cbbff,transparent:true,opacity:.24,wireframe:true}));mesh.position.copy(p);scene.add(mesh);traps.push({name:t,position:p,mesh,end:s.time+30,cooldown:s.time+90});return true;
      }
      return false;
    },
    onKill(z){
      if(!z.gasDeath)return;
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(75,12,8),new THREE.MeshBasicMaterial({color:0x8ca345,transparent:true,opacity:.14,depthWrite:false}));
      mesh.scale.set(1.65,.6,1.65);mesh.position.copy(z.root.position).add(new THREE.Vector3(0,28,0));scene.add(mesh);gasClouds.push({mesh,position:z.root.position.clone(),life:7});
      ctx.effect(mesh.position,0x9eb652,15);audio.play('explosion');
      for(const other of [...ctx.enemies.list])if(other.root.position.distanceTo(z.root.position)<96)ctx.enemies.hurt(other,other.maxHealth,false,false,'explosion');
      if(ctx.player.getFeetPosition().distanceTo(z.root.position)<96)ctx.damage(45);
    },
    update(dt){
      const s=S(),features=F(),feet=ctx.player.getFeetPosition();
      if(s.teleporter==='linking'&&s.time>linkUntil){s.teleporter='unlinked';ctx.toast('Teleporter link timed out');}
      if(teleportPending&&s.time>=teleportPending){teleportPending=0;const dest=ctx.data.entities.find(e=>e.targetname==='projroom_teleport_player0');ctx.player.setPosition(vector(dest.position));returnAt=s.time+30;s.teleporter='cooldown';ctx.flash();ctx.toast('Projection room · 30 seconds',4);}
      if(returnAt&&s.time>=returnAt){
        returnAt=0;const room=features.events.chooseRoom();
        if(room){features.events.room=room;features.events.roomUntil=s.time+5.8;ctx.moveTo(vector(room.position),room.yaw);ctx.toast('A room outside time… find a film reel.',5);}
        else returnToLobby();ctx.flash();
      }
      if(features.events.room&&s.time>=features.events.roomUntil){features.events.room=null;returnToLobby();}
      if(cooldownUntil&&s.time>cooldownUntil){cooldownUntil=0;s.teleporter='unlinked';}
      for(const tr of traps)if(s.time<tr.end){tr.mesh.rotation.y+=dt*3;for(const z of [...ctx.enemies.list])if(z.root.position.distanceTo(tr.position)<100)ctx.enemies.hurt(z,99999,false,false,'electric');if(feet.distanceTo(tr.position)<75)ctx.damage(dt*100);}else tr.mesh.visible=false;
      let gassed=false;
      for(const g of [...gasClouds]){g.life-=dt;g.mesh.material.opacity=.14*Math.min(1,g.life/2);g.mesh.rotation.y+=dt*.2;if(feet.distanceTo(g.position)<125)gassed=true;if(g.life<=0){g.mesh.removeFromParent();g.mesh.geometry.dispose();g.mesh.material.dispose();gasClouds.splice(gasClouds.indexOf(g),1);}}
      ctx.setFilter(gassed?'blur(3px)':'');
    },
    reset(){
      for(const group of [traps,gasClouds]){for(const item of group){item.mesh.removeFromParent();item.mesh.geometry?.dispose();item.mesh.material?.dispose();}group.length=0;}
      meteors.clear();teleportPending=0;returnAt=0;linkUntil=0;cooldownUntil=0;
    },
    hudEffects:()=>returnAt?'<span>RETURN IN '+Math.ceil(returnAt-S().time)+'</span>':'',
    location(){const f=F();return f.events.room?'Hidden room · '+Math.max(0,Math.ceil(f.events.roomUntil-S().time))+'s':returnAt?'Projection room':zoneNames[W().zoneAt(ctx.player.getFeetPosition().add(new THREE.Vector3(0,35,0)))]??'Kino der Toten';},
    objective(){const s=S(),f=F();return f.events.carried?'Film reel carried · return to the projector':f.events.installed.size?'Film reels projected · '+f.events.installed.size+' / 3':!s.power?'Open the theater and restore power':s.teleporter==='unlinked'?'Link the stage teleporter and lobby pad':s.teleporter==='linking'?'Activate the lobby pad':s.teleporter==='linked'?'Teleporter ready · return to the stage':'';},
    state(){const s=S(),world=W();return {doors:world?[...world.doors.values()].map(d=>({name:d.name,cost:d.cost,flag:d.flag,open:s.openDoors.has(d.name),triggers:d.triggers.map(e=>e.position),parts:d.parts.length})):[]};},
    debug:{
      completionState:()=>F().snapshot(),
      getEntities:()=>ctx.data.entities.filter(e=>e.classname==='trigger_use'||e.targetname==='initial_spawn_points'),
      specialState:()=>({meteors:meteors.size,gasClouds:gasClouds.length,boxLocation:W().activeBox.id,box:ctx.mysteryBox.snapshot().find(b=>b.id===W().activeBox.id)?.roll??null,boxes:ctx.mysteryBox.snapshot(),boxMoves:ctx.mysteryBox.moves,fireSale:!!W().fireSale,pickups:ctx.powerups.snapshot()}),
    },
  };
}
