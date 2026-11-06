// The dedicated melee slot (2026-10-31, user: "add the dedicated melee in... make it feel like the bo6 and 7 knife"). Black Ops 7's
// controls: tap V bashes with the gun in hand (the knife stays away; a bought Bowie still swings), hold V draws the melee weapon (left
// mouse or a tap of V slashes, right mouse or aim + V is a slow heavy stab, hold V, Q or a number goes back to the gun). The swings are
// clips of the arm's joints built over the resting hand, the draw and the bash poses of the view (motion.js). Lives outside session.inventory, so it takes no gun slot: while it is out, session.weapon is
// this mod's own weapon, and it drops out by itself if the gun under it is replaced. Upgrades on its own, as the guns' do not reach it:
// Pack-a-Punch tiers I-III with the knife out (BO6/7's 5,000 / 15,000 / 30,000), which only raise its damage. Damage = the larger of a
// flat hit and a share of the round's zombie health, both × tier, so an upgraded knife keeps up with the rounds and a bare one falls off.
// Bare it is 10% of a zombie (ten slashes), tier III 60% (two, or one heavy stab). The gun bash (tap V) gets none of this since
// 2026-11-04 (user: "make the knife stronger than just the basic melee ... make it scale higher than just pressing v"): the
// old knife's flat hit or 3% of a zombie (bashShare), never the tiers.
// Weapons are data (melee.json, picked in the loadout's MELEE slot): a new one is an entry there.
import * as THREE from 'three';
import { zombieHealth } from '../../rules.js';
import { loadProfile } from '../../profile.js';
import { weaponClass } from '../weapon-levels/camo.js';
import { sample, apply, swingClip, SHOULDER, CAMERA, SLASH, BACKSLASH, STAB, DRAW, PUTAWAY, LOWER, bashKeys } from './motion.js';

// The knife's resting pose, built here from the game's own clip at load so no ripped clip is copied into the repo. at: a track's value at a frame.
function at(t,frame,n){
  let i=t.frames.findLastIndex(f=>f<=frame);if(i<0)i=0;const j=Math.min(i+1,t.frames.length-1),u=t.frames[j]>t.frames[i]?(frame-t.frames[i])/(t.frames[j]-t.frames[i]):0;
  const a=t.values.slice(i*n,i*n+n),b=t.values.slice(j*n,j*n+n),sign=n===4&&a.reduce((s,v,k)=>s+v*b[k],0)<0?-1:1,v=a.map((x,k)=>x+(sign*b[k]-x)*u),len=n===4?Math.hypot(...v):1;
  return v.map(x=>x/len);
}
// A resting pose: one frame of a clip with bones turned (degrees, local) and moved
// from: other clips for some bones (pose.from in melee.json: {clip,frame,bones} with bones a regex), e.g. an open hand from a throw's
// release frame for the guard hand, since the knife idle's free hand grips a gun
function still(clip,{frame,turn={},move={}},from=[]){
  const bones=clip.bones.map(b=>{const o={...b},f=from.find(x=>x.re.test(b.name)),src=f?.clip.bones.find(x=>x.name===b.name);
    if(src){if(src.rot)b={...b,rot:src.rot};if(src.pos)b={...b,pos:src.pos};}const fr=src?f.frame:frame;
    if(b.rot){o.rot={frames:[0],values:at(b.rot,fr,4)};const e=turn[b.name];
      if(e)o.rot.values=new THREE.Quaternion().fromArray(o.rot.values).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...e.map(THREE.MathUtils.degToRad)))).toArray();}
    if(b.pos){o.pos={frames:[0],values:at(b.pos,fr,3)};const m=move[b.name];if(m)o.pos.values=o.pos.values.map((v,i)=>v+m[i]);}
    return o;});
  return {...clip,name:clip.name+'-still',loop:true,duration:.0667,notifies:[],bones};
}
const asUrl=clip=>URL.createObjectURL(new Blob([JSON.stringify(clip)],{type:'application/json'}));
const loadClip=url=>fetch(new URL(url,document.baseURI)).then(r=>r.json());

// soon: in melee.json but not out yet (the battlepass hands it out later); localStorage['kino.dev.soon']='1' lifts it, as for the classes
export const soon=m=>!!m?.soon&&(()=>{try{return localStorage.getItem('kino.dev.soon')!=='1';}catch{return true;}})();
// Melee entries with a model of their own (melee.json `model`, the Grave Bell) are weapons from the start: prepare() puts them in
// data.weapons before the other mods build anything, so weapon levels, attachments (the Gunsmith), camos and prestige treat them
// as guns. They hang their model from the knife's attach tag (def.gunTag) in place of the knife, and a `script` gives them their
// own behaviour (hooks below). The knife has neither and plays exactly as before.
const ownDef=(key,E,base)=>({...structuredClone(base),id:'melee_'+key,baseId:base.baseId??base.id,name:E.name,model:E.model,worldModel:E.worldModel,worldScale:E.worldScale??1,
  hideTags:[...(E.hideTags??[])],weaponClass:'Melee',meleeSlot:key,meleeXp:true,gunsmith:true,noBox:true,soon:!!E.soon,slotNames:E.slotNames,killCauses:E.killCauses??[],
  price:0,clipSize:1,startAmmo:0,maxAmmo:0,damage:0,minDamage:0,projectileType:'none',projectileSpeed:0,noAmmo:true,noAds:true,ownPackName:true,automatic:false,
  upgrade:{name:E.upgradeName}});
export async function prepare(data,mod){
  const C=await fetch(new URL('melee.json',mod.url)).then(r=>r.json());
  for(const [key,E] of Object.entries(C.melees)){const base=data.weapons?.[E.base];if(E.model&&base)data.weapons['melee_'+key]=ownDef(key,E,base);}
  return data;
}
export default async function setup(api){
  const {host,session,data,player,camera,world,enemies,view,toast,equipView,melee,mod}=api;
  const C=await fetch(new URL('melee.json',mod.url)).then(r=>r.json());
  const pick=loadProfile().loadout?.melee,choice=C.melees[pick]&&!soon(C.melees[pick])?pick:C.default,E=C.melees[choice],base=data.weapons[E.base];   // a soon melee (battlepass, not out yet) falls back to the default
  if(!base)return;
  const id='melee_'+choice;
  // A held weapon built on a knife-shaped gun: its arms and clips, none of its shooting
  const from=await Promise.all((E.pose.from??[]).map(async f=>({re:new RegExp(f.bones),clip:await loadClip(f.clip),frame:f.frame})));
  const pose=still(await loadClip(E.pose.clip),E.pose,from),rest=asUrl(pose);
  // grip: the knife turned in the hand (degrees about the attach tag's axes; [0,0,0] = as the tag holds it, which with the palm-down
  // fist of the rest pose is the BO6/7 reverse grip, the blade out of the pinky side, the pommel under the thumb; [0,180,0] puts the
  // blade out of the thumb side), applied over animation.js's attach while this knife is out, undone for the gun bashes' knife
  const GRIP=E.grip&&new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...E.grip.map(THREE.MathUtils.degToRad)));
  // plus, on a character's own retargeted arms (fp-arms.js knifeShift), the move that puts the handle in that character's fist
  const shiftM=new THREE.Matrix4();
  // own model: it is the view's gun (hung from tag_knife_attach), held the same way; FLIP turns it the right way out again under the
  // mirrored hands (the knife is symmetric, the bell's lettering is not)
  const FLIP=new THREE.Matrix4().makeScale(1,1,-1);
  const grip=()=>{const k=E.model?(view.def?.id===id?view.gun:null):view.knives?.[E.held];if(!k)return;const u=k.userData;u.attachMatrix??=k.matrix.clone();
    if(E.model&&on){k.matrix.copy(u.attachMatrix);if(GRIP)k.matrix.premultiply(GRIP);const sh=view.hands?.userData.fpArmsSkeleton?.knifeShift;if(sh)k.matrix.premultiply(shiftM.makeTranslation(sh.x,sh.y,sh.z));if(E.mirror)k.matrix.multiply(FLIP);return;}
    const sh=view.hands?.userData.fpArmsSkeleton?.knifeShift;
    if(on){k.matrix.copy(u.attachMatrix);if(GRIP)k.matrix.premultiply(GRIP);if(sh)k.matrix.premultiply(shiftM.makeTranslation(sh.x,sh.y,sh.z));u.gripped=true;}
    else if(u.gripped){k.matrix.copy(u.attachMatrix);u.gripped=false;}};
  const swings=E.swings==='still'?{meleeAnim:rest,backslashAnim:rest}:{meleeAnim:asUrl(swingClip(pose,SLASH)),backslashAnim:asUrl(swingClip(pose,BACKSLASH))};   // still: the script moves the arm (the bell's ring)
  const own={mirror:E.mirror,armPump:true,animations:{idleAnim:rest,...swings,meleeChargeAnim:asUrl(swingClip(pose,STAB))},raiseTime:E.raiseTime,dropTime:E.dropTime,weight:E.weight??.5,
    melee:{meleeDamage:E.damage,meleeDelay:E.swingDelay,meleeChargeDelay:E.heavyDelay,meleeTime:E.swing,meleeChargeTime:E.heavy,meleeReach:E.reach,exact:true,fade:.05}};
  // own model: the prepared def (weapon-levels already fitted its attachments to that object, keep it); the knife: built here
  const D=E.model?data.weapons[id]:data.weapons[id]={...base,id,baseId:E.base,worldModel:E.worldModel??base.worldModel,heldKnife:E.held,price:0,clipSize:1,startAmmo:0,maxAmmo:0,damage:0,minDamage:0,projectileType:'none',projectileSpeed:0,
    noAmmo:true,noAds:true,ownPackName:true,automatic:false,upgrade:{}};
  if(!D)return;
  Object.assign(D,own);if(E.model){D.gunTag='tag_knife_attach';delete D.heldKnife;}
  const meleeBase={...D.melee};
  const fresh=()=>({id,mag:1,reserve:0,upgraded:false,papLevel:0});
  let K=fresh(),on=false,gun=null,pressAt=0,armed=false,held=false,adsWas=false,side=-1;
  const now=()=>performance.now()/1000,inventorySlot=()=>session.inventory[session.slot];

  Object.defineProperty(session,'weapon',{configurable:true,get:()=>on&&inventorySlot()===gun?K:inventorySlot()});
  const label=tier=>[tier?E.upgradeName:E.name,C.tiers[tier].name].filter(Boolean).join(' ');
  const name=()=>{D.name=D.upgrade.name=label(K.papLevel);};
  name();
  const power=()=>C.tiers[K.papLevel].mul;
  const damage=()=>power()*Math.max(E.damage,C.roundShare*zombieHealth(session.round??1,data.rules));
  // The entry's own behaviour (melee.json `script`, e.g. grave-bell.js), a module whose default export takes ctx and returns hooks:
  // tune(melee): adjust the swing's numbers (D.melee, reset to melee.json's before each swing); swing(heavy) after a swing starts,
  // may return {keys} (a pivot pose, motion.js) and {lunge:false}; clip(heavy): a clip key to play in place of the swing's;
  // update(dt) every frame; reset() on a new game. has(tag): an attachment's tag is shown (fitted).
  const hooks=E.script?(await import(new URL(E.script,mod.url).href)).default({api,E,C,D,id,isOn:()=>on,damage,power,play:keys=>play(keys,true),has:t=>!D.hideTags?.includes(t)}):null;

  const free=()=>session.phase!=='reviving'&&session.phase!=='gameover'&&view.ready&&!session.drinking&&!session.meleeLeft&&!session.equipmentLeft&&!host.gunBlocked&&!window.kino?.operator?.active;
  // The pivot pose running now, added by the motion layer after its own (fp.js). keys: motion.js; knife: about the knife arm's shoulder, else about the camera
  let anim=null,lowering=null,raising=false;
  const play=(keys,knife=true,end=keys.at(-1)[0],hold=false)=>{anim={keys,knife,end,hold,t:0};};
  const strike=(P,R,c)=>{
    window.kino.fpMotion.armsBusy=!!anim;   // (fp.js's per-arm idle/sprint layer steps aside for a swing, draw or holster)
    if(!anim)return;
    const {keys,knife}=anim,t=(anim.t+=c.dt);
    apply(P,R,sample(keys,t),knife?SHOULDER:CAMERA.map(x=>x*c.rig),knife?1:c.rig);
    if(t>=anim.end&&!anim.hold)anim=null;
  };
  // Out with the gun, in with the knife: the hand in view goes down first, and the swap happens under the frame
  const usable=()=>!on&&free()&&session.pack?.weapon!==K&&!inventorySlot()?.lost&&session.pack?.weapon!==inventorySlot();
  const draw=()=>{if(!usable()||lowering)return;session.cancelReload?.();lowering={at:now()+LOWER.at(-1)[0],to:'knife'};play(LOWER,false,undefined,true);};
  const holster=(quick)=>{if(!on||lowering)return;session.cancelReload?.();if(quick){drop();return;}lowering={at:now()+PUTAWAY.at(-1)[0],to:'gun'};play(PUTAWAY,true,undefined,true);};
  const drop=()=>{on=false;lowering=null;anim=null;equipView();};
  const landed=()=>{const to=lowering.to;lowering=null;
    if(to==='gun'){if(on)drop();return;}
    anim=null;if(!usable())return;gun=inventorySlot();on=true;side=-1;equipView();raising=true;};

  // The melee key: a tap acts on release, so holding it can draw instead. Returning true tells the engine the mod has the key.
  host.meleeKey=down=>{
    if(down){if(!held){held=armed=true;pressAt=now();}return true;}   // (held: the keyboard's auto-repeat)
    held=false;
    if(armed&&now()-pressAt<C.holdTime){armed=false;if(on)swing(!!view.input?.ads);else melee();}
    return true;
  };
  host.meleeDamage=(d,heavy)=>Math.max(d,session.bowie?data.melee.bowie.damage:0,on?damage()*(heavy?E.heavyMul:E.lightMul??1):C.bashShare*zombieHealth(session.round??1,data.rules));
  host.packLabel=session.packLabel=()=>{if(!on)return null;const t=C.tiers[K.papLevel+1];return t?`Pack-a-Punch ${E.name} tier ${t.name} · ${t.price}`:`${E.upgradeName} is fully upgraded`;};
  host.warmWeaponIds=()=>[id];

  function swing(heavy){
    if(session.meleeLeft>0)return;
    if(lowering)return;
    hooks?.tune?.(Object.assign(D.melee,meleeBase));   // (in place: an upgraded view def is a copy that shares this object)
    const z=lungeTarget();side=heavy?side:-side;if(!melee(heavy))return;
    const r=hooks?.swing?.(heavy);if(r?.keys)play(r.keys,true);
    const s=window.kino?.fpMotion?.s;if(s){s.kickY.v+=side*(heavy?2:5);s.kickP.v+=heavy?3:1;}
    if(z&&r?.lunge!==false){const to=z.root.position.clone().sub(camera.position).setY(0),d=to.length(),v=Math.min(1100,(d-55)/.12);
      if(v>0){to.normalize();player.velocity.set(to.x*v,Math.max(player.velocity.y,70),to.z*v);player.onFloor=player.grounded=false;}}
  }
  function lungeTarget(){
    const dir=camera.getWorldDirection(new (camera.position.constructor)());let best=null,bd=E.lunge;
    for(const z of enemies.list){const at=z.root.position.clone();at.y+=z.kind==='zombie'?45:22;const to=at.clone().sub(camera.position),d=to.length();
      if(d<bd&&d>60&&to.normalize().dot(dir)>.82&&world.lineClear(camera.position,at)){best=z;bd=d;}}
    return best;
  }

  // A tap with a gun in hand is a bash: the gun stays, on the old knife's timing and damage. The Bowie is bought for its swing, a
  // gun with its own melee clip keeps that clip, and the knife out goes through the engine's def.melee path.
  const swingView=view.melee;
  view.melee=function(type='knife',charge=false){
    if(this.def?.melee){const r=swingView.call(this,type,charge);if(r&&!charge&&side<0)this.rig.play('backslashAnim',false,this.clipSpeed('backslashAnim',r.duration),this.def.melee.fade);
      const k=r&&hooks&&this.def.id===id?hooks.clip?.(charge):null;if(k)this.rig.play(k,false,this.clipSpeed(k,r.duration),this.def.melee.fade);
      return r;}   // every other slash comes back the other way
    if(type!=='knife')return swingView.call(this,type,charge);
    if(!this.ready||this.meleeLeft>0)return null;
    const d=data.melee.knife,key='knife:'+(charge?'meleeChargeAnim':'meleeAnim'),duration=Math.max(charge?d.chargeTime:d.time,(this.meleeRig??this.rig).data[key]?.duration??0);
    this.meleeType=null;this.meleeLeft=duration;this.mode='melee';this.aim=0;this.rig.play('idleAnim',true,1,.08);
    play(bashKeys(short(this.def),Math.min(duration,.62)),false);
    return {duration,delay:charge?d.chargeDelay:d.delay,damage:d.damage};
  };
  const short=def=>!!def?.dualWield||weaponClass(def)==='Pistol';

  // A held knife never fires; its own buttons are read below
  for(const m of ['fire','fireHand']){const f=session[m];if(f)session[m]=function(...a){return on?false:f.apply(this,a);};}
  const sw=session.switchWeapon;session.switchWeapon=function(slot){if(!on)return sw.call(this,slot);if(this.drinking||this.meleeLeft>0)return;on=false;if(slot!=null)sw.call(this,slot);};
  const give=session.giveWeapon;session.giveWeapon=function(...a){on=false;return give.apply(this,a);};

  // Pack-a-Punch takes the knife like a gun (empty hands while it is in the machine), at the tier's own price
  const begin=session.beginPack,take=session.takePack;
  session.beginPack=function(){
    if(!on)return begin.call(this);
    const t=C.tiers[K.papLevel+1];if(!t||this.pack||this.busy||this.phase==='reviving'||this.power===false||!this.spend(t.price))return false;
    this.cancelReload?.();const pad=this.time;this.pack={weapon:K,readyAt:pad+4.35,expires:pad+19.35};D.upgrade.name=label(K.papLevel+1);return true;
  };
  session.takePack=function(){
    if(this.pack?.weapon!==K)return take.call(this);
    if(this.busy||this.time<this.pack.readyAt||this.time>=this.pack.expires)return false;
    K.papLevel++;K.upgraded=true;this.pack=null;name();
    if(!on){gun=inventorySlot();on=true;}
    return true;
  };

  for(const key of ['moveSpeed','sprintSpeed']){
    const d=Object.getOwnPropertyDescriptor(player,key);let b=player[key];
    Object.defineProperty(player,key,{configurable:true,get:()=>(d?.get?d.get():b)*(on?E[key]:1),set:v=>{if(d?.set)d.set(v);else b=v;}});
  }

  host.on('update',dt=>{
    hooks?.update?.(dt||0);
    K.lost=false;K.mag=1;   // (the machine marks what it keeps too long as lost; the knife comes back to you)
    const fm=window.kino?.fpMotion;if(fm&&fm.strike!==strike)fm.strike=strike;
    grip();
    if(armed&&now()-pressAt>=C.holdTime){armed=false;if(on)holster();else draw();}
    if(lowering&&now()>=lowering.at)landed();
    if(raising&&on&&view.ready&&view.def===D){raising=false;play(DRAW);}
    if(on&&(inventorySlot()!==gun||session.phase==='reviving'||host.gunBlocked||window.kino?.operator?.active)){holster(true);return;}
    const i=view.input??{},fire=!!i.fire,ads=!!i.ads;
    if(on&&!session.weaponUnavailable&&!session.drinking){if(fire)swing(false);else if(ads&&!adsWas)swing(true);}
    adsWas=ads;
  });
  host.on('reset',()=>{K=fresh();on=false;gun=null;armed=held=false;lowering=anim=null;raising=false;name();hooks?.reset?.();});
}
