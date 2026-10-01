// Held throws. Pressing G (frag) or X (tactical) brings the item up in your
// hand; it stays there while the key is held and is thrown on release.
// The M67 cooks like BO1: its 3.5 s fuse starts at the pin, a cooked grenade
// has less time left once thrown, and holding past the fuse blows up in hand.
//
// Poses: these BO1 equipment clips end with the hand out of view in this rig
// (and the M67's own clips convert badly), so the hold pose is the frame of the
// clip where the item sits best in view, picked by sampling the clip once per
// item. The frag and the monkey are held with the QED's hand rig (it has a
// pull-pin clip and carries the item in the hand), its own mesh hidden and the
// item's model in its place. The frag model comes from the BO1 build
// (wonder-weapons); without it the game's own instant grenade is used.
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const RELEASE=.12;       // seconds into the throw clip when the item leaves the hand

export default async function setup(api){
  const {host,session,view,data,audio,camera,scene,world,enemies,features}=api;
  const eq=data.equipment??{},frag=eq.frag_grenade_zm,qed=eq.zombie_quantum_bomb;
  // items carried on the QED rig, with the model shown in hand
  const STAND_IN={frag_grenade_zm:frag?.worldModel,zombie_cymbal_monkey:eq.zombie_cymbal_monkey?.projectileModel};
  const handModels={};
  for(const [id,url] of Object.entries(STAND_IN))if(url&&qed)handModels[id]=await loadModel(url).catch(()=>null);
  const fragMesh=handModels.frag_grenade_zm;
  const cue=k=>Object.keys(audio.manifest).find(x=>x.endsWith(k));
  const PIN=cue('grenade/foley/pin/pin'),WHOOSH=cue('grenade/foley/throw/gren_throw');

  let held=null;   // {id,key,released,throwing,ready,pinAt,holdKey,holdT}
  window.kino.throwables={get holding(){return held?.id??null;}};
  const tac=()=>window.kino.tactical;
  function available(key){
    if(key==='KeyG')return frag&&session.grenades>0?'frag_grenade_zm':null;
    const t=tac();if(t?.id&&t.count>0)return t.id;
    return session.monkeys>0?'zombie_cymbal_monkey':null;
  }

  addEventListener('keydown',e=>{
    if(!['KeyG','KeyX'].includes(e.code))return;
    const id=available(e.code);if(!id)return;            // nothing to throw: let the game handle it
    e.stopImmediatePropagation();if(e.repeat||held)return;
    const st=api.getState();if(!st.active||session.busy||session.phase==='reviving'||session.weaponUnavailable)return;
    begin(id,e.code);
  },true);
  addEventListener('keyup',e=>{if(held&&e.code===held.key)held.released=true;},true);
  addEventListener('blur',()=>{if(held)held.released=true;});

  // ---- the hand ------------------------------------------------------------------------
  const viewDef=id=>STAND_IN[id]&&qed&&handModels[id]?{...qed,id:'held:'+id,name:eq[id]?.name??id}:eq[id];
  let inHand=null;
  function dress(id){
    inHand?.removeFromParent();inHand=null;
    const gun=view.gun;if(!gun)return;
    const standIn=!!handModels[id]&&viewDef(id)!==eq[id];
    gun.traverse(o=>{if(o.isMesh)o.visible=!standIn;});
    if(standIn){const bone=gun.getObjectByName('j_gun')??gun,model=cloneSkinned(handModels[id]);   // skinned models need SkeletonUtils
      // centre the model on the grip point (model origins vary), sized to fit the hand
      const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()).length();
      model.position.sub(box.getCenter(new THREE.Vector3()));
      inHand=new THREE.Group();inHand.add(model);if(id==='zombie_cymbal_monkey')inHand.rotation.y=Math.PI;   // face, not the dynamite
      inHand.scale.setScalar(Math.min(1,5.5/Math.max(size,1e-3)));bone.add(inHand);}
  }
  function hideItem(){if(inHand)inHand.visible=false;else view.gun?.traverse(o=>{if(o.isMesh)o.visible=false;});}

  // the frame of `key` where the item is best placed in view (lower right), cached per rig
  const best=new Map();
  function holdFrame(key){
    const cacheKey=view.def?.id+':'+key;if(best.has(cacheKey))return best.get(cacheKey);
    const r=view.rig,a=r?.actions[key],d=r?.data[key]?.duration;if(!a||!d)return 0;
    const target=inHand??view.gun,box=new THREE.Box3(),c=new THREE.Vector3();
    let bestT=d,bestScore=-Infinity;
    const was={time:a.time,scale:a.timeScale};r.mixer.stopAllAction();a.reset();a.timeScale=0;a.play();
    for(let i=0;i<=20;i++){
      a.time=d*i/20;r.mixer.update(0);view.root.updateMatrixWorld(true);box.setFromObject(target).getCenter(c);
      if(box.isEmpty()||c.z>-6)continue;
      const nx=c.x/-c.z,ny=c.y/-c.z,score=-((nx-.28)**2+(ny+.24)**2)+i*1e-4;   // ties go to later frames
      if(score>bestScore){bestScore=score;bestT=a.time;}
    }
    best.set(cacheKey,bestT);return bestT;
  }

  async function begin(id,key){
    held={id,key,released:false,throwing:false,ready:false};
    if(id==='frag_grenade_zm')session.grenades--;
    else if(id!=='zombie_cymbal_monkey')tac().count--;     // monkeys are spent by features.throwMonkey
    session.cancelReload?.();session.equipmentLeft=99;
    try{await view.equip(viewDef(id));}catch(err){console.warn('[throwables]',err);}
    if(!held)return;
    dress(id);view.mode='throw';
    const r=view.rig,holdKey=r?.actions.holdFireAnim?'holdFireAnim':'fireAnim',t=holdFrame(holdKey);
    held.holdKey=holdKey;held.holdT=t;held.pinAt=session.time;held.ready=true;
    // run the pull-pin clip up to the hold frame (or ease straight into it on the throw clip)
    if(holdKey==='holdFireAnim'){r.play('holdFireAnim',false,1.6,.05);}
    else{r.play('fireAnim',false,0,.15);r.actions.fireAnim.time=t;}
    if(id==='frag_grenade_zm'&&PIN)setTimeout(()=>held?.id===id&&audio.play(PIN,.8),250);
  }

  function release(){
    const h=held;h.throwing=true;const r=view.rig;
    if(r?.actions.fireAnim){r.play('fireAnim',false,1,.04);r.actions.fireAnim.time=0;r.actions.fireAnim.timeScale=1;}
    const len=r?.data.fireAnim?.duration||.4;
    setTimeout(()=>{if(held===h){hideItem();launch(h);}},RELEASE*1000);
    setTimeout(async()=>{if(held!==h)return;held=null;session.equipmentLeft=0;await api.equipView?.();},Math.max(len,.3)*1000+80);
  }

  // ---- projectiles ---------------------------------------------------------------------
  const frags=[];
  function launch(h){
    if(WHOOSH)audio.play(WHOOSH,.6);
    if(h.id==='frag_grenade_zm'){
      const fuse=Math.max(.05,(frag.fuseTime??3.5)-(session.time-h.pinAt));
      const mesh=fragMesh?fragMesh.clone(true):new THREE.Mesh(new THREE.SphereGeometry(3.5,8,6),new THREE.MeshStandardMaterial({color:0x4a5039,roughness:.8}));
      const dir=camera.getWorldDirection(new THREE.Vector3());mesh.position.copy(camera.position).addScaledVector(dir,12);scene.add(mesh);
      frags.push({mesh,velocity:dir.multiplyScalar(560).add(new THREE.Vector3(0,150,0)),life:fuse,spin:new THREE.Vector3(Math.random()*9,Math.random()*9,0)});
    }else if(h.id==='zombie_cymbal_monkey'){session.equipmentLeft=0;features.throwMonkey?.();session.equipmentLeft=99;}
    else{tac().launch?.(h.id);const t=tac();if(t.count<=0)t.id=null;}
  }
  function explode(at,inHandBlast){
    features.effect?.(at,0xffb347,30);audio.play('explosion');
    for(const z of [...enemies.list]){const d=z.root.position.distanceTo(at);if(d<300&&world.lineClear(at,z.root.position.clone().add(new THREE.Vector3(0,30,0))))enemies.hurt(z,Math.max(75,1500*(1-d/300)),false,false,'explosion');}
    const d=inHandBlast?0:camera.position.distanceTo(at);if(d<160)api.damage(inHandBlast?260:180*(1-d/160));
  }

  host.on('reset',()=>{held=null;for(const f of frags)f.mesh.removeFromParent();frags.length=0;});
  host.on('update',dt=>{
    if(!dt)return;
    if(held){
      session.equipmentLeft=Math.max(session.equipmentLeft,.2);
      if(session.phase==='reviving'||session.phase==='gameover'){held=null;session.equipmentLeft=0;}
      else if(held.ready&&!held.throwing){
        const a=view.rig?.actions[held.holdKey];
        if(held.holdKey==='holdFireAnim'&&a&&a.time>=held.holdT)a.timeScale=0;     // stop on the hold frame
        const since=session.time-held.pinAt;
        if(held.id==='frag_grenade_zm'&&since>=(frag.fuseTime??3.5)){const at=camera.position.clone();held=null;session.equipmentLeft=0;explode(at,true);api.equipView?.();}
        else if(held.released&&since>=.25)release();
      }
    }
    for(const g of [...frags]){
      g.life-=dt;g.velocity.y-=650*dt;const travel=g.velocity.clone().multiplyScalar(dt),hit=world.raycast(new THREE.Ray(g.mesh.position.clone(),travel.clone().normalize()),0,travel.length()+4);
      if(hit){g.velocity.y=Math.abs(g.velocity.y)*.4;g.velocity.x*=-.4;g.velocity.z*=-.4;g.spin.multiplyScalar(.5);}else g.mesh.position.add(travel);
      g.mesh.rotation.x+=g.spin.x*dt;g.mesh.rotation.y+=g.spin.y*dt;
      if(g.life<=0){explode(g.mesh.position.clone(),false);g.mesh.removeFromParent();frags.splice(frags.indexOf(g),1);}
    }
  });
}
