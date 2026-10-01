// Dismemberment, BO1 style, with the real gib parts. A zombie body is split
// into upper and lower halves (the gib models share its 73-bone skeleton and
// are bound to its live bones); a lost limb swaps the half for the matching
// "off" model and launches the "spawn" piece. Losing the legs turns a zombie
// into a crawler (BO1's crawl animations, slower, low hitbox). Headshot kills
// can pop the head off.
//
// Assets come from the user's own BO1 install (.tools/build_dismemberment.py,
// git-ignored); without them the mod does nothing.
import * as THREE from 'three';
import { loadModel, loadAnimation } from '../../animation.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const BASE=new URL('./',import.meta.url);
const up=new THREE.Vector3(0,1,0);

export default async function setup(api){
  const {host,enemies,scene,world,features}=api;
  const r=await fetch(new URL('gibs.json',BASE)).catch(()=>null);
  if(!r?.ok){console.info('[dismemberment] not built: run .tools/build_dismemberment.py');return;}
  const gibs=await r.json();
  const parts={},anims={};
  await Promise.all(Object.entries(gibs.parts).map(async([k,u])=>{parts[k]=await loadModel(u).catch(()=>null);}));
  await Promise.all(Object.entries(gibs.animations).map(async([k,u])=>{anims[k]=await loadAnimation(u).catch(()=>null);}));
  if(!parts.upclean||!parts.lowclean)return;

  // ---- materials ---------------------------------------------------------------------------
  // The gib models name the same materials as Kino's zombie (whose textures this zone lacks),
  // so they wear the live zombie's own; untextured gore surfaces get a wet dark red.
  const gore=new THREE.MeshStandardMaterial({color:0x5a0a07,roughness:.45,metalness:0});
  function dressPiece(piece,z){
    const own=new Map();z.root.traverse(o=>{if(o.isMesh&&o.material&&!o.userData.gib)for(const m of [].concat(o.material))own.set(m.name,m);});
    piece.traverse(o=>{if(!o.isMesh)return;o.userData.gib=true;
      o.material=[].concat(o.material).map(m=>own.get(m.name)??(m.map?m:gore));if(o.material.length===1)o.material=o.material[0];});
  }

  // ---- body halves bound to the zombie's own skeleton --------------------------------------
  function bindPiece(z,key){
    const src=parts[key];if(!src)return null;
    const piece=cloneSkinned(src),bones=new Map();dressPiece(piece,z);
    z.body.traverse(o=>{if(o.isBone&&!bones.has(o.name))bones.set(o.name,o);});
    const meshes=[];piece.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
    for(const m of meshes){
      const skel=m.skeleton,mapped=skel.bones.map(b=>bones.get(b.name)??b);
      m.bind(new THREE.Skeleton(mapped,skel.boneInverses.map(i=>i.clone())),m.bindMatrix);
      m.frustumCulled=false;m.removeFromParent();z.body.add(m);
    }
    return meshes;
  }
  function split(z){
    if(z.gib)return z.gib;
    z.body=z.root.children[0];
    const original=[];z.body.traverse(o=>{if(o.isSkinnedMesh)original.push(o);});
    for(const m of original)m.visible=false;
    z.gib={upper:'upclean',lower:'lowclean',meshes:{upper:bindPiece(z,'upclean'),lower:bindPiece(z,'lowclean')},lost:new Set()};
    return z.gib;
  }
  function swap(z,half,key){
    const g=split(z);if(!parts[key])return false;
    for(const m of g.meshes[half]??[])m.removeFromParent();
    g.meshes[half]=bindPiece(z,key);g[half]=key;return true;
  }

  // ---- flying pieces -----------------------------------------------------------------------
  const flying=[];
  function launch(z,key,boneName,push){
    const src=parts[key];const at=new THREE.Vector3();
    const bone=z.root.getObjectByName(boneName);(bone??z.root).getWorldPosition(at);
    blood(at);if(!src)return;
    const piece=cloneSkinned(src);dressPiece(piece,z);piece.traverse(o=>{if(o.isMesh)o.frustumCulled=false;});
    // the spawn models are modelled in place on the body: keep the zombie's pose and spin it away
    piece.position.copy(z.root.position);piece.quaternion.copy(z.root.quaternion);scene.add(piece);
    const pivot=at.clone();
    const v=push.clone().multiplyScalar(140+Math.random()*80).addScaledVector(up,120+Math.random()*90);
    flying.push({piece,pivot,offset:piece.position.clone().sub(pivot),v,spin:new THREE.Vector3((Math.random()-.5)*12,(Math.random()-.5)*12,(Math.random()-.5)*12),life:6,rest:false});
  }
  function blood(at){features.effect?.(at,0x6e0b07,10);}

  // a severed head: the head model itself, popped off the neck
  function popHead(z,push){
    let headObj=null;   // the head model hangs off j_spine4 with a fixed matrix (see enemies.spawn)
    z.body?.traverse(o=>{if(!headObj&&o.isObject3D&&o!==z.body&&o.matrixAutoUpdate===false&&o.children.length)headObj=o;});
    const at=enemies.headPosition(z);blood(at);blood(at);
    if(!headObj)return;
    headObj.updateMatrixWorld(true);const world=headObj.matrixWorld.clone();
    headObj.removeFromParent();scene.add(headObj);headObj.matrixAutoUpdate=false;headObj.matrix.copy(world);
    const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();world.decompose(p,q,s);
    headObj.matrixAutoUpdate=true;headObj.position.copy(p);headObj.quaternion.copy(q);headObj.scale.copy(s);
    flying.push({piece:headObj,pivot:at.clone(),offset:p.clone().sub(at),v:push.clone().multiplyScalar(90).addScaledVector(up,200+Math.random()*80),spin:new THREE.Vector3((Math.random()-.5)*16,(Math.random()-.5)*16,(Math.random()-.5)*16),life:6,rest:false});
  }

  // ---- crawlers ---------------------------------------------------------------------------
  function crawler(z){
    if(z.crawler)return;z.crawler=true;
    const rig=z.rig,fast=z.speed>110;
    if(anims.crawl)rig.add('walk',fast&&anims.crawlFast?anims.crawlFast:anims.crawl,true);
    if(anims.attack)rig.add('attack',anims.attack,true);
    if(anims.death)rig.add('death',anims.death,true);
    rig.mixer.stopAllAction();rig.current=null;rig.play(z.state==='attack'?'attack':'walk');
    z.speed=Math.max(24,z.speed*(fast?.55:.45));
  }

  // ---- deciding what comes off -------------------------------------------------------------
  let lastHit=null;                       // where the last bullet struck, from the game's ray test
  // Hit tests: the game's body box is a standing zombie's (up to 58 high), which would let shots
  // pass over a crawler and still hit. Crawlers are tested against a box around their actual bones
  // (refit each shot as they move), standing zombies by the game's own test.
  const CRAWL_BONES=['j_head','j_neck','j_spine4','j_spinelower','j_mainroot','j_shoulder_le','j_shoulder_ri','j_elbow_le','j_elbow_ri','j_wrist_le','j_wrist_ri','j_hip_le','j_hip_ri'];
  const crawlBox=(z,box)=>{box.makeEmpty();const p=new THREE.Vector3();z.root.updateMatrixWorld(true);
    for(const n of CRAWL_BONES){const b=z.root.getObjectByName(n);if(b)box.expandByPoint(b.getWorldPosition(p));}
    return box.expandByScalar(6);};
  const rayHit=enemies.rayHit.bind(enemies);
  enemies.rayHit=(ray,far,...rest)=>{
    const crawlers=enemies.list.filter(z=>z.crawler);let best;
    if(crawlers.length){
      const all=enemies.list;enemies.list=all.filter(z=>!z.crawler);
      try{best=rayHit(ray,far,...rest);}finally{enemies.list=all;}
      const box=new THREE.Box3(),out=new THREE.Vector3();
      for(const z of crawlers){
        const headPoint=ray.intersectSphere(new THREE.Sphere(enemies.headPosition(z),9),new THREE.Vector3());
        const bodyPoint=crawlBox(z,box).isEmpty()?null:ray.intersectBox(box,out.clone());
        let head=!!headPoint,point=headPoint??bodyPoint;if(!point)continue;
        if(headPoint&&bodyPoint&&bodyPoint.distanceTo(ray.origin)+10<headPoint.distanceTo(ray.origin)){point=bodyPoint;head=false;}
        const distance=point.distanceTo(ray.origin);if(distance>far||best&&best.distance<distance)continue;best={z,head,point,distance};
      }
    }else best=rayHit(ray,far,...rest);
    lastHit=best?{z:best.z,point:best.point.clone(),head:best.head,dir:ray.direction.clone()}:null;return best;
  };

  host.on('beforeEnemyDamage',e=>{
    const z=e.enemy;if(!z||z.kind!=='zombie'||!z.root)return;
    const kills=e.amount>=z.health,cause=e.cause;
    const hit=lastHit?.z===z?lastHit:null;lastHit=null;
    const toward=hit?.dir?.clone().setY(0).normalize()??new THREE.Vector3((Math.random()-.5),0,(Math.random()-.5)).normalize();
    if(cause==='thunder')return;            // the Thundergun throws zombies whole (thundergun mod)
    if(cause==='explosion'){
      // blasts tear off whatever they like
      for(const limb of ['rarm','larm','legs'])if(Math.random()<(kills?.45:.2))cut(z,limb,toward);
      if(kills&&Math.random()<.25)behead(z,toward);
      return;
    }
    if(cause!=='bullet'||!hit)return;
    if(e.head){if(kills&&Math.random()<.55)behead(z,toward);return;}
    // body shot: which limb, from the hit point in the zombie's own frame
    const local=z.root.worldToLocal(hit.point.clone()),h=local.y,side=local.x;
    const big=e.amount>=Math.max(120,z.health*.35);
    if(h<26&&!z.crawler&&(kills?Math.random()<.35:big&&Math.random()<.3))cut(z,'legs',toward);
    else if(h>34&&Math.abs(side)>7&&Math.random()<(kills?.5:big?.3:.08))cut(z,side>0?'larm':'rarm',toward);
  });

  function cut(z,limb,toward){
    const g=split(z);if(g.lost.has(limb))return;g.lost.add(limb);
    if(limb==='rarm'||limb==='larm'){
      const both=g.lost.has('rarm')&&g.lost.has('larm');
      // BO1 has no model with both arms gone; the second arm keeps the first's torso
      if(!both)swap(z,'upper',limb==='rarm'?'rarmoff_1':'larmoff_1');
      launch(z,limb==='rarm'?'rarmspawn':'larmspawn',limb==='rarm'?'j_elbow_ri':'j_elbow_le',toward);
    }else{
      swap(z,'lower','legsoff_1');
      launch(z,'rlegspawn','j_knee_ri',toward);launch(z,'llegspawn','j_knee_le',toward);
      if(enemies.list.includes(z))crawler(z);
    }
  }
  function behead(z,toward){
    const g=split(z);if(g.lost.has('head'))return;g.lost.add('head');
    // BO1 attaches the neck stump as an extra piece; it doesn't replace the torso
    g.meshes.stump=bindPiece(z,'behead');
    popHead(z,toward);
  }

  host.on('reset',()=>{for(const f of flying)f.piece.removeFromParent();flying.length=0;});
  const ray=new THREE.Raycaster();
  host.on('update',dt=>{
    if(!dt)return;
    for(const f of [...flying]){
      f.life-=dt;
      if(!f.rest){
        f.v.y-=900*dt;const step=f.v.clone().multiplyScalar(dt);
        const hit=world.raycast(new THREE.Ray(f.pivot.clone(),step.lengthSq()?step.clone().normalize():up.clone().negate()),0,step.length()+3);
        if(hit){f.v.multiplyScalar(-.25);f.v.y=Math.abs(f.v.y);f.spin.multiplyScalar(.4);if(f.v.length()<40)f.rest=true;}
        else f.pivot.add(step);
        const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(f.spin.x*dt,f.spin.y*dt,f.spin.z*dt));
        f.offset.applyQuaternion(q);f.piece.quaternion.premultiply(q);f.piece.position.copy(f.pivot).add(f.offset);
      }
      if(f.life<1)f.piece.position.y-=dt*20;
      if(f.life<=0){f.piece.removeFromParent();flying.splice(flying.indexOf(f),1);}
    }
    while(flying.length>40){const f=flying.shift();f.piece.removeFromParent();}
  });
  // debug: kino.dismemberment.cut(zombieId,'rarm'|'larm'|'legs') / .behead(zombieId)
  const byId=id=>enemies.list.find(z=>z.id===id);
  window.kino.dismemberment={cut:(id,limb)=>{const z=byId(id);if(z)cut(z,limb,new THREE.Vector3(1,0,0));return !!z;},behead:id=>{const z=byId(id);if(z)behead(z,new THREE.Vector3(1,0,0));return !!z;},state:id=>{const z=byId(id);return z&&{lost:[...(z.gib?.lost??[])],crawler:!!z.crawler,speed:z.speed,anim:z.rig.current};}};
}
