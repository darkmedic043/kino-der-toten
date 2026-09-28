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
  speedcola:'specialty_fastreload',speed:'specialty_fastreload',sleight:'specialty_fastreload',fastreload:'specialty_fastreload',doubletap:'specialty_rof',rof:'specialty_rof'};
const PERK_MODELS={specialty_armorvest:'zombie_vending_jugg',specialty_quickrevive:'zombie_vending_revive',specialty_fastreload:'zombie_vending_sleight',specialty_rof:'zombie_vending_doubletap'};
const MARKER=/^(PLAYER_SPAWN|SPAWN_PLAYER|ZSPAWN|WINDOW|DOOR|WALLBUY|PERK|BOX|PAP|PACKAPUNCH|POWER|CLAYMORE|TRAPZONE|TRAP|TELEPORT|TPDEST)(?:_(.*))?$/i;
const TRAP_COLORS={electric:0x8cbbff,fire:0xff7a2e};
const COLLISION_NAME=/^(COL|UCX|collision)[_.-]/i;
// Machine models face their local +Z; markers face their local +X (Blender's red axis).
const FACE=Math.PI/2;
const up=new THREE.Vector3(0,1,0);

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
    this.interactions=[];this.boxLocations=[];this.openBoxes=new Set();this.fireSale=false;this.hasPower=false;this.zones=[];this.traps=new Map();this.teleporters=[];
  }
  async load(progress){
    const entry=this.entry,dir=entry.dir.replace(/\/?$/,'/');
    progress('Loading '+entry.title,15);
    const gltf=await new GLTFLoader(assetManager).loadAsync(dir+entry.model);
    const root=gltf.scene;root.scale.setScalar(entry.scale??1);this.scene.add(root);root.updateMatrixWorld(true);
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

    // Doors keep their own geometry and are left out of collision and navigation.
    for(const m of markers.filter(m=>m.type==='DOOR')){
      const tokens=m.arg.split('_').filter(Boolean),name=rawName(m.object)+'#'+this.doors.size;
      const cost=+(m.extras.cost??tokens.find(t=>/^\d+$/.test(t))??750);
      const zone=String(m.extras.zone??tokens.find(t=>!/^\d+$/.test(t))??'').toLowerCase()||null;
      const box=new THREE.Box3().setFromObject(m.object);
      const part={object:m.object,collider:boxCollider(box),box,enabled:true};
      this.doors.set(name,{name,cost,zone,electric:!!m.extras.electric,parts:[part],box});this.dynamic.push(part);
      this.interactions.push({kind:'door',door:name,position:box.getCenter(new THREE.Vector3()),box});
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
    for(const m of markers)if(m.type!=='DOOR')m.object.visible=false;
    const spawn=markers.find(m=>m.type==='PLAYER_SPAWN');
    this.spawn=spawn?{position:spawn.position.clone(),yaw:spawn.yaw}:{position:new THREE.Vector3(bounds.getCenter(new THREE.Vector3()).x,bounds.max.y+10,bounds.getCenter(new THREE.Vector3()).z),yaw:0};

    const zoneOf=m=>String(m.extras.zone??m.arg.split('_')[0]??'').toLowerCase()||'start';
    const zspawns=markers.filter(m=>m.type==='ZSPAWN'),paired=new Set();
    for(const [i,m] of markers.filter(m=>m.type==='WINDOW').entries()){
      const near=zspawns.filter(z=>!paired.has(z)).sort((a,b)=>a.position.distanceTo(m.position)-b.position.distanceTo(m.position))[0];
      if(!near||near.position.distanceTo(m.position)>400){console.warn(`[map] ${rawName(m.object)} has no ZSPAWN within 400 units; skipped`);continue;}
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
      if(!inside){console.warn(`[map] ${rawName(m.object)} is not near walkable ground; skipped`);continue;}
      this.barriers.push({id:'spawn_'+i,position:inside.clone(),outside:m.position.clone(),inside,group:zoneOf(m),boards:[],count:0,repairTime:0,rewardRound:0,reward:0});
    }
    if(!this.barriers.length)throw new Error('The map has no zombie spawns (ZSPAWN markers)');

    const tasks=[];
    for(const m of markers){
      if(m.type==='WALLBUY'){
        const ids=Object.keys(this.data.weapons),weapon=String(m.extras.weapon??'')||ids.filter(k=>m.arg.startsWith(k)||m.arg.startsWith(k.replace(/_zm$/,''))).sort((a,b)=>b.length-a.length)[0];
        if(!this.data.weapons[weapon]){console.warn(`[map] ${rawName(m.object)}: unknown weapon`);continue;}
        this.interactions.push({kind:'wallbuy',weapon,position:m.position.clone()});
        tasks.push(loadModel(this.data.weapons[weapon].worldModel).then(o=>{if(!o)return;o.position.copy(m.position);o.rotation.y=m.yaw+Math.PI/2;
          for(const tag of this.data.weapons[weapon].hideTags??[]){const bone=o.getObjectByName(tag);if(bone)bone.scale.setScalar(1e-6);}this.scene.add(o);}));
      }
      if(m.type==='PERK'){
        const perk=PERKS[String(m.extras.perk??m.arg.split('_')[0]).toLowerCase()];
        if(!perk){console.warn(`[map] ${rawName(m.object)}: unknown perk (use jugg, revive, speedcola or doubletap)`);continue;}
        this.interactions.push({kind:'perk',perk,position:m.position.clone().addScaledVector(up,40)});
        tasks.push(place(PERK_MODELS[perk],m.position,m.yaw));
      }
      if(m.type==='CLAYMORE'){
        this.interactions.push({kind:'claymore',position:m.position.clone()});
        tasks.push(place('weapon_claymore',m.position,m.yaw));
      }
      if(m.type==='PAP'){
        const at=new THREE.Vector3(0,38,14.5).applyAxisAngle(up,m.yaw+FACE).add(m.position);
        this.interactions.push({kind:'pap',position:at.clone()});
        this.data.entities.push({id:'custom_pap',targetname:'zombie_vending_upgrade',position:at.toArray()});
        tasks.push(place('zombie_vending_packapunch',m.position,m.yaw));
      }
      if(m.type==='POWER'){
        this.hasPower=true;
        this.interactions.push({kind:'power',position:m.position.clone().addScaledVector(up,10)});
        const panel=new THREE.Mesh(new THREE.BoxGeometry(22,34,6),new THREE.MeshStandardMaterial({color:0x3b3f3a,roughness:.7,metalness:.4}));
        panel.position.copy(m.position);panel.rotation.y=m.yaw+FACE;panel.translateZ(-4);this.scene.add(panel);
        tasks.push(place('zombie_power_lever_handle',m.position,m.yaw).then(o=>{this.powerHandle=o;}));
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
    this.buildTraps(markers,place,tasks);this.buildTeleporters(markers);
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
      if(!t.zones.length){console.warn(`[map] trap "${name}" has a switch but no TRAPZONE_${name}`);}
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
      if(!dest&&!other){console.warn(`[map] teleporter "${name}" has no partner pad or TPDEST_${name}`);continue;}
      const e=pad.extras,ret=dest?.extras.return??dest?.arg.split('_').find(t=>/^\d+$/.test(t));
      const to=dest?{position:dest.position.clone(),yaw:dest.yaw,returnAfter:ret!==undefined?+ret:0,zone:dest.extras.zone?String(dest.extras.zone).toLowerCase():null}
        :{position:front(other),yaw:other.yaw,returnAfter:0,zone:other.extras.zone?String(other.extras.zone).toLowerCase():null};
      const tp={name,from:{position:front(pad),yaw:pad.yaw},to,cost:+(e.cost??0),cooldown:+(e.cooldown??(dest?90:20)),power:e.power===undefined?true:e.power!==false&&e.power!=='false',readyAt:0};
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
  raycast(ray,near=0,far=Infinity,windows=false){let hit=this.collision.rayIntersect(ray,near,far);for(const d of this.dynamic){if(!d.enabled||!d.collider||(!windows&&d.window))continue;const h=d.collider.rayIntersect(ray,near,hit?Math.min(hit.distance,far):far);if(h)hit=h;}return hit;}
  lineClear(a,b){const v=b.clone().sub(a),dist=v.length();return !this.raycast(new THREE.Ray(a,v.normalize()),1,Math.max(1,dist-4));}
  isOpen(door,session){return session.openDoors.has(door.name)||(door.electric&&session.power);}
  setDoors(session){
    for(const d of this.doors.values()){const open=this.isOpen(d,session);for(const p of d.parts){p.enabled=!open;p.object.visible=!open;}}
    for(const ref of this.navDisabled)this.nav.setPolyFlags(ref,1);this.navDisabled.clear();
    for(const d of this.dynamic){if(!d.enabled||d.window)continue;const c=d.box.getCenter(new THREE.Vector3()),h=d.box.getSize(new THREE.Vector3()).multiplyScalar(.5);h.x+=5;h.z+=5;const r=this.query.queryPolygons(c,h);for(const ref of r.polyRefs??[])this.navDisabled.add(ref);}
    for(const ref of this.navDisabled)this.nav.setPolyFlags(ref,0);
  }
  activeZones(session){const zones=new Set(['start']);for(const d of this.doors.values())if(d.zone&&this.isOpen(d,session))zones.add(d.zone);for(const f of session.flags)if(f.startsWith('zone:'))zones.add(f.slice(5));return zones;}
  zoneAt(){return undefined;}
  spawnBarriers(session){const zones=this.activeZones(session);return this.barriers.filter(b=>zones.has(b.group));}
  setBoards(barrier,count){if(!barrier.boards.length){barrier.count=0;return;}barrier.count=Math.max(0,Math.min(barrier.boards.length,count));barrier.boards.forEach((o,i)=>o.visible=i<barrier.count);}
  reset(session){
    for(const t of this.traps.values()){t.activeUntil=0;t.readyAt=0;for(const z of t.zones){z.mesh.visible=false;z.light.intensity=0;}}
    for(const tp of this.teleporters)tp.readyAt=0;
    for(const b of this.barriers){this.setBoards(b,b.boards.length);b.reward=0;b.rewardRound=0;}
    this.activeBox=this.boxLocations.find(b=>b.start)??this.boxLocations[0];this.updateBox();this.setDoors(session);
    if(this.powerHandle)this.powerHandle.rotation.x=0;
  }
}
