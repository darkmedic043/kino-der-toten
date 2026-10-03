// Third-person operators animated with Black Ops' own player-body animations (not part of
// upstream). A hidden T5 body skeleton plays the pb_* clips (built by
// .tools/build_player_anims.sh into mods/characters/animations, git-ignored); every frame the
// character's own bones copy that skeleton's joint rotations (world-space deltas from the
// bind pose, after posing the character's limbs over the T5 bind), so the character keeps its
// proportions. Used by characters.json entries with "motion": "bo1"; returns null (and the
// procedural rig is used instead) when the clips or the T5 body are unavailable.
import * as THREE from 'three';
import { loadModel, loadAnimation, makeClip } from './animation.js';

const ANIMS='mods/characters/animations/';
const DRIVER='c_ger_honorguard_body1';
// Clip roles. Directional sets are [forward, back, left, right].
const CLIPS={
  idle:'pb_stand_alert',ads:'pb_stand_ads',
  walk:['pb_stand_shoot_walk_forward','pb_stand_shoot_walk_back','pb_stand_shoot_walk_left','pb_stand_shoot_walk_right'],
  run:['pb_combatrun_forward_loop','pb_combatrun_back_loop','pb_combatrun_left_loop','pb_combatrun_right_loop'],
  sprint:'pb_sprint',
  crouch:'pb_crouch_alert',crouchAds:'pb_crouch_ads',
  crouchRun:['pb_crouch_run_forward','pb_crouch_run_back','pb_crouch_run_left','pb_crouch_run_right'],
  prone:'pb_prone_aim',crawl:['pb_prone_crawl','pb_prone_crawl_back','pb_prone_crawl_left','pb_prone_crawl_right'],
  jump:'pb_standjump_takeoff',runJump:'pb_runjump_takeoff',land:'pb_standjump_land',runLand:'pb_runjump_land',
  dive:'pb_dive_prone',diveLand:'pb_dive_prone_land',slide:'pb_terrain_slide',mantle:'pb_climbup',
};
// Speed (units/s) each looping set was authored for; playback scales with the real speed.
const NOMINAL={walk:85,run:190,sprint:290,crouchRun:110,crawl:45};
const ONESHOT=new Set(['jump','runJump','land','runLand','dive','diveLand','mantle']);
const FINGERS=[['thumb',/thumb/i],['index',/index/i],['mid',/mid/i],['ring',/ring/i],['pinky',/little|pinky/i]];

const wpos=(o,v=new THREE.Vector3())=>o.getWorldPosition(v);
const firstChild=b=>b?.children.find(c=>c.isBone)??null;
function rotateWorld(bone,delta){
  const p=bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.premultiply(p.clone().invert().multiply(delta).multiply(p)).normalize();bone.updateWorldMatrix(false,true);
}
const aim=(bone,from,to)=>{if(from.lengthSq()>1e-8&&to.lengthSq()>1e-8)rotateWorld(bone,new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(),to.clone().normalize()));};
function handBasis(wrist,mid,index,little){
  const f=mid.clone().sub(wrist).normalize(),l=index.clone().sub(little).normalize();
  const up=new THREE.Vector3().crossVectors(f,l).normalize(),side=new THREE.Vector3().crossVectors(up,f).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f,up,side));
}

// Humanoid bones by name and shape (+X is the character's left; characters face +Z).
function humanoid(model,holder){
  const bones=[];model.traverse(o=>{if(o.isBone)bones.push(o);});
  const local=b=>holder.worldToLocal(wpos(b));
  const hips=bones.find(b=>/hips|pelvis/i.test(b.name));if(!hips)return null;
  const hipY=local(hips).y,kids=hips.children.filter(c=>c.isBone);
  let legs=kids.filter(c=>/leg|thigh/i.test(c.name)&&!/coat/i.test(c.name));
  if(legs.length<2)legs=kids.filter(c=>firstChild(c)&&local(firstChild(c)).y<hipY-2&&!/tail|coat|skirt/i.test(c.name));
  const arms=bones.filter(b=>/arm/i.test(b.name)&&!/fore|lower|armature/i.test(b.name)&&firstChild(b)&&firstChild(firstChild(b)));
  const pick=(list,s)=>list.filter(b=>Math.sign(local(b).x)===s).sort((a,b)=>Math.abs(local(b).x)-Math.abs(local(a).x))[0];
  const sides={};
  for(const [t5,s] of [['le',1],['ri',-1]]){
    const arm=pick(arms,s),leg=pick(legs,s);if(!arm||!leg)return null;
    const fore=firstChild(arm),hand=firstChild(fore),knee=firstChild(leg),ankle=firstChild(knee),toes=firstChild(ankle);
    const clav=arm.parent?.isBone&&arm.parent!==hips&&/shoulder|clav/i.test(arm.parent.name)?arm.parent:null;
    const fingers={};
    for(const base of hand?.children.filter(c=>c.isBone)??[]){const kind=FINGERS.find(([,re])=>re.test(base.name));if(!kind||fingers[kind[0]])continue;
      const chain=[base];while(chain.length<3&&firstChild(chain.at(-1)))chain.push(firstChild(chain.at(-1)));fingers[kind[0]]=chain;}
    sides[t5]={clav,arm,fore,hand,leg,knee,ankle,toes,fingers};
  }
  const spine=[];for(let b=(sides.le.clav??sides.le.arm).parent;b&&b!==hips;b=b.parent)if(b.isBone)spine.unshift(b);
  const neck=bones.find(b=>/neck/i.test(b.name)),head=bones.find(b=>/^head/i.test(b.name));
  return {hips,spine,neck,head,sides};
}

export async function bo1Rig(model,holder,entry,data){
  const url=data?.characters?.[entry.motionBody??DRIVER];if(!url)return null;
  const names=[...new Set(Object.values(CLIPS).flat())];
  let clips;try{clips=Object.fromEntries(await Promise.all(names.map(async n=>[n,await loadAnimation(ANIMS+n+'.json')])));}
  catch(e){console.info('[bo1-motion] clips not built (sh .tools/build_player_anims.sh); using procedural animation');return null;}
  const body=await loadModel(url);if(!body)return null;
  // BO1's player rig hangs the spine off torso_stabilizer, a joint the clips counter-rotate
  // against the pelvis; the zombie bodies parent the spine straight to j_mainroot, so without
  // it every torso rotation stacked on the pelvis and the body folded over backwards.
  {const mr=body.getObjectByName('j_mainroot'),sl=body.getObjectByName('j_spinelower');
    if(mr&&sl&&!body.getObjectByName('torso_stabilizer')){const s=new THREE.Bone();s.name='torso_stabilizer';s.position.copy(sl.position);mr.add(s);s.add(sl);sl.position.set(0,0,0);}}
  const H=humanoid(model,holder);if(!H){console.warn('[bo1-motion] no humanoid skeleton on',entry.id);return null;}
  // The driver: T5 faces +X, so turn it to +Z; scale it to the character's hip height.
  const driver=new THREE.Group();driver.name='bo1_driver';driver.rotation.y=-Math.PI/2;driver.add(body);driver.visible=false;holder.add(driver);
  holder.updateMatrixWorld(true);
  const T=n=>body.getObjectByName(n);
  const t5Hip=wpos(T('j_mainroot')).y-holder.position.y,hipY=holder.worldToLocal(wpos(H.hips)).y;
  driver.scale.setScalar(hipY/Math.max(1e-3,t5Hip));holder.updateMatrixWorld(true);
  const tp=n=>wpos(T(n));

  // Pose the character's limbs over the T5 bind pose (directions only), so the deltas match.
  for(const [t5,S] of Object.entries(H.sides)){
    if(S.clav)aim(S.clav,wpos(S.arm).sub(wpos(S.clav)),tp('j_shoulder_'+t5).sub(tp('j_clavicle_'+t5)));
    aim(S.arm,wpos(S.fore).sub(wpos(S.arm)),tp('j_elbow_'+t5).sub(tp('j_shoulder_'+t5)));
    aim(S.fore,wpos(S.hand).sub(wpos(S.fore)),tp('j_wrist_'+t5).sub(tp('j_elbow_'+t5)));
    const f=S.fingers,t=n=>T(`j_${n}_${t5}_1`);
    if(f.mid&&f.index&&f.pinky&&t('mid')&&t('index')&&t('pinky')){
      const want=handBasis(tp('j_wrist_'+t5),wpos(t('mid')),wpos(t('index')),wpos(t('pinky')));
      const have=handBasis(wpos(S.hand),wpos(f.mid[0]),wpos(f.index[0]),wpos(f.pinky[0]));
      rotateWorld(S.hand,want.multiply(have.invert()));
    }
    for(const [n,chain] of Object.entries(f))chain.forEach((b,i)=>{const a=T(`j_${n}_${t5}_${i+1}`),c=T(`j_${n}_${t5}_${i+2}`);if(a&&c&&chain[i+1])aim(b,wpos(chain[i+1]).sub(wpos(b)),wpos(c).sub(wpos(a)));});
    aim(S.leg,wpos(S.knee).sub(wpos(S.leg)),tp('j_knee_'+t5).sub(tp('j_hip_'+t5)));
    aim(S.knee,wpos(S.ankle).sub(wpos(S.knee)),tp('j_ankle_'+t5).sub(tp('j_knee_'+t5)));
    if(S.toes&&T('j_ball_'+t5))aim(S.ankle,wpos(S.toes).sub(wpos(S.ankle)),tp('j_ball_'+t5).sub(tp('j_ankle_'+t5)));
  }
  holder.updateMatrixWorld(true);

  // Character bone -> T5 bone. Shorter spines map to the ends of T5's.
  const pairs=[[H.hips,'j_mainroot']];
  const sp=H.spine,spT=sp.length>=3?['j_spinelower','j_spineupper','j_spine4']:sp.length===2?['j_spinelower','j_spine4']:['j_spine4'];
  sp.slice(0,3).forEach((b,i)=>pairs.push([b,spT[i]]));if(sp.length>3)pairs.push([sp.at(-1),'j_spine4']);
  if(H.neck)pairs.push([H.neck,'j_neck']);if(H.head)pairs.push([H.head,'j_head']);
  for(const [t5,S] of Object.entries(H.sides)){
    if(S.clav)pairs.push([S.clav,'j_clavicle_'+t5]);
    pairs.push([S.arm,'j_shoulder_'+t5],[S.fore,'j_elbow_'+t5],[S.hand,'j_wrist_'+t5],[S.leg,'j_hip_'+t5],[S.knee,'j_knee_'+t5],[S.ankle,'j_ankle_'+t5]);
    if(S.toes)pairs.push([S.toes,'j_ball_'+t5]);
    for(const [n,chain] of Object.entries(S.fingers))chain.forEach((b,i)=>pairs.push([b,`j_${n}_${t5}_${i+1}`]));
  }
  const hq=holder.getWorldQuaternion(new THREE.Quaternion()).invert();
  const relQ=o=>hq.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion()));
  const map=new Map();
  for(const [c,n] of pairs){const t=T(n);if(t&&c&&!map.has(c))map.set(c,{t,cBind:relQ(c),tBindInv:relQ(t).invert()});}
  const hipBind=holder.worldToLocal(wpos(H.hips)),rootBind=holder.worldToLocal(wpos(T('j_mainroot')));
  const order=[];model.traverse(o=>order.push(o));

  // Mixer on the driver; every clip is always playing and the weights pick the pose.
  const mixer=new THREE.AnimationMixer(body),acts={};
  for(const n of names){const a=mixer.clipAction(makeClip(body,clips[n],true));a.setEffectiveWeight(0).play();
    if([...ONESHOT].some(k=>CLIPS[k]===n)){a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;}a.timeScale=0;acts[n]=a;}
  const weight=Object.fromEntries(names.map(n=>[n,0]));

  // Weapon grip: follows T5's tag_weapon_right, moved from T5's wrist onto the character's hand.
  const grip=new THREE.Object3D();grip.name='bo1_grip';H.sides.ri.hand.add(grip);
  const tag=T('tag_weapon_right')??T('j_wrist_ri'),tWrist=T('j_wrist_ri');

  // State shared with the action layer.
  const st={stance:'',prev:'',oneshot:null,oneshotT:0,phase:{},air:0,grounded:true,lastVy:0,holding:false,
    recoil:0,recoilV:0,flinchX:0,flinchXV:0,flinchZ:0,flinchZV:0,slap:0,slapV:0,melee:0,throw:0,pitch:0,
    env:{reload:0,drink:0,swap:0,sprint:0,ads:0},target:{reload:0,drink:0,swap:0,sprint:0,ads:0}};
  const spring=(x,v,freq,damp,dt)=>{v+=(freq*freq*(0-x)-2*damp*freq*v)*dt;return [x+v*dt,v];};
  const playOnce=(k)=>{st.oneshot=k;st.oneshotT=0;const a=acts[CLIPS[k]];a.reset();a.time=0;};
  const dirWeights=(f,sd)=>{const a=Math.atan2(sd,f),w=[Math.max(0,Math.cos(a)),Math.max(0,-Math.cos(a)),Math.max(0,Math.sin(a)),Math.max(0,-Math.sin(a))],s=w.reduce((x,y)=>x+y,0)||1;return w.map(x=>x/s);};

  const q=new THREE.Quaternion(),q2=new THREE.Quaternion(),v=new THREE.Vector3(),m4=new THREE.Matrix4(),X=new THREE.Vector3(1,0,0),Y=new THREE.Vector3(0,1,0),Z=new THREE.Vector3(0,0,1);
  function update(dt,speed=0,m={}){
    dt=Math.min(dt,.05);
    const grounded=m.grounded??true,f=m.forward??speed,sd=m.side??0;
    // ---- choose clip weights -------------------------------------------------------------
    const stance=st.stance,target={};
    const add=(n,w)=>{if(w>0)target[n]=(target[n]??0)+w;};
    if(stance!==st.prev){
      if(stance==='dive')playOnce('dive');
      else if(st.prev==='dive')playOnce('diveLand');
      else if(stance==='mantle')playOnce('mantle');
      st.prev=stance;
    }
    if(grounded&&!st.grounded&&stance!=='dive'&&stance!=='slide'&&st.lastVy<-150)playOnce(speed>120?'runLand':'land');
    if(!grounded&&st.grounded&&m.vy>100&&stance==='')playOnce(speed>120?'runJump':'jump');
    st.grounded=grounded;st.lastVy=m.vy??0;
    const moving=THREE.MathUtils.smoothstep(speed,8,45),dirs=dirWeights(f,sd),ads=st.env.ads>.5;
    const loop=(set,w,rate)=>{if(w<=0)return;const list=[CLIPS[set]].flat();
      st.phase[set]=((st.phase[set]??0)+dt*rate)%1;   // one phase per set, so the directions stay in step
      list.forEach((n,i)=>{add(n,w*(list.length>1?dirs[i]:1));acts[n].time=st.phase[set]*acts[n].getClip().duration;});};
    const gait=(set,w)=>{const d=[CLIPS[set]].flat().reduce((s,n)=>s+acts[n].getClip().duration,0)/[CLIPS[set]].flat().length;
      loop(set,w,THREE.MathUtils.clamp(speed/NOMINAL[set],.4,1.8)/d);};
    if(stance==='slide')loop('slide',1,1/acts[CLIPS.slide].getClip().duration);
    else if(stance==='prone'||stance==='dive'&&!st.oneshot){add(CLIPS.prone,1-moving);gait('crawl',moving);}
    else if(stance==='crouch'){add(ads?CLIPS.crouchAds:CLIPS.crouch,1-moving);gait('crouchRun',moving);}
    else{
      const sprint=st.env.sprint>.5&&f>0&&!ads;
      add(ads?CLIPS.ads:CLIPS.idle,1-moving);
      if(sprint)gait('sprint',moving);
      else{const r=ads?0:THREE.MathUtils.smoothstep(speed,95,165);gait('walk',moving*(1-r));gait('run',moving*r);}
    }
    // Idle loops just run.
    for(const k of ['idle','ads','crouch','crouchAds','prone'])acts[CLIPS[k]].time=(acts[CLIPS[k]].time+dt)%acts[CLIPS[k]].getClip().duration;
    // One-shots override the loops while they play.
    if(st.oneshot){
      const a=acts[CLIPS[st.oneshot]],d=a.getClip().duration;st.oneshotT+=dt;a.time=Math.min(d,st.oneshotT);
      const air=st.oneshot==='jump'||st.oneshot==='runJump';
      const hold=air&&!grounded;   // takeoff holds its last frame until landing
      const w=hold?1:THREE.MathUtils.clamp((d-st.oneshotT)/.15,0,1);
      for(const k in target)target[k]*=1-w;add(CLIPS[st.oneshot],w);
      if(!hold&&st.oneshotT>=d)st.oneshot=null;
    }
    // Ease the weights towards the targets, then normalise (the mixer fills a shortfall with the bind pose).
    let sum=0;for(const n of names){weight[n]+=((target[n]??0)-weight[n])*Math.min(1,dt*12);if(weight[n]<1e-3)weight[n]=0;sum+=weight[n];}
    for(const n of names)acts[n].setEffectiveWeight(sum>0?weight[n]/sum:n===CLIPS.idle?1:0);
    mixer.update(0);holder.updateMatrixWorld(true);

    // ---- action layer (springs and envelopes, as the procedural rigs) ---------------------
    [st.recoil,st.recoilV]=spring(st.recoil,st.recoilV,16,.42,dt);
    [st.flinchX,st.flinchXV]=spring(st.flinchX,st.flinchXV,10,.38,dt);[st.flinchZ,st.flinchZV]=spring(st.flinchZ,st.flinchZV,10,.38,dt);
    [st.slap,st.slapV]=spring(st.slap,st.slapV,14,.4,dt);
    for(const k in st.env)st.env[k]+=(st.target[k]-st.env[k])*Math.min(1,dt*(k==='swap'?14:k==='ads'?12:8));
    const {reload:rel,drink,swap}=st.env,R=st.recoil,me=st.melee,th=st.throw;
    const swing=me>0?(me<.35?-Math.sin(me/.35*Math.PI/2):Math.sin((me-.35)/.65*Math.PI)*1.2-(1-(me-.35)/.65)*.2):0;
    const toss=th>0?(th<.4?th/.4:1-(th-.4)/.6):0,release=th>.4?Math.sin((th-.4)/.6*Math.PI):0;
    // Aim pitch bends the torso with the camera (not while sprinting, sliding or prone).
    const pitchW=stance===''||stance==='crouch'?1-st.env.sprint:0;st.pitch+=((m.pitch??0)*pitchW-st.pitch)*Math.min(1,dt*10);
    // Additive rotations (character space, about the character's right/up/forward axes).
    const extra=new Map(),put=(b,axis,a)=>{if(!b||!a)return;const r=new THREE.Quaternion().setFromAxisAngle(axis,a);extra.set(b,(extra.get(b)??new THREE.Quaternion()).premultiply(r));};
    const chest=H.spine.at(-1)??H.hips,low=H.spine[0];
    put(low,X,-st.pitch*.35);put(chest,X,-st.pitch*.45-R*.08+st.flinchZ*.22+rel*.06-drink*.08);put(H.neck,X,-st.pitch*.2);
    put(chest,Y,swing*.45+toss*.3-release*.4);put(chest,Z,st.flinchX*.25);
    put(H.head,X,rel*.3-drink*.4+st.flinchZ*.2);put(H.head,Y,-swing*.2+rel*.12);
    const ri=H.sides.ri,le=H.sides.le;
    put(ri.arm,X,-R*.14+rel*.35+swap*.6-th*0+toss*-1.6+release*1.4-drink*1.1);put(ri.arm,Y,swing*.9);put(ri.fore,X,-drink*.9);
    put(le.arm,X,rel*.5-st.slap*.25+swap*.4);put(le.fore,X,rel*.3);

    // ---- retarget onto the character --------------------------------------------------------
    const hqi=holder.getWorldQuaternion(q2).invert(),hw=holder.getWorldQuaternion(new THREE.Quaternion());
    const acc=new Map();
    for(const o of order){
      const e=map.get(o);
      if(e||extra.has(o)){
        const parentAcc=acc.get(o.parent);
        const accum=(extra.get(o)?.clone()??new THREE.Quaternion());if(parentAcc)accum.multiply(parentAcc);acc.set(o,accum);
        // want (character space) = additive * T5 delta since bind * character bind
        let want;
        if(e)want=accum.clone().multiply(hqi.clone().multiply(e.t.getWorldQuaternion(q))).multiply(e.tBindInv).multiply(e.cBind);
        else{o.updateWorldMatrix(false,false);want=accum.clone().multiply(hqi.clone().multiply(o.getWorldQuaternion(q)));}
        const parent=hqi.clone().multiply(o.parent.getWorldQuaternion(q));
        o.quaternion.copy(parent.invert().multiply(want));
        if(o===H.hips){   // pelvis travel (bob, crouch, prone) from the driver, in character space
          v.copy(hipBind).add(holder.worldToLocal(wpos(e.t)).sub(rootBind));o.position.copy(o.parent.worldToLocal(holder.localToWorld(v)));
        }
      }else if(acc.has(o.parent))acc.set(o,acc.get(o.parent));
      o.updateWorldMatrix(false,false);
    }
    // Grip: T5's weapon tag relative to its wrist, carried by the character's hand.
    if(tag&&tWrist){
      m4.copy(tWrist.matrixWorld).invert().multiply(tag.matrixWorld);   // tag in T5 wrist space
      const e=map.get(ri.hand);
      // T5 wrist frame expressed in the character hand's frame (constant): cBind^-1 * tBind
      const rel=e.cBind.clone().invert().multiply(e.tBindInv.clone().invert());
      const hs=ri.hand.getWorldScale(v),ds=driver.getWorldScale(new THREE.Vector3());
      const frame=new THREE.Matrix4().compose(new THREE.Vector3(),rel,new THREE.Vector3(ds.x/hs.x,ds.y/hs.y,ds.z/hs.z));
      frame.multiply(m4);frame.decompose(grip.position,grip.quaternion,grip.scale);
    }
  }
  return {
    hand:grip,bo1:true,stanceAnimated:true,
    hold(value){st.holding=value;},setStance(s){st.stance=s;},
    act(kind,amount=1,dir){if(kind==='recoil')st.recoilV+=amount*12;if(kind==='slap')st.slapV+=amount*9;
      if(kind==='flinch'){st.flinchXV+=(dir?.x??0)*amount*9;st.flinchZV+=(dir?.z??-1)*amount*9;}},
    pose(values){for(const [k,val] of Object.entries(values)){if(k in st.target)st.target[k]=val;else st[k]=val;}},
    update,
  };
}
