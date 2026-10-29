import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { assetManager, disposeSkeletons } from './runtime-assets.js';

const loader=new GLTFLoader(assetManager), models=new Map(), clips=new Map();
export async function loadModel(url){if(!url)return null;if(!models.has(url))models.set(url,loader.loadAsync(url).then(gltf=>gltf.scene));return clone(await models.get(url));}
// every model load started so far (settled or not): the engine waits for them before its shader warm-up (2026-10-29)
export function pendingModels(){return Promise.allSettled([...models.values()]);}
export async function loadAnimation(url){if(!clips.has(url))clips.set(url,fetch(url).then(r=>{if(!r.ok)throw new Error('Animation '+url+': '+r.status);return r.json();}));return clips.get(url);}
export function makeClip(root, data, locomotion=false){
  const tracks=[];const nodes=new Map();
  root.traverse(n=>{if(!nodes.has(n.name))nodes.set(n.name,[]);nodes.get(n.name).push(n);});
  for(const b of data.bones){
    if(b.name==='tag_origin'||b.name==='tag_sync')continue;
    for(const node of nodes.get(b.name)??[]){
      if(node.userData.animationAnchor)continue;
      if(b.rot)tracks.push(new THREE.QuaternionKeyframeTrack(node.uuid+'.quaternion',b.rot.frames.map(f=>f/data.fps),b.rot.values));
      if(b.pos){
        const values=b.pos.values.slice();
        // T5 locomotion stores j_mainroot translations as displacement from
        // the bind pelvis, unlike the absolute viewmodel pose tracks.
        if(locomotion&&b.name==='j_mainroot')for(let i=0;i<values.length;i+=3){values[i]=node.position.x;values[i+1]=node.position.y;values[i+2]+=node.position.z;}
        // Weapon-part translations (bolts, magazines, pumps, the Thundergun's
        // drum) are displacements from the part's bind position, not absolute.
        // Read as absolute they pulled parts into the receiver.
        const bind=node.userData.bindPosition;
        if(bind)for(let i=0;i<values.length;i+=3){values[i]+=bind.x;values[i+1]+=bind.y;values[i+2]+=bind.z;}
        tracks.push(new THREE.VectorKeyframeTrack(node.uuid+'.position',b.pos.frames.map(f=>f/data.fps),values));
      }
    }
  }
  return new THREE.AnimationClip(data.name,Math.max(1/data.fps,data.duration),tracks);
}
export class Rig {
  constructor(root,onNotify=()=>{}){this.root=root;this.mixer=new THREE.AnimationMixer(root);this.actions={};this.data={};this.current=null;this.onNotify=onNotify;this.elapsed=0;this.side=null;this.sideElapsed=0;this.sideQuiet=false;}
  add(key,data,locomotion=false){this.data[key]=data;this.actions[key]=this.mixer.clipAction(makeClip(this.root,data,locomotion));}
  play(key,loop=true,speed=1,fade=.1){
    const a=this.actions[key];if(!a)return false;if(this.current===key&&loop)return true;
    const old=this.actions[this.current];
    // Fading a short firing action into itself erased most of its recoil.
    if(old&&old!==a){if(fade)old.fadeOut(fade);else old.stop();}
    a.stop().reset().setEffectiveWeight(1).setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce,loop?Infinity:1);
    a.clampWhenFinished=!loop;a.timeScale=speed;if(fade)a.fadeIn(fade);a.play();this.current=key;this.elapsed=-1e-6;return true;
  }
  // a second slot on the same mixer (dual wield: the left gun's clips run beside the right gun's, on their own bones);
  // quiet: its notetracks stay silent (both guns reloading: the right clip's notes carry the sounds)
  playSide(key,loop=true,speed=1,fade=.1,quiet=false){
    const a=this.actions[key];if(!a)return false;if(this.side===key&&loop&&a.isRunning())return true;
    const old=this.actions[this.side];if(old&&old!==a){if(fade)old.fadeOut(fade);else old.stop();}
    a.stop().reset().setEffectiveWeight(1).setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce,loop?Infinity:1);
    a.clampWhenFinished=!loop;a.timeScale=speed;if(fade)a.fadeIn(fade);a.play();this.side=key;this.sideElapsed=-1e-6;this.sideQuiet=quiet;return true;
  }
  stopSide(fade=.1){const a=this.actions[this.side];if(a){if(fade)a.fadeOut(fade);else a.stop();}this.side=null;}
  update(dt){
    const action=this.actions[this.current],data=this.data[this.current],before=this.elapsed;
    if(action){this.elapsed+=dt*action.timeScale;for(const n of data.notifies??[])if(n.time>before&&n.time<=this.elapsed)this.onNotify(n.name,this.current);}
    const side=this.actions[this.side];
    if(side&&!this.sideQuiet){const b=this.sideElapsed;this.sideElapsed+=dt*side.timeScale;for(const n of this.data[this.side].notifies??[])if(n.time>b&&n.time<=this.sideElapsed)this.onNotify(n.name,this.side);}
    this.mixer.update(dt);
  }
}

const basis=new THREE.Matrix4().makeBasis(new THREE.Vector3(0,0,-1),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,1,0));
export class ViewWeapon {
  constructor(scene,data,onSound=()=>{}){
    this.scene=scene;this.data=data;this.onSound=onSound;this.pivot=new THREE.Group();scene.add(this.pivot);
    this.token=0;this.currentId=null;this.recoil=0;this.aim=0;this.mode='idle';this.meleeLeft=0;this.sprintBlend=0;
  }
  async equip(def){
    const key=def.id+(def.upgraded?':upgraded':'')+(def.attachmentActive?':attachment':'');
    if(this.currentId===key&&this.ready)return;this.currentId=key;this.ready=false;const token=++this.token;
    this.pivot.visible=false;
    const [hands,gun,leftGun,...knives]=await Promise.all([
      loadModel(def.handsModel??this.data.characters.viewmodel_usa_pow_arms??this.data.characters.viewhands_usmc),loadModel(def.model),
      def.leftModel?loadModel(def.leftModel):Promise.resolve(null),
      ...Object.values(this.data.melee).map(d=>loadModel(d.model))]);
    const entries=await Promise.all(Object.entries(def.animations).map(async([key,url])=>[key,await loadAnimation(url)]));
    let leftBones=null;
    if(def.leftAnimations){
      const left=new Map(await Promise.all(Object.entries(def.leftAnimations).filter(([key])=>key.endsWith('AnimLeft')).map(async([key,url])=>[key,await loadAnimation(url)])));
      const right=new Map(entries),li=left.get('idleAnimLeft'),ri=right.get('idleAnim');
      // Each gun its own layer (2026-10-26, user: firing one gun snapped the other back to its idle): the right clips
      // play on the rig's main slot cut to the right side's bones, the left clips (leftAnimations *AnimLeft) on its side
      // slot cut to the bones the left idle moves and the right idle doesn't. Clips that hold both guns (raise, drop,
      // sprint, melee) still play alone: the side slot stands down while one is on (leftCover).
      // def.dualFireKick scales a fire clip's swing about its first frame, def.dualFireTime is the time it takes (the AW
      // akimbo Atlas's authored shot flips the gun 25° and floats it back down over half a second).
      if(li&&ri){
        leftBones=new Set(li.bones.map(b=>b.name));for(const b of ri.bones)leftBones.delete(b.name);
        const only=(clip,keep,name)=>({...clip,name,bones:clip.bones.filter(b=>keep(b.name))}),fire=/^(ads)?(fire|lastShot)Anim$/i;
        const soften=(clip,k)=>k==null||k===1?clip:{...clip,bones:clip.bones.map(b=>({...b,
          ...(b.pos&&{pos:{...b.pos,values:b.pos.values.map((v,i)=>b.pos.values[i%3]+(v-b.pos.values[i%3])*k)}}),
          ...(b.rot&&{rot:{...b.rot,values:(()=>{const q0=new THREE.Quaternion().fromArray(b.rot.values),q=new THREE.Quaternion(),out=[];
            for(let i=0;i<b.rot.values.length;i+=4)out.push(...q.fromArray(b.rot.values,i).slerp(q0,1-k).toArray());return out;})()}})}))};
        const SIDED=['idleAnim','emptyIdleAnim','fireAnim','lastShotAnim','adsFireAnim','adsLastShotAnim','reloadAnim','reloadEmptyAnim'];
        for(let i=0;i<entries.length;i++){const [key,clip]=entries[i];if(SIDED.includes(key))entries[i]=[key,soften(only(clip,n=>!leftBones.has(n),clip.name+'-r'),fire.test(key)?def.dualFireKick:null)];}
        for(const [key,src] of [['idleAnim','idleAnimLeft'],['fireAnim','fireAnimLeft'],['lastShotAnim','lastShotAnimLeft'],['reloadAnim','reloadAnimLeft'],['reloadEmptyAnim','reloadEmptyAnimLeft']]){
          const clip=left.get(src);if(clip)entries.push(['L:'+key,soften(only(clip,n=>leftBones.has(n),clip.name+'-l'),fire.test(key)?def.dualFireKick:null)]);}
      }
      const combine=(a,b,name)=>a&&b?{...a,name,duration:Math.max(a.duration,b.duration),bones:[...a.bones,...b.bones.filter(n=>!a.bones.some(r=>r.name===n.name))]}:a;
      if(!leftBones)for(const [key,clip]of right){const l=(key.startsWith('reload')?left.get('reloadAnimLeft'):left.get('idleAnimLeft'));if(l&&['idleAnim','fireAnim','lastShotAnim','reloadAnim','reloadEmptyAnim'].includes(key))entries.push([key,combine(clip,l,clip.name+'-dual')]);}
      if(!leftBones&&left.has('fireAnimLeft'))entries.push(['leftFireAnim',combine(left.get('fireAnimLeft'),right.get('idleAnim'),'dual-left-fire')]);
    }
    const meleeEntries=await Promise.all(Object.entries(this.data.melee).flatMap(([type,d])=>
      Object.entries(d.animations).filter(([k])=>k.startsWith('melee')).map(async([key,url])=>[type+':'+key,await loadAnimation(url)])));
    // The knife on an imported rig (a BO3 weapon's own arms, def.handsModel): those arms have no tag_knife_attach and the
    // gun no knife clip, so BO1's T5 knife clip played on BO3's bones (another bind pose, 2.2x the scale): a huge skewed
    // sleeve swung through the camera and no knife (2026-10-28). As BO3 itself does, the knife is its own viewmodel here:
    // BO1's arms (the operator's arm set, mods/characters prepare; a character's own arms re-skin onto them, fp-arms.js)
    // with the knives on their own rig under the pivot, shown in place of the gun's rig for the swing (the gun is off the
    // screen in that clip anyway). A rig with its own melee clip (def.melee) or a knife tag keeps knifing itself.
    const t5Url=this.data.characters.viewmodel_usa_pow_arms??this.data.characters.viewhands_usmc;
    const knifeModels=def.handsModel&&!def.melee&&t5Url&&hands&&!hands.getObjectByName('tag_knife_attach')&&Object.keys(this.data.melee).length
      ?await Promise.all([loadModel(t5Url),...Object.values(this.data.melee).map(d=>loadModel(d.model))]):null;
    if(token!==this.token){for(const model of [hands,gun,leftGun,...knives,...(knifeModels??[])])disposeSkeletons(model);return;}
    if(this.rig)this.rig.mixer.uncacheRoot(this.rig.root);
    if(this.meleeRig)this.meleeRig.mixer.uncacheRoot(this.meleeRig.root);
    disposeSkeletons(this.root);disposeSkeletons(this.meleeRoot);
    if(!hands||!gun)throw new Error('Missing viewmodel for '+def.id);
    this.def=def;this.pivot.clear();this.pivot.position.set(0,0,0);this.pivot.rotation.set(0,0,0);
    // Assemble outside the scene. Using matrixWorld under the previous gun's
    // ADS/recoil pivot baked that pose into every subsequent weapon attachment.
    this.root=new THREE.Group();this.root.add(hands);this.gun=gun;this.hands=hands;
    const view=hands.getObjectByName('tag_view'),tag=hands.getObjectByName('tag_weapon');
    if(!view||!tag)throw new Error('Missing viewmodel attachment bones');
    view.userData.animationAnchor=true;
    this.root.updateMatrixWorld(true);
    const cameraBasis=new THREE.Matrix4().multiplyMatrices(basis,view.matrixWorld.clone().invert());
    const attach=(model,parent,boneName)=>{
      model.updateMatrixWorld(true);
      let bone=model.getObjectByName(boneName);model.traverse(n=>{if(!bone&&n.isBone)bone=n;});
      if(!bone)throw new Error('Missing attachment root '+boneName);
      bone.userData.animationAnchor=true;
      model.matrixAutoUpdate=false;model.matrix.copy(bone.matrixWorld).invert();parent.add(model);
    };
    // Mark weapon-part bones with their bind position (see makeClip). j_gun
    // roots stay absolute: they are anchors, or animate perk bottles.
    for(const model of [gun,leftGun])model?.traverse(n=>{if(n.isBone&&!/^j_gun1?$/.test(n.name))n.userData.bindPosition=n.position.clone();});
    attach(gun,tag,'j_gun');
    this.leftGun=leftGun;
    if(leftGun){const leftTag=hands.getObjectByName('tag_weapon1');if(leftTag)attach(leftGun,leftTag,leftGun.getObjectByName('j_gun1')?'j_gun1':'j_gun');}
    // Bottles animate j_gun relative to tag_weapon throughout opening/drinking.
    // Freezing that root leaves the bottle behind while the hands move away.
    if(def.id.startsWith('zombie_perk_bottle_')){gun.getObjectByName('j_gun').userData.animationAnchor=false;gun.matrix.identity();}
    this.knives={};const knifeTag=hands.getObjectByName('tag_knife_attach');
    if(knifeTag)Object.keys(this.data.melee).forEach((type,i)=>{attach(knives[i],knifeTag,'tag_knife');knives[i].visible=false;this.knives[type]=knives[i];});
    this.hiddenTags=[];
    for(const name of def.hideTags??[]){const bone=gun.getObjectByName(name);if(bone){bone.scale.setScalar(.000001);this.hiddenTags.push(name);}}
    this.root.matrixAutoUpdate=false;this.root.matrix.copy(cameraBasis);this.pivot.add(this.root);
    const sound=(name)=>this.onSound(name,this.meleeType?this.data.melee[this.meleeType]:this.def);
    this.rig=new Rig(this.root,sound);
    this.meleeRoot=null;this.meleeRig=null;this.meleeHands=null;   // the knife rig (see knifeModels above)
    if(knifeModels){const [t5,...kn]=knifeModels,kv=t5.getObjectByName('tag_view'),kt=t5.getObjectByName('tag_knife_attach');
      if(kv&&kt){const root=new THREE.Group();root.add(t5);kv.userData.animationAnchor=true;root.updateMatrixWorld(true);
        const kb=new THREE.Matrix4().multiplyMatrices(basis,kv.matrixWorld.clone().invert());
        this.knives={};Object.keys(this.data.melee).forEach((type,i)=>{attach(kn[i],kt,'tag_knife');kn[i].visible=false;this.knives[type]=kn[i];});
        root.matrixAutoUpdate=false;root.matrix.copy(kb);root.visible=false;this.pivot.add(root);
        this.meleeRoot=root;this.meleeHands=t5;this.meleeRig=new Rig(root,sound);for(const [key,clip] of meleeEntries)this.meleeRig.add(key,clip);
        root.traverse(o=>{o.frustumCulled=false;});}
      else for(const m of knifeModels)disposeSkeletons(m);}
    for(const [key,clip] of [...entries,...(this.meleeRig?[]:meleeEntries)])this.rig.add(key,clip);
    this.leftBones=leftBones;this.leftCover=new Set(leftBones?Object.keys(this.rig.data).filter(k=>!k.startsWith('L:')&&this.rig.data[k].bones.some(b=>leftBones.has(b.name))):[]);   // clips that hold both guns
    // ADS is a separate native animation of tag_torso. Its first frame also
    // defines each gun's HIP pose; the arms' bind torso is only right for M1911.
    const aimData=entries.find(([key])=>key==='adsUpAnim')?.[1];
    this.aimTracks=[];this.aimDuration=aimData?.duration??0;
    for(const b of aimData?.bones??[]){const node=hands.getObjectByName(b.name);if(!node)continue;
      if(b.pos)this.aimTracks.push({node,property:'position',sample:new THREE.VectorKeyframeTrack('',b.pos.frames.map(f=>f/aimData.fps),b.pos.values).createInterpolant()});
      if(b.rot)this.aimTracks.push({node,property:'quaternion',sample:new THREE.QuaternionKeyframeTrack('',b.rot.frames.map(f=>f/aimData.fps),b.rot.values).createInterpolant()});
    }
    this.aim=0;this.recoil=0;this.meleeLeft=0;this.meleeType=null;this.sprintBlend=0;this.applyAim();
    this.rig.play('idleAnim',true,1,0);this.rig.update(0);
    // raiseWith: a one-off clip in place of the raise (a weapon's form change, mods/bo3-weapons/aw.js)
    const swap=this.raiseWith;this.raiseWith=null;
    this.mode=(swap&&this.rig.play(swap,false,1,.04))||this.rig.play('raiseAnim',false,this.clipSpeed('raiseAnim',def.raiseTime),.04)?'raise':'idle';
    this.root.traverse(o=>{o.frustumCulled=false;});
    this.ready=true;this.pivot.visible=true;
  }
  clipSpeed(key,duration){return duration>0?(this.rig.data[key]?.duration??duration)/duration:1;}
  applyAim(restOnly=false){
    for(const t of this.aimTracks){
      const b=this.rig.data[this.rig.current]?.bones.find(b=>b.name===t.node.name);
      if(restOnly&&b?.[t.property==='position'?'pos':'rot'])continue;
      t.node[t.property].fromArray(t.sample.evaluate(restOnly?0:this.aim*this.aimDuration));
    }
  }
  shoot({ads=false,empty=false,hand='right'}={}){
    if(!this.ready||this.meleeLeft>0)return;
    let key=ads?(empty?'adsLastShotAnim':'adsFireAnim'):(empty?'lastShotAnim':'fireAnim');
    const r=this.rig,speed=k=>this.def.dualWield&&this.def.dualFireTime?this.clipSpeed(k,this.def.dualFireTime):1;
    if(hand==='left'&&this.leftBones){   // the left gun's own slot; a clip holding both guns (sprint) gives way to the idle
      const lk=empty&&r.actions['L:lastShotAnim']?'L:lastShotAnim':'L:fireAnim';if(!r.actions[lk])return;
      if(this.leftCover.has(r.current)){r.play('idleAnim',true,1,0);this.mode='idle';}
      this.recoil=1;r.playSide(lk,false,speed(lk),0);return;}
    if(hand==='left'&&r.actions.leftFireAnim)key='leftFireAnim';
    if(!r.actions[key])key='fireAnim';this.recoil=1;this.mode='fire';r.play(key,false,speed(key),0);
  }
  // hand (dual wield, rules.js reloadHand): 'left' or 'right' reloads that gun alone, the other one carries on
  reload(empty,duration,stage='magazine',hand=null){
    if(!this.ready)return;this.reloadHand=hand;
    if(this.leftBones&&hand){const r=this.rig,lk=empty&&r.actions['L:reloadEmptyAnim']?'L:reloadEmptyAnim':'L:reloadAnim';
      if(hand!=='right')r.playSide(lk,false,this.clipSpeed(lk,duration),.06,hand==='both');
      if(hand==='left'){if(this.leftCover.has(r.current)||this.mode==='reload'){r.play('idleAnim',true,1,.06);this.mode='idle';}return;}}
    const key=stage==='start'?'reloadStartAnim':stage==='end'?'reloadEndAnim':empty&&this.rig.actions.reloadEmptyAnim?'reloadEmptyAnim':'reloadAnim';
    this.mode='reload';this.aim=0;this.rig.play(key,false,this.clipSpeed(key,duration),.06);
  }
  melee(type='knife',charge=false){
    if(!this.ready||this.meleeLeft>0)return null;
    if(this.def.melee){
      const d=this.def.melee,key=charge?'meleeChargeAnim':'meleeAnim',duration=Math.max(charge?d.meleeChargeTime:d.meleeTime,this.rig.data[key]?.duration??0);
      this.meleeType=null;this.meleeLeft=duration;this.mode='melee';this.aim=0;this.rig.play(key,false,this.clipSpeed(key,duration),0);
      return {duration,delay:charge?d.meleeChargeDelay:d.meleeDelay,damage:d.meleeDamage};
    }
    const def=this.data.melee[type],key=type+':'+(charge?'meleeChargeAnim':'meleeAnim'),r=this.meleeRig??this.rig;
    const duration=Math.max(charge?def.chargeTime:def.time,r.data[key].duration);
    this.meleeType=type;this.meleeLeft=duration;this.mode='melee';this.aim=0;
    for(const [k,model] of Object.entries(this.knives))model.visible=k===type;
    if(this.meleeRig){this.root.visible=false;this.meleeRoot.visible=true;}   // the knife rig in place of the gun's for the swing
    r.play(key,false,duration>0?(r.data[key]?.duration??duration)/duration:1,0);
    return {duration,delay:charge?def.chargeDelay:def.delay,damage:def.damage};
  }
  update(dt,{moving=false,sprint=false,ads=false,reloading=false,empty=false,time=0}={}){
    if(!this.ready)return;
    this.rig.update(dt);this.meleeRig?.update(dt);this.meleeLeft=Math.max(0,this.meleeLeft-dt);
    const action=this.rig.actions[this.rig.current],finished=!action?.isRunning();
    // sprintPose (mods/movement/fp.js): no sprint clips; the idle grip keeps playing and the motion layer poses the sprint
    const sprintKey=phase=>{if(this.sprintPose)return 'sprintPoseAnim';const key='sprint'+phase+(empty?'Empty':'')+'Anim';return this.rig.actions[key]?key:'sprint'+phase+'Anim';};
    if(this.mode==='melee'&&this.meleeLeft===0){for(const model of Object.values(this.knives))model.visible=false;this.meleeType=null;this.mode='idle';
      if(this.meleeRoot){this.meleeRoot.visible=false;this.root.visible=true;}}
    if(this.mode==='reload'&&!reloading)this.mode='idle';
    if(['fire','raise','sprintOut'].includes(this.mode)&&finished)this.mode='idle';
    if(this.mode==='sprintIn'&&finished){this.mode='sprint';this.rig.play(sprintKey('Loop'),true,this.clipSpeed(sprintKey('Loop'),this.def.sprintLoopTime),.04);}
    if(['idle','fire'].includes(this.mode)&&sprint){this.mode='sprintIn';if(!this.rig.play(sprintKey('In'),false,this.clipSpeed(sprintKey('In'),this.def.sprintInTime),.06)){this.mode='sprint';this.rig.play(this.rig.actions[sprintKey('Loop')]?sprintKey('Loop'):'idleAnim');}}
    if(['sprint','sprintIn'].includes(this.mode)&&!sprint){this.mode='sprintOut';if(!this.rig.play(sprintKey('Out'),false,this.clipSpeed(sprintKey('Out'),this.def.sprintOutTime),.04))this.mode='idle';}
    if(this.mode==='idle')this.rig.play(empty&&this.rig.actions.emptyIdleAnim?'emptyIdleAnim':'idleAnim',true,1,.06);
    if(this.leftBones){const r=this.rig,a=r.actions[r.side];   // the left gun's slot: off under a clip that holds both, else its idle between shots and reloads
      if(this.leftCover.has(r.current)){if(r.side)r.stopSide(.06);}else if(!a?.isRunning())r.playSide('L:idleAnim',true,1,.06);}
    const aiming=ads&&['idle','fire'].includes(this.mode);
    this.aim=THREE.MathUtils.clamp(this.aim+(aiming?dt/Math.max(.01,this.def.adsInTime):-dt/Math.max(.01,this.def.adsOutTime)),0,1);
    this.applyAim(!['idle','fire'].includes(this.mode));
    this.recoil=Math.max(0,this.recoil-dt*8);
    const bob=moving&&this.mode!=='melee'?(1-this.aim)*.13*(this.bobScale??1):0;   // bobScale: a motion layer (mods/movement/fp.js) replaces this bob with its own
    this.pivot.position.set(Math.sin(time*(sprint?13:9))*bob,Math.cos(time*(sprint?26:18))*bob*.7,this.recoil*.25);
    this.pivot.rotation.set(this.recoil*.012,0,0);
    // def.viewOffset [x,y,z] (view space): where the weapon rests at the hip (e.g. BO3 guns sit lower, in the corner); gone in ADS
    if(this.def.viewOffset&&!this.meleeRoot?.visible)this.pivot.position.add(new THREE.Vector3(...this.def.viewOffset).multiplyScalar(1-this.aim));   // (BO1's knife rig sits where BO1's arms do)
    // Ray Gun uses authored weapon offsets in place of sprint XAnims.
    const offsetSprint=sprint&&!this.rig.actions.sprintLoopAnim&&this.mode==='sprint'&&!this.sprintPose;   // (sprintPose: the motion layer's pose instead)
    this.sprintBlend=THREE.MathUtils.damp(this.sprintBlend,offsetSprint?1:0,16,dt);
    if(this.sprintBlend>.001){this.pivot.position.addScaledVector(new THREE.Vector3(...this.def.sprintOffset),this.sprintBlend);const r=this.def.sprintRotation;this.pivot.rotation.set(r[0]*this.sprintBlend,r[1]*this.sprintBlend,r[2]*this.sprintBlend);}
    this.root.updateMatrixWorld(true);if(this.meleeRoot?.visible)this.meleeRoot.updateMatrixWorld(true);
  }
  snapshot(){
    const position=name=>this.root?.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()).toArray();
    return {ready:this.ready,id:this.currentId,hiddenTags:this.hiddenTags??[],mode:this.mode,animation:this.rig?.current,
      time:this.rig?.actions[this.rig.current]?.time,aim:this.aim,melee:this.meleeType,meleeLeft:this.meleeLeft,
      knifeVisible:Object.entries(this.knives??{}).filter(([,m])=>m.visible).map(([k])=>k),
      gun:position('j_gun'),knife:position('tag_knife_attach'),torso:this.hands?.getObjectByName('tag_torso')?.position.toArray()};
  }
}
