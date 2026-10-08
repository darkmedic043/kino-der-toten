// A zombies world built from any glTF map plus named marker objects (not part
// of upstream). It exposes the same interface as world.js so the upstream
// enemies, Mystery Box, powerups and weapons run on it unchanged.
// Marker names and options are documented in mods/README.md.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { init, NavMeshQuery } from '@recast-navigation/core';
import { generateTiledNavMesh } from '@recast-navigation/generators';
import { CollisionWorld } from './collision-world.js';
import { optimizeStaticScene } from './scene-optimizer.js';
import { loadModel } from './animation.js';
import { assetManager } from './runtime-assets.js';

const PERKS={jugg:'specialty_armorvest',juggernog:'specialty_armorvest',armorvest:'specialty_armorvest',revive:'specialty_quickrevive',quickrevive:'specialty_quickrevive',
  speedcola:'specialty_fastreload',speed:'specialty_fastreload',sleight:'specialty_fastreload',fastreload:'specialty_fastreload',doubletap:'specialty_rof',rof:'specialty_rof',
  // the perks-plus mod's perks
  staminup:'specialty_longersprint',stamin:'specialty_longersprint',marathon:'specialty_longersprint',longersprint:'specialty_longersprint',
  deadshot:'specialty_deadshot',ads:'specialty_deadshot',mulekick:'specialty_additionalprimaryweapon',mule:'specialty_additionalprimaryweapon',threegun:'specialty_additionalprimaryweapon'};
const PERK_MODELS={specialty_armorvest:'zombie_vending_jugg',specialty_quickrevive:'zombie_vending_revive',specialty_fastreload:'zombie_vending_sleight',specialty_rof:'zombie_vending_doubletap'};
// BO3's machines (perks-plus, .tools/build_bo3_machines.py; git-ignored). The perks-plus perks always use them (Mule Kick
// falls back to Moon's BO1 machine); a map entry "machines": "bo3" uses them for every perk and Pack-a-Punch.
// Like the BO1 GLBs they face +Z (the same CoD -> glTF conversion). A map whose markers carry BO3's own angles (the
// BO3 map builder) sets perkYaw -90 to undo FACE.
const BO3_MACHINE=n=>`mods/perks-plus/models/p7_zm_vending_${n}.glb`;
const BO3_MACHINES={specialty_armorvest:'jugg',specialty_quickrevive:'revive',specialty_fastreload:'sleight',specialty_rof:'doubletap2',
  specialty_longersprint:'marathon',specialty_deadshot:'ads',specialty_additionalprimaryweapon:'three_gun',pap:'packapunch'};
const MACHINE_FALLBACK={specialty_additionalprimaryweapon:'moon/models/zombie_vending_three_gun.glb'};
const MARKER=/^(PLAYER_SPAWN|SPAWN_PLAYER|ZSPAWN|WINDOW|DOOR|WALLBUY|PERK|BOX|PAP|PACKAPUNCH|POWER|CLAYMORE|TRAPZONE|TRAP|TELEPORT|TPDEST|EGG|RISING|MOVER)(?:_(.*))?$/i;
const TRAP_COLORS={electric:0x8cbbff,fire:0xff7a2e};
const COLLISION_NAME=/^(COL|UCX|collision)[_.-]/i;
// Machine models face their local +Z; markers face their local +X (Blender's red axis).
const FACE=Math.PI/2;
const up=new THREE.Vector3(0,1,0),_negOffset=new THREE.Vector3();

function rawName(o){return String(o.userData.name??o.name).replace(/\.\d{3}$/,'');}
function worldYaw(o){const f=new THREE.Vector3(1,0,0).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));return Math.atan2(-f.z,f.x);}
function boxCollider(box){const size=box.getSize(new THREE.Vector3());if(size.x<.01||size.y<.01||size.z<.01)return null;const g=new THREE.BoxGeometry(size.x,size.y,size.z);g.translate(...box.getCenter(new THREE.Vector3()).toArray());return new CollisionWorld(g);}
function positionsOf(meshes){
  const geometries=meshes.map(o=>{
    const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
    for(const name of Object.keys(g.attributes))if(name!=='position')g.deleteAttribute(name);
    g.morphAttributes={};return g.applyMatrix4(o.matrixWorld);
  });
  return geometries.length?mergeGeometries(geometries,false):null;
}

export class CustomWorld {
  constructor(scene,data,entry){
    this.scene=scene;this.data=data;this.entry=entry;
    this.doors=new Map();this.entities=new Map();this.barriers=[];this.dynamic=[];this.navDisabled=new Set();
    this.interactions=[];this.boxLocations=[];this.openBoxes=new Set();this.fireSale=false;this.hasPower=false;this.zones=[];this.traps=new Map();this.teleporters=[];this.eggs=new Map();this.powerLights=[];this.warnings=[];
  }
  async load(progress){
    const entry=this.entry,dir=entry.dir.replace(/\/?$/,'/');
    progress('Loading '+entry.title,15);
    const gltf=await new GLTFLoader(assetManager).loadAsync(dir+entry.model);
    const root=gltf.scene;root.scale.setScalar(entry.scale??1);this.scene.add(root);root.updateMatrixWorld(true);
    this.prepareLights(root,entry.scale??1);
    this.root=root;

    // Sort the scene into markers, doors, collision-only meshes and scenery.
    const markers=[];
    root.traverse(o=>{
      const m=MARKER.exec(rawName(o));
      if(!m||o.parent?.userData.marker)return;
      o.userData.marker=true;
      o.traverse(c=>{c.userData.marker=true;});
      markers.push({type:m[1].toUpperCase().replace('SPAWN_PLAYER','PLAYER_SPAWN').replace('PACKAPUNCH','PAP'),arg:(m[2]??'').toLowerCase(),extras:o.userData,object:o,
        position:o.getWorldPosition(new THREE.Vector3()),yaw:worldYaw(o)});
    });
    const meshes=[];root.traverse(o=>{if(o.isMesh&&!o.userData.marker)meshes.push(o);});
    const dedicated=meshes.filter(o=>COLLISION_NAME.test(rawName(o)));
    for(const o of dedicated)o.visible=false;
    progress('Building collision',35);
    const solid=positionsOf(dedicated.length?dedicated:meshes);
    if(!solid)throw new Error('The map has no meshes to stand on');
    this.collision=new CollisionWorld(solid);

    // RISING_<delay>_<speed>: a mesh (a death plane such as rising lava or cheese) that starts rising after <delay>
    // seconds of game time at <speed> units/s and kills whatever it reaches. Render-only: no collision or navigation.
    this.rising=markers.filter(m=>m.type==='RISING').map(m=>{
      const tokens=m.arg.split('_').filter(Boolean).map(Number).filter(Number.isFinite);
      const box=new THREE.Box3().setFromObject(m.object);
      return {object:m.object,baseY:m.object.position.y,delay:m.extras.delay??tokens[0]??60,speed:m.extras.speed??tokens[1]??1,topAtStart:box.max.y,top:box.max.y};
    });

    // MOVER_<id> meshes are moving platforms: map entry `movers` names a JSON file in the map folder with their timing
    // [{id, delta:[x,y,z] (scene units), out, back, cycle, duration}] (seconds of game time). They are left out of the
    // static collision and navmesh and get their own moving collision, which also carries the player.
    this.movers=[];
    if(entry.movers){
      const defs=await fetch(dir+entry.movers).then(r=>r.json()).catch(()=>[]),byId=new Map(defs.map(d=>[String(d.id).toLowerCase(),d]));
      const groups=new Map();
      for(const m of markers.filter(m=>m.type==='MOVER')){const d=byId.get(m.arg);if(!d)continue;if(!groups.has(m.arg))groups.set(m.arg,{def:d,objects:[]});groups.get(m.arg).objects.push(m.object);}
      for(const {def,objects} of groups.values())this.addMover(def,objects);
    }

    // Doors keep their own geometry and are left out of collision and navigation.
    for(const m of markers.filter(m=>m.type==='DOOR')){
      const tokens=m.arg.split('_').filter(Boolean),name=rawName(m.object)+'#'+this.doors.size;
      const cost=+(m.extras.cost??tokens.find(t=>/^\d+$/.test(t))??750);
      const zone=String(m.extras.zone??tokens.find(t=>!/^\d+$/.test(t))??'').toLowerCase()||null;
      const box=new THREE.Box3().setFromObject(m.object);
      // The navmesh cut around a closed door covers every polygon the box touches (up to ~48 units beyond it), so
      // the player's collision can be grown the same way (map entry doorMargin / doorHeadroom, in scene units):
      // otherwise you squeeze past the door pieces, or stand on top of them. Only the door's width grows by the full margin;
      // its thickness (the facing direction) grows by at most 6, or a thin door becomes an invisible wall in front of it.
      const grow=this.entry.doorMargin??0,up=this.entry.doorHeadroom??0,plug=box.clone(),size=box.getSize(new THREE.Vector3());
      if(grow||up){
        const thin=Math.min(grow,6),gx=size.x>=size.z?grow:thin,gz=size.z>size.x?grow:thin;
        plug.min.x-=gx;plug.min.z-=gz;plug.max.x+=gx;plug.max.z+=gz;plug.max.y+=up;
      }
      // pieces with a `move` property [x, y, z] (scene units; the BO3 map builder writes BO3's script_vector) slide that far
      // when the door opens, then disappear; without one the door disappears at once
      const slides=[];m.object.traverse(o=>{const v=o.userData?.move;if(Array.isArray(v)&&v.length===3)slides.push({object:o,base:o.position.clone(),move:new THREE.Vector3(...v)});});
      const part={object:m.object,collider:boxCollider(plug),box,plug,enabled:true,slides,anim:null};
      this.doors.set(name,{name,cost,zone,electric:!!m.extras.electric,parts:[part],box});this.dynamic.push(part);
      // `scripted`: no buy prompt; a script opens it (session.openDoors.add(name); world.setDoors(session))
      if(!m.extras.scripted)this.interactions.push({kind:'door',door:name,position:box.getCenter(new THREE.Vector3()),box});
    }

    progress('Building navigation for zombies',50);
    await init();
    const bounds=new THREE.Box3().setFromBufferAttribute(solid.attributes.position);
    const size=bounds.getSize(new THREE.Vector3());
    // ~4 unit cells, coarser for very large maps so generation stays quick.
    const cs=Math.max(4,Math.sqrt(size.x*size.z/6e6)),ch=2;
    const positions=solid.attributes.position.array,indices=new Uint32Array(positions.length/3).map((_,i)=>i);
    const nav=generateTiledNavMesh(positions,indices,{cs,ch,tileSize:32,walkableSlopeAngle:48,walkableHeight:Math.ceil(70/ch),walkableClimb:Math.floor(18/ch),walkableRadius:Math.max(1,Math.round(14/cs)),
      maxEdgeLen:Math.round(48/cs),maxSimplificationError:1.3,minRegionArea:8,mergeRegionArea:20,maxVertsPerPoly:6,detailSampleDist:6,detailSampleMaxError:1});
    if(!nav.success)throw new Error('Navigation mesh generation failed: '+(nav.error??'unknown error'));
    this.nav=nav.navMesh;this.query=new NavMeshQuery(this.nav,{maxNodes:8192});this.query.defaultQueryHalfExtents={x:70,y:100,z:70};

    progress('Placing machines and barricades',65);
    const models=this.data.models,place=async(key,position,yaw,offset=0)=>{
      const o=await loadModel(models[key]);if(!o)return null;o.position.copy(position);o.rotation.y=yaw+FACE+offset;this.scene.add(o);return o;
    };
    // a perk machine (or Pack-a-Punch, perk 'pap'): BO3's when the map asks for them or the perk has no BO1 machine
    const placeMachine=async(perk,position,yaw,offset)=>{
      if(BO3_MACHINES[perk]&&(entry.machines==='bo3'||!PERK_MODELS[perk])){
        const o=await loadModel(BO3_MACHINE(BO3_MACHINES[perk])).catch(()=>null)??(MACHINE_FALLBACK[perk]?await loadModel(MACHINE_FALLBACK[perk]).catch(()=>null):null);
        if(o){o.position.copy(position);o.rotation.y=yaw+FACE+offset;this.scene.add(o);return o;}   // BO3 and BO1 machine GLBs both face +Z
      }
      return PERK_MODELS[perk]||perk==='pap'?place(perk==='pap'?'zombie_vending_packapunch':PERK_MODELS[perk],position,yaw,offset):null;
    };
    for(const m of markers)if(!['DOOR','EGG','RISING','MOVER'].includes(m.type))m.object.visible=false;
    const spawn=markers.find(m=>m.type==='PLAYER_SPAWN');
    this.spawn=spawn?{position:spawn.position.clone(),yaw:spawn.yaw}:{position:new THREE.Vector3(bounds.getCenter(new THREE.Vector3()).x,bounds.max.y+10,bounds.getCenter(new THREE.Vector3()).z),yaw:0};

    const zoneOf=m=>String(m.extras.zone??m.arg.split('_')[0]??'').toLowerCase()||'start';
    const zspawns=markers.filter(m=>m.type==='ZSPAWN'),paired=new Set();
    for(const [i,m] of markers.filter(m=>m.type==='WINDOW').entries()){
      const near=zspawns.filter(z=>!paired.has(z)).sort((a,b)=>a.position.distanceTo(m.position)-b.position.distanceTo(m.position))[0];
      if(!near||near.position.distanceTo(m.position)>400){this.warn(`${rawName(m.object)} has no ZSPAWN within 400 units; skipped`);continue;}
      paired.add(near);
      const dir=m.position.clone().sub(near.position).setY(0).normalize(),width=+(m.extras.width??56),height=+(m.extras.height??64);
      const outside=m.position.clone().addScaledVector(dir,-26),inside=this.closest(m.position.clone().addScaledVector(dir,42))??m.position.clone().addScaledVector(dir,42);
      outside.y=inside.y;
      const frame=new THREE.Group();frame.position.copy(m.position);frame.rotation.y=Math.atan2(dir.x,dir.z);this.scene.add(frame);
      const wood=new THREE.MeshStandardMaterial({color:0x6b4a2b,roughness:.9});
      const boards=[...Array(6)].map((_,n)=>{const b=new THREE.Mesh(new THREE.BoxGeometry(width+8,7,2),wood);b.position.set(0,(n-2.5)*height/6.5,n%2?1.5:-1.5);b.rotation.z=(n%3-1)*.12;frame.add(b);return b;});
      const clip=new THREE.BoxGeometry(width,height,14);clip.rotateY(frame.rotation.y);clip.translate(m.position.x,m.position.y,m.position.z);
      this.dynamic.push({collider:new CollisionWorld(clip),box:new THREE.Box3().setFromBufferAttribute(clip.attributes.position),enabled:true,window:true});
      this.barriers.push({id:'window_'+i,position:m.position.clone(),outside,inside,group:zoneOf(m),boards,count:6,repairTime:0,rewardRound:0,reward:0});
    }
    for(const [i,m] of zspawns.filter(z=>!paired.has(z)).entries()){
      const inside=this.closest(m.position,{x:120,y:200,z:120});
      if(!inside){this.warn(`${rawName(m.object)} is not near walkable ground; skipped`);continue;}
      this.barriers.push({id:'spawn_'+i,position:inside.clone(),outside:m.position.clone(),inside,group:zoneOf(m),boards:[],count:0,repairTime:0,rewardRound:0,reward:0});
    }
    if(!this.barriers.length)throw new Error('The map has no zombie spawns (ZSPAWN markers)');

    const tasks=[];
    for(const m of markers){
      if(m.type==='WALLBUY'){
        const ids=Object.keys(this.data.weapons),weapon=String(m.extras.weapon??'')||ids.filter(k=>m.arg.startsWith(k)||m.arg.startsWith(k.replace(/_zm$/,''))).sort((a,b)=>b.length-a.length)[0];
        if(!this.data.weapons[weapon]){this.warn(`${rawName(m.object)}: unknown weapon`);continue;}
        this.interactions.push({kind:'wallbuy',weapon,position:m.position.clone()});
        tasks.push(loadModel(this.data.weapons[weapon].worldModel).then(o=>{if(!o)return;o.position.copy(m.position);o.rotation.y=m.yaw+Math.PI/2;
          for(const tag of this.data.weapons[weapon].hideTags??[]){const bone=o.getObjectByName(tag);if(bone)bone.scale.setScalar(1e-6);}this.scene.add(o);}));
      }
      if(m.type==='PERK'){
        const perk=PERKS[String(m.extras.perk??m.arg.split('_')[0]).toLowerCase()];
        if(!perk){this.warn(`${rawName(m.object)}: unknown perk (use jugg, revive, speedcola, doubletap, staminup, deadshot or mulekick)`);continue;}
        this.interactions.push({kind:'perk',perk,position:m.position.clone().addScaledVector(up,40)});
        tasks.push(placeMachine(perk,m.position,m.yaw,(entry.perkYaw??0)*Math.PI/180));
      }
      if(m.type==='CLAYMORE'){
        this.interactions.push({kind:'claymore',position:m.position.clone()});
        tasks.push(place('weapon_claymore',m.position,m.yaw));
      }
      if(m.type==='PAP'){
        const at=new THREE.Vector3(0,38,14.5).applyAxisAngle(up,m.yaw+FACE).add(m.position);
        this.interactions.push({kind:'pap',position:at.clone()});
        this.data.entities.push({id:'custom_pap',targetname:'zombie_vending_upgrade',position:at.toArray()});
        tasks.push(placeMachine('pap',m.position,m.yaw,(entry.perkYaw??0)*Math.PI/180));
      }
      if(m.type==='POWER'){
        this.hasPower=true;
        this.interactions.push({kind:'power',position:m.position.clone().addScaledVector(up,10)});
        const panel=new THREE.Mesh(new THREE.BoxGeometry(22,34,6),new THREE.MeshStandardMaterial({color:0x3b3f3a,roughness:.7,metalness:.4}));
        panel.position.copy(m.position);panel.rotation.y=m.yaw+FACE;panel.translateZ(-4);this.scene.add(panel);
        tasks.push(place('zombie_power_lever_handle',m.position,m.yaw,(entry.perkYaw??0)*Math.PI/180).then(o=>{this.powerHandle=o;}));
      }
    }
    // The upstream Mystery Box reads its locations from map entities, so each
    // BOX marker gets the same stand-in entities Kino's boxes have.
    const boxes=markers.filter(m=>m.type==='BOX');
    for(const [i,m] of boxes.entries()){
      const prefix='custom_box_'+i,group=new THREE.Group();group.position.copy(m.position);group.rotation.y=m.yaw+FACE;this.scene.add(group);
      const location={id:prefix,kind:'box',targetname:'treasure_chest_use',script_noteworthy:prefix,start:m.arg.startsWith('start')||!!m.extras.start,prefix,position:m.position.clone().addScaledVector(up,22).toArray(),group};
      this.boxLocations.push(location);this.interactions.push(location);
      this.data.entities.push({id:prefix+'_org',targetname:prefix+'_org',position:m.position.clone().addScaledVector(up,3).toArray(),yaw:group.rotation.y+Math.PI/2},{id:prefix+'_lid',targetname:prefix+'_lid'});
      tasks.push((async()=>{
        const [box,lid,rubble]=await Promise.all([loadModel(models.zombie_treasure_box),loadModel(models.zombie_treasure_box_lid),loadModel(models.zombie_coast_bearpile)]);
        if(box)group.add(box);
        const lidRoot=lid??new THREE.Group();lidRoot.position.set(0,18,12);group.add(lidRoot);this.entities.set(prefix+'_lid',lidRoot);
        location.box=group;location.rubble=rubble;if(rubble){rubble.position.copy(m.position);rubble.rotation.y=m.yaw;this.scene.add(rubble);}
      })());
    }
    this.buildTraps(markers,place,tasks);this.buildTeleporters(markers);this.buildEggs(markers);
    await Promise.all(tasks);
    this.boxBeam=new THREE.Mesh(new THREE.CylinderGeometry(8,28,1600,12,1,true),new THREE.MeshBasicMaterial({color:0x8cacdd,transparent:true,opacity:.1,side:THREE.DoubleSide,depthWrite:false}));
    this.boxBeam.visible=!!this.boxLocations.length;this.scene.add(this.boxBeam);
    this.activeBox=this.boxLocations.find(b=>b.start)??this.boxLocations[0];this.updateBox();

    // Doors move out of the static scene so batching cannot merge them.
    for(const d of this.doors.values())for(const p of d.parts)this.scene.attach(p.object);
    this.optimization=optimizeStaticScene(root,{cellSize:640,verticalCellSize:384});

    this.physics={capsuleIntersect:c=>{
      const hit=this.collision.capsuleIntersect(c);if(hit)return hit;
      for(const d of this.dynamic)if(d.enabled&&d.collider){const h=d.collider.capsuleIntersect(c);if(h)return h;}
      for(const m of this.movers){if(m.disabled)continue;if(!m.near.containsPoint(c.start)&&!m.near.containsPoint(c.end))continue;const t=c.clone();t.translate(_negOffset.copy(m.offset).negate());const h=m.collider.capsuleIntersect(t);if(h)return h;}
      for(const z of this.actors?.()??[]){
        if(z.state==='barricade'||z.state==='entering')continue;
        const p=z.root.position,feet=c.start.y-c.radius,top=c.end.y+c.radius;
        if(feet>p.y+(z.kind==='zombie'?65:32)||top<p.y+4)continue;
        const normal=new THREE.Vector3(c.start.x-p.x,0,c.start.z-p.z),distance=normal.length(),depth=c.radius+15-distance;
        if(depth>0)return {normal:distance>.001?normal.divideScalar(distance):new THREE.Vector3(1,0,0),depth};
      }
      return false;
    },rayIntersect:(r,n=0,f=Infinity)=>this.raycast(r,n,f,true)};
    this.bounds=bounds;
  }
  warn(message){this.warnings.push(message);console.warn('[map] '+message);}
  // Blender's glTF lights use physical falloff in metres; the map is scaled to
  // inches, so point and spot lights are brightened and extended to match.
  // Lights named POWERLIGHT_... (or under such a node) stay off until the power is on.
  prepareLights(root,scale){
    root.traverse(o=>{
      if(!o.isLight)return;
      if(o.isPointLight||o.isSpotLight){o.intensity*=scale*scale;if(o.distance)o.distance*=scale;}
      let n=o,power=false;while(n&&n!==root){if(/^POWERLIGHT/i.test(rawName(n))||n.userData.power===true)power=true;n=n.parent;}
      if(power)this.powerLights.push({light:o,intensity:o.intensity});
    });
  }
  setPower(on){for(const p of this.powerLights)p.light.intensity=on?p.intensity:0;}
  // EGG_<group>: collectibles found with F (or by shooting them when `shoot`
  // is set). Finding a whole group gives its reward (see mods/README.md).
  buildEggs(markers){
    for(const m of markers.filter(m=>m.type==='EGG')){
      const name=String(m.extras.egg??m.arg.split('_').find(t=>t&&!/^\d+$/.test(t))??'egg').toLowerCase();
      if(!this.eggs.has(name))this.eggs.set(name,{name,items:[],reward:'song',done:false});
      const g=this.eggs.get(name),e=m.extras;
      for(const key of ['reward','points','weapon','perk','message'])if(e[key]!==undefined)g[key]=e[key];
      let object=m.object,hasMesh=false;object.traverse(o=>{if(o.isMesh)hasMesh=true;});
      if(!hasMesh){object=new THREE.Mesh(new THREE.IcosahedronGeometry(5,0),new THREE.MeshStandardMaterial({color:0x6d5a3c,emissive:0x5a2b0a,roughness:.8,flatShading:true}));object.position.copy(m.position);this.scene.add(object);}
      const center=new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
      g.items.push({object,position:center,shoot:e.shoot===true||e.shoot==='true',found:false});
      if(!(e.shoot===true||e.shoot==='true'))this.interactions.push({kind:'egg',egg:name,item:g.items.length-1,position:center});
    }
  }
  // TRAP_<name>_<cost> switches activate every TRAPZONE_<name> area. A zone
  // that is a mesh uses its bounding box; an empty uses a cylinder (radius, height).
  buildTraps(markers,place,tasks){
    const nameOf=m=>String(m.extras.trap??m.arg.split('_').find(t=>t&&!/^\d+$/.test(t))??'trap').toLowerCase();
    const trap=name=>{if(!this.traps.has(name))this.traps.set(name,{name,kind:'electric',cost:1000,duration:30,cooldown:90,power:true,zones:[],activeUntil:0,readyAt:0});return this.traps.get(name);};
    for(const m of markers.filter(m=>m.type==='TRAP')){
      const t=trap(nameOf(m)),e=m.extras,cost=e.cost??m.arg.split('_').find(x=>/^\d+$/.test(x));
      if(cost!==undefined)t.cost=+cost;if(e.duration!==undefined)t.duration=+e.duration;if(e.cooldown!==undefined)t.cooldown=+e.cooldown;
      if(e.kind)t.kind=String(e.kind).toLowerCase();if(e.power!==undefined)t.power=e.power!==false&&e.power!=='false';
      this.interactions.push({kind:'trap',trap:t.name,position:m.position.clone().addScaledVector(up,10)});
      if(e.handle===false||e.handle==='false')continue;   // the map has its own switch model (the BO3 map builder places BO3's)
      const panel=new THREE.Mesh(new THREE.BoxGeometry(22,34,6),new THREE.MeshStandardMaterial({color:0x3b3f3a,roughness:.7,metalness:.4}));
      panel.position.copy(m.position);panel.rotation.y=m.yaw+FACE;panel.translateZ(-4);this.scene.add(panel);
      tasks.push(place('zombie_zapper_handle',m.position,m.yaw).then(o=>{(t.handles??=[]).push(o);}));
    }
    for(const m of markers.filter(m=>m.type==='TRAPZONE')){
      const t=trap(nameOf(m)),hasMesh=(()=>{let found=false;m.object.traverse(o=>{if(o.isMesh)found=true;});return found;})();
      let zone;
      if(hasMesh){const box=new THREE.Box3().setFromObject(m.object),size=box.getSize(new THREE.Vector3());
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(size.x,size.y,size.z,1,1,1),null);mesh.position.copy(box.getCenter(new THREE.Vector3()));zone={box,mesh};}
      else{const radius=+(m.extras.radius??100),height=+(m.extras.height??120);
        const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,16,1,true),null);mesh.position.copy(m.position).addScaledVector(up,height/2);zone={center:m.position.clone(),radius,height,mesh};}
      zone.mesh.visible=false;this.scene.add(zone.mesh);t.zones.push(zone);
      zone.light=new THREE.PointLight(0xffffff,0,420,1.4);zone.light.position.copy(zone.mesh.position);this.scene.add(zone.light);
    }
    for(const [name,t] of this.traps){
      if(!t.zones.length){this.warn(`trap "${name}" has a switch but no TRAPZONE_${name}`);}
      const material=new THREE.MeshBasicMaterial({color:TRAP_COLORS[t.kind]??TRAP_COLORS.electric,transparent:true,opacity:.24,wireframe:t.kind!=='fire',depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
      for(const z of t.zones){z.mesh.material=material;z.light.color.setHex(TRAP_COLORS[t.kind]??TRAP_COLORS.electric);}
    }
  }
  inTrapZone(zone,p,margin=0){
    if(zone.box)return zone.box.clone().expandByScalar(margin).containsPoint(p);
    const dx=p.x-zone.center.x,dz=p.z-zone.center.z;return dx*dx+dz*dz<(zone.radius+margin)**2&&p.y>zone.center.y-20&&p.y<zone.center.y+zone.height;
  }
  // TELEPORT_<name>: two pads with one name link both ways; a pad plus
  // TPDEST_<name> is one-way, optionally returning after `return` seconds.
  buildTeleporters(markers){
    const nameOf=m=>String(m.extras.teleporter??m.arg.split('_').find(t=>t&&!/^\d+$/.test(t))??'teleporter').toLowerCase();
    const pads=markers.filter(m=>m.type==='TELEPORT'),dests=markers.filter(m=>m.type==='TPDEST');
    const front=m=>m.position.clone().add(new THREE.Vector3(Math.cos(m.yaw),0,-Math.sin(m.yaw)).multiplyScalar(52));
    for(const pad of pads){
      const name=nameOf(pad),dest=dests.find(d=>nameOf(d)===name),other=pads.find(p=>p!==pad&&nameOf(p)===name);
      if(!dest&&!other){this.warn(`teleporter "${name}" has no partner pad or TPDEST_${name}`);continue;}
      const e=pad.extras,ret=dest?.extras.return??dest?.arg.split('_').find(t=>/^\d+$/.test(t));
      const to=dest?{position:dest.position.clone(),yaw:dest.yaw,returnAfter:ret!==undefined?+ret:0,zone:dest.extras.zone?String(dest.extras.zone).toLowerCase():null}
        :{position:front(other),yaw:other.yaw,returnAfter:0,zone:other.extras.zone?String(other.extras.zone).toLowerCase():null};
      const tp={name,from:{position:front(pad),yaw:pad.yaw},to,cost:+(e.cost??0),cooldown:+(e.cooldown??(dest?90:20)),power:e.power===undefined?true:e.power!==false&&e.power!=='false',readyAt:0,
        // `locked`: unusable until a script clears tp.locked (The Giant's pad linking); lockedText is the prompt meanwhile
        locked:e.locked===true||e.locked==='true',lockedText:e.lockedText??'This teleporter is not linked'};
      this.teleporters.push(tp);
      this.interactions.push({kind:'teleport',teleporter:this.teleporters.length-1,position:pad.position.clone().addScaledVector(up,30)});
      const base=new THREE.Mesh(new THREE.CylinderGeometry(34,38,4,32),new THREE.MeshStandardMaterial({color:0x2f3336,roughness:.5,metalness:.6}));
      const ring=new THREE.Mesh(new THREE.TorusGeometry(30,1.6,8,48),new THREE.MeshBasicMaterial({color:0x7fd4ff}));ring.rotation.x=Math.PI/2;ring.position.y=2.4;
      const glow=new THREE.Mesh(new THREE.CylinderGeometry(30,30,90,32,1,true),new THREE.MeshBasicMaterial({color:0x7fd4ff,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));glow.position.y=47;
      const group=new THREE.Group();group.add(base,ring,glow);group.position.copy(pad.position).addScaledVector(up,2);this.scene.add(group);
      tp.ring=ring;tp.glow=glow;
    }
  }
  updateBox(){
    if(!this.activeBox)return;
    this.boxBeam.position.fromArray(this.activeBox.position).add(new THREE.Vector3(0,800,0));
    for(const b of this.boxLocations){const visible=!!this.fireSale||b.id===this.activeBox.id||this.openBoxes.has(b.id);if(b.box)b.box.visible=visible;if(b.rubble)b.rubble.visible=!visible;}
  }
  closest(p,extents){const r=this.query.findClosestPoint({x:p.x,y:p.y,z:p.z},extents?{halfExtents:extents}:undefined);return r.success?new THREE.Vector3(r.point.x,r.point.y,r.point.z):null;}
  path(a,b){const r=this.query.computePath({x:a.x,y:a.y,z:a.z},{x:b.x,y:b.y,z:b.z});return r.success?r.path.map(p=>new THREE.Vector3(p.x,p.y,p.z)):[];}
  raycast(ray,near=0,far=Infinity,windows=false){let hit=this.collision.rayIntersect(ray,near,far);
    for(const m of this.movers??[]){if(m.disabled)continue;const r=new THREE.Ray(ray.origin.clone().sub(m.offset),ray.direction),h=m.collider.rayIntersect(r,near,hit?Math.min(hit.distance,far):far);if(h){h.position.add(m.offset);h.point.add(m.offset);hit=h;}}for(const d of this.dynamic){if(!d.enabled||!d.collider||(!windows&&d.window))continue;const h=d.collider.rayIntersect(ray,near,hit?Math.min(hit.distance,far):far);if(h)hit=h;}return hit;}
  lineClear(a,b){const v=b.clone().sub(a),dist=v.length();return !this.raycast(new THREE.Ray(a,v.normalize()),1,Math.max(1,dist-4));}
  isOpen(door,session){return session.openDoors.has(door.name)||(door.electric&&session.power);}
  setDoors(session){
    for(const d of this.doors.values()){const open=this.isOpen(d,session);for(const p of d.parts){
      if(open&&p.enabled&&p.slides?.length){p.enabled=false;p.anim={t0:session.time};continue;}   // collision off now, slide in updateMovers
      if(!open){p.anim=null;for(const sl of p.slides??[])sl.object.position.copy(sl.base);}
      p.enabled=!open;if(!p.anim)p.object.visible=!open;}}
    for(const ref of this.navDisabled)this.nav.setPolyFlags(ref,1);this.navDisabled.clear();
    for(const d of this.dynamic){if(!d.enabled||d.window)continue;const c=d.box.getCenter(new THREE.Vector3()),h=d.box.getSize(new THREE.Vector3()).multiplyScalar(.5);h.x+=5;h.z+=5;const r=this.query.queryPolygons(c,h);for(const ref of r.polyRefs??[])this.navDisabled.add(ref);}
    for(const ref of this.navDisabled)this.nav.setPolyFlags(ref,0);
  }
  activeZones(session){const zones=new Set(['start']);for(const d of this.doors.values())if(d.zone&&this.isOpen(d,session))zones.add(d.zone);for(const f of session.flags)if(f.startsWith('zone:'))zones.add(f.slice(5));return zones;}
  zoneAt(){return undefined;}
  addMover(def,objects){
    const meshes=[];for(const o of objects)o.traverse(c=>{if(c.isMesh)meshes.push(c);});
    const g=positionsOf(meshes);if(!g)return;
    const box=new THREE.Box3().setFromBufferAttribute(g.attributes.position);
    this.movers.push({def,objects,base:objects.map(o=>o.position.clone()),collider:new CollisionWorld(g),box,near:new THREE.Box3(),delta:new THREE.Vector3(...def.delta),offset:new THREE.Vector3(),prev:new THREE.Vector3()});
    this.updateMovers(0);
  }
  // Moves every platform to game time `time` (out at def.out, back at def.back, each leg def.duration long, repeating every def.cycle).
  updateMovers(time){
    // sliding doors (setDoors): about a second, eased, then hidden
    for(const d of this.doors.values())for(const p of d.parts){if(!p.anim)continue;
      const k=Math.min(1,Math.max(0,(time-p.anim.t0)/1.1)),e=1-(1-k)**3;
      for(const sl of p.slides)sl.object.position.copy(sl.base).addScaledVector(sl.move,e);
      if(k>=1){p.anim=null;p.object.visible=false;}}
    const scale=this.entry.scale??1;
    for(const m of this.movers){
      const d=m.def,dur=d.duration??2,cycle=d.cycle??12,p=(((time-(d.delay??0))%cycle)+cycle)%cycle;
      let f=0;
      if(d.manual){const a=m.slide;f=a?a.from+(a.to-a.from)*Math.min(1,Math.max(0,(time-a.t0)/Math.max(.001,a.dur))):(m.f??0);m.f=f;}   // a mod drives it with slideMover
      else if(p>=d.out&&p<d.out+dur)f=(p-d.out)/dur;else if(p>=d.out+dur&&p<d.back)f=1;else if(p>=d.back&&p<d.back+dur)f=1-(p-d.back)/dur;
      m.prev.copy(m.offset);m.offset.copy(m.delta).multiplyScalar(f);
      m.objects.forEach((o,i)=>{o.position.copy(m.base[i]).addScaledVector(m.offset,1/scale);o.updateMatrix();o.updateMatrixWorld(true);});
      m.near.copy(m.box).translate(m.offset).expandByScalar(40);
    }
  }
  // Mod control of a `manual` mover: slideMover(id, to 0..1, seconds, now) eases it there; enableMover(id, false) hides it and
  // removes its collision (resetMovers puts everything back).
  slideMover(id,to,seconds,now){const m=this.movers.find(x=>x.def.id===String(id).toLowerCase());if(m)m.slide={from:m.f??0,to,t0:now,dur:seconds};return m;}
  enableMover(id,on){const m=this.movers.find(x=>x.def.id===String(id).toLowerCase());if(!m)return;m.disabled=!on;for(const o of m.objects)o.visible=on;}
  resetMovers(){for(const m of this.movers){m.disabled=false;m.slide=null;m.f=0;for(const o of m.objects)o.visible=true;}}
  // Hooks for map mods (see mods/README.md): extra press-F spots and shootable targets.
  //   addInteraction({position: Vector3, text(): string, use(e): boolean, hidden?(), locked?(), lockedText?, sight?})
  //     (sight: true = not usable through a wall or closed door, like the built-in machines)
  //   addShootTarget({position: Vector3, radius, weapons?: [ids], hit(target)})   (a target is removed once it is hit)
  //     wrong?(target): called (the target stays) when one of the `weapons` list is required and another gun hit it
  // Any interaction (also the built-in kinds, e.g. the power switch) may carry locked()/lockedText.
  addInteraction(def){const e={kind:'custom',...def};this.interactions.push(e);return e;}
  addShootTarget(def){(this.shootTargets??=[]).push(def);return def;}
  spawnBarriers(session){
    const zones=this.activeZones(session),list=this.barriers.filter(b=>zones.has(b.group)&&!b.submerged);
    if(!this.entry.nearbySpawns||!this.playerFeet)return list;
    if(this.offMesh(this.playerFeet))return this.freeBarriers(this.playerFeet,session.time);
    // Map entry nearbySpawns: zombies cannot cross the gaps between navmesh islands (moving platforms, gaps), so only spawn
    // points that can walk to the player are used; if none can, points are found on the player's own island.
    const pf=this.playerFeet,now=session.time;
    if(this._near&&now-this._near.t<1.5&&this._near.at.distanceTo(pf)<60)return this._near.list;
    const target=this.closest(pf,{x:60,y:120,z:60});
    const reach=p=>{if(!target)return false;const path=this.path(p,pf),last=path[path.length-1];return !!last&&last.distanceTo(target)<12;};
    let ok=list.filter(b=>reach(b.inside));
    if(!ok.length)ok=this.nearbyBarriers(pf,reach);
    this._near={t:now,at:pf.clone(),list:ok};return ok;
  }
  // Walkable points 450-900 units around `pf` that can reach it (a ring of probes snapped to the navmesh).
  nearbyBarriers(pf,reach){
    const out=[];
    for(let k=0;k<28&&out.length<6;k++){
      const a=k*2.399,r=450+((k*137)%450),probe={x:pf.x+Math.cos(a)*r,y:pf.y,z:pf.z+Math.sin(a)*r};
      const p=this.closest(probe,{x:70,y:260,z:70});if(!p||p.distanceTo(pf)<300||!reach(p))continue;
      out.push({id:'near_'+out.length,position:p,outside:p.clone(),inside:p.clone(),group:'near',boards:[],count:0,repairTime:0,rewardRound:0,reward:0});
    }
    return out;
  }
  // Parkour: the player stands on something the navmesh does not cover (a moving platform): zombies there walk freely on its surface.
  offMesh(pf){const c=this.closest(pf,{x:40,y:70,z:40});return !c||Math.hypot(c.x-pf.x,c.z-pf.z)>25||Math.abs(c.y-pf.y)>25;}
  surfaceY(x,y,z){const h=this.raycast(new THREE.Ray(new THREE.Vector3(x,y+40,z),new THREE.Vector3(0,-1,0)),0,110);return h?y+40-h.distance:null;}
  // The platform movement since the last frame under `pos`, or null.
  carryDelta(pos){
    for(const m of this.movers??[]){
      if(m.disabled)continue;const d=m.offset.clone().sub(m.prev);if(!d.x&&!d.y&&!d.z)continue;
      const probe=new THREE.Ray(new THREE.Vector3(pos.x,pos.y+8,pos.z).sub(m.offset),new THREE.Vector3(0,-1,0));
      if(m.collider.rayIntersect(probe,0,24))return d;
    }
    return null;
  }
  // Points 40-240 units around `pf` on a nearby surface (the same platform or the next one along the parkour) that a zombie can stand on.
  freeBarriers(pf,time,all=false){
    if(!all&&this._free&&time-this._free.t<1&&this._free.at.distanceTo(pf)<40)return this._free.list;
    const eye=pf.clone(),out=[];eye.y+=40;
    for(let k=0;k<60&&out.length<6;k++){
      const a=k*2.399,r=40+((k*53)%200),x=pf.x+Math.cos(a)*r,z=pf.z+Math.sin(a)*r,y=this.surfaceY(x,pf.y,z);
      if(y===null||Math.abs(y-pf.y)>60)continue;
      const p=new THREE.Vector3(x,y,z),head=p.clone();head.y+=40;if(!this.lineClear(head,eye))continue;
      out.push({id:'free_'+out.length,position:p,outside:p.clone(),inside:p.clone(),group:'free',free:true,boards:[],count:0,repairTime:0,rewardRound:0,reward:0});
    }
    this._free={t:time,at:pf.clone(),list:out};return out;
  }
  // A zombie stuck on an island that cannot walk to the player (a gap, a moving platform): a walkable point 120-450 units
  // from the player that can, preferring one out of sight. null when the zombie can walk there itself or nothing fits.
  rescuePoint(from,pf){
    if(!this.entry.nearbySpawns)return null;
    if(this.offMesh(pf)){const f=this.freeBarriers(pf,0,true)[0];if(!f)return null;const p=f.position.clone();p.free=true;return p;}
    const target=this.closest(pf,{x:60,y:120,z:60});if(!target)return null;
    const reach=p=>{const path=this.path(p,pf),last=path[path.length-1];return !!last&&last.distanceTo(target)<12;};
    const direct=this.path(from,pf),end=direct[direct.length-1];
    if(end&&end.distanceTo(target)<12)return null;
    let seen=null;const eye=pf.clone();eye.y+=50;
    for(let k=0;k<24;k++){
      const a=k*2.399+from.x,r=120+((k*97)%330),probe={x:pf.x+Math.cos(a)*r,y:pf.y,z:pf.z+Math.sin(a)*r};
      const p=this.closest(probe,{x:70,y:200,z:70});if(!p||p.distanceTo(pf)<110||!reach(p))continue;
      const head=p.clone();head.y+=50;
      if(!this.lineClear(head,eye))return p;
      seen??=p;
    }
    return seen;
  }
  // The player is inside a closed door's collision (for example after a mantle ended there): the nearest walkable spot
  // outside it, or null when they are not inside one.
  doorEject(feet,radius=14){
    for(const d of this.dynamic){
      const b=d.plug;if(!b||!d.enabled||d.window)continue;
      if(feet.x<b.min.x+1||feet.x>b.max.x-1||feet.z<b.min.z+1||feet.z>b.max.z-1||feet.y<b.min.y-4||feet.y>b.max.y-8)continue;
      const exits=[[b.min.x-radius-4,feet.z],[b.max.x+radius+4,feet.z],[feet.x,b.min.z-radius-4],[feet.x,b.max.z+radius+4]]
        .map(([x,z])=>({x,z,d:Math.hypot(x-feet.x,z-feet.z)})).sort((a,c)=>a.d-c.d);
      for(const e of exits){const p=this.closest({x:e.x,y:feet.y,z:e.z},{x:30,y:90,z:30});if(p&&Math.hypot(p.x-e.x,p.z-e.z)<30)return p;}
      return new THREE.Vector3(exits[0].x,Math.max(feet.y,b.max.y)+2,exits[0].z);   // nothing walkable nearby: climb out over the top
    }
    return null;
  }
  // Advances the RISING planes to game time `time`; spawn points they have covered stop being used. Returns the highest top.
  updateRising(time){
    let top=-Infinity;
    for(const r of this.rising??[]){
      const rise=Math.max(0,time-r.delay)*r.speed;r.object.position.y=r.baseY+rise/(this.entry.scale??1);r.top=r.topAtStart+rise;top=Math.max(top,r.top);
      r.object.updateMatrix();r.object.updateMatrixWorld(true);   // the static-scene optimizer froze matrixAutoUpdate on every object
    }
    if(top>-Infinity)for(const b of this.barriers)b.submerged=b.position.y<top+12;
    return top;
  }
  setBoards(barrier,count){if(!barrier.boards.length){barrier.count=0;return;}barrier.count=Math.max(0,Math.min(barrier.boards.length,count));barrier.boards.forEach((o,i)=>o.visible=i<barrier.count);}
  reset(session){
    for(const t of this.traps.values()){t.activeUntil=0;t.readyAt=0;for(const z of t.zones){z.mesh.visible=false;z.light.intensity=0;}}
    for(const tp of this.teleporters)tp.readyAt=0;
    for(const g of this.eggs.values()){g.done=false;for(const i of g.items){i.found=false;i.object.visible=true;}}
    this.setPower(session.power);
    for(const b of this.barriers){this.setBoards(b,b.boards.length);b.reward=0;b.rewardRound=0;}
    this.activeBox=this.boxLocations.find(b=>b.start)??this.boxLocations[0];this.updateBox();this.setDoors(session);
    if(this.powerHandle)this.powerHandle.rotation.x=0;
  }
}
