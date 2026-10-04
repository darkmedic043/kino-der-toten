// The game (not part of upstream's layout): one engine for every map. The website is the core
// and a map is content it loads: play.html?map=<id> reads mods/maps.json, imports the map's
// module (maps/<module>.js) and runs it. The engine owns the renderer, input, player, weapons,
// enemies, power-ups, perks, the Mystery Box, Pack-a-Punch, barricades, rounds, the HUD, the
// debug API and mods; a map supplies its world, spawn, interactions and its own systems (Kino's
// teleporter and traps, a custom map's Easter eggs...). Built from upstream's game.js and the
// fork's zombies.js, which were two copies of this loop.
import * as THREE from 'three';
import { PlayerController } from './player-controller.js';
import { ViewWeapon } from './animation.js';
import { Enemies } from './enemies.js';
import { KinoSession } from './kino-session.js';
import { GameAudio } from './audio.js';
import { Powerups } from './powerups.js';
import { PerkDrink } from './perk-drink.js';
import { MysteryBox } from './mystery-box.js';
import { createZombieTouch } from './zombies-touch.js';
import { configureKinoAssets, assetDiagnostics } from './runtime-assets.js';
import { ModHost } from './mod-loader.js';
import { settings } from './settings.js';
import { installGameMenu } from './game-menu.js';

export const vector=a=>new THREE.Vector3().fromArray(a);
export const perkInfo={specialty_quickrevive:{name:'Quick Revive',price:500,color:'#509ebc',icon:'QR'},specialty_fastreload:{name:'Speed Cola',price:3000,color:'#478450',icon:'SC'},specialty_rof:{name:'Double Tap',price:2000,color:'#b37528',icon:'DT'},specialty_armorvest:{name:'Juggernog',price:2500,color:'#a53835',icon:'J'}};
const powerupNames={nuke:'Nuke',insta_kill:'Insta-Kill',double_points:'Double Points',full_ammo:'Max Ammo',carpenter:'Carpenter',fire_sale:'Fire Sale',death_machine:'Death Machine'};

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
const ambient=new THREE.AmbientLight(0xb3bcc7,1.2),hemi=new THREE.HemisphereLight(0xd2d9e3,0x574236,2.0);scene.add(ambient,hemi);
const keyLight=new THREE.DirectionalLight(0xffdfb1,1.5);keyLight.position.set(.4,1,.2);scene.add(keyLight);
const fill=new THREE.DirectionalLight(0x8cabc9,.7);fill.position.set(-1,.5,-.5);scene.add(fill);
const camera=new THREE.PerspectiveCamera(78,innerWidth/innerHeight,1,30000);camera.rotation.order='YXZ';
const viewScene=new THREE.Scene(),viewCamera=new THREE.PerspectiveCamera(51,innerWidth/innerHeight,.01,200);   // BO1 cg_fov 65 on 4:3 = 50.9° vertical; wider showed the viewmodels unseen, stretched rear faces
viewScene.add(new THREE.AmbientLight(0xe1d9c7,2.8));const vl=new THREE.DirectionalLight(0xffefc8,2);vl.position.set(0,4,2);viewScene.add(vl);
const muzzle=new THREE.PointLight(0xffc276,0,240,1);scene.add(muzzle);
let entry,map,data,world,session,player,enemies,view,powerups,perkDrink,mysteryBox,features,ready=false,active=false,started=false,primary=false,primaryPressed=false,ads=false;
let prompt=null,promptText='',toastUntil=0,announcementUntil=0,hitUntil=0,flashUntil=0;
let lastPhase='',lastRound=0,frameTime=0,frameCount=0,fps=0,debugVisible=false,repairLeft=0,burstLeft=0;
const particles=[],grenades=[];
const errors=[];
let lastShot=null;
let pendingMelee=null,lastReloadSerial=0,reloadShot=false,reloadHeld=0;
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
function announce(title,small=(map?.announceTitle??entry?.title??'Zombies').toUpperCase(),duration=4){$('announcement-title').textContent=title;$('announcement-small').textContent=small;$('announcement').style.opacity=1;announcementUntil=session.time+duration;}
function setActive(value){
  active=!!value&&ready&&session.phase!=='gameover';$('menu').hidden=active;document.body.classList.toggle('menu-open',!active);keys.clear();primary=false;primaryPressed=false;ads=false;reloadShot=false;reloadHeld=0;
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
addEventListener('mousedown',e=>{if(!active||e.sourceCapabilities?.firesTouchEvents||e.target.closest?.('#touch-controls'))return;if(e.button===0){mousePrimary=primary=true;primaryPressed=true;}if(e.button===2)mouseAim=ads=true;});
addEventListener('mouseup',e=>{if(e.sourceCapabilities?.firesTouchEvents)return;if(e.button===0)mousePrimary=primary=false;if(e.button===2)mouseAim=ads=false;});
addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('keydown',e=>{
  if(['Space','Tab','F3'].includes(e.code))e.preventDefault();
  keys.add(e.code);if(e.repeat||!active)return;
  // R: tap to reload, hold to inspect (mods/inspect); an empty mag reloads at once
  if(e.code==='KeyR'){if(session.weapon?.mag===0)reload();else reloadHeld=performance.now();}if(e.code==='KeyV')melee();if(e.code==='KeyG')throwGrenade();if(e.code==='KeyF'||e.code==='KeyE')interact();
  if(e.code==='Digit4')features.placeClaymore();if(e.code==='KeyX')features.throwMonkey();
  if(e.code==='Digit5'&&session.toggleAttachment())equipView();
  if(['Digit1','Digit2','Digit3'].includes(e.code)){session.switchWeapon(+e.code.at(-1)-1);equipView();}
  if(e.code==='KeyQ'){session.switchWeapon();equipView();}
  if(e.code==='KeyM'){audio.enabled=!audio.enabled;toast(audio.enabled?'Sound on':'Sound off');}
  if(e.code==='F3'){debugVisible=!debugVisible;$('debug').hidden=!debugVisible;}
  if(e.code==='Escape'){setActive(false);document.exitPointerLock?.();}
  map?.keydown?.(e);
});
addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='KeyR'&&reloadHeld){reloadHeld=0;if(active)reload();}});
addEventListener('wheel',()=>{if(active){session.switchWeapon();equipView();}});
addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{const width=innerWidth,height=innerHeight,current=renderer.getSize(new THREE.Vector2());if(current.x===width&&current.y===height)return;camera.aspect=viewCamera.aspect=width/height;camera.updateProjectionMatrix();viewCamera.updateProjectionMatrix();renderer.setSize(width,height);},profile.mobile?150:0);});

function damage(n){
  if(map.beforeDamage?.(n)===false)return;   // e.g. Moon's Pack-a-Punch shield
  if(!session.damage(n))return;audio.play('hit');
  if(!session.drinking)perkDrink?.stop();
  if(session.phase==='gameover'){
    primary=false;ads=false;setActive(false);document.exitPointerLock?.();$('start').innerHTML='TRY AGAIN <span>→</span>';$('restart').hidden=true;
    $('menu-status').textContent='You survived '+session.round+' rounds';$('results').hidden=false;$('results').textContent=session.kills+' kills · '+session.headshots+' headshots · '+Math.floor(session.time/60)+'m '+Math.floor(session.time%60)+'s';
    if(!globalThis.kino?.cheats?.used)try{const key=map.bestKey??'kino.best.'+entry.id,best=Math.max(session.round,+(localStorage.getItem(key)||0));localStorage.setItem(key,String(best));}catch{}
  }else if(session.phase==='reviving')announce('A second chance','QUICK REVIVE',4);
}
function effect(position,color=0x9e3023,count=7){
  {const e={position,color,count,handled:false};mods.emit('effect',e);if(e.handled)return;}   // mods may draw it instead (fx mod)
  for(let i=0;i<count;i++){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(1.5,1.5,1.5),new THREE.MeshBasicMaterial({color}));mesh.position.copy(position);scene.add(mesh);
    particles.push({mesh,velocity:new THREE.Vector3((Math.random()-.5)*100,Math.random()*90,(Math.random()-.5)*100),life:.45+Math.random()*.3});
  }
}
function hit(z,head){hitUntil=session.time+.12;$('hitmarker').style.color=head?'#db5140':'#eee';effect(head?enemies.headPosition(z):z.root.position.clone().add(new THREE.Vector3(0,z.kind==='zombie'?42:25,0)));}
function kill(z,force,position){
  if(z)map.onKill?.(z);
  if(force){powerups.spawn(force,position??player.getFeetPosition());return;}
  if(z&&map.dropAllowed?.(z)===false)return;
  if(z){const type=session.drops.tryDrop(session,{kind:z.kind,playable:z.state!=='barricade'&&(map.playable?.(z)??true),destroyedWindows:map.brokenWindows?.()??world.barriers.filter(b=>map.boardCount(b)&&b.count===0).length,boxMoves:mysteryBox.moves});if(type)powerups.spawn(type,z.root.position);}
}
function collect(type){
  if(!powerupNames[type])return;
  session.powerup(type);toast(powerupNames[type],3);audio.event('powerup/grab/grab_00',.75);
  audio.play(type);
  if(type==='full_ammo')audio.event('powerup/max_ammo/max_ammo_00',.7);
  if(type==='nuke'){flashUntil=session.time+.8;audio.event('nuke/nuke_flash',.8);enemies.nuke(z=>effect(z.root.position,0xc7dba4));}
  if(type==='carpenter'){for(const b of world.barriers)world.setBoards(b,map.boardCount(b));audio.event('powerup/carpenter/end/end_00',.7);}
  map.onPowerup?.(type);
}
const blocked=()=>!!map?.blocked?.();
function shoot(){
  if(!active||blocked()||!view.ready||view.mode==='raise'||session.busy||session.weaponUnavailable)return false;
  if(session.reloadLeft>0&&session.def.segmentedReload&&session.weapon.mag>0){session.interruptReload();reloadShot=true;return false;}
  if(!session.fire()){if(session.weapon.mag===0&&primaryPressed){audio.weapon('empty',session.def);reload();}return false;}
  view.shoot({ads:ads&&!session.def.dualWield,empty:session.weapon.mag===0,hand:session.def.dualWield&&session.shots%2?'left':'right'});audio.weapon('shot',session.def);muzzle.position.copy(camera.position);muzzle.intensity=160;camera.rotation.x=Math.min(1.48,camera.rotation.x+(ads?.008:.015));
  const forward=camera.getWorldDirection(new THREE.Vector3()),base=session.def.baseId??session.weapon.id;
  if(map.fire?.(session.def,forward))return true;   // a map's own weapons (Moon's Wave Gun / Zap Guns)
  if(base==='thundergun_zm'){
    for(const z of [...enemies.list]){const d=z.root.position.clone().add(new THREE.Vector3(0,40,0)).sub(camera.position);if(d.length()<600&&d.normalize().dot(forward)>.65&&world.lineClear(camera.position,z.root.position.clone().add(new THREE.Vector3(0,40,0))))enemies.hurt(z,100000,false,false,'thunder');}
    effect(camera.position.clone().addScaledVector(forward,100),0xb9d8e5,22);return true;
  }
  if(session.def.projectileSpeed>0){features.shoot(session.def,forward);return true;}
  const pellets=Math.max(1,session.def.pellets),reach=map.shotRange??8000;
  for(let i=0;i<pellets;i++){
    const direction=forward.clone();if(pellets>1||!ads){const spread=pellets>1?(session.def.pelletSpread??.055):(session.def.hipSpread??.012);direction.x+=(Math.random()-.5)*spread;direction.y+=(Math.random()-.5)*spread;direction.z+=(Math.random()-.5)*spread;direction.normalize();}
    const ray=new THREE.Ray(camera.position.clone(),direction),wall=world.raycast(ray,1,reach),target=enemies.rayHit(ray,wall?.distance??reach);
    map.onShot?.(ray,Math.min(wall?.distance??reach,target?.distance??reach),'bullet');
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
async function equipView(){reloadShot=false;await view.equip(map?.viewDef?.(session.def)??session.def);warmViewAudio();}
function reload(){if(!view.ready)return;const empty=session.weapon.mag===0;if(session.reload()){burstLeft=0;ads=false;lastReloadSerial=session.reloadSerial;view.reload(empty,session.reloadDuration,session.reloadStage);}}
function melee(){
  if(!active||session.busy||session.weaponUnavailable||blocked()||!view.ready)return false;
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
  map.onShot?.(new THREE.Ray(camera.position.clone(),camera.getWorldDirection(new THREE.Vector3())),94,'melee');
  const nearest=meleeTarget();
  if(nearest){enemies.hurt(nearest,strike.damage,false,true);audio.knife('hit',strike.bowie);}
  else {const ray=new THREE.Ray(camera.position.clone(),camera.getWorldDirection(new THREE.Vector3())),wall=world.raycast(ray,0,94);if(wall){audio.knife('wall');effect(wall.position,0xb8a388,3);}}
}
function throwGrenade(){
  if(!active||session.grenades<=0||session.busy||blocked())return false;session.grenades--;
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(3.5,8,6),new THREE.MeshStandardMaterial({color:0x4a5039,roughness:.8}));mesh.position.copy(camera.position);scene.add(mesh);grenades.push({mesh,velocity:camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(480).add(new THREE.Vector3(0,140,0)),life:3});
}

// ---- shared interactions (maps decide what is where; these decide what it does) --------------
const pay=n=>{if(!session.spend(n)){toast('Not enough points');return false;}audio.play('buy');return true;};
const shop={
  pay,
  wallPrompt(id){const d=data.weapons[id],owned=session.inventory.find(w=>w.id===d.id&&!w.lost);return owned?d.name+' ammo · '+(owned.upgraded?4500:d.ammoPrice??Math.ceil(d.price/2)):d.name+' · '+d.price;},
  buyWall(id){
    const d=data.weapons[id];if(!d||session.pack?.weapon===session.weapon)return false;
    session.leaveAttachment();const owned=session.inventory.find(w=>w.id===d.id&&!w.lost);
    const cost=owned?(owned.upgraded?4500:d.ammoPrice??Math.ceil(d.price/2)):d.price;
    if(!pay(cost))return false;
    if(owned)owned.reserve=owned.upgraded?d.upgrade?.maxAmmo??d.maxAmmo:d.maxAmmo;
    else {session.giveWeapon(d.id);equipView();}toast(owned?'Ammo replenished':d.name);return true;
  },
  perkPrompt(id){const p=perkInfo[id];if(!p)return '';return session.perks.has(id)?p.name+' equipped':!session.power&&id!=='specialty_quickrevive'?'The power must be activated':p.name+' · '+p.price;},
  buyPerk(id){
    const p=perkInfo[id];if(!p||session.perks.has(id)||(!session.power&&id!=='specialty_quickrevive'))return false;
    if(id==='specialty_quickrevive'&&session.revives>=3){toast('Quick Revive is depleted');return false;}if(!pay(p.price))return false;
    if(!session.drink(id))return false;primary=false;primaryPressed=false;ads=false;burstLeft=0;reloadShot=false;perkDrink.start(id,view);toast(p.name);audio.play(id);return true;
  },
  boxPrompt(e){const roll=mysteryBox.at(e);return roll?(roll.ready?(roll.teddy?'The Mystery Box is moving…':'Take '+(data.weapons[roll.weapon]??data.equipment[roll.weapon]).name):'Choosing your weapon…'):'Mystery Box · '+(session.effects.fire_sale>session.time?10:950);},
  useBox(e){
    if(mysteryBox.at(e)){if(session.pack?.weapon===session.weapon)return false;const weapon=mysteryBox.take(e);if(!weapon)return false;if(weapon==='zombie_cymbal_monkey'){session.giveMonkeys();toast('Monkey Bombs · X to throw');}else{session.giveWeapon(weapon);equipView();toast(data.weapons[weapon].name);}return true;}
    const cost=session.effects.fire_sale>session.time?10:950;
    if(session.points<cost){toast('Not enough points');return false;}
    if(!mysteryBox.start(e))return false;session.spend(cost);return true;
  },
  packPrompt(needPower=false){return needPower&&!session.power?'The power must be activated':session.pack?(session.time>=session.pack.readyAt?'Take '+data.weapons[session.pack.weapon.id].upgrade.name+' · '+Math.ceil(session.pack.expires-session.time)+'s':'Upgrading weapon…'):session.weapon.upgraded?'Weapon already upgraded':'Pack-a-Punch · 5000';},
  usePack(){
    if(session.pack){if(!session.takePack())return false;equipView();toast(session.def.name);return true;}
    if(!session.beginPack())return false;ads=false;primary=false;burstLeft=0;reloadShot=false;audio.play('packapunch');toast('Upgrading… retrieve your weapon when it is ready.');return true;
  },
  powerOn(text='THE LIGHTS COME ON'){session.power=true;session.flags.add('power_on');world.setDoors(session);ambient.intensity=1.7;announce('Power restored',text);audio.play('round');return true;},
};
function findPrompt(){
  prompt=null;promptText='';
  const found=map.findPrompt(camera);let distance=found?.distance??Infinity;if(found){prompt=found.target;promptText=found.text??'';}
  for(const b of world.barriers){if(!map.boardCount(b))continue;const d=camera.position.distanceTo(map.barrierPoint?.(b)??b.position);if(d<100&&d<distance){prompt={barrier:b};distance=d;}}
  if(prompt?.barrier)promptText=prompt.barrier.count<map.boardCount(prompt.barrier)?'Hold F to rebuild barricade':'Barricade secured';
}
function interact(){
  if(!active||session.busy)return false;findPrompt();if(!prompt)return false;
  if(prompt.barrier)return repair(prompt.barrier);
  return !!map.interact(prompt);
}
function repair(b){if(b.count>=map.boardCount(b)||repairLeft>0)return false;repairLeft=.75;world.setBoards(b,b.count+1);if(b.rewardRound!==session.round){b.rewardRound=session.round;b.reward=0;}if(b.reward<50*session.round){session.addPoints(10);b.reward+=10;}audio.play('board');return true;}
function moveTo(position,yaw){player.setPosition(position.clone());if(yaw!=null)camera.rotation.set(0,yaw-Math.PI/2,0);flashUntil=session.time+.8;}
function reset(){
  pendingMelee=null;lastReloadSerial=0;reloadShot=false;
  touchControls.reset();mousePrimary=mouseAim=false;toastUntil=0;announcementUntil=0;hitUntil=0;flashUntil=0;primary=false;primaryPressed=false;ads=false;keys.clear();
  session.reset();ambient.intensity=1.2;map.beforeReset?.();enemies.reset();world.reset(session);
  const spawn=map.spawn();player.setSpawn(spawn.position);player.respawn();camera.rotation.set(0,spawn.yaw-Math.PI/2,0);
  powerups.reset();perkDrink.stop();mysteryBox.reset();features.reset();
  for(const group of [particles,grenades]){for(const item of group){item.mesh.removeFromParent();item.mesh.traverse?.(o=>{o.geometry?.dispose();o.material?.dispose();});}group.length=0;}
  map.reset?.();renderer.domElement.style.filter='';if(audio.ctx)audio.playMusic('ambience');
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
      const pad=globalThis.kino?.gamepad?.move;   // controller analog stick (mods/controller)
      const forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS'))+touch.forward+(pad?.forward??0),strafe=Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+touch.strafe+(pad?.strafe??0);
      const moving=Math.hypot(forward,strafe)>.01,sprint=((keys.has('ShiftLeft')||keys.has('ShiftRight'))&&moving||touch.sprint||pad?.sprint&&moving)&&!globalThis.kino?.movement?.state?.sliding&&!globalThis.kino?.movement?.state?.diving&&!ads&&!session.reloadLeft&&!session.meleeLeft&&!session.drinking;
      if(!map.prePlayer?.(dt))player.update(dt,session.phase==='reviving'?{}:{forward,strafe,sprint,crouch:keys.has('ControlLeft')||keys.has('ControlRight')||keys.has('KeyC')||touch.crouch,jump:keys.has('Space'),jumpPressed:touch.jump});
      if(world.bounds&&player.getFeetPosition().y<world.bounds.min.y-600){player.respawn();toast('You fell out of the map');}
      view.update(dt,{moving,sprint,ads:ads&&!session.def.dualWield,reloading:session.reloadLeft>0,empty:session.weapon.mag===0,time:session.time});
      view.pivot.visible=!session.weaponUnavailable&&!map.hideViewmodel?.();view.input={sprint,ads};   // this frame's input, for mods (inspect cancels on sprint/aim)
      perkDrink.update(dt,session);
      if(!sprint&&session.phase!=='reviving'&&(primaryPressed||(primary&&session.def.automatic)||burstLeft>0||reloadShot)){
        if(shoot()){reloadShot=false;if(burstLeft>0)burstLeft--;else if(session.def.fireType==='3-Round Burst')burstLeft=2;}
      }
      primaryPressed=false;
      enemies.update(dt,player.getFeetPosition());
      features.update(dt);
      if(reloadHeld&&performance.now()-reloadHeld>350){reloadHeld=0;mods.emit('inspect');}
      mods.emit('update',dt);
      repairLeft=Math.max(0,repairLeft-dt);findPrompt();if((keys.has('KeyF')||keys.has('KeyE')||touch.use)&&prompt?.barrier)repair(prompt.barrier);
      if((session.round!==lastRound||session.phase!==lastPhase)&&map.announceRounds?.()!==false){if(session.phase==='fighting'){announce(session.dogRound?'Fetch their souls':'Round '+session.round,session.dogRound?'HELLHOUNDS':'SURVIVE');audio.play(session.dogRound?'dog_round':'round');if(session.dogRound)audio.play('dog_announce');}else if(session.phase==='preparing'&&session.round>1){announce('Round survived','RELOAD. REBUILD. PREPARE.');audio.play('round_end');}lastRound=session.round;lastPhase=session.phase;}
      mysteryBox.update(dt);
      map.update?.(dt);
      powerups.update(dt,player.getFeetPosition(),session.phase!=='reviving',(a,b)=>world.lineClear(a,b));
      for(const g of [...grenades]){
        g.life-=dt;g.velocity.y-=(map.gravityAt?.(g.mesh.position)??650)*dt;const travel=g.velocity.clone().multiplyScalar(dt),ray=new THREE.Ray(g.mesh.position.clone(),travel.clone().normalize()),hit=world.raycast(ray,0,travel.length()+4);
        if(hit){g.velocity.y=Math.abs(g.velocity.y)*.4;g.velocity.x*=-.4;g.velocity.z*=-.4;}else g.mesh.position.add(travel);
        if(g.life<=0){effect(g.mesh.position,0xffb347,30);audio.play('explosion');for(const z of [...enemies.list]){const d=z.root.position.distanceTo(g.mesh.position);if(d<300&&world.lineClear(g.mesh.position,z.root.position.clone().add(new THREE.Vector3(0,30,0))))enemies.hurt(z,Math.max(75,1500*(1-d/300)),false,false,'explosion');}const d=camera.position.distanceTo(g.mesh.position);if(d<160&&!session.perks.has('specialty_flakjacket'))damage(180*(1-d/160));g.mesh.removeFromParent();g.mesh.geometry.dispose();g.mesh.material.dispose();grenades.splice(grenades.indexOf(g),1);}
      }
      for(const p of [...particles]){p.life-=dt;p.velocity.y-=200*dt;p.mesh.position.addScaledVector(p.velocity,dt);if(p.life<=0){p.mesh.removeFromParent();p.mesh.geometry.dispose();p.mesh.material.dispose();particles.splice(particles.indexOf(p),1);}}
    }
  }
  muzzle.intensity=Math.max(0,muzzle.intensity-dt*2200);camera.fov=THREE.MathUtils.damp(camera.fov,ads&&!session.def.dualWield&&!session.drinking&&!session.meleeLeft&&!session.reloadLeft?(session.def.adsFov||56)*settings.fov/78:settings.fov,12,dt);camera.updateProjectionMatrix();
  hud();
}
function hud(){
  const s=session,w=s.weapon;
  const rt=map.roundText?.();$('round').textContent=rt?.round??(s.round<=5?'I'.repeat(s.round):String(s.round));$('remaining').textContent=rt?.remaining??(s.phase==='preparing'?'STARTS IN '+Math.max(0,Math.ceil(s.countdown)):(s.total-s.killed)+' REMAINING');
  $('points').textContent=s.points.toLocaleString();$('mag').textContent=s.weaponUnavailable?'—':w.mag;$('reserve').textContent=s.weaponUnavailable?'—':w.reserve;$('weapon-name').textContent=s.weaponUnavailable?(s.pack?'Weapon in Pack-a-Punch':'No weapon'):s.def.name;$('grenades').textContent='G · '+s.grenades+' GRENADES'+(s.claymoresOwned?'  |  4 · '+s.claymores+' CLAYMORES':'')+(s.monkeysOwned?'  |  X · '+s.monkeys+' MONKEYS':'');$('reload-label').textContent=s.weaponUnavailable?'':s.reloadLeft>0?'RELOADING':w.mag===0?'R TO RELOAD':s.weapon.upgraded&&data.weapons[w.id].upgrade?.attachment?'5 · SWITCH ATTACHMENT':'';
  if(touchControls.mode){$('grenades').textContent=$('grenades').textContent.replace('G · ','').replace('4 · ','').replace('X · ','');$('reload-label').textContent=$('reload-label').textContent.replace('R TO RELOAD','TAP RELOAD').replace('5 · SWITCH ATTACHMENT','TAP ALT FIRE');}
  $('health-fill').style.width=(100*s.health/s.maxHealth)+'%';$('health-label').textContent=Math.ceil(s.health)+' / '+s.maxHealth;
  $('hurt').style.opacity=s.health<s.maxHealth?(1-s.health/s.maxHealth)*.8:0;$('hitmarker').style.opacity=hitUntil>s.time?1:0;$('flash').style.opacity=Math.max(0,flashUntil-s.time);
  $('prompt').innerHTML=active&&promptText?(promptText==='Barricade secured'?promptText:touchControls.mode?'<kbd>USE</kbd> '+promptText.replace('Hold F','Hold USE'):'<kbd>F</kbd> '+promptText):'';
  if(toastUntil<s.time)$('toast').textContent='';if(announcementUntil<s.time)$('announcement').style.opacity=0;
  const perks=map.perkInfo??perkInfo,perkHtml=[...s.perks].filter(id=>perks[id]).map(id=>`<span class="perk" title="${perks[id].name}" style="background:${perks[id].color}">${perks[id].icon}</span>`).join('');if($('perks').innerHTML!==perkHtml)$('perks').innerHTML=perkHtml;
  const extra=map.hudEffects?.()??'';
  const effectHtml=Object.entries(s.effects).filter(([k,t])=>t>s.time&&powerupNames[k]).map(([k,t])=>`<span class="powerup-timer ${t-s.time<5&&Math.floor(s.time*4)%2?'expiring':''}"><img src="${data.powerups[k].icon}" alt="${powerupNames[k]}"><span>${Math.ceil(t-s.time)}s</span></span>`).join('')+extra;if($('effects').innerHTML!==effectHtml)$('effects').innerHTML=effectHtml;
  const where=map.location?.();if(where!=null&&$('location'))$('location').textContent=where;
  $('objective').textContent=map.objective?.()??'';
  if(debugVisible)$('debug').textContent=`${fps} FPS · ${renderer.info.render.calls} calls\n${camera.position.toArray().map(v=>v.toFixed(1)).join(', ')}\n${enemies.list.length} enemies · ${world.navDisabled?.size??0} blocked polygons`;
}

function getState(){return {map:entry?.id,ready,active,started,input:{touch:touchControls.getState(),primary,ads},...(session?session.snapshot():{}),player:player?{...player.state,rotation:camera.rotation.toArray().slice(0,3),position:camera.position.toArray(),feet:player.getFeetPosition().toArray()}:null,enemies:enemies?.snapshot()??[],prompt:promptText,
  barriers:world?.barriers?.map(b=>({id:b.id,count:b.count,boards:map.boardCount(b),position:b.position.toArray(),inside:b.inside.toArray(),group:b.group}))??[],
  performance:{fps,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},viewmodelReady:view?.ready??false,...(map?.state?.()??{}),errors:[...errors,...mods.errors]};}
globalThis.kino={mods,debug:{getState,setActive,pause:()=>setActive(false),resume:()=>setActive(true),reset,teleportPlayer:p=>player.setPosition(vector(p)),lookAt:p=>camera.lookAt(vector(p)),damagePlayer:damage,grantPoints:n=>session.points+=n,interact,shoot,reload,melee,
  giveWeapon:id=>{session.giveWeapon(id);equipView();},spawnEnemy:(p,kind)=>enemies.spawn(vector(p),null,kind).id,clearEnemies:()=>{for(const z of [...enemies.list])enemies.hurt(z,999999);},collectPowerup:collect,
  step:seconds=>{for(let t=0;t<seconds;t+=1/60)update(Math.min(1/60,seconds-t));},navigationPath:(a,b)=>world.path(vector(a),vector(b)).map(v=>v.toArray()),
  setAutoSpawn:value=>{enemies.autoSpawn=value;enemies.autoRounds=value;},setInvulnerable:value=>{session.effects.invulnerable=value?Infinity:0;},damageEnemy:(id,n=999999)=>{const z=enemies.list.find(z=>z.id===id);if(z)enemies.hurt(z,n);},
  setRound:n=>{enemies.reset();while(session.round<n)session.nextRound();session.countdown=0;session.spawned=0;session.killed=0;},lastShot:()=>lastShot,assets:assetDiagnostics,
  aimAtEnemy:(id,head=true)=>{const z=enemies.list.find(z=>z.id===id);if(z)camera.lookAt(head?enemies.headPosition(z):z.root.position.clone().add(new THREE.Vector3(0,z.kind==='zombie'?40:25,0)));},
  boxState:()=>mysteryBox.snapshot(),dropPowerup:(type,p)=>{powerups.spawn(type,vector(p));return powerups.snapshot();},fog:()=>scene.fog?.density??0,
  showCollision:value=>{world.collision.setDebugVisible(value);scene.add(world.collision.mesh);},
  memoryState:()=>{
    const textures=new Set(),sources=new Set(),geometries=new Set();let textureBytes=0,geometryBytes=0;
    for(const root of [scene,viewScene])root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const material of [object.material].flat().filter(Boolean))for(const value of Object.values(material))if(value?.isTexture)textures.add(value);});
    for(const texture of textures){if(sources.has(texture.source))continue;sources.add(texture.source);const image=texture.image;if(image)textureBytes+=(image.width??0)*(image.height??0)*4*(texture.generateMipmaps?4/3:1);}
    for(const geometry of geometries){for(const attribute of Object.values(geometry.attributes))geometryBytes+=(attribute.array??attribute.data?.array)?.byteLength??0;geometryBytes+=geometry.index?.array.byteLength??0;}
    return {...assetDiagnostics(),textureBytes:Math.round(textureBytes),geometryBytes,collisionBytes:world?.collision?.metadata?.byteLength,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,renderedFrames,contextLost,antialias:renderer.getContext().getContextAttributes()?.antialias};
  },
  simulateContextLoss:()=>renderer.forceContextLoss(),simulateContextRestore:()=>renderer.forceContextRestore(),
  useEquipment:kind=>kind==='claymores'?features.placeClaymore():features.throwMonkey(),giveMonkeys:()=>session.giveMonkeys(),
  toggleAttachment:()=>{if(session.toggleAttachment()){equipView();return true;}return false;},
  pickSurface:(x,y)=>{const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x/innerWidth*2-1,1-y/innerHeight*2),camera);const meshes=[];scene.traverseVisible(o=>{if(o.isMesh)meshes.push(o);});return ray.intersectObjects(meshes,false).slice(0,4).map(h=>({object:h.object.name,material:(Array.isArray(h.object.material)?h.object.material[h.face.materialIndex]:h.object.material).name,point:h.point.toArray()}));},
  audioState:()=>audio.snapshot(),weaponVisual:()=>view.snapshot(),grantScore:n=>session.addPoints(n),
  setBoards:(id,count)=>world.setBoards(world.barriers.find(b=>b.id===id),count),
}};

// The context a map module works through.
const ctx={
  THREE,scene,camera,renderer,audio,mods,ambient,hemi,keyLight,fill,keys,profile,perkInfo,vector,shop,viewScene,viewCamera,
  get data(){return data;},get world(){return world;},get session(){return session;},get player(){return player;},get enemies(){return enemies;},
  get view(){return view;},get features(){return features;},get mysteryBox(){return mysteryBox;},get powerups(){return powerups;},get perkDrink(){return perkDrink;},get active(){return active;},
  collect,clearInput:()=>{primary=primaryPressed=ads=false;burstLeft=0;mousePrimary=mouseAim=false;},
  toast,announce,effect,damage,equipView,moveTo,flash:(s=.8)=>{flashUntil=session.time+s;},progress,
  setFilter:f=>{renderer.domElement.style.filter=f;},
};
try{
  progress('Reading map list',3);
  const id=new URLSearchParams(location.search).get('map')??'kino',list=await fetch('mods/maps.json').then(r=>r.json());
  entry=list.maps.find(m=>m.id===id);
  if(!entry)throw new Error(`"${id}" is not a map in mods/maps.json`);
  const module=entry.module??(entry.dir?'custom':entry.id);
  map=await (await import(`./maps/${module}.js`)).createMap(ctx,entry);
  Object.assign(globalThis.kino.debug,map.debug??{});
  $('map-kicker')&&($('map-kicker').innerHTML=entry.kicker??'ZOMBIES <span>'+(entry.dir?'CUSTOM MAP':'SOLO')+'</span>');$('map-place')&&($('map-place').textContent=entry.place??(entry.dir?'CUSTOM MAP':''));
  document.title=(map.title??entry.title)+' — Zombies';$('map-title')&&($('map-title').textContent=entry.title);$('map-tagline')&&($('map-tagline').textContent=entry.tagline??entry.description??'Survive as long as you can.');$('top-map')&&($('top-map').textContent=entry.title.toUpperCase());
  progress('Loading game data',6);
  mods.mapId=entry.id;data=await mods.load(await map.loadData());session=new (map.Session??KinoSession)(data);
  world=await map.loadWorld(progress);
  const spawn=map.spawn();
  player=new PlayerController(camera,world.physics,{spawn:spawn.position,spawnIsEye:false,radius:14,height:70,eyeHeight:60,moveSpeed:190,sprintSpeed:285,crouchSpeed:95,gravity:800,jumpHeight:39,fallResetY:(world.bounds?.min.y??0)-800,maxSubSteps:12,groundSnapSpeed:10,...map.player});
  camera.rotation.set(0,spawn.yaw-Math.PI/2,0);world.setDoors(session);
  progress('Loading weapons and the undead',80);view=new ViewWeapon(viewScene,data,(name,def)=>audio.notify(name,def));enemies=new (map.Enemies??Enemies)(scene,world,data,session,{damage,kill,hit,sound:(kind,p)=>audio.play(kind,Math.max(0,1-p.distanceTo(camera.position)/1000))});
  world.actors=()=>enemies.list;
  powerups=new Powerups(scene,data,audio,collect);perkDrink=new PerkDrink(viewScene,data,audio);mysteryBox=map.createMysteryBox?.()??new MysteryBox(scene,world,data,session,audio,toast);
  features=map.createFeatures({scene,world,data,session,enemies,player,camera,audio,effect,damage,toast});
  await Promise.all([enemies.load(),equipView(),audio.load(),powerups.load(),perkDrink.load(),mysteryBox.load(),features.load()]);player.update(.05,{});
  await map.ready?.();
  progress('Loading mods',95);await mods.start({renderer,data,session,world,player,enemies,scene,camera,audio,features,mysteryBox,powerups,view,viewScene,perkDrink,toast,announce,equipView,damage,getState,setActive,reset,map:entry});if(!profile.mobile)mysteryBox.warm(renderer,camera);
  ready=true;
  progress('Ready',100);$('loading').hidden=true;$('start').disabled=contextLost;$('menu-status').textContent=contextLost?'Graphics paused. Waiting for the browser to restore the game…':touchControls.mode?'Tap to start':'Click to capture the mouse · Esc to pause';
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
