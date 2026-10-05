// Action skills in co-op: what one player deploys is mirrored for everyone else.
//
// The owner runs their skill as before and, ten times a second, tells the room what it has standing (turrets, walls,
// sandbag segments, razor wire, claymores, drones, mortar beacons) and what has gone; turret/drone tracers and skill
// explosions are sent as they happen. Everyone else builds the same models where the owner put them (mirrors).
//
// Gameplay: damage already works (a guest's hits on zombies go to the host like gunshots). Holding and slowing are
// done by the host, whose zombies are the real ones: the host's mirror of a wall or sandbag segment holds zombies at
// its face and sends each strike back to the owner (whose own copy then loses the hit and, when broken, goes away
// for everyone); a mirrored razor-wire field slows zombies inside it. Guests' own walls don't hold locally
// (fortifier.js), or strikes on the copies would count twice. Mirrors block players like the real ones.
//
// Messages: {t:'ab', op:'add'|'del'|'mv'|'hp'|'tr'|'boom'|'hit', ...}; ids are per owner.
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CollisionWorld } from '../../collision-world.js';
import { steelWall, sandbags, wireField, mineModel } from './fortifier.js';
import { droneModel, beaconModel } from './engineer.js';

const up=new THREE.Vector3(0,1,0);
const r1=v=>Math.round(v*10)/10,vec=v=>v.toArray().map(r1),v3=a=>new THREE.Vector3(...a);

export function setupCoopSkills({api,turrets,fort,eng,sync,A}){
  const {host,scene,world,enemies,audio}=api;
  const net=()=>{const n=window.kino.coop;return n?.id?n:null;};
  let turretModel=null;loadModel('models/weapon_zombie_auto_turret.glb').then(m=>{turretModel=m;}).catch(()=>{});

  // ---- the owner: what I have standing -------------------------------------------------------------
  const ids=new Map();let nextId=1;   // my object -> {id, sent hp}
  const mine=()=>[
    ...turrets.map(o=>['turret',o]),
    ...(fort?.walls??[]).map(o=>[o.kind==='sandbag'?'sandbag':'steel',o]),
    ...(fort?.snares??[]).map(o=>['wire',o]),
    ...(fort?.mines??[]).map(o=>['mine',o]),
    ...(eng?.drones??[]).map(o=>['drone',o]),
    ...(eng?.beacons??[]).map(o=>['beacon',o]),
  ];
  const describe=(kind,o)=>{
    if(kind==='turret')return {at:vec(o.at),yaw:r1(o.mesh.rotation.y)};
    if(kind==='steel'||kind==='sandbag')return {at:vec(o.at),yaw:+o.yaw.toFixed(3),w:o.width,h:o.height,d:o.depth};
    if(kind==='wire')return {at:vec(o.at),r:o.radius,slow:+(1-(A()?.slow??.5)).toFixed(2)};   // speed multiplier inside
    if(kind==='mine')return {at:vec(o.at)};
    if(kind==='drone')return {at:vec(o.mesh.position)};
    if(kind==='beacon')return {at:vec(o.at)};
  };
  const byId=new Map();   // id -> my object (strikes reported by the host)
  function sendAll(n,to='all'){for(const [kind,o] of mine()){const e=ids.get(o);if(e)n.send(to,{t:'ab',op:'add',id:e.id,kind,...describe(kind,o)});}}
  let tick=0;
  host.on('update',dt=>{
    const n=net();if(!n||(tick-=dt)>0)return;tick=.1;
    const live=new Set();
    for(const [kind,o] of mine()){
      live.add(o);let e=ids.get(o);
      if(!e){e={id:nextId++,kind,hp:1};ids.set(o,e);byId.set(e.id,o);n.send('all',{t:'ab',op:'add',id:e.id,kind,...describe(kind,o)});continue;}
      if(kind==='drone'||(kind==='beacon'&&o.follow))n.send('all',{t:'ab',op:'mv',id:e.id,at:vec(kind==='drone'?o.mesh.position:o.at)});
      if(o.maxHits){const hp=Math.max(0,o.hits/o.maxHits);if(Math.abs(hp-e.hp)>.04){e.hp=hp;n.send('all',{t:'ab',op:'hp',id:e.id,hp:+hp.toFixed(2)});}}
    }
    for(const [o,e] of ids)if(!live.has(o)){ids.delete(o);byId.delete(e.id);n.send('all',{t:'ab',op:'del',id:e.id});}
  });
  // effects as they happen
  sync.tracer=(a,b,color)=>net()?.send('all',{t:'ab',op:'tr',a:vec(a),b:vec(b),c:color??null});
  sync.boom=(at,radius)=>net()?.send('all',{t:'ab',op:'boom',at:vec(at),r:Math.round(radius)});

  // ---- everyone else's: mirrors --------------------------------------------------------------------
  const mirrors=new Map();   // owner:id -> mirror
  const key=(from,id)=>from+':'+id;
  function build(kind,m){
    if(kind==='turret'){if(!turretModel)return null;const g=cloneSkinned(turretModel);g.scale.setScalar(.01);g.rotation.y=m.yaw;g.traverse(o=>{if(o.isMesh)o.frustumCulled=false;});return g;}
    if(kind==='steel')return steelWall(m.w,m.h);
    if(kind==='sandbag')return sandbags(m.w,m.h);
    if(kind==='wire')return wireField(m.r);
    if(kind==='mine')return mineModel();
    if(kind==='drone')return droneModel();
    if(kind==='beacon')return beaconModel();
    return null;
  }
  function add(m,from){
    const k=key(from,m.id);if(mirrors.has(k))return;
    const mesh=build(m.kind,m);if(!mesh)return;
    const at=v3(m.at);mesh.position.copy(at);if(m.yaw!=null&&m.kind!=='turret')mesh.rotation.y=m.yaw;scene.add(mesh);
    const r={kind:m.kind,mesh,at,from,id:m.id,age:0,shake:0,hp:1,inside:new Set(),slow:m.slow??.5,radius:m.r};
    if(m.kind==='steel'||m.kind==='sandbag'){
      r.width=m.w;r.height=m.h;r.depth=m.d;r.yaw=m.yaw;r.ax=new THREE.Vector3(Math.cos(m.yaw),0,-Math.sin(m.yaw));r.az=new THREE.Vector3(Math.sin(m.yaw),0,Math.cos(m.yaw));
      mesh.scale.y=.01;
      const geo=new THREE.BoxGeometry(m.w,m.h,m.d);geo.translate(0,m.h/2,0);geo.rotateY(m.yaw);geo.translate(at.x,at.y,at.z);geo.computeBoundingBox();
      r.dyn={collider:new CollisionWorld(geo),box:geo.boundingBox.clone(),enabled:true,window:true,fortWall:true};world.dynamic?.push(r.dyn);
    }
    if(m.kind==='wire')mesh.scale.setScalar(.01);
    mirrors.set(k,r);
  }
  function remove(k){
    const r=mirrors.get(k);if(!r)return;mirrors.delete(k);
    r.mesh.removeFromParent();
    if(r.dyn){const i=world.dynamic?.indexOf(r.dyn)??-1;if(i>=0)world.dynamic.splice(i,1);}
    for(const z of r.inside)if(z.coopSnareK){z.speed/=z.coopSnareK;z.coopSnareK=0;}
  }
  const tracerMat=new THREE.LineBasicMaterial({color:0xffe2a0,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false});
  const lines=[];
  let subscribed=false;
  function subscribe(n){
    subscribed=true;
    n.on('ab',(m,from)=>{
      if(!m||from===n.id)return;
      if(m.op==='add')add(m,from);
      else if(m.op==='del')remove(key(from,m.id));
      else if(m.op==='mv'){const r=mirrors.get(key(from,m.id));if(r){r.target=v3(m.at);}}
      else if(m.op==='hp'){const r=mirrors.get(key(from,m.id));if(r){r.hp=m.hp;r.mesh.userData.tint?.color.setScalar(.55+.45*m.hp);}}
      else if(m.op==='tr'){const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints([v3(m.a),v3(m.b)]),tracerMat.clone());if(m.c)l.material.color.set(m.c);scene.add(l);lines.push({l,t:.06});}
      else if(m.op==='boom'){window.kino.fx?.explosion?.(m.at,(m.r??200)/260);audio?.play?.('explosion',.4);}
      else if(m.op==='hit'){   // the host: a zombie struck one of my walls
        const o=byId.get(m.id);if(!o||o.maxHits==null)return;
        o.hits-=m.n??1;audio?.play?.('board',.3);
        for(const w of o.pool?fort.walls.filter(w=>w.pool===o.pool):[o]){w.shake=.25;w.touched=1.5;}
      }
    });
    n.on('joined',p=>{if(p?.id&&p.id!==n.id)sendAll(n,p.id);});   // a late joiner gets what is already standing
    n.on('left',id=>{for(const [k,r] of mirrors)if(r.from===id)remove(k);});
  }
  const L=new THREE.Vector3();
  host.on('update',dt=>{
    const n=net();if(n&&!subscribed)subscribe(n);
    if(!dt)return;
    for(let i=lines.length-1;i>=0;i--){const t=lines[i];t.t-=dt;t.l.material.opacity=Math.max(0,t.t/.06);if(t.t<=0){t.l.removeFromParent();t.l.geometry.dispose();t.l.material.dispose();lines.splice(i,1);}}
    for(const r of mirrors.values()){
      r.age+=dt;
      if(r.kind==='turret')r.mesh.scale.setScalar(Math.min(1,r.age/.3));
      if(r.kind==='wire')r.mesh.scale.setScalar(Math.min(1,r.age/.3));
      if(r.target)r.mesh.position.lerp(r.target,Math.min(1,dt*10));
      if(r.kind==='drone')for(const rot of r.mesh.userData.rotors??[])rot.rotation.y+=dt*40;
      if(r.kind==='beacon'&&r.mesh.userData.lamp)r.mesh.userData.lamp.visible=Math.sin(performance.now()/100)>0;
      if(r.kind==='steel'||r.kind==='sandbag'){
        r.mesh.scale.y=Math.min(1,r.age/.35);r.shake=Math.max(0,r.shake-dt);r.mesh.position.copy(r.at).addScaledVector(r.ax,Math.sin(r.age*70)*r.shake*3);
        if(!n?.isHost)continue;
        // the host holds zombies at the face, as fortifier.js does for its own walls, and reports each strike
        const half=r.width/2+14,depth=r.depth;
        for(const z of enemies.list){
          if(z.state==='dead'||z.state==='barricade'||z.state==='entering')continue;
          L.copy(z.root.position).sub(r.at);const x=L.dot(r.ax),zz=L.dot(r.az),y=z.root.position.y-r.at.y;
          if(Math.abs(x)>half||y<-40||y>r.height+20){if(z.fortWall===r)z.fortWall=null;continue;}
          const side=z.fortWall===r&&z.fortSide?z.fortSide:(Math.sign(zz)||1);
          if(Math.abs(zz)>depth+8){z.fortWall=r;z.fortSide=Math.sign(zz)||1;continue;}
          z.fortWall=r;z.fortSide=side;z.root.position.addScaledVector(r.az,side*(depth+6)-zz);z.stuck=0;
          if(z.state!=='attack'){z.state='attack';z.attackLeft=1.15;z.attackDealt=true;z.rig.play('attack',false);z.root.rotation.y=Math.atan2(side*r.az.z,-side*r.az.x);z.fortStruck=false;}
          else if(!z.fortStruck&&z.attackLeft<.62){z.fortStruck=true;r.shake=.25;audio?.play?.('board',.3);n.send(r.from,{t:'ab',op:'hit',id:r.id,n:z.kind==='dog'?.5:1});}
        }
      }
      if(r.kind==='wire'&&n?.isHost){   // the host slows zombies in a teammate's wire
        for(const z of enemies.list){
          const inside=Math.hypot(z.root.position.x-r.at.x,z.root.position.z-r.at.z)<r.radius&&Math.abs(z.root.position.y-r.at.y)<50;
          if(inside&&!r.inside.has(z)&&!z.coopSnareK){r.inside.add(z);z.coopSnareK=Math.max(.1,r.slow);z.speed*=z.coopSnareK;}
          else if(!inside&&r.inside.has(z)){r.inside.delete(z);if(z.coopSnareK){z.speed/=z.coopSnareK;z.coopSnareK=0;}}
        }
        for(const z of [...r.inside])if(!enemies.list.includes(z))r.inside.delete(z);
      }
    }
  });
  (window.kino.coopSkills={mirrors,mine:()=>mine().map(([k,o])=>({kind:k,id:ids.get(o)?.id,hits:o.hits}))});   // debug
  host.on('reset',()=>{for(const k of [...mirrors.keys()])remove(k);for(const l of lines)l.l.removeFromParent();lines.length=0;ids.clear();byId.clear();});
}
