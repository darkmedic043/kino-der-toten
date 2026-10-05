// The Pilot class's action skill: call a mech down, climb in, fight from the cockpit (mods/classes, docs/fork/classes.md).
//
// Z calls it in: it falls from the sky onto a spot in front of you (crushing what's there) and you climb in. Inside, left
// click fires the left arm's weapon and right click the right arm's (classes.js mechStats: the loadout and the trees);
// each weapon has its own heat and locks up to vent when it overheats. The player can't be hurt in the cockpit: every
// hit takes time off the mech's integrity bar instead (which also drains by a second a second), and when the bar runs
// out the mech goes down and you're thrown clear. Z again ejects early. The cooldown starts once you're out.
//
// The cockpit: the camera rides higher, the gun viewmodel is swapped for the mech's two forearms (mech-model.js
// mechArms), the game HUD's weapon panel gives way to the mech HUD (integrity bar, a heat gauge per arm, reticle), and
// the gun keys (reload, knife, grenade, weapon slots, buy) are blocked. In third person (T) you see the mech itself.
//
// Rear Hardpoint (a Vanguard passive) puts a machine gun on the mech's back. In co-op a teammate can climb on with F:
// they ride on the mech (and can't be hurt), and left click fires the gun. Co-op messages {t:'mech', op:'st'|'mount'|
// 'off'|'rkill'}: the pilot's state ten times a second (others build a mirror mech on the pilot's avatar and hide the
// avatar), a rider's request to climb on, and a rider's kill (Covering Fire time). Shots and blasts go through the
// class sync (coop.js tracers and booms).
import * as THREE from 'three';
import { zombieHealth } from '../../rules.js';
import { mechStats, mechWeapon } from './classes.js';
import { createMech, mechArms, WEAPON_BUILDERS, loadMechModel } from './mech-model.js';
import { createCharacter, seatCharacter } from '../../characters.js';

const up=new THREE.Vector3(0,1,0);
const LIFT=34;            // the cockpit sits this much above a player's eye
const DROP_TIME=1.1;      // seconds from the sky to the ground
const VENT_DELAY=1.2;     // an overheated arm sits locked this long before it starts venting
const SEAT=new THREE.Vector3(0,104,-30);   // the rear gunner's feet on the procedural mech (the Marcy model has its own gunnerSeat)

export async function setupMech(ctx){
  await loadMechModel();   // the Marcy model when built (falls back to the procedural mech)
  const {api,blast,onHit,sync}=ctx;
  const {host,session,data,scene,camera,player,enemies,world,audio,view,viewScene}=api;
  const cfg=ctx.cfg,cls=ctx.cls;
  // Every class runs this for the co-op half (riding a teammate's mech, seeing other pilots' mechs); only the Pilot
  // class can call one in (pilot).
  const pilot=!!cls.mech;
  let M=pilot?mechStats(cls,ctx.state()):{mech:{},left:null,right:null};   // fixed when the mech lands (the loadout can change in the menu between drops)
  const net=()=>{const n=window.kino.coop;return n?.id?n:null;};

  // ---- state -----------------------------------------------------------------------------------------------------
  let phase='idle';        // idle | falling | piloting
  let shield=0,reactiveT=-9,stompT=0;   // Overshield (seconds of integrity), Reactive Armour and Crushing Stride timers
  let integrity=0,maxIntegrity=1,lastHitT=-9,landedAt=0,coreUsed=false;
  let drop=null;           // {mech, at, t}
  const arms={left:null,right:null};   // per-arm weapon state
  const trig={left:false,right:false,leftAt:-9,rightAt:-9};
  let saved=null;          // the player's own speeds, restored on eject
  let rider=null;          // co-op: the teammate on my back (id)
  const world3=createMech({mount:false});world3.root.visible=false;if(pilot)scene.add(world3.root);   // my mech in the world (third person, the drop)
  const fp=mechArms();fp.root.visible=false;if(pilot)viewScene?.add(fp.root);
  const mgView=WEAPON_BUILDERS.mg();mgView.scale.setScalar(.55);mgView.position.set(9,-12,-26);mgView.rotation.y=Math.PI;mgView.visible=false;viewScene?.add(mgView);

  // ---- the pilot, seated in the cockpit (a copy of the operator, posed by seatCharacter) -------------------------------
  // Mine shows in third person (in first person the camera is at its eyes); other pilots' always show on their mirrors.
  async function seatPilot(mech,entry){
    if(!entry||!mech.seat)return null;
    const c=await createCharacter(entry,data).catch(()=>null);if(!c)return null;
    const pose=seatCharacter(c);
    c.root.position.y=-(pose?.hipHeight??30);mech.seat.add(c.root);c.root.traverse(o=>{if(o.isMesh)o.frustumCulled=false;});
    return {c,pose,dispose(){c.root.removeFromParent();c.dispose?.();}};
  }
  let myPilot=null,myPilotEntry=null;
  // ---- sounds (made here: none of the game's, and nothing from Cheese Cube's suits) -------------------------------
  const ac=()=>audio.ctx&&audio.ctx.state==='running'?audio.ctx:null;
  function tone({f=200,f2=f,type='sawtooth',dur=.2,vol=.2,noise=0,lp=2000,at=0}){
    const c=ac();if(!c)return;const t=c.currentTime+at,g=c.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
    const filt=c.createBiquadFilter();filt.type='lowpass';filt.frequency.value=lp;filt.connect(g);g.connect(audio.master);
    if(noise){const b=c.createBuffer(1,Math.ceil(c.sampleRate*dur),c.sampleRate),a=b.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;const s=c.createBufferSource();s.buffer=b;s.connect(filt);s.start(t);s.stop(t+dur);}
    if(type){const o=c.createOscillator();o.type=type;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,f2),t+dur);const og=c.createGain();og.gain.value=noise?.5:1;o.connect(og);og.connect(filt);o.start(t);o.stop(t+dur);}
  }
  const sfx={
    chaingun:()=>tone({f:90,f2:50,type:'square',dur:.07,vol:.16,noise:1,lp:2600}),
    railCharge:()=>tone({f:180,f2:900,type:'sine',dur:.25,vol:.05}),
    rail:()=>{tone({f:1400,f2:120,type:'sawtooth',dur:.35,vol:.18,noise:1,lp:6000});tone({f:60,f2:30,type:'sine',dur:.5,vol:.35});},
    rocket:()=>tone({f:300,f2:90,type:'sawtooth',dur:.35,vol:.08,noise:1,lp:1400}),
    thermite:()=>{tone({f:110,f2:60,type:'square',dur:.18,vol:.18,noise:1,lp:900});},
    punch:()=>{tone({f:70,f2:35,type:'sine',dur:.25,vol:.45});tone({dur:.12,vol:.2,noise:1,type:null,lp:1800});},
    arc:()=>tone({f:2400,f2:900,type:'square',dur:.06,vol:.05,noise:1,lp:8000}),
    vent:()=>tone({dur:.9,vol:.12,noise:1,type:null,lp:3000}),
    overheat:()=>{tone({f:880,f2:880,type:'square',dur:.12,vol:.07});tone({f:660,f2:660,type:'square',dur:.12,vol:.07,at:.16});},
    step:()=>tone({f:55,f2:35,type:'sine',dur:.22,vol:.22,noise:1,lp:300}),
    hit:()=>tone({f:240,f2:140,type:'triangle',dur:.16,vol:.15,noise:1,lp:2400}),
    boot:()=>{for(let i=0;i<4;i++)tone({f:520+i*180,f2:520+i*180,type:'sine',dur:.09,vol:.06,at:i*.11});},
    warn:()=>tone({f:440,f2:440,type:'square',dur:.25,vol:.07}),
    land:()=>{tone({f:45,f2:22,type:'sine',dur:1.2,vol:.6});tone({dur:.8,vol:.35,noise:1,type:null,lp:500});},
    whistle:()=>tone({f:2200,f2:300,type:'sine',dur:DROP_TIME,vol:.06}),
    mg:()=>tone({f:140,f2:70,type:'square',dur:.06,vol:.12,noise:1,lp:3200}),
  };

  // ---- HUD ---------------------------------------------------------------------------------------------------------
  const hudEl=document.createElement('div');hudEl.id='mech-hud';
  hudEl.innerHTML=`<div class="mh-frame"><i></i><i></i><i></i><i></i></div>
    <div class="mh-top"><span class="mh-label">MECH INTEGRITY</span><div class="mh-bar"><b class="ghost"></b><b class="fill"></b><b class="shield"></b></div><span class="mh-time"></span></div>
    <div class="mh-arm left"><span class="mh-key">LMB</span><span class="mh-name"></span><div class="mh-heat"><b></b><s></s></div><span class="mh-state"></span></div>
    <div class="mh-arm right"><span class="mh-key">RMB</span><span class="mh-name"></span><div class="mh-heat"><b></b><s></s></div><span class="mh-state"></span></div>
    <div class="mh-reticle"><i></i><i></i><i></i><i></i></div>
    <div class="mh-warn"></div><div class="mh-boot"></div><div class="mh-core"></div>`;
  const css=document.createElement('style');css.textContent=`
    #mech-hud{position:fixed;inset:0;z-index:3;pointer-events:none;display:none;font-family:'Arial Narrow',Arial,sans-serif;color:#bfeeff;--hc:#8fe3ff}
    body.mech-pilot #mech-hud{display:block}
    body.mech-pilot #weapon-panel,body.mech-pilot #crosshair,body.mech-pilot #class-skill .hp{display:none!important}
    body.menu-open #mech-hud{visibility:hidden}
    #mech-hud .mh-frame i{position:absolute;width:12vw;height:12vh;border:2px solid #8fe3ff40}
    #mech-hud .mh-frame i:nth-child(1){left:3vw;top:4vh;border-right:0;border-bottom:0}#mech-hud .mh-frame i:nth-child(2){right:3vw;top:4vh;border-left:0;border-bottom:0}
    #mech-hud .mh-frame i:nth-child(3){left:3vw;bottom:4vh;border-right:0;border-top:0}#mech-hud .mh-frame i:nth-child(4){right:3vw;bottom:4vh;border-left:0;border-top:0}
    #mech-hud::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 55%,#02121a99 100%),repeating-linear-gradient(0deg,#8fe3ff05 0 2px,transparent 2px 4px)}
    #mech-hud .mh-top{position:absolute;left:50%;top:3.5vh;transform:translateX(-50%);width:min(560px,60vw);text-align:center}
    #mech-hud .mh-label{font-size:11px;letter-spacing:4px;color:#8fe3ffcc}
    #mech-hud .mh-bar{position:relative;height:14px;margin:5px 0 3px;border:1px solid #8fe3ff99;background:#02121a99;clip-path:polygon(8px 0,calc(100% - 8px) 0,100% 50%,calc(100% - 8px) 100%,8px 100%,0 50%)}
    #mech-hud .mh-bar b{position:absolute;left:0;top:0;bottom:0;transition:width .12s linear}
    #mech-hud .mh-bar .fill{background:repeating-linear-gradient(90deg,var(--hc) 0 9px,transparent 9px 11px);box-shadow:0 0 10px var(--hc)}
    #mech-hud .mh-bar .shield{background:repeating-linear-gradient(90deg,#fff 0 9px,transparent 9px 11px);opacity:.85;box-shadow:0 0 10px #fff;left:auto!important;right:0}
    #mech-hud .mh-bar .ghost{background:#fff;opacity:.85;transition:width .5s ease-in .35s}
    #mech-hud .mh-time{font:700 20px/1 'Arial Narrow',Arial,sans-serif;letter-spacing:2px;text-shadow:0 0 8px var(--hc)}
    #mech-hud.low{--hc:#ff5a44}#mech-hud.low .mh-time{color:#ff8a78}
    #mech-hud.hit .mh-bar{animation:mh-shake .25s}
    @keyframes mh-shake{25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
    #mech-hud .mh-arm{position:absolute;top:50%;width:150px;transform:translateY(-50%);font-size:11px;letter-spacing:2px}
    #mech-hud .mh-arm.left{right:calc(50% + 90px);text-align:right}#mech-hud .mh-arm.right{left:calc(50% + 90px)}
    #mech-hud .mh-key{display:inline-block;padding:2px 5px;border:1px solid #8fe3ff80;font-size:9px;margin:0 6px}
    #mech-hud .mh-name{font-weight:700;color:#e8fbff}
    #mech-hud .mh-heat{position:relative;height:8px;margin:7px 0 4px;background:#02121aaa;border:1px solid #8fe3ff66}
    #mech-hud .mh-heat b{position:absolute;top:0;bottom:0;left:0;background:linear-gradient(90deg,#7dffb0,#ffd35a 60%,#ff5a44);transition:width .05s}
    #mech-hud .mh-arm.left .mh-heat b{left:auto;right:0;background:linear-gradient(270deg,#7dffb0,#ffd35a 60%,#ff5a44)}
    #mech-hud .mh-heat s{position:absolute;top:-4px;bottom:-4px;width:2px;background:#8fe3ff;left:0;display:none;box-shadow:0 0 6px #8fe3ff}
    #mech-hud .mh-state{font-size:10px;letter-spacing:3px;color:#8fe3ffaa;min-height:12px;display:block}
    #mech-hud .mh-arm.over .mh-state{color:#ff5a44;animation:mh-blink .3s steps(1) infinite}
    #mech-hud .mh-arm.over .mh-heat{border-color:#ff5a44}
    @keyframes mh-blink{50%{opacity:0}}
    #mech-hud .mh-reticle{position:absolute;left:50%;top:50%;width:46px;height:46px;transform:translate(-50%,-50%)}
    #mech-hud .mh-reticle i{position:absolute;width:12px;height:12px;border:2px solid #bfeeffcc}
    #mech-hud .mh-reticle i:nth-child(1){left:0;top:0;border-right:0;border-bottom:0}#mech-hud .mh-reticle i:nth-child(2){right:0;top:0;border-left:0;border-bottom:0}
    #mech-hud .mh-reticle i:nth-child(3){left:0;bottom:0;border-right:0;border-top:0}#mech-hud .mh-reticle i:nth-child(4){right:0;bottom:0;border-left:0;border-top:0}
    #mech-hud .mh-reticle::after{content:'';position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px;background:#e8fbff;border-radius:50%}
    #mech-hud .mh-warn{position:absolute;left:0;right:0;top:15vh;text-align:center;font:700 22px/1 'Arial Narrow',Arial,sans-serif;letter-spacing:6px;color:#ff5a44;text-shadow:0 0 10px #ff5a44;animation:mh-blink .6s steps(1) infinite}
    #mech-hud .mh-boot{position:absolute;left:5vw;top:30vh;font:600 13px/1.6 'Courier New',monospace;color:#8fe3ff;white-space:pre;text-shadow:0 0 6px #8fe3ff}
    #mech-hud .mh-core{position:absolute;left:0;right:0;top:22vh;text-align:center;font:700 16px/1 'Arial Narrow',Arial,sans-serif;letter-spacing:5px;color:#ffd35a;text-shadow:0 0 8px #ffd35a}
    body.mech-rider #weapon-panel,body.mech-rider #crosshair{display:none!important}
    #mech-ride{position:fixed;left:50%;top:50%;width:30px;height:30px;transform:translate(-50%,-50%);border:2px solid #ffd35acc;border-radius:50%;pointer-events:none;display:none;z-index:3}
    body.mech-rider #mech-ride{display:block}
    #mech-ride::after{content:'REAR GUN';position:absolute;top:38px;left:50%;transform:translateX(-50%);font:700 10px/1 Arial;letter-spacing:3px;color:#ffd35a;white-space:nowrap}`;
  document.head.append(css);document.body.append(hudEl);
  const ride=document.createElement('div');ride.id='mech-ride';document.body.append(ride);
  const $h=s=>hudEl.querySelector(s);
  let bootTimer=0;
  function boot(){
    const lines=['NEURAL LINK ........ OK','REACTOR ............ ONLINE',`L-ARM  ${M.left.name.toUpperCase()}`,`R-ARM  ${M.right.name.toUpperCase()}`,M.mech.mount?'REAR HARDPOINT ..... ARMED':'','ALL SYSTEMS GREEN'].filter(Boolean);
    const el=$h('.mh-boot');el.textContent='';let i=0;clearInterval(bootTimer);
    bootTimer=setInterval(()=>{if(i<lines.length){el.textContent+=(i?'\n':'')+lines[i++];}else if(i++>lines.length+8){el.textContent='';clearInterval(bootTimer);}},140);
    sfx.boot();
  }
  let ghostT=0;
  function drawHud(){
    if(phase!=='piloting')return;
    const f=Math.max(0,integrity/maxIntegrity);$h('.fill').style.width=(f*100)+'%';$h('.shield').style.width=(Math.min(1,shield/maxIntegrity)*100)+'%';
    if(session.time>ghostT)$h('.ghost').style.width=(f*100)+'%';
    $h('.mh-time').textContent=Math.ceil(Math.max(0,integrity))+'s';
    hudEl.classList.toggle('low',f<.25);
    for(const side of ['left','right']){
      const a=arms[side],el=$h('.mh-arm.'+side);if(!a)continue;
      el.querySelector('.mh-name').textContent=a.w.name.toUpperCase();
      el.querySelector('.mh-heat b').style.width=(Math.min(1,a.heat)*100)+'%';
      const mark=el.querySelector('.mh-heat s');mark.style.display=a.w.mode==='charge'&&a.charge>0?'block':'none';mark.style[side==='left'?'right':'left']=(a.charge*100)+'%';
      el.classList.toggle('over',a.over);
      el.querySelector('.mh-state').textContent=a.over?(session.time-a.shotT<VENT_DELAY?'OVERHEAT':'VENTING'):a.w.mode==='charge'&&a.charge>0?'CHARGING '+Math.round(a.charge*100)+'%':a.w.mode==='auto'&&trig[side]&&a.spin<1?'SPINNING UP':a.cd>0?'':'READY';
    }
    $h('.mh-warn').textContent=f<.25?'INTEGRITY CRITICAL':'';
    const smart=M.mech.smart&&session.time-landedAt<M.mech.smart;
    $h('.mh-core').textContent=smart?'SMART CORE · '+Math.ceil(M.mech.smart-(session.time-landedAt))+'s':M.mech.salvoCore&&!coreUsed?'SALVO CORE READY · BOTH TRIGGERS':'';
  }

  // ---- input -------------------------------------------------------------------------------------------------------
  const BLOCK=new Set(['KeyR','KeyV','KeyG','KeyF','KeyE','Digit1','Digit2','Digit3','Digit4','Digit5','KeyX','KeyQ']);
  addEventListener('mousedown',e=>{
    if(!api.getState().active)return;
    if(riding&&e.button===0){trig.mg=true;e.stopImmediatePropagation();return;}
    if(phase!=='piloting'||(e.button!==0&&e.button!==2))return;
    const side=e.button===0?'left':'right';trig[side]=true;trig[side+'At']=session.time;
    if(arms[side])arms[side].pressed=true;
    e.stopImmediatePropagation();   // the gun doesn't fire and doesn't aim
  },true);
  addEventListener('mouseup',e=>{if(e.button===0){trig.left=false;trig.mg=false;}if(e.button===2)trig.right=false;},true);
  addEventListener('keydown',e=>{
    if(!api.getState().active)return;
    if(riding&&(e.code==='KeyF'||e.code==='Space')&&!e.repeat){dismount();e.stopImmediatePropagation();return;}
    if(riding&&BLOCK.has(e.code)){e.stopImmediatePropagation();return;}
    if(phase==='piloting'&&BLOCK.has(e.code)){e.stopImmediatePropagation();return;}
    if(phase==='idle'&&!riding&&e.code==='KeyF'&&!e.repeat&&tryMount()){e.stopImmediatePropagation();}
  },true);

  // ---- aiming and hitting ------------------------------------------------------------------------------------------
  const health=()=>zombieHealth(session.round,data.rules);
  const aimDir=()=>camera.getWorldDirection(new THREE.Vector3());
  // where a shot from the arm appears to leave, in the world (the forearms are drawn in the viewmodel scene)
  function muzzle(side){
    if(host.hideViewmodel)return world3.muzzle(side);
    const f=aimDir(),r=new THREE.Vector3().crossVectors(f,up).normalize(),u=new THREE.Vector3().crossVectors(r,f);
    return camera.position.clone().addScaledVector(f,40).addScaledVector(r,side==='left'?-20:20).addScaledVector(u,-16);
  }
  // zombies along a ray (body capsule ~ 22 wide, 70 tall), sorted by distance, cut at the first wall
  function along(from,dir,range,width=24){
    const wall=world.raycast(new THREE.Ray(from.clone(),dir.clone()),0,range);const max=wall?wall.distance:range;
    const out=[];
    for(const z of enemies.list){
      if(z.state==='rising')continue;
      const c=z.root.position.clone().addScaledVector(up,38),t=c.clone().sub(from).dot(dir);if(t<0||t>max)continue;
      const p=from.clone().addScaledVector(dir,t),dy=Math.abs(p.y-c.y),dxz=Math.hypot(p.x-c.x,p.z-c.z);
      if(dxz<width&&dy<40)out.push({z,t,head:p.y>c.y+22});
    }
    return {hits:out.sort((a,b)=>a.t-b.t),end:from.clone().addScaledVector(dir,max)};
  }
  const smartOn=()=>M.mech.smart&&session.time-landedAt<M.mech.smart;
  // the universal damage passives, for a hit by the arm `side` (or by the mech: explosions, fire, trampling)
  function bonus(z,side){
    const P=M.mech,a=side?arms[side]:null,other=side?arms[side==='left'?'right':'left']:null;let k=0;
    if(a&&P.hot)k+=P.hot*Math.floor(Math.min(1,a.heat)/.25);                     // Hot Barrels
    if(a&&P.cold&&a.heat<.2)k+=P.cold;                                            // Cold Open
    if(P.focus){const f=z.mechFocus;const n=f&&session.time-f.t<3?f.n:0;k+=P.focus*Math.min(5,n);z.mechFocus={n:n+1,t:session.time};}   // Target Lock
    if(P.still&&speed<15)k+=P.still;                                              // Steady Aim
    if(P.moving&&speed>40)k+=P.moving;                                            // Momentum
    if(P.burnVuln&&burning.has(z))k+=P.burnVuln;                                  // Scorched Earth
    if(P.cross&&other?.over)k+=P.cross;                                           // Crossfire
    if(P.lastStand&&integrity<maxIntegrity*.25)k+=P.lastStand;                    // Last Stand
    return (1+k)*(smartOn()?1.25:1);
  }
  function hurt(z,frac,w,{head=false,flat=0,cause='mech',arm=null}={}){
    if(!enemies.list.includes(z))return false;
    const at=z.root.position.clone();
    const dmg=(health()*frac+flat)*(w?.damageMul??1)*bonus(z,arm)*(head?1.5:1);
    enemies.hurt(z,dmg,head,cause==='melee','mech');
    const killed=!enemies.list.includes(z);onHit(z,killed);
    if(killed)onKill(at);
    else if(M.mech.ignite&&cause!=='fire'){const dps=health()*M.mech.ignite/3;if((burning.get(z)?.dps??0)<dps)burn(z,dps);}   // Napalm Coating
    return killed;
  }
  function onKill(at){
    if(phase!=='piloting')return;
    integrity=Math.min(maxIntegrity,integrity+(M.mech.killTime??0)+(M.mech.berserk??0));
    if(M.mech.killPoints)session.addPoints?.(Math.round(M.mech.killPoints));
    if(at&&M.mech.chain&&Math.random()<M.mech.chain)setTimeout(()=>mblast(at.clone().addScaledVector(up,30),120,.4),120);   // Chain Reaction
  }
  // the mech's explosions: like the class blast, but every zombie goes through hurt() so explosive kills count for the
  // kill passives (Kill Feed, Demolition Pay, Berserker Core) and Smart Core's bonus applies
  function mblast(at,radius,frac,arm=null){
    radius*=M.mech.radius??1;   // Collateral: every mech explosion
    window.kino.fx?.explosion?.([at.x,at.y,at.z],radius/260);audio.play('explosion',.6);sync.boom(at,radius);
    for(const z of [...enemies.list]){const d=z.root.position.distanceTo(at);
      if(d<radius&&z.state!=='rising'&&world.lineClear(at.clone().addScaledVector(up,20),z.root.position.clone().addScaledVector(up,30)))hurt(z,frac*(1-.5*d/radius),null,{arm});}
  }
  const burning=new Map();   // zombie -> {until, dps, tick}
  function burn(z,dps,secs=3){burning.set(z,{until:session.time+secs,dps,tick:burning.get(z)?.tick??.5});}
  const stunned=new Map();   // zombie -> {until, at}
  // effects: tracer lines (coloured), lightning, fire pools, projectiles
  const lines=[];
  function line(a,b,color=0xffe2a0,life=.06,width=1){
    const g=new THREE.BufferGeometry().setFromPoints([a,b]),m=new THREE.LineBasicMaterial({color,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false});
    const l=new THREE.Line(g,m);scene.add(l);lines.push({l,t:life,life});sync.tracer(a,b,color);
    if(width>1){const beam=new THREE.Mesh(new THREE.CylinderGeometry(width,width,a.distanceTo(b),6,1,true),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false}));
      beam.position.copy(a).add(b).multiplyScalar(.5);beam.quaternion.setFromUnitVectors(up,b.clone().sub(a).normalize());scene.add(beam);lines.push({l:beam,t:life*3,life:life*3});}
  }
  function lightning(a,b,color=0x7fd8ff){
    const pts=[a.clone()],n=7,d=b.clone().sub(a);
    for(let i=1;i<n;i++){const p=a.clone().addScaledVector(d,i/n);p.x+=(Math.random()-.5)*14;p.y+=(Math.random()-.5)*14;p.z+=(Math.random()-.5)*14;pts.push(p);}
    pts.push(b.clone());
    const g=new THREE.BufferGeometry().setFromPoints(pts),l=new THREE.Line(g,new THREE.LineBasicMaterial({color,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false}));
    scene.add(l);lines.push({l,t:.08,life:.08});sync.tracer(a,b,color);
  }
  const pools=[];          // thermite fire
  const shells=[];         // rockets and thermite shells in flight
  const poolMat=new THREE.MeshBasicMaterial({color:0xff7a22,transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
  function firePool(at,w){
    const r=w.radius;const mesh=new THREE.Mesh(new THREE.CircleGeometry(r,24),poolMat.clone());mesh.rotation.x=-Math.PI/2;mesh.position.copy(at).addScaledVector(up,1.5);scene.add(mesh);
    const light=new THREE.PointLight(0xff7a22,40,r*2.6,1.4);light.position.copy(at).addScaledVector(up,20);scene.add(light);
    pools.push({at:at.clone(),r,until:session.time+w.pool,dps:w.burn*M.mech.burn,w,mesh,light,tick:0});
  }
  const rocketGeo=new THREE.CylinderGeometry(1.4,2,9,8).rotateX(Math.PI/2),rocketMat=new THREE.MeshStandardMaterial({color:0x3a3d40,emissive:0xff8a2a,emissiveIntensity:.6});
  const shellGeo=new THREE.SphereGeometry(3.5,10,8),shellMat=new THREE.MeshStandardMaterial({color:0x50301a,emissive:0xff6a1a,emissiveIntensity:1.5});
  function launch(kind,from,dir,w,extra={}){
    const mesh=new THREE.Mesh(kind==='rocket'?rocketGeo:shellGeo,kind==='rocket'?rocketMat:shellMat);mesh.position.copy(from);scene.add(mesh);
    shells.push({kind,mesh,vel:dir.clone().multiplyScalar(w.speed),w,life:3,...extra});
  }
  function explode(s,at){
    const w=s.w;
    if(s.kind==='rocket'){
      mblast(at,s.radius??w.radius,w.damage*w.damageMul*(s.scale??1),s.arm);   // w.radius already has Blast Radius
      if(w.cluster&&!s.bomblet)for(let i=0;i<w.cluster;i++){const d=new THREE.Vector3(Math.random()-.5,.9,Math.random()-.5).normalize();shells.push({kind:'rocket',mesh:new THREE.Mesh(shellGeo,shellMat),vel:d.multiplyScalar(420),w,life:.6,bomblet:true,scale:.4,radius:w.radius*.6,gravity:900});shells.at(-1).mesh.position.copy(at).addScaledVector(up,8);scene.add(shells.at(-1).mesh);}
    }else{
      mblast(at,w.radius*.8,w.damage*w.damageMul,s.arm);
      const n=w.split||1;for(let i=0;i<n;i++){const off=n>1?new THREE.Vector3(Math.cos(i/n*6.28)*w.radius*1.1,0,Math.sin(i/n*6.28)*w.radius*1.1):new THREE.Vector3();
        const p=at.clone().add(off),g=world.raycast(new THREE.Ray(p.clone().addScaledVector(up,60),up.clone().negate()),0,240);if(g)p.y=(g.point?.y??p.y);firePool(p,w);}
    }
  }

  // ---- the weapons ------------------------------------------------------------------------------------------------
  function newArm(w){return {w,heat:0,over:false,cd:0,spin:0,charge:0,shotT:-9,tick:0,pressed:false,punch:0,burst:0,burstT:0};}
  function addHeat(a,h){if(smartOn())return;a.heat+=h;a.shotT=session.time;if(a.heat>=1){a.heat=1;a.over=true;a.charge=0;sfx.overheat();if(M.mech.ventBlast)mblast(player.getFeetPosition().addScaledVector(up,30),170,M.mech.ventBlast);setTimeout(sfx.vent,200);}}
  function fireArm(side,dt){
    const a=arms[side],w=a.w,held=trig[side];
    a.cd=Math.max(0,a.cd-dt);a.punch=Math.max(0,a.punch-dt*3);
    // venting / cooling
    const since=session.time-a.shotT;
    // overheated: locked for VENT_DELAY before it starts venting, then vents back to zero; otherwise heat bleeds off after
    // half a second without firing
    if(a.over){if(since>VENT_DELAY)a.heat=Math.max(0,a.heat-dt*.4*M.mech.cool);if(a.heat<=0)a.over=false;}
    else if(since>.5&&!(held&&(w.mode==='auto'||w.mode==='beam')))a.heat=Math.max(0,a.heat-dt*.28*M.mech.cool);
    if(a.over){a.spin=Math.max(0,a.spin-dt*2);a.charge=0;a.pressed=false;return;}
    const f=aimDir(),from=camera.position.clone();
    if(w.mode==='auto'){
      a.spin=held?Math.min(1,a.spin+(w.spin?dt/w.spin:1)):Math.max(0,a.spin-dt*1.5);
      if(held&&a.spin>=1&&a.cd<=0){
        a.cd=1/w.rate;
        const d=f.clone().add(new THREE.Vector3((Math.random()-.5)*2*w.spread,(Math.random()-.5)*2*w.spread,(Math.random()-.5)*2*w.spread)).normalize();
        const {hits,end}=along(from,d,w.range,18);
        const n=1+(w.pierce??0);let last=end;
        hits.slice(0,n).forEach((h,i)=>{hurt(h.z,w.damage,w,{head:h.head,flat:w.flat,arm:side});if(w.burn)burn(h.z,health()*.05*M.mech.burn);last=i===n-1?from.clone().addScaledVector(d,h.t):last;});
        line(muzzle(side),hits.length&&hits.length<=n?from.clone().addScaledVector(d,hits.at(-1).t):last,0xffd890,.05);
        window.kino.fx?.muzzle?.(muzzle(side));
        addHeat(a,w.heat);recoil(side,.25);sfx.chaingun();
      }
    }else if(w.mode==='charge'){
      if(held&&a.cd<=0){if(a.charge===0)sfx.railCharge();a.charge=Math.min(1,a.charge+dt/w.charge);}
      else if(!held&&a.charge>0){
        const c=a.charge;a.charge=0;a.cd=w.refire;
        const frac=w.damage+(w.full-w.damage)*c*c,dirs=w.split>1?[0,-.05,.05]:[0];
        for(const yaw of dirs){
          const d=f.clone().applyAxisAngle(up,yaw);const {hits,end}=along(from,d,w.range,20);
          for(const h of hits)hurt(h.z,frac,w,{head:h.head,arm:side});
          line(muzzle(side),end,0x7fd8ff,.12,2.2*(.4+c));
          if(w.blast&&c>=.99)mblast(end,160,.8*w.damageMul,side);
        }
        addHeat(a,w.heat*(.5+.5*c));recoil(side,.6+c);sfx.rail();
      }
    }else if(w.mode==='semi'){
      if(a.pressed&&a.cd<=0){
        a.pressed=false;a.cd=w.refire;
        if(w.id==='salvo'){a.burst=w.count;a.burstT=0;addHeat(a,w.heat);}
        if(w.id==='thermite'){launch('shell',muzzle(side),f.clone().addScaledVector(up,.12).normalize(),w,{gravity:900,arm:side});addHeat(a,w.heat);recoil(side,.8);sfx.thermite();}
        if(w.id==='fist')punch(side,a,w,f);
      }
      if(a.burst>0&&(a.burstT-=dt)<=0){
        a.burst--;a.burstT=.07;
        const d=f.clone().add(new THREE.Vector3((Math.random()-.5)*.05,(Math.random()-.5)*.04,(Math.random()-.5)*.05)).normalize();
        launch('rocket',muzzle(side),d,w,{homing:w.homing,arm:side});recoil(side,.35);sfx.rocket();
      }
    }else if(w.mode==='beam'){
      if(held&&(a.tick-=dt)<=0){
        a.tick=w.tick;
        const target=enemies.list.filter(z=>z.state!=='rising').map(z=>{const c=z.root.position.clone().addScaledVector(up,38),v=c.clone().sub(from),d=v.length();return {z,c,d,dot:v.normalize().dot(f)};})
          .filter(o=>o.d<w.range&&o.dot>.9&&world.lineClear(from,o.c)).sort((a,b)=>b.dot*2-a.d/w.range-(a.dot*2-b.d/w.range))[0];
        if(target){
          let from2=muzzle(side),prev=target;lightning(from2,target.c);hurt(target.z,w.damage,w,{arm:side});if(w.stun)stunned.set(target.z,{until:session.time+.4,at:target.z.root.position.clone()});
          const done=new Set([target.z]);
          for(let i=0;i<w.chain;i++){const n=enemies.list.filter(z=>!done.has(z)&&z.root.position.distanceTo(prev.z.root.position)<w.chainRange).sort((a,b)=>a.root.position.distanceTo(prev.z.root.position)-b.root.position.distanceTo(prev.z.root.position))[0];if(!n)break;done.add(n);const c=n.root.position.clone().addScaledVector(up,38);lightning(prev.c,c);hurt(n,w.damage*.7,w,{arm:side});if(w.stun)stunned.set(n,{until:session.time+.4,at:n.root.position.clone()});prev={z:n,c};}
          sfx.arc();
        }else lightning(muzzle(side),from.clone().addScaledVector(f,180).add(new THREE.Vector3((Math.random()-.5)*40,(Math.random()-.5)*40,(Math.random()-.5)*40)));
        addHeat(a,w.heat);recoil(side,.05);
      }
    }
  }
  function punch(side,a,w,f){
    a.punch=1;recoil(side,1.2);sfx.punch();addHeat(a,w.heat);
    const feet=player.getFeetPosition(),flat=f.clone().setY(0).normalize(),cos=Math.cos(THREE.MathUtils.degToRad(w.arc/2));
    if(w.dash){const step=flat.clone().multiplyScalar(70),to=feet.clone().add(step);if(world.lineClear(feet.clone().addScaledVector(up,30),to.clone().addScaledVector(up,30)))player.setPosition(to);}
    const center=player.getFeetPosition();
    for(const z of [...enemies.list]){
      if(z.state==='rising')continue;
      const v=z.root.position.clone().sub(center).setY(0),d=v.length();
      const inFront=d<w.range+(w.dash?70:0)&&v.normalize().dot(flat)>cos,around=w.pound&&d<170;
      if(!inFront&&!around)continue;
      if(w.execute&&z.health<(z.maxHealth??health())*w.execute){hurt(z,99,w,{cause:'melee',arm:side});continue;}
      const killed=hurt(z,inFront?w.damage:w.damage*.6,w,{cause:'melee',arm:side});
      if(!killed&&enemies.list.includes(z)){const push=(d>1?v:flat).clone().multiplyScalar(w.knock*(inFront?1:.6)),to=z.root.position.clone().add(push);if(world.lineClear(z.root.position.clone().addScaledVector(up,30),to.clone().addScaledVector(up,30)))z.root.position.copy(to);z.stuck=0;}
    }
    if(w.pound){window.kino.fx?.knockback?.(center);sync.boom(center,170);}
    camKick=.6;
  }
  function recoil(side,k){fp.recoil(side,k);world3.recoil(side,k);}
  // Salvo Core: both triggers within 0.15 s, both arms cool
  function core(){
    if(!M.mech.salvoCore||coreUsed||phase!=='piloting')return;
    if(Math.abs(trig.leftAt-trig.rightAt)>.15||!trig.left||!trig.right)return;
    if(arms.left.heat>.2||arms.right.heat>.2)return;
    coreUsed=true;api.toast?.('SALVO CORE',1.5);
    const w=mechWeapon(cls,M.stats,'salvo');   // the Ordnance passives apply (damage, radius); not the arm's augments
    for(let i=0;i<M.mech.salvoCore;i++)setTimeout(()=>{if(phase!=='piloting')return;const f=aimDir(),r=new THREE.Vector3().crossVectors(f,up).normalize();
      const d=f.clone().addScaledVector(r,(Math.random()-.5)*.35).addScaledVector(up,(Math.random()-.2)*.15).normalize();launch('rocket',muzzle(i%2?'left':'right'),d,w,{homing:true});sfx.rocket();},i*60);
  }

  // ---- call-in, piloting, eject -------------------------------------------------------------------------------------
  function deploy(){
    if(!pilot)return;
    const st=api.getState();
    if(riding){api.toast?.('Climb off the mech first (F)',1.5);return;}
    if(phase==='piloting'){eject(false);return;}
    if(phase==='falling'||!st.active||session.phase==='reviving'||session.busy)return;
    const cd=ctx.getCooldown();if(cd>0){api.toast?.(`Mech ready in ${Math.ceil(cd)}s`,1.2);return;}
    M=mechStats(cls,ctx.state());
    const feet=player.getFeetPosition(),fwd=aimDir().setY(0).normalize();
    let at=feet.clone().addScaledVector(fwd,150);
    if(!world.lineClear(feet.clone().addScaledVector(up,40),at.clone().addScaledVector(up,40)))at=feet.clone().addScaledVector(fwd,40);
    const g=world.raycast(new THREE.Ray(at.clone().addScaledVector(up,200),up.clone().negate()),0,600);if(g)at.y=g.point?.y??at.y;
    phase='falling';drop={at,t:0,yaw:Math.atan2(fwd.x,fwd.z)};
    world3.setWeapons(M.left.id,M.right.id);world3.setMount(M.mech.mount);world3.root.visible=true;world3.root.position.copy(at).addScaledVector(up,1800);world3.root.rotation.y=drop.yaw;
    sfx.whistle();api.announce?.('MECH INBOUND','STAND BY',1.2);ctx.hud();
  }
  function land(){
    const at=drop.at;world3.root.position.copy(at);
    sfx.land();mblast(at,230*(1+(M.mech.landing??0)),1.3*(1+(M.mech.landing??0)));window.kino.fx?.knockback?.(at);camKick=1.4;
    // climb in
    phase='piloting';landedAt=session.time;coreUsed=false;lastHitT=session.time;
    maxIntegrity=integrity=M.mech.duration;shield=M.mech.shield??0;
    arms.left=newArm(M.left);arms.right=newArm(M.right);fp.setWeapons(M.left.id,M.right.id);
    saved={move:player.moveSpeed,sprint:player.sprintSpeed,jump:player.jumpHeight,crouch:player.crouchSpeed};
    player.moveSpeed=saved.move*.82*M.mech.speed;player.sprintSpeed=saved.move*1.12*M.mech.speed;player.jumpHeight=0;player.crouchSpeed=player.moveSpeed;
    const g=at.clone();player.setPosition(g);
    document.body.classList.add('mech-pilot');boot();drawHud();ctx.hud();
    const entry=window.kino.characterEntry;if(entry&&entry!==myPilotEntry){myPilotEntry=entry;myPilot?.dispose();myPilot=null;seatPilot(world3,entry).then(p=>{myPilot=p;});}
  }
  function eject(destroyed){
    if(phase!=='piloting')return;
    phase='idle';document.body.classList.remove('mech-pilot');fp.root.visible=false;
    const tp=window.kino.thirdPersonCamera;if(tp){tp.distance=105;tp.shoulder=38;}
    if(saved){player.moveSpeed=saved.move;player.sprintSpeed=saved.sprint;player.jumpHeight=saved.jump;player.crouchSpeed=saved.crouch;saved=null;}
    trig.left=trig.right=false;
    const at=player.getFeetPosition(),wreck=world3.root;wreck.position.copy(at);wreck.visible=true;
    // thrown clear: a step back, a moment of safety
    const back=aimDir().setY(0).normalize().multiplyScalar(-60),to=at.clone().add(back);
    if(world.lineClear(at.clone().addScaledVector(up,40),to.clone().addScaledVector(up,40)))player.setPosition(to);
    session.effects.invulnerable=Math.max(session.effects.invulnerable??0,session.time+2);
    api.announce?.(destroyed?'MECH DOWN':'EJECTED',destroyed?'THROWN CLEAR':'',1.6);
    setTimeout(()=>{
      if(phase!=='idle'&&phase!=='falling')return;
      if(phase==='idle'){if(M.mech.eject)mblast(wreck.position.clone().addScaledVector(up,40),260,M.mech.eject);else{window.kino.fx?.explosion?.([wreck.position.x,wreck.position.y+40,wreck.position.z],.6);audio.play('explosion',.5);sync.boom(wreck.position,1);}
        wreck.visible=false;}
    },destroyed?900:1400);
    ctx.setCooldown(M.mech.cooldown);ctx.hud();
    if(rider){net()?.send(rider,{t:'mech',op:'off'});}
    sendState(true);
  }
  host.on('beforeDamage',e=>{
    if(riding){session.effects.invulnerable=Math.max(session.effects.invulnerable??0,session.time+.2);e.amount=0;return;}
    if(phase!=='piloting')return;
    let cost=M.mech.hitCost*THREE.MathUtils.clamp(e.amount/45,.5,3);e.amount=0;lastHitT=session.time;
    if(M.mech.lastStand&&integrity<maxIntegrity*.25)cost*=.5;                                          // Last Stand
    if(M.mech.deflect&&Math.random()<M.mech.deflect){cost=0;api.toast?.('DEFLECTED',.6);}                // Deflector Plating
    if(shield>0){const s=Math.min(shield,cost);shield-=s;cost-=s;}                                     // Overshield
    if(M.mech.reactive&&session.time-reactiveT>.3){reactiveT=session.time;mblast(player.getFeetPosition().addScaledVector(up,30),110,M.mech.reactive);}   // Reactive Armour
    integrity-=cost;
    ghostT=session.time+.4;hudEl.classList.remove('hit');void hudEl.offsetWidth;hudEl.classList.add('hit');sfx.hit();
    if(integrity/maxIntegrity<.25&&(integrity+cost)/maxIntegrity>=.25)sfx.warn();
  });

  // ---- per frame ---------------------------------------------------------------------------------------------------
  let camKick=0,stepT=0,lastFeet=null,speed=0;
  host.on('update',dt=>{
    if(!dt)return;
    for(let i=lines.length-1;i>=0;i--){const o=lines[i];o.t-=dt;o.l.material.opacity=Math.max(0,o.t/o.life)*.95;if(o.t<=0){o.l.removeFromParent();o.l.geometry.dispose();o.l.material.dispose();lines.splice(i,1);}}
    for(const [z,b] of burning){if(!enemies.list.includes(z)||session.time>b.until){burning.delete(z);continue;}if((b.tick-=dt)<=0){b.tick=.5;hurt(z,0,null,{flat:b.dps*.5,cause:'fire'});window.kino.fx?.burn?.(z.root.position.clone().addScaledVector(up,40));}}
    for(const [z,s] of stunned){if(!enemies.list.includes(z)||session.time>s.until){stunned.delete(z);continue;}z.root.position.x=s.at.x;z.root.position.z=s.at.z;z.stuck=0;}
    for(let i=pools.length-1;i>=0;i--){const p=pools[i];const left=p.until-session.time;p.mesh.material.opacity=.55*Math.min(1,left)*(.85+.15*Math.sin(session.time*20));p.light.intensity=40*Math.min(1,left);
      if((p.tick-=dt)<=0){p.tick=.5;for(const z of [...enemies.list])if(z.root.position.distanceTo(p.at)<p.r)hurt(z,p.dps*.5,p.w);window.kino.fx?.burn?.(p.at.clone().add(new THREE.Vector3((Math.random()-.5)*p.r,8,(Math.random()-.5)*p.r)));}
      if(left<=0){p.mesh.removeFromParent();p.mesh.geometry.dispose();p.mesh.material.dispose();p.light.removeFromParent();pools.splice(i,1);}}
    for(let i=shells.length-1;i>=0;i--){
      const s=shells[i];s.life-=dt;
      if(s.homing){const f=s.vel.clone().normalize(),z=enemies.list.filter(z=>z.state!=='rising').map(z=>({z,v:z.root.position.clone().addScaledVector(up,38).sub(s.mesh.position)})).filter(o=>o.v.length()<900&&o.v.clone().normalize().dot(f)>.7).sort((a,b)=>a.v.length()-b.v.length())[0];
        if(z){s.vel.lerp(z.v.normalize().multiplyScalar(s.vel.length()),Math.min(1,dt*5));}}
      if(s.gravity)s.vel.y-=s.gravity*dt;
      const step=s.vel.clone().multiplyScalar(dt),len=step.length(),hit=world.raycast(new THREE.Ray(s.mesh.position.clone(),step.clone().normalize()),0,len+2);
      const zhit=enemies.list.find(z=>z.state!=='rising'&&z.root.position.clone().addScaledVector(up,38).distanceTo(s.mesh.position)<30);
      if(hit||zhit||s.life<=0){const at=hit?s.mesh.position.clone().addScaledVector(step.normalize(),Math.max(0,hit.distance-2)):s.mesh.position.clone();explode(s,at);s.mesh.removeFromParent();shells.splice(i,1);continue;}
      s.mesh.position.add(step);s.mesh.lookAt(s.mesh.position.clone().add(s.vel));
      if(s.kind==='rocket'&&Math.random()<.5)window.kino.fx?.burn?.(s.mesh.position.clone());
    }
    if(phase==='falling'){
      drop.t+=dt;const k=Math.min(1,drop.t/DROP_TIME);world3.root.position.copy(drop.at).addScaledVector(up,1800*(1-k*k));
      if(Math.random()<.6)window.kino.fx?.burn?.(world3.root.position.clone().addScaledVector(up,30));
      if(k>=1)land();
    }
    const feet=player.getFeetPosition();speed=lastFeet?feet.clone().sub(lastFeet).setY(0).length()/dt:0;lastFeet=feet.clone();
    if(phase==='piloting'){
      session.effects.invulnerable=Math.max(session.effects.invulnerable??0,session.time+.25);
      integrity-=dt;
      if(M.mech.regen&&session.time-lastHitT>3)integrity=Math.min(maxIntegrity,integrity+M.mech.regen*dt);
      if(integrity<=0){eject(true);return;}
      // the cockpit: higher eye, no gun, the mech's arms; the mech itself in third person
      const third=!!host.hideViewmodel;
      const want=world3.eye?world3.eye-player.eyeHeight:LIFT;   // the pilot's eyes in the cockpit
      const head=world.raycast(new THREE.Ray(camera.position.clone(),up),0,want+12),lift=head?Math.max(0,head.distance-12):want;
      camera.position.y+=lift;
      // third person: pull the camera well back (the mech is ~2.4 players tall) and redo it from the lifted eye (the
      // characters mod placed it before this lift)
      const tp=window.kino.thirdPersonCamera;if(tp){tp.distance=270;tp.shoulder=60;if(third)tp.update(world);}
      if(view?.pivot)view.pivot.visible=false;
      fp.root.visible=!third;
      const ch=window.kino.character?.root;if(ch)ch.visible=false;
      world3.root.visible=third;world3.root.position.copy(feet);world3.root.rotation.y=camera.rotation.y+Math.PI;
      const pitch=camera.rotation.x;
      if(trig.left&&trig.right)core();
      if(M.mech.stomp&&speed>40&&(stompT-=dt)<=0){stompT=.5;const f=player.getFeetPosition();for(const z of [...enemies.list])if(z.state!=='rising'&&z.root.position.distanceTo(f)<75)hurt(z,M.mech.stomp*.5,null);}   // Crushing Stride
      for(const side of ['left','right'])fireArm(side,dt);
      const pose={speed,pitch,spin:{left:arms.left.spin,right:arms.right.spin},charge:{left:arms.left.charge,right:arms.right.charge},heat:{left:arms.left.heat,right:arms.right.heat},punch:{left:arms.left.punch,right:arms.right.punch}};
      fp.update(dt,pose);world3.update(dt,pose);
      if(myPilot){myPilot.c.root.visible=third;if(third)myPilot.pose?.update(dt,{pitch,kick:{left:world3.arms.left.kick??0,right:world3.arms.right.kick??0},jolt:camKick*.6});}
      if(speed>40&&(stepT-=dt*speed/130)<=0){stepT=1;sfx.step();camKick=Math.max(camKick,.15);}
      if(camKick>0){camKick=Math.max(0,camKick-dt*3);camera.position.y+=Math.sin(session.time*55)*camKick*1.2;}
      drawHud();
    }else{
      fp.root.visible=false;
      if(phase==='falling')world3.update(dt,{speed:0});
      if(camKick>0){camKick=Math.max(0,camKick-dt*3);camera.position.y+=Math.sin(session.time*55)*camKick*1.2;}
    }
    netUpdate(dt);
  });
  host.on('reset',()=>{
    if(phase==='piloting')eject(false);phase='idle';drop=null;world3.root.visible=false;fp.root.visible=false;document.body.classList.remove('mech-pilot','mech-rider');
    for(const s of shells)s.mesh.removeFromParent();shells.length=0;for(const p of pools){p.mesh.removeFromParent();p.light.removeFromParent();}pools.length=0;
    burning.clear();stunned.clear();riding=null;mgView.visible=false;
  });

  // ---- co-op: mirrors of other pilots, the rear gun ---------------------------------------------------------------
  const pilots=new Map();   // id -> {on, mount, rider, l, r, mech}
  let riding=null,mgCd=0,stTimer=0,lastSent='';
  function sendState(force){
    const n=net();if(!n||!pilot)return;
    const m={t:'mech',op:'st',on:phase==='piloting',mount:!!M.mech.mount,md:+(M.mech.mountDamage-1).toFixed(2),rider,l:M.left?.id,r:M.right?.id,p:+camera.rotation.x.toFixed(2)};
    const key=JSON.stringify(m);if(!force&&key===lastSent&&stTimer>0)return;lastSent=key;n.send('all',m);
  }
  function remote(id){return window.kino.coop?.remotes?.get(id);}
  function setAvatarHidden(r,hidden){r?.root?.traverse(o=>{if(o.isMesh&&!o.isSprite){o.userData.mechHidden??=o.visible;o.visible=hidden?false:o.userData.mechHidden;}});}
  function tryMount(){
    const n=net();if(!n)return false;const feet=player.getFeetPosition();
    for(const [id,p] of pilots){const r=remote(id);if(!p.on||!p.mount||p.rider||!r?.pos)continue;if(r.pos.distanceTo(feet)<150){riding=id;n.send(id,{t:'mech',op:'mount'});document.body.classList.add('mech-rider');mgView.visible=true;api.toast?.('On the rear gun · F to climb off',2.5);return true;}}
    return false;
  }
  function dismount(){
    const r=remote(riding);riding=null;document.body.classList.remove('mech-rider');mgView.visible=false;trig.mg=false;
    if(r?.pos){const back=new THREE.Vector3(Math.sin(r.yaw??0),0,Math.cos(r.yaw??0)).multiplyScalar(-90);player.setPosition(r.pos.clone().add(back));}
    net()?.send('all',{t:'mech',op:'dismount'});
  }
  let mountPrompt=0;
  function netUpdate(dt){
    const n=net();
    if(n&&!n.mechHooked){n.mechHooked=true;
      n.on('mech',(m,from)=>{
        if(m.op==='st'){let p=pilots.get(from);if(!p){p={mech:null};pilots.set(from,p);}Object.assign(p,{on:m.on,mount:m.mount,rider:m.rider,l:m.l,r:m.r,pitch:m.p,mountDamage:m.md??0});
          if(riding===from&&(!m.on||(m.rider&&m.rider!==n.id))){dismount();}}
        if(m.op==='mount'&&phase==='piloting'&&M.mech.mount&&!rider){rider=from;sendState(true);api.toast?.('A gunner climbed on',2);}
        if(m.op==='dismount'&&rider===from){rider=null;sendState(true);}
        if(m.op==='off'&&riding===from)dismount();
        if(m.op==='rkill'&&phase==='piloting'&&rider===from)integrity=Math.min(maxIntegrity,integrity+(M.mech.riderTime??0));
      });
    }
    if(n&&(stTimer-=dt)<=0){stTimer=.1;sendState(false);}
    // mirrors
    for(const [id,p] of pilots){
      const r=remote(id);
      if(!p.on||!r?.pos){if(p.mech){p.mech.root.removeFromParent();p.mech=null;p.pilot?.dispose();p.pilot=null;setAvatarHidden(r,false);}continue;}
      if(!p.mech){p.mech=createMech({mount:p.mount});scene.add(p.mech.root);const m=p.mech;seatPilot(m,r.entry).then(x=>{if(p.mech===m)p.pilot=x;else x?.dispose();});}
      p.mech.setWeapons(p.l,p.r);p.mech.setMount(p.mount);p.mech.root.position.copy(r.pos);p.mech.root.rotation.y=r.yaw??0;
      p.mech.update(dt,{speed:r.vel?.length?.()??0,pitch:p.pitch??0});setAvatarHidden(r,true);p.pilot?.pose?.update(dt,{pitch:p.pitch??0});
    }
    // riding a teammate's mech
    if(riding){
      const r=remote(riding),p=pilots.get(riding);
      if(!r?.pos||!p?.on){dismount();return;}
      const yaw=r.yaw??0,seat=(p.mech?.gunnerSeat??SEAT).clone().applyAxisAngle(up,yaw);player.setPosition(r.pos.clone().add(seat));
      session.effects.invulnerable=Math.max(session.effects.invulnerable??0,session.time+.25);
      if(view?.pivot)view.pivot.visible=false;const ch=window.kino.character?.root;if(ch)ch.visible=!!host.hideViewmodel;
      mgView.visible=!host.hideViewmodel;
      mgCd=Math.max(0,mgCd-dt);
      if(trig.mg&&mgCd<=0){
        mgCd=1/11;const f=aimDir().add(new THREE.Vector3((Math.random()-.5)*.03,(Math.random()-.5)*.03,(Math.random()-.5)*.03)).normalize(),from=camera.position.clone();
        const {hits,end}=along(from,f,3000,18),h=hits[0];
        if(h){const alive=enemies.list.includes(h.z);enemies.hurt(h.z,(health()*.075+25)*(1+(p.mountDamage??0)),h.head,false,'mech');if(alive&&!enemies.list.includes(h.z))net()?.send(riding,{t:'mech',op:'rkill'});}
        line(from.clone().addScaledVector(f,30).addScaledVector(up,-8),h?from.clone().addScaledVector(f,h.t):end,0xffe2a0,.05);
        sfx.mg();mgView.position.z=-26+1.2;
      }else mgView.position.z+=(-26-mgView.position.z)*Math.min(1,dt*12);
    }else if(n&&phase==='idle'&&(mountPrompt-=dt)<=0){
      const feet=player.getFeetPosition();
      for(const [id,p] of pilots){const r=remote(id);if(p.on&&p.mount&&!p.rider&&r?.pos&&r.pos.distanceTo(feet)<150){api.toast?.('F · climb on the rear gun',1.2);mountPrompt=1.5;break;}}
    }
  }

  window.kino.mech={mount:()=>tryMount(),dismount:()=>riding&&dismount(),get phase(){return phase;},get integrity(){return integrity;},get arms(){return arms;},deploy,eject:()=>eject(false),stats:()=>M,trig,get riding(){return riding;},get rider(){return rider;},pilots};
  return {
    deploy,
    up:()=>phase!=='idle',
    left:()=>phase==='piloting'?Math.ceil(integrity):'',
    health:()=>phase==='piloting'?integrity/maxIntegrity:null,
    near:()=>false,
  };
}
