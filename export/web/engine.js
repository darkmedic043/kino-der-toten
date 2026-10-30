// The game (not part of upstream's layout): one engine for every map. The website is the core
// and a map is content it loads: play.html?map=<id> reads mods/maps.json, imports the map's
// module (maps/<module>.js) and runs it. The engine owns the renderer, input, player, weapons,
// enemies, power-ups, perks, the Mystery Box, Pack-a-Punch, barricades, rounds, the HUD, the
// debug API and mods; a map supplies its world, spawn, interactions and its own systems (Kino's
// teleporter and traps, a custom map's Easter eggs...). Built from upstream's game.js and the
// fork's zombies.js, which were two copies of this loop.
import * as THREE from 'three';
import { textureMemoryStats, setPrimaryRenderer, pendingImages, pendingImageCount } from './texture-memory.js';   // first: frees decoded texture images once uploaded
import './skinned-bounds.js';   // fast SkinnedMesh bounds for every rigged model (no hitch when a zombie first draws)
import { PlayerController } from './player-controller.js';
import { ViewWeapon, pendingModels } from './animation.js';
import { Enemies } from './enemies.js';
import { KinoSession } from './kino-session.js';
import { firesBoth } from './rules.js';
import { GameAudio } from './audio.js';
import { Powerups } from './powerups.js';
import { PerkDrink } from './perk-drink.js';
import { MysteryBox } from './mystery-box.js';
import { createInstanceCuller } from './instance-cull.js';
import { createStaticFreeze } from './static-freeze.js';
import { mergeStaticMeshes } from './scene-merge.js';
import { createZombieTouch } from './zombies-touch.js';
import { configureKinoAssets, assetDiagnostics } from './runtime-assets.js';
import { ModHost } from './mod-loader.js';
import { settings } from './settings.js';
import { installGameMenu } from './game-menu.js';
import { createPerfDiag } from './perf-diag.js';
import { setupKtx2, ktx2Stats } from './ktx2.js';
import { stillSkeletons, hideBones } from './still-skeletons.js';
import { padOnly } from './seat.js';   // Rind split screen: a controller-only half has no focus to lose

export const vector=a=>new THREE.Vector3().fromArray(a);
export const perkInfo={specialty_quickrevive:{name:'Quick Revive',price:1500,color:'#509ebc',icon:'QR'},specialty_fastreload:{name:'Speed Cola',price:3000,color:'#478450',icon:'SC'},specialty_rof:{name:'Double Tap',price:2000,color:'#b37528',icon:'DT'},specialty_armorvest:{name:'Juggernog',price:2500,color:'#a53835',icon:'J'}};
const powerupNames={nuke:'Nuke',insta_kill:'Insta-Kill',double_points:'Double Points',full_ammo:'Max Ammo',carpenter:'Carpenter',fire_sale:'Fire Sale',death_machine:'Death Machine'};

const $=id=>document.getElementById(id), keys=new Set(),audio=new GameAudio(),mods=new ModHost();
const profile=configureKinoAssets();
audio.maxBufferBytes=profile.mobile?16*1024*1024:Infinity;audio.preload=!profile.mobile;
const renderer=new THREE.WebGLRenderer({antialias:!profile.mobile,powerPreference:profile.mobile?'default':'high-performance'});setPrimaryRenderer(renderer);   // only its uploads free images (texture-memory.js)
setupKtx2(renderer);   // GPU-compressed copies of the textures for every glTF loaded from here on (ktx2.js)
renderer.setPixelRatio(Math.min(devicePixelRatio,profile.mobile?1:1.5));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;
// smallest instanced prop drawn, in screen pixels, by graphics quality (Low..Ultra; instance-cull.js)
const CULL_PIXELS=[6,4,3,2];let instanceCull=null,staticFreeze=null;
// three draws a transparent double-sided material in two passes and flags it needsUpdate before each, which re-checks
// its program twice a draw (on The Giant, a glass material and the viewmodel's decals: ~10% of a frame). One pass
// looks the same here. Swept once a second over both scenes for materials that appear later (was lighting-mod only).
let singlePassTimer=0,programCount=0;
// Every shader program stays built for the whole session. three deletes a program as soon as no material uses it, so effects
// that make and dispose materials per use (Thundergun blast, DG-2 arcs, Ray Gun bolts) recompiled on every shot; on Windows
// (ANGLE on D3D11) each compile froze the game for 0.3-1 s. Programs only accumulate per distinct shader setup (a few hundred).
let keptPrograms=0;
let standIns=null;   // effect stand-ins (below); declared here: warmShaders runs from the load sequence before the module reaches that line
function keepPrograms(){const ps=renderer.info.programs;for(;keptPrograms<ps.length;keptPrograms++)ps[keptPrograms].usedTimes++;}
// First draws (2026-10-24, user: freezes while playing and shooting; RTX 4070 Ti Super, ANGLE on D3D11). A program drawn
// for the first time with another vertex layout or into another kind of render target can make the driver build a new GPU
// pipeline (on D3D11 also an ANGLE shader variant) inside the GPU process: frames stop for up to seconds while no page
// code runs, so it shows in no CPU timing. Counted per frame (program x layout x target format) for the perf log's hitches.
let lastFirstDraws=0,lastFirstNames=[];
const firstDraw={n:0,names:[],seen:new WeakMap(),layouts:new Map(),geo:new WeakMap(),targets:new Map(),rt:new WeakMap(),lateFrom:Infinity,lateSeen:new Set(),late:[]};
{const fd=firstDraw,direct=renderer.renderBufferDirect,sig=a=>a?(a.isInterleavedBufferAttribute?a.data.array:a.array)?.constructor.name+a.itemSize+(a.normalized?'n':'')+(a.isInstancedBufferAttribute||a.data?.isInstancedInterleavedBuffer?'i':''):'',
  layout=g=>{let id=fd.geo.get(g);if(id===undefined){const k=Object.keys(g.attributes).sort().map(n=>n+':'+sig(g.attributes[n])).join();id=fd.layouts.get(k);if(id===undefined)fd.layouts.set(k,id=fd.layouts.size);fd.geo.set(g,id);}return id;},
  target=t=>{if(!t)return 0;let id=fd.rt.get(t);if(id===undefined){const k=[t.texture?.format,t.texture?.type,t.samples,t.textures?.length,t.depthBuffer,t.isWebGLCubeRenderTarget].join();id=fd.targets.get(k);if(id===undefined)fd.targets.set(k,id=fd.targets.size+1);fd.rt.set(t,id);}return id;};
  renderer.renderBufferDirect=function(camera,scene,geometry,material,object,group){direct.call(this,camera,scene,geometry,material,object,group);
    const program=this.properties.get(material).currentProgram;if(!program||!geometry)return;
    let seen=fd.seen.get(program);if(!seen)fd.seen.set(program,seen=new Set());const key=(layout(geometry)*4+(object.isPoints?1:object.isLine?2:0))*64+target(this.getRenderTarget());
    if(!seen.has(key)){seen.add(key);fd.n++;if(fd.names.length<3)fd.names.push(String(material.name||material.type).slice(0,24));}
    // a program compiled after the warm-up: what drew it (material, object chain, vertex layout, scene), for the perf log
    if(program.id>=fd.lateFrom&&!fd.lateSeen.has(program.id)){fd.lateSeen.add(program.id);if(fd.late.length<16){let chain='',o=object;for(let i=0;i<4&&o;i++,o=o.parent)chain+=(i?'<':'')+(o.name||o.type);
      fd.late.push(`${material.type.replace('Material','')}:${material.name||''}|${chain}|${Object.keys(geometry.attributes).join('/')}|${scene===viewScene?'view':'world'}`.slice(0,120));}}};}
// Texture uploads per frame (count, KB, mipmap builds), for the perf log's hitches: a hitch with no first draws and an idle
// main thread but uploads in its frame is the GPU process converting and creating textures (2026-10-29, the user's logs).
const texUp={n:0,kb:0,mip:0};
let lastTex={n:0,kb:0,mip:0,gl:{}};const fences=[];let fenceSupported=null;   // declared here: the frame loop runs during loading, before the module body reaches the probes below
{const gl=renderer.getContext();const px=(w,h)=>Math.round(w*h*4/1024);
  const texLog=new URLSearchParams(location.search).has('texLog')?(globalThis.kinoTexLog=[]):null;if(texLog)Error.stackTraceLimit=30;   // ?texLog: every upload with its caller (debug)
  const wrap=(name,kb)=>{const f=gl[name];if(typeof f!=='function')return;gl[name]=function(...a){texUp.n++;const k=kb(a)||0;texUp.kb+=k;
    if(texLog&&texLog.length<4000)texLog.push([Math.round(performance.now()),name,k,a[0],String(new Error().stack).split('\n').slice(2,k>100?16:7).map(l=>l.trim().replace(/^at /,'').replace(/https?:\/\/[^/]+\//,'')).join(' < ')]);return f.apply(this,a);};};
  wrap('texImage2D',a=>a.length>=9?px(a[3],a[4]):px(a[5]?.width??0,a[5]?.height??0));wrap('texSubImage2D',a=>a.length>=9?px(a[4],a[5]):px(a[6]?.width??0,a[6]?.height??0));
  wrap('texImage3D',a=>px(a[3],a[4])*(a[5]||1));wrap('texSubImage3D',a=>px(a[5],a[6])*(a[7]||1));wrap('texStorage2D',a=>px(a[3],a[4])*4/3);wrap('texStorage3D',a=>px(a[3],a[4])*(a[5]||1));
  wrap('compressedTexImage2D',a=>Math.round((a[6]?.byteLength??a[7]??0)/1024));wrap('compressedTexSubImage2D',a=>Math.round((a[8]?.byteLength??a[9]??0)/1024));
  const gm=gl.generateMipmap;gl.generateMipmap=function(...a){texUp.mip++;return gm.apply(this,a);};
  // other GL work per frame, for the same hitch records ('gl ...'): buffer uploads (count/KB), objects made and deleted,
  // shader links, and the calls that wait on the GPU process (getError, finish, readPixels, clientWaitSync, get*Parameter)
  texUp.gl={};const count=(name,kb)=>{const f=gl[name];if(typeof f!=='function')return;gl[name]=function(...a){const glc=texUp.gl;glc[name]=(glc[name]||0)+1;if(kb){const k=kb(a);if(k)glc[name+'KB']=(glc[name+'KB']||0)+k;}return f.apply(this,a);};};
  const bytes=a=>{const d=a.find(x=>x&&typeof x==='object'&&'byteLength' in x);return d?Math.round(d.byteLength/1024):typeof a[1]==='number'?Math.round(a[1]/1024):0;};
  count('bufferData',bytes);count('bufferSubData',bytes);for(const n of ['createBuffer','createTexture','deleteBuffer','deleteTexture','createVertexArray','deleteVertexArray','createFramebuffer','createRenderbuffer','renderbufferStorageMultisample','compileShader','linkProgram','getError','finish','flush','readPixels','clientWaitSync','getProgramParameter','getShaderParameter','getUniformLocation','getParameter','getBufferSubData','blitFramebuffer','invalidateFramebuffer'])count(n);}
const NO_STILL=new URLSearchParams(location.search).has('noStill');   // A/B switch for still-skeletons.js
const NO_WARM_DRAW=new URLSearchParams(location.search).has('noWarmDraw'),NO_GPU_WAIT=new URLSearchParams(location.search).has('noGpuWait');   // A/B switch for warmShaders' draw pass
const singlePass=root=>root?.traverse(o=>{if(o.material)for(const m of [o.material].flat())if(m?.transparent&&m.side===THREE.DoubleSide&&!m.forceSinglePass)m.forceSinglePass=true;});
let previous=performance.now(),lastRendered=0,renderedFrames=0,contextLost=false,resizeTimer,leaving=false;
let timerExt=null,gpuQ=[];try{timerExt=new URLSearchParams(location.search).has('noGpuTimer')?null:renderer.getContext().getExtension('EXT_disjoint_timer_query_webgl2');}catch{}   // (2026-10-27) GPU time per frame for the perf log (gpuBegin/gpuEnd)
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.6;renderer.autoClear=false;
document.body.prepend(renderer.domElement);
installGameMenu({renderer,audio,pixelRatio:Math.min(devicePixelRatio,profile.mobile?1:1.5),started:()=>started&&session?.phase!=='gameover'});
const scene=new THREE.Scene();scene.background=new THREE.Color(0x101319);
const ambient=new THREE.AmbientLight(0xb3bcc7,1.2),hemi=new THREE.HemisphereLight(0xd2d9e3,0x574236,2.0);scene.add(ambient,hemi);
const keyLight=new THREE.DirectionalLight(0xffdfb1,1.5);keyLight.position.set(.4,1,.2);scene.add(keyLight);
const fill=new THREE.DirectionalLight(0x8cabc9,.7);fill.position.set(-1,.5,-.5);scene.add(fill);
const camera=new THREE.PerspectiveCamera(78,innerWidth/innerHeight,1,30000);camera.rotation.order='YXZ';
const viewScene=new THREE.Scene(),viewCamera=new THREE.PerspectiveCamera(51,innerWidth/innerHeight,.01,200);   // BO1 cg_fov 65 on 4:3 = 50.9° vertical; wider showed the viewmodels unseen, stretched rear faces
viewScene.matrixAutoUpdate=false;   // (2026-10-25) the root never moves; composing it each frame forced the whole view tree through the walk (skipHidden below)
viewScene.add(new THREE.AmbientLight(0xe1d9c7,2.8));const vl=new THREE.DirectionalLight(0xffefc8,2);vl.position.set(0,4,2);viewScene.add(vl);
const muzzle=new THREE.PointLight(0xffc276,0,240,1);scene.add(muzzle);
let entry,map,data,world,session,player,enemies,view,powerups,perkDrink,mysteryBox,features,ready=false,active=false,started=false,primary=false,primaryPressed=false,ads=false,leftPressed=false,lastTouchAim=false;
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
function progress(text,percent){$('load-label').textContent=text;$('load-progress').style.width=percent+'%';diag('stage',{stage:text});}
// Load diagnostics (2026-10-15, a black Rind window while loading on the user's Windows PC): stages, a 2 s heartbeat until
// 20 s after ready, WebGL context loss and errors go to /api/client-log (kino-server writes client-log.jsonl), so the
// last line before a crash says where it died.
const diagT0=performance.now();let diagSent=0,diagGpu='';
function diag(ev,extra={}){
  if(diagSent++>120)return;
  try{if(!diagGpu){const gl=renderer.getContext(),d=gl.getExtension('WEBGL_debug_renderer_info');diagGpu=d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);}}catch{}
  try{navigator.sendBeacon('/api/client-log',JSON.stringify({ev,page:location.pathname+location.search,t:+((performance.now()-diagT0)/1000).toFixed(1),gpu:diagGpu,ua:navigator.userAgent,
    heap:performance.memory?Math.round(performance.memory.usedJSHeapSize/1e6):null,lim:performance.memory?Math.round(performance.memory.jsHeapSizeLimit/1e6):null,frames:renderedFrames,calls:renderer.info?.render?.calls,ready,...extra}));}catch{}
}
// play-time frame timing (perf-diag.js): 10 s summaries while playing, one for the session when the page goes away
const perf=createPerfDiag({context:()=>({kept:keptPrograms,q:settings.graphics,scale:settings.renderScale,cap:settings.fpsCap,px:renderer.domElement.width+'x'+renderer.domElement.height,
  calls:renderer.info?.render?.calls,tris:renderer.info?.render?.triangles,tex:renderer.info?.memory?.textures,zombies:enemies?.list?.length??0,round:session?.round,coop:!!globalThis.kino?.coop?.code})});mods.perf=perf;
addEventListener('pagehide',()=>perf.end());
{const emit=mods.emit.bind(mods),skip=new Set(['update','frame','warm','render','tick']);mods.emit=(ev,...a)=>{if(!skip.has(ev))perf.event?.(ev);return emit(ev,...a);};}
let evRound=0,evZ=0,evDef=null;
{const beat=setInterval(()=>{diag('beat',{label:$('load-label')?.textContent});if(ready&&performance.now()-diagT0>0&&(diag.readyAt??=performance.now())&&performance.now()-diag.readyAt>20000)clearInterval(beat);},2000);}
addEventListener('error',e=>diag('error',{message:String(e.message).slice(0,300),src:e.filename?.split('/').pop(),line:e.lineno}));
addEventListener('unhandledrejection',e=>diag('rejection',{message:String(e.reason?.message??e.reason).slice(0,300)}));
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
// mods.keepActive: a mod's UI (the terminal booth) frees the cursor without pausing the game
document.addEventListener('pointerlockchange',()=>{if((touchControls.mode||mods.keepActive)&&!document.pointerLockElement)return;setActive(document.pointerLockElement===renderer.domElement);});
function suspendRendering(){perf.pause();renderer.setAnimationLoop(null);if(ready){setActive(false);document.exitPointerLock?.();}audio.pause();}
function resumeRendering(){previous=performance.now();lastRendered=0;if(!document.hidden&&!contextLost)renderer.setAnimationLoop(renderFrame);}
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspendRendering();else resumeRendering();});
addEventListener('pagehide',suspendRendering);addEventListener('pageshow',resumeRendering);
// (2026-10-27) Leaving the page (Rind loads every match in the same window; the menu link too): give the GPU memory back now.
// A navigated-away document keeps its WebGL context, textures and JS heap until the browser gets round to collecting it,
// and the next match then loads beside the old one (a reload began with 2.7 GB of the old heap still there and froze for
// minutes). Losing the context frees everything on the GPU side at once; the old objects become plain garbage.
addEventListener('pagehide',e=>{if(e.persisted||leaving)return;leaving=true;contextLost=true;renderer.setAnimationLoop(null);
  try{for(const q of gpuQ)renderer.getContext().deleteQuery(q.q);gpuQ=[];renderer.dispose();renderer.forceContextLoss();}catch{}});
renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();if(leaving)return;diag('contextlost');contextLost=true;suspendRendering();$('start').disabled=true;$('menu-status').textContent='Graphics paused. Waiting for the browser to restore the game…';});
renderer.domElement.addEventListener('webglcontextrestored',()=>{diag('contextrestored');if(textureMemoryStats().released){location.reload();return;}/* freed images can't be re-uploaded: start fresh */contextLost=false;$('start').disabled=!ready;$('menu-status').textContent='Graphics restored · click to resume';resumeRendering();});
addEventListener('blur',()=>{keys.clear();primary=false;ads=false;if(started&&active&&!padOnly()){setActive(false);document.exitPointerLock?.();}});
addEventListener('mousemove',e=>{if(!active||document.pointerLockElement!==renderer.domElement)return;const sensitivity=(ads?.0012*settings.adsSensitivity:.002)*settings.sensitivity;camera.rotation.y-=e.movementX*sensitivity;camera.rotation.x=THREE.MathUtils.clamp(camera.rotation.x-e.movementY*sensitivity*(settings.invertY?-1:1),-1.5,1.5);});
// mouseHands: the last trigger was a real mouse (the controller mod's clicks are synthetic): on a dual pair the left button
// fires the left gun and the right button the right one; a pad (R2/L2) and touch keep fire = right gun, aim = left gun
let mouseHands=false;
addEventListener('mousedown',e=>{if(!active||e.sourceCapabilities?.firesTouchEvents||e.target.closest?.('#touch-controls'))return;mouseHands=e.isTrusted;if(e.button===0){mousePrimary=primary=true;primaryPressed=true;}if(e.button===2){mouseAim=ads=true;leftPressed=true;}});
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
// dual wield has no aim, except the XMG's lockdown (def.lockdown: mods/bo3-weapons/aw.js poses it)
const aiming=()=>ads&&(!session.def.dualWield||!!session.def.lockdown);
const blocked=()=>!!map?.blocked?.()||!!mods.gunBlocked;   // gunBlocked: a mod has put the gun away (operator weapons)
// hand: which gun of a dual pair fires (each has its own trigger and mag, rules.js dualMags); pressed: its trigger was
// just pulled (an empty gun then clicks and reloads: itself, and the other gun too unless that one is full)
function shoot(hand='right',pressed=primaryPressed){
  if(!active||blocked()||!view.ready||view.mode==='raise'||session.busy||session.weaponUnavailable)return false;
  if(session.reloadLeft>0&&session.def.segmentedReload&&session.weapon.mag>0){session.interruptReload();reloadShot=true;return false;}
  if(!session.fireHand(hand)){if(session.handMag(hand)===0&&pressed&&(!firesBoth(session.def)||session.weapon.mag===0)){audio.weapon('empty',session.def);reload();}return false;}
  session.lastHand=session.def.dualWield?hand:'right';   // for mods (movement/fp.js kicks that arm)
  view.shoot({ads:aiming()&&!session.def.dualWield,empty:session.handMag(hand)===0,hand:session.lastHand});audio.weapon('shot',session.def);muzzle.position.copy(camera.position);muzzle.intensity=160;{const d=session.def;camera.rotation.x=Math.min(1.48,camera.rotation.x+(aiming()?.008*(d.adsRecoilScale??d.recoilScale??1):.015*(d.recoilScale??1)));}   // def.recoilScale/adsRecoilScale: a gun's own camera climb (the XMG)
  const forward=camera.getWorldDirection(new THREE.Vector3()),base=session.def.baseId??session.weapon.id;
  if(map.fire?.(session.def,forward))return true;   // a map's own weapons (Moon's Wave Gun / Zap Guns)
  for(const f of mods.fireHooks??[])if(f(session.def,forward,{ads:aiming()}))return true;   // a mod's own projectiles (bo7-weapons: the Grimhawk)
  if(base==='thundergun_zm'){
    for(const z of [...enemies.list]){const d=z.root.position.clone().add(new THREE.Vector3(0,40,0)).sub(camera.position);if(d.length()<600&&d.normalize().dot(forward)>.65&&world.lineClear(camera.position,z.root.position.clone().add(new THREE.Vector3(0,40,0))))enemies.hurt(z,100000,false,false,'thunder');}
    effect(camera.position.clone().addScaledVector(forward,100),0xb9d8e5,22);return true;
  }
  if(session.def.projectileSpeed>0){features.shoot(session.def,forward);return true;}
  const pellets=Math.max(1,session.def.pellets),reach=map.shotRange??8000;
  for(let i=0;i<pellets;i++){
    const direction=forward.clone();if(pellets>1||!aiming()){const spread=(pellets>1?(session.def.pelletSpread??.055):(session.def.hipSpread??.012))*(session.perks.has('specialty_deadshot')?.5:1);/* Deadshot Daiquiri: half the hip-fire spread */direction.x+=(Math.random()-.5)*spread;direction.y+=(Math.random()-.5)*spread;direction.z+=(Math.random()-.5)*spread;direction.normalize();}
    const ray=new THREE.Ray(camera.position.clone(),direction),wall=world.raycast(ray,1,reach),target=enemies.rayHit(ray,wall?.distance??reach);
    const pierce=session.def.pierce??0,stop=pierce&&target?wall?.distance??reach:Math.min(wall?.distance??reach,target?.distance??reach);   // a piercing bullet (def.pierce: zombies it goes on through, the RW1) stops at the wall
    map.onShot?.(ray,stop,'bullet');
    mods.emit('shot',{origin:ray.origin,direction,distance:stop,hit:!!target,def:session.def,hand:session.def.dualWield?hand:undefined});   // per pellet, for mods (tracers)
    lastShot={origin:ray.origin.toArray(),direction:direction.toArray(),wallDistance:wall?.distance??null,target:target?{id:target.z.id,head:target.head,distance:target.distance}:null};
    if(target)for(let t=target,left=pierce,through=pierce&&new Set();t;t=left-->0?(through.add(t.z),enemies.rayHit(ray,wall?.distance??reach,through)):null){
      const d=t.distance>session.def.range?session.def.minDamage:session.def.damage;enemies.hurt(t.z,d*(t.head?Math.max(1,session.def.headMultiplier):1),t.head,false,session.def.explosionRadius?'explosion':'bullet');}
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
function reload(){if(!view.ready)return;if(session.reload()){burstLeft=0;ads=false;lastReloadSerial=session.reloadSerial;view.reload(session.reloadEmpty,session.reloadDuration,session.reloadStage,session.reloadHand);}}   // reloadHand: a dual pair's gun(s) that reload
const dualSwap=()=>mouseHands&&session.def.dualWield&&!firesBoth(session.def);
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
  if(session.claymoresOwned)return features.placeClaymore();   // one lethal slot: Claymores replace the frags (kino-session.js)
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
  perkPrompt(id){const p=perkInfo[id];if(!p)return '';return session.perks.has(id)?p.name+' equipped':!session.power&&id!=='specialty_quickrevive'?'The power must be activated':p.name+' · '+session.perkPrice;},
  buyPerk(id){
    const p=perkInfo[id];if(!p||session.perks.has(id)||(!session.power&&id!=='specialty_quickrevive'))return false;
    if(id==='specialty_quickrevive'&&session.revives>=3){toast('Quick Revive is depleted');return false;}const price=session.perkPrice;if(session.points<price){toast('Not enough points');return false;}
    if(!session.drink(id)||!pay(price))return false;session.markBought?.(id);primary=false;primaryPressed=false;ads=false;burstLeft=0;reloadShot=false;perkDrink.start(id,view);toast(p.name);audio.play(id);return true;
  },
  boxPrompt(e){const roll=mysteryBox.at(e);return roll?(roll.ready?(roll.teddy?'The Mystery Box is moving…':'Take '+(data.weapons[roll.weapon]??data.equipment[roll.weapon]).name):'Choosing your weapon…'):'Mystery Box · '+(session.effects.fire_sale>session.time?10:950);},
  useBox(e){
    if(mysteryBox.at(e)){if(session.pack?.weapon===session.weapon)return false;const weapon=mysteryBox.take(e);if(!weapon)return false;if(weapon==='zombie_cymbal_monkey'){session.giveMonkeys();toast('Monkey Bombs · X to throw');}else{session.giveWeapon(weapon);if(data.weapons[weapon])equipView();toast((data.weapons[weapon]??data.equipment?.[weapon])?.name??weapon);}return true;}
    const cost=session.effects.fire_sale>session.time?10:950;
    if(session.points<cost){toast('Not enough points');return false;}
    if(!mysteryBox.start(e))return false;session.spend(cost);return true;
  },
  packPrompt(needPower=false){return needPower&&!session.power?'The power must be activated':session.pack?(session.time>=session.pack.readyAt?'Take '+data.weapons[session.pack.weapon.id].upgrade.name+' · '+Math.ceil(session.pack.expires-session.time)+'s':'Upgrading weapon…'):session.weapon.upgraded?'Weapon already upgraded':data.weapons[session.weapon.id]?.upgrade?'Pack-a-Punch · 5000':'This weapon can\'t be upgraded';},
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
  // mods.prompts: [{find(camera) -> {text, distance} | null, use() -> bool}], usable spots added by mods on any map
  for(const m of mods.prompts??[]){const f=m.find(camera);if(f&&f.distance<distance){prompt={mod:m};promptText=f.text??'';distance=f.distance;}}
}
function interact(){
  if(!active||session.busy)return false;findPrompt();if(!prompt)return false;
  if(prompt.barrier)return repair(prompt.barrier);
  if(prompt.mod)return !!prompt.mod.use();
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
      if(session.reloadLeft>0&&session.reloadSerial!==lastReloadSerial){lastReloadSerial=session.reloadSerial;view.reload(false,session.reloadDuration,session.reloadStage,session.reloadHand);}
      const pad=globalThis.kino?.gamepad?.move;   // controller analog stick (mods/controller)
      const forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS'))+touch.forward+(pad?.forward??0),strafe=Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+touch.strafe+(pad?.strafe??0);
      const moving=Math.hypot(forward,strafe)>.01,sprint=((keys.has('ShiftLeft')||keys.has('ShiftRight'))&&moving||touch.sprint||pad?.sprint&&moving)&&!globalThis.kino?.movement?.state?.sliding&&!globalThis.kino?.movement?.state?.diving&&!ads&&!session.reloadLeft&&!session.meleeLeft&&!session.drinking;
      // Downed (co-op, or Quick Revive's self-revive): crawl about 40 units/s, low to the ground, instead of lying frozen.
      const crawl=40/Math.max(1,player.crouchSpeed??player.moveSpeed);
      if(!map.prePlayer?.(dt))player.update(dt,session.phase==='reviving'?{forward:forward*crawl,strafe:strafe*crawl,crouch:true}:{forward,strafe,sprint,crouch:keys.has('ControlLeft')||keys.has('ControlRight')||keys.has('KeyC')||touch.crouch,jump:keys.has('Space'),jumpPressed:touch.jump});
      if(world.bounds&&player.getFeetPosition().y<world.bounds.min.y-600){player.respawn();toast('You fell out of the map');}
      view.update(dt,{moving,sprint,ads:aiming(),reloading:session.reloadLeft>0,empty:session.weapon.mag===0,time:session.time});
      view.pivot.visible=!session.weaponUnavailable&&!map.hideViewmodel?.();view.input={sprint,ads,fire:primary};   // this frame's input, for mods (inspect cancels on sprint/aim; operator weapons read touch/pad fire)
      perkDrink.update(dt,session);
      if((!sprint||mods.sprintFire?.())&&session.phase!=='reviving'&&!mods.holdFire?.()&&(primaryPressed||(primary&&session.def.automatic)||burstLeft>0||reloadShot)){   // holdFire: a mod handles the fire button (bows: hold to draw on touch)
        if(shoot(dualSwap()?'left':'right')){reloadShot=false;if(burstLeft>0)burstLeft--;else if(session.def.fireType==='3-Round Burst')burstLeft=2;}
        if(firesBoth(session.def))shoot('left');   // the XMG: one trigger, both guns
      }
      // dual wield: the aim button is the other gun's trigger (the left one, or the right one with a mouse)
      if(touch.aim&&!lastTouchAim)leftPressed=true;lastTouchAim=!!touch.aim;
      if(session.def.dualWield&&!firesBoth(session.def)&&(!sprint||mods.sprintFire?.())&&session.phase!=='reviving'&&!mods.holdFire?.()&&(leftPressed||(ads&&session.def.automatic)))shoot(dualSwap()?'right':'left',leftPressed);
      primaryPressed=false;leftPressed=false;
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
  muzzle.intensity=Math.max(0,muzzle.intensity-dt*2200);camera.fov=THREE.MathUtils.damp(camera.fov,(aiming()&&!session.drinking&&!session.meleeLeft&&!session.reloadLeft?(session.def.adsFov||56)*settings.fov/78:settings.fov)+(mods.fovOffset??0),12,dt);   // mods.fovOffset: the movement mod's sprint/slide kickcamera.updateProjectionMatrix();
  hud();
}
const T=(id,v)=>{v=String(v);const el=$(id);if(el&&el.textContent!==v)el.textContent=v;};
function hud(){   // (2026-10-17) text and style written only when they change: every assignment invalidated layout each frame (~1% of a Der Eisendrache frame)

  const s=session,w=s.weapon;
  const rt=map.roundText?.();T('round',rt?.round??(s.round<=5?'I'.repeat(s.round):String(s.round)));T('remaining',rt?.remaining??(s.phase==='preparing'?'STARTS IN '+Math.max(0,Math.ceil(s.countdown)):(s.total-s.killed)+' REMAINING'));
  T('points',s.points.toLocaleString());T('mag',s.weaponUnavailable?'—':s.def.dualWield?s.handMag('left')+' · '+s.handMag('right'):w.mag);$('mag')?.classList.toggle('dual',!!s.def.dualWield&&!s.weaponUnavailable);T('reserve',s.weaponUnavailable?'—':w.reserve);T('weapon-name',s.weaponUnavailable?(s.pack?'Weapon in Pack-a-Punch':'No weapon'):s.def.name);T('grenades','G · '+s.grenades+' GRENADES'+(s.claymoresOwned?'  |  4 · '+s.claymores+' CLAYMORES':'')+(s.monkeysOwned?'  |  X · '+s.monkeys+' MONKEYS':''));T('reload-label',s.weaponUnavailable?'':s.reloadLeft>0?'RELOADING':w.mag===0?'R TO RELOAD':s.weapon.upgraded&&data.weapons[w.id].upgrade?.attachment?'5 · SWITCH ATTACHMENT':'');
  if(touchControls.mode){T('grenades',$('grenades').textContent.replace('G · ','').replace('4 · ','').replace('X · ',''));T('reload-label',$('reload-label').textContent.replace('R TO RELOAD','TAP RELOAD').replace('5 · SWITCH ATTACHMENT','TAP ALT FIRE'));}
  $('health-fill').style.width=(100*s.health/s.maxHealth)+'%';T('health-label',Math.ceil(s.health)+' / '+s.maxHealth);
  $('hurt').style.opacity=s.health<s.maxHealth?(1-s.health/s.maxHealth)*.8:0;$('hitmarker').style.opacity=hitUntil>s.time?1:0;$('flash').style.opacity=Math.max(0,flashUntil-s.time);
  $('prompt').innerHTML=active&&promptText?(promptText==='Barricade secured'?promptText:touchControls.mode?'<kbd>USE</kbd> '+promptText.replace('Hold F','Hold USE'):'<kbd>F</kbd> '+promptText):'';
  if(toastUntil<s.time)T('toast','');if(announcementUntil<s.time)$('announcement').style.opacity=0;
  const perks=map.perkInfo??perkInfo,perkHtml=[...s.perks].filter(id=>perks[id]).map(id=>`<span class="perk" title="${perks[id].name}" style="background:${perks[id].color}">${perks[id].icon}</span>`).join('');if($('perks').innerHTML!==perkHtml)$('perks').innerHTML=perkHtml;
  const extra=map.hudEffects?.()??'';
  const effectHtml=Object.entries(s.effects).filter(([k,t])=>t>s.time&&powerupNames[k]).map(([k,t])=>`<span class="powerup-timer ${t-s.time<5&&Math.floor(s.time*4)%2?'expiring':''}"><img src="${data.powerups[k].icon}" alt="${powerupNames[k]}"><span>${Math.ceil(t-s.time)}s</span></span>`).join('')+extra;if($('effects').innerHTML!==effectHtml)$('effects').innerHTML=effectHtml;
  const where=map.location?.();if(where!=null&&$('location'))T('location',where);
  T('objective',map.objective?.()??'');
  if(debugVisible)T('debug',`${fps} FPS · ${renderer.info.render.calls} calls\n${camera.position.toArray().map(v=>v.toFixed(1)).join(', ')}\n${enemies.list.length} enemies · ${world.navDisabled?.size??0} blocked polygons`);
}

// getState: mods call it every frame (some several times a physics step) mostly for .active/.ready/.started/.input, and
// the full snapshot (every zombie, barrier, door, egg) was ~10 MB/s of garbage on Cheese Cube (2026-10-17). The cheap
// fields are read directly; any other field builds the full snapshot once for that call. Spreading or serialising it
// (tests, kino.debug) still sees every field.
function getState(){
  const cheap={map:entry?.id,ready,active,started,input:{touch:touchControls.getState(),primary,ads}};let full=null;const all=()=>full??=fullState();
  return new Proxy(cheap,{get:(t,k)=>k in t?t[k]:all()[k],has:(t,k)=>k in t||k in all(),ownKeys:()=>Reflect.ownKeys(all()),
    getOwnPropertyDescriptor:(t,k)=>k in t?Reflect.getOwnPropertyDescriptor(t,k):k in all()?{value:all()[k],writable:true,enumerable:true,configurable:true}:undefined});
}
function fullState(){return {map:entry?.id,ready,active,started,input:{touch:touchControls.getState(),primary,ads},...(session?session.snapshot():{}),player:player?{...player.state,rotation:camera.rotation.toArray().slice(0,3),position:camera.position.toArray(),feet:player.getFeetPosition().toArray()}:null,enemies:enemies?.snapshot()??[],prompt:promptText,
  barriers:world?.barriers?.map(b=>({id:b.id,count:b.count,boards:map.boardCount(b),position:b.position.toArray(),inside:b.inside.toArray(),group:b.group}))??[],
  performance:{fps,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},viewmodelReady:view?.ready??false,...(map?.state?.()??{}),errors:[...errors,...mods.errors]};}
globalThis.kino={mods,debug:{textureMemory:textureMemoryStats,ktx2:ktx2Stats,getState,setActive,pause:()=>setActive(false),resume:()=>setActive(true),reset,teleportPlayer:p=>player.setPosition(vector(p)),lookAt:p=>camera.lookAt(vector(p)),damagePlayer:damage,grantPoints:n=>session.points+=n,interact,shoot,reload,melee,
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
  document.title=(map.title??entry.title)+' — Melon Zombies';$('map-title')&&($('map-title').textContent=entry.title);$('map-tagline')&&($('map-tagline').textContent=entry.tagline??entry.description??'Survive as long as you can.');$('top-map')&&($('top-map').textContent=entry.title.toUpperCase());
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
  progress('Loading mods',95);await mods.start({renderer,data,session,world,player,enemies,scene,camera,audio,features,mysteryBox,powerups,view,viewScene,perkDrink,toast,announce,equipView,damage,getState,setActive,reset,map:entry,shop,perkInfo:map.perkInfo??perkInfo,viewCamera});if(!profile.mobile)mysteryBox.warm(renderer,camera);
  // Performance for big ported maps (docs/fork/performance.md). A/B switches for benchmarks: ?noMerge ?noBatch ?noFreeze
  const perfOff=new URLSearchParams(location.search);
  // this runs 1-3 s of main-thread work: show it, and let the page paint between steps (a frozen page showed a black
  // screen before the game finished loading)
  const paint=()=>new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));
  progress('Optimizing the map',97);await paint();
  // opt-in per map: static level meshes merged per material (scene-merge.js)
  if(entry.mergeStatic&&world.root&&!perfOff.has('noMerge')){const t=performance.now(),r=mergeStaticMeshes(world.root,{exclude:entry.mergeExclude?new RegExp(entry.mergeExclude):null});globalThis.kino.sceneMerge=r;
    console.info('[scene-merge]',r.merged,'meshes into',r.meshes,'in',Math.round(performance.now()-t),'ms');await paint();}
  // static instanced props: batched per material, culled per instance (instance-cull.js)
  if(!perfOff.has('noBatch')){
    // the map's own props only (mods' instanced effects, e.g. the lighting beams, have their own shaders)
    // maps.json batchMeshes: plain map meshes join texture-array batches too (Kino's shell); batchExclude: a regex on mesh
    // or material names mods change later. The HD map textures go in first (map-materials, awaited up to 30 s).
    // (?textureArrays=N, ?batchMeshes, ?batchExclude=re override the map entry, for testing)
    const opt=k=>perfOff.has(k)?perfOff.get(k)||true:entry[k];
    const arrays=perfOff.has('noArrays')?0:+(opt('textureArrays')||0),batchMeshes=!!opt('batchMeshes'),skipRe=opt('batchExclude')??entry.mergeExclude,skip=skipRe?new RegExp(skipRe):null;
    // a plain mesh stays out like scene-merge's: under a custom-world marker (doors, movers, traps, risers), noMerge, or
    // an excluded name on it, an ancestor or its material; instanced meshes keep the old rule (noCull only)
    const keep=o=>{if(o.isInstancedMesh)return false;for(let p=o;p;p=p.parent){if(p.userData.marker||p.userData.noMerge||skip&&skip.test(p.name))return true;}return !!skip&&[o.material].flat().some(m=>skip.test(m?.name??''));};
    if(arrays&&batchMeshes)await Promise.race([globalThis.kino?.hdMaps,new Promise(r=>setTimeout(r,30000))]).catch(()=>{});
    instanceCull=await createInstanceCuller(world.root??world.mapRoot??scene,{target:scene,renderer,arrays,meshes:batchMeshes,
      exclude:o=>o.userData.noCull||keep(o)});globalThis.kino.instanceCull=instanceCull;
    if(instanceCull.meshes){console.info('[instance-cull]',instanceCull.sources,'meshes into',instanceCull.meshes,'batches,',instanceCull.instances,'instances in',instanceCull.buildMs,'ms');
      await paint();await renderer.compileAsync(scene,camera).catch(()=>{});}   // batched props need their own shader variants: compile them behind the loading screen
  }
  // Every model a mod started loading without awaiting (map zombies, gib sets, props) must land, and its .then chains run
  // (the timeout yield), before the warm-up, or whatever it puts in place compiles at its first draw (2-3 s each on D3D11:
  // Nuketown's zombies did, 2026-10-29). Mods can also push their own promises on host.pending.
  progress('Waiting for models',98);await pendingModels();await new Promise(r=>setTimeout(r,0));await Promise.allSettled(mods.pending??[]);
  // and for textures still downloading or decoding (mods' TextureLoader loads, KTX2 copies, re-decoded images), so the
  // warm-up draw uploads them too; bounded, the 1.5 s and 4 s re-warms catch the rest (2026-10-29)
  if(pendingImageCount()){progress('Waiting for textures',99);const t0=performance.now(),left=await pendingImages(15000);console.info('[warm-shaders] waited',Math.round(performance.now()-t0),'ms for textures,',left,'still loading');}
  if(!perfOff.has('noWarm')){progress('Preparing shaders',99);await paint();await warmShaders(true);
    // mods keep adjusting materials for a moment after loading (the lighting mod tags late materials on a 1 s sweep,
    // which changes their program): compile those too while the player is still on the start screen (cheap: programs
    // already built are reused)
    for(const delay of [1500,4000])setTimeout(()=>{if(!started&&!contextLost&&!document.hidden)warmShaders();},delay);}
  // a custom map's static objects stop recomputing their matrices every frame (Kino's world.js freezes its own root)
  // rigged props that never move keep their bone textures instead of re-uploading them every frame (still-skeletons.js;
  // the whole scene: Der Eisendrache's 461 still props sit outside world.root). Late arrivals join on the 1 s sweep.
  if(!NO_STILL)stillSkeletons(scene);
  // (2026-10-17: the whole scene, with the walk cut short under static subtrees; bones with nothing attached are hidden
  // from the renderer's object walk, see still-skeletons.js)
  if(!perfOff.has('noFreeze')&&world.root&&world.root.updateMatrixWorld===THREE.Object3D.prototype.updateMatrixWorld){staticFreeze=createStaticFreeze(scene);globalThis.kino.staticFreeze=staticFreeze;console.info('[static-freeze]',staticFreeze.frozen,'frozen,',staticFreeze.skips,'subtrees skipped');}
  if(!perfOff.has('noFreeze'))console.info('[still-skeletons] bones hidden:',hideBones(scene));
  ready=true;
  progress('Ready',100);$('loading').hidden=true;$('start').disabled=contextLost;$('menu-status').textContent=contextLost?'Graphics paused. Waiting for the browser to restore the game…':touchControls.mode?'Tap to start':'Click to capture the mouse · Esc to pause';
}catch(error){console.error(error);errors.push(String(error));$('load-label').textContent='Unable to start: '+error.message;$('menu-status').textContent='See the browser console for details';}
// Shader warm-up (2026-10-17). The earlier load-time compiles (map-materials, instance batches) compile for the screen,
// but the lighting mod draws the scene into its post-processing target, which needs other program variants (output
// colour space, tone mapping). So only what the one warm-up frame drew was really ready: anything out of view or
// hidden at load (map props behind the player, effects shown later) compiled the first time it was seen, a 40-90 ms
// freeze each on the GTX 1660 Ti host (longer on Windows, where ANGLE compiles through D3D). This draws one frame with
// a spy to learn which render target each scene goes into, then compiles every object in it for that target,
// including hidden ones (made visible just for the compile; lights stay as they are, since toggling a light
// recompiles every shader). compile doesn't upload textures, so hidden weapons don't fill video memory.
// ?noWarm skips it.
// Effect stand-ins for the shader warm-up. Weapons and props make their effect materials on first use (Thundergun blast,
// DG-2 arcs, booth sparks, bolts, frost rings), each a shader compile mid-game (a freeze on Windows/D3D11). A built-in
// material's program depends only on a few switches (texture or not, side, fog, tone mapping), not on colour, opacity or
// blending, so one of each kind covers them all. Back faces too: a transparent double-sided material is drawn back then
// front (two programs) until the once-a-second singlePass sweep reaches it. Built once; one set for each scene.
function effectStandIns(){
  const tex=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);tex.needsUpdate=true;
  const plane=new THREE.PlaneGeometry(1,1),dot=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]),line=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,1,0)]);
  const set=()=>{const g=new THREE.Group();
    for(const map of [null,tex])for(const fog of [true,false])for(const toneMapped of [true,false]){
      const o={map,fog,toneMapped,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending};
      for(const side of [THREE.FrontSide,THREE.BackSide,THREE.DoubleSide])g.add(new THREE.Mesh(plane,new THREE.MeshBasicMaterial({...o,side})));
      for(const side of [THREE.FrontSide,THREE.DoubleSide])g.add(new THREE.Mesh(plane,new THREE.MeshBasicMaterial({map,fog,toneMapped,side})));   // opaque ones (another program)
      g.add(new THREE.Points(dot,new THREE.PointsMaterial(o)),new THREE.Sprite(new THREE.SpriteMaterial(o)));
      if(!map)g.add(new THREE.LineSegments(line,new THREE.LineBasicMaterial(o)));}
    g.traverse(o=>{o.frustumCulled=false;});return g;};
  return {world:set(),view:set()};
}
// Waits until the GPU has run everything queued so far (a WebGL2 fence, polled). The warm-up only queues its draws: on
// Windows/D3D11 the GPU process then builds the real shaders while working through them, seconds of work that finished
// after the loading screen had gone (2026-10-24, user on an RTX 4070 Ti Super: 0.5-1.7 s freezes in the first seconds of
// play with the page idle and no first draws left). Gives up after max ms.
async function gpuIdle(max=60000){
  const gl=renderer.getContext();if(!gl.fenceSync)return 0;
  const t=performance.now(),sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();
  try{while(performance.now()-t<max){const r=gl.clientWaitSync(sync,0,0);if(r!==gl.TIMEOUT_EXPIRED)break;await new Promise(r=>setTimeout(r,25));}}
  finally{gl.deleteSync(sync);}
  return performance.now()-t;
}
async function warmShaders(waitGpu=false){
  const t0=performance.now(),targets=new Map(),draw=renderer.render,later=new THREE.Group();
  renderer.setAnimationLoop(null);   // no frame may draw the unhidden objects or move the render target meanwhile
  try{
    // Things that only appear later join the scene in front of the camera for this one frame: mods.warmObjects (effect
    // sprites), the power-ups and the enemy templates (zombie bodies and heads, dogs, crawlers; clones share their
    // materials). They're drawn for real (textures uploaded) behind the loading screen.
    later.add(...mods.warmObjects.filter(o=>o?.isObject3D&&!o.parent));
    standIns??=effectStandIns();later.add(standIns.world);standIns.view.visible=false;viewScene.add(standIns.view);   // the view set compiles with the hidden objects below
    for(const item of Object.values(powerups?.templates??{})){const aura=new THREE.Sprite(powerups.spriteMaterial);later.add(item.clone(true),aura);}
    for(const t of [enemies?.templates,enemies?.heads,enemies?.dog,enemies?.quad,enemies?.quadHead].flat())if(t?.isObject3D&&!t.parent)later.add(t);
    for(const t of [...(features?.models?.values?.()??[]),features?.reelTemplate])if(t?.isObject3D&&!t.parent)later.add(t);   // claymores, monkeys, the box's weapon reel (2026-10-29)
    later.position.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(120));later.updateMatrixWorld(true);scene.add(later);
    mods.emit('warm');   // mods finish pending material changes first (the lighting mod tags late meshes, these too)
    renderer.render=function(s,c){if((s===scene||s===viewScene)&&!targets.has(s))targets.set(s,this.getRenderTarget());return draw.call(this,s,c);};
    // shadow maps too (their depth programs), even where the lighting mod only redraws them on a schedule
    renderer.shadowMap.needsUpdate=true;scene.traverse(o=>{if(o.isLight&&o.castShadow&&o.shadow)o.shadow.needsUpdate=true;});
    try{renderer.info.reset();renderer.clear();if(!(mods.renderWorld&&mods.renderWorld(scene,camera,{viewScene,viewCamera,drawView:true}))){if(!mods.renderWorld)renderer.render(scene,camera);renderer.clearDepth();renderer.render(viewScene,viewCamera);}}
    finally{renderer.render=draw;}
    const before=renderer.info.programs.length,hidden=[],standIn=[];
    for(const root of [scene,viewScene])root.traverse(o=>{if(!o.visible&&!o.isLight){hidden.push(o);if(root===viewScene)standIn.push(o);o.visible=true;}});
    try{for(const [s,target] of targets){const previous=renderer.getRenderTarget();renderer.setRenderTarget(target);
      try{await renderer.compileAsync(s,s===viewScene?viewCamera:camera);}finally{renderer.setRenderTarget(previous);}}
    // Compiling isn't the whole cost: the driver finishes a program's GPU pipeline on its first draw with each vertex layout
    // and target format (on Windows/D3D11, ANGLE compiles a shader variant then, freezing for up to seconds), so the hidden
    // objects and the whole map (culling off) are drawn once into each scene's target too. Only the view scene's hidden
    // objects (the cached weapons, dozens of them) get their missing textures swapped for a 1x1 stand-in (a 2D texture
    // swap doesn't change the program) so they don't fill video memory; the world's hidden objects (map batches the
    // instance cull hid, perk machines and power-up models waiting to appear, props mods keep for later) draw with their
    // real textures, so they are on the GPU before play instead of uploading at first sight (a 1-4 MB stall each on
    // Nuketown, 2026-10-29). ?noWarmDraw skips it (A/B).
    if(!NO_WARM_DRAW){const swapped=[],culled=[],blank=new Map(),t1=performance.now(),seen=new Set();
      const stand=tex=>{const k=tex.channel+'/'+tex.colorSpace;let b=blank.get(k);if(!b){b=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);b.channel=tex.channel;b.colorSpace=tex.colorSpace;b.needsUpdate=true;blank.set(k,b);}return b;};
      for(const h of standIn)h.traverse(o=>{for(const m of [o.material].flat())if(m&&!seen.has(m)){seen.add(m);for(const k of Object.keys(m)){const v=m[k];
        if(k!=='envMap'&&v?.isTexture&&!v.isCubeTexture&&!v.isRenderTargetTexture&&!v.isData3DTexture&&!v.isDataArrayTexture&&!v.isVideoTexture&&!renderer.properties.get(v).__webglTexture){swapped.push([m,k,v]);m[k]=stand(v);}}}});
      for(const root of [scene,viewScene])root.traverse(o=>{if(o.frustumCulled){culled.push(o);o.frustumCulled=false;}});
      const previous=renderer.getRenderTarget(),n0=firstDraw.n;
      try{for(const [s,target] of targets){renderer.setRenderTarget(target);renderer.render(s,s===viewScene?viewCamera:camera);}}
      finally{renderer.setRenderTarget(previous);for(const o of culled)o.frustumCulled=true;for(const [m,k,v] of swapped)m[k]=v;for(const b of blank.values())b.dispose();}
      console.info('[warm-shaders] drew',firstDraw.n-n0,'new program/layout/target pairs,',swapped.length,'textures stood in, in',Math.round(performance.now()-t1),'ms');}
    }
    finally{for(const o of hidden)o.visible=false;}
    // the gun and arms in hand are first drawn when play starts: upload their textures now (only these: every cached
    // weapon's would fill video memory), or the first played frames stall on them (67 ms each on the host)
    view?.pivot?.traverse(o=>{for(const m of [o.material].flat())if(m)for(const k of ['map','normalMap','emissiveMap','alphaMap','roughnessMap','metalnessMap','aoMap'])if(m[k]?.isTexture)renderer.initTexture(m[k]);});
    // Without KHR_parallel_shader_compile (not on the Linux host; not promised elsewhere) compileAsync only queues the
    // compiles: the driver does the work when a program is first used (link check, uniform lookup), which was a 360 ms
    // first played frame. Using each program here (getUniforms/getAttributes) moves that wait behind the loading screen.
    for(const program of renderer.info.programs){try{program.getUniforms();program.getAttributes();}catch{}}
    programCount=renderer.info.programs.length;   // compiled while loading, not mid-game
    firstDraw.lateFrom=renderer.info.programs.reduce((m,p)=>Math.max(m,p.id),-1)+1;   // programs with a higher id were compiled mid-game (reported with their material and object)
    console.info('[warm-shaders]',renderer.info.programs.length-before,'programs for',targets.size,'scenes,',hidden.length,'hidden objects, in',Math.round(performance.now()-t0),'ms');
    if(waitGpu&&!NO_GPU_WAIT){const ms=Math.round(await gpuIdle());console.info('[warm-shaders] GPU caught up in',ms,'ms');diag('gpuWait',{ms});}   // the loading screen stays meanwhile
  }catch(error){console.warn('[warm-shaders]',error);}
  finally{later.removeFromParent();for(const o of [...later.children])later.remove(o);standIns?.view.removeFromParent();keepPrograms();if(!document.hidden&&!contextLost)renderer.setAnimationLoop(renderFrame);}
}
renderer.info.autoReset=false;
// (2026-10-25) a hidden top-level view object (a mod's spare ViewWeapon, the stand-ins: ~1,500 bones on Kino) is left out of
// the view scene's matrix walk until it is shown again; a forced update (fp.js on the live pivot) still goes through
// (2026-10-27) GPU time of a frame's draws (EXT_disjoint_timer_query_webgl2, when the browser has it), read back a few frames
// later and sent with the perf log: with the frame interval after it, it tells a GPU-side stall (long GPU time, idle main
// thread) from a CPU one. At most 6 queries wait at a time; one result is polled a frame. ?noGpuTimer turns it off.
function gpuBegin(on){if(!on||!timerExt||gpuQ.length>=6)return null;const gl=renderer.getContext(),q=gl.createQuery();gl.beginQuery(timerExt.TIME_ELAPSED_EXT,q);return q;}
function gpuEnd(q,now){if(!timerExt)return;const gl=renderer.getContext();if(q){gl.endQuery(timerExt.TIME_ELAPSED_EXT);}
  const last=gpuQ[gpuQ.length-1];if(last&&last.next==null&&last.now!==now)last.next=now;   // the interval after a frame is known at the next one
  if(q)gpuQ.push({q,now,next:null});
  const o=gpuQ[0];if(!o||o.next==null)return;
  try{if(!gl.getQueryParameter(o.q,gl.QUERY_RESULT_AVAILABLE))return;
    const ok=!gl.getParameter(timerExt.GPU_DISJOINT_EXT),ns=ok?gl.getQueryParameter(o.q,gl.QUERY_RESULT):0;gl.deleteQuery(o.q);gpuQ.shift();
    if(ok)perf.gpu?.(ns/1e6,o.next-o.now);}
  catch{timerExt=null;}}
// GPU-process latency per frame: a fence after each frame's last command, polled from the frame loop and from a 10 ms
// heartbeat timer (so a frame that finishes while the frame loop is stalled is still timed). A hitch with the main
// thread idle (heartbeat alive, 'mt 0') and the previous frame's fence late by about the gap ('lat') is the GPU process
// stuck on that frame's commands (D3D11 shader variants, buffer or texture work); a dead heartbeat ('mt' about the
// gap) is the main thread or the whole process blocked (2026-10-29, the user's 2 s hitches with every counter quiet).
function fenceFrame(now){const gl=renderer.getContext();if(fenceSupported===null)fenceSupported=typeof gl.fenceSync==='function';if(!fenceSupported||fences.length>=12)return;
  try{fences.push({s:gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0),now});}catch{fenceSupported=false;}}
function pollFences(){if(!fences.length)return;const gl=renderer.getContext();try{while(fences.length){const f=fences[0];if(gl.getSyncParameter(f.s,gl.SYNC_STATUS)!==gl.SIGNALED)break;gl.deleteSync(f.s);fences.shift();perf.lat?.(f.now,performance.now()-f.now);}}catch{fenceSupported=false;fences.length=0;}}
(function heartbeat(){let last=performance.now();const tick=()=>{const t=performance.now();perf.beat?.(last,t);last=t;if(!document.hidden)pollFences();setTimeout(tick,10);};setTimeout(tick,10);})();
for(const [ev,name] of [['blur','blur'],['focus','focus']])addEventListener(ev,()=>perf.event?.(name));
document.addEventListener('visibilitychange',()=>perf.event?.(document.hidden?'hidden':'visible'));document.addEventListener('pointerlockchange',()=>perf.event?.(document.pointerLockElement?'lock':'unlock'));addEventListener('resize',()=>perf.event?.('resize'));
function skipHidden(force){if(force||this.visible)THREE.Object3D.prototype.updateMatrixWorld.call(this,force);}   // a declaration: the frame loop starts from the load sequence before the module reaches this line
function renderFrame(now){
  if(document.hidden||contextLost)return;
  const interval=settings.fpsCap>0?(active?1000/settings.fpsCap:200):0;   // the frame rate cap setting (frames a second, 0 = none; 30 by default on phones)
  if(lastRendered&&now-lastRendered<interval-1)return;
  lastRendered=now;const dt=Math.min((now-previous)/1000,.06);previous=now;frameTime+=dt;frameCount++;renderedFrames++;
  if(frameTime>.75){fps=Math.round(frameCount/frameTime);frameTime=0;frameCount=0;}
  if((singlePassTimer-=dt)<=0){singlePassTimer=1;singlePass(scene);singlePass(viewScene);if(ready&&!NO_STILL){stillSkeletons(scene);hideBones(scene);}for(const c of viewScene.children)if(!Object.hasOwn(c,'updateMatrixWorld'))c.updateMatrixWorld=skipHidden;}   // (2026-10-25) hideBones each second too: the zombies' ~2,600 bones left projectObject's walk
  const playing=active&&started,t0=performance.now();mods.profiling=playing;
  update(dt);const t1=performance.now();const gq=gpuBegin(playing);staticFreeze?.tick();instanceCull?.update(mods.camera??camera,renderer.domElement.height,entry?.instanceCullPixels??CULL_PIXELS[settings.graphics]??3);renderer.info.reset();renderer.clear();const drawView=ready&&started&&!mods.hideViewmodel;
  const viewDrawn=mods.renderWorld?mods.renderWorld(scene,mods.camera??camera,{viewScene,viewCamera,drawView}):(renderer.render(scene,mods.camera??camera),false);if(drawView&&!viewDrawn){renderer.clearDepth();renderer.render(viewScene,viewCamera);}
  keepPrograms();gpuEnd(gq,now);if(playing){fenceFrame(now);pollFences();}
  if(playing){perf.firstDraws?.(firstDraw.n);const n=renderer.info.programs.length;if(n>programCount)perf.programs(firstDraw.late.length?firstDraw.late.splice(0):renderer.info.programs.slice(programCount).map(p=>p.name||String(p.cacheKey).split(',')[0]||'?'));programCount=n;if(session.round!==evRound){evRound=session.round;perf.event?.('round'+evRound);}const zn=enemies?.list?.length??0;if(zn>evZ)perf.event?.('spawn');evZ=zn;if(session.def!==evDef){evDef=session.def;perf.event?.('equip:'+(evDef?.id??'?'));}
    // the uploads and GL work of the frame before the gap (the culprit when the GPU process stalls) and of this frame
    perf.frame(now,t1-t0,performance.now()-t1,[lastFirstDraws,firstDraw.n,...lastFirstNames],texUp,lastTex);}else{programCount=renderer.info.programs.length;perf.pause();}
  lastTex={n:texUp.n,kb:texUp.kb,mip:texUp.mip,gl:texUp.gl};texUp.n=texUp.kb=texUp.mip=0;texUp.gl={};
  lastFirstDraws=firstDraw.n;lastFirstNames=firstDraw.names;firstDraw.n=0;firstDraw.names=[];   // hitches carry the previous frame's first draws (a GPU stall delays the next frame)
}
resumeRendering();
