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
// One lethal slot (2026-10-28): while Claymores are held, G places a claymore instead (no frags).
// Frag augments (research mod, window.kino.equipAug): frag.radius, cluster, self, sticky, recycle, stun, bleed, fire.
import * as THREE from 'three';
import { loadModel, loadAnimation } from '../../animation.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const RELEASE=.12;       // seconds into the throw clip when the item leaves the hand
// The lob (2026-11-07): the Moon rigs' throw clips don't show the item leaving the hand in this rig (the Gersh's
// sits fixed above the screen for the whole clip, the QED's, which frags and monkeys ride, behind the camera), so
// the item seemed to vanish on release. A rig whose throw clip shows the item in view in under 2 of 9 samples
// throws with a procedural lob from the hold pose instead: cock back, push forward, the item leaves, the hand drops away.
const LOB=.46,LOB_RELEASE=.2;

export default async function setup(api){
  const {host,session,view,data,audio,camera,scene,world,enemies,features,viewScene}=api;
  const eq=data.equipment??{},frag=eq.frag_grenade_zm,qed=eq.zombie_quantum_bomb;
  // items carried on the QED rig, with the model shown in hand
  // (equipment other mods add with a `standInModel`, the BO3 Trip Mine and Smoke Grenade, ride the same rig)
  const STAND_IN={frag_grenade_zm:frag?.worldModel,zombie_cymbal_monkey:eq.zombie_cymbal_monkey?.projectileModel,
    ...Object.fromEntries(Object.entries(eq).filter(([,d])=>d.standInModel).map(([id,d])=>[id,d.standInModel]))};
  // BO3's throw rigs (2026-11-17, user: "make it so the tripmine, gersch, and monkey bomb uses the proper throwing animation"):
  // pull the pin (twist the Gersh, none for the mine), hold, BO3's own throw with the item leaving the hand at the clip's
  // fastest hand frame (rig.release). The mine is the spider-mine viewmodel itself; the Gersh and the monkey ride on the
  // grenade's tag_weapon in place of the BO3 frag. Built by .tools/build_bo3_throws.py (data.throwRigs, bo3-equipment).
  // squeeze: x/y scale about the camera while a rig is out = BO3's wider viewmodel FOV (our view camera is 51°, so its cocked arm sat off screen); hold: where the hold stops (fraction of the pull, or of the throw for the spider mine, whose idle is an off-screen rest frame)
  const RIG_LOOK={frag:{squeeze:.76,hold:{at:.8}},tactical:{squeeze:.76,hold:{at:1}},spider:{squeeze:.76,hold:{clip:'fireAnim',at:.3}}};
  const RIG_OF={tripmine_zm:'spider',zombie_black_hole_bomb:'tactical',zombie_cymbal_monkey:'frag'};
  const rigFor=id=>{const r=data.throwRigs?.[RIG_OF[id]];return r&&(r.ownModel||STAND_IN[id]||(id==='zombie_black_hole_bomb'&&eq[id]?.worldModel))?r:null;};
  if(rigFor('zombie_black_hole_bomb'))STAND_IN.zombie_black_hole_bomb=eq.zombie_black_hole_bomb.worldModel;
  const handModels={};
  for(const [id,url] of Object.entries(STAND_IN))if(url&&(qed||rigFor(id)))handModels[id]=await loadModel(url).catch(()=>null);
  const fragMesh=handModels.frag_grenade_zm;
  // load-time warm-up (2026-10-29): the in-hand models are skinned clones under the QED viewmodel and the thrown frag a
  // world clone; a hidden copy of each in the view scene and one in the engine's warm group compile their programs and
  // vertex layouts behind the loading screen (the m67's first draw froze the first throw for 2 s on Windows/D3D11)
  {const warm=new THREE.Group();
    for(const m of Object.values(handModels))if(m){if(viewScene){const v=cloneSkinned(m);v.visible=false;v.traverse(o=>{o.frustumCulled=false;});viewScene.add(v);}warm.add(m.clone(true));}
    // the rigs: arms, viewmodel and clips are loaded here so view.equip finds them cached; the arms and viewmodel warmed like the rest
    for(const r of new Set(Object.keys(RIG_OF).map(rigFor).filter(Boolean))){
      const [hands,gun]=await Promise.all([loadModel(r.handsModel),loadModel(r.model)].map(p=>p.catch(()=>null)));
      for(const m of [hands,gun])if(m){if(viewScene){const v=cloneSkinned(m);v.visible=false;v.traverse(o=>{o.frustumCulled=false;});viewScene.add(v);}}
      await Promise.all(Object.values(r.animations).map(u=>loadAnimation(u).catch(()=>null)));}
    (host.warmObjects??=[]).push(warm);}
  const cue=k=>Object.keys(audio.manifest).find(x=>x.endsWith(k));
  const PIN=cue('grenade/foley/pin/pin'),WHOOSH=cue('grenade/foley/throw/gren_throw');

  let held=null;   // {id,key,released,throwing,ready,pinAt,holdKey,holdT}
  window.kino.throwables={get holding(){return held?.id??null;},get held(){return held;}};   // (held: tests pose the lob through held.lob)
  const tac=()=>window.kino.tactical;
  function available(key){
    const lx=window.kino.lethalExtra;   // a lethal another mod puts in the slot (Trip Mines: lx.owned(), count(), spend(), launch())
    if(key==='KeyG'&&lx?.owned())return lx.count()>0&&handModels[lx.id]?lx.id:null;
    if(key==='KeyG')return frag&&session.grenades>0?'frag_grenade_zm':null;
    const t=tac();if(t?.id&&t.count>0)return t.id;
    return session.monkeys>0?'zombie_cymbal_monkey':null;
  }

  const aug=k=>window.kino.equipAug?.(k)??0,efx=()=>window.kino.equipFx;
  addEventListener('keydown',e=>{
    if(!['KeyG','KeyX'].includes(e.code))return;
    if(e.code==='KeyG'&&session.claymoresOwned){   // the lethal slot holds Claymores: G places one
      e.stopImmediatePropagation();if(e.repeat||held)return;
      const st=api.getState();if(st.active&&!session.busy&&session.phase!=='reviving')features.placeClaymore?.();return;}
    const id=available(e.code);if(!id)return;            // nothing to throw: let the game handle it
    e.stopImmediatePropagation();if(e.repeat||held)return;
    // (the gun in hand may be away in Pack-a-Punch: the throw still works, as the game's own grenade does; the engine shows the view in 'throw' mode)
    const st=api.getState();if(!st.active||session.busy||session.phase==='reviving')return;
    begin(id,e.code);
  },true);
  addEventListener('keyup',e=>{if(held&&e.code===held.key)held.released=true;},true);
  addEventListener('blur',()=>{if(held)held.released=true;});

  // ---- the hand ------------------------------------------------------------------------
  const viewDef=id=>{const r=rigFor(id);if(r&&(r.ownModel||handModels[id]))return {adsInTime:.2,adsOutTime:.2,...r,...RIG_LOOK[RIG_OF[id]],id:'held:'+id,name:eq[id]?.name??id};   // animation.js divides by adsIn/OutTime: without them the aim blend is NaN and fp.js zeroes the pivot
    return STAND_IN[id]&&qed&&handModels[id]?{...qed,id:'held:'+id,name:eq[id]?.name??id}:eq[id];};
  let inHand=null;
  function dress(id){
    inHand?.removeFromParent();inHand=null;
    const gun=view.gun;if(!gun)return;
    const def=viewDef(id),standIn=!!handModels[id]&&def!==eq[id]&&!def.ownModel;
    gun.traverse(o=>{if(o.isMesh)o.visible=!standIn;});
    if(standIn){const bone=gun.getObjectByName('j_gun')??gun.getObjectByName('tag_weapon')??gun,model=cloneSkinned(handModels[id]);   // skinned models need SkeletonUtils
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
      // ties go to later frames; .01 a second favours an early hold (the Gersh's 3.5 s pull-pin settled at 3 s, 1.9 s after the press)
      const nx=c.x/-c.z,ny=c.y/-c.z,score=-((nx-.28)**2+(ny+.24)**2)-.01*a.time+i*1e-4;
      if(score>bestScore){bestScore=score;bestT=a.time;}
    }
    best.set(cacheKey,bestT);return bestT;
  }
  // whether the rig's throw clip shows the item in view over its first half (else: the lob), cached per rig
  const clipOk=new Map();
  function throwClipOk(){
    const cacheKey=view.def?.id;if(clipOk.has(cacheKey))return clipOk.get(cacheKey);
    const r=view.rig,a=r?.actions.fireAnim,d=r?.data.fireAnim?.duration;if(!a||!d)return false;
    const target=inHand??view.gun,box=new THREE.Box3(),c=new THREE.Vector3();let seen=0;
    r.mixer.stopAllAction();a.reset();a.timeScale=0;a.play();
    for(let i=0;i<=8;i++){a.time=d*.5*i/8;r.mixer.update(0);view.root.updateMatrixWorld(true);box.setFromObject(target).getCenter(c);
      if(!box.isEmpty()&&c.z<-6&&Math.abs(c.x/-c.z)<1.1&&Math.abs(c.y/-c.z)<1.1)seen++;}
    a.stop();clipOk.set(cacheKey,seen>=2);return seen>=2;
  }
  const sm=x=>x<=0?0:x>=1?1:x*x*(3-2*x);
  // the lob over the view pose (fp.js calls it after its own motion): view units, x right, y up, z back
  function lobPose(P,R){
    const l=held?.lob;if(!l)return;const u=Math.min(1,l.t/l.T);
    const back=sm(u/.3)*(1-sm((u-.3)/.18)),fwd=sm((u-.28)/.22),drop=sm((u-.5)/.5);
    P.z+=.6*back-9*fwd;P.y+=1.8*back+1.4*fwd-16*drop;P.x+=.5*back-1.2*fwd;R.x+=.12*back-.5*fwd-.55*drop;R.z+=.08*back-.18*fwd;
  }

  async function begin(id,key){
    held={id,key,released:false,throwing:false,ready:false};
    const keep=window.kino.freeThrow?.();held.spent=!keep&&id!=='zombie_cymbal_monkey';   // Free Throw (Mule Kick augment)
    if(id==='frag_grenade_zm'){if(!keep)session.grenades--;}
    else if(id===window.kino.lethalExtra?.id){if(!keep)window.kino.lethalExtra.spend();}
    else if(id!=='zombie_cymbal_monkey'){if(!keep)tac().count--;}     // monkeys are spent by features.throwMonkey
    session.cancelReload?.();session.equipmentLeft=99;
    try{await view.equip(viewDef(id));}catch(err){console.warn('[throwables]',err);}
    if(!held)return;
    dress(id);view.mode='throw';
    const r=view.rig,vd=viewDef(id);
    if(vd.release!=null){   // a BO3 rig: the pull-pin runs to its hold point (RIG_LOOK), the mine is held on a frame of its throw
      held.rig=vd;const pin=vd.animations.holdFireAnim!==vd.animations.idleAnim&&r?.actions.holdFireAnim,H=vd.hold??{};
      held.lobbed=false;held.pinAt=session.time;held.ready=true;
      if(H.clip==='fireAnim'&&r?.actions.fireAnim){held.holdKey='fireAnim';held.holdT=(H.at??0)*(r.data.fireAnim?.duration??0);r.play('fireAnim',false,0,.12);r.actions.fireAnim.time=held.holdT;}   // the hand comes up holding the mine and waits
      else if(pin){const d=r.data.holdFireAnim?.duration??0;held.holdKey='holdFireAnim';held.endT=d-1/60;held.holdT=Math.min(held.endT,(H.at??1)*d);r.play('holdFireAnim',false,1.6*(window.kino.throwSpeed?.()??1),.05);}
      else{held.holdKey='idleAnim';held.holdT=0;r?.play('idleAnim',true,1,.1);}
      return;}
    const holdKey=r?.actions.holdFireAnim?'holdFireAnim':'fireAnim',t=holdFrame(holdKey);held.lobbed=!throwClipOk();
    held.holdKey=holdKey;held.holdT=t;held.pinAt=session.time;held.ready=true;
    // run the pull-pin clip up to the hold frame (or ease straight into it on the throw clip)
    if(holdKey==='holdFireAnim'){r.play('holdFireAnim',false,1.6*(window.kino.throwSpeed?.()??1),.05);}
    else{r.play('fireAnim',false,0,.15);r.actions.fireAnim.time=t;}
    if(id==='frag_grenade_zm'&&PIN)setTimeout(()=>held?.id===id&&audio.play(PIN,.8),250);
  }

  // a weapon swap before the throw puts the item away (2026-11-17, user: "if you swap weapons before throwing the lethal or
  // tactical, it cancels it instead of throwing it"): the spent item comes back, then the swap goes through. Once the throw
  // has started it finishes (the swap is refused while busy, as before).
  function cancel(){
    const h=held;if(!h||h.throwing)return false;held=null;inHand?.removeFromParent();inHand=null;session.equipmentLeft=0;
    if(h.spent){if(h.id==='frag_grenade_zm')session.grenades++;else if(h.id===window.kino.lethalExtra?.id)window.kino.lethalExtra.refund?.();else if(tac())tac().count++;}
    return true;
  }
  const swap=session.switchWeapon;
  session.switchWeapon=function(...a){cancel();return swap.apply(this,a);};

  function release(){
    const h=held;h.throwing=true;const r=view.rig,pace=window.kino.throwSpeed?.()??1;   // Fast Pitcher
    const from=h.holdKey==='fireAnim'?h.holdT:0;   // the spider mine's throw goes on from its hold frame
    let len=(r?.data.fireAnim?.duration||.4)-from,at=Math.max(.02,(h.rig?.release??RELEASE)-from);
    if(h.lobbed){const a=r?.actions[h.holdKey];if(a)a.timeScale=0;h.lob={t:0,T:LOB/pace};len=LOB;at=LOB_RELEASE;}   // the hand holds its pose under the lob
    else if(r?.actions.fireAnim){if(!from)r.play('fireAnim',false,pace,.04);r.actions.fireAnim.time=from;r.actions.fireAnim.timeScale=pace;}
    setTimeout(()=>{if(held===h){hideItem();launch(h);}},at*1000/pace);
    setTimeout(async()=>{if(held!==h)return;held=null;session.equipmentLeft=0;await api.equipView?.();},Math.max(len,.3)*1000/pace+80);
  }

  // ---- projectiles ---------------------------------------------------------------------
  const frags=[];
  function launch(h){
    if(WHOOSH)audio.play(WHOOSH,.6);
    if(h.id==='frag_grenade_zm'&&window.kino.fragSwap?.(h))return;   // a map's own grenade in the frag slot throws itself (Gorod Krovi: Widow's Wine web grenades, gorod-krovi/widows.js)
    if(h.id==='frag_grenade_zm'){
      const fuse=Math.max(.05,(frag.fuseTime??3.5)-(session.time-h.pinAt));
      const mesh=fragMesh?cloneSkinned(fragMesh):new THREE.Mesh(new THREE.SphereGeometry(3.5,8,6),new THREE.MeshStandardMaterial({color:0x4a5039,roughness:.8}));
      const dir=camera.getWorldDirection(new THREE.Vector3());mesh.position.copy(camera.position).addScaledVector(dir,12);scene.add(mesh);
      const far=window.kino.throwRange?.()??1;   // Quarterback
      frags.push({mesh,velocity:dir.multiplyScalar(560*far).add(new THREE.Vector3(0,150*far,0)),life:fuse,spin:new THREE.Vector3(Math.random()*9,Math.random()*9,0),sticky:aug('frag.sticky')>0});
    }else if(h.id==='zombie_cymbal_monkey'){session.equipmentLeft=0;features.throwMonkey?.();session.equipmentLeft=99;}
    else if(h.id===window.kino.lethalExtra?.id)window.kino.lethalExtra.launch();
    else tac().launch?.(h.id);   // an empty tactical keeps its slot (greyed at 0) for the next Max Ammo
  }
  // mini: a Cluster Charge bomblet (smaller, 40% damage, no further bomblets or after-effects)
  function explode(at,inHandBlast,mini=false){
    features.effect?.(at,0xffb347,mini?16:30);audio.play('explosion');
    const R=(mini?150:300)*(1+aug('frag.radius')),k=mini?.4:1,caught=[];
    for(const z of [...enemies.list]){const d=z.root.position.distanceTo(at);if(d<R&&world.lineClear(at,z.root.position.clone().add(new THREE.Vector3(0,30,0)))){caught.push(z);enemies.hurt(z,k*Math.max(75,1500*(1-d/R)),false,false,'explosion');}}
    const d=inHandBlast?0:camera.position.distanceTo(at);if(d<160&&!session.perks?.has('specialty_flakjacket'))api.damage((inHandBlast?260:180*(1-d/160))*k*(1-Math.min(1,aug('frag.self'))));   // PhD Flopper: no self-inflicted explosive damage
    if(mini)return;
    const fx=efx(),alive=caught.filter(z=>enemies.list.includes(z)),kills=caught.length-alive.length;
    if(aug('frag.recycle')&&kills>=aug('frag.recycle')&&!session.claymoresOwned){session.grenades++;api.toast?.('Recycler · grenade returned');}
    if(fx){for(const z of alive){if(aug('frag.stun'))fx.stun(z,aug('frag.stun'));if(aug('frag.bleed'))fx.bleed(z,aug('frag.bleed'),4);}
      if(aug('frag.fire')){const down=world.raycast(new THREE.Ray(at.clone(),new THREE.Vector3(0,-1,0)),0,200);fx.fire(down?at.clone().setY(at.y-down.distance):at,aug('frag.fire'),5,R*.4);}}
    for(let i=0;i<aug('frag.cluster');i++){   // bomblets scatter from the blast and go off a moment later
      const a=Math.random()*Math.PI*2,sp=180+Math.random()*120,mesh=new THREE.Mesh(new THREE.SphereGeometry(2,6,4),new THREE.MeshStandardMaterial({color:0x4a5039,roughness:.8}));
      mesh.position.copy(at).add(new THREE.Vector3(0,8,0));scene.add(mesh);
      frags.push({mesh,velocity:new THREE.Vector3(Math.cos(a)*sp,220+Math.random()*80,Math.sin(a)*sp),life:.6+Math.random()*.4,spin:new THREE.Vector3(9,9,0),mini:true});}
  }

  host.on('reset',()=>{held=null;for(const f of frags)f.mesh.removeFromParent();frags.length=0;});
  host.on('update',dt=>{
    if(!dt)return;
    const fm=window.kino.fpMotion;if(fm&&fm.throwPose!==lobPose)fm.throwPose=lobPose;
    const sq=(held&&view.def?.id==='held:'+held.id&&view.def.squeeze)||1;if(view.pivot.scale.x!==sq)view.pivot.scale.set(sq,sq,1);   // BO3 rig drawn at BO3's FOV
    if(held){
      if(held.lob)held.lob.t+=dt;
      session.equipmentLeft=Math.max(session.equipmentLeft,.2);
      if(session.phase==='reviving'||session.phase==='gameover'){held=null;session.equipmentLeft=0;}
      else if(held.ready&&!held.throwing){
        const a=view.rig?.actions[held.holdKey];
        if(held.holdKey==='holdFireAnim'&&a&&!(held.released&&held.endT!=null)&&a.time>=held.holdT)a.timeScale=0;     // stop on the hold frame
        const since=session.time-held.pinAt;
        if(held.id==='frag_grenade_zm'&&since>=(frag.fuseTime??3.5)){const at=camera.position.clone();held=null;session.equipmentLeft=0;explode(at,true);api.equipView?.();}
        // a tap before the lobbed item is up: the pull-pin runs on fast to the hold pose first (a lob from there started off screen)
        else if(held.released&&since>=.25){if((held.lobbed||held.rig)&&held.holdKey==='holdFireAnim'&&a&&a.time<(held.endT??held.holdT)-.02)a.timeScale=Math.max(a.timeScale,4.5);else release();}
      }
    }
    for(const g of [...frags]){
      g.life-=dt;
      if(g.stuckTo){   // Semtex: rides on the zombie (stays where it was if the zombie dies)
        if(enemies.list.includes(g.stuckTo))g.mesh.position.copy(g.stuckTo.root.position).add(g.stuckOff);
        if(g.life<=0){explode(g.mesh.position.clone(),false);g.mesh.removeFromParent();frags.splice(frags.indexOf(g),1);}
        continue;}
      if(g.sticky){const p=g.mesh.position,z=enemies.list.find(z=>z.health>0&&Math.abs(z.root.position.y+45-p.y)<55&&Math.hypot(z.root.position.x-p.x,z.root.position.z-p.z)<22);
        if(z){g.stuckTo=z;g.stuckOff=p.clone().sub(z.root.position);continue;}}
      g.velocity.y-=650*dt;const travel=g.velocity.clone().multiplyScalar(dt),hit=world.raycast(new THREE.Ray(g.mesh.position.clone(),travel.clone().normalize()),0,travel.length()+4);
      if(hit){if(g.velocity.length()>120)window.kino.eventSounds?.bounce?.(g.mesh.position);g.velocity.y=Math.abs(g.velocity.y)*.4;g.velocity.x*=-.4;g.velocity.z*=-.4;g.spin.multiplyScalar(.5);}else g.mesh.position.add(travel);
      g.mesh.rotation.x+=g.spin.x*dt;g.mesh.rotation.y+=g.spin.y*dt;
      if(g.life<=0){explode(g.mesh.position.clone(),false,g.mini);g.mesh.removeFromParent();if(g.mini){g.mesh.geometry.dispose();g.mesh.material.dispose();}frags.splice(frags.indexOf(g),1);}
    }
  });
}
