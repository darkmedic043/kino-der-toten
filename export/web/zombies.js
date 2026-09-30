// Zombies on custom maps (not part of upstream). A trimmed copy of game.js's
// loop running on CustomWorld; Kino-only systems (teleporter, film reels,
// traps, Easter eggs) are left out. Open zombies.html?map=<id>.
import * as THREE from 'three';
import { PlayerController } from './player-controller.js';
import { CustomWorld } from './custom-world.js';
import { ViewWeapon } from './animation.js';
import { Enemies } from './enemies.js';
import { KinoSession as Session } from './kino-session.js';
import { KinoFeatures } from './kino-features.js';
import { GameAudio } from './audio.js';
import { Powerups } from './powerups.js';
import { PerkDrink } from './perk-drink.js';
import { MysteryBox } from './mystery-box.js';
import { createZombieTouch } from './zombies-touch.js';
import { configureKinoAssets, assetDiagnostics } from './runtime-assets.js';
import { loadModel, loadAnimation } from './animation.js';
import { ModHost } from './mod-loader.js';
import { settings } from './settings.js';
import { installGameMenu } from './game-menu.js';

// Projectiles, Claymores and Monkey Bombs without Kino's reels and screen.
class MapFeatures extends KinoFeatures {
  async load(){
    const defs=[...Object.values(this.data.weapons).flatMap(d=>[d,d.upgrade,d.upgrade?.attachment]),...Object.values(this.data.equipment)];
    const urls=new Set(defs.filter(Boolean).flatMap(d=>[d.projectileModel,d.worldModel]).filter(Boolean));
    await Promise.all([...urls].map(async url=>this.models.set(url,await loadModel(url))));
    if(this.data.animations.o_monkey_bomb)this.monkeyAnimation=await loadAnimation(this.data.animations.o_monkey_bomb);
    this.reelModels=new Map();this.screen={visible:false,material:{opacity:0}};this.filmAtlas={offset:{set(){}}};
    this.enemies.lureTarget=z=>this.lureTarget(z);this.reset();
  }
}

const vector=a=>new THREE.Vector3().fromArray(a);
const $=id=>document.getElementById(id), keys=new Set(),audio=new GameAudio(),mods=new ModHost();
const profile=configureKinoAssets();
audio.maxBufferBytes=profile.mobile?16*1024*1024:Infinity;audio.preload=!profile.mobile;
const renderer=new THREE.WebGLRenderer({antialias:!profile.mobile,powerPreference:profile.mobile?'default':'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,profile.mobile?1:1.5));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;
let previous=performance.now(),lastRendered=0,renderedFrames=0,contextLost=false,resizeTimer;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.6;renderer.autoClear=false;
document.body.prepend(renderer.domElement);
installGameMenu({renderer,audio,pixelRatio:Math.min(devicePixelRatio,profile.mobile?1:1.5),started:()=>started&&session?.phase!=='gameover'});
const scene=new THREE.Scene();scene.background=new THREE.Color(0x101319);
const ambient=new THREE.AmbientLight(0xb3bcc7,1.2);scene.add(ambient,new THREE.HemisphereLight(0xd2d9e3,0x574236,2.0));
const keyLight=new THREE.DirectionalLight(0xffdfb1,1.5);keyLight.position.set(.4,1,.2);scene.add(keyLight);
const fill=new THREE.DirectionalLight(0x8cabc9,.7);fill.position.set(-1,.5,-.5);scene.add(fill);
const camera=new THREE.PerspectiveCamera(78,innerWidth/innerHeight,1,30000);camera.rotation.order='YXZ';
const viewScene=new THREE.Scene(),viewCamera=new THREE.PerspectiveCamera(51,innerWidth/innerHeight,.01,200);   // BO1 cg_fov 65 on 4:3 = 50.9° vertical; wider showed the viewmodels unseen, stretched rear faces
viewScene.add(new THREE.AmbientLight(0xe1d9c7,2.8));const vl=new THREE.DirectionalLight(0xffefc8,2);vl.position.set(0,4,2);viewScene.add(vl);
const muzzle=new THREE.PointLight(0xffc276,0,240,1);scene.add(muzzle);
let entry,data,world,session,player,enemies,view,powerups,perkDrink,mysteryBox,features,ready=false,active=false,started=false,primary=false,primaryPressed=false,ads=false;
let prompt=null,promptText='',toastUntil=0,announcementUntil=0,hitUntil=0,flashUntil=0;
let baseFog=0,lastPhase='',lastRound=0,frameTime=0,frameCount=0,fps=0,debugVisible=false,repairLeft=0,burstLeft=0,teleportPending=null,returnTrip=null;
const particles=[],grenades=[];
const perkInfo={specialty_quickrevive:{name:'Quick Revive',price:500,color:'#509ebc',icon:'QR'},specialty_fastreload:{name:'Speed Cola',price:3000,color:'#478450',icon:'SC'},specialty_rof:{name:'Double Tap',price:2000,color:'#b37528',icon:'DT'},specialty_armorvest:{name:'Juggernog',price:2500,color:'#a53835',icon:'J'}};
const powerupNames={nuke:'Nuke',insta_kill:'Insta-Kill',double_points:'Double Points',full_ammo:'Max Ammo',carpenter:'Carpenter',fire_sale:'Fire Sale'};
const errors=[];
let lastShot=null;
let pendingMelee=null,lastReloadSerial=0,reloadShot=false;
let mousePrimary=false,mouseAim=false;
const touchControls=createZombieTouch({
  onLook:(x,y,sensitivity)=>{
    if(!active||session.phase==='reviving')return;
    const scale=.005*sensitivity*(ads?.5:1);
    camera.rotation.y-=x*scale;camera.rotation.x=THREE.MathUtils.clamp(camera.rotation.x-y*scale,-1.5,1.5);
  },
  onAction:action=>{
    if(!active||session.phase==='reviving')return;
    if(action==='reload')reload();if(action==='melee')melee();if(action==='grenade')throwGrenade();if(action==='use')interact();
    if(action==='weapon'){session.switchWeapon();equipView();}
    if(action==='claymore')features.placeClaymore();if(action==='equipment')features.throwMonkey();
    if(action==='attachment'&&session.toggleAttachment())equipView();
  },
  onPause:()=>{setActive(false);document.exitPointerLock?.();},
});
addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
function progress(text,percent){$('load-label').textContent=text;$('load-progress').style.width=percent+'%';}
function toast(text,duration=2.5){$('toast').textContent=text;toastUntil=(session?.time??0)+duration;}
function announce(title,small=entry?.title?.toUpperCase()??'ZOMBIES',duration=4){$('announcement-title').textContent=title;$('announcement-small').textContent=small;$('announcement').style.opacity=1;announcementUntil=session.time+duration;}
function setActive(value){
  active=!!value&&ready&&session.phase!=='gameover';$('menu').hidden=active;document.body.classList.toggle('menu-open',!active);keys.clear();primary=false;primaryPressed=false;ads=false;reloadShot=false;
  mousePrimary=mouseAim=false;touchControls.reset();touchControls.setEnabled(active&&session.phase!=='reviving',active);
  if(active&&audio.ctx)audio.start();else if(!active)audio.pause();
  if(active){if(!started){started=true;announce('Round 1','SURVIVE');audio.play('round');mods.emit('start');}else if(session.phase==='preparing')announce('Round '+session.round,'PREPARE YOURSELF');}
  else if(started&&session.phase!=='gameover'){$('start').innerHTML='RESUME GAME <span>→</span>';$('restart').hidden=false;$('menu-status').textContent='Paused · Round '+session.round;}
}
function start(){if(!ready||contextLost)return;if(session.phase==='gameover')reset();audio.start();warmViewAudio();if(touchControls.mode){setActive(true);return;}renderer.domElement.requestPointerLock?.()?.catch(()=>toast('Click the game to capture the mouse'));}
$('start').addEventListener('click',start);$('restart').addEventListener('click',()=>{reset();start();});
renderer.domElement.addEventListener('click',()=>{if(!active)start();});
document.addEventListener('pointerlockchange',()=>{if(touchControls.mode&&!document.pointerLockElement)return;setActive(document.pointerLockElement===renderer.domElement);});
function suspendRendering(){renderer.setAnimationLoop(null);if(ready){setActive(false);document.exitPointerLock?.();}audio.pause();}
function resumeRendering(){previous=performance.now();lastRendered=0;if(!document.hidden&&!contextLost)renderer.setAnimationLoop(renderFrame);}
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspendRendering();else resumeRendering();});
addEventListener('pagehide',suspendRendering);addEventListener('pageshow',resumeRendering);
renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();contextLost=true;suspendRendering();$('start').disabled=true;$('menu-status').textContent='Graphics paused. Waiting for the browser to restore the game…';});
renderer.domElement.addEventListener('webglcontextrestored',()=>{contextLost=false;$('start').disabled=!ready;$('menu-status').textContent='Graphics restored · click to resume';resumeRendering();});
addEventListener('blur',()=>{keys.clear();primary=false;ads=false;if(started&&active){setActive(false);document.exitPointerLock?.();}});
addEventListener('mousemove',e=>{if(!active||document.pointerLockElement!==renderer.domElement)return;const sensitivity=(ads?.0012*settings.adsSensitivity:.002)*settings.sensitivity;camera.rotation.y-=e.movementX*sensitivity;camera.rotation.x=THREE.MathUtils.clamp(camera.rotation.x-e.movementY*sensitivity*(settings.invertY?-1:1),-1.5,1.5);});
addEventListener('mousedown',e=>{if(!active||e.sourceCapabilities?.firesTouchEvents||e.target.closest('#touch-controls'))return;if(e.button===0){mousePrimary=primary=true;primaryPressed=true;}if(e.button===2)mouseAim=ads=true;});
addEventListener('mouseup',e=>{if(e.sourceCapabilities?.firesTouchEvents)return;if(e.button===0)mousePrimary=primary=false;if(e.button===2)mouseAim=ads=false;});
addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('keydown',e=>{
  if(['Space','Tab','F3'].includes(e.code))e.preventDefault();
  keys.add(e.code);if(e.repeat||!active)return;
  if(e.code==='KeyR')reload();if(e.code==='KeyV')melee();if(e.code==='KeyG')throwGrenade();if(e.code==='KeyF'||e.code==='KeyE')interact();
  if(e.code==='Digit4')features.placeClaymore();if(e.code==='KeyX')features.throwMonkey();
  if(e.code==='Digit5'&&session.toggleAttachment())equipView();
  if(e.code==='Digit1'||e.code==='Digit2'){session.switchWeapon(e.code==='Digit1'?0:1);equipView();}
  if(e.code==='KeyQ'){session.switchWeapon();equipView();}
  if(e.code==='KeyM'){audio.enabled=!audio.enabled;toast(audio.enabled?'Sound on':'Sound off');}
  if(e.code==='F3'){debugVisible=!debugVisible;$('debug').hidden=!debugVisible;}
  if(e.code==='Escape'){setActive(false);document.exitPointerLock?.();}
});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('wheel',()=>{if(active){session.switchWeapon();equipView();}});
addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{const width=innerWidth,height=innerHeight;camera.aspect=viewCamera.aspect=width/height;camera.updateProjectionMatrix();viewCamera.updateProjectionMatrix();renderer.setSize(width,height);},profile.mobile?150:0);});

function damage(n){
  if(!session.damage(n))return;audio.play('hit');
  if(!session.drinking)perkDrink?.stop();
  if(session.phase==='gameover'){
    primary=false;ads=false;setActive(false);document.exitPointerLock?.();$('start').innerHTML='TRY AGAIN <span>→</span>';$('restart').hidden=true;
    $('menu-status').textContent='You survived '+session.round+' rounds';$('results').hidden=false;$('results').textContent=session.kills+' kills · '+session.headshots+' headshots · '+Math.floor(session.time/60)+'m '+Math.floor(session.time%60)+'s';
    if(!globalThis.kino?.cheats?.used)try{const key='kino.best.'+entry.id,best=Math.max(session.round,+(localStorage.getItem(key)||0));localStorage.setItem(key,String(best));}catch{}
  }else if(session.phase==='reviving')announce('A second chance','QUICK REVIVE',4);
}
function effect(position,color=0x9e3023,count=7){
  for(let i=0;i<count;i++){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(1.5,1.5,1.5),new THREE.MeshBasicMaterial({color}));mesh.position.copy(position);scene.add(mesh);
    particles.push({mesh,velocity:new THREE.Vector3((Math.random()-.5)*100,Math.random()*90,(Math.random()-.5)*100),life:.45+Math.random()*.3});
  }
}
function hit(z,head){hitUntil=session.time+.12;$('hitmarker').style.color=head?'#db5140':'#eee';effect(head?enemies.headPosition(z):z.root.position.clone().add(new THREE.Vector3(0,z.kind==='zombie'?42:25,0)));}
function kill(z,force,position){
  if(force){powerups.spawn(force,position??player.getFeetPosition());return;}
  if(z){const type=session.drops.tryDrop(session,{kind:z.kind,playable:z.state!=='barricade',destroyedWindows:world.barriers.filter(b=>b.boards.length&&b.count===0).length,boxMoves:mysteryBox.moves});if(type)powerups.spawn(type,z.root.position);}
}
function collect(type){
  if(!powerupNames[type])return;
  session.powerup(type);toast(powerupNames[type],3);audio.event('powerup/grab/grab_00',.75);
  audio.play(type);
  if(type==='full_ammo')audio.event('powerup/max_ammo/max_ammo_00',.7);
  if(type==='nuke'){flashUntil=session.time+.8;audio.event('nuke/nuke_flash',.8);enemies.nuke(z=>effect(z.root.position,0xc7dba4));}
  if(type==='carpenter'){for(const b of world.barriers)world.setBoards(b,b.boards.length);audio.event('powerup/carpenter/end/end_00',.7);}
}
function shoot(){
  if(!active||!view.ready||view.mode==='raise'||session.busy||session.weaponUnavailable)return false;
  if(session.reloadLeft>0&&session.def.segmentedReload&&session.weapon.mag>0){session.interruptReload();reloadShot=true;return false;}
  if(!session.fire()){if(session.weapon.mag===0&&primaryPressed){audio.weapon('empty',session.def);reload();}return false;}
  view.shoot({ads:ads&&!session.def.dualWield,empty:session.weapon.mag===0,hand:session.def.dualWield&&session.shots%2?'left':'right'});audio.weapon('shot',session.def);muzzle.position.copy(camera.position);muzzle.intensity=160;camera.rotation.x=Math.min(1.48,camera.rotation.x+(ads?.008:.015));
  const forward=camera.getWorldDirection(new THREE.Vector3()),base=session.def.baseId??session.weapon.id;
  if(base==='thundergun_zm'){
    for(const z of [...enemies.list]){const d=z.root.position.clone().add(new THREE.Vector3(0,40,0)).sub(camera.position);if(d.length()<600&&d.normalize().dot(forward)>.65&&world.lineClear(camera.position,z.root.position.clone().add(new THREE.Vector3(0,40,0))))enemies.hurt(z,100000,false,false,'thunder');}
    effect(camera.position.clone().addScaledVector(forward,100),0xb9d8e5,22);return true;
  }
  if(session.def.projectileSpeed>0){features.shoot(session.def,forward);return true;}
  const pellets=Math.max(1,session.def.pellets);
  for(let i=0;i<pellets;i++){
    const direction=forward.clone();if(pellets>1||!ads){const spread=pellets>1?(session.def.pelletSpread??.055):(session.def.hipSpread??.012);direction.x+=(Math.random()-.5)*spread;direction.y+=(Math.random()-.5)*spread;direction.z+=(Math.random()-.5)*spread;direction.normalize();}
    const ray=new THREE.Ray(camera.position.clone(),direction),wall=world.raycast(ray,1,8000),target=enemies.rayHit(ray,wall?.distance??8000);
    shootEggs(ray,Math.min(wall?.distance??8000,target?.distance??8000));
    lastShot={origin:ray.origin.toArray(),direction:direction.toArray(),wallDistance:wall?.distance??null,target:target?{id:target.z.id,head:target.head,distance:target.distance}:null};
    if(target){const d=target.distance>session.def.range?session.def.minDamage:session.def.damage;enemies.hurt(target.z,d*(target.head?Math.max(1,session.def.headMultiplier):1),target.head,false,session.def.explosionRadius?'explosion':'bullet');}
    else if(wall)effect(wall.position,0xb8a388,3);
    if(session.def.explosionRadius&&(target||wall)){
      const p=target?.point??wall.position,radius=session.def.explosionRadius;
      effect(p,base==='ray_gun_zm'?0x93ed62:0xffb44e,18);audio.play('explosion',.3);
      for(const z of [...enemies.list]){const d=z.root.position.distanceTo(p);if(d<radius&&world.lineClear(p.clone().addScaledVector(direction,-3),z.root.position.clone().add(new THREE.Vector3(0,25,0))))enemies.hurt(z,THREE.MathUtils.lerp(session.def.explosionInnerDamage,session.def.explosionOuterDamage,d/radius),false,false,'explosion');}
      const distance=player.getFeetPosition().distanceTo(p);if(distance<radius)damage(100*(1-distance/radius));
    }
  }
  return true;
}
function warmViewAudio(){if(view?.ready)audio.warmWeapon(session.def,Object.values(view.rig.data).flatMap(d=>(d.notifies??[]).map(n=>n.name)));}
async function equipView(){reloadShot=false;await view.equip(session.def);warmViewAudio();}
function reload(){if(!view.ready)return;const empty=session.weapon.mag===0;if(session.reload()){burstLeft=0;ads=false;lastReloadSerial=session.reloadSerial;view.reload(empty,session.reloadDuration,session.reloadStage);}}
function melee(){
  if(!active||session.busy||session.weaponUnavailable||!view.ready)return false;
  const charge=!!meleeTarget(),type=session.bowie?'bowie':'knife',strike=view.melee(type,charge);
  if(!strike)return false;
  session.cancelReload();session.meleeLeft=strike.duration;burstLeft=0;reloadShot=false;ads=false;primaryPressed=false;
  pendingMelee={at:session.time+strike.delay,damage:session.weapon.id==='knife_ballistic_zm'&&session.bowie?(session.weapon.upgraded?1500:1000):strike.damage,bowie:session.bowie};
  audio.knife('swing',session.bowie);return true;
}
function meleeTarget(){
  const direction=camera.getWorldDirection(new THREE.Vector3());let nearest=null;
  for(const z of enemies.list){const target=z.root.position.clone().add(new THREE.Vector3(0,z.kind==='zombie'?45:22,0)),delta=target.clone().sub(camera.position);if(delta.length()<94&&delta.normalize().dot(direction)>.45&&world.lineClear(camera.position,target)){if(!nearest||z.root.position.distanceTo(camera.position)<nearest.root.position.distanceTo(camera.position))nearest=z;}}
  return nearest;
}
function resolveMelee(){
  if(!pendingMelee||session.time<pendingMelee.at)return;
  const strike=pendingMelee;pendingMelee=null;
  if(session.phase==='reviving'||session.phase==='gameover')return;
  const nearest=meleeTarget();
  if(nearest){enemies.hurt(nearest,strike.damage,false,true);audio.knife('hit',strike.bowie);}
  else {const ray=new THREE.Ray(camera.position.clone(),camera.getWorldDirection(new THREE.Vector3())),wall=world.raycast(ray,0,94);if(wall){audio.knife('wall');effect(wall.position,0xb8a388,3);}}
}
function throwGrenade(){
  if(!active||session.grenades<=0||session.busy)return false;session.grenades--;
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(3.5,8,6),new THREE.MeshStandardMaterial({color:0x4a5039,roughness:.8}));mesh.position.copy(camera.position);scene.add(mesh);grenades.push({mesh,velocity:camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(480).add(new THREE.Vector3(0,140,0)),life:3});
}
function findPrompt(){
  prompt=null;promptText='';let distance=110;
  for(const e of world.interactions){
    if(e.kind==='box'&&!mysteryBox.available(e))continue;
    if(e.kind==='power'&&session.power)continue;
    if(e.kind==='egg'&&world.eggs.get(e.egg).items[e.item].found)continue;
    let d;
    if(e.kind==='door'){const door=world.doors.get(e.door);if(world.isOpen(door,session))continue;d=e.box.distanceToPoint(camera.position)+50;}
    else d=camera.position.distanceTo(e.kind==='box'?vector(e.position):e.position);
    if(d<distance){distance=d;prompt=e;}
  }
  for(const b of world.barriers){if(!b.boards.length)continue;const d=camera.position.distanceTo(b.position);if(d<100&&d<distance){prompt={barrier:b};distance=d;}}
  if(!prompt)return;
  if(prompt.barrier){promptText=prompt.barrier.count<prompt.barrier.boards.length?'Hold F to rebuild barricade':'Barricade secured';return;}
  const e=prompt;
  if(e.kind==='door'){const d=world.doors.get(e.door);promptText=d.electric?'The power must be activated':'Open door · '+d.cost;}
  if(e.kind==='wallbuy'){const d=data.weapons[e.weapon],owned=session.inventory.find(w=>w.id===d.id&&!w.lost);promptText=owned?d.name+' ammo · '+(owned.upgraded?4500:d.ammoPrice??Math.ceil(d.price/2)):d.name+' · '+d.price;}
  if(e.kind==='perk'){const p=perkInfo[e.perk];promptText=session.perks.has(e.perk)?p.name+' equipped':!session.power&&e.perk!=='specialty_quickrevive'?'The power must be activated':p.name+' · '+p.price;}
  if(e.kind==='power')promptText='Turn on the power';
  if(e.kind==='egg')promptText=world.eggs.get(e.egg).items[e.item].found?'':'Inspect';
  if(e.kind==='trap'){const t=world.traps.get(e.trap),label=t.kind==='fire'?'fire':'electric';promptText=t.power&&!session.power?'The power must be activated':t.activeUntil>session.time?'Trap active':t.readyAt>session.time?'Trap cooling down · '+Math.ceil(t.readyAt-session.time)+'s':'Activate '+label+' trap · '+t.cost;}
  if(e.kind==='teleport'){const tp=world.teleporters[e.teleporter];promptText=tp.power&&!session.power?'The power must be activated':teleportPending?'Teleporting…':returnTrip?'The teleporter will bring you back':tp.readyAt>session.time?'Teleporter cooling down · '+Math.ceil(tp.readyAt-session.time)+'s':'Teleport'+(tp.cost?' · '+tp.cost:'');}
  if(e.kind==='claymore')promptText=session.claymoresOwned?'Claymores equipped · 4 to place':'Claymores · 1000';
  if(e.kind==='box'){const roll=mysteryBox.at(e);promptText=roll?(roll.ready?(roll.teddy?'The Mystery Box is moving…':'Take '+(data.weapons[roll.weapon]??data.equipment[roll.weapon]).name):'Choosing your weapon…'):'Mystery Box · '+(session.effects.fire_sale>session.time?10:950);}
  if(e.kind==='pap')promptText=!session.power?'The power must be activated':session.pack?(session.time>=session.pack.readyAt?'Take '+data.weapons[session.pack.weapon.id].upgrade.name+' · '+Math.ceil(session.pack.expires-session.time)+'s':'Upgrading weapon…'):session.weapon.upgraded?'Weapon already upgraded':'Pack-a-Punch · 5000';
}
function interact(){
  if(!active||session.busy)return false;findPrompt();if(!prompt)return false;
  if(prompt.barrier)return repair(prompt.barrier);
  const e=prompt,pay=n=>{if(!session.spend(n)){toast('Not enough points');return false;}audio.play('buy');return true;};
  if(e.kind==='door'){
    const d=world.doors.get(e.door);if(d.electric){toast('Turn on the power');return false;}if(!pay(d.cost))return false;
    session.openDoors.add(d.name);world.setDoors(session);toast(d.zone?'Door opened · '+d.zone:'Door opened');return true;
  }
  if(e.kind==='wallbuy'){
    const d=data.weapons[e.weapon];if(session.pack?.weapon===session.weapon)return false;
    session.leaveAttachment();const owned=session.inventory.find(w=>w.id===d.id&&!w.lost);
    const cost=owned?(owned.upgraded?4500:d.ammoPrice??Math.ceil(d.price/2)):d.price;
    if(!pay(cost))return false;
    if(owned)owned.reserve=owned.upgraded?d.upgrade?.maxAmmo??d.maxAmmo:d.maxAmmo;
    else {session.giveWeapon(d.id);equipView();}toast(owned?'Ammo replenished':d.name);return true;
  }
  if(e.kind==='perk'){
    const id=e.perk,p=perkInfo[id];if(session.perks.has(id)||(!session.power&&id!=='specialty_quickrevive'))return false;
    if(id==='specialty_quickrevive'&&session.revives>=3){toast('Quick Revive is depleted');return false;}if(!pay(p.price))return false;
    if(!session.drink(id))return false;primary=false;primaryPressed=false;ads=false;burstLeft=0;reloadShot=false;perkDrink.start(id,view);toast(p.name);audio.play(id);return true;
  }
  if(e.kind==='power'){
    session.power=true;session.flags.add('power_on');world.setDoors(session);world.setPower(true);ambient.intensity=1.7;if(world.powerHandle)world.powerHandle.rotation.x=-1.2;announce('Power restored','THE LIGHTS COME ON');audio.play('round');return true;
  }
  if(e.kind==='egg')return findEgg(world.eggs.get(e.egg),world.eggs.get(e.egg).items[e.item]);
  if(e.kind==='trap'){
    const t=world.traps.get(e.trap);if(t.power&&!session.power){toast('Turn on the power');return false;}
    if(t.activeUntil>session.time||t.readyAt>session.time){toast('Trap cooling down');return false;}if(!pay(t.cost))return false;
    t.activeUntil=session.time+t.duration;t.readyAt=session.time+Math.max(t.duration,t.cooldown);for(const h of t.handles??[])if(h)h.rotation.x=-1.2;toast((t.kind==='fire'?'Fire':'Electric')+' trap active · '+t.duration+'s');return true;
  }
  if(e.kind==='teleport'){
    const tp=world.teleporters[e.teleporter];if(tp.power&&!session.power){toast('Turn on the power');return false;}
    if(teleportPending||returnTrip||tp.readyAt>session.time)return false;if(tp.cost&&!pay(tp.cost))return false;
    teleportPending={tp,at:session.time+1.6};tp.readyAt=session.time+tp.cooldown;toast('Teleporting…');audio.play('buy');return true;
  }
  if(e.kind==='claymore'){const ok=session.buyClaymores();if(ok){audio.play('buy');toast('Claymores · press 4 to place');}else if(!session.claymoresOwned)toast('Not enough points');return ok;}
  if(e.kind==='box'){
    if(mysteryBox.at(e)){if(session.pack?.weapon===session.weapon)return false;const weapon=mysteryBox.take(e);if(!weapon)return false;if(weapon==='zombie_cymbal_monkey'){session.giveMonkeys();toast('Monkey Bombs · X to throw');}else{session.giveWeapon(weapon);equipView();toast(data.weapons[weapon].name);}return true;}
    const cost=session.effects.fire_sale>session.time?10:950;
    if(session.points<cost){toast('Not enough points');return false;}
    if(!mysteryBox.start(e))return false;session.spend(cost);return true;
  }
  if(e.kind==='pap'){
    if(session.pack){if(!session.takePack())return false;equipView();toast(session.def.name);return true;}
    if(!session.beginPack())return false;ads=false;primary=false;burstLeft=0;reloadShot=false;audio.play('packapunch');toast('Upgrading… retrieve your weapon when it is ready.');return true;
  }
  return false;
}
function moveTo(position,yaw){player.setPosition(position.clone());camera.rotation.set(0,yaw-Math.PI/2,0);flashUntil=session.time+.8;}
function updateTraps(dt){
  const feet=player.getFeetPosition();
  for(const t of world.traps.values()){
    const on=t.activeUntil>session.time;
    for(const z of t.zones){
      z.mesh.visible=on;z.light.intensity=on?60+Math.random()*120:0;if(!on)continue;
      z.mesh.rotation.y+=dt*3;z.mesh.material.opacity=.16+Math.random()*.16;
      for(const e of [...enemies.list])if(world.inTrapZone(z,e.root.position.clone().add(new THREE.Vector3(0,30,0))))enemies.hurt(e,99999,false,false,t.kind==='fire'?'fire':'electric');
      if(world.inTrapZone(z,feet.clone().add(new THREE.Vector3(0,30,0)),-25))damage(dt*100);
    }
    if(!on)for(const h of t.handles??[])if(h&&t.readyAt<=session.time)h.rotation.x=0;
  }
}
function updateTeleporters(){
  for(const tp of world.teleporters){const charging=teleportPending?.tp===tp;tp.glow.material.opacity=charging?.25+Math.sin(session.time*20)*.1:0;tp.ring.material.color.setHex(tp.readyAt>session.time&&!charging?0x5d6a70:0x7fd4ff);}
  if(teleportPending&&session.time>=teleportPending.at){
    const {tp}=teleportPending;teleportPending=null;const to=tp.to;
    moveTo(to.position,to.yaw);
    if(to.zone&&!session.flags.has('zone:'+to.zone)){session.flags.add('zone:'+to.zone);}
    if(to.returnAfter>0){returnTrip={at:session.time+to.returnAfter,position:tp.from.position,yaw:tp.from.yaw};toast('Returning in '+to.returnAfter+' seconds',4);}
    else toast(tp.name[0].toUpperCase()+tp.name.slice(1),2);
  }
  if(returnTrip&&session.time>=returnTrip.at){const r=returnTrip;returnTrip=null;moveTo(r.position,r.yaw);}
}
function shootEggs(ray,far){
  for(const g of world.eggs.values())for(const i of g.items){
    if(i.found||!i.shoot)continue;const hit=ray.intersectSphere(new THREE.Sphere(i.position,14),new THREE.Vector3());
    if(hit&&hit.distanceTo(ray.origin)<=far+14)findEgg(g,i);
  }
}
function findEgg(g,item){
  if(item.found||g.done)return false;item.found=true;item.object.visible=false;effect(item.position,0xd6a94a,12);audio.play('buy');
  const found=g.items.filter(i=>i.found).length;toast(`${g.name[0].toUpperCase()+g.name.slice(1)} · ${found} / ${g.items.length}`);
  if(found<g.items.length)return true;
  g.done=true;const rewards=[];
  if(g.points){session.addPoints(+g.points);rewards.push('+'+g.points+' points');}
  if(g.weapon&&data.weapons[g.weapon]){session.giveWeapon(g.weapon);equipView();rewards.push(data.weapons[g.weapon].name);}
  const perk={jugg:'specialty_armorvest',revive:'specialty_quickrevive',speedcola:'specialty_fastreload',doubletap:'specialty_rof'}[g.perk]??g.perk;
  if(perkInfo[perk]&&!session.perks.has(perk)){session.perks.add(perk);session.health=session.maxHealth;rewards.push(perkInfo[perk].name);}
  if(g.reward==='song'||!rewards.length)audio.playMusic('115');
  announce(g.message??'Secret found','EASTER EGG',5);if(rewards.length)toast('Reward: '+rewards.join(', '),5);
  mods.emit('easterEgg',{name:g.name});return true;
}
function repair(b){if(b.count>=b.boards.length||repairLeft>0)return false;repairLeft=.75;world.setBoards(b,b.count+1);if(b.rewardRound!==session.round){b.rewardRound=session.round;b.reward=0;}if(b.reward<50*session.round){session.addPoints(10);b.reward+=10;}audio.play('board');return true;}
function resetPower(){if(!world.hasPower){session.power=true;session.flags.add('power_on');}ambient.intensity=session.power?1.7:1.2;world.setPower(session.power);}
function reset(){
  pendingMelee=null;lastReloadSerial=0;reloadShot=false;
  touchControls.reset();mousePrimary=mouseAim=false;toastUntil=0;announcementUntil=0;hitUntil=0;flashUntil=0;primary=false;primaryPressed=false;ads=false;keys.clear();
  session.reset();resetPower();enemies.reset();world.reset(session);player.setSpawn(world.spawn.position);player.respawn();camera.rotation.set(0,world.spawn.yaw-Math.PI/2,0);
  powerups.reset();perkDrink.stop();mysteryBox.reset();features.reset();
  for(const group of [particles,grenades]){for(const item of group){item.mesh.removeFromParent();item.mesh.geometry?.dispose();item.mesh.material?.dispose();}group.length=0;}
  if(audio.ctx)audio.playMusic('ambience');
  teleportPending=null;returnTrip=null;
  started=false;repairLeft=0;burstLeft=0;lastPhase='';lastRound=0;view.currentId=null;equipView();$('results').hidden=true;$('menu-status').textContent=touchControls.mode?'Tap to start':'Click to capture the mouse';
}
function update(dt){
  if(!ready)return;
  touchControls.setEnabled(active&&session.phase!=='reviving'&&session.phase!=='gameover',active&&session.phase!=='gameover');
  const touch=touchControls.input.read();
  primary=mousePrimary||touch.fire;primaryPressed ||= touch.firePressed;ads=mouseAim||touch.aim;
  if(active){
    session.update(dt);
    if(session.phase!=='gameover'){
      resolveMelee();
      if(session.reloadLeft>0&&session.reloadSerial!==lastReloadSerial){lastReloadSerial=session.reloadSerial;view.reload(false,session.reloadDuration,session.reloadStage);}
      const forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS'))+touch.forward,strafe=Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+touch.strafe;
      const moving=Math.hypot(forward,strafe)>.01,sprint=((keys.has('ShiftLeft')||keys.has('ShiftRight'))&&moving||touch.sprint)&&!globalThis.kino?.movement?.state?.sliding&&!globalThis.kino?.movement?.state?.diving&&!ads&&!session.reloadLeft&&!session.meleeLeft&&!session.drinking;
      player.update(dt,session.phase==='reviving'?{}:{forward,strafe,sprint,crouch:keys.has('ControlLeft')||keys.has('ControlRight')||keys.has('KeyC')||touch.crouch,jump:keys.has('Space'),jumpPressed:touch.jump});
      if(player.getFeetPosition().y<world.bounds.min.y-600){player.respawn();toast('You fell out of the map');}
      view.update(dt,{moving,sprint,ads:ads&&!session.def.dualWield,reloading:session.reloadLeft>0,empty:session.weapon.mag===0,time:session.time});
      view.pivot.visible=!session.weaponUnavailable;
      perkDrink.update(dt,session);
      if(!sprint&&session.phase!=='reviving'&&(primaryPressed||(primary&&session.def.automatic)||burstLeft>0||reloadShot)){
        if(shoot()){reloadShot=false;if(burstLeft>0)burstLeft--;else if(session.def.fireType==='3-Round Burst')burstLeft=2;}
      }
      primaryPressed=false;
      enemies.update(dt,player.getFeetPosition());
      features.update(dt);
      mods.emit('update',dt);
      repairLeft=Math.max(0,repairLeft-dt);findPrompt();if((keys.has('KeyF')||keys.has('KeyE')||touch.use)&&prompt?.barrier)repair(prompt.barrier);
      if(session.round!==lastRound||session.phase!==lastPhase){if(session.phase==='fighting'){announce(session.dogRound?'Fetch their souls':'Round '+session.round,session.dogRound?'HELLHOUNDS':'SURVIVE');audio.play(session.dogRound?'dog_round':'round');if(session.dogRound)audio.play('dog_announce');}else if(session.phase==='preparing'&&session.round>1){announce('Round survived','RELOAD. REBUILD. PREPARE.');audio.play('round_end');}lastRound=session.round;lastPhase=session.phase;}
      mysteryBox.update(dt);
      updateTraps(dt);updateTeleporters();
      // Hellhound rounds roll in a fog, as in the original maps.
      scene.fog.density=THREE.MathUtils.damp(scene.fog.density,session.dogRound&&session.phase==='fighting'?Math.max(baseFog,.0011):baseFog,1.5,dt);
      for(const g of world.eggs.values())for(const i of g.items)if(!i.found)i.object.rotation.y+=dt*.8;
      powerups.update(dt,player.getFeetPosition(),session.phase!=='reviving',(a,b)=>world.lineClear(a,b));
      for(const g of [...grenades]){
        g.life-=dt;g.velocity.y-=650*dt;const travel=g.velocity.clone().multiplyScalar(dt),ray=new THREE.Ray(g.mesh.position.clone(),travel.clone().normalize()),hit=world.raycast(ray,0,travel.length()+4);
        if(hit){g.velocity.y=Math.abs(g.velocity.y)*.4;g.velocity.x*=-.4;g.velocity.z*=-.4;}else g.mesh.position.add(travel);
        if(g.life<=0){effect(g.mesh.position,0xffb347,30);audio.play('explosion');for(const z of [...enemies.list]){const d=z.root.position.distanceTo(g.mesh.position);if(d<300&&world.lineClear(g.mesh.position,z.root.position.clone().add(new THREE.Vector3(0,30,0))))enemies.hurt(z,Math.max(75,1500*(1-d/300)),false,false,'explosion');}const d=camera.position.distanceTo(g.mesh.position);if(d<160)damage(180*(1-d/160));g.mesh.removeFromParent();g.mesh.geometry.dispose();g.mesh.material.dispose();grenades.splice(grenades.indexOf(g),1);}
      }
      for(const p of [...particles]){p.life-=dt;p.velocity.y-=200*dt;p.mesh.position.addScaledVector(p.velocity,dt);if(p.life<=0){p.mesh.removeFromParent();p.mesh.geometry.dispose();p.mesh.material.dispose();particles.splice(particles.indexOf(p),1);}}
    }
  }
  muzzle.intensity=Math.max(0,muzzle.intensity-dt*2200);camera.fov=THREE.MathUtils.damp(camera.fov,ads&&!session.def.dualWield&&!session.drinking&&!session.meleeLeft&&!session.reloadLeft?(session.def.adsFov||56)*settings.fov/78:settings.fov,12,dt);camera.updateProjectionMatrix();
  hud();
}
function hud(){
  const s=session,w=s.weapon;
  $('round').textContent=s.round<=5?'I'.repeat(s.round):String(s.round);$('remaining').textContent=s.phase==='preparing'?'STARTS IN '+Math.max(0,Math.ceil(s.countdown)):(s.total-s.killed)+' REMAINING';
  $('points').textContent=s.points.toLocaleString();$('mag').textContent=s.weaponUnavailable?'—':w.mag;$('reserve').textContent=s.weaponUnavailable?'—':w.reserve;$('weapon-name').textContent=s.weaponUnavailable?(s.pack?'Weapon in Pack-a-Punch':'No weapon'):s.def.name;$('grenades').textContent='G · '+s.grenades+' GRENADES'+(s.claymoresOwned?'  |  4 · '+s.claymores+' CLAYMORES':'')+(s.monkeysOwned?'  |  X · '+s.monkeys+' MONKEYS':'');$('reload-label').textContent=s.weaponUnavailable?'':s.reloadLeft>0?'RELOADING':w.mag===0?'R TO RELOAD':s.weapon.upgraded&&data.weapons[w.id].upgrade?.attachment?'5 · SWITCH ATTACHMENT':'';
  if(touchControls.mode){$('grenades').textContent=$('grenades').textContent.replace('G · ','').replace('4 · ','').replace('X · ','');$('reload-label').textContent=$('reload-label').textContent.replace('R TO RELOAD','TAP RELOAD').replace('5 · SWITCH ATTACHMENT','TAP ALT FIRE');}
  $('health-fill').style.width=(100*s.health/s.maxHealth)+'%';$('health-label').textContent=Math.ceil(s.health)+' / '+s.maxHealth;
  $('hurt').style.opacity=s.health<s.maxHealth?(1-s.health/s.maxHealth)*.8:0;$('hitmarker').style.opacity=hitUntil>s.time?1:0;$('flash').style.opacity=Math.max(0,flashUntil-s.time);
  $('prompt').innerHTML=active&&promptText?(promptText==='Barricade secured'?promptText:touchControls.mode?'<kbd>USE</kbd> '+promptText.replace('Hold F','Hold USE'):'<kbd>F</kbd> '+promptText):'';
  if(toastUntil<s.time)$('toast').textContent='';if(announcementUntil<s.time)$('announcement').style.opacity=0;
  const perkHtml=[...s.perks].map(id=>`<span class="perk" title="${perkInfo[id].name}" style="background:${perkInfo[id].color}">${perkInfo[id].icon}</span>`).join('');if($('perks').innerHTML!==perkHtml)$('perks').innerHTML=perkHtml;
  const effectHtml=Object.entries(s.effects).filter(([k,t])=>t>s.time&&powerupNames[k]).map(([k,t])=>`<span class="powerup-timer ${t-s.time<5&&Math.floor(s.time*4)%2?'expiring':''}"><img src="${data.powerups[k].icon}" alt="${powerupNames[k]}"><span>${Math.ceil(t-s.time)}s</span></span>`).join('')+(returnTrip?'<span>RETURN IN '+Math.max(0,Math.ceil(returnTrip.at-s.time))+'</span>':'');if($('effects').innerHTML!==effectHtml)$('effects').innerHTML=effectHtml;
  $('objective').textContent=!s.power?'Find the power switch':'';
  if(debugVisible)$('debug').textContent=`${fps} FPS · ${renderer.info.render.calls} calls\n${camera.position.toArray().map(v=>v.toFixed(1)).join(', ')}\n${enemies.list.length} enemies · ${world.navDisabled.size} blocked polygons`;
}

function getState(){return {map:entry?.id,ready,active,started,input:{touch:touchControls.getState(),primary,ads},...(session?session.snapshot():{}),player:player?{...player.state,rotation:camera.rotation.toArray().slice(0,3),position:camera.position.toArray(),feet:player.getFeetPosition().toArray()}:null,enemies:enemies?.snapshot()??[],prompt:promptText,barriers:world?.barriers?.map(b=>({id:b.id,count:b.count,boards:b.boards.length,group:b.group,inside:b.inside.toArray()}))??[],doors:world?[...world.doors.values()].map(d=>({name:d.name,cost:d.cost,zone:d.zone,open:world.isOpen(d,session)})):[],interactions:world?.interactions?.map(e=>({kind:e.kind,weapon:e.weapon,perk:e.perk,door:e.door,position:Array.isArray(e.position)?e.position:e.position.toArray()}))??[],performance:{fps,calls:renderer.info.render.calls},viewmodelReady:view?.ready??false,eggs:world?[...world.eggs.values()].map(g=>({name:g.name,found:g.items.filter(i=>i.found).length,total:g.items.length,done:g.done,items:g.items.map(i=>({position:i.position.toArray(),shoot:i.shoot}))})):[],warnings:world?.warnings??[],traps:world?[...world.traps.values()].map(t=>({name:t.name,kind:t.kind,cost:t.cost,zones:t.zones.length,active:t.activeUntil>(session?.time??0),readyIn:Math.max(0,t.readyAt-(session?.time??0))})):[],teleporters:world?.teleporters?.map(t=>({name:t.name,to:t.to.position.toArray(),returnAfter:t.to.returnAfter,readyIn:Math.max(0,t.readyAt-(session?.time??0))}))??[],teleporting:!!teleportPending,returnIn:returnTrip?returnTrip.at-session.time:0,errors:[...errors,...mods.errors]};}
globalThis.kino={mods,debug:{getState,setActive,pause:()=>setActive(false),resume:()=>setActive(true),reset,teleportPlayer:p=>player.setPosition(vector(p)),lookAt:p=>camera.lookAt(vector(p)),damagePlayer:damage,grantPoints:n=>session.points+=n,interact,shoot,reload,melee,
  giveWeapon:id=>{session.giveWeapon(id);equipView();},spawnEnemy:(p,kind)=>enemies.spawn(vector(p),null,kind).id,clearEnemies:()=>{for(const z of [...enemies.list])enemies.hurt(z,999999);},collectPowerup:collect,
  step:seconds=>{for(let t=0;t<seconds;t+=1/60)update(Math.min(1/60,seconds-t));},navigationPath:(a,b)=>world.path(vector(a),vector(b)).map(v=>v.toArray()),
  setAutoSpawn:value=>{enemies.autoSpawn=value;enemies.autoRounds=value;},setInvulnerable:value=>{session.effects.invulnerable=value?Infinity:0;},damageEnemy:(id,n=999999)=>{const z=enemies.list.find(z=>z.id===id);if(z)enemies.hurt(z,n);},
  setRound:n=>{enemies.reset();while(session.round<n)session.nextRound();session.countdown=0;session.spawned=0;session.killed=0;},lastShot:()=>lastShot,assets:assetDiagnostics,
  aimAtEnemy:(id,head=true)=>{const z=enemies.list.find(z=>z.id===id);if(z)camera.lookAt(head?enemies.headPosition(z):z.root.position.clone().add(new THREE.Vector3(0,40,0)));},
  boxState:()=>mysteryBox.snapshot(),dropPowerup:(type,p)=>{powerups.spawn(type,vector(p));return powerups.snapshot();},fog:()=>scene.fog?.density??0,lights:()=>world.powerLights.map(p=>p.light.intensity),showCollision:value=>{world.collision.setDebugVisible(value);scene.add(world.collision.mesh);}}};
try{
  progress('Reading map list',3);
  const id=new URLSearchParams(location.search).get('map'),list=await fetch('mods/maps.json').then(r=>r.json());
  entry=list.maps.find(m=>m.id===id);
  if(!entry?.dir)throw new Error(id?`"${id}" is not a custom map in mods/maps.json`:'No map chosen. Pick one from the main menu.');
  document.title=entry.title+' — Zombies';$('map-title').textContent=entry.title;$('map-tagline').textContent=entry.description??'Survive as long as you can.';$('top-map').textContent=entry.title.toUpperCase();
  if(entry.background)scene.background=new THREE.Color(entry.background);if(entry.exposure)renderer.toneMappingExposure=entry.exposure;baseFog=entry.fog??0;scene.fog=new THREE.FogExp2(scene.background.clone(),baseFog);
  progress('Loading game data',6);
  const base=await fetch('game-data.json').then(r=>r.json());base.entities=[];base.zoneLinks=[];
  data=await mods.load(base);session=new Session(data);
  world=new CustomWorld(scene,data,entry);await world.load(progress);resetPower();
  player=new PlayerController(camera,world.physics,{spawn:world.spawn.position,spawnIsEye:false,radius:14,height:70,eyeHeight:60,moveSpeed:190,sprintSpeed:285,crouchSpeed:95,gravity:800,jumpHeight:39,fallResetY:world.bounds.min.y-800,maxSubSteps:12,groundSnapSpeed:10});
  camera.rotation.set(0,world.spawn.yaw-Math.PI/2,0);world.setDoors(session);
  progress('Loading weapons and the undead',80);view=new ViewWeapon(viewScene,data,(name,def)=>audio.notify(name,def));enemies=new Enemies(scene,world,data,session,{damage,kill,hit,sound:(kind,p)=>audio.play(kind,Math.max(0,1-p.distanceTo(camera.position)/1000))});
  world.actors=()=>enemies.list;
  powerups=new Powerups(scene,data,audio,collect);perkDrink=new PerkDrink(viewScene,data,audio);mysteryBox=new MysteryBox(scene,world,data,session,audio,toast);
  features=new MapFeatures({scene,world,data,session,enemies,player,camera,audio,effect,damage,toast});
  await Promise.all([enemies.load(),equipView(),audio.load(),powerups.load(),perkDrink.load(),mysteryBox.load(),features.load()]);player.update(.05,{});
  progress('Loading mods',95);await mods.start({renderer,data,session,world,player,enemies,scene,camera,audio,features,mysteryBox,powerups,view,viewScene,perkDrink,toast,announce,equipView,damage,getState,setActive,reset,map:entry});if(!profile.mobile)mysteryBox.warm(renderer,camera);
  if(world.warnings.length){const w=document.createElement('ul');w.id='map-warnings';w.innerHTML='<li>Map warnings:</li>'+world.warnings.map(m=>`<li>${m.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</li>`).join('');$('menu-status').after(w);}
  ready=true;
  progress('Ready',100);$('loading').hidden=true;$('start').disabled=contextLost;$('menu-status').textContent=touchControls.mode?'Tap to start':'Click to capture the mouse · Esc to pause';
}catch(error){console.error(error);errors.push(String(error));$('load-label').textContent='Unable to start: '+error.message;$('menu-status').textContent='See the browser console for details';}
renderer.info.autoReset=false;
function renderFrame(now){
  if(document.hidden||contextLost)return;
  const interval=profile.mobile?(active?1000/30:200):0;
  if(lastRendered&&now-lastRendered<interval-1)return;
  lastRendered=now;const dt=Math.min((now-previous)/1000,.06);previous=now;frameTime+=dt;frameCount++;renderedFrames++;
  if(frameTime>.75){fps=Math.round(frameCount/frameTime);frameTime=0;frameCount=0;}
  update(dt);renderer.info.reset();renderer.clear();if(mods.renderWorld)mods.renderWorld(scene,mods.camera??camera);else renderer.render(scene,mods.camera??camera);if(ready&&started&&!mods.hideViewmodel){renderer.clearDepth();renderer.render(viewScene,viewCamera);}
}
resumeRendering();
