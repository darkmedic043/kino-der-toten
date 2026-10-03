// Moon (Black Ops' "Moon") as a map of the engine (engine.js), replacing upstream's separate
// moon.html game: the engine runs the combat (weapons, enemies, power-ups, perk drinks, rounds,
// HUD, mods) and this module brings Moon's world and rules, moved from upstream's moon.js and
// moon-combat.js:
//   - the level (moon.gltf + collision.bin), moving doors and airlocks, navigation, water;
//   - No Man's Land (Area 51) and Griffin Station, the teleporters between them
//     (MoonState), environments with low gravity and no air, P.E.S. life support;
//   - MoonSession / MoonEnemies (astronaut, digger hazards, areas) and MoonFeatures (the quest,
//     the Hacker, perks incl. Mule Kick, the Mystery Box, windows, excavators, Gersh / QED);
//   - the Wave Gun / Zap Guns, thrown Moon equipment, low-gravity grenades, Moon's HUD panel.
// MoonFeatures and MoonPresentation drive Moon's systems through a `combat` object, which is
// built here from the engine's parts.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { CollisionWorld, loadCollisionWorld } from '../collision-world.js';
import { optimizeStaticScene } from '../scene-optimizer.js';
import { MoonState, contains, environmentAt } from '../moon-rules.js';
import { MoonNavigation } from '../moon-navigation.js';
import { MoonFeatures } from '../moon-features.js';
import { MoonPresentation } from '../moon-presentation.js';
import { loadMoonWater } from '../moon-water.js';
import { MoonSession, MOON_PERKS } from '../moon-session.js';
import { MoonEnemies } from '../moon-enemies.js';
import { MoonAudio } from '../moon-audio.js';
import { loadModel } from '../animation.js';
import { MapFeatures } from './custom.js';

const LABELS={nml_zone:'No Man’s Land',bridge_zone:'Receiving Bay',water_zone:'Lunar Surface',cata_left_start_zone:'Tunnel 6',cata_left_middle_zone:'Tunnel 6',cata_right_start_zone:'Tunnel 11',cata_right_middle_zone:'Tunnel 11',cata_right_end_zone:'Tunnel 11',generator_zone:'Power / MPD',generator_exit_east_zone:'Laboratories',enter_forest_east_zone:'Upper Laboratories',forest_zone:'Biodome',tower_zone_east:'Laboratories',tower_zone_east2:'Laboratories'};

// The engine's session interface on top of Moon's rules.
class MoonMapSession extends MoonSession {
  get busy(){return !['gameover','reviving'].includes(this.phase)?(!!this.drinking||this.meleeLeft>0||this.effects.death_machine>this.time):true;}
  get weaponUnavailable(){return !!this.pack;}
  leaveAttachment(){}
  toggleAttachment(){return this.toggleWave();}   // the attachment key combines / splits the Zap Guns
  buyClaymores(){return false;}giveMonkeys(){return false;}
}

export async function createMap(ctx,entry){
  const {THREE,scene,camera,renderer,audio}=ctx;
  const V=a=>new THREE.Vector3(...a);
  // Moon's look and sound.
  renderer.toneMappingExposure=1.45;scene.background=new THREE.Color(0x4c545e);scene.fog=null;camera.far=70000;camera.updateProjectionMatrix();
  ctx.ambient.color.set(0xb4c6d7);ctx.ambient.intensity=1.1;ctx.hemi.color.set(0xc6d6ea);ctx.hemi.groundColor.set(0x434853);ctx.hemi.intensity=1.7;
  ctx.keyLight.color.set(0xe7efff);ctx.keyLight.intensity=2.4;ctx.keyLight.position.set(-.6,1,-.3);ctx.fill.color.set(0x8191b3);ctx.fill.intensity=.6;ctx.fill.position.set(1,.3,.5);
  Object.setPrototypeOf(audio,MoonAudio.prototype);Object.assign(audio,{music:{stop(){}},ambientKey:null,ambientToken:0});   // Moon's sounds, ambience and Wave Gun
  installHud();

  let mapData,state,collision,navigation,water,features,presentation,onMoon=false,checkpoint='area51',environment={},spawnPoint=null,prompt=null;
  const objects=new Map(),parts=new Map(),opened=new Set(),thrown=[],equipmentModels={};
  const S=()=>ctx.session;

  // ---- world ------------------------------------------------------------------------------
  function makePart(entity,object){
    const box=entity.bounds?new THREE.Box3(V(entity.bounds[0]),V(entity.bounds[1])):object?new THREE.Box3().setFromObject(object):null;
    if(!box||box.isEmpty())return null;
    const size=box.getSize(new THREE.Vector3());if(Math.min(size.x,size.y,size.z)<.01)return null;
    const geometry=new THREE.BoxGeometry(size.x,size.y,size.z);geometry.translate(...box.getCenter(new THREE.Vector3()).toArray());geometry.computeBoundingBox();
    return {entity,object,origin:object?.position.clone(),delta:new THREE.Vector3(),amount:0,collider:new CollisionWorld(geometry)};
  }
  function capsuleIntersect(capsule){
    const hit=collision.capsuleIntersect(capsule);if(hit)return hit;
    for(const part of parts.values()){
      if(part.removable&&part.amount>=1)continue;
      const local=capsule.clone();local.translate(part.delta.clone().negate());
      const contact=part.collider.capsuleIntersect(local);if(contact)return contact;
    }
    for(const z of ctx.enemies?.list??[]){
      const p=z.root.position,feet=capsule.start.y-capsule.radius,top=capsule.end.y+capsule.radius;
      if(feet>p.y+65||top<p.y+4)continue;
      const normal=new THREE.Vector3(capsule.start.x-p.x,0,capsule.start.z-p.z),distance=normal.length(),depth=capsule.radius+15-distance;
      if(depth>0)return {normal:distance>.001?normal.divideScalar(distance):new THREE.Vector3(1,0,0),depth};
    }
    return false;
  }
  function rayIntersect(ray,near=0,far=Infinity){
    let hit=collision.rayIntersect(ray,near,far);
    for(const part of parts.values()){
      if(part.window||part.removable&&part.amount>=1)continue;
      const local=ray.clone();local.origin.sub(part.delta);
      const contact=part.collider.rayIntersect(local,near,hit?Math.min(hit.distance,far):far);
      if(contact){contact.position.add(part.delta);hit=contact;}
    }
    return hit;
  }
  const lineClear=(a,b)=>{const d=b.clone().sub(a);return !rayIntersect(new THREE.Ray(a,d.clone().normalize()),1,Math.max(1,d.length()-4));};
  const envAt=p=>{const env=environmentAt(mapData,p.clone().add(new THREE.Vector3(0,35,0)).toArray(),state.power,navigation.area==='moon');return features?.environment(env)??env;};
  function updateDoors(dt){
    let changed=false;
    for(const door of mapData.doors)if(opened.has(door.name))for(const id of door.parts){
      const part=parts.get(id);if(!part||part.amount>=1)continue;
      part.amount=Math.min(1,part.amount+dt/Math.max(.25,+(part.entity.script_transition_time||.6)));
      if(part.amount===1)changed=true;
      part.delta.copy(V(part.entity.move||[0,120,0])).multiplyScalar(part.amount);
      if(part.object)part.object.position.copy(part.origin).add(part.delta);
    }
    if(changed)navigation.setDoors(parts);
  }
  // Area 51 or Griffin Station: the enemies, power-ups and wave follow the area.
  function relocate(destination,entityId=null){
    const landmark=mapData.landmarks[destination],e=mapData.entities[entityId??landmark.entity];
    checkpoint=destination;onMoon=destination!=='area51';
    if(ctx.enemies){ctx.enemies.reset();ctx.powerups.reset();S().enterArea(onMoon);S().spawned=S().killed;}
    navigation.area=onMoon?'moon':'earth';
    scene.background.set(onMoon?0x010306:0x4c545e);
    spawnPoint={position:V(e.position).add(new THREE.Vector3(0,3,0)),yaw:e.yaw};
    if(ctx.player){ctx.player.setPosition(spawnPoint.position.clone());camera.rotation.set(0,e.yaw-Math.PI/2,0);}
    state.exposure=0;state.teleport=null;state.cooldown=4;
    ctx.toast(destination==='area51'?'Reach the teleporter at the far end of the yard.':onMoon&&!state.hasSuit?'Find the P.E.S. station. F to equip life support.':landmark.label,destination==='area51'?7:4);
  }

  // ---- distance culling ---------------------------------------------------------------------
  // Moon has no fog and a 70 000-unit view, so every prop batch on the map was drawn (~2 200 draw
  // calls in the station). Small static meshes drop out past a distance scaled by their size
  // (a 30-unit prop at ~2 700, a 100-unit one at ~9 000); the terrain, shells and big structures stay.
  // Culling moves a mesh to layer 1 rather than touching .visible, which the Moon features own.
  const cullable=[];let cullTimer=0;
  function buildCuller(roots){
    const sphere=new THREE.Sphere();
    for(const root of roots)root.traverse(o=>{
      if(!o.isMesh||o.isSkinnedMesh||!o.geometry)return;
      if(o.isInstancedMesh){o.computeBoundingSphere();sphere.copy(o.boundingSphere);}else{o.geometry.boundingSphere||o.geometry.computeBoundingSphere();sphere.copy(o.geometry.boundingSphere);}
      sphere.applyMatrix4(o.matrixWorld);if(sphere.radius>1500)return;
      cullable.push({o,center:sphere.center.clone(),far:Math.max(1500,sphere.radius*90)+sphere.radius,shown:true});
    });
  }
  function cull(dt){
    if((cullTimer-=dt)>0)return;cullTimer=.2;const eye=camera.position;
    for(const c of cullable){const show=c.center.distanceToSquared(eye)<c.far*c.far;if(show!==c.shown){c.shown=show;show?c.o.layers.enable(0):c.o.layers.disable(0);}}
  }

  // ---- the "combat" MoonFeatures / MoonPresentation work through ---------------------------
  const worldApi={
    get physics(){return {capsuleIntersect,rayIntersect};},get navigation(){return navigation;},get collision(){return collision;},
    entities:objects,barriers:[],navDisabled:new Set(),
    path:(a,b)=>navigation.path(a,b),closest:(p,e)=>navigation.closest(p,e),raycast:rayIntersect,lineClear,
    zoneAt:p=>envAt(p).zone,lowGravity:p=>envAt(p).lowGravity,
    setDoors(){},setBoards(){},reset(){},spawnBarriers:()=>[],
  };
  const combat={
    enabled:true,world:worldApi,
    get session(){return S();},get data(){return ctx.data;},get enemies(){return ctx.enemies;},get view(){return ctx.view;},get audio(){return audio;},
    get pickups(){return ctx.powerups;},get perkDrink(){return ctx.perkDrink;},
    equip:()=>ctx.equipView(),effect:(p,c,n)=>ctx.effect(p,c,n),damage:n=>ctx.damage(n),collect:t=>ctx.collect(t),clearInput:()=>ctx.clearInput(),
    notice:(t,d)=>ctx.toast(t,d),
  };

  // Moon's features: the reused projectile/claymore system, plus MoonFeatures and thrown equipment.
  class MoonMapFeatures extends MapFeatures {
    async load(){await super.load();await features.load();presentation=new MoonPresentation(scene,camera,features);await presentation.load();}
    placeClaymore(){return false;}
    packMachine(){return features.one('zombie_vending_upgrade');}   // the gun shown in the machine sits in Moon's machine
    throwMonkey(){   // X: the Gersh Device / QED
      const s=S();if(!s.canAct||!s.equipment||s.equipmentAmmo<=0)return false;
      s.equipmentAmmo--;const mesh=clone(equipmentModels[s.equipment]);mesh.position.copy(camera.position);scene.add(mesh);
      thrown.push({mesh,velocity:camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(440).add(new THREE.Vector3(0,110,0)),life:2,id:s.equipment});return true;
    }
    update(dt){super.update(dt);}
    reset(){super.reset?.();for(const t of thrown)t.mesh.removeFromParent();thrown.length=0;}
    snapshot(){return features?.snapshot?.()??{};}
  }

  return {
    title:'Moon',announceTitle:'Moon',bestKey:'kino.best.moon',shotRange:6000,
    Session:MoonMapSession,Enemies:MoonEnemies,perkInfo:MOON_PERKS,
    player:{radius:15,crouchSpeed:90,stepHeight:18,groundProbeDistance:4,fallResetY:-3000},   // No Man's Land is at y≈-680
    async loadData(){
      const [combatData,map]=await Promise.all([fetch('moon/combat-data.json').then(r=>{if(!r.ok)throw new Error('Missing Moon combat assets; rebuild Moon.');return r.json();}),
        fetch('moon/map-data.json').then(r=>{if(!r.ok)throw new Error('Moon data is missing. Run .tools/rebuild-moon.ps1.');return r.json();})]);
      mapData=map;state=new MoonState(mapData.rules);
      combatData.entities??=[];combatData.zoneLinks??=[];   // Kino's entity-driven systems (reels, zones) stay empty here
      return combatData;
    },
    async loadWorld(progress){
      progress('Loading lunar geometry, textures and collision',20);
      const [gltf,world]=await Promise.all([new GLTFLoader().loadAsync('moon/moon.gltf'),loadCollisionWorld({metadataUrl:'moon/collision.json'})]);
      collision=world;scene.add(gltf.scene);scene.updateMatrixWorld(true);
      water=await loadMoonWater(gltf.scene);
      const hazardIds=mapData.entities.filter(e=>['digger_hangar_blocker','digger_teleporter_blocker'].includes(e.targetname)).map(e=>e.id);
      const windowGroups=new Set(mapData.entities.filter(e=>e.targetname==='exterior_goal').map(e=>e.target));
      const windowIds=mapData.entities.filter(e=>windowGroups.has(e.targetname)&&e.script_noteworthy==='clip').map(e=>e.id);
      const boardIds=mapData.entities.filter(e=>windowGroups.has(e.targetname)&&e.script_parameters?.startsWith('barricade_')).map(e=>e.id);
      const moving=new Set([...mapData.doors.flatMap(d=>d.parts),...hazardIds,...windowIds,...boardIds]),detach=[];
      gltf.scene.traverse(o=>{
        if(o.userData.collisionOnly)o.visible=false;
        // Native sky materials use cubemap shaders; their flat DDS preview makes opaque blue boxes.
        if(o.isMesh&&/(?:sky_day|mtl_skybox)/i.test(o.material?.name||''))o.visible=false;
        if(o.isMesh&&/moon_vista_earth/i.test(o.material?.name||''))o.visible=false;
        if(o.userData.entityId!==undefined){objects.set(o.userData.entityId,o);detach.push(o);}
      });
      for(const o of detach){scene.attach(o);o.matrixAutoUpdate=true;}
      for(const id of moving){const part=makePart(mapData.entities[id],objects.get(id));if(part){part.hazard=hazardIds.includes(id);part.window=windowIds.includes(id);part.removable=part.hazard||boardIds.includes(id);if(part.hazard)part.amount=1;parts.set(id,part);}}
      if(!/bakeLight/.test(location.search)){   // the light bake traces the plain meshes (instancing would hide them from its rays)
      optimizeStaticScene(gltf.scene,{cellSize:4096});
      buildCuller([gltf.scene,...[...objects].filter(([id])=>!parts.has(id)).map(([,o])=>o)]);}
      navigation=new MoonNavigation(mapData);await navigation.load();navigation.setDoors(parts);
      relocate('area51');
      return worldApi;
    },
    spawn:()=>spawnPoint,
    createFeatures(opts){
      features=new MoonFeatures({data:mapData,state,combat,scene,camera,player:ctx.player,objects,opened,parts,navigation,notice:(t,d)=>ctx.toast(t,d),raycast:rayIntersect});
      return new MoonMapFeatures(opts);
    },
    async ready(){
      await Promise.all(Object.entries(ctx.data.equipment??{}).map(async([id,d])=>{equipmentModels[id]=await loadModel(d.worldModel);}));
      water.captureReflection(renderer,scene);
    },
    createMysteryBox(){   // MoonFeatures runs Moon's box; the engine just ticks it
      return {load:async()=>{},reset(){},warm(){},update:dt=>features?.box?.update(dt),get moves(){return features?.box?.moves??0;},snapshot:()=>features?.box?.snapshot()??[],available:()=>false};
    },
    boardCount:()=>0,brokenWindows:()=>features?.brokenWindows??0,
    viewDef:def=>state.suit?{...def,handsModel:ctx.data.props.viewmodel_zom_pressure_suit_arms}:def,
    announceRounds:()=>S().area==='moon',
    roundText(){const s=S();return s.area==='earth'?{round:'',remaining:'NO MAN’S LAND · REACH THE TELEPORTER'}:null;},
    dropAllowed:z=>!(S().area==='earth'||z.kind==='astronaut'||['wave','gersh'].includes(z.deathCause)),
    onKill:z=>features.onKill(z),
    onPowerup(type){if(type==='carpenter')features.repairAll();},
    beforeDamage(){const s=S();if(s.area==='earth'&&s.effects.pack_shield>s.time&&camera.position.distanceTo(V(features.one('zombie_vending_upgrade').position))<220)return false;},
    onShot:(ray,far,kind)=>features?.shot(ray,kind,kind==='melee'?94:6000),
    gravityAt:p=>worldApi.lowGravity(p)?136:650,
    // The Wave Gun cooks everything in a cone; the Zap Guns kill whatever they hit.
    fire(def,forward){
      const s=S();
      if(def.id==='microwavegun_zm'){
        features.shot(new THREE.Ray(camera.position.clone(),forward),'wave');
        for(const z of [...ctx.enemies.list]){const delta=z.root.position.clone().add(new THREE.Vector3(0,35,0)).sub(camera.position),d=delta.length();
          if(d<(s.weapon.upgraded?1400:1000)&&delta.normalize().dot(forward)>.78&&lineClear(camera.position,ctx.enemies.headPosition(z)))ctx.enemies.hurt(z,z.health,false,false,'wave');}
        ctx.effect(camera.position.clone().addScaledVector(forward,110),0xccecff,20);return true;
      }
      if(def.id==='microwavegundw_zm'){
        const ray=new THREE.Ray(camera.position.clone(),forward),wall=rayIntersect(ray,1,6000),hit=ctx.enemies.rayHit(ray,wall?.distance??6000);
        features.shot(ray,'bullet');if(hit)ctx.enemies.hurt(hit.z,hit.z.health,hit.head,false,'zap');else if(wall)ctx.effect(wall.position,0xbbb4a7,3);return true;
      }
      return false;
    },
    // Environment (gravity, air), Stamin-Up, jump pads: before the player moves.
    prePlayer(){
      const s=S(),feet=ctx.player.getFeetPosition();
      environment=environmentAt(mapData,feet.clone().add(new THREE.Vector3(0,35,0)).toArray(),state.power,onMoon);environment=features.environment(environment);
      audio.environment(environment);
      ctx.player.gravity=environment.gravity;ctx.player.jumpSpeed=environment.lowGravity?190:Math.sqrt(2*mapData.rules.normalGravity*39);
      ctx.player.moveSpeed=s.perks.has('specialty_longersprint')?209:190;ctx.player.sprintSpeed=s.perks.has('specialty_longersprint')?330:285;
      return !!features.flight;
    },
    findPrompt(cam){
      prompt=null;let distance=110;
      for(const e of mapData.entities){
        const suit=e.zombie_equipment_upgrade==='equip_gasmask_zm',power=e.targetname==='use_elec_switch';
        const door=mapData.doors.find(d=>!opened.has(d.name)&&d.triggers.includes(e.id));
        const weapon=e.targetname==='weapon_upgrade'&&ctx.data.weapons[e.zombie_weapon_upgrade];
        if((!suit||state.hasSuit)&&(!power||state.power)&&!door&&!weapon)continue;
        const d=e.bounds?new THREE.Box3(V(e.bounds[0]),V(e.bounds[1])).distanceToPoint(cam.position):cam.position.distanceTo(V(e.position));
        if(d>=distance)continue;
        // a short sight check stops collecting equipment through walls
        const center=V(e.position),direction=center.clone().sub(cam.position);
        if(direction.length()>25&&direction.clone().normalize().dot(cam.getWorldDirection(new THREE.Vector3()))<.25)continue;
        const wall=rayIntersect(new THREE.Ray(cam.position.clone(),direction.clone().normalize()),1,direction.length());
        if(!door&&wall&&wall.distance<direction.length()-28)continue;
        distance=d;prompt={entity:e,door,weapon,kind:door?'door':suit?'suit':weapon?'weapon':'power'};
      }
      let text='';
      if(prompt?.kind==='weapon'){
        const s=S(),w=prompt.weapon,owned=s.inventory.find(x=>x.id===w.id),price=owned?(owned.upgraded?4500:w.ammoPrice??Math.ceil(w.price/2)):w.price;
        const shown=owned&&s.hackedWeapons.has(w.id)?owned.upgraded?(w.ammoPrice??Math.ceil(w.price/2)):4500:price;
        text=`${w.name}${owned?' ammo':''} · ${shown}`;
      }
      const extra=features.findTarget(distance);
      if(extra){prompt={kind:'feature',feature:extra};return {target:prompt,text:extra.label,distance:0};}
      if(!prompt)return null;
      if(!text)text=prompt.kind==='door'?'Open '+(prompt.entity.targetname==='zombie_airlock_buy'?'airlock':'door')+' · '+prompt.door.cost:prompt.kind==='suit'?'Equip P.E.S. life support':prompt.kind==='power'?'Restore power':'';
      return {target:prompt,text,distance};
    },
    interact(t){
      const s=S();
      if(t.kind==='feature')return features.interact(t.feature);
      if(!s.canAct)return false;
      if(t.kind==='suit'){state.equipSuit();s.hacker=false;ctx.toast('P.E.S. equipped · P to remove or replace the helmet.');suitHands();return true;}
      if(t.kind==='power'){state.power=true;s.power=true;ctx.toast('Power restored. Pressurized rooms now have normal gravity.');return true;}
      if(t.kind==='door'){if(!s.buyDoor(t.door)){ctx.toast('Not enough points.');return false;}opened.add(t.door.name);ctx.toast('Passage opened',2);audio.play('buy');return true;}
      if(t.kind==='weapon'){
        if(!s.buyWeapon(t.weapon.id)){ctx.toast(s.inventory.some(w=>w.id===t.weapon.id)?'Not enough points or ammunition already full.':'Not enough points.');return false;}
        ctx.equipView();audio.play('buy');ctx.toast(ctx.data.weapons[t.weapon.id].name);return true;
      }
      return false;
    },
    keydown(e){
      if(e.repeat)return;
      if(e.code==='KeyP'){state.toggleSuit();if(!state.hasSuit)ctx.toast('Find a P.E.S. station in Receiving Bay.');suitHands();}
      if(e.code==='KeyH'){this.findPrompt(camera);if(!features.hackNearby(prompt))ctx.toast('Aim at a hackable box, perk, barricade, door or wall weapon. Equip the Hacker first.');}
      if(e.code==='Tab'){const j=document.getElementById('journal');if(j)j.hidden=!j.hidden;}
    },
    update(dt){
      cull(dt);
      const s=S(),keys=ctx.keys;
      water?.update(Math.min(.25,dt));
      updateDoors(dt);
      const position=ctx.player.getFeetPosition().add(new THREE.Vector3(0,35,0)).toArray();
      const pad=mapData.entities.find(e=>['nml_teleporter','generator_teleporter'].includes(e.targetname)&&contains(e.bounds,position));
      const event=state.update(dt,environment,pad?.targetname);
      if(event.teleport){if(event.teleport==='nml_teleporter')relocate('receiving');else relocate('area51',mapData.returnSpawn);ctx.flash();}
      if(event.suffocated||ctx.player.getFeetPosition().y<-2000){ctx.damage(10000);return;}
      features.update(dt,keys.has('KeyF')||keys.has('KeyE')||keys.has('KeyH'));
      presentation?.update(dt,environment);
      // thrown Gersh / QED
      for(const t of [...thrown]){
        t.life-=dt;t.velocity.y-=(worldApi.lowGravity(t.mesh.position)?136:650)*dt;
        const travel=t.velocity.clone().multiplyScalar(dt),hit=rayIntersect(new THREE.Ray(t.mesh.position.clone(),travel.clone().normalize()),0,travel.length()+4);
        if(hit){const n=hit.triangle.getNormal(new THREE.Vector3());if(n.dot(t.velocity)>0)n.negate();t.velocity.reflect(n).multiplyScalar(.45);t.mesh.position.copy(hit.position).addScaledVector(n,4);}else t.mesh.position.add(travel);
        if(t.life<=0){features.equipment(t.id,t.mesh.position.clone());t.mesh.removeFromParent();thrown.splice(thrown.indexOf(t),1);}
      }
      updateHud();
    },
    beforeReset(){
      opened.clear();Object.assign(state,new MoonState(mapData.rules));
      for(const part of parts.values()){part.amount=part.hazard?1:0;part.delta.set(0,0,0);if(part.object)part.object.position.copy(part.origin);}
      navigation.setDoors(parts);
    },
    reset(){
      features.reset();presentation?.reset();audio.reset?.();relocate('area51');
      ctx.ambient.intensity=1.1;
    },
    location:()=>LABELS[environment.zone]||(environment.zone?.startsWith('airlock')?'Airlock':onMoon?'Griffin Station':'No Man’s Land'),
    objective:()=>features?.quest?.objective?.()??'',
    hudEffects(){const s=S();return s.effects.death_machine>s.time?'<span>DEATH MACHINE '+Math.ceil(s.effects.death_machine-s.time)+'s</span>':'';},
    state:()=>({moon:{onMoon,checkpoint,power:state?.power,hasSuit:state?.hasSuit,suit:state?.suit,exposure:state?.exposure,environment,doors:[...opened],area:S()?.area}}),
    debug:{
      relocate:d=>relocate(d),moonState:()=>({onMoon,checkpoint,state,environment,doors:[...opened]}),
      moonFeatures:()=>features,completionState:()=>features?.snapshot?.(),
    },
  };

  // The P.E.S. swaps the viewmodel arms for the pressure-suit gloves.
  function suitHands(){if(ctx.view)ctx.view.currentId=null;ctx.equipView();}

  // ---- Moon's HUD panel (gravity, power, P.E.S., oxygen, visor, equipment, digger alarms, journal)
  function installHud(){
    const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('moon.css',import.meta.url).href;document.head.append(link);
    const hud=document.createElement('div');hud.id='moon-hud';
    hud.innerHTML=`<div id="visor" hidden></div><div id="earth-flash"></div>
      <div class="moon-systems"><span id="gravity">EARTH GRAVITY</span><span id="power">POWER OFF</span><span id="suit">P.E.S. NOT ACQUIRED</span></div>
      <div id="oxygen" hidden><span>NO OXYGEN · EQUIP P.E.S. (P)</span><progress id="air" max="15" value="15"></progress></div>
      <div id="equipment"></div><div id="hazard" role="status"></div><progress id="hack-progress" max="1" value="0" hidden></progress>
      <aside id="journal" hidden><strong>GRIFFIN STATION / OBJECTIVE</strong><p id="moon-objective"></p><p>Restore power, gather equipment from the Mystery Box and follow the station's clues. H hacks, P toggles the P.E.S., X throws equipment. Tab closes this panel.</p></aside>`;
    document.body.append(hud);
  }
  function updateHud(){
    const $=id=>document.getElementById(id);
    $('visor').hidden=!state.suit;
    $('gravity').textContent=environment.lowGravity?'LOW GRAVITY':'NORMAL GRAVITY';
    $('power').textContent=state.power?'POWER ON':'POWER OFF';
    $('suit').textContent=state.suit?'P.E.S. ACTIVE':state.hasSuit?'P.E.S. OFF · P TO EQUIP':'P.E.S. NOT ACQUIRED';
    $('oxygen').hidden=environment.breathable||state.suit;$('air').max=mapData.rules.suffocationSeconds;$('air').value=mapData.rules.suffocationSeconds-state.exposure;
    $('moon-objective').textContent=features?.quest?.objective?.()??'';
    if(state.teleport){const p=$('prompt');if(p)p.textContent=`Teleporting in ${(mapData.rules.teleportSeconds-state.teleport.elapsed).toFixed(1)}…`;}
  }
}
