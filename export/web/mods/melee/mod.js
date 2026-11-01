// The dedicated melee slot (2026-10-31, user: "add the dedicated melee in... make it feel like the bo6 and 7 knife"). Black Ops 7's
// controls: tap V stabs with the gun in hand, hold V draws the melee weapon (left mouse slashes, right mouse is a slow heavy stab, hold
// V, Q or a number goes back to the gun). Lives outside session.inventory, so it takes no gun slot: while it is out, session.weapon is
// this mod's own weapon, and it drops out by itself if the gun under it is replaced. Upgrades on its own, as the guns' do not reach it:
// Pack-a-Punch tiers I-III with the knife out (BO6/7's 5,000 / 15,000 / 30,000), which only raise its damage. Damage = the larger of a
// flat hit and a share of the round's zombie health, both × tier, so an upgraded knife keeps up with the rounds and a bare one falls off.
// Tier III is 20% of a zombie: five hits, and two with Melee Macchiato's ×3.
// Weapons are data (melee.json, picked in the loadout's MELEE slot): a new one is an entry there.
import * as THREE from 'three';
import { zombieHealth } from '../../rules.js';
import { loadProfile } from '../../profile.js';

// The knife's clips, built here from the game's own at load so no ripped clip is copied into the repo. at: a track's value at a frame.
function at(t,frame,n){
  let i=t.frames.findLastIndex(f=>f<=frame);if(i<0)i=0;const j=Math.min(i+1,t.frames.length-1),u=t.frames[j]>t.frames[i]?(frame-t.frames[i])/(t.frames[j]-t.frames[i]):0;
  const a=t.values.slice(i*n,i*n+n),b=t.values.slice(j*n,j*n+n),sign=n===4&&a.reduce((s,v,k)=>s+v*b[k],0)<0?-1:1,v=a.map((x,k)=>x+(sign*b[k]-x)*u),len=n===4?Math.hypot(...v):1;
  return v.map(x=>x/len);
}
// A resting pose: one frame of a clip with bones turned (degrees, local) and moved
function still(clip,{frame,turn={},move={}}){
  const bones=clip.bones.map(b=>{const o={...b};
    if(b.rot){o.rot={frames:[0],values:at(b.rot,frame,4)};const e=turn[b.name];
      if(e)o.rot.values=new THREE.Quaternion().fromArray(o.rot.values).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...e.map(THREE.MathUtils.degToRad)))).toArray();}
    if(b.pos){o.pos={frames:[0],values:at(b.pos,frame,3)};const m=move[b.name];if(m)o.pos.values=o.pos.values.map((v,i)=>v+m[i]);}
    return o;});
  return {...clip,name:clip.name+'-still',loop:true,duration:.0667,notifies:[],bones};
}
// A clip from a later frame on (the slash starts with the hand off the screen)
function from(clip,start){
  if(!start)return clip;
  const cut=(t,n)=>{if(t.frames.length<2)return t;const keep=t.frames.map((f,i)=>[f,i]).filter(([f])=>f>start);
    return {frames:[0,...keep.map(([f])=>f-start)],values:[...at(t,start,n),...keep.flatMap(([,i])=>t.values.slice(i*n,i*n+n))]};};
  return {...clip,name:clip.name+'-from'+start,duration:clip.duration-start/clip.fps,notifies:[],bones:clip.bones.map(b=>({...b,...(b.rot&&{rot:cut(b.rot,4)}),...(b.pos&&{pos:cut(b.pos,3)})}))};
}
const asUrl=clip=>URL.createObjectURL(new Blob([JSON.stringify(clip)],{type:'application/json'}));
const loadClip=url=>fetch(new URL(url,document.baseURI)).then(r=>r.json());

export default async function setup(api){
  const {host,session,data,player,camera,world,enemies,view,toast,equipView,melee,mod}=api;
  const C=await fetch(new URL('melee.json',mod.url)).then(r=>r.json());
  const choice=loadProfile().loadout?.melee,E=C.melees[choice]??C.melees[C.default],base=data.weapons[E.base];
  if(!base)return;
  const id='melee_'+(C.melees[choice]?choice:C.default);
  // A held weapon built on a knife-shaped gun: its arms and clips, none of its shooting
  const [pose,light]=await Promise.all([loadClip(E.pose.clip),loadClip(E.lightClip)]);
  const D=data.weapons[id]={...base,id,baseId:E.base,worldModel:E.worldModel??base.worldModel,heldKnife:E.held,mirror:E.mirror,animations:{idleAnim:asUrl(still(pose,E.pose)),meleeAnim:asUrl(from(light,E.lightFrom)),meleeChargeAnim:E.heavyClip},price:0,clipSize:1,startAmmo:0,maxAmmo:0,damage:0,minDamage:0,projectileType:'none',projectileSpeed:0,
    noAmmo:true,noAds:true,ownPackName:true,automatic:false,raiseTime:E.raiseTime,dropTime:E.dropTime,weight:.5,upgrade:{},
    melee:{meleeDamage:E.damage,meleeDelay:E.swingDelay,meleeChargeDelay:E.heavyDelay,meleeTime:E.swing,meleeChargeTime:E.heavy,meleeReach:E.reach,exact:true,fade:.05}};
  const fresh=()=>({id,mag:1,reserve:0,upgraded:false,papLevel:0});
  let K=fresh(),on=false,gun=null,pressAt=0,armed=false,held=false,adsWas=false,side=1;
  const now=()=>performance.now()/1000,inventorySlot=()=>session.inventory[session.slot];

  Object.defineProperty(session,'weapon',{configurable:true,get:()=>on&&inventorySlot()===gun?K:inventorySlot()});
  const label=tier=>[tier?E.upgradeName:E.name,C.tiers[tier].name].filter(Boolean).join(' ');
  const name=()=>{D.name=D.upgrade.name=label(K.papLevel);};
  name();
  const power=()=>C.tiers[K.papLevel].mul;
  const damage=()=>power()*Math.max(E.damage,C.roundShare*zombieHealth(session.round??1,data.rules));

  const free=()=>session.phase!=='reviving'&&session.phase!=='gameover'&&view.ready&&!session.drinking&&!session.meleeLeft&&!session.equipmentLeft&&!host.gunBlocked&&!window.kino?.operator?.active;
  const draw=()=>{if(on||!free()||session.pack?.weapon===K||inventorySlot()?.lost||session.pack?.weapon===inventorySlot())return;
    session.cancelReload?.();gun=inventorySlot();on=true;equipView();
    const s=window.kino?.fpMotion?.s;if(s)s.kickP.v-=4;};   // (no raise clip: the hand snaps up from under the frame)
  const holster=()=>{if(!on)return;on=false;session.cancelReload?.();equipView();};

  // The melee key: a tap stabs on release, so holding it can draw instead. Returning true tells the engine the mod has the key.
  host.meleeKey=down=>{
    if(down){if(!held){held=armed=true;pressAt=now();}return true;}   // (held: the keyboard's auto-repeat)
    held=false;
    if(armed&&now()-pressAt<C.holdTime){armed=false;if(on)swing(false);else melee();}
    return true;
  };
  host.meleeDamage=(d,heavy)=>Math.max(d,session.bowie?data.melee.bowie.damage:0,damage()*(on&&heavy?E.heavyMul:1));
  host.packLabel=session.packLabel=()=>{if(!on)return null;const t=C.tiers[K.papLevel+1];return t?`Pack-a-Punch ${E.name} tier ${t.name} · ${t.price}`:`${E.upgradeName} is fully upgraded`;};
  host.warmWeaponIds=()=>[id];

  function swing(heavy){
    if(session.meleeLeft>0)return;
    const z=lungeTarget();if(!melee(heavy))return;
    const s=window.kino?.fpMotion?.s;if(s){side=-side;s.kickY.v+=side*(heavy?2:5);s.kickP.v+=heavy?3:1;}
    if(z){const to=z.root.position.clone().sub(camera.position).setY(0),d=to.length(),v=Math.min(1100,(d-55)/.12);
      if(v>0){to.normalize();player.velocity.set(to.x*v,Math.max(player.velocity.y,70),to.z*v);player.onFloor=player.grounded=false;}}
  }
  function lungeTarget(){
    const dir=camera.getWorldDirection(new (camera.position.constructor)());let best=null,bd=E.lunge;
    for(const z of enemies.list){const at=z.root.position.clone();at.y+=z.kind==='zombie'?45:22;const to=at.clone().sub(camera.position),d=to.length();
      if(d<bd&&d>60&&to.normalize().dot(dir)>.82&&world.lineClear(camera.position,at)){best=z;bd=d;}}
    return best;
  }

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

  host.on('update',()=>{
    K.lost=false;K.mag=1;   // (the machine marks what it keeps too long as lost; the knife comes back to you)
    if(armed&&now()-pressAt>=C.holdTime){armed=false;if(on)holster();else draw();}
    if(on&&(inventorySlot()!==gun||session.phase==='reviving'||host.gunBlocked||window.kino?.operator?.active)){holster();return;}
    const i=view.input??{},fire=!!i.fire,ads=!!i.ads;
    if(on&&!session.weaponUnavailable&&!session.drinking){if(fire)swing(false);else if(ads&&!adsWas)swing(true);}
    adsWas=ads;
  });
  host.on('reset',()=>{K=fresh();on=false;gun=null;armed=held=false;name();});
}
